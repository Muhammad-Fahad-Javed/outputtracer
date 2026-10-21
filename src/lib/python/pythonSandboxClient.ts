// HTTP client for the sandbox worker service (sandbox-worker/server.mjs).
// Production never executes Python in this process. A local interpreter is
// used only outside production, and only when the worker is not configured
// and ALLOW_UNSANDBOXED_EXECUTION is explicitly set. A configured worker
// that fails is never replaced by a host process.
import { unsandboxedExecutionAllowed } from "../sandbox";
import { PythonSystemError } from "./pythonTypes";
import { executePythonLocally } from "./localExecutor";

export interface SandboxConfig {
  enabled: boolean;
  url: string;
  token: string;
}

export function loadSandboxConfig(env: Record<string, string | undefined> = process.env): SandboxConfig {
  return {
    enabled: env.PYTHON_EXECUTION_ENABLED === "true",
    url: (env.PYTHON_SANDBOX_URL || "").replace(/\/+$/, ""),
    token: env.PYTHON_SANDBOX_TOKEN || "",
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WorkerCallArgs {
  path: "/v1/run" | "/v1/trace";
  body: Record<string, unknown>;
  timeoutMs: number;
  config?: SandboxConfig;
  fetchImpl?: FetchLike;
}

/** Returns the worker's parsed JSON for HTTP 200; throws PythonSystemError otherwise. */
export async function callWorker(args: WorkerCallArgs): Promise<Record<string, unknown>> {
  const config = args.config ?? loadSandboxConfig();
  if (!config.enabled) throw new PythonSystemError("disabled");

  if (!config.url || config.token.length < 32) {
    if (unsandboxedExecutionAllowed()) {
      const mode = args.path === "/v1/trace" ? "trace" : "run";
      return (await executePythonLocally({
        mode,
        code: (args.body.code as string) || "",
        stdin: (args.body.stdin as string) || "",
        limits: args.body.limits as { maxSteps?: number; maxDepth?: number } | undefined,
        timeoutMs: args.timeoutMs,
      })) as unknown as Record<string, unknown>;
    }
    throw new PythonSystemError("sandbox_unavailable");
  }
  const doFetch: FetchLike = args.fetchImpl ?? ((i, init) => fetch(i, init));

  let res: Response;
  try {
    res = await doFetch(config.url + args.path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
      body: JSON.stringify(args.body),
      signal: AbortSignal.timeout(args.timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new PythonSystemError("sandbox_unavailable");
  }

  if (res.status === 429) throw new PythonSystemError("busy");
  if (res.status === 503) throw new PythonSystemError("sandbox_unavailable");
  if (res.status === 413) throw new PythonSystemError("source_too_large");
  if (res.status === 400 || res.status === 415) throw new PythonSystemError("invalid_request");
  // 401 means our token is wrong: a server misconfiguration, never the client's fault.
  if (res.status !== 200) throw new PythonSystemError("internal_error");

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new PythonSystemError("internal_error");
  }
  if (!json || typeof json !== "object") throw new PythonSystemError("internal_error");
  const obj = json as Record<string, unknown>;
  if (obj.status === "sandbox_unavailable") throw new PythonSystemError("sandbox_unavailable");
  if (obj.status === "internal_error") throw new PythonSystemError("internal_error");
  return obj;
}
