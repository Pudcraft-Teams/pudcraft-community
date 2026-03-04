"use client";

import { useCallback, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import type { ChangelogItem, ChangelogType, PaginationInfo } from "@/lib/types";

const TYPE_LABELS: Record<ChangelogType, { label: string; className: string }> = {
  feature: {
    label: "新功能",
    className: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  fix: {
    label: "修复",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  improvement: {
    label: "优化",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  other: {
    label: "其他",
    className: "bg-slate-50 text-slate-600 ring-slate-200",
  },
};

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateStr));
}

interface ChangelogListProps {
  initialData: ChangelogItem[];
  initialTotal: number;
}

export function ChangelogList({ initialData, initialTotal }: ChangelogListProps) {
  const [items, setItems] = useState(initialData);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const hasMore = items.length < initialTotal;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/changelog?page=${nextPage}&limit=20`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: ChangelogItem[]; pagination: PaginationInfo };
      setItems((prev) => [...prev, ...json.data]);
      setPage(nextPage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, page]);

  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">暂无更新日志</div>
    );
  }

  return (
    <div className="space-y-0">
      {items.map((item, index) => {
        const typeInfo = TYPE_LABELS[item.type];
        return (
          <div key={item.id} className="relative flex gap-4 pb-8">
            {/* 时间线 */}
            <div className="flex flex-col items-center">
              <div className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-teal-500 ring-4 ring-white" />
              {index < items.length - 1 && (
                <div className="w-px flex-1 bg-slate-200" />
              )}
            </div>

            {/* 内容 */}
            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">{formatDate(item.publishedAt)}</span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${typeInfo.className}`}
                >
                  {typeInfo.label}
                </span>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{item.title}</h2>
              <div className="m3-surface p-4">
                <MarkdownRenderer content={item.content} />
              </div>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="m3-btn m3-btn-tonal px-6 py-2 text-sm disabled:opacity-50"
          >
            {isLoading ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}
    </div>
  );
}
