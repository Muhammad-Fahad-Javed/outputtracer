import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, clientIpFromForwarded } from "./rateLimit";

describe("rate limiter", () => {
  it("allows up to max hits in the window then blocks", () => {
    const limiter = createRateLimiter();
    expect(limiter.check("a", 2, 60_000).ok).toBe(true);
    expect(limiter.check("a", 2, 60_000).ok).toBe(true);
    const blocked = limiter.check("a", 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter();
    expect(limiter.check("a", 1, 60_000).ok).toBe(true);
    expect(limiter.check("b", 1, 60_000).ok).toBe(true);
    expect(limiter.check("a", 1, 60_000).ok).toBe(false);
  });
});

describe("rate limiter eviction", () => {
  afterEach(() => vi.useRealTimers());

  it("drops keys once their window has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const limiter = createRateLimiter();
    limiter.check("a", 1, 1000);
    limiter.check("b", 1, 1000);
    expect(limiter.size()).toBe(2);

    vi.setSystemTime(new Date("2026-01-01T00:00:02Z")); // 2s later > 1s window
    limiter.sweep();
    expect(limiter.size()).toBe(0);
  });

  it("allows a key again after its window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const limiter = createRateLimiter();
    expect(limiter.check("k", 1, 1000).ok).toBe(true);
    expect(limiter.check("k", 1, 1000).ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(limiter.check("k", 1, 1000).ok).toBe(true);
  });

  it("bounds memory as many distinct keys age out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const limiter = createRateLimiter();
    const base = Date.now();
    for (let i = 0; i < 5000; i++) {
      limiter.check(`k${i}`, 5, 1000);
      vi.setSystemTime(base + i * 5); // advance 5ms per key
    }
    // 5000 distinct keys inserted, but only ~200 fall inside the 1000ms
    // window at any time — the periodic sweep keeps the map bounded.
    expect(limiter.size()).toBeLessThan(1000);
  });
});

describe("clientIpFromForwarded", () => {
  it("uses the first X-Forwarded-For hop only when the proxy is trusted", () => {
    expect(clientIpFromForwarded("1.1.1.1, 2.2.2.2", "10.0.0.1", true)).toBe(
      "1.1.1.1"
    );
    expect(clientIpFromForwarded("1.1.1.1, 2.2.2.2", "10.0.0.1", false)).toBe(
      "10.0.0.1"
    );
  });
});
