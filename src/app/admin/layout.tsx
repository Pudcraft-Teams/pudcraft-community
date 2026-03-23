import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, isAdminError } from "@/lib/admin";

export const metadata = {
  title: "管理后台 | PudCraft Community",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await requireAdmin();
  if (isAdminError(result)) {
    redirect("/");
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4 md:flex-row md:gap-6">
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="m3-surface sticky top-24 space-y-1 p-3">
          <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-warm-400">
            管理后台
          </h2>
          <Link
            href="/admin"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            数据概览
          </Link>
          <Link
            href="/admin/servers"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            服务器管理
          </Link>
          <Link
            href="/admin/users"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            用户管理
          </Link>
          <Link
            href="/admin/moderation"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            内容审查
          </Link>
          <Link
            href="/admin/reports"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            举报管理
          </Link>
          <Link
            href="/admin/changelog"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            更新日志
          </Link>
          <Link
            href="/admin/tags"
            className="block rounded-lg px-3 py-2 text-sm text-warm-700 transition-colors hover:bg-warm-100"
          >
            话题管理
          </Link>
        </nav>
      </aside>

      {/* 移动端导航 */}
      <div className="mb-4 flex gap-2 md:hidden">
        <Link href="/admin" className="m3-chip text-xs">
          概览
        </Link>
        <Link href="/admin/servers" className="m3-chip text-xs">
          服务器
        </Link>
        <Link href="/admin/users" className="m3-chip text-xs">
          用户
        </Link>
        <Link href="/admin/moderation" className="m3-chip text-xs">
          审查
        </Link>
        <Link href="/admin/reports" className="m3-chip text-xs">
          举报
        </Link>
        <Link href="/admin/changelog" className="m3-chip text-xs">
          日志
        </Link>
        <Link href="/admin/tags" className="m3-chip text-xs">
          话题
        </Link>
      </div>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
