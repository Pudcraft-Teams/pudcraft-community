"use client";

import { useState } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ReportDialog } from "@/components/ReportDialog";

interface ServerDetailActionsProps {
  serverId: string;
  initialFavorited: boolean;
  isOwner: boolean;
  isLoggedIn: boolean;
}

export function ServerDetailActions({
  serverId,
  initialFavorited,
  isOwner,
  isLoggedIn,
}: ServerDetailActionsProps) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <FavoriteButton serverId={serverId} initialFavorited={initialFavorited} />
      {isLoggedIn && !isOwner && (
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="rounded-full p-2 text-warm-400 transition-colors hover:bg-warm-100 hover:text-accent"
          title="举报"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
      <ReportDialog
        targetType="server"
        targetId={serverId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
