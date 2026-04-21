# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概览

Pudcraft Community 当前是一个 server-only 的 Minecraft 服务器社区平台。直播的产品面只包含服务器发现、提交、认领、评论、收藏、私有服成员流转、通知、更新日志和管理后台；历史上的论坛 / MoltBook 功能已经从当前分支移除，不应再被当作现网能力开发或文档化。

## 先看这个

- 修改规范文档时，必须保持 `AGENTS.md` 与 `CLAUDE.md` 内容同步；如果缺少 `CLAUDE.md`，就补齐并与本文件对齐。
- `docs/API.md` 与 `docs/PRD.md` 是现网文档；历史设计稿、`docs/superpowers/**`、旧 forum 规划稿只可作为存档参考，不能覆盖现状。
- 依赖升级策略见 `docs/dependency-pins.md`。当前要求是：保持 live runtime stack 新鲜，保留少数有明确迁移成本的 pinned 依赖。

## 产品范围

当前 live scope：

1. 服务器发现与搜索：`/` 与 `/servers` 共享 server list 体验。
2. 服务器提交与审核：登录用户可提交服务器，管理员审核上线。
3. 服务器认领与服主管理：MOTD 验证、设置、申请、邀请码、API Key、白名单同步。
4. 服务器互动：评论、收藏、通知、公开更新日志、举报。
5. 原生移动端支持：`/api/mobile/session*` 与 `/api/mobile/inbox*`。

明确不在当前 live scope：

- 圈子
- 帖子 feed
- forum bookmarks / forum notifications
- `src/components/forum/*`、`/c/*`、`/post/*`、`/explore`、`/new` 之类已移除页面对应的任何功能恢复

## 技术栈

- 框架：Next.js 16.2.4（App Router）+ React 19.2.5 + TypeScript 5.9.3（strict）
- 样式：Tailwind CSS 3 + Warm Clay Community UI
- 数据库：Prisma ORM 6.19.2 + PostgreSQL
- 认证：Auth.js / NextAuth v5 beta（Credentials + JWT session）
- 队列：BullMQ 5.74.1 + Redis（ioredis 5.10.1）
- 实时：独立 WebSocket 进程，用于白名单同步推送
- 邮件：Nodemailer 8.0.5
- 包管理：pnpm 10.28.x
- 运行时：生产最低 Node.js 20.9+；当前工作树验证环境为 Node.js 25.2.1

## 常用命令

```bash
# 开发
pnpm dev              # Next.js 开发服务器
pnpm worker:dev       # Worker（自动重启）
pnpm ws:dev           # WebSocket 服务（白名单 / 私有服联调时需要）

# 检查
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm build
pnpm format
pnpm format:check

# 数据库
pnpm db:generate
pnpm db:migrate
pnpm db:push          # 仅本地开发快速同步；禁止生产使用
pnpm db:studio

# 进程 / 构建
pnpm worker
pnpm ws
pnpm build:worker
```

日常本地开发至少启动 `pnpm dev` 和 `pnpm worker:dev`；涉及白名单同步或私有服联调时再加 `pnpm ws:dev`。

`pnpm test` 会先 `set -a; . ./.env.example` 注入测试环境变量，再扫 `src` / `prisma` / `scripts` 下的 `*.test.ts(x)` 与 `*.spec.ts(x)` 一起跑。要单独跑某个测试文件，需要自己复制这份 env 加载，例如：

```bash
sh -c 'set -a; . ./.env.example; set +a; node --import tsx --test src/lib/auth.test.ts'
```

直接 `tsx --test <file>` 会因为缺 `DATABASE_URL` 等环境变量而失败。

## 提交前检查

提交前至少运行：

1. `pnpm lint`
2. `pnpm tsc --noEmit`
3. `pnpm test`
4. 确认 `.env*` 没有被 stage

Commit message 使用 `<type>: <description>`，如 `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`。

## 目录结构

| 目录 | 职责 | 禁止放入 |
|---|---|---|
| `src/app/` | 页面容器与 App Router 路由 | 业务逻辑、数据库访问 |
| `src/app/api/` | REST API Route Handlers | 页面组件 |
| `src/app/admin/` | 管理后台页面 | 普通用户功能 |
| `src/app/console/` | 服主控制台页面 | 管理员后台逻辑 |
| `src/app/servers/` | 服务器详情、申请、认领、编辑、整合包页面 | 通用业务逻辑 |
| `src/components/` | 复用 UI 组件 | 直接数据库访问 |
| `src/components/console/` | 控制台专用交互组件 | 通用布局以外的共享逻辑 |
| `src/hooks/` | React hooks | 页面路由、数据库访问 |
| `src/lib/` | 业务逻辑、数据访问封装、验证、工具函数 | React 组件 |
| `src/worker/` | ping / verify / 同步相关后台任务 | API Route |
| `src/ws/` | 白名单同步 WebSocket 服务 | 页面组件 |
| `prisma/` | schema 与 migration | 应用 UI 代码 |
| `docs/` | 现网文档、计划、归档材料 | 源码实现 |

## 现网页面路由

用户 / 公共页面：

- `/`：服务器发现首页
- `/servers`：服务器列表页
- `/search`：旧搜索入口，重定向到 `/servers`
- `/servers/{id}`：服务器详情
- `/servers/{id}/apply`：申请加入私有服
- `/servers/{id}/join/{code}`：邀请码加入
- `/servers/{id}/verify`：认领服务器
- `/servers/{id}/edit`：服主编辑服务器
- `/servers/{id}/modpacks`：整合包页面
- `/submit`：提交服务器
- `/favorites`：我的收藏
- `/notifications`：通知中心
- `/u/{uid}`：公开用户主页（服务器维度）
- `/settings/profile`：个人资料设置
- `/login` / `/register` / `/forgot-password`
- `/changelog`

控制台 / 管理页面：

- `/console`：我的服务器与控制台入口
- `/console/{serverId}`：服主控制台
- `/my-servers`：兼容旧入口，重定向到 `/console`
- `/admin`
- `/admin/servers`
- `/admin/users`
- `/admin/reports`
- `/admin/moderation`
- `/admin/changelog`

## API 模块

完整接口说明看 `docs/API.md`。当前 live API 仅应围绕以下模块维护：

- 认证：`/api/auth/*`
- 服务器：`/api/servers`、`/api/servers/{id}`
- 收藏：`/api/servers/{id}/favorite`、`/api/user/favorites*`
- 评论：`/api/servers/{id}/comments*`
- 认领：`/api/servers/{id}/verify*`
- 私有服：`settings` / `applications` / `invites` / `membership` / `members` / `api-key`
- 同步：`/api/servers/{id}/sync/*`、`/api/sync/{syncId}/ack`
- 通知：`/api/notifications*`、`/api/mobile/inbox*`
- 举报：`/api/reports`、`/api/admin/reports*`
- 管理：`/api/admin/servers*`、`/api/admin/users*`、`/api/admin/moderation*`、`/api/admin/changelog*`
- 系统：`/api/health`、`/api/changelog`、`/api/uploads/editor-image`

## 命名与代码规范

- 组件文件 / 组件名：PascalCase，优先命名导出；Next.js 页面除外
- 工具 / 业务文件：camelCase
- 页面文件固定 `page.tsx`，API Route 固定 `route.ts`
- 类型导入使用 `import type`
- 路径别名使用 `@/*`
- `strict: true` 不可关闭；禁止 `any`，优先 `unknown` + 类型守卫

导入顺序：

1. Node.js 内置模块
2. 第三方依赖
3. `@/` 路径别名
4. 相对路径
5. 类型导入放每组最后

## 错误处理与接口约定

- API Route 必须有明确的参数校验与错误分支
- 错误响应统一走 `{ error: string, details?: unknown }`
- 常用状态码：400 / 401 / 403 / 404 / 409 / 429 / 500
- 非关键副作用失败只记日志，不阻塞主流程
- 删除、审核、同步类逻辑必须优先考虑幂等与重试安全

## 安全规则

- 密钥、SMTP、对象存储、Redis 等配置全部来自 `.env*`
- 所有写接口必须在服务端做权限校验，不能只依赖前端隐藏按钮
- 服务器地址校验要继续禁止 localhost / 内网 IP，端口范围 1-65535
- 私有服务器地址与端口只能对 owner / admin / member 暴露
- API Key 仅生成时展示一次，仓库内只保存 hash
- 邮箱验证码需要保留冷却与锁定机制
- 举报目标仅包括当前 live 目标：`server`、`comment`、`user`
- 用户外链必须 `rel="noopener noreferrer" target="_blank"`
- 非受控内容禁止直接 `dangerouslySetInnerHTML`

## 性能规则

- 页面请求与 API Route 内禁止直接 ping Minecraft 服务器；状态由 Worker 异步写回数据库
- 服务器列表与详情优先复用缓存字段：`isOnline`、`playerCount`、`maxPlayers`、`favoriteCount`
- 高频列表接口避免 N+1；收藏状态与成员关系应尽量批量查询
- 图片上传保持前端压缩：头像 256px、服务器图标 512px
- 白名单同步与通知统计要避免阻塞主要页面渲染

## 数据库 / 领域模型

当前主要模型：

- `User`
- `Server`
- `ServerStatus`
- `ServerComment`（映射表 `comments`）
- `Favorite`
- `ServerNotification`（映射表 `notifications`）
- `Modpack`
- `ServerApplication`
- `ServerInvite`
- `ServerMember`
- `WhitelistSync`
- `ModerationLog`
- `Changelog`
- `Report`

数据库约束：

- 迁移命令：`pnpm prisma migrate dev --name <snake_case_name>`
- 禁止生产环境 `db push`
- 常用 ID 使用 `cuid()`
- 时间字段统一 `DateTime`
- 关联关系要显式写 `onDelete`
- `address + port` 保持联合唯一
- 缓存字段更新要与主操作放在同一事务中

## Worker / WebSocket 规则

- `server-ping`：周期性刷新在线状态、人数、延迟等缓存
- `server-verify`：执行 MOTD Token 认领验证
- 白名单同步使用 Redis Pub/Sub + WebSocket 桥接
- 同步记录要覆盖 `pending / pushed / acked / failed`
- 插件接入走 `handshake -> realtime push -> ack` 流程

## UI 规则

- 主题：Warm Clay Community UI
- 主色：`#C2703C`
- 页面背景：`#F9F8F6`
- 表面：`#FFFFFF`
- 文本主色：`#1A1816`
- 次要文字：`#6F6862`
- 边框：`#E7E4E0`
- 成功 / 在线：`#5C946E`
- 字体：Plus Jakarta Sans + PingFang SC fallback
- 移动端优先；断点 `sm:640 md:768 lg:1024`
- 默认优先使用 Next.js `<Image>`；仅在已 sanitize 且白名单来源受控时保留 `<img>`
- 统一复用 Toast / EmptyState / PageLoading 等基础体验组件

## 部署架构

- GitHub Actions 构建镜像并部署到 VPS
- 容器组成：`web` + `worker` + `ws`
- PostgreSQL / Redis 由 1Panel 环境复用
- 站点部署路径：`/opt/pudcraft/`
- 反向代理由 1Panel OpenResty 管理

## 文档维护要求

- 改产品范围、路由、模型、接口时，优先同步 `AGENTS.md`、`CLAUDE.md`、`docs/API.md`、`docs/PRD.md`
- 如果改动触及 live surface，不能只更新历史设计稿
- 如果文档与代码冲突，以当前代码与路由为准，并立即修正文档
