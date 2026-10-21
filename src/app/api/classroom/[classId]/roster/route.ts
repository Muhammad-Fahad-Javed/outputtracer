import { NextResponse } from "next/server";
import {
  listClassroomRoster,
  removeClassroomMember,
} from "@/lib/classroom/classroomService";
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
  const result = await listClassroomRoster(user.id, classId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    members: result.members,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");

  if (!targetUserId) {
    return NextResponse.json({ error: "Missing target userId" }, { status: 400 });
  }

  const result = await removeClassroomMember(user.id, classId, targetUserId);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed removing member" }, { status: 403 });
  }

  return NextResponse.json({ success: true, message: "Member removed from classroom." });
}
