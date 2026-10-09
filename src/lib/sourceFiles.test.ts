import { describe, expect, it } from "vitest";
import { inspectSourceFiles, isValidSourceFilename } from "./sourceFiles";

const limits = { maxFiles: 16, maxSourceBytes: 200 * 1024 };

describe("isValidSourceFilename", () => {
  it("accepts simple C++ names", () => {
    expect(isValidSourceFilename("main.cpp")).toBe(true);
    expect(isValidSourceFilename("helper.h")).toBe(true);
    expect(isValidSourceFilename("util.hpp")).toBe(true);
    expect(isValidSourceFilename("foo.cc")).toBe(true);
  });

  it("rejects path traversal and hidden/internal names", () => {
    expect(isValidSourceFilename("../main.cpp")).toBe(false);
    expect(isValidSourceFilename("a/b.cpp")).toBe(false);
    expect(isValidSourceFilename(".env.cpp")).toBe(false);
    expect(isValidSourceFilename("__trace.cpp")).toBe(false);
    expect(isValidSourceFilename("main.cpp.txt")).toBe(false);
    expect(isValidSourceFilename("")).toBe(false);
  });
});

describe("inspectSourceFiles", () => {
  it("requires at least one translation unit", () => {
    const result = inspectSourceFiles({ "only.h": "int x;" }, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toBe("No C++ source");
  });

  it("rejects oversized submissions", () => {
    const result = inspectSourceFiles(
      { "main.cpp": "int main(){}" },
      { maxFiles: 16, maxSourceBytes: 4 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toBe("Source too large");
  });

  it("rejects too many files", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) files[`f${i}.cpp`] = "int main(){}";
    const result = inspectSourceFiles(files, { maxFiles: 2, maxSourceBytes: 10_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toBe("Too many files");
  });

  it("accepts a valid multi-file project", () => {
    const result = inspectSourceFiles(
      {
        "main.cpp": "#include \"h.h\"\nint main(){return 0;}",
        "h.h": "int n = 1;",
      },
      limits
    );
    expect(result).toMatchObject({ ok: true, cppFiles: ["main.cpp"] });
  });
});
