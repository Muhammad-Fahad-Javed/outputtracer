import type * as Y from "yjs";
import { base64ToBytes } from "@/lib/cloud/base64";

/** Input data only. Source files remain in the shared editor's `files` map. */
export type DosboxAssets = Record<string, { base64: string }>;
export const DOSBOX_ASSET_LIMITS = { maxFiles: 16, maxFileBytes: 256 * 1024, maxTotalBytes: 1024 * 1024 } as const;
const DOS_NAME = /^[A-Z0-9_][A-Z0-9_-]{0,7}(?:\.[A-Z0-9_][A-Z0-9_-]{0,2})?$/;
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/;
const BLOCKED_EXTENSION = /\.(?:ASM|INC|COM|EXE|BAT|CMD|SYS|DLL|OBJ|O|CPP|CC|CXX|H|HPP|PY)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function normalizeDosboxAssetName(name: string): string { return name.trim().toUpperCase(); }

export function isDosboxAssetName(name: string): boolean {
  return typeof name === "string" && DOS_NAME.test(name) && !RESERVED.test(name) && !BLOCKED_EXTENSION.test(name);
}

export function dosboxAssetBytes(base64: string): number {
  return base64.length / 4 * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

export function inspectDosboxAssets(value: unknown): { ok: true; totalBytes: number } | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "Invalid input files." };
  const entries = Object.entries(value);
  if (entries.length > DOSBOX_ASSET_LIMITS.maxFiles) return { ok: false, message: "Upload at most 16 input files." };
  let totalBytes = 0;
  for (const [name, asset] of entries) {
    if (!isDosboxAssetName(name)) return { ok: false, message: "Input files need DOS 8.3 names (for example SAMPLE.BIN). Source and executable uploads are not permitted." };
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || Object.keys(asset).length !== 1 || typeof asset.base64 !== "string" || !BASE64.test(asset.base64)) return { ok: false, message: `Invalid file data for ${name}.` };
    const size = dosboxAssetBytes(asset.base64);
    if (size > DOSBOX_ASSET_LIMITS.maxFileBytes) return { ok: false, message: "Each input file must be 256 KB or smaller." };
    totalBytes += size;
  }
  if (totalBytes > DOSBOX_ASSET_LIMITS.maxTotalBytes) return { ok: false, message: "Input files must total 1 MB or less." };
  return { ok: true, totalBytes };
}

export function readDosboxAssets(doc: Y.Doc): DosboxAssets {
  const result: DosboxAssets = Object.create(null);
  doc.getMap<{ base64: string }>("dosAssets").forEach((asset, name) => { result[name] = asset; });
  return inspectDosboxAssets(result).ok ? result : {};
}

export function decodeDosboxAssets(assets: DosboxAssets): Record<string, Uint8Array> {
  const checked = inspectDosboxAssets(assets);
  if (!checked.ok) throw new Error(checked.message);
  return Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, base64ToBytes(asset.base64)]));
}

/** Generic Yjs updates may edit code, but assets must use server-validated commands. */
export function sameDosboxAssets(before: Y.Doc, after: Y.Doc): boolean {
  const a = before.getMap("dosAssets");
  const b = after.getMap("dosAssets");
  if (a.size !== b.size) return false;
  for (const [key, value] of a.entries()) if (JSON.stringify(value) !== JSON.stringify(b.get(key))) return false;
  return true;
}
