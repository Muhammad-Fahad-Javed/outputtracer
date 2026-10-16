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

  // Resource limits for the *compiler* (g++). These are deliberately larger
  // than the runtime limits: g++ legitimately needs more memory than a
  // student program, and a template-metaprogramming bomb is bounded by
  // compileTimeoutMs first. Applied via the same sandbox as the program so
  // the compiler is resource-bounded too.
  compileMaxMemoryMb: envInt("COMPILE_MAX_MEMORY_MB", 1024),
  compileMaxCpuSeconds: envInt("COMPILE_MAX_CPU_SECONDS", 20),
  compileMaxProcesses: envInt("COMPILE_MAX_PROCESSES", 64),

  // Resource limits for the GDB tracer. GDB itself is memory-hungry, so the
  // ceilings are higher than the plain runtime limits; the wall-clock
  // traceTimeoutMs is the primary bound.
  traceMaxMemoryMb: envInt("TRACE_MAX_MEMORY_MB", 1024),
  traceMaxCpuSeconds: envInt("TRACE_MAX_CPU_SECONDS", 30),
  traceMaxProcesses: envInt("TRACE_MAX_PROCESSES", 64),

  // Cap how many files a single submission may contain.
  maxSourceFiles: envInt("MAX_SOURCE_FILES", 16),

  // Max concurrent compile/run sessions (predict API + interactive WS).
  maxConcurrentRuns: envInt("MAX_CONCURRENT_RUNS", 4),

  // Interactive terminal sessions may last longer than batch predict runs.
  interactiveTimeoutMs: envInt("INTERACTIVE_TIMEOUT_MS", 120_000),

  rateLimitPredictMax: envInt("RATE_LIMIT_PREDICT_MAX", 20),
  rateLimitPredictWindowMs: envInt("RATE_LIMIT_PREDICT_WINDOW_MS", 60_000),
  rateLimitWsMax: envInt("RATE_LIMIT_WS_MAX", 8),
  rateLimitWsWindowMs: envInt("RATE_LIMIT_WS_WINDOW_MS", 60_000),

  // Interactive-terminal stdin caps. `maxStdinBytes` (above) is the total a
  // session may forward; `maxWsStdinMessageBytes` bounds a single WebSocket
  // message so one oversized frame cannot be buffered before we reject it.
  maxWsStdinMessageBytes: envInt("MAX_WS_STDIN_MESSAGE_BYTES", 8 * 1024), // 8 KB
  // Max size of any single WebSocket frame (terminal init + collab updates).
  wsMaxPayloadBytes: envInt("WS_MAX_PAYLOAD_BYTES", 1024 * 1024), // 1 MB

  // WebSocket Origin allow-list (comma-separated), used to block
  // cross-site WebSocket hijacking. outputtracer.com is always allowed;
  // localhost is additionally allowed in development.
  wsAllowedOrigins: process.env.WS_ALLOWED_ORIGINS || "",

  // GDB tracer settings — used for generating step-by-step dry-run traces.
  // The tracer is best-effort; if GDB is unavailable, the API still returns
  // output but without a detailed trace.
  gdbPath: process.env.GDB_PATH || "gdb",
  maxTraceSteps: envInt("MAX_TRACE_STEPS", 1000),
  traceTimeoutMs: envInt("TRACE_TIMEOUT_MS", 15_000),
  traceEnabled: process.env.ENABLE_TRACE !== "0",
};
// NOTE: unsandboxed-execution policy (ALLOW_UNSANDBOXED_EXECUTION /
// TRACE_ALLOW_UNSANDBOXED) lives in ./sandbox (unsandboxedExecutionAllowed /
// unsandboxedTraceAllowed) so it is evaluated at call time and is always
// refused in production.
