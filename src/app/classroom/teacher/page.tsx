import { redirect } from "next/navigation";
import ClassroomHub from "@/components/classroom/ClassroomHub";
import { ensureLocalPreviewTeacher } from "@/lib/classroom/localTeacherPreview";
import { checkIsVerifiedTeacher } from "@/lib/classroom/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function ClassroomTeacherPage() {
  if (!isAuthConfigured()) {
    const preview = await ensureLocalPreviewTeacher();
    if (!preview) redirect("/login/teacher?next=/classroom/teacher");
    return <ClassroomHub view="teacher" />;
  }

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login/teacher?next=/classroom/teacher");

  const isTeacher = await checkIsVerifiedTeacher(user.id);
  if (!isTeacher) redirect("/classroom/student");

  return <ClassroomHub view="teacher" />;
}
