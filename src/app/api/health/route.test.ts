import assert from "node:assert/strict";
import test from "node:test";

function unwrapRouteModule<T extends object>(module: T): T {
  return (module as T & { default?: T }).default ?? module;
}

test("createHealthResponse returns an ok payload with an ISO timestamp", async () => {
  const { createHealthResponse } = unwrapRouteModule(await import("./route"));

  const response: Response = createHealthResponse(() => new Date("2026-04-19T08:30:00.000Z"));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    timestamp: "2026-04-19T08:30:00.000Z",
  });
});

test("createHealthResponse falls back to the standard error payload when timestamp generation fails", async () => {
  const { createHealthResponse } = unwrapRouteModule(await import("./route"));

  const response: Response = createHealthResponse(() => {
    throw new Error("clock unavailable");
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "服务器内部错误" });
});
