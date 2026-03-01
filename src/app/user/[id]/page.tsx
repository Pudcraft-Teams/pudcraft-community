import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { ServerCard } from "@/components/ServerCard";
import { UserAvatar } from "@/components/UserAvatar";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";
import { userIdSchema } from "@/lib/validation";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatJoinTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function resolveDisplayName(name: string | null, email: string): string {
  return name?.trim() || email.split("@")[0] || "用户";
}

const getUser = cache(async (userId: string) => {
  const parsedUserId = userIdSchema.safeParse(userId);
  if (!parsedUserId.success) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: parsedUserId.data },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      bio: true,
      createdAt: true,
      servers: {
        where: {
          status: "approved",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          description: true,
          tags: true,
          iconUrl: true,
          isVerified: true,
          verifiedAt: true,
          isOnline: true,
          playerCount: true,
          maxPlayers: true,
          lastPingedAt: true,
          updatedAt: true,
        },
      },
    },
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser(id);
  const displayName = user ? resolveDisplayName(user.name, user.email) : "用户";

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
 * 展示头像、昵称、简介与该用户提交的服务器。
 */
export default async function UserProfilePage({ params }: PageProps) {
  const [{ id }, session] = await Promise.all([params, auth()]);
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  const displayName = resolveDisplayName(user.name, user.email);
  const isOwnProfile = session?.user?.id === user.id;

  const servers: ServerListItem[] = user.servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    description: server.description,
    tags: server.tags,
    iconUrl: getPublicUrl(server.iconUrl),
    isVerified: server.isVerified,
    verifiedAt: server.verifiedAt?.toISOString() ?? null,
    status: {
      online: server.isOnline,
      playerCount: server.playerCount,
      maxPlayers: server.maxPlayers,
      motd: null,
      favicon: null,
      checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
    },
  }));

  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="m3-surface p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <UserAvatar src={getPublicUrl(user.image)} name={user.name} email={user.email} className="h-20 w-20" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{displayName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                {user.bio?.trim() || "这个用户还没有填写个人简介。"}
              </p>
              <p className="mt-2 text-xs text-slate-500">注册于 {formatJoinTime(user.createdAt)}</p>
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
        <h2 className="text-xl font-semibold text-slate-900">提交的服务器</h2>
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
