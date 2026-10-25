import type { ClassroomLanguage } from "@/lib/classroom/languages";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { WebSocket } from "ws";
import { accessFromToken } from "@/lib/cloud/accessToken";
import { base64ToBytes, bytesToBase64 } from "@/lib/cloud/base64";
import {
  applyEncoded,
  createFile,
  deleteFile,
  encodeDoc,
  readFiles,
  seedDoc,
} from "@/lib/cloud/collabDoc";
import { canEdit, isUuid, type ProjectRole } from "@/lib/cloud/roles";
import { assignmentFreezeState } from "@/lib/classroom/assignmentPolicy";
import { verifyClassroomCollabToken } from "@/lib/classroom/collabToken";
import type { ResolvedClassroomDocument } from "@/lib/classroom/documents";
import { ALLOWED_STANDARDS, type AllowedStandard, execConfig } from "@/lib/execConfig";
import { inspectSourceFiles, isValidSourceFilename } from "@/lib/sourceFiles";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CODE } from "@/lib/examples";
import { inspectDosboxAssets, readDosboxAssets, sameDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";

const HUB_KEY = "__outputtracerCollabHub";
const SAVE_DELAY_MS = 800;
const IDLE_EVICT_MS = 10 * 60 * 1000;
const MAX_UPDATE_BYTES = 512 * 1024;
const MAX_ROOM_CLIENTS = 24;

function updateKeepsFilesValid(doc: Y.Doc, bytes: Uint8Array, language: ClassroomLanguage = "cpp"): boolean {
  const probe = new Y.Doc();
  try {
    Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(probe, bytes);
    // Only code and validated input assets belong in a persisted project document.
    // readFiles intentionally skips non-text values, so validate the raw map first.
    if ([...probe.share.keys()].some((name) => name !== "files" && name !== "dosAssets")) return false;
    if (!sameDosboxAssets(doc, probe)) return false;
    const sourceMap = probe.getMap("files");
    if ([...sourceMap.values()].some((value) => !(value instanceof Y.Text))) return false;
    if ([...sourceMap.values()].some((value) => (value as Y.Text).toDelta().some((op: { insert?: unknown }) => typeof op.insert !== "string"))) return false;
    const files = readFiles(probe);
    if (Object.keys(files).length === 0) return false;
    for (const name of Object.keys(files)) {
      if (!isValidSourceFilename(name, language)) return false;
    }
    return inspectSourceFiles(files, {
      maxFiles: execConfig.maxSourceFiles,
      maxSourceBytes: execConfig.maxSourceBytes,
    }, language).ok;
  } catch {
    return false;
  } finally {
    probe.destroy();
  }
}

interface ClientState {
  userId: string;
  role: ProjectRole;
  clientId: number;
}

interface Room {
  projectId: string;
  kind: "project" | "classroom";
  language?: ClassroomLanguage;
  classroom?: {
    classId: string;
    assignmentId: string;
    groupId?: string;
    studentId?: string;
  };
  doc: Y.Doc;
  awareness: Awareness;
  standard: string;
  clients: Map<WebSocket, ClientState>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
  saving: Promise<void> | null;
}

type ClientMessage =
  | { type: "join"; projectId?: string; token?: string; clientId?: number; kind?: string }
  | { type: "client"; clientId?: number }
  | { type: "update"; update?: string }
  | { type: "awareness"; update?: string }
  | { type: "file-create"; name?: string; content?: string }
  | { type: "file-delete"; name?: string }
  | { type: "asset-upload"; name?: string; base64?: string }
  | { type: "asset-delete"; name?: string }
  | { type: "standard"; value?: string };

function send(ws: WebSocket, message: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function asStandard(value: string | undefined): AllowedStandard | null {
  if (!value) return null;
  return (ALLOWED_STANDARDS as readonly string[]).includes(value)
    ? (value as AllowedStandard)
    : null;
}

class CollabHub {
  private rooms = new Map<string, Room>();
  private opening = new Map<string, Promise<Room>>();

  async ingestSnapshot(projectId: string, stateB64: string, standard?: string): Promise<void> {
    if (!stateB64 || stateB64.length > 2_000_000) return;
    const room = await this.room(projectId);
    applyEncoded(room.doc, stateB64);
    const nextStandard = asStandard(standard);
    if (nextStandard) room.standard = nextStandard;
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    await this.persist(room);
  }

  async readFiles(projectId: string): Promise<{ files: Record<string, string>; standard: string }> {
    const room = await this.room(projectId);
    return { files: readFiles(room.doc), standard: room.standard };
  }

  /** Live classroom files when that room is already open. Does not create a room. */
  peekClassroomFiles(docKey: string): Record<string, string> | null {
    const room = this.rooms.get(docKey);
    if (!room || room.kind !== "classroom") return null;
    const files = readFiles(room.doc);
    return Object.keys(files).length > 0 ? files : null;
  }

  peekClassroomAssets(docKey: string): DosboxAssets | null {
    const room = this.rooms.get(docKey);
    return room?.kind === "classroom" ? readDosboxAssets(room.doc) : null;
  }

  classroomPresence(docKey: string): { userId: string; name: string; file: string | null }[] {
    const room = this.rooms.get(docKey);
    if (!room) return [];
    const states = room.awareness.getStates();
    const online: { userId: string; name: string; file: string | null }[] = [];
    for (const client of room.clients.values()) {
      const state = states.get(client.clientId) as { user?: { name?: string }; file?: unknown } | undefined;
      online.push({
        userId: client.userId,
        name: state?.user?.name || "Student",
        file: typeof state?.file === "string" ? state.file : null,
      });
    }
    return online;
  }

  /** Drops open rooms. Persisted documents are left in place. */
  closeAllForTests(): void {
    for (const room of this.rooms.values()) {
      if (room.saveTimer) clearTimeout(room.saveTimer);
      if (room.evictTimer) clearTimeout(room.evictTimer);
      room.doc.destroy();
    }
    this.rooms.clear();
    this.opening.clear();
  }

  async setStandard(projectId: string, value: string): Promise<void> {
    const standard = asStandard(value);
    if (!standard) return;
    const room = await this.room(projectId);
    room.standard = standard;
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("projects")
        .update({ standard, updated_at: new Date().toISOString() })
        .eq("id", projectId);
    }
    this.broadcast(room, { type: "standard", value: standard });
  }

  attach(ws: WebSocket) {
    let joined = false;
    let room: Room | null = null;
    let state: ClientState | null = null;

    const timeout = setTimeout(() => {
      if (!joined) {
        send(ws, { type: "error", message: "No join message received." });
        ws.close();
      }
    }, 10_000);

    let checkingAccess=false;
    const accessTimer=setInterval(()=>{if(checkingAccess||!room?.classroom||!state)return;checkingAccess=true;const cls=room.classroom;const actor=state.userId;
      void import("@/lib/classroom/classroomService").then(async({getClassroom})=>{const access=await getClassroom(actor,cls.classId);if(!access.success){ws.close(1008,"Classroom access changed");return;}
       const {resolveClassroomDocument}=await import("@/lib/classroom/documents");const resolved=await resolveClassroomDocument({actorId:actor,classroomId:cls.classId,assignmentId:cls.assignmentId,isTeacher:Boolean(access.isTeacher),groupId:cls.groupId,studentId:cls.studentId});if(!resolved.ok)ws.close(1008,"Document access changed");
      }).catch(()=>ws.close(1011,"Could not verify access")).finally(()=>{checkingAccess=false;});
    },30000);
    accessTimer.unref?.();
    const leave = () => {
      clearInterval(accessTimer);
      clearTimeout(timeout);
      if (!room || !state) return;
      room.clients.delete(ws);
      removeAwarenessStates(room.awareness, [state.clientId], ws);
      if (room.clients.size === 0) {
        void this.persist(room);
        room.evictTimer = setTimeout(() => {
          if (room && room.clients.size === 0) {
            this.rooms.delete(room.projectId);
            room.doc.destroy();
          }
        }, IDLE_EVICT_MS);
      }
      room = null;
      state = null;
    };

    ws.on("close", leave);
    ws.on("error", leave);

    ws.on("message", (data) => {
      void this.onMessage(ws, data.toString(), {
        joined: () => joined,
        markJoined: () => {
          joined = true;
          clearTimeout(timeout);
        },
        bind: (nextRoom, nextState) => {
          room = nextRoom;
          state = nextState;
        },
        current: () => (room && state ? { room, state } : null),
      });
    });
  }

  private async onMessage(
    ws: WebSocket,
    raw: string,
    ctx: {
      joined: () => boolean;
      markJoined: () => void;
      bind: (room: Room, state: ClientState) => void;
      current: () => { room: Room; state: ClientState } | null;
    }
  ) {
    if (raw.length > MAX_UPDATE_BYTES * 2) {
      send(ws, { type: "error", message: "Message too large." });
      ws.close();
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "Malformed message." });
      ws.close();
      return;
    }

    if (!ctx.joined()) {
      if (message.type !== "join") {
        send(ws, { type: "error", message: "Join the project first." });
        ws.close();
        return;
      }
      await this.join(ws, message, ctx);
      return;
    }

    const current = ctx.current();
    if (!current) return;
    const { room, state } = current;

    if (message.type === "client") {
      const nextId = Number(message.clientId);
      if (Number.isFinite(nextId)) state.clientId = nextId;
      return;
    }

    if (message.type === "update") {
      if (!canEdit(state.role) || typeof message.update !== "string") return;
      if (await this.classroomEditBlocked(ws, room)) return;
      const bytes = base64ToBytes(message.update);
      if (bytes.byteLength > MAX_UPDATE_BYTES) return;
      if (!updateKeepsFilesValid(room.doc, bytes, room.language)) {
        send(ws, { type: "error", message: "That edit is not allowed." });
        return;
      }
      Y.applyUpdate(room.doc, bytes, ws);
      return;
    }

    if (message.type === "awareness" && typeof message.update === "string") {
      const bytes = base64ToBytes(message.update);
      if (bytes.byteLength > 64 * 1024) return;
      applyAwarenessUpdate(room.awareness, bytes, ws);
      return;
    }

    if (message.type === "file-create") {
      if (!canEdit(state.role) || typeof message.name !== "string") return;
      if (await this.classroomFileEditBlocked(ws, room, state)) return;
      // Classroom source imports must not bypass the editor's typing policy.
      if (room.kind === "classroom" && message.content) {
        send(ws, { type: "error", message: "Create an empty source file and edit it in the shared editor." });
        return;
      }
      const created = createFile(room.doc, message.name, message.content || "", room.language);
      if (!created.ok) send(ws, { type: "error", message: created.message });
      return;
    }

    if (message.type === "file-delete") {
      if (!canEdit(state.role) || typeof message.name !== "string") return;
      if (await this.classroomFileEditBlocked(ws, room, state)) return;
      const removed = deleteFile(room.doc, message.name, room.language);
      if (!removed.ok) send(ws, { type: "error", message: removed.message });
      return;
    }

    if (message.type === "asset-upload" || message.type === "asset-delete") {
      if (room.kind !== "classroom" || room.language !== "asm8086" || !canEdit(state.role) || typeof message.name !== "string") return;
      if (await this.classroomFileEditBlocked(ws, room, state)) return;
      const assets = readDosboxAssets(room.doc);
      if (message.type === "asset-upload") {
        if (typeof message.base64 !== "string") return;
        const checked = inspectDosboxAssets({ ...assets, [message.name]: { base64: message.base64 } });
        if (!checked.ok) { send(ws, { type: "error", message: checked.message }); return; }
        room.doc.getMap("dosAssets").set(message.name, { base64: message.base64 });
      } else {
        room.doc.getMap("dosAssets").delete(message.name);
      }
      return;
    }

    if (message.type === "standard" && typeof message.value === "string") {
      if (!canEdit(state.role) || room.kind === "classroom") return;
      await this.setStandard(room.projectId, message.value);
    }
  }

  private async join(
    ws: WebSocket,
    message: ClientMessage,
    ctx: {
      markJoined: () => void;
      bind: (room: Room, state: ClientState) => void;
    }
  ) {
    if (message.type !== "join") return;
    if (message.kind === "classroom") {
      await this.joinClassroom(ws, message, ctx);
      return;
    }
    const projectId = message.projectId || "";
    const token = message.token || "";
    const clientId = Number(message.clientId);
    if (!isUuid(projectId) || !Number.isFinite(clientId)) {
      send(ws, { type: "error", message: "Invalid join." });
      ws.close();
      return;
    }

    const access = await accessFromToken(token, projectId);
    if (!access) {
      send(ws, { type: "error", message: "You do not have access to this project." });
      ws.close();
      return;
    }

    let room: Room;
    try {
      room = await this.room(projectId);
    } catch (error) {
      const err = error as Error;
      send(ws, { type: "error", message: err.message || "Could not open the project." });
      ws.close();
      return;
    }

    if (room.evictTimer) {
      clearTimeout(room.evictTimer);
      room.evictTimer = null;
    }

    if (room.clients.size >= MAX_ROOM_CLIENTS) {
      send(ws, { type: "error", message: "This project already has too many editors connected." });
      ws.close();
      return;
    }

    const state: ClientState = { userId: access.userId, role: access.role, clientId };
    room.clients.set(ws, state);
    ctx.bind(room, state);
    ctx.markJoined();

    send(ws, {
      type: "init",
      role: access.role,
      standard: room.standard,
      state: encodeDoc(room.doc),
    });

    const ids = [...room.awareness.getStates().keys()];
    if (ids.length > 0) {
      send(ws, {
        type: "awareness",
        update: bytesToBase64(encodeAwarenessUpdate(room.awareness, ids)),
      });
    }
  }

  private async joinClassroom(
    ws: WebSocket,
    message: ClientMessage,
    ctx: {
      markJoined: () => void;
      bind: (room: Room, state: ClientState) => void;
    }
  ) {
    if (message.type !== "join") return;
    const claims = verifyClassroomCollabToken(message.token || "");
    const clientId = Number(message.clientId);
    if (!claims || !Number.isFinite(clientId)) {
      send(ws, { type: "error", message: "Invalid join." });
      ws.close();
      return;
    }

    const { getClassroom } = await import("@/lib/classroom/classroomService");
    const { resolveClassroomDocument } = await import("@/lib/classroom/documents");
    const access = await getClassroom(claims.userId, claims.classId);
    if (!access.success) {
      send(ws, { type: "error", message: "You do not have access to this class." });
      ws.close();
      return;
    }

    const resolved = await resolveClassroomDocument({
      actorId: claims.userId,
      classroomId: claims.classId,
      assignmentId: claims.assignmentId,
      isTeacher: Boolean(access.isTeacher),
      groupId: claims.groupId,
      studentId: claims.studentId,
    });
    if (!resolved.ok) {
      send(ws, { type: "error", message: resolved.error });
      ws.close();
      return;
    }

    let room: Room;
    try {
      room = await this.classroomRoom(resolved.doc);
    } catch (error) {
      const err = error as Error;
      send(ws, { type: "error", message: err.message || "Could not open the document." });
      ws.close();
      return;
    }

    if (room.evictTimer) {
      clearTimeout(room.evictTimer);
      room.evictTimer = null;
    }
    if (room.clients.size >= MAX_ROOM_CLIENTS) {
      send(ws, { type: "error", message: "This document already has too many people connected." });
      ws.close();
      return;
    }

    const role: ProjectRole = resolved.doc.role === "editor" ? "editor" : "viewer";
    const state: ClientState = { userId: claims.userId, role, clientId };
    room.clients.set(ws, state);
    ctx.bind(room, state);
    ctx.markJoined();

    send(ws, {
      type: "init",
      role,
      standard: room.standard,
      state: encodeDoc(room.doc),
      locked: resolved.doc.frozen,
      lockMessage: resolved.doc.freezeReason ?? null,
    });

    const ids = [...room.awareness.getStates().keys()];
    if (ids.length > 0) {
      send(ws, {
        type: "awareness",
        update: bytesToBase64(encodeAwarenessUpdate(room.awareness, ids)),
      });
    }
  }

  private async classroomEditBlocked(ws: WebSocket, room: Room): Promise<boolean> {
    if (room.kind !== "classroom" || !room.classroom) return false;
    const { readAssignmentPolicy } = await import("@/lib/classroom/classroomService");
    const policy = await readAssignmentPolicy(room.classroom.classId, room.classroom.assignmentId);
    if (!policy) {
      send(ws, { type: "error", message: "Assignment not found." });
      return true;
    }
    const freeze = assignmentFreezeState(policy);
    if (!freeze.frozen) return false;
    send(ws, { type: "locked", message: freeze.reason || "This assignment is locked." });
    return true;
  }

  /** File mutations recheck membership now, rather than waiting for the periodic session audit. */
  private async classroomFileEditBlocked(ws: WebSocket, room: Room, state: ClientState): Promise<boolean> {
    if (await this.classroomEditBlocked(ws, room)) return true;
    if (!room.classroom) return false;
    const { getClassroom } = await import("@/lib/classroom/classroomService");
    const { resolveClassroomDocument } = await import("@/lib/classroom/documents");
    const scope = room.classroom;
    const access = await getClassroom(state.userId, scope.classId);
    const resolved = access.success ? await resolveClassroomDocument({ actorId: state.userId, classroomId: scope.classId, assignmentId: scope.assignmentId, isTeacher: Boolean(access.isTeacher), groupId: scope.groupId, studentId: scope.studentId }) : null;
    if (resolved?.ok && resolved.doc.role === "editor") return false;
    send(ws, { type: "error", message: "You no longer have permission to change this document's files." });
    ws.close(1008, "Document access changed");
    return true;
  }

  private async room(projectId: string): Promise<Room> {
    return this.roomBy(projectId, () => this.open(projectId));
  }

  private classroomRoom(doc: ResolvedClassroomDocument): Promise<Room> {
    return this.roomBy(doc.docKey, () => this.openClassroom(doc));
  }

  private async roomBy(id: string, opener: () => Promise<Room>): Promise<Room> {
    const existing = this.rooms.get(id);
    if (existing) return existing;
    const pending = this.opening.get(id);
    if (pending) return pending;
    const job = opener().finally(() => this.opening.delete(id));
    this.opening.set(id, job);
    return job;
  }

  private async open(projectId: string): Promise<Room> {
    const admin = createAdminClient();
    if (!admin) throw new Error("Cloud storage is not configured on the server.");

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("standard")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found.");

    const doc = new Y.Doc();
    const { data: snapshot } = await admin
      .from("project_documents")
      .select("state_b64")
      .eq("project_id", projectId)
      .maybeSingle();

    if (snapshot?.state_b64) {
      applyEncoded(doc, snapshot.state_b64);
    } else {
      const { data: rows } = await admin
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId);
      const files: Record<string, string> = {};
      for (const row of rows || []) files[row.path] = row.content;
      if (Object.keys(files).length === 0) files["main.cpp"] = DEFAULT_CODE;
      seedDoc(doc, files);
    }

    const room: Room = {
      projectId,
      kind: "project",
      doc,
      awareness: new Awareness(doc),
      standard: typeof project.standard === "string" ? project.standard : "c++17",
      clients: new Map(),
      saveTimer: null,
      evictTimer: null,
      saving: null,
    };
    this.attachRoomListeners(room);
    this.rooms.set(projectId, room);
    if (!snapshot?.state_b64) this.scheduleSave(room);
    return room;
  }

  private async openClassroom(resolved: ResolvedClassroomDocument): Promise<Room> {
    const { readClassroomDocument } = await import("@/lib/classroom/documents");
    const doc = new Y.Doc();
    const persisted = await readClassroomDocument(resolved.docKey);
    let seeded = false;
    if (persisted?.stateB64) {
      try {
        applyEncoded(doc, persisted.stateB64);
      } catch {
        seedDoc(doc, persisted.files && Object.keys(persisted.files).length > 0 ? persisted.files : resolved.starterCode);
        seeded = true;
      }
    } else if (persisted?.files && Object.keys(persisted.files).length > 0) {
      seedDoc(doc, persisted.files);
      seeded = true;
    } else {
      seedDoc(doc, resolved.starterCode);
      seeded = true;
    }

    const room: Room = {
      projectId: resolved.docKey,
      kind: "classroom",
      language: resolved.language,
      classroom: {
        classId: resolved.classroomId,
        assignmentId: resolved.assignmentId,
        groupId: resolved.groupId,
        studentId: resolved.studentId,
      },
      doc,
      awareness: new Awareness(doc),
      standard: "c++17",
      clients: new Map(),
      saveTimer: null,
      evictTimer: null,
      saving: null,
    };
    this.attachRoomListeners(room);
    this.rooms.set(resolved.docKey, room);
    if (seeded) this.scheduleSave(room);
    return room;
  }

  private attachRoomListeners(room: Room) {
    room.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const payload = { type: "update", update: bytesToBase64(update) };
      for (const client of room.clients.keys()) {
        if (client === origin) continue;
        send(client, payload);
      }
      this.scheduleSave(room);
    });

    room.awareness.on(
      "update",
      (
        change: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const changed = [...change.added, ...change.updated, ...change.removed];
        if (changed.length === 0) return;
        const payload = {
          type: "awareness",
          update: bytesToBase64(encodeAwarenessUpdate(room.awareness, changed)),
        };
        for (const client of room.clients.keys()) {
          if (client === origin) continue;
          send(client, payload);
        }
      }
    );
  }

  private scheduleSave(room: Room) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => {
      room.saveTimer = null;
      void this.persist(room);
    }, SAVE_DELAY_MS);
  }

  private persist(room: Room) {
    room.saving = (room.saving || Promise.resolve()).then(() => this.write(room));
    return room.saving;
  }

  private async write(room: Room) {
    if (room.kind === "classroom" && room.classroom) {
      const { writeClassroomDocument } = await import("@/lib/classroom/documents");
      await writeClassroomDocument({
        docKey: room.projectId,
        classroomId: room.classroom.classId,
        assignmentId: room.classroom.assignmentId,
        studentId: room.classroom.studentId,
        groupId: room.classroom.groupId,
        stateB64: encodeDoc(room.doc),
        files: readFiles(room.doc),
        updatedAt: new Date().toISOString(),
      });
      this.broadcast(room, { type: "saved" });
      return;
    }

    const admin = createAdminClient();
    if (!admin) return;
    const files = readFiles(room.doc);
    const rows = Object.entries(files).map(([path, content]) => ({
      project_id: room.projectId,
      path,
      content,
    }));

    const { error: docError } = await admin.from("project_documents").upsert({
      project_id: room.projectId,
      state_b64: encodeDoc(room.doc),
      updated_at: new Date().toISOString(),
    });
    if (docError) {
      console.log(JSON.stringify({ event: "collab_save_failed", projectId: room.projectId, error: docError.message }));
      return;
    }

    if (rows.length > 0) {
      const { error } = await admin.from("project_files").upsert(rows);
      if (error) {
        console.log(JSON.stringify({ event: "collab_files_failed", projectId: room.projectId, error: error.message }));
        return;
      }
    }

    const { data: existing } = await admin
      .from("project_files")
      .select("path")
      .eq("project_id", room.projectId);
    const live = new Set(Object.keys(files));
    const stale = (existing || []).map((row) => row.path).filter((path) => !live.has(path));
    if (stale.length > 0) {
      await admin.from("project_files").delete().eq("project_id", room.projectId).in("path", stale);
    }

    await admin
      .from("projects")
      .update({ standard: room.standard, updated_at: new Date().toISOString() })
      .eq("id", room.projectId);

    this.broadcast(room, { type: "saved" });
  }

  private broadcast(room: Room, message: Record<string, unknown>) {
    for (const client of room.clients.keys()) send(client, message);
  }
}

export function getHub(): CollabHub {
  const globalState = globalThis as typeof globalThis & { [HUB_KEY]?: CollabHub };
  if (!globalState[HUB_KEY]) globalState[HUB_KEY] = new CollabHub();
  return globalState[HUB_KEY];
}
