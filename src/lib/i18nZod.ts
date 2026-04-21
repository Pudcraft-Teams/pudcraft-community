import { z, type ZodErrorMap } from "zod";
import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import zhMessages from "../../messages/zh.json";
import enMessages from "../../messages/en.json";

const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

let activeMap: ZodErrorMap | null = null;

export async function setZodLocale(locale: Locale): Promise<void> {
  const messages = messagesByLocale[locale];
  const t = createTranslator({
    locale,
    namespace: "errors.validation",
    messages,
  });
  activeMap = (issue, ctx) => {
    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        return { message: t("invalidType") };
      case z.ZodIssueCode.too_small:
        return { message: t("tooSmall", { min: String(issue.minimum) }) };
      case z.ZodIssueCode.too_big:
        return { message: t("tooBig", { max: String(issue.maximum) }) };
      case z.ZodIssueCode.invalid_string:
        if (issue.validation === "email") return { message: t("invalidEmail") };
        if (issue.validation === "url") return { message: t("invalidUrl") };
        return { message: t("invalidString") };
      case z.ZodIssueCode.invalid_enum_value:
        return { message: t("invalidEnum") };
      case z.ZodIssueCode.custom:
        return { message: t("custom") };
      default:
        return { message: ctx.defaultError };
    }
  };
  z.setErrorMap(activeMap);
}

export function resetZodLocale(): void {
  z.setErrorMap(z.defaultErrorMap);
  activeMap = null;
}
