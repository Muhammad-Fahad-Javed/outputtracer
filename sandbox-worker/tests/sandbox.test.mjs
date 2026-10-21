import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import http from "node:http";
import { buildDockerArgs, runInContainer, DEFAULT_CONFIG } from "../dockerExec.mjs";
import {
  Gate, LIMITS, assertConfigSafe, createApp, loadConfig, mapRunOutcome, mapTraceOutcome, validatePayload,
} from "../server.mjs";

const cfg = { ...DEFAULT_CONFIG };

test("docker args carry every required isolation flag", () => {
  const a = buildDockerArgs({ name: "n1", mode: "run", cfg });
  const joined = a.join(" ");
  for (const needle of [
    "--network none", "--read-only", "--cap-drop ALL", "--security-opt no-new-privileges",
    "--user 10001:10001", "--memory 128m", "--memory-swap 128m", "--pids-limit 64", "--ipc none", "--rm",
  ]) assert.ok(joined.includes(needle), `missing ${needle}`);
  assert.ok(a.includes("--tmpfs"));
  assert.ok(joined.includes("noexec"));
  assert.ok(!joined.includes("--privileged"));
  assert.ok(!joined.includes("docker.sock"));
  assert.ok(!a.includes("-v") && !a.includes("--volume") && !a.includes("--mount"), "no host mounts allowed");
  assert.ok(!a.includes("--network") || a[a.indexOf("--network") + 1] === "none");
  assert.deepEqual(a.slice(-3), ["python3", "-I", "/opt/worker/run_worker.py"]);
});

test("trace mode selects the trace worker and optional runtime is passed", () => {
  const a = buildDockerArgs({ name: "n2", mode: "trace", cfg: { ...cfg, runtime: "runsc" } });
  assert.equal(a.at(-1), "/opt/worker/trace_worker.py");
  assert.equal(a[a.indexOf("--runtime") + 1], "runsc");
});

function fakeSpawn(behaviour) {
  const calls = [];
  const fn = (cmd, args) => {
    calls.push({ cmd, args });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => { child.killed = true; setImmediate(() => child.emit("close", null, "SIGKILL")); };
    if (args[0] === "run") setImmediate(() => behaviour(child));
    return child;
  };
  fn.calls = calls;
  return fn;
}

test("runInContainer returns stdout/exit code and sends the envelope on stdin", async () => {
  let received = "";
  const spawnFn = fakeSpawn((c) => {
    c.stdin.on("data", (d) => (received += d));
    c.stdout.write("hi\n");
    c.emit("close", 0, null);
  });
  const o = await runInContainer({ mode: "run", envelope: { code: "print(1)", stdin: "" }, cfg, spawnFn });
  assert.equal(o.kind, "exited");
  assert.equal(o.stdout, "hi\n");
  assert.equal(o.exitCode, 0);
  assert.deepEqual(JSON.parse(received), { code: "print(1)", stdin: "" });
});

test("deadline is enforced outside the container by removing it", async () => {
  const spawnFn = fakeSpawn(() => { /* never exits */ });
  const o = await runInContainer({ mode: "run", envelope: { code: "", stdin: "" }, cfg: { ...cfg, timeoutMs: 30 }, spawnFn });
  assert.equal(o.reason, "timeout");
  assert.ok(spawnFn.calls.some((c) => c.args[0] === "rm" && c.args[1] === "-f"));
});

test("output cap kills the container and flags truncation", async () => {
  const spawnFn = fakeSpawn((c) => c.stdout.write(Buffer.alloc(5000, 97)));
  const o = await runInContainer({ mode: "run", envelope: { code: "", stdin: "" }, cfg: { ...cfg, maxOutputBytes: 1000 }, spawnFn });
  assert.equal(o.reason, "output_limit");
  assert.ok(o.outputTruncated);
  assert.ok(o.stdout.length <= 1000);
  assert.ok(spawnFn.calls.some((c) => c.args[0] === "rm"));
});

test("missing docker binary maps to sandbox_unavailable", async () => {
  const spawnFn = (cmd) => {
    const c = new EventEmitter();
    c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.stdin = new PassThrough();
    c.kill = () => {};
    setImmediate(() => c.emit("error", new Error("ENOENT")));
    return c;
  };
  const o = await runInContainer({ mode: "run", envelope: { code: "", stdin: "" }, cfg, spawnFn });
  assert.equal(o.kind, "sandbox_unavailable");
});

test("outcome mapping", () => {
  const base = { kind: "exited", stdout: "o", stderr: "e", executionTimeMs: 5, outputTruncated: false, reason: null };
  assert.equal(mapRunOutcome({ ...base, exitCode: 0 }).status, "ok");
  assert.equal(mapRunOutcome({ ...base, exitCode: 1 }).status, "runtime_error");
  assert.equal(mapRunOutcome({ ...base, exitCode: 3 }).status, "syntax_error");
  assert.equal(mapRunOutcome({ ...base, exitCode: 9 }).status, "nonzero_exit");
  assert.equal(mapRunOutcome({ ...base, exitCode: 137 }).status, "resource_limit");
  assert.equal(mapRunOutcome({ ...base, exitCode: null, reason: "timeout" }).status, "timeout");
  assert.equal(mapRunOutcome({ ...base, exitCode: null, reason: "output_limit" }).status, "output_limit");
  assert.equal(mapRunOutcome({ ...base, exitCode: 125 }).status, "sandbox_unavailable");
  assert.equal(mapRunOutcome({ ...base, exitCode: 70 }).status, "internal_error");

  const good = JSON.stringify({ status: "ok", steps: [] });
  assert.equal(mapTraceOutcome({ ...base, exitCode: 0, stdout: "noise\n" + good + "\n" }).status, "ok");
  assert.equal(mapTraceOutcome({ ...base, exitCode: 0, stdout: "garbage" }).status, "internal_error");
  assert.equal(mapTraceOutcome({ ...base, exitCode: null, reason: "timeout" }).status, "timeout");
  assert.equal(mapTraceOutcome({ ...base, exitCode: null, reason: "output_limit" }).status, "resource_limit");
});

test("payload validation", () => {
  assert.equal(validatePayload({ code: "x" }), null);
  assert.equal(validatePayload({ code: 1 }), "invalid_request");
  assert.equal(validatePayload(null), "invalid_request");
  assert.equal(validatePayload({ code: "x".repeat(LIMITS.maxCodeBytes + 1) }), "source_too_large");
  assert.equal(validatePayload({ code: "x", stdin: "y".repeat(LIMITS.maxStdinBytes + 1) }), "input_too_large");
  assert.equal(validatePayload({ code: "x", clientId: "c".repeat(100) }), "invalid_request");
});

test("config refuses weak tokens", () => {
  assert.throws(() => assertConfigSafe(loadConfig({ SANDBOX_TOKEN: "short" })));
  assert.throws(() => assertConfigSafe(loadConfig({})));
  assert.doesNotThrow(() => assertConfigSafe(loadConfig({ SANDBOX_TOKEN: "x".repeat(40) })));
});

test("gate: concurrency, queue bound, per-client cap, release", async () => {
  const g = new Gate(1, 1);
  const r1 = await g.acquire("a");
  assert.ok(r1);
  const p2 = g.acquire("b"); // queued
  assert.equal(await g.acquire("c"), null, "queue full");
  r1();
  const r2 = await p2;
  assert.ok(r2);
  r2();
  assert.equal(g.active, 0);

  const g2 = new Gate(10, 10);
  const x1 = await g2.acquire("u"), x2 = await g2.acquire("u");
  assert.ok(x1 && x2);
  assert.equal(await g2.acquire("u"), null, "per-client cap");
  x1(); x2();
  assert.ok(await g2.acquire("u"));
});

// --- HTTP layer with injected exec/check ----------------------------------
const TOKEN = "t".repeat(40);
function start(overrides = {}) {
  const config = { ...loadConfig({ SANDBOX_TOKEN: TOKEN }), ...overrides };
  const exec = overrides.exec ?? (async () => ({ kind: "exited", exitCode: 0, stdout: "ok\n", stderr: "", executionTimeMs: 3, outputTruncated: false, reason: null }));
  const check = overrides.check ?? (async () => ({ ok: true }));
  const { server } = createApp({ config, exec, check });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}
function call(port, { method = "POST", path = "/v1/run", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

test("http: rejects missing/wrong token, wrong method, wrong content-type, bad JSON, oversize", async () => {
  const { server, port } = await start();
  try {
    assert.equal((await call(port, { headers: { "content-type": "application/json" }, body: { code: "x" } })).status, 401);
    assert.equal((await call(port, { headers: { ...auth, authorization: "Bearer " + "z".repeat(40) }, body: { code: "x" } })).status, 401);
    assert.equal((await call(port, { method: "GET", headers: auth })).status, 405);
    assert.equal((await call(port, { headers: { authorization: auth.authorization, "content-type": "text/plain" }, body: "x" })).status, 415);
    assert.equal((await call(port, { headers: auth, body: "{nope" })).status, 400);
    assert.equal((await call(port, { headers: auth, body: { code: "x".repeat(LIMITS.maxBodyBytes + 10) } })).status, 413);
    assert.equal((await call(port, { headers: auth, path: "/nope", body: {} })).status, 404);
  } finally { server.close(); }
});

test("http: successful run returns mapped result", async () => {
  const { server, port } = await start();
  try {
    const r = await call(port, { headers: auth, body: { code: "print('ok')" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "ok");
    assert.equal(r.body.stdout, "ok\n");
  } finally { server.close(); }
});

test("http: fails closed when the sandbox is not ready (no host fallback)", async () => {
  let executed = false;
  const { server, port } = await start({
    check: async () => ({ ok: false, reason: "image_missing_or_daemon_down" }),
    exec: async () => { executed = true; return {}; },
  });
  try {
    const r = await call(port, { headers: auth, body: { code: "x" } });
    assert.equal(r.status, 503);
    assert.equal(r.body.status, "sandbox_unavailable");
    assert.equal(executed, false);
  } finally { server.close(); }
});

test("http: busy when queue is full", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { server, port } = await start({
    maxConcurrency: 1, maxQueue: 0,
    exec: async () => { await gate; return { kind: "exited", exitCode: 0, stdout: "", stderr: "", executionTimeMs: 1, outputTruncated: false, reason: null }; },
  });
  try {
    const first = call(port, { headers: auth, body: { code: "x", clientId: "a" } });
    await new Promise((r) => setTimeout(r, 50));
    const second = await call(port, { headers: auth, body: { code: "x", clientId: "b" } });
    assert.equal(second.status, 429);
    release();
    assert.equal((await first).status, 200);
  } finally { server.close(); }
});

test("http: concurrent clients get their own output (no cross-talk)", async () => {
  const { server, port } = await start({
    maxConcurrency: 4,
    exec: async ({ envelope }) => {
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 30));
      return { kind: "exited", exitCode: 0, stdout: "echo:" + envelope.code, stderr: "", executionTimeMs: 1, outputTruncated: false, reason: null };
    },
  });
  try {
    const rs = await Promise.all(["a", "b", "c", "d"].map((c) => call(port, { headers: auth, body: { code: c, clientId: "u" + c } })));
    assert.deepEqual(rs.map((r) => r.body.stdout), ["echo:a", "echo:b", "echo:c", "echo:d"]);
  } finally { server.close(); }
});

test("http: health requires auth and reports readiness", async () => {
  const { server, port } = await start();
  try {
    assert.equal((await call(port, { method: "GET", path: "/health" })).status, 401);
    const h = await call(port, { method: "GET", path: "/health", headers: { authorization: auth.authorization } });
    assert.equal(h.status, 200);
    assert.equal(h.body.ok, true);
  } finally { server.close(); }
});
