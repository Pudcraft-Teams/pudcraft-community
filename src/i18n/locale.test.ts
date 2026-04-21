import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocaleFrom } from "./locale";

test("resolveLocaleFrom: x-locale header wins", () => {
  const locale = resolveLocaleFrom({
    header: "en",
    cookie: "zh",
    acceptLanguage: "zh-CN",
  });
  assert.equal(locale, "en");
});

test("resolveLocaleFrom: cookie beats accept-language", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: "en",
    acceptLanguage: "zh-CN",
  });
  assert.equal(locale, "en");
});

test("resolveLocaleFrom: accept-language zh primary", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "zh-CN,en;q=0.8",
  });
  assert.equal(locale, "zh");
});

test("resolveLocaleFrom: accept-language en primary", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "en-US,zh;q=0.5",
  });
  assert.equal(locale, "en");
});

test("resolveLocaleFrom: unknown falls back to default", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: "xx",
    acceptLanguage: "fr-FR",
  });
  assert.equal(locale, "zh");
});
