import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import { safeNextPath } from "@/lib/cloud/roles";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const params = await searchParams;
  const role = params.role as "learner" | "teacher" | "admin" | undefined;
  const defaultNext =
    role === "admin"
      ? "/admin"
      : role === "teacher"
      ? "/classroom/teach/apply"
      : "/classroom/student";

  const nextPath = params.next ? safeNextPath(params.next) : defaultNext;
  if (!isAuthConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect(nextPath);

  return <AuthForm mode="signup" role={role} nextPath={nextPath} />;
}
