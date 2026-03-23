"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { SectionItem } from "@/lib/types";

interface CircleSectionManagerProps {
  circleId: string;
}

interface SectionsResponse {
  sections?: SectionItem[];
  error?: string;
}

function parseSectionsPayload(raw: unknown): SectionsResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    sections: Array.isArray(payload.sections) ? (payload.sections as SectionItem[]) : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 圈子板块管理组件。
 * 支持查看、添加、编辑和删除板块。
 */
export function CircleSectionManager({ circleId }: CircleSectionManagerProps) {
  const confirm = useConfirm();
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/circles/${circleId}/sections`, {
        cache: "no-store",
      });
      const payload = parseSectionsPayload(await response.json().catch(() => ({})));

      if (!response.ok) {
        throw new Error(payload.error ?? "板块列表加载失败");
      }

      setSections(payload.sections ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "板块列表加载失败";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [circleId]);

  useEffect(() => {
    void fetchSections();
  }, [fetchSections]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) {
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const response = await fetch(`/api/circles/${circleId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          sortOrder: newSortOrder,
        }),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : "添加失败";
        throw new Error(errorMessage);
      }

      setNewName("");
      setNewDescription("");
      setNewSortOrder(0);
      setShowAddForm(false);
      await fetchSections();
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : "添加失败";
      setError(message);
    } finally {
      setIsAdding(false);
    }
  }, [circleId, newName, newDescription, newSortOrder, fetchSections]);

  const handleStartEdit = useCallback((section: SectionItem) => {
    setEditingId(section.id);
    setEditName(section.name);
    setEditDescription(section.description ?? "");
    setEditSortOrder(section.sortOrder);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditSortOrder(0);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) {
      return;
    }

    setIsSavingEdit(true);
    setError(null);

    try {
      const response = await fetch(`/api/circles/${circleId}/sections/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          sortOrder: editSortOrder,
        }),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : "保存失败";
        throw new Error(errorMessage);
      }

      handleCancelEdit();
      await fetchSections();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "保存失败";
      setError(message);
    } finally {
      setIsSavingEdit(false);
    }
  }, [circleId, editingId, editName, editDescription, editSortOrder, fetchSections, handleCancelEdit]);

  const handleDelete = useCallback(
    async (sectionId: string) => {
      const confirmed = await confirm({
        title: "删除确认",
        message: "确定要删除该板块吗？板块内的帖子不会被删除。",
        confirmText: "删除",
        danger: true,
      });
      if (!confirmed) {
        return;
      }

      setDeletingId(sectionId);
      setError(null);

      try {
        const response = await fetch(`/api/circles/${circleId}/sections/${sectionId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const result: unknown = await response.json().catch(() => ({}));
          const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
          throw new Error(typeof payload.error === "string" ? payload.error : "删除失败");
        }

        await fetchSections();
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : "删除失败";
        setError(message);
      } finally {
        setDeletingId(null);
      }
    },
    [circleId, confirm, fetchSections],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-800">子板块管理</h3>
        {sections.length > 0 && (
          <span className="text-xs text-warm-500">{sections.length} 个板块</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-accent-hover/20 bg-accent-muted px-3 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center py-8">
          <LoadingSpinner text="加载板块列表..." />
        </div>
      ) : sections.length === 0 && !showAddForm ? (
        <div className="mt-4">
          <EmptyState title="暂无板块" description="还没有创建子板块" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sections.map((section) => (
            <div
              key={section.id}
              className="rounded-xl border border-warm-200 bg-surface px-4 py-3"
            >
              {editingId === section.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-warm-500">名称</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={50}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-warm-500">排序</label>
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(parseInt(e.target.value, 10) || 0)}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-warm-500">描述（选填）</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={200}
                      className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit()}
                      disabled={isSavingEdit || !editName.trim()}
                      className="m3-btn m3-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingEdit ? "保存中..." : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSavingEdit}
                      className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-warm-800">
                        {section.name}
                      </span>
                      <span className="rounded bg-warm-100 px-1.5 py-0.5 text-xs text-warm-500">
                        #{section.sortOrder}
                      </span>
                    </div>
                    {section.description && (
                      <p className="mt-0.5 truncate text-xs text-warm-500">
                        {section.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(section)}
                      className="rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-600 transition-colors hover:bg-warm-50"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(section.id)}
                      disabled={deletingId === section.id}
                      className="rounded-lg border border-accent-hover/20 bg-surface px-3 py-1.5 text-xs text-accent-hover transition-colors hover:bg-accent-muted"
                    >
                      {deletingId === section.id ? "删除中..." : "删除"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAddForm ? (
        <div className="mt-4 rounded-xl border border-warm-200 bg-surface px-4 py-3">
          <h4 className="text-sm font-medium text-warm-800">添加板块</h4>
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-warm-500">名称</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：讨论区"
                  maxLength={50}
                  className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-warm-500">排序</label>
                <input
                  type="number"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-warm-500">描述（选填）</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="板块简短描述"
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={isAdding || !newName.trim()}
                className="m3-btn m3-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAdding ? "添加中..." : "添加"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewName("");
                  setNewDescription("");
                  setNewSortOrder(0);
                }}
                disabled={isAdding}
                className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-warm-300 px-4 py-2.5 text-sm text-warm-500 transition-colors hover:border-accent hover:text-accent"
        >
          + 添加板块
        </button>
      )}
    </div>
  );
}
