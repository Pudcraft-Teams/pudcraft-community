/**
 * 文本内容审查模块（阿里云内容安全 Green 2.0 — TextModeration）
 *
 * 环境变量：
 *   CONTENT_MODERATION_ACCESS_KEY_ID      — 阿里云 AccessKey ID
 *   CONTENT_MODERATION_ACCESS_KEY_SECRET  — 阿里云 AccessKey Secret
 *   CONTENT_MODERATION_ENDPOINT           — API 端点，默认 green-cip.ap-southeast-1.aliyuncs.com
 *   CONTENT_MODERATION_ENABLED            — true | false，默认 true
 */
import { TextModerationRequest } from "@alicloud/green20220302";
import { RuntimeOptions } from "@darabonba/typescript";
import { getGreenClient, isContentModerationEnabled } from "@/lib/alicloud-green";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface ModerationResult {
  passed: boolean;
  reason?: string;
  category?: string;
}

export interface ModerationOptions {
  contentId?: string;
  userId?: string;
  userIp?: string;
}

type ModerationContext = "server" | "modpack" | "username" | "comment";

const CONTEXT_SERVICE: Record<ModerationContext, string> = {
  username: "nickname_detection",
  comment: "comment_detection",
  server: "comment_detection",
  modpack: "comment_detection",
};

const LABEL_NAMES: Record<string, string> = {
  political_content: "涉政",
  sexual_content: "色情",
  profanity: "辱骂",
  contraband: "违禁品",
  ad: "广告",
  violence: "暴力",
  nonsense: "灌水",
  spam: "垃圾信息",
  negative_content: "不良内容",
  cyberbullying: "网络暴力",
  C_customized: "自定义库命中",
};

/** 写入审查日志（失败不阻塞主流程） */
function writeModerationLog(
  contentType: ModerationContext,
  contentSnippet: string,
  passed: boolean,
  aiCategory: string | undefined,
  aiReason: string | undefined,
  options?: ModerationOptions,
): void {
  prisma.moderationLog
    .create({
      data: {
        contentType,
        contentId: options?.contentId ?? null,
        contentSnippet: contentSnippet.slice(0, 500),
        passed,
        aiCategory: aiCategory ?? null,
        aiReason: aiReason ?? null,
        userId: options?.userId ?? null,
        userIp: options?.userIp ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.error("[Moderation] Failed to write log:", err);
    });
}

/** 调用阿里云 Green TextModeration API */
async function callTextModeration(
  content: string,
  service: string,
): Promise<{ passed: boolean; labels?: string; reason?: string }> {
  const client = getGreenClient();
  const request = new TextModerationRequest({
    service,
    serviceParameters: JSON.stringify({ content }),
  });
  const runtime = new RuntimeOptions();

  const response = await client.textModerationWithOptions(request, runtime);
  const body = response.body;

  if (!body || body.code !== 200 || !body.data) {
    logger.warn("[Moderation] Unexpected response", {
      code: body?.code,
      message: body?.message,
      requestId: body?.requestId,
    });
    return { passed: true };
  }

  const labels = body.data.labels?.trim() ?? "";
  if (!labels) {
    return { passed: true };
  }

  const labelList = labels.split(",");
  const category = labelList.map((l) => LABEL_NAMES[l] ?? l).join("、");
  const reason = body.data.reason ?? `包含${category}内容`;

  return { passed: false, labels: category, reason };
}

/**
 * 审查单段文本内容
 */
export async function moderateContent(
  text: string,
  context: ModerationContext = "comment",
  options?: ModerationOptions,
): Promise<ModerationResult> {
  if (!isContentModerationEnabled()) return { passed: true };

  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return { passed: true };

  const maxLength = context === "username" ? 50 : 500;
  const content = trimmed.slice(0, maxLength);

  try {
    const result = await callTextModeration(content, CONTEXT_SERVICE[context]);

    writeModerationLog(context, content, result.passed, result.labels, result.reason, options);

    return {
      passed: result.passed,
      category: result.labels,
      reason: result.reason,
    };
  } catch (error) {
    logger.error("[Moderation] TextModeration API error:", error);
    return { passed: true };
  }
}

/**
 * 批量审查多个字段（合并为一次请求，节省费用）
 */
export async function moderateFields(
  fields: Record<string, string>,
  context: ModerationContext = "comment",
  options?: ModerationOptions,
): Promise<{ passed: boolean; failedField?: string; reason?: string }> {
  if (!isContentModerationEnabled()) return { passed: true };

  const combined = Object.entries(fields)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `【${k}】${v.slice(0, 200)}`)
    .join("\n");

  if (!combined) return { passed: true };

  try {
    const result = await callTextModeration(combined, CONTEXT_SERVICE[context]);

    writeModerationLog(context, combined, result.passed, result.labels, result.reason, options);

    return {
      passed: result.passed,
      failedField: result.labels,
      reason: result.reason,
    };
  } catch (error) {
    logger.error("[Moderation] TextModeration API error:", error);
    return { passed: true };
  }
}
