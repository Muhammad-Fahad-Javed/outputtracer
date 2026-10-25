import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true, teacher: true, classroom: true, assignment: true, database: true, error: null as object | null, calls: [] as unknown[][] }));
vi.mock("./requestUser", () => ({ classroomRequestUser: async () => state.authenticated ? { id: "teacher" } : null }));
vi.mock("./classroomService", () => ({
  getClassroom: async () => ({ success: state.classroom, isTeacher: state.teacher }),
  getAssignment: async () => ({ success: state.assignment, assignment: state.assignment ? { language: "asm8086", maxPoints: 60 } : null }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.database ? { from(table: string) {
  state.calls.push(["from", table]);
  const query = {
    select(columns: string) { state.calls.push(["select", columns]); return query; },
    eq(column: string, value: string) { state.calls.push(["eq", column, value]); return query; },
    in(column: string, value: string[]) { state.calls.push(["in", column, value]); return query; },
    order(column: string) { state.calls.push(["order", column]); return query; },
    limit() { return Promise.resolve({ error: state.error, data: [{ id: "submission", status: "submitted", submitted_at: "2026-10-25", is_late: false, student_id: "student", code_files: { secret: "must not be listed" } }] }); },
  };
  return query;
} } : null }));
import { GET } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/route";
const owner = "f2913664-c078-4b5c-a1e5-32a743a3b9df";
function request(query = `studentId=${owner}`) { return GET(new Request(`http://localhost/submissions?${query}`), { params: Promise.resolve({ classId: "class", assignmentId: "assignment" }) }); }
beforeEach(() => { Object.assign(state, { authenticated: true, teacher: true, classroom: true, assignment: true, database: true, error: null, calls: [] }); });
describe("teacher submission review boundaries", () => {
  it("requires authentication", async () => { state.authenticated = false; expect((await request()).status).toBe(401); expect(state.calls).toEqual([]); });
  it.each(["teacher", "classroom", "assignment"] as const)("denies missing %s access before reading submissions", async field => { state[field] = false; expect((await request()).status).toBe(403); expect(state.calls).toEqual([]); });
  it.each(["", `studentId=${owner}&groupId=${owner}`, "studentId=invalid"])("rejects an ambiguous or invalid owner: %s", async query => { expect((await request(query)).status).toBe(400); expect(state.calls).toEqual([]); });
  it("scopes the database query to assignment and owner and returns only safe metadata", async () => {
    const response = await request(`groupId=${owner}`);
    expect(response.status).toBe(200);
    expect(state.calls).toContainEqual(["eq", "assignment_id", "assignment"]);
    expect(state.calls).toContainEqual(["eq", "group_id", owner]);
    expect(await response.json()).toEqual({ success: true, submissions: [{ id: "submission", status: "submitted", submittedAt: "2026-10-25", isLate: false }], assignment: { language: "asm8086", maxPoints: 60 } });
  });
  it("reports persistence failure instead of presenting an empty list", async () => { state.error = { message: "failure" }; expect((await request()).status).toBe(500); });
  it("reports an unavailable database", async () => { state.database = false; expect((await request()).status).toBe(503); });
});
