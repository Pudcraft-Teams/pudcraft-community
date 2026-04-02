import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  assert.match(dockerfile, /^ARG OSS_REGION=.*$/m);
  assert.match(dockerfile, /^ARG OSS_ENDPOINT=.*$/m);
  assert.match(dockerfile, /^ARG OSS_PUBLIC_BASE_URL=.*$/m);
  assert.match(dockerfile, /^ARG OSS_FORCE_PATH_STYLE=.*$/m);
  assert.match(dockerfile, /^ENV S3_BUCKET="\$\{S3_BUCKET\}"$/m);
  assert.match(dockerfile, /^ENV S3_REGION="\$\{S3_REGION\}"$/m);
  assert.match(dockerfile, /^ENV S3_ENDPOINT="\$\{S3_ENDPOINT\}"$/m);
  assert.match(dockerfile, /^ENV S3_PUBLIC_BASE_URL="\$\{S3_PUBLIC_BASE_URL\}"$/m);
  assert.match(dockerfile, /^ENV S3_FORCE_PATH_STYLE="\$\{S3_FORCE_PATH_STYLE\}"$/m);
  assert.match(dockerfile, /^ENV OSS_BUCKET="\$\{OSS_BUCKET\}"$/m);
  assert.match(dockerfile, /^ENV OSS_REGION="\$\{OSS_REGION\}"$/m);
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
  assert.match(workflow, /^\s+OSS_REGION=/m);
  assert.match(workflow, /^\s+OSS_ENDPOINT=/m);
  assert.match(workflow, /^\s+OSS_PUBLIC_BASE_URL=/m);
  assert.match(workflow, /^\s+OSS_FORCE_PATH_STYLE=/m);
});

test("Deploy workflow refreshes GHCR auth before pulling the image on VPS", () => {
  const workflow = readFileSync(path.join(repoRoot, ".github/workflows/deploy.yml"), "utf8");

  assert.match(workflow, /^\s+packages:\s+read$/m);
  assert.match(workflow, /^\s+envs:\s+GHCR_TOKEN,GHCR_USERNAME$/m);
  assert.match(
    workflow,
    /echo "\$GHCR_TOKEN" \| docker login ghcr\.io -u "\$GHCR_USERNAME" --password-stdin/,
  );
});

test("next.config forwards OSS regional envs into remote image patterns", () => {
  const script = `
    import config from "./next.config.ts";
    const resolvedConfig = config.default ?? config;
    console.log(JSON.stringify(resolvedConfig.images?.remotePatterns ?? []));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        OSS_BUCKET: "legacy-bucket",
        OSS_REGION: "cn-hangzhou",
        S3_BUCKET: "",
        S3_REGION: "",
        S3_ENDPOINT: "",
        OSS_ENDPOINT: "",
        S3_PUBLIC_BASE_URL: "",
        OSS_PUBLIC_BASE_URL: "",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /legacy-bucket\.s3\.cn-hangzhou\.amazonaws\.com/,
  );
});
