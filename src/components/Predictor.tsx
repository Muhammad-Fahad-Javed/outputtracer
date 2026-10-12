"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  FilePlus,
  Download,
  Bookmark,
} from "lucide-react";
import DryRunTimeline from "@/components/DryRunTimeline";
import dynamic from "next/dynamic";
import { DEFAULT_CODE, examples, consumePendingExample } from "@/lib/examples";
import { PredictionResult } from "@/types/predictor";
import { isValidSourceFilename } from "@/lib/sourceFiles";
import { FileTabs } from "@/components/ide/FileTabs";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1E1E1E]">
      <span className="font-mono text-sm text-[#858585]">Loading editor…</span>
    </div>
  ),
});
import {
  DebuggerControls,
  IdeMenu,
  IdeMenuItem,
  OutputTabs,
  debugStatusLabel,
  useDebuggerKeys,
} from "@/components/ide/VsChrome";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const InteractiveTerminal = dynamic(
  () => import("@/components/InteractiveTerminal"),
  { ssr: false, loading: () => <div className="flex h-[350px] items-center justify-center rounded-[4px] border border-[#DCDCDC] bg-[#111111]"><span className="font-mono text-sm text-[#666666]">Loading terminal…</span></div> }
);

const IDLE_RESULT: PredictionResult = { status: "idle" };

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
  const router = useRouter();
  const [activeFile, setActiveFile] = useState("main.cpp");
  const [result, setResult] = useState<PredictionResult>(IDLE_RESULT);
  const [copied, setCopied] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [panel, setPanel] = useState<"debug" | "trace">("debug");
  const [runRequest, setRunRequest] = useState(0);
  const [stopRequest, setStopRequest] = useState(0);
  const [debugStatus, setDebugStatus] = useState("idle");
  const [createRequest, setCreateRequest] = useState(0);
  const [savedSnippet, setSavedSnippet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { user, signOut } = useAuth();

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
    setPanel("trace");
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
    setCreateRequest((current) => current + 1);
  };

  const createNamedFile = (name: string) => {
    if (!isValidSourceFilename(name)) return "Use a name like helper.cpp or helper.h.";
    if (files[name]) return "That file already exists.";
    setFiles({ ...files, [name]: "" });
    setActiveFile(name);
    return null;
  };

  const renameNamedFile = (from: string, to: string) => {
    if (from === to) return null;
    if (!isValidSourceFilename(to)) return "Use a name like helper.cpp or helper.h.";
    if (files[to]) return "That file already exists.";
    const next = { ...files, [to]: files[from] ?? "" };
    delete next[from];
    setFiles(next);
    if (currentFile === from) setActiveFile(to);
    return null;
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

  const handleSaveSnippet = async () => {
    if (!user) {
      if (
        typeof window !== "undefined" &&
        window.confirm(
          "Sign in to save your C++ code snippets to your account. Go to sign in page?"
        )
      ) {
        router.push("/login?next=/#predictor");
      }
      return;
    }

    const title = window.prompt("Enter a title for this snippet:", "C++ Program");
    if (!title) return;

    setIsSaving(true);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) { alert("Auth not configured."); return; }
      const { error } = await supabase.from("saved_snippets").insert({
        user_id: user.id,
        title: title.trim(),
        files,
        stdin,
      });

      if (!error) {
        setSavedSnippet(true);
        setTimeout(() => setSavedSnippet(false), 2000);
      } else {
        alert("Could not save snippet: " + error.message);
      }
    } catch {
      alert("Error saving snippet.");
    } finally {
      setIsSaving(false);
    }
  };

  const hasOutput = result.status === "success" || result.status === "error";
  const debugging = debugStatus === "connecting" || debugStatus === "compiling" || debugStatus === "running";
  const startDebug = useCallback(() => {
    setPanel("debug");
    setRunRequest((n) => n + 1);
  }, []);
  const stopDebug = useCallback(() => {
    setStopRequest((n) => n + 1);
  }, []);
  useDebuggerKeys(startDebug, stopDebug);

  return (
    <section id="predictor" className="flex h-full w-full flex-col bg-[#2D2D30] text-[#D4D4D4] font-sans">
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-[#333333] bg-[#2D2D30] px-2 text-[12px] text-[#F1F1F1]">
        <div className="flex items-center gap-1">
          <Link href="/" className="rounded-[2px] px-2 py-0.5 font-semibold hover:bg-[#3E3E42]">
            OutputTracer
          </Link>
          <IdeMenu label="File">
            <IdeMenuItem onClick={handleAddFile}>New file</IdeMenuItem>
            <IdeMenuItem onClick={handleDownloadFile}>Download this file</IdeMenuItem>
            <IdeMenuItem onClick={() => void handleDownloadZip()}>Download all</IdeMenuItem>
            <IdeMenuItem onClick={handleReset}>Reset</IdeMenuItem>
            <IdeMenuItem onClick={handleLoadExample}>Load example</IdeMenuItem>
          </IdeMenu>
          <IdeMenu label="View">
            <IdeMenuItem onClick={() => setPanel("debug")}>Debug</IdeMenuItem>
            <IdeMenuItem onClick={() => setPanel("trace")}>Trace</IdeMenuItem>
          </IdeMenu>
        </div>
        <div className="flex items-center gap-1 pr-1">
          <Link href="/examples" className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">Examples</Link>
          <Link href="/practice" className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">Practice</Link>
          <Link href="/learn" className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">Learn</Link>
          <Link href="/projects" className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">Projects</Link>
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="rounded-[2px] px-2 py-0.5 hover:bg-[#3E3E42]">Sign in</Link>
          )}
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[#333333] bg-[#2D2D30] px-2">
        <DebuggerControls running={debugging} onStart={startDebug} onStop={stopDebug} />
        <div className="h-4 w-px bg-[#4D4D50]" />
        <button
          type="button"
          onClick={() => void handlePredict()}
          className="rounded-[2px] px-2 py-0.5 text-[12px] text-[#D4D4D4] hover:bg-[#3E3E42]"
          title="Show each step"
          aria-label="Trace execution step by step"
        >
          Trace
        </button>
        <div className="h-4 w-px bg-[#4D4D50]" />
        <button onClick={handleAddFile} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="New file" aria-label="Create new file">
          <FilePlus size={14} />
        </button>
        <button onClick={() => void handleDownloadZip()} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="Download" aria-label="Download project files as ZIP">
          <Download size={14} />
        </button>
        <button onClick={handleReset} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="Reset" aria-label="Reset code to default template">
          <RotateCcw size={14} />
        </button>
        <button onClick={handleLoadExample} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="Load example" aria-label="Load random code example">
          <Sparkles size={14} />
        </button>
        <button
          onClick={() => void handleSaveSnippet()}
          disabled={isSaving}
          className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42] disabled:opacity-50"
          title={user ? "Save snippet to account" : "Sign in to save snippet"}
          aria-label={user ? "Save snippet to account" : "Sign in to save snippet"}
        >
          {savedSnippet ? <Check size={14} className="text-green-400" /> : <Bookmark size={14} />}
        </button>
      </div>

      {/* 3. Main Workspace (Split Vertically) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Pane: Editor */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#1E1E1E]">
          {/* File Tabs */}
          <FileTabs
            names={Object.keys(files)}
            active={currentFile}
            canEdit
            createRequest={createRequest}
            onSelect={setActiveFile}
            onCreate={createNamedFile}
            onRename={renameNamedFile}
            onDelete={handleDeleteFile}
          />

          {/* Editor Container */}
          <div className="relative flex-1 overflow-hidden border-t border-[#1E1E1E]">
            <CodeEditor
              value={files[currentFile] || ""}
              onChange={(content) => setFiles({ ...files, [currentFile]: content })}
              onRunShortcut={startDebug}
            />
          </div>
        </div>

        {/* Bottom Pane: Terminal / Output */}
        <div className="flex h-72 shrink-0 flex-col border-t border-[#333333] bg-[#252526]">
          <OutputTabs
            value={panel}
            onChange={setPanel}
            extra={panel === "trace" && hasOutput && (result.output || result.stderr) ? (
              <>
                <button type="button" onClick={handleCopy} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="Copy" aria-label="Copy output to clipboard">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button type="button" onClick={handleClearOutput} className="rounded-[2px] p-1 text-[#D4D4D4] hover:bg-[#3E3E42]" title="Clear" aria-label="Clear output window">
                  <Trash2 size={13} />
                </button>
              </>
            ) : null}
          />

          <div className={panel === "debug" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <InteractiveTerminal
              files={files}
              runRequest={runRequest}
              stopRequest={stopRequest}
              showControls={false}
              onStatusChange={setDebugStatus}
            />
          </div>
          {panel === "trace" && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
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
                    aria-label="Standard input (stdin)"
                    className="flex-1 w-full resize-none bg-[#1E1E1E] text-[#D4D4D4] p-3 font-mono text-[13px] focus:outline-none placeholder:text-[#767676]"
                  />
                </div>

                {/* Main Output / Trace panel - Right side of bottom panel */}
                <div className="flex-1 flex flex-col overflow-y-auto bg-[#1E1E1E] p-3 space-y-4">
                  {/* Status Indicator */}
                  {result.status === "idle" && (
                    <p className="font-mono text-[12px] text-[#858585]">
                      Paste input here, then press Trace. The green debugger button runs the program in the Debug tab.
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

      <footer className="flex h-6 shrink-0 items-center justify-between bg-[#007ACC] px-3 text-[11px] text-white">
        <span>{result.status === "loading" ? "Tracing…" : debugStatusLabel(debugStatus)}</span>
        <span>{currentFile}</span>
      </footer>
    </section>
  );
}