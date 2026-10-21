import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestOrigin } from "./requestOrigin";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1:3000/projects", { headers });
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestOrigin", () => {
  it("uses the request host even when SITE_URL still points at the legacy staging domain", () => {
    // Regression: this combination redirected outputtracer.com users to
    // https://outputtracer.devs.surf/login?next=..., which browsers reject
    // for fetch/preflight requests ("Redirect is not allowed for a preflight
    // request").
    vi.stubEnv("SITE_URL", "https://outputtracer.devs.surf");

    expect(
      requestOrigin(makeRequest({ host: "outputtracer.com", "x-forwarded-proto": "https" }))
    ).toBe("https://outputtracer.com");
  });

  it("stays on the requested host for the www alias", () => {
    vi.stubEnv("SITE_URL", "https://outputtracer.devs.surf");

    expect(
      requestOrigin(makeRequest({ host: "www.outputtracer.com", "x-forwarded-proto": "https" }))
    ).toBe("https://www.outputtracer.com");
  });

  it("does not trust an unknown Host header (open-redirect guard)", () => {
    vi.stubEnv("SITE_URL", "https://outputtracer.devs.surf");

    expect(
      requestOrigin(makeRequest({ host: "evil.example", "x-forwarded-proto": "https" }))
    ).toBe("https://outputtracer.devs.surf");
  });

  it("falls back to the canonical production origin for unknown hosts", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      requestOrigin(makeRequest({ host: "evil.example", "x-forwarded-proto": "https" }))
    ).toBe("https://outputtracer.com");
  });

  it("returns the configured origin when the request has no host header", () => {
    vi.stubEnv("SITE_URL", "https://outputtracer.com/");

    expect(requestOrigin(makeRequest({}))).toBe("https://outputtracer.com");
  });

  it("prefers x-forwarded-host over host (reverse proxy)", () => {
    expect(
      requestOrigin(
        makeRequest({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "outputtracer.com",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://outputtracer.com");
  });

  it("allows loopback origins outside production", () => {
    expect(
      requestOrigin(makeRequest({ host: "localhost:3000", "x-forwarded-proto": "http" }))
    ).toBe("http://localhost:3000");
  });

  it("ignores a malformed SITE_URL", () => {
    vi.stubEnv("SITE_URL", "not a url");

    expect(
      requestOrigin(makeRequest({ host: "outputtracer.com", "x-forwarded-proto": "https" }))
    ).toBe("https://outputtracer.com");
  });
});
