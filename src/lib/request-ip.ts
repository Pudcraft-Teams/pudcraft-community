import { isIP } from "node:net";

const DEFAULT_TRUSTED_IP_HEADERS = [
  "x-real-ip",
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
  "x-forwarded-for",
] as const;

type HeadersSource = Headers | Pick<Request, "headers"> | null | undefined;

const SUPPORTED_TRUSTED_IP_HEADERS = new Set<string>(DEFAULT_TRUSTED_IP_HEADERS);

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
    .filter((value) => value.length > 0 && SUPPORTED_TRUSTED_IP_HEADERS.has(value));

  return headerNames.length > 0 ? headerNames : [...DEFAULT_TRUSTED_IP_HEADERS];
}

function normalizeIpCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const bracketedMatch = trimmed.match(/^\[([^[\]]+)\](?::\d+)?$/);
  if (bracketedMatch && isIP(bracketedMatch[1]) > 0) {
    return bracketedMatch[1];
  }

  if (isIP(trimmed) > 0) {
    return trimmed;
  }

  const hostPortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (hostPortMatch && isIP(hostPortMatch[1]) > 0) {
    return hostPortMatch[1];
  }

  return null;
}

function selectTrustedIpCandidate(headerName: string, candidates: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  if (headerName.includes("forwarded-for")) {
    return candidates[0] ?? null;
  }

  return candidates.at(-1) ?? null;
}

function extractIpFromHeaderValue(headerName: string, value: string | null): string | null {
  if (!value) {
    return null;
  }

  const candidates = value
    .split(",")
    .map((part) => part.trim())
    .map((part) => normalizeIpCandidate(part))
    .filter((part): part is string => part !== null);

  return selectTrustedIpCandidate(headerName, candidates);
}

export function getClientIp(source: HeadersSource): string {
  const headers = normalizeHeaders(source);
  if (!headers) {
    return "unknown";
  }

  for (const headerName of getTrustedIpHeaderNames()) {
    const ip = extractIpFromHeaderValue(headerName, headers.get(headerName));
    if (ip) {
      return ip;
    }
  }

  return "unknown";
}

export function getForwardedClientIpHeaders(source: HeadersSource): Record<string, string> {
  const headers = normalizeHeaders(source);
  if (!headers) {
    return {};
  }

  const forwardedHeaders: Record<string, string> = {};

  for (const headerName of getTrustedIpHeaderNames()) {
    const ip = extractIpFromHeaderValue(headerName, headers.get(headerName));
    if (ip) {
      forwardedHeaders[headerName] = ip;
    }
  }

  return forwardedHeaders;
}
