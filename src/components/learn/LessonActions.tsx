"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Play,
  Copy,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Code2,
} from "lucide-react";
import { setPendingExample } from "@/lib/examples";

interface LessonActionsProps {
  courseId: string;
  courseSlug: string;
  lessonId: string;
  starterCode?: string;
  languageSlug: string;
  previousLesson?: { slug: string; title: string };
  nextLesson?: { slug: string; title: string };
  initialCompleted?: boolean;
}

export default function LessonActions({
  courseId,
  courseSlug,
  lessonId,
  starterCode,
  languageSlug,
  previousLesson,
  nextLesson,
  initialCompleted = false,
}: LessonActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAssembly = languageSlug === "8086-assembly";

  const handleCopy = () => {
    if (!starterCode) return;
    navigator.clipboard.writeText(starterCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInLab = () => {
    if (!starterCode) return;
    if (isAssembly) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pending_asm_code", starterCode);
      }
      router.push("/assembly");
    } else {
      setPendingExample(starterCode);
      router.push("/");
    }
  };

  const handleToggleComplete = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/learn/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_lesson",
          lessonId,
          courseId,
        }),
      });

      if (res.ok) {
        setIsCompleted(true);
      }
    } catch (err) {
      console.error("Failed to mark lesson complete", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Code Snippet Execution Bar (if code exists) */}
      {starterCode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#333333] bg-[#1E1E1E] px-4 py-2.5 text-xs text-[#CCCCCC]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#888888]">
              {isAssembly ? "program.asm" : "main.cpp"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#444444] bg-[#2A2A2A] px-2.5 py-1 text-xs text-[#EAEAEA] transition-colors hover:bg-[#383838]"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy Code
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenInLab}
              className={`inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1 font-semibold text-white transition-colors ${
                isAssembly
                  ? "bg-[#007ACC] hover:bg-[#0062a3]"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {isAssembly ? <Cpu size={13} /> : <Code2 size={13} />}
              {isAssembly ? "Inspect in 8086 Assembly Lab" : "Trace in C++ Predictor"}
            </button>
          </div>
        </div>
      )}

      {/* Lesson Navigation and Completion Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#EAEAEA] pt-6">
        <div>
          {previousLesson ? (
            <Link
              href={`/learn/courses/${courseSlug}/${previousLesson.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555555] hover:text-black transition-colors"
            >
              <ChevronLeft size={14} />
              Previous: {previousLesson.title}
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleComplete}
            disabled={isSubmitting || isCompleted}
            className={`inline-flex items-center gap-1.5 rounded-[4px] border px-4 py-2 text-xs font-semibold transition-all ${
              isCompleted
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 cursor-default"
                : "border-black bg-black text-white hover:bg-[#333333]"
            }`}
          >
            <CheckCircle2 size={14} className={isCompleted ? "text-emerald-600" : "text-white"} />
            {isCompleted ? "Lesson Completed" : isSubmitting ? "Saving…" : "Mark as Completed"}
          </button>

          {nextLesson && (
            <Link
              href={`/learn/courses/${courseSlug}/${nextLesson.slug}`}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-[#FAFAFA] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#F0F0F0]"
            >
              Next Lesson
              <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
