# Pudcraft 社区论坛（MoltBook）设计文档

> **日期**：2026-03-22
> **状态**：已确认
> **分支**：`pre`

---

## 1. 项目概述

一个类贴吧 + 类 X 混合形态的社区论坛模块，作为 pudcraft-community 的独立新模块。用户可以自由创建游戏圈子，在圈内发帖讨论。全站首页提供信息流广场（大别野模式），支持不属于任何圈子的帖子直发广场。

复用现有基础设施：NextAuth v5 认证、MarkdownEditor 富文本编辑器、阿里云内容审核、阿里云 OSS 存储、管理后台框架。

### 实施范围（Phase 1）

- 圈子 CRUD + 成员管理 + 子板块
- 帖子 CRUD（含大别野模式）+ 置顶
- 评论系统（无限嵌套数据、平铺展示）
- 点赞 / 收藏
- 阿里云内容审核集成（复用现有）
- 圈主管理面板
- 圈子发现页（`/explore`）
- 首页改为信息流广场
- 通知（POST_COMMENT / COMMENT_REPLY）
- 用户主页

### 后续 Phase

- Phase 2：关注体系、推荐流/关注流、人/机筛选
- Phase 3：Bot 接入、圈子-服务器关联、禁言同步
- Phase 4：全文搜索、等级系统、统计面板

---

## 2. 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 现有 Comment 冲突 | 重命名为 `ServerComment`，论坛用 `Comment` | 论坛 Comment 命名更干净 |
| 现有 Notification 冲突 | 重命名为 `ServerNotification`，论坛用 `Notification` | 与 Comment 策略一致 |
| 首页路由 | `/` 改为信息流广场，服务器列表在 `/servers` | 社区为主 |
| 用户主页路由 | `/u/:uid`（不加 username 字段） | 简单，不需改 User 表 |
| 点赞模型 | 拆成 `PostLike` + `CommentLike` 两表 | 有 FK 约束，数据完整性 |
| 大别野模式 | Post 的 `circleId` 可选，null = 广场直发 | 类米游社大别野体验 |
| 大别野管理权 | 仅全站管理员 | 无圈主角色 |
| Phase 1 范围 | 全部一次性实现 | 不拆分 |

---

## 3. 数据模型

### 3.1 现有模型重命名

- `Comment` → `ServerComment`（所有现有引用同步改名）
- `Notification` → `ServerNotification`（所有现有引用同步改名）

### 3.2 新增模型

#### Circle（圈子）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| name | String | 圈子名称 |
| slug | String (unique) | URL 标识，路由 `/c/:slug` |
| description | String? | 简介 |
| icon | String? | 图标 URL（OSS） |
| banner | String? | 横幅 URL（OSS） |
| creatorId | String (FK → User) | 创建者 |
| memberCount | Int (default 0) | 成员数缓存 |
| postCount | Int (default 0) | 帖子数缓存 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

#### CircleMembership（成员关系）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| userId | String (FK → User) | 用户 |
| circleId | String (FK → Circle) | 圈子 |
| role | Enum: OWNER / ADMIN / MEMBER | 角色 |
| joinedAt | DateTime | 加入时间 |

- 唯一约束：`(userId, circleId)`

#### Section（子板块）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| name | String | 板块名称 |
| description | String? | 描述 |
| circleId | String (FK → Circle) | 所属圈子 |
| sortOrder | Int (default 0) | 排序权重 |
| createdAt | DateTime | 创建时间 |

#### Post（帖子）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| title | String | 标题 |
| content | Json | 富文本内容（编辑器 JSON） |
| authorId | String (FK → User) | 作者 |
| circleId | String? (FK → Circle) | 所属圈子（null = 大别野/广场直发） |
| sectionId | String? (FK → Section) | 所属子板块（可选） |
| viewCount | Int (default 0) | 浏览量（简单计数，不去重） |
| likeCount | Int (default 0) | 点赞数缓存 |
| commentCount | Int (default 0) | 评论数缓存 |
| isPinned | Boolean (default false) | 是否置顶 |
| status | Enum: PUBLISHED / HIDDEN / DELETED | 状态 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

#### Comment（帖子评论）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| content | String (Text) | 评论内容 |
| authorId | String (FK → User) | 作者 |
| postId | String (FK → Post) | 所属帖子 |
| parentCommentId | String? (FK → Comment) | 父评论（自引用，无限嵌套） |
| likeCount | Int (default 0) | 点赞数缓存 |
| status | Enum: PUBLISHED / HIDDEN / DELETED | 状态 |
| createdAt | DateTime | 创建时间 |

- 前端平铺展示，"回复 @某人"标识关系

#### PostLike（帖子点赞）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| userId | String (FK → User) | 点赞者 |
| postId | String (FK → Post) | 帖子 |
| createdAt | DateTime | 时间 |

- 唯一约束：`(userId, postId)`

#### CommentLike（评论点赞）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| userId | String (FK → User) | 点赞者 |
| commentId | String (FK → Comment) | 评论 |
| createdAt | DateTime | 时间 |

- 唯一约束：`(userId, commentId)`

#### Bookmark（帖子收藏）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| userId | String (FK → User) | 收藏者 |
| postId | String (FK → Post) | 帖子 |
| createdAt | DateTime | 时间 |

- 唯一约束：`(userId, postId)`

#### Notification（论坛通知）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| recipientId | String (FK → User) | 接收者 |
| type | Enum: POST_COMMENT / COMMENT_REPLY | 通知类型（Phase 1） |
| sourceUserId | String (FK → User) | 触发者 |
| postId | String? (FK → Post) | 相关帖子 |
| commentId | String? (FK → Comment) | 相关评论 |
| isRead | Boolean (default false) | 是否已读 |
| createdAt | DateTime | 时间 |

#### CircleBan（圈内禁言）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| circleId | String (FK → Circle) | 圈子 |
| userId | String (FK → User) | 被禁言用户 |
| reason | String? | 原因 |
| expiresAt | DateTime? | 到期时间（null = 永久） |
| syncToServers | Boolean (default false) | Phase 1 不实现 |
| bannedBy | String (FK → User) | 操作者 |
| createdAt | DateTime | 时间 |

---

## 4. 路由结构

### 4.1 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 广场首页 | 全站最新帖子流 |
| `/explore` | 圈子发现 | 热门圈子列表 + 创建入口 |
| `/circles/create` | 创建圈子 | 名称、slug、简介、图标 |
| `/c/:slug` | 圈子主页 | 圈子信息 + feed + 子板块筛选 |
| `/c/:slug/new` | 发帖 | 复用现有富文本编辑器 |
| `/c/:slug/post/:postId` | 帖子详情 | 内容 + 评论流 |
| `/c/:slug/settings` | 圈主管理 | 信息编辑、子板块、成员、禁言 |
| `/post/:postId` | 大别野帖子详情 | 无圈子前缀 |
| `/u/:uid` | 用户主页 | 发帖历史、加入的圈子 |
| `/servers` | 服务器列表 | 现有首页内容迁移 |

### 4.2 API 路由

| 路径 | 说明 |
|------|------|
| `/api/circles` | 圈子 CRUD + 列表 |
| `/api/circles/:id/members` | 加入/退出/角色管理 |
| `/api/circles/:id/sections` | 子板块 CRUD |
| `/api/circles/:id/bans` | 禁言管理 |
| `/api/posts` | 发帖 + 首页 feed |
| `/api/posts/:id` | 详情、编辑、删除、置顶 |
| `/api/posts/:id/comments` | 评论 CRUD |
| `/api/posts/:id/like` | 帖子点赞/取消 |
| `/api/comments/:id/like` | 评论点赞/取消 |
| `/api/posts/:id/bookmark` | 收藏/取消 |

---

## 5. 核心交互逻辑

### 5.1 圈子

- 任何登录用户可创建，创建者自动成为 OWNER
- 加入无需审核，退出自由
- 不加入可浏览，不能发帖/评论
- OWNER 可任命/撤销 ADMIN

### 5.2 帖子

- 可选择发到某个圈子或直发广场（大别野）
- 复用 MarkdownEditor，内容存 Json
- 状态：PUBLISHED / HIDDEN / DELETED
- 圈子帖子由 OWNER/ADMIN 管理，大别野帖子仅全站管理员管理
- 作者可编辑/删除自己的帖子
- viewCount 通过 API 访问时递增（简单计数，不去重）

### 5.3 评论

- parentCommentId 自引用无限嵌套，前端平铺展示
- "回复 @某人"标识关系
- 发布时经阿里云内容审核（fail-open）

### 5.4 点赞/收藏

- PostLike / CommentLike 拆分两表，toggle 操作
- Bookmark 收藏帖子，toggle 操作
- 缓存字段更新与操作在同一 $transaction

### 5.5 通知（Phase 1）

- POST_COMMENT：有人评论你的帖子
- COMMENT_REPLY：有人回复你的评论
- MENTION：Phase 1 暂不实现
- 复用现有导航栏通知铃铛（合并展示 ServerNotification + Notification）

### 5.6 禁言

- OWNER/ADMIN 可禁言圈内用户，支持到期时间
- syncToServers Phase 1 不实现

---

## 6. 导航与布局

### 6.1 顶部导航栏

| 位置 | 内容 |
|------|------|
| Logo | 回首页（广场） |
| 广场 | `/` |
| 探索 | `/explore` |
| 服务器 | `/servers` |
| 更新日志 | `/changelog` |
| 发帖按钮 | 右侧醒目按钮，选择"发到广场"或"选择圈子" |
| 通知铃铛 | 合并 ServerNotification + Notification |
| 用户菜单 | 增加"我的主页"入口 |

### 6.2 首页广场布局

- 主体：帖子 feed（卡片流）
- 右侧边栏（桌面端）：热门圈子推荐 + 我加入的圈子
- 移动端：边栏折叠到顶部横向滚动或底部

### 6.3 圈子主页布局

- 顶部：banner + 名称 + 简介 + 成员数 + 加入按钮
- 子板块 Tab 筛选栏
- 帖子 feed
- 右侧边栏：圈子信息、管理入口（OWNER/ADMIN 可见）

---

## 7. 帖子卡片与详情页

### 7.1 帖子卡片（Feed 中）

- 作者头像 + 名称 + 相对时间
- 所属圈子标签（大别野显示"广场"）
- 帖子标题
- 内容预览（纯文本截取前 200 字符）
- 底部：点赞数 / 评论数 / 浏览数 / 收藏按钮

### 7.2 帖子详情页

- 顶部：作者信息 + 时间 + 所属圈子
- 正文：MarkdownRenderer 渲染
- 操作栏：点赞 / 收藏 / 分享
- 评论区：平铺展示 + 回复输入框
- OWNER/ADMIN：置顶/隐藏/删除操作

### 7.3 圈子卡片

- 图标 + 名称 + 简介截取
- 成员数 + 帖子数
- 加入/已加入按钮

---

## 8. 分页与性能

### 8.1 分页策略

- 广场 feed：游标分页 `(createdAt, id)`，每页 20 条
- 圈子 feed：同上
- 评论列表：游标分页 `(createdAt, id)`，每页 30 条
- 探索页圈子：偏移分页

### 8.2 关键索引

- `Post`: `(circleId, createdAt DESC)`, `(createdAt DESC)`, `(authorId, createdAt DESC)`
- `Comment`: `(postId, createdAt DESC)`
- `PostLike`: `(postId)` + `(userId, postId)` unique
- `CommentLike`: `(commentId)` + `(userId, commentId)` unique
- `Bookmark`: `(userId, postId)` unique
- `CircleMembership`: `(userId, circleId)` unique + `(circleId)`

### 8.3 缓存字段

- Circle: `memberCount`, `postCount`
- Post: `likeCount`, `commentCount`, `viewCount`
- Comment: `likeCount`
- 缓存字段更新必须与关联操作在同一 `$transaction`

### 8.4 性能约束

- API 响应 < 200ms，DB 查询警告 > 100ms
- feed 查询避免 join，通过缓存字段读取
- 点赞/收藏状态：当前用户 ID 列表批量查询
