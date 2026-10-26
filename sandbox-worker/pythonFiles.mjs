// Kept independent of the app bundle: the private worker validates again before
// any source is sent to Docker. These are aggregate UTF-8 source limits.
export const PYTHON_SOURCE_LIMITS = Object.freeze({ maxFiles: 16, maxCodeBytes: 64 * 1024 });

function invalid(code) { throw Object.assign(new Error(code), { code }); }

/** Normalize the legacy single-code envelope or the multi-file terminal form. */
export function normalizeInteractiveFiles(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid("invalid_request");
  if (payload.files !== undefined && payload.code !== undefined) invalid("invalid_request");
  let files;
  if (payload.files !== undefined) {
    if (!payload.files || typeof payload.files !== "object" || Array.isArray(payload.files)) invalid("invalid_request");
    files = payload.files;
  } else {
    if (typeof payload.code !== "string") invalid("invalid_request");
    files = { "main.py": payload.code };
  }
  const entries = Object.entries(files);
  if (!entries.length || entries.length > PYTHON_SOURCE_LIMITS.maxFiles) invalid("invalid_request");
  if (!Object.hasOwn(files, "main.py") || typeof files["main.py"] !== "string") invalid("invalid_request");
  let bytes = 0;
  const normalized = {};
  for (const [name, source] of entries) {
    if (name.length < 3 || name.length > 64 || name.includes("..") ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.py$/i.test(name) || typeof source !== "string") invalid("invalid_request");
    bytes += Buffer.byteLength(source, "utf8");
    if (bytes > PYTHON_SOURCE_LIMITS.maxCodeBytes) invalid("source_too_large");
    normalized[name] = source;
  }
  return normalized;
}
