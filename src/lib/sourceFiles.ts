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

export function isValidSourceFilename(name: string): boolean {
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
  return ALLOWED_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
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
  limits: { maxFiles: number; maxSourceBytes: number }
): SourceFilesOk | SourceFilesErr {
  const names = Object.keys(files);
  if (names.length === 0) {
    return { ok: false, title: "No code", message: "Please enter C++ code." };
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
    if (!isValidSourceFilename(filename)) {
      return {
        ok: false,
        title: "Invalid filename",
        message: `Rejected filename "${filename}". Use a simple name like main.cpp or helper.h.`,
      };
    }
    if (typeof content !== "string") {
      return {
        ok: false,
        title: "Invalid file",
        message: `File "${filename}" is not valid text.`,
      };
    }
    totalBytes += Buffer.byteLength(content, "utf8");
    const lower = filename.toLowerCase();
    if (
      lower.endsWith(".cpp") ||
      lower.endsWith(".cc") ||
      lower.endsWith(".cxx")
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
      title: "No C++ source",
      message: "Add at least one .cpp file to compile.",
    };
  }

  return { ok: true, cppFiles, totalBytes };
}
