// GDB-based step-by-step tracer for C++ programs.
//
// Generates a Python script that drives GDB through the user's compiled
// binary, capturing frame/line info, local variable values, and per-step
// stdout output.  The script writes structured JSON to a file that this
// module reads back.
//
// This is a best-effort tracing layer — if GDB is unavailable or the trace
// fails for any reason, the caller should fall back gracefully (the program
// output itself is always obtained via the normal execution path).

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { execConfig } from "./execConfig";
import {
  planSandboxedCommand,
  selectIsolation,
  sandboxDir,
  unsandboxedTraceAllowed,
  type IsolationLevel,
} from "./sandbox";
import { DryRunStep } from "@/types/predictor";

const execFileAsync = promisify(execFile);

export interface TraceResult {
  steps: DryRunStep[];
  truncated: boolean;
  // Set when the traced program may not reproduce the normal run's output
  // (clock/rand/pointers) — see traceDeterminism.ts.
  determinismWarning?: string;
}

// The trace re-executes the student's binary under GDB. That re-run MUST be
// sandboxed just like the normal run, otherwise tracing would be a way to
// execute untrusted code without isolation. If the only available mode is
// "none" (no sandbox tooling), we skip tracing rather than run it unsandboxed.
// TRACE_ALLOW_UNSANDBOXED=1 is a development-only escape hatch.
export function shouldRunTrace(opts: {
  isolation: IsolationLevel;
  gdbAvailable: boolean;
  allowUnsandboxed: boolean;
}): boolean {
  if (!opts.gdbAvailable) return false;
  if (opts.isolation !== "none") return true;
  return opts.allowUnsandboxed;
}

// ---------------------------------------------------------------------------
// GDB availability check (lazy, cached)
// ---------------------------------------------------------------------------
let gdbAvailability: { checked: boolean; available: boolean; version?: string } = {
  checked: false,
  available: false,
};

export async function checkGdbAvailable(): Promise<{ available: boolean; version?: string }> {
  if (gdbAvailability.checked) return gdbAvailability;
  try {
    const { stdout } = await execFileAsync(execConfig.gdbPath, ["--version"], {
      timeout: 5000,
    });
    gdbAvailability = { checked: true, available: true, version: stdout.split("\n")[0] };
  } catch {
    gdbAvailability = { checked: true, available: false };
  }
  return gdbAvailability;
}

// ---------------------------------------------------------------------------
// Generate the GDB Python script
// ---------------------------------------------------------------------------
function generateGdbPythonScript(opts: {
  maxSteps: number;
  stdoutFile: string;
  traceFile: string;
  tempDir: string;
  stdinFile?: string;
}): string {
  // The script runs inside GDB's embedded Python interpreter. It must not
  // depend on any packages beyond the Python stdlib + GDB module.
  //
  // IMPORTANT: All paths are injected as raw strings. Because the paths
  // come from os.tmpdir() + crypto.randomBytes (no user input), there is
  // no injection risk here. Never pass user-controlled values into this
  // template.
  const stdinRedirect = opts.stdinFile ? ` < ${opts.stdinFile}` : "";

  return `
import gdb
import json
import os

MAX_STEPS = ${opts.maxSteps}
STDOUT_FILE = ${JSON.stringify(opts.stdoutFile)}
TRACE_FILE = ${JSON.stringify(opts.traceFile)}
TEMP_DIR = ${JSON.stringify(opts.tempDir)}

# ── Configure GDB ──────────────────────────────────────────────────────
gdb.execute("set pagination off")
gdb.execute("set print pretty off")
gdb.execute("set print elements 200")
gdb.execute("set print array off")
gdb.execute("set print repeats 10")
gdb.execute("set confirm off")
gdb.execute("set width 0")
gdb.execute("set height 0")

# Skip system / standard-library source so 'step' doesn't descend into
# implementation details of iostream, vector, etc.
for pattern in ["/usr/*", "/lib/*", "/include/*", "*/bits/*", "*/ext/*", "*/c++/*"]:
    try:
        gdb.execute("skip -gfi " + pattern)
    except gdb.error:
        pass

# ── Read user source lines for mapping line numbers to statements ──────
file_lines_cache = {}
def get_statement(fname, lno):
    if fname not in file_lines_cache:
        try:
            with open(fname, "r") as f:
                file_lines_cache[fname] = {i + 1: line.rstrip() for i, line in enumerate(f.readlines())}
        except Exception:
            file_lines_cache[fname] = {}
    return file_lines_cache[fname].get(lno, "").strip()

# ── Helpers ─────────────────────────────────────────────────────────────
def get_locals():
    """Return a formatted string of local variables, or an em-dash."""
    try:
        raw = gdb.execute("info locals", to_string=True)
        if not raw or "No locals" in raw or "No symbol table" in raw:
            return "\\u2014"
        parts = []
        for line in raw.strip().split("\\n"):
            line = line.strip()
            # Skip GDB internal / noise lines
            if not line or line.startswith("(") or line.startswith("__"):
                continue
            parts.append(line)
        return ", ".join(parts) if parts else "\\u2014"
    except Exception:
        return "\\u2014"

def get_args():
    """Return a formatted string of function arguments."""
    try:
        raw = gdb.execute("info args", to_string=True)
        if not raw or "No arguments" in raw or "No symbol table" in raw:
            return ""
        parts = []
        for line in raw.strip().split("\\n"):
            line = line.strip()
            if not line or line.startswith("(") or line.startswith("__"):
                continue
            parts.append(line)
        return ", ".join(parts) if parts else ""
    except Exception:
        return ""

def flush_inferior():
    """Flush the inferior's stdout so output appears in the redirect file."""
    try:
        gdb.execute("call (int)fflush(0)", to_string=True)
    except gdb.error:
        pass

def read_new_output():
    """Read any new output produced since the last check."""
    global prev_stdout_size
    try:
        current_size = os.path.getsize(STDOUT_FILE)
        if current_size > prev_stdout_size:
            with open(STDOUT_FILE, "r") as f:
                f.seek(prev_stdout_size)
                new_output = f.read()
            prev_stdout_size = current_size
            return new_output
    except Exception:
        pass
    return "\\u2014"

def get_variables():
    """Get combined args + locals string."""
    variables = get_locals()
    args = get_args()
    if args:
        variables = args + (", " + variables if variables != "\\u2014" else "")
    return variables

SKIP_STATEMENTS = {"{", "}", ""}

# ── Break at main and run ──────────────────────────────────────────────
gdb.execute("break main")

# Create empty stdout file
with open(STDOUT_FILE, "w") as f:
    pass

gdb.execute("run > " + STDOUT_FILE + "${stdinRedirect}")

steps = []
truncated = False
prev_stdout_size = 0

for i in range(MAX_STEPS):
    # ── Check the inferior is still running ────────────────────────────
    try:
        frame = gdb.selected_frame()
    except gdb.error:
        break

    try:
        sal = frame.find_sal()
        if not sal or not sal.symtab:
            try:
                gdb.execute("step")
            except gdb.error:
                break
            continue

        filename = sal.symtab.fullname()
        lineno = sal.line

        # Only trace lines from the user's source files in the temp directory
        if not filename.startswith(TEMP_DIR):
            try:
                gdb.execute("step")
            except gdb.error:
                break
            continue

        statement = get_statement(filename, lineno)

        # Skip non-informative lines (braces, blank)
        if statement in SKIP_STATEMENTS:
            try:
                gdb.execute("step")
            except gdb.error:
                break
            continue

        # ── Execute this line ──────────────────────────────────────────
        try:
            gdb.execute("step")
        except gdb.error:
            # Program exited on this line — record it with final state
            flush_inferior()
            step_output = read_new_output()
            steps.append({
                "step": len(steps) + 1,
                "statement": statement,
                "variables": get_variables(),
                "output": step_output,
            })
            break

        # ── Capture state AFTER the line executed ──────────────────────
        flush_inferior()
        step_output = read_new_output()

        # Get variables from the new frame (after stepping)
        variables = get_variables()

        steps.append({
            "step": len(steps) + 1,
            "statement": statement,
            "variables": variables,
            "output": step_output,
        })

        # We already stepped, so continue to the next iteration
        # (the loop will check the new frame position)
        continue

    except gdb.error:
        break

if len(steps) >= MAX_STEPS:
    truncated = True

# ── Write results ──────────────────────────────────────────────────────
result = {"steps": steps, "truncated": truncated}
with open(TRACE_FILE, "w") as f:
    json.dump(result, f)
`;
}

// ---------------------------------------------------------------------------
// Run GDB trace
// ---------------------------------------------------------------------------
export async function traceExecution(opts: {
  exePath: string;
  tempDir: string;
  stdinContent?: string;
}): Promise<TraceResult> {
  const gdbCheck = await checkGdbAvailable();
  const isolation = await selectIsolation();
  if (
    !shouldRunTrace({
      isolation,
      gdbAvailable: gdbCheck.available,
      allowUnsandboxed: unsandboxedTraceAllowed(),
    })
  ) {
    return { steps: [], truncated: false };
  }

  // Real files always live on the host under the submission directory.
  const hostStdout = path.join(opts.tempDir, "__stdout.txt");
  const hostTrace = path.join(opts.tempDir, "__trace.json");
  const hostScript = path.join(opts.tempDir, "__trace_script.py");
  const hostStdin = opts.stdinContent
    ? path.join(opts.tempDir, "__stdin.txt")
    : undefined;

  // Under bubblewrap the submission directory is mounted at /sandbox, so the
  // paths embedded in the generated script and passed to GDB must use that
  // prefix. For the weaker modes the host paths are used directly.
  const useSandboxPaths = isolation === "bwrap";
  const runDir = useSandboxPaths ? sandboxDir() : opts.tempDir;
  const toRunPath = (host: string) =>
    useSandboxPaths ? `${runDir}/${path.basename(host)}` : host;

  // Create an empty stdout file so GDB's run redirect works.
  await fs.writeFile(hostStdout, "", "utf8");
  if (hostStdin && opts.stdinContent) {
    await fs.writeFile(hostStdin, opts.stdinContent, "utf8");
  }

  const script = generateGdbPythonScript({
    maxSteps: execConfig.maxTraceSteps,
    stdoutFile: toRunPath(hostStdout),
    traceFile: toRunPath(hostTrace),
    tempDir: runDir,
    stdinFile: hostStdin ? toRunPath(hostStdin) : undefined,
  });
  await fs.writeFile(hostScript, script, "utf8");

  // Run GDB inside the SAME sandbox as the normal execution. execFile (no
  // shell) keeps the argv-array guarantee; resource limits bound GDB too.
  const plan = await planSandboxedCommand({
    tempDir: opts.tempDir,
    command: execConfig.gdbPath,
    args: [
      "--batch",
      "--quiet",
      "-x",
      toRunPath(hostScript),
      toRunPath(opts.exePath),
    ],
    limits: {
      maxMemoryMb: execConfig.traceMaxMemoryMb,
      maxCpuSeconds: execConfig.traceMaxCpuSeconds,
      maxProcesses: execConfig.traceMaxProcesses,
    },
    remapTempDirPaths: false,
  });

  try {
    await execFileAsync(plan.command, plan.args, {
      cwd: opts.tempDir,
      env: plan.env,
      timeout: execConfig.traceTimeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 10 * 1024 * 1024, // 10 MB — GDB can be verbose
    });
  } catch {
    // GDB failed or timed out — return empty trace (caller uses fallback).
    return { steps: [], truncated: false };
  }

  // Read the trace JSON
  try {
    const raw = await fs.readFile(hostTrace, "utf8");
    const data = JSON.parse(raw) as { steps: DryRunStep[]; truncated: boolean };

    if (!Array.isArray(data.steps)) {
      return { steps: [], truncated: false };
    }

    return {
      steps: data.steps,
      truncated: !!data.truncated,
    };
  } catch {
    // Trace file missing or malformed — return empty.
    return { steps: [], truncated: false };
  }
}
