/** Call only after authorizing the actor against the classroom and assignment. */
export function canReadHistory(input: {
  actorId: string; assignmentId: string; isTeacher: boolean; groupIds: readonly string[];
}, record: { assignmentId: string; studentId?: string; groupId?: string }): boolean {
  if (record.assignmentId !== input.assignmentId) return false;
  if (input.isTeacher) return true;
  // Group records require membership even if a legacy row also contains a student id.
  if (record.groupId) return input.groupIds.includes(record.groupId);
  return record.studentId === input.actorId;
}

export async function canAccessSubmission(input: {
  actorId: string; classroomId: string; assignmentId: string; submissionId: string; isTeacher: boolean;
}): Promise<boolean> {
  const { getAssignment, listCallerGroupIds } = await import('./classroomService');
  const { getSubmissionSnapshot } = await import('./versioningService');
  const assignment = await getAssignment(input.actorId, input.classroomId, input.assignmentId);
  if (!assignment.success) return false;
  const snapshot = await getSubmissionSnapshot(input.submissionId);
  if (!snapshot) return false;
  return canReadHistory({ ...input,
    groupIds: input.isTeacher ? [] : await listCallerGroupIds(input.actorId, input.classroomId, input.assignmentId),
  }, snapshot);
}
