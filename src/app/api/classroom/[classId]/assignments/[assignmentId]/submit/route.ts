/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/submit
 *
 * Formally submits the shared document. Students cannot submit while the
 * assignment is frozen. Hidden tests are not read here.
 */

import { NextResponse } from "next/server";
import { actorForClassroomRequest } from "@/lib/classroom/classroomActor";
import { isPastDue, studentEditDenial } from "@/lib/classroom/assignmentPolicy";
import { loadCanonicalClassroomFiles } from "@/lib/classroom/classroomRun";
import { resolveClassroomDocument } from "@/lib/classroom/documents";
import { createSubmissionSnapshot } from "@/lib/classroom/gradingService";
import { LOCAL_PREVIEW_STUDENT_ID } from "@/lib/classroom/localTeacherPreview";
import { classroomRequestUser, isLocalPreviewActor } from "@/lib/classroom/requestUser";
import { saveMemorySubmission } from "@/lib/classroom/submissionMemory";
import {
  assignmentBelongsToClassroom,
  getClassroom,
} from "@/lib/classroom/classroomService";
import { recordActivityEvent, saveCodeVersion } from "@/lib/classroom/versioningService";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { inspectSourceFiles } from "@/lib/sourceFiles";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const user = await classroomRequestUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

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
  if (actor.isTeacher) {
    return NextResponse.json({ success: false, error: "Teachers do not submit this assignment." }, { status: 403 });
  }

  const resolved = await resolveClassroomDocument({
    actorId: actor.actorId,
    classroomId: classId,
    assignmentId,
    isTeacher: false,
    groupId: typeof body.groupId === "string" ? body.groupId : undefined,
    studentId: typeof body.studentId === "string" ? body.studentId : undefined,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error, code: resolved.code },
      { status: resolved.status }
    );
  }
  const denial = studentEditDenial(resolved.doc);
  if (denial) {
    return NextResponse.json({ success: false, error: denial.error, code: denial.code }, { status: denial.status });
  }

  const files = await loadCanonicalClassroomFiles(resolved.doc);
  const inspected = inspectSourceFiles(files, { maxFiles: 16, maxSourceBytes: 200 * 1024 }, resolved.doc.language);
  if (!inspected.ok) {
    return NextResponse.json({ success: false, error: inspected.message }, { status: 400 });
  }

  const groupId = resolved.doc.groupId;
  const studentId = groupId ? undefined : resolved.doc.studentId;
  const isLate = isPastDue(resolved.doc.dueDate);

  const version = await saveCodeVersion({
    assignmentId,
    codeFiles: files,
    language: resolved.doc.language,
    studentId,
    groupId,
  });

  const admin = createAdminClient();
  let submissionId: string;
  if (admin) {
    try {
      const submissionData: Record<string, unknown> = {
        assignment_id: assignmentId,
        status: "submitted",
        code_files: files,
        submitted_at: new Date().toISOString(),
        is_late: isLate,
        updated_at: new Date().toISOString(),
      };
      if (groupId) submissionData.group_id = groupId;
      else submissionData.student_id = studentId;

      const { data, error } = await admin
        .from("classroom_submissions")
        .upsert(submissionData, {
          onConflict: groupId ? "assignment_id,group_id" : "assignment_id,student_id",
        })
        .select("id")
        .single();

      if (error || !data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((error as any)?.message || "Failed to save submission.");
      }
      submissionId = data.id as string;
    } catch (err: unknown) {
      const e = err as Error;
      if (isAuthConfigured()) {
        console.error("Critical submission database persistence failure:", e.message);
        return NextResponse.json({ success: false, error: "Submission could not be saved to durable database." }, { status: 500 });
      }
      submissionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      saveMemorySubmission({
        id: submissionId,
        assignmentId,
        studentId,
        groupId,
        status: "submitted",
        codeFiles: files,
        submittedAt: new Date().toISOString(),
        isLate,
      });
    }
  } else {
    if (isAuthConfigured()) {
      return NextResponse.json({ success: false, error: "Database service client is unavailable." }, { status: 500 });
    }
    submissionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    saveMemorySubmission({
      id: submissionId,
      assignmentId,
      studentId,
      groupId,
      status: "submitted",
      codeFiles: files,
      submittedAt: new Date().toISOString(),
      isLate,
    });
  }

  const snapshot = await createSubmissionSnapshot({
    submissionId,
    versionId: version.id,
    assignmentId,
    studentId,
    groupId,
    codeFiles: files,
    isLate,
  });

  void recordActivityEvent({
    assignmentId,
    actorId: actor.actorId,
    eventType: "submit",
    versionId: version.id,
    submissionId,
    metadata: { isLate, versionNumber: version.versionNumber },
  });

  return NextResponse.json({
    success: true,
    submissionId,
    snapshotId: snapshot.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    isLate,
    contentHash: version.contentHash,
    groupId,
  });
}
