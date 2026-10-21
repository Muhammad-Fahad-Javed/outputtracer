import { describe, expect, it } from "vitest";
import { apexRedirectHost } from "./canonicalHost";

describe("apexRedirectHost", () => {
  it("redirects the www alias to the apex", () => {
    expect(apexRedirectHost("www.outputtracer.com")).toBe("outputtracer.com");
  });

  it("ignores ports, case and a proxy list", () => {
    expect(apexRedirectHost("WWW.OutputTracer.com:443")).toBe("outputtracer.com");
    expect(apexRedirectHost("www.outputtracer.com, proxy.local")).toBe("outputtracer.com");
  });

  it("does not redirect the apex or unrelated hosts", () => {
    expect(apexRedirectHost("outputtracer.com")).toBeNull();
    expect(apexRedirectHost("staging.outputtracer.com")).toBeNull();
    expect(apexRedirectHost("outputtracer.com.evil.example")).toBeNull();
    expect(apexRedirectHost(null)).toBeNull();
    expect(apexRedirectHost("")).toBeNull();
  });
});
