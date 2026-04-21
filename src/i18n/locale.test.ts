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

test("resolveLocaleFrom: skips unsupported primary, picks supported secondary", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "fr-FR,en;q=0.9",
  });
  assert.equal(locale, "en");
});

test("resolveLocaleFrom: picks en from multi-token when it's deeper in list", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "ja,en-US;q=0.8,zh;q=0.5",
  });
  assert.equal(locale, "en");
});

test("resolveLocaleFrom: picks zh when en is absent but zh present in multi-token", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "fr-FR,zh-CN;q=0.9",
  });
  assert.equal(locale, "zh");
});

test("resolveLocaleFrom: falls back when no token supported", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "fr-FR,de;q=0.8",
  });
  assert.equal(locale, "zh");
});
