"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import type {
  MarkNotificationsReadResponse,
  NotificationItem,
  NotificationType,
  NotificationsResponse,
} from "@/lib/types";

const PAGE_SIZE = 20;

function getTypeIcon(type: NotificationType): { icon: string; className: string } {
  switch (type) {
    case "comment_reply":
      return { icon: "💬", className: "text-teal-600" };
    case "server_online":
      return { icon: "🟢", className: "text-emerald-600" };
    case "server_approved":
      return { icon: "✓", className: "text-emerald-600" };
    case "server_rejected":
      return { icon: "✗", className: "text-rose-600" };
    default:
      return { icon: "•", className: "text-slate-500" };
  }
}

function markNotificationReadLocally(
  notifications: NotificationItem[],
  ids: string[],
): NotificationItem[] {
  const readAt = new Date().toISOString();
  const targets = new Set(ids);
  return notifications.map((notification) => {
    if (targets.has(notification.id)) {
      return { ...notification, readAt };
    }
    return notification;
  });
}

/**
 * 通知中心页面。
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Fnotifications");
    }
  }, [router, status]);

  const fetchNotifications = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await fetch(`/api/notifications?page=${targetPage}&limit=${PAGE_SIZE}`);
        if (!response.ok) {
          throw new Error("通知加载失败");
        }

        const payload = (await response.json()) as NotificationsResponse;
        const nextNotifications = payload.notifications ?? [];

        setNotifications((prev) => (append ? [...prev, ...nextNotifications] : nextNotifications));
        setUnreadCount(payload.unreadCount ?? 0);
        setTotal(payload.total ?? 0);
        setPage(payload.page ?? targetPage);
        setTotalPages(Math.max(1, payload.totalPages ?? 1));
      } catch (err) {
        const message = err instanceof Error ? err.message : "通知加载失败";
        if (append) {
          toast.error(message);
        } else {
          setError(message);
        }
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [toast],
  );

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    void fetchNotifications(1, false);
  }, [fetchNotifications, status]);

  const markAsRead = async (payload: { all: true } | { ids: string[] }) => {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as MarkNotificationsReadResponse | null;
    if (!response.ok || !data) {
      throw new Error(data?.error ?? "通知状态更新失败");
    }

    setUnreadCount(data.unreadCount);
    return data;
  };

  const handleMarkAllRead = async () => {
    if (isMarkingAll || unreadCount === 0) {
      return;
    }

    setIsMarkingAll(true);
    try {
      await markAsRead({ all: true });
      const readAt = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => ({ ...item, readAt })));
      toast.success("已全部标记为已读");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleOpenNotification = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await markAsRead({ ids: [notification.id] });
        setNotifications((prev) => markNotificationReadLocally(prev, [notification.id]));
      } catch {
        // 标记失败不阻断跳转。
      }
    }

    if (notification.link) {
      router.push(notification.link);
    }
  };

  if (status === "loading") {
    return <PageLoading text="正在加载登录状态..." />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">通知中心</h1>
          <p className="mt-1 text-sm text-slate-600">
            共 {total} 条通知，未读 {unreadCount} 条
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={isMarkingAll || unreadCount === 0}
          className="m3-btn m3-btn-tonal disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isMarkingAll ? "处理中..." : "全部标记已读"}
        </button>
      </section>

      {isLoading ? (
        <PageLoading />
      ) : error ? (
        <div className="m3-alert-error">{error}</div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="暂无通知"
          description="当有人回复你或你收藏的服务器上线时，会显示在这里"
        />
      ) : (
        <>
          <div className="m3-surface overflow-hidden">
            {notifications.map((notification) => {
              const meta = getTypeIcon(notification.type);

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    void handleOpenNotification(notification);
                  }}
                  className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-50"
                >
                  <span className={`mt-0.5 text-base ${meta.className}`}>{meta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-semibold text-slate-900">
                        {notification.title}
                      </span>
                      {!notification.readAt && (
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                      )}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-slate-600">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {page < totalPages && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  void fetchNotifications(page + 1, true);
                }}
                disabled={isLoadingMore}
                className="m3-btn m3-btn-tonal disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
