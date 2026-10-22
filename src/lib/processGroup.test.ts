import { describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import { runProcessGroup } from "./processGroup";

const execFileAsync = promisify(execFile);

// These tests exercise POSIX process groups: they need python3 with
// os.fork() and the ps utility. Neither exists on Windows, where the
// implementation falls back to killing the direct child only. The suite
// runs on Linux in CI (ubuntu-latest) and on the Amazon Linux production
// host, so the coverage is kept there and skipped on Windows.
describe.skipIf(os.platform() === "win32")("runProcessGroup", () => {
  it("returns stdout from a short command", async () => {
    const result = await runProcessGroup({
      command: "python3",
      args: ["-c", "print('hi', end='')"],
      timeoutMs: 5000,
      maxBuffer: 1024,
    });
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("hi");
  });

  it("kills a forked child when the wall clock expires", async () => {
    const marker = `ot-pgroup-${process.pid}-${Date.now()}`;
    const result = await runProcessGroup({
      command: "python3",
      args: [
        "-c",
        `import os, time\nos.environ['OT_MARKER']='${marker}'\n` +
          `pid=os.fork()\n` +
          `open('/tmp/${marker}','a').close()\n` +
          `time.sleep(30)\n`,
      ],
      timeoutMs: 400,
      killGraceMs: 200,
      maxBuffer: 1024,
    });
    expect(result.timedOut).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const { stdout } = await execFileAsync("ps", ["-eo", "args"], { timeout: 3000 });
    expect(stdout).not.toContain(marker);
  });
});
