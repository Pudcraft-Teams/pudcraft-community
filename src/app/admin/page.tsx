import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.entry");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    userCount,
    serverCount,
    todayCommentCount,
    pendingCount,
    onlineServerCount,
    bannedUserCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.server.count({ where: { status: "approved" } }),
    prisma.serverComment.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.server.count({ where: { status: "pending" } }),
    prisma.server.count({ where: { status: "approved", isOnline: true } }),
    prisma.user.count({ where: { isBanned: true } }),
  ]);

  const stats = [
    { label: t("statsTotalUsers"), value: userCount, color: "text-coral" },
    { label: t("statsTotalServers"), value: serverCount, color: "text-coral-amber" },
    { label: t("statsTodayComments"), value: todayCommentCount, color: "text-forest" },
    { label: t("statsPending"), value: pendingCount, color: "text-warm-800" },
    { label: t("statsOnlineServers"), value: onlineServerCount, color: "text-forest-dark" },
    { label: t("statsBannedUsers"), value: bannedUserCount, color: "text-coral-hover" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">{t("heading")}</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="m3-surface p-4">
            <p className="text-sm text-warm-500">{stat.label}</p>
            <p className={`mt-1 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/servers"
          className="m3-btn m3-btn-primary inline-flex items-center gap-2"
        >
          {t("actionServers")}
          {pendingCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-coral-amber/10 px-1.5 py-0.5 text-xs font-semibold text-coral-amber">
              {pendingCount}
            </span>
          )}
        </Link>
        <Link href="/admin/users" className="m3-btn m3-btn-tonal">
          {t("actionUsers")}
        </Link>
      </div>
    </div>
  );
}
