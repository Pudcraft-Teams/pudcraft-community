import { createTranslator } from "next-intl";
import { NextResponse } from "next/server";
import type { Locale } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/locale";
import { flattenZodErrorWithLocale } from "@/lib/i18nZod";
import { getForwardedClientIpHeaders } from "@/lib/request-ip";
import { loginSchema } from "@/lib/validation";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";

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

interface MobileSessionAuthResult {
  user?: {
    id?: string | null;
  } | null;
}

interface ActiveMobileSessionUserRecord extends MobileSessionUserSource {
  id: string;
  uid: number;
  isBanned: boolean;
}

interface MobileLoginPostDependencies {
  fetchImpl?: typeof fetch;
}

interface MobileSessionDeleteDependencies {
  fetchImpl?: typeof fetch;
}

interface MobileSessionGetDependencies {
  authImpl: () => Promise<MobileSessionAuthResult | null>;
  loadUserById: (userId: string) => Promise<ActiveMobileSessionUserRecord | null>;
}

type MobileLoginFailureReason = "invalid_credentials" | "banned";

type MobileAuthErrorKey =
  | "notAuthenticated"
  | "userNotFound"
  | "banned"
  | "credentials"
  | "loginFailed"
  | "logoutFailed";

type MobileApiCommonErrorKey = "validationFailed";

type MobileAuthTranslator = (key: MobileAuthErrorKey) => string;

type MobileApiCommonTranslator = (key: MobileApiCommonErrorKey) => string;

interface SessionFacadeTranslators {
  common: MobileApiCommonTranslator;
  auth: MobileAuthTranslator;
}

const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

function getSessionFacadeTranslators(locale: Locale): SessionFacadeTranslators {
  const tCommon = createTranslator({
    locale,
    namespace: "errors.api",
    messages: messagesByLocale[locale],
  });
  const tAuth = createTranslator({
    locale,
    namespace: "errors.api.auth",
    messages: messagesByLocale[locale],
  });
  return {
    common: (key) => tCommon(key),
    auth: (key) => tAuth(key),
  };
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

  const cookies: string[] = [];
  let start = 0;

  for (let index = 0; index < header.length - 1; index += 1) {
    if (header[index] !== "," || header[index + 1] !== " ") {
      continue;
    }

    if (!COOKIE_RECORD_START.test(header.slice(index + 2))) {
      continue;
    }

    cookies.push(header.slice(start, index).trim());
    start = index + 2;
  }

  cookies.push(header.slice(start).trim());

  return cookies.filter((value) => value.length > 0);
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
):
  | { kind: "success"; url: string }
  | { kind: "auth_error"; reason: MobileLoginFailureReason; url: string }
  | { kind: "error"; url: string | null } {
  if (typeof payload?.url !== "string" || payload.url.length === 0) {
    return { kind: "error", url: null };
  }

  const parsedUrl = new URL(payload.url, baseUrl);
  const url = parsedUrl.toString();
  const error = parsedUrl.searchParams.get("error");

  if (error === "CredentialsSignin") {
    return {
      kind: "auth_error",
      reason: parsedUrl.searchParams.get("code") === "banned" ? "banned" : "invalid_credentials",
      url,
    };
  }

  if (error) {
    return { kind: "error", url };
  }

  return { kind: "success", url };
}

export function toMobileLoginError(
  reason: MobileLoginFailureReason,
  locale: Locale = "zh",
): {
  status: number;
  body: { error: string; code: "credentials" | "banned" };
} {
  const { auth: tAuth } = getSessionFacadeTranslators(locale);
  if (reason === "banned") {
    return {
      status: 403,
      body: {
        error: tAuth("banned"),
        code: "banned",
      },
    };
  }

  return {
    status: 401,
    body: {
      error: tAuth("credentials"),
      code: "credentials",
    },
  };
}

export function appendSetCookieHeaders(headers: Headers, setCookieHeaders: readonly string[]) {
  for (const setCookie of setCookieHeaders) {
    headers.append("set-cookie", setCookie);
  }
}

export function resolveTrustedAuthBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  request?: Request,
): string {
  const configuredUrl = normalizeTrustedBaseUrl(env.NEXTAUTH_URL ?? env.AUTH_URL);
  if (configuredUrl) {
    return configuredUrl;
  }

  const vercelUrl = env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  const localRequestUrl = resolveLocalRequestOrigin(request);
  if (localRequestUrl) {
    return localRequestUrl;
  }

  throw new Error("Missing trusted auth base URL for mobile session facade");
}

export async function handleMobileLoginPost(request: Request, deps: MobileLoginPostDependencies = {}) {
  const locale = await getRequestLocale(request);
  const { common: tCommon, auth: tAuth } = getSessionFacadeTranslators(locale);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
      { status: 400 },
    );
  }

  const authBaseUrl = resolveTrustedAuthBaseUrl(process.env, request);
  const forwardedIpHeaders = getForwardedClientIpHeaders(request);

  const csrfResponse = await fetchImpl(`${authBaseUrl}/api/auth/csrf`, {
    cache: "no-store",
    ...(Object.keys(forwardedIpHeaders).length > 0 ? { headers: forwardedIpHeaders } : {}),
  });
  const csrfCookies = readSetCookieHeaders(csrfResponse.headers);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const form = new URLSearchParams({
    email: parsed.data.email,
    password: parsed.data.password,
    csrfToken,
    callbackUrl: `${authBaseUrl}/`,
    json: "true",
  });

  const authHeaders: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "X-Auth-Return-Redirect": "1",
    ...forwardedIpHeaders,
  };
  if (csrfCookies.length > 0) {
    authHeaders.cookie = toRequestCookieHeader(csrfCookies);
  }

  const authResponse = await fetchImpl(`${authBaseUrl}${CREDENTIALS_CALLBACK}`, {
    method: "POST",
    headers: authHeaders,
    body: form.toString(),
    redirect: "manual",
  });
  const authCookies = readSetCookieHeaders(authResponse.headers);
  const responseCookies = mergeSetCookieHeaders(csrfCookies, authCookies);
  const authPayload = (await authResponse.json().catch(() => null)) as { url?: string | null } | null;
  const authResult = resolveAuthJsCredentialsCallback(authResponse.status, authPayload, authBaseUrl);

  if (authResult.kind === "auth_error") {
    const loginError = toMobileLoginError(authResult.reason, locale);
    const response = NextResponse.json(loginError.body, { status: loginError.status });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const sessionResponse = await fetchImpl(`${authBaseUrl}/api/mobile/session`, {
    headers: responseCookies.length > 0 ? { cookie: toRequestCookieHeader(responseCookies) } : {},
    cache: "no-store",
  });
  if (authResult.kind === "error") {
    const response = NextResponse.json({ error: tAuth("loginFailed") }, { status: 500 });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  if (sessionResponse.status === 401) {
    const loginError = toMobileLoginError("invalid_credentials", locale);
    const response = NextResponse.json(loginError.body, { status: loginError.status });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const payload = await sessionResponse.json();

  const response = NextResponse.json(payload, { status: sessionResponse.status });
  appendSetCookieHeaders(response.headers, responseCookies);
  return response;
}

export async function handleMobileSessionDelete(
  request: Request,
  deps: MobileSessionDeleteDependencies = {},
) {
  const locale = await getRequestLocale(request);
  const { auth: tAuth } = getSessionFacadeTranslators(locale);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authBaseUrl = resolveTrustedAuthBaseUrl(process.env, request);
  const forwardedIpHeaders = getForwardedClientIpHeaders(request);
  const requestCookieHeader = request.headers.get("cookie");

  const csrfRequestHeaders: Record<string, string> = {
    ...forwardedIpHeaders,
  };
  if (requestCookieHeader) {
    csrfRequestHeaders.cookie = requestCookieHeader;
  }

  const csrfResponse = await fetchImpl(`${authBaseUrl}/api/auth/csrf`, {
    cache: "no-store",
    ...(Object.keys(csrfRequestHeaders).length > 0 ? { headers: csrfRequestHeaders } : {}),
  });
  const csrfCookies = readSetCookieHeaders(csrfResponse.headers);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const signoutHeaders: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "X-Auth-Return-Redirect": "1",
    ...forwardedIpHeaders,
  };
  const signoutCookieHeader = mergeRequestCookieHeader(requestCookieHeader, csrfCookies);
  if (signoutCookieHeader) {
    signoutHeaders.cookie = signoutCookieHeader;
  }

  const form = new URLSearchParams({
    csrfToken,
    callbackUrl: `${authBaseUrl}/`,
    json: "true",
  });

  const signoutResponse = await fetchImpl(`${authBaseUrl}${SIGNOUT_ENDPOINT}`, {
    method: "POST",
    headers: signoutHeaders,
    body: form.toString(),
    redirect: "manual",
  });
  const signoutCookies = readSetCookieHeaders(signoutResponse.headers);
  const responseCookies = mergeSetCookieHeaders(csrfCookies, signoutCookies);

  const response = NextResponse.json(
    signoutResponse.ok ? { ok: true } : { error: tAuth("logoutFailed") },
    { status: signoutResponse.ok ? 200 : 500 },
  );
  appendSetCookieHeaders(response.headers, responseCookies);
  return response;
}

export async function handleMobileSessionGet(
  deps: MobileSessionGetDependencies,
  locale: Locale = "zh",
) {
  const { auth: tAuth } = getSessionFacadeTranslators(locale);
  const session = await deps.authImpl();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: tAuth("notAuthenticated") }, { status: 401 });
  }

  const user = await deps.loadUserById(userId);
  if (!user) {
    return NextResponse.json({ error: tAuth("userNotFound") }, { status: 401 });
  }

  if (user.isBanned) {
    return NextResponse.json({ error: tAuth("banned") }, { status: 403 });
  }

  return NextResponse.json({
    user: toMobileSessionUser(user),
  });
}

function normalizeTrustedBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/+$/, "") || null;
}

function resolveLocalRequestOrigin(request?: Request): string | null {
  if (!request) {
    return null;
  }

  try {
    const url = new URL(request.url);
    if (!isTrustedLocalhostHostname(url.hostname)) {
      return null;
    }

    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isTrustedLocalhostHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "[::1]" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "::ffff:127.0.0.1"
  );
}

function mergeRequestCookieHeader(
  requestCookieHeader: string | null | undefined,
  setCookieHeaders: readonly string[],
): string {
  const cookies = new Map<string, string>();

  for (const cookie of requestCookieHeader?.split(";") ?? []) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    cookies.set(name, value);
  }

  for (const setCookie of setCookieHeaders) {
    const pair = getCookiePair(setCookie);
    if (!pair) {
      continue;
    }

    cookies.set(pair.name, pair.value);
  }

  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
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

const COOKIE_RECORD_START = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=/
const CREDENTIALS_CALLBACK = "/api/auth/callback/credentials";
const SIGNOUT_ENDPOINT = "/api/auth/signout";
