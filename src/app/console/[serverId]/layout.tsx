"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@/components/shared";
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

function resolveServerAddress(server: ServerDetail): string {
  return server.port === 25565 ? server.host : `${server.host}:${server.port}`;
}

export default function ConsoleServerLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ serverId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tPage = useTranslations("console.page");

  const [server, setServer] = useState<ServerDetail | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverId = params.serverId;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/console/${serverId}`)}`);
    }
  }, [router, serverId, status]);

  const fetchServer = useCallback(async () => {
    setIsServerLoading(true);
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
      setIsServerLoading(false);
    }
  }, [serverId, session?.user?.id, tPage]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchServer();
  }, [fetchServer, status]);

  if (status === "loading" || isServerLoading) {
    return <PageLoading text={tPage("loading")} />;
  }

  if (status === "unauthenticated") {
    return <p className="py-10 text-center text-sm text-warm-500">{tPage("redirectingToLogin")}</p>;
  }

  if (error && !server) {
    return <div className="m3-alert-error p-4">{error}</div>;
  }

  if (!server) {
    return <div className="m3-alert-error p-4">{tPage("serverNotFoundOrForbidden")}</div>;
  }

  const serverAddress = resolveServerAddress(server);
  const reviewStatus = server.reviewStatus ?? "approved";
  const isPrivate = isPrivateServersEnabled() && server.visibility !== "public";
  const base = `/console/${serverId}`;

  const tabs = [
    { href: base, label: tPage("tabOverview"), active: pathname === base },
    { href: `${base}/settings`, label: tPage("tabSettings"), active: pathname === `${base}/settings` },
    ...(isPrivate
      ? [
          {
            href: `${base}/members`,
            label: tPage("tabMembers"),
            active: pathname === `${base}/members`,
          },
          {
            href: `${base}/integration`,
            label: tPage("tabIntegration"),
            active: pathname === `${base}/integration`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 pb-4">
      {error && <div className="m3-alert-error px-4 py-3">{error}</div>}

      <section className="m3-surface overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-warm-700">{server.name}</h1>
            <p className="mt-1 font-mono text-sm text-warm-500">{serverAddress}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                server.status.online
                  ? "bg-forest-light text-forest-dark ring-1 ring-forest-light"
                  : "bg-warm-100 text-warm-500 ring-1 ring-warm-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  server.status.online ? "bg-forest" : "bg-warm-400"
                }`}
              />
              {server.status.online ? tPage("badgeOnline") : tPage("badgeOffline")}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                server.isVerified
                  ? "bg-coral-light text-coral-dark ring-1 ring-coral-light"
                  : "bg-coral-amber/10 text-coral-amber ring-1 ring-coral-amber/20"
              }`}
            >
              {server.isVerified ? tPage("badgeVerified") : tPage("badgeUnverified")}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                reviewStatus === "approved"
                  ? "bg-forest-light text-forest-dark ring-1 ring-forest-light"
                  : reviewStatus === "pending"
                    ? "bg-coral-amber/10 text-coral-amber ring-1 ring-coral-amber/20"
                    : "bg-coral-light text-coral-hover ring-1 ring-coral-light"
              }`}
            >
              {reviewStatus === "approved"
                ? tPage("reviewApproved")
                : reviewStatus === "pending"
                  ? tPage("reviewPending")
                  : tPage("reviewRejected")}
            </span>
          </div>
        </div>

        <Tabs items={tabs} className="px-2" />
      </section>

      {reviewStatus === "pending" && (
        <section className="rounded-xl border border-coral-amber/20 bg-coral-amber/10 px-4 py-3 text-sm text-coral-amber">
          {tPage("reviewPendingNotice")}
        </section>
      )}

      {reviewStatus === "rejected" && (
        <section className="rounded-xl border border-coral-hover/20 bg-coral-light px-4 py-3 text-sm text-coral-hover">
          <p className="font-medium">{tPage("reviewRejectedTitle")}</p>
          <p className="mt-1 text-xs">
            {tPage("reviewRejectReason", {
              reason: server.rejectReason?.trim() || tPage("reviewRejectReasonMissing"),
            })}
          </p>
          <Link
            href={`/servers/${server.psid}/edit`}
            className="mt-2 inline-flex text-xs underline underline-offset-4"
          >
            {tPage("reviewRejectEditLink")}
          </Link>
        </section>
      )}

      {children}
    </div>
  );
}
