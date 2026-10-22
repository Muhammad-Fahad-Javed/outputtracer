// Run a command as its own process group and always reap it.
//
// child_process.execFile's timeout kills only the direct child. A compiler
// or debugger that forks (g++ -> cc1plus, gdb -> the program, a student
// binary that forks) can leave those descendants running. Starting the job
// detached makes it a process-group leader, so a timeout can signal the
// whole group, escalate to SIGKILL, and wait until the leader exits.

import { spawn } from "child_process";
import os from "os";

export interface ProcessGroupResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export function runProcessGroup(opts: {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxBuffer: number;
  stdin?: string;
  /** How long to wait after SIGTERM before SIGKILL. */
  killGraceMs?: number;
}): Promise<ProcessGroupResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      detached: os.platform() !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;
    let timedOut = false;
    let escalated = false;
    const graceMs = opts.killGraceMs ?? 200;

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      clearTimeout(killTimer);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        truncated,
      });
    };

    const killGroup = (signal: NodeJS.Signals) => {
      if (os.platform() !== "win32" && typeof child.pid === "number") {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // The leader may already have exited.
        }
      }
      try {
        child.kill(signal);
      } catch {
        // Already gone.
      }
    };

    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const wallTimer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      killTimer = setTimeout(() => {
        if (settled || escalated) return;
        escalated = true;
        killGroup("SIGKILL");
      }, graceMs);
    }, opts.timeoutMs);

    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= opts.maxBuffer) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (next.length <= opts.maxBuffer) return next;
      truncated = true;
      return next.slice(0, opts.maxBuffer);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      clearTimeout(killTimer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      finish(code, signal);
    });

    if (opts.stdin) child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });
}
