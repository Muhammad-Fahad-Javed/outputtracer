import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { safeNextPath } from "@/lib/cloud/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { ensureLocalPreviewTeacher } from "@/lib/classroom/localTeacherPreview";

export default async function TeacherLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!isAuthConfigured()) {
    const preview = await ensureLocalPreviewTeacher();
    if (preview) redirect("/auth/continue?role=teacher");
    return <SetupRequired />;
  }

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user) {
    const next = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
    redirect(`/auth/continue?role=teacher${next}`);
  }

  const nextPath = params.next ? safeNextPath(params.next) : "/classroom/teacher";

  return (
    <AuthForm
      mode="login"
      role="teacher"
      nextPath={nextPath}
      initialError={params.error ?? null}
    />
  );
}
