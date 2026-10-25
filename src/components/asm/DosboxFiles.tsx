"use client";

import { useId, useRef, useState } from "react";
import { Download, FileCode2, FileInput, FileOutput, Plus, Save, Trash2, Upload } from "lucide-react";
import { bytesToBase64 } from "@/lib/cloud/base64";
import { DOSBOX_ASSET_LIMITS, decodeDosboxAssets, dosboxAssetBytes, inspectDosboxAssets, normalizeDosboxAssetName, type DosboxAssets } from "@/lib/dosboxAssets";
import { isValidSourceFilename } from "@/lib/sourceFiles";

export interface DosboxFilesProps {
  sources: Record<string, string>;
  assets: DosboxAssets;
  activeFile: string;
  onSelectSource: (name: string) => void;
  onCreateSource?: (name: string) => void | Promise<void>;
  onDeleteSource?: (name: string) => void | Promise<void>;
  onUploadAsset?: (name: string, base64: string) => void | Promise<void>;
  onDeleteAsset?: (name: string) => void | Promise<void>;
  onSaveOutputAsInput?: (name: string, bytes: Uint8Array) => void | Promise<void>;
  outputs?: Record<string, Uint8Array>;
  readOnly?: boolean;
  uploadDisabled?: boolean;
  shared?: boolean;
}

function sizeLabel(bytes: number) { return bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`; }

function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DosboxFiles({ sources, assets, activeFile, onSelectSource, onCreateSource, onDeleteSource, onUploadAsset, onDeleteAsset, onSaveOutputAsInput, outputs = {}, readOnly = false, uploadDisabled = false, shared = true }: DosboxFilesProps) {
  const [error, setError] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const id = useId();
  const mutable = !readOnly;
  const button = "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed";
  const section = "flex items-center gap-1.5 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400";

  async function action(callback: () => void | Promise<void>) {
    setError(null);
    try { await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this file."); }
  }

  async function saveOutput(name: string, bytes: Uint8Array) {
    await action(async () => {
      // Runtime exports retain their OUTPUT/ prefix; input assets use a flat DOS drive.
      const canonical = normalizeDosboxAssetName(name.replace(/\\/g, "/").split("/").pop() || "");
      if (Object.hasOwn(assets, canonical)) throw new Error(`${canonical} already exists in input. Remove it before saving a replacement.`);
      const checked = inspectDosboxAssets({ ...assets, [canonical]: { base64: bytesToBase64(bytes) } });
      if (!checked.ok) throw new Error(checked.message);
      await onSaveOutputAsInput?.(canonical, bytes);
    });
  }

  async function downloadProject() {
    setDownloading(true);
    await action(async () => {
      const inputs = decodeDosboxAssets(assets);
      for (const [name, source] of Object.entries(sources)) {
        if (!isValidSourceFilename(name, "asm8086") || typeof source !== "string") throw new Error("The project contains an invalid source filename.");
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [name, source] of Object.entries(sources)) zip.file(name, source);
      for (const [name, bytes] of Object.entries(inputs)) zip.file(`INPUT/${name}`, bytes);
      // Private output is deliberately downloaded separately, never mixed into saved source.
      download("outputtracer-dos-project.zip", await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    });
    setDownloading(false);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !onUploadAsset || !mutable || uploadDisabled) return;
    setError(null); setUploading(true);
    try {
      const next = { ...assets };
      const pending: Array<[string, string]> = [];
      for (const file of Array.from(files)) {
        const name = normalizeDosboxAssetName(file.name);
        if (Object.hasOwn(next, name)) throw new Error(`${name} already exists. Remove it before uploading a replacement.`);
        if (file.size > DOSBOX_ASSET_LIMITS.maxFileBytes) throw new Error("Each input file must be 256 KB or smaller.");
        const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
        next[name] = { base64 };
        const result = inspectDosboxAssets(next);
        if (!result.ok) throw new Error(result.message);
        pending.push([name, base64]);
      }
      for (const [name, base64] of pending) await onUploadAsset(name, base64);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the selected files."); }
    finally { setUploading(false); if (upload.current) upload.current.value = ""; }
  }

  async function createSource() {
    const name = (newFile || "").trim();
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,7}\.(asm|inc)$/i.test(name)) { setError("Use a DOS 8.3 source name, for example HELPER.INC."); return; }
    if (Object.keys(sources).some((existing) => existing.toUpperCase() === name.toUpperCase())) { setError("That source file already exists."); return; }
    await action(async () => { await onCreateSource?.(name); setNewFile(null); });
  }

  return <aside aria-label="DOS project files" className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-700 bg-[#181818] text-zinc-200">
    <div className="flex min-h-10 items-center justify-between gap-1 border-b border-zinc-700 px-3">
      <span className="text-xs font-semibold uppercase tracking-wide">Files</span>
      <div className="flex">
        <button type="button" className={button} title="Create an empty source file" aria-label="New source file" disabled={!mutable || !onCreateSource} onClick={() => setNewFile("")}><Plus size={14} /></button>
        <button type="button" className={button} title={`Upload ${shared ? "shared" : "project"} input data`} aria-label="Upload input files" disabled={!mutable || !onUploadAsset || uploadDisabled || uploading} onClick={() => upload.current?.click()}><Upload size={14} /></button>
      </div>
      <input ref={upload} id={id} aria-label="Choose input data files" type="file" multiple hidden onChange={(event) => void uploadFiles(event.target.files)} />
    </div>
    <div className="min-h-0 flex-1 overflow-auto pb-3">
      {newFile !== null && <form className="space-y-1 border-b border-zinc-700 p-2" onSubmit={(event) => { event.preventDefault(); void createSource(); }}>
        <input aria-label="Source filename" autoFocus value={newFile} onChange={(event) => setNewFile(event.target.value)} placeholder="HELPER.INC" className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-2 focus:outline-blue-400" />
        <button type="submit" className={button}>Create</button><button type="button" className={button} onClick={() => setNewFile(null)}>Cancel</button>
      </form>}
      <div className={section}><FileCode2 size={12} /> Source · {shared ? "shared" : "project"}</div>
      {Object.keys(sources).sort().map((name) => <div key={name} className={`group flex items-center pr-1 ${activeFile === name ? "bg-zinc-700/70" : "hover:bg-zinc-800"}`}>
        <button type="button" className="min-w-0 flex-1 truncate py-1.5 pl-5 pr-1 text-left font-mono text-xs focus-visible:outline-2 focus-visible:outline-blue-400" onClick={() => onSelectSource(name)} title={name}>{name}</button>
        {mutable && onDeleteSource && Object.keys(sources).length > 1 && !/^main\.asm$/i.test(name) && <button type="button" className={button} aria-label={`Delete source ${name}`} onClick={() => void action(() => onDeleteSource(name))}><Trash2 size={12} /></button>}
      </div>)}
      <div className={section}><FileInput size={12} /> Input · {shared ? "shared" : "project"}</div>
      {Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)).map(([name, asset]) => <div key={name} className="flex items-center gap-1 py-1 pl-5 pr-1 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono" title={name}>{name}</span><span className="text-[10px] text-zinc-500">{sizeLabel(dosboxAssetBytes(asset.base64))}</span>
        <button type="button" className={button} aria-label={`Download input ${name}`} onClick={() => void action(() => download(name, decodeDosboxAssets({ [name]: asset })[name]))}><Download size={12} /></button>
        {mutable && onDeleteAsset && <button type="button" className={button} aria-label={`Delete input ${name}`} onClick={() => void action(() => onDeleteAsset(name))}><Trash2 size={12} /></button>}
      </div>)}
      {!Object.keys(assets).length && <p className="px-5 py-1 text-xs text-zinc-500">Upload sample data here.</p>}
      <div className={section}><FileOutput size={12} /> Output · this run only</div>
      {Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => <div key={name} className="flex items-center gap-1 py-1 pl-5 pr-1 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono" title={name}>{name}</span><span className="text-[10px] text-zinc-500">{sizeLabel(bytes.length)}</span>
        <button type="button" className={button} aria-label={`Download output ${name}`} onClick={() => download(name, bytes)}><Download size={12} /></button>
        {mutable && onSaveOutputAsInput && <button type="button" className={button} disabled={uploadDisabled} title="Save this output as a project input file" aria-label={`Save output ${name} to input`} onClick={() => void saveOutput(name, bytes)}><Save size={12} /></button>}
      </div>)}
      {!Object.keys(outputs).length && <p className="px-5 py-1 text-xs text-zinc-500">Program-created files appear here.</p>}
    </div>
    <div className="border-t border-zinc-700 px-2 py-1.5">
      <button type="button" className={`${button} w-full justify-center`} disabled={downloading} onClick={() => void downloadProject()}><Download size={13} />{downloading ? "Preparing download…" : "Download project (.zip)"}</button>
    </div>
    {error && <p role="alert" className="border-t border-red-900/50 px-3 py-2 text-xs text-red-300">{error}</p>}
    <p className="border-t border-zinc-700 px-3 py-2 text-[10px] leading-relaxed text-zinc-400">DOS 8.3 names · 16 inputs · 256 KB each · 1 MB total. Edit code in the {shared ? "shared " : ""}editor. Outputs are private and are not saved automatically.</p>
  </aside>;
}
