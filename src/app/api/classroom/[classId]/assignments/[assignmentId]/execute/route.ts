/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/execute
 *
 * Runs the shared classroom document through the isolated sandbox.
 * Public tests only. Hidden tests are never loaded or returned.
 * Students cannot run when the assignment is frozen or allow_run is false.
 * Teachers can run the current document without becoming editors.
 * Trace is not started from this route.
 */

import { NextResponse } from "next/server";
import { globalRateLimiter, clientIpFromForwarded } from "@/lib/rateLimit";
import { actorForClassroomRequest } from "@/lib/classroom/classroomActor";
import { executeResolvedClassroom } from "@/lib/classroom/classroomRun";
import { LOCAL_PREVIEW_STUDENT_ID } from "@/lib/classroom/localTeacherPreview";
import { isLocalPreviewActor, classroomRequestUser } from "@/lib/classroom/requestUser";
import {
  assignmentBelongsToClassroom,
  getClassroom,
} from "@/lib/classroom/classroomService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;

  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
  );
  const limited = globalRateLimiter.check(`classroom-exec:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const user = await classroomRequestUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  let body: {
    stdin?: string;
    runTests?: boolean;
    groupId?: string;
    studentId?: string;
    previewStudent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const actor = actorForClassroomRequest({
    userId: user.id,
    isTeacher: Boolean(access.isTeacher),
    previewStudent: body.previewStudent === true,
    previewAllowed: isLocalPreviewActor(user),
    previewStudentId: LOCAL_PREVIEW_STUDENT_ID,
  });
  if (actor.error) {
    return NextResponse.json({ success: false, error: actor.error }, { status: 403 });
  }

  const outcome = await executeResolvedClassroom({
    actorId: actor.actorId,
    isTeacher: actor.isTeacher,
    classroomId: classId,
    assignmentId,
    groupId: typeof body.groupId === "string" ? body.groupId : undefined,
    studentId: typeof body.studentId === "string" ? body.studentId : undefined,
    runTests: body.runTests === true,
    stdin: typeof body.stdin === "string" ? body.stdin : "",
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
