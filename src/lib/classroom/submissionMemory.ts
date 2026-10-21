import { pickOwnSubmission } from "./ownSubmission";

export interface MemorySubmission {
  id: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  status: string;
  codeFiles: Record<string, string>;
  submittedAt: string;
  isLate: boolean;
  grade?: number | null;
  feedback?: string | null;
  gradedAt?: string | null;
}

const memorySubmissions = new Map<string, MemorySubmission>();

export function _resetMemorySubmissions(): void {
  memorySubmissions.clear();
}

function key(assignmentId: string, studentId?: string, groupId?: string): string {
  return groupId ? `g:${assignmentId}:${groupId}` : `s:${assignmentId}:${studentId}`;
}

export function saveMemorySubmission(submission: MemorySubmission): void {
  memorySubmissions.set(key(submission.assignmentId, submission.studentId, submission.groupId), {
    ...submission,
    codeFiles: { ...submission.codeFiles },
  });
}

export function readMemorySubmission(
  assignmentId: string,
  userId: string,
  groupIds: readonly string[]
): MemorySubmission | null {
  const personal = memorySubmissions.get(key(assignmentId, userId));
  const grouped = groupIds
    .map((groupId) => memorySubmissions.get(key(assignmentId, undefined, groupId)))
    .filter((row): row is MemorySubmission => Boolean(row));
  const rows = [personal, ...grouped].filter((row): row is MemorySubmission => Boolean(row)).map((row) => ({
    ...row,
    student_id: row.studentId ?? null,
    group_id: row.groupId ?? null,
  }));
  return pickOwnSubmission(rows, userId, groupIds);
}
