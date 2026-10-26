// Docker execution layer for the Python sandbox worker.
// Pure functions (buildDockerArgs) are unit-tested; runInContainer spawns docker.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { normalizeInteractiveFiles } from "./pythonFiles.mjs";

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
  interactiveTimeoutMs: 120000,
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
  if (mode === "terminal") {
    // CPU time stays bounded while human input can wait without burning CPU.
    const cpuSeconds = cfg.terminalCpuSeconds || 5;
    args.push("--ulimit", `cpu=${cpuSeconds}:${cpuSeconds + 1}`);
    args.push(cfg.image, "python3", "-I", "-u", "-c", INTERACTIVE_BOOTSTRAP);
  } else args.push(cfg.image, "python3", "-I", script);
  return args;
}

// The trusted wrapper reads exactly one JSON line. The very same stdin stream
// then belongs to the user's program, so input() waits for real input/EOF.
export const INTERACTIVE_READY = "\x1eOTPY_READY\n";
export const INTERACTIVE_BOOTSTRAP = `import sys, json, traceback, os, tempfile, re
payload = json.loads(sys.stdin.readline())
files = payload.get("files") if "files" in payload else {"main.py": payload.get("code")}
# Validate inside the fresh container too. No project path is ever used on the host.
if not isinstance(files, dict) or not 1 <= len(files) <= 16 or not isinstance(files.get("main.py"), str):
    raise SystemExit(70)
size = 0
for name, source in files.items():
    if not isinstance(name, str) or not 3 <= len(name) <= 64 or ".." in name or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*[.]py", name, re.IGNORECASE) or not isinstance(source, str):
        raise SystemExit(70)
    size += len(source.encode("utf-8"))
if size > 65536:
    raise SystemExit(70)
workdir = tempfile.mkdtemp(prefix="otpy-", dir="/tmp")
try:
    # Files exist only in this container's bounded tmpfs. Mark snapshots read-only;
    # the authoritative shared editor is never mounted or modified by a run.
    for name, source in files.items():
        with open(os.path.join(workdir, name), "x", encoding="utf-8") as target:
            target.write(source)
        os.chmod(os.path.join(workdir, name), 0o444)
    os.chdir(workdir)
    sys.path.insert(0, workdir)
    program = compile(files["main.py"], "main.py", "exec")
except (SyntaxError, ValueError):
    traceback.print_exc()
    raise SystemExit(3)
sys.stdout.write(${JSON.stringify(INTERACTIVE_READY)})
sys.stdout.flush()
exec(program, {"__name__": "__main__", "__file__": os.path.join(workdir, "main.py")})
`;

/** Fresh isolated container with bounded streaming input/output and cleanup. */
export function startInteractiveContainer({ code, files, cfg, emit, timeoutMs, cpuTimeMs, spawnFn = spawn }) {
  let sourceFiles;
  try { sourceFiles = normalizeInteractiveFiles(files !== undefined ? { files, ...(code !== undefined ? { code } : {}) } : { code }); }
  catch {
    emit({ type: "error", data: "Invalid Python source files or source too large." });
    return { done: Promise.resolve(), stop() {}, input() {}, eof() {} };
  }
  const envelope = files !== undefined ? { files: sourceFiles } : { code: sourceFiles["main.py"] };
  const name = newContainerName();
  const terminalCpuSeconds = Number.isFinite(cpuTimeMs) ? Math.max(1, Math.min(5, Math.ceil(cpuTimeMs / 1000))) : 5;
  const args = buildDockerArgs({ name, mode: "terminal", cfg: {...cfg, terminalCpuSeconds} });
  let child;
  let settled = false;
  let reason = null;
  let ready = false;
  let prefix = "";
  let stderr = "";
  let outputBytes = 0;
  let stdinBytes = 0;
  let inputEnded = false;
  let timer;
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  const removeContainer = () => {
    try { spawnFn("docker", ["rm", "-f", name], { stdio: "ignore" }).on?.("error", () => {}); } catch { /* already gone */ }
  };
  let complete;
  const done = new Promise((resolve) => { complete = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    complete();
  };
  const stop = (why = "stopped") => {
    if (settled) return;
    reason = why;
    removeContainer();
    try { child?.kill("SIGKILL"); } catch { /* gone */ }
    // Release even if a broken Docker daemon never emits close.
    finish();
  };
  emit({ type: "compile_start" });
  try { child = spawnFn("docker", args, { stdio: ["pipe", "pipe", "pipe"] }); }
  catch { emit({ type: "error", data: "The Python sandbox is unavailable right now." }); finish(); return { done, stop, input() {}, eof() {} }; }
  const deadline = Math.max(1000, Math.min(timeoutMs || cfg.interactiveTimeoutMs || 120000, cfg.interactiveTimeoutMs || 120000));
  timer = setTimeout(() => {
    emit({ type: "timeout", data: `Program timed out after ${Math.round(deadline / 1000)} seconds.` });
    stop("timeout");
  }, deadline);
  const output = (type, chunk) => {
    if (settled) return;
    outputBytes += chunk.length;
    if (outputBytes > cfg.maxOutputBytes + Buffer.byteLength(INTERACTIVE_READY)) {
      emit({ type: "output_limit", data: "Program output exceeded the 64 KB limit." });
      stop("output_limit"); return;
    }
    const text = (type === "stdout" ? stdoutDecoder : stderrDecoder).write(chunk);
    if (type === "stderr") { stderr += text; if (ready) emit({ type, data: text }); return; }
    if (!ready) {
      prefix += text;
      if (prefix.length < INTERACTIVE_READY.length && INTERACTIVE_READY.startsWith(prefix)) return;
      if (!prefix.startsWith(INTERACTIVE_READY)) {
        emit({ type: "error", data: "The Python sandbox could not start the program." }); stop("protocol"); return;
      }
      ready = true;
      emit({ type: "compile_success", compileTimeMs: 0 });
      emit({ type: "ready" });
      if (stderr) emit({ type: "stderr", data: stderr });
      const rest = prefix.slice(INTERACTIVE_READY.length); prefix = "";
      if (rest) emit({ type, data: rest });
    } else if (text) emit({ type, data: text });
  };
  child.stdout.on("data", (chunk) => output("stdout", chunk));
  child.stderr.on("data", (chunk) => output("stderr", chunk));
  child.on("error", () => {
    if (settled) return;
    emit({ type: "error", data: "The Python sandbox is unavailable right now." });
    removeContainer(); finish();
  });
  child.on("close", (code, signal) => {
    if (settled) return;
    const outTail = stdoutDecoder.end();
    const errTail = stderrDecoder.end();
    if (ready && outTail) emit({ type: "stdout", data: outTail });
    if (errTail) { stderr += errTail; if (ready) emit({ type: "stderr", data: errTail }); }
    if (!ready && code === 3) emit({ type: "compile_error", data: stderr || "Python syntax error." });
    else if (!ready || [125, 126, 127].includes(code)) emit({ type: "error", data: "The Python sandbox is unavailable right now." });
    else if (!reason) emit({ type: "exit", code, signal, ...(signal ? { data: "Program reached a resource limit or was stopped." } : {}) });
    finish();
  });
  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify(envelope) + "\n");
  return {
    done, stop,
    input(text) {
      if (settled || inputEnded) return;
      const bytes = Buffer.byteLength(text, "utf8");
      stdinBytes += bytes;
      if (bytes > 8192 || stdinBytes > 16384) {
        emit({ type: "error", data: "Program input exceeded the allowed limit." }); stop("input_limit"); return;
      }
      if (child.stdin.writable) child.stdin.write(text);
    },
    eof() { if (!settled && !inputEnded) { inputEnded = true; child.stdin.end(); } },
  };
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
