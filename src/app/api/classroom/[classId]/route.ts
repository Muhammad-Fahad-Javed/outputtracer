import { NextResponse } from "next/server";
import { getClassroom, updateClassroomDetails } from "@/lib/classroom/classroomService";
import { recordAdminAudit } from "@/lib/classroom/adminService";
import { classroomRequestUser } from "@/lib/classroom/requestUser";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;
  const result = await getClassroom(user.id, classId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Classroom not found" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    classroom: result.classroom,
    isTeacher: result.isTeacher,
    isAdmin: result.isAdmin,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const user = await classroomRequestUser();
  if (!user) return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  const { classId } = await params;
  const fields = await request.json().catch(() => null);
  const result = await updateClassroomDetails(user.id, classId, fields);
  if (!result.success) return NextResponse.json(result, { status: 403 });
  if (result.isAdmin) await recordAdminAudit(user.id, "admin_classroom_details_updated", "classroom", classId, {});
  return NextResponse.json(result);
}
