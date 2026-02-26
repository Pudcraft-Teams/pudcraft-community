import Link from "next/link";
import { redirect } from "next/navigation";
import { Sidebar, type ConsoleSidebarServer } from "@/components/console/Sidebar";
import { UserAvatar } from "@/components/UserAvatar";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "服主控制台",
};

interface ConsoleLayoutProps {
  children: React.ReactNode;
}

async function getOwnedServers(userId: string): Promise<ConsoleSidebarServer[]> {
  const servers = await prisma.server.findMany({
    where: { ownerId: userId },
    orderBy: [{ isOnline: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      isOnline: true,
      isVerified: true,
      playerCount: true,
      maxPlayers: true,
    },
  });

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    isOnline: server.isOnline,
    isVerified: server.isVerified,
    playerCount: server.playerCount,
    maxPlayers: server.maxPlayers,
  }));
}

/**
 * 服主控制台布局。
 * 负责登录保护、侧边栏服务器列表与移动端选择器。
 */
export default async function ConsoleLayout({ children }: ConsoleLayoutProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=%2Fconsole");
  }

  const servers = await getOwnedServers(userId);

  const displayName =
    session?.user?.name?.trim() || session?.user?.email?.split("@")[0] || "已登录用户";

  return (
    <div className="min-h-[calc(100vh-10rem)]">
      <div className="m3-surface mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">PudCraft Community</p>
          <p className="text-xs text-slate-500">服主控制台</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/" className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs">
            返回首页
          </Link>
          <Link
            href={`/user/${userId}`}
            className="m3-btn m3-btn-tonal flex items-center gap-2 px-2 py-1.5"
          >
            <UserAvatar
              src={session?.user?.image}
              name={session?.user?.name}
              email={session?.user?.email}
              className="h-6 w-6"
              fallbackClassName="bg-teal-600 text-white"
            />
            <span className="max-w-24 truncate text-xs">{displayName}</span>
          </Link>
        </div>
      </div>

      <div className="flex gap-4">
        <Sidebar servers={servers} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
