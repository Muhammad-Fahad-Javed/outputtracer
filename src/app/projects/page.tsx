import {allWorkspaces} from "@/lib/workspaces";
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

  const [{ data: profile }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  let saved: Awaited<ReturnType<typeof allWorkspaces>>=[];let loadError="";
  try{saved=await allWorkspaces(user.id);}catch{loadError="Some saved work could not be loaded. Please retry.";}
  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">All Projects</h1>
        <p className="mt-2 max-w-xl text-sm text-[#666666]">
          A project is shared. Each person still runs it in their own terminal.
        </p>
        <div className="mt-8">
          <CreateProjectForm />
        </div>
        <div className="mt-8">
          <DisplayNameForm name={profile?.display_name || ""} />
        </div>
        {loadError&&<p role="alert" className="my-6 text-red-700">{loadError}</p>}
        <Link href="/projects/resume" className="mt-6 inline-block rounded bg-black px-4 py-2 text-white">Resume last workspace</Link>
        {(["Personal projects","Shared projects","Assignments"] as const).map(category=><section key={category} className="mt-8"><h2 className="text-lg font-semibold">{category}</h2><ul className="divide-y border-y">{saved.filter(w=>w.category===category).map(w=><li key={w.kind+w.id}><Link href={w.href} className="flex justify-between gap-4 py-4"><span><strong className="block">{w.title}</strong><span className="text-sm text-gray-600">{w.language}{w.context?` · ${w.context}`:''}</span></span><span className="text-xs text-gray-500">{w.lastOpenedAt?`Opened ${new Date(w.lastOpenedAt).toLocaleString()}`:'Open workspace'}</span></Link></li>)}</ul>{!loadError&&!saved.some(w=>w.category===category)&&<p className="py-4 text-sm text-gray-600">No {category.toLowerCase()} yet.</p>}</section>)}
      </main>
    </>
  );
}
