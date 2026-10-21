/**
 * progressReport.test.ts
 *
 * Regression tests for the educator progress report analytics.
 *
 * These cover the rules that were previously wrong and that silently
 * mis-reported a teacher's class:
 *
 * 1. Draft submissions are not completed work and must not raise the
 *    completion rate.
 * 2. A group submission completes the assignment for every member of the
 *    group, not just one submission.
 * 3. The completion rate is capped at 100%.
 * 4. A student whose graded work scored zero still counts towards the class
 *    average (excluding them inflated the average and could report 100% for a
 *    class where most students had scored nothing).
 * 5. A student with no graded work at all has no score to contribute and is
 *    excluded from the class average.
 * 6. Only published assignments form the denominator.
 */

import { describe, it, expect } from "vitest";
import { computeClassroomProgress } from "./adminService";
import type {
  ProgressGradeRow,
  ProgressGroupMemberRow,
  ProgressStudentRow,
  ProgressSubmissionRow,
} from "./adminService";

const S1 = "student-1";
const S2 = "student-2";
const A1 = "assignment-1";
const A2 = "assignment-2";
const G1 = "group-1";

function student(userId: string): ProgressStudentRow {
  return { user_id: userId, display_name: `Student ${userId}`, email: `${userId}@x.test` };
}

function submission(
  id: string,
  assignmentId: string,
  studentId: string | null,
  status: string,
  groupId: string | null = null,
): ProgressSubmissionRow {
  return {
    id,
    assignment_id: assignmentId,
    student_id: studentId,
    group_id: groupId,
    submitted_at: "2026-01-01T00:00:00.000Z",
    status,
  };
}

function grade(submissionId: string, total: number, max = 100): ProgressGradeRow {
  return { submission_id: submissionId, total_points: total, max_points: max };
}

describe("computeClassroomProgress - completion rate", () => {
  it("counts a handed-in submission as one completed student/assignment pair", () => {
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [submission("sub-1", A1, S1, "submitted")],
      grades: [],
      groupMembers: [],
    });
    // 1 of 2 possible pairs completed.
    expect(r.completionRatePercent).toBe(50);
    expect(r.totalSubmissions).toBe(1);
  });

  it("does not count a draft submission as completed work", () => {
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [submission("sub-1", A1, S1, "draft")],
      grades: [],
      groupMembers: [],
    });
    expect(r.completionRatePercent).toBe(0);
    expect(r.totalSubmissions).toBe(0);
  });

  it("counts graded and returned submissions as completed", () => {
    for (const status of ["submitted", "graded", "returned"]) {
      const r = computeClassroomProgress({
        students: [student(S1)],
        assignmentIds: [A1],
        submissions: [submission("sub-1", A1, S1, status)],
        grades: [],
        groupMembers: [],
      });
      expect(r.completionRatePercent).toBe(100);
    }
  });

  it("credits a group submission to every member of the group", () => {
    const members: ProgressGroupMemberRow[] = [
      { group_id: G1, user_id: S1 },
      { group_id: G1, user_id: S2 },
    ];
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [submission("sub-g", A1, null, "submitted", G1)],
      grades: [],
      groupMembers: members,
    });
    // One group submission completes the assignment for both members.
    expect(r.completionRatePercent).toBe(100);
  });

  it("never reports a completion rate above 100%", () => {
    const r = computeClassroomProgress({
      students: [student(S1)],
      assignmentIds: [A1],
      submissions: [
        submission("sub-1", A1, S1, "submitted"),
        submission("sub-2", A1, S1, "graded"),
      ],
      grades: [],
      groupMembers: [],
    });
    expect(r.completionRatePercent).toBe(100);
  });

  it("uses the published assignment count as the denominator", () => {
    // Two students, one published assignment, nothing submitted.
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [],
      grades: [],
      groupMembers: [],
    });
    expect(r.completionRatePercent).toBe(0);

    // Adding a second (published) assignment doubles the possible work.
    const r2 = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1, A2],
      submissions: [submission("sub-1", A1, S1, "submitted")],
      grades: [],
      groupMembers: [],
    });
    expect(r2.completionRatePercent).toBe(25);
  });

  it("returns 0 when there are no students or no assignments", () => {
    expect(
      computeClassroomProgress({
        students: [],
        assignmentIds: [A1],
        submissions: [],
        grades: [],
        groupMembers: [],
      }).completionRatePercent,
    ).toBe(0);

    expect(
      computeClassroomProgress({
        students: [student(S1)],
        assignmentIds: [],
        submissions: [],
        grades: [],
        groupMembers: [],
      }).completionRatePercent,
    ).toBe(0);
  });
});

describe("computeClassroomProgress - class average", () => {
  it("includes a student whose graded work scored zero", () => {
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [
        submission("sub-1", A1, S1, "graded"),
        submission("sub-2", A1, S2, "graded"),
      ],
      grades: [grade("sub-1", 100), grade("sub-2", 0)],
      groupMembers: [],
    });
    // 100% and 0% average to 50%. Excluding the zero would report 100%.
    expect(r.averageClassScorePercent).toBe(50);
    const s2 = r.studentBreakdown.find((s) => s.studentId === S2);
    expect(s2?.averageScorePercent).toBe(0);
    expect(s2?.gradedCount).toBe(1);
  });

  it("excludes a student who has no graded work at all", () => {
    const r = computeClassroomProgress({
      students: [student(S1), student(S2)],
      assignmentIds: [A1],
      submissions: [
        submission("sub-1", A1, S1, "graded"),
        submission("sub-2", A1, S2, "submitted"),
      ],
      grades: [grade("sub-1", 80)],
      groupMembers: [],
    });
    // Only S1 has a score, so the average is 80%, not 40%.
    expect(r.averageClassScorePercent).toBe(80);
    const s2 = r.studentBreakdown.find((s) => s.studentId === S2);
    expect(s2?.gradedCount).toBe(0);
  });

  it("returns 0 when nothing has been graded", () => {
    const r = computeClassroomProgress({
      students: [student(S1)],
      assignmentIds: [A1],
      submissions: [submission("sub-1", A1, S1, "submitted")],
      grades: [],
      groupMembers: [],
    });
    expect(r.averageClassScorePercent).toBe(0);
  });

  it("averages a student's grades rather than summing percentages", () => {
    const r = computeClassroomProgress({
      students: [student(S1)],
      assignmentIds: [A1, A2],
      submissions: [
        submission("sub-1", A1, S1, "graded"),
        submission("sub-2", A2, S1, "graded"),
      ],
      // 50/100 and 100/200 -> 150/300 = 50%
      grades: [grade("sub-1", 50, 100), grade("sub-2", 100, 200)],
      groupMembers: [],
    });
    expect(r.studentBreakdown[0].averageScorePercent).toBe(50);
    expect(r.averageClassScorePercent).toBe(50);
  });
});

describe("computeClassroomProgress - per student breakdown", () => {
  it("reports submissions, graded count and the most recent activity", () => {
    const r = computeClassroomProgress({
      students: [student(S1)],
      assignmentIds: [A1, A2],
      submissions: [
        {
          id: "sub-1",
          assignment_id: A1,
          student_id: S1,
          group_id: null,
          submitted_at: "2026-01-01T00:00:00.000Z",
          status: "graded",
        },
        {
          id: "sub-2",
          assignment_id: A2,
          student_id: S1,
          group_id: null,
          submitted_at: "2026-06-01T00:00:00.000Z",
          status: "draft",
        },
      ],
      grades: [grade("sub-1", 90)],
      groupMembers: [],
    });

    const s = r.studentBreakdown[0];
    expect(s.studentId).toBe(S1);
    expect(s.submissionsCount).toBe(2);
    expect(s.gradedCount).toBe(1);
    expect(s.averageScorePercent).toBe(90);
    expect(s.lastActiveAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
