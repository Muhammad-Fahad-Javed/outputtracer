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
    await execFileAsync(
      "bwrap",
      [
        "--die-with-parent",
        "--unshare-net",
        "--ro-bind",
        "/usr",
        "/usr",
        "--dev",
        "/dev",
        "--",
        "true",
      ],
      { timeout: 3000 }
    );
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

function prlimitPrefix(
  exePath: string,
  limits: ResourceLimits
): { command: string; args: string[] } {
  return {
    command: "prlimit",
    args: [
      `--nproc=${limits.maxProcesses}`,
      `--as=${limits.maxMemoryMb * 1024 * 1024}`,
      `--cpu=${limits.maxCpuSeconds}`,
      "--",
      exePath,
    ],
  };
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

  const hostInner = usePrlimit
    ? prlimitPrefix(hostCommand, limits)
    : { command: hostCommand, args: hostArgs };
  const sandboxInner = usePrlimit
    ? prlimitPrefix(sandboxCommand, limits)
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
