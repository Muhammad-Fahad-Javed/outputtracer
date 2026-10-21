import { describe, expect, it } from "vitest";
import { gradePracticeAnswer, toPublicPracticeQuestion, type PracticeQuestion } from "./practice";

const sample: PracticeQuestion = {
  id: "q1",
  topicId: "loops",
  title: "Count",
  code: "int main(){ return 0; }",
  answer: "0",
  explanation: "The program prints 0.",
  difficulty: "Easy",
};

describe("practice answers", () => {
  it("does not put the answer key on the public question", () => {
    const pub = toPublicPracticeQuestion(sample);
    expect(pub).not.toHaveProperty("answer");
    expect(pub).not.toHaveProperty("explanation");
    expect(pub.code).toContain("main");
  });

  it("grades on the server and withholds the explanation until the answer is correct", () => {
    expect(gradePracticeAnswer(sample, "1").isCorrect).toBe(false);
    expect(gradePracticeAnswer(sample, "1").explanation).toBe("");
    expect(gradePracticeAnswer(sample, " 0 ").isCorrect).toBe(true);
    expect(gradePracticeAnswer(sample, "0").explanation).toContain("prints 0");
  });
});
