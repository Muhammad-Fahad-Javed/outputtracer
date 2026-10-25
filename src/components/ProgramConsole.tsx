"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {Check, Copy, Download, Eraser, Play, Square, Terminal} from "lucide-react";
import {getSupabaseBrowser} from "@/lib/supabase/browser";

export interface ClassroomConsoleScope {
  classId: string;
  assignmentId: string;
  groupId?: string;
  studentId?: string;
}

interface Props {
  language: "cpp" | "python";
  files: Record<string, string>;
  projectId?: string;
  standard?: string;
  classroom?: ClassroomConsoleScope;
  runRequest?: number;
  stopRequest?: number;
  initialStdin?: string;
  onRunningChange?: (running: boolean) => void;
  onOutputChange?: (output: string) => void;
  onStatusChange?: (status: string) => void;
  canRun?: boolean;
  privateRun?: boolean;
}

type Status = "idle" | "connecting" | "compiling" | "running" | "finished" | "stopped" | "error";
type Entry = {id: number; kind: "stdout" | "stderr" | "input" | "system"; text: string};
const OUTPUT_LIMIT = 256 * 1024;

/** Program stdin/stdout only. Code always executes in the server's isolated runtime. */
export default function ProgramConsole(props: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [inputClosed, setInputClosed] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef(props);
  const output = useRef("");
  const sequence = useRef(0);
  const completed = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const inputField = useRef<HTMLTextAreaElement>(null);
  const followOutput = useRef(true);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  useEffect(() => {latest.current = props;}, [props]);

  const changeStatus = useCallback((next: Status) => {
    setStatus(next);
    latest.current.onStatusChange?.(next);
    latest.current.onRunningChange?.(["connecting", "compiling", "running"].includes(next));
  }, []);

  const append = useCallback((kind: Entry["kind"], text: string) => {
    if (!text) return;
    const entry = {id: ++sequence.current, kind, text};
    setEntries(rows => {
      const next = [...rows, entry];
      let size = next.reduce((sum, row) => sum + row.text.length, 0);
      while (size > OUTPUT_LIMIT && next.length > 1) size -= next.shift()!.text.length;
      return next;
    });
    output.current = (output.current + text).slice(-OUTPUT_LIMIT);
    latest.current.onOutputChange?.(output.current);
  }, []);

  useEffect(() => {
    if (followOutput.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [entries]);
  useEffect(() => {
    if (status === "running" && !inputClosed) inputField.current?.focus({preventScroll:true});
  }, [status, inputClosed]);

  const disconnect = useCallback(() => {
    const ws = socket.current;
    socket.current = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type: "stop"}));
    ws.close();
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const clear = useCallback(() => {
    setEntries([]);
    output.current = "";
    latest.current.onOutputChange?.("");
  }, []);

  const start = useCallback(async () => {
    const current = latest.current;
    if (current.canRun === false) return;
    disconnect();
    completed.current = false;
    setInput("");
    setInputClosed(false);
    setExitCode(null);
    clear();
    changeStatus("connecting");
    followOutput.current = true;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal`);
    socket.current = ws;

    ws.onopen = () => {void (async () => {
      try {
        const client = await getSupabaseBrowser();
        const token = (await client?.auth.getSession())?.data.session?.access_token;
        if (socket.current !== ws || ws.readyState !== WebSocket.OPEN) return;
        if (current.classroom && !token) throw Error("Sign in again to run this assignment.");
        if (current.projectId && !token) throw Error("Sign in again to run this saved project.");
        if (current.language === "python" && !token) throw Error("Sign in to run Python in the console.");
        ws.send(JSON.stringify({
          language: current.language,
          ...(current.classroom ? {classroom: current.classroom} : current.projectId ? {projectId: current.projectId} : {files: current.files}),
          ...(current.language === "cpp" && current.standard ? {standard: current.standard} : {}),
          ...(token ? {accessToken: token} : {}),
        }));
      } catch (error) {
        if (socket.current !== ws) return;
        completed.current = true;
        append("stderr", `${error instanceof Error ? error.message : "Could not start the console."}\n`);
        changeStatus("error");
        ws.close();
      }
    })();};

    ws.onmessage = event => {
      if (socket.current !== ws) return;
      let message: {type?: string;data?: string;code?: number | null;signal?: string;compileTimeMs?: number};
      try {message = JSON.parse(String(event.data));} catch {return;}
      switch (message.type) {
        case "compile_start": changeStatus("compiling"); break;
        case "compile_success": break;
        case "ready":
          changeStatus("running");
          inputField.current?.focus({preventScroll: true});
          if (current.initialStdin) {
            const text = current.initialStdin.endsWith("\n") ? current.initialStdin : `${current.initialStdin}\n`;
            ws.send(JSON.stringify({type: "stdin", data: text}));
            append("input", text);
          }
          break;
        case "stdout": append("stdout", message.data || ""); break;
        case "stderr": append("stderr", message.data || ""); break;
        case "exit":
          completed.current = true;
          setExitCode(typeof message.code === "number" ? message.code : null);
          append("system", `\nProgram finished · ${message.signal ? `signal ${message.signal}` : `exit code ${message.code ?? "unavailable"}`}\n`);
          changeStatus(message.code === 0 ? "finished" : "error");
          break;
        case "compile_error":
        case "error":
        case "timeout":
        case "output_limit":
          completed.current = true;
          append("stderr", `${message.data || "The program could not finish."}\n`);
          changeStatus("error");
          break;
      }
    };
    ws.onerror = () => {
      if (socket.current !== ws || completed.current) return;
      completed.current = true;
      append("stderr", "Console connection failed. Check your connection and try again.\n");
      changeStatus("error");
    };
    ws.onclose = () => {
      if (socket.current !== ws) return;
      socket.current = null;
      if (!completed.current) {
        completed.current = true;
        append("stderr", "The console connection closed before the program finished. Run again to restart.\n");
        changeStatus("error");
      }
    };
  }, [append, changeStatus, clear, disconnect]);

  const stop = useCallback(() => {
    if (!socket.current) return;
    completed.current = true;
    disconnect();
    append("system", "\nProgram stopped.\n");
    changeStatus("stopped");
  }, [append, changeStatus, disconnect]);

  const startRef = useRef(start);
  const stopRef = useRef(stop);
  useEffect(() => {startRef.current = start;stopRef.current = stop;}, [start, stop]);
  useEffect(() => {if (props.runRequest) void startRef.current();}, [props.runRequest]);
  useEffect(() => {if (props.stopRequest) stopRef.current();}, [props.stopRequest]);
  useEffect(() => {if (props.canRun === false) stopRef.current();}, [props.canRun]);

  const send = () => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || status !== "running" || inputClosed) return;
    if (new TextEncoder().encode(input + "\n").byteLength > 8192) {
      append("system", "Input exceeds the 8 KB message limit. Send a smaller amount.\n");
      return;
    }
    ws.send(JSON.stringify({type: "stdin", data: input + "\n"}));
    append("input", input + "\n");
    history.current.push(input);
    historyIndex.current = history.current.length;
    setInput("");
    followOutput.current = true;
    inputField.current?.focus();
  };
  const eof = () => {
    if (socket.current?.readyState !== WebSocket.OPEN || status !== "running" || inputClosed) return;
    socket.current.send(JSON.stringify({type: "eof"}));
    setInputClosed(true);
    append("system", "\nStandard input closed (EOF).\n");
  };
  const active = ["connecting", "compiling", "running"].includes(status);
  const label = {idle:"Ready",connecting:"Connecting",compiling:props.language === "python" ? "Starting Python" : "Compiling",running:"Running · input open",finished:"Finished",stopped:"Stopped",error:"Error"}[status];
  const button = "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[11px] text-[#bbb] hover:bg-[#303030] hover:text-white disabled:opacity-40";

  return <section data-surface="dark" aria-label={`${props.language === "cpp" ? "C++" : "Python"} console`} className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#101010] text-[#ddd]">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#161616] px-3 py-1.5">
      <div className="flex items-center gap-2 text-xs"><Terminal size={14} className="text-[#89d185]"/><span className="font-medium text-[#eee]">{props.language === "cpp" ? "C++" : "Python 3"}</span><span className="text-[#777]">{props.privateRun ? "Your private console" : "Program console"}</span><span role="status" className={`rounded px-2 py-0.5 text-[10px] ${status === "error" ? "bg-red-950 text-red-300" : active ? "bg-[#203526] text-[#a4dbad]" : "bg-[#242424] text-[#aaa]"}`}>{inputClosed && status === "running" ? "Running · stdin closed" : label}{exitCode !== null ? ` · ${exitCode}` : ""}</span></div>
      <div className="flex items-center gap-1">
        <button className={button} onClick={() => void start()} disabled={props.canRun === false || active} title="Start a fresh run"><Play size={12}/>{status === "idle" ? "Run" : "Run again"}</button>
        <button className={button} onClick={stop} disabled={!active} title="Stop execution (Ctrl+C)"><Square size={12} className="text-red-300"/>Stop</button>
        <button className={button} onClick={clear} title="Clear displayed output (Ctrl+L)"><Eraser size={12}/>Clear</button>
        <button aria-label="Copy console output" className={button} onClick={() => void navigator.clipboard.writeText(output.current).then(() => {setCopied(true);setTimeout(() => setCopied(false),1500);}).catch(() => append("system", "Copy is unavailable. Use Download instead.\n"))}>{copied ? <Check size={12}/> : <Copy size={12}/>}</button>
        <button aria-label="Download console output" className={button} onClick={() => {const url=URL.createObjectURL(new Blob([output.current],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${props.language}-console.txt`;a.click();URL.revokeObjectURL(url);}}><Download size={12}/></button>
      </div>
    </div>
    <div ref={scroll} role="log" aria-label="Program console output" aria-live="polite" aria-relevant="additions text" onScroll={() => {const el=scroll.current;if(el)followOutput.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-6 selection:bg-[#264f78]">
      {entries.length ? <pre className="whitespace-pre-wrap break-words font-[inherit]">{entries.map(entry => <span key={entry.id} className={entry.kind === "stderr" ? "text-[#f5a0a0]" : entry.kind === "input" ? "text-[#9cdcfe]" : entry.kind === "system" ? "text-[#999]" : "text-[#ddd]"}>{entry.text}</span>)}</pre> : <p className="text-[#777]">Run your program. Output appears here; enter input below while it is running.</p>}
    </div>
    <form onSubmit={event => {event.preventDefault();send();}} className="flex shrink-0 items-center gap-2 border-t border-[#303030] bg-[#161616] px-3 py-2">
      <span aria-hidden="true" className="font-mono text-[#89d185]">❯</span>
      <textarea ref={inputField} aria-label="Console input" value={input} onChange={event => setInput(event.target.value)} rows={1} spellCheck={false} autoComplete="off" disabled={status !== "running" || inputClosed} placeholder={status === "running" ? "Program input · Enter to send, Shift+Enter for a new line" : "Run the program to enter input"} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.ctrlKey && event.key.toLowerCase() === "c") {event.preventDefault();stop();}
        else if (event.ctrlKey && event.key.toLowerCase() === "d") {event.preventDefault();eof();}
        else if (event.ctrlKey && event.key.toLowerCase() === "l") {event.preventDefault();clear();}
        else if (event.key === "Enter" && !event.shiftKey) {event.preventDefault();send();}
        else if (event.key === "ArrowUp" && !input.includes("\n") && history.current.length) {event.preventDefault();historyIndex.current=Math.max(0,historyIndex.current-1);setInput(history.current[historyIndex.current] || "");}
        else if (event.key === "ArrowDown" && !input.includes("\n")) {event.preventDefault();historyIndex.current=Math.min(history.current.length,historyIndex.current+1);setInput(history.current[historyIndex.current] || "");}
      }} className="max-h-24 min-h-7 min-w-0 flex-1 resize-y bg-transparent py-1 font-mono text-xs text-[#eee] outline-none placeholder:text-[#777] disabled:opacity-50"/>
      <button type="button" onClick={eof} disabled={status !== "running" || inputClosed} title="Close standard input so programs reading until EOF can finish" className={button}>EOF</button>
      <button type="submit" disabled={status !== "running" || inputClosed} className="rounded border border-[#444] bg-[#242424] px-3 py-1 text-xs text-[#ddd] hover:bg-[#333] disabled:opacity-40">Send ↵</button>
    </form>
  </section>;
}
