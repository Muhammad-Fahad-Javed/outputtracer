"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  FolderCode,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Archive,
  Eye,
} from "lucide-react";
import AdminTeacherManager from "./AdminTeacherManager";

interface PlatformStats {
  totalUsers: number;
  totalClassrooms: number;
  totalCourses: number;
  totalAssignments: number;
  pendingTeacherApps: number;
  pendingAdminInvites: number;
}

interface PlatformUser {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  roles: string[];
  createdAt: string;
}

interface RecentClassroom {
  id: string;
  name: string;
  subject: string;
  is_archived: boolean;
  created_at: string;
  teacher?: { full_name?: string; display_name?: string };
}

interface RecentCourse {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  created_at: string;
}

interface AuditLog {
  id: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export default function AdminDashboardManager() {
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "teachers" | "courses" | "audit">("overview");

  // Overview Data
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentClassrooms, setRecentClassrooms] = useState<RecentClassroom[]>([]);
  const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Users Data
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userStats, setUserStats] = useState<{ learnerCount: number; teacherCount: number; adminCount: number } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      loadUsers();
    } else if (activeTab === "audit") {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadOverview = async () => {
    try {
      setLoadingOverview(true);
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentClassrooms(data.recentClassrooms || []);
        setRecentCourses(data.recentCourses || []);
      }
    } catch {
      setActionFeedback({ type: "error", message: "Failed loading platform metrics." });
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadUsers = async (search = userSearch, role = userRoleFilter) => {
    try {
      setLoadingUsers(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (role && role !== "all") params.set("role", role);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        if (data.stats) {
          setUserStats({
            learnerCount: data.stats.learnerCount,
            teacherCount: data.stats.teacherCount,
            adminCount: data.stats.adminCount,
          });
        }
      }
    } catch {
      setActionFeedback({ type: "error", message: "Failed loading user roster." });
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const res = await fetch("/api/admin/audit");
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch {
      // Handled gracefully
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleRoleChange = async (
    targetUserId: string,
    role: "student" | "teacher" | "admin" | "staff",
    action: "add" | "remove"
  ) => {
    setUpdatingUserId(targetUserId);
    setActionFeedback(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, newRole: role, action }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionFeedback({ type: "error", message: data.error || "Failed updating role." });
      } else {
        setActionFeedback({ type: "success", message: data.message });
        await loadUsers();
        await loadOverview();
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error updating user role." });
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Metric Badges / Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#888888] flex items-center justify-between">
            Users <Users size={14} className="text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-black font-mono">
            {loadingOverview ? "—" : stats?.totalUsers ?? 0}
          </div>
          <div className="text-[10px] text-[#666666] mt-0.5">Learners & educators</div>
        </div>

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#888888] flex items-center justify-between">
            Classrooms <GraduationCap size={14} className="text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-black font-mono">
            {loadingOverview ? "—" : stats?.totalClassrooms ?? 0}
          </div>
          <div className="text-[10px] text-[#666666] mt-0.5">Active rooms</div>
        </div>

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#888888] flex items-center justify-between">
            Courses <BookOpen size={14} className="text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-black font-mono">
            {loadingOverview ? "—" : stats?.totalCourses ?? 0}
          </div>
          <div className="text-[10px] text-[#666666] mt-0.5">Learn modules</div>
        </div>

        <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#888888] flex items-center justify-between">
            Assignments <FolderCode size={14} className="text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-black font-mono">
            {loadingOverview ? "—" : stats?.totalAssignments ?? 0}
          </div>
          <div className="text-[10px] text-[#666666] mt-0.5">Graded tasks</div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-amber-800 flex items-center justify-between">
            Teacher Apps <Clock size={14} className="text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-900 font-mono">
            {loadingOverview ? "—" : stats?.pendingTeacherApps ?? 0}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">Pending review</div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-blue-800 flex items-center justify-between">
            Admin Invites <ShieldCheck size={14} className="text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-blue-900 font-mono">
            {loadingOverview ? "—" : stats?.pendingAdminInvites ?? 0}
          </div>
          <div className="text-[10px] text-blue-700 mt-0.5">Active tokens</div>
        </div>
      </div>

      {/* Global Action Feedback Alert */}
      {actionFeedback && (
        <div
          className={`rounded-lg p-3 text-xs flex items-center gap-2 ${
            actionFeedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {actionFeedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {actionFeedback.message}
        </div>
      )}

      {/* Navigation Tab Bar */}
      <div className="flex border-b border-[#EAEAEA] gap-6 text-xs font-semibold overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`pb-3 transition-colors shrink-0 ${
            activeTab === "overview"
              ? "border-b-2 border-black text-black"
              : "text-[#666666] hover:text-black"
          }`}
        >
          Platform Oversight
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`pb-3 transition-colors shrink-0 flex items-center gap-1.5 ${
            activeTab === "users"
              ? "border-b-2 border-black text-black"
              : "text-[#666666] hover:text-black"
          }`}
        >
          User Management
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("teachers")}
          className={`pb-3 transition-colors shrink-0 flex items-center gap-1.5 ${
            activeTab === "teachers"
              ? "border-b-2 border-black text-black"
              : "text-[#666666] hover:text-black"
          }`}
        >
          Educators & Invitations
          {stats && stats.pendingTeacherApps > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              {stats.pendingTeacherApps}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("courses")}
          className={`pb-3 transition-colors shrink-0 ${
            activeTab === "courses"
              ? "border-b-2 border-black text-black"
              : "text-[#666666] hover:text-black"
          }`}
        >
          Classrooms & Courses
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`pb-3 transition-colors shrink-0 ${
            activeTab === "audit"
              ? "border-b-2 border-black text-black"
              : "text-[#666666] hover:text-black"
          }`}
        >
          Security Audit Logs
        </button>
      </div>

      {/* TAB 1: Platform Oversight */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Classrooms */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                <GraduationCap size={16} /> Recent Classrooms
              </h2>
              <Link href="/classroom" className="text-xs text-[#007ACC] hover:underline flex items-center gap-1">
                View Studio <ExternalLink size={11} />
              </Link>
            </div>
            {recentClassrooms.length === 0 ? (
              <p className="text-xs text-[#888888] py-6 text-center">No classrooms created yet.</p>
            ) : (
              <div className="divide-y divide-[#F2F2F2]">
                {recentClassrooms.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-black">{c.name}</span>
                      <p className="text-[11px] text-[#666666]">{c.subject} &bull; Instructor: {c.teacher?.full_name || c.teacher?.display_name || "Teacher"}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.is_archived ? "bg-neutral-100 text-neutral-600" : "bg-emerald-50 text-emerald-700"}`}>
                      {c.is_archived ? "Archived" : "Active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Curriculum Courses */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                <BookOpen size={16} /> Curriculum Modules
              </h2>
              <Link href="/admin/learn" className="text-xs text-[#007ACC] hover:underline flex items-center gap-1">
                Manage Learn CMS <ExternalLink size={11} />
              </Link>
            </div>
            {recentCourses.length === 0 ? (
              <p className="text-xs text-[#888888] py-6 text-center">No courses published yet.</p>
            ) : (
              <div className="divide-y divide-[#F2F2F2]">
                {recentCourses.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-black">{c.title}</span>
                      <p className="text-[11px] text-[#666666]">Slug: /{c.slug}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.is_published ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                      {c.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: User Management */}
      {activeTab === "users" && (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-black tracking-tight">Platform User Directory</h2>
              <p className="text-xs text-[#666666]">
                {userStats
                  ? `${userStats.learnerCount} Students &bull; ${userStats.teacherCount} Educators &bull; ${userStats.adminCount} Administrators`
                  : "Review user accounts and modify permissions with audit logging."}
              </p>
            </div>

            {/* Filter and Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-[#888888]" />
                <input
                  type="text"
                  placeholder="Search name, email, username..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    loadUsers(e.target.value, userRoleFilter);
                  }}
                  className="rounded-md border border-[#DCDCDC] pl-8 pr-3 py-1.5 text-xs outline-none focus:border-black w-48 sm:w-64"
                />
              </div>

              <select
                value={userRoleFilter}
                onChange={(e) => {
                  setUserRoleFilter(e.target.value);
                  loadUsers(userSearch, e.target.value);
                }}
                className="rounded-md border border-[#DCDCDC] px-2.5 py-1.5 text-xs outline-none bg-white font-medium"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="teacher">Educators</option>
                <option value="admin">Administrators</option>
              </select>

              <button
                type="button"
                onClick={() => loadUsers()}
                className="rounded-md border border-[#DCDCDC] p-1.5 hover:bg-[#F2F2F2] text-[#555555]"
                title="Refresh user list"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {loadingUsers ? (
            <div className="py-12 text-center text-xs text-[#666666]">Loading user directory...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#666666]">No users found matching query.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#EAEAEA] text-[#888888] font-semibold">
                    <th className="pb-2.5 pr-4">User</th>
                    <th className="pb-2.5 pr-4">Email</th>
                    <th className="pb-2.5 pr-4">Active Roles</th>
                    <th className="pb-2.5 pr-4">Registered</th>
                    <th className="pb-2.5 text-right">Role Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F2F2]">
                  {users.map((u) => {
                    const isAdmin = u.roles.includes("admin");
                    const isTeacher = u.roles.includes("teacher");
                    const isBusy = updatingUserId === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-[#FAFAFA] transition-colors">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-black">{u.fullName || u.displayName}</div>
                          {u.username && (
                            <div className="text-[11px] text-[#888888] font-mono">@{u.username}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-[11px] text-[#444444]">{u.email}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span
                                key={r}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  r === "admin"
                                    ? "bg-amber-100 text-amber-800"
                                    : r === "teacher"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[#888888] text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Teacher Toggle */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRoleChange(u.id, "teacher", isTeacher ? "remove" : "add")}
                              className={`rounded px-2 py-1 text-[10px] font-semibold border ${
                                isTeacher
                                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : "border-[#DCDCDC] bg-white text-black hover:bg-[#F2F2F2]"
                              }`}
                            >
                              {isTeacher ? "Revoke Teacher" : "Grant Teacher"}
                            </button>

                            {/* Admin Toggle */}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRoleChange(u.id, "admin", isAdmin ? "remove" : "add")}
                              className={`rounded px-2 py-1 text-[10px] font-semibold border ${
                                isAdmin
                                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              }`}
                            >
                              {isAdmin ? "Demote Admin" : "Make Admin"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Educators & Co-Admin Invitations (Embeds AdminTeacherManager) */}
      {activeTab === "teachers" && (
        <AdminTeacherManager />
      )}

      {/* TAB 4: Classrooms & Courses Oversight */}
      {activeTab === "courses" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-black tracking-tight">Curriculum CMS Administration</h2>
                <p className="text-xs text-[#666666]">
                  Create, edit, publish, or modify courses and practice problem banks.
                </p>
              </div>
              <Link
                href="/admin/learn"
                className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
              >
                Open Curriculum Editor <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-black tracking-tight">Classroom Space Moderation</h2>
                <p className="text-xs text-[#666666]">
                  Inspect all educator classrooms, enrollment sizes, and active assignments.
                </p>
              </div>
              <Link
                href="/classroom"
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-4 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
              >
                Open Educator Studio <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Security Audit Logs */}
      {activeTab === "audit" && (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-black tracking-tight">Audit Event Ledger</h2>
              <p className="text-xs text-[#666666]">
                Immutable server audit log recording role modifications, teacher decisions, and moderation actions.
              </p>
            </div>
            <button
              type="button"
              onClick={loadAuditLogs}
              className="rounded-md border border-[#DCDCDC] p-1.5 hover:bg-[#F2F2F2] text-[#555555]"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {loadingAudit ? (
            <div className="py-10 text-center text-xs text-[#666666]">Loading audit ledger...</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#666666]">No audit events recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#EAEAEA] text-[#888888] font-semibold">
                    <th className="pb-2 pr-4">Timestamp</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4">Target Type</th>
                    <th className="pb-2 pr-4">Target ID</th>
                    <th className="pb-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F2F2] font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAFAFA]">
                      <td className="py-2.5 pr-4 text-[#888888] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-black">{log.action}</td>
                      <td className="py-2.5 pr-4 text-[#555555]">{log.targetType}</td>
                      <td className="py-2.5 pr-4 text-[#888888] truncate max-w-[120px]">{log.targetId}</td>
                      <td className="py-2.5 text-[#666666] truncate max-w-[200px]">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
