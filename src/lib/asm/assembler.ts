// Built-in NASM-compatible 16-bit 8086 assembler
// Produces 16-bit flat binary (.COM) and provides precise source line mapping.

import { AssembleResult, AsmDiagnostic } from "./types";

const REG16_MAP: Record<string, number> = {
  ax: 0, cx: 1, dx: 2, bx: 3, sp: 4, bp: 5, si: 6, di: 7,
};

const REG8_MAP: Record<string, number> = {
  al: 0, cl: 1, dl: 2, bl: 3, ah: 4, ch: 5, dh: 6, bh: 7,
};

const SEG_REG_MAP: Record<string, number> = {
  es: 0, cs: 1, ss: 2, ds: 3,
};

const KNOWN_KEYWORDS = new Set<string>([
  "org", "equ", "db", "dw", "dd", "resb", "resw", "resd", "times",
  "bits", "section", "segment", "global", "extern", "cpu", "default",
  "jmp", "call", "ret", "retf", "retn", "int", "int3", "into", "iret",
  "loop", "loope", "loopz", "loopne", "loopnz", "jcxz",
  "jo", "jno", "jb", "jc", "jnae", "jae", "jnb", "jnc", "jz", "je",
  "jnz", "jne", "jbe", "jna", "ja", "jnbe", "js", "jns", "jp", "jpe",
  "jnp", "jpo", "jl", "jnge", "jge", "jnl", "jle", "jng", "jg", "jnle",
  "mov", "push", "pop", "pushf", "popf", "xchg", "lea", "lds", "les",
  "lahf", "sahf", "in", "out", "xlat", "xlatb",
  "add", "adc", "sub", "sbb", "cmp", "neg", "inc", "dec",
  "mul", "imul", "div", "idiv", "cbw", "cwd",
  "not", "and", "or", "xor", "test",
  "shl", "shr", "sar", "rol", "ror", "rcl", "rcr", "sal",
  "clc", "stc", "cmc", "cld", "std", "cli", "sti",
  "nop", "hlt", "wait", "lock",
]);

interface MemoryOperand {
  baseReg?: string; // 'bx' or 'bp'
  indexReg?: string; // 'si' or 'di'
  disp: number;
  hasDisp: boolean;
  size?: 1 | 2; // 1 = byte, 2 = word
  segmentOverride?: string; // 'es', 'cs', 'ss', 'ds'
  rawText: string;
}

type Operand =
  | { type: "reg16"; reg: string; code: number }
  | { type: "reg8"; reg: string; code: number }
  | { type: "segreg"; reg: string; code: number }
  | { type: "mem"; mem: MemoryOperand }
  | { type: "imm"; value: number; raw: string };

interface ParsedLine {
  lineNumber: number;
  originalText: string;
  label?: string;
  mnemonic?: string;
  operandsText?: string;
  operands: Operand[];
  directive?: string;
  directiveArgs?: string;
}

export function parseNumber(raw: string, symbols: Map<string, number> = new Map(), currentOffset = 0): number | null {
  let s = raw.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let matchAll = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) {
        matchAll = false;
        break;
      }
    }
    if (matchAll) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }

  if (s === "$") return currentOffset;
  if (s === "$$") return 0x0100; // default start for COM

  // Hexadecimal: 0x12, 12h, 012h
  if (/^0x[0-9a-fA-F]+$/i.test(s)) {
    return parseInt(s.slice(2), 16);
  }
  if (/^[0-9][0-9a-fA-F]*h$/i.test(s)) {
    return parseInt(s.slice(0, -1), 16);
  }
  // Binary: 0b101, 101b
  if (/^0b[01]+$/i.test(s)) {
    return parseInt(s.slice(2), 2);
  }
  if (/^[01]+b$/i.test(s)) {
    return parseInt(s.slice(0, -1), 2);
  }
  // Character literal: 'A', "A"
  if ((s.startsWith("'") && s.endsWith("'") && s.length === 3) ||
      (s.startsWith('"') && s.endsWith('"') && s.length === 3)) {
    return s.charCodeAt(1);
  }
  // Decimal
  if (/^-?[0-9]+$/.test(s)) {
    return parseInt(s, 10);
  }

  // Symbol reference
  if (symbols.has(s.toLowerCase())) {
    return symbols.get(s.toLowerCase())!;
  }

  // Top-level + or -
  let depth = 0;
  for (let i = s.length - 1; i > 0; i--) {
    const c = s[i];
    if (c === ")") depth++;
    else if (c === "(") depth--;
    else if (depth === 0 && (c === "+" || c === "-")) {
      const leftStr = s.slice(0, i).trim();
      const rightStr = s.slice(i + 1).trim();
      if (leftStr && rightStr) {
        const left = parseNumber(leftStr, symbols, currentOffset);
        const right = parseNumber(rightStr, symbols, currentOffset);
        if (left !== null && right !== null) {
          return c === "+" ? left + right : left - right;
        }
      }
    }
  }

  return null;
}

function parseMemoryOperand(
  text: string,
  symbols: Map<string, number>,
  currentOffset: number,
  size?: 1 | 2
): MemoryOperand | null {
  let inner = text.trim();
  let segmentOverride: string | undefined;

  // Check segment override e.g. es:[di]
  const segPrefixMatch = inner.match(/^(es|cs|ss|ds)\s*:\s*\[(.+)\]$/i);
  if (segPrefixMatch) {
    segmentOverride = segPrefixMatch[1].toLowerCase();
    inner = `[${segPrefixMatch[2]}]`;
  }

  if (!inner.startsWith("[") || !inner.endsWith("]")) {
    return null;
  }
  inner = inner.slice(1, -1).trim();

  // If internal segment override e.g. [es:di]
  const innerSegMatch = inner.match(/^(es|cs|ss|ds)\s*:\s*(.+)$/i);
  if (innerSegMatch) {
    segmentOverride = innerSegMatch[1].toLowerCase();
    inner = innerSegMatch[2].trim();
  }

  // Tokens by + or -
  // Example: bx+si+10, bx+4, bp-2, table+2, si, 100h
  let baseReg: string | undefined;
  let indexReg: string | undefined;
  let disp = 0;
  let hasDisp = false;

  // Split on + or - while keeping signs
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "+" || c === "-") {
      if (cur.trim()) parts.push(cur.trim());
      cur = c;
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur.trim());

  for (const part of parts) {
    let clean = part.trim();
    let sign = 1;
    if (clean.startsWith("+")) {
      clean = clean.slice(1).trim();
    } else if (clean.startsWith("-")) {
      sign = -1;
      clean = clean.slice(1).trim();
    }

    const lower = clean.toLowerCase();
    if (lower === "bx" || lower === "bp") {
      if (baseReg) return null;
      baseReg = lower;
    } else if (lower === "si" || lower === "di") {
      if (indexReg) return null;
      indexReg = lower;
    } else {
      const num = parseNumber(clean, symbols, currentOffset);
      if (num !== null) {
        disp += sign * num;
        hasDisp = true;
      } else {
        // Unknown symbol or label in pass 1
        hasDisp = true;
      }
    }
  }

  return {
    baseReg,
    indexReg,
    disp,
    hasDisp: hasDisp || (!baseReg && !indexReg),
    size,
    segmentOverride,
    rawText: text,
  };
}

function parseOperand(
  text: string,
  symbols: Map<string, number>,
  currentOffset: number
): Operand | null {
  let clean = text.trim();
  let explicitSize: 1 | 2 | undefined;

  if (/^byte\s+(?:ptr\s+)?/i.test(clean)) {
    explicitSize = 1;
    clean = clean.replace(/^byte\s+(?:ptr\s+)?/i, "").trim();
  } else if (/^word\s+(?:ptr\s+)?/i.test(clean)) {
    explicitSize = 2;
    clean = clean.replace(/^word\s+(?:ptr\s+)?/i, "").trim();
  }

  const lower = clean.toLowerCase();

  // Register 16-bit
  if (lower in REG16_MAP) {
    return { type: "reg16", reg: lower, code: REG16_MAP[lower] };
  }
  // Register 8-bit
  if (lower in REG8_MAP) {
    return { type: "reg8", reg: lower, code: REG8_MAP[lower] };
  }
  // Segment Register
  if (lower in SEG_REG_MAP) {
    return { type: "segreg", reg: lower, code: SEG_REG_MAP[lower] };
  }

  // Memory
  if (clean.startsWith("[") || clean.includes(":[") || /^(es|cs|ss|ds):/i.test(clean)) {
    const mem = parseMemoryOperand(clean, symbols, currentOffset, explicitSize);
    if (mem) return { type: "mem", mem };
  }

  // Immediate or Label reference
  const num = parseNumber(clean, symbols, currentOffset);
  return {
    type: "imm",
    value: num ?? 0,
    raw: clean,
  };
}

function encodeModRM(regOrOpcode: number, mem: MemoryOperand): number[] {
  let rm = 0;
  const { baseReg, indexReg, disp, hasDisp } = mem;

  if (baseReg === "bx" && indexReg === "si") rm = 0;
  else if (baseReg === "bx" && indexReg === "di") rm = 1;
  else if (baseReg === "bp" && indexReg === "si") rm = 2;
  else if (baseReg === "bp" && indexReg === "di") rm = 3;
  else if (!baseReg && indexReg === "si") rm = 4;
  else if (!baseReg && indexReg === "di") rm = 5;
  else if (baseReg === "bp" && !indexReg) rm = 6;
  else if (baseReg === "bx" && !indexReg) rm = 7;
  else if (!baseReg && !indexReg) {
    // Direct addressing [disp16]: mod = 00, rm = 110
    const d16 = disp & 0xffff;
    return [(0 << 6) | ((regOrOpcode & 7) << 3) | 6, d16 & 0xff, (d16 >> 8) & 0xff];
  } else {
    // Unsupported addressing combination
    throw new Error(`Unsupported 8086 addressing mode: ${mem.rawText}`);
  }

  // Determine mod
  if (baseReg === "bp" && !indexReg && (!hasDisp || disp === 0)) {
    // [bp] without disp must be encoded as [bp+0] (mod=01, disp=00)
    return [(1 << 6) | ((regOrOpcode & 7) << 3) | rm, 0];
  }

  if (!hasDisp || disp === 0) {
    // mod = 00
    return [(0 << 6) | ((regOrOpcode & 7) << 3) | rm];
  } else if (disp >= -128 && disp <= 127) {
    // mod = 01 (disp8)
    return [(1 << 6) | ((regOrOpcode & 7) << 3) | rm, disp & 0xff];
  } else {
    // mod = 10 (disp16)
    const d16 = disp & 0xffff;
    return [(2 << 6) | ((regOrOpcode & 7) << 3) | rm, d16 & 0xff, (d16 >> 8) & 0xff];
  }
}

function getSegmentPrefix(seg?: string): number[] {
  if (!seg) return [];
  switch (seg.toLowerCase()) {
    case "es": return [0x26];
    case "cs": return [0x2e];
    case "ss": return [0x36];
    case "ds": return [0x3e];
    default: return [];
  }
}

export function assemble8086(source: string): AssembleResult {
  const diagnostics: AsmDiagnostic[] = [];
  const sourceMap = new Map<number, number>();
  const lineToOffset = new Map<number, number>();
  const symbols = new Map<string, number>();

  let org = 0x0100; // Standard COM start
  let currentOffset = org;

  const rawLines = source.split("\n");
  const parsedLines: ParsedLine[] = [];

  // Pass 0: Preprocess lines, handle ORG, EQU, and strip comments
  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    let line = rawLines[i];

    // Strip comments
    const commentIdx = line.indexOf(";");
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }
    line = line.trim();
    if (!line) continue;

    // Check bracketed [org 100h] or org 100h
    const orgMatch = line.match(/^\[?\s*org\s+([^\]]+)\]?$/i);
    if (orgMatch) {
      const parsedOrg = parseNumber(orgMatch[1]);
      if (parsedOrg !== null) {
        org = parsedOrg;
        currentOffset = org;
      }
      continue;
    }

    // Check EQU
    const equMatch = line.match(/^([a-zA-Z0-9_$.]+)\s+equ\s+(.+)$/i);
    if (equMatch) {
      const val = parseNumber(equMatch[2], symbols, currentOffset);
      if (val !== null) {
        symbols.set(equMatch[1].toLowerCase(), val);
      }
      continue;
    }

    // Check labels: label: or label (if followed by instruction/directive)
    let label: string | undefined;
    const labelMatch = line.match(/^([a-zA-Z0-9_$.]+):(.*)$/);
    if (labelMatch) {
      label = labelMatch[1].trim();
      line = labelMatch[2].trim();
    } else {
      const spaceIdx = line.search(/\s/);
      const firstWord = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toLowerCase();
      if (!KNOWN_KEYWORDS.has(firstWord) && /^[a-zA-Z0-9_$.]+$/.test(firstWord)) {
        label = firstWord;
        line = spaceIdx === -1 ? "" : line.slice(spaceIdx).trim();
      }
    }

    // Split mnemonic and operands
    let mnemonic: string | undefined;
    let operandsText: string | undefined;

    if (line) {
      const spaceIdx = line.search(/\s/);
      if (spaceIdx === -1) {
        mnemonic = line.toLowerCase();
      } else {
        mnemonic = line.slice(0, spaceIdx).toLowerCase();
        operandsText = line.slice(spaceIdx).trim();
      }
    }

    parsedLines.push({
      lineNumber,
      originalText: rawLines[i],
      label,
      mnemonic,
      operandsText,
      operands: [],
    });
  }

  // Pass 1: Collect labels and compute offsets
  function assembleInstruction(
    p: ParsedLine,
    pass: 1 | 2,
    offset: number
  ): number[] {
    const m = p.mnemonic;
    if (!m) return [];

    // Parse directives: DB, DW, RESB, etc.
    if (m === "db") {
      const bytes: number[] = [];
      const parts = splitOperands(p.operandsText || "");
      for (const part of parts) {
        const trimmed = part.trim();
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          const str = trimmed.slice(1, -1);
          for (let c = 0; c < str.length; c++) {
            bytes.push(str.charCodeAt(c) & 0xff);
          }
        } else {
          const val = parseNumber(trimmed, symbols, offset);
          bytes.push((val ?? 0) & 0xff);
        }
      }
      return bytes;
    }

    if (m === "dw") {
      const bytes: number[] = [];
      const parts = splitOperands(p.operandsText || "");
      for (const part of parts) {
        const val = parseNumber(part, symbols, offset) ?? 0;
        bytes.push(val & 0xff, (val >> 8) & 0xff);
      }
      return bytes;
    }

    if (m === "resb") {
      const count = parseNumber(p.operandsText || "", symbols, offset) ?? 1;
      return new Array(count).fill(0);
    }

    if (m === "resw") {
      const count = parseNumber(p.operandsText || "", symbols, offset) ?? 1;
      return new Array(count * 2).fill(0);
    }

    if (m === "times") {
      const text = (p.operandsText || "").trim();
      const spaceIdx = text.search(/\s/);
      if (spaceIdx === -1) {
        diagnostics.push({
          type: "error",
          message: `Invalid times syntax: '${text}'`,
          line: p.lineNumber,
        });
        return [];
      }
      const countExpr = text.slice(0, spaceIdx).trim();
      const restInstruction = text.slice(spaceIdx).trim();
      const count = parseNumber(countExpr, symbols, offset) ?? 0;
      if (count <= 0) return [];

      let subMnemonic: string;
      let subOperandsText: string | undefined;
      const subSpaceIdx = restInstruction.search(/\s/);
      if (subSpaceIdx === -1) {
        subMnemonic = restInstruction.toLowerCase();
      } else {
        subMnemonic = restInstruction.slice(0, subSpaceIdx).toLowerCase();
        subOperandsText = restInstruction.slice(subSpaceIdx).trim();
      }

      const subLine: ParsedLine = {
        lineNumber: p.lineNumber,
        originalText: p.originalText,
        mnemonic: subMnemonic,
        operandsText: subOperandsText,
        operands: [],
      };

      const bytes: number[] = [];
      let curSubOff = offset;
      for (let c = 0; c < count; c++) {
        const b = assembleInstruction(subLine, pass, curSubOff);
        bytes.push(...b);
        curSubOff += b.length;
      }
      return bytes;
    }

    // Directives to ignore safely
    if (["bits", "section", "segment", "global", "extern", "cpu"].includes(m)) {
      return [];
    }

    // Parse instruction operands
    const rawOps = splitOperands(p.operandsText || "");
    const ops: Operand[] = rawOps
      .map((t) => parseOperand(t, symbols, offset))
      .filter((o): o is Operand => o !== null);

    // Encode instructions
    switch (m) {
      case "nop":
        return [0x90];

      case "hlt":
        return [0xf4];

      case "int": {
        const intNum = ops[0]?.type === "imm" ? ops[0].value : 0x21;
        if (intNum === 3) return [0xcc];
        return [0xcd, intNum & 0xff];
      }

      case "int3":
        return [0xcc];

      case "clc": return [0xf8];
      case "stc": return [0xf9];
      case "cli": return [0xfa];
      case "sti": return [0xfb];
      case "cld": return [0xfc];
      case "std": return [0xfd];
      case "cmc": return [0xf5];

      case "pushf": return [0x9c];
      case "popf": return [0x9d];

      case "push": {
        const op = ops[0];
        if (op?.type === "reg16") return [0x50 + op.code];
        if (op?.type === "segreg") {
          const segCodes = [0x06, 0x0e, 0x16, 0x1e]; // ES, CS, SS, DS
          return [segCodes[op.code]];
        }
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          return [...pref, 0xff, ...encodeModRM(6, op.mem)];
        }
        break;
      }

      case "pop": {
        const op = ops[0];
        if (op?.type === "reg16") return [0x58 + op.code];
        if (op?.type === "segreg") {
          const segCodes = [0x07, 0x00, 0x17, 0x1f]; // ES, (no CS), SS, DS
          return [segCodes[op.code]];
        }
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          return [...pref, 0x8f, ...encodeModRM(0, op.mem)];
        }
        break;
      }

      case "inc": {
        const op = ops[0];
        if (op?.type === "reg16") return [0x40 + op.code];
        if (op?.type === "reg8") return [0xfe, (3 << 6) | (0 << 3) | op.code];
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          const opcode = op.mem.size === 1 ? 0xfe : 0xff;
          return [...pref, opcode, ...encodeModRM(0, op.mem)];
        }
        break;
      }

      case "dec": {
        const op = ops[0];
        if (op?.type === "reg16") return [0x48 + op.code];
        if (op?.type === "reg8") return [0xfe, (3 << 6) | (1 << 3) | op.code];
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          const opcode = op.mem.size === 1 ? 0xfe : 0xff;
          return [...pref, opcode, ...encodeModRM(1, op.mem)];
        }
        break;
      }

      case "neg": {
        const op = ops[0];
        if (op?.type === "reg8") return [0xf6, (3 << 6) | (3 << 3) | op.code];
        if (op?.type === "reg16") return [0xf7, (3 << 6) | (3 << 3) | op.code];
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          const opcode = op.mem.size === 1 ? 0xf6 : 0xf7;
          return [...pref, opcode, ...encodeModRM(3, op.mem)];
        }
        break;
      }

      case "not": {
        const op = ops[0];
        if (op?.type === "reg8") return [0xf6, (3 << 6) | (2 << 3) | op.code];
        if (op?.type === "reg16") return [0xf7, (3 << 6) | (2 << 3) | op.code];
        if (op?.type === "mem") {
          const pref = getSegmentPrefix(op.mem.segmentOverride);
          const opcode = op.mem.size === 1 ? 0xf6 : 0xf7;
          return [...pref, opcode, ...encodeModRM(2, op.mem)];
        }
        break;
      }

      case "lea": {
        const [dst, src] = ops;
        if (dst?.type === "reg16" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, 0x8d, ...encodeModRM(dst.code, src.mem)];
        }
        break;
      }

      case "xchg": {
        const [dst, src] = ops;
        if (dst?.type === "reg16" && src?.type === "reg16") {
          if (dst.code === 0) return [0x90 + src.code];
          if (src.code === 0) return [0x90 + dst.code];
          return [0x87, (3 << 6) | (dst.code << 3) | src.code];
        }
        if (dst?.type === "reg8" && src?.type === "reg8") {
          return [0x86, (3 << 6) | (dst.code << 3) | src.code];
        }
        if (dst?.type === "mem" && src?.type === "reg16") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          return [...pref, 0x87, ...encodeModRM(src.code, dst.mem)];
        }
        if (dst?.type === "reg16" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, 0x87, ...encodeModRM(dst.code, src.mem)];
        }
        break;
      }

      case "mov": {
        const [dst, src] = ops;
        // MOV reg, imm
        if (dst?.type === "reg8" && src?.type === "imm") {
          return [0xb0 + dst.code, src.value & 0xff];
        }
        if (dst?.type === "reg16" && src?.type === "imm") {
          return [0xb8 + dst.code, src.value & 0xff, (src.value >> 8) & 0xff];
        }
        // MOV reg, reg
        if (dst?.type === "reg8" && src?.type === "reg8") {
          return [0x88, (3 << 6) | (src.code << 3) | dst.code];
        }
        if (dst?.type === "reg16" && src?.type === "reg16") {
          return [0x89, (3 << 6) | (src.code << 3) | dst.code];
        }
        // MOV segreg, reg16
        if (dst?.type === "segreg" && src?.type === "reg16") {
          return [0x8e, (3 << 6) | (dst.code << 3) | src.code];
        }
        // MOV reg16, segreg
        if (dst?.type === "reg16" && src?.type === "segreg") {
          return [0x8c, (3 << 6) | (src.code << 3) | dst.code];
        }
        // MOV mem, reg
        if (dst?.type === "mem" && src?.type === "reg8") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          return [...pref, 0x88, ...encodeModRM(src.code, dst.mem)];
        }
        if (dst?.type === "mem" && src?.type === "reg16") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          return [...pref, 0x89, ...encodeModRM(src.code, dst.mem)];
        }
        // MOV reg, mem
        if (dst?.type === "reg8" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, 0x8a, ...encodeModRM(dst.code, src.mem)];
        }
        if (dst?.type === "reg16" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, 0x8b, ...encodeModRM(dst.code, src.mem)];
        }
        // MOV mem, imm
        if (dst?.type === "mem" && src?.type === "imm") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          if (dst.mem.size === 1) {
            return [...pref, 0xc6, ...encodeModRM(0, dst.mem), src.value & 0xff];
          } else {
            return [...pref, 0xc7, ...encodeModRM(0, dst.mem), src.value & 0xff, (src.value >> 8) & 0xff];
          }
        }
        break;
      }

      // ALU binary operations: ADD, ADC, SUB, SBB, CMP, AND, OR, XOR
      case "add": case "adc": case "sub": case "sbb":
      case "cmp": case "and": case "or": case "xor": {
        const aluCodeMap: Record<string, { opRegMem: number; subOp: number }> = {
          add: { opRegMem: 0x00, subOp: 0 },
          or:  { opRegMem: 0x08, subOp: 1 },
          adc: { opRegMem: 0x10, subOp: 2 },
          sbb: { opRegMem: 0x18, subOp: 3 },
          and: { opRegMem: 0x20, subOp: 4 },
          sub: { opRegMem: 0x28, subOp: 5 },
          xor: { opRegMem: 0x30, subOp: 6 },
          cmp: { opRegMem: 0x38, subOp: 7 },
        };
        const { opRegMem, subOp } = aluCodeMap[m];
        const [dst, src] = ops;

        // AL/AX with imm short form
        if (dst?.type === "reg8" && dst.code === 0 && src?.type === "imm") {
          return [opRegMem + 0x04, src.value & 0xff];
        }
        if (dst?.type === "reg16" && dst.code === 0 && src?.type === "imm") {
          return [opRegMem + 0x05, src.value & 0xff, (src.value >> 8) & 0xff];
        }

        // reg, reg
        if (dst?.type === "reg8" && src?.type === "reg8") {
          return [opRegMem + 0x00, (3 << 6) | (src.code << 3) | dst.code];
        }
        if (dst?.type === "reg16" && src?.type === "reg16") {
          return [opRegMem + 0x01, (3 << 6) | (src.code << 3) | dst.code];
        }

        // reg, mem
        if (dst?.type === "reg8" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, opRegMem + 0x02, ...encodeModRM(dst.code, src.mem)];
        }
        if (dst?.type === "reg16" && src?.type === "mem") {
          const pref = getSegmentPrefix(src.mem.segmentOverride);
          return [...pref, opRegMem + 0x03, ...encodeModRM(dst.code, src.mem)];
        }

        // mem, reg
        if (dst?.type === "mem" && src?.type === "reg8") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          return [...pref, opRegMem + 0x00, ...encodeModRM(src.code, dst.mem)];
        }
        if (dst?.type === "mem" && src?.type === "reg16") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          return [...pref, opRegMem + 0x01, ...encodeModRM(src.code, dst.mem)];
        }

        // r/m, imm
        if (dst?.type === "reg8" && src?.type === "imm") {
          return [0x80, (3 << 6) | (subOp << 3) | dst.code, src.value & 0xff];
        }
        if (dst?.type === "reg16" && src?.type === "imm") {
          // Check if immediate can be sign-extended (0x83)
          if (src.value >= -128 && src.value <= 127) {
            return [0x83, (3 << 6) | (subOp << 3) | dst.code, src.value & 0xff];
          }
          return [0x81, (3 << 6) | (subOp << 3) | dst.code, src.value & 0xff, (src.value >> 8) & 0xff];
        }
        if (dst?.type === "mem" && src?.type === "imm") {
          const pref = getSegmentPrefix(dst.mem.segmentOverride);
          if (dst.mem.size === 1) {
            return [...pref, 0x80, ...encodeModRM(subOp, dst.mem), src.value & 0xff];
          } else {
            if (src.value >= -128 && src.value <= 127) {
              return [...pref, 0x83, ...encodeModRM(subOp, dst.mem), src.value & 0xff];
            }
            return [...pref, 0x81, ...encodeModRM(subOp, dst.mem), src.value & 0xff, (src.value >> 8) & 0xff];
          }
        }
        break;
      }

      case "test": {
        const [dst, src] = ops;
        if (dst?.type === "reg8" && dst.code === 0 && src?.type === "imm") {
          return [0xa8, src.value & 0xff];
        }
        if (dst?.type === "reg16" && dst.code === 0 && src?.type === "imm") {
          return [0xa9, src.value & 0xff, (src.value >> 8) & 0xff];
        }
        if (dst?.type === "reg8" && src?.type === "reg8") {
          return [0x84, (3 << 6) | (src.code << 3) | dst.code];
        }
        if (dst?.type === "reg16" && src?.type === "reg16") {
          return [0x85, (3 << 6) | (src.code << 3) | dst.code];
        }
        if (dst?.type === "reg8" && src?.type === "imm") {
          return [0xf6, (3 << 6) | (0 << 3) | dst.code, src.value & 0xff];
        }
        if (dst?.type === "reg16" && src?.type === "imm") {
          return [0xf7, (3 << 6) | (0 << 3) | dst.code, src.value & 0xff, (src.value >> 8) & 0xff];
        }
        break;
      }

      // Control flow
      case "jmp": {
        const target = ops[0];
        if (target?.type === "imm") {
          const targetOffset = target.value;
          // In pass 1, estimate short or near
          const rel = targetOffset - (offset + 2);
          if (pass === 2 && (rel < -128 || rel > 127)) {
            const rel16 = targetOffset - (offset + 3);
            return [0xe9, rel16 & 0xff, (rel16 >> 8) & 0xff];
          }
          return [0xeb, rel & 0xff];
        }
        if (target?.type === "reg16") {
          return [0xff, (3 << 6) | (4 << 3) | target.code];
        }
        if (target?.type === "mem") {
          const pref = getSegmentPrefix(target.mem.segmentOverride);
          return [...pref, 0xff, ...encodeModRM(4, target.mem)];
        }
        break;
      }

      // Conditional jumps
      case "jo": case "jno": case "jb": case "jc": case "jnae":
      case "jae": case "jnb": case "jnc": case "jz": case "je":
      case "jnz": case "jne": case "jbe": case "jna": case "ja":
      case "jnbe": case "js": case "jns": case "jp": case "jpe":
      case "jnp": case "jpo": case "jl": case "jnge": case "jge":
      case "jnl": case "jle": case "jng": case "jg": case "jnle": {
        const jmpMap: Record<string, number> = {
          jo: 0x70, jno: 0x71, jb: 0x72, jc: 0x72, jnae: 0x72,
          jae: 0x73, jnb: 0x73, jnc: 0x73, jz: 0x74, je: 0x74,
          jnz: 0x75, jne: 0x75, jbe: 0x76, jna: 0x76, ja: 0x77,
          jnbe: 0x77, js: 0x78, jns: 0x79, jp: 0x7a, jpe: 0x7a,
          jnp: 0x7b, jpo: 0x7b, jl: 0x7c, jnge: 0x7c, jge: 0x7d,
          jnl: 0x7d, jle: 0x7e, jng: 0x7e, jg: 0x7f, jnle: 0x7f,
        };
        const opcode = jmpMap[m];
        const target = ops[0];
        const targetOffset = target?.type === "imm" ? target.value : offset;
        const rel = targetOffset - (offset + 2);
        if (pass === 2 && (rel < -128 || rel > 127)) {
          diagnostics.push({
            type: "error",
            message: `Conditional jump out of range: ${rel} bytes (must be -128..+127)`,
            line: p.lineNumber,
          });
        }
        return [opcode, rel & 0xff];
      }

      case "loop": case "loope": case "loopz": case "loopne": case "loopnz": case "jcxz": {
        const loopMap: Record<string, number> = {
          loop: 0xe2, loope: 0xe1, loopz: 0xe1, loopne: 0xe0, loopnz: 0xe0, jcxz: 0xe3,
        };
        const opcode = loopMap[m];
        const target = ops[0];
        const targetOffset = target?.type === "imm" ? target.value : offset;
        const rel = targetOffset - (offset + 2);
        return [opcode, rel & 0xff];
      }

      case "call": {
        const target = ops[0];
        if (target?.type === "imm") {
          const rel16 = target.value - (offset + 3);
          return [0xe8, rel16 & 0xff, (rel16 >> 8) & 0xff];
        }
        if (target?.type === "reg16") {
          return [0xff, (3 << 6) | (2 << 3) | target.code];
        }
        if (target?.type === "mem") {
          const pref = getSegmentPrefix(target.mem.segmentOverride);
          return [...pref, 0xff, ...encodeModRM(2, target.mem)];
        }
        break;
      }

      case "ret": {
        if (ops[0]?.type === "imm") {
          return [0xc2, ops[0].value & 0xff, (ops[0].value >> 8) & 0xff];
        }
        return [0xc3];
      }

      default:
        diagnostics.push({
          type: "error",
          message: `Unsupported instruction or directive: '${m}'`,
          line: p.lineNumber,
        });
        return [];
    }

    diagnostics.push({
      type: "error",
      message: `Invalid operand combination for '${m}' (${p.operandsText || "none"})`,
      line: p.lineNumber,
    });
    return [];
  }

  // Pass 1: Compute label addresses
  for (const line of parsedLines) {
    if (line.label) {
      symbols.set(line.label.toLowerCase(), currentOffset);
    }
    const bytes = assembleInstruction(line, 1, currentOffset);
    currentOffset += bytes.length;
  }

  // Pass 2: Generate machine code with resolved symbols
  currentOffset = org;
  const binaryBytes: number[] = [];

  for (const line of parsedLines) {
    const startOff = currentOffset;
    const bytes = assembleInstruction(line, 2, currentOffset);

    if (bytes.length > 0) {
      sourceMap.set(startOff, line.lineNumber);
      if (!lineToOffset.has(line.lineNumber)) {
        lineToOffset.set(line.lineNumber, startOff);
      }
      for (const b of bytes) {
        binaryBytes.push(b & 0xff);
      }
      currentOffset += bytes.length;
    }
  }

  const success = diagnostics.filter((d) => d.type === "error").length === 0;

  return {
    success,
    binary: new Uint8Array(binaryBytes),
    loadAddress: { segment: 0x1000, offset: org },
    entryPoint: { segment: 0x1000, offset: org },
    sourceMap,
    lineToOffset,
    diagnostics,
    engineUsed: "builtin-nasm-compat",
  };
}

function splitOperands(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      current += c;
      if (c === quoteChar) {
        inQuote = false;
      }
    } else if (c === "'" || c === '"') {
      inQuote = true;
      quoteChar = c;
      current += c;
    } else if (c === "[") {
      bracketDepth++;
      current += c;
    } else if (c === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += c;
    } else if (c === "," && bracketDepth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }

  if (current.trim()) result.push(current.trim());
  return result;
}
