export const dynamic = "force-dynamic";

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import {
  getVerifyJobId,
  getVerifyQueue,
  getVerifyQueueEvents,
  type VerifyJobResult,
} from "@/lib/queue";
import { serverLookupIdSchema } from "@/lib/validation";

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

function parseVerifyJobResult(raw: unknown, invalidReason: string): VerifyJobResult {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, reason: invalidReason };
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
export async function POST(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await findServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const token = generateVerifyToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const currentOwnerHint =
      server.ownerId && server.ownerId !== userId
        ? tServers("verifyCurrentOwnerHint")
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
      instruction: tServers("verifyInstruction"),
      currentOwner: currentOwnerHint,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/verify] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * GET /api/servers/:id/verify
 * 查询当前服务器认领状态与验证码信息。
 * 仅向验证码发起者返回 verifyToken，避免泄漏。
 */
export async function GET(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await findServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * PATCH /api/servers/:id/verify
 * 触发 BullMQ 验证任务，并等待最多 15 秒返回验证结果。
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await findServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.verifyToken || !server.verifyExpiresAt || !server.verifyUserId) {
      return NextResponse.json({ error: tServers("verifyTokenRequired") }, { status: 400 });
    }

    if (server.verifyUserId !== userId) {
      return NextResponse.json(
        { error: tServers("verifyTokenNotYours") },
        { status: 403 },
      );
    }

    if (server.verifyExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: tServers("verifyTokenExpired") }, { status: 400 });
    }

    const verifyQueue = getVerifyQueue();
    const verifyQueueEvents = getVerifyQueueEvents();

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
    const result = parseVerifyJobResult(rawResult, tServers("verifyInvalidResult"));

    if (result.success) {
      const ownershipTransferred = !!server.ownerId && server.ownerId !== userId;
      return NextResponse.json({
        success: true,
        verified: true,
        message: ownershipTransferred
          ? tServers("verifySuccessNewOwner")
          : tServers("verifySuccessClaimed"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        verified: false,
        message: tServers("verifyFailedGeneric"),
        reason: result.reason ?? tServers("verifyReasonNoToken"),
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
          message: tServers("verifyTimeout"),
        },
        { status: 504 },
      );
    }

    logger.error("[api/servers/[id]/verify] Unexpected PATCH error", {
      error: resolveErrorMessage(error),
    });
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
