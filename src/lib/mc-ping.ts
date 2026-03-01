import { status as javaStatus } from "minecraft-server-util";

export interface PingResult {
  isOnline: boolean;
  playerCount: number;
  maxPlayers: number;
  version: string | null;
  motd: string | null;
  error: string | null;
}

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 300;
const DEFAULT_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isRetryableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("socket closed unexpectedly") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("timeout") ||
    normalized.includes("connection")
  );
}

function resolveMotd(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw;
  }

  if (typeof raw === "object" && raw !== null) {
    if ("clean" in raw) {
      const clean = (raw as { clean?: unknown }).clean;
      if (Array.isArray(clean)) {
        return clean.join(" ").trim() || null;
      }
      if (typeof clean === "string") {
        return clean;
      }
    }

    if ("raw" in raw) {
      const rawText = (raw as { raw?: unknown }).raw;
      if (typeof rawText === "string") {
        return rawText;
      }
    }

    if ("toString" in raw && typeof (raw as { toString: () => string }).toString === "function") {
      return (raw as { toString: () => string }).toString();
    }
  }

  return null;
}

/**
 * Java 版服务器 Ping（超时 5 秒）。
 * 失败时不抛异常，返回离线结果。
 */
export async function pingServer(address: string, port: number): Promise<PingResult> {
  let lastErrorMessage = "Unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await javaStatus(address, port, { timeout: DEFAULT_TIMEOUT_MS });

      return {
        isOnline: true,
        playerCount: response.players.online,
        maxPlayers: response.players.max,
        version: response.version.name ?? null,
        motd: resolveMotd(response.motd),
        error: null,
      };
    } catch (error) {
      lastErrorMessage = normalizeErrorMessage(error);
      const shouldRetry = attempt < MAX_ATTEMPTS && isRetryableError(lastErrorMessage);

      if (!shouldRetry) {
        break;
      }

      await sleep(BASE_RETRY_DELAY_MS * attempt);
    }
  }

  return {
    isOnline: false,
    playerCount: 0,
    maxPlayers: 0,
    version: null,
    motd: null,
    error: lastErrorMessage,
  };
}
