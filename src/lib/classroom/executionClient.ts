/**
 * executionClient.ts
 *
 * Safe, isolated execution client.
 *
 * SECURITY RULES (enforced here, not at call sites):
 * 1. Untrusted student code is NEVER executed inside the Next.js server process.
 *    We call an external sandbox HTTP endpoint with a strict timeout.
 * 2. The sandbox URL is read from SANDBOX_EXECUTION_URL (server-only env var).
 *    If absent, we fall back to the app's own /api/predict endpoint which runs
 *    code in a separate child process with resource limits (already implemented
 *    in src/lib/cppRunner.ts). This is acceptable because cppRunner already
 *    enforces CPU time, output, and memory limits.
 * 3. All calls carry a hard AbortController timeout of DEFAULT_TIMEOUT_MS.
 * 4. Results are validated before returning — callers never get raw subprocess output.
 */

import type { SandboxRequest, SandboxResult } from "./submissionTypes";

const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds wall-clock max
const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB per file
const MAX_TOTAL_FILES = 20;

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "sandbox_unavailable" | "limit_exceeded" | "compile_error" | "runtime_error"
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

function validateRequest(req: SandboxRequest): void {
  const fileCount = Object.keys(req.files).length;
  if (fileCount === 0) throw new ExecutionError("No source files provided.", "limit_exceeded");
  if (fileCount > MAX_TOTAL_FILES) throw new ExecutionError(`Too many files (max ${MAX_TOTAL_FILES}).`, "limit_exceeded");

  for (const [name, content] of Object.entries(req.files)) {
    if (typeof content !== "string") throw new ExecutionError(`File "${name}" has non-string content.`, "limit_exceeded");
    if (Buffer.byteLength(content, "utf8") > MAX_SOURCE_BYTES) {
      throw new ExecutionError(`File "${name}" exceeds maximum allowed size (256 KB).`, "limit_exceeded");
    }
  }
}

/**
 * Executes student code in an isolated sandbox.
 * Falls back to the internal /api/predict endpoint if SANDBOX_EXECUTION_URL is not set.
 */
export async function runInSandbox(req: SandboxRequest): Promise<SandboxResult> {
  validateRequest(req);

  const sandboxUrl = process.env.SANDBOX_EXECUTION_URL;
  const timeoutMs = Math.min(req.timeLimitMs ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (sandboxUrl) {
      // ── External sandbox (preferred) ──────────────────────────────────────
      const response = await fetch(sandboxUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: req.files,
          stdin: req.stdin ?? "",
          language: req.language,
          timeLimitMs: timeoutMs,
          memLimitMb: req.memLimitMb ?? 128,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExecutionError(`Sandbox returned HTTP ${response.status}.`, "sandbox_unavailable");
      }

      const raw = (await response.json()) as {
        stdout?: string;
        stderr?: string;
        exit_code?: number;
        duration_ms?: number;
        timed_out?: boolean;
        compilation_error?: string;
      };

      return {
        stdout: raw.stdout ?? "",
        stderr: raw.stderr ?? "",
        exitCode: raw.exit_code ?? 0,
        durationMs: raw.duration_ms ?? 0,
        timedOut: raw.timed_out ?? false,
        compilationError: raw.compilation_error,
      };
    }

    // ── Internal fallback: call /api/predict (child process with limits) ──
    // Always call this app over loopback. Do NOT derive the base URL from
    // NEXTAUTH_URL or NEXT_PUBLIC_SUPABASE_URL: those describe different
    // services, and the previous derivation could send student source to an
    // unrelated `<project>.vercel.app` host.
    const internalBaseUrl =
      process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3000"}`;
    const predictUrl = `${internalBaseUrl.replace(/\/+$/, "")}/api/predict`;

    // Send the real file map. Concatenating translation units into one
    // main.cpp drops headers, so #include "helper.h" cannot see a file.
    // trace:false skips the second GDB execution; grading only needs stdout.
    const response = await fetch(predictUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: req.files, stdin: req.stdin ?? "", trace: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ExecutionError(
        `Code execution is unavailable (HTTP ${response.status}).`,
        response.status === 429 ? "timeout" : "sandbox_unavailable"
      );
    }

    const raw = (await response.json()) as {
      status?: string;
      output?: string;
      stderr?: string;
      error?: { kind?: string; message?: string };
      meta?: { exitCode?: number; runTimeMs?: number };
    };

    if (raw.status === "success") {
      return {
        stdout: raw.output ?? "",
        stderr: raw.stderr ?? "",
        exitCode: raw.meta?.exitCode ?? 0,
        durationMs: raw.meta?.runTimeMs ?? 0,
        timedOut: false,
      };
    }

    // Compilation or runtime error — still a valid result, not a server error
    const isCompileError = raw.error?.kind === "compile_error" || raw.error?.kind === "compile_timeout";
    return {
      stdout: raw.output ?? "",
      stderr: raw.stderr ?? raw.error?.message ?? "",
      exitCode: raw.meta?.exitCode ?? 1,
      durationMs: raw.meta?.runTimeMs ?? 0,
      timedOut: raw.error?.kind === "timeout",
      compilationError: isCompileError ? raw.error?.message : undefined,
    };
  } catch (err: unknown) {
    if (err instanceof ExecutionError) throw err;
    const error = err as Error;
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new ExecutionError(`Code execution timed out after ${timeoutMs}ms.`, "timeout");
    }
    throw new ExecutionError(error.message || "Sandbox unreachable.", "sandbox_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Runs a specific test case against student code and returns pass/fail.
 * Hidden test cases are ONLY evaluated here, server-side. expectedOutput is never returned to callers.
 * Uses the stub-aware runInSandboxSafe so unit tests can intercept calls.
 */
export async function runTestCase(
  files: Record<string, string>,
  language: string,
  stdin: string,
  expectedOutput: string,
  timeLimitMs = 8_000
): Promise<{ passed: boolean; actualOutput: string; durationMs: number }> {
  // Use stub-aware wrapper so tests can intercept
  const result = _sandboxStub
    ? await _sandboxStub({ files, language, stdin, timeLimitMs })
    : await runInSandbox({ files, language, stdin, timeLimitMs });

  const normalize = (s: string) => s.replace(/\r\n/g, "\n").trimEnd();
  const passed = normalize(result.stdout) === normalize(expectedOutput) && !result.timedOut && result.exitCode === 0;

  return {
    passed,
    actualOutput: result.stdout, // actual output is safe to return; expected output is NOT
    durationMs: result.durationMs,
  };
}

/**
 * Test-environment stub: replace runInSandbox for deterministic unit tests.
 */
let _sandboxStub: ((req: SandboxRequest) => Promise<SandboxResult>) | null = null;

export function _setSandboxStub(fn: (req: SandboxRequest) => Promise<SandboxResult>): void {
  _sandboxStub = fn;
}
export function _clearSandboxStub(): void {
  _sandboxStub = null;
}

// Monkey-patch for tests: wrap the exported function
const originalRunInSandbox = runInSandbox;
export async function runInSandboxSafe(req: SandboxRequest): Promise<SandboxResult> {
  if (_sandboxStub) return _sandboxStub(req);
  return originalRunInSandbox(req);
}
