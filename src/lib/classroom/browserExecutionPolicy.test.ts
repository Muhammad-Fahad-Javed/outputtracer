import { createClassroom, createAssignment, joinClassroomByCode } from "./classroomService";
import { _setMemoryTeacherProfile } from "./roles";
import { executeResolvedClassroom } from "./classroomRun";
import { describe, expect, it, vi } from "vitest";
import { autoGradeSubmission, getGrade, manualGradeSubmission } from "./gradingService";
import { saveCodeVersion, createSubmissionSnapshot, getSubmissionSnapshot } from "./versioningService";
import { packProjectSnapshot, snapshotInputAssets } from "./projectSnapshot";
import { runInSandbox } from "./executionClient";

describe("browser-only Assembly execution policy", () => {
  it("never executes Assembly on the server or treats unsupported instructions as a wrong answer", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      await expect(runInSandbox({ files: { "main.asm": "bits 16\norg 100h\nshl ax,1" }, language: "asm8086" })).rejects.toMatchObject({ kind: "sandbox_unavailable" });
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("refuses Assembly auto-grading before execution and does not save a zero grade", async () => {
    await expect(autoGradeSubmission({ submissionId: "browser-only-no-grade", assignmentId: "a", teacherId: "t", language: "asm8086", maxPoints: 100, publicTests: [], hiddenTests: [] })).rejects.toThrow("manual teacher review");
    expect(await getGrade("browser-only-no-grade")).toBeNull();
  });
  it("uses the immutable version language even if an internal caller supplies C++ and preserves manual grading", async () => {
    const assets = { "INPUT.BIN": { base64: "AAEC/w==" } };
    const payload = packProjectSnapshot({ "main.asm": "org 100h\nshl ax,1" }, assets);
    const version = await saveCodeVersion({ assignmentId: "browser-policy-assignment", studentId: "student", language: "asm8086", codeFiles: payload });
    const frozen = await createSubmissionSnapshot({ submissionId: "browser-policy-submission", versionId: version.id, assignmentId: version.assignmentId, studentId: "student", codeFiles: payload, isLate: false });
    await expect(autoGradeSubmission({ submissionId: frozen.submissionId, assignmentId: version.assignmentId, teacherId: "teacher", language: "cpp", maxPoints: 100, publicTests: [], hiddenTests: [] })).rejects.toThrow("manual teacher review");
    expect(await getGrade(frozen.submissionId)).toBeNull();
    const grade = await manualGradeSubmission("teacher", { submissionId: frozen.submissionId, manualPoints: 85, gradeMode: "manual" });
    expect(grade).toMatchObject({ versionId: version.id, snapshotId: frozen.id, totalPoints: 85 });
    expect(snapshotInputAssets((await getSubmissionSnapshot(frozen.submissionId))!.frozenCodeFiles)).toEqual(assets);
  });
  it("routes authorized classroom NASM execution to the browser without bypassing teacher restrictions", async () => {
    const now = new Date().toISOString();
    _setMemoryTeacherProfile("dos-policy-teacher", { userId: "dos-policy-teacher", status: "approved", verifiedAt: now, createdAt: now, updatedAt: now });
    const created = await createClassroom("dos-policy-teacher", { name: "Browser execution policy" });
    const classroomId = created.classroom!.id;
    await joinClassroomByCode("dos-policy-student", created.classroom!.joinCode);
    const assignment = await createAssignment("dos-policy-teacher", classroomId, { title: "DOSBox project", language: "asm8086", isPublished: true, allowRun: true });
    const outcome = await executeResolvedClassroom({ actorId: "dos-policy-student", isTeacher: false, classroomId, assignmentId: assignment.assignment!.id, runTests: true });
    expect(outcome).toMatchObject({ status: 409, body: { code: "browser_execution_required" } });
    const blocked = await createAssignment("dos-policy-teacher", classroomId, { title: "Run disabled", language: "asm8086", isPublished: true, allowRun: false });
    expect(await executeResolvedClassroom({ actorId: "dos-policy-student", isTeacher: false, classroomId, assignmentId: blocked.assignment!.id })).toMatchObject({ status: 403, body: { code: "run-disabled" } });
  });
});
