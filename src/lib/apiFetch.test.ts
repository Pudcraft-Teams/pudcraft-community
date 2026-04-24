import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApiHeaders } from "./apiFetch";

test("buildApiHeaders: injects x-locale from arg", () => {
  const headers = buildApiHeaders({ locale: "en" });
  assert.equal(headers.get("x-locale"), "en");
});

test("buildApiHeaders: preserves other headers", () => {
  const headers = buildApiHeaders({
    locale: "zh",
    init: { headers: { "content-type": "application/json" } },
  });
  assert.equal(headers.get("x-locale"), "zh");
  assert.equal(headers.get("content-type"), "application/json");
});

test("buildApiHeaders: omits x-locale when locale is null", () => {
  const headers = buildApiHeaders({ locale: null });
  assert.equal(headers.get("x-locale"), null);
});
