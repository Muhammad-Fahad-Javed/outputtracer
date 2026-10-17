import { callWorker } from "./pythonSandboxClient";
import type { RunDeps } from "./pythonRunner";
import {
  PYTHON_LIMITS,
  PythonSystemError,
  validateTraceInput,
  type PythonTraceOptions,
  type PythonTraceResult,
  type PythonTraceStatus,
  type PythonTraceStep,
  type TraceEvent,
  type TraceFrame,
  type TraceValue,
} from "./pythonTypes";

/*
 * SECURITY NOTE: the trace result is produced inside the sandbox by code that
 * shares a process with the user's program, so the user can forge it. It is
 * therefore treated as UNTRUSTED input here: every field is rebuilt from an
 * allowlist with hard caps, never passed through as-is.
 */

const EVENTS: ReadonlySet<string> = new Set<TraceEvent>(["call", "line", "return", "exception"]);
const STATUSES: ReadonlySet<string> = new Set<PythonTraceStatus>([
  "ok", "exception", "syntax_error", "truncated", "timeout", "resource_limit",
]);
const MAX_DEPTH = 8;
const MAX_ITEMS = 50;
const MAX_STR = 400;
const MAX_NAME = 120;
const MAX_VARS = 60;
const MAX_STACK = 50;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const posInt = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

export function sanitizeValue(v: unknown, depth = 0): TraceValue {
  if (!v || typeof v !== "object" || depth > MAX_DEPTH) return { t: "object", kind: "invalid" };
  const o = v as Record<string, unknown>;
  switch (o.t) {
    case "none": return { t: "none" };
    case "bool": return { t: "bool", v: o.v === true };
    case "int":
      return typeof o.v === "number" && Number.isFinite(o.v)
        ? { t: "int", v: o.v }
        : { t: "int", v: str(o.v, 40) };
    case "bigint": return { t: "bigint", bits: posInt(o.bits) };
    case "float":
      if (o.v === "nan" || o.v === "inf" || o.v === "-inf") return { t: "float", v: o.v };
      return { t: "float", v: typeof o.v === "number" && Number.isFinite(o.v) ? o.v : "nan" };
    case "str":
      return { t: "str", v: str(o.v, MAX_STR), ...(o.trunc === true ? { len: posInt(o.len), trunc: true } : {}) };
    case "list": case "tuple": case "set": case "frozenset": {
      const items = Array.isArray(o.v) ? o.v.slice(0, MAX_ITEMS).map((x) => sanitizeValue(x, depth + 1)) : [];
      return { t: o.t, v: items, len: posInt(o.len), trunc: o.trunc === true };
    }
    case "dict": {
      const pairs: [TraceValue, TraceValue][] = [];
      if (Array.isArray(o.v)) {
        for (const p of o.v.slice(0, MAX_ITEMS)) {
          if (Array.isArray(p) && p.length === 2) pairs.push([sanitizeValue(p[0], depth + 1), sanitizeValue(p[1], depth + 1)]);
        }
      }
      return { t: "dict", v: pairs, len: posInt(o.len), trunc: o.trunc === true };
    }
    case "ref": return { t: "ref", kind: str(o.kind, MAX_NAME) };
    case "deep": return { t: "deep", kind: str(o.kind, MAX_NAME), len: posInt(o.len) };
    case "object": return { t: "object", kind: str(o.kind, MAX_NAME) };
    default: return { t: "object", kind: "invalid" };
  }
}

function sanitizeVars(v: unknown): Record<string, TraceValue> {
  const out: Record<string, TraceValue> = Object.create(null);
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n++ >= MAX_VARS) break;
    out[k.slice(0, MAX_NAME)] = sanitizeValue(val);
  }
  return out;
}

export function sanitizeStep(s: unknown, expectedIndex: number): PythonTraceStep | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if (typeof o.event !== "string" || !EVENTS.has(o.event)) return null;
  const line = posInt(o.line);
  if (line < 1) return null;
  const stack: TraceFrame[] = Array.isArray(o.stack)
    ? o.stack.slice(0, MAX_STACK).flatMap((f) => {
        if (!f || typeof f !== "object") return [];
        const fr = f as Record<string, unknown>;
        return [{ function: str(fr.function, MAX_NAME), line: posInt(fr.line) }];
      })
    : [];
  const step: PythonTraceStep = {
    index: expectedIndex, // renumbered: indices are authoritative on this side
    line,
    event: o.event as TraceEvent,
    function: str(o.function, MAX_NAME),
    locals: sanitizeVars(o.locals),
    stack,
    stdout: str(o.stdout, PYTHON_LIMITS.maxOutputBytes),
  };
  if (o.globals !== undefined) step.globals = sanitizeVars(o.globals);
  if (o.returnValue !== undefined) step.returnValue = sanitizeValue(o.returnValue);
  if (o.exception && typeof o.exception === "object") {
    const e = o.exception as Record<string, unknown>;
    step.exception = { type: str(e.type, MAX_NAME), message: str(e.message, 300) };
  }
  return step;
}

export function sanitizeTraceResult(raw: Record<string, unknown>, maxSteps: number): PythonTraceResult {
  const status = typeof raw.status === "string" && STATUSES.has(raw.status) ? (raw.status as PythonTraceStatus) : null;
  if (!status) throw new PythonSystemError("internal_error");

  const steps: PythonTraceStep[] = [];
  let truncated = raw.truncated === true;
  let truncationReason: PythonTraceResult["truncationReason"] =
    raw.truncationReason === "max_steps" || raw.truncationReason === "max_response_bytes" ? raw.truncationReason : null;
  if (Array.isArray(raw.steps)) {
    for (const s of raw.steps) {
      if (steps.length >= maxSteps) { truncated = true; truncationReason = truncationReason ?? "max_steps"; break; }
      const clean = sanitizeStep(s, steps.length);
      if (clean) steps.push(clean);
    }
  }

  let error: PythonTraceResult["error"] = null;
  if (raw.error && typeof raw.error === "object") {
    const e = raw.error as Record<string, unknown>;
    error = { type: str(e.type, MAX_NAME), message: str(e.message, 300), line: posInt(e.line) };
  }

  return {
    status,
    exitCode: typeof raw.exitCode === "number" ? raw.exitCode : null,
    steps,
    truncated,
    truncationReason,
    stdoutTruncated: raw.stdoutTruncated === true,
    trailingStdout: str(raw.trailingStdout, PYTHON_LIMITS.maxOutputBytes),
    stderr: str(raw.stderr, PYTHON_LIMITS.maxOutputBytes),
    error,
    executionTimeMs: typeof raw.executionTimeMs === "number" ? Math.max(0, Math.round(raw.executionTimeMs)) : 0,
    ...(typeof raw.detail === "string" ? { detail: raw.detail.slice(0, 200) } : {}),
  };
}

/** Run the program under the step tracer in the sandbox. See trace_worker.py for the event contract. */
export async function tracePythonCode(
  code: string,
  options: PythonTraceOptions = {},
  deps: RunDeps & { stdin?: string; clientId?: string } = {},
): Promise<PythonTraceResult> {
  const input = validateTraceInput({ code, stdin: deps.stdin ?? "", options });
  const raw = await callWorker({
    path: "/v1/trace",
    body: {
      code: input.code,
      stdin: input.stdin,
      limits: { maxSteps: input.options.maxSteps },
      clientId: deps.clientId,
    },
    timeoutMs: 15_000,
    config: deps.config,
    fetchImpl: deps.fetchImpl,
  });
  return sanitizeTraceResult(raw, input.options.maxSteps);
}
