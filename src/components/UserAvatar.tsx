"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { normalizeImageSrc } from "@/lib/image-url";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  handle?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  showInitialFallback?: boolean;
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function resolveInitial(name?: string | null, handle?: string | null): string {
  const source = name?.trim() || handle?.trim() || "U";
  return source.charAt(0).toUpperCase();
}

/**
 * 用户头像组件。
 * 优先显示图片，缺省时默认回退占位图，可选首字母占位。
 */
export function UserAvatar({
  src,
  name,
  handle,
  alt,
  className = "h-10 w-10",
  fallbackClassName = "bg-gradient-to-br from-coral to-coral-amber text-white",
  showInitialFallback = false,
}: UserAvatarProps) {
  const t = useTranslations("user.avatar");
  const initial = resolveInitial(name, handle);
  const sharedClassName = joinClassNames(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    className,
  );

  const resolvedSrc = normalizeImageSrc(src);
  const resolvedAlt = alt ?? t("alt", { name: name ?? t("fallbackName") });

  if (resolvedSrc) {
    return (
      <span className={sharedClassName}>
        <Image
          src={resolvedSrc}
          alt={resolvedAlt}
          width={96}
          height={96}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  if (!showInitialFallback) {
    return (
      <span className={sharedClassName}>
        <Image
          src="/default-avatar.png"
          alt={resolvedAlt}
          width={96}
          height={96}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={joinClassNames(sharedClassName, fallbackClassName)}>
      <span className="text-sm font-semibold">{initial}</span>
    </span>
  );
}
