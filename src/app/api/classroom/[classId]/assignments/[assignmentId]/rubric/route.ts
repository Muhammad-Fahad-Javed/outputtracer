/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/rubric
 *   Create or update the rubric for an assignment (teacher only).
 *
 * GET /api/classroom/[classId]/assignments/[assignmentId]/rubric
 *   Get the rubric (visible to all classroom members).
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getClassroom } from "@/lib/classroom/classroomService";
import { getRubric, upsertRubric } from "@/lib/classroom/gradingService";
import type { UpsertRubricInput } from "@/lib/classroom/submissionTypes";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(classId, user.id);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  const rubric = await getRubric(assignmentId);
  return NextResponse.json({ success: true, rubric });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(classId, user.id);
  if (!access.success || !access.isTeacher) {
    return NextResponse.json({ success: false, error: "Teacher access required." }, { status: 403 });
  }

  let body: UpsertRubricInput;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: "Rubric must have at least one item." }, { status: 400 });
  }

  const rubric = await upsertRubric(assignmentId, body);
  return NextResponse.json({ success: true, rubric });
}
