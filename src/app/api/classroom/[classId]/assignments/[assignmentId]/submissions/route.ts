/** Teacher-only metadata for hand-ins belonging to one assignment and owner. */
import { NextResponse } from "next/server";
import { classroomRequestUser } from "@/lib/classroom/requestUser";
import { getAssignment, getClassroom } from "@/lib/classroom/classroomService";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/cloud/roles";

export async function GET(request: Request, { params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  const user = await classroomRequestUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const { classId, assignmentId } = await params;
  const access = await getClassroom(user.id, classId);
  if (!access.success || !access.isTeacher) return NextResponse.json({ success: false, error: "Classroom teacher access required." }, { status: 403 });
  const loaded = await getAssignment(user.id, classId, assignmentId);
  if (!loaded.success || !loaded.assignment) return NextResponse.json({ success: false, error: "Assignment access denied." }, { status: 403 });
  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId");
  const studentId = url.searchParams.get("studentId");
  if (Boolean(groupId) === Boolean(studentId) || !isUuid(groupId || studentId || "")) return NextResponse.json({ success: false, error: "Choose one student or team." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ success: false, error: "Submission storage is unavailable." }, { status: 503 });
  const { data, error } = await admin.from("classroom_submissions")
    .select("id,status,submitted_at,is_late,student_id,group_id")
    .eq("assignment_id", assignmentId)
    .eq(groupId ? "group_id" : "student_id", groupId || studentId!)
    .in("status", ["submitted", "graded", "returned"])
    .order("submitted_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ success: false, error: "Could not load submitted work." }, { status: 500 });
  return NextResponse.json({ success: true, submissions: (data || []).map(row => ({ id: row.id, status: row.status, submittedAt: row.submitted_at, isLate: row.is_late })), assignment: { language: loaded.assignment.language, maxPoints: loaded.assignment.maxPoints } });
}
