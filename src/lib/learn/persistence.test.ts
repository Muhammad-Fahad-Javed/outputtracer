import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// A mutable mock client so each test can control exactly what the privileged
// Supabase admin client returns. `vi.mock` is hoisted, so `mockClient` is read
// lazily by `createAdminClient` at call time.
let mockClient: any = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { recordStudentAttempt, markLessonCompleted, getStudentDashboardSummary } from "./db";

const SAVED_ENV = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function configureSupabase(withServiceRole: boolean) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
  if (withServiceRole) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  } else {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function clearSupabase() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// A PostgREST-style builder that is awaitable and also supports `.order()`.
function queryResult(data: any, error: any = null) {
  const p = Promise.resolve({ data, error });
  return {
    order: () => p,
    then: (resolve: any, reject: any) => p.then(resolve, reject),
  };
}

describe("OutputTracer Learn — persistence integrity", () => {
  beforeEach(() => {
    mockClient = null;
    clearSupabase();
  });

  afterAll(() => {
    if (SAVED_ENV.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = SAVED_ENV.url;
    if (SAVED_ENV.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SAVED_ENV.anon;
    if (SAVED_ENV.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = SAVED_ENV.service;
  });

  it("reports a failed attempt write as false instead of faking success", async () => {
    configureSupabase(true);
    mockClient = {
      from: () => ({
        insert: async () => ({ error: { message: "insert failed" } }),
      }),
    };

    const saved = await recordStudentAttempt({
      userId: "user-attempt-fail",
      courseId: "cpp-mastery",
      questionId: "q-asm-reg-01",
      submittedAnswer: "wrong",
      isCorrect: true,
      points: 10,
    });

    expect(saved).toBe(false);

    // The failed write must not have been silently stored in memory either.
    const summary = await getStudentDashboardSummary("user-attempt-fail");
    expect(summary.questionsAttempted).toBe(0);
  });

  it("reports a failed lesson write as false instead of faking success", async () => {
    configureSupabase(true);
    mockClient = {
      from: () => ({
        upsert: async () => ({ error: { message: "upsert failed" } }),
      }),
    };

    const saved = await markLessonCompleted({
      userId: "user-lesson-fail",
      courseId: "cpp-mastery",
      lessonId: "cpp-hello-1",
    });

    expect(saved).toBe(false);
  });

  it("does not use the in-memory store when Supabase is configured but the privileged client is missing", async () => {
    configureSupabase(false); // URL + anon only, no service-role key
    mockClient = null;

    const attemptSaved = await recordStudentAttempt({
      userId: "user-no-privilege",
      courseId: "cpp-mastery",
      questionId: "q-asm-reg-01",
      submittedAnswer: "x",
      isCorrect: true,
      points: 10,
    });
    const lessonSaved = await markLessonCompleted({
      userId: "user-no-privilege",
      courseId: "cpp-mastery",
      lessonId: "cpp-hello-1",
    });

    expect(attemptSaved).toBe(false);
    expect(lessonSaved).toBe(false);

    const summary = await getStudentDashboardSummary("user-no-privilege");
    expect(summary.questionsAttempted).toBe(0);
    expect(summary.completedLessons).toBe(0);
  });

  it("reads student progress from the database when available", async () => {
    configureSupabase(true);
    mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            const data =
              table === "learn_lesson_completions"
                ? [{ lesson_id: "cpp-hello-1" }]
                : [
                    {
                      question_id: "q1",
                      submitted_answer: "42",
                      is_correct: true,
                      points_awarded: 10,
                      created_at: "2026-01-01T00:00:00.000Z",
                    },
                    {
                      question_id: "q2",
                      submitted_answer: "wrong",
                      is_correct: false,
                      points_awarded: 0,
                      created_at: "2026-01-02T00:00:00.000Z",
                    },
                  ];
            return queryResult(data);
          },
        }),
      }),
    };

    const summary = await getStudentDashboardSummary("user-with-db");

    expect(summary.questionsAttempted).toBe(2);
    expect(summary.questionsCorrect).toBe(1);
    expect(summary.accuracyPercent).toBe(50);
    expect(summary.totalPoints).toBe(10);
    expect(summary.completedLessons).toBe(1);
  });

  it("keeps the in-memory fallback when Supabase is not configured at all (dev/test)", async () => {
    clearSupabase();
    mockClient = null;

    const attemptSaved = await recordStudentAttempt({
      userId: "local-dev-user",
      courseId: "cpp-mastery",
      questionId: "q-asm-reg-01",
      submittedAnswer: "0x56",
      isCorrect: true,
      points: 10,
    });
    const lessonSaved = await markLessonCompleted({
      userId: "local-dev-user",
      courseId: "cpp-mastery",
      lessonId: "cpp-hello-1",
    });

    expect(attemptSaved).toBe(true);
    expect(lessonSaved).toBe(true);

    const summary = await getStudentDashboardSummary("local-dev-user");
    expect(summary.questionsAttempted).toBe(1);
    expect(summary.questionsCorrect).toBe(1);
  });
});
