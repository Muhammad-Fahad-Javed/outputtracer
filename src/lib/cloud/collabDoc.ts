import * as Y from "yjs";
import { execConfig } from "@/lib/execConfig";
import { inspectSourceFiles, isValidSourceFilename } from "@/lib/sourceFiles";
import { base64ToBytes, bytesToBase64 } from "./base64";

export function fileMap(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap("files");
}

export function readFiles(doc: Y.Doc): Record<string, string> {
  const out: Record<string, string> = {};
  fileMap(doc).forEach((value, key) => {
    if (value instanceof Y.Text) out[key] = value.toString();
  });
  return out;
}

export function seedDoc(doc: Y.Doc, files: Record<string, string>): void {
  if (fileMap(doc).size > 0) return;
  doc.transact(() => {
    const map = fileMap(doc);
    for (const [name, content] of Object.entries(files)) {
      if (!isValidSourceFilename(name)) continue;
      const text = new Y.Text();
      if (content) text.insert(0, content);
      map.set(name, text);
    }
  });
}

export function encodeDoc(doc: Y.Doc): string {
  return bytesToBase64(Y.encodeStateAsUpdate(doc));
}

export function applyEncoded(doc: Y.Doc, encoded: string, origin?: unknown): void {
  Y.applyUpdate(doc, base64ToBytes(encoded), origin);
}

export function createFile(
  doc: Y.Doc,
  name: string,
  content: string
): { ok: true } | { ok: false; message: string } {
  if (!isValidSourceFilename(name)) {
    return { ok: false, message: "Use a simple name like main.cpp or helper.h." };
  }
  const map = fileMap(doc);
  if (map.has(name)) return { ok: false, message: "That file already exists." };

  const next = { ...readFiles(doc), [name]: content };
  const inspected = inspectSourceFiles(next, {
    maxFiles: execConfig.maxSourceFiles,
    maxSourceBytes: execConfig.maxSourceBytes,
  });
  if (!inspected.ok) return { ok: false, message: inspected.message };

  doc.transact(() => {
    const text = new Y.Text();
    if (content) text.insert(0, content);
    map.set(name, text);
  });
  return { ok: true };
}

export function deleteFile(
  doc: Y.Doc,
  name: string
): { ok: true } | { ok: false; message: string } {
  const map = fileMap(doc);
  if (!map.has(name)) return { ok: false, message: "File not found." };
  const next = readFiles(doc);
  delete next[name];
  const inspected = inspectSourceFiles(next, {
    maxFiles: execConfig.maxSourceFiles,
    maxSourceBytes: execConfig.maxSourceBytes,
  });
  if (!inspected.ok) return { ok: false, message: inspected.message };
  doc.transact(() => {
    map.delete(name);
  });
  return { ok: true };
}

export function renameFile(
  doc: Y.Doc,
  from: string,
  to: string
): { ok: true } | { ok: false; message: string } {
  const nextName = to.trim();
  if (from === nextName) return { ok: true };
  if (!isValidSourceFilename(nextName)) {
    return { ok: false, message: "Use a simple name like main.cpp or helper.h." };
  }
  const map = fileMap(doc);
  const current = map.get(from);
  if (!(current instanceof Y.Text)) return { ok: false, message: "File not found." };
  if (map.has(nextName)) return { ok: false, message: "That file already exists." };

  const text = current.toString();
  const next = readFiles(doc);
  delete next[from];
  next[nextName] = text;
  const inspected = inspectSourceFiles(next, {
    maxFiles: execConfig.maxSourceFiles,
    maxSourceBytes: execConfig.maxSourceBytes,
  });
  if (!inspected.ok) return { ok: false, message: inspected.message };

  doc.transact(() => {
    const renamed = new Y.Text();
    if (text) renamed.insert(0, text);
    map.set(nextName, renamed);
    map.delete(from);
  });
  return { ok: true };
}
