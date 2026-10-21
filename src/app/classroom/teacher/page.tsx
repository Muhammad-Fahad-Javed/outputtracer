import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkIsVerifiedTeacher } from "@/lib/classroom/roles";

export default async function ClassroomTeacherRedirectPage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) {
    redirect("/login/teacher?next=/classroom/teacher");
  }

  const isTeacher = await checkIsVerifiedTeacher(user.id);
  if (isTeacher) {
    redirect("/classroom");
  } else {
    redirect("/classroom/teach/apply");
  }
}
