"use client";

import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useToast } from "@/hooks/useToast";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "@/lib/markdown-editor-conversion";

const RichTextEditor = dynamic(
  () => import("./markdown-editor/RichTextEditor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[220px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-500">
        编辑器加载中...
      </div>
    ),
  },
);

type EditorMode = "rich" | "markdown";
type MarkdownMobileTab = "edit" | "preview";

export interface MarkdownEditorHandle {
  syncMarkdown: () => string;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  label?: string;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      value,
      onChange,
      label,
      maxLength,
      placeholder = "请输入内容",
      disabled = false,
      onDirtyChange,
    },
    ref,
  ) {
    const { toast } = useToast();
    const [mode, setMode] = useState<EditorMode>("rich");
    const [markdownMobileTab, setMarkdownMobileTab] = useState<MarkdownMobileTab>("edit");
    const [markdownText, setMarkdownText] = useState(value ?? "");
    const [richHtml, setRichHtml] = useState(() => markdownToEditorHtml(value ?? ""));
    const [isRichDirty, setIsRichDirty] = useState(false);
    const [isImageUploading, setIsImageUploading] = useState(false);
    const [richMarkdownLength, setRichMarkdownLength] = useState((value ?? "").length);

    const modeRef = useRef<EditorMode>(mode);
    const markdownRef = useRef(markdownText);
    const richHtmlRef = useRef(richHtml);
    const richDirtyRef = useRef(isRichDirty);
    const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const markdownImageInputRef = useRef<HTMLInputElement | null>(null);

    const setRichDirty = useCallback(
      (nextDirty: boolean) => {
        if (richDirtyRef.current === nextDirty) {
          return;
        }
        richDirtyRef.current = nextDirty;
        setIsRichDirty(nextDirty);
        onDirtyChange?.(nextDirty);
      },
      [onDirtyChange],
    );

    const syncRichToMarkdown = useCallback(() => {
      const nextMarkdown = editorHtmlToMarkdown(richHtmlRef.current);
      if (nextMarkdown !== markdownRef.current) {
        markdownRef.current = nextMarkdown;
        setMarkdownText(nextMarkdown);
        onChange(nextMarkdown);
      }
      setRichDirty(false);
      return nextMarkdown;
    }, [onChange, setRichDirty]);

    useEffect(() => {
      modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
      markdownRef.current = markdownText;
    }, [markdownText]);

    useEffect(() => {
      richHtmlRef.current = richHtml;
    }, [richHtml]);

    useEffect(() => {
      if (mode !== "rich") {
        return;
      }

      const timer = setTimeout(() => {
        const length = editorHtmlToMarkdown(richHtmlRef.current).length;
        setRichMarkdownLength(length);
      }, 300);

      return () => clearTimeout(timer);
    }, [mode, richHtml]);

    useEffect(() => {
      const nextMarkdown = value ?? "";
      if (nextMarkdown === markdownRef.current) {
        return;
      }

      const nextHtml = markdownToEditorHtml(nextMarkdown);
      markdownRef.current = nextMarkdown;
      richHtmlRef.current = nextHtml;
      setMarkdownText(nextMarkdown);
      setRichHtml(nextHtml);
      setRichDirty(false);
    }, [setRichDirty, value]);

    useImperativeHandle(
      ref,
      () => ({
        syncMarkdown: () =>
          modeRef.current === "rich" ? syncRichToMarkdown() : markdownRef.current,
      }),
      [syncRichToMarkdown],
    );

    const updateMarkdownValue = useCallback(
      (
        nextValue: string,
        selection?: {
          start: number;
          end: number;
        },
      ) => {
        if (typeof maxLength === "number" && nextValue.length > maxLength) {
          toast.error(`内容最多 ${maxLength} 字`);
          return;
        }

        markdownRef.current = nextValue;
        setMarkdownText(nextValue);
        onChange(nextValue);
        setRichDirty(false);

        if (!selection) {
          return;
        }

        requestAnimationFrame(() => {
          const textarea = markdownTextareaRef.current;
          if (!textarea) {
            return;
          }

          textarea.focus();
          textarea.setSelectionRange(selection.start, selection.end);
        });
      },
      [maxLength, onChange, setRichDirty, toast],
    );

    const uploadEditorImage = useCallback(
      async (file: File): Promise<string | null> => {
        if (disabled) {
          return null;
        }

        setIsImageUploading(true);
        try {
          const formData = new FormData();
          formData.set("image", file);

          const response = await fetch("/api/uploads/editor-image", {
            method: "POST",
            body: formData,
          });

          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            data?: { url?: string };
          } | null;

          if (!response.ok) {
            toast.error(payload?.error ?? "图片上传失败，请稍后重试");
            return null;
          }

          const uploadedUrl = payload?.data?.url;
          if (!uploadedUrl) {
            toast.error("图片上传响应无效");
            return null;
          }

          return uploadedUrl;
        } catch {
          toast.error("图片上传失败，请稍后重试");
          return null;
        } finally {
          setIsImageUploading(false);
        }
      },
      [disabled, toast],
    );

    const switchMode = (nextMode: EditorMode) => {
      if (nextMode === mode || disabled) {
        return;
      }

      if (nextMode === "markdown") {
        syncRichToMarkdown();
        setMarkdownMobileTab("edit");
      } else {
        const nextHtml = markdownToEditorHtml(markdownRef.current);
        richHtmlRef.current = nextHtml;
        setRichHtml(nextHtml);
        setRichDirty(false);
        setRichMarkdownLength(markdownRef.current.length);
      }

      setMode(nextMode);
    };

    const handleMarkdownChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      updateMarkdownValue(nextValue);
    };

    const wrapMarkdownSelection = useCallback(
      (prefix: string, suffix: string, placeholderText: string) => {
        const textarea = markdownTextareaRef.current;
        if (!textarea || disabled) {
          return;
        }

        const source = markdownRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = source.slice(start, end);
        const content = selected || placeholderText;
        const replacement = `${prefix}${content}${suffix}`;
        const nextValue = `${source.slice(0, start)}${replacement}${source.slice(end)}`;

        const selectionStart = start + prefix.length;
        const selectionEnd = selected
          ? selectionStart + selected.length
          : selectionStart + placeholderText.length;

        updateMarkdownValue(nextValue, {
          start: selectionStart,
          end: selectionEnd,
        });
      },
      [disabled, updateMarkdownValue],
    );

    const insertMarkdownLink = useCallback(() => {
      const textarea = markdownTextareaRef.current;
      if (!textarea || disabled) {
        return;
      }

      const source = markdownRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = source.slice(start, end);
      const linkText = selected || "链接文本";

      const inputUrl = window.prompt("请输入链接 URL", "https://");
      if (inputUrl === null) {
        return;
      }

      const url = inputUrl.trim();
      if (!url) {
        return;
      }

      const replacement = `[${linkText}](${url})`;
      const nextValue = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
      updateMarkdownValue(nextValue, {
        start: start + 1,
        end: start + 1 + linkText.length,
      });
    }, [disabled, updateMarkdownValue]);

    const insertMarkdownImage = useCallback(
      async (file: File) => {
        const uploadedUrl = await uploadEditorImage(file);
        if (!uploadedUrl) {
          return;
        }

        const textarea = markdownTextareaRef.current;
        const source = markdownRef.current;
        const start = textarea?.selectionStart ?? source.length;
        const end = textarea?.selectionEnd ?? source.length;
        const replacement = `![](${uploadedUrl})`;
        const nextValue = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
        const cursor = start + replacement.length;

        updateMarkdownValue(nextValue, {
          start: cursor,
          end: cursor,
        });
      },
      [updateMarkdownValue, uploadEditorImage],
    );

    const handleMarkdownImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      if (!file || disabled) {
        return;
      }

      await insertMarkdownImage(file);
    };

    const handleMarkdownKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        return;
      }

      const isModKey = event.metaKey || event.ctrlKey;
      if (!isModKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        wrapMarkdownSelection("**", "**", "粗体文本");
        return;
      }

      if (key === "i") {
        event.preventDefault();
        wrapMarkdownSelection("*", "*", "斜体文本");
        return;
      }

      if (key === "k") {
        event.preventDefault();
        insertMarkdownLink();
        return;
      }

      if (key === "`") {
        event.preventDefault();
        wrapMarkdownSelection("`", "`", "代码");
      }
    };

    const handleRichHtmlChange = (nextHtml: string) => {
      richHtmlRef.current = nextHtml;
      setRichHtml(nextHtml);
      setRichDirty(true);
    };

    return (
      <div className="space-y-2">
        {label && <p className="text-sm text-slate-700">{label}</p>}

        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => switchMode("rich")}
              disabled={disabled}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === "rich"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              富文本
            </button>
            <button
              type="button"
              onClick={() => switchMode("markdown")}
              disabled={disabled}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === "markdown"
                  ? "bg-white text-teal-700 shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              Markdown
            </button>
          </div>
          <span className="text-xs text-slate-500">
            当前模式：{mode === "rich" ? "富文本" : "Markdown"}
          </span>
        </div>

        {mode === "rich" ? (
          <RichTextEditor
            html={richHtml}
            disabled={disabled}
            placeholder={placeholder}
            onHtmlChange={handleRichHtmlChange}
            onUploadImage={uploadEditorImage}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <input
              ref={markdownImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleMarkdownImageChange}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => wrapMarkdownSelection("**", "**", "粗体文本")}
                  disabled={disabled}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  B
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => wrapMarkdownSelection("*", "*", "斜体文本")}
                  disabled={disabled}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  I
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertMarkdownLink}
                  disabled={disabled}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  链接
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => markdownImageInputRef.current?.click()}
                  disabled={disabled || isImageUploading}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isImageUploading ? "上传中..." : "图片"}
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 md:hidden">
                <button
                  type="button"
                  onClick={() => setMarkdownMobileTab("edit")}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    markdownMobileTab === "edit"
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setMarkdownMobileTab("preview")}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    markdownMobileTab === "preview"
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  预览
                </button>
              </div>
            </div>

            <div className="grid min-h-[220px] md:grid-cols-2">
              <div
                className={`${
                  markdownMobileTab === "preview" ? "hidden md:block" : "block"
                } border-b border-gray-200 md:border-b-0 md:border-r`}
              >
                <textarea
                  ref={markdownTextareaRef}
                  value={markdownText}
                  onChange={handleMarkdownChange}
                  onKeyDown={handleMarkdownKeyDown}
                  className="min-h-[220px] w-full resize-y border-0 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none"
                  placeholder={placeholder}
                  maxLength={maxLength}
                  disabled={disabled}
                />
              </div>

              <div
                className={`${markdownMobileTab === "edit" ? "hidden md:block" : "block"} bg-slate-50/70`}
              >
                <div className="border-b border-gray-200 px-4 py-2 text-xs text-slate-500">
                  预览
                </div>
                <div className="max-h-[460px] overflow-y-auto px-4 py-3">
                  {markdownText.trim() ? (
                    <MarkdownRenderer content={markdownText} />
                  ) : (
                    <p className="text-sm text-slate-500">暂无可预览内容</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {(() => {
          const displayLength = mode === "rich" ? richMarkdownLength : markdownText.length;
          const isOverLimit = typeof maxLength === "number" && displayLength > maxLength;
          return (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className={isOverLimit ? "font-medium text-red-500" : ""}>
                {maxLength ? `${displayLength}/${maxLength}` : `${displayLength} 字`}
              </span>
              {isOverLimit ? (
                <span className="font-medium text-red-500">内容超出字数限制</span>
              ) : (
                mode === "rich" &&
                isRichDirty && (
                  <span>富文本改动将在切换模式或保存时同步为 Markdown</span>
                )
              )}
            </div>
          );
        })()}
      </div>
    );
  },
);
