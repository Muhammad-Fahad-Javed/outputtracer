// Absolute site URL for links the server has to build itself (transactional
// email, invitation links). Request-scoped redirects should use
// `requestOrigin()` instead — they must stay on the browser's origin.

const DEFAULT_PRODUCTION_ORIGIN = "https://outputtracer.com";

function normalise(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function siteUrl(): string {
  // SITE_URL is the documented server-side setting. NEXT_PUBLIC_SITE_URL is
  // still accepted for backwards compatibility with older deployments.
  const configured = normalise(process.env.SITE_URL) ?? normalise(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  // Never fall back to localhost in production: those links land in a user's
  // inbox and must resolve on the public site.
  return process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_ORIGIN
    : "http://localhost:3000";
}
