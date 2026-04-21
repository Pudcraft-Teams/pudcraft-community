export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notification";
import { resolveServerCuid } from "@/lib/lookup";
import { publishWhitelistChange } from "@/lib/whitelist-pubsub";
import { serverLookupIdSchema, serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

/**
 * DELETE /api/servers/:id/members/:memberId
 * 移除服务器成员（仅服务器 owner 可操作）。
 * 先发布白名单移除消息（Redis pub/sub），再删除成员记录。
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id, memberId } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const parsedMemberId = serverIdSchema.safeParse(memberId);
    if (!parsedMemberId.success) {
      return NextResponse.json({ error: tServers("invalidMemberIdFormat") }, { status: 400 });
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, ownerId: true, psid: true, name: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    const member = await prisma.serverMember.findUnique({
      where: { id: parsedMemberId.data },
      select: { id: true, serverId: true, userId: true, mcUsername: true },
    });

    if (!member || member.serverId !== serverId) {
      return NextResponse.json({ error: tServers("memberNotFound") }, { status: 404 });
    }

    // Publish whitelist removal before deleting the member record.
    // We skip creating a WhitelistSync record for removals because it would
    // be cascade-deleted along with the member. The Redis pub/sub message is
    // the real trigger for the MC plugin.
    if (member.mcUsername) {
      try {
        await publishWhitelistChange({
          serverId,
          syncId: member.id, // use memberId as a reference
          action: "remove",
          mcUsername: member.mcUsername,
        });
      } catch (pubError) {
        // Side-effect failure: log but don't block the main operation
        logger.error("[api/servers/[id]/members/[memberId]] Failed to publish whitelist change", pubError);
      }
    }

    // Delete the member record (cascades WhitelistSync records)
    await prisma.serverMember.delete({
      where: { id: member.id },
    });

    // Send notification to the removed user (fire-and-forget)
    void createNotification({
      userId: member.userId,
      type: "member_removed",
      title: "你已被移出服务器",
      message: `你已被移出「${server.name}」的成员列表`,
      link: `/servers/${server.psid}`,
      serverId,
    }).catch((notifError) => {
      logger.error("[api/servers/[id]/members/[memberId]] Failed to create notification", notifError);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/servers/[id]/members/[memberId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
