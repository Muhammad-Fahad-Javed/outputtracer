// Response headers shared by the Next.js config.
//
// Content-Security-Policy is report-only until a browser pass confirms Monaco,
// Turnstile, Supabase, and the terminal do not violate it. The other headers
// are enforced. HSTS is off unless ENABLE_HSTS=1, because it must only be
// sent after the HTTPS certificate on the canonical domain is verified.

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
].join("; ");

export function securityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy-Report-Only", value: CSP },
  ];
  if (process.env.ENABLE_HSTS === "1" || process.env.ENABLE_HSTS === "true") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}
