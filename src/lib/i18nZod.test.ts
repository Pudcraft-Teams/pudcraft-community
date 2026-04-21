import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { setZodLocale, resetZodLocale } from "./i18nZod";

test("setZodLocale(zh): required message uses Chinese", async () => {
  await setZodLocale("zh");
  const result = z.string().min(1).safeParse("");
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues[0].message.includes("不能少于"),
      `expected Chinese message, got: ${result.error.issues[0].message}`,
    );
  }
  resetZodLocale();
});

test("setZodLocale(en): passes through to English stub", async () => {
  await setZodLocale("en");
  const result = z.string().min(1).safeParse("");
  assert.equal(result.success, false);
  resetZodLocale();
});
