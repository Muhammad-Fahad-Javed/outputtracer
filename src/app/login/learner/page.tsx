import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { safeNextPath } from "@/lib/cloud/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function LearnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!isAuthConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const nextPath = params.next ? safeNextPath(params.next) : "/classroom/student";

  if (user) {
    redirect(nextPath);
  }

  return (
    <AuthForm
      mode="login"
      role="learner"
      nextPath={nextPath}
      initialError={params.error ?? null}
    />
  );
}
