// Core compile/execute pipeline for untrusted C++ submissions.
//
// Security model (read this before changing anything below):
//   - The user's source is NEVER placed on a shell command line. It is
//     written to a file and the compiler/binary are invoked via argv
//     arrays (execFile/spawn), which never go through a shell. This is
//     what rules out shell/command injection regardless of source content.
//   - Each request gets its own randomly-named temp directory
//     (fs.mkdtemp), so concurrent executions cannot collide or see each
//     other's files.
//   - The compiled program is executed with OS-level resource limits
//     (via `prlimit` on Linux: address-space, CPU-time, process count)
//     plus a Node-side wall-clock timeout that kills the whole process
//     group, not just the immediate child (this matters for fork bombs).
//   - IMPORTANT LIMITATION: `prlimit --nproc` constrains the number of
//     processes for the *real user id* running this Node process, not a
//     private counter per request. On a normal single-user deployment,
//     RLIMIT_AS and RLIMIT_CPU are still fully effective per-process, but
//     RLIMIT_NPROC is shared across every concurrent execution (and the
//     server itself). It still meaningfully limits how far a single fork
//     bomb can run before hitting the wall-clock timeout, but it is NOT a
//     substitute for real per-tenant isolation. For a genuine multi-tenant
//     production deployment, run each execution inside its own container/
//     microVM (e.g. gVisor, Firecracker, Docker with --pids-limit, no
//     network, read-only rootfs, dedicated low-privilege uid) rather than
//     relying on process-level limits alone.
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import {
  execConfig,
  ALLOWED_STANDARDS,
  DEFAULT_STANDARD,
  AllowedStandard,
} from "./execConfig";
import { describeSignal } from "./signals";
import { inspectSourceFiles } from "./sourceFiles";
import {
  planUntrustedRun,
  planSandboxedCommand,
  selectIsolation,
  unsandboxedExecutionAllowed,
  type ResourceLimits,
} from "./sandbox";
import { tryAcquireRun, releaseRun } from "./runGate";
import { traceExecution, TraceResult } from "./gdbTracer";
import { detectNondeterminism, buildDeterminismNote } from "./traceDeterminism";

// The compiler is heavier than the student program, so it gets its own
// (larger) ceilings — see execConfig.
function compileLimits(): ResourceLimits {
  return {
    maxMemoryMb: execConfig.compileMaxMemoryMb,
    maxCpuSeconds: execConfig.compileMaxCpuSeconds,
    maxProcesses: execConfig.compileMaxProcesses,
  };
}

const execFileAsync = promisify(execFile);

export type RunStatus =
  | "success"
  | "invalid_request"
  | "compile_error"
  | "compile_timeout"
  | "runtime_error"
  | "timeout"
  | "output_limit"
  | "busy"
  | "server_error";

export interface RunResult {
  status: RunStatus;
  stdout?: string;
  stderr?: string;
  trace?: TraceResult;
  title?: string;
  message?: string;
  exitCode?: number | null;
  signal?: string | null;
  compileTimeMs?: number;
  runTimeMs?: number;
  truncated?: boolean;
}

export interface RunOptions {
  files?: Record<string, string>;
  source?: string;
  stdin?: string;
  standard?: string;
  ownerKey?: string;
  /** When false, skip the second GDB execution. The program output is unchanged. */
  trace?: boolean;
}

// --- Compiler availability (checked lazily, cached for process lifetime) --
let compilerAvailability: { checked: boolean; available: boolean; version?: string } = {
  checked: false,
  available: false,
};

export async function checkCompilerAvailable(): Promise<{ available: boolean; version?: string }> {
  if (compilerAvailability.checked) return compilerAvailability;
  try {
    const { stdout } = await execFileAsync(execConfig.compiler, ["--version"], {
      timeout: 5000,
    });
    compilerAvailability = { checked: true, available: true, version: stdout.split("\n")[0] };
  } catch {
    compilerAvailability = { checked: true, available: false };
  }
  return compilerAvailability;
}

function truncateBytes(input: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(input, "utf8");
  if (buf.byteLength <= maxBytes) return { text: input, truncated: false };
  return {
    text: buf.subarray(0, maxBytes).toString("utf8") + "\n…(truncated)",
    truncated: true,
  };
}

function log(execId: string, event: string, data: Record<string, unknown> = {}) {
  // Structured, single-line logs. Deliberately never logs source/stdin
  // content — only sizes, timings, and outcomes.
  console.log(JSON.stringify({ execId, event, ts: new Date().toISOString(), ...data }));
}

export async function compileAndRun(opts: RunOptions): Promise<RunResult> {
  const execId = crypto.randomBytes(6).toString("hex");

  const files = opts.files || (opts.source && opts.source.trim().length > 0 ? { "main.cpp": opts.source } : {});
  const inspected = inspectSourceFiles(files, {
    maxFiles: execConfig.maxSourceFiles,
    maxSourceBytes: execConfig.maxSourceBytes,
  });
  if (!inspected.ok) {
    return {
      status: "invalid_request",
      title: inspected.title,
      message: inspected.message,
    };
  }
  const { cppFiles, totalBytes: totalSourceBytes } = inspected;

  // Fail closed: when no isolation mechanism is available (no bubblewrap,
  // unshare, or prlimit) we would be executing untrusted code directly on the
  // host. Refuse rather than fall back to an unsandboxed run. Production can
  // never opt into this; non-production requires an explicit opt-in flag.
  const isolation = await selectIsolation();
  if (isolation === "none" && !unsandboxedExecutionAllowed()) {
    log(execId, "execution_refused_no_isolation", { isolation });
    return {
      status: "server_error",
      title: "Execution unavailable",
      message:
        "Code execution is unavailable because this server has no sandbox available. Please try again later.",
    };
  }

  const slot = tryAcquireRun(opts.ownerKey);
  if (slot !== "ok") {
    return {
      status: "busy",
      title: slot === "user-busy" ? "Already running" : "Server busy",
      message:
        slot === "user-busy"
          ? "You already have a program running. Stop it before starting another."
          : "Too many programs are running. Wait a moment and try again.",
    };
  }

  try {
    return await runAcquired(execId, files, cppFiles, totalSourceBytes, opts);
  } finally {
    releaseRun(opts.ownerKey);
  }
}

async function runAcquired(
  execId: string,
  files: Record<string, string>,
  cppFiles: string[],
  totalSourceBytes: number,
  opts: RunOptions
): Promise<RunResult> {
  const standard: AllowedStandard = (ALLOWED_STANDARDS as readonly string[]).includes(
    opts.standard || ""
  )
    ? (opts.standard as AllowedStandard)
    : DEFAULT_STANDARD;

  const stdinTrunc = truncateBytes(
    typeof opts.stdin === "string" ? opts.stdin : "",
    execConfig.maxStdinBytes
  );

  const compilerCheck = await checkCompilerAvailable();
  if (!compilerCheck.available) {
    log(execId, "compiler_unavailable");
    return {
      status: "server_error",
      title: "Compiler unavailable",
      message: "The C++ compiler is not available on the server right now. Please try again later.",
    };
  }

  let tempDir = "";
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "outputtracer-"));
  } catch (error) {
    const err = error as Error;
    log(execId, "workspace_create_failed", { error: err.message || String(err) });
    return {
      status: "server_error",
      title: "Server error",
      message: "Could not create a workspace for compilation.",
    };
  }

  const exeName = os.platform() === "win32" ? "main.exe" : "main.out";
  const exePath = path.join(tempDir, exeName);

  try {
    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(path.join(tempDir, filename), content, "utf8");
    }

    // --- Compile ---------------------------------------------------------
    log(execId, "compile_started", { standard, sourceBytes: totalSourceBytes });
    const compileStart = Date.now();
    let compileTimeMs = 0;

    // The compiler itself is untrusted-adjacent: a malicious translation unit
    // can try to #include host files into its own output. Run g++ in the same
    // sandbox as the program — read-only /usr, only the submission dir
    // writable, no network, sanitized env (so no Supabase key is reachable).
    const compilePlan = await planSandboxedCommand({
      tempDir,
      command: execConfig.compiler,
      args: [
        ...cppFiles,
        `-std=${standard}`,
        "-g",
        "-O0",
        "-Wall",
        ...(os.platform() === "win32" ? ["-static"] : []),
        "-o",
        exeName,
      ],
      limits: compileLimits(),
      remapTempDirPaths: false,
    });
    log(execId, "compile_isolation", { isolation: compilePlan.isolation });

    try {
      await execFileAsync(compilePlan.command, compilePlan.args, {
        cwd: tempDir,
        env: compilePlan.env,
        timeout: execConfig.compileTimeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: execConfig.maxDiagnosticBytes * 4,
      });
      compileTimeMs = Date.now() - compileStart;
    } catch (error) {
      const err = error as Error & { killed?: boolean; signal?: string; stderr?: string; stdout?: string };
      compileTimeMs = Date.now() - compileStart;

      if (err.killed && err.signal) {
        log(execId, "compile_timeout", { compileTimeMs });
        return {
          status: "compile_timeout",
          title: "Compilation timed out",
          message: `Compilation did not finish within ${execConfig.compileTimeoutMs}ms.`,
          compileTimeMs,
        };
      }

      const rawStderr =
        err.stderr || err.stdout || err.message || "Compilation failed.";
      const { text: stderr } = truncateBytes(rawStderr, execConfig.maxDiagnosticBytes);
      log(execId, "compile_error", { compileTimeMs });
      return {
        status: "compile_error",
        title: "Compilation failed",
        message: stderr,
        stderr,
        compileTimeMs,
      };
    }
    log(execId, "compile_completed", { compileTimeMs });

    // --- Run ---------------------------------------------------------------
    const plan = await planUntrustedRun({ exePath, tempDir });
    log(execId, "run_started", { isolation: plan.isolation });
    const runStart = Date.now();

    const runResult = await new Promise<RunResult>((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let outputBytes = 0;
      let settled = false;
      let timedOut = false;
      let outputExceeded = false;

      const child = spawn(plan.command, plan.args, {
        cwd: tempDir,
        env: plan.env,
        detached: os.platform() !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const finish = (result: RunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      // Kill the whole process group (not just the immediate child) so a
      // fork bomb or a program that spawns children can't survive the
      // timeout by orphaning its descendants.
      const killGroup = (signal: NodeJS.Signals) => {
        try {
          if (os.platform() !== "win32" && typeof child.pid === "number") {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch {
          // Already exited — nothing to do.
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        killGroup("SIGKILL");
      }, execConfig.runTimeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > execConfig.maxOutputBytes) {
          if (!outputExceeded) {
            outputExceeded = true;
            killGroup("SIGKILL");
          }
          return;
        }
        stdoutBuf += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > execConfig.maxOutputBytes) {
          if (!outputExceeded) {
            outputExceeded = true;
            killGroup("SIGKILL");
          }
          return;
        }
        stderrBuf += chunk.toString("utf8");
      });

      child.on("error", (err) => {
        finish({
          status: "server_error",
          title: "Execution failed",
          message: err.message || "Could not start the compiled program.",
        });
      });

      child.on("close", (code, signal) => {
        const runTimeMs = Date.now() - runStart;

        if (timedOut) {
          finish({
            status: "timeout",
            title: "Time limit exceeded",
            message: `The program did not finish within ${execConfig.runTimeoutMs}ms (this catches infinite loops).`,
            stdout: stdoutBuf,
            stderr: stderrBuf,
            runTimeMs,
          });
          return;
        }

        if (outputExceeded) {
          finish({
            status: "output_limit",
            title: "Output limit exceeded",
            message: `The program produced more than ${Math.floor(execConfig.maxOutputBytes / 1024)} KB of output.`,
            stdout: stdoutBuf,
            stderr: stderrBuf,
            runTimeMs,
            truncated: true,
          });
          return;
        }

        // prlimit's CPU cap can kill an infinite loop just before the wall-clock timer.
        if (
          signal === "SIGXCPU" ||
          (signal === "SIGKILL" && runTimeMs + 250 >= execConfig.runTimeoutMs)
        ) {
          finish({
            status: "timeout",
            title: "Time limit exceeded",
            message: `The program did not finish within ${execConfig.runTimeoutMs}ms (this catches infinite loops).`,
            stdout: stdoutBuf,
            stderr: stderrBuf,
            signal,
            runTimeMs,
          });
          return;
        }

        if (signal) {
          finish({
            status: "runtime_error",
            title: "Runtime error",
            message: describeSignal(signal),
            stdout: stdoutBuf,
            stderr: stderrBuf,
            signal,
            runTimeMs,
          });
          return;
        }

        // Completed normally. A non-zero exit code is metadata, not an
        // error — plenty of correct programs return non-zero on purpose.
        finish({
          status: "success",
          stdout: stdoutBuf,
          stderr: stderrBuf,
          exitCode: code,
          runTimeMs,
        });
      });

      if (stdinTrunc.text) {
        child.stdin.write(stdinTrunc.text);
      }
      child.stdin.end();
    });

    log(execId, "run_completed", { status: runResult.status, runTimeMs: runResult.runTimeMs });

    // --- GDB Trace (best-effort) ------------------------------------------
    // Only trace on successful execution — there's nothing useful to trace
    // for compile errors, timeouts, etc.
    let trace: TraceResult = { steps: [], truncated: false };
    if (runResult.status === "success" && execConfig.traceEnabled && opts.trace !== false) {
      try {
        log(execId, "trace_started");
        trace = await traceExecution({
          exePath,
          tempDir,
          stdinContent: stdinTrunc.text || undefined,
        });
        log(execId, "trace_completed", { steps: trace.steps.length, truncated: trace.truncated });
      } catch (error) {
        const err = error as Error;
        log(execId, "trace_failed", { error: err.message || String(err) });
        // Non-fatal — we still return the program output.
      }

      // The trace is a SECOND execution; flag programs that read the clock,
      // draw random numbers or print addresses so the two can't silently
      // disagree. See traceDeterminism.ts.
      if (trace.steps.length > 0) {
        const reasons = detectNondeterminism(files);
        if (reasons.length > 0) {
          trace = { ...trace, determinismWarning: buildDeterminismNote(reasons) };
          log(execId, "trace_nondeterministic", { reasons: reasons.length });
        }
      }
    }

    return { ...runResult, compileTimeMs, trace };
  } catch (error) {
    const err = error as Error;
    log(execId, "unexpected_error", { error: err.message || String(err) });
    return {
      status: "server_error",
      title: "Server error",
      message: "Something went wrong while processing the code.",
    };
  } finally {
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup — nothing actionable if this fails.
      });
    }
  }
}
