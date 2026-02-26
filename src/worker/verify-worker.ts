import { PrismaClient } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger";
import { pingServer } from "../lib/mc-ping";
import { getQueueConnection, VERIFY_QUEUE_NAME, type VerifyJobData, type VerifyJobResult } from "../lib/queue";

const prisma = new PrismaClient();

function stripMinecraftFormatting(input: string): string {
  return input.replace(/§[0-9A-FK-ORa-fk-or]/g, "");
}

function collectTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFragments(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectTextFragments(item));
  }

  return [];
}

function buildMotdCandidates(motd: string | null): string[] {
  if (!motd) {
    return [];
  }

  const candidates = new Set<string>();
  const raw = motd.trim();
  if (raw.length > 0) {
    candidates.add(raw);
    candidates.add(stripMinecraftFormatting(raw));
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const flattened = collectTextFragments(parsed).join(" ").trim();
    if (flattened.length > 0) {
      candidates.add(flattened);
      candidates.add(stripMinecraftFormatting(flattened));
    }
  } catch {
    // MOTD 不是 JSON，忽略解析错误。
  }

  return Array.from(candidates);
}

function motdContainsToken(motd: string | null, token: string): boolean {
  const normalizedToken = token.toLowerCase();
  return buildMotdCandidates(motd).some((candidate) => candidate.toLowerCase().includes(normalizedToken));
}

/**
 * 消费 server-verify 队列，通过 MOTD Token 完成服务器认领验证。
 */
export const verifyWorker = new Worker<VerifyJobData, VerifyJobResult>(
  VERIFY_QUEUE_NAME,
  async (job: Job<VerifyJobData>) => {
    const { serverId, address, port, token } = job.data;
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        verifyToken: true,
        verifyExpiresAt: true,
        verifyUserId: true,
      },
    });

    if (!server) {
      return { success: false, reason: "服务器不存在" };
    }

    if (!server.verifyToken || server.verifyToken !== token) {
      return { success: false, reason: "验证码已更新，请重新获取后再验证" };
    }

    if (!server.verifyUserId) {
      return { success: false, reason: "当前验证码缺少认领者，请重新获取" };
    }

    if (!server.verifyExpiresAt || server.verifyExpiresAt.getTime() <= Date.now()) {
      return { success: false, reason: "验证码已过期，请重新生成" };
    }

    const result = await pingServer(address, port);
    if (!result.isOnline) {
      return { success: false, reason: "服务器离线，无法验证" };
    }

    if (!motdContainsToken(result.motd, token)) {
      return { success: false, reason: "MOTD 中未找到验证码" };
    }

    const now = new Date();
    const updateResult = await prisma.server.updateMany({
      where: {
        id: serverId,
        verifyToken: token,
        verifyUserId: server.verifyUserId,
      },
      data: {
        isVerified: true,
        verifiedAt: now,
        ownerId: server.verifyUserId,
        verifyToken: null,
        verifyExpiresAt: null,
        verifyUserId: null,
      },
    });

    if (updateResult.count === 0) {
      const latest = await prisma.server.findUnique({
        where: { id: serverId },
        select: {
          ownerId: true,
          verifyToken: true,
          verifyUserId: true,
        },
      });

      if (
        latest &&
        latest.ownerId === server.verifyUserId &&
        latest.verifyToken === null &&
        latest.verifyUserId === null
      ) {
        return { success: true };
      }

      return { success: false, reason: "验证码已更新，请重新获取后再验证" };
    }

    return { success: true };
  },
  {
    connection: getQueueConnection(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

verifyWorker.on("completed", (job, result) => {
  logger.info("[worker] Verify completed", {
    jobId: job.id,
    serverId: job.data.serverId,
    success: result.success,
    reason: result.reason,
  });
});

verifyWorker.on("failed", (job, err) => {
  logger.error("[worker] Verify failed", {
    jobId: job?.id,
    serverId: job?.data.serverId,
    attemptsMade: job?.attemptsMade,
    error: err.message,
  });
});

verifyWorker.on("error", (err) => {
  logger.error("[worker] Verify worker error", { error: err.message });
});
