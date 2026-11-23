import { notFound, redirect } from "next/navigation";
import { checkIsAdmin } from "@/lib/learn/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function requireTeacherDashboardAdmin(nextPath: string) {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect(`/login/admin?next=${encodeURIComponent(nextPath)}`);
  if (!(await checkIsAdmin(user.id))) notFound();
  return createAdminClient();
}

export const dashboardPageSize = 25;

export function dashboardPageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}
