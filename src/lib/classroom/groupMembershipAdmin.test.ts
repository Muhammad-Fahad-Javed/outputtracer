import { beforeEach, describe, expect, it, vi } from "vitest";

const state: Record<string, Array<Record<string, unknown>>> = {};
const admin = {
  from(table: string) {
    const filters: { op: "eq" | "in" | "is"; col: string; val: unknown }[] = [];
    let operation: "select" | "delete" | "upsert" = "select";
    let row: Record<string, unknown> | null = null;
    const matches = (record: Record<string, unknown>) => filters.every((filter) => {
      if (filter.op === "is") return record[filter.col] == null;
      if (filter.op === "eq") return record[filter.col] === filter.val;
      return Array.isArray(filter.val) && (filter.val as unknown[]).includes(record[filter.col]);
    });
    const rows = () => (state[table] || []).filter(matches);
    const finish = () => {
      if (!state[table]) state[table] = [];
      if (operation === "delete") {
        state[table] = state[table].filter((record) => !matches(record));
        return { data: null, error: null };
      }
      if (operation === "upsert" && row) {
        const index = state[table].findIndex(
          (record) => record.group_id === row?.group_id && record.user_id === row?.user_id
        );
        if (index === -1) state[table].push({ ...row });
        return { data: row, error: null };
      }
      return { data: rows(), error: null };
    };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = () => chain();
    builder.delete = () => {
      operation = "delete";
      return chain();
    };
    builder.upsert = (value: Record<string, unknown>) => {
      operation = "upsert";
      row = value;
      return chain();
    };
    builder.insert = () => chain();
    builder.eq = (col: string, val: unknown) => {
      filters.push({ op: "eq", col, val });
      return chain();
    };
    builder.is = (col:string,val:unknown)=>{filters.push({op:"is",col,val});return chain();};
    builder.filter = (col:string,op:"eq"|"is",val:unknown)=>{filters.push({op,col,val});return chain();};
    builder.in = (col: string, val: unknown) => {
      filters.push({ op: "in", col, val });
      return chain();
    };
    builder.order = () => chain();
    builder.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    builder.single = async () => {
      const found = rows();
      if (found.length !== 1) return { data: null, error: { message: "not found" } };
      return { data: found[0], error: null };
    };
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(finish()).then(resolve, reject);
    return builder;
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin,
}));

import {
  assignStudentToGroup,
  listClassroomGroups,
  removeClassroomMember,
  removeStudentFromGroup,
} from "./classroomService";
import { _resetMemoryStores, _setMemoryTeacherProfile } from "./roles";

const teacher = "teacher-admin-1";
const student = "student-admin-1";
const classId = "class-admin-1";
const groupA = "group-admin-a";
const groupB = "group-admin-b";

describe("group membership on the service-role client", () => {
  beforeEach(() => {
    _resetMemoryStores();
    const now = new Date().toISOString();
    _setMemoryTeacherProfile(teacher, {
      userId: teacher,
      status: "approved",
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    for (const key of Object.keys(state)) delete state[key];
    state.classrooms = [{
      id: classId,
      teacher_id: teacher,
      name: "Admin class",
      subject: "C++",
      description: "",
      join_code: "OT-ADMIN1",
      is_archived: false,
      settings: {},
      created_at: now,
      updated_at: now,
    }];
    state.classroom_members = [
      { classroom_id: classId, user_id: teacher, role: "teacher", joined_at: now },
      { classroom_id: classId, user_id: student, role: "student", joined_at: now },
    ];
    state.classroom_groups = [
      { id: groupA, classroom_id: classId, name: "A", created_at: now },
      { id: groupB, classroom_id: classId, name: "B", created_at: now },
    ];
    state.classroom_group_members = [
      { group_id: groupA, user_id: student },
      { group_id: groupB, user_id: student },
    ];
  });

  it("moves a student onto one group and drops every membership when they leave the class", async () => {
    const assigned = await assignStudentToGroup(teacher, classId, groupB, student);
    expect(assigned.success).toBe(true);
    expect(state.classroom_group_members).toEqual([{ group_id: groupB, user_id: student }]);

    const listed = await listClassroomGroups(teacher, classId);
    expect(listed.groups?.find((group) => group.id === groupA)?.members).toEqual([]);
    expect(listed.groups?.find((group) => group.id === groupB)?.members?.map((member) => member.userId)).toEqual([student]);

    const removed = await removeStudentFromGroup(teacher, classId, groupB, student);
    expect(removed.success).toBe(true);
    expect(state.classroom_group_members).toEqual([]);

    state.classroom_group_members = [
      { group_id: groupA, user_id: student },
      { group_id: groupB, user_id: student },
    ];
    const dropped = await removeClassroomMember(teacher, classId, student);
    expect(dropped.success).toBe(true);
    expect(state.classroom_group_members).toEqual([]);
    expect(state.classroom_members.some((member) => member.user_id === student)).toBe(false);
  });

  it("does not write a group from another class", async () => {
    state.classroom_groups.push({
      id: "group-other",
      classroom_id: "class-other",
      name: "Other",
      created_at: new Date().toISOString(),
    });
    const assigned = await assignStudentToGroup(teacher, classId, "group-other", student);
    expect(assigned.success).toBe(false);
    expect(assigned.error).toMatch(/group not found/i);
    expect(state.classroom_group_members.some((member) => member.group_id === "group-other")).toBe(false);
  });
});
