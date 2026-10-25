import Link from "next/link";
import { Code2 } from "lucide-react";
import { signOut } from "@/lib/cloud/actions";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceHeader() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  let name = user?.email || "";
  if (supabase && user) {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (data?.display_name) name = data.display_name;
  }
  return <header className="border-b border-slate-200 bg-white text-slate-900">
    <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
      <Link href="/projects" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold"><span className="rounded-md bg-slate-900 p-1.5 text-white"><Code2 size={16} aria-hidden/></span>OutputTracer</Link>
      <nav aria-label="Workspace navigation" className="order-3 flex w-full items-center gap-5 overflow-x-auto py-1 text-xs text-slate-500 lg:order-0 lg:w-auto lg:flex-1 lg:text-sm">
        <Link href="/projects" className="shrink-0 hover:text-slate-900">All Projects</Link><Link href="/groups" className="shrink-0 hover:text-slate-900">Project groups</Link><Link href="/classroom" className="shrink-0 hover:text-slate-900">Classrooms</Link><Link href="/" className="shrink-0 hover:text-slate-900">Playground</Link><Link href="/practice" className="shrink-0 hover:text-slate-900">Practice</Link>
      </nav>
      <div className="flex min-w-0 items-center gap-3 text-xs">{name && <span className="hidden max-w-44 truncate text-slate-500 sm:inline">{name}</span>}{user ? <form action={signOut}><button type="submit" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50">Sign out</button></form> : <Link href="/login" className="rounded-lg border border-slate-200 px-3 py-2">Sign in</Link>}</div>
    </div>
  </header>;
}
