import { isAuthConfigured } from "@/lib/supabase/env";
import {
  addClassroomMember,
  createClassroom,
  listClassroomRoster,
  listUserClassrooms,
  _setMemoryMemberLabel,
} from "./classroomService";
import { _setMemoryTeacherAppStatus, _setMemoryTeacherProfile } from "./roles";

/** Fixed id for the on-machine teacher shown when accounts are not configured. */
export const LOCAL_PREVIEW_TEACHER_ID = "local-preview-teacher";

/** Enrolled only in the sample class so the teacher can assign a group and open an editor. */
export const LOCAL_PREVIEW_STUDENT_ID = "local-preview-student";

const LOCAL_PREVIEW_TEACHER_EMAIL = "teacher@localhost";

let seedPromise: Promise<void> | null = null;

/**
 * Local teacher preview is only for `next dev` (and tests) when Supabase is
 * absent. Production always requires a real session, including a production
 * process that was started without credentials.
 */
export function localTeacherPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !isAuthConfigured();
}

export function _resetLocalTeacherPreview(): void {
  seedPromise = null;
}

export async function ensureLocalPreviewTeacher(): Promise<{ id: string; email: string } | null> {
  if (!localTeacherPreviewEnabled()) return null;

  const now = new Date().toISOString();
  _setMemoryTeacherProfile(LOCAL_PREVIEW_TEACHER_ID, {
    userId: LOCAL_PREVIEW_TEACHER_ID,
    status: "approved",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  _setMemoryTeacherAppStatus(LOCAL_PREVIEW_TEACHER_ID, "approved");

  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await listUserClassrooms(LOCAL_PREVIEW_TEACHER_ID);
      if (existing.teaching.length > 0) return;
      const created = await createClassroom(LOCAL_PREVIEW_TEACHER_ID, {
        name: "CS106B Programming Abstractions",
        subject: "C++",
        description: "Sample class on this machine so the teacher dashboard can be opened without Supabase.",
      });
      if (created.classroom) {
        _setMemoryMemberLabel(
          created.classroom.id,
          LOCAL_PREVIEW_TEACHER_ID,
          "Local teacher",
          LOCAL_PREVIEW_TEACHER_EMAIL
        );
      }
    })();
  }
  await seedPromise;

  const classes = await listUserClassrooms(LOCAL_PREVIEW_TEACHER_ID);
  const classId = classes.teaching[0]?.id;
  if (classId) {
    const roster = await listClassroomRoster(LOCAL_PREVIEW_TEACHER_ID, classId);
    const enrolled = roster.members?.some((member) => member.userId === LOCAL_PREVIEW_STUDENT_ID);
    if (!enrolled) {
      await addClassroomMember(classId, LOCAL_PREVIEW_STUDENT_ID, "student");
    }
    _setMemoryMemberLabel(classId, LOCAL_PREVIEW_STUDENT_ID, "Sample student", "student@localhost");
  }

  return { id: LOCAL_PREVIEW_TEACHER_ID, email: LOCAL_PREVIEW_TEACHER_EMAIL };
}
