"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
} from "lucide-react";
import { ClassroomAssignment } from "@/lib/classroom/types";
import AssignmentWorkspace from "@/components/classroom/AssignmentWorkspace";
import TeacherWatch from "@/components/classroom/TeacherWatch";

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const resolvedParams = use(params);
  const { classId, assignmentId } = resolvedParams;

  const [assignment, setAssignment] = useState<ClassroomAssignment | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [localPreview, setLocalPreview] = useState(false);
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
          setLocalPreview(Boolean(data.localPreview));
        }
      })
      .catch(() => {
        if (active) setError("A network error occurred.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [classId, assignmentId]);

  if (assignment && !isTeacher) return <main className="fixed inset-0 z-40 h-dvh bg-[#1e1e1e]"><AssignmentWorkspace classId={classId} assignmentId={assignmentId} allowLate={assignment.allowLate} assignment={assignment} /></main>;

  return (
    <main className="fixed inset-0 z-40 flex h-dvh flex-col bg-[#1e1e1e] text-[#ccc]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-[#333] bg-[#181818] px-4 text-xs">
        <div className="flex min-w-0 items-center gap-3"><Link href={`/classroom/${classId}`} className="flex shrink-0 items-center gap-2 hover:text-white"><ArrowLeft size={14} /> Classroom</Link><span className="text-[#555]">/</span><h1 className="truncate font-semibold text-white">{assignment?.title || "Assignment workspace"}</h1></div>
        {isTeacher && <Link href={`/classroom/${classId}/manage`} className="shrink-0 hover:text-white">Manage class</Link>}
      </div>
      {loading ? <div className="grid flex-1 place-items-center font-mono text-sm">Loading assignment…</div> : error || !assignment ? <div className="grid flex-1 place-items-center p-8 text-sm text-red-300">{error || "Assignment not found."}</div> : <>
        <details className="shrink-0 border-b border-[#333] bg-[#181818] px-4 py-2 text-xs"><summary className="cursor-pointer text-[#aaa]">Instructions & tests · {assignment.maxPoints} points · {assignment.language || "cpp"} · {assignment.groupMode ? "Group assignment" : "Individual assignment"}</summary><div className="max-h-60 space-y-3 overflow-auto py-4"><p className="whitespace-pre-wrap leading-6">{assignment.description || "No instructions."}</p>{assignment.publicTestCases.map(t => <div key={t.id}><strong>{t.name}</strong><pre className="whitespace-pre-wrap">Input: {t.stdin}\nExpected: {t.expectedOutput}</pre></div>)}<p className="text-[#888]">{assignment.hiddenTestCases?.length || 0} hidden tests configured · {assignment.dueDate ? `Due ${new Date(assignment.dueDate).toLocaleString()}` : "No deadline"}</p></div></details>
        <div className="min-h-0 flex-1"><TeacherWatch classId={classId} assignmentId={assignmentId} language={assignment.language} /></div>
        {localPreview && <details className="shrink-0 border-t border-[#333] bg-[#181818] text-xs"><summary className="cursor-pointer px-4 py-2">Preview sample student</summary><div className="fixed inset-x-0 bottom-0 top-24 z-50 bg-[#1e1e1e]"><button onClick={e => e.currentTarget.closest("details")?.removeAttribute("open")} className="absolute right-4 top-0 z-50 bg-[#333] px-3 py-1 text-white">Close preview</button><AssignmentWorkspace classId={classId} assignmentId={assignmentId} allowLate={assignment.allowLate} assignment={assignment} previewStudent /></div></details>}
      </>}
    </main>
  );
}
