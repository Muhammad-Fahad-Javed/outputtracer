import { describe, expect, it } from "vitest";
import { PROJECT_LANGUAGES, projectLanguage, projectLanguageLabel, projectStandard } from "./projectLanguage";

describe("saved project language metadata", () => {
  it("keeps legacy C++ projects while refusing unknown runtimes", () => {
    expect(projectLanguage(undefined)).toBe("cpp");
    expect(projectLanguage(null)).toBe("cpp");
    expect(() => projectLanguage("javascript")).toThrow("not supported");
    expect(() => projectLanguage("assembly")).toThrow("not supported");
  });
  it("pairs every language with its correct source file, editor and starter", () => {
    expect(PROJECT_LANGUAGES.cpp.file).toBe("main.cpp");
    expect(PROJECT_LANGUAGES.python.file).toBe("main.py");
    expect(PROJECT_LANGUAGES.python.starter).toContain("def main");
    expect(PROJECT_LANGUAGES.asm8086.file).toBe("main.asm");
    expect(PROJECT_LANGUAGES.asm8086.starter).toContain("org 100h");
  });
  it("exposes C++ standards only for C++ workspaces", () => {
    expect(projectStandard("cpp", null)).toBe("c++17");
    expect(projectStandard("cpp", "c++20")).toBe("c++20");
    expect(() => projectStandard("cpp", "python")).toThrow("supported C++");
    expect(projectStandard("python", "c++17")).toBeNull();
    expect(projectStandard("asm8086", "c++17")).toBeNull();
    expect(projectLanguageLabel("cpp", "c++23")).toBe("C++ · c++23");
    expect(projectLanguageLabel("python", "c++17")).toBe("Python 3");
    expect(projectLanguageLabel("asm8086", "c++17")).toBe("8086 Assembly (NASM)");
  });
});
