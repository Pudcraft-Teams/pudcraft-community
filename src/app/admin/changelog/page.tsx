"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import type { AdminChangelogItem, ChangelogType, PaginationInfo } from "@/lib/types";

type StatusFilter = "all" | "published" | "draft";

const STATUS_TABS: { key: StatusFilter; labelKey: string }[] = [
  { key: "all", labelKey: "tabAll" },
  { key: "published", labelKey: "tabPublished" },
  { key: "draft", labelKey: "tabDraft" },
];

const TYPE_OPTIONS: { value: ChangelogType; labelKey: string }[] = [
  { value: "feature", labelKey: "typeFeature" },
  { value: "fix", labelKey: "typeFix" },
  { value: "improvement", labelKey: "typeImprovement" },
  { value: "other", labelKey: "typeOther" },
];

const TYPE_META: Record<ChangelogType, { labelKey: string; className: string }> = {
  feature: {
    labelKey: "typeFeature",
    className: "bg-coral-light text-coral-dark ring-coral/20",
  },
  fix: {
    labelKey: "typeFix",
    className: "bg-coral-light text-coral-hover ring-coral-hover/20",
  },
  improvement: {
    labelKey: "typeImprovement",
    className: "bg-forest-light text-forest-dark ring-forest/20",
  },
  other: {
    labelKey: "typeOther",
    className: "bg-warm-50 text-warm-600 ring-warm-200",
  },
};

interface EditorState {
  mode: "create" | "edit";
  id?: string;
  title: string;
  content: string;
  type: ChangelogType;
  published: boolean;
}

const EMPTY_EDITOR: EditorState = {
  mode: "create",
  title: "",
  content: "",
  type: "feature",
  published: false,
};

export default function AdminChangelogPage() {
  const t = useTranslations("admin.changelog");
  const confirm = useConfirm();
  const { toast } = useToast();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [items, setItems] = useState<AdminChangelogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

  const formatTimeAgo = useCallback(
    (dateStr: string): string => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 60) return t("timeAgoMinutes", { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("timeAgoHours", { count: hours });
      const days = Math.floor(hours / 24);
      return t("timeAgoDays", { count: days });
    },
    [t],
  );

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("published", filter);

      const res = await fetch(`/api/admin/changelog?${params.toString()}`);
      if (!res.ok) throw new Error(t("loadFailed"));

      const json = (await res.json()) as {
        data: AdminChangelogItem[];
        pagination: PaginationInfo;
      };
      setItems(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error(t("loadListFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, toast, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreate = () => {
    setEditor(EMPTY_EDITOR);
    setShowEditor(true);
  };

  const openEdit = (item: AdminChangelogItem) => {
    setEditor({
      mode: "edit",
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type,
      published: item.published,
    });
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditor(EMPTY_EDITOR);
  };

  const handleSave = async () => {
    // Sync the rich-text editor content back to markdown
    const syncedContent = editorRef.current?.syncMarkdown() ?? editor.content;
    const title = editor.title.trim();
    const content = syncedContent.trim();

    if (!title) {
      toast.error(t("titleRequired"));
      return;
    }
    if (!content) {
      toast.error(t("contentRequired"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        content,
        type: editor.type,
        published: editor.published,
      };

      const url =
        editor.mode === "create"
          ? "/api/admin/changelog"
          : `/api/admin/changelog/${editor.id}`;
      const method = editor.mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("saveFailed"));
      }

      toast.success(editor.mode === "create" ? t("createSuccess") : t("updateSuccess"));
      closeEditor();
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublished = async (item: AdminChangelogItem) => {
    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/admin/changelog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !item.published }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(item.published ? t("unpublishSuccess") : t("publishSuccess"));
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (item: AdminChangelogItem) => {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { title: item.title }),
      confirmText: t("deleteConfirmAction"),
      danger: true,
    });
    if (!ok) {
      return;
    }

    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/admin/changelog/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("deleteFailed"));
      }
      toast.success(t("deleteSuccess"));
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  // Editor view
  if (showEditor) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-warm-700">
            {editor.mode === "create" ? t("createHeading") : t("editHeading")}
          </h1>
          <button
            type="button"
            onClick={closeEditor}
            className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
          >
            {t("backToList")}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="changelog-title" className="mb-1 block text-sm font-medium text-warm-700">
              {t("titleLabel")}
            </label>
            <input
              id="changelog-title"
              type="text"
              value={editor.title}
              onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t("titlePlaceholder")}
              className="m3-input w-full"
              maxLength={100}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="changelog-type" className="mb-1 block text-sm font-medium text-warm-700">
                {t("typeLabel")}
              </label>
              <select
                id="changelog-type"
                value={editor.type}
                onChange={(e) =>
                  setEditor((prev) => ({ ...prev, type: e.target.value as ChangelogType }))
                }
                className="m3-input"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-warm-700">
                <input
                  type="checkbox"
                  checked={editor.published}
                  onChange={(e) =>
                    setEditor((prev) => ({ ...prev, published: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-warm-300 text-coral focus:ring-coral"
                />
                {t("publishNow")}
              </label>
            </div>
          </div>

          <MarkdownEditor
            ref={editorRef}
            value={editor.content}
            onChange={(content) => setEditor((prev) => ({ ...prev, content }))}
            label={t("contentLabel")}
            maxLength={20000}
            placeholder={t("contentPlaceholder")}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="m3-btn m3-btn-primary px-6 py-2 text-sm disabled:opacity-50"
            >
              {saving ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="m3-btn m3-btn-tonal px-6 py-2 text-sm"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-warm-700">{t("listHeading")}</h1>
        <button
          type="button"
          onClick={openCreate}
          className="m3-btn m3-btn-primary px-4 py-2 text-sm"
        >
          {t("newAction")}
        </button>
      </div>

      {/* Status filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={`m3-chip text-sm ${filter === tab.key ? "m3-chip-active" : ""}`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">{t("empty")}</div>
      ) : (
        <>
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">{t("colTitle")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t("colType")}</th>
                  <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {t("colAuthor")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    {t("colCreatedAt")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const typeInfo = TYPE_META[item.type];
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="max-w-48 truncate font-medium text-warm-700 underline decoration-warm-300 underline-offset-2 transition-colors hover:text-coral hover:decoration-coral"
                          title={t("editTooltip")}
                        >
                          {item.title}
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${typeInfo.className}`}
                        >
                          {t(typeInfo.labelKey)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.published ? (
                          <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                            {t("statusPublished")}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-warm-50 px-2 py-0.5 text-xs font-medium text-warm-600 ring-1 ring-warm-200">
                            {t("statusDraft")}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                        {item.authorName || "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-warm-500 lg:table-cell">
                        {formatTimeAgo(item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded bg-warm-50 px-2 py-1 text-xs font-medium text-warm-700 transition-colors hover:bg-warm-100"
                          >
                            {t("actionEdit")}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === item.id}
                            onClick={() => handleTogglePublished(item)}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              item.published
                                ? "bg-coral-amber/10 text-coral-amber hover:bg-coral-amber/20"
                                : "bg-forest-light text-forest-dark hover:bg-forest-light/80"
                            }`}
                          >
                            {item.published ? t("actionUnpublish") : t("actionPublish")}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === item.id}
                            onClick={() => handleDelete(item)}
                            className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral-hover transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                          >
                            {t("actionDelete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
              <span>
                {t("paginationSummary", {
                  total: pagination.total,
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  {t("paginationPrev")}
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  {t("paginationNext")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
