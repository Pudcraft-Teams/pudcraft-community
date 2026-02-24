"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { useToast } from "@/hooks/useToast";
import { createServerSchema } from "@/lib/validation";

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
      currentSnapshot.hasIconFile !== initialSnapshot.hasIconFile
    );
  }, [
    address,
    content,
    description,
    iconFile,
    initialSnapshot,
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

    const parsed = createServerSchema.safeParse({
      name,
      address,
      port,
      version,
      tags: selectedTags.join(","),
      description,
      content,
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
      toast.error("请检查表单输入");
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

      if (mode === "edit") {
        formData.set("removeIcon", String(removeCurrentIcon));
      }

      if (iconFile) {
        formData.set("icon", iconFile);
      }

      const result = await onSubmit(formData);
      if (!result.success) {
        toast.error(result.error ?? "提交失败，请稍后重试");
        if (result.warning) {
          toast.error(result.warning);
        }
      }
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitButtonText =
    mode === "create"
      ? isSubmitting
        ? "提交中..."
        : "提交服务器"
      : isSubmitting
        ? "保存中..."
        : "保存修改";

  return (
    <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
      <fieldset disabled={isSubmitting} className="space-y-5 disabled:opacity-90">
        <label className="block text-sm text-slate-700">
          服务器名称
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="m3-input mt-2 w-full"
            placeholder="例如：PudCraft 生存服"
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-400">{fieldErrors.name}</p>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            服务器地址
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="m3-input mt-2 w-full"
              placeholder="play.example.com"
            />
            {fieldErrors.address && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.address}</p>
            )}
          </label>

          <label className="block text-sm text-slate-700">
            端口
            <input
              type="number"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              className="m3-input mt-2 w-full"
              min={1}
              max={65535}
            />
            {fieldErrors.port && <p className="mt-1 text-xs text-red-400">{fieldErrors.port}</p>}
          </label>
        </div>

        <label className="block text-sm text-slate-700">
          游戏版本
          <input
            type="text"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            className="m3-input mt-2 w-full"
            placeholder="例如：1.20.4"
          />
          {fieldErrors.version && <p className="mt-1 text-xs text-red-400">{fieldErrors.version}</p>}
        </label>

        <div>
          <p className="text-sm text-slate-700">服务器类型</p>
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
          {fieldErrors.tags && <p className="mt-1 text-xs text-red-400">{fieldErrors.tags}</p>}
        </div>

        <label className="block text-sm text-slate-700">
          简短描述（选填）
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="m3-input mt-2 min-h-[88px] w-full"
            placeholder="显示在卡片中的简介（最多 200 字）"
            maxLength={200}
          />
          <p className="mt-1 text-xs text-slate-500">{description.length}/200</p>
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.description}</p>
          )}
        </label>

        <label className="block text-sm text-slate-700">
          详细介绍（选填，支持 Markdown）
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="m3-input mt-2 min-h-[220px] w-full"
            placeholder="介绍玩法、规则、加入方式等（最多 10000 字）"
            maxLength={10000}
          />
          <p className="mt-1 text-xs text-slate-500">{content.length}/10000</p>
          {fieldErrors.content && <p className="mt-1 text-xs text-red-400">{fieldErrors.content}</p>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            最大玩家数（选填）
            <input
              type="number"
              value={maxPlayers}
              onChange={(event) => setMaxPlayers(event.target.value)}
              className="m3-input mt-2 w-full"
              min={1}
              max={10000}
            />
            {fieldErrors.maxPlayers && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.maxPlayers}</p>
            )}
          </label>

          <label className="block text-sm text-slate-700">
            QQ 群号（选填）
            <input
              type="text"
              value={qqGroup}
              onChange={(event) => setQqGroup(event.target.value.replace(/[^\d]/g, ""))}
              className="m3-input mt-2 w-full"
              placeholder="5-11 位数字"
            />
            {fieldErrors.qqGroup && <p className="mt-1 text-xs text-red-400">{fieldErrors.qqGroup}</p>}
          </label>
        </div>

        <div>
          <p className="text-sm text-slate-700">服务器图标（选填）</p>
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
                <div className="flex flex-col items-center gap-1 text-slate-500">
                  <span className="text-lg">+</span>
                  <span className="text-xs">点击上传服务器图标</span>
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
                className="m3-btn rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-50"
              >
                删除当前图标
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
                撤销删除图标
              </button>
            )}
          </div>

          {fieldErrors.icon && <p className="mt-1 text-xs text-red-400">{fieldErrors.icon}</p>}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href={cancelHref} className="m3-btn m3-btn-tonal">
            取消
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
