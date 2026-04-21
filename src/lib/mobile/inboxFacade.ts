import { NextResponse } from "next/server";
import type { ZodErrorMap } from "zod";
import { queryNotificationsSchema } from "@/lib/validation";

export interface MobileInboxItem {
  id: string;
  kind: "server";
  title: string;
  body: string;
  destination: string | null;
  read: boolean;
  createdAt: string;
}

interface MobileInboxAuthResult {
  user?: {
    id: string;
  };
  response?: Response;
}

interface ServerInboxNotificationRecord {
  id: string;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

interface ServerMobileInboxData {
  serverTotal: number;
  serverUnread: number;
  serverNotifications: ServerInboxNotificationRecord[];
}

export interface MobileInboxErrorText {
  notAuthenticated: string;
  validationFailed: string;
  paginationTooDeep: string;
}

interface MobileInboxGetDependencies {
  requireActiveUserImpl: () => Promise<MobileInboxAuthResult>;
  loadServerInboxData: (input: {
    userId: string;
    unreadOnly: boolean;
    fetchLimit: number;
  }) => Promise<ServerMobileInboxData>;
  maxMergedFetchWindow?: number;
  /**
   * Localized error copy. Callers own translation so this module doesn't
   * assume a locale (or bake Chinese defaults in).
   */
  errorText: MobileInboxErrorText;
  zodErrorMap?: ZodErrorMap;
}

export const DEFAULT_MAX_MERGED_FETCH_WINDOW = 500;

export interface MobileInboxUnreadSummary {
  forumUnread: number;
  serverUnread: number;
  unreadCount: number;
}

export function buildMobileInboxUnreadSummary(serverUnread: number): MobileInboxUnreadSummary {
  return {
    forumUnread: 0,
    serverUnread,
    unreadCount: serverUnread,
  };
}

export function mergeInboxItems(
  serverItems: MobileInboxItem[],
): MobileInboxItem[] {
  return [...serverItems].sort((lhs, rhs) => rhs.createdAt.localeCompare(lhs.createdAt));
}

export function getMaxMobileInboxPages(limit: number, maxMergedFetchWindow = DEFAULT_MAX_MERGED_FETCH_WINDOW): number {
  return Math.max(1, Math.floor(maxMergedFetchWindow / limit));
}

export function getMobileInboxTotalPages(total: number, limit: number, maxMergedFetchWindow = DEFAULT_MAX_MERGED_FETCH_WINDOW): number {
  return Math.min(Math.max(1, Math.ceil(total / limit)), getMaxMobileInboxPages(limit, maxMergedFetchWindow));
}

export async function handleMobileInboxGet(request: Request, deps: MobileInboxGetDependencies) {
  const { errorText } = deps;
  const authResult = await deps.requireActiveUserImpl();
  if ("response" in authResult && authResult.response) {
    return authResult.response;
  }

  const userId = authResult.user?.id;
  if (!userId) {
    return NextResponse.json({ error: errorText.notAuthenticated }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parseOptions = deps.zodErrorMap ? { errorMap: deps.zodErrorMap } : undefined;
  const parsedQuery = queryNotificationsSchema.safeParse(
    {
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      unreadOnly: searchParams.get("unreadOnly") ?? undefined,
    },
    parseOptions,
  );

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: errorText.validationFailed, details: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }

  const { page, limit, unreadOnly } = parsedQuery.data;
  const maxMergedFetchWindow = deps.maxMergedFetchWindow ?? DEFAULT_MAX_MERGED_FETCH_WINDOW;
  const maxSupportedPages = getMaxMobileInboxPages(limit, maxMergedFetchWindow);
  if (page > maxSupportedPages) {
    return NextResponse.json({ error: errorText.paginationTooDeep }, { status: 400 });
  }

  const fetchLimit = page * limit;
  const inboxData = await deps.loadServerInboxData({
    userId,
    unreadOnly,
    fetchLimit,
  });

  const merged = mergeInboxItems(
    inboxData.serverNotifications.map((notification): MobileInboxItem => ({
      id: notification.id,
      kind: "server",
      title: notification.title,
      body: notification.message,
      destination: notification.link,
      read: notification.readAt !== null,
      createdAt: notification.createdAt.toISOString(),
    })),
  );

  const total = inboxData.serverTotal;

  return NextResponse.json({
    notifications: merged.slice((page - 1) * limit, page * limit),
    total,
    ...buildMobileInboxUnreadSummary(inboxData.serverUnread),
    page,
    totalPages: getMobileInboxTotalPages(total, limit, maxMergedFetchWindow),
  });
}
