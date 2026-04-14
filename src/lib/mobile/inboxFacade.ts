import { NextResponse } from "next/server";
import { queryNotificationsSchema } from "@/lib/validation";

export interface MobileInboxSourceUser {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
}

export interface MobileInboxItem {
  kind: "server" | "forum";
  id: string;
  title: string;
  body: string;
  destination: string | null;
  read: boolean;
  createdAt: string;
  sourceUser?: MobileInboxSourceUser;
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

interface MobileInboxData {
  serverTotal: number;
  forumTotal: number;
  serverUnread: number;
  forumUnread: number;
  serverNotifications: ServerInboxNotificationRecord[];
  forumNotifications: never[];
}

interface MobileInboxGetDependencies {
  requireActiveUserImpl: () => Promise<MobileInboxAuthResult>;
  loadInboxData: (input: { userId: string; unreadOnly: boolean; fetchLimit: number }) => Promise<MobileInboxData>;
  maxMergedFetchWindow?: number;
}

export const DEFAULT_MAX_MERGED_FETCH_WINDOW = 500;

export interface MobileInboxUnreadSummary {
  serverUnread: number;
  forumUnread: number;
  unreadCount: number;
}

export function buildMobileInboxUnreadSummary(serverUnread: number): MobileInboxUnreadSummary {
  return {
    serverUnread,
    forumUnread: 0,
    unreadCount: serverUnread,
  };
}

export function mergeInboxItems(
  serverItems: MobileInboxItem[],
  forumItems: MobileInboxItem[],
): MobileInboxItem[] {
  return [...serverItems, ...forumItems].sort((lhs, rhs) => rhs.createdAt.localeCompare(lhs.createdAt));
}

export function getMaxMobileInboxPages(limit: number, maxMergedFetchWindow = DEFAULT_MAX_MERGED_FETCH_WINDOW): number {
  return Math.max(1, Math.floor(maxMergedFetchWindow / limit));
}

export function getMobileInboxTotalPages(total: number, limit: number, maxMergedFetchWindow = DEFAULT_MAX_MERGED_FETCH_WINDOW): number {
  return Math.min(Math.max(1, Math.ceil(total / limit)), getMaxMobileInboxPages(limit, maxMergedFetchWindow));
}

export async function handleMobileInboxGet(request: Request, deps: MobileInboxGetDependencies) {
  const authResult = await deps.requireActiveUserImpl();
  if ("response" in authResult && authResult.response) {
    return authResult.response;
  }

  const userId = authResult.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = queryNotificationsSchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    unreadOnly: searchParams.get("unreadOnly") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "校验失败", details: parsedQuery.error.flatten() }, { status: 400 });
  }

  const { page, limit, unreadOnly } = parsedQuery.data;
  const maxMergedFetchWindow = deps.maxMergedFetchWindow ?? DEFAULT_MAX_MERGED_FETCH_WINDOW;
  const maxSupportedPages = getMaxMobileInboxPages(limit, maxMergedFetchWindow);
  if (page > maxSupportedPages) {
    return NextResponse.json({ error: "分页过深" }, { status: 400 });
  }

  const fetchLimit = page * limit;
  const inboxData = await deps.loadInboxData({
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
    [],
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
