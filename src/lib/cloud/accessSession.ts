import { accessFromToken, type ProjectAccess } from "@/lib/cloud/accessToken";
import { isProjectRole, isUuid } from "@/lib/cloud/roles";
import { createClient } from "@/lib/supabase/server";

export async function accessFromCookies(projectId: string): Promise<ProjectAccess | null> {
  if (!isUuid(projectId)) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: role, error } = await supabase.rpc("project_role", { pid: projectId });
  if (error || !isProjectRole(role)) return null;
  return { userId: user.id, role };
}

export { accessFromToken };
