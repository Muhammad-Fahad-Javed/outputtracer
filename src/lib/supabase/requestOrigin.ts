// Work out the public origin a redirect should point at.
//
// Redirects must stay on the origin the browser is already using. Building
// them from a static env var is what sent production users to the legacy
// staging domain: while SITE_URL was still https://outputtracer.devs.surf,
// every expired session on outputtracer.com was redirected cross-origin.
// Browsers refuse to follow a cross-origin redirect for a fetch/preflight
// request, which surfaced as:
//   "Redirect is not allowed for a preflight request."
//
// So we prefer the request host, but only when it is a host we know about.
// Trusting Host/X-Forwarded-Host blindly would turn these redirects into an
// open redirect (host-header injection), so the order is:
//   1. request host, if it is known: the canonical host, the host configured
//      in SITE_URL, or loopback outside production
//   2. SITE_URL (the canonical deployment origin)
//   3. the request URL's own origin (dev) / the production canonical origin

const CANONICAL_PRODUCTION_ORIGIN = "https://outputtracer.com";

const CANONICAL_HOSTS = new Set(["outputtracer.com", "www.outputtracer.com"]);

const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

function firstValue(value: string | null): string {
  return (value ?? "").split(",")[0].trim();
}

/** SITE_URL normalised to an origin, or null when unset/malformed. */
function configuredOrigin(): string | null {
  const raw = (process.env.SITE_URL ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isTrustedHost(host: string, configured: string | null): boolean {
  const normalized = host.toLowerCase();
  if (CANONICAL_HOSTS.has(normalized)) return true;
  if (configured) {
    try {
      if (new URL(configured).host.toLowerCase() === normalized) return true;
    } catch {
      // configuredOrigin() already validated it; ignore.
    }
  }
  // Loopback is trusted only outside production, so a spoofed Host header can
  // never point a production redirect at a developer machine.
  if (process.env.NODE_ENV !== "production" && LOOPBACK_HOST_RE.test(normalized)) {
    return true;
  }
  return false;
}

export function requestOrigin(request: Request): string {
  const configured = configuredOrigin();

  const host =
    firstValue(request.headers.get("x-forwarded-host")) ||
    firstValue(request.headers.get("host"));

  if (host) {
    const forwardedProto = firstValue(request.headers.get("x-forwarded-proto"));
    const proto =
      forwardedProto === "https" || forwardedProto === "http"
        ? forwardedProto
        : LOOPBACK_HOST_RE.test(host)
          ? "http"
          : "https";

    try {
      const candidate = new URL(`${proto}://${host}`);
      if (isTrustedHost(candidate.host, configured)) return candidate.origin;
    } catch {
      // Malformed Host header — fall through to the deployment origin.
    }
  }

  if (configured) return configured;

  return process.env.NODE_ENV === "production"
    ? CANONICAL_PRODUCTION_ORIGIN
    : new URL(request.url).origin;
}
