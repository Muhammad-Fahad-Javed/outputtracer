import { describe, expect, it } from "vitest";
import { compileAndRun } from "./cppRunner";
import { probeSandboxTools, skipUnless } from "./testTools";

// Probe the compiler once. When it is missing these tests are SKIPPED (not
// silently passed); set REQUIRE_SANDBOX_TOOLS=1 to make them fail instead.
const tools = await probeSandboxTools();

describe("compileAndRun", () => {
  it("rejects path-like filenames without spawning the compiler", async () => {
    const result = await compileAndRun({
      files: { "../escape.cpp": "int main(){}" },
    });
    expect(result.status).toBe("invalid_request");
    expect(result.title).toBe("Invalid filename");
  });

  it("rejects empty submissions", async () => {
    const result = await compileAndRun({ files: {} });
    expect(result.status).toBe("invalid_request");
  });

  it.skipIf(skipUnless(tools.compiler))(
    "compiles and runs a hello-world when g++ is installed",
    async () => {
      const result = await compileAndRun({
        source: `#include <iostream>
int main() { std::cout << "ok"; return 0; }`,
      });
      expect(result.status).toBe("success");
      expect(result.stdout).toBe("ok");
    }
  );

  it.skipIf(skipUnless(tools.compiler))(
    "times out infinite loops",
    async () => {
      const result = await compileAndRun({
        source: "int main() { for(;;) {} }",
      });
      expect(result.status).toBe("timeout");
    },
    20_000
  );

  it.skipIf(skipUnless(tools.compiler))(
    "kills programs that spam stdout",
    async () => {
      const result = await compileAndRun({
        source: `#include <iostream>
int main() { while (true) std::cout << "aaaaaaaaaaaaaaaaaaaaaaaa"; }`,
      });
      expect(["output_limit", "timeout"]).toContain(result.status);
    },
    20_000
  );
});
