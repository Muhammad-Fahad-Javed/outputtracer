import { NextResponse } from "next/server";
import { getClassroom } from "@/lib/classroom/classroomService";
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
  });
}
