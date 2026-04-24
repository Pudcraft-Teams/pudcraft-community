import { createTranslator } from "next-intl";
import { NextResponse } from "next/server";
import type { Locale } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import enMessages from "../../messages/en.json";
import zhMessages from "../../messages/zh.json";

interface ActiveUser {
  id: string;
  role: string;
  name: string | null;
}

interface ActiveUserRecord extends ActiveUser {
  isBanned: boolean;
}

interface ActiveUserSuccess {
  user: ActiveUser;
}

interface ActiveUserError {
  response: NextResponse<{ error: string }>;
}

export type ActiveUserResult = ActiveUserSuccess | ActiveUserError;

export type AuthGuardTranslator = (
  key: "notAuthenticated" | "userNotFound" | "banned",
) => string;

const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

/**
 * Build a locale-aware translator limited to the `errors.api.auth` keys the
 * auth guard emits. Lets `resolveActiveUserResult` stay synchronous while
 * keeping the request-scoped translator contract documented in docs/i18n.md.
 */
export function getAuthGuardTranslator(locale: Locale): AuthGuardTranslator {
  const t = createTranslator({
    locale,
    namespace: "errors.api.auth",
    messages: messagesByLocale[locale],
  });
  return (key) => t(key);
}

export function isActiveUserError(result: ActiveUserResult): result is ActiveUserError {
  return "response" in result;
}

export function resolveActiveUserResult(
  userId: string | null | undefined,
  user: ActiveUserRecord | null,
  t: AuthGuardTranslator,
): ActiveUserResult {
  if (!userId) {
    return {
      response: NextResponse.json({ error: t("notAuthenticated") }, { status: 401 }),
    };
  }

  if (!user) {
    return {
      response: NextResponse.json({ error: t("userNotFound") }, { status: 401 }),
    };
  }

  if (user.isBanned) {
    return {
      response: NextResponse.json({ error: t("banned") }, { status: 403 }),
    };
  }

  return {
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
    },
  };
}

/**
 * 统一登录态 + 封禁态校验。
 * 用于敏感 API：未登录返回 401，被封禁返回 403。
 */
export async function requireActiveUser(request?: Request): Promise<ActiveUserResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, name: true, isBanned: true },
      })
    : null;

  const locale = await getRequestLocale(request);
  const t = getAuthGuardTranslator(locale);

  return resolveActiveUserResult(userId, user, t);
}
