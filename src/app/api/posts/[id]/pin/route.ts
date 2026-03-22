export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/posts/:id/pin -- Toggle pin status.
 * Must be: circle OWNER/ADMIN (for circle posts) or site admin (for public posts).
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const isAdmin = authResult.user.role === "admin";

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        circleId: true,
        isPinned: true,
        status: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status === "DELETED") {
      return NextResponse.json({ error: "帖子已被删除" }, { status: 404 });
    }

    // Permission check
    let hasPermission = isAdmin;

    if (post.circleId && !isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId: post.circleId,
          },
        },
        select: { role: true },
      });
      hasPermission = membership?.role === "OWNER" || membership?.role === "ADMIN";
    }

    if (!hasPermission) {
      return NextResponse.json({ error: "无权置顶/取消置顶该帖子" }, { status: 403 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { isPinned: !post.isPinned },
      select: { isPinned: true },
    });

    return NextResponse.json({
      success: true,
      isPinned: updated.isPinned,
    });
  } catch (err) {
    logger.error("[api/posts/[id]/pin] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
