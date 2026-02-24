import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyServerIpButton } from "@/components/CopyServerIpButton";
import { CommentSection } from "@/components/CommentSection";
import { DeleteServerDialog } from "@/components/DeleteServerDialog";
import { FavoriteButton } from "@/components/FavoriteButton";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { serverIdSchema } from "@/lib/validation";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * 服务器详情页 —— 从数据库获取服务器信息并渲染。
 * Server Component，支持 SSR。
 */
export default async function ServerDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();

  const parsed = serverIdSchema.safeParse(id);
  if (!parsed.success) {
    notFound();
  }

  const server = await prisma.server.findUnique({
    where: { id: parsed.data },
  });

  if (!server) {
    notFound();
  }

  const isOnline = server.isOnline;
  const serverAddress =
    server.port !== 25565 ? `${server.host}:${server.port}` : server.host;
  const isOwner = !!session?.user?.id && session.user.id === server.ownerId;
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

  return (
    <div className="mx-auto max-w-4xl px-4">
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
        {isOwner && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/servers/${server.id}/edit`}
              className="m3-btn m3-btn-primary rounded-lg px-3 py-1.5 text-xs"
            >
              编辑
            </Link>
            {!server.isVerified && (
              <Link
                href={`/servers/${server.id}/verify`}
                className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-teal-700"
              >
                认领此服务器
              </Link>
            )}
            <DeleteServerDialog
              serverId={server.id}
              serverName={server.name}
              redirectTo="/my-servers"
              triggerClassName="m3-btn m3-btn-danger rounded-lg px-3 py-1.5 text-xs"
            />
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {server.name}
            </h1>
            {server.isVerified && (
              <span
                className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100"
                title="已认领 - 管理员已验证"
              >
                已认领
              </span>
            )}
          </div>
          <div className="self-start sm:self-auto">
            <FavoriteButton serverId={server.id} initialFavorited={initialFavorited} />
          </div>
        </div>

        {server.isVerified && verifiedAtLabel && (
          <p className="mb-4 text-xs text-teal-700">已于 {verifiedAtLabel} 通过认领验证</p>
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
            <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
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

      <CommentSection serverId={server.id} />
    </div>
  );
}
