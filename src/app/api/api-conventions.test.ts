import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const ROUTES_WITH_DETAILS_CONVENTION = [
  "src/app/api/servers/route.ts",
  "src/app/api/servers/[id]/route.ts",
  "src/app/api/servers/[id]/comments/route.ts",
  "src/app/api/user/profile/route.ts",
  "src/app/api/servers/[id]/modpack/route.ts",
  "src/app/api/uploads/editor-image/route.ts",
];

test("route handlers use details instead of detail in error payloads", () => {
  for (const relativePath of ROUTES_WITH_DETAILS_CONVENTION) {
    const file = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(
      file,
      /\bdetail\s*:/,
      `${relativePath} still uses detail instead of details`,
    );
  }
});

test("health route keeps explicit try/catch coverage like the rest of the API surface", () => {
  const file = readFileSync(path.join(repoRoot, "src/app/api/health/route.ts"), "utf8");
  assert.match(file, /\btry\s*\{/, "health route is missing try/catch coverage");
});
