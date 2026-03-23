"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import { Pagination } from "@/components/Pagination";

interface TagItem {
  id: string;
  name: string;
  displayName: string;
  aliases: string[];
  postCount: number;
  createdAt: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminTagsPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [tags, setTags] = useState<TagItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Rename dialog state
  const [renameTag, setRenameTag] = useState<TagItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDisplayName, setRenameDisplayName] = useState("");
  const [renameAliases, setRenameAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Merge dialog state
  const [mergeSource, setMergeSource] = useState<TagItem | null>(null);
  const [mergeTargetInput, setMergeTargetInput] = useState("");
  const [mergeTargets, setMergeTargets] = useState<TagItem[]>([]);
  const [selectedMergeTarget, setSelectedMergeTarget] = useState<TagItem | null>(null);
  const [mergeSaving, setMergeSaving] = useState(false);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/tags?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        tags: TagItem[];
        total: number;
        page: number;
        totalPages: number;
      };
      setTags(json.tags);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch {
      toast.error("加载话题列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  // ─── Rename / Edit ──────────────────────────

  const openRename = (tag: TagItem) => {
    setRenameTag(tag);
    setRenameName(tag.name);
    setRenameDisplayName(tag.displayName);
    setRenameAliases([...tag.aliases]);
    setNewAlias("");
  };

  const closeRename = () => {
    setRenameTag(null);
  };

  const handleAddAlias = () => {
    const alias = newAlias.trim();
    if (!alias) return;
    if (renameAliases.includes(alias)) {
      toast.error("该别名已存在");
      return;
    }
    setRenameAliases((prev) => [...prev, alias]);
    setNewAlias("");
  };

  const handleRemoveAlias = (alias: string) => {
    setRenameAliases((prev) => prev.filter((a) => a !== alias));
  };

  const handleSaveRename = async () => {
    if (!renameTag) return;

    const name = renameName.trim().toLowerCase();
    const displayName = renameDisplayName.trim();

    if (!name) {
      toast.error("归一化名称不能为空");
      return;
    }
    if (!displayName) {
      toast.error("显示名称不能为空");
      return;
    }

    setRenameSaving(true);
    try {
      const res = await fetch(`/api/admin/tags/${renameTag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName, aliases: renameAliases }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "保存失败");
      }

      toast.success("更新成功");
      closeRename();
      await fetchTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setRenameSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────

  const handleDelete = async (tag: TagItem) => {
    const ok = await confirm({
      title: "删除确认",
      message: `确定要删除话题「${tag.displayName}」吗？此操作不可恢复，帖子中的 # 标签文本不会被移除。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) {
      return;
    }

    setActionLoading(tag.id);
    try {
      const res = await fetch(`/api/admin/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "删除失败");
      }
      toast.success("已删除");
      await fetchTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Merge ──────────────────────────────────

  const openMerge = (tag: TagItem) => {
    setMergeSource(tag);
    setMergeTargetInput("");
    setMergeTargets([]);
    setSelectedMergeTarget(null);
  };

  const closeMerge = () => {
    setMergeSource(null);
  };

  const searchMergeTargets = async (query: string) => {
    setMergeTargetInput(query);
    setSelectedMergeTarget(null);

    if (query.trim().length < 1) {
      setMergeTargets([]);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("search", query.trim());
      params.set("limit", "10");

      const res = await fetch(`/api/admin/tags?${params.toString()}`);
      if (!res.ok) return;

      const json = (await res.json()) as { tags: TagItem[] };
      // Filter out the source tag
      setMergeTargets(json.tags.filter((t) => t.id !== mergeSource?.id));
    } catch {
      // Silently ignore search errors
    }
  };

  const handleMerge = async () => {
    if (!mergeSource || !selectedMergeTarget) return;

    setMergeSaving(true);
    try {
      const res = await fetch("/api/admin/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: mergeSource.id,
          targetId: selectedMergeTarget.id,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "合并失败");
      }

      toast.success(`已将「${mergeSource.displayName}」合并到「${selectedMergeTarget.displayName}」`);
      closeMerge();
      await fetchTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "合并失败");
    } finally {
      setMergeSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-warm-700">话题管理</h1>
        <p className="mt-1 text-sm text-warm-500">共 {total} 个话题</p>
      </div>

      {/* Search */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="搜索话题名称..."
          className="m3-input flex-1"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
        >
          搜索
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setPage(1);
            }}
            className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
          >
            清除
          </button>
        )}
      </div>

      {isLoading ? (
        <PageLoading />
      ) : tags.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">
          {search ? "未找到匹配的话题" : "暂无话题"}
        </div>
      ) : (
        <>
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-3 py-2">话题</th>
                  <th className="px-3 py-2">归一化名称</th>
                  <th className="hidden px-3 py-2 md:table-cell">别名</th>
                  <th className="px-3 py-2 text-right">帖子数</th>
                  <th className="hidden px-3 py-2 lg:table-cell">创建时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr
                    key={tag.id}
                    className="border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openRename(tag)}
                        className="font-medium text-warm-700 underline decoration-warm-300 underline-offset-2 transition-colors hover:text-teal-600 hover:decoration-teal-600"
                        title="点击编辑"
                      >
                        {tag.displayName}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-warm-100 px-1.5 py-0.5 text-xs text-warm-600">
                        {tag.name}
                      </code>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {tag.aliases.length > 0 ? (
                          tag.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="inline-block rounded-full bg-warm-50 px-2 py-0.5 text-xs text-warm-500 ring-1 ring-warm-200"
                            >
                              {alias}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-warm-400">--</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-warm-600">
                      {tag.postCount}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-warm-500 lg:table-cell">
                      {formatDate(tag.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openRename(tag)}
                          className="rounded bg-warm-50 px-2 py-1 text-xs font-medium text-warm-700 transition-colors hover:bg-warm-100"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => openMerge(tag)}
                          className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                        >
                          合并
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === tag.id}
                          onClick={() => handleDelete(tag)}
                          className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral-hover transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* Rename / Edit Dialog */}
      {renameTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-warm-900/50" onClick={closeRename} />
          <div className="relative z-10 m3-surface w-full max-w-md p-6">
            <h2 className="mb-4 text-lg font-semibold text-warm-700">
              编辑话题
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="rename-display" className="mb-1 block text-sm font-medium text-warm-700">
                  显示名称
                </label>
                <input
                  id="rename-display"
                  type="text"
                  value={renameDisplayName}
                  onChange={(e) => setRenameDisplayName(e.target.value)}
                  className="m3-input w-full"
                  maxLength={50}
                />
              </div>

              <div>
                <label htmlFor="rename-name" className="mb-1 block text-sm font-medium text-warm-700">
                  归一化名称
                </label>
                <input
                  id="rename-name"
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value.toLowerCase())}
                  className="m3-input w-full"
                  maxLength={50}
                />
                <p className="mt-1 text-xs text-warm-400">
                  修改后旧名称会自动加入别名
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-warm-700">
                  别名
                </label>
                <div className="mb-2 flex flex-wrap gap-1">
                  {renameAliases.map((alias) => (
                    <span
                      key={alias}
                      className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-2 py-0.5 text-xs text-warm-600 ring-1 ring-warm-200"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(alias)}
                        className="text-warm-400 transition-colors hover:text-coral-hover"
                        aria-label={`移除别名 ${alias}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  {renameAliases.length === 0 && (
                    <span className="text-xs text-warm-400">暂无别名</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddAlias();
                      }
                    }}
                    placeholder="添加别名..."
                    className="m3-input flex-1"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={handleAddAlias}
                    className="m3-btn m3-btn-tonal px-3 py-1.5 text-sm"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRename}
                className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                disabled={renameSaving}
                className="m3-btn m3-btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {renameSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Dialog */}
      {mergeSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-warm-900/50" onClick={closeMerge} />
          <div className="relative z-10 m3-surface w-full max-w-md p-6">
            <h2 className="mb-4 text-lg font-semibold text-warm-700">
              合并话题
            </h2>

            <p className="mb-4 text-sm text-warm-600">
              将「<strong>{mergeSource.displayName}</strong>」（{mergeSource.postCount} 篇帖子）合并到目标话题。
              合并后源话题将被删除，其帖子关联转移到目标话题。
            </p>

            <div>
              <label htmlFor="merge-target" className="mb-1 block text-sm font-medium text-warm-700">
                合并到
              </label>
              <input
                id="merge-target"
                type="text"
                value={mergeTargetInput}
                onChange={(e) => searchMergeTargets(e.target.value)}
                placeholder="搜索目标话题..."
                className="m3-input w-full"
              />

              {mergeTargets.length > 0 && !selectedMergeTarget && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-warm-200 bg-white">
                  {mergeTargets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedMergeTarget(t);
                        setMergeTargetInput(t.displayName);
                        setMergeTargets([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-warm-700 transition-colors hover:bg-warm-50"
                    >
                      <span className="font-medium">{t.displayName}</span>
                      <span className="ml-2 text-xs text-warm-400">
                        ({t.name} / {t.postCount} 篇)
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {selectedMergeTarget && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">
                  <span>目标：{selectedMergeTarget.displayName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMergeTarget(null);
                      setMergeTargetInput("");
                    }}
                    className="text-teal-500 hover:text-teal-700"
                  >
                    x
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMerge}
                className="m3-btn m3-btn-tonal px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={mergeSaving || !selectedMergeTarget}
                className="m3-btn m3-btn-danger px-4 py-2 text-sm disabled:opacity-50"
              >
                {mergeSaving ? "合并中..." : "确认合并"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
