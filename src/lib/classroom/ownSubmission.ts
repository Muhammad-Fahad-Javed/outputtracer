export interface OwnSubmissionRow {
  student_id: string | null;
  group_id: string | null;
  submitted_at?: string | null;
}

/**
 * A caller sees their personal submission first. A group submission is visible
 * only when the caller is a member of that group. Other students' rows are ignored.
 */
export function pickOwnSubmission<T extends OwnSubmissionRow>(
  rows: readonly T[],
  userId: string,
  groupIds: readonly string[]
): T | null {
  const personal = rows.find((row) => row.student_id === userId);
  if (personal) return personal;

  const allowed = new Set(groupIds);
  const grouped = rows
    .filter((row) => Boolean(row.group_id) && allowed.has(String(row.group_id)))
    .slice()
    .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
  return grouped[0] ?? null;
}
