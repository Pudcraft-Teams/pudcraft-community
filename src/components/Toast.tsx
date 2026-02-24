"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastOptions {
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
  };
  dismiss: (id: string) => void;
}

interface ToastProviderProps {
  children: ReactNode;
}

interface ToastProps {
  item: ToastItem;
  onClose: (id: string) => void;
}

const DEFAULT_DURATION = 3000;

export const ToastContext = createContext<ToastContextValue | null>(null);

function Toast({ item, onClose }: ToastProps) {
  const colorClass =
    item.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-toast-in pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm ${colorClass}`}
    >
      <p className="text-sm">{item.message}</p>
      <button
        type="button"
        onClick={() => onClose(item.id)}
        className="rounded-md p-1 text-current transition-colors hover:bg-black/5"
        aria-label="关闭通知"
      >
        ✕
      </button>
    </div>
  );
}

function buildToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 全局 Toast Provider。
 * 提供 success/error 两种通知，并支持自动消失与手动关闭。
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete timersRef.current[id];
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return;
      }

      const duration = options?.duration ?? DEFAULT_DURATION;
      const id = buildToastId();

      setItems((prev) => [...prev, { id, type, message: trimmed }]);
      timersRef.current[id] = window.setTimeout(() => {
        dismiss(id);
      }, duration);
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      const timerIds = Object.values(timersRef.current);
      for (const timerId of timerIds) {
        window.clearTimeout(timerId);
      }
      timersRef.current = {};
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (message: string, options?: ToastOptions) => {
          push("success", message, options);
        },
        error: (message: string, options?: ToastOptions) => {
          push("error", message, options);
        },
      },
      dismiss,
    }),
    [dismiss, push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-4">
        <div className="flex w-full max-w-md flex-col gap-2">
          {items.map((item) => (
            <Toast key={item.id} item={item} onClose={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
