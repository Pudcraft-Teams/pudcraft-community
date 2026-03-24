"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleBanManager } from "@/components/forum/CircleBanManager";
import { CircleMemberManager } from "@/components/forum/CircleMemberManager";
import { CircleSectionManager } from "@/components/forum/CircleSectionManager";
import { CircleServerBind } from "@/components/forum/CircleServerBind";
import { ImageUpload } from "@/components/ImageUpload";
import { PageLoading } from "@/components/PageLoading";
import { normalizeImageSrc } from "@/lib/image-url";
import type { CircleDetail, CircleRoleType } from "@/lib/types";

// ─── Constants ───────────────────────────────────

type SettingsTab = "info" | "server" | "sections" | "members" | "bans";

const TABS: { key: SettingsTab; label: string; minRole: CircleRoleType }[] = [
  { key: "info", label: "基本信息", minRole: "OWNER" },
  { key: "server", label: "绑定服务器", minRole: "ADMIN" },
  { key: "sections", label: "子板块", minRole: "ADMIN" },
  { key: "members", label: "成员管理", minRole: "ADMIN" },
  { key: "bans", label: "封禁管理", minRole: "ADMIN" },
];

// ─── Helpers ─────────────────────────────────────

function canAccessTab(userRole: CircleRoleType, minRole: CircleRoleType): boolean {
  const roleWeight: Record<CircleRoleType, number> = {
    OWNER: 3,
    ADMIN: 2,
    MEMBER: 1,
  };
  return roleWeight[userRole] >= roleWeight[minRole];
}

function parseCirclePayload(raw: unknown): { data?: CircleDetail; error?: string } {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    data: typeof payload.data === "object" && payload.data !== null
      ? (payload.data as unknown as CircleDetail)
      : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

// ─── Props ───────────────────────────────────────

interface CircleSettingsProps {
  circleSlug: string;
}

// ─── Component ───────────────────────────────────

/**
 * 圈子设置页面。
 * 含基本信息编辑、子板块管理、成员管理和封禁管理四个标签页。
 */
export function CircleSettings({ circleSlug }: CircleSettingsProps) {
  const router = useRouter();
  const { status } = useSession();

  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [isLoadingCircle, setIsLoadingCircle] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("info");

  // Edit form state (info tab)
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const userRole = circle?.memberRole ?? null;
  const isOwner = userRole === "OWNER";

  // ─── Auth redirect ───

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/c/${circleSlug}/settings`)}`);
    }
  }, [router, circleSlug, status]);

  // ─── Fetch circle ───

  const fetchCircle = useCallback(async () => {
    setIsLoadingCircle(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/circles/${circleSlug}`, {
        cache: "no-store",
      });
      const payload = parseCirclePayload(await response.json().catch(() => ({})));

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "圈子加载失败");
      }

      const data = payload.data;

      // Check permission: must be OWNER or ADMIN
      if (data.memberRole !== "OWNER" && data.memberRole !== "ADMIN") {
        throw new Error("无权限访问该圈子设置");
      }

      setCircle(data);
      setEditName(data.name);
      setEditDescription(data.description ?? "");
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "圈子加载失败";
      setLoadError(message);
      setCircle(null);
    } finally {
      setIsLoadingCircle(false);
    }
  }, [circleSlug]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    void fetchCircle();
  }, [fetchCircle, status]);

  // ─── Clear success message ───

  useEffect(() => {
    if (!saveSuccess) {
      return;
    }

    const timer = setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [saveSuccess]);

  // ─── Detect changes ───

  const hasInfoChanges = useMemo(() => {
    if (!circle) {
      return false;
    }

    const nameChanged = editName !== circle.name;
    const descChanged = editDescription !== (circle.description ?? "");
    return nameChanged || descChanged || !!iconFile || !!bannerFile;
  }, [circle, editName, editDescription, iconFile, bannerFile]);

  // ─── Save info ───

  const handleSaveInfo = useCallback(async () => {
    if (!circle) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (!editName.trim()) {
        throw new Error("圈子名称不能为空");
      }

      // Build the update payload
      const updateData: Record<string, unknown> = {};

      if (editName !== circle.name) {
        updateData.name = editName.trim();
      }

      if (editDescription !== (circle.description ?? "")) {
        updateData.description = editDescription.trim() || null;
      }

      // Upload icon if changed
      if (iconFile) {
        const iconFormData = new FormData();
        iconFormData.set("file", iconFile);
        iconFormData.set("type", "circle-icon");

        const iconRes = await fetch("/api/uploads/editor-image", {
          method: "POST",
          body: iconFormData,
        });
        const iconPayload = await iconRes.json().catch(() => ({})) as Record<string, unknown>;

        if (!iconRes.ok) {
          throw new Error(typeof iconPayload.error === "string" ? iconPayload.error : "图标上传失败");
        }

        if (typeof iconPayload.url === "string") {
          updateData.icon = iconPayload.url;
        }
      }

      // Upload banner if changed
      if (bannerFile) {
        const bannerFormData = new FormData();
        bannerFormData.set("file", bannerFile);
        bannerFormData.set("type", "circle-banner");

        const bannerRes = await fetch("/api/uploads/editor-image", {
          method: "POST",
          body: bannerFormData,
        });
        const bannerPayload = await bannerRes.json().catch(() => ({})) as Record<string, unknown>;

        if (!bannerRes.ok) {
          throw new Error(typeof bannerPayload.error === "string" ? bannerPayload.error : "横幅上传失败");
        }

        if (typeof bannerPayload.url === "string") {
          updateData.banner = bannerPayload.url;
        }
      }

      if (Object.keys(updateData).length === 0) {
        setSaveSuccess(true);
        return;
      }

      const response = await fetch(`/api/circles/${circle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : "保存失败";
        throw new Error(errorMessage);
      }

      setSaveSuccess(true);
      setIconFile(null);
      setBannerFile(null);
      await fetchCircle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [circle, editName, editDescription, iconFile, bannerFile, fetchCircle]);

  // ─── Accessible tabs ───

  const accessibleTabs = useMemo(() => {
    if (!userRole) {
      return [];
    }
    return TABS.filter((tab) => canAccessTab(userRole, tab.minRole));
  }, [userRole]);

  // ─── Ensure the active tab is accessible ───

  useEffect(() => {
    if (accessibleTabs.length > 0 && !accessibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(accessibleTabs[0].key);
    }
  }, [accessibleTabs, activeTab]);

  // ─── Render states ───

  if (status === "loading" || isLoadingCircle) {
    return <PageLoading text="正在加载圈子设置..." />;
  }

  if (status === "unauthenticated") {
    return <p className="py-10 text-center text-sm text-warm-500">正在跳转到登录页...</p>;
  }

  if (loadError && !circle) {
    return <div className="m3-alert-error p-4">{loadError}</div>;
  }

  if (!circle || !userRole) {
    return <div className="m3-alert-error p-4">圈子不存在或你无权访问该设置页。</div>;
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <section className="m3-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {circle.icon ? (
              <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={normalizeImageSrc(circle.icon) || circle.icon}
                  alt={`${circle.name} 图标`}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-white">
                {circle.name.charAt(0)}
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-warm-700">{circle.name}</h1>
              <p className="text-sm text-warm-500">圈子设置</p>
            </div>
          </div>
          <Link
            href={`/c/${circleSlug}`}
            className="m3-btn m3-btn-tonal px-3 py-1.5 text-sm"
          >
            返回圈子
          </Link>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-warm-200 bg-surface p-1">
        {accessibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-accent text-white"
                : "text-warm-600 hover:bg-warm-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "info" && isOwner && (
        <section className="m3-surface p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-warm-800">基本信息</h2>

          {/* Name */}
          <div className="mt-5">
            <label className="text-sm font-medium text-warm-800">圈子名称</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              className="mt-2 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Description */}
          <div className="mt-4">
            <label className="text-sm font-medium text-warm-800">简介</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="圈子简介..."
            />
          </div>

          {/* Icon upload */}
          <div className="mt-4">
            <label className="text-sm font-medium text-warm-800">圈子图标</label>
            <div className="mt-2">
              <ImageUpload
                value={circle.icon}
                onChange={(file) => setIconFile(file)}
                shape="rounded"
                size={96}
                outputSize={512}
                placeholder={
                  <span className="text-xs text-warm-400">点击上传图标</span>
                }
              />
            </div>
          </div>

          {/* Banner upload */}
          <div className="mt-4">
            <label className="text-sm font-medium text-warm-800">横幅图片</label>
            <div className="mt-2">
              <ImageUpload
                value={circle.banner}
                onChange={(file) => setBannerFile(file)}
                shape="rounded"
                size={120}
                outputSize={1920}
                placeholder={
                  <span className="text-xs text-warm-400">点击上传横幅</span>
                }
              />
            </div>
          </div>

          {/* Save button & feedback */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void handleSaveInfo();
              }}
              disabled={isSaving || !hasInfoChanges}
              className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "保存中..." : "保存设置"}
            </button>

            {saveSuccess && (
              <span className="text-sm text-forest">设置已保存</span>
            )}

            {saveError && (
              <span className="text-sm text-accent-hover">{saveError}</span>
            )}
          </div>
        </section>
      )}

      {activeTab === "server" && (
        <section className="m3-surface p-4 sm:p-5">
          <CircleServerBind
            circleId={circle.id}
            boundServer={circle.server ?? null}
            onUpdate={() => void fetchCircle()}
          />
        </section>
      )}

      {activeTab === "sections" && (
        <section className="m3-surface p-4 sm:p-5">
          <CircleSectionManager circleId={circle.id} />
        </section>
      )}

      {activeTab === "members" && (
        <section className="m3-surface p-4 sm:p-5">
          <CircleMemberManager circleId={circle.id} currentUserRole={userRole} />
        </section>
      )}

      {activeTab === "bans" && (
        <section className="m3-surface p-4 sm:p-5">
          <CircleBanManager circleId={circle.id} />
        </section>
      )}
    </div>
  );
}
