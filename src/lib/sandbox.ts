// Plans how to spawn untrusted code — the compiled student binary, the C++
// *compiler* that builds it, and the GDB tracer that re-runs it — under the
// strongest isolation the host can provide.
//
// Preference order (identical for all three call sites):
//   1. bubblewrap (bwrap): fresh PID/UTS namespaces, no network, only /usr
//      (+ /lib64 if present), /dev, /proc, a private /tmp, and the submission
//      directory are visible. This is the ONLY mode that also restricts the
//      filesystem the untrusted process can read.
//   2. unshare --net (+ prlimit): removes outbound network and bounds
//      resources, but the host filesystem remains fully visible.
//   3. prlimit only: bounds CPU/memory/processes. No isolation.
//   4. bare spawn (non-Linux / missing tools): NO isolation. Marked
//      "none" and never used for graded execution.
//
// None of these is a substitute for a dedicated container/microVM per run.
// They close the easy holes: inherited environment secrets, outbound
// network, host filesystem access (bwrap only), and unbounded
// fork/memory/CPU. See the README security section.

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execConfig } from "./execConfig";

const execFileAsync = promisify(execFile);

export type IsolationLevel = "bwrap" | "unshare-net" | "prlimit" | "none";

export interface ResourceLimits {
  maxMemoryMb: number;
  maxCpuSeconds: number;
  maxProcesses: number;
  /** RLIMIT_FSIZE in bytes. Caps files the compiler or program can create. */
  maxFileBytes?: number;
}

export interface RunPlan {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  isolation: IsolationLevel;
}

// The directory the submission is mounted at inside a bubblewrap sandbox.
const SANDBOX_DIR = "/sandbox";

// Allow-list of environment variables handed to the compiler and the program.
// Everything else in process.env — including SUPABASE_SERVICE_ROLE_KEY and any
// other secret loaded from .env.local — is deliberately dropped.
export function sanitizedChildEnv(homeDir: string): NodeJS.ProcessEnv {
  return {
    PATH:
      process.env.PATH ||
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: homeDir,
    TMPDIR: homeDir,
    TMP: homeDir,
    TEMP: homeDir,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NODE_ENV: "production",
    ...(process.env.NODE_ENV !== "test" && process.env.SystemRoot
      ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR }
      : {}),
  };
}

export function defaultResourceLimits(): ResourceLimits {
  return {
    maxMemoryMb: execConfig.maxMemoryMb,
    maxCpuSeconds: execConfig.maxCpuSeconds,
    maxProcesses: execConfig.maxProcesses,
    maxFileBytes: execConfig.maxOutputFileBytes,
  };
}

let prlimitAvailable: boolean | null = null;
export async function hasPrlimit(): Promise<boolean> {
  if (prlimitAvailable !== null) return prlimitAvailable;
  if (os.platform() !== "linux") {
    prlimitAvailable = false;
    return false;
  }
  try {
    await execFileAsync("prlimit", ["--version"], { timeout: 2000 });
    prlimitAvailable = true;
  } catch {
    prlimitAvailable = false;
  }
  return prlimitAvailable;
}

let bwrapAvailable: boolean | null = null;
export async function hasBubblewrap(): Promise<boolean> {
  if (bwrapAvailable !== null) return bwrapAvailable;
  if (os.platform() !== "linux") {
    bwrapAvailable = false;
    return false;
  }
  try {
    // `true` is not on PATH inside the sandbox, and a dynamic g++ needs /lib.
    // Probe with the same mounts the real plan uses, or bubblewrap is treated
    // as missing and the host falls back to a filesystem-visible sandbox.
    const args = [
      "--die-with-parent",
      "--unshare-net",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--dev",
      "/dev",
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
    ];
    if (await pathExists("/lib64")) {
      args.push("--ro-bind", "/lib64", "/lib64");
    }
    args.push("--", "/usr/bin/true");
    await execFileAsync("bwrap", args, { timeout: 3000 });
    bwrapAvailable = true;
  } catch {
    bwrapAvailable = false;
  }
  return bwrapAvailable;
}

type UnshareMode = "user-net" | "net" | "none";
let unshareMode: UnshareMode | null = null;

export async function getUnshareMode(): Promise<UnshareMode> {
  if (unshareMode !== null) return unshareMode;
  if (os.platform() !== "linux") {
    unshareMode = "none";
    return unshareMode;
  }
  try {
    await execFileAsync("unshare", ["--user", "--map-root-user", "--net", "true"], {
      timeout: 2000,
    });
    unshareMode = "user-net";
    return unshareMode;
  } catch {
    // fall through
  }
  try {
    await execFileAsync("unshare", ["--net", "true"], { timeout: 2000 });
    unshareMode = "net";
    return unshareMode;
  } catch {
    unshareMode = "none";
    return unshareMode;
  }
}

// The isolation level that planSandboxedCommand() will actually use, without
// building the argument list. Callers that need to know the mode *before*
// assembling paths (the GDB tracer does) use this directly.
export async function selectIsolation(): Promise<IsolationLevel> {
  if (await hasBubblewrap()) return "bwrap";
  const unshare = await getUnshareMode();
  if (unshare !== "none") return "unshare-net";
  if (await hasPrlimit()) return "prlimit";
  return "none";
}

export async function describeIsolation(): Promise<IsolationLevel> {
  return selectIsolation();
}

// RLIMIT_NPROC is enforced per *real user id*, and it counts every task the
// uid owns — including the Node server, its worker/test processes and their
// threads — not just the processes one request creates. Treating the
// configured value as an absolute ceiling is therefore wrong: on a busy host
// (a GitHub Actions runner running several vitest workers, or a production
// box with PM2) the uid can already own more tasks than the ceiling, so
// fork() fails with EAGAIN before the compiler can even start cc1plus. g++
// retries vfork() with exponential backoff (~15s) in that case, which is
// exactly what made every compile hit our 10s compile timeout in CI.
//
// The configured value is the number of *additional* tasks an execution may
// create; add the ambient count so the ceiling is always above what is
// already running.
export function effectiveProcessLimit(ambientTasks: number, allowedExtra: number): number {
  const ambient =
    Number.isFinite(ambientTasks) && ambientTasks > 0 ? Math.floor(ambientTasks) : 0;
  const extra =
    Number.isFinite(allowedExtra) && allowedExtra > 0 ? Math.floor(allowedExtra) : 1;
  return ambient + extra;
}

const TASK_COUNT_TTL_MS = 1000;
let taskCountCache: { count: number; at: number } | null = null;

// Count this uid's tasks (processes *and* threads, because RLIMIT_NPROC counts
// threads too) from /proc. Returns null when it cannot be determined, in which
// case the caller leaves RLIMIT_NPROC alone rather than risking a ceiling
// below the ambient count.
async function countTasksForCurrentUser(): Promise<number | null> {
  if (os.platform() !== "linux" || typeof process.getuid !== "function") return null;

  const now = Date.now();
  if (taskCountCache && now - taskCountCache.at < TASK_COUNT_TTL_MS) {
    return taskCountCache.count;
  }

  const uid = process.getuid();
  let entries: string[];
  try {
    entries = await fs.readdir("/proc");
  } catch {
    return null;
  }

  let total = 0;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const status = await fs.readFile(`/proc/${entry}/status`, "utf8");
      const uidMatch = /^Uid:\s+(\d+)/m.exec(status);
      if (!uidMatch || Number(uidMatch[1]) !== uid) continue;
      const threadsMatch = /^Threads:\s+(\d+)/m.exec(status);
      total += threadsMatch ? Number(threadsMatch[1]) : 1;
    } catch {
      // The process exited while we were scanning /proc; ignore it.
    }
  }

  if (total === 0) return null;
  taskCountCache = { count: total, at: Date.now() };
  return total;
}

function prlimitPrefix(
  exePath: string,
  exeArgs: string[],
  limits: ResourceLimits,
  processLimit: number | null
): { command: string; args: string[] } {
  const fileBytes = limits.maxFileBytes ?? execConfig.maxOutputFileBytes;
  const args: string[] = [];
  if (processLimit !== null) args.push(`--nproc=${processLimit}`);
  args.push(
    `--as=${limits.maxMemoryMb * 1024 * 1024}`,
    `--cpu=${limits.maxCpuSeconds}`,
    `--fsize=${fileBytes}`,
    "--",
    exePath,
    ...exeArgs
  );
  return { command: "prlimit", args };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Rewrites an absolute path that lives under `tempDir` to its equivalent path
// inside the sandbox (e.g. /tmp/outputtracer-x/main.out -> /sandbox/main.out).
// Paths outside tempDir are returned unchanged.
function remapToSandbox(tempDir: string, p: string): string {
  const base = path.resolve(tempDir);
  const norm = path.resolve(p);
  if (norm === base) return SANDBOX_DIR;
  if (norm.startsWith(base + path.sep)) {
    return SANDBOX_DIR + norm.slice(base.length);
  }
  return p;
}

async function bwrapPrefix(
  tempDir: string,
  innerCommand: string,
  innerArgs: string[]
): Promise<string[]> {
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-net",
    "--unshare-pid",
    "--unshare-uts",
    "--hostname",
    "sandbox",
    "--ro-bind",
    "/usr",
    "/usr",
    "--symlink",
    "usr/bin",
    "/bin",
    "--symlink",
    "usr/lib",
    "/lib",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--bind",
    tempDir,
    SANDBOX_DIR,
    "--chdir",
    SANDBOX_DIR,
    "--clearenv",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--setenv",
    "HOME",
    SANDBOX_DIR,
    "--setenv",
    "TMPDIR",
    "/tmp",
    "--setenv",
    "LANG",
    "C.UTF-8",
    "--setenv",
    "LC_ALL",
    "C.UTF-8",
  ];

  if (await pathExists("/lib64")) {
    args.push("--ro-bind", "/lib64", "/lib64");
  }

  args.push("--", innerCommand, ...innerArgs);
  return args;
}

export interface SandboxedCommandOptions {
  /** The submission directory (contains the sources / compiled binary). */
  tempDir: string;
  /**
   * Host command to run. May be a bare name resolved via PATH ("g++", "gdb"),
   * an absolute path under /usr, or the compiled binary's host path.
   */
  command: string;
  args: string[];
  limits?: ResourceLimits;
  /**
   * When true (the default) absolute paths under `tempDir` are rewritten to
   * their /sandbox equivalents. The compiled binary needs this; the compiler
   * and GDB tracer pass relative names / already-sandbox-safe paths and set
   * this to false.
   */
  remapTempDirPaths?: boolean;
}

export async function planSandboxedCommand(
  opts: SandboxedCommandOptions
): Promise<RunPlan> {
  const env = sanitizedChildEnv(opts.tempDir);
  const limits = opts.limits ?? defaultResourceLimits();
  const remap = opts.remapTempDirPaths !== false;

  const hostCommand = opts.command;
  const hostArgs = opts.args;
  const sandboxCommand = remap ? remapToSandbox(opts.tempDir, opts.command) : opts.command;
  const sandboxArgs = remap
    ? opts.args.map((a) => remapToSandbox(opts.tempDir, a))
    : opts.args;

  const usePrlimit = await hasPrlimit();
  const isolation = await selectIsolation();
  const ambientTasks = usePrlimit ? await countTasksForCurrentUser() : null;
  const processLimit =
    ambientTasks === null ? null : effectiveProcessLimit(ambientTasks, limits.maxProcesses);

  const hostInner = usePrlimit
    ? prlimitPrefix(hostCommand, hostArgs, limits, processLimit)
    : { command: hostCommand, args: hostArgs };
  const sandboxInner = usePrlimit
    ? prlimitPrefix(sandboxCommand, sandboxArgs, limits, processLimit)
    : { command: sandboxCommand, args: sandboxArgs };

  if (isolation === "bwrap") {
    return {
      command: "bwrap",
      args: await bwrapPrefix(opts.tempDir, sandboxInner.command, sandboxInner.args),
      env,
      isolation: "bwrap",
    };
  }

  if (isolation === "unshare-net") {
    const unshareFlags =
      (await getUnshareMode()) === "user-net"
        ? ["--user", "--map-root-user", "--net", "--"]
        : ["--net", "--"];
    return {
      command: "unshare",
      args: [...unshareFlags, hostInner.command, ...hostInner.args],
      env,
      isolation: "unshare-net",
    };
  }

  if (isolation === "prlimit") {
    return {
      command: hostInner.command,
      args: hostInner.args,
      env,
      isolation: "prlimit",
    };
  }

  return {
    command: hostCommand,
    args: hostArgs,
    env,
    isolation: "none",
  };
}

export async function planUntrustedRun(opts: {
  exePath: string;
  tempDir: string;
}): Promise<RunPlan> {
  return planSandboxedCommand({
    tempDir: opts.tempDir,
    command: opts.exePath,
    args: [],
    limits: defaultResourceLimits(),
    remapTempDirPaths: true,
  });
}

// Exported for the GDB tracer, which must build /sandbox paths in the Python
// script it generates when bubblewrap is in use.
export function sandboxDir(): string {
  return SANDBOX_DIR;
}

// ---------------------------------------------------------------------------
// Unsandboxed-execution policy
// ---------------------------------------------------------------------------
// When NO isolation mechanism is available (isolation === "none") untrusted
// code would run directly on the host. That is never acceptable in
// production, so it is refused there regardless of any environment variable.
// Outside production it still requires an explicit opt-in, and the default is
// off — local convenience must never become the security boundary.
//
// process.env is read at call time (not at module load) so the decision always
// reflects the running configuration and remains unit-testable.
function envFlag(name: string): boolean {
  const value = process.env[name];
  return value === "1" || value === "true";
}

export function unsandboxedExecutionAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return envFlag("ALLOW_UNSANDBOXED_EXECUTION");
}

export function unsandboxedTraceAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return envFlag("ALLOW_UNSANDBOXED_EXECUTION") || envFlag("TRACE_ALLOW_UNSANDBOXED");
}

// unshare --net and prlimit do not hide the host filesystem. In production
// that is not an acceptable place to compile or run untrusted code.
// Bubblewrap is the only mode here that mounts a private filesystem.
// Operators who have reviewed the risk can set ALLOW_FILESYSTEM_VISIBLE_SANDBOX=1.
export function isolationPermitsUntrustedExecution(isolation: IsolationLevel): boolean {
  if (isolation === "bwrap") return true;
  if (process.env.NODE_ENV !== "production") {
    if (isolation === "none") return unsandboxedExecutionAllowed();
    return true;
  }
  if (isolation === "none") return false;
  return envFlag("ALLOW_FILESYSTEM_VISIBLE_SANDBOX");
}
