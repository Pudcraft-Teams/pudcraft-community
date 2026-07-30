import { cache } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyIdBadge } from "@/components/CopyIdBadge";
import { CopyServerIpButton } from "@/components/CopyServerIpButton";
import { CommentSection } from "@/components/CommentSection";
import { DeleteModpackButton } from "@/components/DeleteModpackButton";
import { LiveFavoriteCount } from "@/components/LiveFavoriteCount";
import { ServerDetailActions } from "@/components/ServerDetailActions";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { defaultLocale, isLocale } from "@/i18n/config";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJsonForScript } from "@/lib/json";
import { resolveServerCuid } from "@/lib/lookup";
import { canAccessServer, isServerOwner } from "@/lib/server-access";
import { canSeeServerAddress } from "@/lib/server-membership";
import { getPublicUrl } from "@/lib/storage";
import { getUserImageUrl } from "@/lib/user-image";
import { timeAgo } from "@/lib/time";
import type { ApplicationStatus, ServerComment } from "@/lib/types";
import { serverLookupIdSchema } from "@/lib/validation";

const SITE_URL = "https://pudcraft.cn";
const COMMENTS_PAGE_SIZE = 20;

interface Props {
  params: Promise<{ id: string }>;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(date: Date, locale: string): string {
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toAbsoluteUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }

  return `${SITE_URL}${input.startsWith("/") ? input : `/${input}`}`;
}

function mapComments(
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: {
      id: string;
      misskeyId: string;
      misskeyUsername: string;
      name: string | null;
      image: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: {
        id: string;
        misskeyId: string;
        misskeyUsername: string;
        name: string | null;
        image: string | null;
      };
    }>;
  }>,
): ServerComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      misskeyId: comment.author.misskeyId,
      misskeyUsername: comment.author.misskeyUsername,
      name: comment.author.name,
      image: getUserImageUrl(comment.author.image),
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        misskeyId: reply.author.misskeyId,
        misskeyUsername: reply.author.misskeyUsername,
        name: reply.author.name,
        image: getUserImageUrl(reply.author.image),
      },
    })),
  }));
}

const getServerPageData = cache(async (rawId: string) => {
  const parsed = serverLookupIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return null;
  }

  const cuid = await resolveServerCuid(parsed.data);
  if (!cuid) {
    return null;
  }

  const where = {
    serverId: cuid,
    parentId: null,
  } as const;

  const [server, commentTotal, comments] = await Promise.all([
    prisma.server.findUnique({
      where: { id: cuid },
      select: {
        id: true,
        psid: true,
        name: true,
        host: true,
        port: true,
        description: true,
        content: true,
        tags: true,
        iconUrl: true,
        ownerId: true,
        isVerified: true,
        verifiedAt: true,
        favoriteCount: true,
        isOnline: true,
        playerCount: true,
        maxPlayers: true,
        status: true,
        rejectReason: true,
        lastPingedAt: true,
        visibility: true,
        joinMode: true,
      },
    }),
    prisma.serverComment.count({ where }),
    prisma.serverComment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: COMMENTS_PAGE_SIZE,
      include: {
        author: {
          select: {
            id: true,
            misskeyId: true,
            misskeyUsername: true,
            name: true,
            image: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                misskeyId: true,
                misskeyUsername: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!server) {
    return null;
  }

  return {
    server,
    comments: mapComments(comments),
    commentTotal,
    commentTotalPages: Math.max(1, Math.ceil(commentTotal / COMMENTS_PAGE_SIZE)),
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, session, t] = await Promise.all([
    params,
    auth(),
    getTranslations("servers.detail"),
  ]);
  const data = await getServerPageData(id);

  if (!data) {
    return { title: t("metaNotFound") };
  }

  const { server } = data;
  const currentUserId = session?.user?.id ?? null;
  const canAccessCurrentServer = canAccessServer({
    status: server.status,
    ownerId: server.ownerId,
    currentUserId,
    currentUserRole: session?.user?.role,
  });
  if (!canAccessCurrentServer) {
    return { title: t("metaNotFound") };
  }
  const isPublicServer = server.visibility === "public";
  const serverAddress = server.port !== 25565 ? `${server.host}:${server.port}` : server.host;
  const description =
    server.description?.trim() ||
    (isPublicServer
      ? t("metaDescriptionPublic", { name: server.name, address: serverAddress })
      : t("metaDescriptionPrivate", { name: server.name }));

  return {
    title: server.name,
    description,
    openGraph: {
      title: t("metaOgTitleSuffix", { name: server.name }),
      description:
        server.description?.trim() || t("metaOgDescriptionFallback", { name: server.name }),
      images: server.iconUrl
        ? [{ url: toAbsoluteUrl(getPublicUrl(server.iconUrl) ?? "/default-server-icon.png") }]
        : [],
    },
  };
}

/**
 * 服务器详情页 —— 服务端渲染详情 + 评论首屏预取。
 */
export default async function ServerDetailPage({ params }: Props) {
  const [{ id }, session, locale, t] = await Promise.all([
    params,
    auth(),
    getLocale(),
    getTranslations("servers.detail"),
  ]);
  const data = await getServerPageData(id);

  if (!data) {
    notFound();
  }

  const { server, comments, commentTotal, commentTotalPages } = data;
  const appLocale = isLocale(locale) ? locale : defaultLocale;
  const intlLocale = appLocale === "en" ? "en-US" : "zh-CN";

  const currentUserId = session?.user?.id ?? null;
  const isOwner = isServerOwner(server.ownerId, currentUserId);
  const isLoggedIn = !!currentUserId;
  const canAccessCurrentServer = canAccessServer({
    status: server.status,
    ownerId: server.ownerId,
    currentUserId,
    currentUserRole: session?.user?.role,
  });
  if (!canAccessCurrentServer) {
    notFound();
  }

  // ─── Address visibility check ───
  const canSeeAddress = await canSeeServerAddress(
    { visibility: server.visibility, ownerId: server.ownerId },
    session?.user?.id,
    session?.user?.role,
    server.id,
  );

  const isOnline = server.isOnline;
  const addressHidden = !canSeeAddress;
  const serverAddress = addressHidden
    ? t("addressHidden")
    : server.port !== 25565
      ? `${server.host}:${server.port}`
      : server.host;
  const canViewModpacks = canSeeAddress;
  const favoriteCount = server.favoriteCount;
  const lastPingLabel = server.lastPingedAt
    ? timeAgo(server.lastPingedAt, appLocale)
    : t("lastPingUnchecked");
  const verifiedAtLabel = server.verifiedAt
    ? new Intl.DateTimeFormat(intlLocale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(server.verifiedAt)
    : null;

  // ─── Membership & application status ───
  let isMember = false;
  let latestApplicationStatus: ApplicationStatus | null = null;

  let initialFavorited = false;
  if (session?.user?.id) {
    const [favorite, member, application] = await Promise.all([
      prisma.favorite.findUnique({
        where: {
          userId_serverId: {
            userId: session.user.id,
            serverId: server.id,
          },
        },
        select: { id: true },
      }),
      prisma.serverMember.findUnique({
        where: {
          unique_server_member: {
            serverId: server.id,
            userId: session.user.id,
          },
        },
        select: { id: true },
      }),
      prisma.serverApplication.findFirst({
        where: {
          serverId: server.id,
          userId: session.user.id,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      }),
    ]);
    initialFavorited = !!favorite;
    isMember = !!member;
    if (application) {
      latestApplicationStatus = application.status as ApplicationStatus;
    }
  }

  const modpacks = canViewModpacks
    ? await prisma.modpack.findMany({
        where: { serverId: server.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          version: true,
          loader: true,
          gameVersion: true,
          summary: true,
          fileSize: true,
          modsCount: true,
          hasOverrides: true,
          createdAt: true,
        },
      })
    : [];

  const gameServerSchema = {
    "@context": "https://schema.org",
    "@type": "GameServer",
    name: server.name,
    description: server.description || t("gameServerSchemaDescription", { name: server.name }),
    url: `${SITE_URL}/servers/${server.psid}`,
    image: [toAbsoluteUrl(getPublicUrl(server.iconUrl) ?? "/default-server-icon.png")],
    game: {
      "@type": "VideoGame",
      name: "Minecraft",
    },
    serverStatus: server.isOnline ? "Online" : "Offline",
    playersOnline: server.playerCount,
  };

  return (
    <div className="mx-auto max-w-4xl px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForScript(gameServerSchema) }}
      />

      <nav className="mb-6 flex items-center gap-2 text-sm text-warm-500">
        <Link href="/servers" className="m3-link">
          &larr; {t("breadcrumbServers")}
        </Link>
        <span>/</span>
        <span className="text-warm-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <section className="m3-surface mb-6 p-4 sm:p-6">
        {isOwner && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {isOwner && (
              <Link
                href={`/servers/${server.psid}/edit`}
                className="m3-btn m3-btn-primary rounded-lg px-3 py-1.5 text-xs"
              >
                {t("actionEdit")}
              </Link>
            )}

            {isOwner && (
              <Link
                href={`/servers/${server.psid}/modpacks`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
              >
                {t("actionManageModpacks")}
              </Link>
            )}

            {isOwner && (
              <Link
                href={`/console/${server.id}`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
              >
                {t("actionOpenConsole")}
              </Link>
            )}

          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-warm-200 bg-warm-100">
              <Image
                src={getPublicUrl(server.iconUrl) ?? "/default-server-icon.png"}
                alt={t("iconAlt", { name: server.name })}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-warm-800 sm:text-3xl">
                  {server.name}
                </h1>
                {server.visibility === "unlisted" && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-accent-hover px-2.5 py-1 text-xs font-semibold text-accent-hover ring-1 ring-accent-hover">
                    {t("badgeApplyRequired")}
                  </span>
                )}
                {server.visibility === "private" && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-warm-100 px-2.5 py-1 text-xs font-semibold text-warm-400 ring-1 ring-warm-200">
                    {t("badgePrivate")}
                  </span>
                )}
              </div>
              {server.isVerified && (
                <div className="mt-1 inline-flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full bg-accent-muted px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-accent/20"
                    title={t("badgeClaimedTitle")}
                  >
                    {t("badgeClaimed")}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="self-start sm:self-auto">
            <ServerDetailActions
              serverId={server.id}
              initialFavorited={initialFavorited}
              isOwner={isOwner}
              isLoggedIn={isLoggedIn}
            />
          </div>
        </div>

        {server.isVerified && verifiedAtLabel && (
          <p className="mb-4 text-xs text-accent">
            {t("verifiedAtHint", { time: verifiedAtLabel })}
          </p>
        )}

        {isOwner && server.status !== "approved" && (
          <div
            className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
              server.status === "rejected"
                ? "border-accent-hover bg-accent-hover text-accent-hover"
                : "border-accent-hover bg-accent-hover text-accent-hover"
            }`}
          >
            <p className="font-medium">
              {server.status === "pending" ? t("reviewPending") : t("reviewRejected")}
            </p>
            {server.status === "rejected" && server.rejectReason && (
              <p className="mt-1 text-xs">
                {t("reviewRejectReason", { reason: server.rejectReason })}
              </p>
            )}
            {server.status === "rejected" && (
              <Link
                href={`/servers/${server.psid}/edit`}
                className="mt-2 inline-flex text-xs underline underline-offset-4"
              >
                {t("reviewGoEdit")}
              </Link>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isOnline
                ? "bg-forest-light text-forest ring-1 ring-forest-light"
                : "bg-warm-100 text-warm-400 ring-1 ring-warm-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-forest-light0" : "bg-warm-400"}`}
            />
            {isOnline ? t("statusOnline") : t("statusOffline")}
          </span>
          <span className="text-warm-500">
            {t("currentOnline", { count: server.playerCount, max: server.maxPlayers })}
          </span>
          <span className="text-warm-500">
            <LiveFavoriteCount initialCount={favoriteCount} serverId={server.id} />
          </span>
          <span className="text-warm-400">{t("lastPing", { time: lastPingLabel })}</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {addressHidden ? (
            <>
              <p className="text-sm text-warm-400">{t("addressHidden")}</p>
              <span className="text-xs text-warm-400">{t("addressHiddenHint")}</span>
            </>
          ) : (
            <>
              <p className="font-mono text-sm text-warm-500">{serverAddress}</p>
              <CopyServerIpButton address={serverAddress} />
            </>
          )}
          <CopyIdBadge label="PSID" value={String(server.psid)} />
        </div>

        <div className="flex flex-wrap gap-2">
          {server.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-warm-200 bg-warm-50 px-2.5 py-0.5 text-xs text-warm-500"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* ─── Membership status & join mode (non-public servers, non-owner) ─── */}
        {server.visibility !== "public" && !isOwner && (
          <div className="mt-4 rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
            {/* Membership status */}
            {isMember ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-forest-light px-2.5 py-1 text-xs font-semibold text-forest ring-1 ring-forest-light">
                  {t("membershipJoined")}
                </span>
                <span className="text-xs text-warm-400">{t("membershipJoinedHint")}</span>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-2">
                {/* Latest application status */}
                {latestApplicationStatus === "pending" && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent-hover px-2.5 py-1 text-xs font-semibold text-accent-hover ring-1 ring-accent-hover">
                      {t("applicationPending")}
                    </span>
                    <span className="text-xs text-warm-400">{t("applicationPendingHint")}</span>
                  </div>
                )}
                {latestApplicationStatus === "rejected" && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent-hover px-2.5 py-1 text-xs font-semibold text-accent-hover ring-1 ring-accent-hover">
                      {t("applicationRejected")}
                    </span>
                    {(server.joinMode === "apply" || server.joinMode === "apply_and_invite") && (
                      <Link
                        href={`/servers/${server.psid}/apply`}
                        className="text-xs text-accent underline underline-offset-4 hover:text-accent"
                      >
                        {t("applicationReapply")}
                      </Link>
                    )}
                  </div>
                )}

                {/* Join mode actions — show when no pending application */}
                {latestApplicationStatus !== "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {(server.joinMode === "apply" || server.joinMode === "apply_and_invite") &&
                      latestApplicationStatus !== "rejected" && (
                        <Link
                          href={`/servers/${server.psid}/apply`}
                          className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
                        >
                          {t("joinApply")}
                        </Link>
                      )}
                    {(server.joinMode === "invite" || server.joinMode === "apply_and_invite") && (
                      <span className="text-xs text-warm-400">{t("joinInviteHint")}</span>
                    )}
                    {server.joinMode === "open" && (
                      <span className="text-xs text-warm-400">{t("joinOpenHint")}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/servers/${server.psid}`)}`}
                  className="text-xs text-accent underline underline-offset-4 hover:text-accent"
                >
                  {t("loginToSeeJoin")}
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {server.content && (
        <section className="m3-surface p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-warm-800">{t("introHeading")}</h2>
          <MarkdownRenderer
            content={
              canSeeAddress ? server.content : server.content.replace(/^- QQ 群：.*$/m, "").trim()
            }
          />
        </section>
      )}

      {canViewModpacks && (
        <section className="mt-6 rounded-xl border border-warm-200 bg-surface p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-warm-800">{t("modpackHeading")}</h2>
            {isOwner && (
              <Link
                href={`/servers/${server.psid}/modpacks`}
                className="rounded-xl border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
              >
                {t("modpackManage")}
              </Link>
            )}
          </div>

          {modpacks.length === 0 ? (
            <p className="text-sm text-warm-400">{t("modpackEmpty")}</p>
          ) : (
            <div className="space-y-3">
              {modpacks.map((modpack, index) => (
                <div key={modpack.id} className="rounded-xl border border-warm-200 bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-warm-800">{modpack.name}</h3>
                    {index === 0 && (
                      <span className="rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
                        {t("modpackLatestBadge")}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-500">
                    <span>{t("modpackVersion", { value: modpack.version ?? "--" })}</span>
                    <span>{t("modpackLoader", { value: modpack.loader ?? "--" })}</span>
                    <span>{t("modpackGameVersion", { value: modpack.gameVersion ?? "--" })}</span>
                    <span>{t("modpackMods", { count: modpack.modsCount })}</span>
                    <span>{t("modpackFileSize", { size: formatFileSize(modpack.fileSize) })}</span>
                    <span>
                      {t("modpackUploadedAt", { time: formatDate(modpack.createdAt, appLocale) })}
                    </span>
                    <span>
                      {modpack.hasOverrides
                        ? t("modpackWithOverrides")
                        : t("modpackWithoutOverrides")}
                    </span>
                  </div>

                  {modpack.summary && (
                    <p className="mt-2 text-sm text-warm-500">{modpack.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/modpacks/${modpack.id}/download`}
                      className="rounded-xl border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
                    >
                      {t("modpackDownload")}
                    </a>
                    {isOwner && (
                      <DeleteModpackButton
                        modpackId={modpack.id}
                        modpackName={modpack.name}
                        className="rounded-xl border border-accent-hover px-3 py-1.5 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-hover"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <CommentSection
        serverId={server.id}
        initialComments={comments}
        initialTotal={commentTotal}
        initialPage={1}
        initialTotalPages={commentTotalPages}
      />
    </div>
  );
}
