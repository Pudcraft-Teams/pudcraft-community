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

test("next.config exposes a public storage base url for client-side markdown image allowlists", () => {
  const script = `
    import config from "./next.config.ts";
    const resolvedConfig = config.default ?? config;
    console.log(JSON.stringify(resolvedConfig.env ?? {}));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL: "",
        S3_PUBLIC_BASE_URL: "https://cdn.example.com/storage",
        OSS_PUBLIC_BASE_URL: "",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL":"https:\/\/cdn\.example\.com\/storage"/);
});

test("next.config exposes a public storage base url fallback for the client bundle", () => {
  const script = `
    import config from "./next.config.ts";
    const resolvedConfig = config.default ?? config;
    console.log(JSON.stringify({
      publicStorageBaseUrl: resolvedConfig.env?.NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL ?? null,
      remotePatterns: resolvedConfig.images?.remotePatterns ?? [],
    }));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL: "",
        S3_PUBLIC_BASE_URL: "https://cdn.example.com/storage",
        OSS_PUBLIC_BASE_URL: "",
        S3_BUCKET: "",
        S3_REGION: "",
        S3_ENDPOINT: "",
        OSS_BUCKET: "",
        OSS_REGION: "",
        OSS_ENDPOINT: "",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"publicStorageBaseUrl":"https:\/\/cdn\.example\.com\/storage"/);
  assert.match(result.stdout, /"hostname":"cdn\.example\.com"/);
  assert.match(result.stdout, /"pathname":"\/storage\/\*\*"/);
});

test("next.config only allows local IP image optimization in development", () => {
  const script = `
    import config from "./next.config.ts";
    const resolvedConfig = config.default ?? config;
    console.log(JSON.stringify(resolvedConfig.images?.dangerouslyAllowLocalIP ?? null));
  `;

  const developmentResult = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
    encoding: "utf8",
  });
  assert.equal(developmentResult.status, 0, developmentResult.stderr);
  assert.equal(developmentResult.stdout.trim(), "true");

  const productionResult = spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    encoding: "utf8",
  });
  assert.equal(productionResult.status, 0, productionResult.stderr);
  assert.equal(productionResult.stdout.trim(), "false");
});
