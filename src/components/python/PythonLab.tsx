"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Code,
  Sparkles,
  BookOpen,
} from "lucide-react";
import type { OnMount } from "@monaco-editor/react";
import PythonTracePanel from "./PythonTracePanel";
import { PYTHON_STARTER } from "./pythonStarter";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1E1E1E]">
      <span className="font-mono text-sm text-[#858585]">Loading Python editor…</span>
    </div>
  ),
});

const PYTHON_EXAMPLES = [
  {
    name: "Interactive Greeting",
    desc: "Functions, f-strings, and standard input",
    code: `# Interactive Greeting
def greet(name: str) -> str:
    return f"Hello, {name}! Welcome to OutputTracer."

name = input("Enter your name: ")
print(greet(name))

total = 0
for i in range(1, 6):
    total += i
print("Sum of 1..5:", total)
`,
    stdin: "Ada Lovelace\n",
  },
  {
    name: "Fibonacci Sequence",
    desc: "Lists, loops, and list comprehension",
    code: `# Fibonacci Sequence Generator
def fibonacci(n: int) -> list[int]:
    seq = [0, 1]
    for _ in range(2, n):
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

limit = int(input("How many terms? ") or "8")
result = fibonacci(limit)
print("Fibonacci series:", result)
print("Evens:", [x for x in result if x % 2 == 0])
`,
    stdin: "8\n",
  },
  {
    name: "Dictionary & Frequency Counter",
    desc: "Data structures and string manipulation",
    code: `# Character Frequency Analyzer
text = "outputtracer python"
counts = {}

for ch in text:
    if ch.isalpha():
        counts[ch] = counts.get(ch, 0) + 1

print("Character frequencies:")
for letter, count in sorted(counts.items()):
    print(f"  {letter}: {count}")
`,
    stdin: "",
  },
];

export default function PythonLab() {
  const [code, setCode] = useState(PYTHON_STARTER);
  const [stdin, setStdin] = useState("World\n");
  const editorRef = useRef<Parameters<NonNullable<OnMount>>[0] | null>(null);
  const monacoRef = useRef<Parameters<NonNullable<OnMount>>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const updateLineHighlight = useCallback((line: number | null) => {
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

  const loadExample = (example: (typeof PYTHON_EXAMPLES)[0]) => {
    setCode(example.code);
    setStdin(example.stdin);
    updateLineHighlight(null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#1E1E1E] text-[#D4D4D4]">
      {/* Top Banner / Sample Picker */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#2D2D2D] bg-[#252526] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-[#007ACC]" />
          <span className="font-semibold text-white">Python 3 Execution & Tracer Lab</span>
          <span className="rounded bg-[#007ACC]/20 px-1.5 py-0.5 text-[10px] text-[#389FD6]">
            Python 3.11+
          </span>
        </div>

        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-[#858585]" />
          <span className="text-[#858585]">Examples:</span>
          {PYTHON_EXAMPLES.map((ex) => (
            <button
              key={ex.name}
              type="button"
              onClick={() => loadExample(ex)}
              className="rounded bg-[#2D2D2D] px-2 py-1 text-[11px] text-[#CCCCCC] transition-colors hover:bg-[#3E3E3E] hover:text-white"
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace: Editor on Left, PythonTracePanel on Right */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left Column: Monaco Code Editor */}
        <div className="flex flex-1 flex-col border-b border-[#2D2D2D] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[#2D2D2D] bg-[#1E1E1E] px-4 py-1.5 text-xs text-[#858585]">
            <span className="flex items-center gap-1 font-mono">
              <Sparkles className="h-3.5 w-3.5 text-[#007ACC]" /> main.py
            </span>
            <span>Monaco Editor</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || "")}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 13,
                fontFamily: "var(--font-mono, 'Fira Code', 'Cascadia Code', monospace)",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderWhitespace: "selection",
                tabSize: 4,
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </div>

        {/* Right Column: PythonTracePanel */}
        <div className="flex w-full flex-col overflow-y-auto bg-[#1E1E1E] lg:w-[460px] xl:w-[500px]">
          <PythonTracePanel
            code={code}
            stdin={stdin}
            onStdinChange={setStdin}
            onActiveLine={updateLineHighlight}
          />
        </div>
      </div>
    </div>
  );
}
