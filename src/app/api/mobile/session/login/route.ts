import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import {
  appendSetCookieHeaders,
  mergeSetCookieHeaders,
  readSetCookieHeaders,
  resolveAuthJsCredentialsCallback,
  toRequestCookieHeader,
} from "@/lib/mobile/sessionFacade";

const CREDENTIALS_CALLBACK = "/api/auth/callback/credentials";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "校验失败", details: parsed.error.flatten() }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, { cache: "no-store" });
  const csrfCookies = readSetCookieHeaders(csrfResponse.headers);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const form = new URLSearchParams({
    email: parsed.data.email,
    password: parsed.data.password,
    csrfToken,
    callbackUrl: `${origin}/`,
    json: "true",
  });

  const authResponse = await fetch(`${origin}${CREDENTIALS_CALLBACK}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
      ...(csrfCookies.length > 0 ? { cookie: toRequestCookieHeader(csrfCookies) } : {}),
    },
    body: form.toString(),
    redirect: "manual",
  });
  const authCookies = readSetCookieHeaders(authResponse.headers);
  const responseCookies = mergeSetCookieHeaders(csrfCookies, authCookies);
  const authPayload = (await authResponse.json().catch(() => null)) as { url?: string | null } | null;
  const authResult = resolveAuthJsCredentialsCallback(authResponse.status, authPayload, origin);

  if (authResult.kind === "invalid_credentials") {
    const response = NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const sessionResponse = await fetch(`${origin}/api/mobile/session`, {
    headers: responseCookies.length > 0 ? { cookie: toRequestCookieHeader(responseCookies) } : {},
    cache: "no-store",
  });
  if (authResult.kind === "error") {
    const response = NextResponse.json({ error: "登录失败" }, { status: 500 });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  if (sessionResponse.status === 401) {
    const response = NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    appendSetCookieHeaders(response.headers, responseCookies);
    return response;
  }

  const payload = await sessionResponse.json();

  const response = NextResponse.json(payload, { status: sessionResponse.status });
  appendSetCookieHeaders(response.headers, responseCookies);
  return response;
}
