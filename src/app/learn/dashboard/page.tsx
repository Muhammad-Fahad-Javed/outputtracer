import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CourseCard from "@/components/learn/CourseCard";
import { createClient } from "@/lib/supabase/server";
import { getStudentDashboardSummary, getPublishedCourses } from "@/lib/learn/db";
import {
  BookOpen,
  CheckCircle2,
  Trophy,
  Target,
  ArrowRight,
  Clock,
  Compass,
  Play,
  Award,
  Cpu,
  Code2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Student Learning Dashboard | OutputTracer Learn",
  description: "Track your learning progress, enrolled courses, and practice question accuracy on OutputTracer Learn.",
};

export default async function StudentDashboardPage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data?.user : null;

  // If unauthenticated, redirect to login with safe next parameter
  if (!user) {
    redirect("/login?next=/learn/dashboard");
  }

  // Fetch student progress and all published courses
  const [summary, allCourses] = await Promise.all([
    getStudentDashboardSummary(user.id),
    getPublishedCourses(),
  ]);

  const hasActivity = summary.completedLessons > 0 || summary.questionsAttempted > 0;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1 pb-16">
        {/* Welcome Section */}
        <section className="border-b border-[#F0F0F0] bg-[#FAFAFA] py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#007ACC]">
                  Student Workspace
                </span>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                  Welcome back, {user.user_metadata?.display_name || user.email?.split("@")[0]}
                </h1>
                <p className="mt-1.5 text-xs sm:text-sm text-[#666666]">
                  Track your mastery of C++ memory structures and 8086 CPU execution.
                </p>
              </div>

              {/* Fast Action */}
              <div className="flex items-center gap-3">
                <Link
                  href="/learn#courses"
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#F2F2F2]"
                >
                  <Compass size={14} /> Browse Catalog
                </Link>
              </div>
            </div>

            {/* Metrics Overview Grid */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-[#888888]">
                  <span className="text-xs font-medium">Overall Progress</span>
                  <Target size={16} className="text-[#007ACC]" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-black">
                  {summary.overallProgressPercent}%
                </div>
                <div className="mt-1 text-[11px] text-[#888888]">
                  Across all curriculum
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-[#888888]">
                  <span className="text-xs font-medium">Lessons Completed</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-black">
                  {summary.completedLessons} <span className="text-sm font-normal text-[#888888]">/ {summary.totalLessonsAcrossAllCourses}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#888888]">
                  Interactive topics read
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-[#888888]">
                  <span className="text-xs font-medium">Quiz Accuracy</span>
                  <Trophy size={16} className="text-amber-500" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-black">
                  {summary.accuracyPercent}%
                </div>
                <div className="mt-1 text-[11px] text-[#888888]">
                  {summary.questionsCorrect} of {summary.questionsAttempted} correct
                </div>
              </div>

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-[#888888]">
                  <span className="text-xs font-medium">Points Earned</span>
                  <Award size={16} className="text-purple-600" />
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-black">
                  {summary.totalPoints}
                </div>
                <div className="mt-1 text-[11px] text-[#888888]">
                  Verified practice score
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Body */}
        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 space-y-12">
          {/* Quick Resume Card (if user has active course) */}
          {summary.enrolledCourses.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold tracking-tight text-black">
                  My Active Courses
                </h2>
                <span className="text-xs text-[#888888]">
                  {summary.enrolledCourses.length} in progress
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {summary.enrolledCourses.map((enr) => (
                  <div
                    key={enr.courseId}
                    className="flex flex-col justify-between rounded-xl border border-[#DCDCDC] bg-white p-6 shadow-xs hover:border-black transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-[4px] bg-[#F2F2F2] px-2 py-0.5 text-xs font-mono font-medium text-black">
                          {enr.languageName}
                        </span>
                        <span className="text-xs font-mono font-semibold text-[#007ACC]">
                          {enr.progressPercent}% Done
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-semibold text-black">
                        {enr.courseTitle}
                      </h3>

                      <div className="mt-4">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
                          <div
                            className="h-full rounded-full bg-black transition-all"
                            style={{ width: `${enr.progressPercent}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#777777]">
                          <span>
                            {enr.completedLessons} of {enr.totalLessons} lessons finished
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-[#F0F0F0] pt-4">
                      <Link
                        href={`/learn/courses/${enr.courseSlug}`}
                        className="flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                      >
                        Resume Learning <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* If No Activity Yet: Welcoming Empty State */}
          {!hasActivity && (
            <div className="rounded-2xl border border-dashed border-[#DCDCDC] bg-[#FAFAFA] p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white border border-[#EAEAEA] text-[#007ACC] shadow-xs">
                <BookOpen size={22} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-black">
                Start your first OutputTracer lesson
              </h3>
              <p className="mt-1.5 text-xs text-[#666666] max-w-md mx-auto leading-relaxed">
                Choose a C++ or 8086 Assembly course below to begin exploring execution tracing, memory mutations, and live CPU registers.
              </p>
              <div className="mt-5">
                <Link
                  href="/learn/courses/cpp-fundamentals"
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  Start C++ Fundamentals &rarr;
                </Link>
              </div>
            </div>
          )}

          {/* All Available Courses */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold tracking-tight text-black">
                Available Courses
              </h2>
              <Link href="/learn" className="text-xs text-[#007ACC] hover:underline font-medium">
                View Full Catalog
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {allCourses.map((c) => {
                const enr = summary.enrolledCourses.find((e) => e.courseId === c.id);
                return (
                  <CourseCard
                    key={c.id}
                    course={c}
                    progressPercent={enr?.progressPercent || 0}
                    completedLessons={enr?.completedLessons || 0}
                    totalLessons={c.totalLessons}
                    isEnrolled={Boolean(enr)}
                  />
                );
              })}
            </div>
          </div>

          {/* Recent Practice Question Activity */}
          {summary.recentAttempts.length > 0 && (
            <div>
              <h2 className="text-lg font-bold tracking-tight text-black mb-4">
                Recent Practice Activity
              </h2>

              <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs">
                <div className="divide-y divide-[#F0F0F0]">
                  {summary.recentAttempts.map((att) => (
                    <div
                      key={att.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-[#FAFAFA] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5">
                          {att.isCorrect ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : (
                            <Target size={16} className="text-rose-500" />
                          )}
                        </span>
                        <div>
                          <p className="text-xs sm:text-sm font-medium text-black">
                            {att.questionPrompt}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[#777777]">
                            <span className="font-mono">Answered: &quot;{att.submittedAnswer}&quot;</span>
                            <span>•</span>
                            <span className="font-semibold text-black">+{att.earnedPoints} pts</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                            att.isCorrect
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {att.isCorrect ? "Correct" : "Needs Review"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
