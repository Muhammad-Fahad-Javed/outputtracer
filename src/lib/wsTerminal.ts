// WebSocket-based interactive terminal handler.
//
// Manages a single interactive session:
//   1. Receives files + options from the client
//   2. Compiles them with g++
//   3. Spawns the binary and pipes stdin/stdout/stderr over WebSocket
//   4. Applies the same resource limits as cppRunner.ts

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { StringDecoder } from "node:string_decoder";

import type { WebSocket } from "ws";
import {
  execConfig,
  ALLOWED_STANDARDS,
  DEFAULT_STANDARD,
  AllowedStandard,
} from "./execConfig";
import { describeSignal } from "./signals";
import { inspectSourceFiles } from "./sourceFiles";
import { planUntrustedRun, planSandboxedCommand, selectIsolation, isolationPermitsUntrustedExecution } from "./sandbox";
import { runProcessGroup } from "./processGroup";
import { tryAcquireRun, releaseRun } from "./runGate";

// ---------------------------------------------------------------------------
// Message types sent to the client
// ---------------------------------------------------------------------------
interface WsMessage {
  type:
    | "compile_start"
    | "compile_error"
    | "compile_success"
    | "stdout"
    | "stderr"
    | "exit"
    | "error"
    | "timeout"
    | "output_limit"
    | "ready";
  data?: string;
  code?: number | null;
  signal?: string | null;
  compileTimeMs?: number;
}

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------------------
// Session init payload from client
// ---------------------------------------------------------------------------
export interface TerminalInitPayload {
  files: Record<string, string>;
  language?: "cpp" | "python";
  standard?: string;
  ownerKey?: string;
  timeoutMs?: number;
  cpuTimeMs?: number;
  validateAccess?: () => Promise<boolean>;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Handle a terminal WebSocket connection
// ---------------------------------------------------------------------------
export async function handleTerminalSession(
  ws: WebSocket,
  payload: TerminalInitPayload
): Promise<void> {
  const { files } = payload;

  const inspected = inspectSourceFiles(files || {}, {
    maxFiles: execConfig.maxSourceFiles,
    maxSourceBytes: execConfig.maxSourceBytes,
  });
  if (!inspected.ok) {
    send(ws, { type: "error", data: inspected.message });
    ws.close();
    return;
  }

  // Fail closed: never execute untrusted code when no isolation mechanism is
  // available. Production can never opt into this; non-production requires an
  // explicit opt-in flag (see sandbox.unsandboxedExecutionAllowed).
  const terminalIsolation = await selectIsolation();
  if (ws.readyState !== ws.OPEN || payload.signal?.aborted) return;
  if (!isolationPermitsUntrustedExecution(terminalIsolation)) {
    send(ws, {
      type: "error",
      data:
        terminalIsolation === "none"
          ? "Code execution is unavailable because this server has no sandbox available."
          : "Code execution is unavailable until this server can isolate programs from the host filesystem (bubblewrap).",
    });
    ws.close();
    return;
  }

  const slot = tryAcquireRun(payload.ownerKey);
  if (slot !== "ok") {
    send(ws, {
      type: "error",
      data:
        slot === "user-busy"
          ? "You already have a program running. Stop it before starting another."
          : "Too many programs are running. Wait a moment and try again.",
    });
    ws.close();
    return;
  }

  const standard: AllowedStandard = (
    ALLOWED_STANDARDS as readonly string[]
  ).includes(payload.standard || "")
    ? (payload.standard as AllowedStandard)
    : DEFAULT_STANDARD;

  let tempDir = "";
  let acquired = true;
  const compileAbort = new AbortController();
  const abortCompile = () => compileAbort.abort();
  ws.once("close", abortCompile);
  payload.signal?.addEventListener("abort", abortCompile, { once: true });
  if (payload.signal?.aborted) compileAbort.abort();
  let cancelRun: (() => void) | undefined;
  const cleanup = () => {
    ws.off("close", abortCompile);
    payload.signal?.removeEventListener("abort", abortCompile);
    if (cancelRun) payload.signal?.removeEventListener("abort", cancelRun);
    if (acquired) {
      acquired = false;
      releaseRun(payload.ownerKey);
    }
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "outputtracer-ws-"));
    if (ws.readyState !== ws.OPEN || payload.signal?.aborted) { cleanup(); return; }
  } catch {
    send(ws, { type: "error", data: "Could not create workspace." });
    ws.close();
    cleanup();
    return;
  }

  try {
    const { cppFiles } = inspected;
    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(path.join(tempDir, filename), content, "utf8");
    }
    if (ws.readyState !== ws.OPEN || payload.signal?.aborted) { cleanup(); return; }

    // --- Compile -----------------------------------------------------------
    send(ws, { type: "compile_start" });
    const exeName = os.platform() === "win32" ? "main.exe" : "main.out";
    const exePath = path.join(tempDir, exeName);
    const compileStart = Date.now();

    try {
      // Compile inside the same sandbox as the run (see cppRunner for why).
      const compilePlan = await planSandboxedCommand({
        tempDir,
        command: execConfig.compiler,
        args: [...cppFiles, `-std=${standard}`, "-g", "-O0", "-Wall", "-o", exeName],
        limits: {
          maxMemoryMb: execConfig.compileMaxMemoryMb,
          maxCpuSeconds: execConfig.compileMaxCpuSeconds,
          maxProcesses: execConfig.compileMaxProcesses,
          maxFileBytes: execConfig.compileMaxFileBytes,
        },
        remapTempDirPaths: false,
      });

      const compileResult = await runProcessGroup({
        command: compilePlan.command,
        args: compilePlan.args,
        cwd: tempDir,
        env: compilePlan.env,
        timeoutMs: execConfig.compileTimeoutMs,
        maxBuffer: execConfig.maxDiagnosticBytes * 4,
        signal: compileAbort.signal,
      });
      if (ws.readyState !== ws.OPEN || payload.signal?.aborted) { cleanup(); return; }

      if (compileResult.timedOut || compileResult.signal === "SIGXCPU") {
        send(ws, {
          type: "error",
          data: `Compilation did not finish within ${execConfig.compileTimeoutMs}ms.`,
        });
        ws.close();
        cleanup();
        return;
      }
      if (compileResult.code !== 0 || compileResult.signal) {
        send(ws, {
          type: "compile_error",
          data: compileResult.stderr || compileResult.stdout || "Compilation failed.",
        });
        ws.close();
        cleanup();
        return;
      }

      // Forward any compiler warnings
      if (compileResult.stderr) {
        send(ws, { type: "stderr", data: compileResult.stderr });
      }
    } catch (error) {
      const err = error as Error & {
        killed?: boolean;
        signal?: string;
        stderr?: string;
        stdout?: string;
      };
      const compileTimeMs = Date.now() - compileStart;

      if (err.killed && err.signal) {
        send(ws, {
          type: "compile_error",
          data: `Compilation timed out after ${compileTimeMs}ms.`,
          compileTimeMs,
        });
      } else {
        const stderr =
          err.stderr || err.stdout || err.message || "Compilation failed.";
        send(ws, {
          type: "compile_error",
          data: stderr,
          compileTimeMs,
        });
      }
      ws.close();
      cleanup();
      return;
    }

    const compileTimeMs = Date.now() - compileStart;
    send(ws, { type: "compile_success", compileTimeMs });

    // --- Run interactively -------------------------------------------------
    const plan = await planUntrustedRun({ exePath, tempDir,
      maxCpuSeconds: payload.cpuTimeMs ? Math.min(execConfig.maxCpuSeconds, Math.max(1, Math.ceil(payload.cpuTimeMs / 1000))) : undefined });
    if (ws.readyState !== ws.OPEN || payload.signal?.aborted) { cleanup(); return; }

    send(ws, { type: "ready" });

    const child = spawn(plan.command, plan.args, {
      cwd: tempDir,
      env: plan.env,
      detached: os.platform() !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let settled = false;
    let timedOut = false;
    let outputBytes = 0;
    let outputExceeded = false;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (os.platform() !== "win32" && typeof child.pid === "number") {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // Already exited
      }
    };
    cancelRun = () => killGroup("SIGKILL");
    payload.signal?.addEventListener("abort", cancelRun, { once: true });
    if (payload.signal?.aborted) cancelRun();

    const timeoutMs = Math.min(execConfig.interactiveTimeoutMs, payload.timeoutMs || execConfig.interactiveTimeoutMs);
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
    }, timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
    };

    // Stream stdout to client
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > execConfig.maxOutputBytes) {
        if (!outputExceeded) {
          outputExceeded = true;
          send(ws, {
            type: "output_limit",
            data: `Output exceeded ${Math.floor(execConfig.maxOutputBytes / 1024)} KB limit.`,
          });
          killGroup("SIGKILL");
        }
        return;
      }
      send(ws, { type: "stdout", data: stdoutDecoder.write(chunk) });
    });

    // Stream stderr to client
    child.stderr.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > execConfig.maxOutputBytes) {
        if (!outputExceeded) {
          outputExceeded = true;
          send(ws, { type: "output_limit", data: `Output exceeded ${Math.floor(execConfig.maxOutputBytes / 1024)} KB limit.` });
          killGroup("SIGKILL");
        }
        return;
      }
      send(ws, { type: "stderr", data: stderrDecoder.write(chunk) });
    });

    // Forward keystrokes from client to process stdin, bounded so a client
    // cannot stream unbounded input into the child (per message and per
    // session). Exceeding either cap kills the run.
    let stdinBytes = 0;
    let stdinRejected = false;
    let inputEnded = false;
    let inputChain = Promise.resolve();
    let pendingMessages = 0;
    let pendingBytes = 0;
    child.stdin.on("error", () => {});
    ws.on("message", (data) => {
      const frameBytes = Buffer.byteLength(data.toString(), "utf8");
      pendingMessages++; pendingBytes += frameBytes;
      if (pendingMessages > 32 || pendingBytes > 2 * execConfig.maxStdinBytes) {
        stdinRejected = true;
        send(ws, { type: "error", data: "Too much input is waiting. Start a new run." });
        killGroup("SIGKILL"); ws.close(); return;
      }
      inputChain = inputChain.then(async () => {
      if (settled || inputEnded || ws.readyState !== ws.OPEN) return;
      if (stdinRejected) return;

      const raw = data.toString();
      let parsed: { type?: string; data?: string } | null = null;
      try { const value = JSON.parse(raw); if (value && typeof value === "object") parsed = value; }
      catch { /* Legacy clients send raw stdin frames. */ }
      if (parsed?.type === "stop") { killGroup("SIGKILL"); return; }
      if (payload.validateAccess && !(await payload.validateAccess())) {
        send(ws, { type: "error", data: "Workspace access or execution permission changed." });
        killGroup("SIGKILL"); ws.close(1008); return;
      }
      if (settled || ws.readyState !== ws.OPEN) return;
      if (parsed?.type === "eof") { inputEnded = true; child.stdin.end(); return; }
      if (parsed && (parsed.type !== "stdin" || typeof parsed.data !== "string")) return;
      const text = parsed ? parsed.data! : raw;

      const textBytes = Buffer.byteLength(text, "utf8");
      if (textBytes > execConfig.maxWsStdinMessageBytes) {
        stdinRejected = true;
        send(ws, {
          type: "error",
          data: `Input message exceeds the ${Math.floor(
            execConfig.maxWsStdinMessageBytes / 1024
          )} KB limit.`,
        });
        killGroup("SIGKILL");
        return;
      }

      stdinBytes += textBytes;
      if (stdinBytes > execConfig.maxStdinBytes) {
        stdinRejected = true;
        send(ws, {
          type: "error",
          data: `Input exceeds the ${Math.floor(
            execConfig.maxStdinBytes / 1024
          )} KB session limit.`,
        });
        killGroup("SIGKILL");
        return;
      }

      if (!child.killed && child.stdin.writable) {
        child.stdin.write(text);
      }
      }).catch(() => { killGroup("SIGKILL"); ws.close(1008, "Could not verify execution permission"); })
        .finally(() => { pendingMessages--; pendingBytes -= frameBytes; });
    });

    child.on("error", (err) => {
      send(ws, {
        type: "error",
        data: err.message || "Could not start the compiled program.",
      });
      finish();
      ws.close();
    });

    child.on("close", (code, signal) => {
      const outTail = stdoutDecoder.end();
      const errTail = stderrDecoder.end();
      if (!outputExceeded && outTail) send(ws, { type: "stdout", data: outTail });
      if (!outputExceeded && errTail) send(ws, { type: "stderr", data: errTail });
      if (timedOut) {
        send(ws, {
          type: "timeout",
          data: `Program timed out after ${Math.floor(timeoutMs / 1000)} seconds.`,
        });
      } else if (signal) {
        send(ws, {
          type: "exit",
          data: describeSignal(signal),
          code: null,
          signal,
        });
      } else {
        send(ws, { type: "exit", code, signal: null });
      }
      finish();
      ws.close();
    });

    // If the WebSocket closes before the process finishes, kill it
    ws.on("close", () => {
      if (!settled) {
        killGroup("SIGKILL");
        finish();
      }
    });
  } catch {
    send(ws, { type: "error", data: "Unexpected server error." });
    cleanup();
    ws.close();
  }
}
