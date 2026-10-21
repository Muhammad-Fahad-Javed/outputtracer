import { NextResponse } from "next/server";
import {
  createClassroom,
  listUserClassrooms,
} from "@/lib/classroom/classroomService";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { CreateClassroomInput } from "@/lib/classroom/types";

export async function GET() {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const [classrooms, capabilities] = await Promise.all([
    listUserClassrooms(user.id),
    getUserCapabilities(user.id),
  ]);

  return NextResponse.json({
    success: true,
    teaching: classrooms.teaching,
    enrolled: classrooms.enrolled,
    capabilities,
    localPreview: isLocalPreviewActor(user),
  });
}

export async function POST(request: Request) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  let body: CreateClassroomInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await createClassroom(user.id, body);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating classroom" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    classroom: result.classroom,
    message: "Classroom created successfully.",
  });
}
