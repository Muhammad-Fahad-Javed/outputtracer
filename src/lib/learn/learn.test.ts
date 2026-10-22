import { describe, it, expect } from "vitest";
import {
  normalizeAnswer,
  gradeQuestionSubmission,
  getQuestionsForLesson,
  getPublishedCourses,
  getCourseBySlug,
  getLessonBySlug,
  markLessonCompleted,
  lessonActivitySatisfied,
  recordStudentAttempt,
  getStudentDashboardSummary,
  checkIsAdmin,
  adminUpsertCourse,
} from "./db";

describe("OutputTracer Learn Platform — Test Suite", () => {
  describe("1. Answer Normalization & Tolerant Grading", () => {
    it("trims whitespace and ignores case", () => {
      expect(normalizeAnswer("  Yes  ")).toBe("yes");
      expect(normalizeAnswer("30\n")).toBe("30");
      expect(normalizeAnswer("Output:\r\nHello World")).toBe("output:\nhello world");
    });

    it("collapses internal whitespace and tabs", () => {
      expect(normalizeAnswer("AX   =   002Ah")).toBe("ax = 002ah");
      expect(normalizeAnswer("10\t\t20")).toBe("10 20");
    });

    it("grades correct multiple choice answers", async () => {
      // Question: q-asm-reg-01 has answer: "0x56"
      const res = await gradeQuestionSubmission({
        questionId: "q-asm-reg-01",
        courseId: "8086-assembly-mastery",
        submittedAnswer: "0x56",
      });

      expect(res.isCorrect).toBe(true);
      expect(res.earnedPoints).toBeGreaterThan(0);
      expect(res.explanation).toContain("high byte");
    });

    it("grades incorrect multiple choice answers", async () => {
      const res = await gradeQuestionSubmission({
        questionId: "q-asm-reg-01",
        courseId: "8086-assembly-mastery",
        submittedAnswer: "0x78",
      });

      expect(res.isCorrect).toBe(false);
      expect(res.earnedPoints).toBe(0);
    });

    it("grades exact output prediction questions correctly", async () => {
      // Question: q-cpp-scope-01 has answer: "10 30"
      const res = await gradeQuestionSubmission({
        questionId: "q-cpp-scope-01",
        courseId: "cpp-mastery",
        submittedAnswer: " 10 30 \n",
      });

      expect(res.isCorrect).toBe(true);
      expect(res.earnedPoints).toBe(10);
    });

    it("returns error info for non-existent questions", async () => {
      const res = await gradeQuestionSubmission({
        questionId: "non-existent-q",
        courseId: "cpp-mastery",
        submittedAnswer: "anything",
      });

      expect(res.isCorrect).toBe(false);
      expect(res.earnedPoints).toBe(0);
    });
  });

  describe("2. Answer Key Privacy & Security", () => {
    it("masks answer keys when serving questions to student clients", async () => {
      const studentQuestions = await getQuestionsForLesson("cpp-scope-shadowing", false);
      expect(studentQuestions.length).toBeGreaterThan(0);

      studentQuestions.forEach((q) => {
        expect(q.answer).toBe(""); // Strictly masked!
        expect(q.explanation).toBe("");
      });
    });

    it("includes answer keys when requested for administrative grading", async () => {
      const adminQuestions = await getQuestionsForLesson("cpp-scope-shadowing", true);
      expect(adminQuestions.length).toBeGreaterThan(0);

      adminQuestions.forEach((q) => {
        expect(q.answer).not.toBe("");
      });
    });
  });

  describe("3. Curriculum & Course Querying", () => {
    it("returns published courses covering C++ and 8086 Assembly", async () => {
      const courses = await getPublishedCourses();
      expect(courses.length).toBeGreaterThanOrEqual(2);

      const hasCpp = courses.some((c) => c.languageSlug === "cpp");
      const hasAsm = courses.some((c) => c.languageSlug === "8086-assembly");

      expect(hasCpp).toBe(true);
      expect(hasAsm).toBe(true);
    });

    it("finds course by slug or ID with curriculum hierarchy", async () => {
      const course = await getCourseBySlug("cpp-mastery");
      expect(course).not.toBeNull();
      expect(course?.title).toContain("C++");
      expect(course?.modules?.length).toBeGreaterThan(0);

      const firstMod = course?.modules?.[0];
      expect(firstMod?.lessons?.length).toBeGreaterThan(0);
    });

    it("finds 8086 Assembly course with register and DOS topics", async () => {
      const course = await getCourseBySlug("8086-assembly-mastery");
      expect(course).not.toBeNull();
      expect(course?.title).toContain("8086");
      expect(course?.languageSlug).toBe("8086-assembly");
    });

    it("finds lesson with starter code and educational notes", async () => {
      const lesson = await getLessonBySlug("cpp-mastery", "cpp-scope-shadowing");
      expect(lesson).not.toBeNull();
      expect(lesson?.title).toBe("Variable Scope & Shadowing in C++");
      expect(lesson?.content).toContain("Scope and Variable Shadowing");
      expect(lesson?.starterCode).toContain("int main()");
    });
  });

  describe("4. Student Progress & Dashboard Tracking", () => {
    const testUserId = "test-user-42";

    it("records student attempts and calculates dashboard accuracy", async () => {
      await recordStudentAttempt({
        userId: testUserId,
        courseId: "cpp-mastery",
        questionId: "q-cpp-scope-01",
        submittedAnswer: "10 30",
        isCorrect: true,
        points: 10,
      });

      await recordStudentAttempt({
        userId: testUserId,
        courseId: "cpp-mastery",
        questionId: "q-cpp-ptr-01",
        submittedAnswer: "Wrong output",
        isCorrect: false,
        points: 0,
      });

      const summary = await getStudentDashboardSummary(testUserId);
      expect(summary.questionsAttempted).toBe(2);
      expect(summary.questionsCorrect).toBe(1);
      expect(summary.accuracyPercent).toBe(50);
      expect(summary.totalPoints).toBe(10);
      expect(summary.recentAttempts.length).toBe(2);
    });

    it("refuses to complete a lesson before its questions are answered", async () => {
      const saved = await markLessonCompleted({
        userId: "no-attempt-user",
        courseId: "cpp-mastery",
        lessonId: "cpp-scope-shadowing",
      });
      expect(saved).toBe(false);
      const ready = await lessonActivitySatisfied({
        userId: "no-attempt-user",
        lessonId: "cpp-scope-shadowing",
      });
      expect(ready.ok).toBe(false);
    });

    it("marks lesson completed and updates course completion percentage", async () => {
      await recordStudentAttempt({
        userId: testUserId,
        courseId: "cpp-mastery",
        questionId: "q-cpp-scope-01",
        submittedAnswer: "10 30",
        isCorrect: true,
        points: 10,
      });

      await markLessonCompleted({
        userId: testUserId,
        courseId: "cpp-mastery",
        lessonId: "cpp-scope-shadowing",
      });

      const summary = await getStudentDashboardSummary(testUserId);
      expect(summary.completedLessons).toBeGreaterThanOrEqual(1);

      const cppEnrollment = summary.enrolledCourses.find((e) => e.courseId === "cpp-mastery");
      expect(cppEnrollment).toBeDefined();
      expect(cppEnrollment?.completedLessons).toBeGreaterThanOrEqual(1);
      expect(cppEnrollment?.progressPercent).toBeGreaterThan(0);
    });
  });

  describe("5. Admin Role Authorization Enforcement", () => {
    it("rejects unauthorized ordinary users or undefined IDs", async () => {
      expect(await checkIsAdmin(undefined)).toBe(false);
      expect(await checkIsAdmin("")).toBe(false);
      expect(await checkIsAdmin("ordinary-student-id")).toBe(false);
    });

    it("authorizes verified admin via ADMIN_USER_IDS environment variable", async () => {
      process.env.ADMIN_USER_IDS = "root-admin-id, verified-staff-id";
      expect(await checkIsAdmin("root-admin-id")).toBe(true);
      expect(await checkIsAdmin("verified-staff-id")).toBe(true);
      expect(await checkIsAdmin("unauthorized-user")).toBe(false);
    });

    it("allows admin to upsert and modify course content", async () => {
      const updated = await adminUpsertCourse({
        id: "cpp-mastery",
        title: "C++ Advanced Execution Tracing",
        description: "Updated description for test",
        difficulty: "Beginner",
        estimated_duration: "8 hours",
        language_id: "cpp",
        thumbnail_icon: "Code",
        display_order: 1,
        is_published: true,
      });

      expect(updated.title).toBe("C++ Advanced Execution Tracing");
    });
  });
});
