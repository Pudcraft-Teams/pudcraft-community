"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { MarkdownEditor, type MarkdownEditorHandle } from "@/components/MarkdownEditor";
import { useToast } from "@/hooks/useToast";
import { isPrivateServersEnabled } from "@/lib/features";
import { createServerSchema } from "@/lib/validation";

// NOTE: Tag values are stored verbatim (Chinese) because they are persisted
// and filtered on by their literal string. The display-only tagNames keys
// allow future locales to relabel the UI while keeping the storage format.
const SERVER_TAGS = [
  "生存",
  "创造",
  "RPG",
  "PVP",
  "小游戏",
  "模组",
  "空岛",
  "原版",
  "基岩版",
] as const;

interface ServerFormErrors {
  name?: string;
  address?: string;
  port?: string;
  version?: string;
  tags?: string;
  description?: string;
  content?: string;
  maxPlayers?: string;
  qqGroup?: string;
  icon?: string;
}

export interface ServerFormInitialData {
  name?: string;
  address?: string;
  port?: number;
  version?: string;
  tags?: string[];
  description?: string;
  content?: string;
  maxPlayers?: number | null;
  qqGroup?: string;
  iconUrl?: string | null;
}

export interface ServerFormSubmitResult {
  success: boolean;
  error?: string;
  warning?: string;
}

interface ServerFormProps {
  mode: "create" | "edit";
  initialData?: ServerFormInitialData;
  cancelHref: string;
  onSubmit: (formData: FormData) => Promise<ServerFormSubmitResult>;
}

interface FormSnapshot {
  name: string;
  address: string;
  port: string;
  version: string;
  tags: string;
  description: string;
  content: string;
  maxPlayers: string;
  qqGroup: string;
  removeCurrentIcon: boolean;
  hasIconFile: boolean;
  hasDirtyContent: boolean;
}

function normalizeTags(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) {
    return "";
  }

  return [...tags].sort().join(",");
}

/**
 * 服务器创建/编辑公共表单。
 * 统一处理字段输入、客户端校验、图标预览与提交态。
 */
export function ServerForm({ mode, initialData, cancelHref, onSubmit }: ServerFormProps) {
  const t = useTranslations("servers.form");
  const tCommon = useTranslations("servers.common");
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("25565");
  const [version, setVersion] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [qqGroup, setQqGroup] = useState("");
  const [currentIconUrl, setCurrentIconUrl] = useState<string | null>(null);
  const [removeCurrentIcon, setRemoveCurrentIcon] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconUploadResetKey, setIconUploadResetKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ServerFormErrors>({});
  const [isPrivate, setIsPrivate] = useState(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const contentEditorRef = useRef<MarkdownEditorHandle | null>(null);

  useEffect(() => {
    setName(initialData?.name ?? "");
    setAddress(initialData?.address ?? "");
    setPort(String(initialData?.port ?? 25565));
    setVersion(initialData?.version ?? "");
    setSelectedTags(initialData?.tags ?? []);
    setDescription(initialData?.description ?? "");
    setContent(initialData?.content ?? "");
    setMaxPlayers(
      typeof initialData?.maxPlayers === "number" ? String(initialData.maxPlayers) : "",
    );
    setQqGroup(initialData?.qqGroup ?? "");
    setCurrentIconUrl(initialData?.iconUrl ?? null);
    setRemoveCurrentIcon(false);
    setIconFile(null);
    setIconUploadResetKey((prev) => prev + 1);
    setIsContentDirty(false);
  }, [
    initialData?.address,
    initialData?.content,
    initialData?.description,
    initialData?.iconUrl,
    initialData?.maxPlayers,
    initialData?.name,
    initialData?.port,
    initialData?.qqGroup,
    initialData?.tags,
    initialData?.version,
  ]);

  const availableTags = useMemo(
    () => Array.from(new Set([...SERVER_TAGS, ...selectedTags])),
    [selectedTags],
  );

  const initialSnapshot = useMemo<FormSnapshot>(
    () => ({
      name: initialData?.name ?? "",
      address: initialData?.address ?? "",
      port: String(initialData?.port ?? 25565),
      version: initialData?.version ?? "",
      tags: normalizeTags(initialData?.tags),
      description: initialData?.description ?? "",
      content: initialData?.content ?? "",
      maxPlayers: typeof initialData?.maxPlayers === "number" ? String(initialData.maxPlayers) : "",
      qqGroup: initialData?.qqGroup ?? "",
      removeCurrentIcon: false,
      hasIconFile: false,
      hasDirtyContent: false,
    }),
    [
      initialData?.address,
      initialData?.content,
      initialData?.description,
      initialData?.maxPlayers,
      initialData?.name,
      initialData?.port,
      initialData?.qqGroup,
      initialData?.tags,
      initialData?.version,
    ],
  );

  const hasUnsavedChanges = useMemo(() => {
    const currentSnapshot: FormSnapshot = {
      name,
      address,
      port,
      version,
      tags: normalizeTags(selectedTags),
      description,
      content,
      maxPlayers,
      qqGroup,
      removeCurrentIcon,
      hasIconFile: !!iconFile,
      hasDirtyContent: isContentDirty,
    };

    return (
      currentSnapshot.name !== initialSnapshot.name ||
      currentSnapshot.address !== initialSnapshot.address ||
      currentSnapshot.port !== initialSnapshot.port ||
      currentSnapshot.version !== initialSnapshot.version ||
      currentSnapshot.tags !== initialSnapshot.tags ||
      currentSnapshot.description !== initialSnapshot.description ||
      currentSnapshot.content !== initialSnapshot.content ||
      currentSnapshot.maxPlayers !== initialSnapshot.maxPlayers ||
      currentSnapshot.qqGroup !== initialSnapshot.qqGroup ||
      currentSnapshot.removeCurrentIcon !== initialSnapshot.removeCurrentIcon ||
      currentSnapshot.hasIconFile !== initialSnapshot.hasIconFile ||
      currentSnapshot.hasDirtyContent !== initialSnapshot.hasDirtyContent
    );
  }, [
    address,
    content,
    description,
    iconFile,
    initialSnapshot,
    isContentDirty,
    maxPlayers,
    name,
    port,
    qqGroup,
    removeCurrentIcon,
    selectedTags,
    version,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || isSubmitting) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, isSubmitting]);

  const toggleTag = (tag: string) => {
    setFieldErrors((prev) => ({ ...prev, tags: undefined }));
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});

    const syncedContent = contentEditorRef.current?.syncMarkdown() ?? content;
    if (syncedContent !== content) {
      setContent(syncedContent);
    }

    const parsed = createServerSchema.safeParse({
      name,
      address,
      port,
      version,
      tags: selectedTags.join(","),
      description,
      content: syncedContent,
      maxPlayers: maxPlayers.trim() ? maxPlayers : undefined,
      qqGroup,
    });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: errors.name?.[0],
        address: errors.address?.[0],
        port: errors.port?.[0],
        version: errors.version?.[0],
        tags: errors.tags?.[0],
        description: errors.description?.[0],
        content: errors.content?.[0],
        maxPlayers: errors.maxPlayers?.[0],
        qqGroup: errors.qqGroup?.[0],
      });
      toast.error(t("formInvalid"));
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("name", parsed.data.name);
      formData.set("address", parsed.data.address);
      formData.set("port", String(parsed.data.port));
      formData.set("version", parsed.data.version);
      formData.set("tags", parsed.data.tags.join(","));
      formData.set("description", parsed.data.description?.trim() ?? "");
      formData.set("content", parsed.data.content?.trim() ?? "");

      if (typeof parsed.data.maxPlayers === "number") {
        formData.set("maxPlayers", String(parsed.data.maxPlayers));
      }

      const normalizedQqGroup = parsed.data.qqGroup?.trim();
      if (normalizedQqGroup) {
        formData.set("qqGroup", normalizedQqGroup);
      }

      if (mode === "create" && isPrivate) {
        formData.set("visibility", "private");
      }

      if (mode === "edit") {
        formData.set("removeIcon", String(removeCurrentIcon));
      }

      if (iconFile) {
        formData.set("icon", iconFile);
      }

      const result = await onSubmit(formData);
      if (!result.success) {
        toast.error(result.error ?? t("submitGenericFailed"));
        if (result.warning) {
          toast.error(result.warning);
        }
      }
    } catch {
      toast.error(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitButtonText =
    mode === "create"
      ? isSubmitting
        ? t("submitCreateSubmitting")
        : t("submitCreate")
      : isSubmitting
        ? t("submitEditSubmitting")
        : t("submitEdit");

  return (
    <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
      <fieldset disabled={isSubmitting} className="space-y-5 disabled:opacity-90">
        <label className="block text-sm text-warm-800">
          {t("nameLabel")}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="m3-input mt-2 w-full"
            placeholder={t("namePlaceholder")}
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-accent-hover">{fieldErrors.name}</p>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-warm-800">
            {t("addressLabel")}
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="m3-input mt-2 w-full"
              placeholder={t("addressPlaceholder")}
            />
            {fieldErrors.address && (
              <p className="mt-1 text-xs text-accent-hover">{fieldErrors.address}</p>
            )}
          </label>

          <label className="block text-sm text-warm-800">
            {t("portLabel")}
            <input
              type="number"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              className="m3-input mt-2 w-full"
              min={1}
              max={65535}
            />
            {fieldErrors.port && <p className="mt-1 text-xs text-accent-hover">{fieldErrors.port}</p>}
          </label>
        </div>

        <label className="block text-sm text-warm-800">
          {t("versionLabel")}
          <input
            type="text"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            className="m3-input mt-2 w-full"
            placeholder={t("versionPlaceholder")}
          />
          {fieldErrors.version && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.version}</p>
          )}
        </label>

        <div>
          <p className="text-sm text-warm-800">{t("serverTypeLabel")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`m3-chip rounded-lg px-3 py-1.5 ${active ? "m3-chip-active" : ""}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {fieldErrors.tags && <p className="mt-1 text-xs text-accent-hover">{fieldErrors.tags}</p>}
        </div>

        <label className="block text-sm text-warm-800">
          {t("descriptionLabel")}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="m3-input mt-2 min-h-[88px] w-full"
            placeholder={t("descriptionPlaceholder")}
            maxLength={200}
          />
          <p className="mt-1 text-xs text-warm-400">
            {t("descriptionCounter", { count: description.length })}
          </p>
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.description}</p>
          )}
        </label>

        <div>
          <p className="text-sm text-warm-800">{t("contentLabel")}</p>
          <div className="mt-2">
            <MarkdownEditor
              ref={contentEditorRef}
              value={content}
              onChange={setContent}
              onDirtyChange={setIsContentDirty}
              maxLength={10000}
              placeholder={t("contentPlaceholder")}
              disabled={isSubmitting}
            />
          </div>
          {fieldErrors.content && (
            <p className="mt-1 text-xs text-accent-hover">{fieldErrors.content}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-warm-800">
            {t("maxPlayersLabel")}
            <input
              type="number"
              value={maxPlayers}
              onChange={(event) => setMaxPlayers(event.target.value)}
              className="m3-input mt-2 w-full"
              min={1}
              max={10000}
            />
            {fieldErrors.maxPlayers && (
              <p className="mt-1 text-xs text-accent-hover">{fieldErrors.maxPlayers}</p>
            )}
          </label>

          <label className="block text-sm text-warm-800">
            {t("qqGroupLabel")}
            <input
              type="text"
              value={qqGroup}
              onChange={(event) => setQqGroup(event.target.value.replace(/[^\d]/g, ""))}
              className="m3-input mt-2 w-full"
              placeholder={t("qqGroupPlaceholder")}
            />
            {fieldErrors.qqGroup && (
              <p className="mt-1 text-xs text-accent-hover">{fieldErrors.qqGroup}</p>
            )}
          </label>
        </div>

        {mode === "create" && isPrivateServersEnabled() && (
          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-warm-200 bg-surface p-4 transition-colors hover:border-warm-300">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-warm-800">
                  {t("privateServerLabel")}
                </p>
                <p className="mt-0.5 text-xs text-warm-500">
                  {t("privateServerHint")}
                </p>
              </div>
            </label>
          </div>
        )}

        <div>
          <p className="text-sm text-warm-800">{t("iconLabel")}</p>
          <div className="mt-2">
            <ImageUpload
              key={`server-icon-upload-${iconUploadResetKey}`}
              value={mode === "edit" && !removeCurrentIcon ? currentIconUrl : null}
              onChange={(file) => {
                setFieldErrors((prev) => ({ ...prev, icon: undefined }));
                setIconFile(file);
                if (file) {
                  setRemoveCurrentIcon(false);
                }
              }}
              shape="rounded"
              size={96}
              outputSize={512}
              maxFileSize={10 * 1024 * 1024}
              placeholder={
                <div className="flex flex-col items-center gap-1 text-warm-400">
                  <span className="text-lg">+</span>
                  <span className="text-xs">{t("iconUploadPlaceholder")}</span>
                </div>
              }
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {mode === "edit" && currentIconUrl && !removeCurrentIcon && (
              <button
                type="button"
                onClick={() => {
                  setRemoveCurrentIcon(true);
                  setIconFile(null);
                  setIconUploadResetKey((prev) => prev + 1);
                }}
                className="m3-btn rounded-lg border border-accent-hover/30 bg-surface px-2.5 py-1 text-xs text-accent-hover transition-colors hover:bg-accent-muted"
              >
                {t("iconRemoveCurrent")}
              </button>
            )}
            {mode === "edit" && removeCurrentIcon && (
              <button
                type="button"
                onClick={() => {
                  setRemoveCurrentIcon(false);
                  setIconFile(null);
                  setIconUploadResetKey((prev) => prev + 1);
                }}
                className="m3-btn m3-btn-tonal rounded-lg px-2.5 py-1 text-xs"
              >
                {t("iconUndoRemove")}
              </button>
            )}
          </div>

          {fieldErrors.icon && <p className="mt-1 text-xs text-accent-hover">{fieldErrors.icon}</p>}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href={cancelHref} className="m3-btn m3-btn-tonal">
            {t("cancel")}
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitButtonText}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
