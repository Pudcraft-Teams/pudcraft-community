"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReactNode } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used within ConfirmProvider");
  return fn;
}

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"),
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    dialog?.resolve(true);
    setDialog(null);
  }, [dialog]);

  const handleCancel = useCallback(() => {
    dialog?.resolve(false);
    setDialog(null);
  }, [dialog]);

  // Modal lifecycle: focus management + body scroll lock
  useEffect(() => {
    if (dialog) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = "hidden";

      const frame = window.requestAnimationFrame(() => {
        const container = dialogRef.current;
        const focusTarget =
          container && getFocusableElements(container)[0]
            ? getFocusableElements(container)[0]
            : confirmBtnRef.current ?? container;
        focusTarget?.focus();
      });

      return () => {
        window.cancelAnimationFrame(frame);
        document.body.style.overflow = "";
        restoreFocusRef.current?.focus();
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [dialog]);

  // Close on Escape
  useEffect(() => {
    if (!dialog) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCancel();
      }

      if (e.key !== "Tab") {
        return;
      }

      const container = dialogRef.current;
      if (!container) {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const currentIndex = focusableElements.indexOf(
        document.activeElement as HTMLElement,
      );
      const nextIndex =
        e.shiftKey
          ? currentIndex <= 0
            ? focusableElements.length - 1
            : currentIndex - 1
          : currentIndex === -1 || currentIndex >= focusableElements.length - 1
            ? 0
            : currentIndex + 1;

      e.preventDefault();
      focusableElements[nextIndex]?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog, handleCancel]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 animate-fade-in bg-warm-900/40 backdrop-blur-[2px]"
            onClick={handleCancel}
            role="presentation"
          />

          {/* Dialog */}
          <div
            ref={dialogRef}
            className="relative z-10 w-full max-w-sm animate-dialog-in rounded-2xl border border-warm-200 bg-surface p-5 shadow-xl outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialog.title ? "confirm-dialog-title" : undefined}
            aria-describedby="confirm-dialog-message"
            tabIndex={-1}
          >
            {dialog.title && (
              <h3 id="confirm-dialog-title" className="mb-2 text-base font-semibold text-warm-800">
                {dialog.title}
              </h3>
            )}

            <p id="confirm-dialog-message" className="text-sm leading-relaxed text-warm-600">
              {dialog.message}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
              >
                {dialog.cancelText ?? "取消"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={handleConfirm}
                className={`m3-btn px-4 py-2 text-sm ${
                  dialog.danger ? "m3-btn-danger" : "m3-btn-primary"
                }`}
              >
                {dialog.confirmText ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
