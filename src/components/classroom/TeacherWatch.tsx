"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { Eye, Play } from "lucide-react";

const CollabEditor = dynamic(() => import("@/components/collab/CollabEditor"), { ssr: false });
import { colorForUser } from "@/components/collab/useProjectCollab";
import { authorshipOfDoc, authorshipOfText, type AuthorshipReport } from "@/lib/classroom/authorship";
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
  const [query, setQuery] = useState("");

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

  const selected = watch?.participants.find((participant) => participant.id === selectedId)
    || watch?.participants[0] || null;
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

  const contribution = useContribution(selected ? collab.doc : null, collab.activeFile);
  const authorNames: Record<string, string> = {};
  if (selected?.members) {
    for (const member of selected.members) authorNames[member.userId] = member.displayName;
  }
  if (selected?.kind === "student") authorNames[selected.id] = selected.name;

  const presence = collab.peers.length === 0
    ? "No other cursors in this document."
    : collab.peers.map((peer) => `${peer.name}${peer.file ? ` in ${peer.file}` : ""}`).join(", ");

  const needle = query.trim().toLowerCase();
  const participants = (watch?.participants || []).filter((participant) => {
    if (!needle) return true;
    const memberNames = participant.members?.map((member) => member.displayName).join(" ") || "";
    return `${participant.name} ${memberNames}`.toLowerCase().includes(needle);
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#F0F0F0] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-black">
            <Eye size={16} /> Watch the class
          </h2>
          <p className="mt-1 text-xs text-[#666666]">
            Pick a {watch?.groupMode ? "group" : "student"}. You can read and run. Your typing does not change their code.
          </p>
        </div>
        {selected && (
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-black px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            <Play size={12} /> {busy ? "Running…" : "Run their code"}
          </button>
        )}
      </div>

      {watch && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#F4F4F5] bg-[#FAFAFA] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => savePolicy({ locked: !watch.locked })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              watch.locked ? "bg-rose-600 text-white" : "border border-[#E4E4E7] bg-white text-black"
            }`}
          >
            {watch.locked ? "Unlock editing" : "Lock editing"}
          </button>
          <Toggle
            label="Students can run"
            checked={watch.allowRun}
            onChange={(checked) => savePolicy({ allowRun: checked })}
          />
          <Toggle
            label="Late work"
            checked={watch.allowLate}
            onChange={(checked) => savePolicy({ allowLate: checked })}
          />
          <label className="inline-flex items-center gap-2 text-xs text-[#444]">
            Time limit
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
              className="w-20 rounded-md border border-[#E4E4E7] bg-white px-2 py-1 text-xs"
            />
            <span className="text-[#888]">ms</span>
          </label>
          {watch.frozen && (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
              {watch.freezeReason || "Students cannot edit or run."}
            </span>
          )}
          {policyNote && <span className="text-[11px] text-[#333]">{policyNote}</span>}
        </div>
      )}

      {error ? (
        <p className="p-5 text-sm text-rose-700">{error}</p>
      ) : !watch ? (
        <p className="p-5 text-sm text-[#666666]">Loading the class…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-[#F0F0F0] lg:border-b-0 lg:border-r">
            <div className="p-3">
              <input
                aria-label={watch.groupMode ? "Find a group" : "Find a student"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={watch.groupMode ? "Find a group" : "Find a student"}
                className="w-full rounded-md border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>
            <div className="max-h-80 overflow-y-auto lg:max-h-[680px]">
              {participants.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-[#777777]">
                  {watch.participants.length === 0
                    ? watch.groupMode
                      ? "No groups yet. Add groups from Manage class."
                      : "No students are enrolled yet."
                    : "No matches."}
                </p>
              ) : (
                participants.map((participant) => {
                  const online = participant.online.length > 0;
                  const memberLine = participant.members && participant.members.length > 0
                    ? participant.members.map((member) => member.displayName).join(", ")
                    : participant.kind === "group"
                      ? "No students yet"
                      : "";
                  const active = selectedId === participant.id;
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(participant.id);
                        setRunOutput(null);
                        setRunNote(null);
                      }}
                      className={`block w-full border-l-2 px-4 py-3 text-left ${
                        active ? "border-black bg-[#F7F7F8]" : "border-transparent hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-black">{participant.name}</span>
                        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-[#D4D4D8]"}`} />
                      </span>
                      {memberLine && <span className="mt-1 block text-[11px] text-[#666]">{memberLine}</span>}
                      <span className="mt-1 block text-[11px] text-[#888]">
                        {participant.online.length === 0
                          ? "Offline"
                          : participant.online
                              .map((person) => {
                                const sameName = person.name === participant.name;
                                if (person.file && sameName) return `In ${person.file}`;
                                if (person.file) return `${person.name} · ${person.file}`;
                                return sameName ? "Online" : person.name;
                              })
                              .join(", ")}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-3 p-3 sm:p-4">
            {!selected ? (
              <p className="py-16 text-center text-sm text-[#666]">Choose someone on the left to open their code.</p>
            ) : collab.status === "blocked" ? (
              <p className="text-sm text-rose-700">{collab.error}</p>
            ) : collab.status === "connecting" && !collab.doc ? (
              <p className="text-sm text-[#666]">Opening {selected.name}…</p>
            ) : collab.doc && collab.awareness ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-black">{selected.name}</p>
                    <p className="text-[11px] text-[#777]">{presence}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {collab.fileNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => collab.setActiveFile(name)}
                        className={`rounded-md px-2.5 py-1 font-mono text-[11px] ${
                          collab.activeFile === name ? "bg-black text-white" : "bg-[#F4F4F5] text-[#333]"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <ContributionLegend
                  file={contribution.file}
                  document={contribution.document}
                  filename={collab.activeFile}
                  names={authorNames}
                />
                <div className="h-[min(68vh,560px)] min-h-[320px] overflow-hidden rounded-xl border border-[#27272A]">
                  <CollabEditor
                    doc={collab.doc}
                    awareness={collab.awareness}
                    filename={collab.activeFile}
                    readOnly
                    peers={collab.peers}
                    onRunShortcut={() => void run()}
                    showAuthorship
                  />
                </div>
                {runNote && <p className="text-xs text-[#333]">{runNote}</p>}
                {runOutput && (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-[#18181B] p-3 font-mono text-[11px] text-[#E4E4E7] whitespace-pre-wrap">
                    {runOutput}
                  </pre>
                )}
              </>
            ) : (
              <p className="text-sm text-[#666]">{collab.error || "The document is not open yet."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-black">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function createContributionStore(doc: Y.Doc | null, filename: string) {
    const read = () => {
      const text = doc?.getMap("files").get(filename);
      return {
        document: doc ? authorshipOfDoc(doc) : null,
        file: text instanceof Y.Text ? authorshipOfText(text) : null,
      };
    };
    let snapshot = read();
    return {
      getSnapshot: () => snapshot,
      subscribe: (notify: () => void) => {
        if (!doc) return () => {};
        const update = () => { snapshot = read(); notify(); };
        const files = doc.getMap("files");
        files.observeDeep(update);
        update();
        return () => files.unobserveDeep(update);
      },
    };
}


function useContribution(doc: Y.Doc | null, filename: string): {
  document: AuthorshipReport | null;
  file: AuthorshipReport | null;
} {
  const store = useMemo(() => createContributionStore(doc, filename), [doc, filename]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function ContributionLegend({
  file,
  document,
  filename,
  names,
}: {
  file: AuthorshipReport | null;
  document: AuthorshipReport | null;
  filename: string;
  names: Record<string, string>;
}) {
  const report = file || document;
  if (!report) return null;
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-black">Who wrote {filename}</p>
        {document && document.shares.length > 0 && (
          <p className="text-[11px] text-[#777]">
            Whole document: {document.shares.map((share) => `${names[share.authorId] || "Student"} ${share.percent}%`).join(" · ")}
          </p>
        )}
      </div>
      {report.shares.length === 0 ? (
        <p className="mt-2 text-xs text-[#666]">Nobody has typed in this file yet. Starter code stays plain.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {report.shares.map((share) => (
            <li key={share.authorId}>
              <div className="mb-1 flex items-center justify-between text-xs text-black">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForUser(share.authorId) }} />
                  {names[share.authorId] || "Student"}
                </span>
                <span className="font-semibold tabular-nums">{share.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#E4E4E7]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share.percent}%`, backgroundColor: colorForUser(share.authorId) }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
