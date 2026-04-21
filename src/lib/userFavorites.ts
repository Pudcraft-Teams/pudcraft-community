import { prisma } from "@/lib/db";
import { buildServerStatusResponse } from "@/lib/serverStatus";
import { canAccessServer, isPrivilegedServerViewer } from "@/lib/server-access";
import { getPublicUrl } from "@/lib/storage";

import type { ServerListItem } from "@/lib/types";

export async function loadUserFavoriteServers(
  userId: string,
  currentUserRole?: string | null,
): Promise<ServerListItem[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: {
      server: {
        select: {
          id: true,
          psid: true,
          name: true,
          host: true,
          port: true,
          description: true,
          tags: true,
          iconUrl: true,
          favoriteCount: true,
          isVerified: true,
          verifiedAt: true,
          isOnline: true,
          playerCount: true,
          maxPlayers: true,
          lastPingedAt: true,
          updatedAt: true,
          visibility: true,
          ownerId: true,
          status: true,
          rejectReason: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const nonPublicServerIds = favorites
    .filter((favorite) => favorite.server.visibility !== "public")
    .map((favorite) => favorite.server.id);
  const memberships =
    nonPublicServerIds.length > 0
      ? await prisma.serverMember.findMany({
          where: { userId, serverId: { in: nonPublicServerIds } },
          select: { serverId: true },
        })
      : [];
  const memberServerIds = new Set(memberships.map((membership) => membership.serverId));

  return favorites.flatMap((favorite) => {
    const server = favorite.server;
    if (
      !canAccessServer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: userId,
        currentUserRole,
      })
    ) {
      return [];
    }

    const canSeeAddress =
      server.visibility === "public" ||
      isPrivilegedServerViewer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: userId,
        currentUserRole,
        isMember: memberServerIds.has(server.id),
      });

    return [
      {
        id: server.id,
        psid: server.psid,
        name: server.name,
        host: canSeeAddress ? server.host : "hidden",
        port: canSeeAddress ? server.port : 0,
        description: server.description,
        tags: server.tags,
        iconUrl: getPublicUrl(server.iconUrl),
        favoriteCount: server.favoriteCount,
        isVerified: server.isVerified,
        verifiedAt: server.verifiedAt?.toISOString() ?? null,
        status: buildServerStatusResponse(server),
      },
    ];
  });
}
