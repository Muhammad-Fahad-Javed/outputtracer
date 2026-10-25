import { allWorkspaces } from "@/lib/workspaces";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FolderPlus, History, Settings2 } from "lucide-react";
import CreateProjectForm from "@/components/cloud/CreateProjectForm";
import DisplayNameForm from "@/components/cloud/DisplayNameForm";
import ProjectsLibrary from "@/components/cloud/ProjectsLibrary";
import SetupRequired from "@/components/cloud/SetupRequired";
import WorkspaceHeader from "@/components/cloud/WorkspaceHeader";
import { isCloudConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!isCloudConfigured()) return <SetupRequired />;
  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects");
  const [profile, library] = await Promise.allSettled([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    allWorkspaces(user.id),
  ]);
  const name = profile.status === "fulfilled" ? profile.value.data?.display_name || "" : "";
  const saved = library.status === "fulfilled" ? library.value : [];
  const loadError = library.status === "rejected" ? "Saved work could not be loaded. Please retry." : "";

  return <div data-surface="light" className="min-h-dvh text-slate-900" style={{ backgroundColor: "#f8fafc" }}>
    <WorkspaceHeader />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Your coding workspace</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">All Projects</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Personal projects, shared work and classroom assignments, together in one place.</p></div>
        <Link href="/projects/resume" className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:border-slate-400"><History size={16} aria-hidden/>Resume last workspace<ArrowRight size={14} aria-hidden/></Link>
      </div>
      <section aria-labelledby="new-project-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><FolderPlus size={19} aria-hidden/></span><div><h2 id="new-project-title" className="text-base font-semibold">New project</h2><p className="mt-1 text-sm text-slate-500">Choose your language, then open a full editor. Invite collaborators whenever you are ready.</p></div></div>
        <CreateProjectForm />
      </section>
      <ProjectsLibrary workspaces={saved} loadError={loadError}/>
      <details className="mt-7 rounded-xl border border-slate-200 bg-white px-5 py-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600"><Settings2 size={15} aria-hidden/>Your collaboration name</summary><p className="mt-3 text-xs text-slate-500">This name appears beside your cursor when working with classmates.</p><div className="mt-3"><DisplayNameForm name={name}/></div></details>
      <p className="mt-7 text-center text-xs text-slate-400">OutputTracer · Compile · Trace · Learn</p>
    </main>
  </div>;
}
