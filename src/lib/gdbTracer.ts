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
import { DryRunStep } from "@/types/predictor";

const execFileAsync = promisify(execFile);

export interface TraceResult {
  steps: DryRunStep[];
  truncated: boolean;
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
  sourceFile: string;
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
SOURCE_FILE = ${JSON.stringify(opts.sourceFile)}

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
source_lines = {}
try:
    with open(SOURCE_FILE, "r") as f:
        source_lines = {i + 1: line.rstrip() for i, line in enumerate(f.readlines())}
except Exception:
    pass

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

        # Only trace lines from the user's source file
        if not filename.endswith("main.cpp"):
            try:
                gdb.execute("step")
            except gdb.error:
                break
            continue

        statement = source_lines.get(lineno, "").strip()

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
  sourceFile: string;
  stdinContent?: string;
}): Promise<TraceResult> {
  const gdbCheck = await checkGdbAvailable();
  if (!gdbCheck.available) {
    return { steps: [], truncated: false };
  }

  const stdoutFile = path.join(opts.tempDir, "__stdout.txt");
  const traceFile = path.join(opts.tempDir, "__trace.json");
  const scriptFile = path.join(opts.tempDir, "__trace_script.py");

  // Write stdin if provided
  let stdinFile: string | undefined;
  if (opts.stdinContent) {
    stdinFile = path.join(opts.tempDir, "__stdin.txt");
    await fs.writeFile(stdinFile, opts.stdinContent, "utf8");
  }

  // Create an empty stdout file so GDB's run redirect works
  await fs.writeFile(stdoutFile, "", "utf8");

  // Generate and write the GDB Python script
  const script = generateGdbPythonScript({
    maxSteps: execConfig.maxTraceSteps,
    stdoutFile,
    traceFile,
    sourceFile: opts.sourceFile,
    stdinFile,
  });
  await fs.writeFile(scriptFile, script, "utf8");

  try {
    // Run GDB in batch mode with the Python script.
    // We use execFile (no shell) for the same security reasons as cppRunner.
    await execFileAsync(
      execConfig.gdbPath,
      [
        "--batch",
        "--quiet",
        "-x", scriptFile,
        opts.exePath,
      ],
      {
        cwd: opts.tempDir,
        timeout: execConfig.traceTimeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 10 * 1024 * 1024, // 10 MB — GDB can be verbose
      }
    );
  } catch {
    // GDB failed or timed out — return empty trace (caller uses fallback).
    return { steps: [], truncated: false };
  }

  // Read the trace JSON
  try {
    const raw = await fs.readFile(traceFile, "utf8");
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
