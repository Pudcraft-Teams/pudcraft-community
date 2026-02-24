import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyQueue, verifyQueueEvents, type VerifyJobResult } from "@/lib/queue";
import { serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface OwnedServer {
  id: string;
  name: string;
  host: string;
  port: number;
  ownerId: string | null;
  isVerified: boolean;
  verifyToken: string | null;
  verifyExpiresAt: Date | null;
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

async function findServerById(serverId: string): Promise<OwnedServer | null> {
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
      verifiedAt: true,
    },
  });

  return server ?? null;
}

/**
 * POST /api/servers/:id/verify
 * 发起认领，生成 30 分钟有效期的 MOTD 验证 Token。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }
    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    if (server.isVerified) {
      return NextResponse.json({
        isVerified: true,
        verifiedAt: server.verifiedAt?.toISOString() ?? null,
        message: "服务器已认领，无需重复验证",
      });
    }

    const token = generateVerifyToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.server.update({
      where: { id: server.id },
      data: {
        verifyToken: token,
        verifyExpiresAt: expiresAt,
      },
    });

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      instruction: "请将此 Token 添加到服务器 MOTD 中",
    });
  } catch (error) {
    logger.error("[api/servers/[id]/verify] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * GET /api/servers/:id/verify
 * 查询当前服务器认领状态与验证码信息。
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }
    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    return NextResponse.json({
      isVerified: server.isVerified,
      verifyToken: server.verifyToken,
      verifyExpiresAt: server.verifyExpiresAt?.toISOString() ?? null,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      serverName: server.name,
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
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await findServerById(parsedServerId.data);
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }
    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    if (server.isVerified) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: "服务器已完成认领",
      });
    }

    if (!server.verifyToken || !server.verifyExpiresAt) {
      return NextResponse.json(
        { error: "请先获取验证码后再验证" },
        { status: 400 },
      );
    }

    if (server.verifyExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "验证码已过期，请重新获取后再验证" },
        { status: 400 },
      );
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
        jobId: `verify-${server.id}`,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    const rawResult = await job.waitUntilFinished(verifyQueueEvents, 15_000);
    const result = parseVerifyJobResult(rawResult);

    if (result.success) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: "验证通过！你的服务器已获得认领标识。",
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
