"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface LiveFavoriteCountProps {
  initialCount: number;
  serverId: string;
}

interface FavoriteChangeDetail {
  serverId: string;
  delta: number;
}

const EVENT_NAME = "pudcraft:favorite-change";

export function LiveFavoriteCount({ initialCount, serverId }: LiveFavoriteCountProps) {
  const t = useTranslations("servers.common");
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FavoriteChangeDetail>).detail;
      if (!detail || detail.serverId !== serverId) return;
      setCount((previous) => Math.max(0, previous + detail.delta));
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, [serverId]);

  return <>{t("favoriteCount", { count })}</>;
}
