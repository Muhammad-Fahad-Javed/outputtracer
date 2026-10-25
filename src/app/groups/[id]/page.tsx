import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CreateProjectForm from "@/components/cloud/CreateProjectForm";
import { DeleteGroupButton, InviteGroupForm, RemoveMemberButton, RenameGroupButton } from "@/components/cloud/GroupControls";
import SetupRequired from "@/components/cloud/SetupRequired";
import WorkspaceHeader from "@/components/cloud/WorkspaceHeader";
import { isUuid } from "@/lib/cloud/roles";
import { isCloudConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { projectLanguageLabel } from "@/lib/cloud/projectLanguage";

export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: string;
  profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null;
}

function profileName(row: MemberRow): { name: string; email: string } {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    name: profile?.display_name || "Student",
    email: profile?.email || "",
  };
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCloudConfigured()) return <SetupRequired />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${id}`);

  const { data: group } = await supabase.from("groups").select("id, name, owner_id").eq("id", id).maybeSingle();
  if (!group) notFound();

  const [{ data: members }, { data: projects }, { data: invites }] = await Promise.all([
    supabase.from("group_members").select("user_id, role, profiles(display_name, email)").eq("group_id", id),
    supabase.from("projects").select("id, title, standard, language").eq("group_id", id).order("updated_at", { ascending: false }),
    supabase.from("invites").select("email").eq("group_id", id),
  ]);

  const isOwner = group.owner_id === user.id;

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          {isOwner && (
            <div className="flex gap-2">
              <RenameGroupButton groupId={id} name={group.name} />
              <DeleteGroupButton groupId={id} />
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-[#666666]">Projects in this group are editable by every member.</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Projects</h2>
          <div className="mt-4">
            <CreateProjectForm groupId={id} />
          </div>
          <ul className="mt-4 divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
            {(projects || []).map((project) => (
              <li key={project.id}>
                <Link href={`/p/${project.id}`} className="flex items-center justify-between py-3">
                  <span className="font-medium">{project.title}</span>
                  <span className="text-sm text-[#666666]">{projectLanguageLabel(project.language, project.standard)}</span>
                </Link>
              </li>
            ))}
            {(projects || []).length === 0 && <li className="py-6 text-sm text-[#666666]">No projects in this group yet.</li>}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">People</h2>
          {isOwner && <InviteGroupForm groupId={id} />}
          <ul className="mt-4 divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
            {((members || []) as MemberRow[]).map((member) => {
              const person = profileName(member);
              return (
                <li key={member.user_id} className="flex items-center justify-between py-3">
                  <span>
                    <span className="block font-medium">{person.name}</span>
                    <span className="text-sm text-[#666666]">{person.email}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-[#666666]">
                    {member.role}
                    {isOwner && member.user_id !== group.owner_id && (
                      <RemoveMemberButton groupId={id} userId={member.user_id} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {(invites || []).length > 0 && (
            <p className="mt-3 text-sm text-[#666666]">
              Waiting for signup: {(invites || []).map((invite) => invite.email).join(", ")}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
