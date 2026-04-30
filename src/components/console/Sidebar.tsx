"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
 * Console sidebar.
 * Desktop shows the owned-server list; mobile provides a dropdown selector.
 */
export function Sidebar({ servers }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("console.sidebar");

  const hasServers = servers.length > 0;
  const activeServerId = resolveActiveServerId(pathname);
  const selectedServerId =
    activeServerId && servers.some((server) => server.id === activeServerId)
      ? activeServerId
      : (servers[0]?.id ?? "");
  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? null;
  const selectedServerAddress = selectedServer ? resolveServerAddress(selectedServer) : null;

  return (
    <>
      <div className="m3-surface mb-4 space-y-3 p-3 md:hidden">
        <Link
          href="/console"
          className="mb-2 flex items-center gap-2 rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-warm-100"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
          {t("dashboard")}
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">
              {t("myServers")}
            </p>
            <p className="text-xs text-warm-400">
              {hasServers ? t("subtitleHasServers") : t("subtitleNoServers")}
            </p>
          </div>
          <Link
            href="/submit"
            className="m3-btn m3-btn-primary inline-flex w-full items-center justify-center px-3 py-2 text-xs sm:w-auto"
          >
            {hasServers ? t("submitNew") : t("submitFirst")}
          </Link>
        </div>

        {hasServers ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-warm-600">{t("currentServer")}</span>
              <select
                className="m3-input w-full"
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
            </label>

            {selectedServer ? (
              <div className="rounded-xl border border-warm-200 bg-warm-50 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-warm-800">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      selectedServer.isOnline ? "bg-forest" : "bg-warm-400"
                    }`}
                  />
                  <span className="truncate">{selectedServer.name}</span>
                  {selectedServer.isVerified ? (
                    <span className="text-xs font-semibold text-coral">{t("verifiedBadge")}</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-warm-500">{selectedServerAddress}</p>
                <p className="mt-1 text-xs text-warm-500">
                  {t("onlineCount", {
                    current: selectedServer.playerCount,
                    max: selectedServer.maxPlayers,
                  })}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-warm-200 px-3 py-4 text-sm text-warm-500">
            {t("emptyHint")}
          </div>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 md:block">
        <div className="m3-surface sticky top-20 flex max-h-[calc(100vh-8rem)] flex-col p-3">
          <Link
            href="/console"
            className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              !activeServerId
                ? "border border-coral/30 bg-coral-light text-warm-800"
                : "text-warm-600 hover:bg-warm-50"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="2" y="2" width="5" height="5" rx="1" />
              <rect x="9" y="2" width="5" height="5" rx="1" />
              <rect x="2" y="9" width="5" height="5" rx="1" />
              <rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
            {t("dashboard")}
          </Link>

          <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-warm-500">
            {t("myServers")}
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
                        ? "border-coral/30 bg-coral-light"
                        : "border-transparent hover:border-warm-200 hover:bg-warm-50"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-warm-800">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          server.isOnline ? "bg-forest" : "bg-warm-400"
                        }`}
                      />
                      <span className="truncate">{server.name}</span>
                      {server.isVerified && <span className="text-xs text-coral">✓</span>}
                    </p>
                    <p className="mt-1 truncate text-xs text-warm-500">{address}</p>
                    <p className="mt-1 text-xs text-warm-500">
                      {t("onlineCount", {
                        current: server.playerCount,
                        max: server.maxPlayers,
                      })}
                    </p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="min-h-0 flex-1 rounded-xl border border-dashed border-warm-200 p-3 text-sm text-warm-500">
              {t("emptyHint")}
            </div>
          )}

          <Link href="/submit" className="m3-btn m3-btn-primary mt-3 text-center">
            {t("submitNewAction")}
          </Link>
        </div>
      </aside>
    </>
  );
}
