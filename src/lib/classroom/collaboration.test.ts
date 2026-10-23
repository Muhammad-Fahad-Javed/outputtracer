import { CLASSROOM_LANGUAGES } from "./languages";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { base64ToBytes, bytesToBase64 } from "@/lib/cloud/base64";
import { getHub } from "@/lib/cloud/collabHub";
import { classroomExecutionRequest, clampTimeLimitMs } from "./assignmentPolicy";
import { actorForClassroomRequest } from "./classroomActor";
import { executeResolvedClassroom } from "./classroomRun";
import { signClassroomCollabToken } from "./collabToken";
import {
  classroomDocumentKey,
  chooseCanonicalFiles,
  readClassroomDocument,
  resolveClassroomDocument,
  writeClassroomDocument,
  _resetClassroomDocuments,
} from "./documents";
import { _clearSandboxStub, _setSandboxStub } from "./executionClient";
import {
  _resetMemoryStores,
  _setMemoryTeacherProfile,
} from "./roles";
import { _resetMemorySubmissions } from "./submissionMemory";
import { _resetVersioningMemory } from "./versioningService";
import {
  _resetClassroomMemory,
  _setMemoryMemberLabel,
  assignStudentToGroup,
  callerCanUseGroup,
  createAssignment,
  createClassroom,
  createClassroomGroup,
  getAssignment,
  joinClassroomByCode,
  listClassroomGroups,
  removeClassroomMember,
  removeStudentFromGroup,
  updateAssignmentPolicy,
} from "./classroomService";

const teacherA = "teacher-uuid-001";
const teacherB = "teacher-uuid-002";
const student1 = "student-uuid-101";
const student2 = "student-uuid-102";
const outsider = "student-uuid-999";

function approve(userId: string) {
  const now = new Date().toISOString();
  _setMemoryTeacherProfile(userId, {
    userId,
    status: "approved",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function fakeSocket() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    OPEN: 1,
    readyState: 1,
    sent: [] as string[],
    send(data: string) {
      this.sent.push(String(data));
    },
    close() {
      this.readyState = 3;
    },
    on(event: string, fn: (...args: unknown[]) => void) {
      (handlers[event] ||= []).push(fn);
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of handlers[event] || []) fn(...args);
    },
  };
}

async function waitForType(ws: ReturnType<typeof fakeSocket>, type: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (ws.sent.some((raw) => {
      try {
        return JSON.parse(raw).type === type;
      } catch {
        return false;
      }
    })) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${type}: ${ws.sent.join(" | ")}`);
}

describe("classroom collaboration", () => {
  beforeEach(() => {
    _resetMemoryStores();
    _resetClassroomMemory();
    _resetClassroomDocuments();
    _resetVersioningMemory();
    _resetMemorySubmissions();
    _clearSandboxStub();
    getHub().closeAllForTests();
    approve(teacherA);
    approve(teacherB);
  });

  afterEach(() => {
    _clearSandboxStub();
    getHub().closeAllForTests();
  });

  describe("group membership", () => {
    it("lists members, keeps one group per student, and removes memberships with the class", async () => {
      const created = await createClassroom(teacherA, { name: "Lab" });
      const classId = created.classroom!.id;
      await joinClassroomByCode(student1, created.classroom!.joinCode);
      await joinClassroomByCode(student2, created.classroom!.joinCode);
      _setMemoryMemberLabel(classId, student1, "Ada", "ada@school.edu");
      const alpha = await createClassroomGroup(teacherA, classId, "Alpha");
      const beta = await createClassroomGroup(teacherA, classId, "Beta");

      expect((await assignStudentToGroup(teacherA, classId, alpha.group!.id, student1)).success).toBe(true);
      expect((await assignStudentToGroup(teacherA, classId, beta.group!.id, student1)).success).toBe(true);
      expect(await callerCanUseGroup(student1, classId, alpha.group!.id)).toBe(false);
      expect(await callerCanUseGroup(student1, classId, beta.group!.id)).toBe(true);

      await assignStudentToGroup(teacherA, classId, alpha.group!.id, student2);
      const listed = await listClassroomGroups(teacherA, classId);
      const alphaView = listed.groups?.find((group) => group.id === alpha.group!.id);
      const betaView = listed.groups?.find((group) => group.id === beta.group!.id);
      expect(alphaView?.members?.map((member) => member.userId)).toEqual([student2]);
      expect(betaView?.members?.map((member) => member.displayName)).toEqual(["Ada"]);
      expect(betaView?.memberCount).toBe(1);

      expect((await removeStudentFromGroup(student1, classId, beta.group!.id, student1)).success).toBe(false);
      expect((await removeStudentFromGroup(teacherA, classId, beta.group!.id, student1)).success).toBe(true);
      expect(await callerCanUseGroup(student1, classId, beta.group!.id)).toBe(false);

      await assignStudentToGroup(teacherA, classId, beta.group!.id, student1);
      expect((await removeClassroomMember(teacherA, classId, student1)).success).toBe(true);
      expect(await callerCanUseGroup(student1, classId, beta.group!.id)).toBe(false);
      const after = await listClassroomGroups(teacherA, classId);
      expect(after.groups?.every((group) => !group.members?.some((member) => member.userId === student1))).toBe(true);
    });

    it("rejects a group that belongs to another class", async () => {
      const home = await createClassroom(teacherA, { name: "Home" });
      const other = await createClassroom(teacherB, { name: "Other" });
      await joinClassroomByCode(student1, home.classroom!.joinCode);
      const foreign = await createClassroomGroup(teacherB, other.classroom!.id, "Foreign");
      const assigned = await assignStudentToGroup(teacherA, home.classroom!.id, foreign.group!.id, student1);
      expect(assigned.success).toBe(false);
      expect(assigned.error).toMatch(/group not found/i);
      expect(await callerCanUseGroup(student1, other.classroom!.id, foreign.group!.id)).toBe(false);
    });

    it("still lists every group when a class has many of them", async () => {
      const created = await createClassroom(teacherA, { name: "Large" });
      const classId = created.classroom!.id;
      for (let index = 0; index < 25; index += 1) {
        expect((await createClassroomGroup(teacherA, classId, `Group ${index + 1}`)).success).toBe(true);
      }
      const listed = await listClassroomGroups(teacherA, classId);
      expect(listed.groups).toHaveLength(25);
      expect(listed.groups?.every((group) => Array.isArray(group.members) && group.memberCount === 0)).toBe(true);
    });
  });

  describe("documents and freeze", () => {
    it("selects a personal document or one shared group document", async () => {
      const created = await createClassroom(teacherA, { name: "Docs" });
      const classId = created.classroom!.id;
      await joinClassroomByCode(student1, created.classroom!.joinCode);
      await joinClassroomByCode(student2, created.classroom!.joinCode);
      const personal = await createAssignment(teacherA, classId, { title: "Solo", isPublished: true });
      const project = await createAssignment(teacherA, classId, {
        title: "Team",
        isPublished: true,
        groupMode: true,
      });
      const group = await createClassroomGroup(teacherA, classId, "Pair");
      await assignStudentToGroup(teacherA, classId, group.group!.id, student1);
      await assignStudentToGroup(teacherA, classId, group.group!.id, student2);

      const mine = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId: personal.assignment!.id,
        isTeacher: false,
      });
      const theirs = await resolveClassroomDocument({
        actorId: student2,
        classroomId: classId,
        assignmentId: personal.assignment!.id,
        isTeacher: false,
      });
      expect(mine.ok && theirs.ok).toBe(true);
      if (mine.ok && theirs.ok) {
        expect(mine.doc.docKey).toBe(classroomDocumentKey(personal.assignment!.id, { studentId: student1 }));
        expect(mine.doc.docKey).not.toBe(theirs.doc.docKey);
        expect(mine.doc.role).toBe("editor");
        expect(mine.doc.publicTestCases).toBeDefined();
        expect(mine.doc).not.toHaveProperty("hiddenTestCases");
      }

      const blocked = await resolveClassroomDocument({
        actorId: outsider,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
      });
      expect(blocked.ok).toBe(false);

      const ungrouped = await createClassroom(teacherA, { name: "Other class" });
      await joinClassroomByCode(outsider, ungrouped.classroom!.joinCode);
      const noGroup = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
      });
      // student1 is in the group; outsider in this class is not enrolled.
      expect(noGroup.ok).toBe(true);

      const stranger = await resolveClassroomDocument({
        actorId: outsider,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
      });
      expect(stranger.ok).toBe(false);
      if (!stranger.ok) expect(stranger.code).toBeUndefined();

      const notMember = await joinClassroomByCode(outsider, created.classroom!.joinCode);
      expect(notMember.success).toBe(true);
      const empty = await resolveClassroomDocument({
        actorId: outsider,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
      });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.code).toBe("no-group");

      const first = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
      });
      const second = await resolveClassroomDocument({
        actorId: student2,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: false,
        groupId: group.group!.id,
      });
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) expect(first.doc.docKey).toBe(second.doc.docKey);

      const teacher = await resolveClassroomDocument({
        actorId: teacherA,
        classroomId: classId,
        assignmentId: project.assignment!.id,
        isTeacher: true,
        groupId: group.group!.id,
      });
      expect(teacher.ok).toBe(true);
      if (teacher.ok) {
        expect(teacher.doc.role).toBe("viewer");
        expect(teacher.doc.docKey).toBe(first.ok ? first.doc.docKey : "");
      }
    });

    it("freezes students after the due date or an explicit lock, and lets the teacher run", async () => {
      const created = await createClassroom(teacherA, { name: "Freeze" });
      const classId = created.classroom!.id;
      await joinClassroomByCode(student1, created.classroom!.joinCode);
      const past = new Date(Date.now() - 60_000).toISOString();
      const assignment = await createAssignment(teacherA, classId, {
        title: "Locked lab",
        isPublished: true,
        dueDate: past,
        allowLate: false,
        allowRun: true,
        publicTestCases: [{ id: "public-1", name: "Public", stdin: "PUBLIC", expectedOutput: "ok", points: 1 }],
        hiddenTestCases: [{ id: "hidden-1", name: "Hidden", stdin: "HIDDEN_SECRET", expectedOutput: "nope", points: 1, isHidden: true }],
      });
      const assignmentId = assignment.assignment!.id;
      const seen = await getAssignment(student1, classId, assignmentId);
      expect(seen.assignment?.hiddenTestCases).toBeUndefined();
      expect(seen.assignment?.allowRun).toBe(true);

      const frozen = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId,
        isTeacher: false,
      });
      expect(frozen.ok).toBe(true);
      if (frozen.ok) {
        expect(frozen.doc.frozen).toBe(true);
        expect(frozen.doc.role).toBe("viewer");
      }
      const studentRun = await executeResolvedClassroom({
        actorId: student1,
        isTeacher: false,
        classroomId: classId,
        assignmentId,
      });
      expect(studentRun.status).toBe(403);

      const calls: string[] = [];
      _setSandboxStub(async (req) => {
        calls.push(req.stdin || "");
        expect(req).not.toHaveProperty("trace");
        expect(req.language).toBe("cpp");
        expect(req.files["main.cpp"]).toContain("LIVE");
        expect(req.timeLimitMs).toBeLessThanOrEqual(10_000);
        return { stdout: "ok\n", stderr: "", exitCode: 0, durationMs: 1, timedOut: false };
      });
      const docKey = classroomDocumentKey(assignmentId, { studentId: student1 })!;
      await writeClassroomDocument({
        docKey,
        classroomId: classId,
        assignmentId,
        studentId: student1,
        stateB64: "",
        files: { "main.cpp": "LIVE\n" },
        updatedAt: new Date().toISOString(),
      });
      const teacherRun = await executeResolvedClassroom({
        actorId: teacherA,
        isTeacher: true,
        classroomId: classId,
        assignmentId,
        studentId: student1,
        runTests: true,
      });
      expect(teacherRun.status).toBe(200);
      expect(calls).toContain("PUBLIC");
      expect(calls.join("\n")).not.toContain("HIDDEN_SECRET");

      const opened = await updateAssignmentPolicy(teacherA, classId, assignmentId, { allowLate: true, locked: false });
      expect(opened.assignment?.locked).toBe(false);
      expect(opened.assignment?.allowLate).toBe(true);
      const reopened = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId,
        isTeacher: false,
      });
      expect(reopened.ok).toBe(true);
      if (reopened.ok) {
        expect(reopened.doc.frozen).toBe(false);
        expect(reopened.doc.role).toBe("editor");
      }

      const locked = await updateAssignmentPolicy(teacherA, classId, assignmentId, { locked: true, allowRun: false, timeLimitMs: 999999 });
      expect(locked.assignment?.timeLimitMs).toBe(10_000);
      expect(locked.assignment?.allowTrace).toBe(false);
      const lockedView = await resolveClassroomDocument({
        actorId: student1,
        classroomId: classId,
        assignmentId,
        isTeacher: false,
      });
      expect(lockedView.ok).toBe(true);
      if (lockedView.ok) expect(lockedView.doc.frozen).toBe(true);
      const blockedRun = await executeResolvedClassroom({
        actorId: student1,
        isTeacher: false,
        classroomId: classId,
        assignmentId,
      });
      expect(blockedRun.status).toBe(403);

      const unlocked = await updateAssignmentPolicy(teacherA, classId, assignmentId, {
        locked: false,
        allowLate: true,
        allowRun: false,
        allowTrace: true,
        timeLimitMs: 5,
      });
      expect(unlocked.assignment?.timeLimitMs).toBe(clampTimeLimitMs(5));
      expect(unlocked.assignment?.allowTrace).toBe(true);
      const noRun = await executeResolvedClassroom({
        actorId: student1,
        isTeacher: false,
        classroomId: classId,
        assignmentId,
      });
      expect(noRun.body.code).toBe("run-disabled");
      const request = classroomExecutionRequest({ "main.cpp": "int main(){return 0;}" }, 999999, "");
      expect(request).toEqual({
        files: { "main.cpp": "int main(){return 0;}" },
        language: "cpp",
        stdin: "",
        timeLimitMs: 10_000,
      });
      expect(chooseCanonicalFiles({ "main.cpp": "live" }, { "main.cpp": "stored" }, { "main.cpp": "starter" })["main.cpp"]).toBe("live");
      expect((await readClassroomDocument(docKey))?.files["main.cpp"]).toBe("LIVE\n");
    });
  });

  describe("live room", () => {
    it.each(["cpp", "python", "asm8086"] as const)("shares a %s group document and rejects edits after lock", async (language) => {
      const entryFile = CLASSROOM_LANGUAGES[language].file;
      const created = await createClassroom(teacherA, { name: "Live" });
      const classId = created.classroom!.id;
      await joinClassroomByCode(student1, created.classroom!.joinCode);
      await joinClassroomByCode(student2, created.classroom!.joinCode);
      const group = await createClassroomGroup(teacherA, classId, "Live group");
      await assignStudentToGroup(teacherA, classId, group.group!.id, student1);
      await assignStudentToGroup(teacherA, classId, group.group!.id, student2);
      const assignment = await createAssignment(teacherA, classId, {
        title: "Shared",
        language,
        isPublished: true,
        groupMode: true,
      });
      const assignmentId = assignment.assignment!.id;
      const docKey = classroomDocumentKey(assignmentId, { groupId: group.group!.id })!;

      const first = fakeSocket();
      getHub().attach(first as never);
      first.emit("message", JSON.stringify({
        type: "join",
        kind: "classroom",
        token: signClassroomCollabToken({
          userId: student1,
          displayName: "Ada",
          classId,
          assignmentId,
          groupId: group.group!.id,
        }),
        clientId: 11,
      }));
      await waitForType(first, "init");
      const init = JSON.parse(first.sent.find((raw) => JSON.parse(raw).type === "init")!);
      expect(init.role).toBe("editor");

      const local = new Y.Doc();
      let update: Uint8Array | null = null;
      local.on("update", (bytes: Uint8Array, origin: unknown) => {
        if (origin !== "hydrate") update = bytes;
      });
      Y.applyUpdate(local, base64ToBytes(init.state), "hydrate");
      const text = local.getMap("files").get(entryFile) as Y.Text;
      text.insert(0, "/*live*/\n");
      first.emit("message", JSON.stringify({ type: "update", update: bytesToBase64(update!) }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(getHub().peekClassroomFiles(docKey)?.[entryFile]).toContain("/*live*/");

      const second = fakeSocket();
      getHub().attach(second as never);
      second.emit("message", JSON.stringify({
        type: "join",
        kind: "classroom",
        token: signClassroomCollabToken({
          userId: student2,
          displayName: "Bea",
          classId,
          assignmentId,
          groupId: group.group!.id,
        }),
        clientId: 22,
      }));
      await waitForType(second, "init");
      const secondInit = JSON.parse(second.sent.find((raw) => JSON.parse(raw).type === "init")!);
      const reader = new Y.Doc();
      Y.applyUpdate(reader, base64ToBytes(secondInit.state));
      expect((reader.getMap("files").get(entryFile) as Y.Text).toString()).toContain("/*live*/");
      expect(getHub().classroomPresence(docKey).map((person) => person.userId).sort()).toEqual([student1, student2]);

      await updateAssignmentPolicy(teacherA, classId, assignmentId, { locked: true });
      text.insert(0, "/*nope*/\n");
      first.emit("message", JSON.stringify({ type: "update", update: bytesToBase64(update!) }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(getHub().peekClassroomFiles(docKey)?.[entryFile]).not.toContain("/*nope*/");
      expect(first.sent.some((raw) => JSON.parse(raw).type === "locked")).toBe(true);

      const teacher = fakeSocket();
      getHub().attach(teacher as never);
      teacher.emit("message", JSON.stringify({
        type: "join",
        kind: "classroom",
        token: signClassroomCollabToken({
          userId: teacherA,
          displayName: "Teacher",
          classId,
          assignmentId,
          groupId: group.group!.id,
        }),
        clientId: 33,
      }));
      await waitForType(teacher, "init");
      const teacherInit = JSON.parse(teacher.sent.find((raw) => JSON.parse(raw).type === "init")!);
      expect(teacherInit.role).toBe("viewer");
      teacher.emit("message", JSON.stringify({ type: "update", update: bytesToBase64(update!) }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(getHub().peekClassroomFiles(docKey)?.[entryFile]).not.toContain("/*nope*/");
    });
  });

  it("does not let a configured teacher pretend to be the sample student", () => {
    expect(actorForClassroomRequest({
      userId: teacherA,
      isTeacher: true,
      previewStudent: true,
      previewAllowed: false,
      previewStudentId: "local-preview-student",
    }).error).toMatch(/not available/i);
    expect(actorForClassroomRequest({
      userId: teacherA,
      isTeacher: true,
      previewStudent: true,
      previewAllowed: true,
      previewStudentId: "local-preview-student",
    })).toEqual({ actorId: "local-preview-student", isTeacher: false });
  });
});
