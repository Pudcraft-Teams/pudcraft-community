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
  const primary = sources.acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  if (primary.startsWith("en")) return "en";
  if (primary.startsWith("zh")) return "zh";
  return defaultLocale;
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
