import { createClient } from "@/lib/supabase/server";
import {
  ensureLocalPreviewTeacher,
  LOCAL_PREVIEW_TEACHER_ID,
  localTeacherPreviewEnabled,
} from "./localTeacherPreview";

export type ClassroomActor = { id: string; email?: string | null };

/**
 * Signed-in Supabase user, or the local sample teacher when accounts are not
 * configured outside production. A configured project never receives the sample
 * teacher, even if the current request has no session.
 */
export async function classroomRequestUser(): Promise<ClassroomActor | null> {
  try {
    const supabase = await createClient();
    if (supabase) {
      const user = (await supabase.auth.getUser()).data.user;
      if (user?.id) {
        return { id: user.id, email: user.email };
      }
    }
  } catch {
    // No session cookie in this request.
  }

  return ensureLocalPreviewTeacher();
}

export function isLocalPreviewActor(user: ClassroomActor | null): boolean {
  return Boolean(
    user && localTeacherPreviewEnabled() && user.id === LOCAL_PREVIEW_TEACHER_ID
  );
}
