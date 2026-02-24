"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * 全局客户端 Provider 容器。
 * 目前用于注入 NextAuth SessionProvider。
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
