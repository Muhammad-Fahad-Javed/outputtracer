// Plans how to spawn an untrusted compiled binary.
//
// Preference order:
//   1. bubblewrap: no network, fresh PID/UTS, only /usr + /dev + /proc + the
//      submission directory visible
//   2. unshare --net (+ prlimit)
//   3. prlimit only
//   4. bare spawn (non-Linux / missing tools)
//
// None of these is a substitute for a dedicated microVM. They do close the
// easy holes: inherited env secrets, outbound network, and unbounded
// fork/memory/CPU.

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execConfig } from "./execConfig";

const execFileAsync = promisify(execFile);

export type IsolationLevel = "bwrap" | "unshare-net" | "prlimit" | "none";

export interface RunPlan {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  isolation: IsolationLevel;
}

export function sanitizedChildEnv(homeDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: homeDir,
    TMPDIR: homeDir,
    TMP: homeDir,
    TEMP: homeDir,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NODE_ENV: "production",
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
    await execFileAsync(
      "unshare",
      ["--user", "--map-root-user", "--net", "true"],
      { timeout: 2000 }
    );
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

function prlimitPrefix(exePath: string): { command: string; args: string[] } {
  return {
    command: "prlimit",
    args: [
      `--nproc=${execConfig.maxProcesses}`,
      `--as=${execConfig.maxMemoryMb * 1024 * 1024}`,
      `--cpu=${execConfig.maxCpuSeconds}`,
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
    "/sandbox",
    "--chdir",
    "/sandbox",
    "--clearenv",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--setenv",
    "HOME",
    "/sandbox",
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

function remapExeToSandbox(exePath: string): string {
  return `/sandbox/${path.basename(exePath)}`;
}

export async function planUntrustedRun(opts: {
  exePath: string;
  tempDir: string;
}): Promise<RunPlan> {
  const env = sanitizedChildEnv(opts.tempDir);
  const usePrlimit = await hasPrlimit();
  const sandboxExe = remapExeToSandbox(opts.exePath);
  const hostInner = usePrlimit
    ? prlimitPrefix(opts.exePath)
    : { command: opts.exePath, args: [] as string[] };
  const sandboxInner = usePrlimit
    ? prlimitPrefix(sandboxExe)
    : { command: sandboxExe, args: [] as string[] };

  if (await hasBubblewrap()) {
    return {
      command: "bwrap",
      args: await bwrapPrefix(
        opts.tempDir,
        sandboxInner.command,
        sandboxInner.args
      ),
      env,
      isolation: "bwrap",
    };
  }

  const unshare = await getUnshareMode();
  if (unshare !== "none") {
    const unshareFlags =
      unshare === "user-net"
        ? ["--user", "--map-root-user", "--net", "--"]
        : ["--net", "--"];
    return {
      command: "unshare",
      args: [...unshareFlags, hostInner.command, ...hostInner.args],
      env,
      isolation: "unshare-net",
    };
  }

  if (usePrlimit) {
    return {
      command: hostInner.command,
      args: hostInner.args,
      env,
      isolation: "prlimit",
    };
  }

  return {
    command: opts.exePath,
    args: [],
    env,
    isolation: "none",
  };
}

export async function describeIsolation(): Promise<IsolationLevel> {
  if (await hasBubblewrap()) return "bwrap";
  const unshare = await getUnshareMode();
  if (unshare !== "none") return "unshare-net";
  if (await hasPrlimit()) return "prlimit";
  return "none";
}
