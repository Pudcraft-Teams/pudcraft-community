import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Dashboard,
  type DashboardActivity,
  type DashboardServer,
  type DashboardTask,
} from "@/components/console/Dashboard";
import { defaultLocale, isLocale } from "@/i18n/config";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ConsoleRootPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login?callbackUrl=%2Fconsole");
  }

  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const t = await getTranslations("console");
  const tDash = await getTranslations("console.dashboard");

  const ownerName =
    session?.user?.name?.trim() ||
    session?.user?.misskeyUsername ||
    t("nav.displayNameFallback");

  const ownedServers = await prisma.server.findMany({
    where: { ownerId: userId },
    orderBy: [{ isOnline: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      psid: true,
      name: true,
      host: true,
      port: true,
      iconUrl: true,
      isOnline: true,
      isVerified: true,
      playerCount: true,
      maxPlayers: true,
      updatedAt: true,
    },
  });

  if (ownedServers.length === 0) {
    return (
      <div className="m3-surface p-8 text-center">
        <h1 className="text-2xl font-semibold text-warm-700">{t("entry.heading")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-warm-600">{t("entry.description")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/submit" className="m3-btn m3-btn-primary">
            {t("entry.submitServer")}
          </Link>
          <Link href="/" className="m3-btn m3-btn-tonal">
            {t("entry.backHome")}
          </Link>
        </div>
      </div>
    );
  }

  const serverIds = ownedServers.map((s) => s.id);

  const latestStatuses = await prisma.serverStatus.findMany({
    where: { serverId: { in: serverIds } },
    orderBy: [{ checkedAt: "desc" }],
    distinct: ["serverId"],
    select: { serverId: true, version: true, checkedAt: true },
  });
  const statusByServer = new Map(latestStatuses.map((s) => [s.serverId, s]));

  const dashboardServers: DashboardServer[] = ownedServers.map((server) => {
    const status = statusByServer.get(server.id);
    return {
      id: server.id,
      psid: server.psid,
      name: server.name,
      host: server.host,
      port: server.port,
      iconUrl: server.iconUrl,
      isOnline: server.isOnline,
      isVerified: server.isVerified,
      playerCount: server.playerCount,
      maxPlayers: server.maxPlayers,
      version: status?.version ?? null,
      lastCheckedAt: status?.checkedAt ?? null,
    };
  });

  const [pendingApplications, recentNotifications] = await Promise.all([
    prisma.serverApplication.findMany({
      where: { serverId: { in: serverIds }, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        serverId: true,
        userId: true,
        createdAt: true,
        user: { select: { name: true, misskeyUsername: true } },
      },
    }),
    prisma.serverNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        createdAt: true,
      },
    }),
  ]);

  const serverNameById = new Map(ownedServers.map((s) => [s.id, s.name]));

  const tasks: DashboardTask[] = [];

  for (const server of ownedServers) {
    if (!server.isOnline) {
      tasks.push({
        id: `offline-${server.id}`,
        kind: "alert",
        serverName: server.name,
        text: tDash("taskServerOffline", { name: server.name }),
        createdAt: server.updatedAt,
        href: `/console/${server.id}`,
      });
    }
  }

  for (const app of pendingApplications) {
    const name = serverNameById.get(app.serverId) ?? "";
    const applicantName = app.user?.name?.trim() || app.user?.misskeyUsername || "";
    tasks.push({
      id: `application-${app.id}`,
      kind: "application",
      serverName: name,
      text: tDash("taskApplication", { name, applicant: applicantName }),
      createdAt: app.createdAt,
      href: `/console/${app.serverId}`,
    });
  }

  tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const limitedTasks = tasks.slice(0, 8);

  const activity: DashboardActivity[] = recentNotifications.map((n) => {
    let kind: DashboardActivity["kind"] = "default";
    if (n.type.includes("offline") || n.type.includes("alert")) kind = "alert";
    else if (n.type.includes("report")) kind = "report";
    else if (n.type.includes("online") || n.type.includes("approved")) kind = "online";
    return {
      id: n.id,
      kind,
      text: n.title || n.message,
      createdAt: n.createdAt,
      href: n.link,
    };
  });

  return (
    <Dashboard
      data={{
        ownerName,
        servers: dashboardServers,
        tasks: limitedTasks,
        activity,
        totalsByDay: [],
      }}
      locale={locale}
    />
  );
}
