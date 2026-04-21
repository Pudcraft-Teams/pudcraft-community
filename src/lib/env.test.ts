import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("env module can be imported during build-style evaluation without core auth/database envs", () => {
  const script = `
    await import("./src/lib/env.ts");
    console.log("ok");
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: "",
      NEXTAUTH_SECRET: "",
      NEXTAUTH_URL: "",
      REDIS_URL: "redis://localhost:6379",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok/);
});
