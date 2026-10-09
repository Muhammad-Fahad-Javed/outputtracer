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
import { ALLOWED_STANDARDS, type AllowedStandard } from "@/lib/execConfig";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CODE } from "@/lib/examples";

const HUB_KEY = "__outputtracerCollabHub";
const SAVE_DELAY_MS = 800;
const IDLE_EVICT_MS = 10 * 60 * 1000;
const MAX_UPDATE_BYTES = 512 * 1024;

interface ClientState {
  userId: string;
  role: ProjectRole;
  clientId: number;
}

interface Room {
  projectId: string;
  doc: Y.Doc;
  awareness: Awareness;
  standard: string;
  clients: Map<WebSocket, ClientState>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
  saving: Promise<void> | null;
}

type ClientMessage =
  | { type: "join"; projectId?: string; token?: string; clientId?: number }
  | { type: "update"; update?: string }
  | { type: "awareness"; update?: string }
  | { type: "file-create"; name?: string; content?: string }
  | { type: "file-delete"; name?: string }
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

    const leave = () => {
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

    if (message.type === "update") {
      if (!canEdit(state.role) || typeof message.update !== "string") return;
      const bytes = base64ToBytes(message.update);
      if (bytes.byteLength > MAX_UPDATE_BYTES) return;
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
      const created = createFile(room.doc, message.name, message.content || "");
      if (!created.ok) send(ws, { type: "error", message: created.message });
      return;
    }

    if (message.type === "file-delete") {
      if (!canEdit(state.role) || typeof message.name !== "string") return;
      const removed = deleteFile(room.doc, message.name);
      if (!removed.ok) send(ws, { type: "error", message: removed.message });
      return;
    }

    if (message.type === "standard" && typeof message.value === "string") {
      if (!canEdit(state.role)) return;
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

  private async room(projectId: string): Promise<Room> {
    const existing = this.rooms.get(projectId);
    if (existing) return existing;
    const pending = this.opening.get(projectId);
    if (pending) return pending;
    const job = this.open(projectId).finally(() => this.opening.delete(projectId));
    this.opening.set(projectId, job);
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
      doc,
      awareness: new Awareness(doc),
      standard: typeof project.standard === "string" ? project.standard : "c++17",
      clients: new Map(),
      saveTimer: null,
      evictTimer: null,
      saving: null,
    };

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

    this.rooms.set(projectId, room);
    if (!snapshot?.state_b64) this.scheduleSave(room);
    return room;
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
