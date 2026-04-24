import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
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

function formatJoinTime(date: Date, locale: string): string {
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "long",
  }).format(date);
}

function resolveDisplayName(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
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
  const t = await getTranslations("user.profile");
  const user = await getUser(uid);
  const displayName = user ? resolveDisplayName(user.name, t("metaDisplayNameFallback")) : t("metaDisplayNameFallback");

  return {
    title: user?.name || t("metaTitleFallback"),
    description: user?.bio || t("metaDescription", { name: displayName }),
    robots: {
      index: false,
      follow: false,
    },
  };
}

/**
 * Public user profile page.
 * Shows avatar, name, bio, and the user's approved submitted / owned
 * servers.
 */
export default async function UserProfilePage({ params }: PageProps) {
  const [{ uid }, session, locale, t] = await Promise.all([
    params,
    auth(),
    getLocale(),
    getTranslations("user.profile"),
  ]);
  const user = await getUser(uid, session?.user?.id, session?.user?.role);

  if (!user) {
    notFound();
  }

  const displayName = resolveDisplayName(user.name, t("displayNameFallback"));
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
                <CopyIdBadge label={t("uidLabel")} value={String(user.uid)} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warm-600">
                {user.bio?.trim() || t("bioEmpty")}
              </p>
              <p className="mt-2 text-xs text-warm-500">
                {t("registeredAt", { time: formatJoinTime(user.createdAt, locale) })}
              </p>
            </div>
          </div>

          {isOwnProfile && (
            <Link href="/settings/profile" className="m3-btn m3-btn-primary">
              {t("editProfile")}
            </Link>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-warm-800">{t("serversHeading")}</h2>
        {servers.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={t("serversEmptyTitle")} description={t("serversEmptyDescription")} />
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
