# Pudcraft Community

Minecraft 服务器社区平台，用户可以浏览、提交、认领、评论和收藏 MC 服务器。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript 5 (strict mode)
- **样式**: Tailwind CSS 3 + Material 3 浅色主题（品牌色 `#e2f4f7`，强调色 teal 系）
- **数据库**: Prisma ORM + PostgreSQL，Schema 在 `prisma/schema.prisma`
- **认证**: NextAuth v5 (beta) + Credentials Provider + JWT session
- **队列**: BullMQ + Redis (ioredis)
- **邮件**: Nodemailer + 飞书 SMTP
- **包管理**: pnpm

## 常用命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm lint             # ESLint 检查
pnpm tsc --noEmit     # TypeScript 类型检查
pnpm format           # Prettier 格式化
pnpm format:check     # 检查格式
pnpm worker:dev       # 启动 Worker 进程（开发模式，自动重启）
pnpm worker           # 启动 Worker 进程
pnpm db:migrate       # Prisma 数据库迁移（开发）
pnpm db:generate      # 生成 Prisma Client
pnpm db:studio        # 打开 Prisma Studio
```

## 提交前检查

提交代码前必须运行：
1. `pnpm lint` — 确保无 ESLint 报错
2. `pnpm tsc --noEmit` — 确保无 TypeScript 类型错误
3. 确认 `.env` 未被 stage

Commit message 格式: `<type>: <description>`
- `feat:` 新功能 / `fix:` 修复 / `refactor:` 重构 / `style:` 格式 / `docs:` 文档 / `chore:` 配置 / `perf:` 性能

## 目录结构

| 目录 | 职责 | 禁止放入 |
|---|---|---|
| `src/app/` | Next.js App Router 页面 & API 路由 | 业务逻辑、工具函数 |
| `src/app/api/` | REST API Route Handlers | 页面组件 |
| `src/app/admin/` | 管理员后台页面 | 普通用户功能 |
| `src/app/console/` | 服主控制台页面 | 管理员功能 |
| `src/components/` | 可复用 UI 组件 | API 调用、数据库访问 |
| `src/components/console/` | 控制台专用组件 | 通用 UI 组件 |
| `src/hooks/` | 自定义 React Hooks | 组件、API 逻辑 |
| `src/lib/` | 工具函数、第三方服务封装、DB 客户端 | React 组件、路由 |
| `src/worker/` | 后台 Worker 进程 | API Route、页面组件 |
| `src/types/` | TypeScript 类型声明 | 业务逻辑 |
| `src/styles/` | 全局样式 | 组件级样式 |
| `prisma/` | Prisma Schema 和迁移 | 应用代码 |

## 命名规范

- **组件文件/组件名**: PascalCase (`ServerCard.tsx` / `export function ServerCard`)
- **工具/库文件**: camelCase (`validation.ts`)
- **页面**: `page.tsx`，API Route: `route.ts` (Next.js 约定)
- **函数/变量**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **类型/接口**: PascalCase，无 `I` 前缀
- **Zod Schema**: camelCase + `Schema` 后缀 (`createServerSchema`)
- **数据库表名**: snake_case 复数 via `@@map`，字段 snake_case via `@map`

## 代码规范

### TypeScript
- `strict: true` 不可关闭，**禁止 `any`**（用 `unknown` + 类型守卫）
- 类型导入使用 `import type`，导出使用 `export type`
- 组件使用命名导出 (`export function`)，**禁止 default export**（Next.js 页面除外）
- 路径别名: `@/*` → `./src/*`

### 导入顺序
1. Node.js 内置模块
2. 第三方库
3. `@/` 路径别名导入
4. 相对路径导入
5. 类型导入放同组最后

### 错误处理
- API Route 必须 try-catch 包裹
- 统一格式: `{ error: string, details?: unknown }`
- 401 未登录 / 403 无权限 / 404 未找到 / 400 校验失败 / 409 已存在
- 副作用失败只记日志，不阻塞主操作

## 安全规则

- **密钥**: 绝不硬编码，通过 `.env.local` 管理，仓库只保留 `.env.example`
- **输入校验**: 所有 API 输入必须 Zod 校验；address 禁止 localhost/内网 IP；port 限 1-65535
- **权限**: 所有写操作必须服务端校验，不能只靠前端隐藏按钮
- **角色**: user(默认) | admin；Owner 通过 MOTD Token 认领
- **防滥用**: 邮箱验证码 60 秒冷却 + IP 日限 10 封；验证码错 5 次锁 15 分钟
- **外链**: 用户链接必须 `rel="noopener noreferrer" target="_blank"`
- **禁止** `dangerouslySetInnerHTML` 渲染用户输入（JSON-LD 等可控内容除外）

## 性能规则

- **禁止**在页面请求/API Route 中直接 ping Minecraft 服务器，状态通过 Worker 异步获取写入 DB
- API Route 响应目标 < 200ms，DB 查询告警 > 100ms
- MC ping 超时 5s，Worker 单任务 10s，MOTD 验证 15s
- 缓存字段 (`isOnline`, `playerCount`, `maxPlayers`, `latency`, `favoriteCount`) 直接在 Server 表读取，避免 join
- 收藏 ID 列表批量查询，不逐个请求

## 数据库规则

- 迁移命令: `pnpm prisma migrate dev --name describe_your_change`（snake_case 命名）
- **禁止**生产环境 `db push`
- ID 使用 `cuid()`，时间字段统一 `DateTime`
- 关联必须显式 `onDelete` 行为，查询频繁字段必须建索引
- 缓存字段更新必须与关联操作在同一 `$transaction` 中
- `address + port` 联合唯一约束

### 主要模型
User / Server / ServerStatus / Comment(2层嵌套) / Favorite / Notification / Account / Session

## Worker 规则

- `server-ping`: 每 5 分钟自动 ping 所有服务器，并发 5，不重试
- `server-verify`: 用户手动触发 MOTD Token 认领验证，不重试
- 任务必须幂等，使用 `jobId` 去重
- 服务器从离线变在线时通知收藏者（Redis 1 小时冷却）
- 开发需两个终端: `pnpm dev` + `pnpm worker:dev`

## UI 规则

- Material 3 浅色主题，品牌色 `#e2f4f7`，强调色 teal-600/teal-500
- 移动端优先，断点: sm:640 md:768 lg:1024
- 卡片: 白底 + `border-gray-200` + `rounded-xl` + 轻微阴影
- 在线 `emerald-500` / 离线 `gray-400` / 低延迟 `teal-600` / 中延迟 `yellow-500` / 高延迟 `red-500`
- 图片上传前端裁切 1:1 + WebP 压缩（头像 256px，图标 512px）
- 使用统一 Toast / EmptyState / LoadingSpinner 组件
- 使用 Next.js `<Image>` 替代 `<img>`

## 禁止事项

1. 不要在 API Route 中直接 ping Minecraft 服务器
2. 不要使用 `any` 类型
3. 不要写未经 Zod 校验的入库操作
4. 不要在 Server Component 中使用 `useState` / `useEffect`
5. 不要提交 `.env` 文件
6. 不要在生产环境使用 `db push`
7. 不要把大文件存入数据库
8. 不要硬编码配置值，用环境变量或常量
9. 不要引入未评估的重型依赖
10. 不要让副作用失败阻塞主操作
