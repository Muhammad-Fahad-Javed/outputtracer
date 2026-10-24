/**
 * GET the signed-in student's own submission for this assignment.
 * Hidden tests and other students' rows are not included.
 */

import { NextResponse } from "next/server";
import {
  assignmentBelongsToClassroom,
  getClassroom,
  listCallerGroupIds,
} from "@/lib/classroom/classroomService";
import { pickOwnSubmission } from "@/lib/classroom/ownSubmission";
import { classroomRequestUser } from "@/lib/classroom/requestUser";
import { readMemorySubmission } from "@/lib/classroom/submissionMemory";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const user = await classroomRequestUser();
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
    const groupIds = await listCallerGroupIds(user.id, classId, assignmentId);
    const submission = readMemorySubmission(assignmentId, user.id, groupIds);
    return NextResponse.json({ success: true, submission });
  }

  const columns = "id, status, code_files, submitted_at, is_late, grade, feedback, graded_at, student_id, group_id";
  const { data: personal, error } = await admin
    .from("classroom_submissions")
    .select(columns)
    .eq("assignment_id", assignmentId)
    .eq("student_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: "Could not load your submission." }, { status: 500 });
  }

  let row = personal;
  if (!row) {
    const groupIds = await listCallerGroupIds(user.id, classId, assignmentId);
    if (groupIds.length > 0) {
      const { data: grouped, error: groupError } = await admin
        .from("classroom_submissions")
        .select(columns)
        .eq("assignment_id", assignmentId)
        .in("group_id", groupIds)
        .order("submitted_at", { ascending: false });
      if (groupError) {
        return NextResponse.json({ success: false, error: "Could not load your submission." }, { status: 500 });
      }
      row = pickOwnSubmission(grouped || [], user.id, groupIds);
    }
  }

  return NextResponse.json({
    success: true,
    submission: row
      ? {
          id: row.id,
          status: row.status,
          codeFiles: row.code_files || {},
          submittedAt: row.submitted_at,
          isLate: row.is_late,
          grade: row.grade,
          feedback: row.feedback,
          gradedAt: row.graded_at,
        }
      : null,
  });
}
