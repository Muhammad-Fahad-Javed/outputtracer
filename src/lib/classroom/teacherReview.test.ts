import { beforeEach, describe, expect, it } from "vitest";
import { _resetVersioningMemory, createSubmissionSnapshot, saveCodeVersion } from "./versioningService";
import { _resetGradingMemory, autoGradeSubmission, getGrade, manualGradeSubmission } from "./gradingService";
import { _clearSandboxStub, _setSandboxStub } from "./executionClient";
async function handIn(source = "int main(){return 0;}") {
  const version = await saveCodeVersion({ assignmentId: "review-a", studentId: "student", language: "cpp", codeFiles: { "main.cpp": source } });
  return createSubmissionSnapshot({ submissionId: "review-s", assignmentId: "review-a", studentId: "student", versionId: version.id, codeFiles: version.codeFiles, isLate: false });
}
beforeEach(() => { _resetVersioningMemory(); _resetGradingMemory(); _clearSandboxStub(); });
describe("grades apply to reviewed immutable work", () => {
  it("rejects a stale hand-in without changing its existing grade", async () => {
    const first = await handIn();
    const grade = await manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: first.id, manualPoints: 42, maxPoints: 60, gradeMode: "manual" });
    await handIn("int main(){return 1;}");
    await expect(manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: first.id, manualPoints: 55, maxPoints: 60, gradeMode: "manual" })).rejects.toThrow("submitted newer work");
    expect(await getGrade("review-s")).toEqual(grade);
  });
  it("uses the assignment maximum and accepts a valid zero grade", async () => {
    const snapshot = await handIn();
    await expect(manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: snapshot.id, manualPoints: 61, maxPoints: 60 })).rejects.toThrow("between 0 and 60");
    await expect(manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: snapshot.id, manualPoints: -1, maxPoints: 60 })).rejects.toThrow();
    expect(await getGrade("review-s")).toBeNull();
    expect(await manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: snapshot.id, manualPoints: 0, maxPoints: 60, gradeMode: "manual" })).toMatchObject({ totalPoints: 0, maxPoints: 60, snapshotId: snapshot.id });
  });
  it("explicit manual grading replaces previous automatic points instead of adding them twice", async () => {
    const snapshot = await handIn();
    _setSandboxStub(async () => ({ stdout: "ok", stderr: "", exitCode: 0, durationMs: 1, timedOut: false }));
    await autoGradeSubmission({ submissionId: "review-s", assignmentId: "review-a", teacherId: "teacher", publicTests: [{ id: "test", name: "example", stdin: "", expectedOutput: "ok", points: 100 }], hiddenTests: [], language: "cpp", maxPoints: 100 });
    expect(await manualGradeSubmission("teacher", { submissionId: "review-s", expectedSnapshotId: snapshot.id, manualPoints: 40, maxPoints: 60, gradeMode: "manual" })).toMatchObject({ autoTestPoints: 0, totalPoints: 40, maxPoints: 60 });
  });
});
