export type ClassroomLanguage = "cpp" | "python" | "asm8086";
export const CLASSROOM_LANGUAGES = {
  cpp: { label: "C++", file: "main.cpp", monaco: "cpp", starter: "#include <iostream>\n\nint main() {\n    // Write your solution here.\n    return 0;\n}\n" },
  python: { label: "Python 3", file: "main.py", monaco: "python", starter: "def main():\n    # Write your solution here.\n    pass\n\nif __name__ == '__main__':\n    main()\n" },
  asm8086: { label: "8086 Assembly (NASM)", file: "main.asm", monaco: "asm", starter: "bits 16\norg 100h\n\n; Write your solution here.\n\nmov ax, 4c00h\nint 21h\n" },
} as const;
export function isClassroomLanguage(value: unknown): value is ClassroomLanguage {
  return value === "cpp" || value === "python" || value === "asm8086";
}
export function classroomLanguage(value: unknown, subject = ""): ClassroomLanguage {
  if (isClassroomLanguage(value)) return value;
  if (/nasm|assembly|8086/i.test(subject)) return "asm8086";
  if (/python/i.test(subject)) return "python";
  return "cpp";
}
