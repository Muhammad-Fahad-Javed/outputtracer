import { LearnLanguage, LearnCourse, LearnModule, LearnLesson, LearnQuestion } from "./types";

export const INITIAL_LANGUAGES: LearnLanguage[] = [
  {
    id: "cpp",
    name: "C++",
    description: "High-performance systems programming with strong typing and direct memory control.",
    icon: "Cpu",
    display_order: 1,
    is_published: true,
  },
  {
    id: "asm8086",
    name: "8086 NASM Assembly",
    description: "Low-level x86 architecture, CPU registers, flags, memory segmentation, and DOS interrupts.",
    icon: "Binary",
    display_order: 2,
    is_published: true,
  },
  {
    id: "python",
    name: "Python 3",
    description: "Modern, readable, high-level programming language widely used in AI, data science, and web development.",
    icon: "Terminal",
    display_order: 3,
    is_published: true,
  },
];

export const INITIAL_COURSES: LearnCourse[] = [
  {
    id: "cpp-mastery",
    language_id: "cpp",
    title: "C++ Fundamentals & Execution Tracing",
    description: "Master C++ syntax, variable scoping, pointers, memory models, loops, and mental-model output prediction.",
    difficulty: "Beginner",
    estimated_duration: "6-8 hours",
    thumbnail_icon: "Code",
    display_order: 1,
    is_published: true,
    lesson_count: 4,
    question_count: 4,
  },
  {
    id: "8086-assembly-mastery",
    language_id: "asm8086",
    title: "8086 Assembly & Real Mode Architecture",
    description: "Understand 16-bit registers, flags register behavior, segmented memory addressing, stack calling conventions, and DOS INT 21h.",
    difficulty: "Intermediate",
    estimated_duration: "5-7 hours",
    thumbnail_icon: "Cpu",
    display_order: 2,
    is_published: true,
    lesson_count: 4,
    question_count: 4,
  },
];

export const INITIAL_MODULES: LearnModule[] = [
  // C++ Modules
  {
    id: "cpp-mod-basics",
    course_id: "cpp-mastery",
    title: "Module 1: Syntax & Variables",
    description: "Core C++ types, scope, initialization, and operator behaviors.",
    display_order: 1,
    is_published: true,
  },
  {
    id: "cpp-mod-memory",
    course_id: "cpp-mastery",
    title: "Module 2: Pointers & References",
    description: "Stack vs heap memory, pointer arithmetic, and reference binding.",
    display_order: 2,
    is_published: true,
  },

  // 8086 Assembly Modules
  {
    id: "asm-mod-architecture",
    course_id: "8086-assembly-mastery",
    title: "Module 1: 8086 CPU Architecture & Registers",
    description: "General registers, pointers, segment registers, and CPU flags.",
    display_order: 1,
    is_published: true,
  },
  {
    id: "asm-mod-dos-control",
    course_id: "8086-assembly-mastery",
    title: "Module 2: Control Flow & DOS INT 21h Services",
    description: "Conditional jumps, loop instructions, and DOS terminal I/O services.",
    display_order: 2,
    is_published: true,
  },
];

export const INITIAL_LESSONS: LearnLesson[] = [
  // C++ Lesson 1
  {
    id: "cpp-scope-shadowing",
    module_id: "cpp-mod-basics",
    course_id: "cpp-mastery",
    title: "Variable Scope & Shadowing in C++",
    display_order: 1,
    is_published: true,
    notes: `### Understanding Scope and Variable Shadowing

In C++, variable **scope** defines the region of a program where a variable is accessible. When a local variable within a block shares the exact same name as an outer or global variable, **variable shadowing** occurs.

#### Key Rules:
1. **Block Scope**: Variables declared within braces \`{ ... }\` exist only until the closing brace.
2. **Inner Shadowing**: The inner variable temporarily hides the outer variable with the same name.
3. **Global Scope Operator \`::\`**: You can explicitly access the global variable by prefixing the variable with the unary scope resolution operator \`::\`.

\`\`\`cpp
#include <iostream>

int counter = 100; // Global

int main() {
    int counter = 20; // Shadows global counter
    {
        int counter = 5; // Shadows main's counter
        std::cout << ::counter << " " << counter << std::endl;
    }
    return 0;
}
\`\`\`

#### Mental Model Checklist:
- Identify every variable definition level (Global, Function, Inner Block).
- When a name is evaluated, the compiler searches **innermost to outermost**.
- Use \`::var\` to bypass all local shadowings and read global state directly.
`,
    code_snippet: `#include <iostream>

int x = 10;

int main() {
    int x = 20;
    {
        int x = 30;
        std::cout << ::x << " " << x;
    }
    return 0;
}`,
    expected_output: "10 30",
    explanation: "::x refers to global x (10), while x inside the block refers to the inner local x (30).",
  },
  // C++ Lesson 2
  {
    id: "cpp-pointers-dereferencing",
    module_id: "cpp-mod-memory",
    course_id: "cpp-mastery",
    title: "Pointers, Addresses, and Dereferencing",
    display_order: 2,
    is_published: true,
    notes: `### Memory Models: Pointers and Dereferencing

A pointer in C++ is a variable that stores the **memory address** of another variable.

#### Fundamentals:
- Address-of operator (\`&\`): Retrieves the physical memory address of an object.
- Dereference operator (\`*\`): Reads or writes the value stored at that address.

\`\`\`cpp
int value = 42;
int* ptr = &value; // ptr stores address of value
*ptr = 99;         // Modifies value through ptr
\`\`\`

#### Common Pitfalls:
- Dereferencing uninitialized or \`nullptr\` pointers causes segmentation faults.
- Pointer arithmetic advances by \`sizeof(*ptr)\` bytes, not single bytes.
`,
    code_snippet: `#include <iostream>

int main() {
    int a = 15;
    int* p = &a;
    *p += 10;
    std::cout << a;
    return 0;
}`,
    expected_output: "25",
    explanation: "*p += 10 dereferences p and modifies a directly in memory, making a equal to 25.",
  },

  // 8086 Assembly Lesson 1
  {
    id: "asm-registers-sizes",
    module_id: "asm-mod-architecture",
    course_id: "8086-assembly-mastery",
    title: "8086 Registers: AX, BX, CX, DX and 8-bit Halves",
    display_order: 1,
    is_published: true,
    notes: `### 8086 16-Bit Architecture and Register Halves

The Intel 8086 is a **16-bit microprocessor**. It features four 16-bit general-purpose data registers: **AX, BX, CX, DX**. Each can also be accessed as two separate 8-bit registers:
- **AX**: \`AH\` (High byte, bits 15-8) and \`AL\` (Low byte, bits 7-0).
- **BX**: \`BH\` and \`BL\` (Base register, commonly used for memory addressing).
- **CX**: \`CH\` and \`CL\` (Count register, automatically used by \`LOOP\`).
- **DX**: \`DH\` and \`DL\` (Data register, used by DOS \`INT 21h\` calls).

#### Little-Endian Representation:
When a 16-bit word like \`1234h\` is loaded into AX:
- \`AH = 12h\`
- \`AL = 34h\`
`,
    code_snippet: `; Loading registers and examining 8-bit halves
org 100h

start:
    mov ax, 1234h
    mov bl, al        ; BL = 34h
    mov bh, ah        ; BH = 12h
    hlt`,
    expected_output: "AX=1234h, BX=1234h",
    explanation: "Loading AX with 1234h assigns 12h to AH and 34h to AL. Copying them to BH and BL reconstructs 1234h in BX.",
  },
  // 8086 Assembly Lesson 2
  {
    id: "asm-dos-int21h-string",
    module_id: "asm-mod-dos-control",
    course_id: "8086-assembly-mastery",
    title: "DOS INT 21h Function 09h: Displaying Strings",
    display_order: 2,
    is_published: true,
    notes: `### DOS INT 21h Services and String Output

Under 16-bit DOS Real Mode (.COM flat binaries):
- **\`INT 21h\`** is the universal DOS API interrupt.
- **\`AH = 09h\`**: Prints a string to standard output. The string address must be placed in **\`DX\`** (relative to \`DS\`) and must be terminated by a dollar sign (\`$\`).
- **\`AH = 4Ch\`**: Exits the process and returns control to DOS with an exit code in \`AL\` (\`AX = 4C00h\`).

\`\`\`nasm
org 100h

start:
    mov dx, msg
    mov ah, 09h
    int 21h

    mov ax, 4c00h
    int 21h

msg:
    db 'OutputTracer DOS$', 0
\`\`\`
`,
    code_snippet: `org 100h

start:
    mov dx, msg
    mov ah, 09h
    int 21h

    mov ax, 4c00h
    int 21h

msg:
    db 'Hello 8086$', 0`,
    expected_output: "Hello 8086",
    explanation: "INT 21h function 09h prints characters starting at DS:DX until the terminator '$' is reached.",
  },
];

export const INITIAL_QUESTIONS: LearnQuestion[] = [
  {
    id: "q-cpp-scope-01",
    lesson_id: "cpp-scope-shadowing",
    course_id: "cpp-mastery",
    type: "exact_output",
    title: "Scope Shadowing Prediction",
    question_text: "What does the following C++ program print?",
    code_snippet: `#include <iostream>

int x = 10;

int main() {
    int x = 20;
    {
        int x = 30;
        std::cout << ::x << " " << x;
    }
    return 0;
}`,
    answer: "10 30",
    explanation: "::x accesses global scope (10), while the local x inside the block evaluates to 30.",
    hint: "Notice the :: prefix before the first x.",
    points: 10,
    difficulty: "Easy",
    display_order: 1,
    is_published: true,
  },
  {
    id: "q-cpp-ptr-01",
    lesson_id: "cpp-pointers-dereferencing",
    course_id: "cpp-mastery",
    type: "exact_output",
    title: "Pointer Value Mutation",
    question_text: "What will this C++ code output to the terminal?",
    code_snippet: `#include <iostream>

int main() {
    int a = 15;
    int* p = &a;
    *p += 10;
    std::cout << a;
    return 0;
}`,
    answer: "25",
    explanation: "The pointer p points to a. Dereferencing *p and adding 10 modifies a directly in memory to 25.",
    hint: "*p modifies the variable whose address is in p.",
    points: 10,
    difficulty: "Easy",
    display_order: 2,
    is_published: true,
  },
  {
    id: "q-asm-reg-01",
    lesson_id: "asm-registers-sizes",
    course_id: "8086-assembly-mastery",
    type: "multiple_choice",
    title: "8086 Register High Byte Identification",
    question_text: "If the 16-bit register AX contains the value 0x5678, what does AH contain?",
    options: ["0x78", "0x56", "0x5678", "0x00"],
    answer: "0x56",
    explanation: "AH is the high byte (bits 15-8), which holds 0x56. AL is the low byte (bits 7-0), which holds 0x78.",
    hint: "AH stands for Accumulator High.",
    points: 10,
    difficulty: "Easy",
    display_order: 1,
    is_published: true,
  },
  {
    id: "q-asm-dos-01",
    lesson_id: "asm-dos-int21h-string",
    course_id: "8086-assembly-mastery",
    type: "multiple_choice",
    title: "DOS INT 21h String Termination Character",
    question_text: "Which character terminates a string printed via DOS INT 21h function AH=09h?",
    options: ["Null byte (\\0)", "Dollar sign ($)", "Carriage Return (\\r)", "Asterisk (*)"],
    answer: "Dollar sign ($)",
    explanation: "DOS service 09h prints characters from DS:DX until it encounters a dollar sign '$'.",
    hint: "The character is commonly used in CP/M and DOS 1.0 conventions.",
    points: 10,
    difficulty: "Easy",
    display_order: 2,
    is_published: true,
  },
];
