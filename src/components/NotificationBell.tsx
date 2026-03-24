"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeImageSrc } from "@/lib/image-url";
import { timeAgo } from "@/lib/time";
import type {
  ForumNotificationItem,
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationsResponse,
  NotificationUnreadCountResponse,
} from "@/lib/types";

type ActiveTab = "server" | "forum";

interface ForumNotificationsResponse {
  notifications: ForumNotificationItem[];
  total: number;
  page: number;
  totalPages: number;
}

function formatUnreadCount(count: number): string {
  if (count > 99) {
    return "99+";
  }

  return String(count);
}

function markLocalAsRead(
  notifications: NotificationItem[],
  ids: string[],
  readAt: string,
): NotificationItem[] {
  const targetIds = new Set(ids);
  return notifications.map((notification) => {
    if (targetIds.has(notification.id)) {
      return { ...notification, readAt };
    }
    return notification;
  });
}

function markForumLocalAsRead(
  notifications: ForumNotificationItem[],
  ids: string[],
): ForumNotificationItem[] {
  const targetIds = new Set(ids);
  return notifications.map((notification) => {
    if (targetIds.has(notification.id)) {
      return { ...notification, isRead: true };
    }
    return notification;
  });
}

function getForumNotificationText(notification: ForumNotificationItem): {
  title: string;
  message: string;
} {
  const userName = notification.sourceUser.name ?? "未知用户";
  if (notification.type === "POST_COMMENT") {
    const postTitle = notification.post?.title ?? "某个帖子";
    return {
      title: `${userName} 评论了你的帖子`,
      message: postTitle,
    };
  }
  if (notification.type === "MENTION") {
    const postTitle = notification.post?.title ?? "某个帖子";
    return {
      title: `${userName} 在帖子中提到了你`,
      message: postTitle,
    };
  }
  return {
    title: `${userName} 回复了你的评论`,
    message: notification.post?.title ?? "",
  };
}

function getForumNotificationLink(notification: ForumNotificationItem): string | null {
  if (!notification.post) {
    return null;
  }
  const { post } = notification;
  if (post.circle) {
    return `/c/${post.circle.slug}/post/${post.id}`;
  }
  return `/post/${post.id}`;
}

/**
 * 导航栏通知铃铛，支持未读计数、最近通知预览和快速标记已读。
 * 合并展示服务器通知与论坛通知，分 Tab 切换。
 */
export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("server");

  // 服务器通知状态
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [serverNotifications, setServerNotifications] = useState<NotificationItem[]>([]);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [isServerMarkingAll, setIsServerMarkingAll] = useState(false);

  // 论坛通知状态
  const [forumUnreadCount, setForumUnreadCount] = useState(0);
  const [forumNotifications, setForumNotifications] = useState<ForumNotificationItem[]>([]);
  const [isForumLoading, setIsForumLoading] = useState(false);
  const [isForumMarkingAll, setIsForumMarkingAll] = useState(false);

  const totalUnreadCount = serverUnreadCount + forumUnreadCount;

  // 轮询两端未读数
  useEffect(() => {
    let cancelled = false;

    const fetchUnreadCounts = async () => {
      const [serverRes, forumRes] = await Promise.allSettled([
        fetch("/api/notifications/unread-count"),
        fetch("/api/forum/notifications/unread-count"),
      ]);

      if (cancelled) return;

      if (serverRes.status === "fulfilled" && serverRes.value.ok) {
        try {
          const payload = (await serverRes.value.json()) as NotificationUnreadCountResponse;
          if (typeof payload.count === "number") {
            setServerUnreadCount(payload.count);
          }
        } catch {
          // 忽略解析错误
        }
      }

      if (forumRes.status === "fulfilled" && forumRes.value.ok) {
        try {
          const payload = (await forumRes.value.json()) as NotificationUnreadCountResponse;
          if (typeof payload.count === "number") {
            setForumUnreadCount(payload.count);
          }
        } catch {
          // 忽略解析错误
        }
      }
    };

    void fetchUnreadCounts();
    const interval = window.setInterval(() => {
      void fetchUnreadCounts();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // 点击外部关闭 & Escape 关闭
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // 打开下拉时加载服务器通知
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsServerLoading(true);

    const fetchServerNotifications = async () => {
      try {
        const response = await fetch("/api/notifications?page=1&limit=5");
        if (!response.ok) return;

        const payload = (await response.json()) as NotificationsResponse;
        if (!cancelled) {
          setServerNotifications(payload.notifications ?? []);
          if (typeof payload.unreadCount === "number") {
            setServerUnreadCount(payload.unreadCount);
          }
        }
      } catch {
        if (!cancelled) {
          setServerNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setIsServerLoading(false);
        }
      }
    };

    void fetchServerNotifications();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 打开下拉时加载论坛通知
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsForumLoading(true);

    const fetchForumNotifications = async () => {
      try {
        const response = await fetch("/api/forum/notifications?page=1&limit=5");
        if (!response.ok) return;

        const payload = (await response.json()) as ForumNotificationsResponse;
        if (!cancelled) {
          setForumNotifications(payload.notifications ?? []);
        }
      } catch {
        if (!cancelled) {
          setForumNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setIsForumLoading(false);
        }
      }
    };

    void fetchForumNotifications();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 服务器通知：全部标记已读
  const markAllServerAsRead = useCallback(async () => {
    if (isServerMarkingAll) return;

    setIsServerMarkingAll(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as MarkNotificationsReadResponse | null;
      if (!response.ok || !payload) return;

      setServerUnreadCount(payload.unreadCount);
      const readAt = new Date().toISOString();
      setServerNotifications((prev) =>
        prev.map((notification) => ({ ...notification, readAt })),
      );
    } catch {
      // 忽略标记失败，保留当前 UI。
    } finally {
      setIsServerMarkingAll(false);
    }
  }, [isServerMarkingAll]);

  // 论坛通知：全部标记已读
  const markAllForumAsRead = useCallback(async () => {
    if (isForumMarkingAll) return;

    setIsForumMarkingAll(true);
    try {
      const response = await fetch("/api/forum/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) return;

      setForumUnreadCount(0);
      setForumNotifications((prev) =>
        prev.map((notification) => ({ ...notification, isRead: true })),
      );
    } catch {
      // 忽略标记失败，保留当前 UI。
    } finally {
      setIsForumMarkingAll(false);
    }
  }, [isForumMarkingAll]);

  // 服务器通知：单条标记已读
  const markOneServerAsRead = async (notificationId: string): Promise<void> => {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notificationId] }),
    });
    const payload = (await response
      .json()
      .catch(() => null)) as MarkNotificationsReadResponse | null;
    if (!response.ok || !payload) return;

    setServerUnreadCount(payload.unreadCount);
    const readAt = new Date().toISOString();
    setServerNotifications((prev) => markLocalAsRead(prev, [notificationId], readAt));
  };

  // 论坛通知：单条标记已读
  const markOneForumAsRead = async (notificationId: string): Promise<void> => {
    const response = await fetch("/api/forum/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notificationId] }),
    });
    if (!response.ok) return;

    setForumUnreadCount((prev) => Math.max(0, prev - 1));
    setForumNotifications((prev) => markForumLocalAsRead(prev, [notificationId]));
  };

  const handleServerNotificationClick = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await markOneServerAsRead(notification.id);
      } catch {
        // 标记已读失败不阻断跳转。
      }
    }

    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleForumNotificationClick = async (notification: ForumNotificationItem) => {
    if (!notification.isRead) {
      try {
        await markOneForumAsRead(notification.id);
      } catch {
        // 标记已读失败不阻断跳转。
      }
    }

    setOpen(false);
    const link = getForumNotificationLink(notification);
    if (link) {
      router.push(link);
    }
  };

  const isCurrentTabLoading = activeTab === "server" ? isServerLoading : isForumLoading;
  const isCurrentTabMarkingAll =
    activeTab === "server" ? isServerMarkingAll : isForumMarkingAll;
  const currentTabUnreadCount =
    activeTab === "server" ? serverUnreadCount : forumUnreadCount;

  const handleMarkAllAsRead = () => {
    if (activeTab === "server") {
      void markAllServerAsRead();
    } else {
      void markAllForumAsRead();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-warm-200 bg-surface text-warm-500 transition-colors hover:bg-warm-100"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="通知"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 3.689-1.273 8.967 8.967 0 0 1-1.31-5.431 4.5 4.5 0 1 0-8.472 0 8.967 8.967 0 0 1-1.31 5.431A23.84 23.84 0 0 0 11.143 17.082m3.714 0a24.255 24.255 0 0 1-3.714 0m3.714 0a3 3 0 1 1-3.714 0"
          />
        </svg>
        {totalUnreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {formatUnreadCount(totalUnreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-13 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-warm-200 bg-surface shadow-lg">
          {/* Tab 切换 */}
          <div className="flex border-b border-warm-200">
            <button
              type="button"
              onClick={() => setActiveTab("server")}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "server"
                  ? "border-b-2 border-accent text-accent"
                  : "text-warm-500 hover:text-warm-700"
              }`}
            >
              服务器
              {serverUnreadCount > 0 && (
                <span className="ml-1.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-semibold text-accent">
                  {formatUnreadCount(serverUnreadCount)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("forum")}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "forum"
                  ? "border-b-2 border-accent text-accent"
                  : "text-warm-500 hover:text-warm-700"
              }`}
            >
              社区
              {forumUnreadCount > 0 && (
                <span className="ml-1.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-semibold text-accent">
                  {formatUnreadCount(forumUnreadCount)}
                </span>
              )}
            </button>
          </div>

          {/* 标记已读按钮 */}
          <div className="flex items-center justify-between border-b border-warm-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-warm-800">
              {activeTab === "server" ? "服务器通知" : "社区通知"}
            </h3>
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={isCurrentTabMarkingAll || currentTabUnreadCount === 0}
              className="text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:text-warm-400"
            >
              {isCurrentTabMarkingAll ? "处理中..." : "全部标记已读"}
            </button>
          </div>

          {/* 通知列表 */}
          <div className="max-h-80 overflow-y-auto">
            {activeTab === "server" ? (
              /* 服务器通知列表 */
              isCurrentTabLoading ? (
                <div className="px-4 py-6 text-center text-sm text-warm-400">加载中...</div>
              ) : serverNotifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-warm-400">暂无通知</div>
              ) : (
                serverNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      void handleServerNotificationClick(notification);
                    }}
                    className="flex w-full items-start gap-3 border-b border-warm-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-warm-50"
                  >
                    <span
                      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.readAt ? "bg-transparent" : "bg-accent"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-warm-800">
                        {notification.title}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs text-warm-500">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-xs text-warm-400">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )
            ) : /* 论坛通知列表 */
            isCurrentTabLoading ? (
              <div className="px-4 py-6 text-center text-sm text-warm-400">加载中...</div>
            ) : forumNotifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-warm-400">暂无通知</div>
            ) : (
              forumNotifications.map((notification) => {
                const { title, message } = getForumNotificationText(notification);
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      void handleForumNotificationClick(notification);
                    }}
                    className="flex w-full items-start gap-3 border-b border-warm-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-warm-50"
                  >
                    {notification.sourceUser.image ? (
                      <Image
                        src={normalizeImageSrc(notification.sourceUser.image) || "/default-avatar.png"}
                        alt=""
                        width={28}
                        height={28}
                        className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warm-200 text-xs font-medium text-warm-600">
                        {(notification.sourceUser.name ?? "?").charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="line-clamp-1 text-sm font-medium text-warm-800">
                          {title}
                        </span>
                        {!notification.isRead && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-accent"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      {message && (
                        <span className="mt-1 line-clamp-2 block text-xs text-warm-500">
                          {message}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-warm-400">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-warm-200 px-4 py-3 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              查看全部通知 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
