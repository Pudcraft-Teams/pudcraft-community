# Pudcraft Community — Minecraft 服务器聚合站

国内 Minecraft 私人服务器交流聚合平台。用户可以浏览服务器信息流、查看服务器在线状态与玩家人数。

## 技术栈

- **框架**：Next.js 15 (App Router) + TypeScript
- **样式**：Tailwind CSS
- **数据库**：PostgreSQL + Prisma ORM
- **任务队列**：Redis + BullMQ
- **输入校验**：Zod
- **代码质量**：ESLint + Prettier
- **包管理**：pnpm

---

## 快速启动

### 前置要求

- **Node.js** >= 20
- **pnpm** >= 9（`npm install -g pnpm`）
- **Docker** & **Docker Compose**

### 1. 克隆项目 & 安装依赖

```bash
cd Pudcraft-community
pnpm install
```

> `postinstall` 脚本会自动运行 `prisma generate` 生成数据库客户端类型。

### 2. 启动基础设施（PostgreSQL + Redis）

```bash
docker compose up -d
```

启动后：

| 服务       | 地址                | 认证信息                              |
| ---------- | ------------------- | ------------------------------------- |
| PostgreSQL | `localhost:5432`    | 用户 `pudcraft` / 密码 `pudcraft_dev` |
| Redis      | `localhost:6379`    | 无密码                                |

验证容器状态：

```bash
docker compose ps
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

默认值即可在本地开发中直接使用，**无需修改**。

### 4. 初始化数据库

```bash
pnpm db:push
```

> 首次运行会创建所有表。后续模型变更请使用 `pnpm db:migrate --name your_change`。

### 5. 启动开发服务器

```bash
pnpm dev
```

打开浏览器访问 **http://localhost:3000** 查看主页信息流。

### 6. 启动 Worker（可选）

```bash
pnpm worker:dev
```

Worker 会从 Redis 队列取任务并执行 Minecraft 服务器状态检查（当前为 Mock 实现）。

---

## 可用脚本

| 命令                | 说明                                |
| ------------------- | ----------------------------------- |
| `pnpm dev`          | 启动 Next.js 开发服务器              |
| `pnpm build`        | 构建生产版本                         |
| `pnpm start`        | 启动生产服务器                       |
| `pnpm lint`         | 运行 ESLint 检查                     |
| `pnpm format`       | 使用 Prettier 格式化代码             |
| `pnpm format:check` | 检查代码格式是否规范                 |
| `pnpm db:push`      | 推送 Schema 到数据库（仅开发用）     |
| `pnpm db:migrate`   | 创建并执行数据库迁移                 |
| `pnpm db:studio`    | 打开 Prisma Studio（数据库可视化）   |
| `pnpm db:generate`  | 重新生成 Prisma Client               |
| `pnpm worker:dev`   | 启动 BullMQ Worker（开发热重载）     |

---

## 环境变量说明

| 变量           | 说明                              | 默认值                                                                      |
| -------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL 连接字符串             | `postgresql://pudcraft:pudcraft_dev@localhost:5432/pudcraft?schema=public`   |
| `REDIS_URL`    | Redis 连接字符串                  | `redis://localhost:6379`                                                    |
| `NODE_ENV`     | 运行环境                          | `development`                                                               |
| `LOG_LEVEL`    | 日志级别 (debug/info/warn/error)  | `info`                                                                      |

---

## 项目结构

```
src/
├── app/                # Next.js 页面和 API 路由
│   ├── api/servers/    # 服务器 REST API
│   └── servers/[id]/   # 服务器详情页
├── components/         # 可复用 UI 组件
├── lib/                # 工具函数、DB 客户端、校验等
│   └── serverStatus/   # MC 服务器 Ping 逻辑
├── queues/             # BullMQ 队列定义
├── styles/             # 全局样式
└── worker/             # 后台 Worker 进程
```

---

## 常见问题

### Q: Docker 端口 5432 或 6379 冲突？

修改 `docker-compose.yml` 中的端口映射（如 `5433:5432`），然后同步修改 `.env` 中的 `DATABASE_URL`。

### Q: `pnpm db:push` 报连接错误？

1. 确认 Docker 容器已启动：`docker compose ps`
2. 如果刚启动，等待 3-5 秒让 PostgreSQL 完成初始化
3. 确认 `.env` 中 `DATABASE_URL` 与 `docker-compose.yml` 配置一致

### Q: Worker 启动报 Redis 连接错误？

确认 Redis 容器正在运行（`docker compose ps`），并检查 `.env` 中 `REDIS_URL` 是否正确。

### Q: 主页显示的是假数据？

是的，MVP 阶段使用 Mock 数据。数据源在 `src/lib/mock.ts`，后续切换为数据库查询只需替换数据读取层，不影响 UI 组件。

### Q: 如何添加新的 Prisma 模型？

1. 编辑 `prisma/schema.prisma`
2. 运行 `pnpm db:migrate --name describe_your_change`
3. Prisma Client 会自动重新生成

### Q: 如何向队列添加一个测试任务？

在 Node.js REPL 或脚本中：

```typescript
import { enqueueStatusCheck } from "@/queues/statusQueue";
await enqueueStatusCheck("mock-server-id");
```

---

## 架构边界

```
浏览器
  ↓ HTTP
Next.js (SSR/API)
  ↓ 读取
数据库 (PostgreSQL)
  ↑ 写入
Worker (BullMQ)
  ↓ ping
Minecraft 服务器
```

**关键约束**：Next.js 层只读数据库，不直接 ping MC 服务器。所有抓取逻辑在 Worker 中执行。
