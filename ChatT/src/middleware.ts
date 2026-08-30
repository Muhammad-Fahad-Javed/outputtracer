import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback"];

/**
 * Server-side route protection.
 *
 * This is deliberately independent of anything in the React tree: even if
 * every client-side check were removed or a request bypassed the UI
 * entirely, this middleware still redirects unauthenticated users away
 * from protected pages.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Not signed in and hitting a protected page -> bounce to /login.
  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Signed in but hitting /login or /signup -> go straight to the chat.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and image optimization assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
