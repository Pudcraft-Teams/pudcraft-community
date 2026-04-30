import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

test("retired local credentials and mail dependencies are not direct dependencies", () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const directDependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  for (const dependency of [
    "@auth/prisma-adapter",
    "bcryptjs",
    "nodemailer",
    "@types/bcryptjs",
    "@types/nodemailer",
  ]) {
    assert.equal(directDependencies[dependency], undefined);
  }
});
