# Pudcraft Community

Minecraft 服务器社区平台。用户可以浏览、提交、认领、评论、收藏服务器，并下载服务器公开发布的整合包。

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript 5
- Tailwind CSS 3
- PostgreSQL + Prisma ORM
- NextAuth v5（Credentials + JWT Session）
- Redis + BullMQ
- Nodemailer
- Zod
- pnpm

## 本地开发

### 前置要求

- Node.js 20+
- pnpm 9+
- Docker 与 Docker Compose

### 1. 安装依赖

```bash
pnpm install
```

`postinstall` 会自动执行 `prisma generate`。

### 2. 启动 PostgreSQL 与 Redis

```bash
docker compose up -d
docker compose ps
```

默认端口：

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 3. 配置环境变量

```bash
cp .env.example .env
```

本地开发可直接使用 `.env.example` 中的默认值；生产环境请改为真实密钥和服务地址。

### 4. 初始化数据库

```bash
pnpm db:migrate --name init_local
```

后续模型变更也使用 Prisma migration，不要在生产环境使用 `db push`。

### 5. 启动应用与 Worker

开发时需要两个终端：

```bash
pnpm dev
```

```bash
pnpm worker:dev
```

Web 负责页面和 API，Worker 负责 Minecraft 状态探测与认领验证任务。

## 常用命令

| 命令                            | 说明                        |
| ------------------------------- | --------------------------- |
| `pnpm dev`                      | 启动 Next.js 开发服务器     |
| `pnpm build`                    | 构建生产版本                |
| `pnpm start`                    | 启动生产服务器              |
| `pnpm lint`                     | 运行 ESLint 检查            |
| `pnpm format`                   | 使用 Prettier 格式化 `src/` |
| `pnpm format:check`             | 检查 `src/` 的格式是否规范  |
| `pnpm db:migrate --name <name>` | 创建并执行 Prisma 迁移      |
| `pnpm db:generate`              | 重新生成 Prisma Client      |
| `pnpm db:studio`                | 打开 Prisma Studio          |
| `pnpm db:push`                  | 仅开发调试时直接同步 Schema |
| `pnpm worker`                   | 启动 Worker                 |
| `pnpm worker:dev`               | 以 watch 模式启动 Worker    |
| `pnpm sync:favorite-counts`     | 同步修正收藏计数            |
| `pnpm storage:check`            | 检查对象存储行为            |

## 核心环境变量

### 基础配置

| 变量              | 说明                                                       |
| ----------------- | ---------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL 连接串                                          |
| `NEXTAUTH_SECRET` | NextAuth 密钥                                              |
| `NEXTAUTH_URL`    | 生产自托管时建议显式配置                                   |
| `LOG_LEVEL`       | `debug` / `info` / `warn` / `error`，非法值会回退到 `info` |

### Redis

二选一：

- `REDIS_URL`
- `REDIS_HOST` + `REDIS_PORT`（可选 `REDIS_PASSWORD`）

应用限流、验证码和 BullMQ 队列共用同一套 Redis 解析逻辑。

### 邮件

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

### 文件存储

- `STORAGE_DRIVER=local|s3|oss`
- 使用 S3 兼容存储时需要配置 `S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_ACCESS_KEY_SECRET`，以及 `S3_ENDPOINT` 或 `S3_REGION`

### 反向代理 IP

| 变量                      | 说明                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_IP_HEADER` | 可选，指定用于限流的可信客户端 IP 头；未设置时依次读取 `x-real-ip`、`cf-connecting-ip`、`x-vercel-forwarded-for` |

## 项目结构

```text
src/
├── app/                # Next.js 页面与 API Route
├── components/         # 可复用 UI 组件
├── hooks/              # 自定义 Hooks
├── lib/                # 工具函数、认证、队列、存储封装
├── styles/             # 全局样式
├── types/              # 类型声明
└── worker/             # BullMQ Worker 与调度器
prisma/
├── migrations/         # Prisma 迁移
└── schema.prisma       # 数据模型
```

## 运行边界

- 页面和 API 不直接 ping Minecraft 服务器，只读数据库缓存字段
- `server-ping` 队列每 5 分钟探测一次已审核服务器
- `server-verify` 队列处理 MOTD 认领验证
- 未审核服务器默认不可公开访问，owner / admin 例外

## 提交前检查

```bash
pnpm lint
pnpm tsc --noEmit
```

同时确认没有提交 `.env`。
