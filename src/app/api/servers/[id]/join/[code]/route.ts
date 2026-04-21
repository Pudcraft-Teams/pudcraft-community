export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import {
  canJoinServerViaInvite,
  shouldDeletePendingApplicationAfterInviteJoin,
} from "@/lib/server-membership";
import { publishWhitelistChange } from "@/lib/whitelist-pubsub";
import { serverLookupIdSchema, joinByInviteSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; code: string }>;
}

/**
 * POST /api/servers/:id/join/:code
 * 通过邀请码加入服务器。
 */
export async function POST(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id, code } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = joinByInviteSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { mcUsername } = parsed.data;

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, host: true, port: true, joinMode: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!canJoinServerViaInvite(server.joinMode)) {
      return NextResponse.json({ error: tServers("inviteNotSupported") }, { status: 400 });
    }

    // 在事务中完成所有检查和写操作，避免竞态条件
    const result = await prisma.$transaction(async (tx) => {
      // 查找邀请码
      const invite = await tx.serverInvite.findFirst({
        where: { serverId: server.id, code },
      });

      if (!invite) {
        return { error: tServers("inviteInvalid"), status: 404 } as const;
      }

      // 检查是否过期
      if (invite.expiresAt && invite.expiresAt <= new Date()) {
        return { error: tServers("inviteExpired"), status: 410 } as const;
      }

      // 检查使用次数
      if (invite.maxUses && invite.usedCount >= invite.maxUses) {
        return { error: tServers("inviteMaxUsesReached"), status: 410 } as const;
      }

      // 检查是否已是成员
      const existingMember = await tx.serverMember.findUnique({
        where: {
          unique_server_member: {
            serverId: server.id,
            userId,
          },
        },
        select: { id: true },
      });

      if (existingMember) {
        return { error: tServers("inviteAlreadyMember"), status: 409 } as const;
      }

      const existingApplication = await tx.serverApplication.findUnique({
        where: { unique_server_application: { serverId: server.id, userId } },
        select: { id: true, status: true },
      });

      if (shouldDeletePendingApplicationAfterInviteJoin(existingApplication?.status)) {
        await tx.serverApplication.delete({
          where: { id: existingApplication!.id },
        });
      }

      const member = await tx.serverMember.create({
        data: {
          serverId: server.id,
          userId,
          joinedVia: "invite",
          mcUsername,
        },
      });

      await tx.serverInvite.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      });

      const sync = await tx.whitelistSync.create({
        data: {
          serverId: server.id,
          memberId: member.id,
          action: "add",
          status: "pending",
        },
      });

      return { member, sync };
    });

    // 事务返回错误则直接响应
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // 发布白名单变更事件（副作用失败不阻塞主操作）
    try {
      await publishWhitelistChange({
        serverId: server.id,
        syncId: result.sync.id,
        action: "add",
        mcUsername,
      });
    } catch (pubError) {
      logger.warn("[api/servers/[id]/join/[code]] publishWhitelistChange failed", pubError);
    }

    return NextResponse.json({
      success: true,
      data: {
        memberId: result.member.id,
        address: `${server.host}:${server.port}`,
      },
    });
  } catch (error) {
    logger.error("[api/servers/[id]/join/[code]] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
