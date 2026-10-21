// Canonical-host redirect policy.
//
// The site is served from the apex domain (https://outputtracer.com) and
// https://www.outputtracer.com is an alias. Every page already declares the
// apex as its canonical URL, so the alias must redirect rather than serve a
// duplicate copy of the site.
//
// This lives in its own module so the host parsing can be unit tested
// without booting Next.js.

export const APEX_HOST = "outputtracer.com";
export const WWW_HOST = "www.outputtracer.com";

/**
 * Returns the host a request should be redirected to, or null when no
 * canonical-host redirect applies.
 *
 * Accepts an optional proxy list (`a, b`) and an optional `:port` suffix.
 */
export function apexRedirectHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const normalized = host.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return normalized === WWW_HOST ? APEX_HOST : null;
}
