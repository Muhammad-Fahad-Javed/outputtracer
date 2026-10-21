/**
 * GET the signed-in student's own submission for this assignment.
 * Hidden tests and other students' rows are not included.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  assignmentBelongsToClassroom,
  getClassroom,
} from "@/lib/classroom/classroomService";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const access = await getClassroom(user.id, classId);
  if (!access.success) {
    return NextResponse.json({ success: false, error: access.error }, { status: 403 });
  }
  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ success: true, submission: null });
  }

  const { data, error } = await admin
    .from("classroom_submissions")
    .select("id, status, code_files, submitted_at, is_late, grade, feedback, graded_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: "Could not load your submission." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    submission: data
      ? {
          id: data.id,
          status: data.status,
          codeFiles: data.code_files || {},
          submittedAt: data.submitted_at,
          isLate: data.is_late,
          grade: data.grade,
          feedback: data.feedback,
          gradedAt: data.graded_at,
        }
      : null,
  });
}
