import Link from "next/link";
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

  return (
    <header className="border-b border-[#DCDCDC]">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-5">
          <Link href="/projects" className="text-[14px] font-semibold">OutputTracer</Link>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link href="/projects/resume">Projects</Link>
            <Link href="/groups">Groups</Link>
            <Link href="/">Playground</Link>
            <Link href="/practice">Practice</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          {name && <span className="hidden text-[#666666] sm:inline">{name}</span>}
          {user ? (
            <form action={signOut}>
              <button type="submit" className="rounded border border-[#DCDCDC] px-2 py-1">Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="rounded border border-[#DCDCDC] px-2 py-1">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
