import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Dockerfile forwards storage configuration into the Next.js build environment", () => {
  const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /^ARG S3_BUCKET=.*$/m);
  assert.match(dockerfile, /^ARG S3_REGION=.*$/m);
  assert.match(dockerfile, /^ARG S3_ENDPOINT=.*$/m);
  assert.match(dockerfile, /^ARG S3_PUBLIC_BASE_URL=.*$/m);
  assert.match(dockerfile, /^ARG S3_FORCE_PATH_STYLE=.*$/m);
  assert.match(dockerfile, /^ARG OSS_BUCKET=.*$/m);
  assert.match(dockerfile, /^ARG OSS_ENDPOINT=.*$/m);
  assert.match(dockerfile, /^ARG OSS_PUBLIC_BASE_URL=.*$/m);
  assert.match(dockerfile, /^ARG OSS_FORCE_PATH_STYLE=.*$/m);
  assert.match(dockerfile, /^ENV S3_BUCKET="\$\{S3_BUCKET\}"$/m);
  assert.match(dockerfile, /^ENV S3_REGION="\$\{S3_REGION\}"$/m);
  assert.match(dockerfile, /^ENV S3_ENDPOINT="\$\{S3_ENDPOINT\}"$/m);
  assert.match(dockerfile, /^ENV S3_PUBLIC_BASE_URL="\$\{S3_PUBLIC_BASE_URL\}"$/m);
  assert.match(dockerfile, /^ENV S3_FORCE_PATH_STYLE="\$\{S3_FORCE_PATH_STYLE\}"$/m);
  assert.match(dockerfile, /^ENV OSS_BUCKET="\$\{OSS_BUCKET\}"$/m);
  assert.match(dockerfile, /^ENV OSS_ENDPOINT="\$\{OSS_ENDPOINT\}"$/m);
  assert.match(dockerfile, /^ENV OSS_PUBLIC_BASE_URL="\$\{OSS_PUBLIC_BASE_URL\}"$/m);
  assert.match(dockerfile, /^ENV OSS_FORCE_PATH_STYLE="\$\{OSS_FORCE_PATH_STYLE\}"$/m);
});

test("GitHub build workflow passes storage build args into docker/build-push-action", () => {
  const workflow = readFileSync(path.join(repoRoot, ".github/workflows/build.yml"), "utf8");

  assert.match(workflow, /^\s+build-args:\s+\|$/m);
  assert.match(workflow, /^\s+S3_BUCKET=/m);
  assert.match(workflow, /^\s+S3_REGION=/m);
  assert.match(workflow, /^\s+S3_ENDPOINT=/m);
  assert.match(workflow, /^\s+S3_PUBLIC_BASE_URL=/m);
  assert.match(workflow, /^\s+S3_FORCE_PATH_STYLE=/m);
  assert.match(workflow, /^\s+OSS_BUCKET=/m);
  assert.match(workflow, /^\s+OSS_ENDPOINT=/m);
  assert.match(workflow, /^\s+OSS_PUBLIC_BASE_URL=/m);
  assert.match(workflow, /^\s+OSS_FORCE_PATH_STYLE=/m);
});
