import type { NextConfig } from "next";

type AllowedRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
};

function normalizeEndpointUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getRemoteImagePatterns(): AllowedRemotePattern[] {
  const baseUrls = [
    process.env.S3_PUBLIC_BASE_URL,
    process.env.OSS_PUBLIC_BASE_URL,
    process.env.S3_ENDPOINT,
    process.env.OSS_ENDPOINT,
  ].filter(
    (value): value is string => Boolean(value),
  );

  const patterns: AllowedRemotePattern[] = [];

  for (const rawUrl of baseUrls) {
    try {
      const parsedUrl = new URL(normalizeEndpointUrl(rawUrl));
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        continue;
      }

      const normalizedPathname = parsedUrl.pathname === "/" ? "/**" : `${parsedUrl.pathname.replace(/\/$/, "")}/**`;

      patterns.push({
        protocol: parsedUrl.protocol.slice(0, -1) as "http" | "https",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        pathname: normalizedPathname,
      });
    } catch {
      continue;
    }
  }

  return patterns;
}

function getRegionalS3BucketPattern(
  bucketValue: string | undefined,
  regionValue: string | undefined,
): AllowedRemotePattern[] {
  const bucket = bucketValue?.trim();
  const region = regionValue?.trim();
  if (!bucket || !region) {
    return [];
  }

  return [
    {
      protocol: "https",
      hostname: `${bucket}.s3.${region}.amazonaws.com`,
      pathname: "/**",
    },
  ];
}

function getEndpointBucketPatterns(
  endpointValue: string | undefined,
  bucketValue: string | undefined,
): AllowedRemotePattern[] {
  const endpoint = endpointValue?.trim();
  if (!endpoint) {
    return [];
  }

  try {
    const parsedUrl = new URL(normalizeEndpointUrl(endpoint));
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return [];
    }

    const normalizedPathname = parsedUrl.pathname === "/" ? "/**" : `${parsedUrl.pathname.replace(/\/$/, "")}/**`;
    const patterns: AllowedRemotePattern[] = [
      {
        protocol: parsedUrl.protocol.slice(0, -1) as "http" | "https",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        pathname: normalizedPathname,
      },
    ];

    const bucket = bucketValue?.trim();
    if (bucket) {
      patterns.push({
        protocol: parsedUrl.protocol.slice(0, -1) as "http" | "https",
        hostname: `${bucket}.${parsedUrl.hostname}`,
        port: parsedUrl.port || undefined,
        pathname: normalizedPathname,
      });
    }

    return patterns;
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      ...getRemoteImagePatterns(),
      ...getRegionalS3BucketPattern(process.env.S3_BUCKET, process.env.S3_REGION),
      ...getEndpointBucketPatterns(process.env.S3_ENDPOINT, process.env.S3_BUCKET),
      ...getEndpointBucketPatterns(process.env.OSS_ENDPOINT, process.env.OSS_BUCKET),
    ],
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
