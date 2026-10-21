import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LessonContent from "@/components/learn/LessonContent";
import LessonActions from "@/components/learn/LessonActions";
import QuestionClient from "@/components/learn/QuestionClient";
import { createClient } from "@/lib/supabase/server";
import {
  getCourseBySlug,
  getLessonBySlug,
  getCourseCurriculum,
  getQuestionsForLesson,
} from "@/lib/learn/db";
import {
  Clock,
  HelpCircle,
  Cpu,
  Code2,
  CheckCircle2,
} from "lucide-react";

interface LessonPageProps {
  params: Promise<{
    courseSlug: string;
    lessonSlug: string;
  }>;
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.courseSlug);
  const lesson = await getLessonBySlug(resolvedParams.courseSlug, resolvedParams.lessonSlug);

  if (!course || !lesson) {
    return { title: "Lesson Not Found | OutputTracer Learn" };
  }

  return {
    title: `${lesson.title} — ${course.title} | OutputTracer Learn`,
    description: (lesson.content || lesson.notes || "").slice(0, 160),
    alternates: {
      canonical: `/learn/courses/${resolvedParams.courseSlug}/${resolvedParams.lessonSlug}`,
    },
    openGraph: {
      title: `${lesson.title} — ${course.title} | OutputTracer Learn`,
      description: (lesson.content || lesson.notes || "").slice(0, 160),
      siteName: "OutputTracer",
      type: "website",
      url: `https://outputtracer.com/learn/courses/${resolvedParams.courseSlug}/${resolvedParams.lessonSlug}`,
      images: [
        {
          url: "/brand/logo-tile.svg",
          width: 512,
          height: 512,
          alt: "OutputTracer Learn lesson",
        },
      ],
    },
  };
}

export default async function LessonDetailPage({ params }: LessonPageProps) {
  const resolvedParams = await params;
  const course = await getCourseBySlug(resolvedParams.courseSlug);
  const lesson = await getLessonBySlug(resolvedParams.courseSlug, resolvedParams.lessonSlug);

  if (!course || !lesson) {
    notFound();
  }

  const [modules, questions] = await Promise.all([
    getCourseCurriculum(course.id),
    getQuestionsForLesson(lesson.id, false), // answers hidden from student
  ]);

  // Flatten lessons across modules to find previous / next navigation
  const allLessons = modules.flatMap((m) => m.lessons || []);
  const currentIndex = allLessons.findIndex((l) => l.id === lesson.id);
  const previousLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : undefined;
  const nextLesson =
    currentIndex >= 0 && currentIndex < allLessons.length - 1
      ? allLessons[currentIndex + 1]
      : undefined;

  // Check auth & whether this lesson is marked completed
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data?.user : null;

  let isLessonCompleted = false;
  let userCompletedLessonIds = new Set<string>();

  if (user && supabase) {
    try {
      const { data } = await supabase
        .from("learn_lesson_completions")
        .select("lesson_id")
        .eq("user_id", user.id);
      if (data) {
        userCompletedLessonIds = new Set(data.map((d) => d.lesson_id));
        isLessonCompleted = userCompletedLessonIds.has(lesson.id);
      }
    } catch {
      // Fallback handled safely
    }
  }

  const isAssembly = course.languageSlug === "8086-assembly";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* Breadcrumb & Quick Info Bar */}
      <div className="border-b border-[#F0F0F0] bg-[#FAFAFA] py-3 text-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2 text-[#777777] overflow-x-auto whitespace-nowrap">
            <Link href="/learn" className="hover:text-black hover:underline">
              Learn
            </Link>
            <span>/</span>
            <Link
              href={`/learn/courses/${course.slug}`}
              className="hover:text-black hover:underline truncate max-w-[200px]"
            >
              {course.title}
            </Link>
            <span>/</span>
            <span className="font-semibold text-black truncate max-w-[250px]">
              {lesson.title}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1 font-mono text-[11px] text-[#666666]">
              <Clock size={12} /> {lesson.estimatedMinutes} min
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 px-5 py-8 sm:px-8 gap-8">
        {/* Left Sidebar: Course Curriculum Tree */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-20 rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
            <div className="border-b border-[#F0F0F0] pb-3 mb-3">
              <Link
                href={`/learn/courses/${course.slug}`}
                className="text-xs font-semibold text-[#888888] uppercase tracking-wider hover:text-black"
              >
                &larr; Back to Syllabus
              </Link>
              <h3 className="mt-1 text-sm font-bold text-black truncate">
                {course.title}
              </h3>
            </div>

            <div className="max-h-[calc(100vh-180px)] overflow-y-auto space-y-4 pr-1">
              {modules.map((mod, modIdx) => (
                <div key={mod.id}>
                  <div className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Module {modIdx + 1}: {mod.title}
                  </div>
                  <div className="space-y-0.5">
                    {(mod.lessons || []).map((item) => {
                      const isActive = item.id === lesson.id;
                      const isDone = userCompletedLessonIds.has(item.id);
                      return (
                        <Link
                          key={item.id}
                          href={`/learn/courses/${course.slug}/${item.slug}`}
                          className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                            isActive
                              ? "bg-black text-white font-medium"
                              : "text-[#444444] hover:bg-[#F5F5F5] hover:text-black"
                          }`}
                        >
                          <span className="truncate pr-2">{item.title}</span>
                          {isDone && (
                            <CheckCircle2
                              size={13}
                              className={isActive ? "text-emerald-300" : "text-emerald-600"}
                            />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Main Content Column */}
        <main className="flex-1 max-w-4xl space-y-10">
          {/* Lesson Header */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                  isAssembly
                    ? "border border-[#007ACC]/30 bg-[#094771]/10 text-[#007ACC]"
                    : "border border-[#005fb8]/30 bg-[#005fb8]/10 text-[#005fb8]"
                }`}
              >
                {isAssembly ? <Cpu size={12} /> : <Code2 size={12} />}
                {course.languageName}
              </span>

              <span className="flex items-center gap-1 text-xs text-[#888888]">
                <Clock size={12} /> {lesson.estimatedMinutes} min
              </span>

              {questions.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#888888]">
                  <HelpCircle size={12} /> {questions.length} Questions
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
              {lesson.title}
            </h1>
          </div>

          {/* Formatted Educational Notes */}
          <section className="border-t border-[#F0F0F0] pt-6">
            <LessonContent content={lesson.content || lesson.notes || ""} />
          </section>

          {/* Starter / Example Code Snippet with Lab Integration */}
          {lesson.starterCode && (
            <section className="space-y-3">
              <h2 className="text-base font-bold tracking-tight text-black flex items-center gap-2">
                <span>Code Example & Interactive Tracing</span>
              </h2>
              <p className="text-xs text-[#666666]">
                Inspect this program line-by-line in our execution environment:
              </p>

              <div className="rounded-xl border border-[#333333] bg-[#1E1E1E] overflow-hidden shadow-xs">
                <div className="border-b border-[#333333] bg-[#252526] px-4 py-2 text-xs font-mono text-[#AAAAAA] flex items-center justify-between">
                  <span>{isAssembly ? "program.asm" : "main.cpp"}</span>
                </div>
                <pre className="p-4 overflow-x-auto text-xs font-mono text-[#D4D4D4] leading-relaxed">
                  <code>{lesson.starterCode}</code>
                </pre>
              </div>

              {/* Lab actions button */}
              <LessonActions
                courseId={course.id}
                courseSlug={course.slug || course.id}
                lessonId={lesson.id}
                starterCode={lesson.starterCode}
                languageSlug={course.languageSlug || "cpp"}
                previousLesson={
                  previousLesson
                    ? { slug: previousLesson.slug || previousLesson.id, title: previousLesson.title }
                    : undefined
                }
                nextLesson={
                  nextLesson
                    ? { slug: nextLesson.slug || nextLesson.id, title: nextLesson.title }
                    : undefined
                }
                initialCompleted={isLessonCompleted}
              />
            </section>
          )}

          {/* Practice Questions Section */}
          <section className="border-t border-[#F0F0F0] pt-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-black sm:text-xl">
                Practice & Output Prediction
              </h2>
              <p className="mt-1 text-xs text-[#666666]">
                Verify your understanding of this lesson. Answers are validated server-side.
              </p>
            </div>

            <QuestionClient
              questions={questions}
              courseId={course.id}
              lessonId={lesson.id}
              courseSlug={course.slug || course.id}
            />
          </section>

          {/* Bottom Actions if lesson did not have starter code */}
          {!lesson.starterCode && (
            <div className="pt-6">
              <LessonActions
                courseId={course.id}
                courseSlug={course.slug || course.id}
                lessonId={lesson.id}
                languageSlug={course.languageSlug || "cpp"}
                previousLesson={
                  previousLesson
                    ? { slug: previousLesson.slug || previousLesson.id, title: previousLesson.title }
                    : undefined
                }
                nextLesson={
                  nextLesson
                    ? { slug: nextLesson.slug || nextLesson.id, title: nextLesson.title }
                    : undefined
                }
                initialCompleted={isLessonCompleted}
              />
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
