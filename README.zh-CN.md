[English](./README.md) | **简体中文**

# Pudcraft Community

一个 Minecraft 服务器社区平台。玩家可以浏览、提交、认领、评论和收藏服务器，以及下载服主发布的整合包。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript 5（strict）
- Tailwind CSS 3
- PostgreSQL + Prisma ORM
- NextAuth v5（Credentials + JWT session）
- Redis + BullMQ
- 独立 WebSocket 服务（白名单同步推送）
- Nodemailer
- Zod
- pnpm

## 本地开发

### 前置依赖

- Node.js 20.9+
- pnpm 10+
- Docker 与 Docker Compose

### 1. 安装依赖

```bash
pnpm install
```

`postinstall` 会自动执行 `prisma generate`。

### 2. 启动 PostgreSQL 和 Redis

```bash
docker compose up -d
docker compose ps
```

默认端口：

- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`

### 3. 配置环境变量

```bash
cp .env.example .env
```

本地开发直接用 `.env.example` 里的默认值即可；生产环境请替换为真实的密钥与服务地址。

### 4. 初始化数据库

```bash
pnpm db:migrate --name init_local
```

后续 schema 变更一律走 Prisma migration，生产环境严禁使用 `db push`。

### 5. 启动应用和 Worker

开发时开两个终端：

```bash
pnpm dev
```

```bash
pnpm worker:dev
```

`web` 负责页面与 API，`worker` 负责 Minecraft 状态探测和认领校验任务。

## 常用命令

| 命令                            | 说明                                   |
| ------------------------------- | -------------------------------------- |
| `pnpm dev`                      | 启动 Next.js 开发服务器                |
| `pnpm build`                    | 构建生产包                             |
| `pnpm start`                    | 运行生产服务器                         |
| `pnpm lint`                     | 运行 ESLint                            |
| `pnpm format`                   | 用 Prettier 格式化 `src/`              |
| `pnpm format:check`             | 检查 `src/` 的格式                     |
| `pnpm db:migrate --name <name>` | 创建并应用一条 Prisma migration        |
| `pnpm db:generate`              | 重新生成 Prisma client                 |
| `pnpm db:studio`                | 打开 Prisma Studio                     |
| `pnpm db:push`                  | 仅开发环境使用的 schema 快速同步       |
| `pnpm worker`                   | 启动 worker                            |
| `pnpm worker:dev`               | 以 watch 模式启动 worker               |
| `pnpm ws`                       | 启动白名单同步 WebSocket 服务          |
| `pnpm ws:dev`                   | 以 watch 模式启动 WebSocket 服务       |
| `pnpm test`                     | 运行 `tsx --test` 测试套件             |
| `pnpm sync:favorite-counts`     | 校正收藏计数                           |
| `pnpm storage:check`            | 检查对象存储行为                       |

## 核心环境变量

### 基础

| 变量              | 说明                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL 连接串                                                       |
| `NEXTAUTH_SECRET` | NextAuth 密钥                                                           |
| `NEXTAUTH_URL`    | 自托管生产环境必须显式设置                                              |
| `LOG_LEVEL`       | `debug` / `info` / `warn` / `error`；非法值回退到 `info`                |

### Redis

二选一：

- `REDIS_URL`
- `REDIS_HOST` + `REDIS_PORT`（可选 `REDIS_PASSWORD`）

应用限流、验证码、BullMQ 队列共用同一个 Redis 解析器。

### 邮件

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

### 文件存储

- `STORAGE_DRIVER=local|s3|oss`
- 使用 S3 兼容后端时，需配置 `S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_ACCESS_KEY_SECRET`，以及 `S3_ENDPOINT` 或 `S3_REGION` 之一

### 反向代理客户端 IP

| 变量                      | 说明                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_IP_HEADER` | 可选。限流时信任的客户端 IP header；未设置时依次回退到 `x-real-ip`、`cf-connecting-ip`、`x-vercel-forwarded-for`            |

## 目录结构

```text
src/
├── app/                # Next.js 页面和 API Routes
├── components/         # 可复用 UI 组件
├── hooks/              # 自定义 hooks
├── lib/                # 工具函数、鉴权、队列、存储封装
├── styles/             # 全局样式
├── types/              # 类型声明
├── worker/             # BullMQ worker 和调度器
└── ws/                 # 白名单同步 WebSocket 服务
prisma/
├── migrations/         # Prisma migrations
└── schema.prisma       # 数据模型
```

## 运行时边界

- 页面和 API 绝不直接 ping Minecraft 服务器，只读取数据库里的缓存字段
- `server-ping` 队列每 5 分钟探测一次 approved 状态的服务器
- `server-verify` 队列负责 MOTD 认领校验
- 未通过审核的服务器不公开访问，仅 owner 和管理员可见

## 提交前检查

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
```

同时确认没有 `.env*` 文件被 staged。
