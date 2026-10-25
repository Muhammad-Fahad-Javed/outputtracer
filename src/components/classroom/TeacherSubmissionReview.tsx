"use client";

import { useEffect, useState } from "react";
import BrowserDosbox from "@/components/asm/BrowserDosbox";
import DosboxFiles from "@/components/asm/DosboxFiles";
import type { DosboxAssets } from "@/lib/dosboxAssets";
import type { ClassroomLanguage } from "@/lib/classroom/languages";

type HandIn = { id: string; submittedAt: string; isLate: boolean };
type Snapshot = { id: string; versionId: string; submittedAt: string; contentHash: string; frozenCodeFiles: Record<string, string>; inputAssets?: DosboxAssets };
const button = "rounded border border-[#555] bg-[#252525] px-3 py-1.5 text-xs text-white disabled:opacity-40";

export default function TeacherSubmissionReview({ classId, assignmentId, owner, ownerName, language }: {
  classId: string; assignmentId: string; owner: { studentId?: string; groupId?: string }; ownerName: string; language: ClassroomLanguage;
}) {
  const [submissions, setSubmissions] = useState<HandIn[]>([]);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [file, setFile] = useState("");
  const [maxPoints, setMaxPoints] = useState(100);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const base = `/api/classroom/${classId}/assignments/${assignmentId}`;
  const ownerKey = owner.groupId ? `groupId=${encodeURIComponent(owner.groupId)}` : `studentId=${encodeURIComponent(owner.studentId || "")}`;

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      setLoading(true); setSnapshot(null); setSelected(""); setNote("");
      try {
        const response = await fetch(`${base}/submissions?${ownerKey}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load submissions.");
        if (abort.signal.aborted) return;
        setSubmissions(data.submissions || []); setMaxPoints(data.assignment.maxPoints);
        setSelected(data.submissions?.[0]?.id || "");
      } catch (error) { if (!abort.signal.aborted) setNote(error instanceof Error ? error.message : "Could not load submissions."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load(); return () => abort.abort();
  }, [base, ownerKey, refresh]);

  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    async function load() {
      setSnapshot(null); setPoints(""); setNote(""); setLoading(true);
      try {
        const [response, gradeResponse] = await Promise.all([
          fetch(`${base}/submissions/${selected}/snapshot`, { signal: abort.signal }),
          fetch(`${base}/submissions/${selected}/grade`, { signal: abort.signal }),
        ]);
        const [data, grading] = await Promise.all([response.json(), gradeResponse.json()]);
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load the immutable submission.");
        if (!gradeResponse.ok || !grading.success) throw new Error(grading.error || "Could not load its grade.");
        if (abort.signal.aborted) return;
        setSnapshot(data.snapshot); setFile(Object.keys(data.snapshot.frozenCodeFiles)[0] || "");
        if (grading.grade?.snapshotId === data.snapshot.id) setPoints(String(grading.grade.manualPoints));
        else if (grading.grade) setNote("An earlier hand-in was graded. Review this resubmission before assigning a new grade.");
      } catch (error) { if (!abort.signal.aborted) setNote(error instanceof Error ? error.message : "Could not open submission."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load(); return () => abort.abort();
  }, [base, selected, refresh]);

  async function saveGrade() {
    if (!snapshot || saving) return;
    const value = Number(points);
    if (!points.trim() || !Number.isFinite(value) || value < 0 || value > maxPoints) { setNote(`Enter a grade between 0 and ${maxPoints}.`); return; }
    setSaving(true); setNote("");
    try {
      const response = await fetch(`${base}/submissions/${selected}/grade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "manual", gradeMode: "manual", manualPoints: value, expectedSnapshotId: snapshot.id }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Grade could not be saved.");
      setNote(`Saved ${data.grade.totalPoints} / ${data.grade.maxPoints} for the reviewed submission.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "Grade could not be saved."); }
    finally { setSaving(false); }
  }

  return <section aria-label="Review submitted work" className="min-h-0 flex-1 overflow-auto p-3 text-[#ddd] sm:p-4">
    <div className="mb-3 flex flex-wrap items-center gap-3"><h3 className="font-semibold">Submitted work · {ownerName}</h3><button className={button} onClick={() => setRefresh(value => value + 1)} disabled={loading || saving}>Refresh hand-in</button></div>
    <p className="mb-3 text-xs text-[#aaa]">This review uses saved source and input files. Live edits do not change this snapshot. Browser results never assign grades automatically.</p>
    {submissions.length > 1 && <label className="mb-3 block text-xs">Submission <select value={selected} onChange={event => setSelected(event.target.value)} className="ml-2 rounded border border-[#555] bg-[#181818] p-1 text-white">{submissions.map(item => <option key={item.id} value={item.id}>{new Date(item.submittedAt).toLocaleString()}{item.isLate ? " · late" : ""}</option>)}</select></label>}
    {loading && <p className="text-sm">Loading submitted work…</p>}
    {!loading && !submissions.length && !note && <p className="text-sm text-[#aaa]">No submitted work for this {owner.groupId ? "team" : "student"} yet.</p>}
    {note && <p role="status" className="my-3 rounded border border-[#555] p-3 text-sm">{note}</p>}
    {snapshot && <>
      <p className="mb-3 break-all font-mono text-[11px] text-[#aaa]">Submitted {new Date(snapshot.submittedAt).toLocaleString()} · version {snapshot.versionId} · hash {snapshot.contentHash}</p>
      <div className="mb-3 flex h-72 min-h-0 overflow-hidden border border-[#444]">
        {language === "asm8086" ? <div className="w-40 shrink-0 sm:w-52"><DosboxFiles readOnly sources={snapshot.frozenCodeFiles} assets={snapshot.inputAssets || {}} activeFile={file} onSelectSource={setFile}/></div> : <div className="w-36 shrink-0 overflow-auto border-r border-[#444]">{Object.keys(snapshot.frozenCodeFiles).map(name => <button key={name} onClick={() => setFile(name)} className={`block w-full p-2 text-left text-xs ${name === file ? "bg-[#333]" : ""}`}>{name}</button>)}</div>}
        <pre aria-label={`Submitted source ${file}`} className="min-w-0 flex-1 overflow-auto bg-[#181818] p-3 font-mono text-xs leading-5">{snapshot.frozenCodeFiles[file]}</pre>
      </div>
      {language === "asm8086" && <div className="mb-4 h-96 min-h-72 overflow-hidden border border-[#444]"><BrowserDosbox key={snapshot.id} files={snapshot.frozenCodeFiles} assets={snapshot.inputAssets || {}}/></div>}
      <form className="flex flex-wrap items-end gap-3 border-t border-[#444] pt-3" onSubmit={event => { event.preventDefault(); void saveGrade(); }}>
        <label className="text-xs">Manual grade <input aria-label="Manual grade points" type="number" min={0} max={maxPoints} step="0.1" value={points} onChange={event => setPoints(event.target.value)} required className="ml-2 w-24 rounded border border-[#555] bg-[#181818] px-2 py-1.5 text-white"/> / {maxPoints}</label>
        <button className={button} disabled={saving}>{saving ? "Saving grade…" : "Save manual grade"}</button>
      </form>
    </>}
  </section>;
}
