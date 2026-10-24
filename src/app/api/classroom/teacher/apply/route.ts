import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getTeacherApplicationForUser, submitTeacherApplication,
} from "@/lib/classroom/teacherService";
import { getUserCapabilities } from "@/lib/classroom/roles";


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

export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!supabase) return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({error:"Application details are required."},{status:400}); }
  const result = await submitTeacherApplication(user.id, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
