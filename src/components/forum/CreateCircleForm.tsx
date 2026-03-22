"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/ImageUpload";
import { useToast } from "@/hooks/useToast";
import { createCircleSchema } from "@/lib/validation";

interface FormErrors {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
}

/**
 * 从圈子名称生成 slug：小写化，空格/下划线替换为连字符，
 * 去除非法字符，合并连续连字符，去掉首尾连字符。
 */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 创建圈子表单。
 * 含名称、slug（自动生成 + 可编辑）、描述、图标上传。
 */
export function CreateCircleForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  // Slug uniqueness check
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const slugCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate slug from name (unless user has manually edited)
  useEffect(() => {
    if (!slugTouched) {
      setSlug(nameToSlug(name));
    }
  }, [name, slugTouched]);

  // Debounced slug uniqueness check
  useEffect(() => {
    if (slugCheckTimerRef.current) {
      clearTimeout(slugCheckTimerRef.current);
    }

    if (!slug || slug.length < 2) {
      setSlugStatus("idle");
      return;
    }

    setSlugStatus("checking");
    slugCheckTimerRef.current = setTimeout(() => {
      let cancelled = false;

      async function checkSlug() {
        try {
          const res = await fetch(`/api/circles/${encodeURIComponent(slug)}`);
          if (cancelled) return;

          if (res.status === 404) {
            setSlugStatus("available");
          } else if (res.ok) {
            setSlugStatus("taken");
          } else {
            // Other error, treat as idle
            setSlugStatus("idle");
          }
        } catch {
          if (!cancelled) {
            setSlugStatus("idle");
          }
        }
      }

      void checkSlug();

      return () => {
        cancelled = true;
      };
    }, 500);

    return () => {
      if (slugCheckTimerRef.current) {
        clearTimeout(slugCheckTimerRef.current);
      }
    };
  }, [slug]);

  const handleSlugChange = useCallback((value: string) => {
    setSlugTouched(true);
    setFieldErrors((prev) => ({ ...prev, slug: undefined }));
    // Normalize: only allow lowercase alphanumeric and hyphens
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    setSlug(normalized);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldErrors({});

    // Client-side validation
    const parsed = createCircleSchema.safeParse({
      name,
      slug,
      description: description.trim() || undefined,
    });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: errors.name?.[0],
        slug: errors.slug?.[0],
        description: errors.description?.[0],
      });
      toast.error("请检查表单输入");
      return;
    }

    if (slugStatus === "taken") {
      setFieldErrors((prev) => ({ ...prev, slug: "该标识已被使用" }));
      toast.error("请更换圈子标识");
      return;
    }

    setIsSubmitting(true);

    try {
      // Build JSON body
      const body: Record<string, string> = {
        name: parsed.data.name,
        slug: parsed.data.slug,
      };
      if (parsed.data.description) {
        body.description = parsed.data.description;
      }

      const res = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { slug?: string; id?: string };
        error?: string;
      };

      if (!res.ok) {
        if (res.status === 409) {
          setFieldErrors((prev) => ({ ...prev, slug: "该标识已被使用" }));
          setSlugStatus("taken");
        }
        toast.error(payload.error ?? "创建失败，请稍后重试");
        return;
      }

      // Upload icon if present (after circle is created)
      if (iconFile && payload.data?.id) {
        const formData = new FormData();
        formData.set("icon", iconFile);

        await fetch(`/api/circles/${payload.data.id}`, {
          method: "PATCH",
          body: formData,
        }).catch(() => {
          // Icon upload failure is non-blocking
          toast.error("图标上传失败，你可以稍后在圈子设置中重新上传");
        });
      }

      toast.success("圈子创建成功");
      const targetSlug = payload.data?.slug ?? slug;
      router.push(`/c/${targetSlug}`);
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <fieldset disabled={isSubmitting} className="space-y-5 disabled:opacity-90">
        {/* Name */}
        <label className="block text-sm text-warm-800">
          圈子名称
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            className="m3-input mt-2 w-full"
            placeholder="例如：红石工程师"
            maxLength={50}
          />
          <p className="mt-1 text-xs text-warm-400">{name.length}/50</p>
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.name}</p>
          )}
        </label>

        {/* Slug */}
        <label className="block text-sm text-warm-800">
          圈子标识
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-sm text-warm-400">/c/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="m3-input w-full"
              placeholder="my-circle"
              maxLength={30}
            />
          </div>
          <p className="mt-1 text-xs text-warm-400">
            2-30 个字符，仅小写字母、数字和连字符
            {slugStatus === "checking" && (
              <span className="ml-2 text-warm-500">检查中...</span>
            )}
            {slugStatus === "available" && (
              <span className="ml-2 text-forest">可以使用</span>
            )}
            {slugStatus === "taken" && (
              <span className="ml-2 text-accent-hover">已被使用</span>
            )}
          </p>
          {fieldErrors.slug && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.slug}</p>
          )}
        </label>

        {/* Description */}
        <label className="block text-sm text-warm-800">
          圈子简介（选填）
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setFieldErrors((prev) => ({ ...prev, description: undefined }));
            }}
            className="m3-input mt-2 min-h-[88px] w-full"
            placeholder="介绍这个圈子是做什么的（最多 500 字）"
            maxLength={500}
          />
          <p className="mt-1 text-xs text-warm-400">{description.length}/500</p>
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.description}</p>
          )}
        </label>

        {/* Icon */}
        <div>
          <p className="text-sm text-warm-800">圈子图标（选填）</p>
          <div className="mt-2">
            <ImageUpload
              value={null}
              onChange={(file) => {
                setFieldErrors((prev) => ({ ...prev, icon: undefined }));
                setIconFile(file);
              }}
              shape="rounded"
              size={96}
              outputSize={512}
              maxFileSize={10 * 1024 * 1024}
              placeholder={
                <div className="flex flex-col items-center gap-1 text-warm-400">
                  <span className="text-lg">+</span>
                  <span className="text-xs">点击上传圈子图标</span>
                </div>
              }
            />
          </div>
          {fieldErrors.icon && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.icon}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="m3-btn m3-btn-tonal"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "创建中..." : "创建圈子"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
