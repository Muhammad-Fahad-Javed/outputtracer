import { redirect } from "next/navigation";
import { ensureLocalPreviewTeacher } from "@/lib/classroom/localTeacherPreview";
import { checkIsVerifiedTeacher } from "@/lib/classroom/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ClassroomTeacherRedirectPage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) {
    const preview = await ensureLocalPreviewTeacher();
    if (preview) redirect("/classroom");
    redirect("/login/teacher?next=/classroom/teacher");
  }

  const isTeacher = await checkIsVerifiedTeacher(user.id);
  if (isTeacher) {
    redirect("/classroom");
  } else {
    redirect("/classroom/teach/apply");
  }
}
