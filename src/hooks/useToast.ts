"use client";

import { useContext } from "react";
import { ToastContext } from "@/components/Toast";

/**
 * Toast Hook。
 * 在客户端组件中获取全局通知能力。
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }

  return context;
}
