export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

interface Bucket {
  hits: number[];
  windowMs: number;
}

// Opportunistic sweeps keep the map from growing without bound: we prune on a
// timer-free counter and whenever the map exceeds a hard ceiling, so a burst
// of unique keys (e.g. spoofed/rotating IPs) cannot leak memory forever.
const SWEEP_EVERY_OPS = 64;
const MAX_KEYS = 4096;

export function createRateLimiter() {
  const buckets = new Map<string, Bucket>();
  let opsSinceSweep = 0;

  function sweep(now: number) {
    for (const [key, bucket] of buckets) {
      const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
      if (now - newest > bucket.windowMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    check(key: string, max: number, windowMs: number): RateLimitResult {
      const now = Date.now();

      opsSinceSweep += 1;
      if (opsSinceSweep >= SWEEP_EVERY_OPS || buckets.size > MAX_KEYS) {
        opsSinceSweep = 0;
        sweep(now);
      }

      const windowStart = now - windowMs;
      const existing = buckets.get(key);
      const hits = (existing?.hits ?? []).filter((t) => t > windowStart);

      if (hits.length >= max) {
        const oldest = hits[0] ?? now;
        const retryAfterSec = Math.max(
          1,
          Math.ceil((oldest + windowMs - now) / 1000)
        );
        buckets.set(key, { hits, windowMs });
        return { ok: false, retryAfterSec };
      }

      hits.push(now);
      buckets.set(key, { hits, windowMs });
      return { ok: true };
    },
    reset() {
      buckets.clear();
      opsSinceSweep = 0;
    },
    // Number of tracked keys — used by tests and for observability.
    size(): number {
      return buckets.size;
    },
    // Force a sweep of expired keys (used by tests; check() also sweeps).
    sweep(now: number = Date.now()) {
      sweep(now);
    },
  };
}

export const globalRateLimiter = createRateLimiter();

export function clientIpFromForwarded(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustProxy: boolean
): string {
  if (trustProxy && forwardedFor) {
    const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return remoteAddress || "unknown";
}
