"use client";
import { CLASSROOM_LANGUAGES, classroomLanguage, type ClassroomLanguage } from "@/lib/classroom/languages";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Settings,
  Users,
  Plus,
  ArrowLeft,
  Trash2,
  UserPlus,
  Layers,
  MessageSquare,
  Mail,
  BarChart3,
} from "lucide-react";
import {
  Classroom,
  ClassroomMember,
  ClassroomGroup,
} from "@/lib/classroom/types";
import { ClassroomInvitation } from "@/lib/classroom/communicationTypes";

export default function ClassroomManagePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const resolvedParams = use(params);
  const { classId } = resolvedParams;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [groups, setGroups] = useState<ClassroomGroup[]>([]);
  const [invitations, setInvitations] = useState<ClassroomInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  // Assign modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Assignment modal
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [asgLanguage, setAsgLanguage] = useState<ClassroomLanguage>("cpp");
  const [asgTitle, setAsgTitle] = useState("");
  const [asgDescription, setAsgDescription] = useState("");
  const [asgDueDate, setAsgDueDate] = useState("");
  const [asgPoints, setAsgPoints] = useState(100);
  const [asgGroupMode, setAsgGroupMode] = useState(false);
  const [asgPublish, setAsgPublish] = useState(true);
  const [asgAllowLate, setAsgAllowLate] = useState(true);
  const [asgAllowRun, setAsgAllowRun] = useState(true);
  const [asgAllowTrace, setAsgAllowTrace] = useState(false);
  const [asgTimeLimit, setAsgTimeLimit] = useState(10000);
  const [asgStarter, setAsgStarter] = useState(
    "#include <iostream>\n\nint main() {\n    // Write your solution here.\n    return 0;\n}\n"
  );
  const [asgExtraName, setAsgExtraName] = useState("");
  const [asgExtraBody, setAsgExtraBody] = useState("");
  const [asgPublicName, setAsgPublicName] = useState("Sample");
  const [asgPublicStdin, setAsgPublicStdin] = useState("");
  const [asgPublicExpected, setAsgPublicExpected] = useState("");
  const [asgPublicPoints, setAsgPublicPoints] = useState(50);
  const [asgHiddenName, setAsgHiddenName] = useState("Hidden");
  const [asgHiddenStdin, setAsgHiddenStdin] = useState("");
  const [asgHiddenExpected, setAsgHiddenExpected] = useState("");
  const [asgHiddenPoints, setAsgHiddenPoints] = useState(50);
  const [asgSubmitting, setAsgSubmitting] = useState(false);

  // Progress modal & state
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [selectedStudentProgress, setSelectedStudentProgress] = useState<{
    studentId: string;
    displayName?: string;
    email?: string;
    submissionsCount: number;
    gradedCount: number;
    averageScorePercent: number;
    lastActiveAt?: string;
  } | null>(null);
  const [progressReport, setProgressReport] = useState<{
    completionRatePercent: number;
    averageClassScorePercent: number;
    totalSubmissions: number;
    studentBreakdown: Array<{
      studentId: string;
      displayName?: string;
      email?: string;
      submissionsCount: number;
      gradedCount: number;
      averageScorePercent: number;
      lastActiveAt?: string;
    }>;
  } | null>(null);

  const loadController = useRef<AbortController | null>(null);
  const loadAll = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    Promise.all([
      fetch(`/api/classroom/${classId}`, { signal }).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/roster`, { signal }).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/groups`, { signal }).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/invitations`, { signal }).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/reports/progress`, { signal }).then((r) => r.json()),
    ]).then(([classRes, rosterRes, groupRes, invRes, progRes]) => {
      if (signal.aborted) return;
      if (!classRes.success || !classRes.isTeacher) {
        setError(classRes.error || "Instructor privileges required to manage this classroom.");
        setLoading(false);
        return;
      }
      setError(null);
      setClassroom(classRes.classroom);
      const lang = classroomLanguage(classRes.classroom.language, classRes.classroom.subject);
      setAsgLanguage(lang);
      setAsgStarter(CLASSROOM_LANGUAGES[lang].starter);
      if (rosterRes.success) setMembers(rosterRes.members || []);
      if (groupRes.success) setGroups(groupRes.groups || []);
      if (invRes?.success) setInvitations(invRes.invitations || []);
      if (progRes?.success) setProgressReport(progRes.report || null);
      setLoading(false);
    }).catch(() => {
      if (signal.aborted) return;
      setError("Failed to load management console.");
      setLoading(false);
    });
  }, [classId]);

  useEffect(() => {
    loadAll();
    return () => { loadController.current?.abort(); };
  }, [loadAll]);

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this classroom?`)) return;
    try {
      const res = await fetch(`/api/classroom/${classId}/roster?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed to remove member." });
      } else {
        setFeedback({ type: "success", message: `Removed ${name} from roster.` });
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error occurred." });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupSubmitting(true);
    try {
      const res = await fetch(`/api/classroom/${classId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed creating group." });
      } else {
        setFeedback({ type: "success", message: `Group "${newGroupName}" created.` });
        setGroupModalOpen(false);
        setNewGroupName("");
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setGroupSubmitting(false);
    }
  };

  const handleRemoveFromGroup = async (groupId: string, userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this group? They stay enrolled in the class.`)) return;
    try {
      const res = await fetch(
        `/api/classroom/${classId}/groups?groupId=${encodeURIComponent(groupId)}&studentUserId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed to remove the student from the group." });
      } else {
        setFeedback({ type: "success", message: `Removed ${name} from the group.` });
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    }
  };

  const handleAssignStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignSubmitting(true);
    try {
      const res = await fetch(`/api/classroom/${classId}/groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroupId, studentUserId: selectedStudentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed assigning student." });
      } else {
        setFeedback({ type: "success", message: "Student assigned to group." });
        setAssignModalOpen(false);
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAsgSubmitting(true);
    try {
      const starterCode: Record<string, string> = {};
      if (asgStarter.trim()) starterCode[CLASSROOM_LANGUAGES[asgLanguage].file] = asgStarter;
      const extraName = asgExtraName.trim();
      if (extraName && asgExtraBody.trim()) starterCode[extraName] = asgExtraBody;
      const publicTestCases = asgPublicExpected.trim()
        ? [{
            id: "public-1",
            name: asgPublicName.trim() || "Public test",
            stdin: asgPublicStdin,
            expectedOutput: asgPublicExpected,
            points: Number(asgPublicPoints) || 0,
          }]
        : [];
      const hiddenTestCases = asgHiddenExpected.trim()
        ? [{
            id: "hidden-1",
            name: asgHiddenName.trim() || "Hidden test",
            stdin: asgHiddenStdin,
            expectedOutput: asgHiddenExpected,
            points: Number(asgHiddenPoints) || 0,
            isHidden: true,
          }]
        : [];
      const res = await fetch(`/api/classroom/${classId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: asgTitle,
          description: asgDescription,
          dueDate: asgDueDate || undefined,
          maxPoints: Number(asgPoints) || 100,
          groupMode: asgGroupMode,
          isPublished: asgPublish,
          allowLate: asgAllowLate,
          allowRun: asgAllowRun,
          allowTrace: asgAllowTrace,
          timeLimitMs: Number(asgTimeLimit) || 10000,
          language: asgLanguage,
          starterCode: Object.keys(starterCode).length > 0 ? starterCode : undefined,
          publicTestCases,
          hiddenTestCases,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed creating assignment." });
      } else {
        setFeedback({ type: "success", message: `Assignment "${asgTitle}" created successfully.` });
        setAssignmentModalOpen(false);
        setAsgTitle("");
        setAsgDescription("");
        setAsgDueDate("");
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setAsgSubmitting(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/classroom/${classId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeEmail: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed to create invitation." });
      } else {
        setFeedback({ type: "success", message: `Invitation token created for ${inviteEmail}` });
        setInviteEmail("");
        loadAll();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error creating invitation." });
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/classroom/${classId}/invitations/${invitationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "success", message: "Invitation revoked." });
        loadAll();
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to revoke invitation." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-black">
      <Header />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Link
            href={`/classroom/${classId}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black mb-6"
          >
            <ArrowLeft size={13} /> Back to Classroom View
          </Link>

          {loading ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#666666]">
              Loading management console...
            </div>
          ) : error || !classroom ? (
            <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
              <h2 className="text-base font-bold text-rose-700 mb-1">Access Restricted</h2>
              <p className="text-xs text-[#666666] mb-4">{error}</p>
              <Link
                href="/classroom"
                className="inline-flex items-center rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
              >
                Return to Classroom Hub
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {feedback && (
                <div
                  className={`rounded-lg border p-3.5 text-xs font-medium ${
                    feedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              {/* Title Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-black flex items-center gap-2">
                    <Settings size={20} />
                    Classroom Management: {classroom.name}
                  </h1>
                  <p className="text-xs text-[#666666]">
                    Join Code: <strong className="font-mono text-black">{classroom.joinCode}</strong> • Subject: {classroom.subject}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/classroom/${classId}/messages`}
                    className="inline-flex items-center gap-1.5 rounded-[4px] border border-blue-600 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <MessageSquare size={13} /> Classroom Chat & DMs
                  </Link>
                  <button
                    onClick={() => setAssignmentModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                  >
                    <Plus size={13} /> New Assignment
                  </button>
                  <button
                    onClick={() => setGroupModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-semibold text-black hover:bg-[#F2F2F2]"
                  >
                    <Layers size={13} /> New Group
                  </button>
                </div>
              </div>

              {/* Roster Table */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex items-center justify-between">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <Users size={16} /> Student Roster ({members.length})
                  </h2>
                </div>

                <div className="divide-y divide-[#F0F0F0]">
                  {members.map((m) => (
                    <div key={m.userId} className="p-4 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-black block">
                          {m.displayName || `User ${m.userId.slice(0, 8)}`}
                        </span>
                        {m.email && <span className="text-[11px] text-[#777777]">{m.email}</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 capitalize">
                          {m.role}
                        </span>
                        {m.role !== "teacher" && (
                          <>
                            <button
                              onClick={() => {
                                const st = progressReport?.studentBreakdown.find((s) => s.studentId === m.userId) || {
                                  studentId: m.userId,
                                  displayName: m.displayName,
                                  email: m.email,
                                  submissionsCount: 0,
                                  gradedCount: 0,
                                  averageScorePercent: 0,
                                };
                                setSelectedStudentProgress(st);
                                setProgressModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-[3px] border border-[#DCDCDC] bg-white px-2 py-1 text-[11px] font-medium text-black hover:bg-[#F2F2F2]"
                              title="View individual progress profile"
                            >
                              <BarChart3 size={11} /> Progress
                            </button>
                            <button
                              onClick={() => handleRemoveMember(m.userId, m.displayName || m.userId)}
                              className="text-rose-600 hover:text-rose-800 p-1"
                              title="Remove student"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invitations Section */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                      <Mail size={16} /> Secure Email Invitations ({invitations.length})
                    </h2>
                    <p className="text-[11px] text-[#777777] mt-0.5">
                      Issue expiring, single-use invite tokens directly to students.
                    </p>
                  </div>

                  <form onSubmit={handleCreateInvitation} className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="student@university.edu"
                      className="rounded-[4px] border border-[#DCDCDC] px-3 py-1.5 text-xs text-black placeholder-[#999999] focus:border-black focus:outline-none"
                      disabled={inviting}
                    />
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50"
                    >
                      <Plus size={12} /> Invite
                    </button>
                  </form>
                </div>

                <div className="divide-y divide-[#F0F0F0]">
                  {invitations.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#777777]">
                      No individual invitation tokens issued yet. You can also share the classroom join code directly.
                    </div>
                  ) : (
                    invitations.map((inv) => (
                      <div key={inv.id} className="p-4 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-black block">{inv.inviteeEmail}</span>
                          <span className="text-[10px] text-[#777777]">
                            Expires {new Date(inv.expiresAt).toLocaleDateString()} &bull; Token: {inv.token.slice(0, 12)}...
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                              inv.status === "accepted"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : inv.status === "pending"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {inv.status}
                          </span>

                          {inv.status === "pending" && (
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="text-rose-600 hover:text-rose-800 p-1 text-[11px] font-medium"
                              title="Revoke invitation"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Groups Management */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex items-center justify-between">
                  <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                    <Layers size={16} /> Student Groups ({groups.length})
                  </h2>
                  {groups.length > 0 && (
                    <button
                      onClick={() => setAssignModalOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-black hover:underline"
                    >
                      <UserPlus size={12} /> Assign Student to Group
                    </button>
                  )}
                </div>

                {groups.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#777777]">
                    No collaborative groups created yet. Create groups for multi-student coding projects.
                  </div>
                ) : (
                  <div className="max-h-[32rem] overflow-y-auto divide-y divide-[#F0F0F0]">
                    {groups.map((g) => {
                      const members = g.members || [];
                      return (
                        <div key={g.id} className="p-4 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-black">{g.name}</span>
                            <span className="text-[#888888]">
                              {members.length} {members.length === 1 ? "member" : "members"}
                            </span>
                          </div>
                          {members.length === 0 ? (
                            <p className="mt-2 text-[11px] text-[#888888]">No students in this group.</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {members.map((member) => {
                                const label = member.displayName || member.email || member.userId;
                                return (
                                  <li key={member.userId} className="flex items-center justify-between gap-3">
                                    <span className="truncate text-[#333333]">{label}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFromGroup(g.id, member.userId, label)}
                                      className="shrink-0 text-[11px] font-medium text-rose-600 hover:text-rose-800"
                                      aria-label={`Remove ${label} from ${g.name}`}
                                    >
                                      Remove
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Group Create Modal */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Create Student Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-3.5 mt-3">
              <div>
                <label htmlFor="group-name" className="block text-xs font-semibold text-black mb-1">Group Name</label>
                <input
                  id="group-name"
                  type="text"
                  required
                  placeholder="e.g. Group Alpha (Project Team 1)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] px-3 py-1.5 text-xs font-medium text-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={groupSubmitting}
                  className="rounded-[4px] bg-black px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Student Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Assign Student to Group</h2>
            <form onSubmit={handleAssignStudent} className="space-y-3.5 mt-3">
              <div>
                <label htmlFor="assign-group" className="block text-xs font-semibold text-black mb-1">Select Group</label>
                <select
                  id="assign-group"
                  required
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2 text-xs outline-none focus:border-black"
                >
                  <option value="">-- Choose a group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="assign-student" className="block text-xs font-semibold text-black mb-1">Select Student</label>
                <select
                  id="assign-student"
                  required
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2 text-xs outline-none focus:border-black"
                >
                  <option value="">-- Choose a student --</option>
                  {members.filter((m) => m.role === "student").map((m) => (
                    <option key={m.userId} value={m.userId}>{m.displayName || m.userId}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] px-3 py-1.5 text-xs font-medium text-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting}
                  className="rounded-[4px] bg-black px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  Assign to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Assignment Modal */}
      {assignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Create Coding Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="space-y-3 mt-3">
              <div>
                <label htmlFor="assignment-language" className="block text-xs font-semibold text-black mb-1">Assignment language</label>
                <select id="assignment-language" value={asgLanguage} onChange={e => { const lang = e.target.value as ClassroomLanguage; setAsgLanguage(lang); setAsgStarter(CLASSROOM_LANGUAGES[lang].starter); setAsgExtraName(""); setAsgExtraBody(""); }} className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs text-black">
                  {Object.entries(CLASSROOM_LANGUAGES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
                </select>
                {asgLanguage !== "cpp" && <p className="mt-1 text-xs text-gray-600">Use a single {CLASSROOM_LANGUAGES[asgLanguage].file} entry file for this assignment.</p>}
              </div>
              <div>
                <label htmlFor="assignment-title" className="block text-xs font-semibold text-black mb-1">Assignment Title *</label>
                <input
                  id="assignment-title"
                  type="text"
                  required
                  placeholder="e.g. Project 1: Binary Search Tree Tracer"
                  value={asgTitle}
                  onChange={(e) => setAsgTitle(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label htmlFor="assignment-description" className="block text-xs font-semibold text-black mb-1">Instructions / Description</label>
                <textarea
                  id="assignment-description"
                  rows={3}
                  placeholder="Detailed task instructions for your students..."
                  value={asgDescription}
                  onChange={(e) => setAsgDescription(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2.5 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assignment-due" className="block text-xs font-semibold text-black mb-1">Due Date</label>
                  <input
                    id="assignment-due"
                    type="date"
                    value={asgDueDate}
                    onChange={(e) => setAsgDueDate(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] px-2.5 py-1.5 text-xs outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label htmlFor="assignment-points" className="block text-xs font-semibold text-black mb-1">Max Points</label>
                  <input
                    id="assignment-points"
                    type="number"
                    min="0"
                    value={asgPoints}
                    onChange={(e) => setAsgPoints(Number(e.target.value))}
                    className="w-full rounded-md border border-[#DCDCDC] px-2.5 py-1.5 text-xs outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="asg-starter" className="block text-xs font-semibold text-black mb-1">
                  Starter code ({CLASSROOM_LANGUAGES[asgLanguage].file})
                </label>
                <textarea
                  id="asg-starter"
                  rows={6}
                  value={asgStarter}
                  onChange={(e) => setAsgStarter(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2.5 font-mono text-xs outline-none focus:border-black"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="asg-extra-name" className="block text-xs font-semibold text-black mb-1">
                    Extra file name
                  </label>
                  <input
                    id="asg-extra-name"
                    type="text"
                    disabled={asgLanguage !== "cpp"}
                    placeholder="helper.h"
                    value={asgExtraName}
                    onChange={(e) => setAsgExtraName(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label htmlFor="asg-extra-body" className="block text-xs font-semibold text-black mb-1">
                    Extra file contents
                  </label>
                  <textarea
                    id="asg-extra-body"
                    rows={2}
                    value={asgExtraBody}
                    onChange={(e) => setAsgExtraBody(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] p-2 text-xs font-mono outline-none focus:border-black"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#666666]">Language: {CLASSROOM_LANGUAGES[asgLanguage].label}. Hidden tests are stored for grading and are not returned to students.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-black">Public test</p>
                  <input aria-label="Public test name" value={asgPublicName} onChange={(e) => setAsgPublicName(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] px-2 py-1.5 text-xs" />
                  <textarea aria-label="Public test input" rows={2} placeholder="stdin" value={asgPublicStdin} onChange={(e) => setAsgPublicStdin(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] p-2 font-mono text-xs" />
                  <textarea aria-label="Public expected output" rows={2} placeholder="expected output" value={asgPublicExpected} onChange={(e) => setAsgPublicExpected(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] p-2 font-mono text-xs" />
                  <input aria-label="Public test points" type="number" min="0" value={asgPublicPoints} onChange={(e) => setAsgPublicPoints(Number(e.target.value))} className="w-full rounded-md border border-[#DCDCDC] px-2 py-1.5 text-xs" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-black">Hidden test</p>
                  <input aria-label="Hidden test name" value={asgHiddenName} onChange={(e) => setAsgHiddenName(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] px-2 py-1.5 text-xs" />
                  <textarea aria-label="Hidden test input" rows={2} placeholder="stdin" value={asgHiddenStdin} onChange={(e) => setAsgHiddenStdin(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] p-2 font-mono text-xs" />
                  <textarea aria-label="Hidden expected output" rows={2} placeholder="expected output" value={asgHiddenExpected} onChange={(e) => setAsgHiddenExpected(e.target.value)} className="w-full rounded-md border border-[#DCDCDC] p-2 font-mono text-xs" />
                  <input aria-label="Hidden test points" type="number" min="0" value={asgHiddenPoints} onChange={(e) => setAsgHiddenPoints(Number(e.target.value))} className="w-full rounded-md border border-[#DCDCDC] px-2 py-1.5 text-xs" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asgGroupMode}
                    onChange={(e) => setAsgGroupMode(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Group Project Mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asgAllowLate}
                    onChange={(e) => setAsgAllowLate(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Allow late submissions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asgAllowRun}
                    onChange={(e) => setAsgAllowRun(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Students can run</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asgAllowTrace}
                    onChange={(e) => setAsgAllowTrace(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Allow trace</span>
                </label>
                <label className="flex items-center gap-2">
                  Time limit (ms)
                  <input
                    aria-label="Assignment time limit"
                    type="number"
                    min={1000}
                    max={10000}
                    value={asgTimeLimit}
                    onChange={(e) => setAsgTimeLimit(Number(e.target.value))}
                    className="w-24 rounded-md border border-[#DCDCDC] px-2 py-1 text-xs"
                  />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asgPublish}
                    onChange={(e) => setAsgPublish(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Publish Immediately</span>
                </label>
              </div>
              <p className="text-[11px] text-[#777777]">
                Classroom runs stay in C++ and do not start a trace. The time limit cannot exceed 10 seconds.
              </p>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignmentModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] px-3.5 py-2 text-xs font-medium text-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={asgSubmitting}
                  className="rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white"
                >
                  {asgSubmitting ? "Creating..." : "Save Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Progress Modal */}
      {progressModalOpen && selectedStudentProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#007ACC] font-semibold">
                  Individual Student Profile
                </span>
                <h2 className="text-base font-bold text-black mt-0.5">
                  {selectedStudentProgress.displayName || "Student Progress"}
                </h2>
                <p className="text-xs text-[#777777]">
                  {selectedStudentProgress.email || `ID: ${selectedStudentProgress.studentId.slice(0, 12)}...`}
                </p>
              </div>
              <span className="rounded-[3px] border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-[#007ACC]">
                {selectedStudentProgress.averageScorePercent}% Avg
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 my-5">
              <div className="rounded-xl border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-center">
                <span className="text-[10px] uppercase font-semibold text-[#888888]">Submissions</span>
                <p className="text-xl font-bold text-black mt-1">
                  {selectedStudentProgress.submissionsCount}
                </p>
              </div>
              <div className="rounded-xl border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-center">
                <span className="text-[10px] uppercase font-semibold text-[#888888]">Graded Work</span>
                <p className="text-xl font-bold text-black mt-1">
                  {selectedStudentProgress.gradedCount}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-xs space-y-1.5 mb-5">
              <div className="flex justify-between">
                <span className="text-[#666666]">Last Recorded Activity:</span>
                <span className="font-semibold text-black">
                  {selectedStudentProgress.lastActiveAt
                    ? new Date(selectedStudentProgress.lastActiveAt).toLocaleString()
                    : "No submissions recorded yet"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Classroom Standing:</span>
                <span className="font-semibold text-black">
                  {selectedStudentProgress.averageScorePercent >= 80
                    ? "Excellent Mastery"
                    : selectedStudentProgress.averageScorePercent >= 60
                    ? "On Track"
                    : selectedStudentProgress.submissionsCount > 0
                    ? "Needs Review"
                    : "No Work Submitted"}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Link
                href={`/classroom/${classId}/messages?recipientId=${selectedStudentProgress.studentId}`}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-blue-600 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                <MessageSquare size={12} /> Message Student
              </Link>
              <button
                type="button"
                onClick={() => setProgressModalOpen(false)}
                className="rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
