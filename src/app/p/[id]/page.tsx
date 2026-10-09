import { notFound, redirect } from "next/navigation";
import CloudIde, { type CloudMember } from "@/components/CloudIde";
import SetupRequired from "@/components/cloud/SetupRequired";
import { isProjectRole, isUuid } from "@/lib/cloud/roles";
import { isCloudConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: string;
  profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null;
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCloudConfigured()) return <SetupRequired />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/p/${id}`);

  const { data: roleData } = await supabase.rpc("project_role", { pid: id });
  if (!isProjectRole(roleData)) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, standard, group_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: memberRows }, { data: inviteRows }, { data: profile }, { data: fileRows }, groupResult] = await Promise.all([
    supabase.from("project_members").select("user_id, role, profiles(display_name, email)").eq("project_id", id),
    supabase.from("invites").select("email, role").eq("project_id", id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("project_files").select("path, content").eq("project_id", id),
    project.group_id
      ? supabase.from("group_members").select("user_id, role, profiles(display_name, email)").eq("group_id", project.group_id)
      : Promise.resolve({ data: [] as MemberRow[] }),
  ]);

  let groupName: string | null = null;
  if (project.group_id) {
    const { data: group } = await supabase.from("groups").select("name").eq("id", project.group_id).maybeSingle();
    groupName = group?.name ?? null;
  }

  const members: CloudMember[] = [];
  const seen = new Set<string>();
  for (const row of (memberRows || []) as MemberRow[]) {
    if (!isProjectRole(row.role)) continue;
    const profileRow = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    seen.add(row.user_id);
    members.push({
      userId: row.user_id,
      role: row.role,
      name: profileRow?.display_name || "Student",
      email: profileRow?.email || "",
    });
  }
  for (const row of (groupResult.data || []) as MemberRow[]) {
    if (seen.has(row.user_id)) continue;
    const profileRow = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    members.push({
      userId: row.user_id,
      role: row.role === "owner" ? "owner" : "editor",
      name: profileRow?.display_name || "Student",
      email: profileRow?.email || "",
      viaGroup: true,
    });
  }

  const initialFiles: Record<string, string> = {};
  for (const row of fileRows || []) {
    if (typeof row.path === "string" && typeof row.content === "string") {
      initialFiles[row.path] = row.content;
    }
  }

  return (
    <CloudIde
      id={project.id}
      title={project.title}
      standard={project.standard}
      groupName={groupName}
      members={members}
      invites={(inviteRows || []).map((invite) => ({ email: invite.email, role: invite.role }))}
      userId={user.id}
      displayName={profile?.display_name || "Student"}
      initialFiles={initialFiles}
    />
  );
}
