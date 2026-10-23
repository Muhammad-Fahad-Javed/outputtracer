import { NextResponse } from "next/server";
import { destinationAfterLogin, parseSessionRole, SESSION_ROLE_COOKIE, type SessionRole } from "@/lib/sessionRole";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { ensureLocalPreviewTeacher } from "@/lib/classroom/localTeacherPreview";
import { isAuthConfigured } from "@/lib/supabase/env";
import { requestOrigin } from "@/lib/supabase/requestOrigin";
import { createClient } from "@/lib/supabase/server";

function loginPath(role: SessionRole): string {
  if (role === "teacher") return "/login/teacher";
  if (role === "admin") return "/login/admin";
  return "/login/learner";
}

/**
 * Remember the role chosen on the sign-in screen, then open that role's home.
 * A teacher profile never overrides an explicit learner choice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = parseSessionRole(url.searchParams.get("role")) ?? "learner";
  const origin = requestOrigin(request);

  let signedIn = false;
  let isAdmin = false;
  let isVerifiedTeacher = false;

  if (!isAuthConfigured()) {
    const preview = await ensureLocalPreviewTeacher();
    if (preview) {
      signedIn = true;
      isVerifiedTeacher = role === "teacher";
    }
  } else {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) {
      signedIn = true;
      const caps = await getUserCapabilities(user.id);
      isAdmin = caps.isAdmin;
      isVerifiedTeacher = caps.isVerifiedTeacher;
    }
  }

  const destination = signedIn
    ? destinationAfterLogin({
        role,
        isAdmin,
        isVerifiedTeacher,
        next: url.searchParams.get("next"),
      })
    : loginPath(role);

  const response = NextResponse.redirect(new URL(destination, origin));
  response.cookies.set(SESSION_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: origin.startsWith("https://"),
  });
  return response;
}
