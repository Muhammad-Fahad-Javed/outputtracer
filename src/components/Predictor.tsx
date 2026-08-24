"use client";

import { useEffect, useState } from "react";
import {
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import PredictButton from "@/components/PredictButton";
import DryRunTimeline from "@/components/DryRunTimeline";
import { DEFAULT_CODE, examples, consumePendingExample } from "@/lib/examples";
import { PredictionResult } from "@/types/predictor";

const IDLE_RESULT: PredictionResult = { status: "idle" };

interface PredictorProps {
  code: string;
  setCode: (code: string) => void;
}

export default function Predictor({ code, setCode }: PredictorProps) {
  const [result, setResult] = useState<PredictionResult>(IDLE_RESULT);
  const [copied, setCopied] = useState(false);
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);

  // Pick up a code snippet selected on /examples, if any, on first mount.
  useEffect(() => {
    const pending = consumePendingExample();

    if (pending) {
      setCode(pending);
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
          source: code,
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
    setCode(DEFAULT_CODE);
    setResult(IDLE_RESULT);
  };

  const handleLoadExample = () => {
    const random = examples[Math.floor(Math.random() * examples.length)];

    setCode(random.code);
    setResult(IDLE_RESULT);
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
        <div className="flex items-center justify-between bg-[#FAFAFA] px-4 py-2">
          <span className="rounded-[3px] border border-[#DCDCDC] bg-white px-2 py-0.5 font-mono text-xs font-semibold text-black">
            C++
          </span>

          <div className="flex items-center gap-1">
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
          value={code}
          onChange={setCode}
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

            {result.status === "success" && (
              <>
                <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-black">
                  {result.output}
                </pre>

                <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#666666]">
                  <CheckCircle2 size={13} />
                  Execution complete
                  {typeof result.meta?.exitCode === "number" && result.meta.exitCode !== 0 && (
                    <span className="text-[#999999]">
                      &nbsp;— exited with code {result.meta.exitCode}
                    </span>
                  )}
                </p>
              </>
            )}

            {result.status === "error" && result.error && (
              <div className="flex gap-2.5">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-black"
                />

                <div>
                  <p className="font-mono text-xs font-semibold tracking-wide text-black">
                    {result.error.title}
                  </p>

                  <p className="mt-1 font-mono text-[13px] leading-relaxed text-[#666666]">
                    {result.error.message}
                  </p>
                </div>
              </div>
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