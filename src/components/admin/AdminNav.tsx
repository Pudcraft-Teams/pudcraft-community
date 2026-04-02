"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavItem {
  href: string;
  label: string;
  match: string;
}

const ADMIN_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "概览", match: "/admin" },
  { href: "/admin/servers", label: "服务器", match: "/admin/servers" },
  { href: "/admin/users", label: "用户", match: "/admin/users" },
  { href: "/admin/moderation", label: "审查", match: "/admin/moderation" },
  { href: "/admin/reports", label: "举报", match: "/admin/reports" },
  { href: "/admin/changelog", label: "日志", match: "/admin/changelog" },
  { href: "/admin/tags", label: "话题", match: "/admin/tags" },
];

function isActivePath(pathname: string, match: string): boolean {
  if (match === "/admin") {
    return pathname === match;
  }

  return pathname === match || pathname.startsWith(`${match}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="m3-surface sticky top-24 space-y-1 p-3">
          <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-warm-400">
            管理后台
          </h2>
          {ADMIN_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.match);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted font-medium text-accent"
                    : "text-warm-700 hover:bg-warm-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="m3-mobile-rail md:hidden" aria-label="管理后台导航">
        {ADMIN_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.match);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`m3-mobile-rail-card ${active ? "m3-mobile-rail-card-active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
