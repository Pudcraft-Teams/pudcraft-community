import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("favorites.page");
  return {
    title: t("metaTitle"),
  };
}

export default function FavoritesLayout({ children }: { children: ReactNode }) {
  return children;
}
