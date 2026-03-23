"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ConfirmDialog";
import { normalizeImageSrc } from "@/lib/image-url";
import { useToast } from "@/hooks/useToast";

interface ServerOption {
  id: string;
  psid: number;
  name: string;
  iconUrl: string | null;
}

interface CircleServerBindProps {
  circleId: string;
  boundServer: { id: string; psid: number; name: string; iconUrl?: string | null } | null;
  onUpdate: () => void;
}

/**
 * 圈子绑定服务器管理。
 * 显示当前绑定状态，支持绑定/解绑自己认领的服务器。
 */
export function CircleServerBind({ circleId, boundServer, onUpdate }: CircleServerBindProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const userId = session?.user?.id;

  const [myServers, setMyServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [serversLoading, setServersLoading] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState("");

  // Fetch user's owned servers
  useEffect(() => {
    let cancelled = false;

    async function fetchMyServers() {
      setServersLoading(true);
      try {
        if (!userId) return;
        const res = await fetch(`/api/servers?ownerId=${encodeURIComponent(userId)}&limit=50`);
        if (!res.ok) {
          setMyServers([]);
          return;
        }
        const json = (await res.json()) as {
          data: Array<{
            id: string;
            psid: number;
            name: string;
            iconUrl?: string | null;
          }>;
        };
        if (!cancelled) {
          setMyServers(
            (json.data ?? []).map((s) => ({
              id: s.id,
              psid: s.psid,
              name: s.name,
              iconUrl: s.iconUrl ?? null,
            })),
          );
        }
      } catch {
        if (!cancelled) setMyServers([]);
      } finally {
        if (!cancelled) setServersLoading(false);
      }
    }

    void fetchMyServers();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleBind = useCallback(async () => {
    if (!selectedServerId || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/circles/${circleId}/server`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: selectedServerId }),
      });

      const json = (await res.json()) as { error?: string; serverName?: string };

      if (!res.ok) {
        toast.error(json.error ?? "绑定失败");
        return;
      }

      toast.success(`已绑定服务器「${json.serverName}」`);
      setSelectedServerId("");
      onUpdate();
    } catch {
      toast.error("网络异常，绑定失败");
    } finally {
      setLoading(false);
    }
  }, [selectedServerId, loading, circleId, toast, onUpdate]);

  const handleUnbind = useCallback(async () => {
    if (loading) return;

    const ok = await confirm({
      title: "解绑服务器",
      message: `确定解绑服务器「${boundServer?.name}」吗？`,
      confirmText: "解绑",
      danger: true,
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/circles/${circleId}/server`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        toast.error(json.error ?? "解绑失败");
        return;
      }

      toast.success("已解绑服务器");
      onUpdate();
    } catch {
      toast.error("网络异常，解绑失败");
    } finally {
      setLoading(false);
    }
  }, [loading, circleId, boundServer, confirm, toast, onUpdate]);

  // Filter out already-bound server from options
  const availableServers = myServers.filter((s) => s.id !== boundServer?.id);

  return (
    <div>
      <h2 className="text-lg font-semibold text-warm-800">绑定服务器</h2>
      <p className="mt-1 text-sm text-warm-500">
        将圈子与你认领的 Minecraft 服务器关联
      </p>

      {/* Current binding */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-warm-700">当前绑定</h3>

        {boundServer ? (
          <div className="flex items-center gap-3 rounded-xl border border-warm-200 bg-warm-50 p-3">
            <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={normalizeImageSrc(boundServer.iconUrl) || "/default-server-icon.png"}
                alt={boundServer.name}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-warm-800">
                {boundServer.name}
              </p>
              <p className="text-xs text-warm-400">PSID {boundServer.psid}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleUnbind()}
              disabled={loading}
              className="m3-btn m3-btn-tonal text-xs disabled:opacity-50"
            >
              {loading ? "解绑中..." : "解绑"}
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-warm-300 px-4 py-6 text-center text-sm text-warm-400">
            尚未绑定服务器
          </p>
        )}
      </div>

      {/* Bind new server */}
      {!boundServer && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-warm-700">选择服务器</h3>

          {serversLoading ? (
            <p className="text-sm text-warm-400">加载中...</p>
          ) : availableServers.length === 0 ? (
            <p className="text-sm text-warm-400">
              {myServers.length === 0
                ? "你还没有认领的服务器。请先在服务器详情页认领服务器。"
                : "没有可绑定的服务器。"}
            </p>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="m3-input w-full"
                disabled={loading}
              >
                <option value="">请选择服务器...</option>
                {availableServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (PSID {s.psid})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void handleBind()}
                disabled={loading || !selectedServerId}
                className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "绑定中..." : "绑定"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
