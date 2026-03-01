"use client";

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

  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string>("服务器");
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
      throw new Error(detailPayload.error ?? "加载服务器信息失败");
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
      throw new Error(modpackPayload.error ?? "加载整合包列表失败");
    }

    setModpacks(modpackPayload.data ?? []);
  }, [id, session?.user?.id]);

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
          setPageError(error instanceof Error ? error.message : "加载失败，请稍后重试");
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
  }, [loadPageData, status]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      toast.error("请先选择 .mrpack 文件");
      return;
    }

    if (selectedFile.size > MAX_MRPACK_SIZE_BYTES) {
      toast.error(`整合包大小不能超过 ${MAX_MRPACK_SIZE_MB}MB`);
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
        toast.error(payload.error ?? "上传失败，请稍后重试");
        return;
      }

      toast.success("整合包上传成功");
      setSelectedFile(null);
      setVersion("");
      setLoader("");
      setGameVersion("");
      await loadPageData();
    } catch {
      toast.error("网络异常，上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <PageLoading />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  if (isForbidden) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
        无权限管理该服务器整合包，正在返回详情页...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={`/servers/${id}`} className="text-teal-600 hover:text-teal-700">
          &larr; 返回服务器详情
        </Link>
      </nav>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-slate-900">整合包管理</h1>
        <p className="mt-1 text-sm text-slate-600">服务器：{serverName}</p>
        <p className="mt-1 text-xs text-slate-500">
          仅支持 .mrpack，单文件最大 {MAX_MRPACK_SIZE_MB}MB
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleUpload} noValidate>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="modpack-file">
              整合包文件
            </label>
            <input
              id="modpack-file"
              type="file"
              accept=".mrpack"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
              }}
              className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700 hover:file:bg-slate-50"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="modpack-version">
                版本号（可选）
              </label>
              <input
                id="modpack-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-600"
                placeholder="例如 v1.0.0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="modpack-loader">
                加载器（可选）
              </label>
              <select
                id="modpack-loader"
                value={loader}
                onChange={(event) => setLoader(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-600"
              >
                <option value="">自动识别</option>
                <option value="fabric">fabric</option>
                <option value="forge">forge</option>
                <option value="neoforge">neoforge</option>
                <option value="quilt">quilt</option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="modpack-game-version"
              >
                游戏版本（可选）
              </label>
              <input
                id="modpack-game-version"
                value={gameVersion}
                onChange={(event) => setGameVersion(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-600"
                placeholder="例如 1.20.1"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? "上传中..." : "上传整合包"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">已上传版本</h2>
        {pageError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {pageError}
          </p>
        )}

        {!pageError && modpacks.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">还没有上传整合包版本。</p>
        )}

        {!pageError && modpacks.length > 0 && (
          <div className="mt-4 space-y-3">
            {modpacks.map((modpack, index) => (
              <div key={modpack.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{modpack.name}</h3>
                  {index === 0 && (
                    <span className="rounded-full border border-teal-600 px-2 py-0.5 text-xs font-medium text-teal-600">
                      最新版本
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>版本：{modpack.version ?? "--"}</span>
                  <span>加载器：{modpack.loader ?? "--"}</span>
                  <span>游戏版本：{modpack.gameVersion ?? "--"}</span>
                  <span>Mods：{modpack.modsCount}</span>
                  <span>文件大小：{formatFileSize(modpack.fileSize)}</span>
                  <span>上传时间：{formatDate(modpack.createdAt)}</span>
                </div>

                {modpack.summary && (
                  <p className="mt-2 text-sm text-slate-600">{modpack.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/modpacks/${modpack.id}/download`}
                    className="rounded-xl border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50"
                  >
                    下载
                  </a>
                  <DeleteModpackButton
                    modpackId={modpack.id}
                    modpackName={modpack.name}
                    onDeleted={(deletedId) => {
                      setModpacks((prev) => prev.filter((item) => item.id !== deletedId));
                    }}
                    className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
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
