"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Play, Send } from "lucide-react";

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
  starterCode,
  allowLate,
}: {
  classId: string;
  assignmentId: string;
  starterCode: Record<string, string>;
  allowLate: boolean;
}) {
  const fileNames = Object.keys(starterCode);
  const [files, setFiles] = useState<Record<string, string>>(starterCode);
  const [active, setActive] = useState(fileNames[0] || "main.cpp");
  const [loadingMine, setLoadingMine] = useState(true);
  const [submission, setSubmission] = useState<SubmissionView | null>(null);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/classroom/${classId}/assignments/${assignmentId}/mine`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        if (data.submission) {
          setSubmission(data.submission);
          if (data.submission.codeFiles && Object.keys(data.submission.codeFiles).length > 0) {
            setFiles(data.submission.codeFiles);
            setActive(Object.keys(data.submission.codeFiles)[0]);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: "err", text: "Could not load your previous submission." });
      })
      .finally(() => {
        if (!cancelled) setLoadingMine(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, assignmentId]);

  const runPublicTests = async () => {
    setBusy("run");
    setNotice(null);
    setRunOutput(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeFiles: files, runTests: true, language: "cpp" }),
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
    setBusy("submit");
    setNotice(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeFiles: files, language: "cpp" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotice({ tone: "err", text: data.error || "Submission was not saved." });
        return;
      }
      setSubmission({
        id: data.submissionId,
        status: "submitted",
        codeFiles: files,
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

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-black">Your solution</h2>
        {submission && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
            {submission.status}
            {submission.isLate ? " · late" : ""}
            {typeof submission.grade === "number" ? ` · ${submission.grade} pts` : ""}
          </span>
        )}
      </div>

      {loadingMine ? (
        <p className="text-xs text-[#666666]">Loading your submission…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {Object.keys(files).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setActive(name)}
                className={`rounded-[4px] px-2.5 py-1 text-[11px] font-mono ${
                  active === name ? "bg-black text-white" : "bg-[#F3F3F3] text-[#333]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="block text-[11px] font-semibold text-[#666666]" htmlFor="assignment-source">
            {active}
          </label>
          <textarea
            id="assignment-source"
            value={files[active] || ""}
            onChange={(event) => setFiles((prev) => ({ ...prev, [active]: event.target.value }))}
            spellCheck={false}
            rows={16}
            className="w-full rounded-lg border border-[#EAEAEA] bg-[#1E1E1E] p-3 font-mono text-xs text-white outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runPublicTests}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              <Play size={12} /> {busy === "run" ? "Running…" : "Run public tests"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Send size={12} /> {busy === "submit" ? "Submitting…" : submission ? "Resubmit" : "Submit assignment"}
            </button>
          </div>
          <p className="text-[11px] text-[#777777]">
            {allowLate
              ? "You can resubmit. Late submissions stay open."
              : "Late submissions are closed after the deadline. A new submit replaces your previous files."}
          </p>
        </>
      )}

      {notice && (
        <p className={`text-xs ${notice.tone === "ok" ? "text-emerald-800" : "text-rose-700"}`}>{notice.text}</p>
      )}
      {runOutput && (
        <pre className="max-h-48 overflow-auto rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-[11px] font-mono text-[#333]">
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
