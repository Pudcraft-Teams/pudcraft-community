import { db } from "@/lib/db";

export type NotificationType =
  | "comment_reply"
  | "server_online"
  | "server_approved"
  | "server_rejected";

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
 * 创建单条站内通知。
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await db.notification.create({
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
 * 批量创建站内通知。
 */
export async function createBulkNotifications(
  notifications: CreateNotificationParams[],
): Promise<void> {
  if (notifications.length === 0) {
    return;
  }

  await db.notification.createMany({
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
