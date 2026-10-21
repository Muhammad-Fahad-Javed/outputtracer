import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./siteUrl";

beforeEach(() => {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("prefers SITE_URL and normalises it to an origin", () => {
    vi.stubEnv("SITE_URL", "https://outputtracer.com/some/path?x=1");
    expect(siteUrl()).toBe("https://outputtracer.com");
  });

  it("accepts NEXT_PUBLIC_SITE_URL for older deployments", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.test");
    expect(siteUrl()).toBe("https://staging.example.test");
  });

  it("never falls back to localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(siteUrl()).toBe("https://outputtracer.com");
  });

  it("uses localhost outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("ignores malformed values", () => {
    vi.stubEnv("SITE_URL", "://broken");
    vi.stubEnv("NODE_ENV", "production");
    expect(siteUrl()).toBe("https://outputtracer.com");
  });
});
