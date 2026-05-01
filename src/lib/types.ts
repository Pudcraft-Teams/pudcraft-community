/**
 * 共享类型定义 —— API 响应格式。
 * 前端组件与 API Route 统一引用此处的类型。
 */

/** 服务器状态（来自最新的 ServerStatus 记录） */
export interface ServerStatusResponse {
  online: boolean;
  playerCount: number | null;
  maxPlayers: number | null;
  motd: string | null;
  favicon: string | null;
  checkedAt: string;
  isStale: boolean;
}

/** 服务器列表项（不含 content，用于卡片展示） */
export interface ServerListItem {
  id: string;
  psid: number;
  name: string;
  host: string;
  port: number;
  description: string | null;
  tags: string[];
  iconUrl?: string | null;
  favoriteCount?: number;
  isVerified: boolean;
  verifiedAt: string | null;
  status: ServerStatusResponse;
  /** 审核状态：pending / approved / rejected */
  reviewStatus?: string;
  /** 拒绝原因 */
  rejectReason?: string | null;
  /** Server visibility */
  visibility?: ServerVisibility;
  /** Join mode for private servers */
  joinMode?: ServerJoinMode;
  /** Whether current user is a member (for address visibility) */
  isMember?: boolean;
}

/** 服务器详情（含 content，用于详情页） */
export interface ServerDetail extends ServerListItem {
  ownerId: string | null;
  content: string | null;
  iconUrl: string | null;
  /** 服务器封面图（保留字段，DB 中存 key，API 返回 public URL） */
  imageUrl: string | null;
  favoriteCount: number;
  /** 非公开服务器是否出现在首页发现列表（仅 owner 可见） */
  discoverable?: boolean;
  /**
   * 申请表单配置（split-brain projection at API boundary）。
   * - Owner / admin viewers receive the full `OwnerFormConfig` (gating data needed by the editor).
   * - Apply-eligible non-owner viewers receive only the `PlayerFormView` projection (no gating data).
   * - Other viewers (e.g. open / unlisted servers) receive `undefined`.
   * See `pickPlayerFormView` and `src/app/api/servers/[id]/route.ts`.
   */
  applicationForm?: OwnerFormConfig | PlayerFormView | null;
  /** 是否已生成 API Key（仅 owner 可见） */
  hasApiKey?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 整合包加载器类型 */
export type ModpackLoader = "fabric" | "forge" | "neoforge" | "quilt";

/** 服务器整合包版本项 */
export interface ModpackItem {
  id: string;
  serverId: string;
  uploaderId: string;
  name: string;
  version: string | null;
  loader: ModpackLoader | null;
  gameVersion: string | null;
  summary: string | null;
  fileSize: number;
  sha1: string;
  sha512: string;
  modsCount: number;
  hasOverrides: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 服务器整合包列表 API 响应 */
export interface ServerModpackListResponse {
  data: ModpackItem[];
}

/** 分页信息 */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 服务器列表 API 响应 */
export interface ServersListResponse {
  data: ServerListItem[];
  pagination: PaginationInfo;
}

/** 服务器详情 API 响应 */
export interface ServerDetailResponse {
  data: ServerDetail;
}

/** 评论作者信息 */
export interface CommentAuthor {
  id: string;
  misskeyId: string;
  misskeyUsername: string;
  name: string | null;
  image: string | null;
}

/** 回复数据（第二层） */
export interface CommentReply {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
}

/** 顶层评论数据（第一层） */
export interface ServerComment {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
  replies: CommentReply[];
}

/** 评论列表 API 响应 */
export interface ServerCommentsResponse {
  comments: ServerComment[];
  total: number;
  page: number;
  totalPages: number;
}

/** 通知类型 */
export type NotificationType =
  | "comment_reply"
  | "server_online"
  | "server_approved"
  | "server_rejected"
  | "application_approved"
  | "application_rejected"
  | "member_removed"
  | "whitelist_sync_failed"
  | "report_resolved"
  | "report_dismissed"
  | "content_warning"
  | "content_takedown";

/** 单条通知数据 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** 通知列表 API 响应 */
export interface NotificationsResponse {
  notifications: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  totalPages: number;
}

/** 未读通知数量 API 响应 */
export interface NotificationUnreadCountResponse {
  count: number;
}

/** 标记通知已读 API 响应 */
export interface MarkNotificationsReadResponse {
  success: boolean;
  unreadCount: number;
  error?: string;
}

/** 当前登录用户资料 */
export interface CurrentUserProfile {
  id: string;
  misskeyId: string;
  misskeyUsername: string;
  name: string | null;
  image: string | null;
  bio: string | null;
}

/** 当前用户资料 API 响应 */
export interface CurrentUserProfileResponse {
  data: CurrentUserProfile;
}

/** 用户公开主页数据 */
export interface PublicUserProfile {
  id: string;
  misskeyId: string;
  misskeyUsername: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  createdAt: string;
  servers: ServerListItem[];
}

/** 用户公开主页 API 响应 */
export interface PublicUserProfileResponse {
  data: PublicUserProfile;
}

// ─── 管理后台类型 ───────────────────────────────

/** 管理后台 - 服务器列表项 */
export interface AdminServerItem {
  id: string;
  psid: number;
  name: string;
  host: string;
  port: number;
  iconUrl: string | null;
  description: string | null;
  content: string | null;
  status: string;
  reviewStatus: string;
  rejectReason: string | null;
  isVerified: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerHandle: string | null;
  createdAt: string;
  reportCount?: number;
}

/** 管理后台 - 用户列表项 */
export interface AdminUserItem {
  id: string;
  misskeyId: string;
  misskeyUsername: string;
  name: string | null;
  image: string | null;
  role: string;
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  createdAt: string;
  serverCount: number;
  commentCount: number;
}

/** 管理后台 - 数据概览 */
export interface AdminDashboardStats {
  userCount: number;
  serverCount: number;
  todayCommentCount: number;
  pendingCount: number;
  onlineServerCount: number;
  bannedUserCount: number;
}

/** 管理后台 - 审查日志项 */
export interface AdminModerationLogItem {
  id: string;
  createdAt: string;
  contentType: string;
  contentId: string | null;
  contentSnippet: string;
  passed: boolean;
  aiCategory: string | null;
  aiReason: string | null;
  userId: string | null;
  userName: string | null;
  userIp: string | null;
  reviewed: boolean;
  adminNote: string | null;
}

/** 管理后台 - 审查统计 */
export interface AdminModerationStats {
  total: number;
  failed: number;
  passed: number;
  unreviewed: number;
}

// ─── 更新日志类型 ───────────────────────────────

/** 更新日志类型 */
export type ChangelogType = "feature" | "fix" | "improvement" | "other";

/** 更新日志项（公开页面） */
export interface ChangelogItem {
  id: string;
  title: string;
  content: string;
  type: ChangelogType;
  publishedAt: string;
}

/** 管理后台 - 更新日志项 */
export interface AdminChangelogItem {
  id: string;
  title: string;
  content: string;
  type: ChangelogType;
  published: boolean;
  publishedAt: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 私有服务器类型 ──────────────────────────────

export type ServerVisibility = "public" | "private" | "unlisted";
export type ServerJoinMode = "open" | "apply" | "invite" | "apply_and_invite";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "cancelled";
export type SyncStatus = "pending" | "pushed" | "acked" | "failed";

/** Application form option (v1 canonical shape). Owner-authored. */
export interface ApplicationFormOption {
  /** Stable identifier used in answers / branching rules. */
  value: string;
  /** Display label (owner copy — moderated via `moderateFields` on save). */
  label: string;
  /** Per-option score awarded if selected. Server-side only; never reaches PlayerFormView. */
  points?: number;
  /** Mark as the "correct" choice for scoring purposes. Server-side only. */
  correct?: boolean;
  /** When `true`, selecting this option immediately auto-rejects the application. Server-side only. */
  autoReject?: boolean;
}

/** Application form field configuration (v1 canonical). */
export interface ApplicationFormField {
  key: string;
  label: string;
  /**
   * Underlying field type. `select` / `multiselect` are surfaced in the editor as a
   * single "choice" question with an "allow multiple" toggle; both share the same
   * per-option scoring shape.
   */
  type: "text" | "textarea" | "select" | "multiselect";
  required: boolean;
  /**
   * Options are canonical `ApplicationFormOption[]` in v1. The runtime `normalizeApplicationFormOption`
   * helper coerces legacy `string[]` shapes on read so v0 documents still work.
   */
  options?: ApplicationFormOption[];
  placeholder?: string;
}

/** Owner-configurable form-level settings. Server-side / owner-side only. */
export interface ApplicationFormSettings {
  /**
   * Passing percentage (0–100). When the applicant's `scorePercent` is below this
   * value the application is auto-rejected. `null` disables the threshold gate.
   *
   * Stored as a whole number representing percent (e.g. `60` ≡ "must score ≥ 60% of
   * the form's maximum points to advance to manual review"). The evaluator computes
   * `scorePercent = round(score / maxScore * 100)` and compares it against this value.
   */
  passingScore: number | null;
  /** When auto-rejected for score, show the score percentage to the player. */
  showScoreToPlayerOnReject: boolean;
  /** When auto-rejected, show the structured reason (which field / threshold) to the player. */
  showRejectReasonToPlayerOnReject: boolean;
}

/** Branching rule: a target field is shown only if the referenced earlier field's answer matches. */
export interface ApplicationFormBranchRule {
  /** Field that becomes conditionally visible. */
  targetFieldKey: string;
  /** Earlier field this rule reads. MUST be earlier in `fields[]` order. */
  whenFieldKey: string;
  /** Allowed answer values; OR-matched. For multiselect, ANY overlap counts as a match. */
  allowedValues: string[];
}

/** Outcome of server-side evaluation. Persisted inside `ServerApplication.formData._evaluation`. */
export interface ApplicationFormEvaluationResult {
  result: "hard_disqualify" | "score_below_threshold" | "pending_review";
  /** Total awarded points (raw absolute value; only present when scoring applied). */
  score?: number;
  /** Maximum possible points across visible scoring fields at evaluation time. */
  maxScore?: number;
  /** Whole-percent scoring (0–100): `round(score / maxScore * 100)`. */
  scorePercent?: number;
  /** Passing percentage threshold (0–100), mirrored from settings.passingScore at submit time. */
  passingScore?: number | null;
  /** For `hard_disqualify`, the field key whose answer triggered the disqualification. */
  offendingFieldKey?: string;
  /** ISO timestamp the evaluator ran. */
  evaluatedAt: string;
}

/** Owner-side full document. Contains gating data — MUST NOT be served to non-owner viewers. */
export interface OwnerFormConfig {
  version: 1;
  fields: ApplicationFormField[];
  settings: ApplicationFormSettings;
  branching: ApplicationFormBranchRule[];
}

/** Player-renderable option projection. No points, no correct flag, no autoReject. */
export type PlayerFormOption = Pick<ApplicationFormOption, "value" | "label">;

/** Player-renderable field projection. */
export interface PlayerFormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect";
  required: boolean;
  options?: PlayerFormOption[];
  placeholder?: string;
}

/**
 * Player-side projection. Server projects to this at any non-owner API boundary that ships
 * `applicationForm`. Excludes ALL gating data (points/correct/autoReject/passingScore/branching/transparency-toggles).
 * See plan §"Two views, one document".
 */
export interface PlayerFormView {
  version: 1;
  fields: PlayerFormField[];
}

/** Server application list item */
export interface ServerApplicationItem {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  mcUsername: string;
  status: ApplicationStatus;
  formData: Record<string, string | string[]> | null;
  /** Server-side evaluation outcome surfaced to owner UI. `null` for legacy v0 forms. */
  evaluationResult: ApplicationFormEvaluationResult | null;
  /** Hash of the form document at submit time. `null` for legacy applications submitted before this feature. */
  formContentHash: string | null;
  reviewNote: string | null;
  reviewerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Server invite list item */
export interface ServerInviteItem {
  id: string;
  code: string;
  creatorName: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

/** Server member list item */
export interface ServerMemberItem {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  mcUsername: string | null;
  joinedVia: "apply" | "invite";
  createdAt: string;
  syncStatus: SyncStatus | null;
}

/** Whitelist sync record */
export interface WhitelistSyncItem {
  id: string;
  memberId: string;
  mcUsername: string | null;
  action: "add" | "remove";
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  ackedAt: string | null;
  createdAt: string;
}

/** Sync status overview (for console) */
export interface SyncStatusOverview {
  connected: boolean;
  pendingCount: number;
  failedCount: number;
  lastAckedAt: string | null;
  recentSyncs: WhitelistSyncItem[];
}

/** Membership status (for player) */
export interface MembershipStatus {
  isMember: boolean;
  application: {
    id: string;
    status: ApplicationStatus;
    createdAt: string;
  } | null;
}
