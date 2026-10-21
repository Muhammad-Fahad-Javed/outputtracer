// Docker execution layer for the Python sandbox worker.
// Pure functions (buildDockerArgs) are unit-tested; runInContainer spawns docker.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

export const DEFAULT_CONFIG = Object.freeze({
  image: "outputtracer-python-sandbox:latest",
  runtime: "", // e.g. "runsc" for gVisor; empty = Docker default runtime
  memoryMiB: 128,
  cpus: "0.5",
  pidsLimit: 64,
  tmpfsMiB: 8,
  timeoutMs: 5000,
  traceTimeoutMs: 10000,
  maxOutputBytes: 64 * 1024,
  maxTraceBytes: 9 * 1024 * 1024,
});

/** Build the `docker run` argument vector. Every isolation flag lives here. */
export function buildDockerArgs({ name, mode, cfg }) {
  const script = mode === "trace" ? "/opt/worker/trace_worker.py" : "/opt/worker/run_worker.py";
  const args = [
    "run",
    "--rm",
    "-i",
    "--name", name,
    "--network", "none",
    "--read-only",
    "--tmpfs", `/tmp:rw,noexec,nosuid,nodev,size=${cfg.tmpfsMiB}m`,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", "10001:10001",
    "--memory", `${cfg.memoryMiB}m`,
    "--memory-swap", `${cfg.memoryMiB}m`,
    "--cpus", String(cfg.cpus),
    "--pids-limit", String(cfg.pidsLimit),
    "--ulimit", "nofile=64:64",
    "--ulimit", "nproc=64:64",
    "--ulimit", "fsize=8388608:8388608",
    "--ipc", "none",
    "--log-driver", "none",
    "--label", "outputtracer.sandbox=1",
    "-e", "PYTHONHASHSEED=0",
    "-e", "PYTHONDONTWRITEBYTECODE=1",
    "-e", "PYTHONIOENCODING=utf-8",
  ];
  if (cfg.runtime) args.push("--runtime", cfg.runtime);
  args.push(cfg.image, "python3", "-I", script);
  return args;
}

export function newContainerName() {
  return "otpy-" + randomBytes(9).toString("hex");
}

/**
 * Run one envelope inside a fresh container.
 * Enforces the wall-clock deadline and output cap OUTSIDE the container by
 * force-removing it. Returns a plain outcome object; never throws for
 * program-level failures.
 */
export function runInContainer({ mode, envelope, cfg, spawnFn = spawn }) {
  const name = newContainerName();
  const args = buildDockerArgs({ name, mode, cfg });
  const deadline = mode === "trace" ? cfg.traceTimeoutMs : cfg.timeoutMs;
  const outCap = mode === "trace" ? cfg.maxTraceBytes : cfg.maxOutputBytes;
  const errCap = cfg.maxOutputBytes;
  const started = Date.now();

  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      return resolve({ kind: "sandbox_unavailable", executionTimeMs: 0 });
    }

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let outTruncated = false;
    let errTruncated = false;
    let settled = false;
    let reason = null; // "timeout" | "output_limit"

    const killContainer = () => {
      try {
        const k = spawnFn("docker", ["rm", "-f", name], { stdio: "ignore" });
        k.on?.("error", () => {});
      } catch {
        /* container may already be gone */
      }
    };

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...outcome, executionTimeMs: Date.now() - started });
    };

    const timer = setTimeout(() => {
      reason = "timeout";
      killContainer();
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, deadline);

    child.on("error", () => {
      killContainer();
      finish({ kind: "sandbox_unavailable" });
    });

    child.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > outCap) {
        outTruncated = true;
        stdout = Buffer.concat([stdout, chunk.subarray(0, Math.max(outCap - stdout.length, 0))]);
        reason = reason || "output_limit";
        killContainer();
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length + chunk.length > errCap) {
        errTruncated = true;
        stderr = Buffer.concat([stderr, chunk.subarray(0, Math.max(errCap - stderr.length, 0))]);
        return;
      }
      stderr = Buffer.concat([stderr, chunk]);
    });

    child.on("close", (code, signal) => {
      finish({
        kind: "exited",
        exitCode: code,
        signal,
        reason,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        outputTruncated: outTruncated || errTruncated,
      });
    });

    child.stdin.on("error", () => { /* container died before reading stdin */ });
    child.stdin.end(JSON.stringify(envelope));
  });
}

/** Verify docker + image exist. Used for the worker's /health and startup. */
export function checkRuntime({ cfg, spawnFn = spawn }) {
  return new Promise((resolve) => {
    let out = "";
    let c;
    try {
      c = spawnFn("docker", ["image", "inspect", cfg.image, "--format", "{{.Id}}"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return resolve({ ok: false, reason: "docker_not_found" });
    }
    c.on("error", () => resolve({ ok: false, reason: "docker_not_found" }));
    c.stdout.on("data", (d) => (out += d));
    c.on("close", (code) =>
      resolve(code === 0 && out.trim() ? { ok: true } : { ok: false, reason: "image_missing_or_daemon_down" })
    );
  });
}
