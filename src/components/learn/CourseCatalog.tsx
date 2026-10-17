"use client";

import { useState } from "react";
import CourseCard from "./CourseCard";
import { LearnCourse } from "@/lib/learn/types";
import { Sparkles, Terminal, Cpu, Code2 } from "lucide-react";

interface CourseCatalogProps {
  initialCourses: LearnCourse[];
}

export default function CourseCatalog({ initialCourses }: CourseCatalogProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");

  const filteredCourses =
    selectedLanguage === "all"
      ? initialCourses
      : initialCourses.filter((c) => c.languageSlug === selectedLanguage);

  return (
    <div className="space-y-8">
      {/* Language Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#EAEAEA] pb-4">
        <button
          type="button"
          onClick={() => setSelectedLanguage("all")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            selectedLanguage === "all"
              ? "bg-black text-white shadow-sm"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:border-black hover:text-black"
          }`}
        >
          <Sparkles size={13} />
          All Courses ({initialCourses.length})
        </button>

        <button
          type="button"
          onClick={() => setSelectedLanguage("cpp")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            selectedLanguage === "cpp"
              ? "bg-[#005fb8] text-white shadow-sm"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:border-[#005fb8] hover:text-[#005fb8]"
          }`}
        >
          <Code2 size={13} />
          C++
        </button>

        <button
          type="button"
          onClick={() => setSelectedLanguage("8086-assembly")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            selectedLanguage === "8086-assembly"
              ? "bg-[#007ACC] text-white shadow-sm"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:border-[#007ACC] hover:text-[#007ACC]"
          }`}
        >
          <Cpu size={13} />
          8086 NASM Assembly
        </button>

        <button
          type="button"
          onClick={() => setSelectedLanguage("python")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            selectedLanguage === "python"
              ? "bg-[#306998] text-white shadow-sm"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:border-[#306998] hover:text-[#306998]"
          }`}
        >
          <Terminal size={13} />
          Python 3
        </button>
      </div>

      {/* Courses Grid */}
      {filteredCourses.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#CCCCCC] p-12 text-center text-sm text-[#777777]">
          No courses published for this language yet.
        </div>
      )}
    </div>
  );
}
