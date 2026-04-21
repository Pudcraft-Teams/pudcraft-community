import type { Locale } from "@/i18n/config";

export interface ApiFetchOptions {
  locale: Locale | null;
  init?: RequestInit;
}

export function buildApiHeaders(opts: ApiFetchOptions): Headers {
  const headers = new Headers(opts.init?.headers);
  if (opts.locale) headers.set("x-locale", opts.locale);
  return headers;
}

export async function apiFetch(
  input: string | URL,
  opts: ApiFetchOptions,
): Promise<Response> {
  const headers = buildApiHeaders(opts);
  return fetch(input, { ...opts.init, headers });
}
