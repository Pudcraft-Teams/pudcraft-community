"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface EmptyStateLinkAction {
  label: string;
  href: string;
}

interface EmptyStateButtonAction {
  label: string;
  onClick: () => void;
}

type EmptyStateAction = EmptyStateLinkAction | EmptyStateButtonAction;

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

/**
 * Shared empty-state component.
 * Use it to show a unified message and CTA when a list has no data.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="m3-surface-soft px-6 py-12 text-center">
      {icon && <div className="mb-3 flex justify-center text-warm-500">{icon}</div>}
      <h3 className="text-base font-semibold text-warm-800">{title}</h3>
      {description && <p className="mt-2 text-sm text-warm-600">{description}</p>}
      {action && "href" in action && (
        <Link href={action.href} className="m3-btn m3-btn-primary mt-4 inline-flex">
          {action.label}
        </Link>
      )}
      {action && "onClick" in action && (
        <button
          type="button"
          onClick={action.onClick}
          className="m3-btn m3-btn-primary mt-4 inline-flex"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
