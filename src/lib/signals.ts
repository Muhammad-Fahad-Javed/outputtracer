// Human-readable descriptions for the POSIX signals a user's C++ program is
// realistically going to terminate with. Node reports the signal name
// (e.g. "SIGSEGV") on the ChildProcess exit event; we translate that into
// something a learner will actually understand.
const SIGNAL_MESSAGES: Record<string, string> = {
  SIGSEGV: "Segmentation fault — the program accessed invalid memory (e.g. a null or dangling pointer).",
  SIGABRT: "Aborted — the program called abort() (often from an assertion failure, an unhandled exception, or a detected memory-corruption).",
  SIGFPE: "Floating point exception — likely an integer division by zero or an invalid arithmetic operation.",
  SIGILL: "Illegal instruction — the program executed a malformed or unsupported CPU instruction.",
  SIGBUS: "Bus error — the program made an invalid memory access (often misaligned memory or a bad mmap).",
  SIGKILL: "The process was terminated (killed) — most likely for exceeding a resource limit.",
  SIGTERM: "The process was terminated.",
  SIGXCPU: "CPU time limit exceeded.",
  SIGXFSZ: "File size limit exceeded.",
};

export function describeSignal(signal: string | null | undefined): string {
  if (!signal) return "The program terminated abnormally.";
  return SIGNAL_MESSAGES[signal] || `The program was terminated by signal ${signal}.`;
}
