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
    "returns a compile error that is not a timeout",
    async () => {
      const result = await compileAndRun({
        source: "int main() { return missing; }",
      });
      expect(result.status).toBe("compile_error");
      expect(result.message || "").toMatch(/missing|error/i);
    }
  );

  it.skipIf(skipUnless(tools.compiler))(
    "forwards stdin and keeps stdout separate from stderr",
    async () => {
      const result = await compileAndRun({
        source: `#include <iostream>
int main() {
  int n = 0;
  std::cin >> n;
  std::cout << n + 1;
  std::cerr << "e";
  return 0;
}`,
        stdin: "41\n",
        trace: false,
      });
      expect(result.status).toBe("success");
      expect(result.stdout).toBe("42");
      expect(result.stderr).toBe("e");
      expect(result.exitCode).toBe(0);
    }
  );

  it.skipIf(skipUnless(tools.compiler))(
    "compiles more than one source file",
    async () => {
      const result = await compileAndRun({
        files: {
          "helper.h": "int add(int a, int b);",
          "helper.cpp": "int add(int a, int b) { return a + b; }",
          "main.cpp": `#include <iostream>
#include "helper.h"
int main() { std::cout << add(2, 3); }`,
        },
        trace: false,
      });
      expect(result.status).toBe("success");
      expect(result.stdout).toBe("5");
    }
  );

  it.skipIf(skipUnless(tools.compiler))(
    "runs two programs without mixing their output",
    async () => {
      const [left, right] = await Promise.all([
        compileAndRun({
          source: `#include <iostream>\nint main(){std::cout<<"left";}`,
          trace: false,
        }),
        compileAndRun({
          source: `#include <iostream>\nint main(){std::cout<<"right";}`,
          trace: false,
        }),
      ]);
      expect(left.status).toBe("success");
      expect(right.status).toBe("success");
      expect(left.stdout).toBe("left");
      expect(right.stdout).toBe("right");
    }
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
