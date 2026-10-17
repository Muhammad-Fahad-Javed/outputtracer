import { describe, it, expect } from "vitest";
import {
  WORKSPACE_CONFIG,
  isValidTabForLanguage,
  sanitizeTabForLanguage,
} from "./workspaceConfig";

describe("Language Workspace Configuration & Strict Isolation", () => {
  describe("C++ Workspace", () => {
    const cppTabs = WORKSPACE_CONFIG.cpp.tabs.map((t) => t.id);

    it("includes standard C++ development tabs", () => {
      expect(cppTabs).toContain("output");
      expect(cppTabs).toContain("input");
      expect(cppTabs).toContain("trace");
      expect(cppTabs).toContain("debug");
      expect(cppTabs).toContain("variables");
    });

    it("strictly excludes DOSBox and all assembly inspection tabs", () => {
      expect(cppTabs).not.toContain("dosbox");
      expect(cppTabs).not.toContain("registers");
      expect(cppTabs).not.toContain("memory");
      expect(cppTabs).not.toContain("stack");
      expect(cppTabs).not.toContain("instructionHelp");
    });

    it("has 'output' as defaultTab", () => {
      expect(WORKSPACE_CONFIG.cpp.defaultTab).toBe("output");
    });
  });

  describe("Python Workspace", () => {
    const pythonTabs = WORKSPACE_CONFIG.python.tabs.map((t) => t.id);

    it("includes standard Python development tabs", () => {
      expect(pythonTabs).toContain("output");
      expect(pythonTabs).toContain("input");
      expect(pythonTabs).toContain("trace");
      expect(pythonTabs).toContain("debug");
      expect(pythonTabs).toContain("variables");
    });

    it("strictly excludes DOSBox and all assembly inspection tabs", () => {
      expect(pythonTabs).not.toContain("dosbox");
      expect(pythonTabs).not.toContain("registers");
      expect(pythonTabs).not.toContain("memory");
      expect(pythonTabs).not.toContain("stack");
      expect(pythonTabs).not.toContain("instructionHelp");
    });

    it("has 'output' as defaultTab", () => {
      expect(WORKSPACE_CONFIG.python.defaultTab).toBe("output");
    });
  });

  describe("Assembly Workspace", () => {
    const asmTabs = WORKSPACE_CONFIG.assembly.tabs.map((t) => t.id);

    it("includes DOSBox and assembly inspection tabs", () => {
      expect(asmTabs).toContain("dosbox");
      expect(asmTabs).toContain("registers");
      expect(asmTabs).toContain("memory");
      expect(asmTabs).toContain("stack");
      expect(asmTabs).toContain("trace");
      expect(asmTabs).toContain("instructionHelp");
      expect(asmTabs).toContain("output");
      expect(asmTabs).toContain("input");
    });

    it("has 'dosbox' as defaultTab", () => {
      expect(WORKSPACE_CONFIG.assembly.defaultTab).toBe("dosbox");
    });
  });

  describe("isValidTabForLanguage validation", () => {
    it("rejects DOSBox for C++ and Python", () => {
      expect(isValidTabForLanguage("cpp", "dosbox")).toBe(false);
      expect(isValidTabForLanguage("python", "dosbox")).toBe(false);
      expect(isValidTabForLanguage("assembly", "dosbox")).toBe(true);
    });

    it("rejects assembly-specific inspection tabs for C++ and Python", () => {
      expect(isValidTabForLanguage("cpp", "registers")).toBe(false);
      expect(isValidTabForLanguage("python", "registers")).toBe(false);
      expect(isValidTabForLanguage("cpp", "memory")).toBe(false);
      expect(isValidTabForLanguage("python", "stack")).toBe(false);
      expect(isValidTabForLanguage("cpp", "instructionHelp")).toBe(false);
    });

    it("accepts shared tabs where configured", () => {
      expect(isValidTabForLanguage("cpp", "output")).toBe(true);
      expect(isValidTabForLanguage("python", "output")).toBe(true);
      expect(isValidTabForLanguage("assembly", "output")).toBe(true);
      expect(isValidTabForLanguage("cpp", "trace")).toBe(true);
      expect(isValidTabForLanguage("python", "trace")).toBe(true);
      expect(isValidTabForLanguage("assembly", "trace")).toBe(true);
    });
  });

  describe("sanitizeTabForLanguage state transition sanitization", () => {
    it("sanitizes 'dosbox' to 'output' when switching to C++ or Python", () => {
      expect(sanitizeTabForLanguage("cpp", "dosbox")).toBe("output");
      expect(sanitizeTabForLanguage("python", "dosbox")).toBe("output");
    });

    it("sanitizes 'registers', 'memory', 'stack' to 'output' when switching to C++ or Python", () => {
      expect(sanitizeTabForLanguage("cpp", "registers")).toBe("output");
      expect(sanitizeTabForLanguage("python", "memory")).toBe("output");
      expect(sanitizeTabForLanguage("cpp", "stack")).toBe("output");
    });

    it("preserves valid tabs across languages", () => {
      expect(sanitizeTabForLanguage("cpp", "output")).toBe("output");
      expect(sanitizeTabForLanguage("python", "output")).toBe("output");
      expect(sanitizeTabForLanguage("assembly", "output")).toBe("output");
      expect(sanitizeTabForLanguage("python", "input")).toBe("input");
    });

    it("resets to defaultTab when tab does not exist in target language", () => {
      expect(sanitizeTabForLanguage("assembly", "debug")).toBe("dosbox");
      expect(sanitizeTabForLanguage("assembly", "variables")).toBe("dosbox");
    });
  });
});
