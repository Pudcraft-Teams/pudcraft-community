import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeCookieName, type Locale } from "./config";

export interface LocaleSources {
  header: string | null;
  cookie: string | null;
  acceptLanguage: string;
}

export function resolveLocaleFrom(sources: LocaleSources): Locale {
  if (isLocale(sources.header)) return sources.header;
  if (isLocale(sources.cookie)) return sources.cookie;
  const fromAccept = pickFromAcceptLanguage(sources.acceptLanguage);
  if (fromAccept) return fromAccept;
  return defaultLocale;
}

/**
 * Pick the supported locale with the highest Accept-Language q-value.
 * Ties preserve header order. Unsupported language tags are ignored.
 */
function pickFromAcceptLanguage(acceptLanguage: string): Locale | null {
  const candidates = acceptLanguage
    .split(",")
    .map((raw, index) => {
      const [rawTag, ...params] = raw.split(";");
      const primaryTag = rawTag?.trim().toLowerCase().split("-")[0] ?? "";
      const locale = isLocale(primaryTag) ? primaryTag : null;
      if (!locale) return null;

      const rawQ = params
        .map((param) => param.trim().toLowerCase())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      const q = rawQ === undefined ? 1 : Number.parseFloat(rawQ);
      if (!Number.isFinite(q) || q <= 0) return null;

      return { index, locale, q };
    })
    .filter(
      (candidate): candidate is { index: number; locale: Locale; q: number } => candidate !== null,
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);

  return candidates[0]?.locale ?? null;
}

export async function getRequestLocale(request?: Request): Promise<Locale> {
  if (request) {
    return resolveLocaleFrom({
      header: request.headers.get("x-locale"),
      cookie: extractCookie(request.headers.get("cookie"), localeCookieName),
      acceptLanguage: request.headers.get("accept-language") ?? "",
    });
  }
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocaleFrom({
    header: headerList.get("x-locale"),
    cookie: cookieStore.get(localeCookieName)?.value ?? null,
    acceptLanguage: headerList.get("accept-language") ?? "",
  });
}

export function extractCookie(raw: string | null, name: string): string | null {
  if (!raw) return null;
  const parts = raw.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v ?? "");
      } catch (error) {
        // Malformed percent-encoding (e.g. "NEXT_LOCALE=%E4") throws
        // URIError. Treat the cookie as absent so callers fall through
        // to the next locale source instead of producing a 500.
        if (error instanceof URIError) {
          return null;
        }
        throw error;
      }
    }
  }
  return null;
}
