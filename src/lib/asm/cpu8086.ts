// Accurate 8086 CPU emulator with DOS INT 21h compatibility and execution tracking

import {
  CpuRegisters,
  CpuFlags,
  CpuStateSnapshot,
  MemoryAccess,
  StackChange,
  AsmTraceStep,
} from "./types";

function computeParity(v: number): boolean {
  let c = 0;
  let b = v & 0xff;
  while (b) {
    c += b & 1;
    b >>= 1;
  }
  return c % 2 === 0;
}

export class Cpu8086 {
  // 1MB addressable physical memory
  public memory: Uint8Array = new Uint8Array(1024 * 1024);

  // Registers
  public ax: number = 0;
  public bx: number = 0;
  public cx: number = 0;
  public dx: number = 0;
  public sp: number = 0xfffe;
  public bp: number = 0;
  public si: number = 0;
  public di: number = 0;
  public ip: number = 0x0100;
  public cs: number = 0x1000;
  public ds: number = 0x1000;
  public es: number = 0x1000;
  public ss: number = 0x1000;

  // Flags
  public cf: boolean = false;
  public pf: boolean = false;
  public af: boolean = false;
  public zf: boolean = false;
  public sf: boolean = false;
  public tf: boolean = false;
  public if_: boolean = true;
  public df: boolean = false;
  public of: boolean = false;

  // Execution state
  public instructionCount: number = 0;
  public halted: boolean = false;
  public terminated: boolean = false;
  public exitCode: number | undefined = undefined;
  public stdout: string = "";
  public stdinBuffer: string = "";

  // Step-level tracking
  private currentMemoryReads: MemoryAccess[] = [];
  private currentMemoryWrites: MemoryAccess[] = [];
  private currentStackChanges: StackChange[] = [];

  // History snapshots for reverse stepping & reset
  private snapshots: {
    snapshot: CpuStateSnapshot;
    memoryDiffs: { address: number; value: number }[];
  }[] = [];

  constructor() {
    this.reset();
  }

  public reset(loadCS = 0x1000, loadIP = 0x0100) {
    this.memory.fill(0);
    this.ax = 0;
    this.bx = 0;
    this.cx = 0;
    this.dx = 0;
    this.sp = 0xfffe;
    this.bp = 0;
    this.si = 0;
    this.di = 0;
    this.cs = loadCS;
    this.ip = loadIP;
    this.ds = loadCS;
    this.es = loadCS;
    this.ss = loadCS;

    this.cf = false;
    this.pf = false;
    this.af = false;
    this.zf = false;
    this.sf = false;
    this.tf = false;
    this.if_ = true;
    this.df = false;
    this.of = false;

    this.instructionCount = 0;
    this.halted = false;
    this.terminated = false;
    this.exitCode = undefined;
    this.stdout = "";
    this.currentMemoryReads = [];
    this.currentMemoryWrites = [];
    this.currentStackChanges = [];
    this.snapshots = [];

    // Setup DOS PSP (Program Segment Prefix) at 0x0000-0x00FF of the segment
    // Offset 0x00: INT 20h (CD 20)
    const pspBase = this.physical(loadCS, 0);
    this.memory[pspBase] = 0xcd;
    this.memory[pspBase + 1] = 0x20;
  }

  public loadBinary(binary: Uint8Array, segment = 0x1000, offset = 0x0100) {
    this.reset(segment, offset);
    const startPhysical = this.physical(segment, offset);
    for (let i = 0; i < binary.length; i++) {
      this.memory[(startPhysical + i) & 0xfffff] = binary[i];
    }
  }

  public physical(segment: number, offset: number): number {
    return ((segment << 4) + (offset & 0xffff)) & 0xfffff;
  }

  // Register accessors (8-bit and 16-bit)
  public get al(): number { return this.ax & 0xff; }
  public set al(v: number) { this.ax = (this.ax & 0xff00) | (v & 0xff); }

  public get ah(): number { return (this.ax >> 8) & 0xff; }
  public set ah(v: number) { this.ax = ((v & 0xff) << 8) | (this.ax & 0xff); }

  public get bl(): number { return this.bx & 0xff; }
  public set bl(v: number) { this.bx = (this.bx & 0xff00) | (v & 0xff); }

  public get bh(): number { return (this.bx >> 8) & 0xff; }
  public set bh(v: number) { this.bx = ((v & 0xff) << 8) | (this.bx & 0xff); }

  public get cl(): number { return this.cx & 0xff; }
  public set cl(v: number) { this.cx = (this.cx & 0xff00) | (v & 0xff); }

  public get ch(): number { return (this.cx >> 8) & 0xff; }
  public set ch(v: number) { this.cx = ((v & 0xff) << 8) | (this.cx & 0xff); }

  public get dl(): number { return this.dx & 0xff; }
  public set dl(v: number) { this.dx = (this.dx & 0xff00) | (v & 0xff); }

  public get dh(): number { return (this.dx >> 8) & 0xff; }
  public set dh(v: number) { this.dx = ((v & 0xff) << 8) | (this.dx & 0xff); }

  public getReg16(code: number): number {
    switch (code & 7) {
      case 0: return this.ax;
      case 1: return this.cx;
      case 2: return this.dx;
      case 3: return this.bx;
      case 4: return this.sp;
      case 5: return this.bp;
      case 6: return this.si;
      case 7: return this.di;
      default: return 0;
    }
  }

  public setReg16(code: number, val: number) {
    const v = val & 0xffff;
    switch (code & 7) {
      case 0: this.ax = v; break;
      case 1: this.cx = v; break;
      case 2: this.dx = v; break;
      case 3: this.bx = v; break;
      case 4: this.sp = v; break;
      case 5: this.bp = v; break;
      case 6: this.si = v; break;
      case 7: this.di = v; break;
    }
  }

  public getReg8(code: number): number {
    switch (code & 7) {
      case 0: return this.al;
      case 1: return this.cl;
      case 2: return this.dl;
      case 3: return this.bl;
      case 4: return this.ah;
      case 5: return this.ch;
      case 6: return this.dh;
      case 7: return this.bh;
      default: return 0;
    }
  }

  public setReg8(code: number, val: number) {
    const v = val & 0xff;
    switch (code & 7) {
      case 0: this.al = v; break;
      case 1: this.cl = v; break;
      case 2: this.dl = v; break;
      case 3: this.bl = v; break;
      case 4: this.ah = v; break;
      case 5: this.ch = v; break;
      case 6: this.dh = v; break;
      case 7: this.bh = v; break;
    }
  }

  public getSegReg(code: number): number {
    switch (code & 3) {
      case 0: return this.es;
      case 1: return this.cs;
      case 2: return this.ss;
      case 3: return this.ds;
      default: return 0;
    }
  }

  public setSegReg(code: number, val: number) {
    const v = val & 0xffff;
    switch (code & 3) {
      case 0: this.es = v; break;
      case 1: this.cs = v; break;
      case 2: this.ss = v; break;
      case 3: this.ds = v; break;
    }
  }

  public getRegName16(code: number): string {
    return ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"][code & 7];
  }

  public getRegName8(code: number): string {
    return ["al", "cl", "dl", "bl", "ah", "ch", "dh", "bh"][code & 7];
  }

  public getSegRegName(code: number): string {
    return ["es", "cs", "ss", "ds"][code & 3];
  }

  // Memory Access with tracking
  public readByte(segment: number, offset: number, track = true): number {
    const pa = this.physical(segment, offset);
    const val = this.memory[pa];
    if (track) {
      this.currentMemoryReads.push({
        type: "read",
        physicalAddress: pa,
        segment,
        offset: offset & 0xffff,
        oldValue: val,
        newValue: val,
        size: 1,
      });
    }
    return val;
  }

  public readWord(segment: number, offset: number, track = true): number {
    const low = this.readByte(segment, offset, track);
    const high = this.readByte(segment, offset + 1, track);
    return (high << 8) | low;
  }

  public writeByte(segment: number, offset: number, val: number, track = true) {
    const pa = this.physical(segment, offset);
    const oldVal = this.memory[pa];
    const newVal = val & 0xff;
    this.memory[pa] = newVal;
    if (track) {
      this.currentMemoryWrites.push({
        type: "write",
        physicalAddress: pa,
        segment,
        offset: offset & 0xffff,
        oldValue: oldVal,
        newValue: newVal,
        size: 1,
      });
    }
  }

  public writeWord(segment: number, offset: number, val: number, track = true) {
    this.writeByte(segment, offset, val & 0xff, track);
    this.writeByte(segment, offset + 1, (val >> 8) & 0xff, track);
  }

  // Stack operations
  public pushWord(val: number) {
    const oldSp = this.sp;
    this.sp = (this.sp - 2) & 0xffff;
    this.writeWord(this.ss, this.sp, val);
    this.currentStackChanges.push({
      type: "push",
      address: this.physical(this.ss, this.sp),
      value: val & 0xffff,
      oldSp,
      newSp: this.sp,
    });
  }

  public popWord(): number {
    const oldSp = this.sp;
    const val = this.readWord(this.ss, this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    this.currentStackChanges.push({
      type: "pop",
      address: this.physical(this.ss, oldSp),
      value: val,
      oldSp,
      newSp: this.sp,
    });
    return val;
  }

  // Snapshot taking
  public takeSnapshot(): CpuStateSnapshot {
    return {
      registers: {
        ax: this.ax, bx: this.bx, cx: this.cx, dx: this.dx,
        sp: this.sp, bp: this.bp, si: this.si, di: this.di,
        ip: this.ip, cs: this.cs, ds: this.ds, es: this.es, ss: this.ss,
      },
      flags: {
        cf: this.cf, pf: this.pf, af: this.af, zf: this.zf,
        sf: this.sf, tf: this.tf, if: this.if_, df: this.df, of: this.of,
      },
      instructionCount: this.instructionCount,
      halted: this.halted,
      terminated: this.terminated,
      exitCode: this.exitCode,
      stdout: this.stdout,
    };
  }

  public restoreSnapshot(snap: CpuStateSnapshot) {
    this.ax = snap.registers.ax;
    this.bx = snap.registers.bx;
    this.cx = snap.registers.cx;
    this.dx = snap.registers.dx;
    this.sp = snap.registers.sp;
    this.bp = snap.registers.bp;
    this.si = snap.registers.si;
    this.di = snap.registers.di;
    this.ip = snap.registers.ip;
    this.cs = snap.registers.cs;
    this.ds = snap.registers.ds;
    this.es = snap.registers.es;
    this.ss = snap.registers.ss;

    this.cf = snap.flags.cf;
    this.pf = snap.flags.pf;
    this.af = snap.flags.af;
    this.zf = snap.flags.zf;
    this.sf = snap.flags.sf;
    this.tf = snap.flags.tf;
    this.if_ = snap.flags.if;
    this.df = snap.flags.df;
    this.of = snap.flags.of;

    this.instructionCount = snap.instructionCount;
    this.halted = snap.halted;
    this.terminated = snap.terminated;
    this.exitCode = snap.exitCode;
    this.stdout = snap.stdout;
  }

  // Reverse step: restores the previous execution snapshot
  public stepBack(): boolean {
    if (this.snapshots.length === 0) return false;
    const last = this.snapshots.pop()!;
    this.restoreSnapshot(last.snapshot);
    // Reverse memory diffs
    for (const diff of last.memoryDiffs) {
      this.memory[diff.address] = diff.value;
    }
    return true;
  }

  // ALU Flags Helper
  private updateAddFlags8(a: number, b: number, res: number, carryIn = 0) {
    this.cf = (a + b + carryIn) > 0xff;
    this.zf = (res & 0xff) === 0;
    this.sf = (res & 0x80) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) + (b & 0x0f) + carryIn) > 0x0f;
    this.of = ((~(a ^ b) & (a ^ res)) & 0x80) !== 0;
  }

  private updateAddFlags16(a: number, b: number, res: number, carryIn = 0) {
    this.cf = (a + b + carryIn) > 0xffff;
    this.zf = (res & 0xffff) === 0;
    this.sf = (res & 0x8000) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) + (b & 0x0f) + carryIn) > 0x0f;
    this.of = ((~(a ^ b) & (a ^ res)) & 0x8000) !== 0;
  }

  private updateSubFlags8(a: number, b: number, res: number, borrowIn = 0) {
    this.cf = (a - b - borrowIn) < 0;
    this.zf = (res & 0xff) === 0;
    this.sf = (res & 0x80) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) - (b & 0x0f) - borrowIn) < 0;
    this.of = (((a ^ b) & (a ^ res)) & 0x80) !== 0;
  }

  private updateSubFlags16(a: number, b: number, res: number, borrowIn = 0) {
    this.cf = (a - b - borrowIn) < 0;
    this.zf = (res & 0xffff) === 0;
    this.sf = (res & 0x8000) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) - (b & 0x0f) - borrowIn) < 0;
    this.of = (((a ^ b) & (a ^ res)) & 0x8000) !== 0;
  }

  private updateIncFlags8(a: number, res: number) {
    // Note: INC preserves CF!
    this.zf = (res & 0xff) === 0;
    this.sf = (res & 0x80) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) + 1) > 0x0f;
    this.of = a === 0x7f;
  }

  private updateIncFlags16(a: number, res: number) {
    // Note: INC preserves CF!
    this.zf = (res & 0xffff) === 0;
    this.sf = (res & 0x8000) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = ((a & 0x0f) + 1) > 0x0f;
    this.of = a === 0x7fff;
  }

  private updateDecFlags8(a: number, res: number) {
    // Note: DEC preserves CF!
    this.zf = (res & 0xff) === 0;
    this.sf = (res & 0x80) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = (a & 0x0f) === 0;
    this.of = a === 0x80;
  }

  private updateDecFlags16(a: number, res: number) {
    // Note: DEC preserves CF!
    this.zf = (res & 0xffff) === 0;
    this.sf = (res & 0x8000) !== 0;
    this.pf = computeParity(res & 0xff);
    this.af = (a & 0x0f) === 0;
    this.of = a === 0x8000;
  }

  private updateLogicFlags8(res: number) {
    this.cf = false;
    this.of = false;
    this.af = false;
    this.zf = (res & 0xff) === 0;
    this.sf = (res & 0x80) !== 0;
    this.pf = computeParity(res & 0xff);
  }

  private updateLogicFlags16(res: number) {
    this.cf = false;
    this.of = false;
    this.af = false;
    this.zf = (res & 0xffff) === 0;
    this.sf = (res & 0x8000) !== 0;
    this.pf = computeParity(res & 0xff);
  }

  // Decode Effective Address (ModR/M)
  private decodeEA(mod: number, rm: number, segOverride?: number): { segment: number; offset: number } {
    let base = 0;
    let defaultSeg = this.ds;

    switch (rm) {
      case 0: base = (this.bx + this.si) & 0xffff; break;
      case 1: base = (this.bx + this.di) & 0xffff; break;
      case 2: base = (this.bp + this.si) & 0xffff; defaultSeg = this.ss; break;
      case 3: base = (this.bp + this.di) & 0xffff; defaultSeg = this.ss; break;
      case 4: base = this.si; break;
      case 5: base = this.di; break;
      case 6:
        if (mod === 0) {
          // Direct 16-bit address
          const disp16 = this.fetchWord();
          const seg = segOverride !== undefined ? segOverride : defaultSeg;
          return { segment: seg, offset: disp16 };
        } else {
          base = this.bp;
          defaultSeg = this.ss;
        }
        break;
      case 7: base = this.bx; break;
    }

    let disp = 0;
    if (mod === 1) {
      // 8-bit sign extended disp
      let d8 = this.fetchByte();
      if (d8 & 0x80) d8 -= 256;
      disp = d8;
    } else if (mod === 2) {
      disp = this.fetchWord();
    }

    const seg = segOverride !== undefined ? segOverride : defaultSeg;
    const finalOffset = (base + disp) & 0xffff;
    return { segment: seg, offset: finalOffset };
  }

  private fetchByte(): number {
    const b = this.readByte(this.cs, this.ip, false);
    this.ip = (this.ip + 1) & 0xffff;
    return b;
  }

  private fetchWord(): number {
    const low = this.fetchByte();
    const high = this.fetchByte();
    return (high << 8) | low;
  }

  // Single-step execution: executes exactly one guest instruction and returns trace step
  public step(): AsmTraceStep {
    if (this.halted || this.terminated) {
      const snap = this.takeSnapshot();
      return {
        step: this.instructionCount,
        addressBefore: { segment: this.cs, offset: this.ip, physical: this.physical(this.cs, this.ip) },
        addressNext: { segment: this.cs, offset: this.ip, physical: this.physical(this.cs, this.ip) },
        instructionBytes: [],
        mnemonic: this.halted ? "HLT" : "TERMINATED",
        operands: "",
        disassembly: this.halted ? "hlt" : "terminated",
        registersBefore: snap.registers,
        registersAfter: snap.registers,
        flagsBefore: snap.flags,
        flagsAfter: snap.flags,
        memoryReads: [],
        memoryWrites: [],
        stackChanges: [],
        stdoutDelta: "",
        stdoutTotal: this.stdout,
        halted: this.halted,
        terminated: this.terminated,
        exitCode: this.exitCode,
      };
    }

    const snapBefore = this.takeSnapshot();
    const startCS = this.cs;
    const startIP = this.ip;
    const startPhysical = this.physical(startCS, startIP);

    this.currentMemoryReads = [];
    this.currentMemoryWrites = [];
    this.currentStackChanges = [];
    const stdoutStartLen = this.stdout.length;

    // Save snapshot for stepBack
    const memoryDiffs: { address: number; value: number }[] = [];

    // Instruction decode loop (handling prefixes)
    let segOverride: number | undefined;
    let opcode = this.fetchByte();

    // Segment prefix check
    while ([0x26, 0x2e, 0x36, 0x3e].includes(opcode)) {
      if (opcode === 0x26) segOverride = this.es;
      else if (opcode === 0x2e) segOverride = this.cs;
      else if (opcode === 0x36) segOverride = this.ss;
      else if (opcode === 0x3e) segOverride = this.ds;
      opcode = this.fetchByte();
    }

    let mnemonic = "UNKNOWN";
    let operandsText = "";

    // Instruction dispatch
    switch (opcode) {
      case 0x90: // NOP (xchg ax, ax)
        mnemonic = "NOP";
        operandsText = "";
        break;

      case 0xf4: // HLT
        mnemonic = "HLT";
        this.halted = true;
        break;

      case 0xcc: // INT 3
        mnemonic = "INT";
        operandsText = "3";
        this.halted = true;
        break;

      case 0xcd: { // INT n
        const intNum = this.fetchByte();
        mnemonic = "INT";
        operandsText = `${intNum.toString(16).toUpperCase()}h`;
        this.handleInterrupt(intNum);
        break;
      }

      // Flags instructions
      case 0xf8: mnemonic = "CLC"; this.cf = false; break;
      case 0xf9: mnemonic = "STC"; this.cf = true; break;
      case 0xfa: mnemonic = "CLI"; this.if_ = false; break;
      case 0xfb: mnemonic = "STI"; this.if_ = true; break;
      case 0xfc: mnemonic = "CLD"; this.df = false; break;
      case 0xfd: mnemonic = "STD"; this.df = true; break;
      case 0xf5: mnemonic = "CMC"; this.cf = !this.cf; break;

      // PUSHF / POPF
      case 0x9c: { // PUSHF
        mnemonic = "PUSHF";
        const fWord = this.encodeFlags();
        this.pushWord(fWord);
        break;
      }
      case 0x9d: { // POPF
        mnemonic = "POPF";
        const fWord = this.popWord();
        this.decodeFlags(fWord);
        break;
      }

      // PUSH reg16
      case 0x50: case 0x51: case 0x52: case 0x53:
      case 0x54: case 0x55: case 0x56: case 0x57: {
        const regIdx = opcode - 0x50;
        mnemonic = "PUSH";
        operandsText = this.getRegName16(regIdx);
        this.pushWord(this.getReg16(regIdx));
        break;
      }

      // POP reg16
      case 0x58: case 0x59: case 0x5a: case 0x5b:
      case 0x5c: case 0x5d: case 0x5e: case 0x5f: {
        const regIdx = opcode - 0x58;
        mnemonic = "POP";
        operandsText = this.getRegName16(regIdx);
        this.setReg16(regIdx, this.popWord());
        break;
      }

      // PUSH segreg
      case 0x06: case 0x0e: case 0x16: case 0x1e: {
        const segIdx = (opcode >> 3) & 3;
        mnemonic = "PUSH";
        operandsText = this.getSegRegName(segIdx);
        this.pushWord(this.getSegReg(segIdx));
        break;
      }

      // POP segreg
      case 0x07: case 0x17: case 0x1f: {
        const segIdx = (opcode >> 3) & 3;
        mnemonic = "POP";
        operandsText = this.getSegRegName(segIdx);
        this.setSegReg(segIdx, this.popWord());
        break;
      }

      // INC reg16
      case 0x40: case 0x41: case 0x42: case 0x43:
      case 0x44: case 0x45: case 0x46: case 0x47: {
        const regIdx = opcode - 0x40;
        mnemonic = "INC";
        operandsText = this.getRegName16(regIdx);
        const oldVal = this.getReg16(regIdx);
        const newVal = (oldVal + 1) & 0xffff;
        this.setReg16(regIdx, newVal);
        this.updateIncFlags16(oldVal, newVal);
        break;
      }

      // DEC reg16
      case 0x48: case 0x49: case 0x4a: case 0x4b:
      case 0x4c: case 0x4d: case 0x4e: case 0x4f: {
        const regIdx = opcode - 0x48;
        mnemonic = "DEC";
        operandsText = this.getRegName16(regIdx);
        const oldVal = this.getReg16(regIdx);
        const newVal = (oldVal - 1) & 0xffff;
        this.setReg16(regIdx, newVal);
        this.updateDecFlags16(oldVal, newVal);
        break;
      }

      // MOV reg8, imm8
      case 0xb0: case 0xb1: case 0xb2: case 0xb3:
      case 0xb4: case 0xb5: case 0xb6: case 0xb7: {
        const regIdx = opcode - 0xb0;
        const imm = this.fetchByte();
        mnemonic = "MOV";
        operandsText = `${this.getRegName8(regIdx)}, 0x${imm.toString(16)}`;
        this.setReg8(regIdx, imm);
        break;
      }

      // MOV reg16, imm16
      case 0xb8: case 0xb9: case 0xba: case 0xbb:
      case 0xbc: case 0xbd: case 0xbe: case 0xbf: {
        const regIdx = opcode - 0xb8;
        const imm = this.fetchWord();
        mnemonic = "MOV";
        operandsText = `${this.getRegName16(regIdx)}, 0x${imm.toString(16)}`;
        this.setReg16(regIdx, imm);
        break;
      }

      // XCHG ax, reg16
      case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97: {
        const regIdx = opcode - 0x90;
        mnemonic = "XCHG";
        operandsText = `ax, ${this.getRegName16(regIdx)}`;
        const tmp = this.ax;
        this.ax = this.getReg16(regIdx);
        this.setReg16(regIdx, tmp);
        break;
      }

      // LEA reg16, mem (0x8D)
      case 0x8d: {
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const reg = (modrm >> 3) & 7;
        const rm = modrm & 7;
        const ea = this.decodeEA(mod, rm, segOverride);
        mnemonic = "LEA";
        operandsText = `${this.getRegName16(reg)}, [0x${ea.offset.toString(16)}]`;
        this.setReg16(reg, ea.offset);
        break;
      }

      // MOV segreg, r/m16 (0x8E)
      case 0x8e: {
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const sreg = (modrm >> 3) & 3;
        const rm = modrm & 7;
        mnemonic = "MOV";
        operandsText = `${this.getSegRegName(sreg)}, ...`;
        const val = mod === 3 ? this.getReg16(rm) : this.readWord(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset);
        this.setSegReg(sreg, val);
        break;
      }

      // MOV r/m16, segreg (0x8C)
      case 0x8c: {
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const sreg = (modrm >> 3) & 3;
        const rm = modrm & 7;
        mnemonic = "MOV";
        const val = this.getSegReg(sreg);
        if (mod === 3) {
          this.setReg16(rm, val);
        } else {
          const ea = this.decodeEA(mod, rm, segOverride);
          this.writeWord(ea.segment, ea.offset, val);
        }
        break;
      }

      // MOV r/m, reg and reg, r/m
      case 0x88: case 0x89: case 0x8a: case 0x8b: {
        const isWord = (opcode & 1) === 1;
        const isRegDest = (opcode & 2) === 2;
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const reg = (modrm >> 3) & 7;
        const rm = modrm & 7;
        mnemonic = "MOV";

        if (mod === 3) {
          // Register to register
          if (isWord) {
            const src = isRegDest ? this.getReg16(rm) : this.getReg16(reg);
            const dstIdx = isRegDest ? reg : rm;
            this.setReg16(dstIdx, src);
            operandsText = `${this.getRegName16(dstIdx)}, ${this.getRegName16(isRegDest ? rm : reg)}`;
          } else {
            const src = isRegDest ? this.getReg8(rm) : this.getReg8(reg);
            const dstIdx = isRegDest ? reg : rm;
            this.setReg8(dstIdx, src);
            operandsText = `${this.getRegName8(dstIdx)}, ${this.getRegName8(isRegDest ? rm : reg)}`;
          }
        } else {
          const ea = this.decodeEA(mod, rm, segOverride);
          if (isRegDest) {
            if (isWord) {
              const val = this.readWord(ea.segment, ea.offset);
              this.setReg16(reg, val);
              operandsText = `${this.getRegName16(reg)}, word [0x${ea.offset.toString(16)}]`;
            } else {
              const val = this.readByte(ea.segment, ea.offset);
              this.setReg8(reg, val);
              operandsText = `${this.getRegName8(reg)}, byte [0x${ea.offset.toString(16)}]`;
            }
          } else {
            if (isWord) {
              const val = this.getReg16(reg);
              this.writeWord(ea.segment, ea.offset, val);
              operandsText = `word [0x${ea.offset.toString(16)}], ${this.getRegName16(reg)}`;
            } else {
              const val = this.getReg8(reg);
              this.writeByte(ea.segment, ea.offset, val);
              operandsText = `byte [0x${ea.offset.toString(16)}], ${this.getRegName8(reg)}`;
            }
          }
        }
        break;
      }

      // MOV r/m, imm (0xC6, 0xC7)
      case 0xc6: case 0xc7: {
        const isWord = (opcode & 1) === 1;
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const rm = modrm & 7;
        mnemonic = "MOV";
        if (mod === 3) {
          if (isWord) {
            const imm = this.fetchWord();
            this.setReg16(rm, imm);
            operandsText = `${this.getRegName16(rm)}, 0x${imm.toString(16)}`;
          } else {
            const imm = this.fetchByte();
            this.setReg8(rm, imm);
            operandsText = `${this.getRegName8(rm)}, 0x${imm.toString(16)}`;
          }
        } else {
          const ea = this.decodeEA(mod, rm, segOverride);
          if (isWord) {
            const imm = this.fetchWord();
            this.writeWord(ea.segment, ea.offset, imm);
            operandsText = `word [0x${ea.offset.toString(16)}], 0x${imm.toString(16)}`;
          } else {
            const imm = this.fetchByte();
            this.writeByte(ea.segment, ea.offset, imm);
            operandsText = `byte [0x${ea.offset.toString(16)}], 0x${imm.toString(16)}`;
          }
        }
        break;
      }

      // XCHG r/m, reg (0x86, 0x87)
      case 0x86: case 0x87: {
        const isWord = (opcode & 1) === 1;
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const reg = (modrm >> 3) & 7;
        const rm = modrm & 7;
        mnemonic = "XCHG";
        if (mod === 3) {
          if (isWord) {
            const tmp = this.getReg16(rm);
            this.setReg16(rm, this.getReg16(reg));
            this.setReg16(reg, tmp);
            operandsText = `${this.getRegName16(rm)}, ${this.getRegName16(reg)}`;
          } else {
            const tmp = this.getReg8(rm);
            this.setReg8(rm, this.getReg8(reg));
            this.setReg8(reg, tmp);
            operandsText = `${this.getRegName8(rm)}, ${this.getRegName8(reg)}`;
          }
        } else {
          const ea = this.decodeEA(mod, rm, segOverride);
          if (isWord) {
            const memVal = this.readWord(ea.segment, ea.offset);
            const regVal = this.getReg16(reg);
            this.writeWord(ea.segment, ea.offset, regVal);
            this.setReg16(reg, memVal);
          } else {
            const memVal = this.readByte(ea.segment, ea.offset);
            const regVal = this.getReg8(reg);
            this.writeByte(ea.segment, ea.offset, regVal);
            this.setReg8(reg, memVal);
          }
        }
        break;
      }

      // ALU operations: ADD, OR, ADC, SBB, AND, SUB, XOR, CMP
      // 0x00 - 0x3F opcodes
      case 0x00: case 0x01: case 0x02: case 0x03: case 0x04: case 0x05: // ADD
      case 0x08: case 0x09: case 0x0a: case 0x0b: case 0x0c: case 0x0d: // OR
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: // ADC
      case 0x18: case 0x19: case 0x1a: case 0x1b: case 0x1c: case 0x1d: // SBB
      case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: // AND
      case 0x28: case 0x29: case 0x2a: case 0x2b: case 0x2c: case 0x2d: // SUB
      case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: // XOR
      case 0x38: case 0x39: case 0x3a: case 0x3b: case 0x3c: case 0x3d: // CMP
      {
        const aluOp = (opcode >> 3) & 7;
        const aluNames = ["ADD", "OR", "ADC", "SBB", "AND", "SUB", "XOR", "CMP"];
        mnemonic = aluNames[aluOp];

        const isImmAcc = (opcode & 6) === 4;
        const isWord = (opcode & 1) === 1;
        const isRegDest = (opcode & 2) === 2;

        if (isImmAcc) {
          const imm = isWord ? this.fetchWord() : this.fetchByte();
          operandsText = `${isWord ? "ax" : "al"}, 0x${imm.toString(16)}`;
          if (isWord) {
            const res = this.executeAlu16(aluOp, this.ax, imm);
            if (aluOp !== 7) this.ax = res; // CMP does not store result
          } else {
            const res = this.executeAlu8(aluOp, this.al, imm);
            if (aluOp !== 7) this.al = res;
          }
        } else {
          const modrm = this.fetchByte();
          const mod = (modrm >> 6) & 3;
          const reg = (modrm >> 3) & 7;
          const rm = modrm & 7;

          if (mod === 3) {
            if (isWord) {
              const op1 = isRegDest ? this.getReg16(reg) : this.getReg16(rm);
              const op2 = isRegDest ? this.getReg16(rm) : this.getReg16(reg);
              const res = this.executeAlu16(aluOp, op1, op2);
              if (aluOp !== 7) {
                this.setReg16(isRegDest ? reg : rm, res);
              }
              operandsText = `${this.getRegName16(isRegDest ? reg : rm)}, ${this.getRegName16(isRegDest ? rm : reg)}`;
            } else {
              const op1 = isRegDest ? this.getReg8(reg) : this.getReg8(rm);
              const op2 = isRegDest ? this.getReg8(rm) : this.getReg8(reg);
              const res = this.executeAlu8(aluOp, op1, op2);
              if (aluOp !== 7) {
                this.setReg8(isRegDest ? reg : rm, res);
              }
              operandsText = `${this.getRegName8(isRegDest ? reg : rm)}, ${this.getRegName8(isRegDest ? rm : reg)}`;
            }
          } else {
            const ea = this.decodeEA(mod, rm, segOverride);
            if (isRegDest) {
              if (isWord) {
                const memVal = this.readWord(ea.segment, ea.offset);
                const res = this.executeAlu16(aluOp, this.getReg16(reg), memVal);
                if (aluOp !== 7) this.setReg16(reg, res);
                operandsText = `${this.getRegName16(reg)}, word [0x${ea.offset.toString(16)}]`;
              } else {
                const memVal = this.readByte(ea.segment, ea.offset);
                const res = this.executeAlu8(aluOp, this.getReg8(reg), memVal);
                if (aluOp !== 7) this.setReg8(reg, res);
                operandsText = `${this.getRegName8(reg)}, byte [0x${ea.offset.toString(16)}]`;
              }
            } else {
              if (isWord) {
                const memVal = this.readWord(ea.segment, ea.offset);
                const res = this.executeAlu16(aluOp, memVal, this.getReg16(reg));
                if (aluOp !== 7) this.writeWord(ea.segment, ea.offset, res);
                operandsText = `word [0x${ea.offset.toString(16)}], ${this.getRegName16(reg)}`;
              } else {
                const memVal = this.readByte(ea.segment, ea.offset);
                const res = this.executeAlu8(aluOp, memVal, this.getReg8(reg));
                if (aluOp !== 7) this.writeByte(ea.segment, ea.offset, res);
                operandsText = `byte [0x${ea.offset.toString(16)}], ${this.getRegName8(reg)}`;
              }
            }
          }
        }
        break;
      }

      // Group 1: 0x80, 0x81, 0x82, 0x83 (r/m with imm)
      case 0x80: case 0x81: case 0x82: case 0x83: {
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const aluOp = (modrm >> 3) & 7;
        const rm = modrm & 7;
        const aluNames = ["ADD", "OR", "ADC", "SBB", "AND", "SUB", "XOR", "CMP"];
        mnemonic = aluNames[aluOp];

        const isWord = opcode === 0x81 || opcode === 0x83;
        let imm = 0;

        if (mod === 3) {
          if (opcode === 0x83) {
            let d8 = this.fetchByte();
            if (d8 & 0x80) d8 -= 256;
            imm = d8 & 0xffff;
          } else if (isWord) {
            imm = this.fetchWord();
          } else {
            imm = this.fetchByte();
          }

          if (isWord) {
            const res = this.executeAlu16(aluOp, this.getReg16(rm), imm);
            if (aluOp !== 7) this.setReg16(rm, res);
            operandsText = `${this.getRegName16(rm)}, 0x${imm.toString(16)}`;
          } else {
            const res = this.executeAlu8(aluOp, this.getReg8(rm), imm);
            if (aluOp !== 7) this.setReg8(rm, res);
            operandsText = `${this.getRegName8(rm)}, 0x${imm.toString(16)}`;
          }
        } else {
          const ea = this.decodeEA(mod, rm, segOverride);
          if (opcode === 0x83) {
            let d8 = this.fetchByte();
            if (d8 & 0x80) d8 -= 256;
            imm = d8 & 0xffff;
          } else if (isWord) {
            imm = this.fetchWord();
          } else {
            imm = this.fetchByte();
          }

          if (isWord) {
            const memVal = this.readWord(ea.segment, ea.offset);
            const res = this.executeAlu16(aluOp, memVal, imm);
            if (aluOp !== 7) this.writeWord(ea.segment, ea.offset, res);
            operandsText = `word [0x${ea.offset.toString(16)}], 0x${imm.toString(16)}`;
          } else {
            const memVal = this.readByte(ea.segment, ea.offset);
            const res = this.executeAlu8(aluOp, memVal, imm);
            if (aluOp !== 7) this.writeByte(ea.segment, ea.offset, res);
            operandsText = `byte [0x${ea.offset.toString(16)}], 0x${imm.toString(16)}`;
          }
        }
        break;
      }

      // Group 3: 0xF6, 0xF7 (TEST, NOT, NEG)
      case 0xf6: case 0xf7: {
        const isWord = opcode === 0xf7;
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const subOp = (modrm >> 3) & 7;
        const rm = modrm & 7;

        if (subOp === 0) { // TEST
          mnemonic = "TEST";
          const imm = isWord ? this.fetchWord() : this.fetchByte();
          const targetVal = mod === 3 ? (isWord ? this.getReg16(rm) : this.getReg8(rm)) :
            (isWord ? this.readWord(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset) :
                      this.readByte(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset));
          if (isWord) this.updateLogicFlags16(targetVal & imm);
          else this.updateLogicFlags8(targetVal & imm);
        } else if (subOp === 2) { // NOT
          mnemonic = "NOT";
          if (mod === 3) {
            if (isWord) this.setReg16(rm, ~this.getReg16(rm));
            else this.setReg8(rm, ~this.getReg8(rm));
          } else {
            const ea = this.decodeEA(mod, rm, segOverride);
            if (isWord) this.writeWord(ea.segment, ea.offset, ~this.readWord(ea.segment, ea.offset));
            else this.writeByte(ea.segment, ea.offset, ~this.readByte(ea.segment, ea.offset));
          }
        } else if (subOp === 3) { // NEG
          mnemonic = "NEG";
          if (mod === 3) {
            if (isWord) {
              const v = this.getReg16(rm);
              const res = (0 - v) & 0xffff;
              this.setReg16(rm, res);
              this.updateSubFlags16(0, v, res);
            } else {
              const v = this.getReg8(rm);
              const res = (0 - v) & 0xff;
              this.setReg8(rm, res);
              this.updateSubFlags8(0, v, res);
            }
          } else {
            const ea = this.decodeEA(mod, rm, segOverride);
            if (isWord) {
              const v = this.readWord(ea.segment, ea.offset);
              const res = (0 - v) & 0xffff;
              this.writeWord(ea.segment, ea.offset, res);
              this.updateSubFlags16(0, v, res);
            } else {
              const v = this.readByte(ea.segment, ea.offset);
              const res = (0 - v) & 0xff;
              this.writeByte(ea.segment, ea.offset, res);
              this.updateSubFlags8(0, v, res);
            }
          }
        }
        break;
      }

      // Group 4 & 5: 0xFE, 0xFF (INC, DEC, CALL, JMP, PUSH)
      case 0xfe: case 0xff: {
        const isWord = opcode === 0xff;
        const modrm = this.fetchByte();
        const mod = (modrm >> 6) & 3;
        const subOp = (modrm >> 3) & 7;
        const rm = modrm & 7;

        if (subOp === 0) { // INC
          mnemonic = "INC";
          if (mod === 3) {
            if (isWord) {
              const oldVal = this.getReg16(rm);
              const res = (oldVal + 1) & 0xffff;
              this.setReg16(rm, res);
              this.updateIncFlags16(oldVal, res);
            } else {
              const oldVal = this.getReg8(rm);
              const res = (oldVal + 1) & 0xff;
              this.setReg8(rm, res);
              this.updateIncFlags8(oldVal, res);
            }
          } else {
            const ea = this.decodeEA(mod, rm, segOverride);
            if (isWord) {
              const oldVal = this.readWord(ea.segment, ea.offset);
              const res = (oldVal + 1) & 0xffff;
              this.writeWord(ea.segment, ea.offset, res);
              this.updateIncFlags16(oldVal, res);
            } else {
              const oldVal = this.readByte(ea.segment, ea.offset);
              const res = (oldVal + 1) & 0xff;
              this.writeByte(ea.segment, ea.offset, res);
              this.updateIncFlags8(oldVal, res);
            }
          }
        } else if (subOp === 1) { // DEC
          mnemonic = "DEC";
          if (mod === 3) {
            if (isWord) {
              const oldVal = this.getReg16(rm);
              const res = (oldVal - 1) & 0xffff;
              this.setReg16(rm, res);
              this.updateDecFlags16(oldVal, res);
            } else {
              const oldVal = this.getReg8(rm);
              const res = (oldVal - 1) & 0xff;
              this.setReg8(rm, res);
              this.updateDecFlags8(oldVal, res);
            }
          } else {
            const ea = this.decodeEA(mod, rm, segOverride);
            if (isWord) {
              const oldVal = this.readWord(ea.segment, ea.offset);
              const res = (oldVal - 1) & 0xffff;
              this.writeWord(ea.segment, ea.offset, res);
              this.updateDecFlags16(oldVal, res);
            } else {
              const oldVal = this.readByte(ea.segment, ea.offset);
              const res = (oldVal - 1) & 0xff;
              this.writeByte(ea.segment, ea.offset, res);
              this.updateDecFlags8(oldVal, res);
            }
          }
        } else if (subOp === 2 && isWord) { // CALL near indirect
          mnemonic = "CALL";
          const targetIP = mod === 3 ? this.getReg16(rm) : this.readWord(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset);
          this.pushWord(this.ip);
          this.ip = targetIP;
        } else if (subOp === 4 && isWord) { // JMP near indirect
          mnemonic = "JMP";
          const targetIP = mod === 3 ? this.getReg16(rm) : this.readWord(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset);
          this.ip = targetIP;
        } else if (subOp === 6 && isWord) { // PUSH r/m16
          mnemonic = "PUSH";
          const val = mod === 3 ? this.getReg16(rm) : this.readWord(this.decodeEA(mod, rm, segOverride).segment, this.decodeEA(mod, rm, segOverride).offset);
          this.pushWord(val);
        }
        break;
      }

      // JMP relative
      case 0xeb: { // JMP short (rel8)
        mnemonic = "JMP";
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        this.ip = (this.ip + rel8) & 0xffff;
        operandsText = `0x${this.ip.toString(16)}`;
        break;
      }
      case 0xe9: { // JMP near (rel16)
        mnemonic = "JMP";
        let rel16 = this.fetchWord();
        if (rel16 & 0x8000) rel16 -= 65536;
        this.ip = (this.ip + rel16) & 0xffff;
        operandsText = `0x${this.ip.toString(16)}`;
        break;
      }

      // Conditional jumps (0x70 - 0x7F)
      case 0x70: case 0x71: case 0x72: case 0x73:
      case 0x74: case 0x75: case 0x76: case 0x77:
      case 0x78: case 0x79: case 0x7a: case 0x7b:
      case 0x7c: case 0x7d: case 0x7e: case 0x7f: {
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        let cond = false;
        switch (opcode) {
          case 0x70: mnemonic = "JO"; cond = this.of; break;
          case 0x71: mnemonic = "JNO"; cond = !this.of; break;
          case 0x72: mnemonic = "JB"; cond = this.cf; break;
          case 0x73: mnemonic = "JAE"; cond = !this.cf; break;
          case 0x74: mnemonic = "JZ"; cond = this.zf; break;
          case 0x75: mnemonic = "JNZ"; cond = !this.zf; break;
          case 0x76: mnemonic = "JBE"; cond = this.cf || this.zf; break;
          case 0x77: mnemonic = "JA"; cond = !this.cf && !this.zf; break;
          case 0x78: mnemonic = "JS"; cond = this.sf; break;
          case 0x79: mnemonic = "JNS"; cond = !this.sf; break;
          case 0x7a: mnemonic = "JP"; cond = this.pf; break;
          case 0x7b: mnemonic = "JNP"; cond = !this.pf; break;
          case 0x7c: mnemonic = "JL"; cond = this.sf !== this.of; break;
          case 0x7d: mnemonic = "JGE"; cond = this.sf === this.of; break;
          case 0x7e: mnemonic = "JLE"; cond = this.zf || (this.sf !== this.of); break;
          case 0x7f: mnemonic = "JG"; cond = !this.zf && (this.sf === this.of); break;
        }
        if (cond) {
          this.ip = (this.ip + rel8) & 0xffff;
        }
        operandsText = `0x${this.ip.toString(16)}`;
        break;
      }

      // LOOP instructions
      case 0xe2: { // LOOP
        mnemonic = "LOOP";
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        this.cx = (this.cx - 1) & 0xffff;
        if (this.cx !== 0) {
          this.ip = (this.ip + rel8) & 0xffff;
        }
        operandsText = `0x${this.ip.toString(16)}`;
        break;
      }
      case 0xe1: { // LOOPE / LOOPZ
        mnemonic = "LOOPE";
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        this.cx = (this.cx - 1) & 0xffff;
        if (this.cx !== 0 && this.zf) {
          this.ip = (this.ip + rel8) & 0xffff;
        }
        break;
      }
      case 0xe0: { // LOOPNE / LOOPNZ
        mnemonic = "LOOPNE";
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        this.cx = (this.cx - 1) & 0xffff;
        if (this.cx !== 0 && !this.zf) {
          this.ip = (this.ip + rel8) & 0xffff;
        }
        break;
      }
      case 0xe3: { // JCXZ
        mnemonic = "JCXZ";
        let rel8 = this.fetchByte();
        if (rel8 & 0x80) rel8 -= 256;
        if (this.cx === 0) {
          this.ip = (this.ip + rel8) & 0xffff;
        }
        break;
      }

      // CALL near rel16 (0xE8)
      case 0xe8: {
        mnemonic = "CALL";
        let rel16 = this.fetchWord();
        if (rel16 & 0x8000) rel16 -= 65536;
        this.pushWord(this.ip);
        this.ip = (this.ip + rel16) & 0xffff;
        operandsText = `0x${this.ip.toString(16)}`;
        break;
      }

      // RET near (0xC3)
      case 0xc3: {
        mnemonic = "RET";
        this.ip = this.popWord();
        break;
      }

      // RET imm16 (0xC2)
      case 0xc2: {
        mnemonic = "RET";
        const popBytes = this.fetchWord();
        this.ip = this.popWord();
        this.sp = (this.sp + popBytes) & 0xffff;
        break;
      }

      default:
        mnemonic = `DB 0x${opcode.toString(16).padStart(2, "0")}`;
        this.halted = true;
        break;
    }

    this.instructionCount++;

    // Compute instruction bytes
    const endPhysical = this.physical(this.cs, this.ip);
    const instructionBytes: number[] = [];
    const byteLen = Math.max(1, (this.ip - startIP) & 0xffff);
    for (let i = 0; i < byteLen && i < 15; i++) {
      instructionBytes.push(this.memory[(startPhysical + i) & 0xfffff]);
    }

    // Save snapshot with memory diffs for stepBack
    for (const w of this.currentMemoryWrites) {
      memoryDiffs.push({ address: w.physicalAddress, value: w.oldValue });
    }
    this.snapshots.push({ snapshot: snapBefore, memoryDiffs });

    const snapAfter = this.takeSnapshot();
    const stdoutDelta = this.stdout.slice(stdoutStartLen);

    return {
      step: this.instructionCount,
      addressBefore: { segment: startCS, offset: startIP, physical: startPhysical },
      addressNext: { segment: this.cs, offset: this.ip, physical: endPhysical },
      instructionBytes,
      mnemonic,
      operands: operandsText,
      disassembly: operandsText ? `${mnemonic.toLowerCase()} ${operandsText}` : mnemonic.toLowerCase(),
      registersBefore: snapBefore.registers,
      registersAfter: snapAfter.registers,
      flagsBefore: snapBefore.flags,
      flagsAfter: snapAfter.flags,
      memoryReads: [...this.currentMemoryReads],
      memoryWrites: [...this.currentMemoryWrites],
      stackChanges: [...this.currentStackChanges],
      stdoutDelta,
      stdoutTotal: this.stdout,
      halted: this.halted,
      terminated: this.terminated,
      exitCode: this.exitCode,
    };
  }

  // ALU binary computation helper
  private executeAlu8(op: number, a: number, b: number): number {
    let res = 0;
    switch (op) {
      case 0: res = (a + b) & 0xff; this.updateAddFlags8(a, b, res, 0); break; // ADD
      case 1: res = (a | b) & 0xff; this.updateLogicFlags8(res); break; // OR
      case 2: { // ADC
        const c = this.cf ? 1 : 0;
        res = (a + b + c) & 0xff;
        this.updateAddFlags8(a, b, res, c);
        break;
      }
      case 3: { // SBB
        const c = this.cf ? 1 : 0;
        res = (a - b - c) & 0xff;
        this.updateSubFlags8(a, b, res, c);
        break;
      }
      case 4: res = (a & b) & 0xff; this.updateLogicFlags8(res); break; // AND
      case 5: res = (a - b) & 0xff; this.updateSubFlags8(a, b, res, 0); break; // SUB
      case 6: res = (a ^ b) & 0xff; this.updateLogicFlags8(res); break; // XOR
      case 7: res = (a - b) & 0xff; this.updateSubFlags8(a, b, res, 0); break; // CMP
    }
    return res;
  }

  private executeAlu16(op: number, a: number, b: number): number {
    let res = 0;
    switch (op) {
      case 0: res = (a + b) & 0xffff; this.updateAddFlags16(a, b, res, 0); break; // ADD
      case 1: res = (a | b) & 0xffff; this.updateLogicFlags16(res); break; // OR
      case 2: { // ADC
        const c = this.cf ? 1 : 0;
        res = (a + b + c) & 0xffff;
        this.updateAddFlags16(a, b, res, c);
        break;
      }
      case 3: { // SBB
        const c = this.cf ? 1 : 0;
        res = (a - b - c) & 0xffff;
        this.updateSubFlags16(a, b, res, c);
        break;
      }
      case 4: res = (a & b) & 0xffff; this.updateLogicFlags16(res); break; // AND
      case 5: res = (a - b) & 0xffff; this.updateSubFlags16(a, b, res, 0); break; // SUB
      case 6: res = (a ^ b) & 0xffff; this.updateLogicFlags16(res); break; // XOR
      case 7: res = (a - b) & 0xffff; this.updateSubFlags16(a, b, res, 0); break; // CMP
    }
    return res;
  }

  // Handle Interrupts: DOS INT 21h, INT 20h, BIOS INT 10h
  private handleInterrupt(intNum: number) {
    if (intNum === 0x20) {
      // DOS 1.0+ Program Terminate
      this.terminated = true;
      this.exitCode = 0;
      return;
    }

    if (intNum === 0x21) {
      // DOS Services
      const ah = this.ah;
      switch (ah) {
        case 0x09: { // Display String DS:DX terminated by '$'
          let off = this.dx;
          let count = 0;
          while (count < 65536) {
            const ch = this.readByte(this.ds, off, true);
            if (ch === 0x24) break; // '$'
            this.stdout += String.fromCharCode(ch);
            off = (off + 1) & 0xffff;
            count++;
          }
          break;
        }
        case 0x02: { // Display Character in DL
          const ch = this.dl;
          this.stdout += String.fromCharCode(ch);
          break;
        }
        case 0x01: { // Read Character with Echo
          if (this.stdinBuffer.length > 0) {
            const char = this.stdinBuffer[0];
            this.stdinBuffer = this.stdinBuffer.slice(1);
            this.al = char.charCodeAt(0);
            this.stdout += char;
          } else {
            this.al = 0x0d; // Default Enter
          }
          break;
        }
        case 0x08: { // Read Character without Echo
          if (this.stdinBuffer.length > 0) {
            const char = this.stdinBuffer[0];
            this.stdinBuffer = this.stdinBuffer.slice(1);
            this.al = char.charCodeAt(0);
          } else {
            this.al = 0;
          }
          break;
        }
        case 0x4c: { // Terminate Process with Return Code AL
          this.terminated = true;
          this.exitCode = this.al;
          break;
        }
        default:
          // Unsupported DOS service: safe no-op
          break;
      }
      return;
    }

    if (intNum === 0x10) {
      // BIOS Video Services
      const ah = this.ah;
      if (ah === 0x0e) { // Teletype output
        this.stdout += String.fromCharCode(this.al);
      }
      return;
    }
  }

  private encodeFlags(): number {
    let f = 0x0002; // Bit 1 is always 1 on 8086
    if (this.cf) f |= 1 << 0;
    if (this.pf) f |= 1 << 2;
    if (this.af) f |= 1 << 4;
    if (this.zf) f |= 1 << 6;
    if (this.sf) f |= 1 << 7;
    if (this.tf) f |= 1 << 8;
    if (this.if_) f |= 1 << 9;
    if (this.df) f |= 1 << 10;
    if (this.of) f |= 1 << 11;
    return f;
  }

  private decodeFlags(f: number) {
    this.cf = (f & (1 << 0)) !== 0;
    this.pf = (f & (1 << 2)) !== 0;
    this.af = (f & (1 << 4)) !== 0;
    this.zf = (f & (1 << 6)) !== 0;
    this.sf = (f & (1 << 7)) !== 0;
    this.tf = (f & (1 << 8)) !== 0;
    this.if_ = (f & (1 << 9)) !== 0;
    this.df = (f & (1 << 10)) !== 0;
    this.of = (f & (1 << 11)) !== 0;
  }
}
