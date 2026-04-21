# Pudcraft Community API 文档

> 版本：server-only branch
> 基础路径：`/api`

当前文档只描述 live 的 server-only 接口。历史 forum / MoltBook 相关接口已经从当前分支移除，不再属于现网 API 面。

## 通用约定

### 认证方式

- Web：Session Cookie（Auth.js / NextAuth）
- 插件 / 同步 / 插件认领：Bearer API Key 或认领密钥
- 移动端：`/api/mobile/session*` 返回的受信 session cookie

### 响应格式

成功响应通常返回以下结构之一：

```json
{ "data": {} }
```

```json
{ "success": true }
```

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

错误响应统一为：

```json
{
  "error": "错误描述",
  "details": {}
}
```

其中 `details` 是可选字段；很多业务错误只返回 `{ error }`，校验失败或需要补充上下文时才会附带 `details`。

### 常用状态码

- `200`：成功
- `201`：创建成功
- `400`：参数错误 / 校验失败
- `401`：未登录
- `403`：无权限或账号不可用
- `404`：资源不存在
- `409`：资源冲突 / 重复提交
- `429`：限流
- `500`：服务器内部错误

### 服务器 ID 说明

部分接口支持以下两种服务器标识：

- 数据库 `cuid`
- 对外展示的 `PSID`

文档统一写作 `{id}`。

## 认证接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET / POST | `/auth/[...nextauth]` | - | Auth.js 标准路由 |
| POST | `/auth/register` | - | 邮箱注册 |
| POST | `/auth/send-code` | - | 发送邮箱验证码 |
| POST / PATCH | `/auth/reset-password` | - | 发送重置验证码 / 使用验证码重置密码 |

## 公共与用户接口

### 服务器发现与详情

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers` | 可选 | 服务器列表；支持 `page`、`limit/pageSize`、`tag`、`search`、`sort`、`ownerId` |
| POST | `/servers` | 需要登录 | 提交服务器，支持 multipart/form-data 和图标上传 |
| GET | `/servers/{id}` | 可选 | 获取服务器详情；未审核或非公开服务器按权限裁剪 |
| PATCH | `/servers/{id}` | owner | 编辑服务器信息 |
| DELETE | `/servers/{id}` | owner / admin | 删除服务器 |
| GET | `/servers/{id}/ping` | 可选 | 轻量延迟探针；不查数据库，只校验服务器 ID 格式后立即返回 |
| GET | `/servers/{id}/stats` | owner | 服务器统计数据；支持 `period=24h|7d|30d` |
| POST | `/servers/{id}/status/report` | 插件 API Key | 上报在线状态 |

### 收藏与评论

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers/{id}/favorite` | 需要登录 | 查询当前用户对目标服务器的收藏状态 |
| POST | `/servers/{id}/favorite` | 需要登录 | 收藏服务器 |
| DELETE | `/servers/{id}/favorite` | 需要登录 | 取消收藏 |
| GET | `/user/favorites` | 需要登录 | 当前用户收藏的服务器列表 |
| GET | `/user/favorites/ids` | 需要登录 | 当前用户收藏服务器 ID 列表 |
| GET | `/servers/{id}/comments` | 可选 | 评论列表 |
| POST | `/servers/{id}/comments` | 需要登录 | 发表评论或回复 |
| DELETE | `/servers/{id}/comments/{commentId}` | 作者 / admin | 删除评论 |

### 用户资料、通知、举报

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/user/{id}` | 可选 | 用户公开资料与其公开服务器 |
| GET | `/user/profile` | 需要登录 | 当前用户资料 |
| PATCH | `/user/profile` | 需要登录 | 更新当前用户资料 |
| GET | `/notifications` | 需要登录 | 通知列表，支持分页与 `unreadOnly` |
| PATCH | `/notifications` | 需要登录 | 批量标记通知已读 |
| GET | `/notifications/unread-count` | 需要登录 | 获取未读通知数量 |
| POST | `/reports` | 需要登录 | 举报服务器、评论或用户 |
| GET | `/changelog` | 可选 | 公开更新日志 |
| GET | `/health` | - | 健康检查 |
| POST | `/uploads/editor-image` | 需要登录 | 编辑器图片上传 |

## 服务器认领与服主管理接口

### 认领流程

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers/{id}/verify` | 需要登录 | 获取当前登录用户视角下的认领状态；仅当前 claim 发起者可看到 `verifyToken` |
| POST | `/servers/{id}/verify` | 需要登录 | 发起 MOTD Token 认领；任意登录用户都可发起，成功后 owner 可能转移 |
| PATCH | `/servers/{id}/verify` | 需要登录（当前 claim 发起者） | 触发 BullMQ 验证任务并等待结果 |
| POST | `/servers/{id}/verify/claim` | Bearer 认领密钥 / API Key | 插件侧完成认领或已认领服务器的 API Key 验证 |
| GET | `/servers/{id}/verify/claim-key` | 需要登录 | 查看当前登录用户相关的 claim key 状态 |
| POST | `/servers/{id}/verify/claim-key` | 需要登录 | 为未认领服务器生成 claim key；当前 owner 或有效 claim 发起者可操作 |

### 私有服设置、申请、邀请、成员

> 说明：以下接口受 `NEXT_PUBLIC_ENABLE_PRIVATE_SERVERS` 控制；默认关闭，关闭时会统一返回 `404`，前端不应暴露申请、邀请码或成员管理入口。

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| PUT | `/servers/{id}/settings` | owner | 更新可见性、加入模式、申请表等设置 |
| GET | `/servers/{id}/membership` | 需要登录 | 当前用户的成员 / 申请状态 |
| GET | `/servers/{id}/applications` | owner | 申请列表 |
| POST | `/servers/{id}/applications` | 需要登录 | 提交入服申请 |
| PUT | `/servers/{id}/applications/{appId}` | owner | 审批申请 |
| GET | `/servers/{id}/invites` | owner | 邀请码列表 |
| POST | `/servers/{id}/invites` | owner | 创建邀请码 |
| DELETE | `/servers/{id}/invites/{code}` | owner | 撤销邀请码 |
| POST | `/servers/{id}/join/{code}` | 需要登录 | 使用邀请码加入服务器 |
| GET | `/servers/{id}/members` | owner | 成员列表 |
| DELETE | `/servers/{id}/members/{memberId}` | owner | 移除成员 |
| POST | `/servers/{id}/api-key` | owner | 生成或重置插件 API Key |

### 整合包

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers/{id}/modpack` | 可选 | 当前服务器整合包列表；未过审服务器仅 owner / admin 可见，私有服仍要求成员关系 |
| POST | `/servers/{id}/modpack` | owner | 上传整合包 |
| DELETE | `/modpacks/{modpackId}` | owner | 删除整合包 |
| GET | `/modpacks/{modpackId}/download` | 可选 | 下载整合包；未过审服务器仅 owner / admin 可下载，私有服仍要求成员关系 |

## 白名单同步与移动端接口

### 白名单同步

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/servers/{id}/sync/handshake` | 插件 API Key | 首次同步握手，返回白名单与 WS 信息 |
| GET | `/servers/{id}/sync/pending` | 插件 API Key | 查询待处理 / 失败同步项 |
| GET | `/servers/{id}/sync/status` | owner | 控制台查看同步总览 |
| POST | `/sync/{syncId}/ack` | 插件 API Key | 确认某条同步事件已处理 |

### 原生移动端接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/mobile/session` | 移动端 session | 获取当前移动端会话 |
| DELETE | `/mobile/session` | 移动端 session | 注销移动端会话 |
| POST | `/mobile/session/login` | - | 移动端登录 |
| GET | `/mobile/inbox` | 移动端 session | 获取合并后的移动端通知收件箱 |
| POST | `/mobile/inbox/read` | 移动端 session | 标记移动端收件箱消息已读 |
| GET | `/mobile/inbox/unread-summary` | 移动端 session | 获取移动端未读摘要 |

## 管理后台接口

### 服务器 / 用户 / 审查 / 举报 / 更新日志

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/admin/servers` | admin | 管理后台服务器列表 |
| PATCH | `/admin/servers/{id}` | admin | 审核 / 更新服务器状态 |
| DELETE | `/admin/servers/{id}` | admin | 删除服务器 |
| GET | `/admin/users` | admin | 用户列表 |
| PATCH | `/admin/users/{id}` | admin | 封禁、解封、角色调整等 |
| GET | `/admin/moderation` | admin | 审查日志列表 |
| PATCH | `/admin/moderation/{id}` | admin | 处理审查记录 |
| GET | `/admin/reports` | admin | 举报列表 |
| PATCH | `/admin/reports/{id}` | admin | 处理举报 |
| GET | `/admin/changelog` | admin | 更新日志列表 |
| POST | `/admin/changelog` | admin | 创建更新日志 |
| PATCH | `/admin/changelog/{id}` | admin | 编辑更新日志 |
| DELETE | `/admin/changelog/{id}` | admin | 删除更新日志 |

## 现网约束

- 搜索、发现、收藏、通知、举报、控制台都只围绕服务器系统展开。
- forum / circles / posts / tags / bookmarks / forum notifications 等接口已经不在当前分支中；如果有外部调用方仍依赖它们，需要走兼容层或迁移方案，而不是在现网文档里继续保留旧说明。
- 若代码与文档冲突，以当前 `src/app/api/**/route.ts` 为准，并立即同步本文件。
