import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
vi.mock("./versioningService", () => ({ getSubmissionSnapshot: async () => ({ id: "snapshot", versionId: "version", assignmentId: "assignment" }), recordActivityEvent: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  let payload: Record<string, unknown> = {};
  const query = {
    upsert(value: Record<string, unknown>) { payload = value; return query; },
    select() { return query; }, eq() { return query; },
    maybeSingle: async () => ({ data: state.row, error: null }),
    single: async () => {
      // PostgreSQL defaults apply only to insertion; an upsert otherwise retains the original timestamp.
      state.row = { id: "grade", graded_at: new Date().toISOString(), ...(state.row || {}), ...payload };
      return { data: state.row, error: null };
    },
  };
  return query;
} }) }));
import { manualGradeSubmission } from "./gradingService";
beforeEach(() => { state.row = null; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe("grade updates carry their latest grading time", () => {
  it("changes gradedAt when an existing grade is edited", async () => {
    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    const first = await manualGradeSubmission("teacher", { submissionId: "submission", manualPoints: 30, maxPoints: 60, gradeMode: "manual" });
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const updated = await manualGradeSubmission("teacher", { submissionId: "submission", manualPoints: 42, maxPoints: 60, gradeMode: "manual" });
    expect(first.gradedAt).toBe("2026-10-25T10:00:00.000Z");
    expect(updated).toMatchObject({ gradedAt: "2026-10-26T12:00:00.000Z", totalPoints: 42, versionId: "version", snapshotId: "snapshot" });
  });
});
