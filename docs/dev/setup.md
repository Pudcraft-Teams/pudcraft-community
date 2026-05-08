# 开发环境搭建

本指南覆盖从零到能跑通 `pnpm dev` 的全部步骤。任何一步卡住，先看「常见问题」一节。

## 前置条件

- **Node.js 20.9+**（CI 与生产最低版本；本工作树验证过 Node.js 25.2.1）
- **pnpm 10+**
- **Docker + Docker Compose**：本地起 PostgreSQL 与 Redis 用
- **Git**

如果你打算调通 Misskey 登录链路，还需要一个**自托管 Misskey 实例**（公司咖啡厅或自己起一个），并在 `.env` 里配置 `MISSKEY_HOST`。仓库根的 `docker-compose.yml` 主要面向**生产部署**，本地开发用不到完整 compose，下文给的是更轻的本地起法。

## 1. 克隆与安装依赖

```bash
git clone <repo-url> pudcraft-community
cd pudcraft-community
pnpm install
```

`postinstall` 会自动跑 `prisma generate`。

## 2. 起本地 PostgreSQL 与 Redis

最简单的做法是直接用 `docker run`：

```bash
docker run -d --name pudcraft-pg \
  -e POSTGRES_DB=pudcraft \
  -e POSTGRES_USER=pudcraft \
  -e POSTGRES_PASSWORD=pudcraft_dev \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d --name pudcraft-redis -p 6379:6379 redis:7-alpine
```

或者写一份本地用的 compose 文件（建议命名 `docker-compose.local.yml` 并加进 `.gitignore`）。仓库自带的 `docker-compose.yml` 用于生产镜像分发，不要直接 `docker compose up` 用于本地开发。

## 3. 配置环境变量

```bash
cp .env.example .env
```

最小可用的本地配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://pudcraft:pudcraft_dev@localhost:5432/pudcraft?schema=public` | 与上一步 `docker run` 参数对应 |
| `REDIS_URL` | `redis://localhost:6379` | |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` 生成 | NextAuth JWT 签名 |
| `MISSKEY_HOST` | 你自己的 Misskey 实例域名 | 没有的话登录链路跑不通 |
| `MISSKEY_TICKET_SECRET` | `openssl rand -hex 32` 生成 | 跨域登录 ticket HMAC |
| `STORAGE_DRIVER` | `local` | 不调试 S3 时保持 local |

完整变量清单见 [`.env.example`](../../.env.example)。

**没有 Misskey 实例怎么办？** 你仍然可以跑大部分页面与 API（浏览、提交服务器、控制台展示），但凡是与登录态强相关的功能（私服申请、控制台权限、收藏 / 通知）都需要一个能用的 MiAuth 实例。`MISSKEY_HOST` 与 `MISSKEY_TICKET_SECRET` 留空也能让 `pnpm dev` 起来，只是 `/login` 走不通。

## 4. 初始化数据库

第一次：

```bash
pnpm db:migrate
```

这会执行 `prisma/migrations/` 下所有迁移，构建出当前 schema。

后续改 schema 时（**绝不**只改 `prisma/schema.prisma` 不写迁移）：

```bash
pnpm db:migrate --name <snake_case_name>
```

要看现有数据：

```bash
pnpm db:studio
```

## 5. 起进程

最少需要两个进程：

```bash
# 终端 1
pnpm dev

# 终端 2
pnpm worker:dev
```

涉及白名单同步 / 私服插件集成时再起第三个：

```bash
# 终端 3
pnpm ws:dev
```

各进程职责见 [`architecture.md`](./architecture.md)。

## 6. 跑测试

完整测试套件：

```bash
pnpm test
```

`pnpm test` 会先 `set -a; . ./.env.example` 注入测试环境变量，再用 `node --import tsx --test` 收集 `src` / `prisma` / `scripts` 下所有 `*.test.ts(x)` 与 `*.spec.ts(x)`。

跑单个文件需要自己复刻同样的 env 加载流程：

```bash
sh -c 'set -a; . ./.env.example; set +a; node --import tsx --test src/lib/auth.test.ts'
```

直接 `tsx --test <file>` 会因缺少 `DATABASE_URL` 等变量失败。

## 7. 提交前最低检查

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
```

改了 i18n 还要：

```bash
pnpm i18n:check
```

改了 schema 必须**同 PR**生成迁移：

```bash
pnpm db:migrate --name <snake_case_name>
```

更多 PR 流程见 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)。

## 常见问题

### `prisma migrate dev` 报权限错误

通常是 `DATABASE_URL` 里的用户没有数据库 owner 权限。重起 docker 容器，或在 PG 里加权限：

```sql
ALTER USER pudcraft WITH SUPERUSER;
```

### 跑测试时报 `DATABASE_URL is required`

你大概是直接用 `tsx --test ...` 跑了——它不会读 `.env.example`。改用 `pnpm test` 或上面给的 `sh -c '...'` 包装。

### Worker 启动后立刻报 Redis 连接错误

确认 `redis-cli ping` 能拿到 `PONG`。`docker ps` 看 redis 容器是否在跑、端口是否被占。

### 改了 schema 后 TypeScript 不识别新字段

跑 `pnpm db:generate` 重新生成 Prisma client。

### `pnpm dev` 起来后 `/login` 一直跳转失败

检查 `MISSKEY_HOST` 是否能从你的开发机直接访问；`MISSKEY_TICKET_SECRET` 是否设置且至少 32 字节；浏览器 Network 面板看 `/api/auth/misskey/start` 与 `/callback` 的状态码。`/api/auth/misskey/callback` 找不到 state 时会**直接 fail closed**，这是有意为之。
