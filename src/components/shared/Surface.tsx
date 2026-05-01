import type { ReactNode } from "react";

interface SurfaceProps {
  children: ReactNode;
  className?: string;
}

export function Surface({ children, className = "" }: SurfaceProps) {
  return (
    <div
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{
        background: "var(--m3-surface)",
        borderColor: "var(--m3-outline)",
        boxShadow: "0 1px 4px -1px rgba(60,40,20,0.08)",
      }}
    >
      {children}
    </div>
  );
}
