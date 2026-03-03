/**
 * 图片内容审查模块（阿里云内容安全 Green 2.0 — ImageModeration）
 *
 * 使用 imageUrl 方式调用（图片需先上传并取得公网可访问 URL）。
 *
 * 环境变量与文本审查共享：
 *   CONTENT_MODERATION_ACCESS_KEY_ID      — 阿里云 AccessKey ID
 *   CONTENT_MODERATION_ACCESS_KEY_SECRET  — 阿里云 AccessKey Secret
 *   CONTENT_MODERATION_ENDPOINT           — API 端点，默认 green-cip.cn-shenzhen.aliyuncs.com
 *   CONTENT_MODERATION_ENABLED            — true | false，默认 true
 */
import { randomUUID } from "crypto";
import { ImageModerationRequest } from "@alicloud/green20220302";
import { RuntimeOptions } from "@darabonba/typescript";
import { getGreenClient, isContentModerationEnabled } from "@/lib/alicloud-green";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import type { ModerationOptions, ModerationResult } from "@/lib/moderation";

export type { ModerationOptions, ModerationResult };

export type ImageModerationContext = "avatar" | "server-icon" | "editor-image";

const LABEL_NAMES: Record<string, string> = {
  porn: "色情",
  terrorism: "暴恐",
  ad: "广告",
  live: "不良场景",
  logo: "特殊标识",
  weapon: "武器",
  politics: "涉政",
  others: "其他违规",
};

// ─── 审查日志（异步写入，不阻塞主流程） ──────────────

function writeImageModerationLog(
  context: ImageModerationContext,
  passed: boolean,
  label: string | undefined,
  description: string | undefined,
  options?: ModerationOptions,
): void {
  prisma.moderationLog
    .create({
      data: {
        contentType: context,
        contentId: options?.contentId ?? null,
        contentSnippet: `[image:${context}]`,
        passed,
        aiCategory: label ?? null,
        aiReason: description ?? null,
        userId: options?.userId ?? null,
        userIp: options?.userIp ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.error("[ImageModeration] Failed to write log:", err);
    });
}

// ─── 对外接口 ─────────────────────────────────────────

/**
 * 审查已上传图片（通过公网 URL），返回审查结果。
 * 禁用、无 URL 或 API 异常时优雅降级，返回 { passed: true }。
 */
export async function moderateImage(
  imageUrl: string,
  context: ImageModerationContext,
  options?: ModerationOptions,
): Promise<ModerationResult> {
  if (!isContentModerationEnabled()) {
    return { passed: true };
  }

  if (!imageUrl) {
    logger.warn("[ImageModeration] No imageUrl provided, skipping moderation");
    return { passed: true };
  }

  try {
    const client = getGreenClient();
    const dataId = randomUUID();

    const request = new ImageModerationRequest({
      service: "baselineCheck",
      serviceParameters: JSON.stringify({
        dataId,
        imageUrl,
      }),
    });
    const runtime = new RuntimeOptions();

    const response = await client.imageModerationWithOptions(request, runtime);
    if (!response.body) {
      logger.warn("[ImageModeration] Empty response body");
      return { passed: true };
    }
    return processResponse(response.body, context, options);
  } catch (error) {
    logger.error("[ImageModeration] API call failed:", error);
    return { passed: true };
  }
}

function processResponse(
  body: {
    code?: number;
    msg?: string;
    requestId?: string;
    data?: {
      result?: Array<{ label?: string; confidence?: number; description?: string }>;
    };
  },
  context: ImageModerationContext,
  options?: ModerationOptions,
): ModerationResult {
  if (body.code !== 200 || !body.data?.result) {
    logger.warn("[ImageModeration] Unexpected response", {
      code: body.code,
      msg: body.msg,
      requestId: body.requestId,
    });
    return { passed: true };
  }

  const unsafeResults = body.data.result.filter(
    (r) => r.label !== "nonLabel" && (r.confidence ?? 0) > 50,
  );

  if (unsafeResults.length === 0) {
    writeImageModerationLog(context, true, undefined, undefined, options);
    return { passed: true };
  }

  const worst = unsafeResults.reduce((a, b) =>
    (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a,
  );
  const category = LABEL_NAMES[worst.label ?? ""] ?? worst.label ?? "违规";
  const reason = worst.description ?? `图片包含${category}内容`;

  writeImageModerationLog(context, false, category, reason, options);

  return { passed: false, category, reason };
}
