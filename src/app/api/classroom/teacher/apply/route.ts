import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  submitTeacherApplication,
  getTeacherApplicationForUser,
} from "@/lib/classroom/teacherService";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { TeacherApplicationInput } from "@/lib/classroom/types";

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

  let body: TeacherApplicationInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  // Security: Disallow any client-supplied user ID or role field
  const result = await submitTeacherApplication(user.id, body);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed submitting application" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    application: result.application,
    message: body.isDraft
      ? "Teacher application draft saved."
      : "Teacher application submitted for review.",
  });
}
