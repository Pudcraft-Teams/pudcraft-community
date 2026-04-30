import { getPublicUrl } from "@/lib/storage";

export function getUserImageUrl(image: string | null | undefined): string | null {
  const trimmed = image?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return getPublicUrl(trimmed);
}
