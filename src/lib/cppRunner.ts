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
import { traceExecution, TraceResult } from "./gdbTracer";

const execFileAsync = promisify(execFile);

export type RunStatus =
  | "success"
  | "invalid_request"
  | "compile_error"
  | "compile_timeout"
  | "runtime_error"
  | "timeout"
  | "output_limit"
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
  source: string;
  stdin?: string;
  standard?: string;
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

// --- prlimit availability (Linux only) -------------------------------------
let prlimitAvailable: boolean | null = null;
async function hasPrlimit(): Promise<boolean> {
  if (prlimitAvailable !== null) return prlimitAvailable;
  if (os.platform() !== "linux") {
    prlimitAvailable = false;
    return prlimitAvailable;
  }
  try {
    await execFileAsync("prlimit", ["--version"], { timeout: 2000 });
    prlimitAvailable = true;
  } catch {
    prlimitAvailable = false;
  }
  return prlimitAvailable;
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
  const source = opts.source;

  if (!source || typeof source !== "string" || source.trim().length === 0) {
    return { status: "invalid_request", title: "No code", message: "Please enter C++ code." };
  }

  if (Buffer.byteLength(source, "utf8") > execConfig.maxSourceBytes) {
    return {
      status: "invalid_request",
      title: "Source too large",
      message: `Source exceeds the ${Math.floor(execConfig.maxSourceBytes / 1024)} KB limit.`,
    };
  }

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

  const srcName = "main.cpp";
  const exeName = os.platform() === "win32" ? "main.exe" : "main.out";
  const exePath = path.join(tempDir, exeName);

  try {
    await fs.writeFile(path.join(tempDir, srcName), source, "utf8");

    // --- Compile ---------------------------------------------------------
    log(execId, "compile_started", { standard, sourceBytes: Buffer.byteLength(source, "utf8") });
    const compileStart = Date.now();
    let compileTimeMs = 0;
    try {
      await execFileAsync(
        execConfig.compiler,
        [srcName, `-std=${standard}`, "-g", "-O0", "-Wall", "-o", exeName],
        {
          cwd: tempDir,
          timeout: execConfig.compileTimeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: execConfig.maxDiagnosticBytes * 4,
        }
      );
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
    const usePrlimit = await hasPrlimit();
    const runCmd = usePrlimit ? "prlimit" : exePath;
    const runArgs = usePrlimit
      ? [
          `--nproc=${execConfig.maxProcesses}`,
          `--as=${execConfig.maxMemoryMb * 1024 * 1024}`,
          `--cpu=${execConfig.maxCpuSeconds}`,
          "--",
          exePath,
        ]
      : [];

    log(execId, "run_started", { usePrlimit });
    const runStart = Date.now();

    const runResult = await new Promise<RunResult>((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let outputBytes = 0;
      let settled = false;
      let timedOut = false;
      let outputExceeded = false;

      const child = spawn(runCmd, runArgs, {
        cwd: tempDir,
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
    if (runResult.status === "success") {
      try {
        log(execId, "trace_started");
        trace = await traceExecution({
          exePath,
          tempDir,
          sourceFile: path.join(tempDir, srcName),
          stdinContent: stdinTrunc.text || undefined,
        });
        log(execId, "trace_completed", { steps: trace.steps.length, truncated: trace.truncated });
      } catch (error) {
        const err = error as Error;
        log(execId, "trace_failed", { error: err.message || String(err) });
        // Non-fatal — we still return the program output.
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
