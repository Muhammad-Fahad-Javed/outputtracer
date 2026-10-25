import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { WebSocket } from "ws";
import { DEFAULT_CONFIG, INTERACTIVE_READY, INTERACTIVE_BOOTSTRAP, buildDockerArgs, startInteractiveContainer } from "../dockerExec.mjs";
import { createApp, loadConfig } from "../server.mjs";

function fakeDocker() {
  const calls = [];
  let program;
  const spawnFn = (command, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit("close", null, "SIGKILL")); };
    calls.push({ command, args, child });
    if (args[0] === "run") program = child;
    return child;
  };
  return { calls, spawnFn, get program() { return program; } };
}

test("interactive command preserves isolation without host mounts and uses unbuffered trusted bootstrap", () => {
  const args = buildDockerArgs({ name: "terminal", mode: "terminal", cfg: DEFAULT_CONFIG });
  for (const pair of [["--network", "none"], ["--user", "10001:10001"], ["--cap-drop", "ALL"], ["--memory", "128m"], ["--pids-limit", "64"]]) {
    assert.equal(args[args.indexOf(pair[0]) + 1], pair[1]);
  }
  assert.ok(args.includes("--read-only")); assert.ok(!args.includes("--mount")); assert.ok(!args.includes("-v"));
  assert.ok(args.includes("cpu=5:6"));
  assert.deepEqual(args.slice(-5), ["python3", "-I", "-u", "-c", INTERACTIVE_BOOTSTRAP]);
});

test("real input channel stays open after source envelope; split ready marker and Unicode output survive", async () => {
  const docker = fakeDocker(); const events = [];
  const session = startInteractiveContainer({ code: "input('Name: ')", cfg: DEFAULT_CONFIG, emit: (m) => events.push(m), spawnFn: docker.spawnFn });
  const chunks = [];
  docker.program.stdin.on("data", (d) => chunks.push(d.toString()));
  assert.equal(docker.program.stdin.writableEnded, false);
  docker.program.stdout.write(INTERACTIVE_READY.slice(0, 4));
  docker.program.stdout.write(INTERACTIVE_READY.slice(4));
  assert.equal(events.filter((m) => m.type === "ready").length, 1, "ready must arrive even if program waits before any output");
  const unicode = Buffer.from("Name: 🐍");
  docker.program.stdout.write(unicode.subarray(0, unicode.length - 2));
  docker.program.stdout.write(unicode.subarray(unicode.length - 2));
  session.input("  Ada  \n"); session.input("\n");
  session.eof();
  docker.program.emit("close", 0, null);
  await session.done;
  assert.equal(JSON.parse(chunks[0]).code, "input('Name: ')");
  assert.equal(chunks.slice(1).join(""), "  Ada  \n\n");
  assert.equal(docker.program.stdin.writableEnded, true);
  assert.equal(events.filter((m) => m.type === "stdout").map((m) => m.data).join(""), "Name: 🐍");
  assert.equal(events.at(-1).code, 0);
});

test("assignment CPU limits do not shorten the human-input wall deadline", async () => {
  const docker = fakeDocker();
  const session = startInteractiveContainer({ code: "input()", cpuTimeMs: 1000, timeoutMs: 120000, cfg: DEFAULT_CONFIG, emit() {}, spawnFn: docker.spawnFn });
  assert.ok(docker.calls[0].args.includes("cpu=1:2"));
  session.stop();
  await session.done;
});

test("syntax diagnostics are forwarded as compile_error without claiming readiness", async () => {
  const docker = fakeDocker(); const events = [];
  const session = startInteractiveContainer({ code: "if", cfg: DEFAULT_CONFIG, emit: (m) => events.push(m), spawnFn: docker.spawnFn });
  docker.program.stderr.write("SyntaxError: invalid syntax\n"); docker.program.emit("close", 3, null);
  await session.done;
  assert.ok(events.some((m) => m.type === "compile_error" && m.data.includes("SyntaxError")));
  assert.ok(!events.some((m) => m.type === "ready" || m.type === "compile_success"));
});

test("input limit removes container; EOF prevents later input", async () => {
  const docker = fakeDocker(); const events = [];
  const session = startInteractiveContainer({ code: "pass", cfg: DEFAULT_CONFIG, emit: (m) => events.push(m), spawnFn: docker.spawnFn });
  session.input("x".repeat(8193)); await session.done;
  assert.ok(events.some((m) => m.type === "error" && /input/.test(m.data)));
  assert.ok(docker.calls.some((c) => c.args[0] === "rm" && c.args[1] === "-f"));
  assert.equal(docker.program.killed, true);
});

test("stdout and stderr share one output cap and stop is idempotent", async () => {
  const docker = fakeDocker(); const events = [];
  const session = startInteractiveContainer({ code: "pass", cfg: { ...DEFAULT_CONFIG, maxOutputBytes: 20 }, emit: (m) => events.push(m), spawnFn: docker.spawnFn });
  docker.program.stdout.write(INTERACTIVE_READY); docker.program.stderr.write("e".repeat(21));
  await session.done; session.stop(); session.stop();
  assert.equal(events.filter((m) => m.type === "output_limit").length, 1);
  assert.equal(docker.calls.filter((c) => c.args[0] === "rm").length, 1);
});

test("interactive wall deadline kills an input-waiting program", async () => {
  const docker = fakeDocker(); const events = [];
  const session = startInteractiveContainer({ code: "input()", timeoutMs: 1000, cfg: DEFAULT_CONFIG, emit: (m) => events.push(m), spawnFn: docker.spawnFn });
  docker.program.stdout.write(INTERACTIVE_READY);
  await session.done;
  assert.ok(events.some((m) => m.type === "timeout")); assert.equal(docker.program.killed, true);
});

const TOKEN = "test-private-worker-token-000000000000000000000";
async function start(terminal) {
  const app = createApp({ config: loadConfig({ SANDBOX_TOKEN: TOKEN }), check: async () => ({ ok: true }), terminal });
  app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
  return { ...app, url: `ws://127.0.0.1:${app.server.address().port}/v1/terminal` };
}
async function close(app) { for (const ws of app.terminals.clients) ws.terminate(); await new Promise((resolve) => app.server.close(resolve)); }

test("private terminal rejects unauthenticated upgrades", async () => {
  const app = await start(() => { throw Error("must not run"); });
  try {
    const ws = new WebSocket(app.url);
    const [error] = await once(ws, "error"); assert.match(error.message, /401/);
    assert.equal(app.gate.active, 0);
  } finally { await close(app); }
});

test("worker terminal uses shared gate, delivers real input/EOF and disconnect releases slot", async () => {
  let input = ""; let ended = false; let stopped = 0; let resolveDone;
  const app = await start(({ code, emit }) => {
    assert.equal(code, "print(input())");
    emit({ type: "ready" });
    return { done: new Promise((r) => { resolveDone = r; }), input: (s) => { input += s; }, eof: () => { ended = true; }, stop: () => { stopped++; resolveDone(); } };
  });
  try {
    const ws = new WebSocket(app.url, { headers: { authorization: `Bearer ${TOKEN}` } }); await once(ws, "open");
    const first = once(ws, "message"); ws.send(JSON.stringify({ code: "print(input())", clientId: "qa" }));
    assert.equal(JSON.parse((await first)[0].toString()).type, "ready"); assert.equal(app.gate.active, 1);
    ws.send(JSON.stringify({ type: "stdin", data: "Ada\n" })); ws.send(JSON.stringify({ type: "eof" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(input, "Ada\n"); assert.equal(ended, true);
    ws.close(); await once(ws, "close"); await new Promise((r) => setTimeout(r, 20));
    assert.equal(app.gate.active, 0); assert.ok(stopped >= 1);
  } finally { await close(app); }
});
