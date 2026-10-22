"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Play,
  RotateCcw,
  StepForward,
  StepBack,
  Cpu,
  Terminal,
  Layers,
  HardDrive,
  ListOrdered,
  AlertCircle,
  CheckCircle,
  FileCode,
  Sparkles,
  BookOpen,
} from "lucide-react";
import type { OnMount } from "@monaco-editor/react";
import { ASM_EXAMPLES, DEFAULT_ASM_CODE } from "@/lib/asm/samples";
import {
  AsmExecutionStatus,
  AsmTraceStep,
  CpuRegisters,
  CpuFlags,
  AsmDiagnostic,
} from "@/lib/asm/types";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1E1E1E]">
      <span className="font-mono text-sm text-[#858585]">Loading Assembly editor…</span>
    </div>
  ),
});

const DEFAULT_REGISTERS: CpuRegisters = {
  ax: 0, bx: 0, cx: 0, dx: 0,
  sp: 0xfffe, bp: 0, si: 0, di: 0,
  ip: 0x0100, cs: 0x1000, ds: 0x1000, es: 0x1000, ss: 0x1000,
};

const DEFAULT_FLAGS: CpuFlags = {
  cf: false, pf: false, af: false, zf: false,
  sf: false, tf: false, if: true, df: false, of: false,
};

export default function AssemblyLab() {
  const [code, setCode] = useState(() => {
    if (typeof window !== "undefined") {
      const pendingAsm = window.localStorage.getItem("pending_asm_code");
      if (pendingAsm) {
        window.localStorage.removeItem("pending_asm_code");
        return pendingAsm;
      }
    }
    return DEFAULT_ASM_CODE;
  });
  const [selectedExampleId, setSelectedExampleId] = useState(ASM_EXAMPLES[0].id);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // CPU and execution state
  const [status, setStatus] = useState<AsmExecutionStatus>({
    state: "ready",
    currentStep: 0,
    totalSteps: 0,
    registers: DEFAULT_REGISTERS,
    flags: DEFAULT_FLAGS,
    stdout: "",
    canStepForward: false,
    canStepBack: false,
  });

  const [diagnostics, setDiagnostics] = useState<AsmDiagnostic[]>([]);
  const [traceHistory, setTraceHistory] = useState<AsmTraceStep[]>([]);
  const [engineUsed, setEngineUsed] = useState<string>("builtin-nasm-compat");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"output" | "memory" | "stack" | "trace">("output");
  const [memSegment, setMemSegment] = useState<number>(0x1000);
  const [memOffset, setMemOffset] = useState<number>(0x0100);
  const [memWordMode, setMemWordMode] = useState(false);

  // Editor ref & decorations
  const editorRef = useRef<Parameters<NonNullable<OnMount>>[0] | null>(null);
  const monacoRef = useRef<Parameters<NonNullable<OnMount>>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Highlight current instruction in Monaco editor
  const updateLineHighlight = useCallback((line?: number) => {
    if (!editorRef.current || !monacoRef.current) return;
    if (!line || line <= 0) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      return;
    }

    const monaco = monacoRef.current;
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: "bg-[#094771]/50 border-l-4 border-[#007ACC]",
          glyphMarginClassName: "text-[#007ACC]",
        },
      },
    ]);

    editorRef.current.revealLineInCenterIfOutsideViewport(line);
  }, []);

  // Assemble source code
  const handleAssemble = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assemble",
          sessionId: sessionId ?? undefined,
          sessionToken: sessionToken ?? undefined,
          source: code,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Assembly failed.");
        setDiagnostics(data.assembleResult?.diagnostics || [{ type: "error", message: data.error || "Assembly failed" }]);
        setIsLoading(false);
        return;
      }

      setSessionId(data.sessionId);
      if (data.sessionToken) setSessionToken(data.sessionToken);
      setDiagnostics(data.assembleResult.diagnostics || []);
      setEngineUsed(data.assembleResult.engineUsed);
      setStatus(data.status);
      setTraceHistory([]);
      updateLineHighlight(data.status.currentInstruction?.sourceLine);
      return { sessionId: data.sessionId as string, sessionToken: (data.sessionToken as string) || sessionToken };
    } catch {
      setErrorMessage("Network error while assembling.");
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  // Step one instruction forward
  const handleStep = async () => {
    if (!sessionId) {
      await handleAssemble();
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step",
          sessionId,
          sessionToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Step failed.");
        setIsLoading(false);
        return;
      }

      setStatus(data.status);
      if (data.step) {
        setTraceHistory((prev) => [...prev, data.step]);
      }
      updateLineHighlight(data.status.currentInstruction?.sourceLine);
    } catch {
      setErrorMessage("Network error during step.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step one instruction backward
  const handleStepBack = async () => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stepBack",
          sessionId,
          sessionToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        setTraceHistory((prev) => prev.slice(0, -1));
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      }
    } catch {
      setErrorMessage("Network error during reverse step.");
    } finally {
      setIsLoading(false);
    }
  };

  // Run to completion or halt
  const handleRun = async () => {
    let activeId = sessionId;
    let activeToken = sessionToken;
    if (!activeId) {
      const created = await handleAssemble();
      if (!created) return;
      activeId = created.sessionId;
      activeToken = created.sessionToken;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          sessionId: activeId,
          sessionToken: activeToken,
          limit: 2000,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.steps) {
          setTraceHistory((prev) => [...prev, ...data.steps]);
        }
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      }
    } catch {
      setErrorMessage("Network error during run.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset session
  const handleReset = async () => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          sessionId,
          sessionToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        setTraceHistory([]);
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      }
    } catch {
      setErrorMessage("Network error during reset.");
    } finally {
      setIsLoading(false);
    }
  };

  // Switch example
  const handleSelectExample = (id: string) => {
    const ex = ASM_EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setSelectedExampleId(id);
    setCode(ex.code);
    setSessionId(null);
    setTraceHistory([]);
    setDiagnostics([]);
    setErrorMessage(null);
    updateLineHighlight(undefined);
  };

  // Initial assembly on mount
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void handleAssemble();
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register 8086 NASM monarch tokenizer
    monaco.languages.register({ id: "nasm" });
    monaco.languages.setMonarchTokensProvider("nasm", {
      defaultToken: "",
      ignoreCase: true,
      keywords: [
        "mov", "xchg", "lea", "add", "adc", "sub", "sbb", "inc", "dec", "neg", "cmp",
        "and", "or", "xor", "test", "not", "jmp", "jo", "jno", "jb", "jc", "jnae",
        "jae", "jnb", "jnc", "jz", "je", "jnz", "jne", "jbe", "jna", "ja", "jnbe",
        "js", "jns", "jp", "jpe", "jnp", "jpo", "jl", "jnge", "jge", "jnl", "jle",
        "jng", "jg", "jnle", "loop", "loope", "loopz", "loopne", "loopnz", "jcxz",
        "call", "ret", "push", "pop", "pushf", "popf", "nop", "hlt", "int", "int3",
        "clc", "stc", "cli", "sti", "cld", "std", "cmc",
      ],
      directives: [
        "org", "bits", "section", "global", "extern", "equ", "db", "dw", "dd", "resb", "resw", "cpu",
      ],
      registers: [
        "ax", "ah", "al", "bx", "bh", "bl", "cx", "ch", "cl", "dx", "dh", "dl",
        "sp", "bp", "si", "di", "ip", "cs", "ds", "es", "ss",
      ],
      tokenizer: {
        root: [
          [/;.*$/, "comment"],
          [/'[^']*'/, "string"],
          [/"[^"]*"/, "string"],
          [/0x[0-9a-fA-F]+/, "number.hex"],
          [/[0-9][0-9a-fA-F]*h/i, "number.hex"],
          [/[01]+b/i, "number.binary"],
          [/\d+/, "number"],
          [/byte|word|ptr/i, "type"],
          [
            /[a-zA-Z_$.][a-zA-Z0-9_$.]*/,
            {
              cases: {
                "@keywords": "keyword",
                "@directives": "tag",
                "@registers": "variable.predefined",
                "@default": "identifier",
              },
            },
          ],
        ],
      },
    });

    monaco.editor.setModelLanguage(editor.getModel()!, "nasm");

    // Shortcut: F5 to run, F10 to step
    editor.addCommand(monaco.KeyCode.F5, () => handleRun());
    editor.addCommand(monaco.KeyCode.F10, () => handleStep());
  };

  // Helper to format 16-bit hex
  const hex16 = (n: number) => `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
  const hex8 = (n: number) => `0x${(n & 0xff).toString(16).toUpperCase().padStart(2, "0")}`;

  return (
    <div className="flex h-screen w-full flex-col bg-[#1E1E1E] text-[#D4D4D4]">
      {/* Top Assembly Lab Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#333333] bg-[#252526] px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-[#3B82F6]" />
            <span className="font-semibold text-white text-sm">8086 NASM Lab</span>
          </div>

          <span className="rounded-[3px] border border-[#3E3E42] bg-[#1E1E1E] px-2 py-0.5 font-mono text-[11px] font-medium text-[#858585]">
            16-bit Real Mode / DOS COM
          </span>

          <span className="rounded-[3px] bg-[#094771] px-2 py-0.5 font-mono text-[10px] text-[#9CDCFE]">
            {engineUsed === "native-nasm" ? "Official NASM" : "Built-in 8086 NASM-Engine"}
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Example Program Selector */}
          <div className="flex items-center gap-1.5 mr-2">
            <BookOpen size={14} className="text-[#858585]" />
            <select
              value={selectedExampleId}
              onChange={(e) => handleSelectExample(e.target.value)}
              className="rounded-[3px] border border-[#3E3E42] bg-[#1E1E1E] px-2 py-1 font-mono text-xs text-[#D4D4D4] focus:outline-none focus:border-[#007ACC]"
            >
              {ASM_EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.category}: {ex.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleAssemble}
            disabled={isLoading}
            title="Assemble source code"
            className="flex items-center gap-1.5 rounded-[3px] border border-[#3E3E42] bg-[#2D2D30] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#3E3E42] transition-colors disabled:opacity-50"
          >
            <Sparkles size={13} className="text-[#3B82F6]" />
            <span>Assemble</span>
          </button>

          <button
            type="button"
            onClick={handleRun}
            disabled={isLoading || (!status.canStepForward && status.state !== "ready")}
            title="Run program (F5)"
            className="flex items-center gap-1.5 rounded-[3px] bg-[#238636] px-3 py-1 text-xs font-semibold text-white hover:bg-[#2EA043] transition-colors disabled:opacity-50"
          >
            <Play size={13} className="fill-white" />
            <span>Run</span>
          </button>

          <button
            type="button"
            onClick={handleStep}
            disabled={isLoading || (!status.canStepForward && status.state !== "ready")}
            title="Step next instruction (F10)"
            className="flex items-center gap-1.5 rounded-[3px] bg-[#007ACC] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0098FF] transition-colors disabled:opacity-50"
          >
            <StepForward size={14} />
            <span>Step</span>
          </button>

          <button
            type="button"
            onClick={handleStepBack}
            disabled={isLoading || !status.canStepBack}
            title="Step previous instruction"
            className="flex items-center gap-1.5 rounded-[3px] border border-[#3E3E42] bg-[#2D2D30] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#3E3E42] transition-colors disabled:opacity-40"
          >
            <StepBack size={14} />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            title="Reset CPU to start"
            className="flex items-center gap-1.5 rounded-[3px] border border-[#3E3E42] bg-[#2D2D30] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#3E3E42] transition-colors disabled:opacity-50"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-3 py-1 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle size={13} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Workspace Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Code Editor (50%) */}
        <div className="flex w-1/2 flex-col border-r border-[#333333]">
          {/* Editor Header Tab */}
          <div className="flex h-8 items-center justify-between border-b border-[#333333] bg-[#1E1E1E] px-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-[#9CDCFE]">
              <FileCode size={14} />
              <span>main.asm</span>
            </div>
            {status.currentInstruction && (
              <span className="text-[11px] text-[#4EC9B0]">
                Next: {status.currentInstruction.disassembly} (CS:{hex16(status.currentInstruction.offset)})
              </span>
            )}
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              onMount={handleEditorMount}
              options={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
                fontSize: 13,
                lineNumbers: "on",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
              }}
            />
          </div>

          {/* Diagnostics Bar */}
          {diagnostics.length > 0 && (
            <div className="max-h-24 overflow-y-auto border-t border-[#333333] bg-[#252526] p-2 text-xs">
              {diagnostics.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[#F14C4C] font-mono text-[11px]">
                  <AlertCircle size={12} />
                  <span>Line {d.line || "?"}: {d.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: CPU State, Registers, Flags & Inspect Panels (50%) */}
        <div className="flex w-1/2 flex-col bg-[#181818] overflow-hidden">
          {/* Top Panel: Registers & Flags */}
          <div className="border-b border-[#333333] p-3 bg-[#1F1F1F]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#858585]">
                CPU Registers & Flags
              </span>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-[#858585]">State:</span>
                <span className={`font-bold ${
                  status.state === "halted" ? "text-[#E5C07B]" :
                  status.state === "terminated" ? "text-[#98C379]" : "text-[#61AFEF]"
                }`}>
                  {status.state.toUpperCase()}
                  {status.exitCode !== undefined && ` (Exit: ${status.exitCode})`}
                </span>
                <span className="text-[#555555]">|</span>
                <span className="text-[#858585]">Step: {status.currentStep}</span>
              </div>
            </div>

            {/* General Purpose Registers */}
            <div className="grid grid-cols-4 gap-2 mb-2 font-mono text-xs">
              <div className="rounded border border-[#333333] bg-[#252526] p-1.5">
                <div className="text-[10px] text-[#858585] flex justify-between">
                  <span>AX</span>
                  <span className="text-[9px] text-[#555555]">{status.registers.ax}</span>
                </div>
                <div className="font-bold text-[#E5C07B]">{hex16(status.registers.ax)}</div>
                <div className="text-[9px] text-[#858585] flex justify-between mt-0.5">
                  <span>AH:{hex8((status.registers.ax >> 8) & 0xff)}</span>
                  <span>AL:{hex8(status.registers.ax & 0xff)}</span>
                </div>
              </div>

              <div className="rounded border border-[#333333] bg-[#252526] p-1.5">
                <div className="text-[10px] text-[#858585] flex justify-between">
                  <span>BX</span>
                  <span className="text-[9px] text-[#555555]">{status.registers.bx}</span>
                </div>
                <div className="font-bold text-[#61AFEF]">{hex16(status.registers.bx)}</div>
                <div className="text-[9px] text-[#858585] flex justify-between mt-0.5">
                  <span>BH:{hex8((status.registers.bx >> 8) & 0xff)}</span>
                  <span>BL:{hex8(status.registers.bx & 0xff)}</span>
                </div>
              </div>

              <div className="rounded border border-[#333333] bg-[#252526] p-1.5">
                <div className="text-[10px] text-[#858585] flex justify-between">
                  <span>CX</span>
                  <span className="text-[9px] text-[#555555]">{status.registers.cx}</span>
                </div>
                <div className="font-bold text-[#98C379]">{hex16(status.registers.cx)}</div>
                <div className="text-[9px] text-[#858585] flex justify-between mt-0.5">
                  <span>CH:{hex8((status.registers.cx >> 8) & 0xff)}</span>
                  <span>CL:{hex8(status.registers.cx & 0xff)}</span>
                </div>
              </div>

              <div className="rounded border border-[#333333] bg-[#252526] p-1.5">
                <div className="text-[10px] text-[#858585] flex justify-between">
                  <span>DX</span>
                  <span className="text-[9px] text-[#555555]">{status.registers.dx}</span>
                </div>
                <div className="font-bold text-[#D19A66]">{hex16(status.registers.dx)}</div>
                <div className="text-[9px] text-[#858585] flex justify-between mt-0.5">
                  <span>DH:{hex8((status.registers.dx >> 8) & 0xff)}</span>
                  <span>DL:{hex8(status.registers.dx & 0xff)}</span>
                </div>
              </div>
            </div>

            {/* Pointer, Index, and Segment Registers */}
            <div className="grid grid-cols-4 gap-2 mb-2 font-mono text-[11px]">
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">SP: </span>
                <span className="text-[#E06C75] font-semibold">{hex16(status.registers.sp)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">BP: </span>
                <span className="text-[#E06C75] font-semibold">{hex16(status.registers.bp)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">SI: </span>
                <span className="text-[#C678DD] font-semibold">{hex16(status.registers.si)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">DI: </span>
                <span className="text-[#C678DD] font-semibold">{hex16(status.registers.di)}</span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-2 font-mono text-[11px]">
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">IP: </span>
                <span className="text-[#4EC9B0] font-bold">{hex16(status.registers.ip)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">CS: </span>
                <span className="text-[#D4D4D4]">{hex16(status.registers.cs)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">DS: </span>
                <span className="text-[#D4D4D4]">{hex16(status.registers.ds)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">ES: </span>
                <span className="text-[#D4D4D4]">{hex16(status.registers.es)}</span>
              </div>
              <div className="rounded border border-[#333333] bg-[#252526] px-2 py-1">
                <span className="text-[#858585]">SS: </span>
                <span className="text-[#D4D4D4]">{hex16(status.registers.ss)}</span>
              </div>
            </div>

            {/* Flags Panel */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-[#2D2D30] font-mono text-[10px]">
              <span className="text-[#858585] font-semibold mr-1">FLAGS:</span>
              {[
                { label: "OF", val: status.flags.of },
                { label: "DF", val: status.flags.df },
                { label: "IF", val: status.flags.if },
                { label: "TF", val: status.flags.tf },
                { label: "SF", val: status.flags.sf },
                { label: "ZF", val: status.flags.zf },
                { label: "AF", val: status.flags.af },
                { label: "PF", val: status.flags.pf },
                { label: "CF", val: status.flags.cf },
              ].map((f) => (
                <span
                  key={f.label}
                  className={`rounded px-1.5 py-0.5 font-bold transition-colors ${
                    f.val
                      ? "bg-[#094771] text-[#9CDCFE] border border-[#007ACC]"
                      : "bg-[#252526] text-[#555555] border border-transparent"
                  }`}
                >
                  {f.label}={f.val ? "1" : "0"}
                </span>
              ))}
            </div>
          </div>

          {/* Lower Tabs: Output, Memory, Stack, Trace */}
          <div className="flex h-8 items-center border-b border-[#333333] bg-[#252526] px-2">
            {[
              { id: "output", label: "DOS Terminal / Output", icon: Terminal },
              { id: "memory", label: "Memory Dump", icon: HardDrive },
              { id: "stack", label: "Stack Viewer", icon: Layers },
              { id: "trace", label: "Execution Timeline", icon: ListOrdered },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "output" | "memory" | "stack" | "trace")}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "border-b-2 border-[#007ACC] text-white bg-[#1E1E1E]"
                      : "text-[#858585] hover:text-[#D4D4D4]"
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Areas */}
          <div className="flex-1 overflow-auto p-3 font-mono text-xs">
            {/* Terminal Tab */}
            {activeTab === "output" && (
              <div className="flex h-full flex-col">
                <div className="flex-1 rounded border border-[#333333] bg-[#111111] p-3 text-[#50FA7B] font-mono whitespace-pre-wrap overflow-y-auto">
                  {status.stdout || (
                    <span className="text-[#555555] italic">
                      [Program has not generated any output via DOS INT 21h yet.]
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-[#858585] flex items-center justify-between">
                  <span>Services supported: INT 21h (AH=02h, 09h, 4Ch), INT 20h, INT 10h (AH=0Eh)</span>
                  <span className="text-emerald-500 flex items-center gap-1">
                    <CheckCircle size={12} /> Sandbox Active
                  </span>
                </div>
              </div>
            )}

            {/* Memory Tab */}
            {activeTab === "memory" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#858585]">View Address:</span>
                  <input
                    type="text"
                    value={`0x${memSegment.toString(16).toUpperCase()}:0x${memOffset.toString(16).toUpperCase()}`}
                    onChange={(e) => {
                      const match = e.target.value.match(/^(?:0x)?([0-9a-fA-F]+):(?:0x)?([0-9a-fA-F]+)$/);
                      if (match) {
                        setMemSegment(parseInt(match[1], 16));
                        setMemOffset(parseInt(match[2], 16));
                      }
                    }}
                    className="w-36 rounded border border-[#3E3E42] bg-[#1E1E1E] px-2 py-0.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setMemWordMode(!memWordMode)}
                    className="rounded border border-[#3E3E42] bg-[#252526] px-2 py-0.5 text-[11px] text-[#9CDCFE]"
                  >
                    {memWordMode ? "Word View (16-bit)" : "Byte View (8-bit)"}
                  </button>
                </div>

                <div className="rounded border border-[#333333] bg-[#141414] p-2 text-[11px] font-mono leading-relaxed">
                  <div className="text-[#858585] border-b border-[#252526] pb-1 mb-1 grid grid-cols-12 gap-1 font-semibold">
                    <span className="col-span-3">Segment:Offset</span>
                    <span className="col-span-6">Hex Bytes</span>
                    <span className="col-span-3">ASCII</span>
                  </div>
                  {/* Rows of 8 bytes */}
                  {[0, 8, 16, 24, 32, 40, 48, 56].map((rowOffset) => {
                    const rowAddr = (memOffset + rowOffset) & 0xffff;
                    return (
                      <div key={rowOffset} className="grid grid-cols-12 gap-1 hover:bg-[#202020] px-1 rounded">
                        <span className="col-span-3 text-[#4EC9B0]">
                          {hex16(memSegment)}:{hex16(rowAddr)}
                        </span>
                        <span className="col-span-6 text-[#CE9178] tracking-wider">
                          00 00 00 00 00 00 00 00
                        </span>
                        <span className="col-span-3 text-[#858585]">
                          ........
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stack Viewer Tab */}
            {activeTab === "stack" && (
              <div className="flex flex-col gap-2">
                <div className="text-[#858585] text-xs">
                  Stack segment SS: {hex16(status.registers.ss)} | Stack Pointer SP: {hex16(status.registers.sp)}
                </div>
                <div className="rounded border border-[#333333] bg-[#141414] p-3">
                  <div className="space-y-1.5">
                    {/* Visual stack slots from SP */}
                    {[0, 2, 4, 6, 8, 10].map((delta) => {
                      const addr = (status.registers.sp + delta) & 0xffff;
                      const isTop = delta === 0;
                      return (
                        <div
                          key={delta}
                          className={`flex items-center justify-between px-3 py-1 rounded font-mono text-xs border ${
                            isTop
                              ? "border-[#007ACC] bg-[#094771]/30 text-white font-bold"
                              : "border-[#252526] bg-[#1E1E1E] text-[#858585]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[#4EC9B0]">SS:{hex16(addr)}</span>
                            {isTop && (
                              <span className="text-[10px] bg-[#007ACC] text-white px-1.5 py-0.2 rounded font-sans">
                                ← Top of Stack (SP)
                              </span>
                            )}
                          </div>
                          <span className="text-[#CE9178]">0x0000</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Trace History Tab */}
            {activeTab === "trace" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#333333] text-[#858585]">
                      <th className="py-1 px-2">#</th>
                      <th className="py-1 px-2">Address</th>
                      <th className="py-1 px-2">Bytes</th>
                      <th className="py-1 px-2">Disassembly</th>
                      <th className="py-1 px-2">Memory R/W</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceHistory.map((step) => (
                      <tr key={step.step} className="border-b border-[#252526] hover:bg-[#202020]">
                        <td className="py-1 px-2 text-[#858585]">{step.step}</td>
                        <td className="py-1 px-2 text-[#4EC9B0]">
                          {hex16(step.addressBefore.segment)}:{hex16(step.addressBefore.offset)}
                        </td>
                        <td className="py-1 px-2 text-[#CE9178]">
                          {step.instructionBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}
                        </td>
                        <td className="py-1 px-2 font-semibold text-white">
                          {step.disassembly}
                        </td>
                        <td className="py-1 px-2 text-[11px] text-[#9CDCFE]">
                          {step.memoryWrites.length > 0
                            ? `W: ${hex16(step.memoryWrites[0].offset)} ← ${hex8(step.memoryWrites[0].newValue)}`
                            : step.memoryReads.length > 0
                            ? `R: ${hex16(step.memoryReads[0].offset)} → ${hex8(step.memoryReads[0].oldValue)}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                    {traceHistory.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-[#555555] italic">
                          Click Step or Run to begin tracing instructions.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
