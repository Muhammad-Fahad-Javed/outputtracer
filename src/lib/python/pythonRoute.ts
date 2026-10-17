// Shared request pipeline for /api/python and /api/python/trace.
import { getPythonApiDeps } from "./pythonApiDeps";
import {
  PYTHON_LIMITS,
  PythonSystemError,
  byteLength,
  systemErrorBody,
  type PythonApiResponse,
} from "./pythonTypes";

const MAX_BODY_BYTES = PYTHON_LIMITS.maxCodeBytes + PYTHON_LIMITS.maxStdinBytes + 4096;
const MAX_INFLIGHT_PER_USER = 2;
const inflight = new Map<string, number>(); // per instance; the worker also caps per client across instances

function json<T>(body: PythonApiResponse<T>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readBoundedBody(req: Request): Promise<unknown> {
  if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) throw new PythonSystemError("invalid_request");
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new PythonSystemError("source_too_large");

  // Read incrementally so a missing/lying content-length cannot bypass the cap.
  const reader = req.body?.getReader();
  if (!reader) throw new PythonSystemError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PythonSystemError("source_too_large");
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  if (byteLength(text) === 0) throw new PythonSystemError("invalid_request");
  try {
    return JSON.parse(text);
  } catch {
    throw new PythonSystemError("invalid_request");
  }
}

export async function handlePythonRequest<T>(
  req: Request,
  bucket: "python-run" | "python-trace",
  work: (body: unknown, ctx: { userId: string }) => Promise<T>,
): Promise<Response> {
  let userId: string | null = null;
  try {
    const deps = getPythonApiDeps(); // throws "disabled" until wired
    userId = (await deps.authenticate(req)).userId;
    await deps.rateLimit(userId, bucket);

    // Reserve the slot synchronously (no await between check and increment),
    // otherwise concurrent requests could both pass the check.
    const current = inflight.get(userId) ?? 0;
    if (current >= MAX_INFLIGHT_PER_USER) throw new PythonSystemError("busy");
    inflight.set(userId, current + 1);
    const reservedFor = userId;
    try {
      const body = await readBoundedBody(req);
      const result = await work(body, { userId });
      return json({ ok: true, result }, 200);
    } finally {
      const n = (inflight.get(reservedFor) ?? 1) - 1;
      if (n <= 0) inflight.delete(reservedFor); else inflight.set(reservedFor, n);
    }
  } catch (e) {
    if (e instanceof PythonSystemError) return json(systemErrorBody(e.code), e.httpStatus);
    // Never leak internals: log server-side only.
    console.error("[python-api] unexpected failure", e instanceof Error ? e.name : "unknown");
    return json(systemErrorBody("internal_error"), 500);
  }
}

export function methodNotAllowed(): Response {
  return new Response(JSON.stringify(systemErrorBody("invalid_request")), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST" },
  });
}
