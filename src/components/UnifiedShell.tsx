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
} from "lucide-react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { useAuth } from "@/components/AuthProvider";

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

type SupportedLang = "cpp" | "python" | "asm";

export default function UnifiedShell() {
  const { user, signOut } = useAuth();
  const [lang, setLang] = useState<SupportedLang>("cpp");
  const [panelTab, setPanelTab] = useState<"debug" | "trace">("debug");
  const [panelHeight, setPanelHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);

  // Per-language code buffers
  const [codeBuffers, setCodeBuffers] = useState({
    cpp: CPP_SAMPLE,
    python: PYTHON_SAMPLE,
    asm: ASM_SAMPLE,
  });

  // Stdin & interactive output state
  const [stdinInput, setStdinInput] = useState("");
  const [typedInput, setTypedInput] = useState("hello");
  const [selectedTraceStep, setSelectedTraceStep] = useState<number>(5); // default step 5 in C++, step 3 in python
  const [downloadFormat, setDownloadFormat] = useState<".txt" | ".csv" | ".pdf" | ".png">(".csv");

  // Monaco editor references & active line decorations
  const editorRef = useRef<Parameters<NonNullable<OnMount>>[0] | null>(null);
  const monacoRef = useRef<Parameters<NonNullable<OnMount>>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // DOSBox Step counter
  const [dosStep, setDosStep] = useState(2);

  // File metadata based on active language
  const fileMeta = {
    cpp: { name: "main.cpp", label: "C++", monacoLang: "cpp" },
    python: { name: "main.py", label: "Python 3", monacoLang: "python" },
    asm: { name: "main.asm", label: "Assembly (NASM + DOSBox)", monacoLang: "assembly" },
  }[lang];

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
    if (panelTab === "trace") {
      if (lang === "asm") {
        updateLineHighlight(6); // line 6: mov ah, 09h
      } else {
        const step = currentTraceSteps.find((s) => s.step === selectedTraceStep);
        if (step) updateLineHighlight(step.line);
      }
    } else {
      updateLineHighlight(undefined);
    }
  }, [panelTab, selectedTraceStep, lang, currentTraceSteps, updateLineHighlight]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // Language change handler
  const handleLanguageChange = (newLang: SupportedLang) => {
    setLang(newLang);
    if (newLang === "cpp") {
      setSelectedTraceStep(5);
      setDownloadFormat(".csv");
    } else if (newLang === "python") {
      setSelectedTraceStep(3);
      setDownloadFormat(".csv");
    } else {
      setDownloadFormat(".png");
      if (panelHeight < 440) setPanelHeight(462);
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

  // Client-side download generators (.txt, .csv, .pdf, .png)
  const handleDownloadOutput = () => {
    let content = "";
    if (lang === "asm") {
      content = "Z:\\>mount c C:\\OutputTracer\nDrive C is mounted as local directory C:\\OutputTracer\\\nZ:\\>c:\nC:\\>nasm -f bin main.asm -o main.com\nC:\\>main.com\nenter text (max 99 chars): hello\n";
    } else if (lang === "cpp") {
      content = "enter text that should be less than 100 character\nhello\nYou entered: hello\nProgram finished · exit code 0\n";
    } else {
      content = "enter text that should be less than 100 characters: hello\nYou entered: hello\nProgram finished · exit code 0\n";
    }

    if (downloadFormat === ".png" || (lang === "asm" && downloadFormat === ".png")) {
      // Create PNG canvas
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 640, 400);
        ctx.fillStyle = "#0000aa";
        ctx.fillRect(0, 0, 640, 24);
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px monospace";
        ctx.fillText("DOSBox 0.74-3, Cpu speed: 3000 cycles, Program: MAIN", 12, 16);
        ctx.fillStyle = "#aaaaaa";
        ctx.font = "14px monospace";
        const lines = content.split("\n");
        lines.forEach((l, idx) => {
          ctx.fillText(l, 14, 50 + idx * 22);
        });
        canvas.toBlob((blob) => {
          if (blob) saveAs(blob, "dosbox_screen.png");
        });
      }
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${fileMeta.name}_output${downloadFormat === ".csv" ? ".csv" : ".txt"}`);
  };

  const handleDownloadTrace = () => {
    if (lang === "asm") {
      if (downloadFormat === ".png") {
        // Generate debugger capture image
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, 800, 480);
          ctx.fillStyle = "#55ff55";
          ctx.font = "13px monospace";
          ctx.fillText("DOSBox Debugger Snapshot — IP: 0102h", 20, 24);
          ctx.fillStyle = "#aaaaaa";
          ctx.fillText("AX: 0000h  BX: 0000h  CX: 00FFh  DX: 010Ch  SP: FFFEh  BP: 0000h", 20, 60);
          ctx.fillText("CS: 1000h  DS: 1000h  ES: 1000h  SS: 1000h  FL: 7202h (IF=1)", 20, 85);
          ctx.fillStyle = "#ffd166";
          ctx.fillText("1000:0103 B409     MOV AH,09  <-- CURRENT INSTRUCTION", 20, 130);
          ctx.fillStyle = "#aaaaaa";
          ctx.fillText("1000:0105 CD21     INT 21", 20, 155);
          ctx.fillText("1000:0107 BA2901   MOV DX,0129", 20, 180);
          canvas.toBlob((blob) => {
            if (blob) saveAs(blob, "dosbox_debugger_trace.png");
          });
        }
        return;
      }
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

    if (downloadFormat === ".txt" || downloadFormat === ".pdf") {
      let txt = `Execution Trace — ${fileMeta.label} (${fileMeta.name})\n`;
      txt += "=======================================================================\n";
      currentTraceSteps.forEach((s) => {
        txt += `Step ${s.step} | L${s.line} | ${s.code} | ${s.changes} | ${s.output}\n`;
      });
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      saveAs(blob, `${fileMeta.name}_trace.${downloadFormat === ".pdf" ? "txt" : "txt"}`);
    }
  };

  // Keyboard shortcut F5 / Shift+F5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        setPanelTab("debug");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E] text-[#E6EDF3] antialiased" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
            onChange={(e) => handleLanguageChange(e.target.value as SupportedLang)}
            className="h-11 min-w-[210px] rounded-md border border-[#444444] bg-[#202020] px-3 text-[14px] font-semibold text-white outline-none cursor-pointer focus:border-[#3794FF] focus:ring-2 focus:ring-[#3794FF]/20"
          >
            <option value="cpp">C++</option>
            <option value="python">Python 3</option>
            <option value="asm">Assembly (NASM + DOSBox)</option>
          </select>
        </div>

        {/* Primary green Run & Debug button with F5 shortcut badge */}
        <button
          type="button"
          onClick={() => setPanelTab("debug")}
          className="flex h-11 items-center gap-2 rounded-md bg-[#238636] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2EA043]"
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
                asm: ASM_SAMPLE,
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

      {/* 1.f) Bottom Panel (default 300px or 462px for DOSBox, resizable) with two tabs: Debug & Trace */}
      <div className="flex shrink-0 flex-col overflow-hidden bg-[#141414]" style={{ height: `${panelHeight}px` }}>
        {/* Panel Header & Tabs */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#333333] bg-[#1A1A1A] px-4 select-none">
          <div className="flex h-full items-center gap-1">
            <button
              type="button"
              onClick={() => setPanelTab("debug")}
              className={`flex h-full items-center gap-2 border-b-2 px-4 text-[13px] font-semibold transition-all ${
                panelTab === "debug"
                  ? "border-[#3794FF] bg-[#202020] text-white"
                  : "border-transparent text-[#ABB2BF] hover:text-white"
              }`}
            >
              <Terminal size={15} />
              <span>Debug</span>
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("trace")}
              className={`flex h-full items-center gap-2 border-b-2 px-4 text-[13px] font-semibold transition-all ${
                panelTab === "trace"
                  ? "border-[#3794FF] bg-[#202020] text-white"
                  : "border-transparent text-[#ABB2BF] hover:text-white"
              }`}
            >
              <Activity size={15} />
              <span>Trace</span>
            </button>
          </div>

          {/* Download Controls on Right Side of Tab Bar */}
          <div className="flex items-center gap-2">
            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value as ".txt" | ".csv" | ".pdf" | ".png")}
              className="h-8 rounded border border-[#444444] bg-[#202020] px-2 text-[12px] text-white outline-none cursor-pointer"
              aria-label="Download format"
            >
              {lang === "asm" ? (
                <>
                  <option value=".txt">.txt</option>
                  <option value=".csv">.csv</option>
                  <option value=".png">.png</option>
                </>
              ) : (
                <>
                  <option value=".txt">.txt</option>
                  <option value=".csv">.csv</option>
                  <option value=".pdf">.pdf</option>
                </>
              )}
            </select>

            {panelTab === "debug" ? (
              <button
                type="button"
                onClick={handleDownloadOutput}
                className="flex h-8 items-center gap-1.5 rounded border border-[#444444] bg-[#202020] px-3 text-[12px] font-semibold text-white hover:border-[#555555] hover:bg-[#2A2A2A] transition-all"
              >
                <Download size={13} />
                <span>Download output</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadTrace}
                className="flex h-8 items-center gap-1.5 rounded bg-[#3794FF] px-3 text-[12px] font-semibold text-white hover:bg-[#1E70D4] transition-all"
              >
                <Download size={13} />
                <span>Download trace</span>
              </button>
            )}
          </div>
        </div>

        {/* Panel Content: Tab-dependent */}
        <div className="flex flex-1 overflow-hidden">
          {panelTab === "debug" ? (
            /* DEBUG TAB: "run it and see the output" */
            lang === "asm" ? (
              /* DOSBox Window for Assembly */
              <div className="flex flex-1 flex-col bg-black font-mono">
                <div className="flex items-center justify-between bg-[#0000AA] px-3 py-1 text-[12px] font-bold text-white tracking-wider">
                  <span>DOSBox 0.74-3, Cpu speed: 3000 cycles, Program: MAIN</span>
                  <span className="font-normal text-[#FFFF55]">Click inside and type when asked for input</span>
                </div>
                <div className="flex-1 p-4 font-mono text-[14px] leading-6 text-[#AAAAAA]">
                  <div>Z:\&gt;mount c C:\OutputTracer</div>
                  <div>Drive C is mounted as local directory C:\OutputTracer\</div>
                  <div>Z:\&gt;c:</div>
                  <div>C:\&gt;nasm -f bin main.asm -o main.com</div>
                  <div>C:\&gt;main.com</div>
                  <div className="flex items-center">
                    <span>enter text (max 99 chars):&nbsp;</span>
                    <span className="font-bold text-[#3794FF]">{typedInput}</span>
                    <span className="inline-block h-4 w-2 bg-[#AAAAAA] align-sub animate-pulse ml-0.5" />
                  </div>
                </div>
              </div>
            ) : (
              /* Standard Monospace Terminal Output for C++ and Python */
              <div className="flex flex-1 flex-col justify-between p-4 font-mono text-[14px] leading-6">
                <div className="space-y-1">
                  <div className="text-[#D4D4D4]">
                    {lang === "cpp"
                      ? "enter text that should be less than 100 character"
                      : "enter text that should be less than 100 characters: "}
                  </div>
                  <div className="font-bold text-[#3794FF]">{typedInput}</div>
                  <div className="text-[#D4D4D4]">You entered: {typedInput}</div>
                  <div className="text-[#8B949E] pt-2">Program finished · exit code 0</div>
                </div>

                {/* Input row at the bottom with green prompt */}
                <div className="flex items-center gap-2 rounded-md border border-[#333333] bg-[#181818] px-3 py-2">
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
            )
          ) : (
            /* TRACE TAB: "show every line that ran, in order, for the WHOLE program" */
            lang === "asm" ? (
              /* DOSBox Debugger Replica (80x25 screen) */
              <div className="grid flex-1 grid-cols-[820px_1fr] bg-black text-[#AAAAAA] font-mono text-[12px] leading-4 overflow-hidden">
                {/* Left: Authentic 80x25 DOSBox Debugger */}
                <div className="flex flex-col border-r border-[#333333]">
                  {/* Registers & Flags */}
                  <div className="grid grid-cols-[500px_1fr] border-b border-[#333333] bg-[#0A0A0A] p-2">
                    <div className="grid grid-cols-4 gap-x-4 gap-y-1 font-mono">
                      <div className="flex justify-between"><span className="text-[#888]">AX</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">BX</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">CX</span><span className="text-[#55FF55]">00FF</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">DX</span><span className="text-[#FFD166] font-bold">010C</span></div>

                      <div className="flex justify-between"><span className="text-[#888]">SI</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">DI</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">BP</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">SP</span><span className="text-[#55FF55]">FFFE</span></div>

                      <div className="flex justify-between"><span className="text-[#888]">CS</span><span className="text-[#55FF55]">1000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">DS</span><span className="text-[#55FF55]">1000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">ES</span><span className="text-[#55FF55]">1000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">SS</span><span className="text-[#55FF55]">1000</span></div>

                      <div className="flex justify-between"><span className="text-[#888]">HS</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">FS</span><span className="text-[#55FF55]">0000</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">IP</span><span className="text-[#FFFF55]">0102</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">FL</span><span className="text-[#55FF55]">7202</span></div>
                    </div>

                    <div className="border-l border-[#333333] pl-3 flex flex-col gap-1">
                      <div className="text-[11px] text-[#888]">Stack: +0[0000] +2[0000]</div>
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="text-[#555]">OF</span>
                        <span className="text-[#555]">DF</span>
                        <span className="text-[#55FF55] font-bold">IF</span>
                        <span className="text-[#555]">SF</span>
                        <span className="text-[#555]">ZF</span>
                        <span className="text-[#555]">AF</span>
                        <span className="text-[#555]">PF</span>
                        <span className="text-[#555]">CF</span>
                      </div>
                      <div className="flex gap-2 text-[10px] text-[#666]">
                        <span>0</span><span>0</span><span className="text-[#55FF55]">1</span><span>0</span><span>0</span><span>0</span><span>0</span><span>0</span>
                      </div>
                    </div>
                  </div>

                  {/* CMD Box */}
                  <div className="border-b border-[#333333] bg-[#111111] px-3 py-1 font-mono">
                    <span className="font-bold text-[#55FF55]">CMD &gt;</span> t
                  </div>

                  {/* Middle Split: Disassembly + Memory Pane 1 */}
                  <div className="grid grid-cols-[460px_1fr] flex-1 border-b border-[#333333] overflow-hidden">
                    {/* Disassembly */}
                    <div className="border-r border-[#333333] p-2 space-y-0.5 overflow-y-auto">
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:0100</span> BA0C01   MOV DX,010C</div>
                      <div className="flex gap-3 bg-[#AAAAAA] text-black font-bold px-1"><span className="text-black">1000:0103</span> B409     MOV AH,09</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:0105</span> CD21     INT 21</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:0107</span> BA2901   MOV DX,0129</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:010A</span> B40A     MOV AH,0A</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:010C</span> CD21     INT 21</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:010E</span> B8004C   MOV AX,4C00</div>
                      <div className="flex gap-3"><span className="text-[#55FF55]">1000:0111</span> CD21     INT 21</div>
                    </div>

                    {/* Memory Pane 1 */}
                    <div className="p-2 overflow-y-auto text-[11px]">
                      <div className="text-[#666] border-b border-[#222] pb-1 mb-1">ADDR      0  1  2  3  4  5  6  7</div>
                      <div>1000:0000 CD 20 00 00 00 00 00 00</div>
                      <div>1000:0008 00 00 00 00 00 00 00 00</div>
                      <div>1000:0100 BA 0C 01 B4 09 CD 21 BA</div>
                      <div>1000:0108 29 01 B4 0A CD 21 B8 00</div>
                      <div>1000:0110 4C CD 21 65 6E 74 65 72</div>
                      <div>1000:0118 20 74 65 78 74 20 28 6D</div>
                    </div>
                  </div>

                  {/* Memory Pane 2 */}
                  <div className="h-20 border-b border-[#333333] bg-[#080808] p-2 overflow-y-auto text-[11px]">
                    <div className="text-[#666] mb-1">DS:0000  0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F   0123456789ABCDEF</div>
                    <div>1000:0100 BA 0C 01 B4 09 CD 21 BA 29 01 B4 0A CD 21 B8 00  :......!)....!..</div>
                    <div>1000:0110 4C CD 21 65 6E 74 65 72 20 74 65 78 74 20 28 6D  L.!enter text (m</div>
                  </div>

                  {/* 10 Clickable Function Keys */}
                  <div className="flex h-7 border-t border-[#000088] bg-[#0000AA]">
                    {[
                      { key: "1", label: "Step" },
                      { key: "2", label: "ProcStep" },
                      { key: "3", label: "Retrieve" },
                      { key: "4", label: "Help ON" },
                      { key: "5", label: "BRK Menu" },
                      { key: "6", label: "(unused)" },
                      { key: "7", label: "up" },
                      { key: "8", label: "dn" },
                      { key: "9", label: "le" },
                      { key: "10", label: "ri" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          if (f.key === "1") setDosStep((prev) => prev + 1);
                        }}
                        className="flex flex-1 items-center justify-center gap-1 border-r border-[#000088] text-[11px] font-semibold text-white hover:bg-[#2222DD]"
                      >
                        <span className="font-bold text-[#FFFF55]">{f.key}</span>
                        <span>{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Visual Explanation Panel */}
                <div className="flex flex-col gap-3 p-3 overflow-y-auto bg-[#141414] font-sans">
                  <div className="rounded border border-[#2E2E2E] bg-[#1C1C1C] p-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#8B949E] mb-1">
                      Next Instruction
                    </span>
                    <div className="font-mono text-[13px] font-bold text-[#FFD166]">
                      MOV AH, 09h
                    </div>
                    <div className="text-[12px] text-[#9DA7B3] mt-1">
                      Prepares DOS sub-function 09h: output string ending with &apos;$&apos; at address pointed by DS:DX.
                    </div>
                  </div>

                  <div className="rounded border border-[#2E2E2E] bg-[#1C1C1C] p-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#8B949E] mb-1">
                      Register Change
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded bg-[#238636]/25 border border-[#2EA043]/40 px-2 py-0.5 font-mono text-[12px] text-[#7EE787]">
                        DX: 0000h → 010Ch
                      </span>
                      <span className="text-[11px] text-[#9DA7B3]">(&amp;prompt)</span>
                    </div>
                  </div>

                  <div className="rounded border border-[#2E2E2E] bg-[#1C1C1C] p-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#8B949E] mb-1.5">
                      CPU Flags (FL 7202h)
                    </span>
                    <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
                      {["OF", "DF", "IF", "SF", "ZF", "AF", "PF", "CF"].map((fl) => (
                        <div
                          key={fl}
                          className={`flex justify-between rounded border px-1.5 py-0.5 ${
                            fl === "IF"
                              ? "border-[#238636] bg-[#238636]/25 text-[#7EE787] font-bold"
                              : "border-[#333] bg-[#242424] text-[#888]"
                          }`}
                        >
                          <span>{fl}</span>
                          <span>{fl === "IF" ? "1" : "0"}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-[#2E2E2E] bg-[#1C1C1C] p-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#8B949E] mb-1">
                      Stack Memory
                    </span>
                    <div className="flex gap-2 font-mono text-[11px]">
                      <div className="flex-1 rounded border border-[#333] bg-[#222] p-1 text-center">
                        <div className="text-[#888]">[FFFE]</div>
                        <div className="text-[#55FF55]">0000h</div>
                        <div className="text-[10px] font-bold text-[#FFD166]">▲ SP</div>
                      </div>
                      <div className="flex-1 rounded border border-[#282828] bg-[#1A1A1A] p-1 text-center text-[#555]">
                        <div>[FFFC]</div>
                        <div>0000h</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* C++ & Python 3 Full-Program Step Trace Table */
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
        </div>
      </div>

      {/* 1.g) Status Bar (32px, Blue #007ACC) - Text at least 14px */}
      <footer className="flex h-8 shrink-0 items-center justify-between bg-[#007ACC] px-4 font-medium text-white text-[14px] select-none">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3FB950] shadow-[0_0_6px_rgba(63,185,80,0.8)]" />
          <span>
            {panelTab === "debug"
              ? lang === "asm"
                ? "Running in DOSBox"
                : "Finished · exit code 0"
              : lang === "asm"
              ? `Paused at line 6 · IP 0102 · Step ${dosStep}`
              : `Trace complete · ${currentTraceSteps.length} steps`}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[14px]">
          <span>{lineCount} lines</span>
          <span className="opacity-40">|</span>
          <span>
            {panelTab === "trace"
              ? lang === "asm"
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
