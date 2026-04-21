export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/EmptyState";
import { FavoritesPageClient } from "@/components/FavoritesPageClient";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { loadUserFavoriteServers } from "@/lib/userFavorites";

export default async function FavoritesPage() {
  const t = await getTranslations("favorites.page");
  const authResult = await requireActiveUser();
  if (isActiveUserError(authResult) && authResult.response.status === 401) {
    redirect("/login?callbackUrl=%2Ffavorites");
  }

  if (isActiveUserError(authResult)) {
    return (
      <EmptyState
        title={t("bannedTitle")}
        description={t("bannedDescription")}
      />
    );
  }

  const servers = await loadUserFavoriteServers(authResult.user.id, authResult.user.role);

  return (
    <div>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">
          {t("heading")}
        </h1>
        <p className="mt-1.5 text-sm text-warm-500">{t("subtitle")}</p>
      </section>

      <FavoritesPageClient initialServers={servers} />
    </div>
  );
}
