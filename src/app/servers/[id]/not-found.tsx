import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * 服务器详情页自定义 404。
 * 当服务器 ID 不存在时，提供友好提示和返回入口。
 */
export default async function ServerDetailNotFound() {
  const t = await getTranslations("servers.detail");

  return (
    <div className="mx-auto max-w-3xl py-16">
      <div className="m3-surface p-8 text-center">
        <p className="mb-3 text-4xl">{t("notFoundEmoji")}</p>
        <h1 className="mb-2 text-2xl font-semibold text-warm-800">{t("notFoundTitle")}</h1>
        <p className="mb-6 text-sm text-warm-600">{t("notFoundDescription")}</p>
        <Link href="/" className="m3-btn m3-btn-primary inline-flex items-center">
          {t("notFoundBackLink")}
        </Link>
      </div>
    </div>
  );
}
