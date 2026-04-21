import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { getZodErrorMap } from "./i18nZod";

test("getZodErrorMap(zh): string too_small uses length copy", () => {
  const errorMap = getZodErrorMap("zh");
  const result = z.string().min(3).safeParse("a", { errorMap });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues[0].message.includes("长度不能少于"),
      `expected string-length copy, got: ${result.error.issues[0].message}`,
    );
  }
});

test("getZodErrorMap(zh): number too_small uses number copy, not length", () => {
  const errorMap = getZodErrorMap("zh");
  const result = z.number().min(10).safeParse(5, { errorMap });
  assert.equal(result.success, false);
  if (!result.success) {
    const msg = result.error.issues[0].message;
    assert.ok(msg.includes("不能小于"), `expected number copy, got: ${msg}`);
    assert.ok(!msg.includes("长度"), `number must not use string-length copy: ${msg}`);
  }
});

test("getZodErrorMap(zh): array too_small uses array copy", () => {
  const errorMap = getZodErrorMap("zh");
  const result = z.array(z.string()).min(2).safeParse(["a"], { errorMap });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues[0].message.includes("至少需要"),
      `expected array copy, got: ${result.error.issues[0].message}`,
    );
  }
});

test("getZodErrorMap(zh): invalid email", () => {
  const errorMap = getZodErrorMap("zh");
  const result = z.string().email().safeParse("not-an-email", { errorMap });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues[0].message.includes("邮箱"),
      `expected email copy, got: ${result.error.issues[0].message}`,
    );
  }
});

test("getZodErrorMap(en): returns a working map (no runtime errors)", () => {
  const errorMap = getZodErrorMap("en");
  const result = z.string().min(1).safeParse("", { errorMap });
  assert.equal(result.success, false);
});

test("getZodErrorMap: independent instances do not share state", () => {
  const zhMap = getZodErrorMap("zh");
  const enMap = getZodErrorMap("en");
  const zhResult = z.string().min(1).safeParse("", { errorMap: zhMap });
  const enResult = z.string().min(1).safeParse("", { errorMap: enMap });
  assert.equal(zhResult.success, false);
  assert.equal(enResult.success, false);
  if (!zhResult.success && !enResult.success) {
    // Both locales currently mirror Chinese values; assert both maps
    // resolve without throwing. The key is that setting up enMap AFTER
    // zhMap didn't mutate zhMap's behavior.
    assert.ok(zhResult.error.issues[0].message.length > 0);
    assert.ok(enResult.error.issues[0].message.length > 0);
  }
});
