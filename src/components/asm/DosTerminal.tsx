"use client";

import {useEffect, useId, useRef, useState} from "react";
import {Check, Copy, Download, Eraser, Play, RotateCcw, Square, Terminal} from "lucide-react";
import type {AsmExecutionStatus} from "@/lib/asm/types";

interface Props {
  status?: AsmExecutionStatus | null;
  busy: boolean;
  error?: string | null;
  onInput: (text: string) => Promise<void>;
  onStart?: () => void;
  onStop?: () => void;
  onReset?: () => void;
  privateRun?: boolean;
}

export default function DosTerminal({status, busy, error, onInput, onStart, onStop, onReset, privateRun = false}: Props) {
  const [line, setLine] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cleared, setCleared] = useState({offset: 0, stdout: "", step: 0});
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  const pending = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stdout = status?.stdout || "";
  const step = status?.currentStep || 0;
  const waiting = status?.state === "waiting_for_input";
  const mode = status?.inputRequest;
  const unavailable = !waiting || busy || sending;
  const resetOutput = cleared.offset > 0 && (status?.state === "ready" || step < cleared.step || stdout.length < cleared.stdout.length || !stdout.startsWith(cleared.stdout));
  // A reset or a fresh run starts a new display, without changing emulated CPU output.
  if (resetOutput) setCleared({offset: 0, stdout: "", step: 0});
  const visibleOutput = stdout.slice(resetOutput ? 0 : cleared.offset);
  const active = busy || status?.state === "running" || waiting || status?.state === "paused";
  const label = busy ? "Executing" : waiting ? "Waiting for input" : status?.state === "terminated" ? `Finished · exit ${status.exitCode ?? 0}` : status?.state === "halted" ? "Stopped" : status?.state === "error" ? "Error" : status?.state === "paused" ? "Paused" : status?.state === "running" ? "Running" : "Ready";
  const button = "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[11px] text-[#bbb] hover:bg-[#303030] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#89d185] disabled:opacity-40";

  useEffect(() => {
    if (following.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [visibleOutput]);
  useEffect(() => {
    if (waiting && !busy && !sending) input.current?.focus({preventScroll: true});
  }, [waiting, busy, sending, mode, step]);
  useEffect(() => () => {if (copyTimer.current) clearTimeout(copyTimer.current);}, []);

  async function send(text: string) {
    if (!waiting || busy || pending.current) return;
    pending.current = true;
    setSending(true);
    setLocalError(null);
    following.current = true;
    try {
      await onInput(text);
      setLine("");
    } catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : "Could not send program input. Try again.");
    } finally {
      pending.current = false;
      setSending(false);
    }
  }
  function clearDisplay() {
    setCleared({offset: stdout.length, stdout, step});
    setLocalError(null);
  }
  function freshRun(action?: () => void) {
    setCleared({offset: 0, stdout: "", step: 0});
    setLine("");
    setLocalError(null);
    following.current = true;
    action?.();
  }
  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(visibleOutput);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setLocalError("Copy is unavailable. Use Download to save the output.");
    }
  }
  function downloadOutput() {
    const url = URL.createObjectURL(new Blob([visibleOutput], {type: "text/plain;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nasm-console.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section data-surface="dark" aria-label="8086 Assembly console" className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#101010] text-xs text-[#ddd]">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#2b2b2b] bg-[#161616] px-3 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><Terminal size={14} className="text-[#89d185]"/><span className="font-medium text-[#eee]">8086 Assembly</span><span className="text-[#777]">{privateRun ? "Your private console" : "DOS-style console"}</span><span role="status" className={`rounded px-2 py-0.5 text-[10px] ${status?.state === "error" ? "bg-red-950 text-red-300" : active ? "bg-[#203526] text-[#a4dbad]" : "bg-[#242424] text-[#aaa]"}`}>{label}</span></div>
      <div className="flex flex-wrap items-center gap-1">
        {onStart && <button type="button" className={button} disabled={busy || sending} onClick={() => freshRun(onStart)} title="Assemble the current source and start a fresh run"><Play size={12}/>{status && status.state !== "ready" ? "Run again" : "Run"}</button>}
        {onStop && <button type="button" className={button} disabled={!active || busy || sending} onClick={onStop} title="Stop this execution session"><Square size={12} className="text-red-300"/>Stop</button>}
        {onReset && <button type="button" className={button} disabled={busy || sending} onClick={() => freshRun(onReset)} title="Reset execution"><RotateCcw size={12}/>Reset</button>}
        <button type="button" className={button} onClick={clearDisplay} title="Clear displayed output; program execution continues"><Eraser size={12}/>Clear</button>
        <button type="button" aria-label="Copy DOS console output" className={button} onClick={() => void copyOutput()}>{copied ? <Check size={12}/> : <Copy size={12}/>}</button>
        <button type="button" aria-label="Download DOS console output" className={button} onClick={downloadOutput}><Download size={12}/></button>
      </div>
    </div>
    <pre ref={output} aria-label="DOS program output" role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => {const view = output.current;if(view)following.current = view.scrollHeight - view.scrollTop - view.clientHeight < 48;}} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-6 selection:bg-[#264f78]">{visibleOutput || (!status || status.state === "ready" ? <span className="text-[#777]">Run your program. Output appears here; enter input below when it is requested.</span> : "")}</pre>
    {(error || status?.error || localError) && <p role="alert" className="shrink-0 break-words px-3 py-2 text-red-300">{error || status?.error || localError}</p>}
    <p className="shrink-0 px-3 py-1 text-[11px] text-[#888]">{waiting ? mode === "line" ? "Waiting for a line · Enter sends your answer, including an empty line." : mode === "character_no_echo" ? "Waiting for one character · Input will not be echoed." : "Waiting for one character · Enter and Backspace are supported." : "DOS keyboard input becomes available when the program requests it."}</p>
    <form onSubmit={event => {event.preventDefault();if (waiting && mode === "line" && !unavailable) void send(line);}} className="flex shrink-0 items-center gap-2 border-t border-[#303030] bg-[#161616] px-3 py-2">
      <label htmlFor={inputId} aria-label="Program input" className="font-mono text-[#89d185]">❯</label>
      <input ref={input} id={inputId} aria-label="DOS keyboard input" autoComplete="off" spellCheck={false} disabled={unavailable} type={mode === "character_no_echo" ? "password" : "text"} value={line} onChange={event => {const text = event.target.value;if (mode === "line" || (event.nativeEvent as InputEvent).isComposing) setLine(text);else if (text) void send(Array.from(text)[0]);}} onCompositionEnd={event => {if (mode !== "line" && event.currentTarget.value) void send(Array.from(event.currentTarget.value)[0]);}} onKeyDown={event => {
        if (event.nativeEvent.isComposing || !waiting || unavailable || mode === "line") return;
        const text = event.key === "Enter" ? "\r" : event.key === "Backspace" ? "\b" : !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 ? event.key : null;
        if (text !== null) {event.preventDefault();void send(text);}
      }} maxLength={4096} placeholder={waiting ? mode === "line" ? "Type program input · Enter to send" : "Press a character…" : "Run the program to enter input"} className="min-h-7 min-w-0 flex-1 bg-transparent py-1 font-mono text-xs text-[#eee] outline-none placeholder:text-[#777] disabled:opacity-50"/>
      {mode === "line" && <button type="submit" disabled={unavailable} className="shrink-0 rounded border border-[#444] bg-[#242424] px-3 py-1 text-xs text-[#ddd] hover:bg-[#333] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#89d185] disabled:opacity-40">Send ↵</button>}
    </form>
  </section>;
}
