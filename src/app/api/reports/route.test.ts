import assert from "node:assert/strict";
import test from "node:test";

function unwrapRouteModule<T extends object>(module: T): T {
  return (module as T & { default?: T }).default ?? module;
}

function applyRouteTestEnv() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/pudcraft_test";
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-value";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-value";
  process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
  process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
}

test("buildCreateReportSuccessPayload keeps the success flag while preserving the legacy message", () => {
  applyRouteTestEnv();
  return import("./route").then((module) => {
    const { buildCreateReportSuccessPayload } = unwrapRouteModule(module);

    assert.deepEqual(buildCreateReportSuccessPayload(), {
      success: true,
      message: "举报已提交，感谢你的反馈",
    });
  });
});
