import Image from "next/image";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  showInitialFallback?: boolean;
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function resolveInitial(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "U";
  return source.charAt(0).toUpperCase();
}

/**
 * 用户头像组件。
 * 优先显示图片，缺省时默认回退占位图，可选首字母占位。
 */
export function UserAvatar({
  src,
  name,
  email,
  alt,
  className = "h-10 w-10",
  fallbackClassName = "bg-teal-600 text-white",
  showInitialFallback = false,
}: UserAvatarProps) {
  const initial = resolveInitial(name, email);
  const sharedClassName = joinClassNames(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    className,
  );

  if (src) {
    return (
      <span className={sharedClassName}>
        <Image
          src={src}
          alt={alt ?? `${name ?? "用户"} 的头像`}
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
          alt={alt ?? `${name ?? "用户"} 的头像`}
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
