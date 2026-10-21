"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Play, Send } from "lucide-react";

const CollabEditor = dynamic(() => import("@/components/collab/CollabEditor"), { ssr: false });
import { canEdit } from "@/lib/cloud/roles";
import { useClassroomCollab } from "./useClassroomCollab";

interface SubmissionView {
  id: string;
  status: string;
  codeFiles: Record<string, string>;
  submittedAt?: string;
  isLate?: boolean;
  grade?: number | null;
  feedback?: string | null;
  gradedAt?: string | null;
}

export default function AssignmentWorkspace({
  classId,
  assignmentId,
  allowLate,
  previewStudent = false,
}: {
  classId: string;
  assignmentId: string;
  allowLate: boolean;
  previewStudent?: boolean;
}) {
  const collab = useClassroomCollab({
    classId,
    assignmentId,
    previewStudent,
    enabled: true,
  });
  const [submission, setSubmission] = useState<SubmissionView | null>(null);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  useEffect(() => {
    if (previewStudent) return;
    let cancelled = false;
    fetch(`/api/classroom/${classId}/assignments/${assignmentId}/mine`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !data.submission) return;
        setSubmission(data.submission);
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: "err", text: "Could not load your previous submission." });
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, classId, previewStudent]);

  const editable = canEdit(collab.role) && !collab.frozen;
  const canRun = editable && collab.allowRun;

  const runPublicTests = async () => {
    if (!canRun) return;
    setBusy("run");
    setNotice(null);
    setRunOutput(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runTests: true,
          language: "cpp",
          groupId: collab.groupId,
          previewStudent,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setNotice({ tone: "err", text: data.error || "The program could not be run." });
        return;
      }
      const tests = Array.isArray(data.testResults)
        ? data.testResults
            .map((test: { name?: string; passed?: boolean; actualOutput?: string }) =>
              `${test.passed ? "PASS" : "FAIL"} ${test.name || "test"}${test.actualOutput ? `: ${test.actualOutput}` : ""}`
            )
            .join("\n")
        : "";
      const output = [data.compilationError, data.stderr, data.output, tests].filter(Boolean).join("\n");
      setRunOutput(output || "(no output)");
      setNotice({
        tone: data.compilationError || data.timedOut ? "err" : "ok",
        text: data.timedOut
          ? "The program hit the time limit. That is not stored as a wrong answer."
          : data.compilationError
            ? "The program did not compile."
            : "Run finished.",
      });
    } catch {
      setNotice({ tone: "err", text: "Network error while running your code." });
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!editable) return;
    setBusy("submit");
    setNotice(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "cpp",
          groupId: collab.groupId,
          previewStudent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotice({ tone: "err", text: data.error || "Submission was not saved." });
        return;
      }
      setSubmission({
        id: data.submissionId,
        status: "submitted",
        codeFiles: collab.snapshot(),
        submittedAt: new Date().toISOString(),
        isLate: data.isLate,
        grade: submission?.grade,
        feedback: submission?.feedback,
      });
      setNotice({
        tone: "ok",
        text: data.isLate
          ? "Submitted after the deadline. Late work is allowed for this assignment."
          : "Submission saved. Your teacher can grade this version.",
      });
    } catch {
      setNotice({ tone: "err", text: "Network error while submitting." });
    } finally {
      setBusy(null);
    }
  };

  if (collab.status === "blocked") {
    return (
      <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold text-black mb-2">
          {collab.blockedCode === "no-group" || collab.blockedCode === "many-groups" ? "Group project" : "Your solution"}
        </h2>
        <p className="text-xs text-[#555555] leading-relaxed">{collab.error}</p>
      </div>
    );
  }

  const presence = collab.peers.length === 0
    ? "No other cursors in this document."
    : collab.peers
        .map((peer) => `${peer.name}${peer.file ? ` in ${peer.file}` : ""}`)
        .join(", ");

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white p-4 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-black">
          {previewStudent ? "Sample student editor" : collab.groupMode ? "Group solution" : "Your solution"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#777777]">
            {collab.status === "live" ? "Live" : collab.status === "connecting" ? "Connecting" : "Offline"}
          </span>
          {submission && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
              {submission.status}
              {submission.isLate ? " · late" : ""}
              {typeof submission.grade === "number" ? ` · ${submission.grade} pts` : ""}
            </span>
          )}
        </div>
      </div>

      {previewStudent && (
        <p className="text-[11px] text-[#666666]">
          This machine has no second account. Edits here belong to the sample student.
        </p>
      )}

      {collab.frozen && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          {collab.freezeReason || "This assignment is locked. You can read the code, but you cannot edit or run."}
        </p>
      )}

      {!collab.frozen && !collab.allowRun && (
        <p className="text-[11px] text-[#666666]">Your teacher turned off running for this assignment.</p>
      )}

      <p className="text-[11px] text-[#666666]">{presence}</p>

      {collab.status === "connecting" && !collab.doc ? (
        <p className="text-xs text-[#666666]">Opening the shared document…</p>
      ) : collab.doc && collab.awareness ? (
        <>
          <div className="flex flex-wrap gap-1">
            {collab.fileNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => collab.setActiveFile(name)}
                className={`rounded-[4px] px-2.5 py-1 text-[11px] font-mono ${
                  collab.activeFile === name ? "bg-black text-white" : "bg-[#F3F3F3] text-[#333]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="h-[min(70vh,520px)] min-h-[280px] overflow-hidden rounded-lg border border-[#EAEAEA]">
            <CollabEditor
              doc={collab.doc}
              awareness={collab.awareness}
              filename={collab.activeFile}
              readOnly={!editable}
              peers={collab.peers}
              onRunShortcut={() => {
                if (canRun) void runPublicTests();
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canRun && (
              <button
                type="button"
                onClick={runPublicTests}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
              >
                <Play size={12} /> {busy === "run" ? "Running…" : "Run public tests"}
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={busy !== null || !editable}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Send size={12} /> {busy === "submit" ? "Submitting…" : submission ? "Resubmit" : "Submit assignment"}
            </button>
          </div>
          <p className="text-[11px] text-[#777777]">
            {collab.groupMode
              ? "Everyone in your group shares this document and can see each other's names and cursors."
              : "This is your document for this assignment."}{" "}
            {allowLate
              ? "You can resubmit. Late submissions stay open."
              : "Late submissions are closed after the deadline."}
          </p>
        </>
      ) : (
        <p className="text-xs text-[#666666]">{collab.error || "The shared document is not open yet."}</p>
      )}

      {notice && (
        <p className={`text-xs ${notice.tone === "ok" ? "text-emerald-800" : "text-rose-700"}`}>{notice.text}</p>
      )}
      {runOutput && (
        <pre className="max-h-48 overflow-auto rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-[11px] font-mono text-[#333] whitespace-pre-wrap">
          {runOutput}
        </pre>
      )}
      {submission?.feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
          <p className="font-semibold flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={13} /> Teacher feedback
          </p>
          <p className="whitespace-pre-wrap">{submission.feedback}</p>
        </div>
      )}
    </div>
  );
}
