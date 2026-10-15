import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAssignment } from "@/lib/classroom/classroomService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
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

  const { classId, assignmentId } = await params;
  const result = await getAssignment(user.id, classId, assignmentId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Assignment not found" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    assignment: result.assignment,
    isTeacher: result.isTeacher,
  });
}
