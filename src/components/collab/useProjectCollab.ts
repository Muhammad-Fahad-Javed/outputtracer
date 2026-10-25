"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import { bytesToBase64, base64ToBytes } from "@/lib/cloud/base64";
import { createFile as createSharedFile, deleteFile as deleteSharedFile, readFiles, renameFile as renameSharedFile, seedDoc } from "@/lib/cloud/collabDoc";
import {
  needsCloudSync,
  readLocalSnapshot,
  readLocalSnapshotSync,
  writeLocalSnapshot,
  writeLocalSnapshotSync,
  type LocalProjectRecord,
} from "@/lib/cloud/localProjectStore";
import { canEdit, type ProjectRole } from "@/lib/cloud/roles";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { inspectDosboxAssets, readDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/lib/cloud/projectLanguage";

const COLORS = ["#E06C75", "#61AFEF", "#98C379", "#E5C07B", "#C678DD", "#56B6C2", "#D19A66", "#BE5046"];

export function colorForUser(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export interface CollabPeer {
  clientId: number;
  name: string;
  color: string;
  file: string | null;
  running: boolean;
}

export type SaveState = "saved" | "saving" | "local";

export interface ProjectCollab {
  status: "connecting" | "live" | "offline";
  error: string | null;
  role: ProjectRole;
  fileNames: string[];
  language: ProjectLanguage;
  standard: string | null;
  assets: DosboxAssets;
  peers: CollabPeer[];
  saved: SaveState;
  activeFile: string;
  doc: Y.Doc | null;
  awareness: Awareness | null;
  setActiveFile: (name: string) => void;
  setStandard: (value: string) => void;
  createFile: (name: string) => string | null;
  renameFile: (from: string, to: string) => string | null;
  deleteFile: (name: string) => string | null;
  uploadAsset: (name: string, base64: string) => string | null;
  deleteAsset: (name: string) => string | null;
  setRunning: (running: boolean) => void;
  snapshot: () => Record<string, string>;
  snapshotAssets: () => DosboxAssets;
}

function encodeState(doc: Y.Doc): string {
  return bytesToBase64(Y.encodeStateAsUpdate(doc));
}

export function useProjectCollab(opts: {
  projectId: string;
  userId: string;
  displayName: string;
  initialStandard: string | null;
  language?: ProjectLanguage;
  initialRole: ProjectRole;
  initialFiles: Record<string, string>;
  initialAssets?: DosboxAssets;
}): ProjectCollab {
  const language = opts.language ?? "cpp";
  const entryFile = PROJECT_LANGUAGES[language].file;
  const [status, setStatus] = useState<ProjectCollab["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole>(opts.initialRole);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [standard, setStandardState] = useState(language === "cpp" ? opts.initialStandard ?? "c++17" : null);
  const [assets, setAssets] = useState<DosboxAssets>(opts.initialAssets ?? {});
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [saved, setSaved] = useState<SaveState>("saved");
  const [activeFile, setActiveFileState] = useState<string>(entryFile);
  const [session, setSession] = useState<{ doc: Y.Doc; awareness: Awareness } | null>(null);

  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<ProjectRole>(opts.initialRole);
  const activeFileRef = useRef<string>(entryFile);
  const optsRef = useRef(opts);
  const standardRef = useRef<string | null>(language === "cpp" ? opts.initialStandard ?? "c++17" : null);
  const bootRef = useRef<"yjs" | "seed">("seed");
  const syncedAtRef = useRef<number | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    optsRef.current = opts;
    roleRef.current = role;
    activeFileRef.current = activeFile;
    standardRef.current = standard;
  });

  useEffect(() => {
    let doc = new Y.Doc();
    let awareness = new Awareness(doc);
    docRef.current = doc;
    awarenessRef.current = awareness;
    roleRef.current = optsRef.current.initialRole;
    setRole(optsRef.current.initialRole);

    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let detachUpdate: (() => void) | null = null;
    let detachPeers: (() => void) | null = null;

    const refreshFiles = () => {
      const names: string[] = [];
      doc.getMap("files").forEach((_value, key) => names.push(String(key)));
      names.sort();
      setFileNames(names);
      setActiveFileState((current) => (names.includes(current) ? current : names.includes(entryFile) ? entryFile : names[0] || entryFile));
      setAssets(readDosboxAssets(doc));
    };

    const refreshPeers = () => {
      const next: CollabPeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = state.user as { name?: string; color?: string } | undefined;
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

    const currentRecord = (savedAt = Date.now()): LocalProjectRecord => ({
      projectId: optsRef.current.projectId,
      stateB64: encodeState(doc),
      standard: standardRef.current ?? "",
      language: optsRef.current.language ?? "cpp",
      savedAt,
      syncedAt: syncedAtRef.current,
      boot: bootRef.current,
    });

    const remember = (markLocal: boolean) => {
      const record = currentRecord();
      writeLocalSnapshotSync(record);
      void writeLocalSnapshot(record);
      if (markLocal && !joinedRef.current && !stopped) setSaved(needsCloudSync(record) ? "local" : "saved");
    };

    const flushToCloud = () => {
      remember(true);
      const record = readLocalSnapshotSync(optsRef.current.projectId);
      if (!record || !needsCloudSync(record) || !canEdit(roleRef.current)) return;
      if (typeof navigator === "undefined" || !navigator.onLine) return;
      const body = new Blob(
        [JSON.stringify({ state: record.stateB64, ...(language === "cpp" ? { standard: record.standard } : {}) })],
        { type: "application/json" }
      );
      navigator.sendBeacon(`/api/projects/${optsRef.current.projectId}/sync`, body);
    };

    const bindDoc = (nextDoc: Y.Doc, nextAwareness: Awareness) => {
      detachUpdate?.();
      detachPeers?.();
      doc = nextDoc;
      awareness = nextAwareness;
      docRef.current = doc;
      awarenessRef.current = awareness;

      const onUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin !== "hydrate") {
          if (persistTimer) clearTimeout(persistTimer);
          if (origin !== "remote") setSaved("saving");
          persistTimer = setTimeout(() => remember(origin !== "remote"), 80);
        }
        if (!joinedRef.current || origin === "remote" || origin === "hydrate") return;
        if (!canEdit(roleRef.current) || socket?.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "update", update: bytesToBase64(update) }));
      };
      doc.on("update", onUpdate);
      detachUpdate = () => doc.off("update", onUpdate);

      const onAwareness = (
        change: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
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
      awareness.on("update", onAwareness);
      awareness.on("change", refreshPeers);
      doc.getMap("files").observe(refreshFiles);
      doc.getMap("dosAssets").observe(refreshFiles);
      detachPeers = () => {
        awareness.off("update", onAwareness);
        awareness.off("change", refreshPeers);
        doc.getMap("files").unobserve(refreshFiles);
        doc.getMap("dosAssets").unobserve(refreshFiles);
      };
    };

    const show = () => {
      refreshFiles();
      setSession({ doc, awareness });
    };

    const applyLocal = (record: LocalProjectRecord) => {
      if ((record.language ?? "cpp") !== language) return;
      Y.applyUpdate(doc, base64ToBytes(record.stateB64), "hydrate");
      bootRef.current = record.boot;
      syncedAtRef.current = record.syncedAt;
      if (language === "cpp" && record.standard) {
        standardRef.current = record.standard;
        setStandardState(record.standard);
      }
      if (needsCloudSync(record)) setSaved("local");
      show();
    };

    bindDoc(doc, awareness);

    const cached = readLocalSnapshotSync(optsRef.current.projectId);
    if (cached?.stateB64) applyLocal(cached);
    void readLocalSnapshot(optsRef.current.projectId).then((stored) => {
      if (stopped || !stored?.stateB64) return;
      if (!cached || stored.savedAt > cached.savedAt) applyLocal(stored);
    });

    const ensureVisible = () => {
      if (doc.getMap("files").size > 0) {
        show();
        return;
      }
      const files = optsRef.current.initialFiles;
      if (Object.keys(files).length > 0) seedDoc(doc, files);
      if (language === "asm8086" && optsRef.current.initialAssets && inspectDosboxAssets(optsRef.current.initialAssets).ok) {
        for (const [name, asset] of Object.entries(optsRef.current.initialAssets)) doc.getMap("dosAssets").set(name, asset);
      }
      bootRef.current = "seed";
      remember(true);
      show();
    };

    const pushState = (serverState: string) => {
      if (!canEdit(roleRef.current) || socket?.readyState !== WebSocket.OPEN) return;
      const remote = new Y.Doc();
      try {
        Y.applyUpdate(remote, base64ToBytes(serverState));
        socket.send(JSON.stringify({ type: "update", update: bytesToBase64(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(remote))) }));
      } finally { remote.destroy(); }
    };

    const connect = async () => {
      if (stopped) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const supabase = await getSupabaseBrowser();
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (stopped) return;
      if (!token) {
        setStatus("offline");
        ensureVisible();
        retry += 1;
        retryTimer = setTimeout(() => void connect(), Math.min(1000 * retry, 5000));
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        ensureVisible();
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/collab`);
      wsRef.current = socket;
      const current = socket;

      current.onopen = () => {
        current.send(
          JSON.stringify({
            type: "join",
            projectId: optsRef.current.projectId,
            token,
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
          standard?: string;
          language?: ProjectLanguage;
          value?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (msg.type === "init" && typeof msg.state === "string") {
          if (msg.language && msg.language !== language) {
            setError("This project's language changed. Reload the workspace.");
            current.close();
            return;
          }
          if (bootRef.current === "seed" && doc.getMap("files").size > 0) {
            const localFiles = readFiles(doc);
            const fresh = new Y.Doc();
            const freshAwareness = new Awareness(fresh);
            Y.applyUpdate(fresh, base64ToBytes(msg.state), "hydrate");
            const remoteFiles = readFiles(fresh);
            fresh.transact(() => {
              const map = fresh.getMap<Y.Text>("files");
              for (const [name, text] of Object.entries(localFiles)) {
                if (remoteFiles[name] === text) continue;
                let shared = map.get(name);
                if (!(shared instanceof Y.Text)) {
                  shared = new Y.Text();
                  map.set(name, shared);
                }
                if (shared.length > 0) shared.delete(0, shared.length);
                if (text) shared.insert(0, text);
              }
              for (const name of Object.keys(remoteFiles)) {
                if (!(name in localFiles)) map.delete(name);
              }
            });
            detachUpdate?.();
            detachPeers?.();
            doc.destroy();
            bindDoc(fresh, freshAwareness);
          } else {
            Y.applyUpdate(doc, base64ToBytes(msg.state), "remote");
          }
          bootRef.current = "yjs";
          joinedRef.current = true;
          if (msg.role === "owner" || msg.role === "editor" || msg.role === "viewer") {
            roleRef.current = msg.role;
            setRole(msg.role);
          }
          if (typeof msg.standard === "string") {
            standardRef.current = msg.standard;
            setStandardState(msg.standard);
          }
          show();
          awareness.setLocalStateField("user", {
            name: optsRef.current.displayName || "Student",
            color: colorForUser(optsRef.current.userId),
          });
          awareness.setLocalStateField("file", activeFileRef.current);
          pushState(msg.state);
          remember(false);
          setStatus("live");
          setError(null);
          retry = 0;
          return;
        }
        if (msg.type === "update" && typeof msg.update === "string") {
          Y.applyUpdate(doc, base64ToBytes(msg.update), "remote");
          refreshFiles();
          return;
        }
        if (msg.type === "awareness" && typeof msg.update === "string") {
          applyAwarenessUpdate(awareness, base64ToBytes(msg.update), "remote");
          return;
        }
        if (msg.type === "standard" && typeof msg.value === "string") {
          standardRef.current = msg.value;
          setStandardState(msg.value);
          remember(false);
          return;
        }
        if (msg.type === "saved") {
          syncedAtRef.current = Date.now();
          const existing = readLocalSnapshotSync(optsRef.current.projectId);
          if (existing) {
            const acked = { ...existing, syncedAt: syncedAtRef.current, boot: "yjs" as const };
            writeLocalSnapshotSync(acked);
            void writeLocalSnapshot(acked);
          }
          setSaved("saved");
          return;
        }
        if (msg.type === "error") setError(msg.message || "Collaboration error.");
      };

      current.onclose = () => {
        joinedRef.current = false;
        if (stopped || wsRef.current !== current) return;
        socket = null;
        setStatus("offline");
        ensureVisible();
        remember(true);
        retry += 1;
        retryTimer = setTimeout(() => void connect(), Math.min(1000 * retry, 5000));
      };
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") flushToCloud();
    };
    const onOnline = () => {
      retry = 0;
      void connect();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushToCloud);
    window.addEventListener("online", onOnline);

    const heartbeat = setInterval(() => {
      if (joinedRef.current) awareness.setLocalStateField("heartbeat", Date.now());
    }, 15_000);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    void connect();

    return () => {
      stopped = true;
      joinedRef.current = false;
      flushToCloud();
      if (retryTimer) clearTimeout(retryTimer);
      if (persistTimer) clearTimeout(persistTimer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushToCloud);
      window.removeEventListener("online", onOnline);
      socket?.close();
      detachUpdate?.();
      detachPeers?.();
      doc.destroy();
      docRef.current = null;
      awarenessRef.current = null;
      wsRef.current = null;
      setSession(null);
    };
  }, [opts.projectId, language, entryFile]);

  const setRunning = useCallback((running: boolean) => {
    awarenessRef.current?.setLocalStateField("running", running);
  }, []);

  return {
    status,
    error,
    role,
    fileNames,
    language,
    standard,
    assets,
    peers,
    saved,
    activeFile,
    doc: session?.doc ?? null,
    awareness: session?.awareness ?? null,
    setActiveFile: (name: string) => {
      setActiveFileState(name);
      awarenessRef.current?.setLocalStateField("file", name);
    },
    setStandard: (value: string) => {
      if (language !== "cpp" || !canEdit(roleRef.current)) return;
      standardRef.current = value;
      setStandardState(value);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "standard", value }));
      }
    },
    createFile: (name: string) => {
      if (!canEdit(roleRef.current)) return "This project is read-only.";
      const doc = docRef.current;
      if (!doc) return "The project is still opening.";
      const result = createSharedFile(doc, name, "", language);
      return result.ok ? null : result.message;
    },
    renameFile: (from: string, to: string) => {
      if (!canEdit(roleRef.current)) return "This project is read-only.";
      const doc = docRef.current;
      if (!doc) return "The project is still opening.";
      const result = renameSharedFile(doc, from, to, language);
      return result.ok ? null : result.message;
    },
    deleteFile: (name: string) => {
      if (!canEdit(roleRef.current)) return "This project is read-only.";
      const doc = docRef.current;
      if (!doc) return "The project is still opening.";
      const result = deleteSharedFile(doc, name, language);
      return result.ok ? null : result.message;
    },
    uploadAsset: (name: string, base64: string) => {
      if (language !== "asm8086") return "Input files are supported in NASM projects.";
      if (!canEdit(roleRef.current)) return "This project is read-only.";
      if (!joinedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return "Reconnect before uploading input files.";
      const checked = inspectDosboxAssets({ ...readDosboxAssets(docRef.current!), [name]: { base64 } });
      if (!checked.ok) return checked.message;
      wsRef.current.send(JSON.stringify({ type: "asset-upload", name, base64 }));
      return null;
    },
    deleteAsset: (name: string) => {
      if (language !== "asm8086" || !canEdit(roleRef.current)) return "This project is read-only.";
      if (!joinedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return "Reconnect before removing input files.";
      wsRef.current.send(JSON.stringify({ type: "asset-delete", name }));
      return null;
    },
    setRunning,
    snapshot: () => {
      const doc = docRef.current;
      return doc ? readFiles(doc) : {};
    },
    snapshotAssets: () => docRef.current ? readDosboxAssets(docRef.current) : {},
  };
}
