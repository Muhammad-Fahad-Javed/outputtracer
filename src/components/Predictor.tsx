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
    <section id="predictor" className="flex h-full w-full flex-col bg-white">
      {/* 1. IDE Top Navigation Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#DCDCDC] bg-[#FAFAFA] px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[14px] font-semibold tracking-tight text-black">
            OutputTracer
          </Link>
          <nav className="hidden items-center gap-4 md:flex">
            <Link href="/practice" className="text-[13px] text-[#666666] hover:text-black transition-colors">Practice</Link>
            <Link href="/learn" className="text-[13px] text-[#666666] hover:text-black transition-colors">Learn</Link>
          </nav>
        </div>
        
        {/* Run modes on the right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-[4px] border border-[#DCDCDC] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setRunMode("interactive")}
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 text-xs font-medium transition-colors ${
                runMode === "interactive"
                  ? "bg-black text-white"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              <Play size={11} />
              <span className="hidden sm:inline">Interactive Run</span>
              <span className="sm:hidden">Run</span>
            </button>
            <button
              type="button"
              onClick={() => setRunMode("predict")}
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 text-xs font-medium transition-colors ${
                runMode === "predict"
                  ? "bg-black text-white"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              <FlaskConical size={11} />
              <span className="hidden sm:inline">Predict + Trace</span>
              <span className="sm:hidden">Predict</span>
            </button>
          </div>
          {runMode === "predict" && (
            <div className="ml-1">
              <PredictButton
                onClick={handlePredict}
                loading={result.status === "loading"}
              />
            </div>
          )}
        </div>
      </header>

      {/* 2. Main IDE Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        
        {/* Left Pane: Editor */}
        <div className="flex flex-col border-b border-[#DCDCDC] lg:w-1/2 lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 flex-col sm:flex-row items-start sm:items-center justify-between bg-[#FAFAFA] px-2 py-2 gap-2 border-b border-[#DCDCDC]">
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.keys(files).map((fileName) => (
                <div
                  key={fileName}
                  className={`group flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 font-mono text-xs font-medium cursor-pointer transition-colors ${
                    currentFile === fileName
                      ? "border-[#DCDCDC] bg-white text-black shadow-sm"
                      : "border-transparent bg-transparent text-[#666666] hover:bg-[#EAEAEA] hover:text-black"
                  }`}
                  onClick={() => setActiveFile(fileName)}
                >
                  <FileCode2 size={13} />
                  {fileName}
                  {Object.keys(files).length > 1 && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-black/10 rounded transition-opacity"
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
              
              <button
                type="button"
                onClick={handleAddFile}
                className="ml-1 flex items-center justify-center p-1.5 rounded-[4px] text-[#666666] hover:bg-[#EAEAEA] hover:text-black transition-colors"
                title="Add File"
              >
                <FilePlus size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1 px-2">
              <button
                type="button"
                onClick={handleDownloadZip}
                className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
                title="Download Project ZIP"
              >
                <Download size={13} />
                ZIP
              </button>
              <button
                type="button"
                onClick={handleDownloadFile}
                className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
                title="Download Current File"
              >
                <Download size={13} />
                File
              </button>

              <button
                type="button"
                onClick={handleLoadExample}
                className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
              >
                <Sparkles size={13} />
                Example
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden min-h-[300px]">
            <CodeEditor
              value={files[currentFile] || ""}
              onChange={(content) => setFiles({ ...files, [currentFile]: content })}
              onRunShortcut={handlePredict}
            />
          </div>
        </div>

        {/* Right Pane: Terminal / Output */}
        <div className="flex flex-col lg:w-1/2 bg-[#FAFAFA] overflow-hidden">
          {runMode === "interactive" ? (
            <div className="flex-1 p-4 overflow-y-auto">
              <InteractiveTerminal files={files} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto">
              {/* Stdin panel */}
              <div className="shrink-0 border-b border-[#DCDCDC] bg-white">
                <button
                  type="button"
                  onClick={() => setShowStdin((v) => !v)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[#F2F2F2]"
                >
                  {showStdin ? (
                    <ChevronDown size={14} className="text-[#666666]" />
                  ) : (
                    <ChevronRight size={14} className="text-[#666666]" />
                  )}
                  <Terminal size={14} className="text-[#666666]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
                    Standard Input (stdin)
                  </span>
                  {stdin.trim() && (
                    <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-black" title="Input provided" />
                  )}
                  {needsInput && !stdin.trim() && (
                    <span className="ml-2 rounded-[3px] bg-[#FFF3CD] px-1.5 py-0.5 text-[10px] font-semibold text-[#856404]">
                      Input detected — provide values below
                    </span>
                  )}
                </button>

                {showStdin && (
                  <div className="px-4 pb-3">
                    <textarea
                      id="stdin-input"
                      value={stdin}
                      onChange={(e) => setStdin(e.target.value)}
                      placeholder={
                        needsInput
                          ? "Your code uses cin/scanf — enter input values here, one per line…"
                          : "Values your program reads via std::cin, one per line…"
                      }
                      rows={3}
                      className="w-full resize-y rounded-[3px] border border-[#DCDCDC] bg-white px-3 py-2 font-mono text-sm text-black placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                    {stdin.trim() && (
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-[#999999]">
                          {stdin.trim().split("\n").length} line{stdin.trim().split("\n").length !== 1 ? "s" : ""} of input
                        </span>
                        <button
                          type="button"
                          onClick={() => setStdin("")}
                          className="inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 text-[11px] text-[#999999] transition-colors hover:bg-[#EAEAEA] hover:text-[#666666]"
                        >
                          <X size={10} />
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Output & Trace */}
              <div className="flex-1 p-4 space-y-5">
                <div className="rounded-[4px] border border-[#DCDCDC] bg-white">
                  <div className="flex items-center justify-between border-b border-[#DCDCDC] bg-[#FAFAFA] px-4 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
                      Output
                    </span>

                    {hasOutput && (result.output || result.stderr) && (
                      <div className="flex items-center gap-1">
                        {result.output && (
                          <button
                            type="button"
                            onClick={handleCopy}
                            aria-label="Copy output"
                            className="inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs text-black transition-colors hover:bg-[#F2F2F2]"
                          >
                            {copied ? <Check size={13} /> : <Copy size={13} />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleClearOutput}
                          aria-label="Clear output"
                          className="inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs text-black transition-colors hover:bg-[#F2F2F2]"
                        >
                          <Trash2 size={13} />
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-5">
                    {result.status === "idle" && (
                      <p className="font-mono text-sm text-[#999999]">
                        Run the predictor to see the expected output here.
                      </p>
                    )}

                    {result.status === "loading" && (
                      <div className="flex items-center gap-2 font-mono text-sm text-[#666666]">
                        <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-[#666666]" />
                        Analyzing program…
                      </div>
                    )}

                    {hasOutput && (
                      <>
                        {result.output && (
                          <div className="mb-4">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                              Standard Output
                            </span>
                            <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-black">{result.output}</pre>
                          </div>
                        )}
                        
                        {result.status === "success" && !result.output && !result.stderr && (
                          <p className="font-mono text-[15px] leading-relaxed italic text-[#999999]">
                            (No output)
                          </p>
                        )}

                        {result.stderr && (
                          <div className="mb-4">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                              Standard Error
                            </span>
                            <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-[#D93025]">{result.stderr}</pre>
                          </div>
                        )}

                        {result.status === "error" && result.error && (
                          <div className="flex gap-2.5 mt-4 rounded bg-[#FAFAFA] border border-[#DCDCDC] p-3">
                            <AlertTriangle
                              size={16}
                              className="mt-0.5 shrink-0 text-black"
                            />

                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold tracking-wide text-black">
                                {result.error.title}
                              </p>

                              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[#666666]">{result.error.message}</pre>
                            </div>
                          </div>
                        )}

                        {result.status === "success" && (
                          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#666666]">
                            <CheckCircle2 size={13} />
                            Execution complete
                            {typeof result.meta?.exitCode === "number" && result.meta.exitCode !== 0 && (
                              <span className="text-[#999999]">
                                &nbsp;— exited with code {result.meta.exitCode}
                              </span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-[4px] border border-[#DCDCDC] bg-white">
                  <div className="border-b border-[#DCDCDC] bg-[#FAFAFA] px-4 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
                      Step-by-Step Trace
                    </span>
                  </div>

                  <div className="px-4 py-4">
                    <DryRunTimeline steps={result.dryRun ?? []} truncated={result.traceTruncated} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}