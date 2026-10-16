// Test-only helpers for probing the tools the execution tests depend on.
//
// Reporting contract (see the S1 decisions):
//   - When a required tool is missing and REQUIRE_SANDBOX_TOOLS is not set,
//     the dependent test is SKIPPED (vitest reports it as skipped, never as
//     passed).
//   - When REQUIRE_SANDBOX_TOOLS=1 (use this in CI), a missing tool makes the
//     test RUN and FAIL, so a green CI run proves the tools were present.
//
// This file is NOT a test (no .test.ts suffix) — it is shared by the tests.

import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import { execConfig } from "./execConfig";
import { hasBubblewrap, hasPrlimit, getUnshareMode } from "./sandbox";

const execFileAsync = promisify(execFile);

export interface SandboxTools {
  compiler: boolean;
  gdb: boolean;
  bwrap: boolean;
  unshare: boolean;
  prlimit: boolean;
  platform: NodeJS.Platform;
}

async function has(cmd: string, args: string[] = ["--version"]): Promise<boolean> {
  try {
    await execFileAsync(cmd, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function probeSandboxTools(): Promise<SandboxTools> {
  if (os.platform() !== "linux") {
    return {
      compiler: false,
      gdb: false,
      bwrap: false,
      unshare: false,
      prlimit: false,
      platform: os.platform(),
    };
  }
  const [compiler, gdb, bwrap, prlimit] = await Promise.all([
    has(execConfig.compiler),
    has(execConfig.gdbPath),
    hasBubblewrap(),
    hasPrlimit(),
  ]);
  const unshare = (await getUnshareMode()) !== "none";
  return { compiler, gdb, bwrap, unshare, prlimit, platform: os.platform() };
}

export const REQUIRE_SANDBOX_TOOLS = process.env.REQUIRE_SANDBOX_TOOLS === "1";

// true  => caller should SKIP (tool missing, not required)
// false => caller should RUN (tool present, or required-and-missing so it fails)
export function skipUnless(available: boolean): boolean {
  return !available && !REQUIRE_SANDBOX_TOOLS;
}
