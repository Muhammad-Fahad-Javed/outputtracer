import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInSandbox } from "./executionClient";

const okResponse = () =>
  new Response(JSON.stringify({ status: "success", output: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const request = { files: { "main.cpp": "int main() { return 0; }" }, language: "cpp" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okResponse());
  vi.stubGlobal("fetch", fetchMock);

  vi.stubEnv("SANDBOX_EXECUTION_URL", "");
  vi.stubEnv("INTERNAL_BASE_URL", "");
  // These must never influence the internal fallback URL.
  vi.stubEnv("NEXTAUTH_URL", "https://attacker.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("PORT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("runInSandbox internal fallback", () => {
  it("calls this server over loopback, not a host derived from unrelated env vars", async () => {
    await runInSandbox(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3000/api/predict");
  });

  it("uses PORT and strips a trailing slash from INTERNAL_BASE_URL", async () => {
    vi.stubEnv("INTERNAL_BASE_URL", "http://127.0.0.1:8080/");
    await runInSandbox(request);

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8080/api/predict");
  });

  it("still prefers the external sandbox when SANDBOX_EXECUTION_URL is set", async () => {
    vi.stubEnv("SANDBOX_EXECUTION_URL", "https://sandbox.internal/run");
    await runInSandbox(request);

    expect(fetchMock.mock.calls[0][0]).toBe("https://sandbox.internal/run");
  });

  it("posts the file map and skips tracing on the internal fallback", async () => {
    const files = {
      "main.cpp": '#include "helper.h"\nint main(){ return 0; }',
      "helper.h": "int helper();",
    };
    await runInSandbox({ files, language: "cpp" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      files,
      stdin: "",
      trace: false,
    });
  });

  it("treats an unavailable predict response as a sandbox failure", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "error" }), { status: 503 }));
    await expect(runInSandbox(request)).rejects.toMatchObject({
      name: "ExecutionError",
      kind: "sandbox_unavailable",
    });
  });

  it("treats a rate-limited predict response as a timeout, not a wrong answer", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(runInSandbox(request)).rejects.toMatchObject({ kind: "timeout" });
  });
});
