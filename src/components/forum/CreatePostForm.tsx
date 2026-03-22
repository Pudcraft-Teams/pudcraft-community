"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";

import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import type { SectionItem, CircleItem } from "@/lib/types";

interface CreatePostFormProps {
  circleId?: string;
  circleName?: string;
  circleSlug?: string;
  sections?: SectionItem[];
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

/**
 * Post creation form.
 * Supports posting to a specific circle (with optional section) or to the public square.
 * When no circleId is provided, shows a circle selector.
 */
export function CreatePostForm({
  circleId: initialCircleId,
  circleName,
  circleSlug,
  sections: initialSections,
}: CreatePostFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();
  const { toast } = useToast();
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // ── Form state ──
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(
    initialCircleId ?? null,
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  // ── Circle selector state (when no circleId provided) ──
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

  // ── Fetch user's circles (when no circleId prop) ──
  useEffect(() => {
    if (initialCircleId || sessionStatus !== "authenticated") return;

    let cancelled = false;

    async function fetchCircles() {
      setLoadingCircles(true);
      try {
        // Fetch circles and use the membership info to identify joined circles
        const res = await fetch("/api/circles?limit=50");
        if (!res.ok) return;
        const json = (await res.json()) as {
          circles: (CircleItem & { isMember?: boolean })[];
        };
        if (cancelled) return;
        // Filter only circles user is a member of
        const joined = json.circles
          .filter((c) => c.isMember)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
        setCircleOptions(joined);
      } catch {
        // Silently fail -- user can still post to square
      } finally {
        if (!cancelled) setLoadingCircles(false);
      }
    }

    void fetchCircles();
    return () => {
      cancelled = true;
    };
  }, [initialCircleId, sessionStatus]);

  // ── Fetch sections when circle changes ──
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

  // When selected circle changes, fetch its sections
  useEffect(() => {
    if (selectedCircleId) {
      void fetchSectionsForCircle(selectedCircleId);
    } else {
      setSections([]);
      setSelectedSectionId(null);
    }
  }, [selectedCircleId, fetchSectionsForCircle]);

  // ── Handle circle selection change ──
  const handleCircleChange = (value: string) => {
    setSelectedCircleId(value === "" ? null : value);
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Sync editor content
    const finalContent = editorRef.current?.syncMarkdown() ?? content;

    if (!title.trim()) {
      toast.error("请输入标题");
      return;
    }

    if (!finalContent.trim()) {
      toast.error("请输入内容");
      return;
    }

    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: finalContent,
      };

      if (selectedCircleId) {
        body.circleId = selectedCircleId;
      }

      if (selectedSectionId) {
        body.sectionId = selectedSectionId;
      }

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

      // Redirect to the post
      const postId = json.data?.id;
      const postCircleId = json.data?.circleId;
      if (postId) {
        // Determine redirect URL
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

  // ── Auth loading ──
  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ── Circle info badge (fixed circle) ── */}
      {initialCircleId && circleName && (
        <div className="flex items-center gap-2 text-sm text-warm-500">
          <span className="rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
            {circleName}
          </span>
          <span>中发帖</span>
        </div>
      )}

      {/* ── Circle selector (no fixed circle) ── */}
      {!initialCircleId && (
        <div>
          <label
            htmlFor="circle-select"
            className="mb-1.5 block text-sm text-warm-800"
          >
            发布到
          </label>
          <select
            id="circle-select"
            value={selectedCircleId ?? ""}
            onChange={(e) => handleCircleChange(e.target.value)}
            disabled={loadingCircles}
            className="m3-input w-full"
          >
            <option value="">广场（公开）</option>
            {circleOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loadingCircles && (
            <p className="mt-1 text-xs text-warm-400">加载圈子列表...</p>
          )}
        </div>
      )}

      {/* ── Section selector ── */}
      {sections.length > 0 && (
        <div>
          <label
            htmlFor="section-select"
            className="mb-1.5 block text-sm text-warm-800"
          >
            板块
          </label>
          <select
            id="section-select"
            value={selectedSectionId ?? ""}
            onChange={(e) =>
              setSelectedSectionId(e.target.value === "" ? null : e.target.value)
            }
            disabled={loadingSections}
            className="m3-input w-full"
          >
            <option value="">不选择板块</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Title ── */}
      <div>
        <label htmlFor="post-title" className="mb-1.5 block text-sm text-warm-800">
          标题
        </label>
        <input
          id="post-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="请输入帖子标题"
          maxLength={100}
          disabled={submitting}
          className="m3-input w-full"
          autoFocus
        />
        <p className="mt-1 text-right text-xs text-warm-400">
          {title.length}/100
        </p>
      </div>

      {/* ── Content editor ── */}
      <MarkdownEditor
        ref={editorRef}
        value={content}
        onChange={setContent}
        label="内容"
        maxLength={20000}
        placeholder="请输入帖子内容..."
        disabled={submitting}
      />

      {/* ── Submit ── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="m3-btn m3-btn-tonal"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <LoadingSpinner size="sm" text="发布中..." />
          ) : (
            "发布"
          )}
        </button>
      </div>
    </form>
  );
}
