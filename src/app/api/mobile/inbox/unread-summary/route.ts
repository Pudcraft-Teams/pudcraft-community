import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const [serverUnread, forumUnread] = await Promise.all([
    prisma.serverNotification.count({ where: { userId, readAt: null } }),
    prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
  ]);

  return NextResponse.json({ total: serverUnread + forumUnread, serverUnread, forumUnread });
}
