"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PostTextarea } from "@/components/forum/PostTextarea";
import type { PostTextareaHandle } from "@/components/forum/PostTextarea";
import { UserAvatar } from "@/components/UserAvatar";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import { normalizeImageSrc } from "@/lib/image-url";

import type { SectionItem, CircleItem } from "@/lib/types";

interface CreatePostFormProps {
  circleId?: string;
  circleName?: string;
  circleSlug?: string;
  sections?: SectionItem[];
  onSuccess?: () => void;
}

interface CircleOption {
  id: string;
  name: string;
  slug: string;
}

interface PostCreateResponse {
  success?: boolean;
  error?: string;
  data?: {
    id: string;
    circleId: string | null;
  };
}

export function CreatePostForm({
  circleId: initialCircleId,
  circleName,
  circleSlug,
  sections: initialSections,
  onSuccess,
}: CreatePostFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();

  // ── Form state ──
  const [title, setTitle] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [content, setContent] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(
    initialCircleId ?? null,
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<PostTextareaHandle>(null);

  // ── Circle selector state ──
  const [circleOptions, setCircleOptions] = useState<CircleOption[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(false);
  const [sections, setSections] = useState<SectionItem[]>(
    initialSections ?? [],
  );
  const [loadingSections, setLoadingSections] = useState(false);

  // ── Auth guard ──
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(pathname ?? "/new")}`,
      );
    }
  }, [sessionStatus, router, pathname]);

  // ── Fetch user's circles ──
  useEffect(() => {
    if (initialCircleId || sessionStatus !== "authenticated") return;

    let cancelled = false;

    async function fetchCircles() {
      setLoadingCircles(true);
      try {
        const res = await fetch("/api/circles?limit=50");
        if (!res.ok) return;
        const json = (await res.json()) as {
          circles: (CircleItem & { isMember?: boolean })[];
        };
        if (cancelled) return;
        const joined = json.circles
          .filter((c) => c.isMember)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
        setCircleOptions(joined);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoadingCircles(false);
      }
    }

    void fetchCircles();
    return () => {
      cancelled = true;
    };
  }, [initialCircleId, sessionStatus]);

  // ── Fetch sections ──
  const fetchSectionsForCircle = useCallback(
    async (circleId: string) => {
      if (initialSections && circleId === initialCircleId) {
        setSections(initialSections);
        return;
      }

      setLoadingSections(true);
      setSelectedSectionId(null);
      try {
        const res = await fetch(`/api/circles/${circleId}/sections`);
        if (!res.ok) {
          setSections([]);
          return;
        }
        const json = (await res.json()) as { sections: SectionItem[] };
        setSections(json.sections);
      } catch {
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    },
    [initialCircleId, initialSections],
  );

  useEffect(() => {
    if (selectedCircleId) {
      void fetchSectionsForCircle(selectedCircleId);
    } else {
      setSections([]);
      setSelectedSectionId(null);
    }
  }, [selectedCircleId, fetchSectionsForCircle]);

  // ── Image upload ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const res = await fetch("/api/uploads/editor-image", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        data?: { url: string };
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "图片上传失败");
        return;
      }
      if (json.data?.url) {
        setImages((prev) => [...prev, json.data!.url]);
      }
    } catch {
      toast.error("网络异常，图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!content.trim()) {
      toast.error("请输入内容");
      return;
    }

    setSubmitting(true);

    try {
      const tagPattern =
        /#([\w\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+)/g;
      const tagSet = new Set<string>();
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagPattern.exec(content.trim())) !== null) {
        tagSet.add(tagMatch[1]!);
        if (tagSet.size >= 5) break;
      }

      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        tags: [...tagSet],
        images,
      };

      if (selectedCircleId) body.circleId = selectedCircleId;
      if (selectedSectionId) body.sectionId = selectedSectionId;

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as PostCreateResponse;

      if (!res.ok) {
        toast.error(json.error ?? "发帖失败，请稍后重试");
        return;
      }

      toast.success("发帖成功");
      onSuccess?.();

      const postId = json.data?.id;
      const postCircleId = json.data?.circleId;
      if (postId) {
        const targetSlug =
          circleSlug ??
          circleOptions.find((c) => c.id === postCircleId)?.slug;
        if (targetSlug) {
          router.push(`/c/${targetSlug}/post/${postId}`);
        } else {
          router.push(`/post/${postId}`);
        }
      } else {
        router.push("/");
      }
    } catch {
      toast.error("网络异常，发帖失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / Auth states ──
  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="lg" text="加载中..." />
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="py-12 text-center text-sm text-warm-400">
        正在跳转到登录页...
      </div>
    );
  }

  const currentTarget = initialCircleId
    ? circleName
    : selectedCircleId
      ? circleOptions.find((c) => c.id === selectedCircleId)?.name
      : null;

  const charCount = content.length;
  const canSubmit = content.trim().length > 0 && !submitting && !uploading;

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-3">
        {/* ── Avatar ── */}
        <div className="hidden shrink-0 pt-1 sm:block">
          <UserAvatar
            src={session?.user?.image}
            name={session?.user?.name}
            email={session?.user?.email}
            className="h-10 w-10"
          />
        </div>

        {/* ── Compose area ── */}
        <div className="min-w-0 flex-1">
          {/* Target selector */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {!initialCircleId ? (
              <select
                value={selectedCircleId ?? ""}
                onChange={(e) =>
                  setSelectedCircleId(e.target.value === "" ? null : e.target.value)
                }
                disabled={loadingCircles}
                className="rounded-full border border-accent/30 bg-transparent px-3 py-1 text-xs font-medium text-accent outline-none transition-colors hover:border-accent focus:border-accent focus:ring-1 focus:ring-accent/20"
              >
                <option value="">广场</option>
                {circleOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-full border border-accent/30 px-3 py-1 text-xs font-medium text-accent">
                {circleName}
              </span>
            )}

            {sections.length > 0 && (
              <select
                value={selectedSectionId ?? ""}
                onChange={(e) =>
                  setSelectedSectionId(
                    e.target.value === "" ? null : e.target.value,
                  )
                }
                disabled={loadingSections}
                className="rounded-full border border-warm-300 bg-transparent px-3 py-1 text-xs text-warm-600 outline-none transition-colors hover:border-warm-400 focus:border-accent focus:ring-1 focus:ring-accent/20"
              >
                <option value="">不选板块</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Optional title */}
          {showTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（选填）"
              maxLength={100}
              disabled={submitting}
              className="mb-1 w-full border-none bg-transparent text-lg font-semibold text-warm-800 placeholder:text-warm-300 focus:outline-none"
              autoFocus
            />
          ) : null}

          {/* Content textarea */}
          <PostTextarea
            ref={textareaRef}
            value={content}
            onChange={setContent}
            placeholder={currentTarget ? `在「${currentTarget}」说点什么...` : "有什么新鲜事？"}
            maxLength={20000}
            disabled={submitting}
          />

          {/* Image previews */}
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {images.map((url, i) => (
                <div
                  key={i}
                  className="group relative h-20 w-20 overflow-hidden rounded-lg border border-warm-200 sm:h-24 sm:w-24"
                >
                  <Image
                    src={normalizeImageSrc(url) || url}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-warm-900/70 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Toolbar ── */}
          <div className="mt-3 flex items-center border-t border-warm-100 pt-3">
            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Image upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleImageUpload}
                disabled={uploading || submitting}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || submitting || images.length >= 9}
                className="rounded-full p-2 text-accent transition-colors hover:bg-accent-muted disabled:text-warm-300 disabled:hover:bg-transparent"
                title={`添加图片 (${images.length}/9)`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-4.97-4.969a.75.75 0 0 0-1.06 0L2.5 11.06ZM12.75 7a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Toggle title */}
              <button
                type="button"
                onClick={() => setShowTitle((v) => !v)}
                className={`rounded-full p-2 transition-colors hover:bg-accent-muted ${
                  showTitle ? "text-accent" : "text-warm-400"
                }`}
                title={showTitle ? "隐藏标题" : "添加标题"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M2 3.75A.75.75 0 0 1 2.75 3h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.167a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Zm0 4.166a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm0 4.167a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Hashtag */}
              <button
                type="button"
                onClick={() => textareaRef.current?.insertTrigger("#")}
                disabled={submitting}
                className="rounded-full p-2 text-warm-400 transition-colors hover:bg-accent-muted hover:text-accent disabled:text-warm-300"
                title="添加话题 #"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M9.493 2.852a.75.75 0 0 0-1.486-.204L7.545 6H4.198a.75.75 0 0 0 0 1.5h3.14l-.69 5H3.302a.75.75 0 0 0 0 1.5h3.14l-.462 3.352a.75.75 0 0 0 1.486.204L7.93 14.5h4.574l-.462 3.352a.75.75 0 0 0 1.486.204L13.99 14.5h3.312a.75.75 0 0 0 0-1.5h-3.106l.69-5h3.346a.75.75 0 0 0 0-1.5h-3.14l.462-3.352a.75.75 0 0 0-1.486-.204L13.577 6H9.003l.462-3.148ZM8.796 7.5l-.69 5h4.574l.69-5H8.796Z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Mention */}
              <button
                type="button"
                onClick={() => textareaRef.current?.insertTrigger("@")}
                disabled={submitting}
                className="rounded-full p-2 text-warm-400 transition-colors hover:bg-accent-muted hover:text-accent disabled:text-warm-300"
                title="提及用户 @"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M5.404 14.596A6.5 6.5 0 1 1 16.5 10a1.25 1.25 0 0 1-2.5 0 4 4 0 1 0-.571 2.06A2.75 2.75 0 0 0 18 10a8 8 0 1 0-2.343 5.657.75.75 0 0 0-1.06-1.06 6.5 6.5 0 0 1-9.193 0ZM10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" clipRule="evenodd" />
                </svg>
              </button>

              {uploading && (
                <span className="ml-1 text-xs text-warm-400">上传中...</span>
              )}
            </div>

            {/* Right: char count + submit */}
            <div className="ml-auto flex items-center gap-3">
              <span
                className={`text-xs tabular-nums ${
                  charCount > 19000
                    ? charCount > 19800
                      ? "text-red-500"
                      : "text-yellow-500"
                    : "text-warm-400"
                }`}
              >
                {charCount > 0 ? `${charCount}/20000` : ""}
              </span>

              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "发布中..." : "发布"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
