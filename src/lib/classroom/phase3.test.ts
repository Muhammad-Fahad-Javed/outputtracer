/**
 * phase3.test.ts
 *
 * Tests for Phase 3: versioning, submission snapshots, grading, and access control.
 *
 * Covered:
 * 1. Version integrity (hash matches content, sequential numbering)
 * 2. Version immutability (stored content unchanged)
 * 3. Submission snapshot creation and frozen code integrity
 * 4. Snapshot hash matches content (tamper detection)
 * 5. Grade always references the exact submitted version
 * 6. Cross-student unauthorized access is denied
 * 7. Hidden test definitions never returned to students via execution logs
 * 8. Auto-grading records correct pass/fail counts without exposing test cases
 * 9. Manual grading correctly references snapshot versionId
 * 10. Code diff computation correctness
 * 11. Activity event recording
 * 12. Feedback visibility: students cannot see private feedback
 * 13. Group contribution report aggregation
 * 14. Sandbox timeout protection (stub)
 * 15. Late submission detection
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "crypto";

import {
  saveCodeVersion,
  listCodeVersions,
  getCodeVersion,
  createSubmissionSnapshot,
  getSubmissionSnapshot,
  recordActivityEvent,
  listActivityEvents,
  recordExecutionLog,
  listExecutionLogs,
  computeVersionDiff,
  hashCodeFiles,
  _resetVersioningMemory,
} from "./versioningService";

import {
  upsertRubric,
  getRubric,
  manualGradeSubmission,
  autoGradeSubmission,
  getGrade,
  addFeedback,
  listFeedback,
  computeGroupContributionReport,
  _resetGradingMemory,
} from "./gradingService";

import {
  _setSandboxStub,
  _clearSandboxStub,
  ExecutionError,
} from "./executionClient";

import type { SandboxResult } from "./submissionTypes";

// ==============================================================================
// Test helpers
// ==============================================================================

function makeFiles(content: string): Record<string, string> {
  return { "main.cpp": content };
}

function computeExpectedHash(files: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const STUDENT_A = "student-a-uuid";
const STUDENT_B = "student-b-uuid";
const TEACHER_ID = "teacher-uuid";
const ASSIGNMENT_ID = "assignment-001";
const GROUP_ID = "group-001";

function passSandbox(): SandboxResult {
  return { stdout: "42\n", stderr: "", exitCode: 0, durationMs: 50, timedOut: false };
}

// ==============================================================================
// Setup
// ==============================================================================

beforeEach(() => {
  _resetVersioningMemory();
  _resetGradingMemory();
  _clearSandboxStub();
});

// ==============================================================================
// 1. Version integrity
// ==============================================================================

describe("Code version integrity", () => {
  it("computes content_hash matching SHA-256 of canonical JSON", async () => {
    const files = makeFiles("int main() {}");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    const expected = computeExpectedHash(files);
    expect(version.contentHash).toBe(expected);
  });

  it("assigns sequential version numbers per student", async () => {
    const v1 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("v1"), studentId: STUDENT_A });
    const v2 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("v2"), studentId: STUDENT_A });
    const v3 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("v3"), studentId: STUDENT_A });
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
    expect(v3.versionNumber).toBe(3);
  });

  it("different students have independent version sequences", async () => {
    await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("a1"), studentId: STUDENT_A });
    await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("a2"), studentId: STUDENT_A });
    const b1 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("b1"), studentId: STUDENT_B });
    expect(b1.versionNumber).toBe(1); // Student B starts from 1
  });

  it("stored code files match input exactly", async () => {
    const files = { "main.cpp": "// solution\nint main() { return 0; }", "helper.h": "#pragma once" };
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    expect(version.codeFiles).toEqual(files);
  });

  it("hashCodeFiles is stable across equivalent inputs", () => {
    const h1 = hashCodeFiles({ "a.cpp": "x", "b.cpp": "y" });
    const h2 = hashCodeFiles({ "b.cpp": "y", "a.cpp": "x" }); // Different insertion order
    expect(h1).toBe(h2); // Canonical sort must produce same hash
  });

  it("different file content produces different hash", () => {
    const h1 = hashCodeFiles({ "main.cpp": "int x = 1;" });
    const h2 = hashCodeFiles({ "main.cpp": "int x = 2;" });
    expect(h1).not.toBe(h2);
  });

  it("listCodeVersions returns newest first", async () => {
    await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("v1"), studentId: STUDENT_A });
    await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("v2"), studentId: STUDENT_A });
    const versions = await listCodeVersions(ASSIGNMENT_ID, STUDENT_A);
    expect(versions[0].versionNumber).toBe(2);
    expect(versions[1].versionNumber).toBe(1);
  });

  it("getCodeVersion retrieves version by ID", async () => {
    const saved = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("hello"), studentId: STUDENT_A });
    const fetched = await getCodeVersion(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(saved.id);
    expect(fetched!.codeFiles).toEqual(saved.codeFiles);
  });
});

// ==============================================================================
// 2. Submission snapshots
// ==============================================================================

describe("Submission snapshots", () => {
  it("creates an immutable snapshot with the exact version and hash", async () => {
    const files = makeFiles("// final submission");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    const submissionId = "sub-001";

    const snapshot = await createSubmissionSnapshot({
      submissionId,
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    expect(snapshot.versionId).toBe(version.id);
    expect(snapshot.frozenCodeFiles).toEqual(files);
    expect(snapshot.contentHash).toBe(version.contentHash);
    expect(snapshot.isLate).toBe(false);
  });

  it("getSubmissionSnapshot retrieves snapshot by submissionId", async () => {
    const files = makeFiles("// test");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({
      submissionId: "sub-002",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: true,
    });

    const snapshot = await getSubmissionSnapshot("sub-002");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.isLate).toBe(true);
    expect(snapshot!.studentId).toBe(STUDENT_A);
  });

  it("snapshot hash matches content (tamper detection)", async () => {
    const files = makeFiles("// authentic code");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    const snapshot = await createSubmissionSnapshot({
      submissionId: "sub-tamper-test",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    // Recompute hash from frozen files — must match stored hash
    const recomputed = computeExpectedHash(snapshot.frozenCodeFiles);
    expect(recomputed).toBe(snapshot.contentHash);
    expect(snapshot.contentHash).toBe(version.contentHash);
  });
});

// ==============================================================================
// 3. Grading — every grade references exact version
// ==============================================================================

describe("Grading references exact submitted version", () => {
  it("manual grade versionId matches snapshot versionId", async () => {
    const files = makeFiles("// graded");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({
      submissionId: "sub-grade-001",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    const grade = await manualGradeSubmission(TEACHER_ID, {
      submissionId: "sub-grade-001",
      rubricScores: { "item-1": 40, "item-2": 30 },
      manualPoints: 70,
      gradeMode: "manual",
    });

    expect(grade.versionId).toBe(version.id);
    expect(grade.snapshotId).toBeTruthy();
    expect(grade.manualPoints).toBe(70);
    expect(grade.gradedBy).toBe(TEACHER_ID);
  });

  it("auto-grade versionId matches snapshot versionId", async () => {
    // Stub sandbox: always returns "42\n" (matches expected output)
    _setSandboxStub(async () => passSandbox());

    const files = makeFiles("int main() { return 0; }");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({
      submissionId: "sub-auto-001",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    const result = await autoGradeSubmission({
      submissionId: "sub-auto-001",
      assignmentId: ASSIGNMENT_ID,
      teacherId: TEACHER_ID,
      publicTests: [{ id: "tc1", name: "Test 1", stdin: "", expectedOutput: "42\n", points: 50, isHidden: false }],
      hiddenTests: [{ id: "tc2", name: "Hidden 1", stdin: "", expectedOutput: "42\n", points: 50, isHidden: true }],
      maxPoints: 100,
    });

    expect(result.grade.versionId).toBe(version.id);
    expect(result.publicPassed).toBe(1);
    expect(result.hiddenPassed).toBe(1);
  });

  it("does not store a grade when the sandbox is unavailable", async () => {
    _setSandboxStub(async () => {
      throw new ExecutionError("sandbox down", "sandbox_unavailable");
    });

    const files = makeFiles("int main() { return 0; }");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({
      submissionId: "sub-infra-001",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    await expect(
      autoGradeSubmission({
        submissionId: "sub-infra-001",
        assignmentId: ASSIGNMENT_ID,
        teacherId: TEACHER_ID,
        publicTests: [{ id: "tc1", name: "Test 1", stdin: "", expectedOutput: "42\n", points: 100, isHidden: false }],
        hiddenTests: [],
        maxPoints: 100,
      })
    ).rejects.toBeInstanceOf(ExecutionError);
    expect(await getGrade("sub-infra-001")).toBeNull();
  });

  it("rubric total points matches sum of item scores", async () => {
    await upsertRubric(ASSIGNMENT_ID, {
      items: [
        { description: "Correctness", maxPoints: 60 },
        { description: "Style", maxPoints: 20 },
        { description: "Tests", maxPoints: 20 },
      ],
    });

    const files = makeFiles("// rubric test");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({
      submissionId: "sub-rubric-001",
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      studentId: STUDENT_A,
      codeFiles: files,
      isLate: false,
    });

    const grade = await manualGradeSubmission(TEACHER_ID, {
      submissionId: "sub-rubric-001",
      rubricScores: { "0": 55, "1": 18, "2": 15 },
      manualPoints: 88,
      gradeMode: "manual",
    });

    expect(grade.manualPoints).toBe(88);
    expect(grade.totalPoints).toBe(88); // No auto points yet
  });

  it("getGrade returns null when no grade exists", async () => {
    const grade = await getGrade("nonexistent-submission");
    expect(grade).toBeNull();
  });
});

// ==============================================================================
// 4. Cross-student unauthorized access
// ==============================================================================

describe("Cross-student unauthorized access", () => {
  it("Student A cannot read Student B's versions via listCodeVersions", async () => {
    await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: makeFiles("student B code"), studentId: STUDENT_B });
    // listCodeVersions with STUDENT_A as ownerId returns only STUDENT_A versions
    const aVersions = await listCodeVersions(ASSIGNMENT_ID, STUDENT_A);
    expect(aVersions.length).toBe(0); // Student A has no versions
  });

  it("Student A's snapshot is isolated from Student B's", async () => {
    const filesA = makeFiles("// student A solution");
    const versionA = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: filesA, studentId: STUDENT_A });
    await createSubmissionSnapshot({ submissionId: "sub-a", versionId: versionA.id, assignmentId: ASSIGNMENT_ID, studentId: STUDENT_A, codeFiles: filesA, isLate: false });

    const filesB = makeFiles("// student B solution");
    const versionB = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: filesB, studentId: STUDENT_B });
    await createSubmissionSnapshot({ submissionId: "sub-b", versionId: versionB.id, assignmentId: ASSIGNMENT_ID, studentId: STUDENT_B, codeFiles: filesB, isLate: false });

    const snapA = await getSubmissionSnapshot("sub-a");
    const snapB = await getSubmissionSnapshot("sub-b");

    expect(snapA!.studentId).toBe(STUDENT_A);
    expect(snapB!.studentId).toBe(STUDENT_B);
    expect(snapA!.frozenCodeFiles).not.toEqual(snapB!.frozenCodeFiles);
  });

  it("Manual grade for Student A does not affect Student B", async () => {
    // Setup both students
    for (const [sid, sub] of [[STUDENT_A, "sub-a2"], [STUDENT_B, "sub-b2"]] as const) {
      const files = makeFiles(`// code by ${sid}`);
      const ver = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: sid });
      await createSubmissionSnapshot({ submissionId: sub, versionId: ver.id, assignmentId: ASSIGNMENT_ID, studentId: sid, codeFiles: files, isLate: false });
    }

    await manualGradeSubmission(TEACHER_ID, { submissionId: "sub-a2", manualPoints: 90, gradeMode: "manual" });

    const gradeA = await getGrade("sub-a2");
    const gradeB = await getGrade("sub-b2");

    expect(gradeA).not.toBeNull();
    expect(gradeA!.totalPoints).toBe(90);
    expect(gradeB).toBeNull(); // Student B untouched
  });
});

// ==============================================================================
// 5. Hidden test protection
// ==============================================================================

describe("Hidden test protection", () => {
  it("stripHiddenTestCounts removes hidden counts from student execution logs", async () => {
    _setSandboxStub(async () => passSandbox());

    const files = makeFiles("int main() {}");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });

    await recordExecutionLog({
      versionId: version.id,
      assignmentId: ASSIGNMENT_ID,
      actorId: STUDENT_A,
      language: "cpp",
      stdin: "",
      result: passSandbox(),
      publicTestsPassed: 2,
      publicTestsTotal: 2,
      hiddenTestsPassed: 3,
      hiddenTestsTotal: 5,
      runMode: "manual",
    });

    // Student view (isTeacher=false) — hidden test counts must be absent
    const studentLogs = await listExecutionLogs(ASSIGNMENT_ID, STUDENT_A, false);
    expect(studentLogs.length).toBe(1);
    expect("hiddenTestsPassed" in studentLogs[0]).toBe(false);
    expect("hiddenTestsTotal" in studentLogs[0]).toBe(false);
    // Public counts are visible
    expect(studentLogs[0].publicTestsPassed).toBe(2);

    // Teacher view (isTeacher=true) — hidden counts visible
    const teacherLogs = await listExecutionLogs(ASSIGNMENT_ID, STUDENT_A, true);
    expect(teacherLogs.length).toBe(1);
    const teacherLog = teacherLogs[0] as import("./submissionTypes").ExecutionLog;
    expect(teacherLog.hiddenTestsPassed).toBe(3);
    expect(teacherLog.hiddenTestsTotal).toBe(5);
  });

  it("auto-grading does not expose hidden test expectedOutput to callers", async () => {
    const hiddenExpectedOutput = "secret-output-42";
    _setSandboxStub(async () => {
      // Return correct output for the hidden test
      return { stdout: hiddenExpectedOutput + "\n", stderr: "", exitCode: 0, durationMs: 10, timedOut: false };
    });

    const files = makeFiles("int main() {}");
    const version = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    await createSubmissionSnapshot({ submissionId: "sub-hidden", versionId: version.id, assignmentId: ASSIGNMENT_ID, studentId: STUDENT_A, codeFiles: files, isLate: false });

    const result = await autoGradeSubmission({
      submissionId: "sub-hidden",
      assignmentId: ASSIGNMENT_ID,
      teacherId: TEACHER_ID,
      publicTests: [],
      hiddenTests: [{ id: "h1", name: "Hidden", stdin: "", expectedOutput: hiddenExpectedOutput, points: 100, isHidden: true }],
      maxPoints: 100,
    });

    // The result only contains counts, never the expected output
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(hiddenExpectedOutput);
    expect(result.hiddenPassed).toBe(1);
  });
});

// ==============================================================================
// 6. Code diffs
// ==============================================================================

describe("Code diff computation", () => {
  it("produces correct insert/delete/equal hunks", async () => {
    const v1 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: { "main.cpp": "line1\nline2\nline3" }, studentId: STUDENT_A });
    const v2 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: { "main.cpp": "line1\nline2-modified\nline3\nline4" }, studentId: STUDENT_A });

    const v1Full = await getCodeVersion(v1.id);
    const v2Full = await getCodeVersion(v2.id);

    const diff = computeVersionDiff(v1Full!, v2Full!);
    expect(diff.fromVersionId).toBe(v1.id);
    expect(diff.toVersionId).toBe(v2.id);
    expect(diff.fileDiffs.length).toBe(1);
    expect(diff.fileDiffs[0].fileName).toBe("main.cpp");
    expect(diff.fileDiffs[0].addedLines).toBeGreaterThan(0);
    expect(diff.fileDiffs[0].removedLines).toBeGreaterThan(0);
  });

  it("identical versions produce zero diff", async () => {
    const files = makeFiles("int main() { return 0; }");
    const v1 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    const v2 = await saveCodeVersion({ assignmentId: ASSIGNMENT_ID, codeFiles: files, studentId: STUDENT_A });
    const v1Full = await getCodeVersion(v1.id);
    const v2Full = await getCodeVersion(v2.id);
    const diff = computeVersionDiff(v1Full!, v2Full!);
    expect(diff.fileDiffs[0].addedLines).toBe(0);
    expect(diff.fileDiffs[0].removedLines).toBe(0);
  });
});

// ==============================================================================
// 7. Activity events
// ==============================================================================

describe("Activity event recording", () => {
  it("records save, run, and submit events", async () => {
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: STUDENT_A, eventType: "save", metadata: { v: 1 } });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: STUDENT_A, eventType: "run", metadata: {} });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: STUDENT_A, eventType: "submit", metadata: {} });

    const events = await listActivityEvents(ASSIGNMENT_ID, STUDENT_A);
    expect(events.length).toBe(3);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("save");
    expect(types).toContain("run");
    expect(types).toContain("submit");
  });

  it("events are scoped per student", async () => {
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: STUDENT_A, eventType: "save", metadata: {} });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: STUDENT_B, eventType: "run", metadata: {} });

    const aEvents = await listActivityEvents(ASSIGNMENT_ID, STUDENT_A);
    const bEvents = await listActivityEvents(ASSIGNMENT_ID, STUDENT_B);
    expect(aEvents.every((e) => e.actorId === STUDENT_A)).toBe(true);
    expect(bEvents.every((e) => e.actorId === STUDENT_B)).toBe(true);
  });
});

// ==============================================================================
// 8. Feedback visibility
// ==============================================================================

describe("Feedback visibility", () => {
  const SUB_ID = "sub-feedback-001";

  it("teacher can see private feedback; student cannot", async () => {
    await addFeedback(SUB_ID, TEACHER_ID, { comment: "Public comment", isPrivate: false });
    await addFeedback(SUB_ID, TEACHER_ID, { comment: "Private note", isPrivate: true });

    const teacherView = await listFeedback(SUB_ID, true);
    expect(teacherView.length).toBe(2);

    const studentView = await listFeedback(SUB_ID, false);
    expect(studentView.length).toBe(1);
    expect(studentView[0].comment).toBe("Public comment");
    expect(studentView.some((f) => f.isPrivate)).toBe(false);
  });

  it("feedback supports optional file and line reference", async () => {
    const item = await addFeedback(SUB_ID, TEACHER_ID, {
      comment: "Off-by-one error here",
      fileName: "main.cpp",
      lineNumber: 42,
      isPrivate: false,
    });
    expect(item.fileName).toBe("main.cpp");
    expect(item.lineNumber).toBe(42);
  });
});

// ==============================================================================
// 9. Group contribution reports
// ==============================================================================

describe("Group contribution reports", () => {
  it("aggregates save and run events per group member", async () => {
    const MEMBER_1 = "member-1";
    const MEMBER_2 = "member-2";

    // Record events for both members
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: MEMBER_1, eventType: "save", metadata: {} });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: MEMBER_1, eventType: "save", metadata: {} });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: MEMBER_1, eventType: "run", metadata: {} });
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: MEMBER_2, eventType: "save", metadata: {} });

    const report = await computeGroupContributionReport("sub-group-01", GROUP_ID, ASSIGNMENT_ID, [MEMBER_1, MEMBER_2]);

    const m1 = report.contributions.find((c) => c.studentId === MEMBER_1)!;
    const m2 = report.contributions.find((c) => c.studentId === MEMBER_2)!;

    expect(m1.saveEventCount).toBe(2);
    expect(m1.runEventCount).toBe(1);
    expect(m1.totalEventCount).toBe(3);
    expect(m2.saveEventCount).toBe(1);
    expect(m2.totalEventCount).toBe(1);
  });

  it("members not in the group are excluded from the report", async () => {
    const OUTSIDER = "outsider-student";
    await recordActivityEvent({ assignmentId: ASSIGNMENT_ID, actorId: OUTSIDER, eventType: "save", metadata: {} });

    const report = await computeGroupContributionReport("sub-group-02", GROUP_ID, ASSIGNMENT_ID, [STUDENT_A, STUDENT_B]);
    const ids = report.contributions.map((c) => c.studentId);
    expect(ids).not.toContain(OUTSIDER);
  });
});

// ==============================================================================
// 10. Sandbox timeout protection
// ==============================================================================

describe("Execution client sandbox stub", () => {
  it("stub returning timeout marks timedOut=true", async () => {
    _setSandboxStub(async () => ({
      stdout: "",
      stderr: "Time limit exceeded",
      exitCode: 124,
      durationMs: 10000,
      timedOut: true,
    }));

    const { runInSandboxSafe } = await import("./executionClient");
    const result = await runInSandboxSafe({ files: makeFiles("while(1){}"), language: "cpp" });
    expect(result.timedOut).toBe(true);
  });

  it("ExecutionError has correct kind", () => {
    const err = new ExecutionError("Timed out", "timeout");
    expect(err.kind).toBe("timeout");
    expect(err.name).toBe("ExecutionError");
  });
});

// ==============================================================================
// 11. Rubrics
// ==============================================================================

describe("Rubrics", () => {
  it("creates and retrieves a rubric with correct items", async () => {
    const rubric = await upsertRubric(ASSIGNMENT_ID, {
      items: [
        { description: "Correctness", maxPoints: 70 },
        { description: "Code quality", maxPoints: 30 },
      ],
    });
    expect(rubric.items.length).toBe(2);
    expect(rubric.items[0].maxPoints).toBe(70);
    expect(rubric.items[1].description).toBe("Code quality");

    const fetched = await getRubric(ASSIGNMENT_ID);
    expect(fetched).not.toBeNull();
    expect(fetched!.items.length).toBe(2);
  });

  it("upsert replaces existing rubric items", async () => {
    await upsertRubric(ASSIGNMENT_ID, { items: [{ description: "Old", maxPoints: 100 }] });
    const updated = await upsertRubric(ASSIGNMENT_ID, { items: [{ description: "New A", maxPoints: 60 }, { description: "New B", maxPoints: 40 }] });
    expect(updated.items.length).toBe(2);
    expect(updated.items[0].description).toBe("New A");
  });
});
