"use client";

import { useEffect, useState, useRef } from "react";
import DosTerminal from "@/components/asm/DosTerminal";
import dynamic from "next/dynamic";
import { Play, Send, ArrowLeft, Download, FileCode, Terminal, BookOpen, Users, CheckCheck, Save, Square, Cpu } from "lucide-react";
import WorkspaceVisit from "@/components/WorkspaceVisit";
import Link from "next/link";
import { CLASSROOM_LANGUAGES, classroomLanguage } from "@/lib/classroom/languages";
import type { ClassroomAssignment } from "@/lib/classroom/types";
import type { AsmExecutionStatus } from "@/lib/asm/types";

const CollabEditor = dynamic(() => import("@/components/collab/CollabEditor"), { ssr: false });
import { canEdit } from "@/lib/cloud/roles";
import { useClassroomCollab } from "./useClassroomCollab";

interface SubmissionView {
  id: string;
  status: string;
  codeFiles: Record<string, string>;
  submittedAt?: string;
  isLate?: boolean;
  grade?: number | null;
  feedback?: string | null;
  gradedAt?: string | null;
}

export default function AssignmentWorkspace({
  classId,
  assignmentId,
  allowLate,
  previewStudent = false,
  assignment,
}: {
  classId: string;
  assignmentId: string;
  allowLate: boolean;
  previewStudent?: boolean;
  assignment?: ClassroomAssignment;
}) {
  const collab = useClassroomCollab({
    classId,
    assignmentId,
    previewStudent,
    enabled: true,
  });
  const language = classroomLanguage(assignment?.language);
  const config = CLASSROOM_LANGUAGES[language];
  const [tab, setTab] = useState("output");
  const [stdin, setStdin] = useState("");
  const [teamRoster,setTeamRoster]=useState<{name:string;members:{userId:string;displayName?:string}[]}|null>(null);
  const [teamError,setTeamError]=useState('');
  useEffect(()=>{
    if(tab!=='team'||!collab.groupMode||!collab.groupId)return;
    let active=true;
    const load=async()=>{try{const r=await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/teams`);const d=await r.json();if(!r.ok||!d.success)throw Error('Could not load your team roster.');const group=d.groups?.find((g:{id:string})=>g.id===collab.groupId);if(active){setTeamRoster(group?{name:group.name,members:group.members||[]}:null);setTeamError(group?'':'Your team is no longer available.');}}catch{if(active)setTeamError('Could not load your team roster.');}};
    void load();const refresh=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
    return()=>{active=false;clearInterval(refresh);};
  },[tab,collab.groupMode,collab.groupId,classId,assignmentId]);
  const [terminal,setTerminal]=useState<AsmExecutionStatus|null>(null);
  const [terminalBusy,setTerminalBusy]=useState(false);
  const [terminalError,setTerminalError]=useState<string|null>(null);
  const terminalRef=useRef<{sessionId:string;sessionToken:string;sourceRevision:string}|null>(null);
  const [currentInputPolicy,setCurrentInputPolicy]=useState(assignment?.inputPolicy||'paste_allowed');
  useEffect(()=>{const t=setInterval(()=>{if(document.visibilityState==='visible')void fetch(`/api/classroom/${classId}/assignments/${assignmentId}`).then(r=>r.json()).then(d=>{if(d.assignment)setCurrentInputPolicy(d.assignment.inputPolicy||'paste_allowed');}).catch(()=>{});},15000);return()=>clearInterval(t);},[classId,assignmentId]);
  useEffect(()=>()=>{if(terminalRef.current)void fetch(`/api/classroom/${classId}/assignments/${assignmentId}/interactive`,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop',...terminalRef.current})});},[classId,assignmentId]);
  const [machine, setMachine] = useState<AsmExecutionStatus | null>(null);
  const [split, setSplit] = useState(70);
  const [outputCollapsed,setOutputCollapsed]=useState(false);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{try{const saved=Number(localStorage.getItem('assignment-editor-split'));if(saved>=20&&saved<=80)setSplit(saved);}catch{}});return()=>cancelAnimationFrame(frame);},[]);
  const saveSplit=(value:number)=>{setSplit(value);try{localStorage.setItem('assignment-editor-split',String(value));}catch{}};
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const controller = useRef<AbortController | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const editorSubscription = useRef<{ dispose(): void } | null>(null);
  useEffect(() => () => { controller.current?.abort(); editorSubscription.current?.dispose(); }, []);
  const [submission, setSubmission] = useState<SubmissionView | null>(null);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  useEffect(() => {
    if (previewStudent) return;
    let cancelled = false;
    fetch(`/api/classroom/${classId}/assignments/${assignmentId}/mine`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !data.submission) return;
        setSubmission(data.submission);
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: "err", text: "Could not load your previous submission." });
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, classId, previewStudent]);

  const editable = canEdit(collab.role) && !collab.frozen;
  const canRun = editable && collab.allowRun;

  const interactive = async(action:string,input?:string)=>{setTerminalBusy(true);setTerminalError(null);if(action==='start')setTab('dosbox');try{const r=await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/interactive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input,...terminalRef.current,groupId:collab.groupId,studentId:collab.studentId})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error+(d.diagnostics?' '+d.diagnostics.map((x:{message:string})=>x.message).join('; '):''));if(action==='stop'){terminalRef.current=null;setTerminal(null);}else{terminalRef.current={sessionId:d.sessionId,sessionToken:d.sessionToken,sourceRevision:d.sourceRevision};setTerminal(d.status);setMachine(d.status);}}catch(e){setTerminalError(e instanceof Error?e.message:'Execution failed.');}finally{setTerminalBusy(false);}};
  const runPublicTests = async () => {
    if (!canRun) return;
    setBusy("run");
    setTab("output");
    controller.current = new AbortController();
    setNotice(null);
    setRunOutput(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/execute`, {
        method: "POST",
        signal: controller.current?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runTests: true,
          stdin,
          groupId: collab.groupId,
          previewStudent,
        }),
      });
      const data = await res.json();
      setMachine(data.machine ?? null);
      if (!res.ok || data.success === false) {
        setNotice({ tone: "err", text: data.error || "The program could not be run." });
        return;
      }
      const tests = Array.isArray(data.testResults)
        ? data.testResults
            .map((test: { name?: string; passed?: boolean; actualOutput?: string }) =>
              `${test.passed ? "PASS" : "FAIL"} ${test.name || "test"}${test.actualOutput ? `: ${test.actualOutput}` : ""}`
            )
            .join("\n")
        : "";
      const output = [data.compilationError, data.stderr, data.output, tests, `Program finished · exit code ${data.exitCode ?? "unknown"}`].filter(Boolean).join("\n");
      setRunOutput(output || "(no output)");
      setNotice({
        tone: data.compilationError || data.timedOut ? "err" : "ok",
        text: data.timedOut
          ? "The program hit the time limit. That is not stored as a wrong answer."
          : data.compilationError
            ? "The program did not compile."
            : "Run finished.",
      });
    } catch {
      setNotice({ tone: "err", text: "Network error while running your code." });
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!editable) return;
    setBusy("submit");
    setNotice(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stdin,
          groupId: collab.groupId,
          previewStudent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotice({ tone: "err", text: data.error || "Submission was not saved." });
        return;
      }
      setSubmission({
        id: data.submissionId,
        status: "submitted",
        codeFiles: collab.snapshot(),
        submittedAt: new Date().toISOString(),
        isLate: data.isLate,
        grade: submission?.grade,
        feedback: submission?.feedback,
      });
      setNotice({
        tone: "ok",
        text: data.isLate
          ? "Submitted after the deadline. Late work is allowed for this assignment."
          : "Submission saved. Your teacher can grade this version.",
      });
    } catch {
      setNotice({ tone: "err", text: "Network error while submitting." });
    } finally {
      setBusy(null);
    }
  };


  const download = () => {
    const files = collab.snapshot();
    const blob = new Blob([files[collab.activeFile] || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = collab.activeFile; a.click();
    URL.revokeObjectURL(url);
  };
  const save = async () => {
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/versions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: collab.groupId, previewStudent }),
      });
      const data = await res.json();
      setNotice({ tone: res.ok && data.success ? "ok" : "err", text: res.ok && data.success ? "Version saved." : data.error || "Could not save version." });
    } catch { setNotice({ tone: "err", text: "Could not save version." }); }
  };
  const tabs = [
    { id: "output", label: "Output", icon: Terminal },
    { id: "input", label: "Input", icon: FileCode },
    { id: "instructions", label: "Instructions", icon: BookOpen },
    { id: "tests", label: "Tests", icon: CheckCheck },
    { id: "team", label: "Collaborators", icon: Users },
    ...(language === "asm8086" ? [{id:"dosbox",label:"DOS terminal",icon:Terminal},{ id: "registers", label: "Registers & flags", icon: Cpu }] : []),
  ];
  const toolbar = "inline-flex shrink-0 items-center gap-2 rounded px-3 py-1.5 text-xs text-[#ccc] hover:bg-[#303030] disabled:opacity-40";
  return (
    <div data-surface="dark" ref={surface} className="flex h-full min-h-[500px] flex-col overflow-hidden bg-[#1e1e1e] text-[#ccc]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-[#333] bg-[#181818] px-3 text-xs">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/classroom/${classId}`} className="flex shrink-0 items-center gap-1.5 text-[#ccc] hover:text-white"><ArrowLeft size={14} /> Classroom</Link>
          <span className="text-[#555]">/</span><h1 className="truncate font-semibold text-white">{assignment?.title || "Assignment workspace"}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3"><span className="hidden sm:inline">{collab.groupMode ? "Shared group workspace" : "Individual workspace"}</span><span className="text-[#89d185]">{collab.status === "live" ? "● Live" : collab.status}</span></div>
      </div>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#333] bg-[#181818] px-3 py-2">
        <span className="mr-1 text-[11px] font-semibold uppercase text-[#888]">Language:</span>
        <span className="mr-2 min-w-32 rounded border border-[#444] bg-[#111] px-3 py-1.5 text-xs text-white">{config.label}</span>
        <button onClick={() => void (language === "asm8086" ? interactive("start") : runPublicTests())} disabled={!canRun || busy !== null || terminalBusy || collab.status !== "live"} className="inline-flex shrink-0 items-center gap-2 rounded bg-[#238636] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><Play size={13} fill="currentColor" /> {busy === "run" ? "Running…" : language === "asm8086" ? "Assemble & Run" : "Run & Test"}</button>
        {language === "asm8086" && <button className={toolbar} disabled={!canRun||busy!==null||terminalBusy} onClick={()=>void runPublicTests()}>Run public tests</button>}
        {busy === "run" && <button className={toolbar} onClick={() => { controller.current?.abort(); setBusy(null); }}><Square size={12} className="text-red-400" /> Stop waiting</button>}
        <button onClick={download} className={toolbar} disabled={!collab.doc}><Download size={14} /> Download</button>
        <button onClick={() => void save()} className={toolbar} disabled={!editable || collab.status !== "live"}><Save size={14} /> Save version</button>
        <div className="flex-1" />
        <button onClick={submit} disabled={!editable || busy !== null || collab.status !== "live"} className="inline-flex shrink-0 items-center gap-2 rounded border border-[#007acc] bg-[#0e639c] px-3 py-1.5 text-xs text-white disabled:opacity-40"><Send size={13} /> {busy === "submit" ? "Submitting…" : submission ? "Resubmit" : "Submit assignment"}</button>
      </div>
      {(notice || collab.frozen || collab.error) && <div role="status" className={`shrink-0 border-b border-[#333] px-4 py-2 text-xs ${notice?.tone === "err" || collab.error ? "bg-[#402020] text-red-200" : "bg-[#233026] text-[#b5cea8]"}`}>{collab.error || collab.freezeReason || notice?.text}</div>}
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-[#333] bg-[#181818]">
        {collab.fileNames.map(name => <button key={name} onClick={() => collab.setActiveFile(name)} className={`flex shrink-0 items-center gap-2 border-r border-[#333] px-4 font-mono text-xs ${name === collab.activeFile ? "border-t border-t-white bg-[#1e1e1e] text-white" : "text-[#888]"}`}><FileCode size={13} />{name}</button>)}
      </div>
      <div className="min-h-0" style={{ flex: `${outputCollapsed?100:split} 1 0%` }}>
        {collab.doc && collab.awareness ? <CollabEditor doc={collab.doc} awareness={collab.awareness} filename={collab.activeFile} language={config.monaco} readOnly={!editable} inputPolicy={currentInputPolicy} onPasteCode={characterCount=>{void fetch(`/api/classroom/${classId}/assignments/${assignmentId}/paste-events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:collab.activeFile,characterCount})}).then(r=>{if(!r.ok)setNotice({tone:"err",text:"Paste was inserted, but its activity log could not be saved. Please tell your teacher."});}).catch(()=>setNotice({tone:"err",text:"Paste activity log could not be saved. Please tell your teacher."}));}} peers={collab.peers} onRunShortcut={() => { if (canRun && !busy) void (language==="asm8086"?interactive("start"):runPublicTests()); }} onEditor={editor => { editorSubscription.current?.dispose(); editorSubscription.current = editor.onDidChangeCursorPosition(event => setCursor(event.position)); }} /> : <div className="flex h-full items-center justify-center p-6 font-mono text-sm text-[#999]">{collab.error || "Connecting to the assignment…"}</div>}
      </div>
      <div role="separator" aria-label="Resize editor and output" aria-orientation="horizontal" tabIndex={0} onKeyDown={e => { if (e.key === "ArrowUp") saveSplit(Math.max(20,split-5)); if (e.key === "ArrowDown") saveSplit(Math.min(80,split+5)); }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId) && surface.current) { const r = surface.current.getBoundingClientRect(); saveSplit(Math.max(20,Math.min(80,(e.clientY-r.top-120)/(r.height-160)*100))); } }} className="flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center border-y border-[#303030] bg-[#181818] hover:bg-[#007acc]"><span className="h-px w-10 bg-[#555]" /></div>
      <div className="flex min-h-0 flex-col bg-[#111]" style={{ flex: outputCollapsed?"0 0 40px":`${100-split} 1 0%` }}>
        <div className="flex h-10 shrink-0 overflow-x-auto border-b border-[#333] bg-[#181818]">
          <button className="shrink-0 px-3 text-[#ccc]" onClick={()=>setOutputCollapsed(v=>!v)}>{outputCollapsed?"Expand output":"Collapse output"}</button>{tabs.map(t => <button key={t.id} onClick={() => {setTab(t.id);setOutputCollapsed(false);}} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 text-xs ${tab === t.id ? "border-white text-white" : "border-transparent text-[#888] hover:text-[#ccc]"}`}><t.icon size={14}/>{t.label}</button>)}
        </div>
        <div className={`min-h-0 flex-1 overflow-auto p-4 text-xs ${outputCollapsed?"hidden":""}`}>
          {tab === "output" && <pre className="whitespace-pre-wrap font-mono leading-6">{runOutput || "Run your program to see output and public test results."}{submission?.feedback && `\n\nTeacher feedback:\n${submission.feedback}`}</pre>}
          {tab === "dosbox" && <DosTerminal status={terminal} busy={terminalBusy} error={terminalError} privateRun onInput={text=>interactive("input",text)} onStart={canRun?()=>void interactive("start"):undefined} onReset={canRun?()=>void interactive("start"):undefined} onStop={()=>void interactive("stop")}/>}
          {tab === "input" && <div className="flex h-full min-h-24 flex-col gap-2"><label htmlFor="assignment-stdin" className="text-[#999]">Standard input is sent when you run the program.</label><textarea id="assignment-stdin" value={stdin} onChange={e => setStdin(e.target.value)} className="min-h-20 flex-1 resize-none rounded border border-[#444] bg-[#1e1e1e] p-3 font-mono text-[#ddd] outline-none focus:border-[#007acc]" placeholder="Enter program input here…" /></div>}
          {tab === "instructions" && <div className="max-w-3xl space-y-3"><h2 className="text-base font-semibold text-white">{assignment?.title}</h2><p className="whitespace-pre-wrap leading-6">{assignment?.description || "No additional instructions provided."}</p><p className="text-[#888]">{assignment?.maxPoints} points · {assignment?.dueDate ? `Due ${new Date(assignment.dueDate).toLocaleString()}` : "No deadline"} · {allowLate ? "Late submissions allowed" : "Late submissions closed"}</p></div>}
          {tab === "tests" && <div className="space-y-4">{assignment?.publicTestCases?.length ? assignment.publicTestCases.map(t => <div key={t.id} className="border-b border-[#333] pb-3"><h3 className="mb-2 font-semibold text-white">{t.name} · {t.points} pts</h3><div className="grid grid-cols-2 gap-4"><div><p className="mb-1 text-[#888]">Input</p><pre className="whitespace-pre-wrap">{t.stdin || "(empty)"}</pre></div><div><p className="mb-1 text-[#888]">Expected output</p><pre className="whitespace-pre-wrap">{t.expectedOutput || "(empty)"}</pre></div></div></div>) : <p className="text-[#999]">No public tests configured.</p>}<p className="text-[#888]">Hidden grading tests are evaluated by your teacher and are never shared with students.</p></div>}
          {tab === "team" && <div className="space-y-3">{collab.groupMode&&<><h3 className="font-semibold">{teamRoster?.name||"Your assignment team"}</h3>{teamError&&<p role="alert" className="text-red-300">{teamError}</p>}{teamRoster?.members.map(member=><p key={member.userId}>{member.displayName||"Student"}</p>)}<h3 className="border-t border-[#333] pt-3 font-semibold">Live collaborators</h3></>}<p>{collab.displayName} · you</p>{collab.peers.map(p => <p key={p.clientId} className="flex items-center gap-2"><span style={{backgroundColor:p.color}} className="h-2 w-2 rounded-full" />{p.name} {p.file ? `· ${p.file}` : ""}</p>)}<p className="text-[#888]">{collab.groupMode ? "Group members share live code, named cursors, and selections." : "This is an individual assignment."}</p></div>}
          {tab === "registers" && (machine ? <div className="space-y-4"><div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{Object.entries(machine.registers).map(([key,value]) => <div key={key} className="border border-[#333] p-2 font-mono"><span className="uppercase text-[#888]">{key}</span><p className="mt-1 text-[#b5cea8]">{value.toString(16).padStart(4,"0").toUpperCase()}</p></div>)}</div><div className="flex flex-wrap gap-4 font-mono">{Object.entries(machine.flags).map(([key,value]) => <span key={key} className={value ? "text-[#b5cea8]" : "text-[#777]"}>{key.toUpperCase()} {value ? "1" : "0"}</span>)}</div></div> : <p className="text-[#999]">Assemble and run to inspect the final CPU state.</p>)}
        </div>
      </div>
      <WorkspaceVisit kind="assignment" id={assignmentId} ready={collab.status==="live" && !previewStudent}/>
      <footer className="flex h-6 shrink-0 items-center justify-between gap-3 overflow-hidden border-t border-[#333] bg-[#181818] px-3 font-mono text-[11px] text-[#aaa]"><span className="truncate">{collab.status === "live" ? "● Synchronized" : collab.status} · {submission ? `${submission.status}${submission.isLate ? " · late" : ""}` : "Not submitted"}</span><span className="shrink-0">Ln {cursor.lineNumber}, Col {cursor.column} · {currentInputPolicy === "typing_only" ? "Typing only" : "Paste allowed (logged)"} · {config.label} · {collab.activeFile}</span></footer>
    </div>
  );
}
