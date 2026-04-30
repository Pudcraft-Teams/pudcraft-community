import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

test("admin users page labels 咖啡厅 identity instead of email", () => {
  const page = readFileSync(path.join(repoRoot, "src/app/admin/users/page.tsx"), "utf8");
  const zhMessages = readFileSync(path.join(repoRoot, "messages/zh.json"), "utf8");
  const enMessages = readFileSync(path.join(repoRoot, "messages/en.json"), "utf8");

  assert.doesNotMatch(page, /colEmail/);
  assert.doesNotMatch(zhMessages, /搜索用户名或邮箱/);
  assert.doesNotMatch(enMessages, /搜索用户名或邮箱/);
  assert.match(page, /colMisskey/);
  assert.match(zhMessages, /咖啡厅用户名/);
  assert.match(enMessages, /Café handle/);
});
