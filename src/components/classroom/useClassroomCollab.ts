"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { colorForUser, type CollabPeer } from "@/components/collab/useProjectCollab";
import { base64ToBytes, bytesToBase64 } from "@/lib/cloud/base64";
import { readFiles, seedDoc } from "@/lib/cloud/collabDoc";
import { canEdit, type ProjectRole } from "@/lib/cloud/roles";
import { watchLocalAuthorship } from "@/lib/classroom/authorship";
import { readDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";
import { classroomDraftPrefix, restoreLocalEdits, saveLocalEdit, type LocalEdit } from "@/lib/classroom/localEditJournal";

export interface ClassroomCollabState {
  status: "idle" | "connecting" | "live" | "offline" | "blocked";
  error: string | null;
  blockedCode: string | null;
  role: ProjectRole;
  fileNames: string[];
  peers: CollabPeer[];
  activeFile: string;
  setActiveFile: (name: string) => void;
  doc: Y.Doc | null;
  awareness: Awareness | null;
  frozen: boolean;
  freezeReason: string | null;
  allowRun: boolean;
  timeLimitMs: number;
  groupId?: string;
  studentId?: string;
  groupMode: boolean;
  displayName: string;
  pendingEdits: boolean;
  localBackupWarning: string | null;
  reconnect: () => void;
  snapshot: () => Record<string, string>;
  assets: DosboxAssets;
  snapshotAssets: () => DosboxAssets;
  createFile: (name: string) => void;
  deleteFile: (name: string) => void;
  uploadAsset: (name: string, base64: string) => void;
  deleteAsset: (name: string) => void;
}

export function useClassroomCollab(opts: {
  classId: string;
  assignmentId: string;
  groupId?: string;
  studentId?: string;
  previewStudent?: boolean;
  enabled?: boolean;
}): ClassroomCollabState {
  const enabled = opts.enabled !== false;
  const [status, setStatus] = useState<ClassroomCollabState["status"]>(enabled ? "connecting" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [assets, setAssets] = useState<DosboxAssets>({});
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [activeFile, setActiveFileState] = useState("main.cpp");
  const scope = JSON.stringify([opts.classId, opts.assignmentId, opts.groupId, opts.studentId, opts.previewStudent]);
  const [session, setSession] = useState<{ doc: Y.Doc; awareness: Awareness; scope: string } | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [freezeReason, setFreezeReason] = useState<string | null>(null);
  const [allowRun, setAllowRun] = useState(true);
  const [timeLimitMs, setTimeLimitMs] = useState(10_000);
  const [groupId, setGroupId] = useState<string | undefined>(opts.groupId);
  const [studentId, setStudentId] = useState<string | undefined>(opts.studentId);
  const [groupMode, setGroupMode] = useState(false);
  const [displayName, setDisplayName] = useState("Student");
  const [pendingEdits, setPendingEdits] = useState(false);
  const [localBackupWarning, setLocalBackupWarning] = useState<string | null>(null);

  const roleRef = useRef<ProjectRole>("viewer");
  const joinedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const activeFileRef = useRef("main.cpp");
  const identityRef = useRef({ userId: "", displayName: "", ready: false });
  const reconnectRef = useRef<() => void>(() => {});

  useEffect(() => {
    activeFileRef.current = activeFile;
    awarenessRef.current?.setLocalStateField("file", activeFile);
  }, [activeFile]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let doc = new Y.Doc();
    let awareness = new Awareness(doc);
    docRef.current = doc;
    awarenessRef.current = awareness;
    joinedRef.current = false;
    roleRef.current = "viewer";
    let socket: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let detach: (() => void) | null = null;
    let fallbackFiles: Record<string, string> = {};
    let shown = false;
    let synchronized = false;
    let documentKey: string | undefined;
    let authorizedActor: string | undefined;
    let connecting = false;
    let reconnectAllowed = true;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const queue: LocalEdit[] = [];
    const awaitingSave: { id: number; edits: LocalEdit[] }[] = [];
    let inFlight: { id: number; update: Uint8Array; edits: LocalEdit[] } | null = null;
    let draftPrefix: string | undefined;
    let draftLoaded = false;
    let nextEditId = 0;
    const hasEdits = () => queue.length > 0 || inFlight !== null || awaitingSave.length > 0;
    const flush = () => {
      if (!joinedRef.current || !canEdit(roleRef.current) || socket?.readyState !== WebSocket.OPEN) return;
      if (inFlight || !queue.length) return;
      // Bound each frame even when a large paste and its attribution arrive together.
      let length = 0;
      let count = 0;
      for (const edit of queue) {
        if (count && length + edit.update.byteLength > 256 * 1024) break;
        length += edit.update.byteLength;
        count++;
      }
      const edits = queue.splice(0, count);
      inFlight = { id: ++nextEditId, edits, update: Y.mergeUpdates(edits.map(edit => edit.update)) };
      sendInFlight();
    };
    const sendInFlight = () => {
      if (!inFlight || socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "update", update: bytesToBase64(inFlight.update), editId: inFlight.id }));
      clearTimeout(handshakeTimer);
      handshakeTimer = setTimeout(() => socket?.close(), 15_000);
    };
    const warnUnsynced = (event: BeforeUnloadEvent) => {
      const missingBackup = [...queue, ...(inFlight?.edits ?? []), ...awaitingSave.flatMap(batch => batch.edits)].some(edit => !edit.key);
      if (!missingBackup) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsynced);
    queueMicrotask(() => {
      if (stopped) return;
      setPendingEdits(false);
      setLocalBackupWarning(null);
      setError(null);
      setBlockedCode(null);
      setRole("viewer");
      setFrozen(false);
      setFreezeReason(null);
      setStatus("connecting");
    });
    const retired: Y.Doc[] = [];
    const destroyed = new Set<Y.Doc>();
    const destroyDoc = (old: Y.Doc) => {
      if (destroyed.has(old)) return;
      destroyed.add(old);
      old.destroy();
    };
    const retire = (old: Y.Doc) => {
      retired.push(old);
      setTimeout(() => {
        const index = retired.indexOf(old);
        if (index < 0) return;
        retired.splice(index, 1);
        destroyDoc(old);
      }, 0);
    };

    const refreshFiles = (current = doc) => {
      const names = Object.keys(readFiles(current)).sort();
      setFileNames(names);
      setAssets(readDosboxAssets(current));
      setActiveFileState((file) => (names.includes(file) ? file : names[0] || "main.cpp"));
    };

    const refreshPeers = () => {
      const next: CollabPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = state.user as { name?: string; color?: string } | undefined;
        if (!user?.name) return;
        next.push({
          clientId,
          name: user?.name || "Student",
          color: user?.color || "#61AFEF",
          file: typeof state.file === "string" ? state.file : null,
          running: state.running === true,
        });
      });
      setPeers(next);
    };

    const bind = (nextDoc: Y.Doc, nextAwareness: Awareness) => {
      detach?.();
      doc = nextDoc;
      awareness = nextAwareness;
      docRef.current = doc;
      awarenessRef.current = awareness;

      const onUpdate = (update: Uint8Array, origin: unknown) => {
        if (!synchronized || origin === "remote" || origin === "hydrate" || !canEdit(roleRef.current)) return;
        try {
          queue.push(draftPrefix ? saveLocalEdit(window.localStorage, draftPrefix, update) : { update });
        } catch {
          queue.push({ update });
          setLocalBackupWarning("This browser could not save the latest edit locally. Download your code before closing the tab.");
        }
        setPendingEdits(true);
        if (!flushTimer) flushTimer = setTimeout(() => {
          flushTimer = undefined;
          flush();
        }, 80);
      };
      const onAwareness = (
        change: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        refreshPeers();
        if (!joinedRef.current || origin === "remote") return;
        const changed = [...change.added, ...change.updated, ...change.removed];
        if (changed.length === 0 || socket?.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type: "awareness",
            update: bytesToBase64(encodeAwarenessUpdate(awareness, changed)),
          })
        );
      };
      doc.on("update", onUpdate);
      awareness.on("update", onAwareness);
      awareness.on("change", refreshPeers);
      const onFiles = () => refreshFiles(nextDoc);
      doc.getMap("files").observe(onFiles);
      doc.getMap("dosAssets").observe(onFiles);
      const stopAuthorship = watchLocalAuthorship(doc, () =>
        canEdit(roleRef.current) ? identityRef.current.userId || null : null
      );
      detach = () => {
        stopAuthorship();
        doc.off("update", onUpdate);
        awareness.off("update", onAwareness);
        awareness.off("change", refreshPeers);
        nextDoc.getMap("files").unobserve(onFiles);
        nextDoc.getMap("dosAssets").unobserve(onFiles);
      };
      refreshFiles(doc);
      refreshPeers();
      shown = true;
      setSession({ doc, awareness, scope });
    };

    const publishPresence = () => {
      const identity = identityRef.current;
      if (!identity.ready || !identity.displayName) return;
      awareness.setLocalStateField("user", {
        name: identity.displayName,
        color: colorForUser(identity.userId || identity.displayName),
      });
      awareness.setLocalStateField("file", activeFileRef.current);
    };

    const showFallback = () => {
      if (shown || !Object.keys(fallbackFiles).length) return;
      seedDoc(doc, fallbackFiles);
      bind(doc, awareness);
    };
    const restoreDraft = () => {
      if (!draftPrefix || draftLoaded) return;
      draftLoaded = true;
      try {
        const saved = restoreLocalEdits(window.localStorage, draftPrefix);
        for (const edit of saved) {
          try {
            Y.applyUpdate(doc, edit.update, "hydrate");
            queue.push(edit);
          } catch {
            setLocalBackupWarning("Part of the local backup could not be loaded. Other recovered edits are still available.");
          }
        }
        if (queue.length) {
          refreshFiles(doc);
          setPendingEdits(true);
        }
      } catch {
        setLocalBackupWarning("Local backup is unavailable in this browser.");
      }
    };
    const retryLater = () => {
      if (stopped || !reconnectAllowed) return;
      setStatus("offline");
      setError(synchronized && canEdit(roleRef.current)
        ? "Reconnecting. You can keep typing in this tab."
        : "Connection interrupted. Reconnecting to the shared document…");
      retry++;
      clearTimeout(retryTimer ?? undefined);
      retryTimer = setTimeout(() => void connect(), Math.min(1000 * 2 ** Math.min(retry - 1, 5), 30_000) + Math.random() * 600);
    };

    const connect = async () => {
      if (stopped || connecting || socket || !reconnectAllowed) return;
      if (!navigator.onLine) {
        retryLater();
        return;
      }
      connecting = true;
      if (!shown) setStatus("connecting");
      let sessionBody: {
        success?: boolean;
        error?: string;
        code?: string;
        token?: string;
        docKey?: string;
        role?: ProjectRole;
        files?: Record<string, string>;
        initialState?: string;
        frozen?: boolean;
        freezeReason?: string | null;
        allowRun?: boolean;
        timeLimitMs?: number;
        groupId?: string;
        studentId?: string;
        groupMode?: boolean;
        displayName?: string;
        userId?: string;
      };
      try {
        const response = await fetch(
          `/api/classroom/${opts.classId}/assignments/${opts.assignmentId}/session`,
          {
            method: "POST",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId: opts.groupId,
              studentId: opts.studentId,
              previewStudent: opts.previewStudent === true,
              includePreview: !synchronized,
              editableBootstrap: !synchronized && !opts.groupId && !opts.studentId,
            }),
          }
        );
        if (response.status >= 500 || response.status === 429) throw Error("Temporary session failure");
        sessionBody = await response.json();
        if (stopped) return;
        if (!response.ok || !sessionBody.success || !sessionBody.token) {
          roleRef.current = "viewer";
          setRole("viewer");
          setStatus("blocked");
          setBlockedCode(sessionBody.code || null);
          setError(sessionBody.error || "This document is unavailable.");
          return;
        }
      } catch {
        retryLater();
        return;
      } finally {
        connecting = false;
      }

      if (synchronized && (documentKey !== sessionBody.docKey || authorizedActor !== sessionBody.userId)) {
        roleRef.current = "viewer";
        setRole("viewer");
        setStatus("blocked");
        setError("Your workspace access changed. Download any unsynced work before reopening the assignment.");
        return;
      }
      documentKey = sessionBody.docKey;
      authorizedActor = sessionBody.userId;
      if (!opts.groupId && !opts.studentId && documentKey && authorizedActor) {
        draftPrefix = classroomDraftPrefix(authorizedActor, documentKey);
      }
      fallbackFiles = sessionBody.files || {};
      setFrozen(Boolean(sessionBody.frozen));
      setFreezeReason(sessionBody.freezeReason || null);
      setAllowRun(sessionBody.allowRun !== false);
      setTimeLimitMs(typeof sessionBody.timeLimitMs === "number" ? sessionBody.timeLimitMs : 10_000);
      setGroupId(sessionBody.groupId);
      setStudentId(sessionBody.studentId);
      setGroupMode(Boolean(sessionBody.groupMode));
      setDisplayName(sessionBody.displayName || "Student");
      identityRef.current = {
        userId: sessionBody.userId || "",
        displayName: sessionBody.displayName || "Student",
        ready: true,
      };
      if (sessionBody.role !== "editor") {
        roleRef.current = "viewer";
        setRole("viewer");
      }
      if (!synchronized && sessionBody.initialState && sessionBody.role === "editor") {
        Y.applyUpdate(doc, base64ToBytes(sessionBody.initialState), "hydrate");
        synchronized = true;
        roleRef.current = "editor";
        setRole("editor");
        bind(doc, awareness);
        restoreDraft();
      } else {
        showFallback();
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
      socketRef.current = socket;
      const current = socket;
      handshakeTimer = setTimeout(() => current.close(), 25_000);

      current.onopen = () => {
        if (stopped) {
          current.close();
          return;
        }
        current.send(
          JSON.stringify({
            type: "join",
            kind: "classroom",
            token: sessionBody.token,
            clientId: doc.clientID,
          })
        );
      };

      current.onmessage = (event) => {
        let msg: {
          type?: string;
          state?: string;
          update?: string;
          role?: ProjectRole;
          message?: string;
          locked?: boolean;
          lockMessage?: string | null;
          editId?: number;
        };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (stopped) return;
        if (msg.type === "init" && typeof msg.state === "string") {
          clearTimeout(handshakeTimer);
          const nextRole = msg.role === "editor" ? "editor" : "viewer";
          roleRef.current = nextRole;
          setRole(nextRole);
          if (msg.locked) {
            setFrozen(true);
            if (msg.lockMessage) setFreezeReason(msg.lockMessage);
          }
          if (!synchronized && shown) {
            const fresh = new Y.Doc();
            const freshAwareness = new Awareness(fresh);
            Y.applyUpdate(fresh, base64ToBytes(msg.state), "remote");
            const previous = doc;
            bind(fresh, freshAwareness);
            retire(previous);
            if (current.readyState === WebSocket.OPEN) {
              current.send(JSON.stringify({ type: "client", clientId: fresh.clientID }));
            }
          } else {
            if (!shown) bind(doc, awareness);
            Y.applyUpdate(doc, base64ToBytes(msg.state), "remote");
            refreshFiles(doc);
          }
          synchronized = true;
          restoreDraft();
          joinedRef.current = true;
          publishPresence();
          setStatus("live");
          setError(null);
          retry = 0;
          if (canEdit(nextRole)) {
            if (inFlight) sendInFlight();
            else flush();
          } else if (hasEdits()) {
            setError("Editing is locked. Download any unsynced work before leaving.");
          }
          return;
        }
        if (msg.type === "edit-accepted" && inFlight && msg.editId === inFlight.id) {
          clearTimeout(handshakeTimer);
          awaitingSave.push({ id: inFlight.id, edits: inFlight.edits });
          inFlight = null;
          flush();
          return;
        }
        if (msg.type === "edit-durable" && typeof msg.editId === "number") {
          while (awaitingSave.length && awaitingSave[0].id <= msg.editId) {
            const saved = awaitingSave.shift()!;
            try {
              for (const edit of saved.edits) if (edit.key) window.localStorage.removeItem(edit.key);
            } catch {
              // Replay is idempotent if the browser cannot prune a saved edit.
            }
          }
          setPendingEdits(hasEdits());
          return;
        }
        if (msg.type === "update" && typeof msg.update === "string") {
          Y.applyUpdate(doc, base64ToBytes(msg.update), "remote");
          refreshFiles(doc);
          return;
        }
        if (msg.type === "awareness" && typeof msg.update === "string") {
          applyAwarenessUpdate(awareness, base64ToBytes(msg.update), "remote");
          return;
        }
        if (msg.type === "locked") {
          setFrozen(true);
          setFreezeReason(msg.message || "This assignment is locked.");
          roleRef.current = "viewer";
          setRole("viewer");
          if (hasEdits()) setError("Editing is locked. Download any unsynced work before leaving.");
          return;
        }
        if (msg.type === "edit-rejected" && inFlight && msg.editId === inFlight.id) {
          clearTimeout(handshakeTimer);
          reconnectAllowed = false;
          roleRef.current = "viewer";
          setRole("viewer");
          setStatus("blocked");
          setError(`${msg.message || "The server could not accept an edit."} Download your unsynced work before reopening the assignment.`);
          return;
        }
        if (msg.type === "save-delayed") {
          setError("The server is retrying the automatic save.");
          return;
        }
        if (msg.type === "saved") {
          setError(previous => previous === "The server is retrying the automatic save." ? null : previous);
          return;
        }
        if (msg.type === "error") setError(msg.message || "Collaboration error.");
      };

      current.onclose = (event) => {
        joinedRef.current = false;
        if (stopped || socketRef.current !== current) return;
        clearTimeout(handshakeTimer);
        socket = null;
        const unconfirmed = awaitingSave.splice(0).flatMap(batch => batch.edits);
        if (inFlight) unconfirmed.push(...inFlight.edits);
        inFlight = null;
        if (unconfirmed.length) queue.unshift(...unconfirmed);
        const peers = [...awareness.getStates().keys()].filter(id => id !== doc.clientID);
        removeAwarenessStates(awareness, peers, "remote");
        if (event.code === 1008) {
          roleRef.current = "viewer";
          setRole("viewer");
        }
        retryLater();
      };
    };

    const reconnect = () => {
      clearTimeout(retryTimer ?? undefined);
      void connect();
    };
    reconnectRef.current = reconnect;
    const networkLost = () => {
      if (socket) socket.close();
      else retryLater();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", networkLost);
    void connect();

    return () => {
      stopped = true;
      abort.abort();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", networkLost);
      window.removeEventListener("beforeunload", warnUnsynced);
      clearTimeout(flushTimer);
      clearTimeout(handshakeTimer);
      joinedRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      detach?.();
      for (const old of retired) destroyDoc(old);
      retired.length = 0;
      destroyDoc(doc);
      docRef.current = null;
      awarenessRef.current = null;
      socketRef.current = null;
      setSession(null);
    };
  }, [enabled, opts.assignmentId, opts.classId, opts.groupId, opts.previewStudent, opts.studentId, scope]);

  const setActiveFile = useCallback((name: string) => {
    setActiveFileState(name);
    activeFileRef.current = name;
    awarenessRef.current?.setLocalStateField("file", name);
  }, []);

  const snapshot = useCallback(() => {
    const current = docRef.current;
    return current ? readFiles(current) : {};
  }, []);

  const snapshotAssets = useCallback(() => docRef.current ? readDosboxAssets(docRef.current) : {}, []);
  const sendCommand = useCallback((message: Record<string, string>) => {
    if (!joinedRef.current || !canEdit(roleRef.current) || socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("Connect to the editable shared workspace before changing files.");
      return;
    }
    setError(null);
    socketRef.current.send(JSON.stringify(message));
  }, []);
  const createFile = useCallback((name: string) => sendCommand({ type: "file-create", name }), [sendCommand]);
  const deleteFile = useCallback((name: string) => sendCommand({ type: "file-delete", name }), [sendCommand]);
  const uploadAsset = useCallback((name: string, base64: string) => sendCommand({ type: "asset-upload", name, base64 }), [sendCommand]);
  const deleteAsset = useCallback((name: string) => sendCommand({ type: "asset-delete", name }), [sendCommand]);
  const visibleSession = enabled && session?.scope === scope ? session : null;

  return {
    status: !enabled ? "idle" : status === "live" && !visibleSession ? "connecting" : status,
    error: enabled ? error : null,
    blockedCode,
    role,
    fileNames,
    peers,
    activeFile,
    setActiveFile,
    doc: visibleSession?.doc ?? null,
    awareness: visibleSession?.awareness ?? null,
    frozen,
    freezeReason,
    allowRun,
    timeLimitMs,
    groupId,
    studentId,
    groupMode,
    displayName,
    pendingEdits: enabled && pendingEdits,
    localBackupWarning,
    reconnect: () => reconnectRef.current(),
    snapshot,
    assets,
    snapshotAssets,
    createFile,
    deleteFile,
    uploadAsset,
    deleteAsset,
  };
}
