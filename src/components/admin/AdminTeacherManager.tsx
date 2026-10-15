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
} from "lucide-react";
import { TeacherApplication, DecisionReasonCode, TeacherApplicationStatus } from "@/lib/classroom/types";

export default function AdminTeacherManager() {
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

  useEffect(() => {
    let active = true;
    const url = statusFilter && statusFilter !== "all"
      ? `/api/admin/teachers?status=${encodeURIComponent(statusFilter)}`
      : "/api/admin/teachers";

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.applications) {
          setApplications(data.applications);
        }
      })
      .catch(() => {
        if (active) setFeedback({ type: "error", message: "Failed loading teacher applications." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

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
                    {app.status !== "rejected" && app.status !== "approved" && (
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

      {/* Decision Modal */}
      {decisionModalOpen && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-black capitalize mb-1">
              {decisionType.replace("_", " ")} Application: {selectedApp.institutionName}
            </h2>
            <p className="text-xs text-[#666666] mb-4">
              Select an audit reason code and provide optional reviewer feedback.
            </p>

            <form onSubmit={handleExecuteDecision} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Reason Code *
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as DecisionReasonCode)}
                  className="w-full rounded-md border border-[#DCDCDC] p-2 text-xs outline-none focus:border-black"
                >
                  <option value="verified_credentials">Verified Credentials (Staff Directory / Page)</option>
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
