"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import WorkspaceVisit from "@/components/WorkspaceVisit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { OnMount } from "@monaco-editor/react";
import {
  inviteToProject,
  deleteProject,
  removeProjectMember,
  renameProject,
  setMemberRole,
} from "@/lib/cloud/actions";
import type { ProjectRole } from "@/lib/cloud/roles";
import { canEdit } from "@/lib/cloud/roles";
import CollabEditor from "@/components/collab/CollabEditor";
import { useProjectCollab } from "@/components/collab/useProjectCollab";
import InteractiveTerminal from "@/components/InteractiveTerminal";
import DryRunTimeline from "@/components/DryRunTimeline";
import {
  DebuggerControls,
  OutputTabs,
  debugStatusLabel,
  useDebuggerKeys,
} from "@/components/ide/VsChrome";
import { FileTabs } from "@/components/ide/FileTabs";
import type { PredictionResult } from "@/types/predictor";

const STANDARDS = ["c++11", "c++14", "c++17", "c++20", "c++23"];
const IDLE: PredictionResult = { status: "idle" };

export interface CloudMember {
  userId: string;
  name: string;
  email: string;
  role: ProjectRole;
  viaGroup?: boolean;
}

export interface CloudInvite {
  email: string;
  role: string;
}

export interface CloudIdeProps {
  id: string;
  title: string;
  standard: string;
  groupName: string | null;
  members: CloudMember[];
  invites: CloudInvite[];
  userId: string;
  displayName: string;
  initialFiles: Record<string, string>;
}

type MenuName = "file" | "edit" | "view" | "project" | "build" | "debug" | null;
type BottomMode = "terminal" | "trace";

export default function CloudIde(props: CloudIdeProps) {
  const router = useRouter();
  const initialRole = props.members.find((member) => member.userId === props.userId)?.role ?? "viewer";
  const collab = useProjectCollab({
    projectId: props.id,
    userId: props.userId,
    displayName: props.displayName,
    initialStandard: props.standard,
    initialRole,
    initialFiles: props.initialFiles,
  });
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [menu, setMenu] = useState<MenuName>(null);
  const [title, setTitle] = useState(props.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [bottom, setBottom] = useState<BottomMode>("terminal");
  const [runRequest, setRunRequest] = useState(0);
  const [stopRequest, setStopRequest] = useState(0);
  const [debugStatus, setDebugStatus] = useState("idle");
  const [createRequest, setCreateRequest] = useState(0);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<PredictionResult>(IDLE);
  const [notice, setNotice] = useState<string | null>(null);

  const role = collab.role;
  const editable = canEdit(role);
  const closeMenu = () => setMenu(null);

  const runMine = useCallback(() => {
    setBottom("terminal");
    setRunRequest((n) => n + 1);
    setMenu(null);
  }, []);
  const stopDebug = useCallback(() => {
    setStopRequest((n) => n + 1);
  }, []);
  const debugging = debugStatus === "connecting" || debugStatus === "compiling" || debugStatus === "running";
  useDebuggerKeys(runMine, stopDebug);

  const predict = async () => {
    setBottom("trace");
    setResult({ status: "loading" });
    closeMenu();
    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: props.id,
          stdin,
          standard: collab.standard,
        }),
      });
      setResult(await response.json());
    } catch {
      setResult({
        status: "error",
        error: { title: "Connection error", message: "Could not reach the runner." },
      });
    }
  };

  const rename = async () => {
    const next = window.prompt("Project name", title);
    closeMenu();
    if (!next || next.trim() === title) return;
    const state = await renameProject(props.id, next.trim());
    if (state?.error) setNotice(state.error);
    else {
      setTitle(next.trim());
      router.refresh();
    }
  };

  const addFile = () => {
    setCreateRequest((current) => current + 1);
  };

  const removeFile = () => {
    closeMenu();
    if (!window.confirm(`Delete ${collab.activeFile}?`)) return;
    collab.deleteFile(collab.activeFile);
  };

  const download = async () => {
    closeMenu();
    const zip = new JSZip();
    Object.entries(collab.snapshot()).forEach(([name, content]) => zip.file(name, content));
    saveAs(await zip.generateAsync({ type: "blob" }), `${title.replace(/\s+/g, "_")}.zip`);
  };

  const remove = async () => {
    closeMenu();
    if (!window.confirm("Delete this project for everyone?")) return;
    const state = await deleteProject(props.id);
    if (state?.error) setNotice(state.error);
  };

  return (
    <section data-surface="dark" className="flex h-screen w-screen flex-col bg-[#2D2D30] text-[#D4D4D4]" onClick={closeMenu}>
      <WorkspaceVisit kind="project" id={props.id} ready={collab.status==="live"}/>
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-[#333333] bg-[#2D2D30] px-2 text-[12px] text-[#F1F1F1]">
        <div className="flex items-center gap-1">
          <Link href="/projects" className="rounded-[2px] px-2 py-0.5 font-semibold hover:bg-[#3E3E42]" onClick={(e) => e.stopPropagation()}>
            OutputTracer
          </Link>
          <MenuButton label="File" open={menu === "file"} onOpen={() => setMenu(menu === "file" ? null : "file")}>
            <MenuItem onClick={() => void rename()}>Rename project</MenuItem>
            <MenuItem onClick={() => void download()}>Download project</MenuItem>
            <MenuItem onClick={() => { setShareOpen(true); closeMenu(); }}>Share</MenuItem>
            <Link href="/projects" className="block px-3 py-1.5 text-left hover:bg-[#094771]" onClick={(e) => e.stopPropagation()}>All projects</Link>
            {role === "owner" && <MenuItem onClick={() => void remove()}>Delete project</MenuItem>}
          </MenuButton>
          <MenuButton label="Edit" open={menu === "edit"} onOpen={() => setMenu(menu === "edit" ? null : "edit")}>
            <MenuItem onClick={() => { editorRef.current?.trigger("menu", "undo", null); closeMenu(); }}>Undo</MenuItem>
            <MenuItem onClick={() => { editorRef.current?.trigger("menu", "redo", null); closeMenu(); }}>Redo</MenuItem>
          </MenuButton>
          <MenuButton label="View" open={menu === "view"} onOpen={() => setMenu(menu === "view" ? null : "view")}>
            <MenuItem onClick={() => { setBottom("terminal"); closeMenu(); }}>Debug</MenuItem>
            <MenuItem onClick={() => { setBottom("trace"); closeMenu(); }}>Trace output</MenuItem>
          </MenuButton>
          <MenuButton label="Project" open={menu === "project"} onOpen={() => setMenu(menu === "project" ? null : "project")}>
            {editable && <MenuItem onClick={addFile}>Add file</MenuItem>}
            {editable && <MenuItem onClick={removeFile}>Delete current file</MenuItem>}
            <MenuItem onClick={() => { setShareOpen(true); closeMenu(); }}>Members</MenuItem>
            <div className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
              <label className="block text-[10px] uppercase tracking-wide text-[#858585]">Standard</label>
              <select
                value={collab.standard}
                disabled={!editable}
                onChange={(e) => collab.setStandard(e.target.value)}
                className="mt-1 w-full bg-[#3C3C3C] px-1 py-0.5 text-[12px]"
              >
                {STANDARDS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </MenuButton>
          <MenuButton label="Debug" open={menu === "debug"} onOpen={() => setMenu(menu === "debug" ? null : "debug")}>
            <MenuItem onClick={runMine}>Local Windows Debugger</MenuItem>
            <MenuItem onClick={() => void predict()}>Trace</MenuItem>
          </MenuButton>
        </div>
        <div className="flex items-center gap-2 pr-2">
          {collab.peers.map((peer) => (
            <button
              key={peer.clientId}
              type="button"
              title={peer.file ? `${peer.name} · ${peer.file}` : peer.name}
              onClick={(e) => {
                e.stopPropagation();
                if (peer.file) collab.setActiveFile(peer.file);
              }}
              className="rounded-full px-2 py-0.5 text-[11px] text-white"
              style={{ background: peer.color }}
            >
              {peer.name.split(" ")[0]}
              {peer.running ? " · running" : ""}
            </button>
          ))}
          <span className="text-[11px] text-[#BBBBBB]">{role}</span>
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[#333333] bg-[#2D2D30] px-2 text-[12px]">
        <DebuggerControls running={debugging} onStart={runMine} onStop={stopDebug} />
        <div className="h-4 w-px bg-[#4D4D50]" />
        <button type="button" onClick={() => void predict()} className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]" title="Show each step">
          Trace
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShareOpen(true); }} className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">
          Share
        </button>
        <div className="min-w-0 flex-1 truncate px-2 text-[#F1F1F1]">
          {title}
          {props.groupName ? <span className="ml-2 text-[#858585]">{props.groupName}</span> : null}
        </div>
      </div>

      {notice && <p className="bg-[#3A2A1A] px-3 py-1 text-[12px] text-[#E5C07B]">{notice}</p>}
      {collab.error && <p className="bg-[#3A1A1A] px-3 py-1 text-[12px] text-[#F48771]">{collab.error}</p>}
      {!editable && collab.status === "live" && (
        <p className="bg-[#1E1E1E] px-3 py-1 text-[12px] text-[#858585]">View only. You can run the shared code in your own terminal.</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-[#1E1E1E]">
          <FileTabs
            names={collab.fileNames}
            active={collab.activeFile}
            canEdit={editable}
            createRequest={createRequest}
            onSelect={collab.setActiveFile}
            onCreate={collab.createFile}
            onRename={collab.renameFile}
          />
          <div className="min-h-0 flex-1">
            {collab.doc && collab.awareness ? (
              <CollabEditor
                doc={collab.doc}
                awareness={collab.awareness}
                filename={collab.activeFile}
                readOnly={!editable}
                peers={collab.peers}
                onRunShortcut={runMine}
                onEditor={(editor) => { editorRef.current = editor; }}
              />
            ) : (
              <p className="p-4 font-mono text-[12px] text-[#858585]">
                {collab.status === "offline" ? "Offline." : "Joining the project…"}
              </p>
            )}
          </div>
        </div>

        <div className="flex h-72 shrink-0 flex-col border-t border-[#333333] bg-[#1E1E1E]">
          <OutputTabs
            value={bottom === "terminal" ? "debug" : "trace"}
            onChange={(value) => setBottom(value === "debug" ? "terminal" : "trace")}
          />
          <div className={bottom === "terminal" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <InteractiveTerminal
              files={{}}
              projectId={props.id}
              standard={collab.standard}
              runRequest={runRequest}
              stopRequest={stopRequest}
              showControls={false}
              onRunningChange={collab.setRunning}
              onStatusChange={setDebugStatus}
            />
          </div>
          {bottom === "trace" && (
            <div className="flex min-h-0 flex-1">
              <div className="flex w-1/3 min-w-[180px] flex-col border-r border-[#333333]">
                <div className="border-b border-[#333333] px-3 py-1 text-[11px] font-semibold">My input</div>
                <textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  placeholder="stdin for this trace only"
                  className="min-h-0 flex-1 resize-none bg-[#1E1E1E] p-3 font-mono text-[13px] text-[#D4D4D4] outline-none"
                />
              </div>
              <div className="min-w-0 flex-1 overflow-auto p-3">
                {result.status === "idle" && <p className="font-mono text-[12px] text-[#555]">Paste input here, then press Trace. Local Windows Debugger runs in the Debug tab.</p>}
                {result.status === "loading" && <p className="font-mono text-[12px] text-[#007ACC]">Tracing…</p>}
                {result.output && <pre className="whitespace-pre-wrap font-mono text-[13px] text-[#D4D4D4]">{result.output}</pre>}
                {result.stderr && <pre className="whitespace-pre-wrap font-mono text-[13px] text-[#F48771]">{result.stderr}</pre>}
                {result.error && <p className="mt-2 font-mono text-[12px] text-[#F48771]">{result.error.title}: {result.error.message}</p>}
                {(result.dryRun ?? []).length > 0 && (
                  <div className="mt-4 border-t border-[#333333] pt-3">
                    <DryRunTimeline
                      steps={result.dryRun ?? []}
                      truncated={result.traceTruncated}
                      note={result.traceNote}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex h-6 shrink-0 items-center justify-between bg-[#007ACC] px-3 text-[11px] text-white">
        <span>{debugging || debugStatus === "error" ? debugStatusLabel(debugStatus) : collab.status === "live" ? "Ready" : collab.status === "connecting" ? "Connecting" : "Offline"}</span>
        <span className="flex gap-4">
          <span>
            {collab.saved === "saving"
              ? "Saving…"
              : collab.status === "offline" || collab.saved === "local"
                ? "Saved on this device"
                : "Saved to cloud"}
          </span>
          <span>{collab.standard}</span>
          <span>{collab.activeFile}</span>
          <span>{collab.peers.length + 1} here</span>
        </span>
      </footer>

      {shareOpen && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/40" onClick={() => setShareOpen(false)}>
          <aside className="h-full w-full max-w-md overflow-auto bg-[#252526] p-5 text-[#D4D4D4]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-white">Share {title}</h2>
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
