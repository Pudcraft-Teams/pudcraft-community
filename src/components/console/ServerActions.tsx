"use client";

import Link from "next/link";
import { DeleteServerDialog } from "@/components/DeleteServerDialog";

interface ServerActionsProps {
  serverId: string;
  serverName: string;
  isVerified: boolean;
  onDeleted?: () => void;
}

/**
 * 控制台管理操作区。
 * 集中提供编辑、认领、查看公开页与删除操作。
 */
export function ServerActions({ serverId, serverName, isVerified, onDeleted }: ServerActionsProps) {
  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">服务器管理</h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/servers/${serverId}/edit`} className="m3-btn m3-btn-primary">
          编辑信息
        </Link>

        {isVerified ? (
          <span className="inline-flex items-center rounded-full bg-coral-light px-3 py-2 text-sm font-medium text-coral ring-1 ring-coral/20">
            ✓ 已认领
          </span>
        ) : (
          <Link href={`/servers/${serverId}/verify`} className="m3-btn m3-btn-tonal text-coral">
            去认领
          </Link>
        )}

        <Link
          href={`/servers/${serverId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="m3-btn m3-btn-tonal"
        >
          查看公开详情页 ↗
        </Link>

        <DeleteServerDialog
          serverId={serverId}
          serverName={serverName}
          redirectTo="/console"
          triggerClassName="m3-btn rounded-xl border border-coral-hover/20 bg-[#FFFAF6] text-coral-hover transition-colors hover:bg-coral-light"
          onDeleted={() => {
            onDeleted?.();
          }}
          buttonText="删除服务器"
        />
      </div>
    </section>
  );
}
