export interface MobileSessionUser {
  id: string;
  uid: number;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

export interface MobileSessionUserSource {
  id: string;
  uid: number;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
}

interface AuthJsRedirectPayload {
  url?: string | null;
}

interface CookieReadableHeaders {
  get(name: string): string | null;
  getSetCookie?: () => string[];
}

export function toMobileSessionUser(user: MobileSessionUserSource): MobileSessionUser {
  return {
    id: user.id,
    uid: user.uid,
    name: user.name ?? null,
    email: user.email ?? "",
    image: user.image ?? null,
    role: user.role ?? "user",
  };
}

export function readSetCookieHeaders(headers: CookieReadableHeaders): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  return splitSetCookieHeader(headers.get("set-cookie"));
}

export function splitSetCookieHeader(header: string | null | undefined): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(/,(?=[^;,\s]+=)/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function mergeSetCookieHeaders(...groups: ReadonlyArray<readonly string[]>): string[] {
  const cookies = new Map<string, string>();

  for (const group of groups) {
    for (const setCookie of group) {
      const pair = getCookiePair(setCookie);
      if (!pair) {
        continue;
      }

      cookies.set(pair.name, setCookie);
    }
  }

  return [...cookies.values()];
}

export function toRequestCookieHeader(setCookieHeaders: readonly string[]): string {
  const cookies = new Map<string, string>();

  for (const setCookie of setCookieHeaders) {
    const pair = getCookiePair(setCookie);
    if (!pair) {
      continue;
    }

    cookies.set(pair.name, pair.value);
  }

  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function resolveAuthJsCredentialsCallback(
  _status: number,
  payload: AuthJsRedirectPayload | null,
  baseUrl: string,
): { kind: "success" | "invalid_credentials" | "error"; url: string | null } {
  if (typeof payload?.url !== "string" || payload.url.length === 0) {
    return { kind: "error", url: null };
  }

  const url = new URL(payload.url, baseUrl).toString();
  const error = new URL(url).searchParams.get("error");

  if (error === "CredentialsSignin") {
    return { kind: "invalid_credentials", url };
  }

  if (error) {
    return { kind: "error", url };
  }

  return { kind: "success", url };
}

export function appendSetCookieHeaders(headers: Headers, setCookieHeaders: readonly string[]) {
  for (const setCookie of setCookieHeaders) {
    headers.append("set-cookie", setCookie);
  }
}

function getCookiePair(setCookie: string): { name: string; value: string } | null {
  const cookie = setCookie.split(";", 1)[0]?.trim() ?? "";
  const separatorIndex = cookie.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  return {
    name: cookie.slice(0, separatorIndex).trim(),
    value: cookie.slice(separatorIndex + 1).trim(),
  };
}
