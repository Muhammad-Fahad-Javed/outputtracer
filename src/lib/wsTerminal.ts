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
}

// ---------------------------------------------------------------------------
// Handle a terminal WebSocket connection
// ---------------------------------------------------------------------------
export async function handleTerminalSession(
  ws: WebSocket,
  payload: TerminalInitPayload
): Promise<void> {
  const { files } = payload;

  if (!files || Object.keys(files).length === 0) {
    send(ws, { type: "error", data: "No files provided." });
    ws.close();
    return;
  }

  // Validate total source size
  let totalSourceBytes = 0;
  for (const content of Object.values(files)) {
    totalSourceBytes += Buffer.byteLength(content, "utf8");
  }
  if (totalSourceBytes > execConfig.maxSourceBytes) {
    send(ws, {
      type: "error",
      data: `Source exceeds the ${Math.floor(execConfig.maxSourceBytes / 1024)} KB limit.`,
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
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "outputtracer-ws-"));
  } catch {
    send(ws, { type: "error", data: "Could not create workspace." });
    ws.close();
    return;
  }

  const cleanup = () => {
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  try {
    // Write all files
    const cppFiles: string[] = [];
    for (const [filename, content] of Object.entries(files)) {
      if (
        filename.includes("/") ||
        filename.includes("\\") ||
        filename.startsWith(".")
      ) {
        send(ws, { type: "error", data: `Invalid filename: ${filename}` });
        ws.close();
        cleanup();
        return;
      }
      if (filename.endsWith(".cpp")) {
        cppFiles.push(filename);
      }
      await fs.writeFile(path.join(tempDir, filename), content, "utf8");
    }

    if (cppFiles.length === 0) {
      send(ws, { type: "error", data: "No .cpp files found to compile." });
      ws.close();
      cleanup();
      return;
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

    send(ws, { type: "ready" });

    const child = spawn(runCmd, runArgs, {
      cwd: tempDir,
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
    }, 5 * 60 * 1000); // 5 minutes timeout for interactive sessions

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
          data: `Program timed out after 5 minutes.`,
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

// --- prlimit availability (reused from cppRunner) --------------------------
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
