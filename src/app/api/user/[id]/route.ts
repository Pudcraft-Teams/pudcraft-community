export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveUserCuid } from "@/lib/lookup";
import { toPublicUserLookupId } from "@/lib/server-access";
import { buildServerStatusResponse } from "@/lib/serverStatus";
import { getPublicUrl } from "@/lib/storage";
import { getUserImageUrl } from "@/lib/user-image";
import type { ServerListItem } from "@/lib/types";
import { userLookupIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/user/:id
 * Returns the user's public profile and submitted servers (email excluded).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tUsers = await getTranslations({ locale, namespace: "errors.api.users" });
  try {
    const { id } = await params;
    const parsedUserId = userLookupIdSchema.safeParse(id);
    if (!parsedUserId.success) {
      return NextResponse.json({ error: tUsers("invalidIdFormat") }, { status: 400 });
    }

    const resolvedId = await resolveUserCuid(parsedUserId.data);
    if (!resolvedId) {
      return NextResponse.json({ error: tUsers("notFound") }, { status: 404 });
    }

    const session = await auth();
    const canViewNonPublicServers =
      session?.user?.id === resolvedId || session?.user?.role === "admin";

    const user = await prisma.user.findUnique({
      where: { id: resolvedId },
      select: {
        id: true,
        misskeyId: true,
        misskeyUsername: true,
        name: true,
        image: true,
        bio: true,
        createdAt: true,
        servers: {
          where: {
            status: "approved",
            ...(canViewNonPublicServers ? {} : { visibility: "public" }),
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: tUsers("notFound") }, { status: 404 });
    }

    const servers: ServerListItem[] = user.servers.map((server) => ({
      id: server.id,
      psid: server.psid,
      name: server.name,
      host: server.host,
      port: server.port,
      description: server.description,
      tags: server.tags,
      iconUrl: getPublicUrl(server.iconUrl),
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      status: buildServerStatusResponse(server),
    }));

    return NextResponse.json({
      data: {
        id: toPublicUserLookupId(user.misskeyId),
        misskeyId: user.misskeyId,
        misskeyUsername: user.misskeyUsername,
        name: user.name,
        image: getUserImageUrl(user.image),
        bio: user.bio,
        createdAt: user.createdAt.toISOString(),
        servers,
      },
    });
  } catch (error) {
    logger.error("[api/user/[id]] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
