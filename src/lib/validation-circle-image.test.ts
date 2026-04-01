import assert from "node:assert/strict";
import test from "node:test";
import { updateCircleSchema } from "./validation";

test("updateCircleSchema accepts app-generated OSS regional image urls", () => {
  const previousBucket = process.env.OSS_BUCKET;
  const previousRegion = process.env.OSS_REGION;
  const previousS3Bucket = process.env.S3_BUCKET;
  const previousS3Region = process.env.S3_REGION;

  process.env.OSS_BUCKET = "legacy-bucket";
  process.env.OSS_REGION = "cn-hangzhou";
  process.env.S3_BUCKET = "";
  process.env.S3_REGION = "";

  try {
    const parsed = updateCircleSchema.safeParse({
      icon: "https://legacy-bucket.s3.cn-hangzhou.amazonaws.com/forum/icon.webp",
    });

    assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error.message);
  } finally {
    process.env.OSS_BUCKET = previousBucket;
    process.env.OSS_REGION = previousRegion;
    process.env.S3_BUCKET = previousS3Bucket;
    process.env.S3_REGION = previousS3Region;
  }
});
