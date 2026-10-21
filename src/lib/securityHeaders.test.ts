import { describe, expect, it } from "vitest";
import { securityHeaders } from "./securityHeaders";

describe("securityHeaders", () => {
  it("sends baseline headers and a report-only content security policy", () => {
    const headers = securityHeaders();
    const keys = headers.map((header) => header.key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
    const csp = headers.find((header) => header.key === "Content-Security-Policy-Report-Only")?.value || "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
