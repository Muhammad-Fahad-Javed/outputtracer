import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/cloud/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next") || undefined);

  // Supabase passes error details as query params when something goes wrong
  // (e.g. the user clicks an expired confirmation link).
  const errorCode = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (errorCode) {
    // Redirect to login with a human-readable message rather than silently
    // dropping the user on /projects with an unauthenticated session.
    const loginUrl = new URL("/login", url.origin);
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
        // Code exchange failed (expired PKCE verifier, replayed code, etc.)
        const loginUrl = new URL("/login", url.origin);
        loginUrl.searchParams.set(
          "error",
          "The confirmation link has expired or was already used. Please sign in or request a new link."
        );
        loginUrl.searchParams.set("next", nextPath);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return NextResponse.redirect(new URL(nextPath, url.origin));
}
