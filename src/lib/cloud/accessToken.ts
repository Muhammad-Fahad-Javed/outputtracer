import { createClient } from "@supabase/supabase-js";
import { isProjectRole, isUuid, type ProjectRole } from "@/lib/cloud/roles";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export interface ProjectAccess {
  userId: string;
  role: ProjectRole;
}

export async function accessFromToken(
  token: string,
  projectId: string
): Promise<ProjectAccess | null> {
  if (!isUuid(projectId) || !token || token.length > 12_000) return null;
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: role, error } = await userClient.rpc("project_role", { pid: projectId });
  if (error || !isProjectRole(role)) return null;
  return { userId: userData.user.id, role };
}
