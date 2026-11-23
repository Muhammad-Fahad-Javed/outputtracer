import { base64ToBytes, bytesToBase64 } from "@/lib/cloud/base64";

export type LocalEdit = { update: Uint8Array; key?: string };
let lastEditTime = 0;
let sequence = 0;

// Classroom code never shares a recovery namespace with another account or team.
export function classroomDraftPrefix(actorId: string, docKey: string): string {
  return `ot-classroom-draft:v1:${encodeURIComponent(actorId)}:${encodeURIComponent(docKey)}:`;
}

export function saveLocalEdit(storage: Storage, prefix: string, update: Uint8Array): LocalEdit {
  const now = Math.max(Date.now(), lastEditTime);
  sequence = now === lastEditTime ? sequence + 1 : 0;
  lastEditTime = now;
  const key = `${prefix}${String(now).padStart(16, "0")}:${String(sequence).padStart(8, "0")}:${crypto.randomUUID()}`;
  storage.setItem(key, bytesToBase64(update));
  return { key, update };
}

export function restoreLocalEdits(storage: Storage, prefix: string): LocalEdit[] {
  const keys = new Set<string>();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.add(key);
  }
  return [...keys].sort().flatMap(key => {
    const value = storage.getItem(key);
    return value ? [{ key, update: base64ToBytes(value) }] : [];
  });
}
