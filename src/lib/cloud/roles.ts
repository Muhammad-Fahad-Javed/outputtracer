export const PROJECT_ROLES = ["owner", "editor", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export function isProjectRole(value: unknown): value is ProjectRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

export function canEdit(role: ProjectRole): boolean {
  return role === "owner" || role === "editor";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

const SAFE_PATH_ORIGIN = "https://outputtracer.com";
// Backslashes and control characters are stripped/normalised differently by
// browsers, so "/\t/evil.com" can become the protocol-relative "//evil.com"
// after parsing. Reject them before the URL parser sees them.
const UNSAFE_PATH_CHARS = /[\\\u0000-\u001f\u007f]/;

/**
 * Only allow same-origin relative paths through the `next` parameter.
 * Anything that could resolve to another origin falls back to /projects.
 */
export function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/projects";
  }
  if (UNSAFE_PATH_CHARS.test(value)) {
    return "/projects";
  }
  try {
    const parsed = new URL(value, SAFE_PATH_ORIGIN);
    if (parsed.origin !== SAFE_PATH_ORIGIN) return "/projects";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/projects";
  }
}
