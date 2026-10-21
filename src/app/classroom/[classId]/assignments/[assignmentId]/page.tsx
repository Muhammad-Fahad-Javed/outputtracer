"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  ArrowLeft,
  Clock,
  Play,
  CheckCircle2,
  Code2,
  Users,
} from "lucide-react";
import { ClassroomAssignment } from "@/lib/classroom/types";

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const resolvedParams = use(params);
  const { classId, assignmentId } = resolvedParams;

  const [assignment, setAssignment] = useState<ClassroomAssignment | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`/api/classroom/${classId}/assignments/${assignmentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (!data.success) {
          setError(data.error || "Failed to load assignment.");
        } else {
          setAssignment(data.assignment);
          setIsTeacher(Boolean(data.isTeacher));
        }
      })
      .catch(() => {
        if (active) setError("A network error occurred.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classId, assignmentId]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      <Header />

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Link
            href={`/classroom/${classId}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#666666] hover:text-black mb-6"
          >
            <ArrowLeft size={13} /> Back to Classroom
          </Link>

          {loading ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#666666]">
              Loading assignment...
            </div>
          ) : error || !assignment ? (
            <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
              <h2 className="text-base font-bold text-rose-700 mb-1">Access Restricted</h2>
              <p className="text-xs text-[#666666] mb-4">{error || "Assignment not found."}</p>
              <Link
                href={`/classroom/${classId}`}
                className="inline-flex items-center rounded-[4px] bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
              >
                Return to Classroom
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 sm:p-8 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800">
                        {assignment.maxPoints} Points
                      </span>
                      {assignment.groupMode && (
                        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700 flex items-center gap-1">
                          <Users size={11} /> Group Project
                        </span>
                      )}
                      {!assignment.isPublished && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-700">
                          Draft
                        </span>
                      )}
                    </div>

                    <h1 className="text-2xl font-bold tracking-tight text-black">
                      {assignment.title}
                    </h1>

                    <div className="flex flex-wrap gap-4 text-xs text-[#666666] pt-1">
                      {assignment.dueDate ? (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Due: {new Date(assignment.dueDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span>No deadline configured</span>
                      )}
                      <span>Late submissions: {assignment.allowLate ? "Allowed" : "Disallowed"}</span>
                    </div>
                  </div>

                  <Link
                    href="/"
                    className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#333333] shrink-0"
                  >
                    <Play size={12} fill="white" /> Open in OutputTracer IDE
                  </Link>
                </div>

                {assignment.description && (
                  <div className="mt-6 pt-6 border-t border-[#F0F0F0]">
                    <h2 className="text-xs font-bold text-black uppercase tracking-wider mb-2">
                      Instructions
                    </h2>
                    <p className="text-xs text-[#555555] leading-relaxed whitespace-pre-wrap">
                      {assignment.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Starter Code Preview */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-black flex items-center gap-2 mb-3">
                  <Code2 size={16} /> Starter Code
                </h2>
                <div className="rounded-lg border border-[#EAEAEA] bg-[#1E1E1E] p-4 text-xs font-mono text-white overflow-x-auto">
                  <pre>{Object.values(assignment.starterCode)[0] || "// No starter code"}</pre>
                </div>
              </div>

              {/* Public Test Cases */}
              <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-black flex items-center gap-2 mb-3">
                  <CheckCircle2 size={16} /> Public Test Specifications ({assignment.publicTestCases?.length || 0})
                </h2>

                {assignment.publicTestCases?.length === 0 ? (
                  <p className="text-xs text-[#777777]">No public test cases provided for this assignment.</p>
                ) : (
                  <div className="space-y-3">
                    {assignment.publicTestCases?.map((tc, idx) => (
                      <div key={tc.id || idx} className="rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-semibold text-black">
                          <span>Test #{idx + 1}: {tc.name}</span>
                          <span className="text-[#666666]">{tc.points} pts</span>
                        </div>
                        {tc.stdin && (
                          <div className="text-[11px]">
                            <span className="text-[#888888] font-mono">Standard Input:</span>
                            <pre className="mt-0.5 rounded bg-white border border-[#EAEAEA] p-1.5 font-mono">{tc.stdin}</pre>
                          </div>
                        )}
                        <div className="text-[11px]">
                          <span className="text-[#888888] font-mono">Expected Output:</span>
                          <pre className="mt-0.5 rounded bg-white border border-[#EAEAEA] p-1.5 font-mono">{tc.expectedOutput}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hidden Test Case Banner */}
                {isTeacher && assignment.hiddenTestCases && assignment.hiddenTestCases.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900">
                    <strong className="block mb-1">Teacher View: {assignment.hiddenTestCases.length} Hidden Grading Tests Configured</strong>
                    <p className="text-[11px] text-purple-800">These test cases are hidden from student API responses and will be evaluated during automated grading.</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-[#EAEAEA] bg-[#F5F5F5] p-3 text-xs text-[#666666]">
                    <strong>Note on Grading:</strong> In addition to public practice checks, submissions may be verified against hidden automated test specifications upon final submission.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
