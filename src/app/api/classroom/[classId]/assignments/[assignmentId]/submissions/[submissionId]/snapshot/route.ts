import { projectSnapshotView } from "@/lib/classroom/projectSnapshot";
/**
 * GET /api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/snapshot
 *   Returns the immutable submission snapshot. Students see their own; teachers see any.
 *   The frozen_code_files field confirms exactly what was submitted.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { canReadHistory } from "@/lib/classroom/historyAccess";
import { getClassroom, getAssignment, listCallerGroupIds } from "@/lib/classroom/classroomService";
import { getSubmissionSnapshot } from "@/lib/classroom/versioningService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string; submissionId: string }> }
) {
  const { classId, assignmentId, submissionId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  const assignmentAccess = await getAssignment(user.id, classId, assignmentId);
  if (!assignmentAccess.success) return NextResponse.json({ success: false, error: "Assignment access denied." }, { status: 403 });
  const snapshot = await getSubmissionSnapshot(submissionId);
  if (!snapshot) return NextResponse.json({ success: false, error: "Snapshot not found." }, { status: 404 });

  // Students can only see their own snapshot
  if (!canReadHistory({
    actorId: user.id, assignmentId, isTeacher: Boolean(access.isTeacher),
    groupIds: access.isTeacher ? [] : await listCallerGroupIds(user.id, classId, assignmentId),
  }, snapshot)) {
    return NextResponse.json({ success: false, error: "Access denied." }, { status: 403 });
  }

  const view = projectSnapshotView(snapshot.frozenCodeFiles);
  return NextResponse.json({ success: true, snapshot: { ...snapshot, frozenCodeFiles: view.files, inputAssets: view.inputAssets, contentHashScope: view.contentHashScope } });
}
