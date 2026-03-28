import { NextResponse } from "next/server";
import { getForwardedClientIpHeaders } from "@/lib/request-ip";
import { loginSchema } from "@/lib/validation";

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

interface MobileSessionGetDependencies {
  authImpl: () => Promise<MobileSessionAuthResult | null>;
  loadUserById: (userId: string) => Promise<ActiveMobileSessionUserRecord | null>;
}

type MobileLoginFailureReason = "invalid_credentials" | "banned";

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

export function toMobileLoginError(reason: MobileLoginFailureReason): {
  status: number;
  body: { error: string; code: "credentials" | "banned" };
} {
  if (reason === "banned") {
    return {
      status: 403,
      body: {
        error: "账号已被封禁",
        code: "banned",
      },
    };
  }

  return {
    status: 401,
    body: {
      error: "邮箱或密码错误",
      code: "credentials",
    },
  };
}

export function appendSetCookieHeaders(headers: Headers, setCookieHeaders: readonly string[]) {
  for (const setCookie of setCookieHeaders) {
    headers.append("set-cookie", setCookie);
  }
}

export async function handleMobileLoginPost(request: Request, deps: MobileLoginPostDependencies = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "校验失败", details: parsed.error.flatten() }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const forwardedIpHeaders = getForwardedClientIpHeaders(request);

  const csrfResponse = await fetchImpl(`${origin}/api/auth/csrf`, {
    cache: "no-store",
    ...(Object.keys(forwardedIpHeaders).length > 0 ? { headers: forwardedIpHeaders } : {}),
  });
  const csrfCookies = readSetCookieHeaders(csrfResponse.headers);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const form = new URLSearchParams({
    email: parsed.data.email,
    password: parsed.data.password,
    csrfToken,
    callbackUrl: `${origin}/`,
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

  const authResponse = await fetchImpl(`${origin}${CREDENTIALS_CALLBACK}`, {
    method: "POST",
    headers: authHeaders,
    body: form.toString(),
    redirect: "manual",
  });
  const authCookies = readSetCookieHeaders(authResponse.headers);
  const responseCookies = mergeSetCookieHeaders(csrfCookies, authCookies);
  const authPayload = (await authResponse.json().catch(() => null)) as { url?: string | null } | null;
  const authResult = resolveAuthJsCredentialsCallback(authResponse.status, authPayload, origin);

  if (authResult.kind === "auth_error") {
    const loginError = toMobileLoginError(authResult.reason);
    const response = NextResponse.json(loginError.body, { status: loginError.status });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const sessionResponse = await fetchImpl(`${origin}/api/mobile/session`, {
    headers: responseCookies.length > 0 ? { cookie: toRequestCookieHeader(responseCookies) } : {},
    cache: "no-store",
  });
  if (authResult.kind === "error") {
    const response = NextResponse.json({ error: "登录失败" }, { status: 500 });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  if (sessionResponse.status === 401) {
    const loginError = toMobileLoginError("invalid_credentials");
    const response = NextResponse.json(loginError.body, { status: loginError.status });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const payload = await sessionResponse.json();

  const response = NextResponse.json(payload, { status: sessionResponse.status });
  appendSetCookieHeaders(response.headers, responseCookies);
  return response;
}

export async function handleMobileSessionGet(deps: MobileSessionGetDependencies) {
  const session = await deps.authImpl();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const user = await deps.loadUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 401 });
  }

  if (user.isBanned) {
    return NextResponse.json({ error: "账号已被封禁" }, { status: 403 });
  }

  return NextResponse.json({
    user: toMobileSessionUser(user),
  });
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
