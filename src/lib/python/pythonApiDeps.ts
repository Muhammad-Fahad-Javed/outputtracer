import { PythonSystemError } from "./pythonTypes";

export interface PythonApiDeps {
  /** Return a stable user id (<= 64 chars) or throw PythonSystemError("unauthorized"). */
  authenticate(req: Request): Promise<{ userId: string }>;
  /** Throw PythonSystemError("rate_limited") when the caller is over budget. */
  rateLimit(key: string, bucket: "python-run" | "python-trace"): Promise<void>;
}

let deps: PythonApiDeps | null = null;

export const defaultPythonApiDeps: PythonApiDeps = {
  async authenticate(req: Request) {
    if (process.env.PYTHON_EXECUTION_ENABLED === "false") {
      throw new PythonSystemError("disabled");
    }
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          return { userId: data.user.id };
        }
      }
    } catch {
      // In guest or non-session context
    }
    // Allow guest execution identified by IP
    const { clientIpFromForwarded } = await import("@/lib/rateLimit");
    const ip = clientIpFromForwarded(
      req.headers.get("x-forwarded-for") ?? undefined,
      undefined,
      process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
    );
    return { userId: `ip:${ip}`.slice(0, 64) };
  },
  async rateLimit(key: string, bucket: "python-run" | "python-trace") {
    const { globalRateLimiter } = await import("@/lib/rateLimit");
    const limit = bucket === "python-run" ? 30 : 20;
    const res = globalRateLimiter.check(`${bucket}:${key}`, limit, 60_000);
    if (!res.ok) {
      throw new PythonSystemError("rate_limited");
    }
  },
};

/** Call once at startup (or edit the default below) to enable the routes. */
export function configurePythonApi(d: PythonApiDeps): void {
  deps = d;
}

export function initDefaultPythonApi(): void {
  if (!deps) {
    deps = defaultPythonApiDeps;
  }
}

export function getPythonApiDeps(): PythonApiDeps {
  if (!deps && process.env.NODE_ENV !== "test") {
    deps = defaultPythonApiDeps;
  }
  if (!deps) throw new PythonSystemError("disabled");
  return deps;
}
