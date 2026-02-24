"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface EmptyStateAction {
  label: string;
  href: string;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

/**
 * 统一空状态组件。
 * 用于列表无数据时展示统一文案和引导动作。
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="m3-surface-soft px-6 py-12 text-center">
      {icon && <div className="mb-3 flex justify-center text-slate-500">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
      {action && (
        <Link href={action.href} className="m3-btn m3-btn-primary mt-4 inline-flex">
          {action.label}
        </Link>
      )}
    </div>
  );
}
