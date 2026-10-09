"use client";

import { useState, useEffect } from "react";
import { PracticeQuestion } from "@/lib/practice";
import Editor from "@monaco-editor/react";
import { CheckCircle2, XCircle, ChevronRight, Play, Check } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function QuestionClient({
  question,
  nextQuestionId,
}: {
  question: PracticeQuestion;
  nextQuestionId: string | null;
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "correct" | "incorrect">("idle");
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPreviouslyCompleted, setIsPreviouslyCompleted] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let isCancelled = false;

    const fetchProgress = async () => {
      try {
        const supabase = await getSupabaseBrowser();
        if (!supabase) return;

        const { data } = await supabase
          .from("practice_progress")
          .select("is_completed")
          .eq("user_id", user.id)
          .eq("topic_id", question.topicId)
          .eq("question_id", question.id)
          .maybeSingle();

        if (!isCancelled && data?.is_completed) {
          setIsPreviouslyCompleted(true);
        }
      } catch {
        // Silently continue if database is not reachable
      }
    };

    fetchProgress();
    return () => {
      isCancelled = true;
    };
  }, [user, question.topicId, question.id]);

  const checkAnswer = async () => {
    // Basic whitespace normalization for comparison
    const normalizedInput = input.trim().replace(/\s+/g, " ");
    const normalizedAnswer = question.answer.trim().replace(/\s+/g, " ");
    const isCorrect = normalizedInput === normalizedAnswer;
    
    if (isCorrect) {
      setStatus("correct");
      setShowExplanation(true);
      setIsPreviouslyCompleted(true);
    } else {
      setStatus("incorrect");
    }

    if (user) {
      try {
        const supabase = await getSupabaseBrowser();
        if (supabase) {
          await supabase.from("practice_submissions").insert({
            user_id: user.id,
            topic_id: question.topicId,
            question_id: question.id,
            submitted_output: input,
            is_correct: isCorrect,
          });

          await supabase.from("practice_progress").upsert(
            {
              user_id: user.id,
              topic_id: question.topicId,
              question_id: question.id,
              is_completed: isCorrect || isPreviouslyCompleted,
              last_submitted_at: new Date().toISOString(),
            },
            { onConflict: "user_id,topic_id,question_id" }
          );
        }
      } catch (err) {
        console.error("Failed to save submission progress:", err);
      }
    }
  };

  const handleTestInPredictor = () => {
    // Store the code in localStorage or URL to pass to predictor
    // The simplest way for now is just opening the predictor, but passing state 
    // requires a bit more wiring. We'll use localStorage.
    if (typeof window !== "undefined") {
      localStorage.setItem("outputtracer_practice_code", question.code);
      window.open("/#predictor", "_blank");
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* Left Column: Code */}
      <div className="flex-1 rounded-[8px] border border-[#EAEAEA] bg-[#0E0E0E] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between border-b border-[#222] bg-[#111] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[#FF5F56]" />
            <div className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
            <div className="h-3 w-3 rounded-full bg-[#27C93F]" />
          </div>
          <span className="font-mono text-xs text-[#888]">main.cpp</span>
        </div>
        <div className="p-4">
          <Editor
            height="400px"
            defaultLanguage="cpp"
            value={question.code}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              scrollBeyondLastLine: false,
              lineHeight: 24,
            }}
          />
        </div>
      </div>

      {/* Right Column: Interaction */}
      <div className="w-full lg:w-[400px] shrink-0 space-y-6">
        <div className="rounded-[8px] border border-[#EAEAEA] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#666666]">
              Predict the Output
            </h2>
            {isPreviouslyCompleted && (
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                <Check size={11} /> Solved
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-[#333333]">
            What will this program print to the console?
          </p>

          <div className="mt-5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter the exact output..."
              className="w-full rounded-[6px] border border-[#DCDCDC] p-3 font-mono text-sm shadow-inner focus:border-black focus:outline-none focus:ring-1 focus:ring-black min-h-[100px] resize-y"
              spellCheck={false}
            />
          </div>

          <button
            onClick={checkAnswer}
            disabled={!input.trim()}
            className="mt-4 w-full rounded-[6px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:bg-[#CCCCCC] disabled:text-[#888888]"
          >
            Check Answer
          </button>

          {status !== "idle" && (
            <div
              className={`mt-4 flex items-start gap-3 rounded-[6px] p-4 ${
                status === "correct"
                  ? "bg-green-50 border border-green-200 text-green-900"
                  : "bg-red-50 border border-red-200 text-red-900"
              }`}
            >
              {status === "correct" ? (
                <CheckCircle2 className="mt-0.5 shrink-0 text-green-600" size={18} />
              ) : (
                <XCircle className="mt-0.5 shrink-0 text-red-600" size={18} />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {status === "correct" ? "Correct!" : "Incorrect"}
                </p>
                {status === "incorrect" && (
                  <p className="mt-1 opacity-90">
                    Review your logic or use the predictor to trace it.
                  </p>
                )}
              </div>
            </div>
          )}

          {showExplanation && (
            <div className="mt-6 border-t border-[#EAEAEA] pt-6">
              <h3 className="text-sm font-semibold text-black">Explanation</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#666666]">
                {question.explanation}
              </p>

              {nextQuestionId && (
                <Link
                  href={`/practice/${question.topicId}/${nextQuestionId}`}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#DCDCDC] bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[#F9F9F9]"
                >
                  Next Question
                  <ChevronRight size={16} />
                </Link>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleTestInPredictor}
          className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#DCDCDC] bg-white px-4 py-3 text-sm font-medium text-black shadow-sm transition-colors hover:bg-[#F9F9F9]"
        >
          <Play size={16} />
          Test in Predictor
        </button>
      </div>
    </div>
  );
}
