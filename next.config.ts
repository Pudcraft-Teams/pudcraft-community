import type { NextConfig } from "next";
import { buildStorageImageRemotePatterns } from "./src/lib/storage-image-policy";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: buildStorageImageRemotePatterns({
      nextPublicStoragePublicBaseUrl: process.env.NEXT_PUBLIC_STORAGE_PUBLIC_BASE_URL,
      s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
      ossPublicBaseUrl: process.env.OSS_PUBLIC_BASE_URL,
      s3Endpoint: process.env.S3_ENDPOINT,
      ossEndpoint: process.env.OSS_ENDPOINT,
      s3Bucket: process.env.S3_BUCKET,
      ossBucket: process.env.OSS_BUCKET,
      s3Region: process.env.S3_REGION,
      ossRegion: process.env.OSS_REGION,
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

export default nextConfig;
