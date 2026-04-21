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
 * Walk every token in an Accept-Language header and pick the first one whose
 * primary tag matches a supported locale.
 *
 * We intentionally ignore `q` weights and rely on the listed order, which is
 * the default preference order browsers emit. This avoids pulling in a full
 * language-negotiator dependency while still handling headers like
 * "fr-FR,en;q=0.9" correctly — the primary tag is unsupported but a later
 * token resolves to a supported locale.
 */
function pickFromAcceptLanguage(acceptLanguage: string): Locale | null {
  const tokens = acceptLanguage.split(",");
  for (const raw of tokens) {
    const tag = raw.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!tag) continue;
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("zh")) return "zh";
  }
  return null;
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

function extractCookie(raw: string | null, name: string): string | null {
  if (!raw) return null;
  const parts = raw.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === name) return decodeURIComponent(v ?? "");
  }
  return null;
}
