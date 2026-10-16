import { describe, expect, it } from "vitest";
import { shouldRunTrace } from "./gdbTracer";

// The trace re-executes the student's binary. These tests pin the policy that
// it is only ever run with isolation (or explicitly opted out of in dev).
describe("shouldRunTrace", () => {
  it("does not trace when GDB is unavailable", () => {
    expect(
      shouldRunTrace({
        isolation: "bwrap",
        gdbAvailable: false,
        allowUnsandboxed: false,
      })
    ).toBe(false);
  });

  it("traces under every real isolation mode", () => {
    for (const isolation of ["bwrap", "unshare-net", "prlimit"] as const) {
      expect(
        shouldRunTrace({ isolation, gdbAvailable: true, allowUnsandboxed: false })
      ).toBe(true);
    }
  });

  it("refuses to trace unsandboxed by default", () => {
    expect(
      shouldRunTrace({
        isolation: "none",
        gdbAvailable: true,
        allowUnsandboxed: false,
      })
    ).toBe(false);
  });

  it("allows unsandboxed tracing only with the explicit dev opt-in", () => {
    expect(
      shouldRunTrace({
        isolation: "none",
        gdbAvailable: true,
        allowUnsandboxed: true,
      })
    ).toBe(true);
  });
});
