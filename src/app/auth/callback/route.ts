import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/cloud/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next") || undefined);
  if (code) {
    const supabase = await createClient();
    if (supabase) await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(nextPath, url.origin));
}
