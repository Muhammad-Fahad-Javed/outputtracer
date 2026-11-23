"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { CLASSROOM_LANGUAGES, classroomLanguage } from "@/lib/classroom/languages";
import { Eye, Play, RefreshCw, Search, Settings } from "lucide-react";

const CollabEditor = dynamic(() => import("@/components/collab/CollabEditor"), { ssr: false });
import { contributionColors } from "@/lib/classroom/contributionColors";
import { authorshipOfDoc, authorshipOfText, type AuthorshipReport } from "@/lib/classroom/authorship";
import { useClassroomCollab } from "./useClassroomCollab";
import TeacherConsole from "./TeacherConsole";
import TeacherSubmissionReview from "./TeacherSubmissionReview";
import DosboxFiles from "@/components/asm/DosboxFiles";

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
  language,
}: {
  classId: string;
  assignmentId: string;
  language?: "cpp" | "python" | "asm8086";
}) {
  const [watch, setWatch] = useState<WatchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policyNote, setPolicyNote] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [consoleRunRequest, setConsoleRunRequest] = useState(0);
  const [consoleRunning, setConsoleRunning] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [panel, setPanel] = useState<"code" | "console" | "contribution">("code");
  const [outputs, setOutputs] = useState<Record<string, Uint8Array>>({});

  const load = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/classroom/${classId}/assignments/${assignmentId}/watch`, { signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || "Could not load live work.");
          return;
        }
        setError(null);
        setWatch(data);
      })
      .catch(() => { if (!signal?.aborted) setError("Could not load live work."); });
  }, [assignmentId, classId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (document.visibilityState === "visible") await load(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(refresh, 15_000);
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);

  const selected = watch?.participants.find((participant) => participant.id === selectedId)
    || watch?.participants[0] || null;
  const collab = useClassroomCollab({
    classId,
    assignmentId,
    groupId: selected?.kind === "group" ? selected.id : undefined,
    studentId: selected?.kind === "student" ? selected.id : undefined,
    enabled: Boolean(selected) && !reviewSubmitted,
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
      const { assignment } = data;
      setWatch(current => current && ({...current, ...assignment, participants: current.participants}));
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

  const contribution = useContribution(
    selected && panel !== "console" && collab.status === "live" ? collab.doc : null,
    collab.activeFile,
  );
  const authorNames = useMemo(() => new Map(
    selected?.kind === "student" ? [[selected.id, selected.name]]
      : (selected?.members ?? []).map(member => [member.userId, member.displayName]),
  ), [selected]);
  const authorColors = useMemo(() => contributionColors([...authorNames.keys()], contribution.authorIds), [authorNames, contribution.authorIds]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#1e1e1e] text-[#ccc]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#333] px-3 py-2 sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#ddd]">
            <Eye size={16} /> Watch the class
          </h2>
        </div>
        {selected && <button type="button" onClick={() => { setReviewSubmitted(value => !value); setConsoleRunning(false); }} className="rounded border border-[#555] px-3 py-2 text-xs text-white">{reviewSubmitted ? "Back to live work" : "Review submitted work"}</button>}
        {selected && !reviewSubmitted && (
          <button
            type="button"
            onClick={()=>{setPanel("console");setConsoleRunRequest(value=>value+1);}}
            disabled={busy || consoleRunning || collab.status !== "live"}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-black px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            <Play size={12} /> {consoleRunning ? "Running…" : "Run their code"}
          </button>
        )}
      </div>

      {watch && (
        <details className="shrink-0 border-b border-[#333] bg-[#181818] px-3 text-xs sm:px-5">
          <summary className="cursor-pointer py-2"><Settings size={13} className="mx-1 inline" /> Editing and run settings {watch.locked && "· Locked"}</summary>
          <div className="flex flex-wrap items-center gap-2 pb-3">
          <button
            type="button"
            onClick={() => savePolicy({ locked: !watch.locked })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              watch.locked ? "bg-rose-600 text-white" : "border border-[#333] bg-[#181818] text-[#ddd]"
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
          <label className="inline-flex items-center gap-2 text-xs text-[#bbb]">
            Time limit
            <input
              aria-label="Time limit milliseconds"
              type="number"
              min={1000}
              max={10000}
              value={timeDraft ?? String(watch.timeLimitMs)}
              onChange={(event) => setTimeDraft(event.target.value)}
              onBlur={() => {
                const value = Number(timeDraft);
                if (value >= 1000 && value <= 10000 && value !== watch.timeLimitMs) void savePolicy({ timeLimitMs: value });
                setTimeDraft(null);
              }}
              className="w-20 rounded-md border border-[#333] bg-[#181818] px-2 py-1 text-xs"
            />
            <span className="text-[#888]">ms</span>
          </label>
          {watch.frozen && (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
              {watch.freezeReason || "Students cannot edit or run."}
            </span>
          )}
          {policyNote && <span className="text-[11px] text-[#ccc]">{policyNote}</span>}
          </div>
        </details>
      )}

      {error && <div role="status" className="shrink-0 border-b border-[#503838] bg-[#352525] px-3 py-2 text-xs text-red-200">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
      {!watch && error ? null : !watch ? (
        <p className="p-5 text-sm text-[#aaa]">Loading the class…</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[#333] md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 p-2">
              <Search size={14} className="shrink-0 text-[#aaa]"/>
              <input
                aria-label={watch.groupMode ? "Find a group" : "Find a student"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={watch.groupMode ? "Find a group" : "Find a student"}
                className="w-full rounded-md border border-[#333] px-3 py-2 text-sm outline-none focus:border-black"
              /><button type="button" aria-label="Refresh participants" className="shrink-0 rounded p-2 hover:bg-[#333]" onClick={() => void load()}><RefreshCw size={14}/></button>
            </div>
            <div className="max-h-24 min-h-0 overflow-y-auto md:max-h-none">
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
                  const active = selected?.id === participant.id;
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSelectedId(participant.id);
                        setConsoleRunRequest(0);
                        setConsoleRunning(false);
                        setRunOutput(null);
                        setRunNote(null);
                        setOutputs({});
                      }}
                      className={`block w-full border-l-2 px-3 py-2 text-left ${
                        active ? "border-blue-400 bg-[#263746]" : "border-transparent hover:bg-[#252525]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#ddd]">{participant.name}</span>
                        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-[#D4D4D8]"}`} />
                      </span>
                      {memberLine && <span className="mt-1 block text-[11px] text-[#aaa]">{memberLine}</span>}
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

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {!selected ? (
              <p className="py-16 text-center text-sm text-[#aaa]">Choose someone on the left to open their code.</p>
            ) : reviewSubmitted ? (
              <TeacherSubmissionReview key={`${assignmentId}:${selected.id}`} classId={classId} assignmentId={assignmentId} owner={{ groupId: selected.kind === "group" ? selected.id : undefined, studentId: selected.kind === "student" ? selected.id : undefined }} ownerName={selected.name} language={classroomLanguage(language)}/>
            ) : collab.status === "blocked" ? (
              <p className="p-4 text-sm text-red-200">{collab.error}</p>
            ) : collab.status === "connecting" && !collab.doc ? (
              <p className="p-4 text-sm text-[#aaa]">Opening {selected.name}…</p>
            ) : collab.doc && collab.awareness ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#333] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-[#ddd]">{selected.name}</p>
                    <p className="text-[11px] text-[#777]">{presence}</p>
                    {collab.status !== "live" && <p className="text-xs text-amber-200">Connecting to live work · showing a saved preview <button onClick={collab.reconnect} className="ml-1 underline">Retry</button></p>}
                  </div>
                  <div aria-label="Workspace view" className="flex gap-1">
                    {(["code", "console", "contribution"] as const).map(view => <button type="button" key={view} aria-pressed={panel === view} onClick={() => setPanel(view)} className={`rounded px-2.5 py-1.5 text-xs capitalize ${panel === view ? "bg-[#264c68] text-white" : "text-[#ccc] hover:bg-[#333]"}`}>{view}</button>)}
                  </div>
                </div>
                {panel === "contribution" && <div className="min-h-0 flex-1 overflow-auto p-3">
                  {collab.status !== "live" ? <p className="text-xs text-[#aaa]">Connecting to load authorship data…</p> : <ContributionLegend file={contribution.file} document={contribution.document} filename={collab.activeFile} names={authorNames} colors={authorColors}/>}
                </div>}
                {panel === "code" && <><div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#333] px-2 py-1">
                    {collab.fileNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => collab.setActiveFile(name)}
                        aria-pressed={collab.activeFile === name}
                        className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-xs ${
                          collab.activeFile === name ? "bg-black text-white" : "bg-[#303030] text-[#ccc]"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                </div>
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {language === "asm8086" && <div className="hidden w-44 shrink-0 lg:block"><DosboxFiles readOnly sources={collab.snapshot()} assets={collab.assets} outputs={outputs} activeFile={collab.activeFile} onSelectSource={collab.setActiveFile}/></div>}
                  <div className="min-w-0 flex-1">
                  <CollabEditor
                    doc={collab.doc}
                    awareness={collab.awareness}
                    filename={collab.activeFile}
                    readOnly
                    peers={collab.peers}
                    onRunShortcut={() => { if (collab.status !== "live") return; setPanel("console"); setConsoleRunRequest(value => value + 1); }}
                    language={CLASSROOM_LANGUAGES[classroomLanguage(language)].monaco}
                    showAuthorship={collab.status === "live"}
                    contributionColors={authorColors}
                    contributionNames={authorNames}
                  />
                  </div>
                </div></>}
                <div className={panel === "console" ? "flex min-h-0 flex-1 flex-col overflow-auto" : "hidden"}>
                  <div className="flex shrink-0 items-center justify-between border-b border-[#333] bg-[#181818] px-3 py-1 text-xs"><span className="font-semibold text-white">Console</span><button className="px-2 py-1 text-[#aaa] hover:text-white disabled:opacity-50" onClick={()=>void run()} disabled={language === "asm8086" || busy||consoleRunning}>{language === "asm8086" ? "Teacher review · browser execution" : busy?"Running tests…":"Run public tests"}</button></div>
                  <TeacherConsole key={`${assignmentId}:${selected.id}`} scope={{classId,assignmentId,groupId:selected.kind==="group"?selected.id:undefined,studentId:selected.kind==="student"?selected.id:undefined}} language={classroomLanguage(language)} files={collab.snapshot()} assets={collab.assets} getFiles={collab.snapshot} getAssets={collab.snapshotAssets} runRequest={consoleRunRequest} onRunningChange={setConsoleRunning} onArtifactsChange={setOutputs} canRun={collab.status === "live"}/>
                  {runNote && <p className="shrink-0 px-3 text-xs text-[#ccc]">{runNote}</p>}
                  {runOutput && <pre className="max-h-40 shrink-0 overflow-auto bg-[#18181B] p-3 font-mono text-xs text-[#E4E4E7] whitespace-pre-wrap">{runOutput}</pre>}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#aaa]">{collab.error || "The document is not open yet."}</p>
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
    <label className="inline-flex items-center gap-2 rounded-md border border-[#333] bg-[#181818] px-2.5 py-1.5 text-xs text-[#ddd]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function createContributionStore(doc: Y.Doc | null, filename: string) {
    let authorIds: string[] = [];
    const read = () => {
      const text = doc?.getMap("files").get(filename);
      const document = doc ? authorshipOfDoc(doc) : null;
      const currentIds = document?.shares.map(share => share.authorId).sort() ?? [];
      if (currentIds.length !== authorIds.length || currentIds.some((id, index) => id !== authorIds[index])) {
        authorIds = currentIds;
      }
      return {
        document,
        file: text instanceof Y.Text ? authorshipOfText(text) : null,
        authorIds,
      };
    };
    let snapshot = read();
    return {
      getSnapshot: () => snapshot,
      subscribe: (notify: () => void) => {
        if (!doc) return () => {};
        let frame: number | null = null;
        const refresh = () => { frame = null; snapshot = read(); notify(); };
        const update = () => { if (frame === null) frame = requestAnimationFrame(refresh); };
        const files = doc.getMap("files");
        files.observeDeep(update);
        refresh();
        return () => {
          if (frame !== null) cancelAnimationFrame(frame);
          files.unobserveDeep(update);
        };
      },
    };
}


function useContribution(doc: Y.Doc | null, filename: string): {
  document: AuthorshipReport | null;
  file: AuthorshipReport | null;
  authorIds: readonly string[];
} {
  const store = useMemo(() => createContributionStore(doc, filename), [doc, filename]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function ContributionLegend({
  file,
  document,
  filename,
  names,
  colors,
}: {
  file: AuthorshipReport | null;
  document: AuthorshipReport | null;
  filename: string;
  names: ReadonlyMap<string, string>;
  colors: ReadonlyMap<string, string>;
}) {
  const report = file || document;
  if (!report) return null;
  return (
    <div className="rounded-xl border border-[#333] bg-[#181818] px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-[#ddd]">Who wrote {filename}</p>
        {document && document.shares.length > 0 && (
          <p className="text-xs text-[#aaa]">
            Whole document: {document.shares.map((share) => `${names.get(share.authorId) || "Former or unknown contributor"} ${share.percent}%`).join(" · ")}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-[#aaa]">Percentages show each student’s share of attributed characters still present in the code. Deleted text is excluded. {report.starter} characters have no recorded author.</p>
      {report.shares.length === 0 ? (
        <p className="mt-2 text-xs text-[#aaa]">There are no recorded authors in this file.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {report.shares.map((share) => (
            <li key={share.authorId}>
              <div className="mb-1 flex items-center justify-between text-xs text-[#ddd]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.get(share.authorId) }} />
                  {names.get(share.authorId) || "Former or unknown contributor"}
                </span>
                <span className="font-semibold tabular-nums">{share.characters} characters · {share.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#E4E4E7]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share.percent}%`, backgroundColor: colors.get(share.authorId) }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
