import { z, type ZodErrorMap, type ZodIssue } from "zod";
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

const KEY_MESSAGE_PREFIX = "errors.validation.";

function translateKeyMessage(message: string, locale: Locale): string {
  if (!message.startsWith(KEY_MESSAGE_PREFIX)) return message;
  const keyPath = message.slice("errors.".length); // "validation.xxx.yyy"
  const t = createTranslator({
    locale,
    namespace: "errors",
    messages: messagesByLocale[locale],
  });
  try {
    // Key paths are validated at rendering time; this cast is fine because
    // a missing key silently returns the raw path string, which we then
    // fall back to below.
    return t(keyPath as never);
  } catch {
    return message;
  }
}

/**
 * Translate Zod issues' `message` field in place when they reference a
 * `errors.validation.*` key path. Non-key messages pass through untouched.
 *
 * Schemas that want field-specific, translatable copy use inline key paths
 * (e.g. `.min(3, "errors.validation.servers.mcUsernameMin")`). Inline
 * messages bypass Zod's `errorMap`, so translation happens at serialization
 * time instead of inside the error map.
 */
export function translateZodIssues(issues: readonly ZodIssue[], locale: Locale): ZodIssue[] {
  return issues.map((issue) => {
    if (typeof issue.message === "string" && issue.message.startsWith(KEY_MESSAGE_PREFIX)) {
      return { ...issue, message: translateKeyMessage(issue.message, locale) };
    }
    return issue;
  });
}

export interface FlattenedZodError {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}

/**
 * Translate a Zod error's flattened structure for API responses. Mirrors
 * `error.flatten()`'s shape but with translated messages.
 */
export function flattenZodErrorWithLocale(
  error: z.ZodError,
  locale: Locale,
): FlattenedZodError {
  const issues = translateZodIssues(error.issues, locale);
  const translated = new z.ZodError(issues);
  return translated.flatten((issue) => issue.message);
}

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
