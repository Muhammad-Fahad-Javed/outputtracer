/**
 * gradingService.ts
 *
 * Automated and manual grading, rubrics, feedback, and group contribution reports.
 *
 * SECURITY:
 * - Hidden test cases are NEVER returned to callers — only pass/fail counts.
 * - Every grade record references the exact snapshot (versionId) that was graded.
 * - Grading triggers use the isolated executionClient; untrusted code never runs in-process.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { runTestCase } from "./executionClient";
import {
  createSubmissionSnapshot,
  recordActivityEvent,
  recordExecutionLog,
  getSubmissionSnapshot,
} from "./versioningService";
import type {
  AssignmentRubric,
  UpsertRubricInput,
  RubricItem,
  SubmissionGrade,
  GradeInput,
  SubmissionFeedbackItem,
  AddFeedbackInput,
  GroupContributionReport,
  GroupContributionEntry,
} from "./submissionTypes";
import type { AssignmentTestCase } from "./types";

// ==============================================================================
// In-memory stores
// ==============================================================================
const memRubrics = new Map<string, AssignmentRubric>(); // assignmentId -> rubric
const memGrades = new Map<string, SubmissionGrade>(); // submissionId -> grade
const memFeedback = new Map<string, SubmissionFeedbackItem[]>(); // submissionId -> feedback

export function _resetGradingMemory(): void {
  memRubrics.clear();
  memGrades.clear();
  memFeedback.clear();
}

// ==============================================================================
// Rubrics
// ==============================================================================

export async function upsertRubric(
  assignmentId: string,
  input: UpsertRubricInput
): Promise<AssignmentRubric> {
  const items: RubricItem[] = input.items.map((item, i) => ({
    id: item.id ?? `item-${i}-${Date.now()}`,
    description: item.description,
    maxPoints: item.maxPoints,
  }));

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("assignment_rubrics")
        .upsert({ assignment_id: assignmentId, items, updated_at: new Date().toISOString() }, { onConflict: "assignment_id" })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return { id: d.id, assignmentId: d.assignment_id, items: d.items as RubricItem[], createdAt: d.created_at, updatedAt: d.updated_at };
      }
    } catch {
      // Fall through
    }
  }

  const rubric: AssignmentRubric = {
    id: `rubric-${Date.now()}`,
    assignmentId,
    items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memRubrics.set(assignmentId, rubric);
  return rubric;
}

export async function getRubric(assignmentId: string): Promise<AssignmentRubric | null> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("assignment_rubrics")
        .select("*")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        return { id: d.id, assignmentId: d.assignment_id, items: d.items as RubricItem[], createdAt: d.created_at, updatedAt: d.updated_at };
      }
    } catch {
      // Fall through
    }
  }
  return memRubrics.get(assignmentId) ?? null;
}

// ==============================================================================
// Automated Grading (runs public + hidden tests against the frozen snapshot)
// ==============================================================================

/**
 * Runs all test cases (public + hidden) against the frozen submission snapshot.
 * Hidden test definitions are NEVER returned. Only pass/fail counts are stored.
 * Graded result is written with a reference to the exact versionId.
 *
 * @param submissionId  The submission to auto-grade
 * @param teacherId     Who triggered the grading (teacher / system)
 * @param publicTests   Public test cases for the assignment
 * @param hiddenTests   Hidden test cases — processed server-side only
 * @param language      Language for execution
 */
export async function autoGradeSubmission(input: {
  submissionId: string;
  assignmentId: string;
  teacherId: string;
  publicTests: AssignmentTestCase[];
  hiddenTests: AssignmentTestCase[];
  language?: string;
  maxPoints: number;
}): Promise<{ grade: SubmissionGrade; autoTestPoints: number; publicPassed: number; hiddenPassed: number }> {
  // 1. Load the immutable snapshot
  const snapshot = await getSubmissionSnapshot(input.submissionId);
  if (!snapshot) {
    throw new Error(`No submission snapshot found for submission ${input.submissionId}`);
  }

  const files = snapshot.frozenCodeFiles;
  const language = input.language ?? "cpp";
  let publicPassed = 0;
  let hiddenPassed = 0;

  // 2. Run public test cases
  for (const tc of input.publicTests) {
    try {
      const result = await runTestCase(files, language, tc.stdin, tc.expectedOutput);
      if (result.passed) publicPassed++;
    } catch {
      // Execution error = fail
    }
  }

  // 3. Run hidden test cases (server-side only; definitions never leave this function)
  for (const tc of input.hiddenTests) {
    try {
      const result = await runTestCase(files, language, tc.stdin, tc.expectedOutput);
      if (result.passed) hiddenPassed++;
    } catch {
      // Execution error = fail
    }
  }

  // 4. Compute points
  const allTests = input.publicTests.length + input.hiddenTests.length;
  const allPassed = publicPassed + hiddenPassed;
  const autoTestPoints = allTests > 0
    ? Math.round((allPassed / allTests) * input.maxPoints * 10) / 10
    : 0;

  // 5. Record execution log (hidden counts stored server-side only)
  await recordExecutionLog({
    submissionId: input.submissionId,
    assignmentId: input.assignmentId,
    actorId: input.teacherId,
    language,
    stdin: "",
    result: { stdout: "", stderr: "", exitCode: 0, durationMs: 0, timedOut: false },
    publicTestsPassed: publicPassed,
    publicTestsTotal: input.publicTests.length,
    hiddenTestsPassed: hiddenPassed,
    hiddenTestsTotal: input.hiddenTests.length,
    runMode: "auto_grade",
  });

  // 6. Write grade referencing the exact versionId from the snapshot
  const grade = await writeGrade({
    submissionId: input.submissionId,
    snapshotId: snapshot.id,
    versionId: snapshot.versionId, // ← exact version reference
    autoTestPoints,
    manualPoints: 0,
    totalPoints: autoTestPoints,
    maxPoints: input.maxPoints,
    gradedBy: input.teacherId,
    gradeMode: "auto",
    rubricScores: {},
  });

  // 7. Record grading activity
  await recordActivityEvent({
    assignmentId: input.assignmentId,
    actorId: input.teacherId,
    eventType: "grade",
    submissionId: input.submissionId,
    metadata: { autoTestPoints, publicPassed, publicTotal: input.publicTests.length, gradeMode: "auto" },
  });

  return { grade, autoTestPoints, publicPassed, hiddenPassed };
}

// ==============================================================================
// Manual Grading
// ==============================================================================

/**
 * Applies a manual grade (rubric scores + manual points) to a submission.
 * Grade is always linked to the exact versionId from the submission snapshot.
 */
export async function manualGradeSubmission(
  teacherId: string,
  input: GradeInput
): Promise<SubmissionGrade> {
  const snapshot = await getSubmissionSnapshot(input.submissionId);
  if (!snapshot) {
    throw new Error(`No submission snapshot found for submission ${input.submissionId}`);
  }

  // Load existing grade if any (for auto test points)
  const existing = await getGrade(input.submissionId);
  const autoTestPoints = existing?.autoTestPoints ?? 0;

  // Sum rubric scores
  const rubricTotal = Object.values(input.rubricScores ?? {}).reduce((s, p) => s + p, 0);
  const manualPoints = input.manualPoints ?? rubricTotal;
  const totalPoints = autoTestPoints + manualPoints;

  const grade = await writeGrade({
    submissionId: input.submissionId,
    snapshotId: snapshot.id,
    versionId: snapshot.versionId,
    autoTestPoints,
    manualPoints,
    totalPoints,
    maxPoints: existing?.maxPoints ?? 100,
    gradedBy: teacherId,
    gradeMode: input.gradeMode ?? (autoTestPoints > 0 ? "mixed" : "manual"),
    rubricScores: input.rubricScores ?? {},
  });

  await recordActivityEvent({
    assignmentId: snapshot.assignmentId,
    actorId: teacherId,
    eventType: "grade",
    submissionId: input.submissionId,
    metadata: { totalPoints, manualPoints, gradeMode: grade.gradeMode },
  });

  return grade;
}

async function writeGrade(input: {
  submissionId: string;
  snapshotId: string;
  versionId: string;
  autoTestPoints: number;
  manualPoints: number;
  totalPoints: number;
  maxPoints: number;
  gradedBy: string;
  gradeMode: "auto" | "manual" | "mixed";
  rubricScores: Record<string, number>;
}): Promise<SubmissionGrade> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("submission_grades")
        .upsert(
          {
            submission_id: input.submissionId,
            snapshot_id: input.snapshotId,
            version_id: input.versionId,
            rubric_scores: input.rubricScores,
            auto_test_points: input.autoTestPoints,
            manual_points: input.manualPoints,
            total_points: input.totalPoints,
            max_points: input.maxPoints,
            graded_by: input.gradedBy,
            grade_mode: input.gradeMode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "submission_id" }
        )
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mapGrade(data as any);
      }
    } catch {
      // Fall through
    }
  }

  const grade: SubmissionGrade = {
    id: `grade-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    submissionId: input.submissionId,
    snapshotId: input.snapshotId,
    versionId: input.versionId,
    rubricScores: input.rubricScores,
    autoTestPoints: input.autoTestPoints,
    manualPoints: input.manualPoints,
    totalPoints: input.totalPoints,
    maxPoints: input.maxPoints,
    gradedBy: input.gradedBy,
    gradeMode: input.gradeMode,
    gradedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memGrades.set(input.submissionId, grade);
  return grade;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGrade(d: any): SubmissionGrade {
  return {
    id: d.id,
    submissionId: d.submission_id,
    snapshotId: d.snapshot_id,
    versionId: d.version_id,
    rubricScores: d.rubric_scores ?? {},
    autoTestPoints: d.auto_test_points,
    manualPoints: d.manual_points,
    totalPoints: d.total_points,
    maxPoints: d.max_points,
    gradedBy: d.graded_by,
    gradeMode: d.grade_mode,
    gradedAt: d.graded_at,
    updatedAt: d.updated_at,
  };
}

export async function getGrade(submissionId: string): Promise<SubmissionGrade | null> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("submission_grades")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle();
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mapGrade(data as any);
      }
    } catch {
      // Fall through
    }
  }
  return memGrades.get(submissionId) ?? null;
}

// ==============================================================================
// Feedback
// ==============================================================================

export async function addFeedback(
  submissionId: string,
  teacherId: string,
  input: AddFeedbackInput
): Promise<SubmissionFeedbackItem> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from("submission_feedback")
        .insert({
          submission_id: submissionId,
          teacher_id: teacherId,
          comment: input.comment,
          file_name: input.fileName ?? null,
          line_number: input.lineNumber ?? null,
          is_private: input.isPrivate ?? false,
        })
        .select()
        .single();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mapFeedback(data as any);
      }
    } catch {
      // Fall through
    }
  }

  const item: SubmissionFeedbackItem = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    submissionId,
    teacherId,
    comment: input.comment,
    fileName: input.fileName,
    lineNumber: input.lineNumber,
    isPrivate: input.isPrivate ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existing = memFeedback.get(submissionId) ?? [];
  memFeedback.set(submissionId, [...existing, item]);

  await recordActivityEvent({
    assignmentId: "", // enriched by caller if needed
    actorId: teacherId,
    eventType: "feedback",
    submissionId,
    metadata: { isPrivate: item.isPrivate },
  });

  return item;
}

export async function listFeedback(
  submissionId: string,
  isTeacher: boolean
): Promise<SubmissionFeedbackItem[]> {
  const admin = createAdminClient();
  if (admin) {
    try {
      let q = admin
        .from("submission_feedback")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true });

      if (!isTeacher) q = q.eq("is_private", false);

      const { data, error } = await q;
      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data as any[]).map(mapFeedback);
      }
    } catch {
      // Fall through
    }
  }

  const all = memFeedback.get(submissionId) ?? [];
  return isTeacher ? all : all.filter((f) => !f.isPrivate);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeedback(d: any): SubmissionFeedbackItem {
  return {
    id: d.id,
    submissionId: d.submission_id,
    teacherId: d.teacher_id,
    comment: d.comment,
    fileName: d.file_name ?? undefined,
    lineNumber: d.line_number ?? undefined,
    isPrivate: d.is_private,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

// ==============================================================================
// Group Contribution Reports (aggregated from activity events)
// ==============================================================================

/**
 * Computes group contribution stats from activity events.
 * This is computed at report time from stored events — not run-time data.
 */
export async function computeGroupContributionReport(
  submissionId: string,
  groupId: string,
  assignmentId: string,
  memberIds: string[]
): Promise<GroupContributionReport> {
  const now = new Date().toISOString();

  // Load all events for this assignment/group
  const admin = createAdminClient();
  let rawEvents: Array<{ actorId: string; eventType: string; createdAt: string }> = [];

  if (admin) {
    try {
      const { data } = await admin
        .from("assignment_activity_events")
        .select("actor_id, event_type, created_at")
        .eq("assignment_id", assignmentId)
        .in("actor_id", memberIds);

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawEvents = (data as any[]).map((d) => ({
          actorId: d.actor_id as string,
          eventType: d.event_type as string,
          createdAt: d.created_at as string,
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: compute from memory events
  if (rawEvents.length === 0) {
    const { listActivityEvents } = await import("./versioningService");
    const events = await listActivityEvents(assignmentId);
    rawEvents = events
      .filter((e) => memberIds.includes(e.actorId))
      .map((e) => ({ actorId: e.actorId, eventType: e.eventType, createdAt: e.createdAt }));
  }

  // Aggregate per student
  const statsMap = new Map<string, { save: number; run: number; total: number; lastActive: string }>();
  for (const memberId of memberIds) {
    statsMap.set(memberId, { save: 0, run: 0, total: 0, lastActive: "" });
  }

  for (const event of rawEvents) {
    const stats = statsMap.get(event.actorId);
    if (!stats) continue;
    stats.total++;
    if (event.eventType === "save") stats.save++;
    if (event.eventType === "run") stats.run++;
    if (!stats.lastActive || event.createdAt > stats.lastActive) {
      stats.lastActive = event.createdAt;
    }
  }

  const contributions: GroupContributionEntry[] = memberIds.map((id) => {
    const s = statsMap.get(id)!;
    return {
      studentId: id,
      saveEventCount: s.save,
      runEventCount: s.run,
      totalEventCount: s.total,
      lastActiveAt: s.lastActive || undefined,
    };
  });

  // Persist to DB
  if (admin) {
    try {
      for (const entry of contributions) {
        await admin.from("group_contribution_reports").upsert(
          {
            submission_id: submissionId,
            group_id: groupId,
            student_id: entry.studentId,
            save_event_count: entry.saveEventCount,
            run_event_count: entry.runEventCount,
            total_event_count: entry.totalEventCount,
            last_active_at: entry.lastActiveAt ?? null,
            computed_at: now,
          },
          { onConflict: "submission_id,student_id" }
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return { submissionId, groupId, computedAt: now, contributions };
}

// Re-export snapshot helpers used by submit route
export { createSubmissionSnapshot, getSubmissionSnapshot };
