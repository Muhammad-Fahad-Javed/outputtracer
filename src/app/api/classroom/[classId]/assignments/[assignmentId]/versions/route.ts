/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/versions
 *   Save a new code version (student draft autosave or explicit save).
 *
 * GET /api/classroom/[classId]/assignments/[assignmentId]/versions
 *   List all versions for the calling student.
 *   Teachers can pass ?studentId=<id> to view any student's history.
 *
 * GET /api/classroom/[classId]/assignments/[assignmentId]/versions?diff=v1Id,v2Id
 *   Compute and return a code diff between two version IDs.
 */

import { NextResponse } from "next/server";
import { studentEditDenial } from "@/lib/classroom/assignmentPolicy";
import { actorForClassroomRequest } from "@/lib/classroom/classroomActor";
import { loadCanonicalClassroomFiles } from "@/lib/classroom/classroomRun";
import { resolveClassroomDocument } from "@/lib/classroom/documents";
import { LOCAL_PREVIEW_STUDENT_ID } from "@/lib/classroom/localTeacherPreview";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { canReadHistory } from "@/lib/classroom/historyAccess";
import { getClassroom, getAssignment, listCallerGroupIds } from "@/lib/classroom/classroomService";
import {
  saveCodeVersion,
  listCodeVersions,
  getCodeVersion,
  computeVersionDiff,
  recordActivityEvent,
} from "@/lib/classroom/versioningService";
import { inspectSourceFiles } from "@/lib/sourceFiles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const user = await classroomRequestUser();

  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  const assignmentAccess = await getAssignment(user.id, classId, assignmentId);
  if (!assignmentAccess.success) return NextResponse.json({ success: false, error: "Assignment access denied." }, { status: 403 });
  const historyAccess = {
    actorId: user.id, assignmentId, isTeacher: Boolean(access.isTeacher),
    groupIds: access.isTeacher ? [] : await listCallerGroupIds(user.id, classId, assignmentId),
  };

  const url = new URL(request.url);
  const diffParam = url.searchParams.get("diff");
  const targetStudentId = url.searchParams.get("studentId");

  // Diff mode
  if (diffParam) {
    const ids = diffParam.split(",");
    if (ids.length !== 2 || ids.some(id => !id || id.length > 100)) return NextResponse.json({ error: "Provide two version IDs." }, { status: 400 });
    const [v1Id, v2Id] = ids;
    const [v1, v2] = await Promise.all([getCodeVersion(v1Id), getCodeVersion(v2Id)]);
    if (!v1 || !v2) return NextResponse.json({ success: false, error: "One or both version IDs not found." }, { status: 404 });

    if (![v1, v2].every(version => canReadHistory(historyAccess, version))) {
      return NextResponse.json({ success: false, error: "Access denied." }, { status: 403 });
    }

    const diff = computeVersionDiff(v1, v2);
    return NextResponse.json({ success: true, diff });
  }

  // List mode
  const ownerId = access.isTeacher && targetStudentId ? targetStudentId : user.id;
  const versions = await listCodeVersions(assignmentId, ownerId);

  return NextResponse.json({ success: true, versions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const user = await classroomRequestUser();

  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  let body: { groupId?: string; studentId?: string; previewStudent?: boolean } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed;
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

  const resolved = await resolveClassroomDocument({
    actorId: actor.actorId,
    classroomId: classId,
    assignmentId,
    isTeacher: actor.isTeacher,
    groupId: typeof body.groupId === "string" ? body.groupId : undefined,
    studentId: typeof body.studentId === "string" ? body.studentId : undefined,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error, code: resolved.code },
      { status: resolved.status }
    );
  }
  if (!actor.isTeacher) {
    const denial = studentEditDenial(resolved.doc);
    if (denial) {
      return NextResponse.json({ success: false, error: denial.error, code: denial.code }, { status: denial.status });
    }
  }

  const files = await loadCanonicalClassroomFiles(resolved.doc);
  const inspected = inspectSourceFiles(files, { maxFiles: 16, maxSourceBytes: 200 * 1024 }, resolved.doc.language);
  if (!inspected.ok) {
    return NextResponse.json({ success: false, error: inspected.message }, { status: 400 });
  }

  const version = await saveCodeVersion({
    assignmentId,
    codeFiles: files,
    language: resolved.doc.language,
    studentId: resolved.doc.groupId ? undefined : resolved.doc.studentId,
    groupId: resolved.doc.groupId,
  });

  // Record save activity (fire-and-forget)
  void recordActivityEvent({
    assignmentId,
    actorId: actor.actorId,
    eventType: "save",
    versionId: version.id,
    metadata: { versionNumber: version.versionNumber, language: version.language },
  });

  return NextResponse.json({ success: true, version });
}
