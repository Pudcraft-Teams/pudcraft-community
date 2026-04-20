# Pudcraft Community API 文档

> 版本: 1.0.0
> 基础路径: `/api`

---

## 目录

- [通用规范](#通用规范)
- [认证 (Auth)](#认证-auth)
- [服务器 (Servers)](#服务器-servers)
- [服务器私有功能 (Private Servers)](#服务器私有功能-private-servers)
- [白名单同步 (Whitelist Sync)](#白名单同步-whitelist-sync)
- [评论 (Comments)](#评论-comments)
- [收藏 (Favorites)](#收藏-favorites)
- [整合包 (Modpacks)](#整合包-modpacks)
- [用户 (User)](#用户-user)
- [通知 (Notifications)](#通知-notifications)
- [更新日志 (Changelog)](#更新日志-changelog)
- [上传 (Uploads)](#上传-uploads)
- [管理员 (Admin)](#管理员-admin)
- [系统 (System)](#系统-system)

---

## 通用规范

### 认证方式

- **Session Cookie**: 大多数 API 使用 NextAuth.js 的 session cookie 进行认证
- **API Key**: 插件相关 API 使用 Bearer Token (API Key) 认证

### 通用响应格式

**成功响应 (200-299)**:
```json
{
  "data": { ... },           // 或具体字段
  "success": true,           // 部分接口返回
  "pagination": { ... }      // 列表接口返回
}
```

**错误响应 (400-599)**:
```json
{
  "error": "错误描述",
  "details": { ... },        // 校验失败时返回
  "message": "额外信息"      // 可选
}
```

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未登录/未授权 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 410 | 资源已过期 |
| 422 | 内容审核未通过 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
| 504 | 超时 |

---

## 认证 (Auth)

### NextAuth 回调
```
GET/POST /api/auth/[...nextauth]
```
NextAuth.js 标准路由，处理登录/登出/会话等。

---

### 注册
```
POST /api/auth/register
```

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "code": "123456"
}
```

**响应**:
```json
{
  "success": true,
  "message": "注册成功"
}
```

**错误码**: 400 (校验失败), 409 (邮箱已存在), 429 (发送频繁/已锁定)

---

### 发送验证码
```
POST /api/auth/send-code
```

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应**:
```json
{
  "success": true,
  "message": "验证码已发送"
}
```

**限流**: 每邮箱 60 秒冷却，每 IP 日限 10 封

---

### 重置密码
```
POST /api/auth/reset-password  # 发送重置验证码
PATCH /api/auth/reset-password # 使用验证码重置密码
```

**POST 请求体**:
```json
{
  "email": "user@example.com"
}
```

**PATCH 请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "newpassword123"
}
```

---

## 服务器 (Servers)

### 服务器列表
```
GET /api/servers
```

**认证**: 可选

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| limit/pageSize | number | 每页数量，默认 20 |
| tag | string | 按标签过滤 |
| search | string | 关键词搜索 |
| sort | string | 排序: `newest`/`popular`/`players`/`name` |
| ownerId | string | 按服主过滤 |

**响应**:
```json
{
  "data": [{
    "id": "cuid",
    "psid": 123456,
    "name": "服务器名",
    "host": "mc.example.com",
    "port": 25565,
    "description": "...",
    "tags": ["生存"],
    "iconUrl": "https://...",
    "favoriteCount": 100,
    "isVerified": true,
    "visibility": "public",
    "joinMode": "open",
    "status": {
      "online": true,
      "playerCount": 10,
      "maxPlayers": 100,
      "checkedAt": "2024-01-01T00:00:00Z"
    }
  }],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

### 创建服务器
```
POST /api/servers
```

**认证**: 需登录

**Content-Type**: `multipart/form-data`

**字段**:
| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| name | string | 是 | 服务器名称 (2-50字符) |
| address | string | 是 | 服务器地址 |
| port | number | 是 | 端口 (1-65535) |
| version | string | 否 | 游戏版本 |
| tags | string | 否 | 逗号分隔的标签 |
| description | string | 否 | 简介 (最多500字符) |
| content | string | 否 | 详细介绍 (Markdown) |
| maxPlayers | number | 否 | 最大玩家数 |
| qqGroup | string | 否 | QQ群号 |
| icon | File | 否 | 图标图片 (max 5MB) |

**响应**:
```json
{
  "success": true,
  "message": "服务器已提交，等待管理员审核",
  "warning": "图标包含违规内容，已跳过上传",
  "data": {
    "id": "cuid",
    "psid": 123456,
    "name": "...",
    "host": "...",
    "port": 25565,
    ...
  }
}
```

**限流**: 每用户日限 5 次提交

---

### 服务器详情
```
GET /api/servers/:id
```

**认证**: 可选 (未审核服务器需 owner/admin)

**参数**: `:id` 支持 CUID 或 6位 PSID

**响应**:
```json
{
  "data": {
    "id": "cuid",
    "psid": 123456,
    "name": "...",
    "host": "hidden",          // 私有服务器对非成员隐藏
    "port": 0,
    "description": "...",
    "content": "...",
    "ownerId": "user-cuid",
    "tags": [],
    "iconUrl": "https://...",
    "imageUrl": "https://...",
    "favoriteCount": 100,
    "isVerified": true,
    "verifiedAt": "2024-01-01T00:00:00Z",
    "visibility": "public",
    "joinMode": "open",
    "isMember": false,
    "applicationForm": [...],  // joinMode 为 apply 时返回
    "hasApiKey": true,         // owner 可见
    "status": { ... },
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 编辑服务器
```
PATCH /api/servers/:id
```

**认证**: 需登录 (仅 owner)

**Content-Type**: `multipart/form-data`

**字段**: 同创建，所有字段可选

**响应**:
```json
{
  "success": true,
  "warning": "图标上传失败，已保留原图标",
  "resubmittedForReview": false,
  "data": { ... }
}
```

---

### 删除服务器
```
DELETE /api/servers/:id
```

**认证**: 需登录 (owner 或 admin)

---

### 服务器统计
```
GET /api/servers/:id/stats?period=24h|7d|30d
```

**认证**: 需登录 (仅 owner)

**响应**:
```json
{
  "period": "24h",
  "dataPoints": [{
    "time": "14:00",
    "playerCount": 10,
    "maxPlayers": 100,
    "isOnline": true
  }],
  "summary": {
    "avgPlayers": 15,
    "peakPlayers": 50,
    "peakTime": "20:00",
    "uptimePercent": 95.5,
    "totalChecks": 288,
    "onlineChecks": 275
  },
  "hourlyAverages": [{
    "hour": "00:00",
    "avgPlayers": 5,
    "sampleCount": 12
  }]
}
```

---

### Ping 测试
```
GET /api/servers/:id/ping
```

**认证**: 公开

**说明**: 轻量端点，仅校验 ID 格式后立即返回，用于前端测延迟

---

### 认领服务器
```
GET /api/servers/:id/verify   # 查询认领状态
POST /api/servers/:id/verify  # 发起认领，获取 MOTD Token
PATCH /api/servers/:id/verify # 触发验证任务
GET /api/servers/:id/verify/claim-key  # 查询插件认领状态
POST /api/servers/:id/verify/claim-key # 生成一次性插件认领密钥
```

**认证**: 需登录

**说明**: 当前支持两种认领方式：
- `verify`：生成 MOTD Token，写入服务器 MOTD 后触发验证
- `verify/claim-key`：生成一次性插件认领密钥；认领成功后该密钥直接成为服务器 API Key

**POST 响应**:
```json
{
  "token": "pudcraft-abc12345",
  "expiresAt": "2024-01-01T00:30:00Z",
  "instruction": "请将此 Token 添加到服务器 MOTD 中",
  "currentOwner": "该服务器已有管理员..."
}
```

---

## 服务器私有功能 (Private Servers)

> 当前整组私有服务器 API 受 `NEXT_PUBLIC_ENABLE_PRIVATE_SERVERS` 控制；默认关闭。关闭时服务端会返回 `404`，前端不应暴露申请、邀请码或成员管理入口。

### 获取成员状态
```
GET /api/servers/:id/membership
```

**认证**: 需登录

**响应**:
```json
{
  "isMember": false,
  "application": {
    "id": "app-cuid",
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

### 服务器设置
```
PUT /api/servers/:id/settings
```

**认证**: 需登录 (仅 owner)

**请求体**:
```json
{
  "visibility": "public|private|unlisted",
  "joinMode": "open|apply|invite|apply_and_invite",
  "applicationForm": [
    {
      "key": "why_join",
      "label": "为什么想加入？",
      "type": "textarea",
      "required": true
    }
  ]
}
```

---

### 申请列表 (Owner)
```
GET /api/servers/:id/applications?page=1&limit=20&status=pending|approved|rejected|all
```

**认证**: 需登录 (仅 owner)

**响应**:
```json
{
  "data": [{
    "id": "app-cuid",
    "userId": "user-cuid",
    "userName": "玩家名",
    "userImage": "https://...",
    "mcUsername": "MinecraftID",
    "status": "pending",
    "formData": { "why_join": "..." },
    "reviewNote": null,
    "reviewerName": null,
    "createdAt": "...",
    "updatedAt": "..."
  }],
  "total": 10,
  "page": 1,
  "totalPages": 1
}
```

---

### 提交申请
```
POST /api/servers/:id/applications
```

**认证**: 需登录

**请求体**:
```json
{
  "mcUsername": "MinecraftID",
  "formData": {
    "why_join": "想玩生存服务器"
  }
}
```

**错误码**: 400 (不支持申请), 409 (已提交/已是成员)

---

### 审核申请
```
PUT /api/servers/:id/applications/:appId
```

**认证**: 需登录 (仅 owner)

**请求体**:
```json
{
  "action": "approve|reject",
  "reviewNote": "欢迎加入！"
}
```

---

### 邀请码列表
```
GET /api/servers/:id/invites
```

**认证**: 需登录 (仅 owner)

---

### 创建邀请码
```
POST /api/servers/:id/invites
```

**认证**: 需登录 (仅 owner)

**请求体**:
```json
{
  "maxUses": 10,          // 可选，null 表示无限制
  "expiresInHours": 24    // 可选，null 表示永不过期
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "invite-cuid",
    "code": "a1b2c3d4",
    "url": "/servers/123456/join/a1b2c3d4",
    "maxUses": 10,
    "usedCount": 0,
    "expiresAt": "2024-01-02T00:00:00Z",
    "createdAt": "..."
  }
}
```

---

### 撤销邀请码
```
DELETE /api/servers/:id/invites/:code
```

**认证**: 需登录 (仅 owner)

---

### 通过邀请码加入
```
POST /api/servers/:id/join/:code
```

**认证**: 需登录

**请求体**:
```json
{
  "mcUsername": "MinecraftID"
}
```

**错误码**: 404 (邀请码无效), 410 (过期/达上限), 409 (已是成员)

---

### 成员列表
```
GET /api/servers/:id/members?page=1&limit=20
```

**认证**: 需登录 (仅 owner)

**响应**:
```json
{
  "members": [{
    "id": "member-cuid",
    "userId": "user-cuid",
    "userName": "玩家名",
    "userImage": "https://...",
    "mcUsername": "MinecraftID",
    "joinedVia": "apply|invite",
    "createdAt": "...",
    "syncStatus": "pending|pushed|acked|failed"
  }],
  "total": 10,
  "page": 1,
  "totalPages": 1
}
```

---

### 移除成员
```
DELETE /api/servers/:id/members/:memberId
```

**认证**: 需登录 (仅 owner)

**说明**: 会触发白名单移除同步

---

### API Key 管理
```
POST /api/servers/:id/api-key
```

**认证**: 需登录 (仅 owner)

**响应**:
```json
{
  "success": true,
  "apiKey": "pk_live_xxxxxxxx",
  "message": "API Key 已生成，请妥善保存。此密钥仅显示一次。"
}
```

**注意**: 重新生成会覆盖旧 Key

---

## 白名单同步 (Whitelist Sync)

用于 Minecraft 服务器插件同步白名单。

### 认证方式
```
Authorization: Bearer <API_KEY>
```

### Handshake
```
POST /api/servers/:id/sync/handshake
```

**认证**: API Key

**响应**:
```json
{
  "whitelist": ["Player1", "Player2"],
  "pendingSyncs": [{
    "id": "sync-cuid",
    "memberId": "member-cuid",
    "mcUsername": "Player1",
    "action": "add|remove",
    "status": "pending",
    "retryCount": 0,
    "lastAttemptAt": null,
    "ackedAt": null,
    "createdAt": "..."
  }],
  "wsUrl": "ws://localhost:3001"
}
```

---

### 获取待同步列表
```
GET /api/servers/:id/sync/pending
```

**认证**: API Key

---

### 同步状态 (控制台查看)
```
GET /api/servers/:id/sync/status
```

**认证**: 需登录 (仅 owner)

**响应**:
```json
{
  "connected": true,
  "pendingCount": 2,
  "failedCount": 0,
  "lastAckedAt": "2024-01-01T00:00:00Z",
  "recentSyncs": [...]
}
```

---

### 确认同步完成
```
POST /api/sync/:syncId/ack
```

**认证**: API Key

**说明**: 插件完成白名单操作后调用，标记同步记录为已确认

---

## 评论 (Comments)

### 获取评论列表
```
GET /api/servers/:id/comments?page=1&limit=20
```

**认证**: 可选 (未审核服务器需 owner/admin)

**响应**:
```json
{
  "comments": [{
    "id": "comment-cuid",
    "content": "评论内容",
    "createdAt": "...",
    "author": {
      "id": "user-cuid",
      "uid": 123,
      "name": "用户名",
      "image": "https://..."
    },
    "replies": [{
      "id": "reply-cuid",
      "content": "回复内容",
      "createdAt": "...",
      "author": { ... }
    }]
  }],
  "total": 100,
  "page": 1,
  "totalPages": 5
}
```

---

### 发表评论
```
POST /api/servers/:id/comments
```

**认证**: 需登录

**请求体**:
```json
{
  "content": "评论内容 (5-1000字符)",
  "parentId": "comment-cuid"  // 可选，回复时传入
}
```

**限制**: 每分钟最多 5 条

---

### 删除评论
```
DELETE /api/servers/:id/comments/:commentId
```

**认证**: 需登录 (评论作者或 admin)

---

## 收藏 (Favorites)

### 收藏操作
```
GET    /api/servers/:id/favorite  # 查询收藏状态
POST   /api/servers/:id/favorite  # 收藏
DELETE /api/servers/:id/favorite  # 取消收藏
```

**认证**: 需登录

**GET 响应**:
```json
{
  "favorited": true
}
```

**POST/DELETE 响应**:
```json
{
  "success": true,
  "favorited": true,
  "favoriteCount": 100
}
```

---

## 整合包 (Modpacks)

### 获取整合包列表
```
GET /api/servers/:id/modpack
```

**认证**: 可选 (未审核服务器需 owner/admin)

---

### 上传整合包
```
POST /api/servers/:id/modpack
```

**认证**: 需登录 (仅 owner，需先认领)

**Content-Type**: `multipart/form-data`

**字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| file | File | .mrpack 文件 (max 50MB) |
| version | string | 版本号 |
| loader | string | 加载器: fabric/forge/neoforge/quilt |
| gameVersion | string | 游戏版本 |

---

### 删除整合包
```
DELETE /api/modpacks/:modpackId
```

**认证**: 需登录 (仅 owner)

---

### 下载整合包
```
GET /api/modpacks/:modpackId/download
```

**认证**: 可选 (未审核服务器需 owner/admin)

**说明**: 本地存储返回文件流，对象存储返回 307 跳转

---

## 用户 (User)

### 当前用户资料
```
GET /api/user/profile
```

**认证**: 需登录

**响应**:
```json
{
  "data": {
    "id": "user-cuid",
    "uid": 123,
    "name": "用户名",
    "email": "user@example.com",
    "image": "https://...",
    "bio": "简介"
  }
}
```

---

### 更新资料
```
PATCH /api/user/profile
```

**认证**: 需登录

**Content-Type**: `multipart/form-data`

**字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 用户名 (2-30字符) |
| bio | string | 简介 (最多200字符) |
| avatar | File | 头像图片 (max 5MB) |

---

### 用户公开资料
```
GET /api/user/:id
```

**认证**: 可选

**说明**: `:id` 支持 CUID 或 UID

**响应**: 不含邮箱，包含用户的服务器列表

---

### 收藏列表
```
GET /api/user/favorites
```

**认证**: 需登录

---

### 收藏 ID 列表
```
GET /api/user/favorites/ids
```

**认证**: 需登录

**响应**:
```json
{
  "serverIds": ["server-cuid-1", "server-cuid-2"]
}
```

---

## 通知 (Notifications)

### 通知列表
```
GET /api/notifications?page=1&limit=20&unreadOnly=false
```

**认证**: 需登录

**响应**:
```json
{
  "notifications": [{
    "id": "notif-cuid",
    "type": "comment_reply|server_online|server_approved|server_rejected|application_approved|application_rejected|member_removed|whitelist_sync_failed",
    "title": "标题",
    "message": "内容",
    "link": "/servers/123456",
    "readAt": null,
    "createdAt": "..."
  }],
  "total": 10,
  "unreadCount": 3,
  "page": 1,
  "totalPages": 1
}
```

---

### 标记已读
```
PATCH /api/notifications
```

**认证**: 需登录

**请求体**:
```json
{
  "all": true
}
// 或
{
  "ids": ["notif-cuid-1", "notif-cuid-2"]
}
```

---

### 未读数量
```
GET /api/notifications/unread-count
```

**认证**: 需登录

---

## 更新日志 (Changelog)

### 公开列表
```
GET /api/changelog?page=1&limit=20
```

**认证**: 公开

---

## 上传 (Uploads)

### 编辑器图片上传
```
POST /api/uploads/editor-image
```

**认证**: 需登录

**Content-Type**: `multipart/form-data`

**字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| image | File | 图片 (max 5MB) |

**响应**:
```json
{
  "data": {
    "url": "https://..."
  }
}
```

---

## 管理员 (Admin)

所有管理员接口需要 `role=admin`。

### 服务器管理
```
GET /api/admin/servers?page=1&limit=20&status=pending|approved|rejected|all&search=
PATCH /api/admin/servers/:id  # { action: "approve|reject", reason?: string }
DELETE /api/admin/servers/:id
```

---

### 用户管理
```
GET /api/admin/users?page=1&limit=20&banned=normal|banned|all&search=
PATCH /api/admin/users/:id    # { action: "ban|unban", reason?: string }
```

---

### 更新日志管理
```
GET /api/admin/changelog?page=1&limit=20&published=all|published|draft
POST /api/admin/changelog
PATCH /api/admin/changelog/:id
DELETE /api/admin/changelog/:id
```

**POST/PATCH 请求体**:
```json
{
  "title": "标题",
  "content": "内容 (Markdown)",
  "type": "feature|fix|improvement|breaking",
  "published": true
}
```

---

### 内容审查日志
```
GET /api/admin/moderation?page=1&limit=20&filter=all|passed|failed|unreviewed&type=all|server|comment|modpack|username
PATCH /api/admin/moderation/:id  # { reviewed?: boolean, adminNote?: string }
```

**响应包含近7天统计**:
```json
{
  "data": [...],
  "stats": {
    "total": 100,
    "failed": 5,
    "passed": 95,
    "unreviewed": 2
  },
  "pagination": { ... }
}
```

---

## 系统 (System)

### 健康检查
```
GET /api/health
```

**认证**: 公开

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 数据类型定义

### ServerVisibility
- `public` - 公开，所有人可见
- `private` - 私密，仅成员可见
- `unlisted` - 需申请，列表可见但地址隐藏

### ServerJoinMode
- `open` - 开放加入
- `apply` - 申请加入
- `invite` - 邀请加入
- `apply_and_invite` - 申请或邀请

### ApplicationStatus
- `pending` - 待审核
- `approved` - 已通过
- `rejected` - 已拒绝
- `cancelled` - 已取消

### SyncStatus
- `pending` - 待同步
- `pushed` - 已推送
- `acked` - 已确认
- `failed` - 失败

---

## 限流策略

| 接口 | 策略 |
|------|------|
| 注册 | IP 日限 10 次 |
| 发送验证码 | 邮箱 60 秒冷却，IP 日限 10 次 |
| 提交服务器 | 用户 日限 5 次 |
| 评论 | 用户 每分钟 5 次 |
| 收藏 | 用户 每分钟 30 次 |
| 搜索 | IP 每分钟 60 次 |

---

## 错误处理

### 通用错误格式
```json
{
  "error": "错误描述",
  "details": {
    "fieldErrors": { "field": ["error"] },
    "formErrors": []
  }
}
```

### 常见错误
- `400` - 参数校验失败，检查请求格式
- `401` - 未登录，请先登录
- `403` - 无权限，检查用户角色
- `404` - 资源不存在，检查 ID 是否正确
- `409` - 资源冲突（已存在/重复操作）
- `422` - 内容审核未通过
- `429` - 请求频繁，请稍后再试
- `500` - 服务器错误，请联系管理员
