"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  GraduationCap,
  BookOpen,
  Calendar,
  Award,
  Bell,
  Clock,
  ArrowRight,
  AlertCircle,
  FileText,
  MessageSquare,
  Sparkles,
} from "lucide-react";

interface ClassroomSummary {
  id: string;
  name: string;
  subject: string;
  description: string;
  teacherName: string;
}

interface Deadline {
  id: string;
  title: string;
  classroomId: string;
  classroomName: string;
  dueDate: string;
  maxPoints: number;
}

interface GradeItem {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  classroomId: string;
  classroomName: string;
  grade: number;
  maxPoints: number;
  gradedAt: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link?: string;
  created_at: string;
  is_read: boolean;
}

export default function StudentDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    enrolledCount: 0,
    pendingAssignmentsCount: 0,
    unreadCount: 0,
    completedLessonsCount: 0,
    solvedProblemsCount: 0,
    savedProjectsCount: 0,
  });
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Deadline[]>([]);
  const [recentGrades, setRecentGrades] = useState<GradeItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const res = await fetch("/api/classroom/student/dashboard");
        if (res.status === 401) {
          if (active) setError("Please sign in to view your student dashboard.");
          return;
        }
        const data = await res.json();
        if (active && data.success) {
          setStats(data.stats);
          setClassrooms(data.classrooms || []);
          setUpcomingDeadlines(data.upcomingDeadlines || []);
          setRecentGrades(data.recentGrades || []);
          setRecentActivity(data.recentActivity || []);
        } else if (active) {
          setError(data.error || "Failed to load dashboard data");
        }
      } catch {
        if (active) setError("Network error loading dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const formatDueDiff = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    const hours = Math.round(diff / (1000 * 60 * 60));
    if (hours < 0) return { text: "Past due", color: "text-rose-600 bg-rose-50 border-rose-200" };
    if (hours < 24) return { text: `Due in ${hours}h`, color: "text-rose-700 bg-rose-50 border-rose-200 font-semibold" };
    const days = Math.round(hours / 24);
    if (days <= 2) return { text: `Due in ${days}d`, color: "text-amber-700 bg-amber-50 border-amber-200" };
    return { text: `Due in ${days}d`, color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 pb-16">
        {/* Header banner */}
        <section className="border-b border-[#F0F0F0] bg-white py-10 sm:py-12">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#007ACC] flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" /> Student Workspace
                </span>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                  Student Dashboard
                </h1>
                <p className="mt-1.5 text-xs sm:text-sm text-[#666666]">
                  Track enrolled classrooms, upcoming coding deadlines, grades, and communications.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/learn/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#F2F2F2]"
                >
                  <Sparkles size={13} /> Learn Courses
                </Link>
                <Link
                  href="/classroom"
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  <BookOpen size={13} /> Classroom Hub
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
          {error && (
            <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                Enrolled Classes
              </p>
              <p className="text-xl font-bold text-black mt-1 font-mono">
                {loading ? "..." : stats.enrolledCount}
              </p>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                Assignments
              </p>
              <p className="text-xl font-bold text-black mt-1 font-mono">
                {loading ? "..." : stats.pendingAssignmentsCount}
              </p>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                Lessons Done
              </p>
              <p className="text-xl font-bold text-black mt-1 font-mono">
                {loading ? "..." : stats.completedLessonsCount}
              </p>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                Practice Solved
              </p>
              <p className="text-xl font-bold text-black mt-1 font-mono">
                {loading ? "..." : stats.solvedProblemsCount}
              </p>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                Saved Projects
              </p>
              <p className="text-xl font-bold text-black mt-1 font-mono">
                {loading ? "..." : stats.savedProjectsCount}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-800">
                Unread Alerts
              </p>
              <p className="text-xl font-bold text-blue-900 mt-1 font-mono">
                {loading ? "..." : stats.unreadCount}
              </p>
            </div>
          </div>

          {/* 2-Column Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Classrooms + Deadlines */}
            <div className="lg:col-span-2 space-y-6">
              {/* My Classrooms */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex items-center justify-between">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <BookOpen size={16} /> My Classrooms
                  </h2>
                  <Link
                    href="/classroom"
                    className="text-xs text-[#007ACC] hover:underline font-semibold flex items-center gap-1"
                  >
                    Join with Code <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="p-4 sm:p-5">
                  {loading ? (
                    <div className="py-8 text-center text-xs text-[#888888]">Loading enrolled courses...</div>
                  ) : classrooms.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-[#EAEAEA] rounded-xl">
                      <p className="text-xs text-[#666666]">You are not enrolled in any classrooms yet.</p>
                      <Link
                        href="/classroom"
                        className="inline-block mt-3 rounded-[4px] bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333333] transition-colors"
                      >
                        Enter Join Code
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {classrooms.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-xl border border-[#EAEAEA] bg-[#FBFBFB] p-4 flex flex-col justify-between hover:border-[#CCCCCC] transition-colors"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="rounded-[3px] border border-[#DCDCDC] bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-black">
                                {c.subject}
                              </span>
                              <Link
                                href={`/classroom/${c.id}/messages`}
                                className="text-[#666666] hover:text-black p-1"
                                title="Open chat"
                              >
                                <MessageSquare size={13} />
                              </Link>
                            </div>
                            <h3 className="font-semibold text-sm text-black mt-2 line-clamp-1">
                              {c.name}
                            </h3>
                            <p className="text-xs text-[#666666] mt-1 line-clamp-2">
                              {c.description || "No description provided."}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#EAEAEA] flex items-center justify-between text-xs">
                            <span className="text-[#888888] text-[11px]">Instructor: {c.teacherName}</span>
                            <Link
                              href={`/classroom/${c.id}`}
                              className="font-semibold text-[#007ACC] hover:underline flex items-center gap-1"
                            >
                              Open <ArrowRight size={11} />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Deadlines */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex items-center justify-between">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <Calendar size={16} /> Upcoming Deadlines
                  </h2>
                </div>

                <div className="p-4 sm:p-5">
                  {loading ? (
                    <div className="py-6 text-center text-xs text-[#888888]">Checking upcoming due dates...</div>
                  ) : upcomingDeadlines.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#888888] border border-dashed border-[#EAEAEA] rounded-xl">
                      No assignments due in the next 7 days.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {upcomingDeadlines.map((d) => {
                        const due = formatDueDiff(d.dueDate);
                        return (
                          <Link
                            key={d.id}
                            href={`/classroom/${d.classroomId}/assignments/${d.id}`}
                            className="flex items-center justify-between rounded-xl border border-[#EAEAEA] bg-white p-3.5 hover:border-[#CCCCCC] transition-colors"
                          >
                            <div>
                              <p className="font-semibold text-xs text-black">{d.title}</p>
                              <p className="text-[11px] text-[#666666] mt-0.5">
                                {d.classroomName} &bull; Max {d.maxPoints} pts
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${due.color}`}>
                                {due.text}
                              </span>
                              <p className="text-[10px] text-[#888888] mt-0.5">
                                {new Date(d.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Recent Grades + Activity Stream */}
            <div className="space-y-6">
              {/* Recent Grades */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0]">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <Award size={16} /> Recent Grades
                  </h2>
                </div>

                <div className="p-4 sm:p-5">
                  {loading ? (
                    <div className="py-6 text-center text-xs text-[#888888]">Loading grades...</div>
                  ) : recentGrades.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#888888] border border-dashed border-[#EAEAEA] rounded-xl">
                      No graded submissions yet.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recentGrades.map((g) => (
                        <div
                          key={g.submissionId}
                          className="rounded-xl border border-[#EAEAEA] bg-[#FBFBFB] p-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-semibold text-black line-clamp-1">{g.assignmentTitle}</p>
                            <p className="text-[10px] text-[#888888]">{g.classroomName}</p>
                          </div>
                          <span className="rounded-[3px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                            {g.grade} / {g.maxPoints}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Stream */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0]">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <Bell size={16} /> Activity Stream
                  </h2>
                </div>

                <div className="p-4 sm:p-5">
                  {loading ? (
                    <div className="py-6 text-center text-xs text-[#888888]">Loading notifications...</div>
                  ) : recentActivity.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#888888] border border-dashed border-[#EAEAEA] rounded-xl">
                      No recent activity.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recentActivity.map((n) => (
                        <div
                          key={n.id}
                          className={`rounded-xl border p-3 text-xs ${
                            n.is_read
                              ? "border-[#EAEAEA] bg-white text-[#666666]"
                              : "border-blue-200 bg-blue-50/50 text-black"
                          }`}
                        >
                          <p className="font-semibold text-black">{n.title}</p>
                          <p className="text-[11px] text-[#666666] mt-0.5">{n.message}</p>
                          {n.link && (
                            <Link
                              href={n.link}
                              className="inline-block mt-2 font-semibold text-[11px] text-[#007ACC] hover:underline"
                            >
                              View Details &rarr;
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
