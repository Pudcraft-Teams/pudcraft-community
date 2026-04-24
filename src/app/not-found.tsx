import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-coral text-sm font-medium">{t("code")}</p>
      <h1 className="mt-2 text-2xl font-semibold text-warm-800">{t("title")}</h1>
      <p className="mt-3 text-sm text-warm-600">{t("description")}</p>
      <Link href="/" className="m3-btn m3-btn-primary mt-6">
        {t("backHome")}
      </Link>
    </div>
  );
}
