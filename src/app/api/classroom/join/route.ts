import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { joinClassroomByCode } from "@/lib/classroom/classroomService";

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

  let body: { joinCode: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (!body.joinCode) {
    return NextResponse.json({ error: "Classroom code is required" }, { status: 400 });
  }

  const result = await joinClassroomByCode(user.id, body.joinCode);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to join classroom" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    classroom: result.classroom,
    message: "Enrolled in classroom successfully.",
  });
}
