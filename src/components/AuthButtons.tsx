"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";

const MOBILE_HEADER_OVERLAY_EVENT = "pudcraft-mobile-header-overlay";

const PRIMARY_LINKS = [
  { href: "/", label: "广场" },
  { href: "/explore", label: "探索" },
  { href: "/servers", label: "服务器" },
  { href: "/changelog", label: "更新日志" },
] as const;

const MOBILE_MENU_LINK_CLASS =
  "block rounded-lg px-3 py-2.5 text-sm text-warm-800 transition-colors hover:bg-warm-100";

/**
 * 顶部导航认证区。
 * 未登录显示登录/注册；已登录显示头像昵称和用户菜单。
 */
export function AuthButtons() {
  const { data: session, status, update } = useSession();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasRefreshedSessionRef = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/" });
    setIsSigningOut(false);
  };

  useEffect(() => {
    if (status !== "authenticated" || hasRefreshedSessionRef.current) {
      return;
    }

    hasRefreshedSessionRef.current = true;
    void update();
  }, [status, update]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (status === "loading") {
    return <span className="text-sm text-warm-400">加载中...</span>;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="m3-btn m3-btn-tonal px-3 py-1.5">
          登录
        </Link>
        <Link href="/register" className="m3-btn m3-btn-primary px-3 py-1.5">
          注册
        </Link>
      </div>
    );
  }

  const displayName =
    session.user.name?.trim() || session.user.email?.split("@")[0] || "已登录用户";

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      <Link href="/submit" className="m3-btn m3-btn-tonal px-3 py-1.5">
        提交服务器
      </Link>
      <NotificationBell />

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="m3-btn m3-btn-tonal flex items-center gap-2 px-2 py-1.5"
      >
        <UserAvatar
          src={session.user.image}
          name={session.user.name}
          email={session.user.email}
          className="h-6 w-6"
          fallbackClassName="bg-accent text-white"
        />
        <span className="max-w-32 truncate text-sm">{displayName}</span>
      </button>

      {open && (
        <div className="m3-surface absolute right-0 top-11 z-50 w-44 p-2">
          <Link
            href={`/u/${session.user.uid}`}
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            我的主页
          </Link>
          <Link
            href="/settings/profile"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            资料设置
          </Link>
          <Link
            href="/console"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            控制台
          </Link>
          <Link
            href="/favorites"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            我的收藏
          </Link>
          {session.user.role === "admin" && (
            <Link
              href="/admin"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-muted"
              onClick={() => setOpen(false)}
            >
              管理后台
            </Link>
          )}
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await handleSignOut();
            }}
            disabled={isSigningOut}
            className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-accent-hover transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "退出中..." : "退出"}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/**
 * 移动端导航菜单。
 * 点击汉堡按钮展开，点击遮罩或菜单项后关闭。
 */
export function MobileNavMenu() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName =
    session?.user?.name?.trim() || session?.user?.email?.split("@")[0] || "已登录用户";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  useEffect(() => {
    const handleOverlayToggle = (
      event: Event,
    ) => {
      const overlayEvent = event as CustomEvent<{ source: "search" | "menu" }>;
      if (overlayEvent.detail.source !== "menu") {
        setOpen(false);
      }
    };

    window.addEventListener(MOBILE_HEADER_OVERLAY_EVENT, handleOverlayToggle);
    return () => window.removeEventListener(MOBILE_HEADER_OVERLAY_EVENT, handleOverlayToggle);
  }, []);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    await signOut({ callbackUrl: "/" });
    setIsSigningOut(false);
  };

  return (
    <>
      <button
        type="button"
        className="m3-btn m3-btn-tonal inline-flex h-11 w-11 items-center justify-center p-0"
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen) {
            window.dispatchEvent(
              new CustomEvent(MOBILE_HEADER_OVERLAY_EVENT, {
                detail: { source: "menu" as const },
              }),
            );
          }
          setOpen(nextOpen);
        }}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
      >
        <span className="space-y-1">
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-[100] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-warm-900/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="关闭菜单"
          />

          <div className="m3-surface absolute inset-x-4 top-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain p-3">
            <div className="mb-3 rounded-xl bg-warm-50 px-3 py-3">
              {session?.user ? (
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={session.user.image}
                    name={session.user.name}
                    email={session.user.email}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-warm-800">{displayName}</p>
                    <p className="truncate text-xs text-warm-400">{session.user.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-warm-500">登录后可发帖、收藏和管理你的圈子。</p>
              )}
            </div>

            <nav className="space-y-4">
              <MobileMenuSection title="导航">
                {PRIMARY_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={MOBILE_MENU_LINK_CLASS}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </MobileMenuSection>

              <MobileMenuSection title="个人">
                {status === "loading" ? (
                  <p className="px-3 py-2 text-sm text-warm-400">加载中...</p>
                ) : session?.user ? (
                  <>
                    <Link
                      href="/submit"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      提交服务器
                    </Link>
                    <Link
                      href="/notifications"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      通知中心
                    </Link>
                    <Link
                      href={`/u/${session.user.uid}`}
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      我的主页
                    </Link>
                    <Link
                      href="/settings/profile"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      资料设置
                    </Link>
                    <Link
                      href="/console"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      控制台
                    </Link>
                    <Link
                      href="/favorites"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      我的收藏
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        await handleSignOut();
                      }}
                      disabled={isSigningOut}
                      className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-accent-hover transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSigningOut ? "退出中..." : "退出"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      登录
                    </Link>
                    <Link
                      href="/register"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      注册
                    </Link>
                  </>
                )}
              </MobileMenuSection>

              {session?.user?.role === "admin" && (
                <MobileMenuSection title="管理">
                  <Link
                    href="/admin"
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-muted"
                    onClick={() => setOpen(false)}
                  >
                    管理后台
                  </Link>
                </MobileMenuSection>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
