"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { consumePendingExample } from "@/lib/examples";
import Link from "next/link";
import Image from "next/image";
import { saveAs } from "file-saver";
import {
  FileCode,
  FilePlus,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Layers,
  HelpCircle,
  FileText,
  Sliders,
  Download,
  RotateCcw,
  FolderOpen,
  Target,
  BookOpen,
  Search,
  ArrowRight,
  Plus,
  Save,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { useAuth } from "@/components/AuthProvider";
import DosboxWorkspace from "@/components/asm/DosboxWorkspace";
import ProgramConsole from "@/components/ProgramConsole";
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
      <span className="font-mono text-xs text-[#858585]">Loading editor…</span>
    </div>
  ),
});

// Sample Programs per Language
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

// Five Categories for Examples Dropdown
interface ExampleItem {
  id: string;
  title: string;
  desc: string;
  code: string;
  category: string;
}

interface ExampleCategory {
  id: string;
  title: string;
  desc: string;
  icon: typeof Terminal;
  examples: ExampleItem[];
}

const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    id: "basics",
    title: "C++ Basics",
    desc: "Variables, conditions, loops, and functions",
    icon: Terminal,
    examples: [
      {
        id: "basic-arithmetic",
        title: "Basic Arithmetic",
        desc: "Variables and simple operations",
        category: "C++ Basics",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int a = 10;\n    int b = 20;\n    cout << "Sum: " << a + b << endl;\n    return 0;\n}`,
      },
      {
        id: "if-else",
        title: "If / Else Conditions",
        desc: "Branching logic with conditionals",
        category: "C++ Basics",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int score = 85;\n    if (score >= 90) cout << "Grade: A" << endl;\n    else if (score >= 80) cout << "Grade: B" << endl;\n    else cout << "Grade: C" << endl;\n    return 0;\n}`,
      },
      {
        id: "for-loop",
        title: "For Loops",
        desc: "Counter-controlled iteration",
        category: "C++ Basics",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    for (int i = 1; i <= 5; i++) {\n        cout << "Step " << i << endl;\n    }\n    return 0;\n}`,
      },
      {
        id: "functions",
        title: "Function Calls",
        desc: "Parameter passing and return values",
        category: "C++ Basics",
        code: `#include <iostream>\nusing namespace std;\n\nint multiply(int x, int y) {\n    return x * y;\n}\n\nint main() {\n    cout << "Result: " << multiply(6, 7) << endl;\n    return 0;\n}`,
      },
    ],
  },
  {
    id: "data-structures",
    title: "Data Structures",
    desc: "Arrays, pointers, and structures",
    icon: Layers,
    examples: [
      {
        id: "array-sum",
        title: "Array Sum & Traversal",
        desc: "Iterating fixed-size arrays",
        category: "Data Structures",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int arr[5] = {10, 20, 30, 40, 50};\n    int sum = 0;\n    for (int i = 0; i < 5; i++) sum += arr[i];\n    cout << "Total: " << sum << endl;\n    return 0;\n}`,
      },
      {
        id: "pointer-basics",
        title: "Pointer Manipulation",
        desc: "Memory addresses and dereferencing",
        category: "Data Structures",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int val = 42;\n    int* ptr = &val;\n    *ptr += 8;\n    cout << "Value via pointer: " << val << endl;\n    return 0;\n}`,
      },
      {
        id: "struct-record",
        title: "Structs & Records",
        desc: "Grouping heterogeneous data",
        category: "Data Structures",
        code: `#include <iostream>\n#include <string>\nusing namespace std;\n\nstruct Student {\n    string name;\n    int id;\n    double gpa;\n};\n\nint main() {\n    Student s = {"Alice", 101, 3.9};\n    cout << s.name << " (ID: " << s.id << ") GPA: " << s.gpa << endl;\n    return 0;\n}`,
      },
    ],
  },
  {
    id: "algorithms",
    title: "Algorithms",
    desc: "Searching, sorting, and recursion",
    icon: Cpu,
    examples: [
      {
        id: "recursion-factorial",
        title: "Recursive Factorial",
        desc: "Base case and recursive call stack",
        category: "Algorithms",
        code: `#include <iostream>\nusing namespace std;\n\nint factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    cout << "5! = " << factorial(5) << endl;\n    return 0;\n}`,
      },
      {
        id: "binary-search",
        title: "Binary Search",
        desc: "O(log n) divide-and-conquer",
        category: "Algorithms",
        code: `#include <iostream>\nusing namespace std;\n\nint binarySearch(int arr[], int n, int target) {\n    int low = 0, high = n - 1;\n    while (low <= high) {\n        int mid = low + (high - low) / 2;\n        if (arr[mid] == target) return mid;\n        if (arr[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    int arr[6] = {2, 5, 8, 12, 16, 23};\n    int idx = binarySearch(arr, 6, 12);\n    cout << "Found 12 at index: " << idx << endl;\n    return 0;\n}`,
      },
    ],
  },
  {
    id: "system",
    title: "System Programming",
    desc: "Memory buffers, bitwise ops, and I/O",
    icon: HardDrive,
    examples: [
      {
        id: "bitwise-ops",
        title: "Bitwise Flags & Masks",
        desc: "AND, OR, XOR, and bit shifts",
        category: "System Programming",
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    unsigned char flags = 0x05; // 0000 0101\n    flags |= (1 << 3);          // set bit 3\n    cout << "Flags: 0x" << hex << (int)flags << endl;\n    return 0;\n}`,
      },
      {
        id: "buffered-io",
        title: "Buffered Input / Output",
        desc: "Stream buffer processing",
        category: "System Programming",
        code: `#include <iostream>\n#include <cstring>\nusing namespace std;\n\nint main() {\n    char buffer[64];\n    cout << "Enter message: ";\n    cin.getline(buffer, 64);\n    cout << "Echo: " << buffer << endl;\n    return 0;\n}`,
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    desc: "OOP classes, templates, and lambdas",
    icon: Zap,
    examples: [
      {
        id: "class-oop",
        title: "Classes & Encapsulation",
        desc: "Constructors, methods, and access control",
        category: "Advanced",
        code: `#include <iostream>\nusing namespace std;\n\nclass Rectangle {\nprivate:\n    int w, h;\npublic:\n    Rectangle(int width, int height) : w(width), h(height) {}\n    int area() const { return w * h; }\n};\n\nint main() {\n    Rectangle rect(10, 5);\n    cout << "Area: " << rect.area() << endl;\n    return 0;\n}`,
      },
      {
        id: "templates",
        title: "Template Functions",
        desc: "Generic programming in C++",
        category: "Advanced",
        code: `#include <iostream>\nusing namespace std;\n\ntemplate <typename T>\nT getMax(T a, T b) {\n    return (a > b) ? a : b;\n}\n\nint main() {\n    cout << "Max int: " << getMax(10, 25) << endl;\n    cout << "Max float: " << getMax(3.14, 2.71) << endl;\n    return 0;\n}`,
      },
    ],
  },
];

export default function UnifiedShell() {
  const { user, signOut } = useAuth();
  const [pendingExample] = useState<string | null>(() =>
    typeof window === "undefined" ? null : consumePendingExample()
  );
  const [lang, setLang] = useState<SupportedLanguage>("cpp");
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("console");
  const [panelHeight, setPanelHeight] = useState(280);
  const [panelCollapsed,setPanelCollapsed]=useState(false);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{let ratio=.3;try{const saved=Number(localStorage.getItem('workspace-output-ratio'));if(saved>=.15&&saved<=.8)ratio=saved;}catch{}setPanelHeight(Math.max(240,(window.innerHeight-120)*ratio));});return()=>cancelAnimationFrame(frame);},[]);
  const [isDragging, setIsDragging] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [roleHomeLink, setRoleHomeLink] = useState<{ href: string; label: string } | null>(null);

  // Examples Menu State
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [exampleSearch, setExampleSearch] = useState("");
  const examplesDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Per-language code buffers
  const [codeBuffers, setCodeBuffers] = useState<Record<SupportedLanguage, string>>(() => ({
    cpp: pendingExample ?? CPP_SAMPLE,
    python: PYTHON_SAMPLE,
    assembly: ASM_SAMPLE,
  }));

  // Stdin & interactive output state
  const [typedInput, setTypedInput] = useState("");
  const [selectedTraceStep, setSelectedTraceStep] = useState<number>(5);
  const [downloadFormat, setDownloadFormat] = useState<".txt" | ".csv" | ".pdf" | ".png">(".csv");

  // Assembly Execution State
  const [asmSessionId, setAsmSessionId] = useState<string | null>(null);
  const [asmSessionToken, setAsmSessionToken] = useState<string | null>(null);
  const asmSourceRef = useRef<string | null>(null);
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
  const [cppOutput, setCppOutput] = useState("");
  const [pythonOutput, setPythonOutput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [consoleRunRequest, setConsoleRunRequest] = useState(0);
  const [consoleStopRequest, setConsoleStopRequest] = useState(0);
  const [consoleStatus, setConsoleStatus] = useState("Ready");

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
  const consoleFiles = useMemo(() => ({ [WORKSPACE_CONFIG[lang].defaultFile]: codeBuffers[lang] }), [lang, codeBuffers]);
  const handleConsoleOutput = useCallback((output: string) => {
    if (lang === "cpp") setCppOutput(output);
    if (lang === "python") setPythonOutput(output);
  }, [lang]);
  const lineCount = currentCode.split("\n").length;
  const currentTraceSteps = lang === "cpp" ? CPP_TRACE_STEPS : PYTHON_TRACE_STEPS;

  // Filtered examples for search
  const allExamples = useMemo(() => {
    return EXAMPLE_CATEGORIES.flatMap((c) => c.examples);
  }, []);

  const filteredExamples = useMemo(() => {
    if (!exampleSearch.trim()) return [];
    const q = exampleSearch.toLowerCase();
    return allExamples.filter(
      (e) => e.title.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    );
  }, [exampleSearch, allExamples]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (examplesDropdownRef.current && !examplesDropdownRef.current.contains(e.target as Node)) {
        setExamplesOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      return () => {
        active = false;
      };
    }

    fetch("/api/session-role")
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (!active || !session?.signedIn) return;
        if (session.role === "admin" && session.isAdmin) {
          setRoleHomeLink({ href: "/admin", label: "Admin Center" });
        } else if (session.isVerifiedTeacher) {
          setRoleHomeLink({ href: "/classroom/teacher", label: "Teacher Studio" });
        } else {
          setRoleHomeLink({ href: "/classroom/student", label: "My Classes" });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

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
          className: "bg-white/10 border-l-4 border-white",
          glyphMarginClassName: "text-white font-bold",
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
    if (newLang === lang) return;
    setLang(newLang);
    setConsoleRunRequest(0);
    setConsoleStopRequest(0);
    setIsExecuting(false);
    setConsoleStatus("Ready");
    const nextTab = sanitizeTabForLanguage(newLang, activeTab);
    setActiveTab(nextTab);
    updateLineHighlight(undefined);

    if (newLang === "assembly") {
      setDownloadFormat(".png");

    } else {
      setDownloadFormat(".csv");
    }
  };

  // Resizable bottom panel drag logic
  const handleMouseDown = () => {
    setPanelCollapsed(false);
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const windowHeight = window.innerHeight;
      const newHeight = Math.max(160, Math.min(windowHeight - 140, windowHeight - e.clientY));
      setPanelHeight(newHeight);
      try{localStorage.setItem("workspace-output-ratio",String(newHeight/(windowHeight-120)));}catch{}
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

  // Each new run assembles the current buffer, including edits made after a prior run.
  const prepareAsmSession = async () => {
    if (asmSessionId) {
      const stopped = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId: asmSessionId, sessionToken: asmSessionToken }),
      });
      if (!stopped.ok && stopped.status !== 404 && stopped.status !== 410) {
        throw new Error("Unable to stop the previous assembly session. Try Stop before starting again.");
      }
      setAsmSessionId(null);
      setAsmSessionToken(null);
    }
    const source = codeBuffers.assembly;
    const response = await fetch("/api/asm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assemble", source, code: source, stdin: typedInput }),
    });
    const data = await response.json();
    setAsmDiagnostics(data.assembleResult?.diagnostics || []);
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Assembly failed.");
    }
    asmSourceRef.current = source;
    setAsmSessionId(data.sessionId);
    setAsmSessionToken(data.sessionToken || null);
    setAsmEngineUsed(data.assembleResult?.engineUsed || "builtin-8086");
    setAsmStatus(data.status);
    setAsmTraceHistory([]);
    updateLineHighlight(data.status.currentInstruction?.sourceLine);
    return data;
  };

  const handleAsmAssemble = async () => {
    setAsmIsLoading(true);
    setAsmErrorMessage(null);
    const startedAt = performance.now();
    try {
      await prepareAsmSession();
    } catch (error) {
      setAsmErrorMessage(error instanceof Error ? error.message : "Assembly failed.");
    } finally {
      setAsmExecTime(Math.round(performance.now() - startedAt));
      setAsmIsLoading(false);
    }
  };

  const handleAsmRun = async () => {
    if (asmIsLoading) return;
    setAsmIsLoading(true);
    setAsmErrorMessage(null);
    const startedAt = performance.now();
    try {
      const session = await prepareAsmSession();
      const response = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", sessionId: session.sessionId, sessionToken: session.sessionToken, limit: 2000 }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Execution failed.");
      setAsmStatus(data.status);
      setAsmTraceHistory(data.steps || []);
      updateLineHighlight(data.status.currentInstruction?.sourceLine);
    } catch (error) {
      setAsmErrorMessage(error instanceof Error ? error.message : "Execution failed.");
    } finally {
      setAsmExecTime(Math.round(performance.now() - startedAt));
      setAsmIsLoading(false);
    }
  };

  const handleAsmInput = async (input:string) => {
    if(!asmSessionId||!asmSessionToken)return;setAsmIsLoading(true);setAsmErrorMessage(null);
    try{const r=await fetch('/api/asm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'input',sessionId:asmSessionId,sessionToken:asmSessionToken,input})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'Input failed.');setAsmStatus(d.status);updateLineHighlight(d.status.currentInstruction?.sourceLine);}catch(e){setAsmErrorMessage(e instanceof Error?e.message:'Input failed.');}finally{setAsmIsLoading(false);}
  };
  const handleAsmStop = async () => {
    if (!asmSessionId) return;
    setAsmErrorMessage(null);
    try {
      const response = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", sessionId: asmSessionId, sessionToken: asmSessionToken }),
      });
      if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error("Unable to stop the assembly session.");
      setAsmSessionId(null);
      setAsmSessionToken(null);
      asmSourceRef.current = null;
      setAsmStatus((previous) => ({ ...previous, state: "halted", canStepForward: false, inputRequest: undefined }));
    } catch (error) {
      setAsmErrorMessage(error instanceof Error ? error.message : "Unable to stop the assembly session.");
    }
  };
  const handleAsmStep = async () => {
    if (!asmSessionId || asmSourceRef.current !== codeBuffers.assembly) {
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
          sessionToken: asmSessionToken,
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
    } catch (err: unknown) {
      setAsmErrorMessage(`Network error during step: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmReset = async () => {
    if (!asmSessionId || asmSourceRef.current !== codeBuffers.assembly) {
      await handleAsmAssemble();
      return;
    }
    setAsmIsLoading(true);

    try {
      const res = await fetch("/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          sessionId: asmSessionId,
          sessionToken: asmSessionToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAsmStatus(data.status);
        setAsmTraceHistory([]);
        updateLineHighlight(data.status.currentInstruction?.sourceLine);
      }
    } catch (err: unknown) {
      setAsmErrorMessage(`Network error during reset: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAsmIsLoading(false);
    }
  };

  const handleAsmClear = () => {
    setAsmStatus((prev) => ({ ...prev, stdout: "" }));
  };

  // Run opens a real interactive terminal. Other tools retain their own panels.
  const handleRunDebug = () => {
    if (isExecuting || asmIsLoading) return;
    setActiveTab("console");
    setPanelCollapsed(false);
    if (lang === "assembly") {
      void handleAsmRun();
    } else {
      setConsoleRunRequest((request) => request + 1);
    }
  };

  const handleStop = () => {
    if (lang === "assembly") {
      void handleAsmStop();
    } else {
      setConsoleStopRequest((request) => request + 1);
    }
  };

  const handleNewFile = () => {
    const filename = window.prompt("Enter new file name:", "solution.cpp");
    if (filename) {
      alert(`Created ${filename}`);
    }
  };

  const handleDownloadCode = () => {
    const blob = new Blob([currentCode], { type: "text/plain;charset=utf-8" });
    saveAs(blob, fileMeta.name);
  };

  const handleResetCode = () => {
    if (window.confirm("Reset code to starter sample?")) {
      setCodeBuffers({
        cpp: CPP_SAMPLE,
        python: PYTHON_SAMPLE,
        assembly: ASM_SAMPLE,
      });
    }
  };

  const handleSelectExample = (ex: ExampleItem) => {
    if (lang !== "cpp") {
      handleLanguageChange("cpp");
    }
    setCodeBuffers((prev) => ({
      ...prev,
      cpp: ex.code,
    }));
    setExamplesOpen(false);
    setExpandedCategory(null);
    setExampleSearch("");
  };

  // Keyboard shortcut F5, Ctrl+N, Ctrl+S, Ctrl+R, Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        handleRunDebug();
      } else if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewFile();
      } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleDownloadCode();
      } else if (e.ctrlKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleResetCode();
      } else if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setExamplesOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Client-side download generator
  const handleDownloadOutput = () => {
    let content = "";
    if (lang === "assembly") {
      content = asmStatus.stdout;
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
      case "console":
        return <Terminal size={13} />;
      case "output":
        return <FileText size={13} />;
      case "dosbox":
        return <Cpu size={13} />;
      case "registers":
        return <Cpu size={13} />;
      case "memory":
        return <HardDrive size={13} />;
      case "stack":
        return <Layers size={13} />;
      case "trace":
        return <Activity size={13} />;
      case "input":
        return <FileText size={13} />;
      case "debug":
        return <Sliders size={13} />;
      case "variables":
        return <Layers size={13} />;
      case "instructionHelp":
        return <HelpCircle size={13} />;
      default:
        return <Terminal size={13} />;
    }
  };

  return (
    <div data-surface="dark"
      className="flex h-screen w-full flex-col overflow-hidden bg-[#0A0A0A] text-[#CCCCCC] antialiased select-none"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {/* 1. Compact Top Bar (Height 34px, Visual Studio Style) */}
      <nav className="flex h-[34px] shrink-0 items-center justify-between border-b border-[#2E2E2E] bg-[#181818] px-3 select-none text-[12px]">
        {/* Left: Original Uploaded OutputTracer Logo + Brand Tagline */}
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2 group">
            {/* User's Original Logo Asset from public/brand/logo-tile.svg */}
            <Image
              src="/brand/logo-tile.svg"
              alt="OutputTracer Logo"
              width={20}
              height={20}
              className="h-5 w-5 rounded shrink-0 shadow-sm"
              priority
            />
            <span className="font-semibold tracking-tight text-white text-[13px]">
              OutputTracer
            </span>
          </Link>
          <span className="text-[11px] text-[#858585] tracking-wider hidden sm:inline ml-1 font-mono">
            Compile • Trace • Learn
          </span>
        </div>

        {/* Right: Existing OutputTracer Navigation & User Profile */}
        <div className="flex items-center gap-1.5">
          {/* Examples button with dropdown menu */}
          <div className="relative" ref={examplesDropdownRef}>
            <button
              type="button"
              onClick={() => setExamplesOpen(!examplesOpen)}
              className={`flex items-center gap-1 rounded-[3px] px-2 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                examplesOpen
                  ? "bg-[#2E2E2E] text-white"
                  : "text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white"
              }`}
            >
              <FolderOpen size={13} className="text-[#CCCCCC]" />
              <span>Examples</span>
              <ChevronDown size={11} className={`transition-transform ${examplesOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Examples Dropdown Menu */}
            {examplesOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-80 sm:w-88 rounded border border-[#2E2E2E] bg-[#181818] p-2.5 shadow-2xl text-left">
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#2E2E2E]">
                  <span className="font-semibold text-xs text-white">Example Programs</span>
                  <span className="text-[10px] text-[#858585]">5 Categories</span>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#858585]" />
                  <input
                    type="text"
                    value={exampleSearch}
                    onChange={(e) => setExampleSearch(e.target.value)}
                    placeholder="Search examples..."
                    className="w-full rounded border border-[#2E2E2E] bg-[#121212] py-1 pl-7 pr-12 text-[11px] text-white placeholder-[#858585] outline-none focus:border-[#555555]"
                    autoFocus
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-[#2A2A2A] px-1 py-0.2 font-mono text-[9px] text-[#858585]">
                    Ctrl+K
                  </span>
                </div>

                {/* Search Results or Categories */}
                {exampleSearch.trim() ? (
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {filteredExamples.length === 0 ? (
                      <div className="py-3 text-center text-xs text-[#858585]">
                        No matching examples found.
                      </div>
                    ) : (
                      filteredExamples.map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => handleSelectExample(ex)}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-[#252526] text-[#CCCCCC] hover:text-white transition-colors"
                        >
                          <div>
                            <div className="font-medium text-white">{ex.title}</div>
                            <div className="text-[10px] text-[#858585]">{ex.category}</div>
                          </div>
                          <span className="text-[10px] text-[#CCCCCC] font-mono">Load →</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-0.5">
                    {EXAMPLE_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isExpanded = expandedCategory === cat.id;
                      return (
                        <div key={cat.id} className="rounded border border-[#2E2E2E] bg-[#121212] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                            className="flex w-full items-center justify-between p-2 text-left hover:bg-[#252526] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Icon size={13} className="text-[#CCCCCC]" />
                              <div>
                                <div className="text-[11px] font-semibold text-white">{cat.title}</div>
                                <div className="text-[10px] text-[#858585]">{cat.desc}</div>
                              </div>
                            </div>
                            <ChevronRight
                              size={12}
                              className={`text-[#858585] transition-transform ${isExpanded ? "rotate-90 text-white" : ""}`}
                            />
                          </button>

                          {isExpanded && (
                            <div className="border-t border-[#2E2E2E] bg-[#181818] p-1 space-y-0.5">
                              {cat.examples.map((ex) => (
                                <button
                                  key={ex.id}
                                  type="button"
                                  onClick={() => handleSelectExample(ex)}
                                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] text-[#CCCCCC] hover:bg-[#252526] hover:text-white transition-colors"
                                >
                                  <span>{ex.title}</span>
                                  <span className="text-[10px] text-[#CCCCCC] font-mono">Load →</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="my-1.5 border-t border-[#2E2E2E]" />
                <Link
                  href="/examples"
                  onClick={() => setExamplesOpen(false)}
                  className="flex items-center justify-between rounded px-2 py-1 text-[11px] font-medium text-white hover:text-[#CCCCCC] hover:bg-[#252526] transition-colors"
                >
                  <span>View All Examples</span>
                  <ArrowRight size={11} />
                </Link>
              </div>
            )}
          </div>

          <Link
            href="/practice"
            className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white transition-colors"
          >
            <Target size={13} className="text-[#CCCCCC]" />
            <span>Practice</span>
          </Link>

          <Link
            href="/learn"
            className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white transition-colors"
          >
            <BookOpen size={13} className="text-[#CCCCCC]" />
            <span>Learn</span>
          </Link>

          {user && roleHomeLink && (
            <Link
              href={roleHomeLink.href}
              className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white transition-colors"
            >
              {roleHomeLink.label}
            </Link>
          )}

          <Link
            href="/projects/resume"
            className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white transition-colors"
          >
            Projects
          </Link>

          {/* User Profile / Sign in */}
          <div className="relative ml-1" ref={userDropdownRef}>
            {user ? (
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1 rounded-[3px] border border-[#2E2E2E] px-2 py-0.5 text-[11px] text-[#CCCCCC] hover:bg-[#2E2E2E] hover:text-white transition-colors"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2E2E2E] border border-[#444444] font-bold text-[9px] text-white">
                  {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                </div>
                <ChevronDown size={11} />
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-[3px] border border-[#444444] px-2.5 py-0.5 text-[11px] font-semibold text-[#E5E5E5] hover:bg-[#2E2E2E] hover:text-white transition-colors"
              >
                Sign in
              </Link>
            )}

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded border border-[#2E2E2E] bg-[#181818] py-1 shadow-xl text-left">
                <div className="px-3 py-1.5 text-[11px] text-[#858585] border-b border-[#2E2E2E]">
                  {user?.email}
                </div>
                {roleHomeLink && (
                  <Link
                    href={roleHomeLink.href}
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-3 py-1 text-xs text-[#CCCCCC] hover:bg-[#252526] hover:text-white"
                  >
                    {roleHomeLink.label}
                  </Link>
                )}
                <Link
                  href="/projects"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-3 py-1 text-xs text-[#CCCCCC] hover:bg-[#252526] hover:text-white"
                >
                  All Projects
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOut();
                  }}
                  className="block w-full px-3 py-1 text-left text-xs text-[#F85149] hover:bg-[#252526]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 2. Compact Visual Studio-Inspired Toolbar (Height 36px) */}
      <div className="flex h-[36px] shrink-0 items-center gap-2 border-b border-[#2E2E2E] bg-[#181818] px-3 select-none text-[12px]">
        {/* Compiler / Language Selector */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="lang-select" className="text-[11px] font-semibold text-[#858585] uppercase">
            Language:
          </label>
          <select
            id="lang-select"
            value={lang}
            onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
            className="h-6 rounded-[2px] border border-[#2E2E2E] bg-[#121212] px-2 text-[12px] font-medium text-white outline-none cursor-pointer focus:border-[#555555]"
          >
            <option value="cpp">C++</option>
            <option value="python">Python 3</option>
            <option value="assembly">Assembly (NASM + DOSBox)</option>
          </select>
        </div>

        {/* Run & Debug Button (Play icon + F5 shortcut badge) */}
        <button
          type="button"
          onClick={handleRunDebug}
          disabled={isExecuting || asmIsLoading}
          className="flex h-6 items-center gap-1.5 rounded-[2px] bg-[#238636] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2EA043] disabled:opacity-50 cursor-pointer shadow-sm"
        >
          <Play size={12} fill="white" />
          <span>Run & Debug</span>
          <span className="rounded bg-black/30 px-1 py-0.2 font-mono text-[9px] font-bold">
            F5
          </span>
        </button>

        {/* Stop Button */}
        <button
          type="button"
          onClick={handleStop}
          className="flex h-6 items-center gap-1.5 rounded-[2px] border border-[#2E2E2E] bg-[#121212] px-2 text-[12px] font-semibold text-[#F85149] transition-colors hover:bg-[#252526] cursor-pointer"
          title="Stop execution"
        >
          <Square size={11} fill="#F85149" />
          <span>Stop</span>
        </button>

        {/* Vertical Divider */}
        <div className="h-4 w-px bg-[#2E2E2E] mx-0.5" />

        {/* New Button */}
        <button
          type="button"
          onClick={handleNewFile}
          className="flex h-6 items-center gap-1 rounded-[2px] border border-transparent px-2 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
          title="New file (Ctrl+N)"
        >
          <FilePlus size={13} />
          <span>New</span>
        </button>

        {/* Download Button */}
        <button
          type="button"
          onClick={handleDownloadCode}
          className="flex h-6 items-center gap-1 rounded-[2px] border border-transparent px-2 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
          title="Download file (Ctrl+S)"
        >
          <Download size={13} />
          <span>Download</span>
        </button>

        {/* Reset Button */}
        <button
          type="button"
          onClick={handleResetCode}
          className="flex h-6 items-center gap-1 rounded-[2px] border border-transparent px-2 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
          title="Reset code (Ctrl+R)"
        >
          <RotateCcw size={13} />
          <span>Reset</span>
        </button>

        {/* Save Button */}
        <button
          type="button"
          onClick={() => alert(`Saved ${fileMeta.name} locally.`)}
          className="flex h-6 items-center gap-1 rounded-[2px] border border-transparent px-2 text-[12px] font-medium text-[#CCCCCC] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
          title="Save file locally"
        >
          <Save size={13} />
          <span>Save</span>
        </button>

        {/* AI Assist button is completely removed without extra space or gap */}
      </div>

      {/* 3. Compact File Tab Bar (Height 30px) */}
      <div className="flex h-[30px] shrink-0 items-center justify-between border-b border-[#2E2E2E] bg-[#181818] px-2 select-none text-[12px]">
        <div className="flex h-full items-center">
          <div className="flex h-full items-center gap-1.5 border-r border-[#2E2E2E] border-t-2 border-t-white bg-[#121212] px-3 font-mono text-[12px] font-medium text-white">
            <FileCode size={13} className="text-[#CCCCCC]" />
            <span>{fileMeta.name}</span>
          </div>
          <button
            type="button"
            onClick={handleNewFile}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded text-[#858585] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
            title="Add new file"
            aria-label="Add new file"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* 4. Main Code Editor (Fills remaining height) */}
      <div className="relative flex min-h-[140px] flex-1 overflow-hidden bg-[#121212]">
        <Editor
          height="100%"
          language={fileMeta.monacoLang}
          theme="vs-dark"
          value={currentCode}
          onChange={(val) => setCodeBuffers((prev) => ({ ...prev, [lang]: val || "" }))}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', Consolas, monospace)",
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            renderWhitespace: "selection",
            tabSize: 4,
            automaticLayout: true,
            glyphMargin: true,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>

      {/* 5. Compact Drag Handle (Height 8px) */}
      <div
        onMouseDown={handleMouseDown}
        className="flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-[#2E2E2E] bg-[#181818] hover:bg-[#252526] transition-colors select-none"
        title="Drag to resize bottom panel"
      >
        <div className="h-0.5 w-8 rounded-full bg-[#444444]" />
      </div>

      {/* 6. Bottom Panel with Language-Aware Tabs (Default 280px) */}
      <div className="flex shrink-0 flex-col overflow-hidden bg-[#121212]" style={{ height: `${panelCollapsed?32:panelHeight}px` }}>
        {/* Tab Strip */}
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#2E2E2E] bg-[#181818] px-2 select-none text-[12px]">
          <div className="flex h-full items-center gap-1 overflow-x-auto">
            <button type="button" className="shrink-0 px-2 text-[#aaa]" onClick={()=>setPanelCollapsed(v=>!v)}>{panelCollapsed?"Expand":"Collapse"}</button>{config.tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {setActiveTab(tab.id);setPanelCollapsed(false);}}
                  className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "border-white bg-[#121212] text-white"
                      : "border-transparent text-[#858585] hover:text-[#CCCCCC]"
                  }`}
                >
                  {getTabIcon(tab.id)}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Controls on Right Side of Tab Bar */}
          {lang === "assembly" && activeTab === "dosbox" ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAsmRun}
                disabled={asmIsLoading}
                className="flex h-6 items-center gap-1 rounded bg-[#238636] px-2 text-[11px] font-semibold text-white hover:bg-[#2EA043] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                title="Assemble and run assembly code"
              >
                <Play size={11} fill="white" />
                <span>Assemble & Run</span>
              </button>
              <button
                type="button"
                onClick={handleAsmStep}
                disabled={asmIsLoading || (!asmStatus.canStepForward && asmStatus.state !== "ready")}
                className="flex h-6 items-center gap-1 rounded border border-[#2E2E2E] bg-[#121212] px-2 text-[11px] font-medium text-white hover:bg-[#252526] transition-colors disabled:opacity-40 cursor-pointer"
                title="Step forward one instruction"
              >
                <span>Step</span>
              </button>
              <button
                type="button"
                onClick={handleAsmReset}
                disabled={asmIsLoading}
                className="flex h-6 items-center gap-1 rounded border border-[#2E2E2E] bg-[#121212] px-2 text-[11px] font-medium text-[#888888] hover:text-white transition-colors cursor-pointer"
                title="Reset execution to beginning"
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
            </div>
          ) : activeTab !== "console" ? (
            <div className="flex items-center gap-1.5">
              <select
                value={downloadFormat}
                onChange={(e) => setDownloadFormat(e.target.value as ".txt" | ".csv" | ".pdf" | ".png")}
                className="h-6 rounded-[2px] border border-[#2E2E2E] bg-[#121212] px-1.5 text-[11px] text-white outline-none cursor-pointer"
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
                  className="flex h-6 items-center gap-1 rounded-[2px] border border-[#3E3E3E] bg-[#222222] px-2 text-[11px] font-medium text-white hover:bg-[#2E2E2E] transition-colors cursor-pointer"
                >
                  <Download size={11} />
                  <span>Download trace</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadOutput}
                  className="flex h-6 items-center gap-1 rounded-[2px] border border-[#3E3E3E] bg-[#222222] px-2 text-[11px] font-medium text-white hover:bg-[#2E2E2E] transition-colors cursor-pointer"
                >
                  <Download size={11} />
                  <span>Download output</span>
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Panel Content Area */}
        <div className="flex min-h-0 flex-1 overflow-hidden bg-[#121212]">
          {/* Keep the terminal mounted when inspecting output, input, or trace. */}
          {lang !== "assembly" && (
            <div className="min-h-0 min-w-0 flex-1 flex-col" style={{ display: activeTab === "console" ? "flex" : "none" }}>
              <ProgramConsole
                key={lang}
                language={lang}
                files={consoleFiles}
                runRequest={consoleRunRequest}
                stopRequest={consoleStopRequest}
                initialStdin={typedInput}
                onRunningChange={setIsExecuting}
                onOutputChange={handleConsoleOutput}
                onStatusChange={setConsoleStatus}
              />
            </div>
          )}
          {/* Console and legacy DOSBox controls share one 8086 terminal session. */}
          {lang === "assembly" && (
            <div className="min-h-0 min-w-0 flex-1 flex-col" style={{ display: activeTab === "console" || activeTab === "dosbox" ? "flex" : "none" }}>
              <DosboxWorkspace
              status={asmStatus}
              diagnostics={asmDiagnostics}
              engineUsed={asmEngineUsed}
              executionTimeMs={asmExecTime}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onRun={handleAsmRun}
              onInput={handleAsmInput}
              onStop={handleAsmStop}
              onStep={handleAsmStep}
              onReset={handleAsmReset}
              onClear={handleAsmClear}
              sourceCode={codeBuffers.assembly}
              isLoading={asmIsLoading}
              errorMessage={asmErrorMessage}
              />
            </div>
          )}

          {/* Output Tab */}
          {activeTab === "output" && (
            <div className="flex flex-1 flex-col justify-between p-3 font-mono text-[13px] leading-5 overflow-hidden">
              <div className="space-y-1 overflow-y-auto flex-1">
                {lang === "assembly" ? (
                  <pre className="text-[#CCCCCC] whitespace-pre-wrap font-mono">
                    {asmStatus.stdout || "Run your program to see output."}
                  </pre>
                ) : lang === "cpp" ? (
                  <pre className="text-[#CCCCCC] whitespace-pre-wrap font-mono">
                    {cppOutput || "Run your program in Console to see output."}
                  </pre>
                ) : (
                  <pre className="text-[#CCCCCC] whitespace-pre-wrap font-mono">
                    {pythonOutput || "Run your program in Console to see output."}
                  </pre>
                )}
              </div>

              <p className="mt-2 border-t border-[#2E2E2E] pt-2 text-[11px] text-[#858585]">
                Captured program output. Open Console to enter input while the program is running.
              </p>
            </div>
          )}

          {/* Input Tab */}
          {activeTab === "input" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[12px] bg-[#121212]">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                  Standard Input (stdin)
                </span>
                <span className="text-[11px] text-[#858585]">Characters: {typedInput.length}</span>
              </div>
              <textarea
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Optional input for the next run. Preserve newlines between answers…"
                className="flex-1 w-full rounded border border-[#2E2E2E] bg-[#181818] p-2.5 text-white outline-none focus:border-[#555555] resize-none font-mono text-[12px]"
              />
              <p className="mt-1.5 text-[11px] text-[#858585]">
                Sent once at the start of the next run. Use Console for interactive input during execution.
              </p>
            </div>
          )}

          {/* Trace Tab */}
          {activeTab === "trace" && (
            lang === "assembly" ? (
              <div className="flex flex-1 flex-col overflow-hidden bg-black text-[#CCCCCC] font-mono text-[12px]">
                <div className="flex items-center justify-between border-b border-[#2E2E2E] bg-[#141414] px-3 py-1.5">
                  <span className="text-white font-semibold">NASM 8086 Execution Timeline</span>
                  <span className="text-[#888888]">{asmTraceHistory.length} instruction steps recorded</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {asmTraceHistory.length === 0 ? (
                    <div className="text-[#858585] p-4 text-center">
                      No trace steps recorded yet. Run the program in Console or use the DOSBox step controls.
                    </div>
                  ) : (
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[#2E2E2E] text-[#858585]">
                          <th className="py-1 px-2">Step</th>
                          <th className="py-1 px-2">Address</th>
                          <th className="py-1 px-2">Instruction</th>
                          <th className="py-1 px-2">Registers After</th>
                          <th className="py-1 px-2">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asmTraceHistory.map((step, idx) => (
                          <tr key={idx} className="border-b border-[#222222] hover:bg-[#181818]">
                            <td className="py-1 px-2 text-[#CCCCCC]">{step.step}</td>
                            <td className="py-1 px-2 text-[#CCCCCC]">
                              CS:0x{step.addressBefore.offset.toString(16).padStart(4, "0").toUpperCase()}
                            </td>
                            <td className="py-1 px-2 text-white">
                              {step.mnemonic} {step.operands}
                            </td>
                            <td className="py-1 px-2 text-[#CCCCCC]">
                              AX={step.registersAfter.ax.toString(16).padStart(4, "0")} DX={step.registersAfter.dx.toString(16).padStart(4, "0")}
                            </td>
                            <td className="py-1 px-2 text-[#CCCCCC]">{step.stdoutDelta || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2E2E2E] bg-[#181818] px-3 py-1 text-[12px] text-[#CCCCCC]">
                  <span>
                    <strong className="text-white">{currentTraceSteps.length} steps in order.</strong> Click a row to jump to that line.
                  </span>
                  <span>Input used: <strong className="text-white">{typedInput}</strong></span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse font-mono text-[12px] text-left">
                    <thead className="sticky top-0 z-10 border-b-2 border-[#2E2E2E] bg-[#181818] text-[11px] uppercase tracking-wider text-[#858585]">
                      <tr>
                        <th className="w-14 px-2 py-1.5">Step</th>
                        <th className="w-14 px-2 py-1.5">Line</th>
                        <th className="w-80 px-2 py-1.5">Code</th>
                        <th className="w-72 px-2 py-1.5">What changed</th>
                        <th className="px-2 py-1.5">Output</th>
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
                            className={`border-b border-[#222222] transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-white/10 border-l-4 border-l-white text-white font-medium"
                                : "hover:bg-[#1E1E1E] text-[#CCCCCC]"
                            }`}
                          >
                            <td className="px-2 py-1.5">{step.step}</td>
                            <td className="px-2 py-1.5">L{step.line}</td>
                            <td className="px-2 py-1.5">{step.code}</td>
                            <td className="px-2 py-1.5">
                              {step.changes === "—" ? (
                                <span className="text-[#666666]">—</span>
                              ) : (
                                step.changes.split(";").map((c, i) => (
                                  <span
                                    key={i}
                                    className="mr-1 inline-flex items-center rounded border border-[#3E3E3E] bg-[#222222] px-1 py-0.2 text-[11px] text-[#E0E0E0]"
                                  >
                                    {c.trim()}
                                  </span>
                                ))
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {step.output === "—" ? (
                                <span className="text-[#666666]">—</span>
                              ) : (
                                <span className="text-white font-medium">{step.output}</span>
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

          {/* Debug Tab (C++ & Python) */}
          {activeTab === "debug" && lang !== "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[12px] bg-[#121212]">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                  Debugger Console
                </span>
                <span className="text-[11px] text-[#3FB950]">State: Ready / Idle</span>
              </div>
              <div className="flex-1 rounded border border-[#2E2E2E] bg-[#181818] p-2.5 text-[#CCCCCC] overflow-y-auto">
                <div className="text-[#858585]">Debugger session initialized for {fileMeta.name}.</div>
                <div className="text-[#858585]">Press F5 to Run &amp; Debug or select Trace tab for step tracing.</div>
                <div className="pt-2 text-white font-sans">Target binary compiled with debug symbols (-g).</div>
              </div>
            </div>
          )}

          {/* Variables Tab (C++ & Python) */}
          {activeTab === "variables" && lang !== "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[12px] bg-[#121212] overflow-hidden">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                  Local Scope Variables
                </span>
                <span className="text-[11px] text-[#888888]">Scope: main()</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left font-mono text-[12px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#2E2E2E] text-[#858585]">
                      <th className="py-1 px-2">Variable</th>
                      <th className="py-1 px-2">Type</th>
                      <th className="py-1 px-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lang === "cpp" ? (
                      <>
                        <tr className="border-b border-[#222222]">
                          <td className="py-1 px-2 text-white font-medium">size</td>
                          <td className="py-1 px-2 text-[#888888]">const int</td>
                          <td className="py-1 px-2 text-[#CCCCCC]">100</td>
                        </tr>
                        <tr className="border-b border-[#222222]">
                          <td className="py-1 px-2 text-white font-medium">text</td>
                          <td className="py-1 px-2 text-[#888888]">char[100]</td>
                          <td className="py-1 px-2 text-[#CCCCCC]">&quot;{typedInput}&quot;</td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b border-[#222222]">
                          <td className="py-1 px-2 text-white font-medium">text</td>
                          <td className="py-1 px-2 text-[#888888]">str</td>
                          <td className="py-1 px-2 text-[#CCCCCC]">&quot;{typedInput}&quot;</td>
                        </tr>
                        <tr className="border-b border-[#222222]">
                          <td className="py-1 px-2 text-white font-medium">len(text)</td>
                          <td className="py-1 px-2 text-[#888888]">int</td>
                          <td className="py-1 px-2 text-[#CCCCCC]">{typedInput.length}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Registers Tab (Assembly only) */}
          {activeTab === "registers" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[12px] bg-[#121212] overflow-y-auto">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
                  8086 CPU Registers &amp; Flags
                </span>
                <span className="text-[11px] text-[#858585]">16-bit Real Mode</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
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
                  <div key={reg.name} className="rounded border border-[#2E2E2E] bg-[#181818] p-1.5">
                    <div className="flex justify-between text-[#858585] text-[10px]">
                      <span>{reg.name}</span>
                      <span className="text-white font-bold">0x{(reg.val & 0xffff).toString(16).toUpperCase().padStart(4, "0")}</span>
                    </div>
                    {reg.hi && (
                      <div className="flex justify-between text-[9px] text-[#888888] mt-0.5">
                        <span>{reg.hi}: 0x{((reg.val >> 8) & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                        <span>{reg.lo}: 0x{(reg.val & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded border border-[#2E2E2E] bg-[#181818] p-2">
                <div className="text-[10px] font-semibold text-[#858585] uppercase mb-1">Flags</div>
                <div className="flex gap-1.5">
                  {Object.entries(asmStatus.flags).map(([k, v]) => (
                    <span
                      key={k}
                      className={`px-1.5 py-0.2 rounded text-[10px] border font-mono ${
                        v
                          ? "bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950] font-bold"
                          : "bg-[#121212] border-[#2E2E2E] text-[#666666]"
                      }`}
                    >
                      {k.toUpperCase()}: {v ? "1" : "0"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Memory Tab (Assembly only) */}
          {activeTab === "memory" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[11px] bg-[#121212] overflow-hidden">
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#2E2E2E]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                  Memory View (Segment 1000h)
                </span>
                <span className="text-[10px] text-[#858585]">16 bytes per row</span>
              </div>
              <div className="flex-1 overflow-y-auto text-[#CCCCCC] space-y-0.5">
                <div>1000:0100  BA 0C 01 B4 09 CD 21 BA  29 01 B4 0A CD 21 B8 00  |.......!)....!..|</div>
                <div>1000:0110  4C CD 21 65 6E 74 65 72  20 74 65 78 74 20 28 6D  |L.!enter text (m|</div>
                <div>1000:0120  61 78 20 39 39 20 63 68  61 72 73 29 3A 20 24 64  |ax 99 chars): $d|</div>
                <div>1000:0130  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|</div>
              </div>
            </div>
          )}

          {/* Stack Tab (Assembly only) */}
          {activeTab === "stack" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[11px] bg-[#121212] overflow-y-auto">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                  Stack Frame &amp; SP
                </span>
                <span className="text-[10px] text-[#858585]">SS: 1000h, SP: 0x{asmStatus.registers.sp.toString(16).toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded border border-[#2E2E2E] bg-[#181818] p-2 text-center">
                  <div className="text-[#858585] text-[9px]">[SS:FFFE]</div>
                  <div className="text-base font-bold text-white">0000h</div>
                  <div className="text-[9px] text-[#888888] mt-0.5">▲ Current SP</div>
                </div>
                <div className="rounded border border-[#2E2E2E] bg-[#141414] p-2 text-center text-[#666666]">
                  <div className="text-[9px]">[SS:FFFC]</div>
                  <div className="text-base font-bold">0000h</div>
                </div>
                <div className="rounded border border-[#2E2E2E] bg-[#141414] p-2 text-center text-[#666666]">
                  <div className="text-[9px]">[SS:FFFA]</div>
                  <div className="text-base font-bold">0000h</div>
                </div>
                <div className="rounded border border-[#2E2E2E] bg-[#141414] p-2 text-center text-[#666666]">
                  <div className="text-[9px]">[SS:FFF8]</div>
                  <div className="text-base font-bold">0000h</div>
                </div>
              </div>
            </div>
          )}

          {/* Instruction Help Tab (Assembly only) */}
          {activeTab === "instructionHelp" && lang === "assembly" && (
            <div className="flex flex-1 flex-col p-3 font-mono text-[11px] bg-[#121212] overflow-y-auto">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#2E2E2E]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                  8086 Instruction Reference
                </span>
                <span className="text-[10px] text-[#858585]">NASM syntax</span>
              </div>
              <div className="space-y-2 font-sans">
                <div className="rounded border border-[#2E2E2E] bg-[#181818] p-2">
                  <div className="font-mono text-[12px] font-bold text-white">MOV dest, src</div>
                  <p className="text-[11px] text-[#CCCCCC] mt-0.5">
                    Copies data from source to destination. Neither memory-to-memory nor segment-to-segment is allowed directly.
                  </p>
                </div>
                <div className="rounded border border-[#2E2E2E] bg-[#181818] p-2">
                  <div className="font-mono text-[12px] font-bold text-white">INT 21h (DOS API)</div>
                  <p className="text-[11px] text-[#CCCCCC] mt-0.5">
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

      {/* 7. Status Bar (Height 24px) */}
      <footer className="flex h-[24px] shrink-0 items-center justify-between border-t border-[#2E2E2E] bg-[#181818] px-3 font-medium text-[#CCCCCC] text-[12px] select-none">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#3FB950] shadow-[0_0_5px_rgba(63,185,80,0.8)]" />
          <span>
            {lang === "assembly"
              ? asmIsLoading ? "Assembly · Executing…" : `Assembly · ${asmStatus.state.replaceAll("_", " ")}`
              : consoleStatus}
          </span>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[12px]">
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
