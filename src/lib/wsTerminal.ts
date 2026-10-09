// WebSocket-based interactive terminal handler.
//
// Manages a single interactive session:
//   1. Receives files + options from the client
//   2. Compiles them with g++
//   3. Spawns the binary and pipes stdin/stdout/stderr over WebSocket
//   4. Applies the same resource limits as cppRunner.ts

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

import type { WebSocket } from "ws";
import {
  execConfig,
  ALLOWED_STANDARDS,
  DEFAULT_STANDARD,
  AllowedStandard,
} from "./execConfig";
import { describeSignal } from "./signals";
import { inspectSourceFiles } from "./sourceFiles";
import { planUntrustedRun, sanitizedChildEnv } from "./sandbox";
import { tryAcquireRun, releaseRun } from "./runGate";

const execFileAsync = promisify(execFile);

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
  standard?: string;
  ownerKey?: string;
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
  const cleanup = () => {
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

    // --- Compile -----------------------------------------------------------
    send(ws, { type: "compile_start" });
    const exeName = os.platform() === "win32" ? "main.exe" : "main.out";
    const exePath = path.join(tempDir, exeName);
    const compileStart = Date.now();

    try {
      const compileResult = await execFileAsync(
        execConfig.compiler,
        [...cppFiles, `-std=${standard}`, "-g", "-O0", "-Wall", "-o", exeName],
        {
          cwd: tempDir,
          env: sanitizedChildEnv(tempDir),
          timeout: execConfig.compileTimeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: execConfig.maxDiagnosticBytes * 4,
        }
      );

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
    const plan = await planUntrustedRun({ exePath, tempDir });

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

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
    }, execConfig.interactiveTimeoutMs);

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
      send(ws, { type: "stdout", data: chunk.toString("utf8") });
    });

    // Stream stderr to client
    child.stderr.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > execConfig.maxOutputBytes) {
        if (!outputExceeded) {
          outputExceeded = true;
          killGroup("SIGKILL");
        }
        return;
      }
      send(ws, { type: "stderr", data: chunk.toString("utf8") });
    });

    // Forward keystrokes from client to process stdin
    ws.on("message", (data) => {
      const msg = data.toString();
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === "stdin" && typeof parsed.data === "string") {
          if (!child.killed && child.stdin.writable) {
            child.stdin.write(parsed.data);
          }
        }
      } catch {
        // Not JSON — treat as raw stdin
        if (!child.killed && child.stdin.writable) {
          child.stdin.write(msg);
        }
      }
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
      if (timedOut) {
        send(ws, {
          type: "timeout",
          data: `Program timed out after ${Math.floor(execConfig.interactiveTimeoutMs / 1000)} seconds.`,
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
