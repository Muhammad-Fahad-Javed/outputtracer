import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  gradeQuestionSubmission,
  recordStudentAttempt,
  markLessonCompleted,
  lessonActivitySatisfied,
} from "@/lib/learn/db";

export async function POST(request: Request) {
  let body: {
    action: "submit_answer" | "mark_complete" | "complete_lesson";
    courseId: string;
    lessonId?: string;
    questionId?: string;
    answer?: string;
    submittedAnswer?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { action, courseId, lessonId, questionId } = body;
  const answer = body.submittedAnswer !== undefined ? body.submittedAnswer : body.answer;

  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }

  // Get current user if authenticated
  let user = null;
  try {
    const supabase = await createServerClient();
    if (supabase) {
      user = (await supabase.auth.getUser()).data.user;
    }
  } catch {
    // Unauthenticated fallback
  }

  // 1. Submit answer for a question
  if (action === "submit_answer") {
    if (!questionId || answer === undefined) {
      return NextResponse.json({ error: "Missing questionId or answer" }, { status: 400 });
    }

    try {
      const result = await gradeQuestionSubmission({
        questionId,
        courseId,
        submittedAnswer: answer,
      });

      // Persist the attempt only for authenticated users. Guests cannot be
      // persisted (the column is a uuid referencing auth.users), and a failed
      // write must never be reported as a saved attempt.
      let persisted = false;
      if (user) {
        persisted = await recordStudentAttempt({
          userId: user.id,
          courseId,
          questionId,
          submittedAnswer: answer,
          isCorrect: result.isCorrect,
          points: result.earnedPoints,
        });
      }

      return NextResponse.json({
        success: true,
        isCorrect: result.isCorrect,
        explanation: result.explanation,
        earnedPoints: result.earnedPoints,
        points: result.earnedPoints,
        persisted,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return NextResponse.json({ error: error.message || "Failed grading question" }, { status: 400 });
    }
  }

  // 2. Mark lesson as completed
  if (action === "mark_complete" || action === "complete_lesson") {
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    // Progress is private per-student data, so it requires an authenticated user.
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to save your lesson progress." },
        { status: 401 },
      );
    }

    const ready = await lessonActivitySatisfied({ userId: user.id, lessonId });
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error }, { status: 409 });
    }

    const saved = await markLessonCompleted({
      userId: user.id,
      courseId,
      lessonId,
    });

    if (!saved) {
      return NextResponse.json(
        { error: "Could not save your progress. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: "Lesson marked completed" });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
