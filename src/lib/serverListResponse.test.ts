import assert from "node:assert/strict";
import test from "node:test";
import { normalizeServerListResponse } from "./serverListResponse";
import type { ServerListItem } from "./types";

const server = { id: "server-1" } as ServerListItem;

test("normalizeServerListResponse reads total from the API payload", () => {
  const normalized = normalizeServerListResponse({
    data: [server],
    total: 42,
    totalPages: 4,
  });

  assert.deepEqual(normalized, {
    servers: [server],
    total: 42,
    totalPages: 4,
  });
});

test("normalizeServerListResponse falls back to pagination totals", () => {
  const normalized = normalizeServerListResponse({
    servers: [server],
    pagination: {
      total: 7,
      totalPages: 2,
    },
  });

  assert.deepEqual(normalized, {
    servers: [server],
    total: 7,
    totalPages: 2,
  });
});
