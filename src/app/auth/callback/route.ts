import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/cloud/roles";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/supabase/requestOrigin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  // request.url is http://localhost:3000 behind Nginx; use the public origin.
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next") || undefined);

  const errorCode = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (errorCode) {
    const loginUrl = new URL("/login", origin);
    const message =
      errorDescription?.replace(/\+/g, " ") ||
      "The link has expired or is invalid. Please sign in and try again.";
    loginUrl.searchParams.set("error", message);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        const loginUrl = new URL("/login", origin);
        loginUrl.searchParams.set(
          "error",
          "The confirmation link has expired or was already used. Please sign in or request a new link."
        );
        loginUrl.searchParams.set("next", nextPath);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return NextResponse.redirect(new URL(nextPath, origin));
}
