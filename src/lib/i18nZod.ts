import { z, type ZodErrorMap } from "zod";
import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import zhMessages from "../../messages/zh.json";
import enMessages from "../../messages/en.json";

// Using createTranslator (not getTranslations) so this works in node:test
// without a Next.js runtime, and so it's a pure synchronous factory that
// Route Handlers can call per request with zero global state.
const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

export function getZodErrorMap(locale: Locale): ZodErrorMap {
  const t = createTranslator({
    locale,
    namespace: "errors.validation",
    messages: messagesByLocale[locale],
  });
  return (issue, ctx) => {
    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        return { message: t("invalidType") };
      case z.ZodIssueCode.too_small: {
        const min = String(issue.minimum);
        switch (issue.type) {
          case "string":
            return { message: t("tooSmallString", { min }) };
          case "number":
            return { message: t("tooSmallNumber", { min }) };
          case "array":
            return { message: t("tooSmallArray", { min }) };
          case "date":
            return {
              message: t("tooSmallDate", {
                min: new Date(Number(issue.minimum)).toISOString(),
              }),
            };
          case "bigint":
            return { message: t("tooSmallBigint", { min }) };
          case "set":
            return { message: t("tooSmallSet", { min }) };
          default:
            return { message: ctx.defaultError };
        }
      }
      case z.ZodIssueCode.too_big: {
        const max = String(issue.maximum);
        switch (issue.type) {
          case "string":
            return { message: t("tooBigString", { max }) };
          case "number":
            return { message: t("tooBigNumber", { max }) };
          case "array":
            return { message: t("tooBigArray", { max }) };
          case "date":
            return {
              message: t("tooBigDate", {
                max: new Date(Number(issue.maximum)).toISOString(),
              }),
            };
          case "bigint":
            return { message: t("tooBigBigint", { max }) };
          case "set":
            return { message: t("tooBigSet", { max }) };
          default:
            return { message: ctx.defaultError };
        }
      }
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
}
