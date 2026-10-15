"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Users,
  BookOpen,
  ArrowLeft,
  Settings,
  Plus,
  Clock,
  FileCode,
  ShieldCheck,
} from "lucide-react";
import {
  Classroom,
  ClassroomAssignment,
  ClassroomMember,
} from "@/lib/classroom/types";

export default function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const resolvedParams = use(params);
  const classId = resolvedParams.classId;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [assignments, setAssignments] = useState<ClassroomAssignment[]>([]);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"assignments" | "roster">("assignments");

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(`/api/classroom/${classId}`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/assignments`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/roster`).then((r) => r.json()),
    ])
      .then(([classData, asgData, rosterData]) => {
        if (!active) return;
        if (!classData.success) {
          setError(classData.error || "Failed loading classroom.");
          return;
        }
        setClassroom(classData.classroom);
        setIsTeacher(Boolean(classData.isTeacher));
        if (asgData.success) setAssignments(asgData.assignments || []);
        if (rosterData.success) setMembers(rosterData.members || []);
      })
      .catch(() => {
        if (active) setError("A network error occurred while loading classroom.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classId]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/classroom"
            className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black mb-6"
          >
            <ArrowLeft size={13} /> Back to Classrooms
          </Link>

          {loading ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#666666]">
              Loading classroom details...
            </div>
          ) : error || !classroom ? (
            <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
              <h2 className="text-base font-bold text-rose-700 mb-1">Access Restricted</h2>
              <p className="text-xs text-[#666666] mb-4">{error || "You do not have access to this classroom."}</p>
              <Link
                href="/classroom"
                className="inline-flex items-center rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
              >
                Return to Classroom Hub
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Classroom Hero Card */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 sm:p-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800">
                        {classroom.subject}
                      </span>
                      {isTeacher && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                          <ShieldCheck size={11} /> Instructor
                        </span>
                      )}
                    </div>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-black">
                      {classroom.name}
                    </h1>
                    {classroom.description && (
                      <p className="mt-2 text-xs text-[#666666] max-w-2xl leading-relaxed">
                        {classroom.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    {isTeacher && (
                      <div className="rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] px-3.5 py-2 text-right">
                        <span className="block text-[10px] uppercase font-semibold text-[#888888]">
                          Classroom Join Code
                        </span>
                        <span className="font-mono text-sm font-bold text-black tracking-wider">
                          {classroom.joinCode}
                        </span>
                      </div>
                    )}
                    {isTeacher && (
                      <Link
                        href={`/classroom/${classId}/manage`}
                        className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                      >
                        <Settings size={13} /> Manage Classroom
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex gap-2 border-b border-[#EAEAEA] pb-2">
                <button
                  onClick={() => setActiveTab("assignments")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    activeTab === "assignments"
                      ? "bg-black text-white"
                      : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
                  }`}
                >
                  <BookOpen size={13} /> Assignments ({assignments.length})
                </button>
                <button
                  onClick={() => setActiveTab("roster")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    activeTab === "roster"
                      ? "bg-black text-white"
                      : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
                  }`}
                >
                  <Users size={13} /> Class Roster ({members.length})
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === "assignments" ? (
                assignments.length === 0 ? (
                  <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center shadow-xs">
                    <BookOpen size={32} className="mx-auto text-[#AAAAAA] mb-2" />
                    <h3 className="text-sm font-bold text-black">No assignments posted yet</h3>
                    <p className="mt-1 text-xs text-[#666666]">
                      {isTeacher
                        ? "Create an assignment with starter code and test specifications."
                        : "Your instructor hasn't published any assignments yet."}
                    </p>
                    {isTeacher && (
                      <Link
                        href={`/classroom/${classId}/manage`}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                      >
                        <Plus size={13} /> Create Assignment
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {assignments.map((asg) => (
                      <Link
                        key={asg.id}
                        href={`/classroom/${classId}/assignments/${asg.id}`}
                        className="group flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#EAEAEA] bg-white p-5 shadow-xs hover:border-black transition-all gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-black group-hover:underline flex items-center gap-1.5">
                              <FileCode size={15} />
                              {asg.title}
                            </h3>
                            {asg.groupMode && (
                              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                Group Assignment
                              </span>
                            )}
                            {!asg.isPublished && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                Draft
                              </span>
                            )}
                          </div>
                          {asg.description && (
                            <p className="text-xs text-[#666666] line-clamp-1">{asg.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-[#888888] pt-1">
                            <span>Points: <strong>{asg.maxPoints} pts</strong></span>
                            {asg.dueDate ? (
                              <span className="flex items-center gap-1">
                                <Clock size={12} /> Due: {new Date(asg.dueDate).toLocaleDateString()}
                              </span>
                            ) : (
                              <span>No deadline</span>
                            )}
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-black group-hover:underline shrink-0">
                          View Assignment & Code &rarr;
                        </span>
                      </Link>
                    ))}
                  </div>
                )
              ) : (
                /* Roster Tab */
                <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                  <div className="divide-y divide-[#F0F0F0]">
                    {members.map((m) => (
                      <div key={m.userId} className="flex items-center justify-between p-4 text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F0F0] text-black font-semibold text-xs">
                            {(m.displayName || "S").slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-black block">
                              {m.displayName || `User ${m.userId.slice(0, 8)}`}
                            </span>
                            {m.email && <span className="text-[11px] text-[#777777]">{m.email}</span>}
                          </div>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                            m.role === "teacher"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
