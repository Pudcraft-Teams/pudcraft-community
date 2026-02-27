import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyServerIpButton } from "@/components/CopyServerIpButton";
import { CommentSection } from "@/components/CommentSection";
import { DeleteModpackButton } from "@/components/DeleteModpackButton";
import { DeleteServerDialog } from "@/components/DeleteServerDialog";
import { FavoriteButton } from "@/components/FavoriteButton";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJsonForScript } from "@/lib/json";
import { timeAgo } from "@/lib/time";
import type { ServerComment } from "@/lib/types";
import { serverIdSchema } from "@/lib/validation";

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
      name: string | null;
      email: string;
      image: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: {
        id: string;
        name: string | null;
        email: string;
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
      name: comment.author.name,
      email: comment.author.email,
      image: comment.author.image,
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        name: reply.author.name,
        email: reply.author.email,
        image: reply.author.image,
      },
    })),
  }));
}

const getServerPageData = cache(async (serverId: string) => {
  const parsed = serverIdSchema.safeParse(serverId);
  if (!parsed.success) {
    return null;
  }

  const where = {
    serverId: parsed.data,
    parentId: null,
  } as const;

  const [server, commentTotal, comments] = await Promise.all([
    prisma.server.findUnique({
      where: { id: parsed.data },
      select: {
        id: true,
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
            name: true,
            email: true,
            image: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
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
  const isOwner = !!currentUserId && currentUserId === server.ownerId;
  const isAdmin = session?.user?.role === "admin";
  if (server.status !== "approved" && !isOwner && !isAdmin) {
    return { title: "服务器未找到" };
  }
  const serverAddress = server.port !== 25565 ? `${server.host}:${server.port}` : server.host;
  const description =
    server.description?.trim() || `${server.name} - Minecraft 服务器，地址 ${serverAddress}`;

  return {
    title: server.name,
    description,
    openGraph: {
      title: `${server.name} | PudCraft Community`,
      description: server.description?.trim() || `${server.name} Minecraft 服务器`,
      images: server.iconUrl ? [{ url: toAbsoluteUrl(server.iconUrl) }] : [],
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

  // ─── 审核状态访问控制 ───
  const currentUserId = session?.user?.id ?? null;
  const isOwner = !!currentUserId && currentUserId === server.ownerId;
  const isLoggedIn = !!currentUserId;
  const canClaimUnverified = isLoggedIn && !server.isVerified;
  const canReclaimVerified = isLoggedIn && server.isVerified && server.ownerId !== currentUserId;
  const isAdmin = session?.user?.role === "admin";
  if (server.status !== "approved" && !isOwner && !isAdmin) {
    notFound();
  }

  const isOnline = server.isOnline;
  const serverAddress = server.port !== 25565 ? `${server.host}:${server.port}` : server.host;
  const canViewModpacks = server.status === "approved" || isOwner || isAdmin;
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

  let initialFavorited = false;
  if (session?.user?.id) {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_serverId: {
          userId: session.user.id,
          serverId: server.id,
        },
      },
      select: { id: true },
    });
    initialFavorited = !!favorite;
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
    url: `${SITE_URL}/servers/${server.id}`,
    image: [toAbsoluteUrl(server.iconUrl || "/default-server-icon.png")],
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

      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="m3-link">
          &larr; 返回
        </Link>
        <span>/</span>
        <Link href="/" className="m3-link">
          首页
        </Link>
        <span>/</span>
        <span className="text-slate-700">服务器详情</span>
      </nav>

      <section className="m3-surface mb-6 p-4 sm:p-6">
        {(isOwner || canClaimUnverified || canReclaimVerified || !isLoggedIn) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {isOwner && (
              <Link
                href={`/servers/${server.id}/edit`}
                className="m3-btn m3-btn-primary rounded-lg px-3 py-1.5 text-xs"
              >
                编辑
              </Link>
            )}

            {isOwner && (
              <Link
                href={`/servers/${server.id}/modpacks`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-teal-700"
              >
                整合包管理
              </Link>
            )}

            {canClaimUnverified && (
              <Link
                href={`/servers/${server.id}/verify`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-teal-700"
              >
                认领此服务器
              </Link>
            )}

            {isOwner && (
              <DeleteServerDialog
                serverId={server.id}
                serverName={server.name}
                redirectTo="/console"
                triggerClassName="m3-btn m3-btn-danger rounded-lg px-3 py-1.5 text-xs"
              />
            )}

            {!isLoggedIn && !server.isVerified && (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/servers/${server.id}/verify`)}`}
                className="text-xs text-slate-500 underline underline-offset-4"
              >
                登录后认领
              </Link>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <Image
                src={server.iconUrl || "/default-server-icon.png"}
                alt={`${server.name} 图标`}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </span>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {server.name}
              </h1>
              {server.isVerified && (
                <div className="mt-1 inline-flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100"
                    title="已认领 - 管理员已验证"
                  >
                    已认领
                  </span>
                  {(canReclaimVerified || !isLoggedIn) && (
                    <details className="group relative">
                      <summary
                        className="list-none cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="更多操作"
                      >
                        ...
                      </summary>
                      <div className="absolute left-0 top-6 z-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 shadow-md">
                        <Link
                          href={
                            isLoggedIn
                              ? `/servers/${server.id}/verify`
                              : `/login?callbackUrl=${encodeURIComponent(`/servers/${server.id}/verify`)}`
                          }
                          className="text-xs text-slate-600 underline underline-offset-4"
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
            <FavoriteButton serverId={server.id} initialFavorited={initialFavorited} />
          </div>
        </div>

        {server.isVerified && verifiedAtLabel && (
          <p className="mb-4 text-xs text-teal-700">已于 {verifiedAtLabel} 通过认领验证</p>
        )}

        {isOwner && server.status !== "approved" && (
          <div
            className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
              server.status === "rejected"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
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
                href={`/servers/${server.id}/edit`}
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
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            {isOnline ? "在线" : "离线"}
          </span>
          <span className="text-slate-600">
            当前在线 {server.playerCount} / {server.maxPlayers}
          </span>
          <span className="text-slate-600">{favoriteCount} 人收藏</span>
          <span className="text-slate-500">最后检测：{lastPingLabel}</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="font-mono text-sm text-slate-500">{serverAddress}</p>
          <CopyServerIpButton address={serverAddress} />
        </div>

        <div className="flex flex-wrap gap-2">
          {server.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {server.content && (
        <section className="m3-surface p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">服务器介绍</h2>
          <MarkdownRenderer content={server.content} />
        </section>
      )}

      {canViewModpacks && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">整合包</h2>
            {isOwner && (
              <Link
                href={`/servers/${server.id}/modpacks`}
                className="rounded-xl border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50"
              >
                上传 / 管理
              </Link>
            )}
          </div>

          {modpacks.length === 0 ? (
            <p className="text-sm text-slate-500">当前暂无整合包版本。</p>
          ) : (
            <div className="space-y-3">
              {modpacks.map((modpack, index) => (
                <div key={modpack.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{modpack.name}</h3>
                    {index === 0 && (
                      <span className="rounded-full border border-teal-600 px-2 py-0.5 text-xs font-medium text-teal-600">
                        最新版本
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>版本：{modpack.version ?? "--"}</span>
                    <span>加载器：{modpack.loader ?? "--"}</span>
                    <span>游戏版本：{modpack.gameVersion ?? "--"}</span>
                    <span>Mods：{modpack.modsCount}</span>
                    <span>文件大小：{formatFileSize(modpack.fileSize)}</span>
                    <span>上传时间：{formatDate(modpack.createdAt)}</span>
                    <span>{modpack.hasOverrides ? "含 overrides" : "无 overrides"}</span>
                  </div>

                  {modpack.summary && (
                    <p className="mt-2 text-sm text-slate-600">{modpack.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/modpacks/${modpack.id}/download`}
                      className="rounded-xl border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50"
                    >
                      下载
                    </a>
                    {isOwner && (
                      <DeleteModpackButton
                        modpackId={modpack.id}
                        modpackName={modpack.name}
                        className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
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
