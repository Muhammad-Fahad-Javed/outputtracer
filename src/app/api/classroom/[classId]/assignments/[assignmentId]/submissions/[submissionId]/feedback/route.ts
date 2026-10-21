/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/feedback
 *   Add feedback comment (teacher only). Supports optional file/line reference and private flag.
 *
 * GET /api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/feedback
 *   List feedback. Students see only non-private comments. Teachers see all.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getClassroom } from "@/lib/classroom/classroomService";
import { addFeedback, listFeedback } from "@/lib/classroom/gradingService";
import type { AddFeedbackInput } from "@/lib/classroom/submissionTypes";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string; submissionId: string }> }
) {
  const { classId, submissionId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  const feedback = await listFeedback(submissionId, Boolean(access.isTeacher));
  return NextResponse.json({ success: true, feedback });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string; submissionId: string }> }
) {
  const { classId, submissionId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success || !access.isTeacher) {
    return NextResponse.json({ success: false, error: "Teacher access required to add feedback." }, { status: 403 });
  }

  let body: AddFeedbackInput;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.comment || typeof body.comment !== "string" || body.comment.trim().length === 0) {
    return NextResponse.json({ success: false, error: "A non-empty comment is required." }, { status: 400 });
  }

  const item = await addFeedback(submissionId, user.id, body);
  return NextResponse.json({ success: true, feedback: item });
}
