"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Play } from "lucide-react";
import CollabEditor from "@/components/collab/CollabEditor";
import { useClassroomCollab } from "./useClassroomCollab";

interface WatchParticipant {
  kind: "group" | "student";
  id: string;
  name: string;
  docKey: string;
  members?: { userId: string; displayName: string }[];
  online: { userId: string; name: string; file: string | null }[];
}

interface WatchPayload {
  groupMode: boolean;
  frozen: boolean;
  freezeReason: string | null;
  locked: boolean;
  allowLate: boolean;
  allowRun: boolean;
  allowTrace: boolean;
  timeLimitMs: number;
  participants: WatchParticipant[];
}

export default function TeacherWatch({
  classId,
  assignmentId,
}: {
  classId: string;
  assignmentId: string;
}) {
  const [watch, setWatch] = useState<WatchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policyNote, setPolicyNote] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState("10000");
  const [busy, setBusy] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/classroom/${classId}/assignments/${assignmentId}/watch`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || "Could not load live work.");
          return;
        }
        setError(null);
        setWatch(data);
        setTimeDraft(String(data.timeLimitMs ?? 10000));
      })
      .catch(() => setError("Could not load live work."));
  }, [assignmentId, classId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const selected = watch?.participants.find((participant) => participant.id === selectedId) || null;
  const collab = useClassroomCollab({
    classId,
    assignmentId,
    groupId: selected?.kind === "group" ? selected.id : undefined,
    studentId: selected?.kind === "student" ? selected.id : undefined,
    enabled: Boolean(selected),
  });

  const savePolicy = async (patch: Record<string, unknown>) => {
    setPolicyNote(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPolicyNote(data.error || "Could not update the assignment.");
        return;
      }
      setPolicyNote("Saved.");
      load();
    } catch {
      setPolicyNote("Network error while saving.");
    }
  };

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    setRunNote(null);
    setRunOutput(null);
    try {
      const res = await fetch(`/api/classroom/${classId}/assignments/${assignmentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runTests: true,
          language: "cpp",
          groupId: selected.kind === "group" ? selected.id : undefined,
          studentId: selected.kind === "student" ? selected.id : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setRunNote(data.error || "The program could not be run.");
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
      setRunNote(data.compilationError ? "The program did not compile." : data.timedOut ? "The program hit the time limit." : "Run finished.");
    } catch {
      setRunNote("Network error while running.");
    } finally {
      setBusy(false);
    }
  };

  const presence = collab.peers.length === 0
    ? "No other cursors in this document."
    : collab.peers.map((peer) => `${peer.name}${peer.file ? ` in ${peer.file}` : ""}`).join(", ");

  return (
    <div className="rounded-2xl border border-[#EAEAEA] bg-white shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-[#F0F0F0] space-y-3">
        <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
          <Eye size={16} /> Live work
        </h2>
        <p className="text-[11px] text-[#666666]">
          You are viewing. Typing does not change the code. Run uses the current document and public tests only.
        </p>
        {watch && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <button
              type="button"
              onClick={() => savePolicy({ locked: !watch.locked })}
              className="rounded-[4px] border border-[#DCDCDC] bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-[#F2F2F2]"
            >
              {watch.locked ? "Unlock editing" : "Lock editing"}
            </button>
            <label className="flex items-center gap-2 text-xs text-black">
              <input
                type="checkbox"
                checked={watch.allowLate}
                onChange={(event) => savePolicy({ allowLate: event.target.checked })}
              />
              Allow late submissions
            </label>
            <label className="flex items-center gap-2 text-xs text-black">
              <input
                type="checkbox"
                checked={watch.allowRun}
                onChange={(event) => savePolicy({ allowRun: event.target.checked })}
              />
              Students can run
            </label>
            <label className="flex items-center gap-2 text-xs text-black">
              <input
                type="checkbox"
                checked={watch.allowTrace}
                onChange={(event) => savePolicy({ allowTrace: event.target.checked })}
              />
              Allow trace
            </label>
            <label className="flex items-center gap-2 text-xs text-black">
              Time limit (ms)
              <input
                aria-label="Time limit milliseconds"
                type="number"
                min={1000}
                max={10000}
                value={timeDraft}
                onChange={(event) => setTimeDraft(event.target.value)}
                onBlur={() => {
                  const value = Number(timeDraft);
                  if (Number.isFinite(value)) void savePolicy({ timeLimitMs: value });
                }}
                className="w-24 rounded-md border border-[#DCDCDC] px-2 py-1 text-xs"
              />
            </label>
          </div>
        )}
        <p className="text-[11px] text-[#777777]">
          Classroom runs do not start a trace, even when allow trace is stored.
          {watch?.frozen ? ` ${watch.freezeReason || "Students cannot edit or run."}` : ""}
        </p>
        {policyNote && <p className="text-[11px] text-[#333333]">{policyNote}</p>}
      </div>

      {error ? (
        <p className="p-4 text-xs text-rose-700">{error}</p>
      ) : !watch ? (
        <p className="p-4 text-xs text-[#666666]">Loading groups and students…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_1fr]">
          <div className="max-h-80 overflow-y-auto border-b border-[#F0F0F0] lg:max-h-[640px] lg:border-b-0 lg:border-r">
            {watch.participants.length === 0 ? (
              <p className="p-4 text-xs text-[#777777]">
                {watch.groupMode ? "No groups in this class yet." : "No students are enrolled yet."}
              </p>
            ) : (
              watch.participants.map((participant) => {
                const online = participant.online.length === 0
                  ? "Nobody online"
                  : participant.online
                      .map((person) => `${person.name}${person.file ? ` in ${person.file}` : ""}`)
                      .join(", ");
                const memberLine = participant.members && participant.members.length > 0
                  ? participant.members.map((member) => member.displayName).join(", ")
                  : participant.kind === "group"
                    ? "No students in this group."
                    : "";
                return (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(participant.id);
                      setRunOutput(null);
                      setRunNote(null);
                    }}
                    className={`block w-full px-4 py-3 text-left text-xs border-b border-[#F5F5F5] ${
                      selectedId === participant.id ? "bg-[#F3F3F3]" : "bg-white hover:bg-[#FAFAFA]"
                    }`}
                  >
                    <span className="font-semibold text-black block">{participant.name}</span>
                    {memberLine && <span className="mt-1 block text-[10px] text-[#666666]">{memberLine}</span>}
                    <span className="mt-1 block text-[10px] text-[#888888]">{online}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-3 sm:p-4 space-y-3 min-w-0">
            {!selected ? (
              <p className="text-xs text-[#666666]">Select a group or student to open their document.</p>
            ) : collab.status === "blocked" ? (
              <p className="text-xs text-rose-700">{collab.error}</p>
            ) : collab.status === "connecting" && !collab.doc ? (
              <p className="text-xs text-[#666666]">Opening {selected.name}…</p>
            ) : collab.doc && collab.awareness ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[#666666]">{presence}</p>
                  <button
                    type="button"
                    onClick={run}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <Play size={12} /> {busy ? "Running…" : "Run public tests"}
                  </button>
                </div>
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
                    readOnly
                    peers={collab.peers}
                    onRunShortcut={() => void run()}
                  />
                </div>
                {runNote && <p className="text-xs text-[#333333]">{runNote}</p>}
                {runOutput && (
                  <pre className="max-h-48 overflow-auto rounded-lg border border-[#EAEAEA] bg-[#FBFBFB] p-3 text-[11px] font-mono text-[#333] whitespace-pre-wrap">
                    {runOutput}
                  </pre>
                )}
              </>
            ) : (
              <p className="text-xs text-[#666666]">{collab.error || "The document is not open yet."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
