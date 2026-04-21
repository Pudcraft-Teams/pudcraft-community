"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ToastProvider } from "@/components/Toast";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Global client-side provider tree.
 * Currently wires NextAuth SessionProvider plus the shared Confirm/Toast
 * primitives.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <ToastProvider>{children}</ToastProvider>
      </ConfirmProvider>
    </SessionProvider>
  );
}
