import { describe, expect, it, beforeEach } from "vitest";
import { releaseRun, resetRunGate, tryAcquireRun } from "./runGate";

describe("run gate", () => {
  beforeEach(() => resetRunGate());

  it("lets different people run at the same time and blocks a second run from one person", () => {
    expect(tryAcquireRun("student-a")).toBe("ok");
    expect(tryAcquireRun("student-a")).toBe("user-busy");
    expect(tryAcquireRun("student-b")).toBe("ok");
    releaseRun("student-a");
    expect(tryAcquireRun("student-a")).toBe("ok");
    releaseRun("student-a");
    releaseRun("student-b");
  });
});
