[English](./README.md) | **简体中文**

# Pudcraft Community

一个 Minecraft 服务器社区平台。玩家浏览服务器、评论、收藏、申请加入私服；服主通过控制台提交并管理自己的服务器；账号信息**只**来源于自托管 Misskey 实例（通过 MiAuth），仓库本身不维护本地密码或邮件验证。

> **状态：上线前（pre-launch）**。第一版仍在开发中。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript 5（strict）
- Tailwind CSS 3 + Warm Clay UI
- PostgreSQL + Prisma ORM 6
- NextAuth v5（JWT session），后端是 Misskey MiAuth
- Redis + BullMQ
- 独立 WebSocket 服务（白名单同步推送）
- next-intl（zh / en）
- Zod
- pnpm 10

## 快速上手

```bash
git clone <repo-url> pudcraft-community
cd pudcraft-community
pnpm install

# 本地起 Postgres + Redis（仓库根的 docker-compose.yml 是生产用的，本地不要直接 up）
docker run -d --name pudcraft-pg \
  -e POSTGRES_DB=pudcraft -e POSTGRES_USER=pudcraft -e POSTGRES_PASSWORD=pudcraft_dev \
  -p 5432:5432 postgres:16-alpine
docker run -d --name pudcraft-redis -p 6379:6379 redis:7-alpine

cp .env.example .env       # 设置 MISSKEY_HOST、MISSKEY_TICKET_SECRET、NEXTAUTH_SECRET
pnpm db:migrate

pnpm dev          # web
pnpm worker:dev   # 后台 worker（另开终端）
pnpm ws:dev       # 白名单同步 WS（只在做插件集成时需要）
```

完整开发流程（Misskey 配置、单测执行、常见问题）见 [`docs/dev/setup.md`](./docs/dev/setup.md)。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | Next.js 开发服务器 |
| `pnpm build` / `pnpm start` | 构建并运行生产包 |
| `pnpm worker` / `pnpm worker:dev` | 后台 worker（server-ping） |
| `pnpm ws` / `pnpm ws:dev` | 白名单同步 WebSocket 服务 |
| `pnpm lint` | ESLint |
| `pnpm tsc --noEmit` | 类型检查 |
| `pnpm test` | 测试套件（`tsx --test`，env 从 `.env.example` 注入） |
| `pnpm i18n:check` | 检查 zh / en 翻译 key 是否一致 |
| `pnpm db:migrate` / `pnpm db:generate` / `pnpm db:studio` | Prisma 迁移 / 客户端 / GUI |

## 核心环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `NEXTAUTH_SECRET` | NextAuth JWT 签名密钥（`openssl rand -base64 32`） |
| `NEXTAUTH_URL` | 自托管生产环境必须显式设置 |
| `MISSKEY_HOST` | 自托管 Misskey 实例域名（不带协议、不带斜杠） |
| `MISSKEY_TICKET_SECRET` | 跨域登录 ticket 的 HMAC 密钥（`openssl rand -hex 32`） |
| `STORAGE_DRIVER` | `local`（默认）或 `s3`（S3 兼容对象存储） |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`；非法值回退到 `info` |

S3 / 对象存储与内容审核（阿里云 Green）相关变量见 [`.env.example`](./.env.example)。

## 运行时边界

- 页面和 API **绝不**直接 ping Minecraft 服务器，只读取数据库里 worker 异步写入的缓存字段。
- worker 定期刷新 approved 服务器的 `isOnline` / `playerCount` / `maxPlayers`。
- WebSocket 服务只在做插件白名单同步推送时需要；不起也不影响 web / worker 正常工作。
- 未通过审核或非公开的服务器不公开访问，仅服主与管理员可见。

## 项目文档

仓库当前是纯 Markdown 文档形态（暂未上文档站点）：

- [`CONTRIBUTING.md`](./CONTRIBUTING.md)：第一次贡献者从这里开始
- [`docs/README.md`](./docs/README.md)：完整文档索引
- [`docs/dev/setup.md`](./docs/dev/setup.md)、[`architecture.md`](./docs/dev/architecture.md)、[`data-model.md`](./docs/dev/data-model.md)：贡献者文档
- [`docs/API.md`](./docs/API.md)：REST API 契约
- [`docs/i18n.md`](./docs/i18n.md)：国际化方案
- [`docs/dependency-pins.md`](./docs/dependency-pins.md)：依赖固定政策

`CLAUDE.md` 与 `AGENTS.md` 是给 AI 编码助手（Claude Code、Codex、Cursor 等）用的指引。**人类贡献者无需阅读**。

## 提交前检查

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
# pnpm i18n:check   # 改了 messages/*.json 时
```

并确认没有 `.env*` 被 staged。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](./LICENSE)（AGPL-3.0）。如果你以网络服务形式运行本项目的修改版本，必须向该服务的用户提供你修改后的源码。
