/**
 * Zod Schema 集合 —— 全部输入校验集中管理。
 * API Route / Worker / 工具函数统一引用此处的 Schema。
 */

import { z } from "zod";

// ─── 基础字段 Schema ─────────────────────────

/** 禁止的主机名模式（防 SSRF：禁止 localhost / 内网 IP / IPv6 回环） */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fd[0-9a-f]{2}:/i,
];

/** Minecraft 服务器主机地址校验（防 SSRF，限制格式） */
export const serverHostSchema = z
  .string()
  .min(1, "主机地址不能为空")
  .max(253, "主机地址过长")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    "无效的主机地址格式",
  )
  .refine(
    (host) => !BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host)),
    "不允许使用本地或内网地址",
  );

/** 端口号校验（1 - 65535） */
export const serverPortSchema = z
  .number()
  .int()
  .min(1, "端口号最小为 1")
  .max(65535, "端口号最大为 65535");

/** 服务器 ID 校验（cuid 格式） */
export const serverIdSchema = z.string().cuid();
/** 用户 ID 校验（cuid 格式） */
export const userIdSchema = z.string().cuid();
/** 整合包 ID 校验（cuid 格式） */
export const modpackIdSchema = z.string().cuid();

const optionalTrimmedText = (max: number, message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(max, message).optional(),
  );

export const modpackLoaderSchema = z.enum(["fabric", "forge", "neoforge", "quilt"]);

// ─── 复合 Schema ─────────────────────────────

/** 创建服务器请求体 */
export const createServerSchema = z.object({
  name: z.string().min(2, "名称至少 2 个字符").max(50, "名称最多 50 个字符"),
  address: serverHostSchema.transform((value) => value.toLowerCase().trim()),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: z.string().trim().min(1, "请输入游戏版本"),
  tags: z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    )
    .refine((tags) => tags.length > 0, "至少选择 1 个服务器类型")
    .refine((tags) => tags.length <= 10, "服务器类型最多 10 个")
    .refine(
      (tags) => tags.every((tag) => tag.length <= 20),
      "服务器类型长度不能超过 20",
    ),
  description: z
    .string()
    .trim()
    .max(200, "简介最多 200 字")
    .optional()
    .or(z.literal("")),
  content: z
    .string()
    .trim()
    .max(10000, "详细介绍最多 10000 字")
    .optional()
    .or(z.literal("")),
  maxPlayers: z.coerce.number().int().min(1).max(10000).optional(),
  qqGroup: z.string().regex(/^\d{5,11}$/, "QQ 群号格式不正确").optional().or(z.literal("")),
});

/** 编辑服务器请求体 */
export const updateServerSchema = createServerSchema.partial().extend({
  removeIcon: z.coerce.boolean().optional().default(false),
});

/** 服务器列表查询参数 */
export const queryServersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  tag: z.string().max(20).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(["newest", "popular", "players", "name"]).default("newest"),
  ownerId: z.string().cuid().optional(),
});

/** 注册请求体 */
export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8, "密码至少 8 位"),
  code: z.string().length(6, "验证码为 6 位数字").regex(/^\d{6}$/),
});

/** 登录请求体 */
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1, "请输入密码"),
});

/** 发送验证码请求体 */
export const sendCodeSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
});

/** 发送重置密码验证码请求体 */
export const sendResetCodeSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
});

/** 重置密码请求体 */
export const resetPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase().trim()),
  code: z.string().length(6, "验证码为 6 位数字").regex(/^\d{6}$/),
  newPassword: z.string().min(8, "密码至少 8 位"),
});

/** 发表评论/回复请求体 */
export const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "评论内容不能为空")
    .max(1000, "评论最多 1000 字"),
  parentId: z.string().cuid().optional(),
});

/** 评论列表查询参数 */
export const queryCommentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** 上传整合包请求体（multipart 文本字段） */
export const uploadModpackSchema = z.object({
  version: optionalTrimmedText(64, "版本号最多 64 个字符"),
  loader: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    modpackLoaderSchema.optional(),
  ),
  gameVersion: optionalTrimmedText(32, "游戏版本最多 32 个字符"),
});

/** 通知列表查询参数 */
export const queryNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

/** 批量标记通知已读 */
export const markNotificationsReadSchema = z.union([
  z.object({
    all: z.literal(true),
  }),
  z.object({
    ids: z.array(z.string().cuid()).min(1, "至少传入一条通知 ID"),
  }),
]);

/** 服务器统计查询参数 */
export const queryServerStatsSchema = z.object({
  period: z.enum(["24h", "7d", "30d"]).default("24h"),
});

/** 资料更新请求体 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "昵称至少 2 个字符")
    .max(20, "昵称最多 20 个字符")
    .optional(),
  bio: z
    .string()
    .trim()
    .max(200, "简介最多 200 字")
    .optional(),
});

/** Ping 结果（Worker 输出校验） */
export const pingResultSchema = z.object({
  online: z.boolean(),
  playerCount: z.number().int().nullable(),
  maxPlayers: z.number().int().nullable(),
  motd: z.string().nullable(),
  favicon: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
});

// ─── 管理后台 Schema ────────────────────────────

/** 管理后台服务器列表查询参数 */
export const adminQueryServersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
  search: z.string().max(100).optional(),
});

/** 管理后台服务器审核操作 */
export const adminServerActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

/** 管理后台用户列表查询参数 */
export const adminQueryUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  banned: z.enum(["all", "normal", "banned"]).default("all"),
  search: z.string().max(100).optional(),
});

/** 管理后台用户封禁/解封操作 */
export const adminUserActionSchema = z.object({
  action: z.enum(["ban", "unban"]),
  reason: z.string().max(500).optional(),
});

// ─── 类型导出 ────────────────────────────────

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type QueryServersInput = z.infer<typeof queryServersSchema>;
export type PingResult = z.infer<typeof pingResultSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type SendResetCodeInput = z.infer<typeof sendResetCodeSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type QueryCommentsInput = z.infer<typeof queryCommentsSchema>;
export type QueryNotificationsInput = z.infer<typeof queryNotificationsSchema>;
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
export type QueryServerStatsInput = z.infer<typeof queryServerStatsSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UploadModpackInput = z.infer<typeof uploadModpackSchema>;
export type AdminQueryServersInput = z.infer<typeof adminQueryServersSchema>;
export type AdminServerActionInput = z.infer<typeof adminServerActionSchema>;
export type AdminQueryUsersInput = z.infer<typeof adminQueryUsersSchema>;
export type AdminUserActionInput = z.infer<typeof adminUserActionSchema>;
