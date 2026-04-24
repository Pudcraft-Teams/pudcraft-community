/**
 * Text content moderation (Alibaba Cloud Green 2.0 — TextModeration).
 *
 * Environment variables:
 *   CONTENT_MODERATION_ACCESS_KEY_ID      — Alibaba Cloud AccessKey ID
 *   CONTENT_MODERATION_ACCESS_KEY_SECRET  — Alibaba Cloud AccessKey Secret
 *   CONTENT_MODERATION_ENDPOINT           — API endpoint, default green-cip.ap-southeast-1.aliyuncs.com
 *   CONTENT_MODERATION_ENABLED            — true | false, default true
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

/** Labels that should be ignored per context (server descriptions naturally include
 * marketing copy, so ad/nonsense tags are suppressed). */
const IGNORED_LABELS: Partial<Record<ModerationContext, Set<string>>> = {
  server: new Set(["ad", "nonsense"]),
};

// LABEL_NAMES are human-readable renderings of Alibaba Cloud Green's AI
// classification labels. These strings are NOT general UI copy: they are
// audit metadata persisted to moderation logs and shown verbatim in the
// admin moderation console, where moderators rely on the exact wording as
// part of their review workflow. Translating them here risks breaking
// existing moderator habits and downstream tooling that matches on the
// stored text. Leave as Chinese; revisit only if an explicit moderator
// request surfaces.
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

/** Write the moderation log. Failures here must not block the main flow. */
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

/** Call the Alibaba Cloud Green TextModeration API. */
async function callTextModeration(
  content: string,
  service: string,
  ignoredLabels?: Set<string>,
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

  const labelList = labels.split(",").filter((l) => !ignoredLabels?.has(l));
  if (labelList.length === 0) {
    return { passed: true };
  }

  const category = labelList.map((l) => LABEL_NAMES[l] ?? l).join("、");
  // `reason` is shown to the moderator alongside the stored Chinese labels;
  // keep the phrasing consistent with LABEL_NAMES (see comment above).
  const reason = body.data.reason ?? `包含${category}内容`;

  return { passed: false, labels: category, reason };
}

/**
 * Moderate a single text field.
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
    const result = await callTextModeration(
      content,
      CONTEXT_SERVICE[context],
      IGNORED_LABELS[context],
    );

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
 * Moderate multiple fields in a single batched API request to save cost.
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
    const result = await callTextModeration(
      combined,
      CONTEXT_SERVICE[context],
      IGNORED_LABELS[context],
    );

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
