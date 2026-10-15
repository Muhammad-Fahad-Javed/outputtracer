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
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getClassroom } from "@/lib/classroom/classroomService";
import {
  saveCodeVersion,
  listCodeVersions,
  getCodeVersion,
  computeVersionDiff,
  recordActivityEvent,
} from "@/lib/classroom/versioningService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(classId, user.id);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  const url = new URL(request.url);
  const diffParam = url.searchParams.get("diff");
  const targetStudentId = url.searchParams.get("studentId");

  // Diff mode
  if (diffParam) {
    const [v1Id, v2Id] = diffParam.split(",");
    const [v1, v2] = await Promise.all([getCodeVersion(v1Id), getCodeVersion(v2Id)]);
    if (!v1 || !v2) return NextResponse.json({ success: false, error: "One or both version IDs not found." }, { status: 404 });

    // Access check: student can only diff their own versions
    if (!access.isTeacher) {
      if (v1.studentId !== user.id && v1.groupId == null) return NextResponse.json({ success: false, error: "Access denied." }, { status: 403 });
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
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(classId, user.id);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  let body: { codeFiles?: unknown; language?: string; groupId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 }); }

  if (!body.codeFiles || typeof body.codeFiles !== "object") {
    return NextResponse.json({ success: false, error: "codeFiles is required and must be an object." }, { status: 400 });
  }

  const version = await saveCodeVersion({
    assignmentId,
    codeFiles: body.codeFiles as Record<string, string>,
    language: typeof body.language === "string" ? body.language : "cpp",
    studentId: body.groupId ? undefined : user.id,
    groupId: typeof body.groupId === "string" ? body.groupId : undefined,
  });

  // Record save activity (fire-and-forget)
  void recordActivityEvent({
    assignmentId,
    actorId: user.id,
    eventType: "save",
    versionId: version.id,
    metadata: { versionNumber: version.versionNumber, language: version.language },
  });

  return NextResponse.json({ success: true, version });
}
