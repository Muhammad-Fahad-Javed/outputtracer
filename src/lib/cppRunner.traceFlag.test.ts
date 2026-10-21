import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./gdbTracer", () => ({
  traceExecution: vi.fn(async () => ({
    steps: [{ step: 1, statement: "int main(){return 0;}", variables: "", output: "" }],
    truncated: false,
  })),
}));

import { compileAndRun } from "./cppRunner";
import { traceExecution } from "./gdbTracer";
import { probeSandboxTools, skipUnless } from "./testTools";

const tools = await probeSandboxTools();

describe("compileAndRun trace flag", () => {
  beforeEach(() => {
    vi.mocked(traceExecution).mockClear();
  });

  it.skipIf(skipUnless(tools.compiler))("does not start GDB when grading asks to skip the trace", async () => {
    const result = await compileAndRun({
      source: "int main(){return 0;}",
      trace: false,
    });
    expect(result.status).toBe("success");
    expect(traceExecution).not.toHaveBeenCalled();
    expect(result.trace?.steps ?? []).toEqual([]);
  });
});
