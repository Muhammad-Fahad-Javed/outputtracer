import { WebSocket } from "ws";
import { inspectSourceFiles } from "./sourceFiles";
import { loadSandboxConfig } from "./python/pythonSandboxClient";
import { PYTHON_LIMITS } from "./python/pythonTypes";
import { tryAcquireRun, releaseRun } from "./runGate";
import { execConfig } from "./execConfig";
import type { TerminalInitPayload } from "./wsTerminal";

/** Bridge public terminal traffic to the private, authenticated Docker worker. */
export async function handlePythonTerminalSession(ws: WebSocket, payload: TerminalInitPayload): Promise<void> {
  const send = (message: Record<string, unknown>) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); };
  const inspected = inspectSourceFiles(payload.files, { maxFiles: 1, maxSourceBytes: PYTHON_LIMITS.maxCodeBytes }, "python");
  if (!inspected.ok || typeof payload.files["main.py"] !== "string") {
    send({ type: "error", data: inspected.ok ? "Python requires a single main.py file." : inspected.message }); ws.close(); return;
  }
  const config = loadSandboxConfig();
  if (!config.enabled || !config.url || config.token.length < 32) {
    send({ type: "error", data: "The Python sandbox is unavailable right now." }); ws.close(); return;
  }
  let workerUrl: URL;
  try { workerUrl = new URL(config.url + "/v1/terminal");
    if (workerUrl.protocol !== "http:" && workerUrl.protocol !== "https:") throw Error();
    workerUrl.protocol = workerUrl.protocol === "https:" ? "wss:" : "ws:";
  } catch { send({ type: "error", data: "The Python sandbox is unavailable right now." }); ws.close(); return; }
  if (ws.readyState !== ws.OPEN || payload.signal?.aborted) return;
  const slot = tryAcquireRun(payload.ownerKey);
  if (slot !== "ok") {
    send({ type: "error", data: slot === "user-busy" ? "You already have a program running. Stop it before starting another." : "Too many programs are running. Wait a moment and try again." }); ws.close(); return;
  }
  let worker: WebSocket;
  try { worker = new WebSocket(workerUrl, { headers: { authorization: `Bearer ${config.token}` }, maxPayload: 128 * 1024, handshakeTimeout: 10000 }); }
  catch { releaseRun(payload.ownerKey); send({ type: "error", data: "The Python sandbox is unavailable right now." }); ws.close(); return; }
  let finished = false;
  let ready = false;
  let inputBytes = 0;
  let inputEnded = false;
  let inputChain = Promise.resolve();
  let pendingMessages = 0;
  let pendingBytes = 0;
  const finish = () => {
    if (finished) return;
    finished = true; clearTimeout(timer); releaseRun(payload.ownerKey);
    payload.signal?.removeEventListener("abort", finish);
    // A normal close handshake can take 30 seconds when its peer is stuck.
    // Drop the private transport immediately so the worker kills the container.
    if (worker.readyState === worker.OPEN || worker.readyState === worker.CONNECTING) worker.terminate();
  };
  const timer = setTimeout(() => { send({ type: "timeout", data: "Program session expired." }); finish(); ws.close(); }, (payload.timeoutMs || execConfig.interactiveTimeoutMs) + 12000);
  ws.once("close", finish);
  ws.once("error", finish);
  payload.signal?.addEventListener("abort", finish, { once: true });
  worker.on("open", () => {
    if (finished || ws.readyState !== ws.OPEN || payload.signal?.aborted) {
      if (worker.readyState === worker.OPEN) worker.terminate();
      finish(); return;
    }
    worker.send(JSON.stringify({ code: payload.files["main.py"], clientId: payload.ownerKey, timeoutMs: payload.timeoutMs || execConfig.interactiveTimeoutMs, cpuTimeMs: payload.cpuTimeMs }));
  });
  worker.on("message", (raw) => {
    if (finished) return;
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "ready") ready = true;
      send(message);
    } catch { send({ type: "error", data: "Invalid Python sandbox response." }); finish(); ws.close(); }
  });
  worker.on("error", () => { if (finished) return; send({ type: "error", data: "The Python sandbox is unavailable right now." }); finish(); ws.close(); });
  worker.on("close", () => { finish(); ws.close(); });
  ws.on("message", (raw) => {
    let message: { type?: string; data?: string };
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === "stop") { finish(); ws.close(); return; }
    const frameBytes = Buffer.byteLength(raw.toString(), "utf8");
    pendingMessages++; pendingBytes += frameBytes;
    if (pendingMessages > 32 || pendingBytes > 2 * PYTHON_LIMITS.maxStdinBytes) {
      send({ type: "error", data: "Too much input is waiting. Start a new run." }); finish(); ws.close(); return;
    }
    inputChain = inputChain.then(async () => {
      if (finished || !ready || inputEnded || worker.readyState !== worker.OPEN) return;
      if (payload.validateAccess && !(await payload.validateAccess())) {
        send({ type: "error", data: "Workspace access or execution permission changed." }); finish(); ws.close(1008); return;
      }
      if (finished || payload.signal?.aborted || ws.readyState !== ws.OPEN || worker.readyState !== worker.OPEN) return;
      if (message.type === "eof") { inputEnded = true; worker.send(JSON.stringify({ type: "eof" })); return; }
      if (message.type !== "stdin" || typeof message.data !== "string") return;
      const bytes = Buffer.byteLength(message.data, "utf8"); inputBytes += bytes;
      if (bytes > Math.min(execConfig.maxWsStdinMessageBytes, 8192) || inputBytes > PYTHON_LIMITS.maxStdinBytes) {
        send({ type: "error", data: "Program input exceeded the allowed limit." }); finish(); ws.close(); return;
      }
      worker.send(JSON.stringify({ type: "stdin", data: message.data }));
    }).catch(() => { send({ type: "error", data: "Could not verify execution permission." }); finish(); ws.close(1008); })
      .finally(() => { pendingMessages--; pendingBytes -= frameBytes; });
  });
}
