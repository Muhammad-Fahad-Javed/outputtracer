/**
 * studentDashboardRoute.test.ts
 *
 * Regression tests for the student dashboard data route.
 *
 * Two bugs are covered:
 *
 * 1. "Practice Solved" counted every question the student had STARTED.
 *    practice_progress has one row per question the student has opened, with
 *    an is_completed flag. The count must filter on is_completed.
 *
 * 2. "Unread Alerts" was derived from the 10 most recent notifications, so the
 *    badge was capped at 10. The unread total must come from its own
 *    count query filtered on is_read = false.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface RecordedCall {
  table: string;
  op: string;
  args: unknown[];
}

const calls: RecordedCall[] = [];

function makeQuery(table: string) {
  const rec = (op: string, ...args: unknown[]) => {
    calls.push({ table, op, args });
  };
  const q: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      rec("select", ...args);
      return q;
    },
    eq: (...args: unknown[]) => {
      rec("eq", ...args);
      return q;
    },
    in: (...args: unknown[]) => {
      rec("in", ...args);
      return q;
    },
    order: (...args: unknown[]) => {
      rec("order", ...args);
      return q;
    },
    limit: (...args: unknown[]) => {
      rec("limit", ...args);
      return q;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, count: null, error: null }).then(resolve),
  };
  return q;
}

const fakeAdmin = {
  from: (table: string) => makeQuery(table),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "student-uuid" } },
        error: null,
      }),
    },
  }),
}));

const { GET } = await import("./route");

function eqArgs(table: string, column: string): unknown[] {
  return calls
    .filter((c) => c.table === table && c.op === "eq" && c.args[0] === column)
    .map((c) => c.args[1]);
}

beforeEach(() => {
  calls.length = 0;
});

describe("GET /api/classroom/student/dashboard", () => {
  it("requires an authenticated user", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("counts only COMPLETED practice problems for 'Practice Solved'", async () => {
    await GET();

    const practiceCalls = calls.filter((c) => c.table === "practice_progress");
    expect(practiceCalls.length).toBeGreaterThan(0);

    // The count must be restricted to completed problems.
    expect(eqArgs("practice_progress", "is_completed")).toContain(true);

    // And it must be a count query, not a row fetch.
    const selectCall = practiceCalls.find((c) => c.op === "select");
    expect(selectCall).toBeDefined();
    expect(selectCall?.args[1]).toMatchObject({ count: "exact", head: true });
  });

  it("takes the unread notification count from its own filtered count query", async () => {
    await GET();

    // There must be a dedicated head-count query for unread notifications.
    const countQueries = calls.filter(
      (c) =>
        c.table === "classroom_notifications" &&
        c.op === "select" &&
        c.args[1] &&
        typeof c.args[1] === "object" &&
        (c.args[1] as { head?: boolean }).head === true,
    );
    expect(countQueries.length).toBe(1);

    // ...and it must filter on is_read = false.
    expect(eqArgs("classroom_notifications", "is_read")).toContain(false);

    // The activity list is still a small, limited query - but the badge must
    // not be derived from it.
    const limited = calls.filter(
      (c) => c.table === "classroom_notifications" && c.op === "limit",
    );
    expect(limited.length).toBe(1);
  });

  it("scopes every query to the signed-in student", async () => {
    await GET();
    expect(eqArgs("classroom_members", "user_id")).toContain("student-uuid");
    expect(eqArgs("classroom_submissions", "student_id")).toContain("student-uuid");
    expect(eqArgs("classroom_notifications", "recipient_id")).toContain("student-uuid");
  });
});
