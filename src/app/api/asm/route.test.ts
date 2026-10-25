import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { sessionManager, type AsmSession } from "@/lib/asm/session";
import { globalRateLimiter } from "@/lib/rateLimit";

let session: AsmSession;
function inspect(overrides: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost/api/asm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "inspect", sessionId: session.id, sessionToken: session.token, segment: 0x1000, offset: 0x100, length: 4, ...overrides }),
  }));
}

beforeEach(() => {
  globalRateLimiter.reset();
  session = sessionManager.createSession({ source: "org 100h\nmov ax,1234h\npush ax\nhlt" });
  expect(session.assembleSync().success).toBe(true);
});
afterEach(() => {
  sessionManager.deleteSession(session.id);
  vi.restoreAllMocks();
});

describe("ASM memory inspection", () => {
  it("returns the complete timeline after interactive input resumes", async () => {
    session.source = "org 100h\nmov ah,01h\nint 21h\nmov ax,4c00h\nint 21h";
    expect(session.assembleSync().success).toBe(true);
    session.run();
    expect(session.getStatus().state).toBe("waiting_for_input");
    const response = await POST(new Request("http://localhost/api/asm", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"input",sessionId:session.id,sessionToken:session.token,input:"A"})}));
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.status.stdout).toBe("A");
    expect(result.status.state).toBe("terminated");
    expect(result.trace.length).toBe(session.traceHistory.length);
    expect(result.trace.at(-1).terminated).toBe(true);
  });

  it("returns actual memory without advancing execution or recording memory accesses", async () => {
    session.cpu.writeByte(0x1000, 0x100, 0x41);
    session.cpu.writeByte(0x1000, 0x101, 0x00);
    const before = session.cpu.takeSnapshot();
    const read = vi.spyOn(session.cpu, "readByte");
    const response = await inspect({ length: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sessionId: session.id, segment: 0x1000, offset: 0x100, bytes: [0x41, 0x00] });
    expect(read.mock.calls).toEqual([[0x1000, 0x100, false], [0x1000, 0x101, false]]);
    expect(session.cpu.takeSnapshot()).toEqual(before);
    expect(session.executedSteps).toBe(0);
    expect(session.traceHistory).toHaveLength(0);
  });

  it("inspects real stack words and wraps an offset at the segment boundary", async () => {
    session.run(2);
    const response = await inspect({ segment: session.cpu.ss, offset: session.cpu.sp, length: 2 });
    expect((await response.json()).bytes).toEqual([0x34, 0x12]);
    session.cpu.writeByte(0x1000, 0xffff, 0xaa);
    session.cpu.writeByte(0x1000, 0, 0xbb);
    const wrapped = await inspect({ offset: 0xffff, length: 2 });
    expect((await wrapped.json()).bytes).toEqual([0xaa, 0xbb]);
  });

  it.each([
    { segment: -1 }, { segment: 0x10000 }, { segment: "1000" }, { segment: 1.5 },
    { offset: -1 }, { offset: 0x10000 }, { offset: null },
    { length: 0 }, { length: 257 }, { length: 1.5 }, { length: "128" },
  ])("rejects an invalid address or unbounded read: %j", async (fields) => {
    expect((await inspect(fields)).status).toBe(400);
  });

  it("accepts the bounded maximum and defaults to 128 bytes", async () => {
    expect((await (await inspect({ length: 256 })).json()).bytes).toHaveLength(256);
    expect((await (await inspect({ length: undefined })).json()).bytes).toHaveLength(128);
  });

  it("requires the existing session token and keeps classroom sessions protected", async () => {
    expect((await inspect({ sessionToken: "incorrect" })).status).toBe(404);
    expect((await inspect({ sessionToken: undefined })).status).toBe(404);
    session.scope = { actorId: "actor", docKey: "doc", classId: "class", assignmentId: "assignment", sourceRevision: "revision" };
    expect((await inspect()).status).toBe(403);
  });
});
