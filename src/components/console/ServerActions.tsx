"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DeleteServerDialog } from "@/components/DeleteServerDialog";

interface ServerActionsProps {
  serverId: string;
  serverName: string;
  isVerified: boolean;
  onDeleted?: () => void;
}

/**
 * Console management action row.
 * Centralizes edit, claim, view-public, and delete operations for the owner.
 */
export function ServerActions({ serverId, serverName, isVerified, onDeleted }: ServerActionsProps) {
  const t = useTranslations("console.actions");
  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/servers/${serverId}/edit`} className="m3-btn m3-btn-primary">
          {t("editInfo")}
        </Link>

        {isVerified ? (
          <span className="inline-flex items-center rounded-full bg-accent-muted px-3 py-2 text-sm font-medium text-accent ring-1 ring-accent/20">
            {t("verifiedBadge")}
          </span>
        ) : (
          <Link href={`/servers/${serverId}/verify`} className="m3-btn m3-btn-tonal text-accent">
            {t("goVerify")}
          </Link>
        )}

        <Link
          href={`/servers/${serverId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="m3-btn m3-btn-tonal"
        >
          {t("viewPublic")}
        </Link>

        <DeleteServerDialog
          serverId={serverId}
          serverName={serverName}
          redirectTo="/console"
          triggerClassName="m3-btn rounded-xl border border-accent-hover/20 bg-surface text-accent-hover transition-colors hover:bg-accent-muted"
          onDeleted={() => {
            onDeleted?.();
          }}
          buttonText={t("delete")}
        />
      </div>
    </section>
  );
}
