import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCookie, getRequestLocale, resolveLocaleFrom } from "./locale";

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

test("resolveLocaleFrom: honors q-values over token order", () => {
  const locale = resolveLocaleFrom({
    header: null,
    cookie: null,
    acceptLanguage: "en-US;q=0.1,zh-CN;q=1.0",
  });
  assert.equal(locale, "zh");
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

test("extractCookie: malformed percent-encoding returns null", () => {
  // decodeURIComponent throws URIError on inputs like "%E4". The helper
  // must swallow that so a bad cookie doesn't turn into a 500.
  assert.equal(extractCookie("NEXT_LOCALE=%E4", "NEXT_LOCALE"), null);
  assert.equal(extractCookie("NEXT_LOCALE=%", "NEXT_LOCALE"), null);
});

test("extractCookie: well-formed encoded value round-trips", () => {
  assert.equal(extractCookie("NEXT_LOCALE=en", "NEXT_LOCALE"), "en");
  assert.equal(
    extractCookie("NEXT_LOCALE=%7Bvalue%7D", "NEXT_LOCALE"),
    "{value}",
  );
});

test("extractCookie: returns null when the cookie is missing", () => {
  assert.equal(extractCookie(null, "NEXT_LOCALE"), null);
  assert.equal(extractCookie("", "NEXT_LOCALE"), null);
  assert.equal(extractCookie("OTHER=en", "NEXT_LOCALE"), null);
});

test("extractCookie: does not match cookies that only share a prefix", () => {
  // "NEXT_LOCALE_OLD" shares the prefix "NEXT_LOCALE" but must not match.
  assert.equal(
    extractCookie("NEXT_LOCALE_OLD=en", "NEXT_LOCALE"),
    null,
  );
});

test("extractCookie: picks the named cookie when multiple are present", () => {
  assert.equal(
    extractCookie("foo=bar; NEXT_LOCALE=en; baz=qux", "NEXT_LOCALE"),
    "en",
  );
});

test("getRequestLocale: malformed NEXT_LOCALE cookie falls back to default", async () => {
  const request = new Request("http://localhost/", {
    headers: { cookie: "NEXT_LOCALE=%E4" },
  });
  const locale = await getRequestLocale(request);
  assert.equal(locale, "zh");
});

test("getRequestLocale: well-formed NEXT_LOCALE cookie resolves correctly", async () => {
  const request = new Request("http://localhost/", {
    headers: { cookie: "NEXT_LOCALE=en" },
  });
  const locale = await getRequestLocale(request);
  assert.equal(locale, "en");
});

test("getRequestLocale: malformed cookie with a valid accept-language still defaults to default locale", async () => {
  // The malformed cookie must not short-circuit to an error; but it also
  // shouldn't be trusted as a locale source. With the cookie treated as
  // absent the next source (accept-language) decides the result.
  const request = new Request("http://localhost/", {
    headers: {
      cookie: "NEXT_LOCALE=%E4",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  const locale = await getRequestLocale(request);
  assert.equal(locale, "en");
});
