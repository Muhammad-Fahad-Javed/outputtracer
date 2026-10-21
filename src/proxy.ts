import { NextResponse, type NextRequest } from "next/server";
import { apexRedirectHost } from "@/lib/canonicalHost";
import { updateSession } from "@/lib/supabase/updateSession";

export async function proxy(request: NextRequest) {
  // The www alias must not serve a second copy of the site: every page
  // declares the apex as canonical, so send 308 (method-preserving) requests
  // to https://outputtracer.com. Runs before auth so links that land on www
  // are normalised exactly once.
  const apexHost = apexRedirectHost(
    request.headers.get("host") ?? request.headers.get("x-forwarded-host")
  );
  if (apexHost) {
    const url = request.nextUrl.clone();
    url.host = apexHost;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
