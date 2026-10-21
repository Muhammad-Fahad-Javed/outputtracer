# 8086 assembly lab

## Implementation

`POST /api/asm` keeps an in-memory session (`src/lib/asm/session.ts`) and steps `Cpu8086` (`src/lib/asm/cpu8086.ts`), a JavaScript emulator with a 1 MB address space and a subset of DOS `INT 21h`. The assembled bytes are loaded into that memory. They are not jumped to as a host process.

Native `nasm` is used when the sandbox planner accepts it (`src/lib/asm/nasmRunner.ts`). If `nasm` is missing or the spawn throws, the builtin assembler runs. This host has no `nasm`.

## Production check

`POST https://outputtracer.com/api/asm` with:

```asm
org 100h
mov ax, 1
add ax, 2
int 20h
```

Response: `success: true`, `engineUsed: builtin-nasm-compat`, `binaryLength: 8`, no diagnostics. One request. Stepping that session was not continued, so register values were not read back from production.

## Unit tests

`src/lib/asm/asm.test.ts`: 19 tests passed. They cover the emulator. They are the evidence for MOV, ADD, and the other instructions those tests name. This audit did not re-derive every flag by hand beyond that suite.

## Limits

- Unsupported instructions should surface as diagnostics or a stopped machine. The UI copy in `AssemblyLab` / `DosboxWorkspace` is the place students see the engine name.
- Sessions are unauthenticated UUIDs. Guessing a UUID joins that session.
- `run` is a synchronous loop. Source size is checked after JSON parse. There is no global cap on session count. Idle cleanup is 15 minutes (`session.ts`).
- A native `nasm` spawn failure falls through to the builtin assembler (`nasmRunner.ts`). The response can say the builtin engine worked after the native tool crashed.
- Students cannot pass a shell command through the assembler. The builtin path never calls a shell. Native `nasm` is an argv array under the sandbox planner.

`pending_asm_code` from a lesson is applied by `AssemblyLab`. That path is separate from the C++ predictor key and was already wired.
