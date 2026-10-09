export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function createRateLimiter() {
  const buckets = new Map<string, number[]>();

  return {
    check(key: string, max: number, windowMs: number): RateLimitResult {
      const now = Date.now();
      const windowStart = now - windowMs;
      let hits = buckets.get(key) ?? [];
      hits = hits.filter((t) => t > windowStart);

      if (hits.length >= max) {
        const oldest = hits[0] ?? now;
        const retryAfterSec = Math.max(
          1,
          Math.ceil((oldest + windowMs - now) / 1000)
        );
        buckets.set(key, hits);
        return { ok: false, retryAfterSec };
      }

      hits.push(now);
      buckets.set(key, hits);
      return { ok: true };
    },
    reset() {
      buckets.clear();
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
