import type { ReactNode } from "react";
import { Surface } from "./Surface";

interface SectionCardProps {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, meta, children, className = "" }: SectionCardProps) {
  return (
    <Surface className={className}>
      <div
        className="flex items-center gap-2.5 px-[18px] py-[14px]"
        style={{ borderBottom: "1px solid var(--m3-outline)" }}
      >
        <span
          className="flex-1 text-[13px] font-semibold"
          style={{ color: "var(--m3-text)" }}
        >
          {title}
        </span>
        {meta ? (
          <span className="text-xs" style={{ color: "var(--m3-text-muted)" }}>
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </Surface>
  );
}
