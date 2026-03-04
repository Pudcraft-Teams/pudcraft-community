"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";
import type { AdminChangelogItem, ChangelogType, PaginationInfo } from "@/lib/types";

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "published", label: "已发布" },
  { key: "draft", label: "草稿" },
] as const;

const TYPE_OPTIONS: { value: ChangelogType; label: string }[] = [
  { value: "feature", label: "新功能" },
  { value: "fix", label: "修复" },
  { value: "improvement", label: "优化" },
  { value: "other", label: "其他" },
];

const TYPE_LABELS: Record<ChangelogType, { label: string; className: string }> = {
  feature: { label: "新功能", className: "bg-teal-50 text-teal-700 ring-teal-200" },
  fix: { label: "修复", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  improvement: { label: "优化", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  other: { label: "其他", className: "bg-slate-50 text-slate-600 ring-slate-200" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

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
  const { toast } = useToast();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [items, setItems] = useState<AdminChangelogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 编辑器状态
  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("published", filter);

      const res = await fetch(`/api/admin/changelog?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        data: AdminChangelogItem[];
        pagination: PaginationInfo;
      };
      setItems(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error("加载更新日志失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, toast]);

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
    // 同步富文本编辑器内容到 markdown
    const syncedContent = editorRef.current?.syncMarkdown() ?? editor.content;
    const title = editor.title.trim();
    const content = syncedContent.trim();

    if (!title) {
      toast.error("请填写标题");
      return;
    }
    if (!content) {
      toast.error("请填写内容");
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
        throw new Error(json.error ?? "保存失败");
      }

      toast.success(editor.mode === "create" ? "创建成功" : "更新成功");
      closeEditor();
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
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
        throw new Error(json.error ?? "操作失败");
      }
      toast.success(item.published ? "已取消发布" : "已发布");
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (item: AdminChangelogItem) => {
    if (!window.confirm(`确定要删除「${item.title}」吗？此操作不可恢复。`)) {
      return;
    }

    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/admin/changelog/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "删除失败");
      }
      toast.success("已删除");
      await fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActionLoading(null);
    }
  };

  // 编辑器视图
  if (showEditor) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {editor.mode === "create" ? "新建更新日志" : "编辑更新日志"}
          </h1>
          <button
            type="button"
            onClick={closeEditor}
            className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
          >
            返回列表
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="changelog-title" className="mb-1 block text-sm font-medium text-slate-700">
              标题
            </label>
            <input
              id="changelog-title"
              type="text"
              value={editor.title}
              onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="更新日志标题"
              className="m3-input w-full"
              maxLength={100}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="changelog-type" className="mb-1 block text-sm font-medium text-slate-700">
                类型
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
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editor.published}
                  onChange={(e) =>
                    setEditor((prev) => ({ ...prev, published: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                立即发布
              </label>
            </div>
          </div>

          <MarkdownEditor
            ref={editorRef}
            value={editor.content}
            onChange={(content) => setEditor((prev) => ({ ...prev, content }))}
            label="内容"
            maxLength={20000}
            placeholder="请输入更新日志内容（支持 Markdown）"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="m3-btn m3-btn-primary px-6 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="m3-btn m3-btn-tonal px-6 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">更新日志管理</h1>
        <button
          type="button"
          onClick={openCreate}
          className="m3-btn m3-btn-primary px-4 py-2 text-sm"
        >
          新建日志
        </button>
      </div>

      {/* 状态筛选 */}
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
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">暂无数据</div>
      ) : (
        <>
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">标题</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">类型</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">作者</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">创建时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const typeInfo = TYPE_LABELS[item.type];
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="max-w-48 truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-teal-700 hover:decoration-teal-400"
                          title="点击编辑"
                        >
                          {item.title}
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${typeInfo.className}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.published ? (
                          <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            已发布
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            草稿
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-600 md:table-cell">
                        {item.authorName || "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                        {timeAgo(item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === item.id}
                            onClick={() => handleTogglePublished(item)}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              item.published
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {item.published ? "取消发布" : "发布"}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === item.id}
                            onClick={() => handleDelete(item)}
                            className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
