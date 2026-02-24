"use client";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 全局错误边界页面。
 */
export default function ErrorPage({ error: _error, reset }: ErrorPageProps) {
  void _error;

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">出了点问题</h1>
      <p className="mt-3 text-sm text-slate-600">请稍后重试，若问题持续可返回首页后再试。</p>
      <button type="button" onClick={reset} className="m3-btn m3-btn-primary mt-6">
        重试
      </button>
    </div>
  );
}
