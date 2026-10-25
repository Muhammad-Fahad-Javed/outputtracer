"use client";

import {Cpu, RotateCcw, StepBack, StepForward, Wrench} from "lucide-react";
import type {AsmExecutionStatus, AsmTraceStep} from "@/lib/asm/types";

interface Props {
  status: AsmExecutionStatus;
  trace: AsmTraceStep[];
  busy: boolean;
  engineUsed: string;
  onStep: () => void;
  onBack: () => void;
  onReset: () => void;
  onAssemble: () => void;
  onContinue: () => void;
  sourceChanged: boolean;
  onShowPanel: (panel: "memory" | "stack" | "trace") => void;
}

const hex = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const button = "flex items-center justify-center gap-1 rounded border border-[#444] bg-[#252526] px-2 py-1.5 text-xs text-[#ddd] hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40";

export default function AssemblyInspector(p: Props) {
  const last = p.trace.at(-1);
  return <section aria-label="8086 CPU inspector" className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#181818] text-[#ddd]">
    <div className="border-b border-[#333] px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1.5 font-semibold"><Cpu size={14}/>8086 Lab</span><span className="text-[#aaa]">{p.status.state.replaceAll("_", " ")} · Step {p.status.currentStep}</span></div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        <button type="button" className={button} onClick={p.onAssemble} disabled={p.busy} title="Assemble current source"><Wrench size={12}/>Build</button>
        <button type="button" className={button} onClick={p.onStep} disabled={p.busy || (!p.sourceChanged && p.status.state !== "ready" && !p.status.canStepForward)} title="Execute next instruction (F10)"><StepForward size={12}/>Step</button>
        <button type="button" className={button} onClick={p.onBack} disabled={p.busy || p.sourceChanged || !p.status.canStepBack} title="Undo the last instruction"><StepBack size={12}/>Back</button>
        <button type="button" className={button} onClick={p.onReset} disabled={p.busy} title="Reset CPU to the start"><RotateCcw size={12}/>Reset</button>
      </div>
      <button type="button" className={`${button} mt-2 w-full`} onClick={p.onContinue} disabled={p.busy || p.sourceChanged || !p.status.canStepForward}>Continue from current instruction</button>
      {p.sourceChanged && <p className="mt-2 text-[11px] text-amber-200">Build or step to load the current source. Values below belong to the previous CPU state.</p>}
      <p className="mt-2 break-words font-mono text-[11px] text-[#9CDCFE]">{p.status.currentInstruction?.disassembly || "Build or step to inspect your program."}</p>
      {p.status.error && <p className="mt-1 text-xs text-red-300" role="alert">{p.status.error}</p>}
    </div>
    <div className="p-3">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#aaa]">Registers</h2>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
        {Object.entries(p.status.registers).map(([name, value]) => <div key={name} className="rounded border border-[#333] bg-[#202020] px-2 py-1.5">
          <div className="flex justify-between gap-2"><span className="text-[#aaa]">{name.toUpperCase()}</span><span className="text-[#B5CEA8]">{hex(value)}</span></div>
          {["ax", "bx", "cx", "dx"].includes(name) && <div className="mt-1 flex justify-between text-[9px] text-[#aaa]"><span>{name[0].toUpperCase()}H: {(value >> 8 & 255).toString(16).toUpperCase().padStart(2, "0")}</span><span>{name[0].toUpperCase()}L: {(value & 255).toString(16).toUpperCase().padStart(2, "0")}</span></div>}
        </div>)}
      </div>
      <h2 className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-[#aaa]">Flags</h2>
      <div className="flex flex-wrap gap-1 font-mono text-[11px]">{Object.entries(p.status.flags).map(([name, set]) => <span key={name} className={`rounded border px-1.5 py-1 ${set ? "border-green-600 bg-green-950 text-green-200" : "border-[#444] text-[#aaa]"}`}>{name.toUpperCase()} {set ? "1" : "0"}</span>)}</div>
      {last && <div className="mt-3 border-t border-[#333] pt-2 text-xs"><p className="text-[#aaa]">Last instruction</p><p className="mt-1 break-words font-mono text-[#DCDCAA]">{last.disassembly}</p>{last.explanation && <p className="mt-1 leading-relaxed text-[#bbb]">{last.explanation}</p>}</div>}
      <div className="mt-3 flex flex-wrap gap-1">{(["memory", "stack", "trace"] as const).map(panel => <button type="button" key={panel} className={button} onClick={() => p.onShowPanel(panel)}>{panel === "trace" ? "Timeline" : panel === "memory" ? "Memory" : "Stack"}</button>)}</div>
      <p className="mt-3 text-[10px] text-[#999]">16-bit real mode · {p.engineUsed === "native-nasm" ? "NASM assembler" : p.engineUsed === "not-assembled" ? "Not assembled" : "Built-in NASM-compatible assembler"}</p>
    </div>
  </section>;
}
