export type SupportedLanguage = "cpp" | "python" | "assembly";

export type WorkspaceTabId =
  | "console"
  | "output"
  | "input"
  | "trace"
  | "debug"
  | "variables"
  | "dosbox"
  | "registers"
  | "memory"
  | "stack"
  | "instructionHelp";

export interface WorkspaceTabMeta {
  id: WorkspaceTabId;
  label: string;
}

export interface LanguageWorkspaceConfig {
  language: SupportedLanguage;
  label: string;
  defaultFile: string;
  monacoLanguage: string;
  tabs: WorkspaceTabMeta[];
  defaultTab: WorkspaceTabId;
}

/**
 * Centralized, authoritative workspace mapping per language.
 *
 * Strict boundary rules:
 * - DOSBox is EXCLUSIVELY available in Assembly mode.
 * - Assembly-only inspection tabs (Registers, Memory, Stack, Instruction Help, DOSBox)
 *   are NEVER rendered or active in C++ or Python mode.
 * - Console is the interactive program terminal in every language.
 * - C++ and Python share standard Output, Input, Trace, Debug, and Variables tabs.
 */
export const WORKSPACE_CONFIG: Record<SupportedLanguage, LanguageWorkspaceConfig> = {
  cpp: {
    language: "cpp",
    label: "C++",
    defaultFile: "main.cpp",
    monacoLanguage: "cpp",
    tabs: [
      { id: "console", label: "Console" },
      { id: "output", label: "Output" },
      { id: "input", label: "Input" },
      { id: "trace", label: "Trace" },
      { id: "debug", label: "Debug" },
      { id: "variables", label: "Variables" },
    ],
    defaultTab: "console",
  },
  python: {
    language: "python",
    label: "Python 3",
    defaultFile: "main.py",
    monacoLanguage: "python",
    tabs: [
      { id: "console", label: "Console" },
      { id: "output", label: "Output" },
      { id: "input", label: "Input" },
      { id: "trace", label: "Trace" },
      { id: "debug", label: "Debug" },
      { id: "variables", label: "Variables" },
    ],
    defaultTab: "console",
  },
  assembly: {
    language: "assembly",
    label: "8086 Assembly (NASM)",
    defaultFile: "main.asm",
    monacoLanguage: "nasm",
    tabs: [
      { id: "console", label: "Console" },
      { id: "output", label: "Output" },
      { id: "dosbox", label: "DOSBox" },
      { id: "registers", label: "Registers" },
      { id: "memory", label: "Memory" },
      { id: "stack", label: "Stack" },
      { id: "trace", label: "Trace" },
      { id: "input", label: "Input" },
      { id: "instructionHelp", label: "Instruction Help" },
    ],
    defaultTab: "console",
  },
};

export function isValidTabForLanguage(lang: SupportedLanguage, tab: WorkspaceTabId): boolean {
  return WORKSPACE_CONFIG[lang].tabs.some((t) => t.id === tab);
}

export function sanitizeTabForLanguage(
  lang: SupportedLanguage,
  tab: WorkspaceTabId
): WorkspaceTabId {
  if (isValidTabForLanguage(lang, tab)) {
    return tab;
  }
  return WORKSPACE_CONFIG[lang].defaultTab;
}
