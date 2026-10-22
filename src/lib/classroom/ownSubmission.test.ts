import { beforeEach, describe, expect, it } from "vitest";
import {
  assignStudentToGroup,
  createClassroom,
  createClassroomGroup,
  joinClassroomByCode,
  listCallerGroupIds,
  _resetClassroomMemory,
} from "./classroomService";
import { pickOwnSubmission } from "./ownSubmission";
import { _resetMemoryStores, _setMemoryTeacherProfile } from "./roles";

describe("own submission selection", () => {
  it("prefers the caller's row and ignores another student's submission", () => {
    const rows = [
      { id: "other", student_id: "student-b", group_id: null, submitted_at: "2026-01-02" },
      { id: "mine", student_id: "student-a", group_id: null, submitted_at: "2026-01-01" },
    ];
    expect(pickOwnSubmission(rows, "student-a", [])?.id).toBe("mine");
  });

  it("returns the latest group submission when the caller belongs to that group", () => {
    const rows = [
      { id: "old", student_id: null, group_id: "group-1", submitted_at: "2026-01-01" },
      { id: "new", student_id: null, group_id: "group-1", submitted_at: "2026-02-01" },
      { id: "foreign", student_id: null, group_id: "group-2", submitted_at: "2026-03-01" },
    ];
    expect(pickOwnSubmission(rows, "student-a", ["group-1"])?.id).toBe("new");
  });

  it("returns null when the only submission belongs to another group", () => {
    const rows = [{ id: "foreign", student_id: null, group_id: "group-2", submitted_at: "2026-03-01" }];
    expect(pickOwnSubmission(rows, "student-a", ["group-1"])).toBeNull();
  });
});

describe("listCallerGroupIds", () => {
  beforeEach(() => {
    _resetMemoryStores();
    _resetClassroomMemory();
  });

  it("lists only groups in this classroom that include the caller", async () => {
    const teacherId = "teacher-groups";
    const studentId = "student-groups";
    _setMemoryTeacherProfile(teacherId, {
      userId: teacherId,
      status: "approved",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const created = await createClassroom(teacherId, { name: "Systems", subject: "C++" });
    expect(created.success).toBe(true);
    const classId = created.classroom!.id;
    const joined = await joinClassroomByCode(studentId, created.classroom!.joinCode);
    expect(joined.success).toBe(true);
    const group = await createClassroomGroup(teacherId, classId, "Pair A");
    expect(group.success).toBe(true);
    const assigned = await assignStudentToGroup(teacherId, classId, group.group!.id, studentId);
    expect(assigned.success).toBe(true);

    await expect(listCallerGroupIds(studentId, classId)).resolves.toEqual([group.group!.id]);
    await expect(listCallerGroupIds("someone-else", classId)).resolves.toEqual([]);
  });
});
