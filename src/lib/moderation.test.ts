import assert from "node:assert/strict";
import test from "node:test";

function applyModerationTestEnv() {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pudcraft_test";
  process.env.NEXTAUTH_SECRET = "test-secret-value";
  process.env.AUTH_SECRET = "test-secret-value";
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = "6379";
}

test("buildPostModerationFields includes both title and normalized content excerpt", async () => {
  applyModerationTestEnv();
  const { buildPostModerationFields } = await import("./moderation");
  const fields = buildPostModerationFields({
    title: "  测试标题  ",
    content: "第一行\n\n第二行  第三行",
  });

  assert.deepEqual(fields, {
    标题: "测试标题",
    正文: "第一行 第二行 第三行",
  });
});

test("buildPostModerationFields truncates long content and skips empty values", async () => {
  applyModerationTestEnv();
  const { buildPostModerationFields } = await import("./moderation");
  const longContent = `  ${"a".repeat(260)}  `;

  const fields = buildPostModerationFields({
    title: " ",
    content: longContent,
  });

  assert.equal(Object.keys(fields).length, 1);
  assert.equal(fields.正文, "a".repeat(200));
});
