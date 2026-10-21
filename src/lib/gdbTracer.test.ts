import { describe, expect, it } from "vitest";
import { readableTraceVariables, shouldRunTrace } from "./gdbTracer";

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

describe("readableTraceVariables", () => {
  it("drops argc, argv, and runtime symbols while keeping the student variable", () => {
    const raw = "argc = 1, argv = 0x7fff, x = 1, std::__cxx11::string s = \"hi\", _IO_FILE * stdin = 0";
    expect(readableTraceVariables(raw)).toBe("x = 1");
  });

  it("keeps a value that itself contains commas", () => {
    expect(readableTraceVariables("nums = {1, 2, 3}, total = 6")).toBe("nums = {1, 2, 3}, total = 6");
  });

  it("returns an em dash when only noise remains", () => {
    expect(readableTraceVariables("argc = 1, argv = 0x1")).toBe("—");
  });
});
