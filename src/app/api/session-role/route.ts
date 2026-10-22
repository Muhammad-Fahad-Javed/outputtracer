import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureLocalPreviewTeacher } from "@/lib/classroom/localTeacherPreview";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { parseSessionRole, roleHome, SESSION_ROLE_COOKIE, TEACHER_HOME } from "@/lib/sessionRole";
import { isAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let role = null;
  try {
    const store = await cookies();
    role = parseSessionRole(store.get(SESSION_ROLE_COOKIE)?.value);
  } catch {
    role = null;
  }

  try {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) {
      const caps = await getUserCapabilities(user.id);
      const resolved = role ?? "learner";
      return NextResponse.json({
        signedIn: true,
        role: resolved,
        isAdmin: caps.isAdmin,
        isVerifiedTeacher: caps.isVerifiedTeacher,
        home: roleHome(resolved, caps),
      });
    }
  } catch {
    // No session.
  }

  // The sample teacher exists only after a teacher sign-in set the role cookie.
  // Do not treat every logged-out request as that teacher.
  if (role === "teacher" && !isAuthConfigured()) {
    const preview = await ensureLocalPreviewTeacher();
    if (preview) {
      return NextResponse.json({
        signedIn: true,
        role: "teacher",
        isAdmin: false,
        isVerifiedTeacher: true,
        home: TEACHER_HOME,
      });
    }
  }

  return NextResponse.json({
    signedIn: false,
    role: null,
    isAdmin: false,
    isVerifiedTeacher: false,
    home: "/",
  });
}
