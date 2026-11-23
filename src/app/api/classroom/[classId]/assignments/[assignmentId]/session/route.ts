import { NextResponse } from "next/server";
import { signClassroomCollabToken } from "@/lib/classroom/collabToken";
import { loadCanonicalClassroomFiles } from "@/lib/classroom/classroomRun";
import { resolveClassroomDocument } from "@/lib/classroom/documents";
import { LOCAL_PREVIEW_STUDENT_ID } from "@/lib/classroom/localTeacherPreview";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { listClassroomRoster } from "@/lib/classroom/classroomService";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHub } from "@/lib/cloud/collabHub";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const user = await classroomRequestUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const { classId, assignmentId } = await params;
  let body: { groupId?: string; studentId?: string; previewStudent?: boolean; includePreview?: boolean; editableBootstrap?: boolean } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    body = {};
  }

  const preview = body.previewStudent === true;
  if (preview && !isLocalPreviewActor(user)) {
    return NextResponse.json({ success: false, error: "Preview is not available." }, { status: 403 });
  }
  const actorId = preview ? LOCAL_PREVIEW_STUDENT_ID : user.id;

  const resolved = await resolveClassroomDocument({
    actorId,
    classroomId: classId,
    assignmentId,
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
  const bootstrap = body.editableBootstrap === true && resolved.doc.role === "editor";
  const previewJob = bootstrap
    ? getHub().prepareClassroomEdit(resolved.doc).then(initialState => ({ initialState }))
    : body.includePreview === false
      ? Promise.resolve({})
      : loadCanonicalClassroomFiles(resolved.doc).then(files => ({ files }));
  const [previewData, name] = await Promise.all([
    previewJob.catch(() => null),
    admin
      ? admin.from("profiles").select("display_name").eq("id", actorId).maybeSingle().then(({ data }) => data?.display_name)
      : listClassroomRoster(user.id, classId).then(roster => roster.members?.find(member => member.userId === actorId)?.displayName),
  ]);
  if (!previewData) return NextResponse.json({ success: false, error: "Could not load saved code. Retrying…" }, { status: 503 });
  const roleLabel = resolved.doc.instructorView ? (resolved.doc.isAdmin ? "Administrator" : "Teacher") : "Student";
  const displayName = name || roleLabel;
  const token = signClassroomCollabToken({
    userId: actorId,
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
    ...previewData,
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
    userId: actorId,
  });
}
