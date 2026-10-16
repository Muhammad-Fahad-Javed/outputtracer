import { describe, expect, it } from "vitest";
import {
  DEFAULT_WS_ALLOWED_ORIGINS,
  isOriginAllowed,
  parseAllowedOrigins,
} from "./wsOrigin";

describe("parseAllowedOrigins", () => {
  it("always includes the production origins", () => {
    const list = parseAllowedOrigins(undefined);
    expect(list).toContain("https://outputtracer.com");
    expect(list).toContain("https://www.outputtracer.com");
  });

  it("adds env-configured origins, de-duplicated and normalized", () => {
    const list = parseAllowedOrigins(
      "https://staging.outputtracer.com, https://Foo.Test/, https://outputtracer.com"
    );
    expect(list).toContain("https://staging.outputtracer.com");
    expect(list).toContain("https://foo.test");
    expect(list.filter((o) => o === "https://outputtracer.com")).toHaveLength(1);
  });
});

describe("isOriginAllowed", () => {
  const prod = { allowedOrigins: DEFAULT_WS_ALLOWED_ORIGINS, isDev: false };
  const dev = { allowedOrigins: DEFAULT_WS_ALLOWED_ORIGINS, isDev: true };

  it("allows the production origins (case-insensitive, trailing slash)", () => {
    expect(isOriginAllowed("https://outputtracer.com", prod)).toBe(true);
    expect(isOriginAllowed("https://www.outputtracer.com", prod)).toBe(true);
    expect(isOriginAllowed("HTTPS://OutputTracer.com/", prod)).toBe(true);
  });

  it("rejects an unknown origin in production", () => {
    expect(isOriginAllowed("https://evil.example", prod)).toBe(false);
    expect(isOriginAllowed("http://localhost:3000", prod)).toBe(false);
  });

  it("allows localhost only in development", () => {
    expect(isOriginAllowed("http://localhost:3000", dev)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173", dev)).toBe(true);
    expect(isOriginAllowed("http://[::1]:3000", dev)).toBe(true);
    expect(isOriginAllowed("http://localhost:3000", prod)).toBe(false);
  });

  it("allows a missing Origin (non-browser client)", () => {
    expect(isOriginAllowed(undefined, prod)).toBe(true);
    expect(isOriginAllowed(null, prod)).toBe(true);
    expect(isOriginAllowed("", prod)).toBe(true);
  });

  it("honours extra origins from configuration", () => {
    const policy = {
      allowedOrigins: parseAllowedOrigins("https://staging.outputtracer.com"),
      isDev: false,
    };
    expect(isOriginAllowed("https://staging.outputtracer.com", policy)).toBe(true);
    expect(isOriginAllowed("https://evil.example", policy)).toBe(false);
  });
});
