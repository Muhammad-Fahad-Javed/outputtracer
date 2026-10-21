"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  GraduationCap,
  Users,
  BookOpen,
  Plus,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { Classroom, UserCapabilities } from "@/lib/classroom/types";

export default function ClassroomHubPage() {
  const [teaching, setTeaching] = useState<Classroom[]>([]);
  const [enrolled, setEnrolled] = useState<Classroom[]>([]);
  const [capabilities, setCapabilities] = useState<UserCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"enrolled" | "teaching">("enrolled");

  // Create classroom modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassSubject, setNewClassSubject] = useState("C++");
  const [newClassDescription, setNewClassDescription] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join code modal
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch("/api/classroom");
      if (res.status === 401) {
        setCapabilities(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setTeaching(data.teaching || []);
        setEnrolled(data.enrolled || []);
        setCapabilities(data.capabilities);
        if (data.teaching?.length > 0 && data.enrolled?.length === 0) {
          setActiveTab("teaching");
        }
      }
    } catch {
      setFeedback({ type: "error", message: "Failed loading classrooms." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/classroom")
      .then((res) => {
        if (res.status === 401) {
          if (active) {
            setCapabilities(null);
            setLoading(false);
          }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (active && data?.success) {
          setTeaching(data.teaching || []);
          setEnrolled(data.enrolled || []);
          setCapabilities(data.capabilities);
          if (data.teaching?.length > 0 && data.enrolled?.length === 0) {
            setActiveTab("teaching");
          }
        }
      })
      .catch(() => {
        if (active) setFeedback({ type: "error", message: "Failed loading classrooms." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClassName,
          subject: newClassSubject,
          description: newClassDescription,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Failed to create classroom.");
      } else {
        setFeedback({ type: "success", message: `Classroom "${data.classroom.name}" created successfully!` });
        setCreateModalOpen(false);
        setNewClassName("");
        setNewClassDescription("");
        await loadData();
        setActiveTab("teaching");
      }
    } catch {
      setCreateError("A network error occurred.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinSubmitting(true);
    setJoinError(null);

    try {
      const res = await fetch("/api/classroom/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setJoinError(data.error || "Failed to join classroom.");
      } else {
        setFeedback({ type: "success", message: `Successfully enrolled in ${data.classroom.name}!` });
        setJoinModalOpen(false);
        setJoinCode("");
        await loadData();
        setActiveTab("enrolled");
      }
    } catch {
      setJoinError("A network error occurred.");
    } finally {
      setJoinSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {feedback && (
            <div
              className={`mb-6 rounded-lg border p-3.5 text-xs font-medium ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Header section */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-black flex items-center gap-2.5">
                <GraduationCap size={26} />
                OutputTracer Classroom
              </h1>
              <p className="mt-1 text-xs text-[#666666]">
                Teacher-verified coding education, assignments, group collaboration, and automated grading.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/classroom/student"
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-blue-600 bg-blue-600/10 px-3.5 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-600/20"
              >
                <GraduationCap size={13} /> Student Dashboard
              </Link>

              <button
                onClick={() => setJoinModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#F2F2F2]"
              >
                <KeyRound size={13} /> Join with Code
              </button>

              {capabilities?.canCreateClassroom ? (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  <Plus size={13} /> Create Classroom
                </button>
              ) : (
                <Link
                  href="/classroom/teach/apply"
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-100"
                >
                  <ShieldCheck size={13} /> Apply as Educator
                </Link>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex gap-2 border-b border-[#EAEAEA] pb-2">
            <button
              onClick={() => setActiveTab("enrolled")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === "enrolled"
                  ? "bg-black text-white"
                  : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
              }`}
            >
              <BookOpen size={13} /> Enrolled Classes ({enrolled.length})
            </button>

            {capabilities?.canCreateClassroom && (
              <button
                onClick={() => setActiveTab("teaching")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === "teaching"
                    ? "bg-black text-white"
                    : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
                }`}
              >
                <Users size={13} /> Classes I Teach ({teaching.length})
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#666666]">
              Loading classrooms...
            </div>
          ) : activeTab === "enrolled" ? (
            enrolled.length === 0 ? (
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center shadow-xs">
                <BookOpen size={36} className="mx-auto text-[#AAAAAA] mb-3" />
                <h3 className="text-sm font-bold text-black">Not enrolled in any classrooms yet</h3>
                <p className="mt-1 text-xs text-[#666666] max-w-sm mx-auto">
                  Ask your teacher for a classroom join code (e.g. OT-XXXXXXX) to access assignments and collaborative group projects.
                </p>
                <button
                  onClick={() => setJoinModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                >
                  <KeyRound size={13} /> Enter Classroom Code
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {enrolled.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/classroom/${cls.id}`}
                    className="group rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs transition-all hover:border-black hover:shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {cls.subject}
                      </span>
                      <h3 className="mt-2.5 text-base font-bold text-black group-hover:underline">
                        {cls.name}
                      </h3>
                      {cls.description && (
                        <p className="mt-1.5 text-xs text-[#666666] line-clamp-2">
                          {cls.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-[#F0F0F0] flex items-center justify-between text-xs text-[#666666]">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> Enrolled
                      </span>
                      <span className="font-semibold text-black flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Open Class <ArrowRight size={12} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : (
            teaching.length === 0 ? (
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center shadow-xs">
                <Users size={36} className="mx-auto text-[#AAAAAA] mb-3" />
                <h3 className="text-sm font-bold text-black">No classrooms created yet</h3>
                <p className="mt-1 text-xs text-[#666666] max-w-sm mx-auto">
                  Create your first classroom to invite students, set assignments, and review code traces.
                </p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                >
                  <Plus size={13} /> Create First Classroom
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {teaching.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/classroom/${cls.id}`}
                    className="group rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs transition-all hover:border-black hover:shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Instructor
                        </span>
                        <span className="font-mono text-xs font-bold text-black bg-[#F5F5F5] px-2 py-0.5 rounded">
                          {cls.joinCode}
                        </span>
                      </div>
                      <h3 className="mt-2.5 text-base font-bold text-black group-hover:underline">
                        {cls.name}
                      </h3>
                      <p className="text-xs text-[#777777]">{cls.subject}</p>
                      {cls.description && (
                        <p className="mt-1.5 text-xs text-[#666666] line-clamp-2">
                          {cls.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-[#F0F0F0] flex items-center justify-between text-xs text-[#666666]">
                      <span>Code: <strong>{cls.joinCode}</strong></span>
                      <span className="font-semibold text-black flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Manage <ArrowRight size={12} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {/* Create Classroom Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Create New Classroom</h2>
            <p className="text-xs text-[#666666] mb-4">
              Set up a dedicated space for your students, assignments, and test cases.
            </p>

            {createError && (
              <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateClass} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Classroom Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS106B Programming Abstractions"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Subject / Language
                </label>
                <select
                  value={newClassSubject}
                  onChange={(e) => setNewClassSubject(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-2.5 py-2 text-xs outline-none focus:border-black"
                >
                  <option value="C++">C++</option>
                  <option value="8086 Assembly">8086 Assembly</option>
                  <option value="Data Structures & Algorithms">Data Structures & Algorithms</option>
                  <option value="Systems Programming">Systems Programming</option>
                  <option value="General Computer Science">General Computer Science</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief overview or schedule details for your students..."
                  value={newClassDescription}
                  onChange={(e) => setNewClassDescription(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2.5 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={createSubmitting}
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50"
                >
                  {createSubmitting ? "Creating..." : "Create Classroom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Code Modal */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Join Classroom</h2>
            <p className="text-xs text-[#666666] mb-4">
              Enter the unique join code provided by your instructor.
            </p>

            {joinError && (
              <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinClass} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Classroom Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="OT-XXXXXXX"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs font-mono tracking-wider uppercase outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={joinSubmitting}
                  onClick={() => setJoinModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joinSubmitting}
                  className="rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50"
                >
                  {joinSubmitting ? "Joining..." : "Join Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
