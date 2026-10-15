"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, HelpCircle, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import { LearnQuestion } from "@/lib/learn/types";

interface QuestionClientProps {
  questions: LearnQuestion[];
  courseId: string;
  lessonId: string;
  courseSlug: string;
}

interface QuestionState {
  submittedAnswer: string;
  isChecking: boolean;
  result?: {
    isCorrect: boolean;
    feedback?: string;
    explanation?: string;
    earnedPoints?: number;
  };
  showHint?: boolean;
}

export default function QuestionClient({
  questions,
  courseId,
  lessonId,
  courseSlug,
}: QuestionClientProps) {
  const [states, setStates] = useState<Record<string, QuestionState>>({});

  if (!questions || questions.length === 0) {
    return (
      <div className="rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-6 text-center text-sm text-[#777777]">
        No practice questions for this lesson yet.
      </div>
    );
  }

  const handleSelectOption = (questionId: string, option: string) => {
    setStates((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        submittedAnswer: option,
      },
    }));
  };

  const handleTextChange = (questionId: string, value: string) => {
    setStates((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        submittedAnswer: value,
      },
    }));
  };

  const toggleHint = (questionId: string) => {
    setStates((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        showHint: !prev[questionId]?.showHint,
      },
    }));
  };

  const handleSubmit = async (q: LearnQuestion) => {
    const state = states[q.id];
    const answer = state?.submittedAnswer?.trim();
    if (!answer) return;

    setStates((prev) => ({
      ...prev,
      [q.id]: {
        ...prev[q.id],
        isChecking: true,
      },
    }));

    try {
      const res = await fetch("/api/learn/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          questionId: q.id,
          courseId,
          submittedAnswer: answer,
        }),
      });

      const data = await res.json();
      setStates((prev) => ({
        ...prev,
        [q.id]: {
          ...prev[q.id],
          isChecking: false,
          result: {
            isCorrect: data.isCorrect,
            feedback: data.feedback,
            explanation: data.explanation || q.explanation,
            earnedPoints: data.earnedPoints,
          },
        },
      }));
    } catch {
      setStates((prev) => ({
        ...prev,
        [q.id]: {
          ...prev[q.id],
          isChecking: false,
          result: {
            isCorrect: false,
            feedback: "Failed to grade question. Please check network connection.",
          },
        },
      }));
    }
  };

  return (
    <div className="space-y-8">
      {questions.map((q, idx) => {
        const state = states[q.id] || { submittedAnswer: "", isChecking: false };
        const isAnswered = state.result !== undefined;
        const isCorrect = state.result?.isCorrect;

        return (
          <div
            key={q.id}
            className={`rounded-xl border p-6 transition-all ${
              isAnswered
                ? isCorrect
                  ? "border-emerald-300 bg-emerald-50/20"
                  : "border-rose-300 bg-rose-50/20"
                : "border-[#EAEAEA] bg-white shadow-sm"
            }`}
          >
            {/* Question Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[#F0F0F0] pb-3 mb-4">
              <span className="font-mono text-xs font-semibold text-[#888888] uppercase tracking-wider">
                Question {idx + 1} of {questions.length} • {q.points} pts
              </span>
              <span className="rounded-[4px] border border-[#EAEAEA] bg-[#F7F7F7] px-2 py-0.5 text-[11px] font-mono capitalize text-[#555555]">
                {q.type.replace("_", " ")}
              </span>
            </div>

            {/* Prompt */}
            <p className="text-[15px] font-medium text-black leading-relaxed">
              {q.prompt}
            </p>

            {/* Code Snippet in question if present */}
            {q.codeSnippet && (
              <div className="mt-4 rounded-lg bg-[#1E1E1E] p-4 font-mono text-xs text-[#D4D4D4] overflow-x-auto border border-[#333333]">
                <pre>{q.codeSnippet}</pre>
              </div>
            )}

            {/* Interaction by Question Type */}
            <div className="mt-5">
              {q.type === "multiple_choice" && q.options && (
                <div className="space-y-2.5">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = state.submittedAnswer === opt;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectOption(q.id, opt)}
                        disabled={state.isChecking || (isAnswered && isCorrect)}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left text-sm transition-all ${
                          isSelected
                            ? "border-black bg-[#F8F9FA] font-medium text-black ring-1 ring-black"
                            : "border-[#EAEAEA] bg-white text-[#333333] hover:border-[#CCCCCC] hover:bg-[#FAFAFA]"
                        } ${isAnswered && isCorrect ? "opacity-80 cursor-default" : ""}`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-mono ${
                            isSelected
                              ? "border-black bg-black text-white"
                              : "border-[#CCCCCC] text-[#777777]"
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1 font-mono text-xs sm:text-sm">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "output_prediction" && (
                <div>
                  <label className="block text-xs font-medium text-[#666666] mb-1.5">
                    Your predicted terminal / console output:
                  </label>
                  <input
                    type="text"
                    value={state.submittedAnswer}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    disabled={state.isChecking || (isAnswered && isCorrect)}
                    placeholder="e.g. 30, or Yes, or 42"
                    className="w-full rounded-md border border-[#DCDCDC] bg-white px-3.5 py-2 font-mono text-sm text-black placeholder:text-[#AAAAAA] focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                  <p className="mt-1.5 text-[11px] text-[#888888]">
                    Note: Output verification is whitespace-tolerant.
                  </p>
                </div>
              )}
            </div>

            {/* Hint & Submit Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F0F0F0]">
              <div>
                {q.hint && (
                  <button
                    type="button"
                    onClick={() => toggleHint(q.id)}
                    className="inline-flex items-center gap-1 text-xs text-[#666666] hover:text-black hover:underline"
                  >
                    <HelpCircle size={13} />
                    {state.showHint ? "Hide Hint" : "Need a Hint?"}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmit(q)}
                  disabled={state.isChecking || !state.submittedAnswer?.trim() || (isAnswered && isCorrect)}
                  className={`inline-flex items-center gap-1.5 rounded-[4px] px-4 py-2 text-xs font-semibold transition-all ${
                    isAnswered && isCorrect
                      ? "bg-emerald-600 text-white cursor-default"
                      : "bg-black text-white hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  {state.isChecking ? (
                    "Checking…"
                  ) : isAnswered && isCorrect ? (
                    <>
                      <CheckCircle2 size={14} /> Solved
                    </>
                  ) : (
                    <>
                      Check Answer <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Hint Accordion */}
            {state.showHint && q.hint && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                <Sparkles size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Hint: </span>
                  {q.hint}
                </div>
              </div>
            )}

            {/* Result Feedback Banner */}
            {isAnswered && (
              <div
                className={`mt-4 rounded-lg border p-4 text-xs leading-relaxed ${
                  isCorrect
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-rose-300 bg-rose-50 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>Correct! +{state.result?.earnedPoints ?? q.points} points</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} className="text-rose-600" />
                      <span>Incorrect answer. Try again!</span>
                    </>
                  )}
                </div>

                {state.result?.explanation && (
                  <p className="mt-2 text-xs opacity-90">
                    <span className="font-semibold">Explanation: </span>
                    {state.result.explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
