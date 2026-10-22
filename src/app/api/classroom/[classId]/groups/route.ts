import { NextResponse } from "next/server";
import {
  listClassroomGroups,
  createClassroomGroup,
  assignStudentToGroup,
  removeStudentFromGroup,
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
  const result = await listClassroomGroups(user.id, classId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    groups: result.groups,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;

  let body: { name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await createClassroomGroup(user.id, classId, body.name);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating group" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    group: result.group,
    message: "Group created successfully.",
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;

  let body: { groupId: string; studentUserId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (!body.groupId || !body.studentUserId) {
    return NextResponse.json({ error: "Missing groupId or studentUserId" }, { status: 400 });
  }

  const result = await assignStudentToGroup(user.id, classId, body.groupId, body.studentUserId);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed assigning student to group" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    message: "Student assigned to group successfully.",
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
  const groupId = searchParams.get("groupId");
  const studentUserId = searchParams.get("studentUserId");
  if (!groupId || !studentUserId) {
    return NextResponse.json({ error: "Missing groupId or studentUserId" }, { status: 400 });
  }

  const result = await removeStudentFromGroup(user.id, classId, groupId, studentUserId);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed removing student from group" }, { status: 403 });
  }

  return NextResponse.json({ success: true, message: "Student removed from group." });
}
