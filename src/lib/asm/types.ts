// Type definitions for the 8086 NASM Assembly Lab engine

export interface CpuRegisters {
  ax: number; // 16-bit
  bx: number;
  cx: number;
  dx: number;
  sp: number;
  bp: number;
  si: number;
  di: number;
  ip: number;
  cs: number;
  ds: number;
  es: number;
  ss: number;
}

export interface CpuFlags {
  cf: boolean; // Carry Flag (bit 0)
  pf: boolean; // Parity Flag (bit 2)
  af: boolean; // Auxiliary Carry Flag (bit 4)
  zf: boolean; // Zero Flag (bit 6)
  sf: boolean; // Sign Flag (bit 7)
  tf: boolean; // Trap Flag (bit 8)
  if: boolean; // Interrupt Enable Flag (bit 9)
  df: boolean; // Direction Flag (bit 10)
  of: boolean; // Overflow Flag (bit 11)
}

export interface MemoryAccess {
  type: "read" | "write";
  physicalAddress: number;
  segment: number;
  offset: number;
  oldValue: number;
  newValue: number;
  size: 1 | 2;
}

export interface StackChange {
  type: "push" | "pop" | "modify";
  address: number;
  value: number;
  oldSp: number;
  newSp: number;
}

export interface CpuStateSnapshot {
  registers: CpuRegisters;
  flags: CpuFlags;
  instructionCount: number;
  halted: boolean;
  terminated: boolean;
  exitCode?: number;
  stdout: string;
}

export interface AsmSourceLocation {
  file: string;
  line: number;
  column?: number;
}

export interface AsmInstructionInfo {
  address: number; // Segment:offset or physical address
  segment: number;
  offset: number;
  bytes: number[];
  mnemonic: string;
  operandsText: string;
  disassembly: string;
  sourceLine?: number;
  sourceText?: string;
}

export interface AsmTraceStep {
  step: number;
  addressBefore: { segment: number; offset: number; physical: number };
  addressNext: { segment: number; offset: number; physical: number };
  instructionBytes: number[];
  mnemonic: string;
  operands: string;
  disassembly: string;
  sourceLine?: number;
  sourceText?: string;
  registersBefore: CpuRegisters;
  registersAfter: CpuRegisters;
  flagsBefore: CpuFlags;
  flagsAfter: CpuFlags;
  memoryReads: MemoryAccess[];
  memoryWrites: MemoryAccess[];
  stackChanges: StackChange[];
  stdoutDelta: string;
  stdoutTotal: string;
  halted: boolean;
  terminated: boolean;
  exitCode?: number;
  explanation?: string;
}

export interface AsmDiagnostic {
  type: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
  raw?: string;
}

export interface AssembleResult {
  success: boolean;
  binary: Uint8Array;
  loadAddress: { segment: number; offset: number };
  entryPoint: { segment: number; offset: number };
  sourceMap: Map<number, number>; // offset -> sourceLine
  lineToOffset: Map<number, number>; // sourceLine -> offset
  diagnostics: AsmDiagnostic[];
  listing?: string;
  engineUsed: "native-nasm" | "builtin-nasm-compat";
}

export interface AsmExecutionStatus {
  state: "ready" | "running" | "paused" | "halted" | "terminated" | "error";
  currentStep: number;
  totalSteps: number;
  currentInstruction?: AsmInstructionInfo;
  registers: CpuRegisters;
  flags: CpuFlags;
  stdout: string;
  exitCode?: number;
  error?: string;
  canStepForward: boolean;
  canStepBack: boolean;
}

export interface AsmExample {
  id: string;
  title: string;
  description: string;
  category: "Basics" | "Arithmetic & Flags" | "Loops & Arrays" | "Procedures & Stack" | "DOS Services";
  code: string;
  expectedOutput?: string;
}
