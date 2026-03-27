import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";

const CREDENTIALS_CALLBACK = "/api/auth/callback/credentials";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "校验失败", details: parsed.error.flatten() }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, { cache: "no-store" });
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
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });

  if (!authResponse.ok) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }

  const setCookie = authResponse.headers.get("set-cookie");
  const sessionResponse = await fetch(`${origin}/api/mobile/session`, {
    headers: setCookie ? { cookie: setCookie } : {},
    cache: "no-store",
  });
  const payload = await sessionResponse.json();

  const response = NextResponse.json(payload);
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }
  return response;
}
