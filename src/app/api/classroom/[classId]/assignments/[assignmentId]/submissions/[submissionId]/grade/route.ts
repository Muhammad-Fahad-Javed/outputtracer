import { canAccessSubmission } from "@/lib/classroom/historyAccess";
/**
 * POST /api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/grade
 *   Apply or update a grade for a submission (teacher only).
 *   Supports both auto-grading (runs hidden tests server-side) and manual rubric scoring.
 *
 * GET /api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/grade
 *   Get the grade for a submission.
 *   Teachers see full detail including hidden test counts.
 *   Students see total_points, max_points, and auto_test_points only (no hidden test details).
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { assignmentBelongsToClassroom, getClassroom, getAssignment } from "@/lib/classroom/classroomService";
import { autoGradeSubmission, manualGradeSubmission, getGrade } from "@/lib/classroom/gradingService";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssignmentTestCase } from "@/lib/classroom/types";
import type { GradeInput } from "@/lib/classroom/submissionTypes";

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

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  if (!(await canAccessSubmission({ actorId: user.id, classroomId: classId,
    assignmentId, submissionId, isTeacher: Boolean(access.isTeacher) }))) {
    return NextResponse.json({ success: false, error: "Submission access denied." }, { status: 403 });
  }

  const grade = await getGrade(submissionId);
  if (!grade) return NextResponse.json({ success: true, grade: null });

  // Students see a restricted view — no versionId or grader details
  if (!access.isTeacher) {
    return NextResponse.json({
      success: true,
      grade: {
        totalPoints: grade.totalPoints,
        maxPoints: grade.maxPoints,
        autoTestPoints: grade.autoTestPoints,
        manualPoints: grade.manualPoints,
        rubricScores: grade.rubricScores,
        gradeMode: grade.gradeMode,
        gradedAt: grade.gradedAt,
      },
    });
  }

  // Teachers see the full grade including the exact version reference
  return NextResponse.json({ success: true, grade });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classId: string; assignmentId: string; submissionId: string }> }
) {
  const { classId, assignmentId, submissionId } = await params;
  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const access = await getClassroom(user.id, classId);
  if (!access.success || !access.isTeacher) {
    return NextResponse.json({ success: false, error: "Teacher access required." }, { status: 403 });
  }

  if (!(await assignmentBelongsToClassroom(classId, assignmentId))) {
    return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });
  }

  if (!(await canAccessSubmission({ actorId: user.id, classroomId: classId,
    assignmentId, submissionId, isTeacher: Boolean(access.isTeacher) }))) {
    return NextResponse.json({ success: false, error: "Submission access denied." }, { status: 403 });
  }

  let body: { mode?: string } & Partial<GradeInput>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Invalid grading request." }, { status: 400 });
  const mode = body.mode ?? "manual";
  if (!["manual", "auto"].includes(mode) || (body.gradeMode !== undefined && !["manual", "mixed"].includes(body.gradeMode))) return NextResponse.json({ success: false, error: "Invalid grading mode." }, { status: 400 });

  if (mode === "auto") {
    // Auto-grading: fetch hidden test cases from DB (server-side only)
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: false, error: "Service configuration error." }, { status: 500 });

    try {
      const { data: asgn } = await admin
        .from("classroom_assignments")
        .select("public_test_cases, hidden_test_cases, max_points, language")
        .eq("id", assignmentId)
        .eq("classroom_id", classId)
        .single();

      if (!asgn) return NextResponse.json({ success: false, error: "Assignment not found." }, { status: 404 });

      if (asgn.language === "asm8086") {
        return NextResponse.json({ success: false, code: "manual_review_required", error: "Browser DOSBox submissions require manual teacher review. Automatic Assembly grading is unavailable." }, { status: 409 });
      }

      const result = await autoGradeSubmission({
        submissionId,
        assignmentId,
        teacherId: user.id,
        publicTests: (asgn.public_test_cases as AssignmentTestCase[]) ?? [],
        hiddenTests: (asgn.hidden_test_cases as AssignmentTestCase[]) ?? [], // never returned to client
        maxPoints: asgn.max_points as number,
        language: asgn.language ?? "cpp",
      });

      // Return hidden test counts to teacher ONLY — not test definitions
      return NextResponse.json({
        success: true,
        grade: result.grade,
        autoTestPoints: result.autoTestPoints,
        publicTestsPassed: result.publicPassed,
        publicTestsTotal: asgn.public_test_cases?.length ?? 0,
        hiddenTestsPassed: result.hiddenPassed,
        hiddenTestsTotal: asgn.hidden_test_cases?.length ?? 0,
      });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
    }
  }

  // Manual grading uses the assignment maximum and the exact reviewed hand-in.
  const assignment = await getAssignment(user.id, classId, assignmentId);
  if (!assignment.success || !assignment.assignment) return NextResponse.json({ success: false, error: "Assignment access denied." }, { status: 403 });
  if (body.expectedSnapshotId !== undefined && (typeof body.expectedSnapshotId !== "string" || !body.expectedSnapshotId || body.expectedSnapshotId.length > 100)) return NextResponse.json({ success: false, error: "Invalid reviewed snapshot." }, { status: 400 });
  try {
    const grade = await manualGradeSubmission(user.id, {
      submissionId,
      expectedSnapshotId: body.expectedSnapshotId,
      maxPoints: assignment.assignment.maxPoints,
      rubricScores: body.rubricScores,
      manualPoints: body.manualPoints,
      gradeMode: body.gradeMode ?? "manual",
    });
    return NextResponse.json({ success: true, grade });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 400 });
  }
}
