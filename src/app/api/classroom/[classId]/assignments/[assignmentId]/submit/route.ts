/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/submit
 *
 * Formally submits an assignment. This:
 * 1. Creates/updates the classroom_submissions row (status = "submitted")
 * 2. Saves a new code version (the submitted snapshot)
 * 3. Creates an immutable submission_snapshot referencing that version
 * 4. Records a "submit" activity event
 *
 * After submission, code_files in the snapshot are FROZEN.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  assignmentBelongsToClassroom,
  callerCanUseGroup,
  getClassroom,
} from "@/lib/classroom/classroomService";
import {
  saveCodeVersion,
  recordActivityEvent,
} from "@/lib/classroom/versioningService";
import { createSubmissionSnapshot } from "@/lib/classroom/gradingService";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const { classId, assignmentId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: 403 });

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  let body: { codeFiles?: unknown; language?: string; groupId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.codeFiles || typeof body.codeFiles !== "object") {
    return NextResponse.json({ success: false, error: "codeFiles is required." }, { status: 400 });
  }

  const files = body.codeFiles as Record<string, string>;
  const language = typeof body.language === "string" ? body.language : "cpp";
  const groupId = typeof body.groupId === "string" ? body.groupId : undefined;
  if (groupId && !(await callerCanUseGroup(user.id, classId, groupId))) {
    return NextResponse.json({ success: false, error: "You are not a member of that group." }, { status: 403 });
  }

  // Determine lateness
  const admin = createAdminClient();
  let isLate = false;
  if (admin) {
    try {
      const { data: asgn } = await admin
        .from("classroom_assignments")
        .select("due_date, allow_late, is_published")
        .eq("id", assignmentId)
        .single();

      if (!asgn?.is_published) {
        return NextResponse.json({ success: false, error: "Assignment is not published." }, { status: 403 });
      }
      if (asgn.due_date) {
        const due = new Date(asgn.due_date);
        isLate = new Date() > due;
        if (isLate && !asgn.allow_late) {
          return NextResponse.json({ success: false, error: "The submission deadline has passed and late submissions are not allowed." }, { status: 403 });
        }
      }
    } catch {
      // Non-fatal validation error
    }
  }

  // Step 1: Save an immutable code version
  const version = await saveCodeVersion({
    assignmentId,
    codeFiles: files,
    language,
    studentId: groupId ? undefined : user.id,
    groupId,
  });

  // Step 2: Upsert the submission record (one per student per assignment)
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
      if (groupId) {
        submissionData.group_id = groupId;
      } else {
        submissionData.student_id = user.id;
      }

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
      // Fall back to a generated ID for offline unit tests
      submissionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      console.warn("Submission DB write failed, using memory ID for test:", e.message);
    }
  } else {
    if (isAuthConfigured()) {
      return NextResponse.json({ success: false, error: "Database service client is unavailable." }, { status: 500 });
    }
    submissionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // Step 3: Create the immutable snapshot (links submission <-> exact version)
  const snapshot = await createSubmissionSnapshot({
    submissionId,
    versionId: version.id,
    assignmentId,
    studentId: groupId ? undefined : user.id,
    groupId,
    codeFiles: files,
    isLate,
  });

  // Step 4: Record submit event
  void recordActivityEvent({
    assignmentId,
    actorId: user.id,
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
  });
}
