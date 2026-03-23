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

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

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

  // Focus confirm button on open
  useEffect(() => {
    if (dialog) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    }
  }, [dialog]);

  // Close on Escape
  useEffect(() => {
    if (!dialog) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCancel();
      }
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
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-sm animate-dialog-in rounded-2xl border border-warm-200 bg-surface p-5 shadow-xl">
            {dialog.title && (
              <h3 className="mb-2 text-base font-semibold text-warm-800">
                {dialog.title}
              </h3>
            )}

            <p className="text-sm leading-relaxed text-warm-600">
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
