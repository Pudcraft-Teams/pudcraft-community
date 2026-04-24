"use client";

import { useContext } from "react";
import { ToastContext } from "@/components/Toast";

/**
 * Toast hook. Exposes the shared toast primitive inside client components.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
