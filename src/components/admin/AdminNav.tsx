"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

type AdminNavItemKey = "overview" | "servers" | "users" | "moderation" | "reports" | "changelog";

interface AdminNavItem {
  href: string;
  labelKey: AdminNavItemKey;
  match: string;
}

const ADMIN_ITEMS: AdminNavItem[] = [
  { href: "/admin", labelKey: "overview", match: "/admin" },
  { href: "/admin/servers", labelKey: "servers", match: "/admin/servers" },
  { href: "/admin/users", labelKey: "users", match: "/admin/users" },
  { href: "/admin/moderation", labelKey: "moderation", match: "/admin/moderation" },
  { href: "/admin/reports", labelKey: "reports", match: "/admin/reports" },
  { href: "/admin/changelog", labelKey: "changelog", match: "/admin/changelog" },
];

function isActivePath(pathname: string, match: string): boolean {
  if (match === "/admin") {
    return pathname === match;
  }

  return pathname === match || pathname.startsWith(`${match}/`);
}

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");
  const tItems = useTranslations("admin.nav.items");

  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="m3-surface sticky top-24 space-y-1 p-3">
          <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-warm-400">
            {t("heading")}
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
                {tItems(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="m3-mobile-rail md:hidden" aria-label={t("mobileLabel")}>
        {ADMIN_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.match);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`m3-mobile-rail-card ${active ? "m3-mobile-rail-card-active" : ""}`}
            >
              {tItems(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
