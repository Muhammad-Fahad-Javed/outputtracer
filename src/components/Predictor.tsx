"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FilePlus,
  Download,
  X,
  FileCode2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Play,
  FlaskConical,
} from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import PredictButton from "@/components/PredictButton";
import DryRunTimeline from "@/components/DryRunTimeline";
import dynamic from "next/dynamic";
import { DEFAULT_CODE, examples, consumePendingExample } from "@/lib/examples";
import { PredictionResult } from "@/types/predictor";

const InteractiveTerminal = dynamic(
  () => import("@/components/InteractiveTerminal"),
  { ssr: false, loading: () => <div className="flex h-[350px] items-center justify-center rounded-[4px] border border-[#DCDCDC] bg-[#111111]"><span className="font-mono text-sm text-[#666666]">Loading terminal…</span></div> }
);

const IDLE_RESULT: PredictionResult = { status: "idle" };

type RunMode = "predict" | "interactive";

/** Patterns that suggest the program reads from stdin. */
const STDIN_PATTERNS = [
  /\bcin\s*>>/,
  /\bgetline\s*\(/,
  /\bscanf\s*\(/,
  /\bgetchar\s*\(/,
  /\bgets\s*\(/,
  /\bfgets\s*\(.+stdin/,
];

function codeNeedsInput(files: Record<string, string>): boolean {
  return Object.values(files).some((content) =>
    STDIN_PATTERNS.some((pattern) => pattern.test(content))
  );
}

interface PredictorProps {
  files: Record<string, string>;
  setFiles: (files: Record<string, string>) => void;
}

export default function Predictor({ files, setFiles }: PredictorProps) {
  const [activeFile, setActiveFile] = useState("main.cpp");
  const [result, setResult] = useState<PredictionResult>(IDLE_RESULT);
  const [copied, setCopied] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [runMode, setRunMode] = useState<RunMode>("interactive");

  const needsInput = useMemo(() => codeNeedsInput(files), [files]);

  // Derive a safe active file — if the stored activeFile no longer exists
  // in the files map, fall back to the first available file.
  const safeActiveFile = files[activeFile] !== undefined ? activeFile : Object.keys(files)[0] ?? "main.cpp";

  // If safeActiveFile diverged from activeFile, sync it on next interaction
  // (we can't call setState during render, but we handle it in event handlers).
  const currentFile = safeActiveFile;

  // Auto-expand stdin when code uses cin/scanf — track with a ref so we
  // only auto-open once per "detection" rather than fighting the user.
  const [stdinAutoOpened, setStdinAutoOpened] = useState(false);
  if (needsInput && !showStdin && !stdinAutoOpened) {
    // Schedule the state update to happen after render
    queueMicrotask(() => {
      setShowStdin(true);
      setStdinAutoOpened(true);
    });
  }
  if (!needsInput && stdinAutoOpened) {
    queueMicrotask(() => setStdinAutoOpened(false));
  }

  // Pick up a code snippet selected on /examples, if any, on first mount.
  useEffect(() => {
    const pending = consumePendingExample();

    if (pending) {
      setFiles({ "main.cpp": pending });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send C++ code to the API
  const handlePredict = async () => {
    setResult({ status: "loading" });

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files,
          stdin,
        }),
      });

      const data = await response.json();

      setResult(data);
    } catch {
      setResult({
        status: "error",
        error: {
          title: "Connection error",
          message: "Could not connect to the prediction server.",
        },
      });
    }
  };

  const handleReset = () => {
    setFiles({ "main.cpp": DEFAULT_CODE });
    setActiveFile("main.cpp");
    setStdin("");
    setResult(IDLE_RESULT);
  };

  const handleLoadExample = () => {
    const random = examples[Math.floor(Math.random() * examples.length)];

    setFiles({ "main.cpp": random.code });
    setActiveFile("main.cpp");
    setStdin("");
    setResult(IDLE_RESULT);
  };

  const handleAddFile = () => {
    let name = "new_file.cpp";
    let counter = 1;
    while (files[name]) {
      name = `new_file_${counter}.cpp`;
      counter++;
    }
    
    const input = prompt("Enter file name (e.g. helper.h, helper.cpp):", name);
    if (!input) return;
    
    const finalName = input.trim();
    if (files[finalName]) {
      alert("A file with that name already exists.");
      return;
    }
    if (!finalName.endsWith(".cpp") && !finalName.endsWith(".h") && !finalName.endsWith(".hpp")) {
      alert("File must end with .cpp, .h, or .hpp");
      return;
    }
    
    setFiles({ ...files, [finalName]: "" });
    setActiveFile(finalName);
  };

  const handleDeleteFile = (fileName: string) => {
    if (Object.keys(files).length <= 1) {
      alert("You must have at least one file.");
      return;
    }
    const shouldDelete = window.confirm(`Are you sure you want to delete ${fileName}?`);
    if (!shouldDelete) return;

    const newFiles = { ...files };
    delete newFiles[fileName];
    setFiles(newFiles);
    if (currentFile === fileName) {
      setActiveFile(Object.keys(newFiles)[0]);
    }
  };

  const handleDownloadFile = () => {
    const content = files[currentFile] || "";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, currentFile);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    Object.entries(files).forEach(([name, content]) => {
      zip.file(name, content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "outputtracer_project.zip");
  };

  const handleCopy = async () => {
    if (!result.output) return;

    try {
      await navigator.clipboard.writeText(result.output);

      setCopied(true);

      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable — fail silently.
    }
  };

  const handleClearOutput = () => {
    setResult(IDLE_RESULT);
  };

  const hasOutput = result.status === "success" || result.status === "error";

  return (
    <section id="predictor" className="flex h-full w-full flex-col bg-[#2D2D30] text-[#D4D4D4] font-sans">
      {/* 1. VS Menu Bar */}
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-[#333333] bg-[#2D2D30] px-2 text-[12px] text-[#F1F1F1]">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold px-2 hover:bg-[#3E3E42] rounded-[2px] transition-colors py-0.5">
            OutputTracer
          </Link>
          <nav className="hidden items-center md:flex">
            {["File", "Edit", "View", "Project", "Build", "Debug"].map(item => (
              <button key={item} className="px-2 py-0.5 hover:bg-[#3E3E42] rounded-[2px] transition-colors cursor-default">
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 pr-2">
          <Link href="/practice" className="px-2 py-0.5 hover:bg-[#3E3E42] rounded-[2px] transition-colors">Practice</Link>
          <Link href="/learn" className="px-2 py-0.5 hover:bg-[#3E3E42] rounded-[2px] transition-colors">Learn</Link>
        </div>
      </header>

      {/* 2. VS Toolbar */}
      <div className="flex h-8 shrink-0 items-center gap-4 border-b border-[#333333] bg-[#2D2D30] px-3">
        <div className="flex items-center gap-2">
          {/* Green Run Button (Interactive) */}
          <button
            type="button"
            onClick={() => setRunMode("interactive")}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] transition-colors border border-transparent rounded-[2px] ${
              runMode === "interactive" ? "bg-[#3E3E42] border-[#555558]" : "hover:bg-[#3E3E42]"
            }`}
          >
            <Play size={14} className="text-[#689F38] fill-[#689F38]" />
            <span>Local Windows Debugger</span>
          </button>
          
          {/* Predict Button */}
          <button
            type="button"
            onClick={() => setRunMode("predict")}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] transition-colors border border-transparent rounded-[2px] ${
              runMode === "predict" ? "bg-[#3E3E42] border-[#555558]" : "hover:bg-[#3E3E42]"
            }`}
          >
            <FlaskConical size={14} className="text-[#007ACC]" />
            <span>Predict + Trace</span>
          </button>
        </div>

        <div className="h-4 w-px bg-[#4D4D50]" />

        {/* Other Toolbar actions */}
        <div className="flex items-center gap-1">
          <button onClick={handleAddFile} className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4]" title="Add File">
            <FilePlus size={14} />
          </button>
          <button onClick={handleDownloadZip} className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4]" title="Download Solution">
            <Download size={14} />
          </button>
          <button onClick={handleReset} className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4]" title="Reset">
            <RotateCcw size={14} />
          </button>
          <button onClick={handleLoadExample} className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4]" title="Load Example">
            <Sparkles size={14} />
          </button>
        </div>
      </div>

      {/* 3. Main Workspace (Split Vertically) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Pane: Editor */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#1E1E1E]">
          {/* File Tabs */}
          <div className="flex shrink-0 items-end bg-[#2D2D30] pt-1 px-1 gap-0.5 h-8">
            {Object.keys(files).map((fileName) => (
              <div
                key={fileName}
                className={`group relative flex items-center gap-2 px-3 py-1 text-[12px] cursor-pointer ${
                  currentFile === fileName
                    ? "bg-[#1E1E1E] text-[#F1F1F1]"
                    : "bg-[#2D2D30] text-[#969696] hover:bg-[#1C97EA]/10 hover:text-[#F1F1F1]"
                }`}
                onClick={() => setActiveFile(fileName)}
              >
                {/* Active blue line indicator */}
                {currentFile === fileName && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#007ACC]" />
                )}
                <FileCode2 size={12} className={currentFile === fileName ? "text-[#007ACC]" : ""} />
                {fileName}
                {Object.keys(files).length > 1 && (
                  <button
                    className={`ml-1 rounded-[2px] p-0.5 ${currentFile === fileName ? "opacity-100" : "opacity-0 group-hover:opacity-100"} hover:bg-[#333333]`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(fileName);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Editor Container */}
          <div className="flex-1 overflow-hidden relative border-t border-[#1E1E1E]">
            {/* The predict mode has a floating "Run" button if we wanted, but we have it in the toolbar. */}
            {runMode === "predict" && (
              <div className="absolute top-2 right-4 z-10">
                <PredictButton
                  onClick={handlePredict}
                  loading={result.status === "loading"}
                />
              </div>
            )}
            
            <CodeEditor
              value={files[currentFile] || ""}
              onChange={(content) => setFiles({ ...files, [currentFile]: content })}
              onRunShortcut={handlePredict}
            />
          </div>
        </div>

        {/* Bottom Pane: Terminal / Output */}
        <div className="flex flex-col h-72 border-t border-[#333333] bg-[#252526] shrink-0">
          {/* Output Tabs Header */}
          <div className="flex items-center justify-between shrink-0 h-7 bg-[#2D2D30] border-b border-[#333333]">
            <div className="flex items-center h-full px-2">
              <span className="text-[12px] font-semibold text-[#F1F1F1] px-2">Output</span>
            </div>
            
            <div className="flex items-center pr-2 gap-1">
              {hasOutput && (result.output || result.stderr) && (
                <>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4] transition-colors"
                    title="Copy All"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearOutput}
                    className="p-1 hover:bg-[#3E3E42] rounded-[2px] text-[#D4D4D4] transition-colors"
                    title="Clear All"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {runMode === "interactive" ? (
              <div className="flex-1 overflow-y-auto">
                <InteractiveTerminal files={files} />
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Standard Input panel - Left side of bottom panel */}
                <div className="w-1/3 min-w-[200px] border-r border-[#333333] flex flex-col bg-[#1E1E1E]">
                  <div className="px-3 py-1.5 border-b border-[#333333] flex justify-between items-center bg-[#2D2D30]">
                    <span className="text-[11px] font-semibold text-[#D4D4D4]">Standard Input</span>
                    {needsInput && !stdin.trim() && (
                      <span className="text-[10px] text-[#E5C07B]">Input required</span>
                    )}
                  </div>
                  <textarea
                    id="stdin-input"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    placeholder={
                      needsInput
                        ? "Enter input values here..."
                        : "Optional stdin..."
                    }
                    className="flex-1 w-full resize-none bg-[#1E1E1E] text-[#D4D4D4] p-3 font-mono text-[13px] focus:outline-none placeholder:text-[#555555]"
                  />
                </div>

                {/* Main Output / Trace panel - Right side of bottom panel */}
                <div className="flex-1 flex flex-col overflow-y-auto bg-[#1E1E1E] p-3 space-y-4">
                  {/* Status Indicator */}
                  {result.status === "idle" && (
                    <p className="font-mono text-[12px] text-[#555555]">
                      Ready. Select a run mode from the toolbar.
                    </p>
                  )}

                  {result.status === "loading" && (
                    <div className="flex items-center gap-2 font-mono text-[12px] text-[#007ACC]">
                      <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-[#007ACC]" />
                      Build started...
                    </div>
                  )}

                  {hasOutput && (
                    <div className="space-y-4">
                      {/* stdout */}
                      {result.output && (
                        <div>
                          <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[#D4D4D4]">{result.output}</pre>
                        </div>
                      )}
                      
                      {result.status === "success" && !result.output && !result.stderr && (
                        <p className="font-mono text-[13px] italic text-[#555555]">
                          The program exited normally with no output.
                        </p>
                      )}

                      {/* stderr */}
                      {result.stderr && (
                        <div>
                          <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[#F48771]">{result.stderr}</pre>
                        </div>
                      )}

                      {/* Error details */}
                      {result.status === "error" && result.error && (
                        <div className="flex gap-2.5 mt-2 rounded bg-[#333333] border border-[#444444] p-2">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#F48771]" />
                          <div className="min-w-0">
                            <p className="font-mono text-[12px] font-semibold text-[#F48771]">
                              {result.error.title}
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] text-[#D4D4D4]">{result.error.message}</pre>
                          </div>
                        </div>
                      )}

                      {/* Trace */}
                      {(result.dryRun ?? []).length > 0 && (
                        <div className="mt-4 border-t border-[#333333] pt-4">
                          <span className="block text-[11px] font-semibold text-[#858585] mb-3 uppercase tracking-wider">
                            Execution Trace
                          </span>
                          <DryRunTimeline steps={result.dryRun ?? []} truncated={result.traceTruncated} />
                        </div>
                      )}
                      
                      {/* Exit code */}
                      {result.status === "success" && (
                        <p className="mt-2 text-[12px] text-[#858585]">
                          Program exited with code {result.meta?.exitCode ?? 0}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Visual Studio bottom status bar (blue/purple) */}
      <footer className="flex h-6 shrink-0 items-center bg-[#007ACC] px-3 text-[11px] text-white font-medium">
        <span>Ready</span>
      </footer>
    </section>
  );
}