import { NextResponse } from "next/server";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { getAssignment, updateAssignmentPolicy } from "@/lib/classroom/classroomService";
import { recordAdminAudit } from "@/lib/classroom/adminService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId, assignmentId } = await params;
  const result = await getAssignment(user.id, classId, assignmentId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Assignment not found" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    assignment: result.assignment,
    isTeacher: result.isTeacher,
    isAdmin: result.isAdmin,
    localPreview: isLocalPreviewActor(user),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId, assignmentId } = await params;
  let body: {
    title?: string;
    description?: string;
    dueDate?: string | null;
    isPublished?: boolean;
    locked?: boolean;
    allowLate?: boolean;
    allowRun?: boolean;
    allowTrace?: boolean;
    timeLimitMs?: number;
    inputPolicy?: "typing_only" | "paste_allowed";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await updateAssignmentPolicy(user.id, classId, assignmentId, body);
  if (!result.success) {
    const status = (result.error || "").toLowerCase().includes("not found") ? 404 : 403;
    return NextResponse.json({ success: false, error: result.error }, { status });
  }

  if (result.isAdmin) await recordAdminAudit(user.id, "admin_assignment_updated", "classroom_assignment", assignmentId, { classroomId: classId });
  return NextResponse.json({ success: true, assignment: result.assignment });
}
