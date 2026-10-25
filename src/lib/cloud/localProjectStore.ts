import { isProjectLanguage, type ProjectLanguage } from "./projectLanguage";

export interface LocalProjectRecord {
  projectId: string;
  stateB64: string;
  standard: string;
  language?: ProjectLanguage;
  savedAt: number;
  syncedAt: number | null;
  boot: "yjs" | "seed";
}

const DB_NAME = "outputtracer";
const STORE = "projects";
const LS_PREFIX = "outputtracer:project:";

export function pickNewer(
  left: LocalProjectRecord | null,
  right: LocalProjectRecord | null
): LocalProjectRecord | null {
  if (!left) return right;
  if (!right) return left;
  return left.savedAt >= right.savedAt ? left : right;
}

export function needsCloudSync(record: LocalProjectRecord): boolean {
  return record.syncedAt === null || record.savedAt > record.syncedAt;
}

export function parseLocalProject(value: unknown): LocalProjectRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LocalProjectRecord>;
  if (typeof row.projectId !== "string" || typeof row.stateB64 !== "string" || !row.stateB64) {
    return null;
  }
  if (typeof row.savedAt !== "number" || !Number.isFinite(row.savedAt)) return null;
  return {
    projectId: row.projectId,
    stateB64: row.stateB64,
    language: isProjectLanguage(row.language) ? row.language : "cpp",
    standard: typeof row.standard === "string" && row.standard ? row.standard : "c++17",
    savedAt: row.savedAt,
    syncedAt: typeof row.syncedAt === "number" ? row.syncedAt : null,
    boot: row.boot === "yjs" ? "yjs" : "seed",
  };
}

function storageKey(projectId: string): string {
  return `${LS_PREFIX}${projectId}`;
}

export function readLocalSnapshotSync(projectId: string): LocalProjectRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return parseLocalProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalSnapshotSync(record: LocalProjectRecord): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(record.projectId), JSON.stringify(record));
  } catch {
    // The browser can refuse the write when storage is full. IndexedDB is the other copy.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdb(projectId: string): Promise<LocalProjectRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(projectId);
    request.onsuccess = () => resolve(parseLocalProject(request.result));
    request.onerror = () => reject(request.error);
  });
}

async function writeIdb(record: LocalProjectRecord): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record);
  });
}

export async function readLocalSnapshot(projectId: string): Promise<LocalProjectRecord | null> {
  const fromBrowser = readLocalSnapshotSync(projectId);
  try {
    const fromDb = await readIdb(projectId);
    return pickNewer(fromBrowser, fromDb);
  } catch {
    return fromBrowser;
  }
}

export async function writeLocalSnapshot(record: LocalProjectRecord): Promise<void> {
  writeLocalSnapshotSync(record);
  try {
    await writeIdb(record);
  } catch {
    // localStorage already has the latest copy.
  }
}
