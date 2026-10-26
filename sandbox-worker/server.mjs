// Sandbox worker service for Python execution and tracing.
//
// This is the ONLY component that talks to Docker. The Next.js app never
// spawns Python or docker itself; it calls this service over HTTP with a
// bearer token. Run it on a private interface (default 127.0.0.1) or a
// separate host. Fails closed: refuses to start without a strong token, and
// reports sandbox_unavailable if Docker or the image is missing. There is no
// host-execution fallback anywhere in this file.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { DEFAULT_CONFIG, runInContainer, checkRuntime, startInteractiveContainer } from "./dockerExec.mjs";
import { normalizeInteractiveFiles } from "./pythonFiles.mjs";

export const LIMITS = Object.freeze({
  maxCodeBytes: 64 * 1024,
  maxStdinBytes: 16 * 1024,
  maxBodyBytes: 128 * 1024,
  // JSON can expand a valid 64 KiB source snapshot sixfold (e.g. control
  // characters). The decoded aggregate source limit still applies below.
  maxTerminalMessageBytes: 512 * 1024,
  maxClientIdLength: 64,
  maxPerClient: 2,
});

export function loadConfig(env = process.env) {
  const token = env.SANDBOX_TOKEN || "";
  return {
    token,
    host: env.SANDBOX_HOST || "127.0.0.1",
    port: Number(env.SANDBOX_PORT || 8787),
    maxConcurrency: Number(env.SANDBOX_MAX_CONCURRENCY || 2),
    maxQueue: Number(env.SANDBOX_MAX_QUEUE || 8),
    docker: {
      ...DEFAULT_CONFIG,
      image: env.SANDBOX_IMAGE || DEFAULT_CONFIG.image,
      runtime: env.SANDBOX_RUNTIME || DEFAULT_CONFIG.runtime,
      memoryMiB: Number(env.SANDBOX_MEMORY_MIB || DEFAULT_CONFIG.memoryMiB),
      cpus: env.SANDBOX_CPUS || DEFAULT_CONFIG.cpus,
      pidsLimit: Number(env.SANDBOX_PIDS || DEFAULT_CONFIG.pidsLimit),
      timeoutMs: Number(env.SANDBOX_TIMEOUT_MS || DEFAULT_CONFIG.timeoutMs),
      traceTimeoutMs: Number(env.SANDBOX_TRACE_TIMEOUT_MS || DEFAULT_CONFIG.traceTimeoutMs),
    },
  };
}

export function assertConfigSafe(config) {
  if (!config.token || config.token.length < 32) {
    throw new Error("SANDBOX_TOKEN must be set and at least 32 characters");
  }
  if (!(config.maxConcurrency >= 1 && config.maxConcurrency <= 32)) throw new Error("bad SANDBOX_MAX_CONCURRENCY");
  if (!(config.maxQueue >= 0 && config.maxQueue <= 256)) throw new Error("bad SANDBOX_MAX_QUEUE");
}

/** Bounded semaphore with a bounded wait queue. */
export class Gate {
  constructor(maxConcurrency, maxQueue) {
    this.max = maxConcurrency;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
    this.perClient = new Map();
  }
  clientCount(id) { return this.perClient.get(id) || 0; }
  /** Resolves to a release fn, or null when the queue is full / client capped. */
  acquire(clientId) {
    if (this.clientCount(clientId) >= LIMITS.maxPerClient) return Promise.resolve(null);
    const take = () => {
      this.active++;
      this.perClient.set(clientId, this.clientCount(clientId) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.active--;
        const n = this.clientCount(clientId) - 1;
        if (n <= 0) this.perClient.delete(clientId); else this.perClient.set(clientId, n);
        const next = this.queue.shift();
        if (next) next();
      };
    };
    if (this.active < this.max) return Promise.resolve(take());
    if (this.queue.length >= this.maxQueue) return Promise.resolve(null);
    // Reserve the client slot immediately so one client cannot flood the queue.
    this.perClient.set(clientId, this.clientCount(clientId) + 1);
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.perClient.set(clientId, this.clientCount(clientId) - 1);
        resolve(take());
      });
    });
  }
}

function tokenOk(header, token) {
  const m = /^Bearer (.+)$/.exec(header || "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...(status === 413 ? { connection: "close" } : {}),
  });
  res.end(data);
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    req.on("data", (c) => {
      if (over) return; // discard the rest; the 413 is sent and the connection closed
      size += c.length;
      if (size > max) {
        over = true;
        chunks.length = 0;
        reject(Object.assign(new Error("too large"), { code: "too_large" }));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function validatePayload(p) {
  if (!p || typeof p !== "object") return "invalid_request";
  if (typeof p.code !== "string") return "invalid_request";
  if (Buffer.byteLength(p.code, "utf8") > LIMITS.maxCodeBytes) return "source_too_large";
  const stdin = p.stdin === undefined ? "" : p.stdin;
  if (typeof stdin !== "string") return "invalid_request";
  if (Buffer.byteLength(stdin, "utf8") > LIMITS.maxStdinBytes) return "input_too_large";
  if (p.clientId !== undefined && (typeof p.clientId !== "string" || p.clientId.length > LIMITS.maxClientIdLength)) {
    return "invalid_request";
  }
  return null;
}

/** Interactive sessions accept either a legacy code string or bounded .py files. */
export function validateTerminalPayload(payload) {
  try { normalizeInteractiveFiles(payload); }
  catch (error) { return error.code || "invalid_request"; }
  if (payload.stdin !== undefined && (typeof payload.stdin !== "string" || Buffer.byteLength(payload.stdin, "utf8") > LIMITS.maxStdinBytes)) return "invalid_request";
  if (payload.clientId !== undefined && (typeof payload.clientId !== "string" || payload.clientId.length > LIMITS.maxClientIdLength)) return "invalid_request";
  return null;
}

/** Map a container outcome to the run result contract. */
export function mapRunOutcome(o) {
  if (o.kind === "sandbox_unavailable") return { status: "sandbox_unavailable" };
  const base = {
    stdout: o.stdout, stderr: o.stderr, exitCode: o.exitCode,
    executionTimeMs: o.executionTimeMs, truncated: o.outputTruncated,
  };
  if (o.reason === "timeout") return { ...base, status: "timeout" };
  if (o.reason === "output_limit") return { ...base, status: "output_limit" };
  if ([125, 126, 127].includes(o.exitCode)) return { status: "sandbox_unavailable" };
  if (o.exitCode === 137) return { ...base, status: "resource_limit", detail: "process killed (likely memory limit)" };
  if (o.exitCode === 0) return { ...base, status: "ok" };
  if (o.exitCode === 3) return { ...base, status: "syntax_error" };
  if (o.exitCode === 70) return { status: "internal_error" };
  if (o.exitCode === 1) return { ...base, status: "runtime_error" };
  return { ...base, status: "nonzero_exit" };
}

/** Map a container outcome to the trace result contract. */
export function mapTraceOutcome(o) {
  if (o.kind === "sandbox_unavailable") return { status: "sandbox_unavailable" };
  if (o.reason === "timeout") return { status: "timeout", executionTimeMs: o.executionTimeMs };
  if (o.reason === "output_limit") return { status: "resource_limit", detail: "trace too large", executionTimeMs: o.executionTimeMs };
  if ([125, 126, 127].includes(o.exitCode)) return { status: "sandbox_unavailable" };
  if (o.exitCode === 137) return { status: "resource_limit", detail: "process killed (likely memory limit)", executionTimeMs: o.executionTimeMs };
  const lines = (o.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  let parsed;
  try { parsed = JSON.parse(last); } catch { return { status: "internal_error", executionTimeMs: o.executionTimeMs }; }
  if (!parsed || typeof parsed !== "object" || parsed.status === "protocol_error") {
    return { status: "internal_error", executionTimeMs: o.executionTimeMs };
  }
  return { ...parsed, executionTimeMs: o.executionTimeMs };
}

export function createApp({ config, exec = runInContainer, check = checkRuntime, terminal = startInteractiveContainer }) {
  const gate = new Gate(config.maxConcurrency, config.maxQueue);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/health" && req.method === "GET") {
        if (!tokenOk(req.headers.authorization, config.token)) return send(res, 401, { error: "unauthorized" });
        const r = await check({ cfg: config.docker });
        return send(res, r.ok ? 200 : 503, { ok: r.ok, reason: r.reason ?? null, active: gate.active, queued: gate.queue.length });
      }
      const route = { "/v1/run": "run", "/v1/trace": "trace" }[req.url || ""];
      if (!route) return send(res, 404, { error: "not_found" });
      if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
      if (!tokenOk(req.headers.authorization, config.token)) return send(res, 401, { error: "unauthorized" });
      if (!/^application\/json/i.test(req.headers["content-type"] || "")) return send(res, 415, { error: "invalid_request" });

      let payload;
      try {
        payload = JSON.parse((await readBody(req, LIMITS.maxBodyBytes)).toString("utf8"));
      } catch (e) {
        return send(res, e.code === "too_large" ? 413 : 400, { error: e.code === "too_large" ? "source_too_large" : "invalid_request" });
      }
      const bad = validatePayload(payload);
      if (bad) return send(res, bad.endsWith("too_large") ? 413 : 400, { error: bad });

      const health = await check({ cfg: config.docker });
      if (!health.ok) return send(res, 503, { status: "sandbox_unavailable" });

      const clientId = payload.clientId || "anonymous";
      const release = await gate.acquire(clientId);
      if (!release) return send(res, 429, { error: "busy" });
      let closed = false;
      req.on("close", () => { closed = true; });
      try {
        const envelope = { code: payload.code, stdin: payload.stdin || "" };
        if (route === "trace") envelope.limits = sanitizeTraceLimits(payload.limits);
        const outcome = await exec({ mode: route, envelope, cfg: config.docker });
        if (closed && res.writableEnded) return;
        const body = route === "trace" ? mapTraceOutcome(outcome) : mapRunOutcome(outcome);
        return send(res, 200, body);
      } finally {
        release();
      }
    } catch {
      return send(res, 500, { status: "internal_error" });
    }
  });
  const terminals = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxTerminalMessageBytes });
  server.on("upgrade", (req, socket, head) => {
    // This endpoint is for our trusted application server only. The browser
    // never receives the worker bearer token or connects here directly.
    if (req.url !== "/v1/terminal" || !tokenOk(req.headers.authorization, config.token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return;
    }
    terminals.handleUpgrade(req, socket, head, (ws) => {
      let initialized = false;
      let session;
      let release;
      const push = (message) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); };
      const cleanup = () => { clearTimeout(initTimer); session?.stop(); release?.(); release = undefined; };
      const initTimer = setTimeout(() => { push({ type: "error", data: "No program received." }); ws.close(); }, 10000);
      ws.once("close", cleanup);
      ws.on("error", cleanup);
      ws.on("message", async (raw) => {
        let payload;
        try { payload = JSON.parse(raw.toString()); } catch { push({ type: "error", data: "Invalid terminal message." }); ws.close(); return; }
        if (initialized) {
          if (payload?.type === "stdin" && typeof payload.data === "string") session?.input(payload.data);
          else if (payload?.type === "eof") session?.eof();
          else if (payload?.type === "stop") { cleanup(); ws.close(); }
          return;
        }
        initialized = true; clearTimeout(initTimer);
        const bad = validateTerminalPayload(payload);
        if (bad) { push({ type: "error", data: "Invalid Python program or source too large." }); ws.close(); return; }
        try {
          const healthy = await check({ cfg: config.docker });
          if (!healthy.ok) { push({ type: "error", data: "The Python sandbox is unavailable right now." }); ws.close(); return; }
          if (ws.readyState !== ws.OPEN) return;
          release = await gate.acquire(payload.clientId || "anonymous");
          if (!release) { push({ type: "error", data: "The Python runner is busy. Please try again shortly." }); ws.close(); return; }
          // A queued socket can disappear before it owns a slot.
          if (ws.readyState !== ws.OPEN) { release(); release = undefined; return; }
          session = terminal({ ...(payload.files !== undefined ? { files: normalizeInteractiveFiles(payload) } : { code: payload.code }), timeoutMs: payload.timeoutMs, cpuTimeMs: payload.cpuTimeMs, cfg: config.docker, emit: push });
          await session.done;
          cleanup(); ws.close();
        } catch { push({ type: "error", data: "Could not start the Python sandbox." }); cleanup(); ws.close(); }
      });
    });
  });
  return { server, gate, terminals };
}

export function sanitizeTraceLimits(l) {
  const out = {};
  if (l && typeof l === "object") {
    if (Number.isInteger(l.maxSteps) && l.maxSteps > 0) out.maxSteps = Math.min(l.maxSteps, 10000);
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const config = loadConfig();
  try {
    assertConfigSafe(config);
  } catch (e) {
    console.error("refusing to start:", e.message);
    process.exit(1);
  }
  checkRuntime({ cfg: config.docker }).then((r) => {
    if (!r.ok) console.error(`warning: sandbox not ready (${r.reason}); requests will return sandbox_unavailable`);
  });
  const { server } = createApp({ config });
  server.listen(config.port, config.host, () => {
    console.log(`python sandbox worker listening on ${config.host}:${config.port}`);
  });
}
