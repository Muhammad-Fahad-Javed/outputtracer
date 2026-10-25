import { describe, it, expect, vi } from "vitest";
import { CLASSROOM_LANGUAGES, classroomLanguage } from "./languages";
import { inspectSourceFiles } from "@/lib/sourceFiles";
import { seedDoc, readFiles } from "@/lib/cloud/collabDoc";
import * as Y from "yjs";
import { runInSandbox } from "./executionClient";

describe("classroom language boundaries", () => {
  it("derives a legacy classroom default from its subject", () => {
    expect(classroomLanguage(undefined, "8086 NASM")).toBe("asm8086");
    expect(classroomLanguage(undefined, "Python")).toBe("python");
    expect(classroomLanguage("cpp", "Assembly")).toBe("cpp");
  });
  for (const language of ["cpp", "python", "asm8086"] as const) {
    it(`seeds and validates ${language} without losing its entry file`, () => {
      const c = CLASSROOM_LANGUAGES[language];
      const doc = new Y.Doc();
      seedDoc(doc, { [c.file]: c.starter });
      expect(readFiles(doc)[c.file]).toBe(c.starter);
      expect(inspectSourceFiles(readFiles(doc), { maxFiles: 16, maxSourceBytes: 200000 }, language).ok).toBe(true);
      doc.destroy();
    });
  }
  it("rejects cross-language source and traversal", () => {
    const limits = { maxFiles: 16, maxSourceBytes: 200000 };
    expect(inspectSourceFiles({ "main.cpp": "x" }, limits, "asm8086").ok).toBe(false);
    expect(inspectSourceFiles({ "../main.py": "x" }, limits, "python").ok).toBe(false);
  });
  it("requires browser DOSBox for NASM without sending source to the C++ endpoint", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(runInSandbox({ language: "asm8086", files: { "main.asm": "org 100h\nmov ax, 4c00h\nint 21h\n" } })).rejects.toMatchObject({ kind: "sandbox_unavailable", message: expect.stringContaining("browser DOSBox") });
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});
