import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStorageImageRemotePatterns,
  isAllowedStorageImageUrl,
} from "./storage-image-policy";

test("buildStorageImageRemotePatterns includes regional and endpoint-derived storage hosts", () => {
  const patterns = buildStorageImageRemotePatterns({
    s3Bucket: "pudcraft",
    s3Region: "ap-southeast-1",
    s3Endpoint: "https://objects.example.com/media",
  });

  assert.deepEqual(
    patterns,
    [
      {
        protocol: "https",
        hostname: "objects.example.com",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "pudcraft.objects.example.com",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "pudcraft.s3.ap-southeast-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  );
});

test("isAllowedStorageImageUrl rejects protocol-relative urls and enforces trusted path prefixes", () => {
  const env = {
    nextPublicSiteUrl: "https://community.example.com",
    nextPublicStoragePublicBaseUrl: "https://cdn.example.com/storage",
    s3Endpoint: "https://objects.example.com/media",
    s3Bucket: "pudcraft",
  };

  assert.equal(isAllowedStorageImageUrl("/uploads/circle.webp", env), true);
  assert.equal(isAllowedStorageImageUrl("//evil.example/circle.webp", env), false);
  assert.equal(
    isAllowedStorageImageUrl("https://cdn.example.com/storage/circle.webp", env),
    true,
  );
  assert.equal(
    isAllowedStorageImageUrl("https://cdn.example.com/other/circle.webp", env),
    false,
  );
  assert.equal(
    isAllowedStorageImageUrl("https://objects.example.com/media/pudcraft/circle.webp", env),
    true,
  );
  assert.equal(
    isAllowedStorageImageUrl("https://objects.example.com/private/circle.webp", env),
    false,
  );
});

test("isAllowedStorageImageUrl rejects scheme-less remote urls from user input", () => {
  const env = {
    nextPublicStoragePublicBaseUrl: "https://cdn.example.com/storage",
  };

  assert.equal(isAllowedStorageImageUrl("cdn.example.com/storage/icon.webp", env), false);
  assert.equal(isAllowedStorageImageUrl("https://cdn.example.com/storage/icon.webp", env), true);
});

test("storage image policy supports legacy OSS regional env names", () => {
  const env = {
    ossBucket: "legacy-bucket",
    ossRegion: "cn-hangzhou",
  };

  assert.deepEqual(buildStorageImageRemotePatterns(env), [
    {
      protocol: "https",
      hostname: "legacy-bucket.s3.cn-hangzhou.amazonaws.com",
      pathname: "/**",
    },
  ]);

  assert.equal(
    isAllowedStorageImageUrl(
      "https://legacy-bucket.s3.cn-hangzhou.amazonaws.com/forum/icon.webp",
      env,
    ),
    true,
  );
});

test("storage image policy mirrors mixed S3 and OSS env fallback semantics", () => {
  const env = {
    s3Endpoint: "https://objects.example.com/media",
    ossBucket: "legacy-bucket",
  };

  assert.deepEqual(buildStorageImageRemotePatterns(env), [
    {
      protocol: "https",
      hostname: "objects.example.com",
      pathname: "/media/**",
    },
    {
      protocol: "https",
      hostname: "legacy-bucket.objects.example.com",
      pathname: "/media/**",
    },
  ]);

  assert.equal(
    isAllowedStorageImageUrl(
      "https://legacy-bucket.objects.example.com/media/forum/icon.webp",
      env,
    ),
    true,
  );
});
