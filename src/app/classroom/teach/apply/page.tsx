"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Send,
  ArrowLeft,
  Building,
  Mail,
  BookOpen,
  FileText,
  Zap,
} from "lucide-react";
import { TeacherApplication, UserCapabilities } from "@/lib/classroom/types";

export default function TeacherApplicationPage() {
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<UserCapabilities | null>(null);
  const [application, setApplication] = useState<TeacherApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [institutionName, setInstitutionName] = useState("");
  const [institutionEmail, setInstitutionEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [coursesIntended, setCoursesIntended] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/classroom/teacher/apply");
      if (res.status === 401) {
        setCapabilities(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCapabilities(data.capabilities);
        setApplication(data.application);
        if (data.application) {
          setInstitutionName(data.application.institutionName || "");
          setInstitutionEmail(data.application.institutionEmail || "");
          setDepartment(data.application.department || "");
          setCoursesIntended(data.application.coursesIntended || "");
          setEvidenceNotes(data.application.evidenceNotes || "");
        }
      }
    } catch {
      setError("Failed to load application status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/classroom/teacher/apply")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setCapabilities(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (active && data.success) {
          setCapabilities(data.capabilities);
          setApplication(data.application);
          if (data.application) {
            setInstitutionName(data.application.institutionName || "");
            setInstitutionEmail(data.application.institutionEmail || "");
            setDepartment(data.application.department || "");
            setCoursesIntended(data.application.coursesIntended || "");
            setEvidenceNotes(data.application.evidenceNotes || "");
          }
        }
      })
      .catch(() => {
        if (active) setError("Failed to load application status.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleInstantActivate = async () => {
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/classroom/teacher/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate_instant",
          institutionName: institutionName || "Independent Educator",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed activating teacher account");
      } else {
        setSuccessMsg(data.message || "Teacher account activated successfully!");
        setCapabilities(data.capabilities);
        setApplication(data.application);
      }
    } catch {
      setError("A network error occurred while activating.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, isDraft = false) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/classroom/teacher/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: institutionName || "Independent Educator",
          institutionEmail: institutionEmail || undefined,
          department: department || undefined,
          coursesIntended: coursesIntended || undefined,
          evidenceNotes: evidenceNotes || "Self-service verified educator profile activation.",
          isDraft,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed submitting application");
      } else {
        setSuccessMsg(data.message || "Account activated successfully!");
        setApplication(data.application);
        await loadStatus();
      }
    } catch {
      setError("A network error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black mb-6"
          >
            <ArrowLeft size={13} /> Back to Home
          </Link>

          {loading ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#666666]">
              Loading educator profile status...
            </div>
          ) : !capabilities?.isAuthenticated ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-8 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-4">
                <GraduationCap size={28} />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-black">
                Educator Portal
              </h1>
              <p className="mt-2 text-xs text-[#666666] max-w-md mx-auto leading-relaxed">
                Sign in to activate self-service educator status, create classrooms, assign programming tasks, and track student code execution.
              </p>
              <div className="mt-6">
                <Link
                  href="/login?next=/classroom/teach/apply"
                  className="inline-flex items-center justify-center rounded-[4px] bg-black px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                >
                  Sign in to Continue
                </Link>
              </div>
            </div>
          ) : capabilities.isVerifiedTeacher ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-black flex items-center gap-2">
                    Verified Educator
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Active
                    </span>
                  </h1>
                  <p className="text-xs text-[#666666]">
                    Your educator account is active. You have full access to create classrooms, assign work, and inspect student code.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] p-4 text-xs text-[#666666] space-y-1">
                <p><strong>Institution:</strong> {application?.institutionName || "Active Educator"}</p>
                {application?.department && <p><strong>Department:</strong> {application.department}</p>}
                <p><strong>Status:</strong> Active Teacher Profile</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/classroom"
                  className="inline-flex items-center justify-center rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
                >
                  Go to Classroom Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-8 shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                    <GraduationCap size={24} />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-black">
                      Activate Educator Account
                    </h1>
                    <p className="text-xs text-[#666666]">
                      Instant self-service activation — no waiting for manual admin approval.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleInstantActivate}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-[4px] bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Zap size={13} /> {submitting ? "Activating..." : "Quick Activate"}
                </button>
              </div>

              {application?.status === "pending_review" && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">Ready for Instant Activation</p>
                    <p className="text-amber-800 text-[11px] mt-0.5">
                      Teacher verification is now self-service. You can activate your account immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleInstantActivate}
                    className="shrink-0 rounded-[4px] bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                  >
                    Activate Now
                  </button>
                </div>
              )}

              {application?.status === "info_requested" && (
                <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <HelpCircle size={14} /> Note from Admin
                  </div>
                  <p className="text-blue-800">{application.reviewerNotes || "Please update your details."}</p>
                </div>
              )}

              {application?.status === "rejected" && (
                <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <AlertCircle size={14} /> Previous Application Closed
                  </div>
                  <p className="text-rose-800">{application.reviewerNotes || "You may submit updated information below."}</p>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> {successMsg}
                </div>
              )}

              <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    <Building size={12} className="inline mr-1" /> Institution / Organization / School *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UC Berkeley, Self-Taught Academy, or Independent Educator"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      <BookOpen size={12} className="inline mr-1" /> Department / Subject Area (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Computer Science, Engineering"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      <Mail size={12} className="inline mr-1" /> Institutional Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. instructor@school.edu"
                      value={institutionEmail}
                      onChange={(e) => setInstitutionEmail(e.target.value)}
                      className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    <FileText size={12} className="inline mr-1" /> Planned Courses / Topics (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CS101 Intro to C++, 8086 Assembly Lab, Python DSA"
                    value={coursesIntended}
                    onChange={(e) => setCoursesIntended(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] px-3 py-2 text-xs outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Teaching Profile & Bio *
                  </label>
                  <p className="text-[11px] text-[#666666] mb-1.5">
                    Brief note about what you teach or your teaching credentials.
                  </p>
                  <textarea
                    required
                    rows={3}
                    placeholder="Brief description of your courses or teaching responsibilities."
                    value={evidenceNotes}
                    onChange={(e) => setEvidenceNotes(e.target.value)}
                    className="w-full rounded-md border border-[#DCDCDC] p-3 text-xs outline-none focus:border-black"
                  />
                </div>

                <div className="pt-2 flex flex-wrap gap-3 items-center">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                  >
                    <Send size={13} /> {submitting ? "Activating..." : "Activate Educator Account"}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleInstantActivate}
                    className="inline-flex sm:hidden items-center justify-center gap-1.5 rounded-[4px] bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Zap size={13} /> Quick Activate
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={(e) => handleSubmit(e, true)}
                    className="inline-flex items-center justify-center rounded-[4px] border border-[#DCDCDC] bg-white px-4 py-2.5 text-xs font-medium text-black hover:bg-[#F2F2F2] disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
