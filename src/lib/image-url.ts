/**
 * Normalize an image src that may be a raw storage key (e.g. "pudcraft/avatars/xxx.webp")
 * into a valid URL that next/image can render.
 *
 * - Already a full URL (http/https) → pass through
 * - Already an absolute path (/) → pass through
 * - Raw storage key → strip "pudcraft/" prefix, prepend "/uploads/"
 * - Null/undefined/empty → return null
 */
export function normalizeImageSrc(
  src: string | null | undefined,
): string | null {
  if (!src) return null;

  // Already a valid URL or absolute path
  if (/^https?:\/\//.test(src) || src.startsWith("/")) return src;

  // Raw storage key: "pudcraft/avatars/xxx.webp" → "/uploads/avatars/xxx.webp"
  const key = src.startsWith("pudcraft/")
    ? src.substring("pudcraft/".length)
    : src;

  return `/uploads/${key}`;
}
