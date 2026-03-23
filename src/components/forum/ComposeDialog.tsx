"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CreatePostForm } from "@/components/forum/CreatePostForm";

import type { ReactNode } from "react";

interface ComposeOptions {
  circleId?: string;
  circleName?: string;
  circleSlug?: string;
}

type OpenComposeFn = (options?: ComposeOptions) => void;

const ComposeContext = createContext<OpenComposeFn | null>(null);

export function useCompose(): OpenComposeFn {
  const fn = useContext(ComposeContext);
  if (!fn) throw new Error("useCompose must be used within ComposeProvider");
  return fn;
}

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComposeOptions>({});

  const openCompose = useCallback((opts?: ComposeOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const closeCompose = useCallback(() => {
    setOpen(false);
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

  return (
    <ComposeContext.Provider value={openCompose}>
      {children}

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
