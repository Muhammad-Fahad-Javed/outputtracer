import { isAuthConfigured } from "@/lib/supabase/env";
import { createClassroom, listUserClassrooms } from "./classroomService";
import { _setMemoryTeacherAppStatus, _setMemoryTeacherProfile } from "./roles";

/** Fixed id for the on-machine teacher shown when accounts are not configured. */
export const LOCAL_PREVIEW_TEACHER_ID = "local-preview-teacher";

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
      await createClassroom(LOCAL_PREVIEW_TEACHER_ID, {
        name: "CS106B Programming Abstractions",
        subject: "C++",
        description: "Sample class on this machine so the teacher dashboard can be opened without Supabase.",
      });
    })();
  }
  await seedPromise;

  return { id: LOCAL_PREVIEW_TEACHER_ID, email: LOCAL_PREVIEW_TEACHER_EMAIL };
}
