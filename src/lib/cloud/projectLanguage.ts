import { CLASSROOM_LANGUAGES, isClassroomLanguage, type ClassroomLanguage } from "@/lib/classroom/languages";

export type ProjectLanguage = ClassroomLanguage;

/** Shared labels, entry files and starter code for saved workspaces. */
export const PROJECT_LANGUAGES = CLASSROOM_LANGUAGES;
export const PROJECT_CPP_STANDARDS = ["c++11", "c++14", "c++17", "c++20", "c++23"] as const;

export const isProjectLanguage = isClassroomLanguage;

/** Missing legacy metadata means C++; an unknown language must never run as C++. */
export function projectLanguage(value: unknown): ProjectLanguage {
  if (value === undefined || value === null) return "cpp";
  if (isProjectLanguage(value)) return value;
  throw new Error("This project's language is not supported.");
}

export function projectStandard(language: ProjectLanguage, value: unknown): string | null {
  if (language !== "cpp") return null;
  if (value === undefined || value === null || value === "") return "c++17";
  if (typeof value === "string" && PROJECT_CPP_STANDARDS.some((standard) => standard === value)) return value;
  throw new Error("Choose a supported C++ standard.");
}

export function projectLanguageLabel(language: unknown, standard?: unknown): string {
  const resolved = projectLanguage(language);
  return resolved === "cpp" ? `C++ · ${projectStandard(resolved, standard)}` : PROJECT_LANGUAGES[resolved].label;
}
