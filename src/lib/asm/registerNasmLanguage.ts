import type {OnMount} from "@monaco-editor/react";

/** Monaco does not include NASM syntax by default. Register once per editor runtime. */
export function registerNasmLanguage(monaco: Parameters<NonNullable<OnMount>>[1]) {
  if (monaco.languages.getLanguages().some((language: {id: string}) => language.id === "nasm")) return;
    // Register 8086 NASM monarch tokenizer
    monaco.languages.register({ id: "nasm" });
    monaco.languages.setMonarchTokensProvider("nasm", {
      defaultToken: "",
      ignoreCase: true,
      keywords: [
        "mov", "xchg", "lea", "add", "adc", "sub", "sbb", "inc", "dec", "neg", "cmp",
        "and", "or", "xor", "test", "not", "jmp", "jo", "jno", "jb", "jc", "jnae",
        "jae", "jnb", "jnc", "jz", "je", "jnz", "jne", "jbe", "jna", "ja", "jnbe",
        "js", "jns", "jp", "jpe", "jnp", "jpo", "jl", "jnge", "jge", "jnl", "jle",
        "jng", "jg", "jnle", "loop", "loope", "loopz", "loopne", "loopnz", "jcxz",
        "call", "ret", "push", "pop", "pushf", "popf", "nop", "hlt", "int", "int3",
        "clc", "stc", "cli", "sti", "cld", "std", "cmc",
      ],
      directives: [
        "org", "bits", "section", "global", "extern", "equ", "db", "dw", "dd", "resb", "resw", "cpu",
      ],
      registers: [
        "ax", "ah", "al", "bx", "bh", "bl", "cx", "ch", "cl", "dx", "dh", "dl",
        "sp", "bp", "si", "di", "ip", "cs", "ds", "es", "ss",
      ],
      tokenizer: {
        root: [
          [/;.*$/, "comment"],
          [/'[^']*'/, "string"],
          [/"[^"]*"/, "string"],
          [/0x[0-9a-fA-F]+/, "number.hex"],
          [/[0-9][0-9a-fA-F]*h/i, "number.hex"],
          [/[01]+b/i, "number.binary"],
          [/\d+/, "number"],
          [/byte|word|ptr/i, "type"],
          [
            /[a-zA-Z_$.][a-zA-Z0-9_$.]*/,
            {
              cases: {
                "@keywords": "keyword",
                "@directives": "tag",
                "@registers": "variable.predefined",
                "@default": "identifier",
              },
            },
          ],
        ],
      },
    });

}
