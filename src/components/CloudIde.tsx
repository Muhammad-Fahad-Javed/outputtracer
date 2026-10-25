"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useActionState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { OnMount } from "@monaco-editor/react";
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileCode2, Files, Maximize2, Minimize2, Play, Plus, Share2, Square, Terminal, Trash2 } from "lucide-react";
import WorkspaceVisit from "@/components/WorkspaceVisit";
import { inviteToProject, deleteProject, removeProjectMember, renameProject, setMemberRole } from "@/lib/cloud/actions";
import { canEdit, type ProjectRole } from "@/lib/cloud/roles";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/lib/cloud/projectLanguage";
import { useProjectCollab } from "@/components/collab/useProjectCollab";
import { useDebuggerKeys } from "@/components/ide/VsChrome";
import { FileTabs } from "@/components/ide/FileTabs";
import DosboxFiles from "@/components/asm/DosboxFiles";
import { bytesToBase64 } from "@/lib/cloud/base64";
import { decodeDosboxAssets, type DosboxAssets } from "@/lib/dosboxAssets";
import DryRunTimeline from "@/components/DryRunTimeline";
import type { PredictionResult } from "@/types/predictor";

const CollabEditor = dynamic(() => import("@/components/collab/CollabEditor"), { ssr: false });
const ProgramConsole = dynamic(() => import("@/components/ProgramConsole"), { ssr: false });
const BrowserDosbox = dynamic(() => import("@/components/asm/BrowserDosbox"), { ssr: false });
const STANDARDS = ["c++11", "c++14", "c++17", "c++20", "c++23"];
const IDLE: PredictionResult = { status: "idle" };

export interface CloudMember { userId: string; name: string; email: string; role: ProjectRole; viaGroup?: boolean; }
export interface CloudInvite { email: string; role: string; }
export interface CloudIdeProps {
  id: string; title: string; language: ProjectLanguage; standard: string | null;
  groupName: string | null; members: CloudMember[]; invites: CloudInvite[];
  userId: string; displayName: string; initialFiles: Record<string, string>; initialAssets?: DosboxAssets;
}

type MenuName = "file" | "edit" | "project" | null;
type BottomMode = "console" | "trace";

export default function CloudIde(props: CloudIdeProps) {
  const router = useRouter();
  const initialRole = props.members.find(member => member.userId === props.userId)?.role ?? "viewer";
  const collab = useProjectCollab({ projectId: props.id, userId: props.userId, displayName: props.displayName,
    initialStandard: props.standard, initialRole, initialFiles: props.initialFiles,
    language: props.language, initialAssets: props.initialAssets });
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const panes = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuName>(null);
  const [title, setTitle] = useState(props.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(true);
  const [bottom, setBottom] = useState<BottomMode>("console");
  const [runRequest, setRunRequest] = useState(0);
  const [stopRequest, setStopRequest] = useState(0);
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("Ready");
  const [createRequest, setCreateRequest] = useState(0);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<PredictionResult>(IDLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [dosOutputs, setDosOutputs] = useState<Record<string, Uint8Array>>({});
  const [split, setSplit] = useState(70);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const role = collab.role;
  const editable = canEdit(role);
  const language = collab.language;
  const config = PROJECT_LANGUAGES[language];
  const closeMenu = () => setMenu(null);
  const canRun = collab.status === "live";
  const toolbarButton = "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1.5 text-xs text-[#ccc] hover:bg-[#303030] hover:text-white disabled:opacity-40";

  const runMine = useCallback(() => {
    if (!canRun) return;
    setBottom("console"); setOutputCollapsed(false); setRunRequest(n => n + 1); setMenu(null);
  }, [canRun]);
  const stopRun = useCallback(() => setStopRequest(n => n + 1), []);
  useDebuggerKeys(runMine, stopRun);
  const setCollabRunning = collab.setRunning;
  const onRunningChange = useCallback((value: boolean) => { setRunning(value); setCollabRunning(value); }, [setCollabRunning]);
  const predict = async () => {
    if (!canRun || language !== "cpp") return;
    setBottom("trace"); setOutputCollapsed(false); setResult({ status: "loading" }); closeMenu();
    try {
      const response = await fetch("/api/predict", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: props.id, stdin, standard: collab.standard, trace: true }) });
      setResult(await response.json());
    } catch { setResult({ status: "error", error: { title: "Connection error", message: "Could not reach the runner." } }); }
  };
  const rename = async () => {
    const next = window.prompt("Project name", title); closeMenu();
    if (!next || next.trim() === title) return;
    const state = await renameProject(props.id, next.trim());
    if (state?.error) setNotice(state.error);
    else { setTitle(next.trim()); router.refresh(); }
  };
  const addFile = () => { setFilesOpen(true); setCreateRequest(current => current + 1); closeMenu(); };
  const removeFile = (name = collab.activeFile) => {
    closeMenu(); if (!window.confirm(`Delete ${name}?`)) return;
    const error = collab.deleteFile(name); if (error) setNotice(error);
  };
  const download = async () => {
    closeMenu();
    try {
      const zip = new JSZip();
      Object.entries(collab.snapshot()).forEach(([name, content]) => zip.file(name, content));
      if (language === "asm8086") Object.entries(decodeDosboxAssets(collab.snapshotAssets())).forEach(([name, bytes]) => zip.file(`INPUT/${name}`, bytes));
      saveAs(await zip.generateAsync({ type: "blob" }), `${title.replace(/[^a-z0-9_-]/gi, "_") || "project"}.zip`);
    } catch { setNotice("Could not download this project. Try again."); }
  };
  const remove = async () => {
    closeMenu(); if (!window.confirm("Delete this project for everyone?")) return;
    const state = await deleteProject(props.id); if (state?.error) setNotice(state.error);
  };
  const fileAction = (error: string | null) => { if (error) throw new Error(error); };
  const savedLabel = collab.saved === "saving" ? "Saving…" : collab.status === "offline" || collab.saved === "local" ? "Saved on this device" : "Saved to cloud";

  return (
    <section data-surface="dark" className="flex h-dvh min-h-[420px] w-full flex-col overflow-hidden bg-[#1e1e1e] text-[#d4d4d4]" onClick={closeMenu}>
      <WorkspaceVisit kind="project" id={props.id} ready={collab.status === "live"} />
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[#333] bg-[#181818] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/projects" title="All projects" className="flex shrink-0 items-center gap-2 text-sm font-semibold text-white"><ArrowLeft size={15}/><span className="hidden sm:inline">OutputTracer</span></Link>
          <span className="mx-1 text-[#555]">/</span><h1 className="truncate text-xs font-medium text-[#ddd]">{title}</h1>
          <span title="Create a new project to use another language" className="shrink-0 rounded border border-[#3b3b3b] px-2 py-0.5 text-[10px] text-[#a8c7e8]">{config.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]">
          {collab.peers.slice(0, 3).map(peer => <button key={peer.clientId} title={`${peer.name}${peer.file ? ` · ${peer.file}` : ""}${peer.running ? " · running" : ""}`} onClick={() => { if (peer.file) collab.setActiveFile(peer.file); }} className="hidden rounded-full px-2 py-1 text-white sm:block" style={{ background: peer.color }}>{peer.name.split(" ")[0]}{peer.running ? " ▶" : ""}</button>)}
          {collab.peers.length > 3 && <span>+{collab.peers.length - 3}</span>}
          <span className="text-[#888]">{role}</span>
          <button className={toolbarButton} onClick={event => { event.stopPropagation(); setShareOpen(true); }}><Share2 size={13}/><span className="hidden sm:inline">Share</span></button>
        </div>
      </header>
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-[#333] bg-[#181818] px-2 py-1 text-xs">
        <MenuButton label="File" open={menu === "file"} onOpen={() => setMenu(menu === "file" ? null : "file")}>
          {editable && <MenuItem onClick={addFile}>New source file</MenuItem>}
          {editable && <MenuItem onClick={() => void rename()}>Rename project</MenuItem>}
          <MenuItem onClick={() => void download()}>Download project (.zip)</MenuItem>
          <Link href="/projects" className="block px-3 py-1.5 hover:bg-[#094771]">All projects</Link>
          {role === "owner" && <MenuItem onClick={() => void remove()}>Delete project</MenuItem>}
        </MenuButton>
        <MenuButton label="Edit" open={menu === "edit"} onOpen={() => setMenu(menu === "edit" ? null : "edit")}>
          <MenuItem onClick={() => { editorRef.current?.trigger("menu", "undo", null); closeMenu(); }}>Undo</MenuItem>
          <MenuItem onClick={() => { editorRef.current?.trigger("menu", "redo", null); closeMenu(); }}>Redo</MenuItem>
          {editable && <MenuItem onClick={() => removeFile()}>Delete current file</MenuItem>}
        </MenuButton>
        <span className="mx-1 h-5 w-px bg-[#333]"/>
        <button onClick={runMine} disabled={!canRun || running} title="Run shared snapshot in your private console (F5)" className="inline-flex items-center gap-1.5 rounded bg-[#287d37] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#319644] disabled:opacity-40"><Play size={13} fill="currentColor"/>Run<span className="hidden text-[10px] opacity-70 sm:inline">F5</span></button>
        <button onClick={stopRun} disabled={!running} className={toolbarButton}><Square size={12} className="text-red-400"/>Stop</button>
        <button onClick={() => setFilesOpen(value => !value)} aria-pressed={filesOpen} className={toolbarButton}><Files size={13}/>Files</button>
        {language === "cpp" && <><button onClick={() => void predict()} disabled={!canRun || result.status === "loading"} className={toolbarButton}>Trace</button><select aria-label="C++ standard" value={collab.standard || "c++17"} disabled={!editable || !canRun} onChange={event => collab.setStandard(event.target.value)} className="rounded border border-[#444] bg-[#222] px-2 py-1.5 text-xs text-[#ddd]">{STANDARDS.map(item => <option key={item}>{item}</option>)}</select></>}
        <button onClick={() => void download()} className={`${toolbarButton} hidden sm:inline-flex`}><Download size={13}/>Download</button>
        <span className="ml-auto hidden truncate pr-2 text-[11px] text-[#888] md:block">{props.groupName || "Personal project"} · {language === "asm8086" ? "Browser DOSBox" : "Private program console"}</span>
      </div>
      {(notice || collab.error) && <div role="alert" className="flex shrink-0 items-center justify-between bg-[#402020] px-3 py-2 text-xs text-red-200"><span>{collab.error || notice}</span>{notice && <button onClick={() => setNotice(null)} className="ml-3 underline">Dismiss</button>}</div>}
      {!editable && collab.status === "live" && <p className="shrink-0 border-b border-[#333] bg-[#242424] px-3 py-1 text-[11px] text-[#bbb]">View only · You can run the shared code in your private console.</p>}
      <div ref={panes} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0" style={{ flex: `${outputCollapsed ? 100 : split} 1 0%` }}>
          {filesOpen && <div className="w-32 shrink-0 sm:w-52">
            {language === "asm8086" ? <DosboxFiles sources={collab.snapshot()} assets={collab.assets} activeFile={collab.activeFile} onSelectSource={collab.setActiveFile} onCreateSource={name => fileAction(collab.createFile(name))} onDeleteSource={name => fileAction(collab.deleteFile(name))} onUploadAsset={(name, base64) => fileAction(collab.uploadAsset(name, base64))} onDeleteAsset={name => fileAction(collab.deleteAsset(name))} outputs={dosOutputs} onSaveOutputAsInput={(name, bytes) => fileAction(collab.uploadAsset(name, bytesToBase64(bytes)))} readOnly={!editable} uploadDisabled={!canRun}/>
              : <aside aria-label="Project files" className="flex h-full flex-col border-r border-[#333] bg-[#181818]">
                <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#333] px-3 text-[10px] font-semibold uppercase tracking-wider text-[#999]">Explorer{editable && <button className={toolbarButton} aria-label="New source file" onClick={addFile}><Plus size={13}/></button>}</div>
                <p className="truncate px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#bbb]">{title}</p>
                <div className="min-h-0 flex-1 overflow-auto">{collab.fileNames.map(name => <div key={name} className={`group flex items-center ${name === collab.activeFile ? "bg-[#303030]" : "hover:bg-[#242424]"}`}><button onClick={() => collab.setActiveFile(name)} className="flex min-w-0 flex-1 items-center gap-2 truncate px-3 py-2 text-left font-mono text-xs"><FileCode2 size={13} className={language === "python" ? "text-yellow-300" : "text-blue-300"}/><span className="truncate">{name}</span></button>{editable && collab.fileNames.length > 1 && name !== config.file && <button aria-label={`Delete ${name}`} onClick={() => removeFile(name)} className="mr-1 p-1 text-[#888] opacity-0 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 size={12}/></button>}</div>)}</div>
                <p className="border-t border-[#333] px-3 py-2 text-[10px] leading-relaxed text-[#888]">Source files are shared. Each person has a private console.</p>
              </aside>}
          </div>}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
            <div className="shrink-0 overflow-x-auto"><FileTabs names={collab.fileNames} active={collab.activeFile} canEdit={editable} createRequest={createRequest} onSelect={collab.setActiveFile} onCreate={collab.createFile} onRename={collab.renameFile} createPlaceholder={language === "asm8086" ? "HELPER.INC" : language === "python" ? "helper.py" : "helper.cpp"}/></div>
            <div className="min-h-0 flex-1">{collab.doc && collab.awareness ? <CollabEditor key={language} doc={collab.doc} awareness={collab.awareness} filename={collab.activeFile} language={config.monaco} readOnly={!editable} peers={collab.peers} onRunShortcut={runMine} onEditor={editor => { editorRef.current = editor; }}/>
              : <p className="p-4 font-mono text-xs text-[#999]">{collab.status === "offline" ? "Offline. Reconnect to open this project." : "Joining the project…"}</p>}</div>
          </div>
        </div>
        {!outputCollapsed && <div role="separator" aria-label="Resize editor and console" aria-orientation="horizontal" aria-valuenow={split} aria-valuemin={25} aria-valuemax={80} tabIndex={0} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setSplit(value => Math.max(25, Math.min(80, value + (event.key === "ArrowUp" ? -5 : 5)))); } }} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && panes.current) { const rect = panes.current.getBoundingClientRect(); setSplit(Math.max(25, Math.min(80, (event.clientY - rect.top) / rect.height * 100))); } }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} className="flex h-1.5 shrink-0 cursor-row-resize touch-none items-center justify-center bg-[#292929] hover:bg-[#007acc] focus:bg-[#007acc]"><span className="h-px w-10 bg-[#666]"/></div>}
        <div className="flex min-h-0 flex-col bg-[#101010]" style={{ flex: outputCollapsed ? "0 0 34px" : `${100 - split} 1 0%`, minHeight: outputCollapsed ? 34 : 180 }}>
          <div className="flex h-[34px] shrink-0 items-center justify-between border-y border-[#333] bg-[#181818]">
            <div className="flex h-full items-center gap-1 px-2"><button onClick={() => { setBottom("console"); setOutputCollapsed(false); }} className={`flex h-full items-center gap-2 border-b-2 px-3 text-xs ${bottom === "console" ? "border-blue-400 text-white" : "border-transparent text-[#888]"}`}><Terminal size={13}/>{language === "asm8086" ? "DOSBox console" : "Console"}</button>{language === "cpp" && <button onClick={() => { setBottom("trace"); setOutputCollapsed(false); }} className={`h-full border-b-2 px-3 text-xs ${bottom === "trace" ? "border-blue-400 text-white" : "border-transparent text-[#888]"}`}>Trace</button>}</div>
            <div className="flex items-center">
            <button aria-label={split === 25 ? "Restore editor proportions" : "Expand console area"} title={split === 25 ? "Restore 70 / 30 layout" : "Give the console more space"} onClick={() => { setOutputCollapsed(false); setSplit(value => value === 25 ? 70 : 25); }} className={toolbarButton}>{split === 25 ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}</button>
            <button aria-label={outputCollapsed ? "Expand console" : "Collapse console"} onClick={() => setOutputCollapsed(value => !value)} className={toolbarButton}>{outputCollapsed ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
            </div>
          </div>
          <div className={!outputCollapsed && bottom === "console" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            {language === "asm8086" ? <BrowserDosbox files={collab.snapshot()} assets={collab.assets} getFiles={collab.snapshot} getAssets={collab.snapshotAssets} runRequest={runRequest} stopRequest={stopRequest} canRun={canRun} onRunningChange={onRunningChange} onStatusChange={setRunStatus} onArtifactsChange={setDosOutputs}/>
              : <ProgramConsole language={language} files={{}} projectId={props.id} standard={collab.standard || undefined} runRequest={runRequest} stopRequest={stopRequest} canRun={canRun} onRunningChange={onRunningChange} onStatusChange={setRunStatus} privateRun/>}
          </div>
          {!outputCollapsed && bottom === "trace" && language === "cpp" && <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div className="flex w-full shrink-0 flex-col border-b border-[#333] sm:w-1/3 sm:min-w-[160px] sm:border-b-0 sm:border-r"><div className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#999]">Input for this trace</div><textarea aria-label="Trace standard input" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="Optional program input" className="min-h-14 flex-1 resize-none bg-[#111] px-3 py-2 font-mono text-xs text-[#ddd] outline-none placeholder:text-[#777]"/></div>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3">{result.status === "idle" && <p className="text-xs text-[#888]">Enter optional input, then click Trace to inspect a C++ run.</p>}{result.status === "loading" && <p className="text-xs text-blue-300">Tracing…</p>}{result.output && <pre className="whitespace-pre-wrap font-mono text-xs text-[#ddd]">{result.output}</pre>}{result.stderr && <pre className="whitespace-pre-wrap font-mono text-xs text-red-300">{result.stderr}</pre>}{result.error && <p className="text-xs text-red-300">{result.error.title}: {result.error.message}</p>}{(result.dryRun ?? []).length > 0 && <DryRunTimeline steps={result.dryRun ?? []} truncated={result.traceTruncated} note={result.traceNote}/>}</div>
          </div>}
        </div>
      </div>
      <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-[#333] bg-[#181818] px-3 text-[10px] text-[#aaa]"><span className="flex min-w-0 items-center gap-2 truncate"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${collab.status === "live" ? "bg-green-400" : "bg-amber-400"}`}/>{running ? runStatus : collab.status === "live" ? "Connected" : collab.status === "connecting" ? "Connecting…" : "Offline"}<span className="hidden sm:inline">· {savedLabel}</span></span><span className="flex shrink-0 gap-3"><span>{language === "cpp" ? collab.standard : config.label}</span><span className="hidden sm:inline">{collab.activeFile}</span><span>{collab.peers.length + 1} here</span></span></footer>
      {shareOpen && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={() => setShareOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label={`Share ${title}`} className="h-full w-full max-w-md overflow-auto bg-[#252526] p-5 text-[#D4D4D4]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-[15px] font-semibold text-white">Share {title}</h2>
              <button type="button" onClick={() => setShareOpen(false)} className="px-2 py-1 text-[12px] hover:bg-[#3E3E42]">Close</button>
            </div>
            <p className="mt-2 text-[12px] text-[#858585]">Editors type in the same files. Everyone gets their own Run.</p>
            {role === "owner" && <InviteForm projectId={props.id} />}
            <ul className="mt-5 space-y-3">
              {props.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate text-white">{member.name}</p>
                    <p className="truncate text-[11px] text-[#858585]">{member.email}</p>
                  </div>
                  {role === "owner" && member.role !== "owner" && !member.viaGroup ? (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={member.role}
                        onChange={(e) => {
                          void setMemberRole(props.id, member.userId, e.target.value).then(() => router.refresh());
                        }}
                        className="bg-[#3C3C3C] px-1 py-0.5 text-[12px]"
                      >
                        <option value="owner">owner</option>
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button
                        type="button"
                        className="text-[12px] text-[#F48771]"
                        onClick={() => {
                          void removeProjectMember(props.id, member.userId).then(() => router.refresh());
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="text-[12px] text-[#858585]">{member.viaGroup ? `${member.role} · group` : member.role}</span>
                  )}
                </li>
              ))}
            </ul>
            {props.invites.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] uppercase tracking-wide text-[#858585]">Waiting for signup</p>
                <ul className="mt-2 space-y-1 text-[12px]">
                  {props.invites.map((invite) => (
                    <li key={invite.email}>{invite.email} · {invite.role}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(inviteToProject, null);
  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="email" type="email" required placeholder="student@school.edu" className="w-full bg-[#3C3C3C] px-2 py-1.5 text-[13px] outline-none" />
      <div className="flex gap-2">
        <select name="role" defaultValue="editor" className="bg-[#3C3C3C] px-2 py-1.5 text-[13px]">
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button type="submit" disabled={pending} className="bg-[#007ACC] px-3 py-1.5 text-[13px] text-white disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="text-[12px] text-[#F48771]">{state.error}</p>}
      {state?.notice && <p className="text-[12px] text-[#98C379]">{state.notice}</p>}
    </form>
  );
}

function MenuButton({
  label,
  open,
  onOpen,
  children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 min-w-48 border border-[#454545] bg-[#252526] py-1 shadow-none" onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-3 py-1.5 text-left hover:bg-[#094771]">
      {children}
    </button>
  );
}
