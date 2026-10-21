"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import { colorForUser, type CollabPeer } from "@/components/collab/useProjectCollab";
import { base64ToBytes, bytesToBase64 } from "@/lib/cloud/base64";
import { readFiles, seedDoc } from "@/lib/cloud/collabDoc";
import { canEdit, type ProjectRole } from "@/lib/cloud/roles";

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
  snapshot: () => Record<string, string>;
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
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [activeFile, setActiveFileState] = useState("main.cpp");
  const [session, setSession] = useState<{ doc: Y.Doc; awareness: Awareness } | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [freezeReason, setFreezeReason] = useState<string | null>(null);
  const [allowRun, setAllowRun] = useState(true);
  const [timeLimitMs, setTimeLimitMs] = useState(10_000);
  const [groupId, setGroupId] = useState<string | undefined>(opts.groupId);
  const [studentId, setStudentId] = useState<string | undefined>(opts.studentId);
  const [groupMode, setGroupMode] = useState(false);
  const [displayName, setDisplayName] = useState("Student");

  const roleRef = useRef<ProjectRole>("viewer");
  const joinedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const activeFileRef = useRef("main.cpp");
  const identityRef = useRef({ userId: "", displayName: "", ready: false });

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setSession(null);
      return;
    }

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
        if (!joinedRef.current || origin === "remote" || origin === "hydrate") return;
        if (!canEdit(roleRef.current) || socket?.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "update", update: bytesToBase64(update) }));
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
      doc.getMap("files").observe(() => refreshFiles(doc));
      detach = () => {
        doc.off("update", onUpdate);
        awareness.off("update", onAwareness);
        awareness.off("change", refreshPeers);
      };
      refreshFiles(doc);
      refreshPeers();
      shown = true;
      setSession({ doc, awareness });
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
      if (doc.getMap("files").size === 0 && Object.keys(fallbackFiles).length > 0) {
        seedDoc(doc, fallbackFiles);
      }
      roleRef.current = "viewer";
      setRole("viewer");
      bind(doc, awareness);
      setStatus("offline");
    };

    const connect = async () => {
      if (stopped) return;
      setStatus("connecting");
      let sessionBody: {
        success?: boolean;
        error?: string;
        code?: string;
        token?: string;
        role?: ProjectRole;
        files?: Record<string, string>;
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId: opts.groupId,
              studentId: opts.studentId,
              previewStudent: opts.previewStudent === true,
            }),
          }
        );
        sessionBody = await response.json();
        if (stopped) return;
        if (!response.ok || !sessionBody.success || !sessionBody.token) {
          setStatus("blocked");
          setBlockedCode(sessionBody.code || null);
          setError(sessionBody.error || "This document is unavailable.");
          return;
        }
      } catch {
        if (!stopped) {
          setStatus("offline");
          setError("Could not open the shared document.");
        }
        return;
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
      const initialRole = sessionBody.role === "editor" ? "editor" : "viewer";
      roleRef.current = initialRole;
      setRole(initialRole);

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
      socketRef.current = socket;
      const current = socket;

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
        };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (stopped) return;
        if (msg.type === "init" && typeof msg.state === "string") {
          const nextRole = msg.role === "editor" ? "editor" : "viewer";
          roleRef.current = nextRole;
          setRole(nextRole);
          if (msg.locked) {
            setFrozen(true);
            if (msg.lockMessage) setFreezeReason(msg.lockMessage);
          }
          if (doc.getMap("files").size > 0) {
            const fresh = new Y.Doc();
            const freshAwareness = new Awareness(fresh);
            Y.applyUpdate(fresh, base64ToBytes(msg.state), "remote");
            const previous = doc;
            const previousShown = shown;
            bind(fresh, freshAwareness);
            if (previousShown) retire(previous);
            else destroyDoc(previous);
            if (current.readyState === WebSocket.OPEN) {
              current.send(JSON.stringify({ type: "client", clientId: fresh.clientID }));
            }
          } else {
            if (!shown) bind(doc, awareness);
            Y.applyUpdate(doc, base64ToBytes(msg.state), "remote");
            refreshFiles(doc);
          }
          joinedRef.current = true;
          publishPresence();
          setStatus("live");
          setError(null);
          retry = 0;
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
          return;
        }
        if (msg.type === "error") setError(msg.message || "Collaboration error.");
      };

      current.onclose = () => {
        joinedRef.current = false;
        if (stopped || socketRef.current !== current) return;
        socket = null;
        showFallback();
        retry += 1;
        retryTimer = setTimeout(() => void connect(), Math.min(1000 * retry, 5000));
      };
    };

    void connect();

    return () => {
      stopped = true;
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
  }, [enabled, opts.assignmentId, opts.classId, opts.groupId, opts.previewStudent, opts.studentId]);

  const setActiveFile = useCallback((name: string) => {
    setActiveFileState(name);
    activeFileRef.current = name;
    awarenessRef.current?.setLocalStateField("file", name);
  }, []);

  const snapshot = useCallback(() => {
    const current = docRef.current;
    return current ? readFiles(current) : {};
  }, []);

  return {
    status,
    error,
    blockedCode,
    role,
    fileNames,
    peers,
    activeFile,
    setActiveFile,
    doc: session?.doc ?? null,
    awareness: session?.awareness ?? null,
    frozen,
    freezeReason,
    allowRun,
    timeLimitMs,
    groupId,
    studentId,
    groupMode,
    displayName,
    snapshot,
  };
}
