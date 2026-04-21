import { createTranslator } from "next-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import type { NotificationType } from "@/lib/types";
import zhMessages from "../../messages/zh.json";
import enMessages from "../../messages/en.json";

export type { NotificationType };

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  serverId?: string;
  commentId?: string;
}

/**
 * Create one in-app notification. Callers must supply the rendered
 * `title` / `message` themselves. Prefer {@link createTranslatedNotification}
 * for new call sites so the copy can follow the recipient's locale.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await db.serverNotification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
      serverId: params.serverId,
      commentId: params.commentId,
    },
  });
}

/**
 * Bulk-create in-app notifications.
 */
export async function createBulkNotifications(
  notifications: CreateNotificationParams[],
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  await db.serverNotification.createMany({
    data: notifications.map((notification) => ({
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      serverId: notification.serverId,
      commentId: notification.commentId,
    })),
  });
}

const NOTIFICATION_MESSAGES: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

type TranslateParams = Record<string, string | number>;

function resolveUserLocale(raw: string | null | undefined): Locale {
  return isLocale(raw) ? raw : defaultLocale;
}

type DynamicTranslator = (key: string, values?: TranslateParams) => string;

function renderNotificationText(
  locale: Locale,
  titleKey: string,
  bodyKey: string,
  params: TranslateParams | undefined,
): { title: string; message: string } {
  const translator = createTranslator({
    locale,
    namespace: "notifications.system",
    messages: NOTIFICATION_MESSAGES[locale],
  }) as unknown as DynamicTranslator;
  return {
    title: translator(titleKey, params ?? {}),
    message: translator(bodyKey, params ?? {}),
  };
}

async function fetchRecipientLocale(userId: string): Promise<Locale> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  return resolveUserLocale(user?.locale);
}

export interface CreateTranslatedNotificationParams {
  userId: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  params?: TranslateParams;
  link?: string;
  serverId?: string;
  commentId?: string;
}

/**
 * Create a single in-app notification whose title and body are rendered in
 * the **recipient's** `User.locale`. Falls back to `defaultLocale` when the
 * recipient has no locale recorded.
 *
 * Keys resolve under the `notifications.system.*` namespace; add new
 * title/body strings there before using them.
 */
export async function createTranslatedNotification(
  params: CreateTranslatedNotificationParams,
): Promise<void> {
  const locale = await fetchRecipientLocale(params.userId);
  const { title, message } = renderNotificationText(
    locale,
    params.titleKey,
    params.bodyKey,
    params.params,
  );

  await db.serverNotification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title,
      message,
      link: params.link,
      serverId: params.serverId,
      commentId: params.commentId,
    },
  });
}

export interface CreateTranslatedBulkNotificationEntry {
  userId: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  params?: TranslateParams;
  link?: string;
  serverId?: string;
  commentId?: string;
}

/**
 * Bulk variant of {@link createTranslatedNotification}. Looks up each
 * recipient's `User.locale` once, groups the renders accordingly, and
 * persists everything in a single `createMany` call. Works best for
 * fan-out use cases (e.g. "server online" notifications to all favoriters).
 */
export async function createTranslatedBulkNotifications(
  entries: CreateTranslatedBulkNotificationEntry[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const uniqueUserIds = Array.from(new Set(entries.map((entry) => entry.userId)));
  const users = await db.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, locale: true },
  });
  const localeByUser = new Map<string, Locale>();
  for (const user of users) {
    localeByUser.set(user.id, resolveUserLocale(user.locale));
  }

  const data = entries.map((entry) => {
    const locale = localeByUser.get(entry.userId) ?? defaultLocale;
    const { title, message } = renderNotificationText(
      locale,
      entry.titleKey,
      entry.bodyKey,
      entry.params,
    );
    return {
      userId: entry.userId,
      type: entry.type,
      title,
      message,
      link: entry.link,
      serverId: entry.serverId,
      commentId: entry.commentId,
    };
  });

  await db.serverNotification.createMany({ data });
}
