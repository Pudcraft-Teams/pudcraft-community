import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyIdBadge } from "@/components/CopyIdBadge";
import { CopyServerIpButton } from "@/components/CopyServerIpButton";
import { CommentSection } from "@/components/CommentSection";
import { DeleteModpackButton } from "@/components/DeleteModpackButton";
import { ServerDetailActions } from "@/components/ServerDetailActions";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJsonForScript } from "@/lib/json";
import { resolveServerCuid } from "@/lib/lookup";
import { canAccessServer, isServerOwner } from "@/lib/server-access";
import { canSeeServerAddress } from "@/lib/server-membership";
import { getPublicUrl } from "@/lib/storage";
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
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
      uid: number;
      name: string | null;
      image: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: {
        id: string;
        uid: number;
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
      uid: comment.author.uid,
      name: comment.author.name,
      image: getPublicUrl(comment.author.image),
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        uid: reply.author.uid,
        name: reply.author.name,
        image: getPublicUrl(reply.author.image),
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
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: COMMENTS_PAGE_SIZE,
      include: {
        author: {
          select: {
            id: true,
            uid: true,
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
                uid: true,
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
  const [{ id }, session] = await Promise.all([params, auth()]);
  const data = await getServerPageData(id);

  if (!data) {
    return { title: "服务器未找到" };
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
    return { title: "服务器未找到" };
  }
  const isPublicServer = server.visibility === "public";
  const serverAddress = server.port !== 25565 ? `${server.host}:${server.port}` : server.host;
  const description =
    server.description?.trim() ||
    (isPublicServer
      ? `${server.name} - Minecraft 服务器，地址 ${serverAddress}`
      : `${server.name} - Minecraft 服务器`);

  return {
    title: server.name,
    description,
    openGraph: {
      title: `${server.name} | PudCraft Community`,
      description: server.description?.trim() || `${server.name} Minecraft 服务器`,
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
  const [{ id }, session] = await Promise.all([params, auth()]);
  const data = await getServerPageData(id);

  if (!data) {
    notFound();
  }

  const { server, comments, commentTotal, commentTotalPages } = data;

  const currentUserId = session?.user?.id ?? null;
  const isOwner = isServerOwner(server.ownerId, currentUserId);
  const isLoggedIn = !!currentUserId;
  const canClaimUnverified = isLoggedIn && !server.isVerified;
  const canReclaimVerified = isLoggedIn && server.isVerified && server.ownerId !== currentUserId;
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
    ? "地址隐藏"
    : server.port !== 25565
      ? `${server.host}:${server.port}`
      : server.host;
  const canViewModpacks = canSeeAddress;
  const favoriteCount = server.favoriteCount;
  const lastPingLabel = server.lastPingedAt ? timeAgo(server.lastPingedAt) : "尚未检测";
  const verifiedAtLabel = server.verifiedAt
    ? new Intl.DateTimeFormat("zh-CN", {
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
    description: server.description || `${server.name} Minecraft 服务器`,
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

      <nav className="mb-6 flex items-center gap-2 text-sm text-warm-400">
        <Link href="/" className="m3-link">
          &larr; 返回
        </Link>
        <span>/</span>
        <Link href="/" className="m3-link">
          首页
        </Link>
        <span>/</span>
        <span className="text-warm-500">服务器详情</span>
      </nav>

      <section className="m3-surface mb-6 p-4 sm:p-6">
        {(isOwner || canClaimUnverified || canReclaimVerified || !isLoggedIn) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {isOwner && (
              <Link
                href={`/servers/${server.psid}/edit`}
                className="m3-btn m3-btn-primary rounded-lg px-3 py-1.5 text-xs"
              >
                编辑
              </Link>
            )}

            {isOwner && (
              <Link
                href={`/servers/${server.psid}/modpacks`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
              >
                整合包管理
              </Link>
            )}

            {canClaimUnverified && (
              <Link
                href={`/servers/${server.psid}/verify`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
              >
                认领此服务器
              </Link>
            )}

            {isOwner && (
              <Link
                href={`/console/${server.id}`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-accent"
              >
                打开控制台
              </Link>
            )}

            {!isLoggedIn && !server.isVerified && (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/servers/${server.psid}/verify`)}`}
                className="text-xs text-warm-400 underline underline-offset-4"
              >
                登录后认领
              </Link>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-warm-200 bg-warm-100">
              <Image
                src={getPublicUrl(server.iconUrl) ?? "/default-server-icon.png"}
                alt={`${server.name} 图标`}
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
                    需申请加入
                  </span>
                )}
                {server.visibility === "private" && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-warm-100 px-2.5 py-1 text-xs font-semibold text-warm-400 ring-1 ring-warm-200">
                    私密服务器
                  </span>
                )}
              </div>
              {server.isVerified && (
                <div className="mt-1 inline-flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full bg-accent-muted px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-accent/20"
                    title="已认领 - 管理员已验证"
                  >
                    已认领
                  </span>
                  {(canReclaimVerified || !isLoggedIn) && (
                    <details className="group relative">
                      <summary
                        className="cursor-pointer list-none rounded-md px-1.5 py-0.5 text-xs text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-500"
                        aria-label="更多操作"
                      >
                        ...
                      </summary>
                      <div className="absolute left-0 top-6 z-10 whitespace-nowrap rounded-md border border-warm-200 bg-surface px-2 py-1 shadow-sm">
                        <Link
                          href={
                            isLoggedIn
                              ? `/servers/${server.id}/verify`
                              : `/login?callbackUrl=${encodeURIComponent(`/servers/${server.id}/verify`)}`
                          }
                          className="text-xs text-warm-500 underline underline-offset-4"
                        >
                          {isLoggedIn ? "我是服主，重新认领" : "登录后认领"}
                        </Link>
                      </div>
                    </details>
                  )}
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
          <p className="mb-4 text-xs text-accent">已于 {verifiedAtLabel} 通过认领验证</p>
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
              {server.status === "pending" ? "审核中：管理员审核通过后将展示在首页" : "审核未通过"}
            </p>
            {server.status === "rejected" && server.rejectReason && (
              <p className="mt-1 text-xs">拒绝原因：{server.rejectReason}</p>
            )}
            {server.status === "rejected" && (
              <Link
                href={`/servers/${server.psid}/edit`}
                className="mt-2 inline-flex text-xs underline underline-offset-4"
              >
                去修改并重新提交
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
            {isOnline ? "在线" : "离线"}
          </span>
          <span className="text-warm-500">
            当前在线 {server.playerCount} / {server.maxPlayers}
          </span>
          <span className="text-warm-500">{favoriteCount} 人收藏</span>
          <span className="text-warm-400">最后检测：{lastPingLabel}</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {addressHidden ? (
            <>
              <p className="text-sm text-warm-400">地址隐藏</p>
              <span className="text-xs text-warm-400">加入后可见</span>
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
                  已加入
                </span>
                <span className="text-xs text-warm-400">你已是该服务器成员</span>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-2">
                {/* Latest application status */}
                {latestApplicationStatus === "pending" && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent-hover px-2.5 py-1 text-xs font-semibold text-accent-hover ring-1 ring-accent-hover">
                      申请审核中
                    </span>
                    <span className="text-xs text-warm-400">请等待服主审核</span>
                  </div>
                )}
                {latestApplicationStatus === "rejected" && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent-hover px-2.5 py-1 text-xs font-semibold text-accent-hover ring-1 ring-accent-hover">
                      申请被拒绝
                    </span>
                    {(server.joinMode === "apply" || server.joinMode === "apply_and_invite") && (
                      <Link
                        href={`/servers/${server.psid}/apply`}
                        className="text-xs text-accent underline underline-offset-4 hover:text-accent"
                      >
                        重新申请
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
                          申请加入
                        </Link>
                      )}
                    {(server.joinMode === "invite" || server.joinMode === "apply_and_invite") && (
                      <span className="text-xs text-warm-400">需要邀请码加入</span>
                    )}
                    {server.joinMode === "open" && (
                      <span className="text-xs text-warm-400">该服务器为开放加入</span>
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
                  登录后查看加入方式
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {server.content && (
        <section className="m3-surface p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-warm-800">服务器介绍</h2>
          <MarkdownRenderer
            content={
              canSeeAddress
                ? server.content
                : server.content.replace(/^- QQ 群：.*$/m, "").trim()
            }
          />
        </section>
      )}

      {canViewModpacks && (
        <section className="mt-6 rounded-xl border border-warm-200 bg-surface p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-warm-800">整合包</h2>
            {isOwner && (
              <Link
                href={`/servers/${server.psid}/modpacks`}
                className="rounded-xl border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
              >
                上传 / 管理
              </Link>
            )}
          </div>

          {modpacks.length === 0 ? (
            <p className="text-sm text-warm-400">当前暂无整合包版本。</p>
          ) : (
            <div className="space-y-3">
              {modpacks.map((modpack, index) => (
                <div key={modpack.id} className="rounded-xl border border-warm-200 bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-warm-800">{modpack.name}</h3>
                    {index === 0 && (
                      <span className="rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
                        最新版本
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-500">
                    <span>版本：{modpack.version ?? "--"}</span>
                    <span>加载器：{modpack.loader ?? "--"}</span>
                    <span>游戏版本：{modpack.gameVersion ?? "--"}</span>
                    <span>Mods：{modpack.modsCount}</span>
                    <span>文件大小：{formatFileSize(modpack.fileSize)}</span>
                    <span>上传时间：{formatDate(modpack.createdAt)}</span>
                    <span>{modpack.hasOverrides ? "含 overrides" : "无 overrides"}</span>
                  </div>

                  {modpack.summary && (
                    <p className="mt-2 text-sm text-warm-500">{modpack.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/modpacks/${modpack.id}/download`}
                      className="rounded-xl border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
                    >
                      下载
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
