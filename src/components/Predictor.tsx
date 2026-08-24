"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import PredictButton from "@/components/PredictButton";
import DryRunTimeline from "@/components/DryRunTimeline";
import { DEFAULT_CODE, examples, consumePendingExample } from "@/lib/examples";
import { PredictionResult } from "@/types/predictor";

const IDLE_RESULT: PredictionResult = { status: "idle" };

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
    setResult(IDLE_RESULT);
  };

  const handleLoadExample = () => {
    const random = examples[Math.floor(Math.random() * examples.length)];

    setFiles({ "main.cpp": random.code });
    setActiveFile("main.cpp");
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
    const confirm = window.confirm(`Are you sure you want to delete ${fileName}?`);
    if (!confirm) return;

    const newFiles = { ...files };
    delete newFiles[fileName];
    setFiles(newFiles);
    if (activeFile === fileName) {
      setActiveFile(Object.keys(newFiles)[0]);
    }
  };

  const handleDownloadFile = () => {
    const content = files[activeFile] || "";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    saveAs(blob, activeFile);
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

  return (
    <section
      id="predictor"
      className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
    >
      {/* Editor workspace */}
      <div className="overflow-hidden rounded-[4px] border border-[#DCDCDC]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#FAFAFA] px-2 py-2 gap-2 border-b border-[#DCDCDC]">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.keys(files).map((fileName) => (
              <div
                key={fileName}
                className={`group flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 font-mono text-xs font-medium cursor-pointer transition-colors ${
                  activeFile === fileName
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
              onClick={() => setShowStdin((v) => !v)}
              aria-expanded={showStdin}
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[#F2F2F2] ${
                showStdin ? "text-black" : "text-[#666666]"
              }`}
            >
              Input (stdin){stdin.trim() ? " •" : ""}
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

        <CodeEditor
          value={files[activeFile] || ""}
          onChange={(content) => setFiles({ ...files, [activeFile]: content })}
          onRunShortcut={handlePredict}
        />

        {showStdin && (
          <div className="border-t border-[#DCDCDC] bg-[#FAFAFA] px-4 py-3">
            <label
              htmlFor="stdin-input"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#666666]"
            >
              Standard Input
            </label>
            <textarea
              id="stdin-input"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Values your program reads via std::cin, one per line…"
              rows={3}
              className="w-full resize-y rounded-[3px] border border-[#DCDCDC] bg-white px-3 py-2 font-mono text-sm text-black placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
        )}

        <div className="bg-[#FAFAFA] px-4 py-5">
          <PredictButton
            onClick={handlePredict}
            loading={result.status === "loading"}
          />
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        {/* Output */}
        <div className="rounded-[4px] border border-[#DCDCDC] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#DCDCDC] bg-[#FAFAFA] px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Output
            </span>

            {result.status === "success" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy output"
                  className="inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs text-black transition-colors hover:bg-[#F2F2F2]"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy"}
                </button>

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

          <div className="min-h-[160px] px-4 py-5">
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

            {(result.status === "success" || result.status === "error") && (
              <>
                {result.output && (
                  <div className="mb-4">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                      Standard Output
                    </span>
                    <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-black">
                      {result.output}
                    </pre>
                  </div>
                )}
                
                {result.status === "success" && !result.output && !result.stderr && (
                  <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed italic text-[#999999]">
                    (No output)
                  </pre>
                )}

                {result.stderr && (
                  <div className="mb-4">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                      Standard Error
                    </span>
                    <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-[#D93025]">
                      {result.stderr}
                    </pre>
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

                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[#666666]">
                        {result.error.message}
                      </pre>
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

        {/* Step-by-Step Trace */}
        <div className="rounded-[4px] border border-[#DCDCDC] lg:col-span-3">
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
    </section>
  );
}