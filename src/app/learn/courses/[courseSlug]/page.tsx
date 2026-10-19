import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { getCourseBySlug, getCourseCurriculum, getStudentDashboardSummary } from "@/lib/learn/db";
import {
  BookOpen,
  Clock,
  Cpu,
  Code2,
  ChevronRight,
  CheckCircle2,
  Play,
  Layers,
  HelpCircle,
} from "lucide-react";

interface CoursePageProps {
  params: Promise<{
    courseSlug: string;
  }>;
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.courseSlug);
  if (!course) {
    return { title: "Course Not Found | OutputTracer Learn" };
  }
  return {
    title: `${course.title} | OutputTracer Learn`,
    description: course.description,
    alternates: {
      canonical: `/learn/courses/${resolvedParams.courseSlug}`,
    },
    openGraph: {
      title: `${course.title} | OutputTracer Learn`,
      description: course.description,
      siteName: "OutputTracer",
      type: "website",
      url: `https://outputtracer.com/learn/courses/${resolvedParams.courseSlug}`,
      images: [
        {
          url: "/brand/logo-tile.svg",
          width: 512,
          height: 512,
          alt: "OutputTracer Learn course",
        },
      ],
    },
  };
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.courseSlug);

  if (!course) {
    notFound();
  }

  const modules = await getCourseCurriculum(course.id);

  // Check auth and user completions
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data?.user : null;

  let completedLessonIds = new Set<string>();
  if (user && supabase) {
    const summary = await getStudentDashboardSummary(user.id);
    const enr = summary.enrolledCourses.find((e) => e.courseId === course.id);
    if (enr) {
      // Fetch user's completed lessons from DB if available
      try {
        const { data } = await supabase
          .from("learn_lesson_completions")
          .select("lesson_id")
          .eq("user_id", user.id);
        if (data) {
          completedLessonIds = new Set(data.map((d) => d.lesson_id));
        }
      } catch {
        // Fallback handled safely
      }
    }
  }

  const isAssembly = course.languageSlug === "8086-assembly";
  const allLessons = modules.flatMap((m) => m.lessons || []);
  const firstLesson = allLessons[0];
  const completedCount = allLessons.filter((l) => completedLessonIds.has(l.id)).length;
  const progressPercent = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="flex-1 pb-20">
        {/* Course Header Banner */}
        <section className="border-b border-[#F0F0F0] bg-gradient-to-b from-[#FAFAFA] to-white py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-[#777777] mb-4">
              <Link href="/learn" className="hover:text-black hover:underline">
                Learn
              </Link>
              <span>/</span>
              <span className="text-black font-medium">{course.title}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
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

              <span className="rounded-[4px] border border-[#DCDCDC] bg-white px-2 py-0.5 text-[11px] font-medium capitalize text-[#555555]">
                {course.difficulty}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-black sm:text-4xl">
              {course.title}
            </h1>

            <p className="mt-3 max-w-3xl text-sm sm:text-base text-[#555555] leading-relaxed">
              {course.description}
            </p>

            {/* Quick Metrics */}
            <div className="mt-6 flex flex-wrap items-center gap-6 text-xs text-[#666666]">
              <span className="flex items-center gap-1.5">
                <Layers size={15} className="text-[#888888]" />
                {modules.length} Modules
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen size={15} className="text-[#888888]" />
                {allLessons.length} Lessons
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={15} className="text-[#888888]" />
                {course.estimatedHours} Hours total
              </span>
            </div>

            {/* Progress bar if student has completed lessons */}
            {user && completedCount > 0 && (
              <div className="mt-6 max-w-md">
                <div className="flex items-center justify-between text-xs text-[#555555] mb-1.5 font-medium">
                  <span>Your Progress</span>
                  <span className="font-mono font-semibold text-black">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isAssembly ? "bg-[#007ACC]" : "bg-black"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#777777]">
                  {completedCount} of {allLessons.length} lessons completed
                </p>
              </div>
            )}

            {/* CTA Button */}
            {firstLesson && (
              <div className="mt-8">
                <Link
                  href={`/learn/courses/${course.slug}/${firstLesson.slug}`}
                  className="inline-flex items-center gap-2 rounded-[4px] bg-black px-5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  <Play size={14} />
                  {completedCount > 0 ? "Continue Course" : "Start Course"}
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Course Curriculum Modules & Lessons */}
        <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                Course Curriculum
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#666666]">
                Follow the structured topics sequentially or jump straight to any concept.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {modules.map((mod, modIdx) => (
              <div
                key={mod.id}
                className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xs"
              >
                {/* Module Header */}
                <div className="border-b border-[#F0F0F0] bg-[#FAFAFA] p-5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#888888]">
                      Module {modIdx + 1}
                    </span>
                    <span className="text-xs text-[#CCCCCC]">•</span>
                    <span className="text-xs text-[#777777]">
                      {(mod.lessons || []).length} {(mod.lessons || []).length === 1 ? "Lesson" : "Lessons"}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-black">
                    {mod.title}
                  </h3>
                  {mod.description && (
                    <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                      {mod.description}
                    </p>
                  )}
                </div>

                {/* Lessons List */}
                <div className="divide-y divide-[#F0F0F0]">
                  {(mod.lessons || []).map((lesson, lessonIdx) => {
                    const isCompleted = completedLessonIds.has(lesson.id);
                    return (
                      <Link
                        key={lesson.id}
                        href={`/learn/courses/${course.slug}/${lesson.slug}`}
                        className="group flex items-center justify-between p-4 transition-colors hover:bg-[#FAFAFA]"
                      >
                        <div className="flex items-center gap-3.5">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-mono font-medium ${
                              isCompleted
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-[#F0F0F0] text-[#666666] group-hover:bg-black group-hover:text-white"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 size={15} className="text-emerald-600" />
                            ) : (
                              `${modIdx + 1}.${lessonIdx + 1}`
                            )}
                          </span>

                          <div>
                            <h4 className="text-sm font-medium text-black group-hover:text-[#007ACC] transition-colors">
                              {lesson.title}
                            </h4>
                            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#888888]">
                              <span className="flex items-center gap-1">
                                <Clock size={12} /> {lesson.estimatedMinutes} min
                              </span>
                              {Boolean(lesson.questionCount && lesson.questionCount > 0) && (
                                <span className="flex items-center gap-1">
                                  <HelpCircle size={12} /> {lesson.questionCount} practice {lesson.questionCount === 1 ? "question" : "questions"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-medium text-[#777777] group-hover:text-black">
                          <span>Read Lesson</span>
                          <ChevronRight size={14} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
