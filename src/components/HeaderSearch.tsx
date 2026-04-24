"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const MOBILE_HEADER_OVERLAY_EVENT = "pudcraft-mobile-header-overlay";

interface HeaderSearchProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function HeaderSearch({
  variant = "desktop",
  onNavigate,
}: HeaderSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("servers.list");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (variant !== "mobile") {
      return;
    }

    const handleOverlayToggle = (
      event: Event,
    ) => {
      const overlayEvent = event as CustomEvent<{ source: "search" | "menu" }>;
      if (overlayEvent.detail.source !== "search") {
        setOpen(false);
      }
    };

    window.addEventListener(MOBILE_HEADER_OVERLAY_EVENT, handleOverlayToggle);
    return () => window.removeEventListener(MOBILE_HEADER_OVERLAY_EVENT, handleOverlayToggle);
  }, [variant]);

  function submit(nextQuery: string) {
    const q = nextQuery.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  }

  if (variant === "mobile") {
    if (open) {
      return (
        <div className="fixed inset-x-0 top-14 z-[120] border-b border-warm-200 bg-surface px-4 py-3 shadow-sm md:hidden">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(query);
            }}
            className="flex items-center gap-2"
            role="search"
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("headerSearchPlaceholder")}
              className="m3-input min-w-0 flex-1"
              aria-label={t("headerSearchInputAriaLabel")}
              autoFocus
            />
            <button type="submit" className="m3-btn m3-btn-primary px-3 py-2 text-xs">
              {t("headerSearchSubmit")}
            </button>
            <button
              type="button"
              className="m3-btn m3-btn-tonal px-3 py-2 text-xs"
              onClick={() => setOpen(false)}
            >
              {t("headerSearchCancel")}
            </button>
          </form>
        </div>
      );
    }

    return (
      <button
        type="button"
        className="m3-btn m3-btn-tonal inline-flex h-11 min-w-0 items-center gap-2 px-3"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent(MOBILE_HEADER_OVERLAY_EVENT, {
              detail: { source: "search" as const },
            }),
          );
          setOpen(true);
        }}
        aria-label={t("headerSearchOpenAriaLabel")}
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-warm-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-warm-500">{t("headerSearchTriggerLabel")}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(query);
      }}
      className="relative"
      role="search"
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("headerSearchPlaceholderShort")}
        className="m3-input w-28 py-1.5 pl-7 pr-2 text-xs sm:w-36"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
    </form>
  );
}
