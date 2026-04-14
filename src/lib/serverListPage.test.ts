import assert from "node:assert/strict";
import test from "node:test";

import { buildServerListPath, parseServerListQuery } from "@/lib/serverListQuery";

test("parseServerListQuery normalizes invalid values to defaults", () => {
  const query = parseServerListQuery({
    page: "0",
    sort: "not-a-sort",
    tag: [""],
    search: [""],
  });

  assert.deepEqual(query, {
    page: 1,
    sort: "newest",
    tag: "",
    search: "",
  });
});

test("buildServerListPath preserves valid filters", () => {
  const path = buildServerListPath({
    page: 3,
    sort: "popular",
    tag: "RPG",
    search: "stone bricks",
  });

  assert.equal(path, "?tag=RPG&search=stone+bricks&sort=popular&page=3");
});

test("buildServerListPath drops default values for clean redirects", () => {
  const path = buildServerListPath({
    page: 1,
    sort: "newest",
    tag: "",
    search: "",
  });

  assert.equal(path, "");
});
