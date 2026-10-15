"use client";

import { useState } from "react";
import {
  AdminAnalyticsSummary,
  LearnCourse,
  LearnLesson,
  LearnQuestion,
} from "@/lib/learn/types";
import {
  Users,
  BookOpen,
  CheckCircle2,
  Trophy,
  Layers,
  HelpCircle,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Cpu,
  Code2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface AdminLearnManagerProps {
  initialAnalytics: AdminAnalyticsSummary;
  initialCourses: LearnCourse[];
  initialLessons: LearnLesson[];
  initialQuestions: LearnQuestion[];
}

export default function AdminLearnManager({
  initialAnalytics,
  initialCourses,
  initialLessons,
  initialQuestions,
}: AdminLearnManagerProps) {
  const [activeTab, setActiveTab] = useState<"analytics" | "courses" | "lessons" | "questions">("analytics");
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [courses, setCourses] = useState(initialCourses);
  const [lessons, setLessons] = useState(initialLessons);
  const [questions, setQuestions] = useState(initialQuestions);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Selected filter for lessons and questions
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");

  // Edit / Create course state
  const [editingCourse, setEditingCourse] = useState<Partial<LearnCourse> | null>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Toggle course publish status
  const handleToggleCoursePublish = async (course: LearnCourse) => {
    setIsSubmitting(true);
    const updated = { ...course, isPublished: !course.isPublished };

    try {
      const res = await fetch("/api/admin/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "course",
          action: "upsert",
          data: {
            id: updated.id,
            language_id: updated.languageId,
            title: updated.title,
            slug: updated.slug,
            description: updated.description,
            difficulty: updated.difficulty,
            estimated_hours: updated.estimatedHours,
            display_order: updated.displayOrder,
            is_published: updated.isPublished,
          },
        }),
      });

      if (res.ok) {
        setCourses((prev) => prev.map((c) => (c.id === course.id ? updated : c)));
        showNotification("success", `Course "${course.title}" status updated.`);
      } else {
        showNotification("error", "Failed to update course status.");
      }
    } catch {
      showNotification("error", "Network error updating course.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle lesson publish status
  const handleToggleLessonPublish = async (lesson: LearnLesson) => {
    setIsSubmitting(true);
    const updated = { ...lesson, isPublished: !lesson.isPublished };

    try {
      const res = await fetch("/api/admin/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "lesson",
          action: "upsert",
          data: {
            id: updated.id,
            module_id: updated.moduleId,
            course_id: updated.courseId,
            title: updated.title,
            slug: updated.slug,
            notes: updated.content,
            code_snippet: updated.starterCode,
            estimated_minutes: updated.estimatedMinutes,
            display_order: updated.displayOrder,
            is_published: updated.isPublished,
          },
        }),
      });

      if (res.ok) {
        setLessons((prev) => prev.map((l) => (l.id === lesson.id ? updated : l)));
        showNotification("success", `Lesson "${lesson.title}" status updated.`);
      } else {
        showNotification("error", "Failed to update lesson.");
      }
    } catch {
      showNotification("error", "Network error updating lesson.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle question publish status
  const handleToggleQuestionPublish = async (q: LearnQuestion) => {
    setIsSubmitting(true);
    const updated = { ...q, isPublished: !q.isPublished };

    try {
      const res = await fetch("/api/admin/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "question",
          action: "upsert",
          data: {
            id: updated.id,
            course_id: updated.courseId,
            lesson_id: updated.lessonId,
            type: updated.type,
            title: updated.prompt,
            question_text: updated.prompt,
            code_snippet: updated.codeSnippet,
            options: updated.options,
            answer: updated.answer || "Correct",
            explanation: updated.explanation,
            hint: updated.hint,
            points: updated.points,
            is_published: updated.isPublished,
          },
        }),
      });

      if (res.ok) {
        setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
        showNotification("success", `Question status updated.`);
      } else {
        showNotification("error", "Failed to update question.");
      }
    } catch {
      showNotification("error", "Network error updating question.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLessons =
    selectedCourseFilter === "all"
      ? lessons
      : lessons.filter((l) => l.courseId === selectedCourseFilter);

  const filteredQuestions =
    selectedCourseFilter === "all"
      ? questions
      : questions.filter((q) => q.courseId === selectedCourseFilter);

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {message && (
        <div
          className={`rounded-lg p-3.5 text-xs font-semibold ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#EAEAEA] pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "analytics"
              ? "bg-black text-white"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:text-black"
          }`}
        >
          <Trophy size={13} />
          Learning Analytics
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("courses")}
          className={`flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "courses"
              ? "bg-black text-white"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:text-black"
          }`}
        >
          <Layers size={13} />
          Courses ({courses.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("lessons")}
          className={`flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "lessons"
              ? "bg-black text-white"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:text-black"
          }`}
        >
          <BookOpen size={13} />
          Lessons ({lessons.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("questions")}
          className={`flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "questions"
              ? "bg-black text-white"
              : "border border-[#DCDCDC] bg-white text-[#555555] hover:text-black"
          }`}
        >
          <HelpCircle size={13} />
          Questions ({questions.length})
        </button>
      </div>

      {/* TAB 1: ANALYTICS */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4">
              <span className="text-xs font-medium text-[#777777]">Total Learners</span>
              <div className="mt-2 text-2xl font-bold font-mono text-black">
                {analytics.totalLearners}
              </div>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4">
              <span className="text-xs font-medium text-[#777777]">Total Courses</span>
              <div className="mt-2 text-2xl font-bold font-mono text-black">
                {analytics.totalCourses} <span className="text-xs font-normal text-emerald-600 font-sans">({analytics.publishedCourses} published)</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4">
              <span className="text-xs font-medium text-[#777777]">Lesson Completions</span>
              <div className="mt-2 text-2xl font-bold font-mono text-black">
                {analytics.totalCompletions}
              </div>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4">
              <span className="text-xs font-medium text-[#777777]">Practice Accuracy</span>
              <div className="mt-2 text-2xl font-bold font-mono text-black">
                {analytics.averageAccuracy}%
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-6 text-xs text-[#555555] leading-relaxed">
            <p className="font-semibold text-black mb-1">Server-Enforced Access Control</p>
            <p>
              Administrative actions, course publication toggles, answer key edits, and syllabus mutations are protected server-side via Supabase Row-Level Security and service-role verification in <code>/api/admin/learn</code>. Ordinary students cannot perform administrative operations.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: COURSES */}
      {activeTab === "courses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-black uppercase tracking-wider">
              Manage Courses
            </h2>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[11px] font-semibold text-[#777777] uppercase">
                <tr>
                  <th className="p-3.5">Course Title</th>
                  <th className="p-3.5">Language</th>
                  <th className="p-3.5">Difficulty</th>
                  <th className="p-3.5">Lessons</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAFAFA]">
                    <td className="p-3.5 font-medium text-black">
                      {c.title}
                      <span className="block text-[11px] font-normal text-[#888888]">
                        /learn/courses/{c.slug}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="rounded-[3px] bg-[#F2F2F2] px-2 py-0.5 font-mono text-[11px]">
                        {c.languageSlug}
                      </span>
                    </td>
                    <td className="p-3.5 capitalize">{c.difficulty}</td>
                    <td className="p-3.5 font-mono">{c.totalLessons}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                          c.isPublished
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {c.isPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleCoursePublish(c)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded-[3px] border border-[#DCDCDC] px-2.5 py-1 text-[11px] font-medium text-black hover:bg-[#F2F2F2]"
                      >
                        {c.isPublished ? <EyeOff size={12} /> : <Eye size={12} />}
                        {c.isPublished ? "Unpublish" : "Publish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LESSONS */}
      {activeTab === "lessons" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-black uppercase tracking-wider">
              Manage Lessons
            </h2>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[#777777]">Filter Course:</label>
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="rounded-[4px] border border-[#DCDCDC] bg-white px-2.5 py-1 text-xs text-black"
              >
                <option value="all">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[11px] font-semibold text-[#777777] uppercase">
                <tr>
                  <th className="p-3.5">Lesson Title</th>
                  <th className="p-3.5">Duration</th>
                  <th className="p-3.5">Has Starter Code</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {filteredLessons.map((l) => (
                  <tr key={l.id} className="hover:bg-[#FAFAFA]">
                    <td className="p-3.5 font-medium text-black">
                      {l.title}
                      <span className="block text-[11px] font-normal text-[#888888]">
                        Slug: {l.slug}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">{l.estimatedMinutes}m</td>
                    <td className="p-3.5">
                      {l.starterCode ? (
                        <span className="text-emerald-700 font-mono text-[11px]">Yes</span>
                      ) : (
                        <span className="text-[#888888] font-mono text-[11px]">No</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                          l.isPublished
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {l.isPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleLessonPublish(l)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded-[3px] border border-[#DCDCDC] px-2.5 py-1 text-[11px] font-medium text-black hover:bg-[#F2F2F2]"
                      >
                        {l.isPublished ? <EyeOff size={12} /> : <Eye size={12} />}
                        {l.isPublished ? "Unpublish" : "Publish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PRACTICE QUESTIONS */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-black uppercase tracking-wider">
              Manage Practice Questions & Answer Keys
            </h2>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[#777777]">Filter Course:</label>
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="rounded-[4px] border border-[#DCDCDC] bg-white px-2.5 py-1 text-xs text-black"
              >
                <option value="all">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#EAEAEA] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#F0F0F0] bg-[#FAFAFA] text-[11px] font-semibold text-[#777777] uppercase">
                <tr>
                  <th className="p-3.5">Prompt</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Answer Key</th>
                  <th className="p-3.5">Points</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-[#FAFAFA]">
                    <td className="p-3.5 max-w-xs truncate font-medium text-black">
                      {q.prompt}
                    </td>
                    <td className="p-3.5 capitalize font-mono text-[11px]">
                      {q.type.replace("_", " ")}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-emerald-700 max-w-xs truncate">
                      {q.answer || "Masked"}
                    </td>
                    <td className="p-3.5 font-mono">{q.points}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                          q.isPublished
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {q.isPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleQuestionPublish(q)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded-[3px] border border-[#DCDCDC] px-2.5 py-1 text-[11px] font-medium text-black hover:bg-[#F2F2F2]"
                      >
                        {q.isPublished ? <EyeOff size={12} /> : <Eye size={12} />}
                        {q.isPublished ? "Unpublish" : "Publish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
