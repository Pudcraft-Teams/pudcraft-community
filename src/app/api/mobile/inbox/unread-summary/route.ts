export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export async function GET() {
  const authResult = await requireActiveUser();
  if (isActiveUserError(authResult)) {
    return authResult.response;
  }
  const userId = authResult.user.id;

  const [serverUnread, forumUnread] = await Promise.all([
    prisma.serverNotification.count({ where: { userId, readAt: null } }),
    prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
  ]);

  return NextResponse.json({ total: serverUnread + forumUnread, serverUnread, forumUnread });
}
