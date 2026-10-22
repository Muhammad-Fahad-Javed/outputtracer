import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { PYTHON_LIMITS } from "./pythonTypes";

export interface LocalExecuteOptions {
  mode: "run" | "trace";
  code: string;
  stdin?: string;
  limits?: {
    maxSteps?: number;
    maxDepth?: number;
  };
  timeoutMs?: number;
}

export interface LocalExecuteResult {
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTimeMs: number;
  truncated?: boolean;
  steps?: unknown[];
  stepCount?: number;
  detail?: string;
  [key: string]: unknown;
}

/**
 * Look for an executable on PATH.
 *
 * Returns the absolute path of the first match, or null. The lookup happens
 * at runtime so that the result is correct on whichever host runs the app.
 */
function findOnPath(command: string): string | null {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext.toLowerCase());
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Unreadable PATH entry - keep looking.
      }
    }
  }
  return null;
}

/**
 * Resolve the Python interpreter to use.
 *
 * Order:
 *   1. PYTHON_PATH, when it is set and the file exists.
 *   2. The first interpreter found on PATH for the current platform.
 *   3. The platform's canonical interpreter name, so that a spawn failure
 *      names the interpreter that was actually looked for.
 *
 * The interpreter is resolved at RUN time and never hard coded to a
 * particular machine. A machine-specific absolute path must not be baked
 * into the build: the same artefact is deployed to a Linux host where such a
 * path cannot exist. The previous fallback of "python" was also wrong for
 * Amazon Linux 2023, which ships "python3" and no "python" at all.
 */
export function findPythonPath(): string | null {
  const configured = (process.env.PYTHON_PATH || "").trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const candidates =
    process.platform === "win32"
      ? ["python", "python3", "py"]
      : ["python3", "python"];

  for (const name of candidates) {
    const found = findOnPath(name);
    if (found) return found;
  }

  return candidates[0] ?? null;
}

export async function executePythonLocally(
  options: LocalExecuteOptions
): Promise<LocalExecuteResult> {
  const pyPath = findPythonPath() || "python3";
  const scriptName = options.mode === "trace" ? "trace_worker.py" : "run_worker.py";
  const scriptPath = path.resolve(process.cwd(), "sandbox-worker", "py", scriptName);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Worker script not found at ${scriptPath}`);
  }

  const envelope: Record<string, unknown> = {
    code: options.code,
    stdin: options.stdin || "",
  };
  if (options.mode === "trace" && options.limits) {
    envelope.limits = options.limits;
  }

  const timeoutMs = options.timeoutMs || PYTHON_LIMITS.defaultTimeoutMs;
  const startTime = Date.now();

  return new Promise<LocalExecuteResult>((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(/*turbopackIgnore: true*/ pyPath, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      return reject(err);
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve({
        status: "timeout",
        stdout,
        stderr: stderr || "Execution timed out.",
        exitCode: null,
        executionTimeMs: Date.now() - startTime,
      });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > PYTHON_LIMITS.maxOutputBytes) {
        stdout = stdout.slice(0, PYTHON_LIMITS.maxOutputBytes);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > PYTHON_LIMITS.maxOutputBytes) {
        stderr = stderr.slice(0, PYTHON_LIMITS.maxOutputBytes);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      const executionTimeMs = Date.now() - startTime;

      if (options.mode === "trace") {
        const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
        const last = lines[lines.length - 1];
        try {
          const parsed = JSON.parse(last);
          return resolve({
            ...parsed,
            executionTimeMs,
          });
        } catch {
          return resolve({
            status: "internal_error",
            stderr,
            executionTimeMs,
          });
        }
      }

      // options.mode === "run"
      let status = "nonzero_exit";
      if (code === 0) status = "ok";
      else if (code === 3) status = "syntax_error";
      else if (code === 1) status = "runtime_error";

      return resolve({
        status,
        stdout,
        stderr,
        exitCode: code,
        executionTimeMs,
        truncated: stdout.length >= PYTHON_LIMITS.maxOutputBytes,
      });
    });

    // Feed JSON envelope on stdin
    try {
      if (proc.stdin) {
        proc.stdin.write(JSON.stringify(envelope));
        proc.stdin.end();
      }
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
