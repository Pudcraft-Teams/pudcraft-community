import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "我的收藏",
};

export default function FavoritesLayout({ children }: { children: ReactNode }) {
  return children;
}
