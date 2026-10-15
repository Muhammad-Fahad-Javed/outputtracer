import { describe, expect, it } from "vitest";
import { Cpu8086 } from "./cpu8086";
import { assemble8086 } from "./assembler";
import { AsmSession, sessionManager } from "./session";

describe("8086 NASM Assembly Engine - Required Test Suite", () => {
  // Test 1: MOV and basic register state
  it("1. MOV and basic register state", () => {
    const src = `
      org 100h
      mov ax, 1234h
      mov bx, ax
      mov cl, 42h
      mov ch, 0ffh
      mov dx, cx
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    while (!cpu.halted && cpu.instructionCount < 10) {
      cpu.step();
    }

    expect(cpu.ax).toBe(0x1234);
    expect(cpu.bx).toBe(0x1234);
    expect(cpu.cl).toBe(0x42);
    expect(cpu.ch).toBe(0xff);
    expect(cpu.cx).toBe(0xff42);
    expect(cpu.dx).toBe(0xff42);
  });

  // Test 2: ADD overflow and carry
  it("2. ADD overflow and carry", () => {
    const src = `
      org 100h
      ; Carry test: FFFFh + 1 = 0000h with CF=1, ZF=1
      mov ax, 0ffffh
      add ax, 0001h

      ; Overflow test: 7FFFh + 1 = 8000h (positive + positive = negative) with OF=1, SF=1
      mov bx, 7fffh
      add bx, 0001h
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    cpu.step(); // mov ax, ffffh
    cpu.step(); // add ax, 1
    expect(cpu.ax).toBe(0);
    expect(cpu.cf).toBe(true);
    expect(cpu.zf).toBe(true);
    expect(cpu.of).toBe(false);

    cpu.step(); // mov bx, 7fffh
    cpu.step(); // add bx, 1
    expect(cpu.bx).toBe(0x8000);
    expect(cpu.of).toBe(true);
    expect(cpu.sf).toBe(true);
    expect(cpu.cf).toBe(false);
  });

  // Test 3: SUB and comparison flags
  it("3. SUB and comparison flags", () => {
    const src = `
      org 100h
      mov ax, 5
      cmp ax, 5       ; Equal: ZF=1, CF=0
      cmp ax, 10      ; Less: CF=1, SF=1, ZF=0
      cmp ax, 2       ; Greater: CF=0, ZF=0, SF=0
      sub ax, 10      ; 5 - 10 = FFFBh: CF=1, SF=1
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    cpu.step(); // mov ax, 5
    cpu.step(); // cmp ax, 5
    expect(cpu.zf).toBe(true);
    expect(cpu.cf).toBe(false);

    cpu.step(); // cmp ax, 10
    expect(cpu.zf).toBe(false);
    expect(cpu.cf).toBe(true);
    expect(cpu.sf).toBe(true);

    cpu.step(); // cmp ax, 2
    expect(cpu.zf).toBe(false);
    expect(cpu.cf).toBe(false);
    expect(cpu.sf).toBe(false);

    cpu.step(); // sub ax, 10
    expect(cpu.ax).toBe(0xfffb);
    expect(cpu.cf).toBe(true);
    expect(cpu.sf).toBe(true);
  });

  // Test 4: INC/DEC flag-preservation rules
  it("4. INC/DEC flag-preservation rules (CF must be preserved)", () => {
    const src = `
      org 100h
      stc             ; Set CF=1
      mov ax, 0005h
      inc ax          ; AX = 6, CF MUST remain 1!
      dec ax          ; AX = 5, CF MUST remain 1!
      clc             ; Clear CF=0
      mov bx, 0ffffh
      inc bx          ; BX = 0, ZF=1, CF MUST remain 0!
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    cpu.step(); // stc
    expect(cpu.cf).toBe(true);

    cpu.step(); // mov ax, 5
    cpu.step(); // inc ax
    expect(cpu.ax).toBe(6);
    expect(cpu.cf).toBe(true); // Crucial 8086 rule: INC does NOT affect CF

    cpu.step(); // dec ax
    expect(cpu.ax).toBe(5);
    expect(cpu.cf).toBe(true); // DEC does NOT affect CF

    cpu.step(); // clc
    expect(cpu.cf).toBe(false);

    cpu.step(); // mov bx, ffffh
    cpu.step(); // inc bx
    expect(cpu.bx).toBe(0);
    expect(cpu.zf).toBe(true);
    expect(cpu.cf).toBe(false); // CF remains 0
  });

  // Test 5: Conditional jumps and loops
  it("5. Conditional jumps and loops", () => {
    const src = `
      org 100h
      mov cx, 5
      xor ax, ax
    .loop_start:
      add ax, 2
      loop .loop_start
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    let steps = 0;
    while (!cpu.halted && steps < 50) {
      cpu.step();
      steps++;
    }

    expect(cpu.cx).toBe(0);
    expect(cpu.ax).toBe(10); // 5 iterations * 2 = 10
  });

  // Test 6: Byte and word memory access
  it("6. Byte and word memory access", () => {
    const src = `
      org 100h
      mov bx, data_area
      mov byte [bx], 42h
      mov word [bx+2], 1234h
      mov al, [bx]
      mov dx, [bx+2]
      hlt
    data_area:
      dw 0, 0
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    while (!cpu.halted) {
      cpu.step();
    }

    expect(cpu.al).toBe(0x42);
    expect(cpu.dx).toBe(0x1234);
  });

  // Test 7: Little-endian memory representation
  it("7. Little-endian memory representation", () => {
    const src = `
      org 100h
      mov bx, val
      mov word [bx], 01234h
      mov al, [bx]       ; Low byte: should be 34h
      mov ah, [bx+1]     ; High byte: should be 12h
      hlt
    val:
      dw 0
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    while (!cpu.halted) {
      cpu.step();
    }

    expect(cpu.al).toBe(0x34);
    expect(cpu.ah).toBe(0x12);
    expect(cpu.ax).toBe(0x1234);
  });

  // Test 8: Stack push/pop and SP restoration
  it("8. Stack push/pop and SP restoration", () => {
    const src = `
      org 100h
      mov ax, 0beefh
      mov bx, 0cafeh
      push ax
      push bx
      pop cx
      pop dx
      hlt
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);
    const initialSp = cpu.sp;

    cpu.step(); // mov ax
    cpu.step(); // mov bx
    cpu.step(); // push ax
    expect(cpu.sp).toBe(initialSp - 2);
    cpu.step(); // push bx
    expect(cpu.sp).toBe(initialSp - 4);
    cpu.step(); // pop cx
    expect(cpu.cx).toBe(0xcafe);
    expect(cpu.sp).toBe(initialSp - 2);
    cpu.step(); // pop dx
    expect(cpu.dx).toBe(0xbeef);
    expect(cpu.sp).toBe(initialSp); // Exact SP restoration
  });

  // Test 9: CALL/RET and return addresses
  it("9. CALL/RET and return addresses", () => {
    const src = `
      org 100h
      mov ax, 10
      call double_it
      add ax, 5
      hlt

    double_it:
      add ax, ax
      ret
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);
    const initialSp = cpu.sp;

    while (!cpu.halted && !cpu.terminated) {
      cpu.step();
    }

    expect(cpu.ax).toBe(25); // (10 * 2) + 5 = 25
    expect(cpu.sp).toBe(initialSp); // Return address popped cleanly
  });

  // Test 10: Segment:offset addressing
  it("10. Segment:offset addressing", () => {
    const cpu = new Cpu8086();
    // Verify physical address calculation: (segment << 4) + offset (wrapped at 20 bits)
    expect(cpu.physical(0x1000, 0x0100)).toBe(0x10100);
    expect(cpu.physical(0x0000, 0x0400)).toBe(0x00400); // BDA
    expect(cpu.physical(0xffff, 0x0010)).toBe(0x00000); // 20-bit wrap
  });

  // Test 11: DOS output and program termination
  it("11. DOS output and program termination", () => {
    const src = `
      org 100h
      mov dx, msg
      mov ah, 09h
      int 21h

      mov dl, '!'
      mov ah, 02h
      int 21h

      mov ax, 4c2ah    ; Exit code 42 (2Ah)
      int 21h
    msg:
      db 'OutputTracer', '$'
    `;
    const asm = assemble8086(src);
    expect(asm.success).toBe(true);

    const cpu = new Cpu8086();
    cpu.loadBinary(asm.binary, 0x1000, 0x0100);

    while (!cpu.terminated && !cpu.halted) {
      cpu.step();
    }

    expect(cpu.terminated).toBe(true);
    expect(cpu.stdout).toBe("OutputTracer!");
    expect(cpu.exitCode).toBe(42);
  });

  // Test 12: Invalid instructions and controlled exceptions
  it("12. Invalid instructions and controlled exceptions", () => {
    const cpu = new Cpu8086();
    // Write undefined opcode into CS:IP
    const pa = cpu.physical(cpu.cs, cpu.ip);
    cpu.memory[pa] = 0x0f; // invalid/unimplemented in strict 8086 subset
    const step = cpu.step();
    expect(cpu.halted).toBe(true);
    expect(step.mnemonic).toContain("DB 0x0f");
  });

  // Test 13: Infinite-loop instruction limits and cancellation
  it("13. Infinite-loop instruction limits and cancellation", () => {
    const src = `
      org 100h
    forever:
      jmp forever
    `;
    const session = new AsmSession("test-loop", src, 100);
    session.assembleSync();

    // Run with limit of 50 steps
    const steps = session.run(50);
    expect(steps.length).toBe(50);
    expect(session.cpu.instructionCount).toBe(50);
    expect(session.getStatus().state).toBe("ready");
  });

  // Test 14: Source-line mapping
  it("14. Source-line mapping", () => {
    const src = `; line 1
org 100h       ; line 2
mov ax, 1      ; line 3
mov bx, 2      ; line 4
add ax, bx     ; line 5
hlt            ; line 6
`;
    const session = new AsmSession("test-src", src);
    session.assembleSync();

    const step1 = session.step();
    expect(step1.sourceLine).toBe(3);
    expect(step1.sourceText?.trim()).toBe("mov ax, 1      ; line 3");

    const step2 = session.step();
    expect(step2.sourceLine).toBe(4);

    const step3 = session.step();
    expect(step3.sourceLine).toBe(5);
  });

  // Test 15: Reset and repeated deterministic execution
  it("15. Reset and repeated deterministic execution with stepBack", () => {
    const src = `
      org 100h
      mov ax, 10
      add ax, 20
      add ax, 30
      hlt
    `;
    const session = new AsmSession("test-replay", src);
    session.assembleSync();

    session.step(); // mov ax, 10
    expect(session.cpu.ax).toBe(10);
    session.step(); // add ax, 20
    expect(session.cpu.ax).toBe(30);

    // Test stepBack (reverse stepping!)
    const backOk = session.stepBack();
    expect(backOk).toBe(true);
    expect(session.cpu.ax).toBe(10);

    // Reset back to initial state
    session.reset();
    expect(session.cpu.ax).toBe(0);
    expect(session.cpu.ip).toBe(0x0100);
    expect(session.traceHistory.length).toBe(0);

    // Re-run
    session.run();
    expect(session.cpu.ax).toBe(60);
  });

  // Test 16: Multiple independent execution sessions
  it("16. Multiple independent execution sessions", () => {
    const sessionA = sessionManager.createSession({
      source: "org 100h\nmov ax, 1111h\nhlt",
    });
    const sessionB = sessionManager.createSession({
      source: "org 100h\nmov ax, 2222h\nhlt",
    });

    sessionA.assembleSync();
    sessionB.assembleSync();

    sessionA.run();
    sessionB.run();

    expect(sessionA.cpu.ax).toBe(0x1111);
    expect(sessionB.cpu.ax).toBe(0x2222);

    sessionManager.deleteSession(sessionA.id);
    sessionManager.deleteSession(sessionB.id);
  });
});
