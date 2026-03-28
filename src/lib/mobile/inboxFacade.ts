import { NextResponse } from "next/server";
import { queryNotificationsSchema } from "@/lib/validation";

export interface MobileInboxSourceUser {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
}

export interface MobileInboxItem {
  id: string;
  kind: "server" | "forum";
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

interface ForumInboxNotificationRecord {
  id: string;
  type: "POST_COMMENT" | "COMMENT_REPLY" | "MENTION";
  isRead: boolean;
  createdAt: Date;
  sourceUser: MobileInboxSourceUser;
  post: {
    id: string;
    title: string;
    circle: {
      slug: string;
    } | null;
  } | null;
}

interface MobileInboxData {
  serverTotal: number;
  forumTotal: number;
  serverUnread: number;
  forumUnread: number;
  serverNotifications: ServerInboxNotificationRecord[];
  forumNotifications: ForumInboxNotificationRecord[];
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

export function buildMobileInboxUnreadSummary(serverUnread: number, forumUnread: number): MobileInboxUnreadSummary {
  return {
    serverUnread,
    forumUnread,
    unreadCount: serverUnread + forumUnread,
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
    inboxData.forumNotifications.map((notification): MobileInboxItem => {
      const sourceUserName = notification.sourceUser.name ?? "未知用户";
      const postTitle = notification.post?.title ?? "某个帖子";
      const text = getForumInboxText(notification.type, sourceUserName, postTitle);

      return {
        id: notification.id,
        kind: "forum",
        title: text.title,
        body: text.body,
        destination: getForumInboxDestination(notification.post),
        read: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
        sourceUser: notification.sourceUser,
      };
    }),
  );

  const total = inboxData.serverTotal + inboxData.forumTotal;

  return NextResponse.json({
    notifications: merged.slice((page - 1) * limit, page * limit),
    total,
    ...buildMobileInboxUnreadSummary(inboxData.serverUnread, inboxData.forumUnread),
    page,
    totalPages: getMobileInboxTotalPages(total, limit, maxMergedFetchWindow),
  });
}

function getForumInboxText(type: "POST_COMMENT" | "COMMENT_REPLY" | "MENTION", sourceUserName: string, postTitle: string) {
  if (type === "POST_COMMENT") {
    return {
      title: `${sourceUserName} 评论了你的帖子`,
      body: postTitle,
    };
  }

  if (type === "MENTION") {
    return {
      title: `${sourceUserName} 在帖子中提到了你`,
      body: postTitle,
    };
  }

  return {
    title: `${sourceUserName} 回复了你的评论`,
    body: postTitle,
  };
}

function getForumInboxDestination(post: { id: string; circle: { slug: string } | null } | null): string | null {
  if (!post) {
    return null;
  }

  if (post.circle) {
    return `/c/${post.circle.slug}/post/${post.id}`;
  }

  return `/post/${post.id}`;
}
