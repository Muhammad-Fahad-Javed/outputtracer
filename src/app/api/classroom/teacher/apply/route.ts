import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getTeacherApplicationForUser,
} from "@/lib/classroom/teacherService";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { activateTeacherProfile } from "@/lib/classroom/teacherActivation";

export async function GET() {
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const [capabilities, application] = await Promise.all([
    getUserCapabilities(user.id),
    getTeacherApplicationForUser(user.id),
  ]);

  return NextResponse.json({
    success: true,
    capabilities,
    application,
  });
}

// Legacy URL retained for bookmarked clients; activation no longer submits an application.
export async function POST() {
  const supabase = await createServerClient();
  if (!supabase) return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const result = await activateTeacherProfile(supabase);
  return NextResponse.json(result, { status: result.success ? 200 : 409 });
}
