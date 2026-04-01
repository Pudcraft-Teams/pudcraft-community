export type StorageImageRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
};

export interface StorageImagePolicyEnv {
  nextPublicSiteUrl?: string;
  nextPublicStoragePublicBaseUrl?: string;
  s3PublicBaseUrl?: string;
  ossPublicBaseUrl?: string;
  s3Endpoint?: string;
  ossEndpoint?: string;
  s3Bucket?: string;
  ossBucket?: string;
  s3Region?: string;
  s3ForcePathStyle?: string;
  ossForcePathStyle?: string;
}

type TrustedStorageUrlRule = {
  origin: string;
  pathnamePrefix: string;
};

function normalizeConfiguredUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parseConfiguredHttpUrl(value: string | undefined): URL | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizeConfiguredUrl(value));
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl;
  } catch {
    return null;
  }
}

function parseExplicitHttpUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl;
  } catch {
    return null;
  }
}

function normalizePatternPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/**` : "/**";
}

function normalizeRulePathPrefix(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "/";
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function createRemotePattern(parsedUrl: URL): StorageImageRemotePattern {
  return {
    protocol: parsedUrl.protocol.slice(0, -1) as "http" | "https",
    hostname: parsedUrl.hostname,
    ...(parsedUrl.port ? { port: parsedUrl.port } : {}),
    pathname: normalizePatternPathname(parsedUrl.pathname),
  };
}

function createTrustedUrlRule(parsedUrl: URL): TrustedStorageUrlRule {
  return {
    origin: parsedUrl.origin,
    pathnamePrefix: normalizeRulePathPrefix(parsedUrl.pathname),
  };
}

function dedupePatterns(patterns: StorageImageRemotePattern[]): StorageImageRemotePattern[] {
  const seen = new Set<string>();
  return patterns.filter((pattern) => {
    const key = `${pattern.protocol}|${pattern.hostname}|${pattern.port ?? ""}|${pattern.pathname}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeRules(rules: TrustedStorageUrlRule[]): TrustedStorageUrlRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.origin}|${rule.pathnamePrefix}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildEndpointRemotePatterns(
  endpointValue: string | undefined,
  bucketValue: string | undefined,
): StorageImageRemotePattern[] {
  const parsedUrl = parseConfiguredHttpUrl(endpointValue);
  if (!parsedUrl) {
    return [];
  }

  const basePattern = createRemotePattern(parsedUrl);
  const patterns = [basePattern];
  const bucket = bucketValue?.trim();
  if (bucket) {
    patterns.push({
      ...basePattern,
      hostname: `${bucket}.${parsedUrl.hostname}`,
    });
  }

  return patterns;
}

function buildEndpointTrustedUrlRules(
  endpointValue: string | undefined,
  bucketValue: string | undefined,
  forcePathStyleValue: string | undefined,
): TrustedStorageUrlRule[] {
  const parsedUrl = parseConfiguredHttpUrl(endpointValue);
  if (!parsedUrl) {
    return [];
  }

  const rules = [createTrustedUrlRule(parsedUrl)];
  const bucket = bucketValue?.trim();
  if (bucket && !parseBooleanEnv(forcePathStyleValue)) {
    rules.push({
      origin: `${parsedUrl.protocol}//${bucket}.${parsedUrl.host}`,
      pathnamePrefix: normalizeRulePathPrefix(parsedUrl.pathname),
    });
  }

  return rules;
}

function buildRegionalS3RemotePattern(
  bucketValue: string | undefined,
  regionValue: string | undefined,
): StorageImageRemotePattern[] {
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

function buildRegionalS3TrustedUrlRule(
  bucketValue: string | undefined,
  regionValue: string | undefined,
): TrustedStorageUrlRule[] {
  const bucket = bucketValue?.trim();
  const region = regionValue?.trim();
  if (!bucket || !region) {
    return [];
  }

  return [
    {
      origin: `https://${bucket}.s3.${region}.amazonaws.com`,
      pathnamePrefix: "/",
    },
  ];
}

export function buildStorageImageRemotePatterns(
  env: StorageImagePolicyEnv,
): StorageImageRemotePattern[] {
  const directUrlPatterns = [
    env.nextPublicStoragePublicBaseUrl,
    env.s3PublicBaseUrl,
    env.ossPublicBaseUrl,
  ]
    .map((value) => parseConfiguredHttpUrl(value))
    .filter((value): value is URL => value !== null)
    .map((parsedUrl) => createRemotePattern(parsedUrl));

  return dedupePatterns([
    ...directUrlPatterns,
    ...buildEndpointRemotePatterns(env.s3Endpoint, env.s3Bucket),
    ...buildEndpointRemotePatterns(env.ossEndpoint, env.ossBucket),
    ...buildRegionalS3RemotePattern(env.s3Bucket, env.s3Region),
  ]);
}

export function buildTrustedStorageUrlRules(env: StorageImagePolicyEnv): Array<{
  origin: string;
  pathnamePrefix: string;
}> {
  const directRules = [
    env.nextPublicSiteUrl,
    env.nextPublicStoragePublicBaseUrl,
    env.s3PublicBaseUrl,
    env.ossPublicBaseUrl,
  ]
    .map((value) => parseConfiguredHttpUrl(value))
    .filter((value): value is URL => value !== null)
    .map((parsedUrl) => createTrustedUrlRule(parsedUrl));

  return dedupeRules([
    ...directRules,
    ...buildEndpointTrustedUrlRules(env.s3Endpoint, env.s3Bucket, env.s3ForcePathStyle),
    ...buildEndpointTrustedUrlRules(env.ossEndpoint, env.ossBucket, env.ossForcePathStyle),
    ...buildRegionalS3TrustedUrlRule(env.s3Bucket, env.s3Region),
  ]);
}

function pathnameMatchesPrefix(pathname: string, pathnamePrefix: string): boolean {
  if (pathnamePrefix === "/") {
    return true;
  }

  return pathname === pathnamePrefix.slice(0, -1) || pathname.startsWith(pathnamePrefix);
}

export function isAllowedStorageImageUrl(url: string, env: StorageImagePolicyEnv): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  const parsedUrl = parseExplicitHttpUrl(url);
  if (!parsedUrl) {
    return false;
  }

  return buildTrustedStorageUrlRules(env).some(
    (rule) =>
      parsedUrl.origin === rule.origin &&
      pathnameMatchesPrefix(parsedUrl.pathname, rule.pathnamePrefix),
  );
}
