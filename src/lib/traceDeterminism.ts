// Heuristic detection of nondeterministic constructs in student C++.
//
// WHY THIS EXISTS
// The step-by-step trace is produced by running the program a *second* time
// under GDB (see gdbTracer.ts). The displayed program output comes from the
// first, normal run. If the program reads the clock, draws random numbers, or
// prints addresses, those two executions can legitimately disagree. Because we
// cannot cheaply make an arbitrary C++ program deterministic, we detect the
// common causes and label the trace so students know the two results may
// differ. The normal run output is the authoritative result.
//
// This is intentionally a conservative, source-level heuristic: it can
// over-report (a false positive just adds a note), and it never changes the
// program's behaviour.

import { ALLOWED_SOURCE_EXTENSIONS } from "./sourceFiles";

interface Pattern {
  re: RegExp;
  reason: string;
}

const PATTERNS: Pattern[] = [
  { re: /\bsrand\s*\(/, reason: "calls srand()" },
  { re: /\b(?:std::)?(?:rand|random)\s*\(/, reason: "draws a random number" },
  { re: /random_device/, reason: "uses std::random_device" },
  {
    re: /\b(?:std::)?(?:time|clock)\s*\(/,
    reason: "reads the clock (time()/clock())",
  },
  {
    re: /chrono::(?:system_clock|steady_clock|high_resolution_clock)|gettimeofday/,
    reason: "reads wall-clock time",
  },
  { re: /\bgetpid\s*\(/, reason: "reads the process id" },
  { re: /\/dev\/(?:u|a)?random/, reason: "reads /dev/urandom" },
  { re: /%p/, reason: "prints a pointer address (%p), which varies with ASLR" },
];

function sourceText(files: Record<string, string> | undefined): string {
  if (!files) return "";
  let out = "";
  for (const [name, content] of Object.entries(files)) {
    const lower = name.toLowerCase();
    if (
      ALLOWED_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext)) &&
      typeof content === "string"
    ) {
      out += content + "\n";
    }
  }
  return out;
}

// Returns a de-duplicated list of human-readable reasons the trace may differ
// from the normal run. Empty when nothing suspicious is found.
export function detectNondeterminism(
  files: Record<string, string> | undefined
): string[] {
  const text = sourceText(files);
  if (!text) return [];
  const reasons = new Set<string>();
  for (const { re, reason } of PATTERNS) {
    if (re.test(text)) reasons.add(reason);
  }
  return Array.from(reasons);
}

export function buildDeterminismNote(reasons: string[]): string {
  const list = reasons.join(", ");
  return (
    "This trace comes from a second, independent execution of your program, " +
    `which ${list}. Those values (and any output that depends on them) can ` +
    "differ from the run output above. The run output is the authoritative " +
    "result."
  );
}
