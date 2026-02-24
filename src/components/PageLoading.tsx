"use client";

import { LoadingSpinner } from "@/components/LoadingSpinner";

interface PageLoadingProps {
  text?: string;
}

/**
 * 全页加载态。
 * 用于页面级数据加载中的统一占位。
 */
export function PageLoading({ text = "加载中..." }: PageLoadingProps) {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}
