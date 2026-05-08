# 架构概览

## 一段话

Pudcraft Community 是一个 Next.js（App Router）单仓项目，运行时由**三个 Node 进程**组成：`web`、`worker`、`ws`。它们共享同一份 PostgreSQL 数据库与同一份 Redis；`web` 同步处理用户请求与 API，`worker` 异步刷新服务器在线状态，`ws` 把白名单变更实时推给已连接的服务器插件。身份系统**完全外置**给一个自托管 Misskey 实例。

## 进程拓扑

```
┌─────────────────────────────────────────────────────────┐
│                       浏览器 / 插件                     │
└────────────┬──────────────────────────┬─────────────────┘
             │                          │
       HTTP / Cookie               WebSocket (3001)
             │                          │
             ▼                          ▼
   ┌──────────────────┐        ┌──────────────────┐
   │     web (Next)   │        │       ws         │
   │   pages + API    │        │  /ws + /health   │
   └────────┬─────────┘        └─────────┬────────┘
            │                            │
            │     ┌────────┐             │
            └────▶│ Redis  │◀────────────┘
            ┌────▶│Pub/Sub │             ▲
            │     └────────┘             │
   ┌────────┴─────────┐                  │
   │     worker       │  ──── BullMQ ────┘
   │   ping + sched   │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │  PostgreSQL      │
   └──────────────────┘
   ┌──────────────────┐
   │  Misskey         │  ←── MiAuth（仅 web 调用）
   └──────────────────┘
```

## 各进程职责

### `web`（`pnpm dev` / `pnpm start`）
- 入口：`src/app/`（App Router 页面 + `/api/*` Route Handler）
- 渲染：用户页 / 服主控制台 / 管理后台
- 同步处理：服务器提交、内容审核、收藏 / 评论 / 通知、申请 / 邀请 / 成员管理、整合包上传 / 下载
- **不直接 ping Minecraft 服务器**——读数据库里的缓存字段（`isOnline` / `playerCount` / `maxPlayers` / `lastPingedAt`）
- `src/app/api/auth/misskey/start` 与 `/callback` 把 MiAuth 桥接到 NextAuth 的 Credentials provider

### `worker`（`pnpm worker` / `pnpm worker:dev`）
- 入口：`src/worker/index.ts`
- 由 **`pingWorker`**（BullMQ）+ **`scheduler`**（定时器）组成
- `pingWorker` 处理 `server-ping` 队列：周期性探测 approved 服务器，把结果写回 `Server` 缓存字段并插入 `ServerStatus` 历史
- `scheduler` 用 `setInterval` 把 ping 任务投到队列
- **没有** `server-verify` worker —— MOTD 认领流程已下线

### `ws`（`pnpm ws` / `pnpm ws:dev`）
- 入口：`src/ws/index.ts`
- 默认端口 `3001`
- HTTP 端点：`GET /health`（Postgres + Redis 双探活）
- WebSocket 端点：`/ws?serverId=...`，认证用 `Authorization: Bearer <api-key>` 或兼容旧版的 `?token=` 参数
- 服务端把 `apiKeyHash` 与 DB 里的 `Server.apiKeyHash` 比对决定接不接连
- 订阅 Redis pub/sub 频道 `whitelist:change`，把消息广播到对应 `serverId` 的已连接客户端
- 心跳：30s ping/pong；超时强制断开
- 同时把 `plugin:connected:<serverId>` 写入 Redis（TTL 60s），让 web 进程能感知插件在线状态

## 关键依赖

| 依赖 | 用途 |
|---|---|
| **PostgreSQL** | 真实数据源；通过 Prisma ORM 访问 |
| **Redis** | BullMQ 队列、Pub/Sub（白名单变更）、限流计数、临时 state（MiAuth session、login ticket） |
| **Misskey 实例** | 唯一身份提供方；通过 MiAuth 协议授权 |
| **阿里云内容安全 Green 2.0** | 服务器名称 / 描述 / 图标的 AI 内容审核（可选；不配 key 就跳过） |
| **S3 兼容对象存储**（可选） | 图标 / 整合包 / 编辑器图片；不配则用本地磁盘 |

## 请求生命周期：用户登录

```
浏览器                    web (/api/auth/misskey/*)               Misskey
   │
   │ GET /login
   ├───────────────────────────────▶
   │
   │ ◀── 302 → /api/auth/misskey/start?callbackUrl=...
   │
   │ GET /api/auth/misskey/start
   ├───────────────────────────────▶
   │                                 创建 MiAuth session id
   │                                 把 callbackUrl 存 Redis（短 TTL）
   │ ◀── 302 → https://{MISSKEY_HOST}/miauth/{session}?callback=...
   │
   │ 用户在 Misskey 端授权
   │ GET /api/auth/misskey/callback?session=...
   ├───────────────────────────────▶
   │                                 GETDEL Redis state（原子消费）
   │                                 ───── POST /api/miauth/{session}/check ─────▶
   │                                                                 验证 session
   │                                 ◀───── { token, user } ─────
   │                                 upsert local User by misskeyId
   │                                 sign 一次性 HMAC ticket
   │ ◀── 302 → /api/auth/callback/credentials (带 ticket)
   │
   │ NextAuth Credentials provider 验证 ticket → 颁发 JWT session cookie
   │
   │ ◀── 302 → 原始 callbackUrl
```

关键点（与「过去的错误」对应）：
- session id **必须** `GETDEL` 原子消费；找不到 state 时 fail closed。
- 跨域 ticket 是短时 HMAC 签名 + 一次性消费，避免回调被重放。
- 校验逻辑在纯模块（`src/lib/auth-ticket.ts` / `src/lib/auth-callback-url.ts`），让伪造 / 开放重定向测试不必启动 Next.js。

## 后台作业生命周期：`server-ping`

```
scheduler (worker 进程, setInterval)
   ├─ 查 approved 服务器
   ├─ enqueue server-ping job(s) → BullMQ → Redis
   │
pingWorker (worker 进程)
   ├─ minecraft-server-util ping
   ├─ 在事务里：
   │     UPDATE servers SET isOnline, playerCount, maxPlayers, lastPingedAt
   │     INSERT server_statuses(...)  ← 历史
   └─ 失败也写 ServerStatus 行（带 error）
```

## 实时链路：白名单同步

```
web (PUT /servers/{id}/applications/{appId} → approve)
  └─ 在事务里：
       INSERT ServerMember
       INSERT WhitelistSync (action=add, status=pending)
  └─ Redis publish whitelist:change { serverId, ... }
                              │
                              ▼
                        ws subscribe
                              │
                              ▼
              已连接的插件 WebSocket（对应 serverId）
                              │
                              ▼
         插件执行 add 命令 → POST /api/sync/{syncId}/ack
                              │
                              ▼
              web 把 WhitelistSync.status 改为 acked
```

落库时先写 `WhitelistSync (status=pending)` 再 publish——若插件当时不在线，pending 行能被插件下次握手时拉走（`GET /sync/pending`）。

## 关键设计选择

只记录那些为了避开历史踩坑而做的决定，其它可改可不改的写法以代码为准。

- **不在 web 进程里 ping Minecraft 服务器**：ping 是 IO 重 + 长尾延迟的操作，放到 worker 异步处理；列表 / 详情读缓存字段。
- **身份 100% 外置 Misskey**：移除了本地凭据 / 邮件验证 / 密码重置 / SMTP 整套，避免维护一套用户系统。代价：失去 Misskey 实例就无法登录。
- **特性删除时同时 DROP 列**：早期 `verify_token` 等遗留死列暴露过攻击面；现在退役特性必须同 PR 写 `DROP COLUMN`。
- **schema 改动必须有迁移**：直到 `prisma/migrations/<timestamp>_*` 真的生成才算落地，否则线上第一次写新字段就 500。
- **API 字段保持机器可读**：locale 相关展示字符串由前端 / `messages/*.json` 处理，后端不返回已渲染文案。

完整的 PR 红线清单见 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md#5-容易被打回的几类-pr)。
