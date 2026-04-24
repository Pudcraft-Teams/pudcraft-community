"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import type { ChangelogItem, ChangelogType, PaginationInfo } from "@/lib/types";

const TYPE_CLASS_NAMES: Record<ChangelogType, string> = {
  feature: "bg-accent-muted text-accent-dark ring-accent/20",
  fix: "bg-accent-hover/10 text-accent-hover ring-accent-hover/20",
  improvement: "bg-sky-50 text-sky-700 ring-sky-200",
  other: "bg-warm-50 text-warm-500 ring-warm-200",
};

const TYPE_LABEL_KEY: Record<ChangelogType, string> = {
  feature: "typeFeature",
  fix: "typeFix",
  improvement: "typeImprovement",
  other: "typeOther",
};

function formatDate(dateStr: string, locale: string): string {
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(intlLocale, {
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
  const t = useTranslations("changelog");
  const locale = useLocale();
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
      <div className="py-16 text-center text-sm text-warm-400">{t("empty")}</div>
    );
  }

  return (
    <div className="space-y-0">
      {items.map((item, index) => {
        const className = TYPE_CLASS_NAMES[item.type];
        const label = t(TYPE_LABEL_KEY[item.type]);
        return (
          <div key={item.id} className="relative flex gap-4 pb-8">
            {/* Timeline rail */}
            <div className="flex flex-col items-center">
              <div className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-accent ring-4 ring-surface" />
              {index < items.length - 1 && (
                <div className="w-px flex-1 bg-warm-200" />
              )}
            </div>

            {/* Entry body */}
            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-warm-400">{formatDate(item.publishedAt, locale)}</span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${className}`}
                >
                  {label}
                </span>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-warm-800">{item.title}</h2>
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
            {isLoading ? t("loadingMore") : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
