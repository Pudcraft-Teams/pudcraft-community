"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { DeleteModpackButton } from "@/components/DeleteModpackButton";
import { PageLoading } from "@/components/PageLoading";
import { useToast } from "@/hooks/useToast";
import type { ModpackItem, ServerDetailResponse, ServerModpackListResponse } from "@/lib/types";

interface ApiPayload {
  error?: string;
}

const MAX_MRPACK_SIZE_MB = 50;
const MAX_MRPACK_SIZE_BYTES = MAX_MRPACK_SIZE_MB * 1024 * 1024;

function toApiPayload(raw: unknown): ApiPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

// File size unit suffixes kept as ASCII-only (B / KB / MB) so they need no
// translation. The numeric formatting stays in the component.
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * 服务器整合包管理页（owner only）。
 */
export default function ServerModpacksPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, data: session } = useSession();
  const { toast } = useToast();
  const t = useTranslations("modpacks");
  const tCommon = useTranslations("servers.common");

  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string>(() => t("defaultServerName"));
  const [modpacks, setModpacks] = useState<ModpackItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [gameVersion, setGameVersion] = useState("");

  const loadPageData = useCallback(async () => {
    const detailResponse = await fetch(`/api/servers/${id}`, { cache: "no-store" });
    const detailPayload = (await detailResponse
      .json()
      .catch(() => ({}))) as Partial<ServerDetailResponse> & ApiPayload;
    if (!detailResponse.ok || !detailPayload.data) {
      throw new Error(detailPayload.error ?? t("generalLoadFailed"));
    }

    if (!session?.user?.id || detailPayload.data.ownerId !== session.user.id) {
      setIsForbidden(true);
      return;
    }

    setServerName(detailPayload.data.name);

    const modpackResponse = await fetch(`/api/servers/${id}/modpack`, { cache: "no-store" });
    const modpackPayload = (await modpackResponse
      .json()
      .catch(() => ({}))) as ServerModpackListResponse & ApiPayload;
    if (!modpackResponse.ok) {
      throw new Error(modpackPayload.error ?? t("listLoadFailed"));
    }

    setModpacks(modpackPayload.data ?? []);
  }, [id, session?.user?.id, t]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/modpacks`)}`);
    }
  }, [id, router, status]);

  useEffect(() => {
    if (!isForbidden) {
      return;
    }

    const timer = window.setTimeout(() => {
      router.replace(`/servers/${id}`);
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [id, isForbidden, router]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setPageError(null);
    setIsForbidden(false);

    void loadPageData()
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : t("generalLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadPageData, status, t]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      toast.error(t("fileRequired"));
      return;
    }

    if (selectedFile.size > MAX_MRPACK_SIZE_BYTES) {
      toast.error(t("fileTooLarge", { max: MAX_MRPACK_SIZE_MB }));
      return;
    }

    const formData = new FormData();
    formData.set("file", selectedFile);
    if (version.trim()) {
      formData.set("version", version.trim());
    }
    if (loader.trim()) {
      formData.set("loader", loader.trim());
    }
    if (gameVersion.trim()) {
      formData.set("gameVersion", gameVersion.trim());
    }

    setIsUploading(true);
    try {
      const response = await fetch(`/api/servers/${id}/modpack`, {
        method: "POST",
        body: formData,
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/modpacks`)}`);
        return;
      }
      if (response.status === 403) {
        setIsForbidden(true);
        return;
      }
      if (!response.ok) {
        toast.error(payload.error ?? t("uploadFailed"));
        return;
      }

      toast.success(t("uploadSuccess"));
      setSelectedFile(null);
      setVersion("");
      setLoader("");
      setGameVersion("");
      await loadPageData();
    } catch {
      toast.error(t("networkError"));
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <PageLoading />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-warm-400">{tCommon("redirectingToLogin")}</div>;
  }

  if (isForbidden) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-accent-hover bg-accent-hover px-4 py-3 text-sm text-accent-hover">
        {t("forbidden")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4">
      <nav className="flex items-center gap-2 text-sm text-warm-400">
        <Link href={`/servers/${id}`} className="text-accent hover:text-accent-hover">
          &larr; {t("backToDetail")}
        </Link>
      </nav>

      <section className="rounded-xl border border-warm-200 bg-surface p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("heading")}</h1>
        <p className="mt-1 text-sm text-warm-500">{t("serverLabel", { name: serverName })}</p>
        <p className="mt-1 text-xs text-warm-400">
          {t("formatHint", { max: MAX_MRPACK_SIZE_MB })}
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleUpload} noValidate>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-warm-800" htmlFor="modpack-file">
              {t("fileLabel")}
            </label>
            <input
              id="modpack-file"
              type="file"
              accept=".mrpack"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
              }}
              className="block w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 file:mr-3 file:rounded-lg file:border file:border-warm-200 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-warm-800 hover:file:bg-warm-50"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-warm-800" htmlFor="modpack-version">
                {t("versionLabel")}
              </label>
              <input
                id="modpack-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 outline-none focus:border-accent"
                placeholder={t("versionPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-800" htmlFor="modpack-loader">
                {t("loaderLabel")}
              </label>
              <select
                id="modpack-loader"
                value={loader}
                onChange={(event) => setLoader(event.target.value)}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 outline-none focus:border-accent"
              >
                <option value="">{t("loaderAuto")}</option>
                <option value="fabric">fabric</option>
                <option value="forge">forge</option>
                <option value="neoforge">neoforge</option>
                <option value="quilt">quilt</option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-warm-800"
                htmlFor="modpack-game-version"
              >
                {t("gameVersionLabel")}
              </label>
              <input
                id="modpack-game-version"
                value={gameVersion}
                onChange={(event) => setGameVersion(event.target.value)}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 outline-none focus:border-accent"
                placeholder={t("gameVersionPlaceholder")}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="rounded-xl border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? t("uploading") : t("upload")}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-warm-200 bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-warm-800">{t("uploadedHeading")}</h2>
        {pageError && (
          <p className="mt-3 rounded-xl border border-accent-hover bg-accent-hover px-3 py-2 text-sm text-accent-hover">
            {pageError}
          </p>
        )}

        {!pageError && modpacks.length === 0 && (
          <p className="mt-3 text-sm text-warm-400">{t("emptyList")}</p>
        )}

        {!pageError && modpacks.length > 0 && (
          <div className="mt-4 space-y-3">
            {modpacks.map((modpack, index) => (
              <div key={modpack.id} className="rounded-xl border border-warm-200 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-warm-800">{modpack.name}</h3>
                  {index === 0 && (
                    <span className="rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
                      {t("latestBadge")}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-500">
                  <span>{t("versionField", { value: modpack.version ?? "--" })}</span>
                  <span>{t("loaderField", { value: modpack.loader ?? "--" })}</span>
                  <span>{t("gameVersionField", { value: modpack.gameVersion ?? "--" })}</span>
                  <span>{t("modsField", { count: modpack.modsCount })}</span>
                  <span>{t("sizeField", { size: formatFileSize(modpack.fileSize) })}</span>
                  <span>{t("uploadedAtField", { time: formatDate(modpack.createdAt) })}</span>
                </div>

                {modpack.summary && (
                  <p className="mt-2 text-sm text-warm-500">{modpack.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/modpacks/${modpack.id}/download`}
                    className="rounded-xl border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
                  >
                    {t("download")}
                  </a>
                  <DeleteModpackButton
                    modpackId={modpack.id}
                    modpackName={modpack.name}
                    onDeleted={(deletedId) => {
                      setModpacks((prev) => prev.filter((item) => item.id !== deletedId));
                    }}
                    className="rounded-xl border border-accent-hover px-3 py-1.5 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-hover"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
