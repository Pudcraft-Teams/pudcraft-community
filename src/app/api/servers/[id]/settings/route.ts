export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { isPrivateServersEnabled } from "@/lib/features";
import {
  shouldInvalidateInvitesWhenJoinModeChanges,
} from "@/lib/server-membership";
import { serverLookupIdSchema, updateServerSettingsSchema } from "@/lib/validation";

/**
 * PUT /api/servers/:id/settings — 更新服务器私域设置（可见性、加入模式、申请表单）。
 * 仅服务器 owner 可操作。
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const existing = await prisma.server.findUnique({
      where: { id: cuid },
      select: {
        id: true,
        ownerId: true,
        visibility: true,
        discoverable: true,
        joinMode: true,
        applicationForm: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!existing.ownerId || existing.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    const body: unknown = await request.json();
    const parsed = updateServerSettingsSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { visibility, discoverable, joinMode, applicationForm } = parsed.data;

    if (!isPrivateServersEnabled()) {
      if (visibility && visibility !== "public") {
        return NextResponse.json({ error: tServers("privateDisabled") }, { status: 403 });
      }
      if (joinMode && joinMode !== "open") {
        return NextResponse.json({ error: tServers("privateDisabled") }, { status: 403 });
      }
    }

    const nextVisibility = visibility ?? existing.visibility;
    const nextDiscoverable =
      nextVisibility === "public" ? false : discoverable ?? existing.discoverable;
    const nextJoinMode = nextVisibility === "public" ? "open" : joinMode ?? existing.joinMode;

    const updateData: Record<string, unknown> = {
      visibility: nextVisibility,
      discoverable: nextDiscoverable,
      joinMode: nextJoinMode,
    };
    if (applicationForm !== undefined) {
      updateData.applicationForm = applicationForm;
    }

    const shouldDeleteInvites = shouldInvalidateInvitesWhenJoinModeChanges(
      existing.joinMode,
      nextJoinMode,
    );

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldDeleteInvites) {
        await tx.serverInvite.deleteMany({
          where: { serverId: existing.id },
        });
      }

      return tx.server.update({
        where: { id: existing.id },
        data: updateData,
        select: {
          id: true,
          visibility: true,
          discoverable: true,
          joinMode: true,
          applicationForm: true,
          updatedAt: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        visibility: updated.visibility,
        discoverable: updated.discoverable,
        joinMode: updated.joinMode,
        applicationForm: updated.applicationForm,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[api/servers/[id]/settings] Unexpected PUT error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
