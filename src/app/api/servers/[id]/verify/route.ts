import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getVerifyJobId, verifyQueue, verifyQueueEvents, type VerifyJobResult } from "@/lib/queue";
import { serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface VerifyServer {
  id: string;
  name: string;
  host: string;
  port: number;
  ownerId: string | null;
  isVerified: boolean;
  verifyToken: string | null;
  verifyExpiresAt: Date | null;
  verifyUserId: string | null;
  verifiedAt: Date | null;
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown";
}

function generateVerifyToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(8);
  let suffix = "";

  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }

  return `pudcraft-${suffix}`;
}

function parseVerifyJobResult(raw: unknown): VerifyJobResult {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, reason: "验证任务返回了无效结果" };
  }

  const payload = raw as Record<string, unknown>;
  return {
    success: payload.success === true,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
  };
}

async function findServerById(serverId: string): Promise<VerifyServer | null> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      ownerId: true,
      isVerified: true,
      verifyToken: true,
      verifyExpiresAt: true,
      verifyUserId: true,
      verifiedAt: true,
    },
  });

  return server ?? null;
}

/**
 * POST /api/servers/:id/verify
 * 发起认领，生成 30 分钟有效期的 MOTD 验证 Token。
 * 任意登录用户都可发起；验证通过后 owner 会转移到发起者。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const token = generateVerifyToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const currentOwnerHint =
      server.ownerId && server.ownerId !== userId
        ? "该服务器已有管理员，认领成功后所有权将转移给你"
        : null;

    await prisma.server.update({
      where: { id: server.id },
      data: {
        verifyToken: token,
        verifyExpiresAt: expiresAt,
        verifyUserId: userId,
      },
    });

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      instruction: "请将此 Token 添加到服务器 MOTD 中",
      currentOwner: currentOwnerHint,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/verify] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * GET /api/servers/:id/verify
 * 查询当前服务器认领状态与验证码信息。
 * 仅向验证码发起者返回 verifyToken，避免泄漏。
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const isCurrentOwner = !!server.ownerId && server.ownerId === userId;
    const isTokenOwnedByCurrentUser = !!server.verifyUserId && server.verifyUserId === userId;
    const hasPendingClaimByOtherUser =
      !!server.verifyToken &&
      !!server.verifyExpiresAt &&
      !!server.verifyUserId &&
      server.verifyExpiresAt.getTime() > Date.now() &&
      server.verifyUserId !== userId;

    return NextResponse.json({
      isVerified: server.isVerified,
      verifyToken: isTokenOwnedByCurrentUser ? server.verifyToken : null,
      verifyExpiresAt: isTokenOwnedByCurrentUser
        ? (server.verifyExpiresAt?.toISOString() ?? null)
        : null,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      serverName: server.name,
      ownerId: server.ownerId,
      isCurrentOwner,
      hasOwner: !!server.ownerId,
      isTokenOwnedByCurrentUser,
      hasPendingClaimByOtherUser,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/verify] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/servers/:id/verify
 * 触发 BullMQ 验证任务，并等待最多 15 秒返回验证结果。
 */
export async function PATCH(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (!server.verifyToken || !server.verifyExpiresAt || !server.verifyUserId) {
      return NextResponse.json({ error: "请先获取验证码后再验证" }, { status: 400 });
    }

    if (server.verifyUserId !== userId) {
      return NextResponse.json(
        { error: "验证码不是你生成的，请重新获取后再验证" },
        { status: 403 },
      );
    }

    if (server.verifyExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "验证码已过期，请重新获取后再验证" }, { status: 400 });
    }

    const job = await verifyQueue.add(
      `verify-${server.id}`,
      {
        serverId: server.id,
        address: server.host,
        port: server.port,
        token: server.verifyToken,
      },
      {
        jobId: getVerifyJobId(server.id, server.verifyToken),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    const rawResult = await job.waitUntilFinished(verifyQueueEvents, 15_000);
    const result = parseVerifyJobResult(rawResult);

    if (result.success) {
      const ownershipTransferred = !!server.ownerId && server.ownerId !== userId;
      return NextResponse.json({
        success: true,
        verified: true,
        message: ownershipTransferred
          ? "验证通过！你已成为该服务器的新管理员。"
          : "验证通过！你已成功认领该服务器。",
      });
    }

    return NextResponse.json(
      {
        success: false,
        verified: false,
        message: "验证未通过",
        reason: result.reason ?? "MOTD 中未找到验证码",
      },
      { status: 400 },
    );
  } catch (error) {
    const message = resolveErrorMessage(error).toLowerCase();
    const isTimeout = message.includes("timed out") || message.includes("timeout");

    if (isTimeout) {
      return NextResponse.json(
        {
          success: false,
          message: "验证超时，请确认 Worker 已运行后重试",
        },
        { status: 504 },
      );
    }

    logger.error("[api/servers/[id]/verify] Unexpected PATCH error", {
      error: resolveErrorMessage(error),
    });
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
