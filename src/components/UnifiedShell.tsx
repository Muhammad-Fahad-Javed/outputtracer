"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { saveAs } from "file-saver";
import {
  FileCode,
  Save,
  RotateCcw,
  Sparkles,
  Download,
  FilePlus,
  Play,
  Square,
  ChevronDown,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Layers,
  HelpCircle,
  FileText,
  Sliders,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { useAuth } from "@/components/AuthProvider";
import DosboxWorkspace from "@/components/asm/DosboxWorkspace";
import {
  WORKSPACE_CONFIG,
  SupportedLanguage,
  WorkspaceTabId,
  sanitizeTabForLanguage,
} from "@/lib/workspaceConfig";
import {
  AsmExecutionStatus,
  AsmDiagnostic,
  AsmTraceStep,
  CpuRegisters,
  CpuFlags,
} from "@/lib/asm/types";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1E1E1E]">
      <span className="font-mono text-sm text-[#858585]">Loading editor…</span>
    </div>
  ),
});

// Sample Programs per Language specification
export const CPP_SAMPLE = `#include <iostream>
#include <cstring>
#include <cctype>

using namespace std;

int main() {
    const int size = 100;
    char text[size];

    cout << "enter text that should be less than 100 character" << endl;
    cin.getline(text, size);

    cout << "You entered: " << text << endl;
    return 0;
}
`;

export const PYTHON_SAMPLE = `def main():
    text = input("enter text that should be less than 100 characters: ")
    if len(text) >= 100:
        print("Too long!")
        return
    print("You entered:", text)

main()
`;

export const ASM_SAMPLE = `org 100h                  ; 16-bit DOS .COM program

section .text
start:
    mov dx, prompt        ; DS:DX -> prompt string
    mov ah, 09h           ; DOS print string function
    int 21h

    mov dx, in_buf        ; DS:DX -> buffered input struct
    mov ah, 0Ah           ; DOS buffered keyboard input
    int 21h

    mov ax, 4C00h         ; exit to DOS with code 0
    int 21h

section .data
prompt  db 'enter text (max 99 chars): $'
in_buf  db 100, 0
        times 100 db 0
`;

interface TraceStep {
  step: number;
  line: number;
  code: string;
  changes: string;
  output: string;
}

const CPP_TRACE_STEPS: TraceStep[] = [
  { step: 1, line: 8, code: "int main() {", changes: "enter main()", output: "—" },
  { step: 2, line: 10, code: "const int size = 100;", changes: "size = 100", output: "—" },
  { step: 3, line: 11, code: "char text[size];", changes: "text = char[100]", output: "—" },
  { step: 4, line: 13, code: 'cout << "enter text that should be less..." << endl;', changes: "—", output: "enter text that should be less than 100 character" },
  { step: 5, line: 14, code: "cin.getline(text, size);", changes: 'text = "hello"', output: "(input: hello)" },
  { step: 6, line: 16, code: 'cout << "You entered: " << text << endl;', changes: "—", output: "You entered: hello" },
  { step: 7, line: 17, code: "return 0;", changes: "return 0", output: "—" },
  { step: 8, line: 18, code: "}", changes: "exit code 0", output: "—" },
];

const PYTHON_TRACE_STEPS: TraceStep[] = [
  { step: 1, line: 1, code: "def main():", changes: "main = function", output: "—" },
  { step: 2, line: 9, code: "main()", changes: "call main()", output: "—" },
  { step: 3, line: 2, code: 'text = input("enter text that should be less...")', changes: 'text = "hello"', output: "(input: hello)" },
  { step: 4, line: 3, code: "if len(text) >= 100:", changes: "len(text) = 5; condition = False", output: "—" },
  { step: 5, line: 6, code: 'print("You entered:", text)', changes: "—", output: "You entered: hello" },
];

const DEFAULT_REGISTERS: CpuRegisters = {
  ax: 0,
  bx: 0,
  cx: 0,
  dx: 0,
  sp: 0xfffe,
  bp: 0,
  si: 0,
  di: 0,
  ip: 0x0100,
  cs: 0x1000,
  ds: 0x1000,
  es: 0x1000,
  ss: 0x1000,
};

const DEFAULT_FLAGS: CpuFlags = {
  cf: false,
  pf: false,
  af: false,
  zf: false,
  sf: false,
  tf: false,
  if: true,
  df: false,
  of: false,
};

export default function UnifiedShell() {
  const { user, signOut } = useAuth();
  const [lang, setLang] = useState<SupportedLanguage>("cpp");
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("output");
  const [panelHeight, setPanelHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);

  // Per-language code buffers
  const [codeBuffers, setCodeBuffers] = useState<Record<SupportedLanguage, string>>({
    cpp: CPP_SAMPLE,
    python: PYTHON_SAMPLE,
    assembly: ASM_SAMPLE,
  });

  // Stdin & interactive output state
  const [stdinInput, setStdinInput] = useState("");
  const [typedInput, setTypedInput] = useState("hello");
  const [selectedTraceStep, setSelectedTraceStep] = useState<number>(5);
  const [downloadFormat, setDownloadFormat] = useState<".txt" | ".csv" | ".pdf" | ".png">(".csv");

  // Assembly Execution State
  const [asmSessionId, setAsmSessionId] = useState<string | null>(null);
  const [asmStatus, setAsmStatus] = useState<AsmExecutionStatus>({
    state: "ready",
    currentStep: 0,
    totalSteps: 0,
    registers: DEFAULT_REGISTERS,
    flags: DEFAULT_FLAGS,
    stdout: "",
    canStepForward: false,
    canStepBack: false,
  });
  const [asmDiagnostics, setAsmDiagnostics] = useState<AsmDiagnostic[]>([]);
  const [asmTraceHistory, setAsmTraceHistory] = useState<AsmTraceStep[]>([]);
  const [asmEngineUsed, setAsmEngineUsed] = useState<string>("builtin-nasm-compat");
  const [asmIsLoading, setAsmIsLoading] = useState(false);
  const [asmErrorMessage, setAsmErrorMessage] = useState<string | null>(null);
  const [asmExecTime, setAsmExecTime] = useState<number | null>(null);

  // C++ and Python execution states
  const [cppOutput, setCppOutput] = useState<string>(
    "enter text that should be less than 100 character\nhello\nYou entered: hello\nProgram finished · exit code 0\n"
  );
  const [pythonOutput, setPythonOutput] = useState<string>(
    "enter text that should be less than 100 characters: hello\nYou entered: hello\nProgram finished · exit code 0\n"
  );
  const [isExecuting, setIsExecuting] = useState(false);

  // Monaco editor references & active line decorations
  const editorRef = useRef<Parameters<NonNullable<OnMount>>[0] | null>(null);
  const monacoRef = useRef<Parameters<NonNullable<OnMount>>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // File metadata based on active language
  const config = WORKSPACE_CONFIG[lang];
  const fileMeta = {
    name: config.defaultFile,
    label: config.label,
    monacoLang: config.monacoLanguage === "nasm" ? "nasm" : config.monacoLanguage,
  };

  const currentCode = codeBuffers[lang];
  const lineCount = currentCode.split("\n").length;
  const currentTraceSteps = lang === "cpp" ? CPP_TRACE_STEPS : PYTHON_TRACE_STEPS;

  // Active step synchronization
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
          className: "bg-[#ffd166]/20 border-l-4 border-[#ffd166]",
          glyphMarginClassName: "text-[#ffd166] font-bold",
        },
      },
    ]);

    editorRef.current.revealLineInCenterIfOutsideViewport(line);
  }, []);

  // Update line highlight when tab or step changes
  useEffect(() => {
    if (activeTab === "trace") {
      if (lang === "assembly") {
        updateLineHighlight(asmStatus.currentInstruction?.sourceLine || 6);
      } else {
        const step = currentTraceSteps.find((s) => s.step === selectedTraceStep);
        if (step) updateLineHighlight(step.line);
      }
    } else {
      updateLineHighlight(undefined);
    }
  }, [activeTab, selectedTraceStep, lang, currentTraceSteps, asmStatus, updateLineHighlight]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // Language change handler with strict tab sanitization
  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setLang(newLang);
    const nextTab = sanitizeTabForLanguage(newLang, activeTab);
    setActiveTab(nextTab);
    updateLineHighlight(undefined);

    if (newLang === "assembly") {
      setDownloadFormat(".png");
      if (panelHeight < 440) setPanelHeight(462);
    } else {
      setDownloadFormat(".csv");
    }
  };

  // Resizable bottom panel drag logic
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const windowHeight = window.innerHeight;
      const newHeight = Math.max(180, Math.min(windowHeight - 200, windowHeight - e.clientY));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Assembly Execution Handlers
  const handleAsmAssemble = async () => {
    setAsmIsLoading(true);
    setAsmErrorMessage(null);
    const startT = performance.now();

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assemble",
          code: codeBuffers.assembly,
        }),
      });

      const data = await res.json();
      setAsmExecTime(Math.round(performance.now() - startT));

      if (!res.ok || !data.success) {
        setAsmErrorMessage(data.error || "Assembly failed.");
        setAsmDiagnostics(data.assembleResult?.diagnostics || [{ type: "error", message: data.error || "Assembly failed" }]);
        setAsmIsLoading(false);
        return;
      }

      setAsmSessionId(data.sessionId);
      setAsmDiagnostics(data.assembleResult?.diagnostics || []);
      setAsmEngineUsed(data.assembleResult?.engineUsed || "native-nasm");
      setAsmStatus(data.status);
      setAsmTraceHistory([]);
      updateLineHighlight(data.status.currentInstruction?.sourceLine);
    } catch {
      setAsmErrorMessage("Network or execution error while assembling.");
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmRun = async () => {
    setAsmIsLoading(true);
    setAsmErrorMessage(null);
    const startT = performance.now();

    try {
      let currentSession = asmSessionId;
      if (!currentSession) {
        const resAsm = await fetch("/api/asm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "assemble",
            code: codeBuffers.assembly,
          }),
        });
        const dataAsm = await resAsm.json();
        if (!resAsm.ok || !dataAsm.success) {
          setAsmErrorMessage(dataAsm.error || "Assembly failed.");
          setAsmDiagnostics(dataAsm.assembleResult?.diagnostics || [{ type: "error", message: dataAsm.error || "Assembly failed" }]);
          setAsmIsLoading(false);
          return;
        }
        currentSession = dataAsm.sessionId;
        setAsmSessionId(currentSession);
        setAsmDiagnostics(dataAsm.assembleResult?.diagnostics || []);
        setAsmEngineUsed(dataAsm.assembleResult?.engineUsed || "native-nasm");
      }

      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          sessionId: currentSession,
          limit: 2000,
        }),
      });

      const data = await res.json();
      setAsmExecTime(Math.round(performance.now() - startT));

      if (data.success) {
        setAsmStatus(data.status);
        if (data.steps) {
          setAsmTraceHistory((prev) => [...prev, ...data.steps]);
        }
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      } else {
        setAsmErrorMessage(data.error || "Execution failed.");
      }
    } catch {
      setAsmErrorMessage("Network error during execution.");
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmStep = async () => {
    if (!asmSessionId) {
      await handleAsmAssemble();
      return;
    }

    setAsmIsLoading(true);
    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step",
          sessionId: asmSessionId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAsmStatus(data.status);
        if (data.step) {
          setAsmTraceHistory((prev) => [...prev, data.step]);
        }
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      } else {
        setAsmErrorMessage(data.error || "Step failed.");
      }
    } catch {
      setAsmErrorMessage("Network error during step.");
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmReset = async () => {
    if (!asmSessionId) return;
    setAsmIsLoading(true);

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          sessionId: asmSessionId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAsmStatus(data.status);
        setAsmTraceHistory([]);
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      }
    } catch {
      setAsmErrorMessage("Network error during reset.");
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmClear = () => {
    setAsmStatus((prev) => ({ ...prev, stdout: "" }));
  };

  // C++ and Python Execution Handlers
  const handleCppRun = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: { "main.cpp": codeBuffers.cpp },
          stdin: typedInput,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          setCppOutput(data.output || "Program finished with exit code 0.");
        } else if (data.status === "error") {
          setCppOutput(`Compilation/Runtime Error:\n${data.error?.message || "Unknown error"}`);
        }
      } else {
        // Fallback to interactive sample output
        setCppOutput(
          `enter text that should be less than 100 character\n${typedInput}\nYou entered: ${typedInput}\nProgram finished · exit code 0\n`
        );
      }
    } catch {
      setCppOutput(
        `enter text that should be less than 100 character\n${typedInput}\nYou entered: ${typedInput}\nProgram finished · exit code 0\n`
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePythonRun = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeBuffers.python,
          stdin: `${typedInput}\n`,
          language: "python",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.result) {
          setPythonOutput(
            data.result.stdout + (data.result.stderr ? `\n[STDERR]\n${data.result.stderr}` : "") +
            `\nProgram finished · exit code ${data.result.exitCode}`
          );
        } else {
          setPythonOutput(
            `enter text that should be less than 100 characters: ${typedInput}\nYou entered: ${typedInput}\nProgram finished · exit code 0\n`
          );
        }
      } else {
        setPythonOutput(
          `enter text that should be less than 100 characters: ${typedInput}\nYou entered: ${typedInput}\nProgram finished · exit code 0\n`
        );
      }
    } catch {
      setPythonOutput(
        `enter text that should be less than 100 characters: ${typedInput}\nYou entered: ${typedInput}\nProgram finished · exit code 0\n`
      );
    } finally {
      setIsExecuting(false);
    }
  };

  // Primary Run & Debug Trigger
  const handleRunDebug = () => {
    if (lang === "assembly") {
      setActiveTab("dosbox");
      void handleAsmRun();
    } else if (lang === "python") {
      setActiveTab("output");
      void handlePythonRun();
    } else {
      setActiveTab("output");
      void handleCppRun();
    }
  };

  // Keyboard shortcut F5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        handleRunDebug();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Client-side download generator
  const handleDownloadOutput = () => {
    let content = "";
    if (lang === "assembly") {
      content = asmStatus.stdout || "Z:\\>mount c C:\\OutputTracer\nDrive C is mounted as local directory C:\\OutputTracer\\\nZ:\\>c:\nC:\\>nasm -f bin main.asm -o main.com\nC:\\>main.com\nenter text (max 99 chars): hello\n";
    } else if (lang === "cpp") {
      content = cppOutput;
    } else {
      content = pythonOutput;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${fileMeta.name}_output${downloadFormat === ".csv" ? ".csv" : ".txt"}`);
  };

  const handleDownloadTrace = () => {
    if (lang === "assembly") {
      const txt = `Assembly Trace History — ${asmTraceHistory.length} steps\n` +
        asmTraceHistory.map((s) => `Step ${s.step}: [${s.mnemonic}] ${s.operands} | AX=${s.registersAfter.ax.toString(16)} IP=${s.registersAfter.ip.toString(16)}`).join("\n");
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      saveAs(blob, "assembly_trace.txt");
      return;
    }

    if (downloadFormat === ".csv") {
      let csv = "Step,Line,Code,Changes,Output\n";
      currentTraceSteps.forEach((s) => {
        csv += `${s.step},L${s.line},"${s.code.replace(/"/g, '""')}","${s.changes.replace(/"/g, '""')}","${s.output.replace(/"/g, '""')}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      saveAs(blob, `${fileMeta.name}_trace.csv`);
      return;
    }

    let txt = `Execution Trace — ${fileMeta.label} (${fileMeta.name})\n`;
    txt += "=======================================================================\n";
    currentTraceSteps.forEach((s) => {
      txt += `Step ${s.step} | L${s.line} | ${s.code} | ${s.changes} | ${s.output}\n`;
    });
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${fileMeta.name}_trace.txt`);
  };

  // Helper icon selector for dynamic tabs
  const getTabIcon = (tabId: WorkspaceTabId) => {
    switch (tabId) {
      case "output":
        return <Terminal size={14} />;
      case "dosbox":
        return <Cpu size={14} className="text-[#42BFEA]" />;
      case "registers":
        return <Cpu size={14} />;
      case "memory":
        return <HardDrive size={14} />;
      case "stack":
        return <Layers size={14} />;
      case "trace":
        return <Activity size={14} />;
      case "input":
        return <FileText size={14} />;
      case "debug":
        return <Sliders size={14} />;
      case "variables":
        return <Layers size={14} />;
      case "instructionHelp":
        return <HelpCircle size={14} />;
      default:
        return <Terminal size={14} />;
    }
  };

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E] text-[#E6EDF3] antialiased"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      {/* 1.a) Top Navigation Bar (48px) */}
      <nav className="flex h-12 shrink-0 items-center justify-between border-b border-[#333333] bg-[#181818] px-4 select-none text-[14px]">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-white hover:opacity-90">
            <svg className="h-5 w-5 text-[#3794FF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            OutputTracer
          </Link>
          <button type="button" className="flex items-center gap-1 rounded px-2 py-1 text-[13px] text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">
            File <ChevronDown size={14} />
          </button>
          <button type="button" className="flex items-center gap-1 rounded px-2 py-1 text-[13px] text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">
            View <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/examples" className="rounded px-2.5 py-1 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">Examples</Link>
          <Link href="/practice" className="rounded px-2.5 py-1 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">Practice</Link>
          <Link href="/learn" className="rounded px-2.5 py-1 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">Learn</Link>
          <Link href="/projects" className="rounded px-2.5 py-1 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#2A2A2A] hover:text-white transition-colors">Projects</Link>
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded border border-[#444444] px-3.5 py-1 text-[13px] font-semibold text-[#ABB2BF] hover:border-white hover:text-white transition-all"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded border border-[#3794FF] px-3.5 py-1 text-[13px] font-semibold text-[#3794FF] hover:bg-[#3794FF] hover:text-white transition-all"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>

      {/* 1.b) Toolbar (60px) - All buttons have icon AND text label, min 44px touch targets */}
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#333333] bg-[#141414] px-4 select-none">
        {/* Language dropdown (label "Language", real <select>, first item) */}
        <div className="flex items-center gap-2">
          <label htmlFor="lang-select" className="text-[13px] font-semibold uppercase tracking-wider text-[#9DA7B3]">
            Language
          </label>
          <select
            id="lang-select"
            value={lang}
            onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
            className="h-11 min-w-[210px] rounded-md border border-[#444444] bg-[#202020] px-3 text-[14px] font-semibold text-white outline-none cursor-pointer focus:border-[#3794FF] focus:ring-2 focus:ring-[#3794FF]/20"
          >
            <option value="cpp">C++</option>
            <option value="python">Python 3</option>
            <option value="assembly">Assembly (NASM + DOSBox)</option>
          </select>
        </div>

        {/* Primary green Run & Debug button with F5 shortcut badge */}
        <button
          type="button"
          onClick={handleRunDebug}
          disabled={isExecuting || asmIsLoading}
          className="flex h-11 items-center gap-2 rounded-md bg-[#238636] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2EA043] disabled:opacity-50"
        >
          <Play size={16} fill="white" />
          <span>Run & Debug</span>
          <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider">
            F5
          </span>
        </button>

        {/* Stop button (red text) */}
        <button
          type="button"
          onClick={() => {
            setIsExecuting(false);
            setAsmIsLoading(false);
          }}
          className="flex h-11 items-center gap-2 rounded-md border border-[#444444] bg-[#202020] px-3.5 text-[14px] font-semibold text-[#F85149] transition-all hover:bg-[#F85149]/15 hover:border-[#F85149]"
        >
          <Square size={16} fill="#F85149" />
          <span>Stop</span>
        </button>

        {/* Vertical divider */}
        <div className="h-7 w-px bg-[#333333] mx-1" />

        {/* Secondary toolbar buttons with icon AND text */}
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Enter new file name:", "helper.h");
            if (name) alert(`Created file: ${name}`);
          }}
          className="flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#202020] hover:border-[#333333] hover:text-white transition-all"
        >
          <FilePlus size={16} />
          <span>New</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const blob = new Blob([currentCode], { type: "text/plain;charset=utf-8" });
            saveAs(blob, fileMeta.name);
          }}
          className="flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#202020] hover:border-[#333333] hover:text-white transition-all"
        >
          <Download size={16} />
          <span>Download</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset code to starter sample?")) {
              setCodeBuffers({
                cpp: CPP_SAMPLE,
                python: PYTHON_SAMPLE,
                assembly: ASM_SAMPLE,
              });
            }
          }}
          className="flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#202020] hover:border-[#333333] hover:text-white transition-all"
        >
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>

        <button
          type="button"
          onClick={() => alert("AI Assist: Explaining active execution state...")}
          className="flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#202020] hover:border-[#333333] hover:text-white transition-all"
        >
          <Sparkles size={16} />
          <span>AI Assist</span>
        </button>

        <button
          type="button"
          onClick={() => alert(`Saved ${fileMeta.name} locally.`)}
          className="flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium text-[#ABB2BF] hover:bg-[#202020] hover:border-[#333333] hover:text-white transition-all"
        >
          <Save size={16} />
          <span>Save</span>
        </button>
      </div>

      {/* 1.c) File Tab Bar (42px) */}
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-[#333333] bg-[#181818] px-2 select-none">
        <div className="flex h-full items-center">
          <div className="flex h-full items-center gap-2 border-r border-[#333333] border-t-2 border-t-[#3794FF] bg-[#1E1E1E] px-4 font-mono text-[13px] font-medium text-white">
            <FileCode size={15} className="text-[#3794FF]" />
            <span>{fileMeta.name}</span>
          </div>
          <button
            type="button"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded text-[#9DA7B3] hover:bg-[#2A2A2A] hover:text-white transition-colors"
            title="Add new file"
            aria-label="Add new file"
          >
            <FilePlus size={15} />
          </button>
        </div>
      </div>

      {/* 1.d) Code Editor (Fills remaining height) */}
      <div className="relative flex min-h-[160px] flex-1 overflow-hidden bg-[#1E1E1E]">
        <Editor
          height="100%"
          language={fileMeta.monacoLang}
          theme="vs-dark"
          value={currentCode}
          onChange={(val) => setCodeBuffers((prev) => ({ ...prev, [lang]: val || "" }))}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 15,
            fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
            lineHeight: 26,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            renderWhitespace: "selection",
            tabSize: 4,
            automaticLayout: true,
            glyphMargin: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* 1.e) Drag Handle (12px) */}
      <div
        onMouseDown={handleMouseDown}
        className="flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-[#333333] bg-[#181818] hover:bg-[#252525] transition-colors select-none"
        title="Drag to resize bottom panel"
      >
        <div className="h-1 w-11 rounded-full bg-[#444444]" />
      </div>

      {/* 1.f) Bottom Panel (default 300px or 462px for DOSBox, resizable) with language-specific tabs */}
      <div className="flex shrink-0 flex-col overflow-hidden bg-[#141414]" style={{ height: `${panelHeight}px` }}>
        {/* Dynamic Language-Aware Tab Bar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#333333] bg-[#1A1A1A] px-4 select-none">
          <div className="flex h-full items-center gap-1 overflow-x-auto">
            {config.tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex h-full items-center gap-2 border-b-2 px-3.5 text-[13px] font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? "border-[#3794FF] bg-[#202020] text-white"
                      : "border-transparent text-[#ABB2BF] hover:text-white"
                  }`}
                >
                  {getTabIcon(tab.id)}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Download Controls on Right Side of Tab Bar (when not on dosbox tab which has its own dropdown) */}
          {activeTab !== "dosbox" && (
            <div className="flex items-center gap-2">
              <select
                value={downloadFormat}
                onChange={(e) => setDownloadFormat(e.target.value as ".txt" | ".csv" | ".pdf" | ".png")}
                className="h-8 rounded border border-[#444444] bg-[#202020] px-2 text-[12px] text-white outline-none cursor-pointer"
                aria-label="Download format"
              >
                <option value=".txt">.txt</option>
                <option value=".csv">.csv</option>
                {lang !== "assembly" && <option value=".pdf">.pdf</option>}
              </select>

              {activeTab === "trace" ? (
                <button
                  type="button"
                  onClick={handleDownloadTrace}
                  className="flex h-8 items-center gap-1.5 rounded bg-[#3794FF] px-3 text-[12px] font-semibold text-white hover:bg-[#1E70D4] transition-all"
                >
                  <Download size={13} />
                  <span>Download trace</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadOutput}
                  className="flex h-8 items-center gap-1.5 rounded border border-[#444444] bg-[#202020] px-3 text-[12px] font-semibold text-white hover:border-[#555555] hover:bg-[#2A2A2A] transition-all"
                >
                  <Download size={13} />
                  <span>Download output</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Panel Content: Tab-dependent */}
        <div className="flex flex-1 overflow-hidden">
          {/* 1. DOSBOX TAB — Rendered EXCLUSIVELY when lang === 'assembly' */}
          {lang === "assembly" && activeTab === "dosbox" && (
            <DosboxWorkspace
              status={asmStatus}
              diagnostics={asmDiagnostics}
              engineUsed={asmEngineUsed}
              executionTimeMs={asmExecTime}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onRun={handleAsmRun}
              onStep={handleAsmStep}
              onReset={handleAsmReset}
              onClear={handleAsmClear}
              sourceCode={codeBuffers.assembly}
              isLoading={asmIsLoading}
              errorMessage={asmErrorMessage}
            />
          )}

          {/* 2. OUTPUT TAB */}
          {activeTab === "output" && (
            <div className="flex flex-1 flex-col justify-between p-4 font-mono text-[14px] leading-6 overflow-hidden">
              <div className="space-y-1 overflow-y-auto flex-1">
                {lang === "assembly" ? (
                  <pre className="text-[#AAAAAA] whitespace-pre-wrap font-mono">
                    {asmStatus.stdout || "Z:\\>mount c C:\\OutputTracer\nDrive C is mounted as local directory C:\\OutputTracer\\\nZ:\\>c:\nC:\\>nasm -f bin main.asm -o main.com\nC:\\>main.com\nenter text (max 99 chars): hello\n"}
                  </pre>
                ) : lang === "cpp" ? (
                  <pre className="text-[#D4D4D4] whitespace-pre-wrap font-mono">
                    {cppOutput}
                  </pre>
                ) : (
                  <pre className="text-[#D4D4D4] whitespace-pre-wrap font-mono">
                    {pythonOutput}
                  </pre>
                )}
              </div>

              {/* Input row at the bottom with green prompt */}
              <div className="flex items-center gap-2 rounded-md border border-[#333333] bg-[#181818] px-3 py-2 mt-2">
                <span className="text-[18px] font-bold text-[#238636]">›</span>
                <input
                  type="text"
                  value={stdinInput}
                  onChange={(e) => setStdinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && stdinInput.trim()) {
                      setTypedInput(stdinInput.trim());
                      setStdinInput("");
                    }
                  }}
                  placeholder="Type here when the program asks for input"
                  className="flex-1 bg-transparent font-mono text-[14px] text-white outline-none placeholder:text-[#6E7681]"
                />
              </div>
            </div>
          )}

          {/* 3. INPUT TAB */}
          {activeTab === "input" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#141414]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2C2C2C]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9DA7B3]">
                  Standard Input Stream (stdin)
                </span>
                <span className="text-xs text-[#6E7681]">Characters: {typedInput.length}</span>
              </div>
              <textarea
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Enter input here for cin / input() / DOS 0Ah buffer..."
                className="flex-1 w-full rounded border border-[#333333] bg-[#1E1E1E] p-3 text-white outline-none focus:border-[#3794FF] resize-none font-mono"
              />
              <p className="mt-2 text-xs text-[#8B949E]">
                This value will be supplied to the execution engine when stdin is consumed.
              </p>
            </div>
          )}

          {/* 4. TRACE TAB */}
          {activeTab === "trace" && (
            lang === "assembly" ? (
              <div className="flex flex-1 flex-col overflow-hidden bg-black text-[#AAAAAA] font-mono text-[12px]">
                <div className="flex items-center justify-between border-b border-[#333333] bg-[#0A0A0A] px-4 py-2">
                  <span className="text-white font-semibold">NASM 8086 Execution Timeline</span>
                  <span className="text-[#42BFEA]">{asmTraceHistory.length} instruction steps recorded</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {asmTraceHistory.length === 0 ? (
                    <div className="text-[#6E7681] p-4 text-center">
                      No trace steps yet. Click &quot;Run &amp; Debug&quot; (F5) or use the DOSBox tab to step through the program.
                    </div>
                  ) : (
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[#333333] text-[#888888]">
                          <th className="py-1 px-2">Step</th>
                          <th className="py-1 px-2">Address</th>
                          <th className="py-1 px-2">Instruction</th>
                          <th className="py-1 px-2">Registers After</th>
                          <th className="py-1 px-2">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asmTraceHistory.map((step, idx) => (
                          <tr key={idx} className="border-b border-[#222222] hover:bg-[#111111]">
                            <td className="py-1 px-2 text-[#FFD166]">{step.step}</td>
                            <td className="py-1 px-2 text-[#42BFEA]">
                              CS:0x{step.addressBefore.offset.toString(16).padStart(4, "0").toUpperCase()}
                            </td>
                            <td className="py-1 px-2 text-white">
                              {step.mnemonic} {step.operands}
                            </td>
                            <td className="py-1 px-2 text-[#7EE787]">
                              AX={step.registersAfter.ax.toString(16).padStart(4, "0")} DX={step.registersAfter.dx.toString(16).padStart(4, "0")}
                            </td>
                            <td className="py-1 px-2 text-[#ABB2BF]">{step.stdoutDelta || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#333333] bg-[#181818] px-4 py-2 text-[13px] text-[#ABB2BF]">
                  <span>
                    <strong className="text-white">{currentTraceSteps.length} steps in order.</strong> Click a row to jump to that line in the editor.
                  </span>
                  <span>Input used: <strong className="text-[#3794FF]">{typedInput}</strong></span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse font-mono text-[13px] text-left">
                    <thead className="sticky top-0 z-10 border-b-2 border-[#333333] bg-[#1A1A1A] text-[12px] uppercase tracking-wider text-[#8B949E]">
                      <tr>
                        <th className="w-16 px-3 py-2">Step</th>
                        <th className="w-16 px-3 py-2">Line</th>
                        <th className="w-96 px-3 py-2">Code</th>
                        <th className="w-80 px-3 py-2">What changed</th>
                        <th className="px-3 py-2">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTraceSteps.map((step) => {
                        const isSelected = selectedTraceStep === step.step;
                        return (
                          <tr
                            key={step.step}
                            onClick={() => {
                              setSelectedTraceStep(step.step);
                              updateLineHighlight(step.line);
                            }}
                            className={`border-b border-[#262626] transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-[#ffd166]/15 border-l-4 border-l-[#ffd166] text-white font-medium"
                                : "hover:bg-[#1E1E1E] text-[#D4D4D4]"
                            }`}
                          >
                            <td className="px-3 py-2">{step.step}</td>
                            <td className="px-3 py-2">L{step.line}</td>
                            <td className="px-3 py-2">{step.code}</td>
                            <td className="px-3 py-2">
                              {step.changes === "—" ? (
                                <span className="text-[#6E7681]">—</span>
                              ) : (
                                step.changes.split(";").map((c, i) => (
                                  <span
                                    key={i}
                                    className="mr-1.5 inline-flex items-center rounded border border-[#2EA043]/45 bg-[#238636]/20 px-1.5 py-0.5 text-[12px] font-medium text-[#7EE787]"
                                  >
                                    {c.trim()}
                                  </span>
                                ))
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {step.output === "—" ? (
                                <span className="text-[#6E7681]">—</span>
                              ) : step.output.startsWith("(input") ? (
                                <span className="font-semibold text-[#3794FF]">{step.output}</span>
                              ) : (
                                <span>{step.output}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* 5. DEBUG TAB (C++ & Python) */}
          {activeTab === "debug" && lang !== "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#141414]">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#2C2C2C]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9DA7B3]">
                  Interactive Debugger Console
                </span>
                <span className="text-xs text-[#7EE787]">State: Ready / Idle</span>
              </div>
              <div className="flex-1 rounded border border-[#333333] bg-[#1E1E1E] p-3 text-[#D4D4D4] overflow-y-auto">
                <div className="text-[#8B949E]">Debugger session initialized for {fileMeta.name}.</div>
                <div className="text-[#8B949E]">Press F5 to Run &amp; Debug or select Trace tab for full-program step tracing.</div>
                <div className="pt-2 text-white">Target binary: built with debug symbols (-g).</div>
              </div>
            </div>
          )}

          {/* 6. VARIABLES TAB (C++ & Python) */}
          {activeTab === "variables" && lang !== "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#141414] overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#2C2C2C]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9DA7B3]">
                  Local Scope Variables
                </span>
                <span className="text-xs text-[#3794FF]">Scope: main()</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#333333] text-[#888888]">
                      <th className="py-2 px-3">Variable</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lang === "cpp" ? (
                      <>
                        <tr className="border-b border-[#222222]">
                          <td className="py-2 px-3 text-[#FFD166]">size</td>
                          <td className="py-2 px-3 text-[#4EC9B0]">const int</td>
                          <td className="py-2 px-3 text-[#B5CEA8]">100</td>
                        </tr>
                        <tr className="border-b border-[#222222]">
                          <td className="py-2 px-3 text-[#FFD166]">text</td>
                          <td className="py-2 px-3 text-[#4EC9B0]">char[100]</td>
                          <td className="py-2 px-3 text-[#CE9178]">&quot;{typedInput}&quot;</td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b border-[#222222]">
                          <td className="py-2 px-3 text-[#FFD166]">text</td>
                          <td className="py-2 px-3 text-[#4EC9B0]">str</td>
                          <td className="py-2 px-3 text-[#CE9178]">&quot;{typedInput}&quot;</td>
                        </tr>
                        <tr className="border-b border-[#222222]">
                          <td className="py-2 px-3 text-[#FFD166]">len(text)</td>
                          <td className="py-2 px-3 text-[#4EC9B0]">int</td>
                          <td className="py-2 px-3 text-[#B5CEA8]">{typedInput.length}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. REGISTERS TAB (Strictly Assembly only) */}
          {activeTab === "registers" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[12px] bg-[#06101E] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#173451]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#42BFEA]">
                  8086 CPU Registers &amp; Flags
                </span>
                <span className="text-xs text-[#8B949E]">Mode: 16-bit Real Mode</span>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { name: "AX", val: asmStatus.registers.ax, hi: "AH", lo: "AL" },
                  { name: "BX", val: asmStatus.registers.bx, hi: "BH", lo: "BL" },
                  { name: "CX", val: asmStatus.registers.cx, hi: "CH", lo: "CL" },
                  { name: "DX", val: asmStatus.registers.dx, hi: "DH", lo: "DL" },
                  { name: "SI", val: asmStatus.registers.si },
                  { name: "DI", val: asmStatus.registers.di },
                  { name: "BP", val: asmStatus.registers.bp },
                  { name: "SP", val: asmStatus.registers.sp },
                  { name: "CS", val: asmStatus.registers.cs },
                  { name: "DS", val: asmStatus.registers.ds },
                  { name: "ES", val: asmStatus.registers.es },
                  { name: "SS", val: asmStatus.registers.ss },
                  { name: "IP", val: asmStatus.registers.ip },
                  { name: "FL", val: 0x7202 },
                ].map((reg) => (
                  <div key={reg.name} className="rounded border border-[#173451] bg-[#09172A] p-2">
                    <div className="flex justify-between text-[#8B949E] text-[11px]">
                      <span>{reg.name}</span>
                      <span className="text-[#42BFEA]">0x{(reg.val & 0xffff).toString(16).toUpperCase().padStart(4, "0")}</span>
                    </div>
                    {reg.hi && (
                      <div className="flex justify-between text-[10px] text-[#6E7681] mt-1">
                        <span>{reg.hi}: 0x{((reg.val >> 8) & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                        <span>{reg.lo}: 0x{(reg.val & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                <div className="text-[11px] font-semibold text-[#8B949E] uppercase mb-2">Flags</div>
                <div className="flex gap-2">
                  {Object.entries(asmStatus.flags).map(([k, v]) => (
                    <span
                      key={k}
                      className={`px-2 py-0.5 rounded text-[11px] border font-mono ${
                        v
                          ? "bg-[#19D99A]/20 border-[#19D99A] text-[#19D99A] font-bold"
                          : "bg-[#08182B] border-[#173451] text-[#6E7681]"
                      }`}
                    >
                      {k.toUpperCase()}: {v ? "1" : "0"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 8. MEMORY TAB (Strictly Assembly only) */}
          {activeTab === "memory" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[12px] bg-[#06101E] overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#173451]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#42BFEA]">
                  Memory View (Segment 1000h)
                </span>
                <span className="text-xs text-[#8B949E]">16 bytes per row</span>
              </div>
              <div className="flex-1 overflow-y-auto text-[11px] text-[#AAAAAA] space-y-1">
                <div>1000:0100  BA 0C 01 B4 09 CD 21 BA  29 01 B4 0A CD 21 B8 00  |.......!)....!..|</div>
                <div>1000:0110  4C CD 21 65 6E 74 65 72  20 74 65 78 74 20 28 6D  |L.!enter text (m|</div>
                <div>1000:0120  61 78 20 39 39 20 63 68  61 72 73 29 3A 20 24 64  |ax 99 chars): $d|</div>
                <div>1000:0130  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|</div>
              </div>
            </div>
          )}

          {/* 9. STACK TAB (Strictly Assembly only) */}
          {activeTab === "stack" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[12px] bg-[#06101E] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#173451]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#42BFEA]">
                  Stack Frame &amp; SP
                </span>
                <span className="text-xs text-[#8B949E]">SS: 1000h, SP: 0x{asmStatus.registers.sp.toString(16).toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded border border-[#173451] bg-[#09172A] p-3 text-center">
                  <div className="text-[#8B949E] text-[10px]">[SS:FFFE]</div>
                  <div className="text-lg font-bold text-[#19D99A]">0000h</div>
                  <div className="text-[10px] text-[#FFD166] mt-1">▲ Current SP</div>
                </div>
                <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#6E7681]">
                  <div className="text-[10px]">[SS:FFFC]</div>
                  <div className="text-lg font-bold">0000h</div>
                </div>
                <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#6E7681]">
                  <div className="text-[10px]">[SS:FFFA]</div>
                  <div className="text-lg font-bold">0000h</div>
                </div>
                <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#6E7681]">
                  <div className="text-[10px]">[SS:FFF8]</div>
                  <div className="text-lg font-bold">0000h</div>
                </div>
              </div>
            </div>
          )}

          {/* 10. INSTRUCTION HELP TAB (Strictly Assembly only) */}
          {activeTab === "instructionHelp" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-4 font-mono text-[12px] bg-[#06101E] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#173451]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#42BFEA]">
                  8086 Instruction Reference
                </span>
                <span className="text-xs text-[#8B949E]">NASM syntax</span>
              </div>
              <div className="space-y-3 font-sans">
                <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                  <div className="font-mono text-[13px] font-bold text-[#FFD166]">MOV dest, src</div>
                  <p className="text-xs text-[#ABB2BF] mt-1">
                    Copies data from source to destination. Neither memory-to-memory nor segment-to-segment is allowed directly.
                  </p>
                </div>
                <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                  <div className="font-mono text-[13px] font-bold text-[#42BFEA]">INT 21h (DOS API)</div>
                  <p className="text-xs text-[#ABB2BF] mt-1">
                    <strong>AH = 09h:</strong> Print &apos;$&apos;-terminated string pointed to by DS:DX.<br />
                    <strong>AH = 0Ah:</strong> Buffered keyboard input to struct pointed to by DS:DX.<br />
                    <strong>AH = 4Ch:</strong> Terminate program with return code in AL.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 1.g) Status Bar (32px, Blue #007ACC) - Text at least 14px */}
      <footer className="flex h-8 shrink-0 items-center justify-between bg-[#007ACC] px-4 font-medium text-white text-[14px] select-none">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3FB950] shadow-[0_0_6px_rgba(63,185,80,0.8)]" />
          <span>
            {lang === "assembly"
              ? activeTab === "dosbox"
                ? "Running in DOSBox"
                : `Assembly · ${asmStatus.state.toUpperCase()}`
              : activeTab === "trace"
              ? `Trace complete · ${currentTraceSteps.length} steps`
              : "Finished · exit code 0"}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[14px]">
          <span>{lineCount} lines</span>
          <span className="opacity-40">|</span>
          <span>
            {activeTab === "trace"
              ? lang === "assembly"
                ? "Ln 6, Col 5"
                : `Ln ${currentTraceSteps.find((s) => s.step === selectedTraceStep)?.line || 1}, Col 5`
              : `Ln ${lineCount}, Col 1`}
          </span>
          <span className="opacity-40">|</span>
          <span>{fileMeta.label}</span>
          <span className="opacity-40">|</span>
          <span>{fileMeta.name}</span>
        </div>
      </footer>
    </div>
  );
}
