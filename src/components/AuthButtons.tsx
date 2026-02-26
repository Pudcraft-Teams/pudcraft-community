"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";

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
    return <span className="text-sm text-slate-500">加载中...</span>;
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
          fallbackClassName="bg-teal-600 text-white"
        />
        <span className="max-w-32 truncate text-sm">{displayName}</span>
      </button>

      {open && (
        <div className="m3-surface absolute right-0 top-11 z-50 w-44 p-2">
          <Link
            href={`/user/${session.user.id}`}
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            个人主页
          </Link>
          <Link
            href="/settings/profile"
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            资料设置
          </Link>
          <Link
            href="/console"
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            控制台
          </Link>
          <Link
            href="/favorites"
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            我的收藏
          </Link>
          {session.user.role === "admin" && (
            <Link
              href="/admin"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
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
            className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "退出中..." : "退出"}
          </button>
        </div>
      )}
    </div>
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
        className="m3-btn m3-btn-tonal inline-flex h-10 w-10 items-center justify-center p-0"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
      >
        <span className="space-y-1">
          <span className="block h-0.5 w-4 rounded bg-slate-700" />
          <span className="block h-0.5 w-4 rounded bg-slate-700" />
          <span className="block h-0.5 w-4 rounded bg-slate-700" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setOpen(false)}
            aria-label="关闭菜单"
          />

          <div className="m3-surface absolute right-4 top-16 w-[min(20rem,calc(100%-2rem))] p-3">
            <nav className="space-y-1">
              <Link
                href="/"
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                首页
              </Link>

              {status === "loading" ? (
                <p className="px-3 py-2 text-sm text-slate-500">加载中...</p>
              ) : !session?.user ? (
                <>
                  <Link
                    href="/login"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    登录
                  </Link>
                  <Link
                    href="/register"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    注册
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/submit"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    提交服务器
                  </Link>
                  <Link
                    href="/console"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    控制台
                  </Link>
                  <Link
                    href="/favorites"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    我的收藏
                  </Link>
                  <Link
                    href="/notifications"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    通知中心
                  </Link>
                  <Link
                    href={`/user/${session.user.id}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    <UserAvatar
                      src={session.user.image}
                      name={session.user.name}
                      email={session.user.email}
                      className="h-6 w-6"
                      fallbackClassName="bg-teal-600 text-white"
                    />
                    <span className="min-w-0 flex-1 truncate">用户信息 · {displayName}</span>
                  </Link>
                  {session.user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
                      onClick={() => setOpen(false)}
                    >
                      管理后台
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSigningOut ? "退出中..." : "退出"}
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
