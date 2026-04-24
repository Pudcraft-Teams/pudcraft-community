import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import enMessages from "../../messages/en.json";
import zhMessages from "../../messages/zh.json";
import { auth } from "./auth";
import { db } from "./db";

interface AdminSuccess {
  userId: string;
}

/**
 * `errorKey` identifies the failure reason so callers can translate the
 * response against the active request locale. Keeping this function
 * locale-agnostic avoids dragging `getRequestLocale` into every invocation
 * (e.g. `src/app/admin/layout.tsx` only needs the redirect, not a string).
 *
 * - `notAuthenticated` / `banned` resolve under `errors.api.auth.*`.
 * - `notAdmin` resolves under `errors.api.admin.*`.
 */
export type AdminErrorKey = "notAuthenticated" | "banned" | "notAdmin";

interface AdminError {
  errorKey: AdminErrorKey;
  status: number;
}

export type RequireAdminResult = AdminSuccess | AdminError;

export function isAdminError(result: RequireAdminResult): result is AdminError {
  return "errorKey" in result;
}

export async function requireAdmin(): Promise<RequireAdminResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { errorKey: "notAuthenticated", status: 401 };
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isBanned: true },
  });

  if (user?.isBanned) {
    return { errorKey: "banned", status: 403 };
  }

  if (!user || user.role !== "admin") {
    return { errorKey: "notAdmin", status: 403 };
  }

  return { userId: session.user.id };
}

const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

/**
 * Translate an `AdminErrorKey` into the user-facing string for the given
 * locale. Uses `createTranslator` so callers can stay synchronous; mirrors
 * the auth-guard translator pattern in `src/lib/auth-guard.ts`.
 */
export function translateAdminError(locale: Locale, key: AdminErrorKey): string {
  const messages = messagesByLocale[locale];
  if (key === "notAdmin") {
    const t = createTranslator({
      locale,
      namespace: "errors.api.admin",
      messages,
    });
    return t("notAdmin");
  }
  const t = createTranslator({
    locale,
    namespace: "errors.api.auth",
    messages,
  });
  return t(key);
}
