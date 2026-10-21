import { callWorker, type SandboxConfig, type FetchLike } from "./pythonSandboxClient";
import {
  PYTHON_LIMITS,
  PythonSystemError,
  validateRunInput,
  type PythonRunOptions,
  type PythonRunResult,
  type PythonRunStatus,
} from "./pythonTypes";

const STATUSES: ReadonlySet<string> = new Set<PythonRunStatus>([
  "ok", "nonzero_exit", "runtime_error", "syntax_error", "timeout", "output_limit", "resource_limit",
]);

const cap = (s: unknown, max: number): string => (typeof s === "string" ? s.slice(0, max) : "");

export interface RunDeps {
  config?: SandboxConfig;
  fetchImpl?: FetchLike;
}

/**
 * Execute Python in the isolated sandbox worker.
 * Resolves with a result for any program-level outcome (errors, timeouts,
 * limits). Rejects with PythonSystemError only when the system could not run it.
 */
export async function runPythonCode(
  code: string,
  stdin = "",
  options: PythonRunOptions = {},
  deps: RunDeps & { clientId?: string } = {},
): Promise<PythonRunResult> {
  const input = validateRunInput({ code, stdin, options });
  const raw = await callWorker({
    path: "/v1/run",
    body: { code: input.code, stdin: input.stdin, clientId: deps.clientId },
    timeoutMs: PYTHON_LIMITS.defaultTimeoutMs + 5000,
    config: deps.config,
    fetchImpl: deps.fetchImpl,
  });

  const status = typeof raw.status === "string" && STATUSES.has(raw.status) ? (raw.status as PythonRunStatus) : null;
  if (!status) throw new PythonSystemError("internal_error");
  const exitCode = typeof raw.exitCode === "number" ? raw.exitCode : null;
  return {
    success: status === "ok" && exitCode === 0,
    status,
    stdout: cap(raw.stdout, PYTHON_LIMITS.maxOutputBytes),
    stderr: cap(raw.stderr, PYTHON_LIMITS.maxOutputBytes),
    exitCode,
    executionTimeMs: typeof raw.executionTimeMs === "number" ? Math.max(0, Math.round(raw.executionTimeMs)) : 0,
    truncated: raw.truncated === true,
    ...(typeof raw.detail === "string" ? { detail: raw.detail.slice(0, 200) } : {}),
  };
}
