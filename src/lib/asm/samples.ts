// Starter 8086 NASM assembly example programs

import { AsmExample } from "./types";

export const ASM_EXAMPLES: AsmExample[] = [
  {
    id: "hello-dos",
    title: "Hello World (DOS INT 21h)",
    category: "DOS Services",
    description: "Classic 16-bit DOS program using INT 21h function 09h to print a string and 4Ch to terminate.",
    code: `; OutputTracer 8086 Assembly Lab
; DOS INT 21h Hello World (.COM format)
org 100h

start:
    ; Point DX to the $-terminated message
    mov dx, msg
    ; DOS function 09h: Print string
    mov ah, 09h
    int 21h

    ; DOS function 4Ch: Terminate with exit code 0
    mov ax, 4c00h
    int 21h

msg:
    db 'Hello, 8086 Assembly World!', 0dh, 0ah, '$'
`,
    expectedOutput: "Hello, 8086 Assembly World!\r\n",
  },
  {
    id: "arithmetic-flags",
    title: "Arithmetic & Flags Inspection",
    category: "Arithmetic & Flags",
    description: "Demonstrates ADD, SUB, INC, DEC, CMP and how CF, ZF, SF, OF are set and preserved.",
    code: `; Inspecting 8086 Arithmetic and CPU Flags
org 100h

start:
    mov ax, 0005h
    add ax, 0003h       ; AX = 8, ZF=0, CF=0

    sub ax, 0008h       ; AX = 0, ZF=1, SF=0
    
    ; Carry Flag demonstration
    mov bx, 0ffffh
    add bx, 0001h       ; BX = 0, CF=1, ZF=1

    ; INC preserves CF!
    stc                 ; Set Carry Flag (CF=1)
    mov cx, 0004h
    inc cx              ; CX = 5, CF remains 1!

    ; Signed Overflow demonstration
    mov dx, 7fffh       ; Maximum positive signed 16-bit integer
    add dx, 0001h       ; DX = 8000h (negative!), OF=1, SF=1

    hlt
`,
  },
  {
    id: "loop-counter",
    title: "Loop & Array Summation",
    category: "Loops & Arrays",
    description: "Iterate over an array of numbers using base-index addressing [bx+si] and LOOP instruction.",
    code: `; Summing an array of 5 words
org 100h

start:
    mov cx, 5           ; Loop counter (5 elements)
    xor ax, ax          ; AX = accumulator (0)
    mov bx, numbers     ; Base address of array
    xor si, si          ; SI = index offset (0)

.sum_loop:
    add ax, [bx+si]     ; Add current number to AX
    add si, 2           ; Advance index by 2 bytes (word size)
    loop .sum_loop      ; Decrements CX, jumps if CX != 0

    ; Store total at sum
    mov [sum], ax
    hlt

numbers:
    dw 10, 20, 30, 40, 50
sum:
    dw 0
`,
  },
  {
    id: "stack-subroutine",
    title: "Stack & CALL / RET Subroutine",
    category: "Procedures & Stack",
    description: "Demonstrates PUSH, POP, stack frame tracking, CALL and RET return address restoration.",
    code: `; Calling a subroutine with parameter on stack
org 100h

start:
    mov ax, 0015h
    push ax             ; Pass 21 as argument

    call square_proc    ; Push return IP and jump

    pop bx              ; Clean up argument from stack
    hlt

square_proc:
    push bp             ; Preserve base pointer
    mov bp, sp          ; Set up stack frame

    mov ax, [bp+4]      ; Load argument (21)
    mov bx, ax
    ; Simple double addition
    add ax, bx          ; AX = 42

    pop bp              ; Restore base pointer
    ret                 ; Return to caller
`,
  },
  {
    id: "character-output",
    title: "Direct Character Output (AH=02h)",
    category: "DOS Services",
    description: "Prints characters one-by-one in a loop using DOS INT 21h service 02h.",
    code: `; Print characters 'A' through 'E' using DOS INT 21h AH=02h
org 100h

start:
    mov dl, 'A'         ; Starting character
    mov cx, 5           ; Print 5 characters

.print_char:
    mov ah, 02h         ; DOS display character in DL
    int 21h

    inc dl              ; Next character
    loop .print_char

    ; Terminate
    mov ax, 4c00h
    int 21h
`,
    expectedOutput: "ABCDE",
  },
];

export const DEFAULT_ASM_CODE = ASM_EXAMPLES[0].code;
