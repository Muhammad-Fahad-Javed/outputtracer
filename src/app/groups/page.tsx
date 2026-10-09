import Link from "next/link";
import { redirect } from "next/navigation";
import CreateGroupForm from "@/components/cloud/CreateGroupForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import WorkspaceHeader from "@/components/cloud/WorkspaceHeader";
import { isCloudConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  if (!isCloudConfigured()) return <SetupRequired />;
  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/groups");

  const { data: groups } = await supabase.from("groups").select("id, name, owner_id").order("name");

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <p className="mt-2 max-w-xl text-sm text-[#666666]">
          A class or a team. Members can edit every project created inside the group. The group owner can invite people.
        </p>
        <div className="mt-8">
          <CreateGroupForm />
        </div>
        <ul className="mt-8 divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
          {(groups || []).map((group) => (
            <li key={group.id}>
              <Link href={`/groups/${group.id}`} className="flex items-center justify-between py-4">
                <span className="font-medium">{group.name}</span>
                <span className="text-sm text-[#666666]">{group.owner_id === user.id ? "Owner" : "Member"}</span>
              </Link>
            </li>
          ))}
          {(groups || []).length === 0 && <li className="py-8 text-sm text-[#666666]">No groups yet.</li>}
        </ul>
      </main>
    </>
  );
}
