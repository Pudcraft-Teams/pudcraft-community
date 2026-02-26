"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
 */
export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch("/api/notifications/unread-count");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as NotificationUnreadCountResponse;
        if (!cancelled && typeof payload.count === "number") {
          setUnreadCount(payload.count);
        }
      } catch {
        // 忽略轮询错误，避免影响页面交互。
      }
    };

    void fetchUnreadCount();
    const interval = window.setInterval(() => {
      void fetchUnreadCount();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchNotifications = async () => {
      try {
        const response = await fetch("/api/notifications?page=1&limit=5");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as NotificationsResponse;
        if (!cancelled) {
          setNotifications(payload.notifications ?? []);
          if (typeof payload.unreadCount === "number") {
            setUnreadCount(payload.unreadCount);
          }
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchNotifications();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const markAllAsRead = async () => {
    if (isMarkingAll) {
      return;
    }

    setIsMarkingAll(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const payload = (await response.json().catch(() => null)) as MarkNotificationsReadResponse | null;
      if (!response.ok || !payload) {
        return;
      }

      setUnreadCount(payload.unreadCount);
      const readAt = new Date().toISOString();
      setNotifications((prev) => prev.map((notification) => ({ ...notification, readAt })));
    } catch {
      // 忽略标记失败，保留当前 UI。
    } finally {
      setIsMarkingAll(false);
    }
  };

  const markOneAsRead = async (notificationId: string): Promise<void> => {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notificationId] }),
    });
    const payload = (await response.json().catch(() => null)) as MarkNotificationsReadResponse | null;
    if (!response.ok || !payload) {
      return;
    }

    setUnreadCount(payload.unreadCount);
    const readAt = new Date().toISOString();
    setNotifications((prev) => markLocalAsRead(prev, [notificationId], readAt));
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await markOneAsRead(notification.id);
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
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
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
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {formatUnreadCount(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">通知</h3>
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={isMarkingAll || unreadCount === 0}
              className="text-xs font-medium text-teal-700 transition-colors hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {isMarkingAll ? "处理中..." : "全部标记已读"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">暂无通知</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    void handleNotificationClick(notification);
                  }}
                  className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50"
                >
                  <span
                    className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                      notification.readAt ? "bg-transparent" : "bg-sky-500"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium text-slate-900">
                      {notification.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-slate-600">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-3 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-teal-700 transition-colors hover:text-teal-800"
            >
              查看全部通知 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
