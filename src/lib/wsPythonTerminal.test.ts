import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { activeRunCount, resetRunGate } from "./runGate";

interface WorkerSocket extends EventEmitter {
  readyState: number;
  sent: string[];
  headers: Record<string, string>;
  terminate: ReturnType<typeof vi.fn>;
}
const mocks = vi.hoisted(() => ({ workers: [] as WorkerSocket[], constructorFails: false }));
vi.mock("./python/pythonSandboxClient", () => ({ loadSandboxConfig: () => ({ enabled: true, url: "http://private-worker:8787", token: "private-worker-secret-never-forwarded-000000" }) }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { WebSocket: class extends EventEmitter {
    readonly OPEN = 1;
    readonly CONNECTING = 0;
    readyState = 0;
    sent: string[] = [];
    headers: Record<string, string>;
    terminate = vi.fn(() => { this.readyState = 3; this.emit("close"); });
    constructor(_url: URL, options: { headers: Record<string, string> }) {
      super();
      if (mocks.constructorFails) throw Error("invalid worker config");
      this.headers = options.headers;
      mocks.workers.push(this);
    }
    send(text: string) { this.sent.push(text); }
  } };
});
import { handlePythonTerminalSession } from "./wsPythonTerminal";

function browser() {
  const ws = new EventEmitter();
  const send = vi.fn();
  const close = vi.fn(() => { Object.assign(ws, { readyState: 3 }); ws.emit("close"); });
  Object.assign(ws, { OPEN: 1, readyState: 1, send, close });
  return { ws: ws as unknown as WebSocket, send, close };
}
function open(worker: WorkerSocket) { worker.readyState = 1; worker.emit("open"); }
async function flush() { await new Promise((resolve) => setImmediate(resolve)); }

beforeEach(() => { mocks.workers.length = 0; mocks.constructorFails = false; resetRunGate(); });

describe("Python terminal proxy lifecycle", () => {
  it("sends credentials only to private worker and forwards bounded real input/EOF", async () => {
    const client = browser();
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "print(input())" }, ownerKey: "actor" });
    const worker = mocks.workers[0]; open(worker);
    expect(worker.headers.authorization).toContain("Bearer private-worker-secret");
    const initialization = JSON.parse(worker.sent[0]);
    expect(initialization).toMatchObject({ files: { "main.py": "print(input())" }, clientId: "actor" });
    expect(initialization).not.toHaveProperty("code");
    worker.emit("message", Buffer.from(JSON.stringify({ type: "ready" })));
    client.ws.emit("message", Buffer.from(JSON.stringify({ type: "stdin", data: "  Ada  \n" })));
    client.ws.emit("message", Buffer.from(JSON.stringify({ type: "eof" })));
    await flush();
    expect(worker.sent.slice(1).map((s) => JSON.parse(s))).toEqual([{ type: "stdin", data: "  Ada  \n" }, { type: "eof" }]);
    expect(JSON.stringify(client.send.mock.calls)).not.toContain("private-worker-secret");
    client.ws.emit("close");
    expect(activeRunCount()).toBe(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("forwards every Python module as one project snapshot and preserves input and EOF", async () => {
    const client = browser();
    const files = {
      "main.py": "from helper import greeting\nprint(greeting(input()))\n",
      "helper.py": "def greeting(name):\n    return 'Hello, ' + name\n",
    };
    await handlePythonTerminalSession(client.ws, { files, ownerKey: "group-member" });
    const worker = mocks.workers[0]; open(worker);
    expect(JSON.parse(worker.sent[0])).toMatchObject({ files, clientId: "group-member" });
    expect(JSON.parse(worker.sent[0])).not.toHaveProperty("code");
    worker.emit("message", Buffer.from('{"type":"ready"}'));
    client.ws.emit("message", Buffer.from(JSON.stringify({ type: "stdin", data: "  Ada  \n\n" })));
    client.ws.emit("message", Buffer.from('{"type":"eof"}'));
    client.ws.emit("message", Buffer.from('{"type":"stdin","data":"must not be forwarded"}'));
    await flush();
    expect(worker.sent.slice(1).map((message) => JSON.parse(message))).toEqual([
      { type: "stdin", data: "  Ada  \n\n" },
      { type: "eof" },
    ]);
    client.ws.emit("close");
    expect(activeRunCount()).toBe(0);
  });

  it("accepts exactly 16 flat Python files and a combined 64 KiB of UTF-8 source", async () => {
    const client = browser();
    const files = Object.fromEntries([
      ["main.py", "é".repeat(32 * 1024)],
      ...Array.from({ length: 15 }, (_, index) => ["module" + index + ".py", ""]),
    ]);
    await handlePythonTerminalSession(client.ws, { files });
    expect(mocks.workers).toHaveLength(1);
    open(mocks.workers[0]);
    expect(JSON.parse(mocks.workers[0].sent[0]).files).toEqual(files);
    client.ws.emit("close");
    expect(activeRunCount()).toBe(0);
  });

  it.each([
    ["path traversal", { "main.py": "pass", "../helper.py": "pass" }],
    ["nested path", { "main.py": "pass", "package/helper.py": "pass" }],
    ["wrong file type", { "main.py": "pass", "helper.txt": "pass" }],
    ["missing main.py", { "helper.py": "pass" }],
    ["non-string source", { "main.py": "pass", "helper.py": 42 }],
    ["17 files", Object.fromEntries([["main.py", "pass"], ...Array.from({ length: 16 }, (_, index) => ["module" + index + ".py", "pass"])])],
    ["combined UTF-8 source over 64 KiB", { "main.py": "é".repeat(32 * 1024), "helper.py": "x" }],
  ])("rejects %s before opening a private worker or acquiring a run slot", async (_name, files) => {
    const client = browser();
    await handlePythonTerminalSession(client.ws, { files: files as unknown as Record<string, string> });
    expect(mocks.workers).toHaveLength(0);
    expect(activeRunCount()).toBe(0);
    expect(client.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("cancels a connecting worker and never sends source on a late open", async () => {
    const client = browser(); const cancellation = new AbortController();
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "input()" }, ownerKey: "actor", signal: cancellation.signal });
    const worker = mocks.workers[0]; cancellation.abort();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(activeRunCount()).toBe(0);
    open(worker);
    expect(worker.sent).toEqual([]);
  });

  it("revoked input permission kills the private transport before forwarding input", async () => {
    const client = browser(); const validateAccess = vi.fn().mockResolvedValue(false);
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "input()" }, ownerKey: "actor", validateAccess });
    const worker = mocks.workers[0]; open(worker); worker.emit("message", Buffer.from('{"type":"ready"}'));
    client.ws.emit("message", Buffer.from('{"type":"stdin","data":"forbidden\\n"}'));
    await flush();
    expect(worker.sent).toHaveLength(1); expect(worker.terminate).toHaveBeenCalledOnce();
    expect(activeRunCount()).toBe(0); expect(client.close).toHaveBeenCalled();
  });

  it("releases the actor slot when private WebSocket construction fails", async () => {
    const client = browser(); mocks.constructorFails = true;
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "pass" }, ownerKey: "actor" });
    expect(activeRunCount()).toBe(0);
    expect(client.send).toHaveBeenCalledWith(expect.stringContaining("sandbox is unavailable"));
  });

  it("refuses an already canceled session without opening the worker", async () => {
    const client = browser(); const cancellation = new AbortController(); cancellation.abort();
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "pass" }, signal: cancellation.signal });
    expect(mocks.workers).toHaveLength(0); expect(activeRunCount()).toBe(0);
  });

  it("bounds the input queue while permission validation is pending", async () => {
    const client = browser();
    let unblock: (ok: boolean) => void = () => {};
    const validateAccess = () => new Promise<boolean>((resolve) => { unblock = resolve; });
    await handlePythonTerminalSession(client.ws, { files: { "main.py": "input()" }, validateAccess });
    const worker = mocks.workers[0]; open(worker); worker.emit("message", Buffer.from('{"type":"ready"}'));
    client.ws.emit("message", Buffer.from('{"type":"stdin","data":"x\\n"}'));
    await flush();
    for (let i = 0; i < 33; i++) client.ws.emit("message", Buffer.from('{"type":"stdin","data":"x\\n"}'));
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(activeRunCount()).toBe(0);
    unblock(true); await flush();
    expect(worker.sent).toHaveLength(1);
  });
});
