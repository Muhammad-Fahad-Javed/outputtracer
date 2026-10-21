async function testAsm() {
  const cases = [
    {
      name: "Phase 5 Test 1: Basic Output via DOS INT 21h AH=09h",
      source: `
        org 100h
        section .text
        start:
          mov dx, msg
          mov ah, 09h
          int 21h
          mov ax, 4c00h
          int 21h
        section .data
        msg db 'Hello, Assembly OutputTracer!$'
      `,
      stdin: "",
    },
    {
      name: "Phase 5 Test 2: Arithmetic Loop (sum 1..5)",
      source: `
        org 100h
        mov cx, 5
        xor ax, ax
      loop_top:
        add ax, cx
        dec cx
        jnz loop_top
        mov ax, 4c00h
        int 21h
      `,
      stdin: "",
    },
    {
      name: "Phase 5 Test 3: Invalid Assembly Syntax",
      source: `
        org 100h
        invalid_instruction_xyz ax, bx
        mov ax, [broken syntax
      `,
      stdin: "",
    },
    {
      name: "Phase 5 Test 4: Infinite Loop Protection",
      source: `
        org 100h
      hang:
        jmp hang
      `,
      stdin: "",
    },
  ];

  for (const tc of cases) {
    console.log(`\n=== Running: ${tc.name} ===`);
    try {
      const res = await fetch("http://localhost:3000/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assemble",
          source: tc.source,
          stdin: tc.stdin,
        }),
      });
      const data = await res.json();
      console.log(`Assemble success: ${data.success}`);
      if (!data.success) {
        console.log("Diagnostics:", data.assembleResult?.diagnostics || data.error);
        continue;
      }

      // If assembled, run it
      const runRes = await fetch("http://localhost:3000/api/asm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          sessionId: data.sessionId,
          limit: 100,
        }),
      });
      const runData = await runRes.json();
      console.log(`Run status: ${runData.status?.state}, steps: ${runData.steps?.length}, stdout: ${JSON.stringify(runData.status?.stdout)}, ax: 0x${runData.status?.registers?.ax?.toString(16)}`);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }
}

testAsm();
