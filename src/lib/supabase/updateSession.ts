import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { requestOrigin } from "./requestOrigin";

const PROTECTED = [
  /^\/projects(?:\/|$)/,
  /^\/groups(?:\/|$)/,
  /^\/p(?:\/|$)/,
  /^\/admin(?:\/|$)/,
];

export async function updateSession(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const needsAuth = PROTECTED.some((pattern) => pattern.test(path));

  // If public route or API with no auth cookies, pass through immediately without remote network round-trip
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!needsAuth && (!hasAuthCookie || isApi)) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (needsAuth && !user) {
    const redirectUrl = new URL("/login", requestOrigin(request));
    redirectUrl.searchParams.set("next", path);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
