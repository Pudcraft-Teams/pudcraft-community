export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; code: string }>;
}

/**
 * DELETE /api/servers/:id/invites/:code
 * 撤销邀请码（仅 owner 可操作）。
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

    const { id, code } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    const invite = await prisma.serverInvite.findFirst({
      where: { serverId: server.id, code },
      select: { id: true },
    });

    if (!invite) {
      return NextResponse.json({ error: tServers("inviteNotFound") }, { status: 404 });
    }

    await prisma.serverInvite.delete({
      where: { id: invite.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/servers/[id]/invites/[code]] Unexpected DELETE error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
