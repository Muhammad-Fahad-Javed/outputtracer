// Native NASM Assembler Adapter with graceful fallback to BuiltinAssembler
// Safely invokes native `nasm` via execFile without a shell when installed.
//
// NASM processes *untrusted* user source (its preprocessor can read host files
// via %include/incbin and even run commands via %!), so the native assembler is
// executed under the same sandbox as the C++ toolchain. When no sandbox is
// available the pure-JS builtin assembler is used instead — never an
// unsandboxed native run.

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { assemble8086 } from "./assembler";
import { AssembleResult, AsmDiagnostic } from "./types";
import { planSandboxedCommand, selectIsolation, unsandboxedExecutionAllowed } from "../sandbox";

const execFileAsync = promisify(execFile);

let nasmAvailabilityChecked = false;
let nasmPath: string | null = null;
let nasmVersionString: string | null = null;
let nasmCheckPromise: Promise<{ available: boolean; version?: string }> | null = null;

export async function checkNasmAvailable(): Promise<{ available: boolean; version?: string }> {
  if (nasmAvailabilityChecked) {
    return { available: nasmPath !== null, version: nasmVersionString ?? undefined };
  }
  if (nasmCheckPromise) {
    return nasmCheckPromise;
  }

  nasmCheckPromise = (async () => {
    try {
      const checkCmd = process.platform === "win32" ? "where" : "which";
      const located = await execFileAsync(checkCmd, ["nasm"], { timeout: 1000 });
      // Resolve an absolute path so the assembler is still reachable inside a
      // bubblewrap sandbox (whose PATH is limited to /usr/bin:/bin).
      const resolved =
        (located.stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)[0] || "nasm";
      const { stdout } = await execFileAsync(resolved, ["-v"], { timeout: 2000 });
      nasmPath = resolved;
      nasmVersionString = stdout.trim().split("\n")[0];
      nasmAvailabilityChecked = true;
      return { available: true, version: nasmVersionString };
    } catch {
      nasmPath = null;
      nasmVersionString = null;
      nasmAvailabilityChecked = true;
      return { available: false };
    }
  })();

  return nasmCheckPromise;
}

export async function assembleWithNasmOrFallback(source: string): Promise<AssembleResult> {
  const nasmInfo = await checkNasmAvailable();

  // Never run the native assembler on untrusted source without isolation.
  // With no sandbox available we use the pure-JS builtin assembler instead
  // (production can never opt into an unsandboxed run).
  const sandboxed = (await selectIsolation()) !== "none" || unsandboxedExecutionAllowed();

  if (nasmInfo.available && sandboxed && nasmPath) {
    try {
      return await runNativeNasm(source, nasmPath);
    } catch {
      // If native NASM fails with an execution error, fall back to builtin assembler
    }
  }

  // Builtin NASM-compatible assembler
  return assemble8086(source);
}

async function runNativeNasm(source: string, nasmPath: string): Promise<AssembleResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "outputtracer-nasm-"));
  const srcFile = path.join(tmpDir, "source.asm");
  const binFile = path.join(tmpDir, "output.com");
  const lstFile = path.join(tmpDir, "output.lst");

  try {
    await fs.writeFile(srcFile, source, "utf8");

    // Invoke nasm: argv array, no shell execution, inside the host sandbox.
    const plan = await planSandboxedCommand({
      tempDir: tmpDir,
      command: nasmPath,
      args: ["-f", "bin", "-o", binFile, "-l", lstFile, srcFile],
      remapTempDirPaths: true,
    });
    await execFileAsync(plan.command, plan.args, {
      cwd: tmpDir,
      env: plan.env,
      timeout: 5000,
      killSignal: "SIGKILL",
    });

    const binary = await fs.readFile(binFile);
    const listing = await fs.readFile(lstFile, "utf8");

    const sourceMap = new Map<number, number>();
    const lineToOffset = new Map<number, number>();

    // Parse NASM listing file:
    // Format: "     1 00000000 B80000 ...   mov ax, 0"
    for (const line of listing.split("\n")) {
      const match = line.match(/^\s*(\d+)\s+([0-9a-fA-F]{8})/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        const offset = parseInt(match[2], 16) + 0x0100; // standard COM load
        sourceMap.set(offset, lineNum);
        if (!lineToOffset.has(lineNum)) {
          lineToOffset.set(lineNum, offset);
        }
      }
    }

    return {
      success: true,
      binary: new Uint8Array(binary),
      loadAddress: { segment: 0x1000, offset: 0x0100 },
      entryPoint: { segment: 0x1000, offset: 0x0100 },
      sourceMap,
      lineToOffset,
      diagnostics: [],
      listing,
      engineUsed: "native-nasm",
    };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    const diagnostics: AsmDiagnostic[] = [];
    const stderr = error.stderr || error.message || "Native NASM compilation failed";

    for (const line of stderr.split("\n")) {
      const m = line.match(/:(\d+):\s*(error|warning):\s*(.*)/i);
      if (m) {
        diagnostics.push({
          type: m[2].toLowerCase() === "error" ? "error" : "warning",
          line: parseInt(m[1], 10),
          message: m[3].trim(),
          raw: line,
        });
      }
    }

    if (diagnostics.length === 0) {
      diagnostics.push({
        type: "error",
        message: stderr,
      });
    }

    return {
      success: false,
      binary: new Uint8Array(),
      loadAddress: { segment: 0x1000, offset: 0x0100 },
      entryPoint: { segment: 0x1000, offset: 0x0100 },
      sourceMap: new Map(),
      lineToOffset: new Map(),
      diagnostics,
      engineUsed: "native-nasm",
    };
  } finally {
    // Guaranteed cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
