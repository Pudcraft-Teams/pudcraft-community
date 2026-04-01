import assert from "node:assert/strict";
import test from "node:test";

test("normalizeImageProcessingError maps sharp pixel-limit failures to INVALID_IMAGE_DIMENSIONS", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNextAuthSecret = process.env.NEXTAUTH_SECRET;
  const previousRedisHost = process.env.REDIS_HOST;
  const previousRedisPort = process.env.REDIS_PORT;
  process.env.DATABASE_URL = previousDatabaseUrl ?? "postgresql://dummy:dummy@localhost:5432/dummy";
  process.env.NEXTAUTH_SECRET = previousNextAuthSecret ?? "build-time-placeholder-key-32chars";
  process.env.REDIS_HOST = previousRedisHost ?? "localhost";
  process.env.REDIS_PORT = previousRedisPort ?? "6379";

  return import("./storage").then(({ ImageValidationError, normalizeImageProcessingError }) => {
    const normalized = normalizeImageProcessingError(
      new Error("Input image exceeds pixel limit"),
    );

    assert.ok(normalized instanceof ImageValidationError);
    assert.equal(normalized.code, "INVALID_IMAGE_DIMENSIONS");
    assert.equal(normalized.status, 400);

    process.env.DATABASE_URL = previousDatabaseUrl;
    process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
    process.env.REDIS_HOST = previousRedisHost;
    process.env.REDIS_PORT = previousRedisPort;
  }).catch((error) => {
    process.env.DATABASE_URL = previousDatabaseUrl;
    process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
    process.env.REDIS_HOST = previousRedisHost;
    process.env.REDIS_PORT = previousRedisPort;
    throw error;
  });
});

test("normalizeImageProcessingError preserves existing validation errors", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNextAuthSecret = process.env.NEXTAUTH_SECRET;
  const previousRedisHost = process.env.REDIS_HOST;
  const previousRedisPort = process.env.REDIS_PORT;
  process.env.DATABASE_URL = previousDatabaseUrl ?? "postgresql://dummy:dummy@localhost:5432/dummy";
  process.env.NEXTAUTH_SECRET = previousNextAuthSecret ?? "build-time-placeholder-key-32chars";
  process.env.REDIS_HOST = previousRedisHost ?? "localhost";
  process.env.REDIS_PORT = previousRedisPort ?? "6379";

  return import("./storage").then(({ ImageValidationError, normalizeImageProcessingError }) => {
    const original = new ImageValidationError("INVALID_IMAGE_TYPE");

    assert.equal(normalizeImageProcessingError(original), original);

    process.env.DATABASE_URL = previousDatabaseUrl;
    process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
    process.env.REDIS_HOST = previousRedisHost;
    process.env.REDIS_PORT = previousRedisPort;
  }).catch((error) => {
    process.env.DATABASE_URL = previousDatabaseUrl;
    process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
    process.env.REDIS_HOST = previousRedisHost;
    process.env.REDIS_PORT = previousRedisPort;
    throw error;
  });
});
