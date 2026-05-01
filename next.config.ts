import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildStorageImageRemotePatterns } from "./src/lib/storage-image-policy";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function firstNonEmptyEnv(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

const nextPublicStoragePublicBaseUrl = firstNonEmptyEnv(
  process.env.NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL,
  process.env.S3_PUBLIC_BASE_URL,
  process.env.OSS_PUBLIC_BASE_URL,
);
const allowLocalIpImageOptimization = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "standalone",
  env: nextPublicStoragePublicBaseUrl
    ? {
        // Keep client-side markdown image trust aligned with the effective next/image host allowlist.
        NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL: nextPublicStoragePublicBaseUrl,
      }
    : undefined,
  images: {
    dangerouslyAllowLocalIP: allowLocalIpImageOptimization,
    remotePatterns: buildStorageImageRemotePatterns({
      nextPublicStoragePublicBaseUrl: nextPublicStoragePublicBaseUrl,
      s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
      ossPublicBaseUrl: process.env.OSS_PUBLIC_BASE_URL,
      s3Endpoint: process.env.S3_ENDPOINT,
      ossEndpoint: process.env.OSS_ENDPOINT,
      s3Bucket: process.env.S3_BUCKET,
      ossBucket: process.env.OSS_BUCKET,
      s3Region: process.env.S3_REGION,
      ossRegion: process.env.OSS_REGION,
      misskeyHost: process.env.MISSKEY_HOST,
    }),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
