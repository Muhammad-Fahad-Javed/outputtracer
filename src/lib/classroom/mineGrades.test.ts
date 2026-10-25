import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: true, access: true, calls: [] as unknown[][],
  grade: null as null | { snapshotId: string; totalPoints: number; maxPoints: number; gradedAt: string },
  snapshot: { id: "latest-snapshot" } as { id: string } | null,
  row: { id: "submission", status: "submitted", code_files: { "main.asm": "org 100h" }, submitted_at: "2026-10-26", is_late: false, grade: 99, graded_at: "old-legacy-date", feedback: "Existing feedback" },
}));
vi.mock("./requestUser", () => ({ classroomRequestUser: async () => state.user ? { id: "student" } : null }));
vi.mock("./classroomService", () => ({ getClassroom: async () => ({ success: state.access }), assignmentBelongsToClassroom: async () => true, listCallerGroupIds: async () => [] }));
vi.mock("./gradingService", () => ({ getGrade: async () => state.grade }));
vi.mock("./versioningService", () => ({ getSubmissionSnapshot: async () => state.snapshot }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from(table: string) {
  state.calls.push(["from", table]);
  const query = { select() { return query; }, eq(column: string, value: string) { state.calls.push(["eq", column, value]); return query; }, maybeSingle: async () => ({ data: state.row, error: null }) };
  return query;
} }) }));
import { GET } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/mine/route";
function request() { return GET(new Request("http://localhost/mine"), { params: Promise.resolve({ classId: "class", assignmentId: "assignment" }) }); }
beforeEach(() => { state.user = true; state.access = true; state.calls = []; state.grade = null; state.snapshot = { id: "latest-snapshot" }; state.row.status = "submitted"; });
describe("student submission marks use the canonical graded snapshot", () => {
  it("shows a newly saved manual grade on reload with its actual maximum", async () => {
    state.grade = { snapshotId: "latest-snapshot", totalPoints: 42, maxPoints: 60, gradedAt: "2026-10-26T12:00:00Z" };
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).submission).toMatchObject({ grade: 42, maxPoints: 60, gradedAt: "2026-10-26T12:00:00Z", status: "graded", feedback: "Existing feedback" });
    expect(state.calls).toContainEqual(["eq", "assignment_id", "assignment"]);
    expect(state.calls).toContainEqual(["eq", "student_id", "student"]);
  });
  it("hides an earlier hand-in's marks after resubmission", async () => {
    state.grade = { snapshotId: "older-snapshot", totalPoints: 42, maxPoints: 60, gradedAt: "old-canonical-date" };
    state.row.status = "graded";
    expect((await (await request()).json()).submission).toMatchObject({ grade: null, maxPoints: null, gradedAt: null, status: "submitted" });
  });
  it("does not substitute stale legacy marks when no canonical grade exists", async () => {
    expect((await (await request()).json()).submission).toMatchObject({ grade: null, maxPoints: null, gradedAt: null, status: "submitted" });
  });
  it("requires the immutable snapshot before showing marks", async () => {
    state.grade = { snapshotId: "latest-snapshot", totalPoints: 42, maxPoints: 60, gradedAt: "now" };
    state.snapshot = null;
    expect((await (await request()).json()).submission.grade).toBeNull();
  });
  it("retains the teacher's returned status for the current graded hand-in", async () => {
    state.row.status = "returned";
    state.grade = { snapshotId: "latest-snapshot", totalPoints: 0, maxPoints: 60, gradedAt: "now" };
    expect((await (await request()).json()).submission).toMatchObject({ grade: 0, maxPoints: 60, status: "returned" });
  });
  it("denies missing classroom access before querying grades or submissions", async () => {
    state.access = false;
    expect((await request()).status).toBe(403);
    expect(state.calls).toEqual([]);
  });
});
