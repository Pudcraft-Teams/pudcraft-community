import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { timeAgo } from "@/lib/time";
import {
  KpiTile,
  SectionCard,
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableRow,
  DataTableTd,
} from "@/components/shared";

export interface DashboardServer {
  id: string;
  psid: number;
  name: string;
  host: string;
  port: number;
  iconUrl: string | null;
  isOnline: boolean;
  isVerified: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  lastCheckedAt: Date | null;
}

export interface DashboardTask {
  id: string;
  kind: "alert" | "claim";
  text: string;
  serverName: string | null;
  createdAt: Date;
  href: string;
}

export interface DashboardActivity {
  id: string;
  kind: "online" | "alert" | "report" | "default";
  text: string;
  createdAt: Date;
  href: string | null;
}

export interface DashboardData {
  ownerName: string;
  servers: DashboardServer[];
  tasks: DashboardTask[];
  activity: DashboardActivity[];
  totalsByDay: Array<{ day: string; total: number }>;
}

interface DashboardProps {
  data: DashboardData;
  locale: Locale;
}

function resolveAddress(server: DashboardServer, hiddenLabel: string): string {
  if (!server.host || server.host.length === 0) return hiddenLabel;
  return server.port === 25565 ? server.host : `${server.host}:${server.port}`;
}

function firstChar(name: string): string {
  if (!name) return "P";
  const trimmed = name.trim();
  return trimmed.charAt(0) || "P";
}

const feedDotColor: Record<DashboardActivity["kind"], string> = {
  online: "var(--m3-green)",
  alert: "var(--m3-red)",
  report: "var(--m3-orange)",
  default: "var(--m3-outline-strong)",
};

export async function Dashboard({ data, locale }: DashboardProps) {
  const t = await getTranslations("console.dashboard");

  const onlineNow = data.servers
    .filter((s) => s.isOnline)
    .reduce((sum, s) => sum + s.playerCount, 0);
  const onlineServers = data.servers.filter((s) => s.isOnline).length;
  const totalServers = data.servers.length;
  const verifiedServers = data.servers.filter((s) => s.isVerified).length;
  const pendingTaskCount = data.tasks.length;

  const kpis: Array<{
    label: string;
    value: string;
    suffix?: string;
    sub: string;
  }> = [
    {
      label: t("kpiOnlineNow"),
      value: String(onlineNow),
      sub: t("kpiOnlineNowSub", { online: onlineServers, total: totalServers }),
    },
    {
      label: t("kpiServers"),
      value: String(totalServers),
      sub: t("kpiServersSub", { online: onlineServers }),
    },
    {
      label: t("kpiVerified"),
      value: String(verifiedServers),
      sub: t("kpiVerifiedSub", {
        unclaimed: Math.max(0, totalServers - verifiedServers),
      }),
    },
    {
      label: t("kpiPending"),
      value: String(pendingTaskCount),
      sub: t("kpiPendingSub"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1
            className="text-[24px] font-semibold leading-[1.2]"
            style={{ letterSpacing: "-0.025em", color: "var(--m3-text)" }}
          >
            {t("heading")}
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--m3-text-muted)" }}>
            {t("greeting", { name: data.ownerName, count: totalServers })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/submit" className="m3-btn m3-btn-primary text-xs">
            {t("submitServer")}
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            suffix={kpi.suffix}
            sub={kpi.sub}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard
            title={t("serversTitle")}
            meta={t("serversCount", { count: totalServers })}
          >
            {totalServers === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--m3-text-muted)" }}>
                  {t("serversEmptyTitle")}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--m3-outline-strong)" }}>
                  {t("serversEmptyHint")}
                </p>
              </div>
            ) : (
              <DataTable>
                <DataTableHead>
                  <DataTableTh>{t("colServer")}</DataTableTh>
                  <DataTableTh>{t("colStatus")}</DataTableTh>
                  <DataTableTh>{t("colOnline")}</DataTableTh>
                  <DataTableTh>{t("colVersion")}</DataTableTh>
                  <DataTableTh />
                </DataTableHead>
                <DataTableBody>
                  {data.servers.map((server) => {
                    const address = resolveAddress(server, t("addressHidden"));
                    return (
                      <DataTableRow key={server.id} clickable>
                        <DataTableTd>
                          <Link
                            href={`/console/${server.id}`}
                            className="flex items-center gap-2.5 no-underline"
                          >
                            <span
                              aria-hidden
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-medium"
                              style={{
                                borderColor: "var(--m3-outline)",
                                background: "var(--m3-surface-variant)",
                                color: "var(--m3-text-muted)",
                              }}
                            >
                              {firstChar(server.name)}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span
                                className="flex items-center gap-2 font-medium"
                                style={{ color: "var(--m3-text)" }}
                              >
                                <span className="truncate">{server.name}</span>
                                {server.isVerified ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium"
                                    style={{
                                      background: "rgba(92,140,78,0.1)",
                                      color: "var(--m3-green)",
                                      border: "1px solid rgba(92,140,78,0.22)",
                                    }}
                                  >
                                    {t("verifiedBadge")}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className="mt-px font-mono text-[11px]"
                                style={{ color: "var(--m3-outline-strong)" }}
                              >
                                {address}
                              </span>
                            </span>
                          </Link>
                        </DataTableTd>
                        <DataTableTd>
                          {server.isOnline ? (
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: "var(--m3-green)" }}
                              />
                              <span className="text-xs" style={{ color: "var(--m3-text)" }}>
                                {t("statusOnline")}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: "var(--m3-outline-strong)" }}
                              />
                              <span className="text-xs" style={{ color: "var(--m3-text-muted)" }}>
                                {t("statusOffline")}
                              </span>
                            </span>
                          )}
                        </DataTableTd>
                        <DataTableTd numeric>
                          {server.isOnline ? (
                            <span className="font-medium">
                              {server.playerCount}
                              <span style={{ color: "var(--m3-outline-strong)" }}>
                                /{server.maxPlayers}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: "var(--m3-outline-strong)" }}>—</span>
                          )}
                        </DataTableTd>
                        <DataTableTd>
                          {server.version ? (
                            <span
                              className="inline-flex items-center rounded px-1.5 py-px font-mono text-[11px] font-medium"
                              style={{
                                background: "var(--m3-surface-variant)",
                                color: "var(--m3-text-muted)",
                                border: "1px solid var(--m3-outline)",
                              }}
                            >
                              {server.version}
                            </span>
                          ) : (
                            <span style={{ color: "var(--m3-outline-strong)" }}>—</span>
                          )}
                        </DataTableTd>
                        <DataTableTd shrink>
                          <Link
                            href={`/console/${server.id}`}
                            className="m3-btn m3-btn-tonal text-xs"
                          >
                            {t("manage")}
                          </Link>
                        </DataTableTd>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={t("tasksTitle", { count: data.tasks.length })}>
            {data.tasks.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--m3-text-muted)" }}>
                  {t("tasksEmptyTitle")}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--m3-outline-strong)" }}>
                  {t("tasksEmptyHint")}
                </p>
              </div>
            ) : (
              <div>
                {data.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 border-b px-[18px] py-3 last:border-b-0"
                    style={{ borderColor: "var(--m3-outline)" }}
                  >
                    <div
                      className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border"
                      style={
                        task.kind === "alert"
                          ? {
                              background: "rgba(192,57,43,0.06)",
                              borderColor: "rgba(192,57,43,0.18)",
                              color: "var(--m3-red)",
                            }
                          : {
                              background: "var(--m3-surface-variant)",
                              borderColor: "var(--m3-outline)",
                              color: "var(--m3-text-muted)",
                            }
                      }
                    >
                      {task.kind === "alert" ? <AlertIcon /> : null}
                      {task.kind === "claim" ? <ClaimIcon /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className="block text-[12.5px] leading-[1.5]"
                        style={{ color: "var(--m3-text)" }}
                      >
                        {task.text}
                      </span>
                      <span
                        className="mt-0.5 block text-[11px]"
                        style={{ color: "var(--m3-outline-strong)" }}
                      >
                        {timeAgo(task.createdAt, locale)}
                      </span>
                    </div>
                    <div className="shrink-0">
                      <Link href={task.href} className="m3-btn m3-btn-tonal text-xs">
                        {t("taskAction")}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={t("activityTitle")}
            meta={
              <Link
                href="/notifications"
                className="text-xs font-medium transition-colors"
                style={{ color: "var(--m3-text-muted)" }}
              >
                {t("activitySeeAll")}
              </Link>
            }
          >
            {data.activity.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--m3-text-muted)" }}>
                  {t("activityEmptyTitle")}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--m3-outline-strong)" }}>
                  {t("activityEmptyHint")}
                </p>
              </div>
            ) : (
              <div>
                {data.activity.map((item) => {
                  const inner = (
                    <>
                      <span
                        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: feedDotColor[item.kind] }}
                      />
                      <span className="flex-1">{item.text}</span>
                      <span
                        className="ml-2 shrink-0 text-[11px] tabular-nums"
                        style={{ color: "var(--m3-outline-strong)" }}
                      >
                        {timeAgo(item.createdAt, locale)}
                      </span>
                    </>
                  );
                  const baseClass =
                    "flex items-start gap-2.5 border-b px-[18px] py-2.5 text-[12.5px] last:border-b-0";
                  return item.href ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`${baseClass} no-underline transition-colors hover:bg-[var(--m3-surface-variant)]`}
                      style={{ borderColor: "var(--m3-outline)", color: "var(--m3-text)" }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={item.id}
                      className={baseClass}
                      style={{ borderColor: "var(--m3-outline)", color: "var(--m3-text)" }}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M1.5 8h2.8L6 4l2 8 2-6 1.5 2h3" />
    </svg>
  );
}

function ClaimIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5L8 11l-4.5 2.5V3a.5.5 0 0 1 .5-.5Z" />
    </svg>
  );
}
