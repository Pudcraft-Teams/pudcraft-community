# 数据模型导览

完整 schema 见 [`../../prisma/schema.prisma`](../../prisma/schema.prisma)。本文按业务域分组介绍当前 14 个生效模型 + 1 张 ID 预留表。

## 一图流（关键关系）

```
                ┌─────────────┐
                │    User     │   misskeyId 唯一；name/image/bio 每次登录覆盖
                └──────┬──────┘
                       │ ownerId? (SetNull)
                       ▼
        ┌────────────────────────────────┐
        │           Server               │   host+port 复合唯一
        │  + 缓存：isOnline / players… │   + applicationForm: JSON (OwnerFormConfig)
        └────────────┬───────────────────┘
                     │
   ┌──────┬──────┬───┴────┬──────────┬───────────┐
   ▼      ▼      ▼        ▼          ▼           ▼
ServerSt. Comment Modpack Favorite  ServerApp.  ServerInvite
                                       │
                                       ▼
                                 ServerMember ── WhitelistSync
```

身份与治理是横切的：`ModerationLog` / `Report` / `Changelog` / `ServerNotification` 都引用 `User`，但不直接挂在 `Server` 上。

## 身份

### `User` (`users`)

- 主键：`cuid()`；外部唯一标识 `misskeyId`
- `name` / `image` / `bio` / `misskeyUsername` / `role`（`user|admin`）每次登录从 Misskey 同步
- `locale` 决定服务端渲染语种（默认 `zh`）
- `isBanned` / `banReason` / `bannedAt` 由 admin 操作
- 与几乎所有业务模型有关系（servers / comments / favorites / modpacks / notifications / 申请 / 邀请 / 成员 / 举报 / changelogs / moderation_logs）

## 服务器核心

### `Server` (`servers`)

- 主键：`cuid()`；公开短 ID `psid`（数字，全站唯一）
- `host + port` 复合唯一（`unique_host_port`）
- 状态字段：
  - `status`：`pending | approved | rejected`
  - `reviewStatus`：`unreviewed | reviewed`（自动审核结果）
  - `visibility`：`public | private | unlisted`
  - `discoverable`：非公开服务器是否仍出现在发现页
  - `joinMode`：`open | apply | invite | apply_and_invite`
- 缓存字段（worker 异步刷新，**绝不**在 web 里实时 ping）：`isOnline` / `playerCount` / `maxPlayers` / `lastPingedAt` / `favoriteCount`
- `applicationForm`：JSON，存 `OwnerFormConfig` v1 文档（含字段、评分、分支规则）；玩家视角通过 `pickPlayerEvaluationView` 投影
- `apiKeyHash`：插件 API key 的 SHA256（明文只在生成时给一次）
- `ownerId` 可空：遗留服务器没有 owner，admin 可后期指派
- `isVerified`：admin 手动颁发的官方认证徽章——**不是** MOTD 验证产物（claim/verify 流程已下线）

### `ServerStatus` (`server_statuses`)

- worker 每次 ping 写一行，作为时间序列历史
- 与 `Server` 上的缓存字段配合：`Server.*` 是最新一次的快照，`ServerStatus` 是历史
- `pluginExtra`：插件上报的额外信息（在线玩家列表、TPS 等）

### `ReservedNumericId` (`reserved_numeric_ids`)

- 服务器 `psid` 删除后的预留：避免回收复用导致旧链接指向新服务器
- `type` 用于支持其他数字 ID 类型未来共用同一张表

## 互动

### `ServerComment` (`comments`)

- 两层结构：顶层评论 + 一级回复（`parentId` 自引用）
- 服务器删除时 cascade

### `Favorite` (`favorites`)

- 唯一约束 `(userId, serverId)`
- 写入时同事务更新 `Server.favoriteCount`（避免 N+1 / 一致性问题）

### `ServerNotification` (`notifications`)

- `type` 区分场景（评论回复、上线通知、审核结果等）
- 创建时按收件人 `User.locale` 渲染（`createTranslatedNotification`）；历史行不重写
- `serverId` / `commentId` 可空，按场景填

### `Report` (`reports`)

- `targetType`：`server | comment | user`（**只**支持这三类，加新类型前先在 `CONTRIBUTING.md` 的产品范围里申明）
- `category`：`misinformation | pornography | harassment | fraud | other`
- 唯一约束 `(reporterId, targetType, targetId)`：同一人不能对同一目标重复举报
- `actions` 是 JSON 字符串数组（如 `["warn","takedown","ban_user"]`）

## 私服

### `ServerApplication` (`server_applications`)

- 玩家入服申请；`status`：`pending | approved | rejected | cancelled`
- `formData`：玩家提交的表单值（JSON）
- `formContentHash`：提交瞬间 `OwnerFormConfig` 的 canonical SHA256
  - 用途：被 reject 后再次提交时，如果服主已经改了表单（hash 不一致），玩家必须按新表单重填（错误码 `errors.api.applications.formChangedSinceRejection`）
- 唯一约束 `(serverId, userId)`（`unique_server_application`）：每个玩家对每个服务器同时只能有一条 active 申请；并发提交翻译为 `errors.api.applications.duplicateActiveApplication`
- `reviewedBy` / `reviewer` 是审核人（owner / admin）

### `ServerInvite` (`server_invites`)

- 邀请码；`code` 全局唯一
- 可设 `maxUses` / `expiresAt`
- 用一次 `usedCount += 1`（达到 `maxUses` 时不可再用）

### `ServerMember` (`server_members`)

- 通过审核或邀请加入的玩家
- `joinedVia`：`apply | invite`
- `mcUsername`：用于白名单同步的 MC 用户名
- 唯一约束 `(serverId, userId)`：同一玩家在同一服务器只能有一条成员记录

### `WhitelistSync` (`whitelist_syncs`)

- 每次成员变更（add / remove）一行
- `status`：`pending → pushed → acked` / `failed`
- 落库 → Redis publish → ws 推给插件 → 插件 ack 回 web 写入 `acked`
- `retryCount` / `lastAttemptAt` 用于退避重试

## 资源

### `Modpack` (`modpacks`)

- 一个服务器可有多个整合包版本
- 仅支持 Modrinth `.mrpack`
- `mrIndex`：解析后的 `modrinth.index.json`
- `fileKey`：对象存储的 key；`sha1` / `sha512` 用于完整性校验
- 上传与下载都尊重服务器可见性 + 审核状态

## 治理

### `ModerationLog` (`moderation_logs`)

- 内容审核日志：每次 AI 审查写一行
- `contentType`：`server | modpack | username | comment`
- 也用作 admin 操作审计（例如切换 `isVerified` 时）
- `aiCategory` / `aiReason` 为空表示不是 AI 触发，是 admin 手动行为

### `Changelog` (`changelogs`)

- 平台更新日志（公开页 `/changelog`）
- `type`：`feature | fix | improvement | other`
- `published` + `publishedAt` 控制对外可见性

## 重要约束清单

历史踩坑提炼出来的硬规则：

- **复合 unique 必须显式声明**：`Server.unique_host_port` / `Favorite (userId, serverId)` / `ServerApplication (serverId, userId)` / `ServerMember (serverId, userId)` / `Report (reporterId, targetType, targetId)`。漏掉任何一处都会被绕开。
- **关系必须声明 `onDelete`**：cascade（评论 / 收藏 / 通知 / 申请 / 邀请 / 成员 / 同步 / 整合包）、SetNull（owner / 审核人 / 用户引用 ModerationLog）。
- **删特性时同时删字段**：早期保留下来的 `verify_token` / `verify_expires_at` / `verify_user_id` 让 schema 看起来仍像存在 MOTD 验证门禁，构成持久攻击面。当前 schema 底部仍以注释形态保留 `Channel` / `Message` 等「未来扩展」——真要落地前必须先在 `CONTRIBUTING.md` 的产品范围段落里申明，不要直接放开注释。
- **schema 改动必须配迁移**：单改 `prisma/schema.prisma` 不写 `prisma/migrations/<timestamp>_*` 的 PR 会被打回——线上第一次写新字段就 500。
