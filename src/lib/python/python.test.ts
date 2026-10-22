/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("./localExecutor", () => ({
  executePythonLocally: vi.fn(async () => ({ status: "ok", stdout: "local\n" })),
  findPythonPath: () => "python3",
}));
import {
  PYTHON_LIMITS, PythonSystemError, validateRunInput, validateTraceInput, systemErrorBody,
} from "./pythonTypes";
import { callWorker, loadSandboxConfig, type SandboxConfig } from "./pythonSandboxClient";
import { executePythonLocally } from "./localExecutor";
import { runPythonCode } from "./pythonRunner";
import { sanitizeTraceResult, sanitizeValue, tracePythonCode } from "./pythonTracer";
import { configurePythonApi } from "./pythonApiDeps";
import { handlePythonRequest } from "./pythonRoute";
import { POST as runPost, GET as runGet } from "../../app/api/python/route";
import { POST as tracePost } from "../../app/api/python/trace/route";

const TOKEN = "k".repeat(40);
const cfg: SandboxConfig = { enabled: true, url: "http://worker.invalid", token: TOKEN };
const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchReturning = (status: number, body: unknown) => vi.fn(async () => jsonRes(status, body));

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return "no-error"; } catch (e) { return e instanceof PythonSystemError ? e.code : "other"; }
}

describe("request validation", () => {
  it("accepts a minimal valid body", () => {
    expect(validateRunInput({ code: "print(1)" })).toEqual({ code: "print(1)", stdin: "" });
    expect(validateRunInput({ code: "x", stdin: "1\n", language: "python" }).stdin).toBe("1\n");
  });
  it("rejects bad shapes, unknown keys, other languages, bad options", () => {
    for (const bad of [null, [], "x", 5, {}, { code: 1 }, { code: "x", stdin: 3 }, { code: "x", extra: 1 },
      { code: "x", language: "cpp" }, { code: "x", options: { timeoutMs: 99999 } }]) {
      expect(() => validateRunInput(bad)).toThrow(PythonSystemError);
    }
  });
  it("enforces size limits in bytes, not characters", () => {
    expect(() => validateRunInput({ code: "x".repeat(PYTHON_LIMITS.maxCodeBytes) })).not.toThrow();
    expect(() => validateRunInput({ code: "x".repeat(PYTHON_LIMITS.maxCodeBytes + 1) })).toThrow(/too large/);
    // 3-byte chars: 30k chars = 90k bytes > 64 KiB
    expect(() => validateRunInput({ code: "€".repeat(30000) })).toThrow(PythonSystemError);
    expect(() => validateRunInput({ code: "x", stdin: "y".repeat(PYTHON_LIMITS.maxStdinBytes + 1) })).toThrow(PythonSystemError);
  });
  it("trace options are bounded", () => {
    expect(validateTraceInput({ code: "x" }).options.maxSteps).toBe(PYTHON_LIMITS.defaultTraceSteps);
    expect(validateTraceInput({ code: "x", options: { maxSteps: 10 } }).options.maxSteps).toBe(10);
    expect(validateTraceInput({ code: "x", options: { maxSteps: 10 ** 9 } }).options.maxSteps).toBe(PYTHON_LIMITS.maxTraceSteps);
    for (const bad of [0, -1, 1.5, "5"]) expect(() => validateTraceInput({ code: "x", options: { maxSteps: bad } })).toThrow();
    expect(() => validateTraceInput({ code: "x", options: { evil: 1 } })).toThrow();
  });
  it("public error messages never contain internals", () => {
    for (const c of ["internal_error", "sandbox_unavailable", "disabled"] as const) {
      const msg = JSON.stringify(systemErrorBody(c));
      expect(msg).not.toMatch(/docker|\/opt|stack|token|127\.0\.0\.1|ENOENT/i);
    }
  });
});

describe("sandbox client fails closed", () => {
  it("is disabled unless explicitly enabled", async () => {
    expect(loadSandboxConfig({}).enabled).toBe(false);
    expect(await code(callWorker({ path: "/v1/run", body: {}, timeoutMs: 100, config: { ...cfg, enabled: false } }))).toBe("disabled");
  });
  it("refuses missing URL or weak token (no fallback)", async () => {
    expect(await code(callWorker({ path: "/v1/run", body: {}, timeoutMs: 100, config: { ...cfg, url: "" } }))).toBe("sandbox_unavailable");
    expect(await code(callWorker({ path: "/v1/run", body: {}, timeoutMs: 100, config: { ...cfg, token: "short" } }))).toBe("sandbox_unavailable");
  });
  it("maps worker/network failures to safe codes", async () => {
    const run = (fetchImpl: any) => code(callWorker({ path: "/v1/run", body: {}, timeoutMs: 100, config: cfg, fetchImpl }));
    expect(await run(vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.5"); }))).toBe("sandbox_unavailable");
    expect(await run(fetchReturning(429, {}))).toBe("busy");
    expect(await run(fetchReturning(503, {}))).toBe("sandbox_unavailable");
    expect(await run(fetchReturning(401, {}))).toBe("internal_error");
    expect(await run(fetchReturning(500, {}))).toBe("internal_error");
    expect(await run(fetchReturning(200, { status: "sandbox_unavailable" }))).toBe("sandbox_unavailable");
    expect(await run(vi.fn(async () => new Response("not json", { status: 200 })))).toBe("internal_error");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(executePythonLocally).mockClear();
  });

  it("does not run on the host in production, even when the dev flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_UNSANDBOXED_EXECUTION", "true");
    expect(await code(callWorker({
      path: "/v1/run",
      body: { code: "print(1)" },
      timeoutMs: 100,
      config: { ...cfg, url: "" },
    }))).toBe("sandbox_unavailable");
    expect(executePythonLocally).not.toHaveBeenCalled();
  });

  it("does not replace a configured worker outage with a host process", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_UNSANDBOXED_EXECUTION", "1");
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await code(callWorker({
      path: "/v1/run",
      body: { code: "print(1)" },
      timeoutMs: 100,
      config: cfg,
      fetchImpl,
    }))).toBe("sandbox_unavailable");
    expect(executePythonLocally).not.toHaveBeenCalled();
  });

  it("uses the local interpreter only outside production when the worker is unconfigured and the flag is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_UNSANDBOXED_EXECUTION", "1");
    const result = await callWorker({
      path: "/v1/run",
      body: { code: "print(1)", stdin: "" },
      timeoutMs: 100,
      config: { ...cfg, url: "", token: "" },
    });
    expect(result.status).toBe("ok");
    expect(executePythonLocally).toHaveBeenCalledOnce();
  });

  it("sends the bearer token and never the user's identity beyond clientId", async () => {
    const f = fetchReturning(200, { status: "ok", stdout: "", stderr: "", exitCode: 0, executionTimeMs: 1 });
    await runPythonCode("print(1)", "", {}, { config: cfg, fetchImpl: f as any, clientId: "u1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://worker.invalid/v1/run");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ code: "print(1)", stdin: "", clientId: "u1" });
  });
});

describe("runPythonCode", () => {
  const ok = (extra: object) => fetchReturning(200, { status: "ok", stdout: "hi\n", stderr: "", exitCode: 0, executionTimeMs: 12.4, truncated: false, ...extra });
  it("success only for status ok and exit 0", async () => {
    const r = await runPythonCode("print('hi')", "", {}, { config: cfg, fetchImpl: ok({}) as any });
    expect(r).toMatchObject({ success: true, status: "ok", stdout: "hi\n", exitCode: 0, executionTimeMs: 12 });
  });
  it("program failures resolve (not reject) with success=false", async () => {
    for (const status of ["runtime_error", "syntax_error", "timeout", "output_limit", "resource_limit", "nonzero_exit"]) {
      const r = await runPythonCode("x", "", {}, { config: cfg, fetchImpl: ok({ status, exitCode: status === "timeout" ? null : 1 }) as any });
      expect(r.success).toBe(false);
      expect(r.status).toBe(status);
    }
  });
  it("a forged ok with non-zero exit is not success", async () => {
    const r = await runPythonCode("x", "", {}, { config: cfg, fetchImpl: ok({ exitCode: 2 }) as any });
    expect(r.success).toBe(false);
  });
  it("rejects unknown statuses and caps oversized output", async () => {
    expect(await code(runPythonCode("x", "", {}, { config: cfg, fetchImpl: ok({ status: "pwned" }) as any }))).toBe("internal_error");
    const r = await runPythonCode("x", "", {}, { config: cfg, fetchImpl: ok({ stdout: "a".repeat(10 ** 6) }) as any });
    expect(r.stdout.length).toBe(PYTHON_LIMITS.maxOutputBytes);
  });
  it("validates before calling the worker", async () => {
    const f = ok({});
    expect(await code(runPythonCode("x".repeat(PYTHON_LIMITS.maxCodeBytes + 1), "", {}, { config: cfg, fetchImpl: f as any }))).toBe("source_too_large");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("trace result sanitising (sandbox output is untrusted)", () => {
  const step = (over: object = {}) => ({ index: 99, line: 1, event: "line", function: "f", locals: {}, stack: [], stdout: "", ...over });
  const base = { status: "ok", exitCode: 0, steps: [step()], truncated: false, trailingStdout: "", stderr: "", error: null };

  it("renumbers indices and keeps well-formed steps", () => {
    const r = sanitizeTraceResult({ ...base, steps: [step(), step({ line: 2 })] }, 100);
    expect(r.steps.map((s) => s.index)).toEqual([0, 1]);
    expect(r.steps[1].line).toBe(2);
  });
  it("drops malformed steps (bad event, line < 1, non-objects)", () => {
    const r = sanitizeTraceResult({ ...base, steps: [step({ event: "evil" }), step({ line: 0 }), null, 5, step()] }, 100);
    expect(r.steps).toHaveLength(1);
  });
  it("enforces the step cap even if the worker sends more", () => {
    const r = sanitizeTraceResult({ ...base, steps: Array.from({ length: 50 }, () => step()) }, 10);
    expect(r.steps).toHaveLength(10);
    expect(r.truncated).toBe(true);
    expect(r.truncationReason).toBe("max_steps");
  });
  it("rejects unknown status", () => {
    expect(() => sanitizeTraceResult({ ...base, status: "hax" }, 10)).toThrow(PythonSystemError);
  });
  it("rebuilds values from an allowlist and bounds depth", () => {
    expect(sanitizeValue({ t: "int", v: 3, __proto__: { x: 1 }, extra: "no" })).toEqual({ t: "int", v: 3 });
    expect(sanitizeValue({ t: "script", v: "<img onerror=x>" })).toEqual({ t: "object", kind: "invalid" });
    expect(sanitizeValue("string")).toEqual({ t: "object", kind: "invalid" });
    let deep: any = { t: "none" };
    for (let i = 0; i < 1000; i++) deep = { t: "list", v: [deep], len: 1, trunc: false };
    let v: any = sanitizeValue(deep), depth = 0;
    while (v.t === "list") { v = v.v[0]; depth++; }
    expect(depth).toBeLessThanOrEqual(10);
  });
  it("caps lists, strings and variable counts", () => {
    const big = sanitizeValue({ t: "list", v: Array.from({ length: 10000 }, () => ({ t: "none" })), len: 10000, trunc: true }) as any;
    expect(big.v.length).toBeLessThanOrEqual(50);
    const s = sanitizeValue({ t: "str", v: "x".repeat(100000) }) as any;
    expect(s.v.length).toBeLessThanOrEqual(400);
    const locals = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`v${i}`, { t: "none" }]));
    const r = sanitizeTraceResult({ ...base, steps: [step({ locals })] }, 10);
    expect(Object.keys(r.steps[0].locals).length).toBeLessThanOrEqual(60);
  });
  it("does not allow prototype pollution via variable names", () => {
    const locals = JSON.parse('{"__proto__": {"t":"none"}, "ok": {"t":"none"}}');
    const r = sanitizeTraceResult({ ...base, steps: [step({ locals })] }, 10);
    expect(({} as any).t).toBeUndefined();
    expect(r.steps[0].locals.ok).toEqual({ t: "none" });
  });
  it("tracePythonCode uses the trace endpoint and clamps steps", async () => {
    const f = fetchReturning(200, { ...base, steps: Array.from({ length: 30 }, () => step()), executionTimeMs: 5 });
    const r = await tracePythonCode("x=1", { maxSteps: 5 }, { config: cfg, fetchImpl: f as any, stdin: "" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/v1/trace")).toBe(true);
    expect(JSON.parse(init.body as string).limits).toEqual({ maxSteps: 5 });
    expect(r.steps).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });
});

describe("API pipeline", () => {
  const req = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }, method = "POST") =>
    new Request("http://app.test/api/python", { method, headers, body });
  const readJson = async (r: Response) => (await r.json()) as any;

  beforeEach(() => {
    process.env.PYTHON_EXECUTION_ENABLED = "true";
    process.env.PYTHON_SANDBOX_URL = "http://worker.invalid";
    process.env.PYTHON_SANDBOX_TOKEN = TOKEN;
  });

  it("fails closed (503 disabled) until auth/rate-limit are wired", async () => {
    vi.resetModules(); // fresh module state: nothing configured yet
    const { handlePythonRequest: fresh } = await import("./pythonRoute");
    let ran = false;
    const res = await fresh(req(JSON.stringify({ code: "x" })), "python-run", async () => { ran = true; return 1; });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("disabled");
    expect(ran).toBe(false);
  });

  describe("when wired", () => {
    let limited = false;
    let authed = true;
    beforeEach(() => {
      limited = false; authed = true;
      configurePythonApi({
        async authenticate() { if (!authed) throw new PythonSystemError("unauthorized"); return { userId: "user-1" }; },
        async rateLimit() { if (limited) throw new PythonSystemError("rate_limited"); },
      });
    });
    const work = async () => ({ ok: 1 });

    it("401 when unauthenticated", async () => {
      authed = false;
      const res = await handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", work);
      expect(res.status).toBe(401);
    });
    it("429 when rate limited", async () => {
      limited = true;
      const res = await handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", work);
      expect(res.status).toBe(429);
      expect((await readJson(res)).error.code).toBe("rate_limited");
    });
    it("415/400 for wrong content type and invalid JSON", async () => {
      expect((await handlePythonRequest(req("x", { "content-type": "text/plain" }), "python-run", work)).status).toBe(400);
      expect((await handlePythonRequest(req("{nope"), "python-run", work)).status).toBe(400);
      expect((await handlePythonRequest(req(""), "python-run", work)).status).toBe(400);
    });
    it("413 for oversized bodies, even without content-length", async () => {
      const big = JSON.stringify({ code: "x".repeat(200_000) });
      expect((await handlePythonRequest(req(big), "python-run", work)).status).toBe(413);
      const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
      const streamed = new Request("http://app.test/api/python", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
      expect((await handlePythonRequest(streamed, "python-run", work)).status).toBe(413);
    });
    it("200 {ok:true} and the work result for valid requests", async () => {
      const res = await handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", work);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await readJson(res)).toEqual({ ok: true, result: { ok: 1 } });
    });
    it("unexpected errors become a generic 500 with no internals", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", async () => { throw new Error("secret /home/ubuntu/.env db=postgres://u:p@h"); });
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(text).not.toMatch(/secret|postgres|ubuntu/);
      spy.mockRestore();
    });
    it("limits concurrent in-flight requests per user", async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => (release = r));
      const slow = () => handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", async () => { await hold; return 1; });
      const a = slow(), b = slow();
      await new Promise((r) => setTimeout(r, 20));
      const c = await handlePythonRequest(req(JSON.stringify({ code: "x" })), "python-run", work);
      expect(c.status).toBe(429);
      release();
      expect((await a).status).toBe(200);
      expect((await b).status).toBe(200);
    });

    it("/api/python route: end-to-end with a fake worker; program failure is still HTTP 200", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonRes(200, { status: "runtime_error", stdout: "", stderr: "Traceback...", exitCode: 1, executionTimeMs: 4, truncated: false }),
      );
      const res = await runPost(req(JSON.stringify({ code: "1/0", language: "python" })));
      const body = await readJson(res);
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.success).toBe(false);
      expect(body.result.status).toBe("runtime_error");
      fetchSpy.mockRestore();
    });
    it("/api/python route rejects other languages and wrong methods", async () => {
      expect((await runPost(req(JSON.stringify({ code: "x", language: "cpp" })))).status).toBe(400);
      expect((await runGet()).status).toBe(405);
    });
    it("/api/python/trace route: truncation is reported, sandbox outage is 503", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRes(200, { status: "truncated", exitCode: 0, truncated: true, truncationReason: "max_steps", steps: [], trailingStdout: "", stderr: "", error: null }),
      );
      const ok = await readJson(await tracePost(req(JSON.stringify({ code: "while True: pass" }))));
      expect(ok.result.truncated).toBe(true);
      expect(ok.result.truncationReason).toBe("max_steps");
      spy.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
      const down = await tracePost(req(JSON.stringify({ code: "x=1" })));
      expect(down.status).toBe(503);
      expect(await down.text()).not.toMatch(/ECONNREFUSED/);
      spy.mockRestore();
    });
  });
});
