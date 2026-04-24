import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { Locale } from "@/i18n/config";

const DATE_FNS_LOCALE = {
  zh: zhCN,
  en: enUS,
} as const;

const JUST_NOW = {
  zh: "刚刚",
  en: "just now",
} as const;

// The zh locale renders "大约 N 小时前"; strip the hedge for a tighter UI.
// en locale uses "about N hours ago", so strip that too.
const ABOUT_HEDGE = {
  zh: "大约",
  en: "about ",
} as const;

/**
 * Render an absolute date as a concise relative-time string in the
 * requested locale. Falls back to "just now" when the input is invalid.
 *
 * Callers that can access `useLocale()` / `getLocale()` should pass the
 * locale explicitly; the zero-arg form keeps the zh default for legacy
 * call sites that have not yet plumbed locale through.
 */
export function timeAgo(date: Date | string, locale: Locale = "zh"): string {
  const value = date instanceof Date ? date : new Date(date);

  if (!Number.isFinite(value.getTime())) {
    return JUST_NOW[locale];
  }

  try {
    return formatDistanceToNow(value, {
      addSuffix: true,
      locale: DATE_FNS_LOCALE[locale],
    }).replace(ABOUT_HEDGE[locale], "");
  } catch {
    return JUST_NOW[locale];
  }
}
