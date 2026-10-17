"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PythonApiResponse, PythonTraceResult, PythonRunResult } from "@/lib/python/pythonTypes";

type Phase = "idle" | "running" | "ready" | "error";

/**
 * Holds ONE bounded trace in memory. Stepping never calls the server:
 * navigation just moves `index` over the recorded steps.
 * State is per hook instance, so each editor tab/project should mount its own.
 */
export function usePythonTrace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [trace, setTrace] = useState<PythonTraceResult | null>(null);
  const [run, setRun] = useState<PythonRunResult | null>(null);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const post = useCallback(async <T,>(url: string, body: unknown): Promise<T | null> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("running");
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as PythonApiResponse<T>;
      if (!data.ok) {
        setPhase("error");
        setMessage(data.error.message);
        return null;
      }
      return data.result;
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setPhase("error");
        setMessage("Could not reach the server.");
      }
      return null;
    }
  }, []);

  const runCode = useCallback(
    async (code: string, stdin: string) => {
      const r = await post<PythonRunResult>("/api/python", { code, stdin, language: "python" });
      if (r) { setRun(r); setTrace(null); setPhase("ready"); }
    },
    [post],
  );

  const traceCode = useCallback(
    async (code: string, stdin: string) => {
      const t = await post<PythonTraceResult>("/api/python/trace", { code, stdin, language: "python" });
      if (t) { setTrace(t); setRun(null); setIndex(0); setPhase("ready"); }
    },
    [post],
  );

  const stop = useCallback(() => { abortRef.current?.abort(); setPhase("idle"); }, []);

  const last = Math.max((trace?.steps.length ?? 1) - 1, 0);
  const nav = useMemo(
    () => ({
      first: () => setIndex(0),
      prev: () => setIndex((i) => Math.max(i - 1, 0)),
      next: () => setIndex((i) => Math.min(i + 1, last)),
      last: () => setIndex(last),
      goto: (i: number) => setIndex(Math.min(Math.max(i, 0), last)),
      nextException: () => {
        const steps = trace?.steps ?? [];
        const hit = steps.findIndex((s, i) => i > index && s.event === "exception");
        if (hit >= 0) setIndex(hit);
      },
    }),
    [last, trace, index],
  );

  // Cumulative output up to and including the current step (steps carry increments).
  const outputSoFar = useMemo(() => {
    if (!trace) return "";
    let out = "";
    for (let i = 0; i <= index && i < trace.steps.length; i++) out += trace.steps[i].stdout;
    if (index >= trace.steps.length - 1) out += trace.trailingStdout;
    return out;
  }, [trace, index]);

  return { phase, message, trace, run, index, step: trace?.steps[index] ?? null, outputSoFar, runCode, traceCode, stop, nav };
}
