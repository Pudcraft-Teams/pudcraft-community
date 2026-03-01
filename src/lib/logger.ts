/**
 * 统一日志工具 —— 替代裸 console.log，方便后续接入日志服务。
 * 支持 debug / info / warn / error 四个级别。
 * 通过 LOG_LEVEL 环境变量控制输出级别。
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function isLogLevel(value: string | undefined): value is LogLevel {
  if (!value) {
    return false;
  }

  return value in LOG_LEVELS;
}

const rawLogLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
const currentLevel: LogLevel = isLogLevel(rawLogLevel) ? rawLogLevel : "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${message}`;
  if (meta !== undefined) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", message, meta));
  },
  info(message: string, meta?: unknown) {
    if (shouldLog("info")) console.info(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: unknown) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: unknown) {
    if (shouldLog("error")) console.error(formatMessage("error", message, meta));
  },
};
