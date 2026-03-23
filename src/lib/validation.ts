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

/** 服务器 ID 校验（cuid 格式，内部使用） */
export const serverIdSchema = z.string().cuid();
/** 用户 ID 校验（cuid 格式，内部使用） */
export const userIdSchema = z.string().cuid();
/** 整合包 ID 校验（cuid 格式） */
export const modpackIdSchema = z.string().cuid();

/** 服务器 URL 参数校验（CUID 或 6 位 PSID） */
export const serverLookupIdSchema = z
  .string()
  .refine((v) => /^\d{6}$/.test(v) || z.string().cuid().safeParse(v).success, "无效的服务器 ID");

/** 用户 URL 参数校验（CUID 或 9 位 UID） */
export const userLookupIdSchema = z
  .string()
  .refine((v) => /^\d{9}$/.test(v) || z.string().cuid().safeParse(v).success, "无效的用户 ID");

const optionalTrimmedText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(max, message).optional());

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
    .refine((tags) => tags.every((tag) => tag.length <= 20), "服务器类型长度不能超过 20"),
  description: z.string().trim().max(200, "简介最多 200 字").optional().or(z.literal("")),
  content: z.string().trim().max(10000, "详细介绍最多 10000 字").optional().or(z.literal("")),
  maxPlayers: z.coerce.number().int().min(1).max(10000).optional(),
  qqGroup: z
    .string()
    .regex(/^\d{5,11}$/, "QQ 群号格式不正确")
    .optional()
    .or(z.literal("")),
  visibility: z.enum(["public", "private"]).optional(),
});

/** 编辑服务器请求体 */
export const updateServerSchema = createServerSchema.omit({ visibility: true }).partial().extend({
  removeIcon: z.coerce.boolean().optional().default(false),
});

// ─── 私域服务器 Schema ──────────────────────────

/** 服务器可见性 */
export const serverVisibilitySchema = z.enum(["public", "private", "unlisted"]);

/** 服务器加入模式 */
export const serverJoinModeSchema = z.enum(["open", "apply", "invite", "apply_and_invite"]);

/** 申请表单字段配置（单个字段） */
const applicationFormFieldSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "textarea", "select", "multiselect"]),
  required: z.boolean().default(true),
  options: z.array(z.string().max(100)).max(20).optional(),
  placeholder: z.string().max(200).optional(),
});

/** 服务器私域设置 */
export const updateServerSettingsSchema = z.object({
  visibility: serverVisibilitySchema.optional(),
  discoverable: z.boolean().optional(),
  joinMode: serverJoinModeSchema.optional(),
  applicationForm: z.array(applicationFormFieldSchema).max(10).nullable().optional(),
});

/** 提交入服申请 */
export const createApplicationSchema = z.object({
  formData: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  mcUsername: z
    .string()
    .min(3, "MC 用户名至少 3 个字符")
    .max(16, "MC 用户名最多 16 个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "MC 用户名只能包含字母、数字和下划线"),
});

/** 审批申请 */
export const reviewApplicationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(500).optional(),
});

/** 生成邀请码 */
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
});

/** 使用邀请码加入 */
export const joinByInviteSchema = z.object({
  mcUsername: z
    .string()
    .min(3, "MC 用户名至少 3 个字符")
    .max(16, "MC 用户名最多 16 个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "MC 用户名只能包含字母、数字和下划线"),
});

/** 插件握手 */
export const syncHandshakeSchema = z.object({
  apiKey: z.string().min(1),
  pluginVersion: z.string().max(50).optional(),
});

/** 插件状态上报 */
export const statusReportSchema = z.object({
  online: z.boolean(),
  playerCount: z.number().int().min(0),
  maxPlayers: z.number().int().min(0),
  tps: z.number().min(0).max(20).optional(),
  memoryUsed: z.number().int().min(0).optional(),
  memoryMax: z.number().int().min(0).optional(),
  version: z.string().max(128).optional(),
});

/** 申请列表查询参数 */
export const queryApplicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "approved", "rejected"]).default("pending"),
});

/** 成员列表查询参数 */
export const queryMembersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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
  code: z
    .string()
    .length(6, "验证码为 6 位数字")
    .regex(/^\d{6}$/),
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
  code: z
    .string()
    .length(6, "验证码为 6 位数字")
    .regex(/^\d{6}$/),
  newPassword: z.string().min(8, "密码至少 8 位"),
});

/** 发表评论/回复请求体 */
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "评论内容不能为空").max(1000, "评论最多 1000 字"),
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
  loader: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, modpackLoaderSchema.optional()),
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
  name: z.string().trim().min(2, "昵称至少 2 个字符").max(20, "昵称最多 20 个字符").optional(),
  bio: z.string().trim().max(200, "简介最多 200 字").optional(),
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
  status: z.enum(["all", "pending", "approved", "rejected", "unreviewed", "reviewed", "reported"]).default("all"),
  search: z.string().max(100).optional(),
});

/** 管理后台服务器审核操作 */
export const adminServerActionSchema = z.object({
  action: z.enum(["approve", "reject", "review"]),
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

/** 管理后台审查日志列表查询参数 */
export const adminQueryModerationLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filter: z.enum(["all", "failed", "passed", "unreviewed"]).default("failed"),
  type: z.enum(["all", "server", "modpack", "username", "comment"]).default("all"),
});

/** 管理后台审查日志操作 */
export const adminModerationLogActionSchema = z.object({
  reviewed: z.boolean().optional(),
  adminNote: z.string().max(500).optional(),
});

// ─── 更新日志 Schema ────────────────────────────

/** 更新日志类型枚举 */
export const changelogTypeSchema = z.enum(["feature", "fix", "improvement", "other"]);

/** 公开更新日志列表查询参数 */
export const queryChangelogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** 管理后台更新日志列表查询参数 */
export const adminQueryChangelogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  published: z.enum(["all", "published", "draft"]).default("all"),
});

/** 创建更新日志请求体 */
export const createChangelogSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(100, "标题最多 100 字"),
  content: z.string().trim().min(1, "内容不能为空").max(20000, "内容最多 20000 字"),
  type: changelogTypeSchema.default("feature"),
  published: z.boolean().default(false),
});

/** 更新更新日志请求体 */
export const updateChangelogSchema = createChangelogSchema.partial();

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
export type AdminQueryModerationLogsInput = z.infer<typeof adminQueryModerationLogsSchema>;
export type AdminModerationLogActionInput = z.infer<typeof adminModerationLogActionSchema>;
export type QueryChangelogsInput = z.infer<typeof queryChangelogsSchema>;
export type AdminQueryChangelogsInput = z.infer<typeof adminQueryChangelogsSchema>;
export type CreateChangelogInput = z.infer<typeof createChangelogSchema>;
export type UpdateChangelogInput = z.infer<typeof updateChangelogSchema>;
export type ServerVisibility = z.infer<typeof serverVisibilitySchema>;
export type ServerJoinMode = z.infer<typeof serverJoinModeSchema>;
export type UpdateServerSettingsInput = z.infer<typeof updateServerSettingsSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type JoinByInviteInput = z.infer<typeof joinByInviteSchema>;
export type SyncHandshakeInput = z.infer<typeof syncHandshakeSchema>;
export type StatusReportInput = z.infer<typeof statusReportSchema>;
export type QueryApplicationsInput = z.infer<typeof queryApplicationsSchema>;
export type QueryMembersInput = z.infer<typeof queryMembersSchema>;

// ─── 论坛 Schema ──────────────────────────────

/** 圈子 slug 校验（小写字母、数字、连字符，不能以连字符开头或结尾） */
export const circleSlugSchema = z
  .string()
  .trim()
  .min(2, "至少 2 个字符")
  .max(30, "最多 30 个字符")
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "只能包含小写字母、数字和连字符，不能以连字符开头或结尾",
  );

/** 创建圈子请求体 */
export const createCircleSchema = z.object({
  name: z.string().trim().min(1, "请输入圈子名称").max(50, "最多 50 个字符"),
  slug: circleSlugSchema,
  description: z.string().trim().max(500, "最多 500 个字符").optional(),
});

/** 更新圈子请求体 */
export const updateCircleSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().url().optional().nullable(),
  banner: z.string().url().optional().nullable(),
});

/** 创建板块请求体 */
export const createSectionSchema = z.object({
  name: z.string().trim().min(1, "请输入板块名称").max(30, "最多 30 个字符"),
  description: z.string().trim().max(200, "最多 200 个字符").optional(),
  sortOrder: z.number().int().min(0).default(0),
});

/** 更新板块请求体 */
export const updateSectionSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  description: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** 创建帖子请求体 */
export const createPostSchema = z.object({
  title: z.string().trim().max(100, "标题最多 100 个字符").optional().default(""),
  content: z.string().trim().min(1, "请输入内容").max(50000, "内容最多 50000 个字符"),
  circleId: z.string().cuid().optional().nullable(),
  sectionId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(5).optional().default([]),
  images: z.array(z.string().url().max(500)).max(9).optional().default([]),
});

/** 更新帖子请求体 */
export const updatePostSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(50000).optional(),
  sectionId: z.string().cuid().optional().nullable(),
});

/** 发表论坛评论/回复请求体 */
export const createForumCommentSchema = z.object({
  content: z.string().trim().min(1, "请输入评论内容").max(5000, "评论最多 5000 个字符"),
  parentCommentId: z.string().cuid().optional().nullable(),
});

/** 圈子封禁用户请求体 */
export const createCircleBanSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/** 帖子 Feed 查询参数 */
export const feedQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  circleId: z.string().cuid().optional(),
  sectionId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
});

/** 圈子列表查询参数 */
export const circleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["popular", "newest"]).default("popular"),
});

/** 论坛评论列表查询参数 */
export const commentQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

// ─── 论坛类型导出 ─────────────────────────────

export type CreateCircleInput = z.infer<typeof createCircleSchema>;
export type UpdateCircleInput = z.infer<typeof updateCircleSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateForumCommentInput = z.infer<typeof createForumCommentSchema>;
export type CreateCircleBanInput = z.infer<typeof createCircleBanSchema>;

// ─── 管理后台话题 Schema ─────────────────────────

/** 管理后台话题列表查询参数 */
export const adminQueryTagsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(100).optional(),
});

/** 管理后台更新话题请求体 */
export const adminUpdateTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "名称不能为空")
    .max(50, "最多 50 个字符")
    .transform((v) => v.toLowerCase())
    .optional(),
  displayName: z.string().trim().min(1, "显示名称不能为空").max(50, "最多 50 个字符").optional(),
  aliases: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

/** 管理后台合并话题请求体 */
export const adminMergeTagsSchema = z.object({
  sourceId: z.string().cuid(),
  targetId: z.string().cuid(),
});

/** 搜索查询参数 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "搜索关键词不能为空").max(100),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;
export type CircleListQueryInput = z.infer<typeof circleListQuerySchema>;
export type CommentQueryInput = z.infer<typeof commentQuerySchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type AdminQueryTagsInput = z.infer<typeof adminQueryTagsSchema>;
export type AdminUpdateTagInput = z.infer<typeof adminUpdateTagSchema>;
export type AdminMergeTagsInput = z.infer<typeof adminMergeTagsSchema>;

// ─── 举报 ───

export const reportCategoryEnum = z.enum([
  "misinformation",
  "pornography",
  "harassment",
  "fraud",
  "other",
]);

export const createReportSchema = z.object({
  targetType: z.enum(["server", "comment", "user"]),
  targetId: z.string().min(1),
  category: reportCategoryEnum,
  description: z.string().max(500).optional(),
});

export const adminQueryReportsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "resolved", "dismissed"]).default("pending"),
  targetType: z.enum(["all", "server", "comment", "user"]).default("all"),
});

export const adminReportActionSchema = z.object({
  action: z.enum(["dismiss", "resolve"]),
  actions: z.array(z.enum(["warn", "takedown", "ban_user"])).optional(),
  adminNote: z.string().max(500).optional(),
});
