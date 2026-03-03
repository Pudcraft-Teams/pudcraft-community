/**
 * 阿里云内容安全 Green 2.0 — 共享客户端
 *
 * 被 moderation.ts（文本审查）和 image-moderation.ts（图片审查）共同引用。
 */
import GreenClient from "@alicloud/green20220302";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { contentModerationEnv } from "@/lib/env";

let clientInstance: GreenClient | null = null;

export function getGreenClient(): GreenClient {
  if (clientInstance) return clientInstance;

  const config = new $OpenApiUtil.Config({
    accessKeyId: contentModerationEnv.accessKeyId,
    accessKeySecret: contentModerationEnv.accessKeySecret,
    endpoint: contentModerationEnv.endpoint,
    protocol: "https",
  });

  clientInstance = new GreenClient(config);
  return clientInstance;
}

export function isContentModerationEnabled(): boolean {
  return contentModerationEnv.enabled;
}
