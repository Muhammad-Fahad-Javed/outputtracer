import { NextResponse } from "next/server";
import {
  listAssignments,
  createAssignment,
} from "@/lib/classroom/classroomService";
import { classroomRequestUser } from "@/lib/classroom/requestUser";
import { CreateAssignmentInput } from "@/lib/classroom/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const user = await classroomRequestUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Sign in required." }, { status: 401 });
  }

  const { classId } = await params;
  const result = await listAssignments(user.id, classId);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    assignments: result.assignments,
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

  let body: CreateAssignmentInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const result = await createAssignment(user.id, classId, body);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed creating assignment" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    assignment: result.assignment,
    message: "Assignment created successfully.",
  });
}
