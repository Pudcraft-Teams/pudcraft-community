# Pudcraft Community API 参考

> 分支：server-only
> Base path：`/api`

本文档**只**描述当前在线、仅服务器分支下的接口。早期分支中的论坛 / MoltBook 接口已经移除，不再属于在线 API 表面。

## 通用约定

### 认证

- Web：session cookie（NextAuth v5 / JWT）。登录入口**只有** Misskey MiAuth（通过 `MISSKEY_HOST` 指定的单一自托管实例）；早期的本地凭据、注册、密码找回与 `/api/mobile/*` 流程已经全部下线。
- 插件 / 同步：bearer API key

### 响应格式

成功响应通常是以下三种之一：

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
  "error": "error description",
  "details": {}
}
```

`details` 是可选字段；多数业务错误只返回 `{ error }`，仅在校验失败或确实需要附加上下文时才挂 `details`。

### 常见状态码

- `200`：成功
- `201`：创建成功
- `400`：参数错误 / 校验失败
- `401`：未认证
- `403`：禁止访问或账号不可用
- `404`：未找到
- `409`：冲突 / 重复提交
- `429`：触发限流
- `500`：服务端错误

### 服务器标识符

部分接口接受两种标识符之一：

- 数据库 `cuid`
- 对外公开的 `PSID`

文档中两者统一写作 `{id}`。

### 响应本地化

- API 错误响应（`{ error, details }`）会按调用方 locale 翻译。解析顺序：`x-locale` 请求头 → `NEXT_LOCALE` cookie → `Accept-Language` 中支持的最高 q 值匹配 → 默认 `zh`。
- Zod 校验失败放在 `details.fieldErrors` 中的字段错误已经在服务端按 locale 翻译完成 —— `errors.validation.<area>.<key>` 路径会在序列化前解析为目标语种文案。
- 成功响应体仍可能包含 locale 相关字符串（服务器名、评论正文、用户提交内容）。客户端**不要**假设非机器可读字段一定是英文。
- 新写的客户端代码请使用 `@/lib/apiFetch` 中的 `apiFetch`，它会自动注入 `x-locale`。

## 认证类接口

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET / POST | `/auth/[...nextauth]` | - | NextAuth 标准路由（session、csrf、signout、内部 credentials callback） |
| GET | `/auth/misskey/start?callbackUrl=...` | - | 创建 MiAuth session，把 `callbackUrl` 存入 Redis，重定向浏览器到 `https://{MISSKEY_HOST}/miauth/{session}?callback=...` |
| GET | `/auth/misskey/callback?session=...` | - | 用户在 Misskey 端授权后回跳到此；服务端通过 `POST /api/miauth/{session}/check` 校验 session，按 `misskeyId` upsert 本地 `User`，从 `isAdmin` / `isModerator` 推导 `role`，再用一次性 HMAC ticket 走 NextAuth 完成登录 |

## 公开 / 用户接口

### 服务器发现与详情

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers` | 可选 | 服务器列表；支持 `page`、`limit/pageSize`、`tag`、`search`、`sort`、`ownerId` |
| POST | `/servers` | 登录 | 提交服务器；接受 multipart/form-data 与图标上传 |
| GET | `/servers/{id}` | 可选 | 服务器详情；未通过审核或不公开的服务器会按权限过滤 |
| PATCH | `/servers/{id}` | 服主 | 编辑服务器信息 |
| DELETE | `/servers/{id}` | 服主 / 管理员 | 删除服务器 |
| GET | `/servers/{id}/ping` | 可选 | 轻量延迟探测；不打数据库 —— 仅校验 ID 格式后立即返回 |
| GET | `/servers/{id}/stats` | 服主 | 服务器统计；支持 `period=24h|7d|30d` |
| POST | `/servers/{id}/status/report` | 插件 API key | 插件上报在线状态 |

### 收藏与评论

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers/{id}/favorite` | 登录 | 当前用户对该服务器的收藏状态 |
| POST | `/servers/{id}/favorite` | 登录 | 收藏服务器 |
| DELETE | `/servers/{id}/favorite` | 登录 | 取消收藏 |
| GET | `/user/favorites` | 登录 | 当前用户收藏的服务器列表 |
| GET | `/user/favorites/ids` | 登录 | 当前用户收藏服务器的 ID 列表 |
| GET | `/servers/{id}/comments` | 可选 | 评论列表 |
| POST | `/servers/{id}/comments` | 登录 | 发表评论或回复 |
| DELETE | `/servers/{id}/comments/{commentId}` | 作者 / 管理员 | 删除评论 |

### 用户资料、通知、举报

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/user/{id}` | 可选 | 公开的用户资料与该用户的公开服务器 |
| GET | `/user/profile` | 登录 | 当前用户资料 |
| PATCH | `/user/profile` | 登录 | 更新当前用户资料 |
| GET | `/notifications` | 登录 | 通知列表；支持分页与 `unreadOnly` |
| PATCH | `/notifications` | 登录 | 批量标记已读 |
| GET | `/notifications/unread-count` | 登录 | 未读通知数 |
| POST | `/reports` | 登录 | 举报服务器、评论或用户 |
| GET | `/changelog` | 可选 | 公开的更新日志 |
| GET | `/health` | - | 健康检查 |
| POST | `/uploads/editor-image` | 登录 | 编辑器图片上传 |

## 服主管理接口

### 私服设置、申请、邀请、成员

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| PUT | `/servers/{id}/settings` | 服主 | 更新可见性、加入方式、申请表单等 |
| GET | `/servers/{id}/membership` | 登录 | 当前用户的成员 / 申请状态 |
| GET | `/servers/{id}/applications` | 服主 / 管理员 / 申请人 | 服主与管理员看到全部申请；申请人只看到自己的；其余角色 `403`。申请人视图下的 `evaluationResult` 会经过 `pickPlayerEvaluationView` 投影（见下文「玩家评估投影」） |
| POST | `/servers/{id}/applications` | 登录 | 提交私服申请。响应中的 `evaluationResult` 已按申请人视角投影；完整的 `evaluationResult`（含 `score`、`passingScore`、`offendingFieldKey`）**只**会出现在服主作用域的读接口里 |
| PUT | `/servers/{id}/applications/{appId}` | 服主 | 审核申请 |
| GET | `/servers/{id}/invites` | 服主 | 邀请码列表 |
| POST | `/servers/{id}/invites` | 服主 | 创建邀请码 |
| DELETE | `/servers/{id}/invites/{code}` | 服主 | 撤销邀请码 |
| POST | `/servers/{id}/join/{code}` | 登录 | 通过邀请码加入 |
| GET | `/servers/{id}/members` | 服主 | 成员列表 |
| DELETE | `/servers/{id}/members/{memberId}` | 服主 | 移除成员 |
| POST | `/servers/{id}/api-key` | 服主 | 生成或重置插件 API key |

#### `PUT /settings` 中的 `applicationForm` 负载

`applicationForm` 字段接受两种格式：旧版 v0 的 `ApplicationFormField[]` 数组（无评分），或当前规范的 v1 `OwnerFormConfig` 文档：

```jsonc
{
  "applicationForm": {
    "version": 1,
    "fields": [/* ApplicationFormField[] */],
    "settings": {
      "passingScore": 6,
      "showScoreToPlayerOnReject": false,
      "showRejectReasonToPlayerOnReject": false
    },
    "branching": []
  }
}
```

`settings.passingScore` 设为 `null` 表示关闭分数门槛。每选项的评分字段（`points`、`correct`、`autoReject`）位于 `fields[*].options[*]` 上 —— 它们**永远不会**到达非服主视角；运行时会在每个非服主 API 边界投影到 `PlayerFormView`。

#### 玩家评估投影

申请人作用域的响应在序列化前先把 `evaluationResult` 过一遍 `pickPlayerEvaluationView`（`src/lib/applicationFormEvaluation.ts`）。投影规则：

- `pending_review` 永远只返回 `{ result, evaluatedAt }` —— 即便申请人已通过也不泄露分数 / 阈值。
- `hard_disqualify` 只在 `OwnerFormConfig.settings.showRejectReasonToPlayerOnReject` 为 `true` 时保留 `offendingFieldKey`。
- `score_below_threshold` 只在 `OwnerFormConfig.settings.showScoreToPlayerOnReject` 为 `true` 时保留 `score` 与 `passingScore`。
- 旧版 v0 表单（没有 `settings` 块）回退到最小投影。

服主与管理员通过服主作用域的 GET 拿到完整的 `ApplicationFormEvaluationResult` 形态。被驳回后再次提交按 `formContentHash` 闸门控制（见 `errors.api.applications.formChangedSinceRejection`）；`(serverId, userId)` 的唯一约束在并发下会翻译成 `errors.api.applications.duplicateActiveApplication`。

#### `GET /servers/{id}` 中的申请表单投影

`GET /api/servers/{id}` **只**在调用方就是 `ownerId` 时返回完整的 `OwnerFormConfig`。其他任何调用方 —— 包括看别人服务器的管理员、成员、匿名访客 —— 拿到的都是 `PlayerFormView` 投影（去掉 `points` / `correct` / `autoReject` / `passingScore` / `branching`）。管理员要审视别人的评分配置，应该走服主控制台的管理员 impersonation，而不是公开详情接口。

### 整合包

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/servers/{id}/modpack` | 可选 | 服务器整合包列表；未审核服务器只对服主 / 管理员可见，私服仍需要成员身份 |
| POST | `/servers/{id}/modpack` | 服主 | 上传整合包 |
| DELETE | `/modpacks/{modpackId}` | 服主 | 删除整合包 |
| GET | `/modpacks/{modpackId}/download` | 可选 | 下载整合包；未审核服务器仅服主 / 管理员可下载，私服仍需要成员身份 |

## 白名单同步接口

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| POST | `/servers/{id}/sync/handshake` | 插件 API key | 同步握手；返回白名单与 WS 连接信息 |
| GET | `/servers/{id}/sync/pending` | 插件 API key | 待处理 / 失败的同步项 |
| GET | `/servers/{id}/sync/status` | 服主 | 控制台用的同步概览 |
| POST | `/sync/{syncId}/ack` | 插件 API key | 上报同步事件已处理 |

## 管理员接口

### 服务器 / 用户 / 审核 / 举报 / 更新日志

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/admin/servers` | 管理员 | 服务器列表（管理视角） |
| PATCH | `/admin/servers/{id}` | 管理员 | 更新服务器状态、为遗留 `ownerId=null` 服务器指派 owner、切换 `isVerified`（官方认证徽章；写入 `ModerationLog`） |
| DELETE | `/admin/servers/{id}` | 管理员 | 删除服务器 |
| GET | `/admin/users` | 管理员 | 用户列表 |
| PATCH | `/admin/users/{id}` | 管理员 | 封禁、解封、角色变更等 |
| GET | `/admin/moderation` | 管理员 | 审核日志 |
| PATCH | `/admin/moderation/{id}` | 管理员 | 处理审核记录 |
| GET | `/admin/reports` | 管理员 | 举报列表 |
| PATCH | `/admin/reports/{id}` | 管理员 | 处理举报 |
| GET | `/admin/changelog` | 管理员 | 更新日志列表 |
| POST | `/admin/changelog` | 管理员 | 新建一条更新日志 |
| PATCH | `/admin/changelog/{id}` | 管理员 | 编辑更新日志 |
| DELETE | `/admin/changelog/{id}` | 管理员 | 删除更新日志 |

## 在线约束

- 搜索、发现、收藏、通知、举报、控制台都围绕服务器系统组织。
- 论坛 / 圈子 / 帖子 / 标签 / 收藏夹 / 论坛通知接口已经不在本分支；若仍有外部调用方需要访问，必须自行提供兼容层或迁移方案 —— **不要**把旧接口描述再加回本文档。
- 文档与代码冲突时，**`src/app/api/**/route.ts` 是事实**——立刻同步本文。
