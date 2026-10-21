// WebSocket Origin validation.
//
// Browsers always send an `Origin` header on WebSocket handshakes and do NOT
// apply the same-origin policy to WebSockets. Without a check, any website a
// user visits could open a socket to our server (cross-site WebSocket
// hijacking). We therefore allow-list the origins we serve (and, in
// development, localhost).
//
// Non-browser clients (curl, our own tests, native apps) do not send an
// Origin header. They are not a cross-site browser attack vector and cannot
// be stopped by an Origin check anyway, so a missing Origin is allowed. The
// check protects browsers, which always send it.

export const DEFAULT_WS_ALLOWED_ORIGINS = [
  "https://outputtracer.com",
  "https://www.outputtracer.com",
];

const LOOPBACK_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function normalizeOrigin(origin: string): string {
  let value = origin.trim().toLowerCase();
  if (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

// The default production origins plus anything supplied via the
// WS_ALLOWED_ORIGINS environment variable (comma-separated).
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  const origins = [...DEFAULT_WS_ALLOWED_ORIGINS];
  if (raw) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (trimmed) origins.push(trimmed);
    }
  }
  return Array.from(new Set(origins.map(normalizeOrigin)));
}

export interface OriginPolicy {
  allowedOrigins: string[];
  isDev: boolean;
}

export function isOriginAllowed(
  origin: string | undefined | null,
  policy: OriginPolicy
): boolean {
  if (!origin) return true; // non-browser client; see note above
  const normalized = normalizeOrigin(origin);
  const allowed = policy.allowedOrigins.map(normalizeOrigin);
  if (allowed.includes(normalized)) return true;
  if (policy.isDev && LOOPBACK_RE.test(normalized)) return true;
  return false;
}
