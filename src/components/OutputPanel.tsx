"use client";

import { useState } from "react";
import { Copy, Check, Trash2, AlertTriangle } from "lucide-react";
import { PredictionResult } from "@/types/predictor";

interface OutputPanelProps {
  result: PredictionResult;
  onClear: () => void;
}

export default function OutputPanel({ result, onClear }: OutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in some environments — fail silently.
    }
  };

  return (
    <div className="rounded-md border border-[#E5E5E5]">
      <div className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#F7F7F7] px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
          Output
        </span>
        {result.status === "success" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy output"
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-[#1F1F1F] transition-colors hover:bg-[#E5E5E5]"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear output"
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-[#1F1F1F] transition-colors hover:bg-[#E5E5E5]"
            >
              <Trash2 size={13} />
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="min-h-[110px] px-4 py-5">
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
          <pre className="mono-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-relaxed text-black">
            {result.output}
          </pre>
        )}

        {result.status === "error" && result.error && (
          <div className="flex gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#1F1F1F]" />
            <div>
              <p className="font-mono text-xs font-semibold tracking-wide text-[#111111]">
                {result.error.title}
              </p>
              <p className="mt-1 font-mono text-[13px] leading-relaxed text-[#444444]">
                {result.error.message}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
