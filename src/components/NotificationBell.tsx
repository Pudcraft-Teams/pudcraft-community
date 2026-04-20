"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/time";
import type {
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationsResponse,
  NotificationUnreadCountResponse,
} from "@/lib/types";

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

/**
 * 导航栏通知铃铛，支持未读计数、最近通知预览和快速标记已读。
 * 仅展示服务器相关通知。
 */
export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [serverNotifications, setServerNotifications] = useState<NotificationItem[]>([]);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [isServerMarkingAll, setIsServerMarkingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchUnreadCounts = async () => {
      const serverRes = await fetch("/api/notifications/unread-count").catch(() => null);

      if (cancelled) return;

      if (serverRes?.ok) {
        try {
          const payload = (await serverRes.json()) as NotificationUnreadCountResponse;
          if (typeof payload.count === "number") {
            setServerUnreadCount(payload.count);
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
        {serverUnreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {formatUnreadCount(serverUnreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-warm-200 bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-warm-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-warm-800">服务器通知</h3>
            {serverUnreadCount > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">
                {formatUnreadCount(serverUnreadCount)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-warm-200 px-4 py-2">
            <p className="text-xs text-warm-500">最近与你的服务器、收藏和审核状态相关的提醒</p>
            <button
              type="button"
              onClick={() => {
                void markAllServerAsRead();
              }}
              disabled={isServerMarkingAll || serverUnreadCount === 0}
              className="text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:text-warm-400"
            >
              {isServerMarkingAll ? "处理中..." : "全部标记已读"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isServerLoading ? (
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
