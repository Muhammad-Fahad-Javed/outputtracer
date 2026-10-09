import { describe, expect, it } from "vitest";
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

describe("clientIpFromForwarded", () => {
  it("uses the first X-Forwarded-For hop only when the proxy is trusted", () => {
    expect(
      clientIpFromForwarded("1.1.1.1, 2.2.2.2", "10.0.0.1", true)
    ).toBe("1.1.1.1");
    expect(
      clientIpFromForwarded("1.1.1.1, 2.2.2.2", "10.0.0.1", false)
    ).toBe("10.0.0.1");
  });
});
