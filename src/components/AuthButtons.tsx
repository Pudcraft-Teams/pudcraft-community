"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";

const MOBILE_HEADER_OVERLAY_EVENT = "pudcraft-mobile-header-overlay";

const PRIMARY_LINKS = [
  { href: "/servers", navKey: "servers" },
  { href: "/changelog", navKey: "changelog" },
] as const;

const MOBILE_MENU_LINK_CLASS =
  "block rounded-lg px-3 py-2.5 text-sm text-warm-800 transition-colors hover:bg-warm-100";

/**
 * Top navigation authentication area.
 * Logged-out: shows the Café sign-in button (registration is via Misskey,
 * there is no local sign-up). Logged-in: shows avatar + display name with a
 * dropdown menu.
 */
export function AuthButtons() {
  const { data: session, status, update } = useSession();
  const t = useTranslations("nav.auth");
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
    return <span className="text-sm text-warm-400">{t("loading")}</span>;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="m3-btn m3-btn-primary px-3 py-1.5">
          {t("login")}
        </Link>
      </div>
    );
  }

  const displayName =
    session.user.name?.trim() || session.user.misskeyUsername || t("displayNameFallback");

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      <Link href="/submit" className="m3-btn m3-btn-tonal px-3 py-1.5">
        {t("submitServer")}
      </Link>
      <NotificationBell />

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="m3-btn m3-btn-tonal flex items-center gap-2 px-2 py-1.5"
      >
        <UserAvatar
          src={session.user.image}
          name={session.user.name}
          handle={session.user.misskeyUsername}
          className="h-6 w-6"
          fallbackClassName="bg-accent text-white"
        />
        <span className="max-w-32 truncate text-sm">{displayName}</span>
      </button>

      {open && (
        <div className="m3-surface absolute right-0 top-11 z-50 w-44 p-2">
          <Link
            href="/console"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            {t("myServers")}
          </Link>
          <Link
            href="/favorites"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            {t("myFavorites")}
          </Link>
          <Link
            href="/notifications"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            {t("myNotifications")}
          </Link>
          <Link
            href="/settings/profile"
            className="block rounded-lg px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-warm-100"
            onClick={() => setOpen(false)}
          >
            {t("profileSettings")}
          </Link>
          {session.user.role === "admin" && (
            <Link
              href="/admin"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-muted"
              onClick={() => setOpen(false)}
            >
              {t("adminPanel")}
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
            {isSigningOut ? t("loggingOut") : t("logout")}
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
 * Mobile navigation drawer.
 * Opens on hamburger tap; closes on backdrop click or menu item press.
 */
export function MobileNavMenu() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const tAuth = useTranslations("nav.auth");
  const tMobile = useTranslations("nav.mobile");
  const tNav = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName =
    session?.user?.name?.trim() || session?.user?.misskeyUsername || tAuth("displayNameFallback");

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
        aria-label={open ? tMobile("closeMenu") : tMobile("openMenu")}
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
            aria-label={tMobile("closeMenu")}
          />

          <div className="m3-surface absolute inset-x-4 top-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain p-3">
            <div className="mb-3 rounded-xl bg-warm-50 px-3 py-3">
              {session?.user ? (
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={session.user.image}
                    name={session.user.name}
                    handle={session.user.misskeyUsername}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-warm-800">{displayName}</p>
                    {session.user.misskeyUsername && (
                      <p className="truncate text-xs text-warm-400">@{session.user.misskeyUsername}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-warm-500">{tMobile("guestHint")}</p>
              )}
            </div>

            <nav className="space-y-4">
              <MobileMenuSection title={tMobile("sectionNavigation")}>
                {PRIMARY_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={MOBILE_MENU_LINK_CLASS}
                    onClick={() => setOpen(false)}
                  >
                    {tNav(item.navKey)}
                  </Link>
                ))}
              </MobileMenuSection>

              <MobileMenuSection title={tMobile("sectionPersonal")}>
                {status === "loading" ? (
                  <p className="px-3 py-2 text-sm text-warm-400">{tAuth("loading")}</p>
                ) : session?.user ? (
                  <>
                    <Link
                      href="/submit"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("submitServer")}
                    </Link>
                    <Link
                      href="/console"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("myServers")}
                    </Link>
                    <Link
                      href="/favorites"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("myFavorites")}
                    </Link>
                    <Link
                      href="/notifications"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("myNotifications")}
                    </Link>
                    <Link
                      href="/settings/profile"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("profileSettings")}
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
                      {isSigningOut ? tAuth("loggingOut") : tAuth("logout")}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/submit"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("submitServer")}
                    </Link>
                    <Link
                      href="/login"
                      className={MOBILE_MENU_LINK_CLASS}
                      onClick={() => setOpen(false)}
                    >
                      {tAuth("login")}
                    </Link>
                  </>
                )}
              </MobileMenuSection>

              {session?.user?.role === "admin" && (
                <MobileMenuSection title={tMobile("sectionAdmin")}>
                  <Link
                    href="/admin"
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-muted"
                    onClick={() => setOpen(false)}
                  >
                    {tAuth("adminPanel")}
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
