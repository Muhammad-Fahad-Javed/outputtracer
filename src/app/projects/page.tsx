import Link from "next/link";
import { redirect } from "next/navigation";
import CreateProjectForm from "@/components/cloud/CreateProjectForm";
import DisplayNameForm from "@/components/cloud/DisplayNameForm";
import SetupRequired from "@/components/cloud/SetupRequired";
import WorkspaceHeader from "@/components/cloud/WorkspaceHeader";
import { isCloudConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!isCloudConfigured()) return <SetupRequired />;
  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects");

  const [{ data: projects }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("id, title, standard, updated_at, owner_id, group_id").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-2 max-w-xl text-sm text-[#666666]">
          A project is shared. Each person still runs it in their own terminal.
        </p>
        <div className="mt-8">
          <CreateProjectForm />
        </div>
        <div className="mt-8">
          <DisplayNameForm name={profile?.display_name || ""} />
        </div>
        <ul className="mt-10 divide-y divide-[#EAEAEA] border-y border-[#EAEAEA]">
          {(projects || []).map((project) => (
            <li key={project.id}>
              <Link href={`/p/${project.id}`} className="flex items-center justify-between gap-4 py-4 hover:bg-[#FAFAFA]">
                <span>
                  <span className="block font-medium">{project.title}</span>
                  <span className="text-sm text-[#666666]">{project.standard}</span>
                </span>
                <span className="text-sm text-[#666666]">
                  {project.owner_id === user.id ? "Owner" : "Shared"}
                </span>
              </Link>
            </li>
          ))}
          {(projects || []).length === 0 && (
            <li className="py-8 text-sm text-[#666666]">No projects yet.</li>
          )}
        </ul>
      </main>
    </>
  );
}
