import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { safeNextPath } from "@/lib/cloud/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { checkIsVerifiedTeacher } from "@/lib/classroom/roles";

export default async function TeacherLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!isAuthConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user) {
    const isTeacher = await checkIsVerifiedTeacher(user.id);
    if (isTeacher) {
      redirect(params.next ? safeNextPath(params.next) : "/classroom");
    } else {
      redirect("/classroom/teach/apply");
    }
  }

  const nextPath = params.next ? safeNextPath(params.next) : "/classroom";

  return (
    <AuthForm
      mode="login"
      role="teacher"
      nextPath={nextPath}
      initialError={params.error ?? null}
    />
  );
}
