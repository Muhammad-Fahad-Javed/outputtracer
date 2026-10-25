import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), readFiles: vi.fn(), setStandard: vi.fn(), compile: vi.fn() }));
vi.mock("@/lib/cppRunner", () => ({ compileAndRun: mocks.compile }));
vi.mock("@/lib/cloud/accessSession", () => ({ accessFromCookies: mocks.access }));
vi.mock("@/lib/cloud/collabHub", () => ({ getHub: () => ({ readFiles: mocks.readFiles, setStandard: mocks.setStandard }) }));
vi.mock("@/lib/rateLimit", () => ({ clientIpFromForwarded: () => "test", globalRateLimiter: { check: () => ({ ok: true }) } }));
import { POST } from "@/app/api/predict/route";

function request() { return new Request("http://localhost/api/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "project", standard: "c++20", files: { "main.cpp": "forged source" } }) }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ userId: "student", role: "editor" });
  mocks.compile.mockResolvedValue({ status: "success", stdout: "ok" });
});

describe("saved project C++ runner boundary", () => {
  it.each(["python", "asm8086"])("rejects canonical %s projects before compiling or changing settings", async (language) => {
    mocks.readFiles.mockResolvedValue({ language, standard: null, files: {} });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.compile).not.toHaveBeenCalled();
    expect(mocks.setStandard).not.toHaveBeenCalled();
  });
  it("runs C++ using canonical shared source instead of request source", async () => {
    const files = { "main.cpp": "int main(){}" };
    mocks.readFiles.mockResolvedValue({ language: "cpp", standard: "c++20", files });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.compile).toHaveBeenCalledWith(expect.objectContaining({ files, source: "", standard: "c++20", ownerKey: "student" }));
  });
  it("does not disclose a project snapshot to an unrelated user", async () => {
    mocks.access.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.readFiles).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
  });
});
