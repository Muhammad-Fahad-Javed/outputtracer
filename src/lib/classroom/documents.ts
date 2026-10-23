import { classroomLanguage, type ClassroomLanguage } from "./languages";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignmentFreezeState } from "./assignmentPolicy";
import {
  getAssignment,
  listCallerGroupIds,
  listClassroomGroups,
  listClassroomRoster,
} from "./classroomService";
import type { AssignmentTestCase } from "./types";

export interface ClassroomDocumentRecord {
  docKey: string;
  classroomId: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  stateB64: string;
  files: Record<string, string>;
  updatedAt: string;
}

export interface ResolvedClassroomDocument {
  language: ClassroomLanguage;
  docKey: string;
  classroomId: string;
  assignmentId: string;
  role: "editor" | "viewer";
  groupId?: string;
  studentId?: string;
  frozen: boolean;
  freezeReason?: string;
  allowRun: boolean;
  allowTrace: boolean;
  timeLimitMs: number;
  allowLate: boolean;
  dueDate?: string;
  groupMode: boolean;
  starterCode: Record<string, string>;
  publicTestCases: AssignmentTestCase[];
}

const memoryDocs = new Map<string, ClassroomDocumentRecord>();

export function _resetClassroomDocuments(): void {
  memoryDocs.clear();
}

export function classroomDocumentKey(
  assignmentId: string,
  owner: { groupId?: string | null; studentId?: string | null }
): string | null {
  if (owner.groupId) return `clsdoc:${assignmentId}:group:${owner.groupId}`;
  if (owner.studentId) return `clsdoc:${assignmentId}:student:${owner.studentId}`;
  return null;
}

export function chooseCanonicalFiles(
  live: Record<string, string> | null | undefined,
  stored: Record<string, string> | null | undefined,
  starter: Record<string, string>
): Record<string, string> {
  if (live && Object.keys(live).length > 0) return live;
  if (stored && Object.keys(stored).length > 0) return stored;
  return starter;
}

export async function readClassroomDocument(docKey: string): Promise<ClassroomDocumentRecord | null> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("classroom_documents")
        .select("doc_key, classroom_id, assignment_id, student_id, group_id, state_b64, files, updated_at")
        .eq("doc_key", docKey)
        .maybeSingle();
      if (!error && data) {
        return {
          docKey: String(data.doc_key),
          classroomId: String(data.classroom_id),
          assignmentId: String(data.assignment_id),
          studentId: data.student_id ? String(data.student_id) : undefined,
          groupId: data.group_id ? String(data.group_id) : undefined,
          stateB64: String(data.state_b64 || ""),
          files: (data.files as Record<string, string>) || {},
          updatedAt: String(data.updated_at || ""),
        };
      }
    } catch {
      // Memory copy below.
    }
  }
  const row = memoryDocs.get(docKey);
  if (!row) return null;
  return { ...row, files: { ...row.files } };
}

export async function writeClassroomDocument(record: ClassroomDocumentRecord): Promise<void> {
  memoryDocs.set(record.docKey, { ...record, files: { ...record.files } });
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const { error } = await admin.from("classroom_documents").upsert(
      {
        doc_key: record.docKey,
        classroom_id: record.classroomId,
        assignment_id: record.assignmentId,
        student_id: record.studentId ?? null,
        group_id: record.groupId ?? null,
        state_b64: record.stateB64,
        files: record.files,
        updated_at: record.updatedAt,
      },
      { onConflict: "doc_key" }
    );
    if (error) console.warn("classroom document save failed:", error.message);
  } catch (err) {
    console.warn("classroom document save failed:", err);
  }
}

export async function resolveClassroomDocument(input: {
  actorId: string;
  classroomId: string;
  assignmentId: string;
  isTeacher: boolean;
  groupId?: string;
  studentId?: string;
  now?: number;
}): Promise<
  | { ok: true; doc: ResolvedClassroomDocument }
  | { ok: false; status: number; error: string; code?: "no-group" | "many-groups" }
> {
  const loaded = await getAssignment(input.actorId, input.classroomId, input.assignmentId);
  if (!loaded.success || !loaded.assignment) {
    const missing = (loaded.error || "").toLowerCase().includes("not found");
    return {
      ok: false,
      status: missing ? 404 : 403,
      error: loaded.error || "Assignment not found",
    };
  }
  const assignment = loaded.assignment;
  const freeze = assignmentFreezeState(assignment, input.now);
  let groupId: string | undefined;
  let studentId: string | undefined;

  if (assignment.groupMode) {
    if (input.isTeacher) {
      if (!input.groupId) {
        return { ok: false, status: 400, error: "Choose a group to open." };
      }
      const groups = await listClassroomGroups(input.actorId, input.classroomId);
      const group = groups.groups?.find((item) => item.id === input.groupId);
      if (!group) return { ok: false, status: 404, error: "Group not found" };
      groupId = group.id;
    } else {
      const ids = await listCallerGroupIds(input.actorId, input.classroomId);
      if (ids.length === 0) {
        return {
          ok: false,
          status: 403,
          code: "no-group",
          error: "You are not in a group for this class, so this group assignment cannot be opened.",
        };
      }
      if (ids.length > 1) {
        return {
          ok: false,
          status: 403,
          code: "many-groups",
          error: "You are in more than one group. Ask your teacher to keep one group per student.",
        };
      }
      if (input.groupId && input.groupId !== ids[0]) {
        return { ok: false, status: 403, error: "You are not a member of that group." };
      }
      groupId = ids[0];
    }
  } else if (input.isTeacher) {
    if (!input.studentId) {
      return { ok: false, status: 400, error: "Choose a student to open." };
    }
    const roster = await listClassroomRoster(input.actorId, input.classroomId);
    const student = roster.members?.find((member) => member.userId === input.studentId && member.role === "student");
    if (!student) return { ok: false, status: 404, error: "Student not found in this class." };
    studentId = student.userId;
  } else {
    if (input.studentId && input.studentId !== input.actorId) {
      return { ok: false, status: 403, error: "You can only open your own document." };
    }
    studentId = input.actorId;
  }

  const docKey = classroomDocumentKey(input.assignmentId, { groupId, studentId });
  if (!docKey) return { ok: false, status: 400, error: "This document has no owner." };

  const role = input.isTeacher || freeze.frozen ? "viewer" : "editor";
  return {
    ok: true,
    doc: {
      docKey,
      classroomId: input.classroomId,
      assignmentId: input.assignmentId,
      role,
      groupId,
      studentId,
      frozen: freeze.frozen,
      freezeReason: freeze.reason,
      allowRun: assignment.allowRun,
      allowTrace: assignment.allowTrace,
      timeLimitMs: assignment.timeLimitMs,
      allowLate: assignment.allowLate,
      dueDate: assignment.dueDate,
      groupMode: assignment.groupMode,
      language: classroomLanguage(assignment.language),
      starterCode: assignment.starterCode || {},
      publicTestCases: assignment.publicTestCases || [],
    },
  };
}
