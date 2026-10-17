"use client";
import { useEffect, useState } from "react";
import type { TraceValue } from "@/lib/python/pythonTypes";
import { usePythonTrace } from "./usePythonTrace";
import styles from "./PythonTracePanel.module.css";

export function formatValue(v: TraceValue, depth = 0): string {
  switch (v.t) {
    case "none": return "None";
    case "bool": return v.v ? "True" : "False";
    case "int": return String(v.v);
    case "bigint": return `<int, ${v.bits} bits>`;
    case "float": return typeof v.v === "number" ? String(v.v) : `float('${v.v}')`;
    case "str": return JSON.stringify(v.v) + (v.trunc ? "…" : "");
    case "ref": return `<circular ${v.kind}>`;
    case "deep": return `<${v.kind}, ${v.len} items>`;
    case "object": return `<${v.kind} object>`;
    case "dict": {
      const body = v.v.map(([k, val]) => `${formatValue(k, depth + 1)}: ${formatValue(val, depth + 1)}`).join(", ");
      return `{${body}${v.trunc ? ", …" : ""}}`;
    }
    default: {
      const body = v.v.map((x) => formatValue(x, depth + 1)).join(", ");
      const more = v.trunc ? ", …" : "";
      if (v.t === "list") return `[${body}${more}]`;
      if (v.t === "tuple") return `(${body}${v.v.length === 1 && !v.trunc ? "," : ""}${more})`;
      return `${v.t === "frozenset" ? "frozenset" : ""}{${body}${more}}`;
    }
  }
}

interface Props {
  code: string;
  stdin: string;
  onStdinChange(v: string): void;
  /** Called with the current source line (1-based) so the editor can highlight it. */
  onActiveLine?(line: number | null): void;
}

export default function PythonTracePanel({ code, stdin, onStdinChange, onActiveLine }: Props) {
  const t = usePythonTrace();
  const [showGlobals, setShowGlobals] = useState(false);
  const busy = t.phase === "running";
  const steps = t.trace?.steps ?? [];
  const hasTrace = steps.length > 0;

  const go = (fn: () => void) => () => { fn(); };
  // Report the active line after any navigation (effect, not render).
  const line = t.step?.line ?? null;
  useEffect(() => { onActiveLine?.(line); }, [line, onActiveLine]);

  return (
    <section className={styles.panel} aria-label="Python execution and trace">
      <div className={styles.toolbar} role="toolbar" aria-label="Run controls">
        <button type="button" className={styles.primary} disabled={busy} onClick={() => t.runCode(code, stdin)}>Run</button>
        <button type="button" disabled={busy} onClick={() => t.traceCode(code, stdin)}>Trace</button>
        <button type="button" disabled={!busy} onClick={t.stop}>Stop</button>
        <span className={styles.sep} aria-hidden="true" />
        <button type="button" disabled={!hasTrace || busy} onClick={go(t.nav.first)} aria-label="Jump to first step">⏮</button>
        <button type="button" disabled={!hasTrace || busy || t.index === 0} onClick={go(t.nav.prev)} aria-label="Step backward">◀</button>
        <button type="button" disabled={!hasTrace || busy || t.index >= steps.length - 1} onClick={go(t.nav.next)} aria-label="Step forward">▶</button>
        <button type="button" disabled={!hasTrace || busy} onClick={go(t.nav.last)} aria-label="Jump to final step">⏭</button>
        <button type="button" disabled={!hasTrace || busy} onClick={go(t.nav.nextException)}>Next exception</button>
      </div>

      {hasTrace && (
        <label className={styles.slider}>
          <span>Step {t.index + 1} / {steps.length}</span>
          <input
            type="range" min={0} max={steps.length - 1} value={t.index}
            onChange={(e) => t.nav.goto(Number(e.target.value))}
            aria-label="Trace progress"
          />
        </label>
      )}

      <label className={styles.stdin}>
        <span>Input (stdin)</span>
        <textarea value={stdin} onChange={(e) => onStdinChange(e.target.value)} rows={2} spellCheck={false} />
      </label>

      <div role="status" aria-live="polite" className={styles.status}>
        {busy && "Running…"}
        {t.phase === "error" && <span className={styles.err}>{t.message}</span>}
        {t.trace?.truncated && (
          <span className={styles.warn}>
            Trace stopped early ({t.trace.truncationReason === "max_steps" ? "step limit reached" : "size limit reached"}).
          </span>
        )}
        {t.trace && t.trace.status === "timeout" && <span className={styles.warn}>Timed out.</span>}
        {t.trace && t.trace.status === "resource_limit" && <span className={styles.warn}>Resource limit reached.</span>}
        {t.run && (
          <span>
            {t.run.success ? "Finished" : `Stopped: ${t.run.status.replace(/_/g, " ")}`} · exit {t.run.exitCode ?? "—"} · {t.run.executionTimeMs} ms
            {t.run.truncated && " · output truncated"}
          </span>
        )}
      </div>

      {t.run && (
        <div className={styles.outputs}>
          <pre aria-label="Standard output" className={styles.out}>{t.run.stdout || " "}</pre>
          {t.run.stderr && <pre aria-label="Standard error" className={`${styles.out} ${styles.errOut}`}>{t.run.stderr}</pre>}
        </div>
      )}

      {t.trace && (
        <div className={styles.grid}>
          <div>
            <h3>Variables{t.step ? ` · line ${t.step.line} · ${t.step.event}` : ""}</h3>
            {t.step && Object.keys(t.step.locals).length === 0 && <p className={styles.muted}>No variables yet.</p>}
            <dl className={styles.vars}>
              {t.step && Object.entries(t.step.locals).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{formatValue(v)}</dd></div>
              ))}
            </dl>
            {t.step?.globals && Object.keys(t.step.globals).length > 0 && (
              <>
                <button type="button" className={styles.link} onClick={() => setShowGlobals((s) => !s)} aria-expanded={showGlobals}>
                  {showGlobals ? "Hide" : "Show"} globals
                </button>
                {showGlobals && (
                  <dl className={styles.vars}>
                    {Object.entries(t.step.globals).map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{formatValue(v)}</dd></div>
                    ))}
                  </dl>
                )}
              </>
            )}
            {t.step?.returnValue && <p>Returns <code>{formatValue(t.step.returnValue)}</code></p>}
            {t.step?.exception && (
              <p className={styles.err}>{t.step.exception.type}: {t.step.exception.message}</p>
            )}
          </div>
          <div>
            <h3>Call stack</h3>
            <ol className={styles.stack}>
              {[...(t.step?.stack ?? [])].reverse().map((f, i) => (
                <li key={i}>{f.function} <span className={styles.muted}>line {f.line}</span></li>
              ))}
            </ol>
            <h3>Output</h3>
            <pre aria-label="Output so far" className={styles.out}>{t.outputSoFar || " "}</pre>
            {t.index >= steps.length - 1 && t.trace.stderr && (
              <pre aria-label="Standard error" className={`${styles.out} ${styles.errOut}`}>{t.trace.stderr}</pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
