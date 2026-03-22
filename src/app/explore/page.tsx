import type { Metadata } from "next";
import { ExplorePage } from "@/components/forum/ExplorePage";

export const metadata: Metadata = {
  title: "探索圈子 - Pudcraft",
  description: "发现热门游戏圈子",
};

export const dynamic = "force-dynamic";

export default function ExplorePageRoute() {
  return <ExplorePage />;
}
