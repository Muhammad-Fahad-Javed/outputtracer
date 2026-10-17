"use client";

import { useEffect, useState } from "react";
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ShieldAlert,
  Building,
  Mail,
  FileText,
  User,
  Filter,
  Shield,
  UserPlus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { TeacherApplication, DecisionReasonCode, TeacherApplicationStatus } from "@/lib/classroom/types";
import { AdminInvitation } from "@/lib/classroom/adminRoleService";

export default function AdminTeacherManager() {
  const [activeTab, setActiveTab] = useState<"teachers" | "admins">("teachers");

  // Teacher applications state
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<TeacherApplication | null>(null);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject" | "request_info" | "suspend">("approve");
  const [reasonCode, setReasonCode] = useState<DecisionReasonCode>("verified_credentials");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Admin invitations state
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteAdminEmail, setInviteAdminEmail] = useState("");
  const [inviteAdminRole, setInviteAdminRole] = useState<"admin" | "staff">("admin");
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const loadApplications = async (filter?: string) => {
    try {
      const url = filter && filter !== "all"
        ? `/api/admin/teachers?status=${encodeURIComponent(filter)}`
        : "/api/admin/teachers";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.applications) {
        setApplications(data.applications);
      }
    } catch {
      setFeedback({ type: "error", message: "Failed loading teacher applications." });
    } finally {
      setLoading(false);
    }
  };

  const loadAdminInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const res = await fetch("/api/admin/invitations");
      const data = await res.json();
      if (data.success && data.invitations) {
        setAdminInvitations(data.invitations);
      }
    } catch {
      // ignore
    } finally {
      setLoadingInvitations(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchAdminData = async () => {
      try {
        const url = statusFilter && statusFilter !== "all"
          ? `/api/admin/teachers?status=${encodeURIComponent(statusFilter)}`
          : "/api/admin/teachers";
        const [appRes, invRes] = await Promise.all([
          fetch(url),
          fetch("/api/admin/invitations"),
        ]);
        if (!active) return;
        if (appRes.ok) {
          const appData = await appRes.json();
          if (appData.success && active) setApplications(appData.applications || []);
        }
        if (invRes.ok) {
          const invData = await invRes.json();
          if (invData.success && active) setAdminInvitations(invData.invitations || []);
        }
      } catch {
        if (active) setFeedback({ type: "error", message: "Failed loading teacher applications." });
      } finally {
        if (active) {
          setLoading(false);
          setLoadingInvitations(false);
        }
      }
    };

    void fetchAdminData();
    return () => {
      active = false;
    };
  }, [statusFilter]);

  const handleOpenDecision = (app: TeacherApplication, type: "approve" | "reject" | "request_info" | "suspend") => {
    setSelectedApp(app);
    setDecisionType(type);
    setReviewerNotes("");
    if (type === "approve") setReasonCode("verified_credentials");
    else if (type === "reject") setReasonCode("insufficient_evidence");
    else if (type === "request_info") setReasonCode("insufficient_evidence");
    else if (type === "suspend") setReasonCode("policy_violation");
    setDecisionModalOpen(true);
  };

  const handleExecuteDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: selectedApp.id,
          decision: decisionType,
          reasonCode,
          reviewerNotes: reviewerNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Decision failed." });
      } else {
        setFeedback({ type: "success", message: data.message || "Decision processed successfully." });
        setDecisionModalOpen(false);
        loadApplications(statusFilter);
      }
    } catch {
      setFeedback({ type: "error", message: "A network error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAdminInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteAdminEmail.trim()) return;

    setSubmittingInvite(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeEmail: inviteAdminEmail.trim(),
          role: inviteAdminRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", message: data.error || "Failed to create administrator invitation." });
      } else {
        setFeedback({
          type: "success",
          message: `Admin invitation link created for ${inviteAdminEmail}. Secure 3-day activation token generated.`,
        });
        setInviteAdminEmail("");
        loadAdminInvitations();
      }
    } catch {
      setFeedback({ type: "error", message: "Network error sending invitation." });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRevokeAdminInvite = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/admin/invitations?id=${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "success", message: "Administrator invitation revoked." });
        loadAdminInvitations();
      } else {
        setFeedback({ type: "error", message: data.error || "Failed revoking invitation." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error revoking invitation." });
    }
  };

  const statusBadge = (status: TeacherApplicationStatus) => {
    switch (status) {
      case "approved":
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800"><CheckCircle2 size={11} /> Approved</span>;
      case "pending_review":
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"><Clock size={11} /> Pending</span>;
      case "info_requested":
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800"><HelpCircle size={11} /> Info Requested</span>;
      case "rejected":
        return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800"><XCircle size={11} /> Rejected</span>;
      case "suspended":
        return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800"><ShieldAlert size={11} /> Suspended</span>;
      default:
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Mode Tabs */}
      <div className="flex gap-2 border-b border-[#EAEAEA] pb-2">
        <button
          onClick={() => setActiveTab("teachers")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "teachers"
              ? "bg-black text-white"
              : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
          }`}
        >
          <GraduationCap size={14} /> Teacher Verification ({applications.length})
        </button>

        <button
          onClick={() => setActiveTab("admins")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "admins"
              ? "bg-black text-white"
              : "text-[#666666] hover:bg-[#F0F0F0] hover:text-black"
          }`}
        >
          <Shield size={14} /> Platform Administrators ({adminInvitations.length})
        </button>
      </div>

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

      {activeTab === "teachers" ? (
        <>
          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-black">
              <Filter size={13} />
              <span>Status Filter:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["all", "pending_review", "approved", "info_requested", "rejected", "suspended"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === st
                      ? "bg-black text-white"
                      : "bg-[#F5F5F5] text-[#555555] hover:bg-[#EAEAEA]"
                  }`}
                >
                  {st === "all" ? "All Applications" : st.replace("_", " ").toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Applications List */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-xs text-[#666666]">
                Loading application records...
              </div>
            ) : applications.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#666666]">
                No teacher applications found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-[#F0F0F0]">
                {applications.map((app) => (
                  <div key={app.id} className="p-5 sm:p-6 transition-colors hover:bg-[#FAFAFA]">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-bold text-black flex items-center gap-1.5">
                            <GraduationCap size={15} />
                            {app.institutionName}
                          </h3>
                          {statusBadge(app.status)}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#666666]">
                          {app.department && (
                            <span className="flex items-center gap-1">
                              <Building size={12} /> {app.department}
                            </span>
                          )}
                          {app.institutionEmail && (
                            <span className="flex items-center gap-1">
                              <Mail size={12} /> {app.institutionEmail}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User size={12} /> User ID: {app.userId.slice(0, 8)}...
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} /> Submitted: {new Date(app.submittedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {app.coursesIntended && (
                          <div className="text-xs text-[#555555]">
                            <strong>Planned Courses:</strong> {app.coursesIntended}
                          </div>
                        )}

                        <div className="rounded-md border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-xs text-[#444444]">
                          <div className="font-semibold text-black mb-1 flex items-center gap-1">
                            <FileText size={12} /> Verification Evidence & Links:
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{app.evidenceNotes}</p>
                        </div>

                        {app.reviewerNotes && (
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-700">
                            <strong>Decision Reason / Notes:</strong> {app.reviewerNotes} ({app.decisionReasonCode || "recorded"})
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        {app.status !== "approved" && (
                          <button
                            onClick={() => handleOpenDecision(app, "approve")}
                            className="inline-flex items-center justify-center gap-1 rounded-[4px] bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                        )}
                        {app.status === "pending_review" && (
                          <button
                            onClick={() => handleOpenDecision(app, "request_info")}
                            className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                          >
                            <HelpCircle size={12} /> Request Info
                          </button>
                        )}
                        {app.status !== "rejected" && app.status !== "suspended" && (
                          <button
                            onClick={() => handleOpenDecision(app, "reject")}
                            className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        )}
                        {app.status === "approved" && (
                          <button
                            onClick={() => handleOpenDecision(app, "suspend")}
                            className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
                          >
                            <ShieldAlert size={12} /> Suspend
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Administrator Role Management Panel */
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-black flex items-center gap-1.5 mb-1">
              <UserPlus size={16} /> Invite New Platform Administrator
            </h2>
            <p className="text-xs text-[#666666] mb-4">
              Authorized administrators can invite colleagues by email. Upon sign-in, the recipient claims administrator privileges stored securely in the database.
            </p>

            <form onSubmit={handleCreateAdminInvite} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                value={inviteAdminEmail}
                onChange={(e) => setInviteAdminEmail(e.target.value)}
                placeholder="colleague@outputtracer.com"
                className="flex-1 rounded-[4px] border border-[#DCDCDC] px-3.5 py-2 text-xs text-black placeholder-[#999999] focus:border-black focus:outline-none"
                disabled={submittingInvite}
                required
              />
              <select
                value={inviteAdminRole}
                onChange={(e) => setInviteAdminRole(e.target.value as "admin" | "staff")}
                className="rounded-[4px] border border-[#DCDCDC] bg-white px-3 py-2 text-xs text-black focus:border-black focus:outline-none"
                disabled={submittingInvite}
              >
                <option value="admin">Platform Administrator (Full Permissions)</option>
                <option value="staff">Staff Moderator</option>
              </select>
              <button
                type="submit"
                disabled={submittingInvite || !inviteAdminEmail.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333] disabled:opacity-50 transition-colors"
              >
                {submittingInvite ? "Generating Token..." : "Issue Admin Invite"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
                <Shield size={16} /> Administrator Invitations Roster ({adminInvitations.length})
              </h2>
              <button
                onClick={loadAdminInvitations}
                className="p-1 text-[#666666] hover:text-black"
                title="Refresh roster"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="divide-y divide-[#F0F0F0]">
              {loadingInvitations ? (
                <div className="p-8 text-center text-xs text-[#888888]">Loading invitations...</div>
              ) : adminInvitations.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#888888]">
                  No administrator invitations currently issued.
                </div>
              ) : (
                adminInvitations.map((inv) => (
                  <div key={inv.id} className="p-4 sm:p-5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-black">{inv.inviteeEmail}</span>
                        <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-[#007ACC] uppercase">
                          {inv.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#777777] mt-0.5">
                        Invited by {inv.invitedByName} &bull; Expires {new Date(inv.expiresAt).toLocaleDateString()} &bull; Token: {inv.token.slice(0, 10)}...
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
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
                          onClick={() => handleRevokeAdminInvite(inv.id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          title="Revoke admin invite"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {decisionModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black mb-1 capitalize">
              {decisionType.replace("_", " ")} Application
            </h2>
            <p className="text-xs text-[#666666] mb-4">
              {selectedApp.institutionName} ({selectedApp.institutionEmail || "No official email"})
            </p>

            <form onSubmit={handleExecuteDecision} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Reason Code (Audit & Regulatory Record)
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as DecisionReasonCode)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2 text-xs outline-none focus:border-black"
                >
                  <option value="verified_credentials">Verified Academic / Faculty Credentials</option>
                  <option value="institutional_affiliation_confirmed">Institutional Affiliation Confirmed</option>
                  <option value="insufficient_evidence">Insufficient Evidence Provided</option>
                  <option value="invalid_affiliation">Invalid or Unrecognized Affiliation</option>
                  <option value="policy_violation">Policy Violation or Conduct Issue</option>
                  <option value="other">Other Administrative Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Reviewer Notes / Feedback to Applicant
                </label>
                <textarea
                  rows={3}
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Notes explaining this decision or details on what additional proof is requested..."
                  className="w-full rounded-md border border-[#DCDCDC] p-2.5 text-xs outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDecisionModalOpen(false)}
                  className="rounded-[4px] border border-[#DCDCDC] bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-[#F2F2F2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`rounded-[4px] px-4 py-2 text-xs font-semibold text-white ${
                    decisionType === "approve"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : decisionType === "reject"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-black hover:bg-[#333333]"
                  }`}
                >
                  {submitting ? "Processing..." : `Confirm ${decisionType.replace("_", " ")}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
