import { NextResponse } from "next/server";
import { actorForClassroomRequest } from "@/lib/classroom/classroomActor";
import { signClassroomCollabToken } from "@/lib/classroom/collabToken";
import { loadCanonicalClassroomFiles } from "@/lib/classroom/classroomRun";
import { resolveClassroomDocument } from "@/lib/classroom/documents";
import { LOCAL_PREVIEW_STUDENT_ID } from "@/lib/classroom/localTeacherPreview";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { getClassroom, listClassroomRoster } from "@/lib/classroom/classroomService";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const { classId, assignmentId } = await params;
  const access = await getClassroom(user.id, classId);
  if (!access.success) {
    return NextResponse.json({ success: false, error: access.error || "Access denied" }, { status: 403 });
  }

  let body: { groupId?: string; studentId?: string; previewStudent?: boolean; includePreview?: boolean } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    body = {};
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

  const admin = createAdminClient();
  const [files, name] = await Promise.all([
    body.includePreview === false ? Promise.resolve(undefined) : loadCanonicalClassroomFiles(resolved.doc),
    admin
      ? admin.from("profiles").select("display_name").eq("id", actor.actorId).maybeSingle().then(({ data }) => data?.display_name)
      : listClassroomRoster(user.id, classId).then(roster => roster.members?.find(member => member.userId === actor.actorId)?.displayName),
  ]);
  const roleLabel = actor.isTeacher ? (access.isAdmin ? "Administrator" : "Teacher") : "Student";
  const displayName = name || roleLabel;
  const token = signClassroomCollabToken({
    userId: actor.actorId,
    displayName,
    classId,
    assignmentId,
    groupId: resolved.doc.groupId,
    studentId: resolved.doc.studentId,
  });

  return NextResponse.json({
    success: true,
    token,
    docKey: resolved.doc.docKey,
    role: resolved.doc.role,
    files,
    frozen: resolved.doc.frozen,
    freezeReason: resolved.doc.freezeReason ?? null,
    allowRun: resolved.doc.allowRun,
    allowTrace: resolved.doc.allowTrace,
    traceEnabled: false,
    timeLimitMs: resolved.doc.timeLimitMs,
    groupId: resolved.doc.groupId,
    studentId: resolved.doc.studentId,
    groupMode: resolved.doc.groupMode,
    displayName,
    userId: actor.actorId,
  });
}
