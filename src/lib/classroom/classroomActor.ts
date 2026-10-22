/**
 * Local preview can open the sample student's editor from the teacher browser.
 * A configured deployment never honors previewStudent.
 */
export function actorForClassroomRequest(input: {
  userId: string;
  isTeacher: boolean;
  previewStudent: boolean;
  previewAllowed: boolean;
  previewStudentId: string;
}): { actorId: string; isTeacher: boolean; error?: string } {
  if (!input.previewStudent) {
    return { actorId: input.userId, isTeacher: input.isTeacher };
  }
  if (!input.previewAllowed) {
    return { actorId: input.userId, isTeacher: input.isTeacher, error: "Preview is not available." };
  }
  return { actorId: input.previewStudentId, isTeacher: false };
}
