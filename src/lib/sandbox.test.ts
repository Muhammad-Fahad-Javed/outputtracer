import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import {
  sanitizedChildEnv,
  planSandboxedCommand,
  planUntrustedRun,
  selectIsolation,
  unsandboxedExecutionAllowed,
  unsandboxedTraceAllowed,
  isolationPermitsUntrustedExecution,
  type IsolationLevel,
} from "./sandbox";

const LEVELS: IsolationLevel[] = ["bwrap", "unshare-net", "prlimit", "none"];

describe("sanitizedChildEnv", () => {
  it("does not leak unrelated process env (e.g. secrets)", () => {
    const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "should-not-leak-into-child";
    try {
      const env = sanitizedChildEnv("/tmp/ot-home");
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      expect(Object.keys(env).sort()).toEqual(
        [
          "HOME",
          "LANG",
          "LC_ALL",
          "NODE_ENV",
          "PATH",
          "TEMP",
          "TMP",
          "TMPDIR",
        ].sort()
      );
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  });
});

describe("selectIsolation", () => {
  it("returns a valid isolation level", async () => {
    expect(LEVELS).toContain(await selectIsolation());
  });
});

describe("planSandboxedCommand", () => {
  const tempDir = path.join(os.tmpdir(), "ot-plan-test");
  const exe = path.join(tempDir, os.platform() === "win32" ? "main.exe" : "main.out");

  it("plans the compiled program with the active isolation and no secrets", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "should-not-leak-into-child";
    try {
      const plan = await planUntrustedRun({ exePath: exe, tempDir });
      expect(plan.isolation).toBe(await selectIsolation());
      expect(plan.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    } finally {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it("plans the tracer (and compiler) through the same isolation path", async () => {
    // The GDB tracer calls planSandboxedCommand with remapTempDirPaths:false.
    const plan = await planSandboxedCommand({
      tempDir,
      command: "gdb",
      args: ["--batch", "--quiet"],
      remapTempDirPaths: false,
    });
    expect(plan.isolation).toBe(await selectIsolation());
  });

  it("keeps compiler arguments when prlimit wraps the command", async () => {
    const plan = await planSandboxedCommand({
      tempDir,
      command: "g++",
      args: ["main.cpp", "-o", "main.out"],
      remapTempDirPaths: false,
    });
    const rendered = [plan.command, ...plan.args].join(" ");
    expect(rendered).toContain("main.cpp");
    expect(rendered).toContain("main.out");
    if (plan.isolation === "prlimit" || plan.isolation === "unshare-net" || plan.isolation === "bwrap") {
      expect(rendered).toContain("g++");
      expect(rendered).toContain("--fsize=");
    }
  });
});

// The fail-closed policy: untrusted code must never run unsandboxed in
// production, and off-production requires an explicit opt-in (default off).
describe("unsandboxed execution policy", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedExec = process.env.ALLOW_UNSANDBOXED_EXECUTION;
  const savedTrace = process.env.TRACE_ALLOW_UNSANDBOXED;
  const savedFs = process.env.ALLOW_FILESYSTEM_VISIBLE_SANDBOX;

  // process.env.NODE_ENV is typed readonly; write through a mutable view.
  const setEnv = (name: string, value: string | undefined) => {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) delete env[name];
    else env[name] = value;
  };

  const restore = () => {
    setEnv("NODE_ENV", savedNodeEnv);
    setEnv("ALLOW_UNSANDBOXED_EXECUTION", savedExec);
    setEnv("TRACE_ALLOW_UNSANDBOXED", savedTrace);
    setEnv("ALLOW_FILESYSTEM_VISIBLE_SANDBOX", savedFs);
  };

  it("is off by default outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ALLOW_UNSANDBOXED_EXECUTION", undefined);
    setEnv("TRACE_ALLOW_UNSANDBOXED", undefined);
    try {
      expect(unsandboxedExecutionAllowed()).toBe(false);
      expect(unsandboxedTraceAllowed()).toBe(false);
    } finally {
      restore();
    }
  });

  it("can be opted into outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ALLOW_UNSANDBOXED_EXECUTION", "1");
    try {
      expect(unsandboxedExecutionAllowed()).toBe(true);
      expect(unsandboxedTraceAllowed()).toBe(true);
    } finally {
      restore();
    }
  });

  it("refuses filesystem-visible isolation in production unless an operator opts in", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ALLOW_FILESYSTEM_VISIBLE_SANDBOX", undefined);
    try {
      expect(isolationPermitsUntrustedExecution("bwrap")).toBe(true);
      expect(isolationPermitsUntrustedExecution("unshare-net")).toBe(false);
      expect(isolationPermitsUntrustedExecution("prlimit")).toBe(false);
      expect(isolationPermitsUntrustedExecution("none")).toBe(false);
    } finally {
      restore();
    }
  });

  it("is always refused in production, even when explicitly opted in", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ALLOW_UNSANDBOXED_EXECUTION", "1");
    setEnv("TRACE_ALLOW_UNSANDBOXED", "1");
    try {
      expect(unsandboxedExecutionAllowed()).toBe(false);
      expect(unsandboxedTraceAllowed()).toBe(false);
    } finally {
      restore();
    }
  });
});
