import { NextResponse } from "next/server";
import { getQuestion, gradePracticeAnswer } from "@/lib/practice";
import { clientIpFromForwarded, globalRateLimiter } from "@/lib/rateLimit";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for") ?? undefined,
    undefined,
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
  );
  const limited = globalRateLimiter.check(`practice:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: { topicId?: string; questionId?: string; answer?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const topicId = typeof body.topicId === "string" ? body.topicId : "";
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  if (!topicId || !questionId) {
    return NextResponse.json({ error: "Missing topic or question." }, { status: 400 });
  }
  if (Buffer.byteLength(answer, "utf8") > 8192) {
    return NextResponse.json({ error: "That answer is too long." }, { status: 400 });
  }

  const question = await getQuestion(topicId, questionId);
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const graded = gradePracticeAnswer(question, answer);

  const supabase = await createServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) {
    const admin = createAdminClient();
    if (admin) {
      await admin.from("practice_submissions").insert({
        user_id: user.id,
        topic_id: topicId,
        question_id: questionId,
        submitted_output: answer,
        is_correct: graded.isCorrect,
      });
      await admin.from("practice_progress").upsert(
        {
          user_id: user.id,
          topic_id: topicId,
          question_id: questionId,
          is_completed: graded.isCorrect,
          last_submitted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,topic_id,question_id" }
      );
    }
  }

  return NextResponse.json({
    isCorrect: graded.isCorrect,
    explanation: graded.explanation,
  });
}
