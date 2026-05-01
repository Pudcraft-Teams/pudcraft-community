/**
 * Coerce a `?callbackUrl=` value to a safe same-origin path, falling back
 * to "/" for anything we can't trust.
 *
 * Defends against open-redirect tricks beyond the obvious `//evil.com`:
 *   - `\evil.com` — WHATWG URL resolution treats backslash as a path
 *     separator, so `/\evil.com` resolves to `https://evil.com/`.
 *   - `/%5C…` — some downstream consumers percent-decode before re-parsing,
 *     which surfaces the backslash form above; reject the encoded variant.
 *   - `/%2F…` — same idea for the encoded forward slash.
 *
 * Final safety net: resolve against a placeholder origin and require the
 * result to stay there. Anything that escapes is dropped to "/".
 */
export function safeSameOriginCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "/";
  const head = trimmed.slice(0, 4).toLowerCase();
  if (
    head.startsWith("//") ||
    head.startsWith("/\\") ||
    head.startsWith("/%2f") ||
    head.startsWith("/%5c")
  ) {
    return "/";
  }
  try {
    const placeholder = "https://callback-sanitizer.invalid";
    const resolved = new URL(trimmed, placeholder);
    if (resolved.origin !== placeholder) return "/";
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    return path || "/";
  } catch {
    return "/";
  }
}
