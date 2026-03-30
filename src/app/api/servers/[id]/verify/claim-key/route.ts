export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { generateApiKey } from "@/lib/api-key";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema } from "@/lib/validation";

const CLAIM_KEY_TTL_MS = 30 * 60 * 1000; // 30 分钟

/**
 * GET /api/servers/:id/verify/claim-key
 * 查询插件认领状态（需登录）。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: {
        name: true,
        isVerified: true,
        verifiedAt: true,
        verifyUserId: true,
        verifyExpiresAt: true,
        apiKeyHash: true,
        ownerId: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const isCurrentClaimUser = server.verifyUserId === userId;
    const hasClaimKey = !!server.apiKeyHash && !!server.verifyUserId;
    const isExpired = server.verifyExpiresAt ? server.verifyExpiresAt < new Date() : true;

    return NextResponse.json({
      serverName: server.name,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      isCurrentOwner: server.ownerId === userId,
      hasClaimKey: hasClaimKey && isCurrentClaimUser,
      isClaimKeyExpired: isExpired,
      expiresAt: isCurrentClaimUser ? (server.verifyExpiresAt?.toISOString() ?? null) : null,
      hasPendingClaimByOtherUser: hasClaimKey && !isCurrentClaimUser && !isExpired,
    });
  } catch (err) {
    logger.error("[api/servers/[id]/verify/claim-key] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/verify/claim-key
 * 为未认领的服务器生成认领密钥（API Key 格式）。
 * 认领成功后该密钥直接成为服务器 API Key，无需再次获取。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: {
        isVerified: true,
        ownerId: true,
        verifyUserId: true,
        verifyExpiresAt: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (server.ownerId && server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    if (
      server.verifyUserId &&
      server.verifyUserId !== userId &&
      server.verifyExpiresAt &&
      server.verifyExpiresAt > new Date()
    ) {
      return NextResponse.json({ error: "已有其他用户正在进行认领" }, { status: 409 });
    }

    const { raw, hash } = generateApiKey();
    const expiresAt = new Date(Date.now() + CLAIM_KEY_TTL_MS);

    await prisma.server.update({
      where: { id: cuid },
      data: {
        apiKeyHash: hash,
        verifyUserId: userId,
        verifyExpiresAt: expiresAt,
        // 清除可能存在的 MOTD 验证流程
        verifyToken: null,
      },
    });

    return NextResponse.json({
      success: true,
      claimKey: raw,
      expiresAt: expiresAt.toISOString(),
      message: "认领密钥已生成，请妥善保存。认领成功后此密钥将成为服务器 API Key。",
    });
  } catch (err) {
    logger.error("[api/servers/[id]/verify/claim-key] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
