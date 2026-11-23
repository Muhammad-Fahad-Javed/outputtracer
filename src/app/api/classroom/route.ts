import { NextResponse } from "next/server";
import {
  createClassroom,
  listUserClassrooms,
} from "@/lib/classroom/classroomService";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { getUserCapabilities } from "@/lib/classroom/roles";
import { CreateClassroomInput } from "@/lib/classroom/types";
import { checkIsAdmin } from "@/lib/learn/db";
import { checkIsVerifiedTeacher } from "@/lib/classroom/roles";
import { recordAdminAudit } from "@/lib/classroom/adminService";
import { isUuid } from "@/lib/cloud/roles";

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

  let body: CreateClassroomInput & { teacherId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (!body || typeof body.name !== "string" ||
    (body.subject !== undefined && typeof body.subject !== "string") ||
    (body.description !== undefined && typeof body.description !== "string")) {
    return NextResponse.json({ error: "Enter valid classroom details." }, { status: 400 });
  }
  let ownerId = user.id;
  if (body.teacherId !== undefined) {
    if (!(await checkIsAdmin(user.id))) {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }
    if (typeof body.teacherId !== "string" || !isUuid(body.teacherId) || !(await checkIsVerifiedTeacher(body.teacherId))) {
      return NextResponse.json({ error: "Choose an approved teacher." }, { status: 400 });
    }
    ownerId = body.teacherId;
  }
  const result = await createClassroom(ownerId, body);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating classroom" }, { status: 403 });
  }
  if (body.teacherId && result.classroom) {
    await recordAdminAudit(user.id, "admin_classroom_created", "classroom", result.classroom.id, { teacherId: ownerId });
  }

  return NextResponse.json({
    success: true,
    classroom: result.classroom,
    message: "Classroom created successfully.",
  });
}
