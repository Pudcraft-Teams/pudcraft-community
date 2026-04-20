import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyIdBadge } from "@/components/CopyIdBadge";
import { EmptyState } from "@/components/EmptyState";
import { ServerCard } from "@/components/ServerCard";
import { UserAvatar } from "@/components/UserAvatar";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserCuid } from "@/lib/lookup";
import { buildServerStatusResponse } from "@/lib/serverStatus";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";
import { userLookupIdSchema } from "@/lib/validation";

interface PageProps {
  params: Promise<{ uid: string }>;
}

function formatJoinTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function resolveDisplayName(name: string | null): string {
  return name?.trim() || "用户";
}

const getUser = cache(async (rawId: string, viewerUserId?: string, viewerRole?: string) => {
  const parsed = userLookupIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return null;
  }

  const cuid = await resolveUserCuid(parsed.data);
  if (!cuid) {
    return null;
  }

  const canViewNonPublicServers = viewerUserId === cuid || viewerRole === "admin";

  return prisma.user.findUnique({
    where: { id: cuid },
    select: {
      id: true,
      uid: true,
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
        },
      },
    },
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { uid } = await params;
  const user = await getUser(uid);
  const displayName = user ? resolveDisplayName(user.name) : "用户";

  return {
    title: user?.name || "用户主页",
    description: user?.bio || `${displayName} 的 PudCraft 主页`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

/**
 * 用户公开主页。
 * 展示头像、昵称、简介与该用户提交 / 运营的已审核服务器。
 */
export default async function UserProfilePage({ params }: PageProps) {
  const [{ uid }, session] = await Promise.all([params, auth()]);
  const user = await getUser(uid, session?.user?.id, session?.user?.role);

  if (!user) {
    notFound();
  }

  const displayName = resolveDisplayName(user.name);
  const isOwnProfile = session?.user?.id === user.id;
  const canViewNonPublicServers = isOwnProfile || session?.user?.role === "admin";

  const servers: ServerListItem[] = user.servers.map((server) => ({
    id: server.id,
    psid: server.psid,
    name: server.name,
    host: server.visibility === "public" || canViewNonPublicServers ? server.host : "hidden",
    port: server.visibility === "public" || canViewNonPublicServers ? server.port : 0,
    description: server.description,
    tags: server.tags,
    iconUrl: getPublicUrl(server.iconUrl),
    favoriteCount: server.favoriteCount,
    isVerified: server.isVerified,
    verifiedAt: server.verifiedAt?.toISOString() ?? null,
    status: buildServerStatusResponse(server),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="m3-surface p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <UserAvatar
              src={getPublicUrl(user.image)}
              name={user.name}
              className="h-20 w-20"
            />
            <div>
              <h1 className="text-2xl font-semibold text-warm-800">{displayName}</h1>
              <div className="mt-1">
                <CopyIdBadge label="UID" value={String(user.uid)} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warm-600">
                {user.bio?.trim() || "这个用户还没有填写个人简介。"}
              </p>
              <p className="mt-2 text-xs text-warm-500">注册于 {formatJoinTime(user.createdAt)}</p>
            </div>
          </div>

          {isOwnProfile && (
            <Link href="/settings/profile" className="m3-btn m3-btn-primary">
              编辑资料
            </Link>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-warm-800">提交的服务器</h2>
        {servers.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="暂无服务器" description="该用户还没有提交服务器" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
