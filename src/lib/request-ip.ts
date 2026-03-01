const DEFAULT_TRUSTED_IP_HEADERS = [
  "x-real-ip",
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
] as const;

type HeadersSource = Headers | Pick<Request, "headers"> | null | undefined;

function normalizeHeaders(source: HeadersSource): Headers | null {
  if (!source) {
    return null;
  }

  return source instanceof Headers ? source : source.headers;
}

function getTrustedIpHeaderNames(): string[] {
  const configured = process.env.TRUSTED_PROXY_IP_HEADER;
  if (!configured) {
    return [...DEFAULT_TRUSTED_IP_HEADERS];
  }

  const headerNames = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  return headerNames.length > 0 ? headerNames : [...DEFAULT_TRUSTED_IP_HEADERS];
}

function extractIpFromHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const candidate = value
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return candidate ?? null;
}

export function getClientIp(source: HeadersSource): string {
  const headers = normalizeHeaders(source);
  if (!headers) {
    return "unknown";
  }

  for (const headerName of getTrustedIpHeaderNames()) {
    const ip = extractIpFromHeaderValue(headers.get(headerName));
    if (ip) {
      return ip;
    }
  }

  return "unknown";
}
