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
  latencyMs: number | null;
  checkedAt: string;
}

/** 服务器列表项（不含 content，用于卡片展示） */
export interface ServerListItem {
  id: string;
  name: string;
  host: string;
  port: number;
  description: string | null;
  tags: string[];
  favoriteCount?: number;
  isVerified: boolean;
  verifiedAt: string | null;
  status: ServerStatusResponse;
}

/** 服务器详情（含 content，用于详情页） */
export interface ServerDetail extends ServerListItem {
  ownerId: string | null;
  content: string | null;
  iconUrl: string | null;
  imageUrl: string | null;
  favoriteCount: number;
  createdAt: string;
  updatedAt: string;
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
  name: string | null;
  email: string;
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

/** 当前登录用户资料 */
export interface CurrentUserProfile {
  id: string;
  name: string | null;
  email: string;
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
