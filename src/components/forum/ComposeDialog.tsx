"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { CreatePostForm } from "@/components/forum/CreatePostForm";

import type { ReactNode } from "react";

interface ComposeOptions {
  circleId?: string;
  circleName?: string;
  circleSlug?: string;
}

type OpenComposeFn = (options?: ComposeOptions) => void;

interface ComposeContextValue {
  openCompose: OpenComposeFn;
  setDefaults: (opts: ComposeOptions) => void;
  clearDefaults: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function useCompose(): OpenComposeFn {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error("useCompose must be used within ComposeProvider");
  return ctx.openCompose;
}

/**
 * 让页面组件设置/清除 Compose 弹窗的默认选项（如圈子信息）。
 * 全局 FAB 点击时会自动带上这些默认值。
 */
export function useComposeDefaults() {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error("useComposeDefaults must be used within ComposeProvider");
  return { setDefaults: ctx.setDefaults, clearDefaults: ctx.clearDefaults };
}

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComposeOptions>({});
  const [defaults, setDefaultsState] = useState<ComposeOptions>({});

  const openCompose = useCallback((opts?: ComposeOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const closeCompose = useCallback(() => {
    setOpen(false);
  }, []);

  const setDefaults = useCallback((opts: ComposeOptions) => {
    setDefaultsState(opts);
  }, []);

  const clearDefaults = useCallback(() => {
    setDefaultsState({});
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const ctxValue: ComposeContextValue = {
    openCompose,
    setDefaults,
    clearDefaults,
  };

  return (
    <ComposeContext.Provider value={ctxValue}>
      {children}

      {/* Global floating action button */}
      <ComposeFAB defaults={defaults} openCompose={openCompose} />

      {open && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 animate-fade-in bg-warm-900/40 backdrop-blur-[2px]"
            onClick={closeCompose}
          />

          {/* Dialog */}
          <div className="relative z-10 mx-4 mt-[8vh] w-full max-w-xl animate-dialog-in sm:mt-[12vh]">
            <div className="rounded-2xl border border-warm-200 bg-surface shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-warm-100 px-4 py-3">
                <button
                  type="button"
                  onClick={closeCompose}
                  className="rounded-full p-1 text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-warm-600">发帖</span>
                <div className="w-7" />
              </div>

              {/* Form */}
              <div className="px-4 py-3">
                <CreatePostForm
                  circleId={options.circleId}
                  circleName={options.circleName}
                  circleSlug={options.circleSlug}
                  onSuccess={closeCompose}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </ComposeContext.Provider>
  );
}

/* ── Global floating action button ── */

interface ComposeFABProps {
  defaults: ComposeOptions;
  openCompose: OpenComposeFn;
}

function ComposeFAB({ defaults, openCompose }: ComposeFABProps) {
  const { status } = useSession();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  if (status !== "authenticated") return null;

  return (
    <button
      type="button"
      onClick={() => {
        const d = defaultsRef.current;
        openCompose(d.circleId ? d : undefined);
      }}
      className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      aria-label="发帖"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-6 w-6"
      >
        <path
          fillRule="evenodd"
          d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
