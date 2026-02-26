"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export interface ConsoleSidebarServer {
  id: string;
  name: string;
  host: string;
  port: number;
  isOnline: boolean;
  isVerified: boolean;
  playerCount: number;
  maxPlayers: number;
}

interface SidebarProps {
  servers: ConsoleSidebarServer[];
}

function resolveActiveServerId(pathname: string): string | null {
  if (!pathname.startsWith("/console/")) {
    return null;
  }

  const rawSegment = pathname.split("/")[2];
  if (!rawSegment) {
    return null;
  }

  const decoded = decodeURIComponent(rawSegment);
  return decoded.length > 0 ? decoded : null;
}

function resolveServerAddress(server: ConsoleSidebarServer): string {
  return server.port === 25565 ? server.host : `${server.host}:${server.port}`;
}

/**
 * 控制台侧边栏。
 * 桌面端展示服务器列表，移动端提供下拉选择器。
 */
export function Sidebar({ servers }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const hasServers = servers.length > 0;
  const activeServerId = resolveActiveServerId(pathname);
  const selectedServerId =
    activeServerId && servers.some((server) => server.id === activeServerId)
      ? activeServerId
      : servers[0]?.id ?? "";

  return (
    <>
      <div className="m3-surface mb-4 p-3 md:hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">我的服务器</p>
        {hasServers ? (
          <div className="mt-2 flex items-center gap-2">
            <select
              className="m3-input min-w-0 flex-1"
              value={selectedServerId}
              onChange={(event) => {
                const targetServerId = event.target.value;
                if (targetServerId) {
                  router.push(`/console/${targetServerId}`);
                }
              }}
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.isOnline ? "● " : "○ "}
                  {server.name}
                </option>
              ))}
            </select>
            <Link href="/submit" className="m3-btn m3-btn-primary px-3 py-2 text-xs">
              提交新服务器
            </Link>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm text-slate-500">你还没有服务器，去提交一个</p>
            <Link href="/submit" className="m3-btn m3-btn-primary px-3 py-2 text-xs">
              去提交
            </Link>
          </div>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 md:block">
        <div className="m3-surface sticky top-20 flex max-h-[calc(100vh-8rem)] flex-col p-3">
          <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            我的服务器
          </h2>

          {hasServers ? (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {servers.map((server) => {
                const isActive = activeServerId === server.id;
                const address = resolveServerAddress(server);

                return (
                  <Link
                    key={server.id}
                    href={`/console/${server.id}`}
                    className={`block rounded-xl border px-3 py-2 transition-colors ${
                      isActive
                        ? "border-teal-200 bg-teal-50"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          server.isOnline ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      <span className="truncate">{server.name}</span>
                      {server.isVerified && <span className="text-xs text-teal-700">✓</span>}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{address}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      在线 {server.playerCount}/{server.maxPlayers}
                    </p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="min-h-0 flex-1 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">
              你还没有服务器，去提交一个。
            </div>
          )}

          <Link href="/submit" className="m3-btn m3-btn-primary mt-3 text-center">
            + 提交新服务器
          </Link>
        </div>
      </aside>
    </>
  );
}
