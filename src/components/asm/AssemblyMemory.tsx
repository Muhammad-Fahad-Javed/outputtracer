"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AsmExecutionStatus } from "@/lib/asm/types";

interface Props {
  sessionId: string | null;
  sessionToken: string | null;
  status: AsmExecutionStatus;
  mode: "memory" | "stack";
}

interface Inspection {
  sessionId: string;
  sessionToken: string;
  status: AsmExecutionStatus;
  segment: number;
  offset: number;
  length: number;
  refresh: number;
  bytes?: number[];
  error?: string;
}

const hex = (value: number, digits = 4) => value.toString(16).toUpperCase().padStart(digits, "0");
function parseHex(value: string) {
  const cleaned = value.trim().replace(/^0x/i, "");
  return /^[0-9a-f]{1,4}$/i.test(cleaned) ? Number.parseInt(cleaned, 16) : null;
}

export default function AssemblyMemory({ sessionId, sessionToken, status, mode }: Props) {
  const [segmentText, setSegmentText] = useState<string | null>(null);
  const [offsetText, setOffsetText] = useState("0100");
  const [refresh, setRefresh] = useState(0);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const stack = mode === "stack";
  const segmentValue = segmentText ?? hex(status.registers.ds);
  const segment = stack ? status.registers.ss : parseHex(segmentValue);
  const offset = stack ? status.registers.sp : parseHex(offsetText);
  const length = stack ? 64 : 128;
  const validAddress = segment !== null && offset !== null;
  const available = Boolean(sessionId && sessionToken);
  // A new execution status invalidates the previous bytes immediately, including
  // reset/step-back transitions that can repeat an earlier instruction count.
  const current = inspection && inspection.sessionId === sessionId && inspection.sessionToken === sessionToken &&
    inspection.status === status && inspection.segment === segment && inspection.offset === offset && inspection.length === length && inspection.refresh === refresh;
  const bytes = current ? inspection.bytes : undefined;
  const error = current ? inspection.error : undefined;
  const loading = available && validAddress && !current;

  useEffect(() => {
    if (!sessionId || !sessionToken || segment === null || offset === null) return;
    const controller = new AbortController();
    const request = { sessionId, sessionToken, status, segment, offset, length, refresh };
    async function inspect() {
      try {
        const response = await fetch("/api/asm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "inspect", sessionId, sessionToken, segment, offset, length }),
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Could not read execution memory.");
        if (!Array.isArray(result.bytes) || result.bytes.length !== length || result.bytes.some((value: unknown) => typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255)) {
          throw new Error("The execution server returned invalid memory data.");
        }
        if (!controller.signal.aborted) setInspection({ ...request, bytes: result.bytes });
      } catch (failure) {
        if (!controller.signal.aborted) setInspection({ ...request, error: failure instanceof Error ? failure.message : "Could not read execution memory." });
      }
    }
    void inspect();
    return () => controller.abort();
  }, [sessionId, sessionToken, status, segment, offset, length, refresh]);

  const inputStyle = "w-20 rounded border border-[#444] bg-[#161616] px-2 py-1 font-mono text-xs text-[#eee] outline-none focus-visible:border-[#89d185]";
  return <section data-surface="dark" aria-label={stack ? "8086 stack inspection" : "8086 memory inspection"} className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#141414] text-xs text-[#ccc]">
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#303030] bg-[#1a1a1a] px-3 py-2">
      {stack ? <span className="font-mono">SS:SP <span className="text-[#89d185]">{hex(status.registers.ss)}:{hex(status.registers.sp)}</span></span> : <>
        <label className="flex items-center gap-2">Segment <input aria-label="Memory segment in hexadecimal" value={segmentValue} onChange={event => setSegmentText(event.target.value)} maxLength={6} spellCheck={false} className={inputStyle}/></label>
        <label className="flex items-center gap-2">Offset <input aria-label="Memory offset in hexadecimal" value={offsetText} onChange={event => setOffsetText(event.target.value)} maxLength={6} spellCheck={false} className={inputStyle}/></label>
      </>}
      <button type="button" disabled={!available || !validAddress || loading} onClick={() => setRefresh(value => value + 1)} className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-[#ccc] hover:bg-[#303030] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#89d185] disabled:opacity-40"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Refresh</button>
    </div>
    {!available ? <p className="p-4 text-[#999]">Assemble or run a program to inspect its {stack ? "stack" : "memory"}.</p> : !validAddress ? <p role="alert" className="p-4 text-amber-300">Enter a hexadecimal segment and offset from 0000 to FFFF.</p> : loading ? <p role="status" className="p-4 text-[#999]">Reading execution {stack ? "stack" : "memory"}…</p> : error ? <p role="alert" className="p-4 text-red-300">{error}</p> : bytes && <div className="min-h-0 flex-1 overflow-auto p-3">
      {stack ? <table className="w-full max-w-lg border-collapse text-left font-mono text-xs">
        <caption className="mb-2 text-left font-sans text-[11px] text-[#888]">Actual words starting at SS:SP · little-endian · includes unused stack memory</caption>
        <thead><tr className="text-[#888]"><th className="px-2 py-1 font-normal">Address</th><th className="px-2 py-1 font-normal">Word</th><th className="px-2 py-1 font-normal">Bytes</th></tr></thead>
        <tbody>{Array.from({ length: bytes.length / 2 }, (_, index) => <tr key={index} className={index === 0 ? "bg-[#203526] text-[#b7dfb4]" : "border-t border-[#242424]"}><td className="px-2 py-1">{hex(segment!)}:{hex((offset! + index * 2) & 0xffff)}{index === 0 && <span className="ml-2 font-sans text-[10px]">← SP</span>}</td><td className="px-2 py-1">{hex(bytes[index * 2] | (bytes[index * 2 + 1] << 8))}</td><td className="px-2 py-1 text-[#999]">{hex(bytes[index * 2], 2)} {hex(bytes[index * 2 + 1], 2)}</td></tr>)}</tbody>
      </table> : <div className="w-max min-w-full font-mono text-xs leading-6">
        <p className="mb-1 text-[#888]">Actual bytes · hexadecimal addresses · {bytes.length} bytes</p>
        {Array.from({ length: Math.ceil(bytes.length / 16) }, (_, index) => {
          const row = bytes.slice(index * 16, index * 16 + 16);
          return <div key={index} className="flex gap-4 whitespace-pre"><span className="text-[#888]">{hex(segment!)}:{hex((offset! + index * 16) & 0xffff)}</span><span>{row.map(value => hex(value, 2)).join(" ")}</span><span className="text-[#89d185]">{row.map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join("")}</span></div>;
        })}
      </div>}
    </div>}
  </section>;
}
