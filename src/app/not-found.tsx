import Link from "next/link";

/**
 * 全局 404 页面。
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-teal-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">页面不存在</h1>
      <p className="mt-3 text-sm text-slate-600">你访问的链接可能已失效，或页面已被移动。</p>
      <Link href="/" className="m3-btn m3-btn-primary mt-6">
        返回首页
      </Link>
    </div>
  );
}
