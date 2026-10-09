import { describe, expect, it } from "vitest";
import { compileAndRun } from "./cppRunner";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function hasGxx(): Promise<boolean> {
  try {
    await execFileAsync("g++", ["--version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

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

  it("compiles and runs a hello-world when g++ is installed", async () => {
    if (!(await hasGxx())) return;
    const result = await compileAndRun({
      source: `#include <iostream>
int main() { std::cout << "ok"; return 0; }`,
    });
    expect(result.status).toBe("success");
    expect(result.stdout).toBe("ok");
  });

  it("times out infinite loops", async () => {
    if (!(await hasGxx())) return;
    const result = await compileAndRun({
      source: "int main() { for(;;) {} }",
    });
    expect(result.status).toBe("timeout");
  }, 20_000);

  it("kills programs that spam stdout", async () => {
    if (!(await hasGxx())) return;
    const result = await compileAndRun({
      source: `#include <iostream>
int main() { while (true) std::cout << "aaaaaaaaaaaaaaaaaaaaaaaa"; }`,
    });
    expect(["output_limit", "timeout"]).toContain(result.status);
  }, 20_000);
});
