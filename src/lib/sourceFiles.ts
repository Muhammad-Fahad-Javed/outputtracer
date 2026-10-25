import type { ClassroomLanguage } from "./classroom/languages";
// Validation for untrusted multi-file C++ submissions.
// Keep this free of I/O so it can be unit-tested without g++.

export const ALLOWED_SOURCE_EXTENSIONS = [
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
] as const;

const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidSourceFilename(name: string, language: ClassroomLanguage = "cpp"): boolean {
  if (typeof name !== "string" || name.length < 3 || name.length > 64) {
    return false;
  }
  if (
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith(".") ||
    name.startsWith("__")
  ) {
    return false;
  }
  if (!FILENAME_RE.test(name)) return false;
  const lower = name.toLowerCase();
  const extensions = language === "python" ? [".py"] : language === "asm8086" ? [".asm", ".inc"] : ALLOWED_SOURCE_EXTENSIONS;
  return extensions.some((ext) => lower.endsWith(ext));
}

export type SourceFilesOk = {
  ok: true;
  cppFiles: string[];
  totalBytes: number;
};

export type SourceFilesErr = {
  ok: false;
  title: string;
  message: string;
};

export function inspectSourceFiles(
  files: Record<string, string>,
  limits: { maxFiles: number; maxSourceBytes: number },
  language: ClassroomLanguage = "cpp"
): SourceFilesOk | SourceFilesErr {
  const names = Object.keys(files);
  if (names.length === 0) {
    return { ok: false, title: "No code", message: "Please enter source code." };
  }
  if (names.length > limits.maxFiles) {
    return {
      ok: false,
      title: "Too many files",
      message: `A submission may include at most ${limits.maxFiles} files.`,
    };
  }

  let totalBytes = 0;
  const cppFiles: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!isValidSourceFilename(filename, language)) {
      return {
        ok: false,
        title: "Invalid filename",
        message: `Rejected filename "${filename}". Use a simple name like ${language === "python" ? "main.py or helper.py" : language === "asm8086" ? "main.asm or HELPER.INC" : "main.cpp or helper.h"}.`,
      };
    }
    if (typeof content !== "string") {
      return {
        ok: false,
        title: "Invalid file",
        message: `File "${filename}" is not valid text.`,
      };
    }
    totalBytes += new TextEncoder().encode(content).byteLength;
    const lower = filename.toLowerCase();
    if (
      lower.endsWith(".cpp") ||
      lower.endsWith(".cc") ||
      lower.endsWith(".cxx") || (language === "python" && lower.endsWith(".py")) || (language === "asm8086" && lower.endsWith(".asm"))
    ) {
      cppFiles.push(filename);
    }
  }

  if (totalBytes > limits.maxSourceBytes) {
    return {
      ok: false,
      title: "Source too large",
      message: `Source exceeds the ${Math.floor(limits.maxSourceBytes / 1024)} KB limit.`,
    };
  }

  if (cppFiles.length === 0) {
    return {
      ok: false,
      title: language === "cpp" ? "No C++ source" : "No entry source",
      message: "Add an entry source file for the assignment language.",
    };
  }

  return { ok: true, cppFiles, totalBytes };
}
