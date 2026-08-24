// Central, environment-driven configuration for the C++ compile/execute
// pipeline. Keeping these in one place makes it possible to tune limits
// per-deployment (env vars) without touching the execution logic itself,
// and avoids hard-coding paths/limits inline in the route handler.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const ALLOWED_STANDARDS = [
  "c++11",
  "c++14",
  "c++17",
  "c++20",
  "c++23",
] as const;

export type AllowedStandard = (typeof ALLOWED_STANDARDS)[number];

export const DEFAULT_STANDARD: AllowedStandard = "c++17";

export const execConfig = {
  // Compiler executable. Must be resolvable on PATH (or an absolute path).
  // Never hard-code a platform-specific location here — configure via env.
  compiler: process.env.CXX_COMPILER || "g++",

  // Hard ceiling on how much source we will even attempt to compile.
  maxSourceBytes: envInt("MAX_SOURCE_BYTES", 200 * 1024), // 200 KB

  // Hard ceiling on stdin we will forward to the user's program.
  maxStdinBytes: envInt("MAX_STDIN_BYTES", 64 * 1024), // 64 KB

  // Compilation must finish within this window.
  compileTimeoutMs: envInt("COMPILE_TIMEOUT_MS", 10_000),

  // The compiled program must finish within this window.
  runTimeoutMs: envInt("RUN_TIMEOUT_MS", 5_000),

  // Combined stdout+stderr cap for the running program. Exceeding this
  // terminates the process rather than buffering unbounded output.
  maxOutputBytes: envInt("MAX_OUTPUT_BYTES", 256 * 1024), // 256 KB

  // Compiler diagnostics can be extremely long (template errors); cap what
  // we return to the client.
  maxDiagnosticBytes: envInt("MAX_DIAGNOSTIC_BYTES", 32 * 1024), // 32 KB

  // Resource limits applied to the *running* program via `prlimit` on
  // platforms where it's available (Linux). These are a best-effort,
  // process-level defense — see security notes in the audit for why they
  // are not a substitute for real sandboxing (containers/VMs) in a public
  // production deployment.
  maxMemoryMb: envInt("MAX_MEMORY_MB", 256),
  maxCpuSeconds: envInt("MAX_CPU_SECONDS", 5),
  maxProcesses: envInt("MAX_PROCESSES", 32),

  // GDB tracer settings — used for generating step-by-step dry-run traces.
  // The tracer is best-effort; if GDB is unavailable, the API still returns
  // output but without a detailed trace.
  gdbPath: process.env.GDB_PATH || "gdb",
  maxTraceSteps: envInt("MAX_TRACE_STEPS", 1000),
  traceTimeoutMs: envInt("TRACE_TIMEOUT_MS", 15_000),
};
