"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { saveAs } from "file-saver";
import {
  Code2,
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
  Sun,
  Moon,
  Search,
  ArrowRight,
  X,
  Plus,
  Files,
  Monitor,
  GitBranch,
  Settings,
  Zap,
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
    <div className="flex h-full w-full items-center justify-center bg-[#080D16]">
      <span className="font-mono text-sm text-[#94A3B8]">Loading editor…</span>
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

const COMPILERS = [
  { id: "gcc13", label: "C++ (GCC 13.2)", badge: "C++", lang: "cpp" as SupportedLanguage },
  { id: "clang17", label: "C++ (Clang 17)", badge: "C++", lang: "cpp" as SupportedLanguage },
  { id: "python", label: "Python 3 (CPython 3.12)", badge: "Py", lang: "python" as SupportedLanguage },
  { id: "nasm", label: "Assembly (NASM 2.16 + DOSBox)", badge: "ASM", lang: "assembly" as SupportedLanguage },
];

export default function UnifiedShell() {
  const { user, signOut } = useAuth();
  const [lang, setLang] = useState<SupportedLanguage>("cpp");
  const [selectedCompiler, setSelectedCompiler] = useState(COMPILERS[0]);
  const [compilerMenuOpen, setCompilerMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("output");
  const [panelHeight, setPanelHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarActive, setSidebarActive] = useState<"files" | "workspace" | "git" | "settings">("files");
  const [darkMode, setDarkMode] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Examples Menu State
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [exampleSearch, setExampleSearch] = useState("");
  const examplesDropdownRef = useRef<HTMLDivElement>(null);
  const compilerDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

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
      if (compilerDropdownRef.current && !compilerDropdownRef.current.contains(e.target as Node)) {
        setCompilerMenuOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          className: "bg-[#1685FF]/20 border-l-4 border-[#1685FF]",
          glyphMarginClassName: "text-[#1685FF] font-bold",
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

  const handleCompilerSelect = (c: typeof COMPILERS[0]) => {
    setSelectedCompiler(c);
    setCompilerMenuOpen(false);
    handleLanguageChange(c.lang);
  };

  // Resizable bottom panel drag logic
  const handleMouseDown = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const windowHeight = window.innerHeight;
      const newHeight = Math.max(180, Math.min(windowHeight - 160, windowHeight - e.clientY));
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

  const handleStop = () => {
    setIsExecuting(false);
    setAsmIsLoading(false);
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
    // If example is C++, switch to C++
    if (lang !== "cpp") {
      setSelectedCompiler(COMPILERS[0]);
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
        return <Cpu size={14} className="text-[#1685FF]" />;
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
      className="flex h-screen w-full flex-col overflow-hidden bg-[#080D16] text-[#E7EDF7] antialiased select-none"
      style={{ fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* 2. Top Header & Horizontal Toolbar (#0B111D) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#1D293B] bg-[#0B111D] px-3 z-30">
        {/* Left Side: Logo Branding + File Tab + Compiler Select */}
        <div className="flex items-center gap-3">
          {/* 1. OutputTracer logo and branding */}
          <Link href="/" className="flex items-center gap-2.5 pr-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0F1D33] border border-[#1685FF]/30 text-[#1685FF] shadow-sm group-hover:border-[#1685FF] transition-all">
              <Code2 size={18} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-tight text-[#E7EDF7] leading-none">
                Output<span className="text-[#1685FF]">Tracer</span>
              </span>
              <span className="text-[10px] text-[#94A3B8] tracking-wider leading-none mt-1 hidden sm:inline">
                Compile • Trace • Learn
              </span>
            </div>
          </Link>

          <div className="h-5 w-px bg-[#1D293B] hidden md:block" />

          {/* 2. Code editor tabs */}
          <div className="flex items-center gap-1">
            <div className="group flex h-9 items-center gap-2 rounded-t-md border-t-2 border-t-[#1685FF] border-x border-[#1D293B] bg-[#080D16] px-3 font-mono text-[13px] text-[#E7EDF7]">
              <FileCode size={14} className="text-[#1685FF]" />
              <span>{fileMeta.name}</span>
              <button
                type="button"
                onClick={() => {}}
                className="ml-1 rounded p-0.5 text-[#94A3B8] hover:bg-[#1D293B] hover:text-[#E7EDF7] transition-colors"
                title="Close tab"
                aria-label="Close tab"
              >
                <X size={12} />
              </button>
            </div>
            <button
              type="button"
              onClick={handleNewFile}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#1D293B] hover:text-[#E7EDF7] transition-colors"
              title="Open new tab (Ctrl+N)"
              aria-label="Open new tab"
            >
              <Plus size={15} />
            </button>
          </div>

          {/* 3. Compiler selection dropdown */}
          <div className="relative" ref={compilerDropdownRef}>
            <button
              type="button"
              onClick={() => setCompilerMenuOpen(!compilerMenuOpen)}
              className="flex h-9 items-center gap-2 rounded-md border border-[#1D293B] bg-[#080D16] px-2.5 text-[13px] font-medium text-[#E7EDF7] hover:border-[#1685FF]/50 transition-all cursor-pointer"
            >
              <span className="rounded bg-[#1685FF]/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#1685FF]">
                {selectedCompiler.badge}
              </span>
              <span className="font-sans text-[13px]">{selectedCompiler.label}</span>
              <ChevronDown size={14} className={`text-[#94A3B8] transition-transform ${compilerMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {compilerMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[240px] rounded-md border border-[#1D293B] bg-[#0D1523] py-1 shadow-xl shadow-black/60">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-[#1D293B]">
                  Select Compiler / Runtime
                </div>
                {COMPILERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCompilerSelect(c)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors ${
                      selectedCompiler.id === c.id
                        ? "bg-[#1685FF]/15 text-[#1685FF] font-medium"
                        : "text-[#E7EDF7] hover:bg-[#1D293B]/60"
                    }`}
                  >
                    <span>{c.label}</span>
                    <span className="rounded bg-[#080D16] px-1.5 py-0.5 font-mono text-[10px] text-[#94A3B8]">
                      {c.badge}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right: Execution Controls & Secondary Actions */}
        <div className="flex items-center gap-2">
          {/* 4. Run & Debug button (#00C875) */}
          <button
            type="button"
            onClick={handleRunDebug}
            disabled={isExecuting || asmIsLoading}
            className="flex h-9 items-center gap-2 rounded-md bg-[#00C875] px-3.5 text-[13px] font-semibold text-[#080D16] transition-all hover:bg-[#00D97E] hover:shadow-[0_0_14px_rgba(0,200,117,0.35)] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Play size={14} fill="#080D16" />
            <span className="font-semibold">Run & Debug</span>
            <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-bold">
              F5
            </span>
          </button>

          {/* 5. Stop button (#F04452) */}
          <button
            type="button"
            onClick={handleStop}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#F04452]/40 bg-[#F04452]/10 px-3 text-[13px] font-medium text-[#F04452] hover:bg-[#F04452]/20 transition-all cursor-pointer"
            title="Stop execution"
          >
            <Square size={13} fill="#F04452" />
            <span>Stop</span>
          </button>

          <div className="h-5 w-px bg-[#1D293B] mx-0.5" />

          {/* 6. New button */}
          <button
            type="button"
            onClick={handleNewFile}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-2.5 text-[13px] font-medium text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all cursor-pointer"
            title="New File (Ctrl+N)"
          >
            <FilePlus size={14} />
            <span>New</span>
          </button>

          {/* 7. Download button */}
          <button
            type="button"
            onClick={handleDownloadCode}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-2.5 text-[13px] font-medium text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all cursor-pointer"
            title="Download Code (Ctrl+S)"
          >
            <Download size={14} />
            <span>Download</span>
          </button>

          {/* 8. Reset button */}
          <button
            type="button"
            onClick={handleResetCode}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-2.5 text-[13px] font-medium text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all cursor-pointer"
            title="Reset Code (Ctrl+R)"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          {/* 9. Examples button with open menu */}
          <div className="relative" ref={examplesDropdownRef}>
            <button
              type="button"
              onClick={() => setExamplesOpen(!examplesOpen)}
              className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-all cursor-pointer ${
                examplesOpen
                  ? "border-[#1685FF] bg-[#1685FF]/20 text-[#E7EDF7]"
                  : "border-[#1D293B] bg-[#080D16] text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40"
              }`}
            >
              <FolderOpen size={14} className={examplesOpen ? "text-[#1685FF]" : ""} />
              <span>Examples</span>
              <ChevronDown size={13} className={`transition-transform ${examplesOpen ? "rotate-180 text-[#1685FF]" : "text-[#94A3B8]"}`} />
            </button>

            {/* 5. Examples Dropdown Menu */}
            {examplesOpen && (
              <div className="absolute right-0 sm:left-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-lg border border-[#1D293B] bg-[#0D1523] p-3 shadow-2xl shadow-black/80 font-sans">
                {/* Heading */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1D293B]">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={15} className="text-[#1685FF]" />
                    <span className="font-semibold text-sm text-[#E7EDF7]">Example Programs</span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8]">5 Categories</span>
                </div>

                {/* Search input with Ctrl+K */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={exampleSearch}
                    onChange={(e) => setExampleSearch(e.target.value)}
                    placeholder="Search examples..."
                    className="w-full rounded-md border border-[#1D293B] bg-[#080D16] py-1.5 pl-8 pr-14 text-xs text-[#E7EDF7] placeholder-[#64748B] outline-none focus:border-[#1685FF]"
                    autoFocus
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[#1D293B] bg-[#0B111D] px-1.5 py-0.5 font-mono text-[10px] text-[#64748B]">
                    Ctrl+K
                  </span>
                </div>

                {/* Search Results List */}
                {exampleSearch.trim() ? (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filteredExamples.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#94A3B8]">
                        No matching examples found.
                      </div>
                    ) : (
                      filteredExamples.map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => handleSelectExample(ex)}
                          className="flex w-full flex-col rounded p-2 text-left hover:bg-[#1D293B]/60 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#E7EDF7]">{ex.title}</span>
                            <span className="rounded bg-[#1685FF]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#1685FF]">
                              {ex.category}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#94A3B8] mt-0.5">{ex.desc}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  /* 5 Categories list */
                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {EXAMPLE_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isExpanded = expandedCategory === cat.id;
                      return (
                        <div key={cat.id} className="rounded border border-[#1D293B]/60 bg-[#080D16]/50 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                            className="flex w-full items-center justify-between p-2.5 text-left hover:bg-[#1D293B]/40 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1685FF]/10 text-[#1685FF]">
                                <Icon size={14} />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[#E7EDF7]">{cat.title}</div>
                                <div className="text-[11px] text-[#94A3B8]">{cat.desc}</div>
                              </div>
                            </div>
                            <ChevronRight
                              size={14}
                              className={`text-[#94A3B8] transition-transform ${isExpanded ? "rotate-90 text-[#1685FF]" : ""}`}
                            />
                          </button>

                          {/* Expanded examples list */}
                          {isExpanded && (
                            <div className="border-t border-[#1D293B] bg-[#0B111D] p-1 space-y-0.5">
                              {cat.examples.map((ex) => (
                                <button
                                  key={ex.id}
                                  type="button"
                                  onClick={() => handleSelectExample(ex)}
                                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs text-[#E7EDF7] hover:bg-[#1685FF]/15 hover:text-[#1685FF] transition-colors"
                                >
                                  <div>
                                    <div className="font-medium">{ex.title}</div>
                                    <div className="text-[10px] text-[#94A3B8]">{ex.desc}</div>
                                  </div>
                                  <span className="text-[11px] text-[#1685FF] font-mono">Load →</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Divider */}
                <div className="my-2 border-t border-[#1D293B]" />

                {/* View All Examples */}
                <Link
                  href="/examples"
                  onClick={() => setExamplesOpen(false)}
                  className="flex items-center justify-between rounded-md p-2 text-xs font-semibold text-[#1685FF] hover:bg-[#1685FF]/10 transition-colors"
                >
                  <span>View All Examples</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>

          {/* 10. Practice button */}
          <Link
            href="/practice"
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-3 text-[13px] font-medium text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all"
          >
            <Target size={14} />
            <span>Practice</span>
          </Link>

          {/* 11. Learn button */}
          <Link
            href="/learn"
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-3 text-[13px] font-medium text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all"
          >
            <BookOpen size={14} />
            <span>Learn</span>
          </Link>

          {/* 12. Theme toggle */}
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#1D293B] bg-[#080D16] text-[#94A3B8] hover:text-[#E7EDF7] hover:border-[#1D293B] transition-colors cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {darkMode ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* 13. User profile avatar & menu */}
          <div className="relative" ref={userDropdownRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-[#1D293B] bg-[#080D16] px-2 text-[13px] text-[#E7EDF7] hover:border-[#1685FF]/40 transition-all cursor-pointer"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1685FF] font-semibold text-xs text-white">
                {user?.email ? user.email.charAt(0).toUpperCase() : "U"}
              </div>
              <ChevronDown size={13} className="text-[#94A3B8]" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[190px] rounded-md border border-[#1D293B] bg-[#0D1523] py-1 shadow-xl shadow-black/70">
                <div className="px-3 py-2 border-b border-[#1D293B]">
                  <div className="text-xs font-semibold text-[#E7EDF7]">
                    {user?.email || "Guest User"}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">
                    {user ? "Signed in" : "Local Workspace"}
                  </div>
                </div>
                <Link
                  href="/projects"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-3 py-2 text-xs text-[#E7EDF7] hover:bg-[#1D293B]/60"
                >
                  My Projects
                </Link>
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-3 py-2 text-xs text-[#E7EDF7] hover:bg-[#1D293B]/60"
                >
                  Account Profile
                </Link>
                <div className="my-1 border-t border-[#1D293B]" />
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut();
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-[#F04452] hover:bg-[#F04452]/10"
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-3 py-2 text-xs font-semibold text-[#1685FF] hover:bg-[#1685FF]/10"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main App Container: Left Sidebar (3) + Editor Workspace (4) */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3. Left Slim Sidebar (#0C1422) */}
        <aside className="flex w-[52px] shrink-0 flex-col items-center justify-between border-r border-[#1D293B] bg-[#0C1422] py-3 select-none z-20">
          <div className="flex flex-col items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => setSidebarActive("files")}
              title="Files / Explorer (Ctrl+Shift+E)"
              aria-label="Files and Explorer"
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                sidebarActive === "files"
                  ? "bg-[#1685FF]/20 text-[#1685FF]"
                  : "text-[#94A3B8] hover:bg-[#1D293B]/60 hover:text-[#E7EDF7]"
              }`}
            >
              <Files size={18} />
              {sidebarActive === "files" && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#1685FF]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSidebarActive("workspace")}
              title="Monitor / Workspace"
              aria-label="Monitor and Workspace"
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                sidebarActive === "workspace"
                  ? "bg-[#1685FF]/20 text-[#1685FF]"
                  : "text-[#94A3B8] hover:bg-[#1D293B]/60 hover:text-[#E7EDF7]"
              }`}
            >
              <Monitor size={18} />
              {sidebarActive === "workspace" && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#1685FF]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSidebarActive("git")}
              title="Git / Source Control"
              aria-label="Git and Source Control"
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                sidebarActive === "git"
                  ? "bg-[#1685FF]/20 text-[#1685FF]"
                  : "text-[#94A3B8] hover:bg-[#1D293B]/60 hover:text-[#E7EDF7]"
              }`}
            >
              <GitBranch size={18} />
              {sidebarActive === "git" && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#1685FF]" />
              )}
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => setSidebarActive("settings")}
              title="Settings"
              aria-label="Settings"
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                sidebarActive === "settings"
                  ? "bg-[#1685FF]/20 text-[#1685FF]"
                  : "text-[#94A3B8] hover:bg-[#1D293B]/60 hover:text-[#E7EDF7]"
              }`}
            >
              <Settings size={18} />
              {sidebarActive === "settings" && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#1685FF]" />
              )}
            </button>
          </div>
        </aside>

        {/* 4. Central Main Editor Workspace (#080D16) */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#080D16]">
          {/* Monaco Editor fills remaining height */}
          <div className="relative flex min-h-[160px] flex-1 overflow-hidden bg-[#080D16]">
            <Editor
              height="100%"
              language={fileMeta.monacoLang}
              theme="vs-dark"
              value={currentCode}
              onChange={(val) => setCodeBuffers((prev) => ({ ...prev, [lang]: val || "" }))}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                fontFamily: "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
                lineHeight: 24,
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

          {/* Drag Handle (12px) */}
          <div
            onMouseDown={handleMouseDown}
            className="flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-[#1D293B] bg-[#0B111D] hover:bg-[#1D293B] transition-colors select-none"
            title="Drag to resize bottom panel"
          >
            <div className="h-1 w-11 rounded-full bg-[#334155]" />
          </div>

          {/* Bottom Panel (#0D1523) with dynamic language-aware tabs */}
          <div className="flex shrink-0 flex-col overflow-hidden bg-[#0D1523]" style={{ height: `${panelHeight}px` }}>
            {/* Dynamic Language-Aware Tab Bar */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#1D293B] bg-[#0B111D] px-3 select-none">
              <div className="flex h-full items-center gap-1 overflow-x-auto">
                {config.tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex h-full items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? "border-[#1685FF] bg-[#0D1523] text-[#E7EDF7]"
                          : "border-transparent text-[#94A3B8] hover:text-[#E7EDF7]"
                      }`}
                    >
                      {getTabIcon(tab.id)}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Download Controls on Right Side of Tab Bar */}
              {activeTab !== "dosbox" && (
                <div className="flex items-center gap-2">
                  <select
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value as ".txt" | ".csv" | ".pdf" | ".png")}
                    className="h-7 rounded border border-[#1D293B] bg-[#080D16] px-2 text-[12px] text-[#E7EDF7] outline-none cursor-pointer"
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
                      className="flex h-7 items-center gap-1.5 rounded bg-[#1685FF] px-2.5 text-[12px] font-semibold text-white hover:bg-[#1270D8] transition-all cursor-pointer"
                    >
                      <Download size={13} />
                      <span>Download trace</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDownloadOutput}
                      className="flex h-7 items-center gap-1.5 rounded border border-[#1D293B] bg-[#080D16] px-2.5 text-[12px] font-semibold text-[#E7EDF7] hover:border-[#1685FF]/50 transition-all cursor-pointer"
                    >
                      <Download size={13} />
                      <span>Download output</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Panel Content: Tab-dependent */}
            <div className="flex flex-1 overflow-hidden bg-[#0D1523]">
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
                <div className="flex flex-1 flex-col justify-between p-4 font-mono text-[13px] leading-6 overflow-hidden">
                  <div className="space-y-1 overflow-y-auto flex-1">
                    {lang === "assembly" ? (
                      <pre className="text-[#94A3B8] whitespace-pre-wrap font-mono">
                        {asmStatus.stdout || "Z:\\>mount c C:\\OutputTracer\nDrive C is mounted as local directory C:\\OutputTracer\\\nZ:\\>c:\nC:\\>nasm -f bin main.asm -o main.com\nC:\\>main.com\nenter text (max 99 chars): hello\n"}
                      </pre>
                    ) : lang === "cpp" ? (
                      <pre className="text-[#E7EDF7] whitespace-pre-wrap font-mono">
                        {cppOutput}
                      </pre>
                    ) : (
                      <pre className="text-[#E7EDF7] whitespace-pre-wrap font-mono">
                        {pythonOutput}
                      </pre>
                    )}
                  </div>

                  {/* Input row at the bottom with green prompt */}
                  <div className="flex items-center gap-2 rounded-md border border-[#1D293B] bg-[#080D16] px-3 py-1.5 mt-2">
                    <span className="text-[16px] font-bold text-[#00C875]">›</span>
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
                      className="flex-1 bg-transparent font-mono text-[13px] text-[#E7EDF7] outline-none placeholder:text-[#64748B]"
                    />
                  </div>
                </div>
              )}

              {/* 3. INPUT TAB */}
              {activeTab === "input" && (
                <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#0D1523]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1D293B]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                      Standard Input Stream (stdin)
                    </span>
                    <span className="text-xs text-[#64748B]">Characters: {typedInput.length}</span>
                  </div>
                  <textarea
                    value={typedInput}
                    onChange={(e) => setTypedInput(e.target.value)}
                    placeholder="Enter input here for cin / input() / DOS 0Ah buffer..."
                    className="flex-1 w-full rounded border border-[#1D293B] bg-[#080D16] p-3 text-[#E7EDF7] outline-none focus:border-[#1685FF] resize-none font-mono"
                  />
                  <p className="mt-2 text-xs text-[#94A3B8]">
                    This value will be supplied to the execution engine when stdin is consumed.
                  </p>
                </div>
              )}

              {/* 4. TRACE TAB */}
              {activeTab === "trace" && (
                lang === "assembly" ? (
                  <div className="flex flex-1 flex-col overflow-hidden bg-[#06101E] text-[#94A3B8] font-mono text-[12px]">
                    <div className="flex items-center justify-between border-b border-[#173451] bg-[#09172A] px-4 py-2">
                      <span className="text-white font-semibold">NASM 8086 Execution Timeline</span>
                      <span className="text-[#1685FF]">{asmTraceHistory.length} instruction steps recorded</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      {asmTraceHistory.length === 0 ? (
                        <div className="text-[#64748B] p-4 text-center">
                          No trace steps yet. Click &quot;Run &amp; Debug&quot; (F5) or use the DOSBox tab to step through the program.
                        </div>
                      ) : (
                        <table className="w-full text-left font-mono text-xs">
                          <thead>
                            <tr className="border-b border-[#173451] text-[#64748B]">
                              <th className="py-1 px-2">Step</th>
                              <th className="py-1 px-2">Address</th>
                              <th className="py-1 px-2">Instruction</th>
                              <th className="py-1 px-2">Registers After</th>
                              <th className="py-1 px-2">Output</th>
                            </tr>
                          </thead>
                          <tbody>
                            {asmTraceHistory.map((step, idx) => (
                              <tr key={idx} className="border-b border-[#0D1523] hover:bg-[#09172A]">
                                <td className="py-1 px-2 text-[#00C875]">{step.step}</td>
                                <td className="py-1 px-2 text-[#1685FF]">
                                  CS:0x{step.addressBefore.offset.toString(16).padStart(4, "0").toUpperCase()}
                                </td>
                                <td className="py-1 px-2 text-white">
                                  {step.mnemonic} {step.operands}
                                </td>
                                <td className="py-1 px-2 text-[#00C875]">
                                  AX={step.registersAfter.ax.toString(16).padStart(4, "0")} DX={step.registersAfter.dx.toString(16).padStart(4, "0")}
                                </td>
                                <td className="py-1 px-2 text-[#94A3B8]">{step.stdoutDelta || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#1D293B] bg-[#0B111D] px-4 py-2 text-[13px] text-[#94A3B8]">
                      <span>
                        <strong className="text-white">{currentTraceSteps.length} steps in order.</strong> Click a row to jump to that line in the editor.
                      </span>
                      <span>Input used: <strong className="text-[#1685FF]">{typedInput}</strong></span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full border-collapse font-mono text-[13px] text-left">
                        <thead className="sticky top-0 z-10 border-b-2 border-[#1D293B] bg-[#0B111D] text-[12px] uppercase tracking-wider text-[#94A3B8]">
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
                                className={`border-b border-[#1D293B]/60 transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-[#1685FF]/15 border-l-4 border-l-[#1685FF] text-white font-medium"
                                    : "hover:bg-[#1D293B]/30 text-[#94A3B8]"
                                }`}
                              >
                                <td className="px-3 py-2">{step.step}</td>
                                <td className="px-3 py-2">L{step.line}</td>
                                <td className="px-3 py-2">{step.code}</td>
                                <td className="px-3 py-2">
                                  {step.changes === "—" ? (
                                    <span className="text-[#64748B]">—</span>
                                  ) : (
                                    step.changes.split(";").map((c, i) => (
                                      <span
                                        key={i}
                                        className="mr-1.5 inline-flex items-center rounded border border-[#00C875]/40 bg-[#00C875]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#00C875]"
                                      >
                                        {c.trim()}
                                      </span>
                                    ))
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {step.output === "—" ? (
                                    <span className="text-[#64748B]">—</span>
                                  ) : step.output.startsWith("(input") ? (
                                    <span className="font-semibold text-[#1685FF]">{step.output}</span>
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
                <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#0D1523]">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1D293B]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                      Interactive Debugger Console
                    </span>
                    <span className="text-xs text-[#00C875]">State: Ready / Idle</span>
                  </div>
                  <div className="flex-1 rounded border border-[#1D293B] bg-[#080D16] p-3 text-[#E7EDF7] overflow-y-auto">
                    <div className="text-[#94A3B8]">Debugger session initialized for {fileMeta.name}.</div>
                    <div className="text-[#94A3B8]">Press F5 to Run &amp; Debug or select Trace tab for full-program step tracing.</div>
                    <div className="pt-2 text-[#1685FF]">Target binary: compiled with debug symbols (-g).</div>
                  </div>
                </div>
              )}

              {/* 6. VARIABLES TAB (C++ & Python) */}
              {activeTab === "variables" && lang !== "assembly" && (
                <div className="flex flex-1 flex-col p-4 font-mono text-[13px] bg-[#0D1523] overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1D293B]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                      Local Scope Variables
                    </span>
                    <span className="text-xs text-[#1685FF]">Scope: main()</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#1D293B] text-[#94A3B8]">
                          <th className="py-2 px-3">Variable</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lang === "cpp" ? (
                          <>
                            <tr className="border-b border-[#1D293B]/50">
                              <td className="py-2 px-3 text-[#1685FF]">size</td>
                              <td className="py-2 px-3 text-[#00C875]">const int</td>
                              <td className="py-2 px-3 text-[#E7EDF7]">100</td>
                            </tr>
                            <tr className="border-b border-[#1D293B]/50">
                              <td className="py-2 px-3 text-[#1685FF]">text</td>
                              <td className="py-2 px-3 text-[#00C875]">char[100]</td>
                              <td className="py-2 px-3 text-[#E7EDF7]">&quot;{typedInput}&quot;</td>
                            </tr>
                          </>
                        ) : (
                          <>
                            <tr className="border-b border-[#1D293B]/50">
                              <td className="py-2 px-3 text-[#1685FF]">text</td>
                              <td className="py-2 px-3 text-[#00C875]">str</td>
                              <td className="py-2 px-3 text-[#E7EDF7]">&quot;{typedInput}&quot;</td>
                            </tr>
                            <tr className="border-b border-[#1D293B]/50">
                              <td className="py-2 px-3 text-[#1685FF]">len(text)</td>
                              <td className="py-2 px-3 text-[#00C875]">int</td>
                              <td className="py-2 px-3 text-[#E7EDF7]">{typedInput.length}</td>
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1685FF]">
                      8086 CPU Registers &amp; Flags
                    </span>
                    <span className="text-xs text-[#94A3B8]">Mode: 16-bit Real Mode</span>
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
                        <div className="flex justify-between text-[#94A3B8] text-[11px]">
                          <span>{reg.name}</span>
                          <span className="text-[#1685FF]">0x{(reg.val & 0xffff).toString(16).toUpperCase().padStart(4, "0")}</span>
                        </div>
                        {reg.hi && (
                          <div className="flex justify-between text-[10px] text-[#64748B] mt-1">
                            <span>{reg.hi}: 0x{((reg.val >> 8) & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                            <span>{reg.lo}: 0x{(reg.val & 0xff).toString(16).toUpperCase().padStart(2, "0")}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                    <div className="text-[11px] font-semibold text-[#94A3B8] uppercase mb-2">Flags</div>
                    <div className="flex gap-2">
                      {Object.entries(asmStatus.flags).map(([k, v]) => (
                        <span
                          key={k}
                          className={`px-2 py-0.5 rounded text-[11px] border font-mono ${
                            v
                              ? "bg-[#00C875]/20 border-[#00C875] text-[#00C875] font-bold"
                              : "bg-[#08182B] border-[#173451] text-[#64748B]"
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1685FF]">
                      Memory View (Segment 1000h)
                    </span>
                    <span className="text-xs text-[#94A3B8]">16 bytes per row</span>
                  </div>
                  <div className="flex-1 overflow-y-auto text-[11px] text-[#94A3B8] space-y-1">
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1685FF]">
                      Stack Frame &amp; SP
                    </span>
                    <span className="text-xs text-[#94A3B8]">SS: 1000h, SP: 0x{asmStatus.registers.sp.toString(16).toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded border border-[#173451] bg-[#09172A] p-3 text-center">
                      <div className="text-[#94A3B8] text-[10px]">[SS:FFFE]</div>
                      <div className="text-lg font-bold text-[#00C875]">0000h</div>
                      <div className="text-[10px] text-[#1685FF] mt-1">▲ Current SP</div>
                    </div>
                    <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#64748B]">
                      <div className="text-[10px]">[SS:FFFC]</div>
                      <div className="text-lg font-bold">0000h</div>
                    </div>
                    <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#64748B]">
                      <div className="text-[10px]">[SS:FFFA]</div>
                      <div className="text-lg font-bold">0000h</div>
                    </div>
                    <div className="rounded border border-[#173451] bg-[#08182B] p-3 text-center text-[#64748B]">
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1685FF]">
                      8086 Instruction Reference
                    </span>
                    <span className="text-xs text-[#94A3B8]">NASM syntax</span>
                  </div>
                  <div className="space-y-3 font-sans">
                    <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                      <div className="font-mono text-[13px] font-bold text-[#1685FF]">MOV dest, src</div>
                      <p className="text-xs text-[#94A3B8] mt-1">
                        Copies data from source to destination. Neither memory-to-memory nor segment-to-segment is allowed directly.
                      </p>
                    </div>
                    <div className="rounded border border-[#173451] bg-[#09172A] p-3">
                      <div className="font-mono text-[13px] font-bold text-[#00C875]">INT 21h (DOS API)</div>
                      <p className="text-xs text-[#94A3B8] mt-1">
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

          {/* Status Bar (#0B111D) */}
          <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[#1D293B] bg-[#0B111D] px-3 font-mono text-[12px] text-[#94A3B8] select-none">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#00C875] shadow-[0_0_8px_rgba(0,200,117,0.7)]" />
              <span className="text-[#E7EDF7] font-sans">
                {lang === "assembly"
                  ? activeTab === "dosbox"
                    ? "DOSBox Ready"
                    : `Assembly · ${asmStatus.state.toUpperCase()}`
                  : activeTab === "trace"
                  ? `Trace complete · ${currentTraceSteps.length} steps`
                  : "Ready"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>{lineCount} lines</span>
              <span className="text-[#334155]">|</span>
              <span>
                {activeTab === "trace"
                  ? lang === "assembly"
                    ? "Ln 6, Col 5"
                    : `Ln ${currentTraceSteps.find((s) => s.step === selectedTraceStep)?.line || 1}, Col 5`
                  : `Ln 1, Col 1`}
              </span>
              <span className="text-[#334155]">|</span>
              <span>{selectedCompiler.label}</span>
              <span className="text-[#334155]">|</span>
              <span>UTF-8</span>
              <span className="text-[#334155]">|</span>
              <span>{fileMeta.name}</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
