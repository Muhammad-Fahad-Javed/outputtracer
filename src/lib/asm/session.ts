// Execution Session Manager for isolated 8086 NASM sessions

import crypto from "crypto";
import { Cpu8086 } from "./cpu8086";
import { assemble8086 } from "./assembler";
import { assembleWithNasmOrFallback } from "./nasmRunner";
import {
  AssembleResult,
  AsmTraceStep,
  AsmExecutionStatus,
  AsmInstructionInfo,
} from "./types";

export interface SessionConfig {
  source: string;
  maxSteps?: number;
  stdin?: string;
  /** Rate-limit key (client IP). Caps how many live sessions one caller can hold. */
  ownerKey?: string;
}

const MAX_SESSIONS = 200;
const MAX_SESSIONS_PER_OWNER = 4;
const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSION_STEPS = 5000;

export class AsmSession {
  public readonly id: string;
  public readonly token: string;
  public readonly ownerKey: string;
  public readonly createdAt: number;
  public lastActiveAt: number;

  public source: string;
  public assembleResult?: AssembleResult;
  public cpu: Cpu8086;
  public traceHistory: AsmTraceStep[] = [];
  public maxSteps: number;

  public stdin: string;

  constructor(id: string, token: string, source: string, maxSteps = 2000, stdin = "", ownerKey = "") {
    this.id = id;
    this.token = token;
    this.ownerKey = ownerKey;
    this.createdAt = Date.now();
    this.lastActiveAt = Date.now();
    this.source = source;
    this.maxSteps = maxSteps;
    this.stdin = stdin;
    this.cpu = new Cpu8086();
    this.cpu.stdinBuffer = stdin;
  }

  public async assemble(): Promise<AssembleResult> {
    this.lastActiveAt = Date.now();
    this.assembleResult = await assembleWithNasmOrFallback(this.source);
    if (this.assembleResult.success) {
      this.reset();
    }
    return this.assembleResult;
  }

  public assembleSync(): AssembleResult {
    this.lastActiveAt = Date.now();
    this.assembleResult = assemble8086(this.source);
    if (this.assembleResult.success) {
      this.reset();
    }
    return this.assembleResult;
  }

  public reset() {
    this.lastActiveAt = Date.now();
    if (!this.assembleResult || !this.assembleResult.success) return;
    this.cpu.loadBinary(
      this.assembleResult.binary,
      this.assembleResult.loadAddress.segment,
      this.assembleResult.loadAddress.offset
    );
    this.cpu.stdinBuffer = this.stdin;
    this.traceHistory = [];
  }

  public step(): AsmTraceStep {
    this.lastActiveAt = Date.now();
    const step = this.cpu.step();

    // Map source line
    if (this.assembleResult) {
      const line = this.assembleResult.sourceMap.get(step.addressBefore.offset);
      step.sourceLine = line;
      if (line !== undefined) {
        const lines = this.source.split("\n");
        step.sourceText = lines[line - 1];
      }
    }

    if (this.traceHistory.length >= this.maxSteps) {
      this.traceHistory.shift();
    }
    this.traceHistory.push(step);
    return step;
  }

  public stepBack(): boolean {
    this.lastActiveAt = Date.now();
    if (this.traceHistory.length === 0) return false;
    const ok = this.cpu.stepBack();
    if (ok) {
      this.traceHistory.pop();
    }
    return ok;
  }

  public run(limit?: number): AsmTraceStep[] {
    this.lastActiveAt = Date.now();
    const effectiveLimit = Math.min(limit || 1000, this.maxSteps, MAX_SESSION_STEPS);
    const newSteps: AsmTraceStep[] = [];

    let count = 0;
    while (!this.cpu.halted && !this.cpu.terminated && count < effectiveLimit) {
      const step = this.step();
      newSteps.push(step);
      count++;
    }

    return newSteps;
  }

  public getStatus(): AsmExecutionStatus {
    const snap = this.cpu.takeSnapshot();
    const currentStepNum = this.traceHistory.length;

    let currentInstruction: AsmInstructionInfo | undefined;
    if (!this.cpu.halted && !this.cpu.terminated) {
      const seg = this.cpu.cs;
      const off = this.cpu.ip;
      const bytes: number[] = [];
      for (let i = 0; i < 4; i++) {
        bytes.push(this.cpu.readByte(seg, off + i, false));
      }
      const line = this.assembleResult?.sourceMap.get(off);
      const lines = this.source.split("\n");
      currentInstruction = {
        address: off,
        segment: seg,
        offset: off,
        bytes,
        mnemonic: "NEXT",
        operandsText: "",
        disassembly: line !== undefined ? (lines[line - 1] || "").trim() : `CS:0x${off.toString(16)}`,
        sourceLine: line,
        sourceText: line !== undefined ? lines[line - 1] : undefined,
      };
    }

    return {
      state: this.cpu.terminated ? "terminated" : this.cpu.halted ? "halted" : "ready",
      currentStep: currentStepNum,
      totalSteps: currentStepNum,
      currentInstruction,
      registers: snap.registers,
      flags: snap.flags,
      stdout: this.cpu.stdout,
      exitCode: this.cpu.exitCode,
      canStepForward: !this.cpu.halted && !this.cpu.terminated,
      canStepBack: this.traceHistory.length > 0,
    };
  }
}

// Global active sessions registry
class SessionManager {
  private sessions: Map<string, AsmSession> = new Map();

  constructor() {
    if (typeof setInterval !== "undefined" && process.env.NODE_ENV !== "test") {
      setInterval(() => this.cleanup(), 5 * 60 * 1000).unref?.();
    }
  }

  public createSession(config: SessionConfig): AsmSession {
    this.cleanup();
    const ownerKey = config.ownerKey || "";
    if (ownerKey) {
      const owned = [...this.sessions.values()].filter((session) => session.ownerKey === ownerKey);
      while (owned.length >= MAX_SESSIONS_PER_OWNER) {
        const oldest = owned.sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
        this.sessions.delete(oldest.id);
        owned.shift();
      }
    }
    while (this.sessions.size >= MAX_SESSIONS) {
      this.evictOldest();
    }

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString("base64url");
    const maxSteps = Math.min(config.maxSteps || 2000, MAX_SESSION_STEPS);
    const session = new AsmSession(id, token, config.source, maxSteps, config.stdin || "", ownerKey);
    this.sessions.set(id, session);
    return session;
  }

  public getSession(id: string): AsmSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastActiveAt = Date.now();
    return session;
  }

  /** Session ids are not sufficient. Callers must present the token from create. */
  public authorize(id: string, token: string | undefined): AsmSession | undefined {
    if (!id || !token) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    const left = Buffer.from(session.token);
    const right = Buffer.from(token);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return undefined;
    }
    session.lastActiveAt = Date.now();
    return session;
  }

  private evictOldest() {
    let oldest: AsmSession | undefined;
    for (const session of this.sessions.values()) {
      if (!oldest || session.lastActiveAt < oldest.lastActiveAt) oldest = session;
    }
    if (oldest) this.sessions.delete(oldest.id);
  }

  public deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  public cleanup(maxAgeMs = 15 * 60 * 1000) {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();
