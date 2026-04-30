"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ApplicationList } from "@/components/console/ApplicationList";
import { InviteManager } from "@/components/console/InviteManager";
import { MemberList } from "@/components/console/MemberList";
import { PageLoading } from "@/components/PageLoading";
import { isPrivateServersEnabled } from "@/lib/features";
import type { ServerDetail } from "@/lib/types";

interface ServerDetailPayload {
  data?: ServerDetail;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseServerPayload(raw: unknown): ServerDetailPayload {
  if (!isRecord(raw)) return {};
  return {
    data: isRecord(raw.data) ? (raw.data as unknown as ServerDetail) : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

export default function ConsoleMembersPage() {
  const params = useParams<{ serverId: string }>();
  const { data: session, status } = useSession();
  const tPage = useTranslations("console.page");

  const [server, setServer] = useState<ServerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverId = params.serverId;

  const fetchServer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}`, { cache: "no-store" });
      const payload = parseServerPayload(await response.json().catch(() => ({})));
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? tPage("serverLoadFailed"));
      }
      const currentUserId = session?.user?.id;
      if (!currentUserId || payload.data.ownerId !== currentUserId) {
        throw new Error(tPage("forbidden"));
      }
      setServer(payload.data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : tPage("serverLoadFailed");
      setError(message);
      setServer(null);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, session?.user?.id, tPage]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchServer();
  }, [fetchServer, status]);

  if (status === "loading" || isLoading) {
    return <PageLoading text={tPage("loading")} />;
  }

  if (error) {
    return <div className="m3-alert-error p-4">{error}</div>;
  }

  if (!server) {
    return <div className="m3-alert-error p-4">{tPage("serverNotFoundOrForbidden")}</div>;
  }

  if (!isPrivateServersEnabled()) {
    return null;
  }

  const showApply = server.joinMode === "apply" || server.joinMode === "apply_and_invite";
  const showInvite = server.joinMode === "invite" || server.joinMode === "apply_and_invite";
  const showMembers = server.visibility !== "public";

  return (
    <div className="space-y-4">
      {showApply && <ApplicationList serverId={String(server.psid)} />}
      {showInvite && (
        <InviteManager serverId={String(server.psid)} serverPsid={server.psid} />
      )}
      {showMembers && <MemberList serverId={String(server.psid)} />}
    </div>
  );
}
