"use client";

import Link from "next/link";
import { Cpu, Code2, Clock, BookOpen, ChevronRight, CheckCircle2 } from "lucide-react";
import { LearnCourse } from "@/lib/learn/types";

interface CourseCardProps {
  course: LearnCourse;
  progressPercent?: number;
  completedLessons?: number;
  totalLessons?: number;
  isEnrolled?: boolean;
}

export default function CourseCard({
  course,
  progressPercent = 0,
  completedLessons = 0,
  totalLessons = course.totalLessons,
  isEnrolled = false,
}: CourseCardProps) {
  const isAssembly = course.languageSlug === "8086-assembly";
  const hasProgress = progressPercent > 0;
  const isCompleted = progressPercent === 100;

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-[#EAEAEA] bg-white p-6 shadow-sm transition-all hover:border-[#DCDCDC] hover:shadow-md">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                isAssembly
                  ? "border border-[#007ACC]/30 bg-[#094771]/10 text-[#007ACC]"
                  : "border border-[#005fb8]/30 bg-[#005fb8]/10 text-[#005fb8]"
              }`}
            >
              {isAssembly ? <Cpu size={13} /> : <Code2 size={13} />}
              {course.languageName}
            </span>

            <span
              className={`rounded-[4px] border px-2 py-0.5 text-[11px] font-medium capitalize ${
                course.difficulty === "beginner"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : course.difficulty === "intermediate"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-purple-200 bg-purple-50 text-purple-700"
              }`}
            >
              {course.difficulty}
            </span>
          </div>

          {isCompleted && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 size={14} /> Completed
            </span>
          )}
        </div>

        {/* Title & Description */}
        <h3 className="mt-4 text-lg font-semibold tracking-tight text-black transition-colors group-hover:text-[#007ACC]">
          <Link href={`/learn/courses/${course.slug}`}>{course.title}</Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-[#666666] leading-relaxed">
          {course.description}
        </p>

        {/* Metrics Row */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#777777]">
          <span className="flex items-center gap-1.5">
            <BookOpen size={14} className="text-[#999999]" />
            {totalLessons} lessons
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-[#999999]" />
            {course.estimatedHours} hrs
          </span>
        </div>

        {/* Progress Bar (if enrolled / has progress) */}
        {(isEnrolled || hasProgress) && (
          <div className="mt-5 border-t border-[#F0F0F0] pt-4">
            <div className="flex items-center justify-between text-xs text-[#555555] mb-1.5 font-medium">
              <span>Course Progress</span>
              <span className="font-mono font-semibold text-black">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isAssembly ? "bg-[#007ACC]" : "bg-black"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[#888888]">
              {completedLessons} of {totalLessons} lessons completed
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-6 border-t border-[#F0F0F0] pt-4">
        <Link
          href={`/learn/courses/${course.slug}`}
          className={`flex w-full items-center justify-center gap-1.5 rounded-[4px] px-4 py-2 text-xs font-semibold transition-colors ${
            hasProgress
              ? "bg-black text-white hover:bg-[#333333]"
              : "border border-[#DCDCDC] bg-[#FAFAFA] text-black hover:bg-[#F0F0F0]"
          }`}
        >
          {hasProgress ? "Continue Course" : "Start Course"}
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
