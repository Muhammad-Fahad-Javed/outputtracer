"use client";

import { useEffect, useState, useCallback, use } from "react";
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
  const [asgTitle, setAsgTitle] = useState("");
  const [asgDescription, setAsgDescription] = useState("");
  const [asgDueDate, setAsgDueDate] = useState("");
  const [asgPoints, setAsgPoints] = useState(100);
  const [asgGroupMode, setAsgGroupMode] = useState(false);
  const [asgPublish, setAsgPublish] = useState(true);
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

  const loadAll = useCallback(() => {
    Promise.all([
      fetch(`/api/classroom/${classId}`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/roster`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/groups`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/invitations`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/reports/progress`).then((r) => r.json()),
    ]).then(([classRes, rosterRes, groupRes, invRes, progRes]) => {
      if (!classRes.success || !classRes.isTeacher) {
        setError(classRes.error || "Instructor privileges required to manage this classroom.");
        setLoading(false);
        return;
      }
      setClassroom(classRes.classroom);
      if (rosterRes.success) setMembers(rosterRes.members || []);
      if (groupRes.success) setGroups(groupRes.groups || []);
      if (invRes?.success) setInvitations(invRes.invitations || []);
      if (progRes?.success) setProgressReport(progRes.report || null);
      setLoading(false);
    }).catch(() => {
      setError("Failed to load management console.");
      setLoading(false);
    });
  }, [classId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/classroom/${classId}`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/roster`).then((r) => r.json()),
      fetch(`/api/classroom/${classId}/groups`).then((r) => r.json()),
    ]).then(([classRes, rosterRes, groupRes]) => {
      if (!active) return;
      if (!classRes.success || !classRes.isTeacher) {
        setError(classRes.error || "Instructor privileges required to manage this classroom.");
        setLoading(false);
        return;
      }
      setClassroom(classRes.classroom);
      if (rosterRes.success) setMembers(rosterRes.members || []);
      if (groupRes.success) setGroups(groupRes.groups || []);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError("Failed to load management console.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [classId]);

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
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
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
                  <div className="divide-y divide-[#F0F0F0]">
                    {groups.map((g) => (
                      <div key={g.id} className="p-4 flex items-center justify-between text-xs">
                        <span className="font-semibold text-black">{g.name}</span>
                        <span className="text-[#888888]">Group ID: {g.id.slice(0, 8)}</span>
                      </div>
                    ))}
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
                <label className="block text-xs font-semibold text-black mb-1">Group Name</label>
                <input
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
                <label className="block text-xs font-semibold text-black mb-1">Select Group</label>
                <select
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
                <label className="block text-xs font-semibold text-black mb-1">Select Student</label>
                <select
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
          <div className="w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1">Create Coding Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="space-y-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">Assignment Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project 1: Binary Search Tree Tracer"
                  value={asgTitle}
                  onChange={(e) => setAsgTitle(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">Instructions / Description</label>
                <textarea
                  rows={3}
                  placeholder="Detailed task instructions for your students..."
                  value={asgDescription}
                  onChange={(e) => setAsgDescription(e.target.value)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2.5 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Due Date</label>
                  <input
                    type="date"
                    value={asgDueDate}
                    onChange={(e) => setAsgDueDate(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] px-2.5 py-1.5 text-xs outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Max Points</label>
                  <input
                    type="number"
                    min="0"
                    value={asgPoints}
                    onChange={(e) => setAsgPoints(Number(e.target.value))}
                    className="w-full rounded-md border border-[#DCDCDC] px-2.5 py-1.5 text-xs outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1 text-xs">
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
                    checked={asgPublish}
                    onChange={(e) => setAsgPublish(e.target.checked)}
                    className="rounded border-[#DCDCDC]"
                  />
                  <span>Publish Immediately</span>
                </label>
              </div>

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
