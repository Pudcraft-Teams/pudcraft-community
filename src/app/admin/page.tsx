import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminDashboardPage() {
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
    prisma.comment.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.server.count({ where: { status: "pending" } }),
    prisma.server.count({ where: { status: "approved", isOnline: true } }),
    prisma.user.count({ where: { isBanned: true } }),
  ]);

  const stats = [
    { label: "总用户数", value: userCount, color: "text-blue-600" },
    { label: "总服务器", value: serverCount, color: "text-teal-600" },
    { label: "今日评论", value: todayCommentCount, color: "text-purple-600" },
    { label: "待审核", value: pendingCount, color: "text-amber-600" },
    { label: "在线服务器", value: onlineServerCount, color: "text-emerald-600" },
    { label: "封禁用户", value: bannedUserCount, color: "text-rose-600" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">管理后台</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="m3-surface p-4">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/servers"
          className="m3-btn m3-btn-primary inline-flex items-center gap-2"
        >
          服务器管理
          {pendingCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {pendingCount}
            </span>
          )}
        </Link>
        <Link href="/admin/users" className="m3-btn m3-btn-tonal">
          用户管理
        </Link>
      </div>
    </div>
  );
}
