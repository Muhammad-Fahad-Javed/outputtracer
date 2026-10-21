// Shared contracts for Python execution and tracing.
// Stable across backend, API routes and frontend.

export const PYTHON_LANGUAGE_ID = "python" as const;
export const PYTHON_LANGUAGE_NAME = "Python 3" as const;

export const PYTHON_LIMITS = {
  maxCodeBytes: 64 * 1024,
  maxStdinBytes: 16 * 1024,
  maxOutputBytes: 64 * 1024,
  defaultTimeoutMs: 5000,
  defaultTraceSteps: 2000,
  maxTraceSteps: 2000,
  maxTraceResponseBytes: 2 * 1024 * 1024,
} as const;

/** System-level failures: the request could not be (fully) served. */
export type PythonSystemErrorCode =
  | "invalid_request"
  | "source_too_large"
  | "input_too_large"
  | "unauthorized"
  | "rate_limited"
  | "busy"
  | "disabled"
  | "sandbox_unavailable"
  | "runtime_unavailable"
  | "internal_error";

const HTTP_STATUS: Record<PythonSystemErrorCode, number> = {
  invalid_request: 400,
  source_too_large: 413,
  input_too_large: 413,
  unauthorized: 401,
  rate_limited: 429,
  busy: 429,
  disabled: 503,
  sandbox_unavailable: 503,
  runtime_unavailable: 503,
  internal_error: 500,
};

const PUBLIC_MESSAGE: Record<PythonSystemErrorCode, string> = {
  invalid_request: "The request was not valid.",
  source_too_large: "The source code is too large.",
  input_too_large: "The input is too large.",
  unauthorized: "Sign in to run Python code.",
  rate_limited: "Too many requests. Please wait a moment.",
  busy: "The Python runner is busy. Please try again shortly.",
  disabled: "Python execution is not enabled on this server.",
  sandbox_unavailable: "The Python sandbox is unavailable right now.",
  runtime_unavailable: "The Python runtime is unavailable right now.",
  internal_error: "Something went wrong while running your code.",
};

export class PythonSystemError extends Error {
  readonly code: PythonSystemErrorCode;
  readonly httpStatus: number;
  constructor(code: PythonSystemErrorCode) {
    super(PUBLIC_MESSAGE[code]); // public-safe message only; never wrap internals
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
  }
}

/** Program-level outcomes. HTTP 200 + status !== "ok" means "your program failed". */
export type PythonRunStatus =
  | "ok"
  | "nonzero_exit"
  | "runtime_error"
  | "syntax_error"
  | "timeout"
  | "output_limit"
  | "resource_limit";

export type PythonRunOptions = Record<string, never>;

export interface PythonRunResult {
  /** true only when the program exited with code 0 */
  success: boolean;
  status: PythonRunStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  /** stdout or stderr was cut at the output cap */
  truncated: boolean;
  detail?: string;
}

export interface PythonTraceOptions {
  maxSteps?: number;
}

export type TraceEvent = "call" | "line" | "return" | "exception";

export type TraceValue =
  | { t: "none" }
  | { t: "bool"; v: boolean }
  | { t: "int"; v: number | string }
  | { t: "bigint"; bits: number }
  | { t: "float"; v: number | "nan" | "inf" | "-inf" }
  | { t: "str"; v: string; len?: number; trunc?: boolean }
  | { t: "list" | "tuple" | "set" | "frozenset"; v: TraceValue[]; len: number; trunc: boolean }
  | { t: "dict"; v: [TraceValue, TraceValue][]; len: number; trunc: boolean }
  | { t: "ref"; kind: string }
  | { t: "deep"; kind: string; len: number }
  | { t: "object"; kind: string };

export interface TraceFrame {
  function: string;
  line: number; // one-based
}

export interface PythonTraceStep {
  index: number; // zero-based
  line: number; // one-based
  event: TraceEvent;
  function: string;
  locals: Record<string, TraceValue>;
  globals?: Record<string, TraceValue>;
  stack: TraceFrame[];
  /** Output produced since the PREVIOUS step (incremental, not cumulative). */
  stdout: string;
  returnValue?: TraceValue;
  exception?: { type: string; message: string };
}

export type PythonTraceStatus =
  | "ok"
  | "exception"
  | "syntax_error"
  | "truncated"
  | "timeout"
  | "resource_limit";

export interface PythonTraceResult {
  status: PythonTraceStatus;
  exitCode: number | null;
  steps: PythonTraceStep[];
  truncated: boolean;
  truncationReason: "max_steps" | "max_response_bytes" | null;
  stdoutTruncated: boolean;
  /** Output emitted after the last recorded step. */
  trailingStdout: string;
  stderr: string;
  error: { type: string; message: string; line: number } | null;
  executionTimeMs: number;
  detail?: string;
}

/** Wire envelope used by both API routes. */
export type PythonApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: PythonSystemErrorCode; message: string } };

export function systemErrorBody(code: PythonSystemErrorCode): PythonApiResponse<never> {
  return { ok: false, error: { code, message: PUBLIC_MESSAGE[code] } };
}

export interface PythonCapabilities {
  enabled: boolean;
  /** e.g. "3.12" once the sandbox image reports it; omitted when unknown */
  pythonVersion?: string;
  maxCodeBytes: number;
  timeoutMs: number;
  maxTraceSteps: number;
}

const encoder = new TextEncoder();
export const byteLength = (s: string): number => encoder.encode(s).length;

export interface ValidatedRunInput {
  code: string;
  stdin: string;
}

/** Validate the public request body for /api/python. Throws PythonSystemError. */
export function validateRunInput(body: unknown): ValidatedRunInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PythonSystemError("invalid_request");
  const b = body as Record<string, unknown>;
  const allowed = new Set(["code", "stdin", "language", "options"]);
  for (const k of Object.keys(b)) if (!allowed.has(k)) throw new PythonSystemError("invalid_request");
  if (b.language !== undefined && b.language !== PYTHON_LANGUAGE_ID) throw new PythonSystemError("invalid_request");
  if (b.options !== undefined && !(typeof b.options === "object" && b.options !== null && Object.keys(b.options).length === 0)) {
    throw new PythonSystemError("invalid_request");
  }
  if (typeof b.code !== "string") throw new PythonSystemError("invalid_request");
  const stdin = b.stdin === undefined ? "" : b.stdin;
  if (typeof stdin !== "string") throw new PythonSystemError("invalid_request");
  if (byteLength(b.code) > PYTHON_LIMITS.maxCodeBytes) throw new PythonSystemError("source_too_large");
  if (byteLength(stdin) > PYTHON_LIMITS.maxStdinBytes) throw new PythonSystemError("input_too_large");
  return { code: b.code, stdin };
}

export interface ValidatedTraceInput extends ValidatedRunInput {
  options: Required<PythonTraceOptions>;
}

export function validateTraceInput(body: unknown): ValidatedTraceInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PythonSystemError("invalid_request");
  const b = body as Record<string, unknown>;
  const { options, ...rest } = b;
  const base = validateRunInput(rest);
  let maxSteps: number = PYTHON_LIMITS.defaultTraceSteps;
  if (options !== undefined) {
    if (typeof options !== "object" || options === null || Array.isArray(options)) throw new PythonSystemError("invalid_request");
    const o = options as Record<string, unknown>;
    for (const k of Object.keys(o)) if (k !== "maxSteps") throw new PythonSystemError("invalid_request");
    if (o.maxSteps !== undefined) {
      if (!Number.isInteger(o.maxSteps) || (o.maxSteps as number) < 1) throw new PythonSystemError("invalid_request");
      maxSteps = Math.min(o.maxSteps as number, PYTHON_LIMITS.maxTraceSteps);
    }
  }
  return { ...base, options: { maxSteps } };
}
