function firstValue(value: string | null): string {
  return (value ?? "").split(",")[0].trim();
}

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

export function requestOrigin(request: Request): string {
  const configured = (process.env.SITE_URL ?? "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ignore malformed SITE_URL
    }
  }

  const host =
    firstValue(request.headers.get("x-forwarded-host")) ||
    firstValue(request.headers.get("host"));
  if (host) {
    const forwardedProto = firstValue(request.headers.get("x-forwarded-proto"));
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : isLocalHost(host)
          ? "http"
          : "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
