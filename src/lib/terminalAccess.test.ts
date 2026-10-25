import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), getClassroom: vi.fn(), resolveDoc: vi.fn(), loadFiles: vi.fn(), projectAccess: vi.fn(),
  setStandard: vi.fn(), readFiles: vi.fn(),
}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("./classroom/classroomService", () => ({ getClassroom: mocks.getClassroom }));
vi.mock("./classroom/documents", () => ({ resolveClassroomDocument: mocks.resolveDoc }));
vi.mock("./classroom/classroomRun", () => ({ loadCanonicalClassroomFiles: mocks.loadFiles }));
vi.mock("./cloud/accessToken", () => ({ accessFromToken: mocks.projectAccess }));
vi.mock("./cloud/collabHub", () => ({ getHub: () => ({ setStandard: mocks.setStandard, readFiles: mocks.readFiles }) }));
import { resolveTerminalPayload, monitorTerminalAccess } from "./terminalAccess";

const actorId = "11111111-1111-4111-8111-111111111111";
const classroom = { classId: "22222222-2222-4222-8222-222222222222", assignmentId: "33333333-3333-4333-8333-333333333333" };
const canonical = { "main.py": "print('canonical')" };
const doc = { docKey: "private-team-document", language: "python", frozen: false, allowRun: true, timeLimitMs: 10000 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  mocks.getClassroom.mockResolvedValue({ success: true, isTeacher: false });
  mocks.resolveDoc.mockResolvedValue({ ok: true, doc: { ...doc } });
  mocks.loadFiles.mockResolvedValue(canonical);
});
afterEach(() => vi.useRealTimers());

describe("terminal canonical classroom access", () => {
  it("ignores client classroom source and binds the authenticated actor and assignment language", async () => {
    const result = await resolveTerminalPayload({ classroom, accessToken: "real-user-token", language: "python", files: { "main.py": "print('forged')" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.files).toEqual(canonical);
    expect(result.payload.ownerKey).toBe(actorId);
    expect(result.payload.timeoutMs).toBe(120000);
    expect(result.payload.cpuTimeMs).toBe(10000);
    expect(mocks.resolveDoc).toHaveBeenCalledWith(expect.objectContaining({ actorId, isTeacher: false, assignmentId: classroom.assignmentId }));
  });

  it("rejects missing/forged tokens and invalid workspace identifiers before loading source", async () => {
    expect((await resolveTerminalPayload({ classroom })).ok).toBe(false);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect((await resolveTerminalPayload({ classroom, accessToken: "forged" })).ok).toBe(false);
    expect((await resolveTerminalPayload({ classroom: { ...classroom, groupId: "../other-team" }, accessToken: "t" })).ok).toBe(false);
    expect(mocks.loadFiles).not.toHaveBeenCalled();
  });

  it("denies unrelated classrooms, foreign teams and mismatched runtimes", async () => {
    mocks.getClassroom.mockResolvedValueOnce({ success: false });
    expect((await resolveTerminalPayload({ classroom, accessToken: "t" })).ok).toBe(false);
    mocks.resolveDoc.mockResolvedValueOnce({ ok: false, error: "Not your team" });
    expect((await resolveTerminalPayload({ classroom, accessToken: "t" })).ok).toBe(false);
    expect((await resolveTerminalPayload({ classroom, accessToken: "t", language: "cpp" })).ok).toBe(false);
    expect(mocks.loadFiles).not.toHaveBeenCalled();
  });

  it("enforces freeze and allowRun for students while retaining approved owning teacher access", async () => {
    mocks.resolveDoc.mockResolvedValue({ ok: true, doc: { ...doc, frozen: true } });
    expect((await resolveTerminalPayload({ classroom, accessToken: "t" })).ok).toBe(false);
    mocks.resolveDoc.mockResolvedValue({ ok: true, doc: { ...doc, allowRun: false } });
    expect((await resolveTerminalPayload({ classroom, accessToken: "t" })).ok).toBe(false);
    mocks.getClassroom.mockResolvedValue({ success: true, isTeacher: true });
    expect((await resolveTerminalPayload({ classroom, accessToken: "t" })).ok).toBe(true);
  });

  it("revalidates auth, team ownership, run permission and suspension during a session", async () => {
    const result = await resolveTerminalPayload({ classroom, accessToken: "t" });
    if (!result.ok) throw Error("expected allowed");
    expect(await result.payload.validateAccess!()).toBe(true);
    mocks.resolveDoc.mockResolvedValueOnce({ ok: true, doc: { ...doc, allowRun: false } });
    expect(await result.payload.validateAccess!()).toBe(false);
    mocks.resolveDoc.mockResolvedValueOnce({ ok: true, doc: { ...doc, docKey: "another-team" } });
    expect(await result.payload.validateAccess!()).toBe(false);
    mocks.getClassroom.mockResolvedValueOnce({ success: false, error: "Suspended teacher" });
    expect(await result.payload.validateAccess!()).toBe(false);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await result.payload.validateAccess!()).toBe(false);
  });

  it("keeps the existing anonymous C++ budget and binds Python guests to server identity", async () => {
    const result = await resolveTerminalPayload({ files: { "main.cpp": "int main(){}" } }, "server-ip");
    expect(result).toEqual({ ok: true, payload: { language: "cpp", files: { "main.cpp": "int main(){}" }, standard: undefined, ownerKey: undefined, validateAccess: undefined } });
    const python = await resolveTerminalPayload({ language: "python", files: canonical }, "server-ip");
    expect(python.ok && python.payload.ownerKey).toBe("server-ip");
  });

  it("binds valid standalone tokens to their actor and rejects invalid supplied tokens", async () => {
    const result = await resolveTerminalPayload({ files: { "main.cpp": "int main(){}" }, accessToken: "valid" }, "shared-nat");
    if (!result.ok) throw Error("expected actor access");
    expect(result.payload.ownerKey).toBe(actorId);
    expect(await result.payload.validateAccess!()).toBe(true);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "revoked" } });
    expect(await result.payload.validateAccess!()).toBe(false);
    expect((await resolveTerminalPayload({ files: canonical, accessToken: "invalid" })).ok).toBe(false);
    expect((await resolveTerminalPayload({ files: canonical, accessToken: "" })).ok).toBe(false);
  });
});

it("permission monitor closes revoked sessions and stops checking after disconnect", async () => {
  vi.useFakeTimers();
  const ws = new EventEmitter() as unknown as WebSocket;
  Object.assign(ws, { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn(() => { Object.assign(ws, { readyState: 3 }); ws.emit("close"); }) });
  const validate = vi.fn().mockResolvedValue(false);
  const cancel = vi.fn();
  monitorTerminalAccess(ws, validate, 50, cancel);
  await vi.advanceTimersByTimeAsync(50);
  expect(ws.close).toHaveBeenCalledWith(1008, "Execution permission changed");
  expect(cancel).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(200);
  expect(validate).toHaveBeenCalledTimes(1);
});
