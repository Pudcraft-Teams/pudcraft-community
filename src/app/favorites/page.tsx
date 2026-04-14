export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { ServerCard } from "@/components/ServerCard";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { loadUserFavoriteServers } from "@/lib/userFavorites";

export default async function FavoritesPage() {
  const authResult = await requireActiveUser();
  if (isActiveUserError(authResult) && authResult.response.status === 401) {
    redirect("/login?callbackUrl=%2Ffavorites");
  }

  if (isActiveUserError(authResult)) {
    return (
      <EmptyState
        title="账号已被封禁"
        description="你的账号当前无法查看收藏的服务器"
      />
    );
  }

  const servers = await loadUserFavoriteServers(authResult.user.id, authResult.user.role);

  return (
    <div>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">
          我的收藏
        </h1>
        <p className="mt-1.5 text-sm text-warm-500">收藏的服务器都在这里</p>
      </section>

      {servers.length === 0 ? (
        <EmptyState
          title="暂无收藏的服务器"
          description="浏览服务器列表，点击星标收藏"
          action={{ label: "去发现服务器", href: "/servers" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} initialFavorited />
          ))}
        </div>
      )}
    </div>
  );
}
