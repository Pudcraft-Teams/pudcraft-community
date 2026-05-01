/**
 * Central collection of Zod schemas — all input validation lives here.
 * API routes / workers / utility helpers all reference these schemas.
 *
 * Field-specific validation messages use `errors.validation.<area>.<key>`
 * paths; the Route Handler serializes them via
 * `flattenZodErrorWithLocale` (or `translateZodIssues`) from
 * `@/lib/i18nZod`. Inline messages bypass Zod's `errorMap`, so translation
 * happens at serialization time.
 */

import { z } from "zod";

// ─── Base field schemas ─────────────────────────

/** Host patterns that must be rejected (SSRF defense: blocks localhost / private IPs / IPv6 loopback). */
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

/** Minecraft server host validation (SSRF defense + format restriction). */
export const serverHostSchema = z
  .string()
  .min(1, "errors.validation.servers.hostRequired")
  .max(253, "errors.validation.servers.hostTooLong")
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    "errors.validation.servers.hostFormat",
  )
  .refine(
    (host) => !BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host)),
    "errors.validation.servers.hostBlocked",
  );

/** Port validation (1 – 65535). */
export const serverPortSchema = z
  .number()
  .int()
  .min(1, "errors.validation.servers.portMin")
  .max(65535, "errors.validation.servers.portMax");

/** Server ID validation (cuid; internal use). */
export const serverIdSchema = z.string().cuid();
/** User ID validation (cuid; internal use). */
export const userIdSchema = z.string().cuid();
/** Modpack ID validation (cuid). */
export const modpackIdSchema = z.string().cuid();

/** Server URL parameter validation (CUID or 6-digit PSID). */
export const serverLookupIdSchema = z
  .string()
  .refine(
    (v) => /^\d{6}$/.test(v) || z.string().cuid().safeParse(v).success,
    "errors.validation.servers.invalidId",
  );

/**
 * User URL parameter validation. Accepts:
 *   - Misskey aid (10–32 alphanumeric)
 *   - Local cuid (legacy direct lookups)
 *   - Legacy placeholder `legacy-{cuid|numeric}` produced by the
 *     20260429120000_replace_credentials_with_misskey migration. Without
 *     this branch every link to a pre-MiAuth account 400s before the
 *     lookup helper can resolve it.
 */
export const userLookupIdSchema = z
  .string()
  .refine(
    (v) =>
      /^[a-z0-9]{10,32}$/i.test(v) ||
      /^legacy-[a-z0-9]{1,40}$/i.test(v) ||
      z.string().cuid().safeParse(v).success,
    "errors.validation.servers.invalidUserId",
  );

const optionalTrimmedText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(max, message).optional());

export const modpackLoaderSchema = z.enum(["fabric", "forge", "neoforge", "quilt"]);

// ─── Composite schemas ─────────────────────────────

/** Create server request body. */
export const createServerSchema = z.object({
  name: z
    .string()
    .min(2, "errors.validation.servers.nameMin")
    .max(50, "errors.validation.servers.nameMax"),
  address: serverHostSchema.transform((value) => value.toLowerCase().trim()),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: z.string().trim().min(1, "errors.validation.servers.versionRequired"),
  tags: z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    )
    .refine((tags) => tags.length > 0, "errors.validation.servers.tagsMin")
    .refine((tags) => tags.length <= 10, "errors.validation.servers.tagsMax")
    .refine(
      (tags) => tags.every((tag) => tag.length <= 20),
      "errors.validation.servers.tagLengthMax",
    ),
  description: z
    .string()
    .trim()
    .max(200, "errors.validation.servers.descriptionMax")
    .optional()
    .or(z.literal("")),
  content: z
    .string()
    .trim()
    .max(10000, "errors.validation.servers.contentMax")
    .optional()
    .or(z.literal("")),
  maxPlayers: z.coerce.number().int().min(1).max(10000).optional(),
  qqGroup: z
    .string()
    .regex(/^\d{5,11}$/, "errors.validation.servers.qqGroupFormat")
    .optional()
    .or(z.literal("")),
  visibility: z.enum(["public", "private"]).optional(),
});

/** Edit server request body. */
export const updateServerSchema = createServerSchema.omit({ visibility: true }).partial().extend({
  removeIcon: z.coerce.boolean().optional().default(false),
});

// ─── Private server schemas ──────────────────────────

/** Server visibility. */
export const serverVisibilitySchema = z.enum(["public", "private", "unlisted"]);

/** Server join mode. */
export const serverJoinModeSchema = z.enum(["open", "apply", "invite", "apply_and_invite"]);

/**
 * Application form option config (single option for select/multiselect).
 * Accepts either the legacy `string` shape (treated as `{ value, label }`) or
 * the v1 object shape with optional gating metadata that the runtime
 * normalizer in src/lib/applicationFormDocument.ts already understands.
 */
const applicationFormOptionSchema = z.union([
  z.string().min(1).max(100),
  z.object({
    value: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    points: z.number().int().min(-99).max(99).optional(),
    correct: z.boolean().optional(),
    autoReject: z.boolean().optional(),
  }),
]);

/** Application form field config (single field). */
const applicationFormFieldSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  type: z.enum(["text", "textarea", "select", "multiselect"]),
  required: z.boolean().default(true),
  options: z.array(applicationFormOptionSchema).max(20).optional(),
  placeholder: z.string().max(200).optional(),
});

/** Form-level scoring + transparency settings (v1 OwnerFormConfig.settings). */
const applicationFormSettingsSchema = z.object({
  // Whole-percent threshold (0–100). `null` disables the gate.
  passingScore: z.number().int().min(0).max(100).nullable().optional(),
  showScoreToPlayerOnReject: z.boolean().optional(),
  showRejectReasonToPlayerOnReject: z.boolean().optional(),
});

/** Branching rule (v1 OwnerFormConfig.branching item). */
const applicationFormBranchingRuleSchema = z.object({
  targetFieldKey: z.string().min(1).max(50),
  whenFieldKey: z.string().min(1).max(50),
  allowedValues: z.array(z.string().min(1).max(100)).min(1).max(20),
});

/** v1 OwnerFormConfig document — fields + scoring settings + branching graph. */
const applicationFormDocumentSchema = z.object({
  version: z.literal(1),
  fields: z.array(applicationFormFieldSchema).max(100),
  settings: applicationFormSettingsSchema.optional(),
  branching: z.array(applicationFormBranchingRuleSchema).max(100).optional(),
});

/** Server private settings. */
export const updateServerSettingsSchema = z.object({
  visibility: serverVisibilitySchema.optional(),
  discoverable: z.boolean().optional(),
  joinMode: serverJoinModeSchema.optional(),
  applicationForm: z
    .union([
      z.array(applicationFormFieldSchema).max(30),
      applicationFormDocumentSchema,
    ])
    .nullable()
    .optional(),
});

/** Submit join application. */
export const createApplicationSchema = z.object({
  formData: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  mcUsername: z
    .string()
    .min(3, "errors.validation.servers.mcUsernameMin")
    .max(16, "errors.validation.servers.mcUsernameMax")
    .regex(/^[a-zA-Z0-9_]+$/, "errors.validation.servers.mcUsernameFormat"),
});

/** Review application. */
export const reviewApplicationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(500).optional(),
});

/** Generate invite code. */
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
  expiresInHours: z.number().int().min(1).max(720).nullable().optional(),
});

/** Join by invite code. */
export const joinByInviteSchema = z.object({
  mcUsername: z
    .string()
    .min(3, "errors.validation.servers.mcUsernameMin")
    .max(16, "errors.validation.servers.mcUsernameMax")
    .regex(/^[a-zA-Z0-9_]+$/, "errors.validation.servers.mcUsernameFormat"),
});

/** Plugin handshake. */
export const syncHandshakeSchema = z.object({
  apiKey: z.string().min(1),
  pluginVersion: z.string().max(50).optional(),
});

/** Plugin status report. */
export const statusReportSchema = z.object({
  online: z.boolean(),
  playerCount: z.number().int().min(0),
  maxPlayers: z.number().int().min(0),
  tps: z.number().min(0).max(20).optional(),
  memoryUsed: z.number().int().min(0).optional(),
  memoryMax: z.number().int().min(0).optional(),
  version: z.string().max(128).optional(),
});

/** Application list query params. */
export const queryApplicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "approved", "rejected"]).default("pending"),
});

/** Member list query params. */
export const queryMembersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Server list query params. */
export const queryServersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  tag: z.string().max(20).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(["newest", "popular", "players", "name"]).default("newest"),
  ownerId: z.string().cuid().optional(),
});

/** Post a comment / reply. */
export const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "errors.validation.comments.contentRequired")
    .max(1000, "errors.validation.comments.contentMax"),
  parentId: z.string().cuid().optional(),
});

/** Comment list query params. */
export const queryCommentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Upload modpack request body (multipart text fields). */
export const uploadModpackSchema = z.object({
  version: optionalTrimmedText(64, "errors.validation.modpacks.versionMax"),
  loader: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, modpackLoaderSchema.optional()),
  gameVersion: optionalTrimmedText(32, "errors.validation.modpacks.gameVersionMax"),
});

/** Notification list query params. */
export const queryNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

/** Batch mark notifications read. */
export const markNotificationsReadSchema = z.union([
  z.object({
    all: z.literal(true),
  }),
  z.object({
    ids: z.array(z.string().cuid()).min(1, "errors.validation.notifications.idsRequired"),
  }),
]);

/** Server stats query params. */
export const queryServerStatsSchema = z.object({
  period: z.enum(["24h", "7d", "30d"]).default("24h"),
});

/** Profile update request body. */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "errors.validation.user.nameMin")
    .max(20, "errors.validation.user.nameMax")
    .optional(),
  bio: z.string().trim().max(200, "errors.validation.user.bioMax").optional(),
});

/** Ping result (Worker output validation). */
export const pingResultSchema = z.object({
  online: z.boolean(),
  playerCount: z.number().int().nullable(),
  maxPlayers: z.number().int().nullable(),
  motd: z.string().nullable(),
  favicon: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
});

// ─── Admin-console schemas ────────────────────────────

/** Admin console server list query params. */
export const adminQueryServersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "approved", "rejected", "unreviewed", "reviewed", "reported"]).default("all"),
  search: z.string().max(100).optional(),
});

/** Admin console server review action. */
export const adminServerActionSchema = z.object({
  action: z.enum(["approve", "reject", "review"]),
  reason: z.string().max(500).optional(),
});

/** Admin console server field-level patch (isVerified toggle, ownerId assignment). */
export const adminServerPatchSchema = z.object({
  isVerified: z.boolean().optional(),
  ownerId: z.string().nullable().optional(),
}).refine((d) => d.isVerified !== undefined || d.ownerId !== undefined, {
  message: "At least one field (isVerified or ownerId) must be provided",
});

/** Admin console user list query params. */
export const adminQueryUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  banned: z.enum(["all", "normal", "banned"]).default("all"),
  search: z.string().max(100).optional(),
});

/** Admin console user ban / unban action. */
export const adminUserActionSchema = z.object({
  action: z.enum(["ban", "unban"]),
  reason: z.string().max(500).optional(),
});

/** Admin console moderation log list query params. */
export const adminQueryModerationLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filter: z.enum(["all", "failed", "passed", "unreviewed"]).default("failed"),
  type: z.enum(["all", "server", "modpack", "username", "comment"]).default("all"),
});

/** Admin console moderation log action. */
export const adminModerationLogActionSchema = z.object({
  reviewed: z.boolean().optional(),
  adminNote: z.string().max(500).optional(),
});

// ─── Changelog schemas ────────────────────────────

/** Changelog type enum. */
export const changelogTypeSchema = z.enum(["feature", "fix", "improvement", "other"]);

/** Public changelog list query params. */
export const queryChangelogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Admin console changelog list query params. */
export const adminQueryChangelogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  published: z.enum(["all", "published", "draft"]).default("all"),
});

/** Create changelog request body. */
export const createChangelogSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "errors.validation.changelog.titleRequired")
    .max(100, "errors.validation.changelog.titleMax"),
  content: z
    .string()
    .trim()
    .min(1, "errors.validation.changelog.contentRequired")
    .max(20000, "errors.validation.changelog.contentMax"),
  type: changelogTypeSchema.default("feature"),
  published: z.boolean().default(false),
});

/** Update changelog request body. */
export const updateChangelogSchema = createChangelogSchema.partial();

// ─── Type exports ────────────────────────────────

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type QueryServersInput = z.infer<typeof queryServersSchema>;
export type PingResult = z.infer<typeof pingResultSchema>;
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

// ─── Report schemas ─────────────────────────

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
