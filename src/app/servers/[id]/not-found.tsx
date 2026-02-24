import Link from "next/link";

/**
 * 服务器详情页自定义 404。
 * 当服务器 ID 不存在时，提供友好提示和返回入口。
 */
export default function ServerDetailNotFound() {
  return (
    <div className="mx-auto max-w-3xl py-16">
      <div className="m3-surface p-8 text-center">
        <p className="mb-3 text-4xl">🧭</p>
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">没有找到这个服务器</h1>
        <p className="mb-6 text-sm text-slate-600">
          可能是链接已失效，或者该服务器尚未收录。你可以先返回列表继续浏览。
        </p>
        <Link
          href="/"
          className="m3-btn m3-btn-primary inline-flex items-center"
        >
          返回服务器列表
        </Link>
      </div>
    </div>
  );
}
