# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库工作时提供指引。

## 项目简介

Pudcraft Community 当前是一个**仅 Minecraft 服务器**社区平台，已上线的功能范围仅包含：服务器发现、服务器提交（提交即拥有，配合内容自动审核）、通过控制台进行的服主管理、评论、收藏、私服成员申请流程、通知、更新日志，以及管理后台。历史的论坛 / MoltBook 相关功能已从本分支移除，**不要**把它们当作在线能力来开发或在文档中描述。

## 先读这个

- 编辑规范文档时，`AGENTS.md` 与 `CLAUDE.md` 必须保持同步。如果某一份缺失，先恢复并对齐另一份。
- `docs/API.md` 是当前在线的接口契约文档；早期的设计草稿或论坛时代的规划文档（已不在本分支跟踪，本地 `docs/plans/` 或 `docs/superpowers/` 内若仍有也属于 gitignored 内容）仅供存档，不能覆盖当前行为。
- 依赖升级策略见 `docs/dependency-pins.md`：原则是让在线运行栈保持新鲜，仅保留确实存在迁移成本的少量 pin。
- UI 文案抽取与翻译规则见 `docs/i18n.md`。所有用户可见文案必须经由 `messages/<locale>.json` 通过 `next-intl` 引入；**不要**在已迁移的文件里再写裸字符串。

## 写作语言约定

仓库与 GitHub 上的写作内容默认采用**简体中文**：

- 仓库内 `.md` 文档（包括内联代码块说明）
- 贡献指南、设计说明、架构说明
- GitHub Issue / PR / Review 中的中文沟通

不强制语言，沿用作者习惯：

- Commit message（subject 与 body）
- PR 标题与描述
- 分支名

**保持英文（不译）**：

- 代码注释、TODO、JSDoc
- 日志语句与内部错误信息（`logger.*`、`throw new Error(...)`）
- 第三方内容（上游 changelog、依赖说明、厂商文档）
- 文档中已有的引用片段、截图、数据样本

**用户可见的 UI 文案与对外的 API 错误响应不属于以上分类**：它们是产品文案，必须走 `messages/<locale>.json` 与 `next-intl`，详见 `docs/i18n.md`。

## 国际化（i18n）

- 库：`next-intl`。文案位于 `messages/zh.json`（默认）与 `messages/en.json`。配置在 `src/i18n/`。
- 每次请求按以下顺序解析 locale：`x-locale` 请求头 → `NEXT_LOCALE` cookie → 按 q 值匹配 `Accept-Language` 中支持的最优项 → 兜底 `zh`。当前没有 URL 前缀；待英文准备好上线后再迁移到路径前缀路由（`/en/...`）。
- 所有 `.tsx` 组件中的用户可见文案必须通过 `useTranslations`（客户端）或 `getTranslations`（服务端）解析。已迁移的文件**不允许**再内联中文或英文 UI 文案；新增组件从第一行起就要使用翻译键。
- 新增 key 时，**同一次提交**内必须同时更新 `messages/zh.json` 与 `messages/en.json`。英文可以是占位草稿，但 key 不能缺。
- `logger.*`、`throw new Error(...)`、commit message、代码注释、文档**不**走抽取流程，按上面的语言约定保持英文。
- 完整命名空间表与推进计划见 `docs/i18n.md`，i18n 相关疑问以该文档为唯一事实源。

## 产品范围

当前在线范围：

1. **服务器发现与搜索**：`/` 与 `/servers` 共用服务器列表体验。
2. **服务器提交**：登录用户提交服务器，提交时即时执行内容自动审核（阿里云 Green 文本 + 图片）。通过 → `reviewStatus = "approved"`，`ownerId = 提交者`。失败 → `reviewStatus = "rejected"` 并附拒绝原因。**没有**人工审核步骤，**也不**做服务器连通性检查。
3. **服主管理**：提交者自动成为 owner。服主通过 `/console` 与 `/console/{serverId}` 进行管理（Tab：Overview / Settings / Members / Integration / Apply Form）。**没有** MOTD 认领 / 验证流程。
4. **管理员控制**：`/admin/servers` 允许管理员为遗留 `ownerId=null` 的服务器指派 owner，并切换 `isVerified`（官方认证徽章，写入 `ModerationLog`）。`isVerified` **仅由管理员指派**——没有用户侧的认证申请流程。
5. **服务器交互**：评论、收藏、通知、公开更新日志、举报。

身份系统：账号信息**只**来源于自托管 Misskey 实例的 MiAuth（在用户可见 UI 中显示为「咖啡厅」；代码、路由、数据库字段、环境变量保留 `misskey` 命名）。**没有**本地密码 / 邮箱 / 验证码流程；用户字段（name / avatar / bio / handle）与管理员角色每次登录时从 Misskey 重新同步。

明确**不在**当前范围内：

- 圈子（Circles）
- 帖子流（Post feed）
- 论坛收藏 / 论坛通知
- 原生移动端 API（`/api/mobile/*` 已移除；移动端等到专门的 MiAuth 移动流程上线后再做）
- 任何会复活已删除界面的工作：`src/components/forum/*`、`/c/*`、`/post/*`、`/explore`、`/new`

## 技术栈

- 框架：Next.js 16.2.4（App Router） + React 19.2.5 + TypeScript 5.9.3（strict）
- 样式：Tailwind CSS 3 + Warm Clay Community UI
- 数据库：Prisma ORM 6.19.2 + PostgreSQL
- 认证：NextAuth v5 beta（JWT session），后端是 Misskey MiAuth（通过 `MISSKEY_HOST` 指定的单一自托管实例）；MiAuth 回调通过短时 HMAC ticket 桥接到 NextAuth 的 Credentials provider
- 队列：BullMQ 5.74.1 + Redis（ioredis 5.10.1）
- 实时：独立 WebSocket 进程，仅用于白名单同步推送
- 包管理：pnpm 10.28.x
- Runtime：生产最低 Node.js 20.9+；本工作树在 Node.js 25.2.1 上验证

## 常用命令

```bash
# 开发
pnpm dev              # Next.js 开发服务器
pnpm worker:dev       # 后台 Worker（自动重启）
pnpm ws:dev           # WebSocket 服务（白名单 / 私服集成相关工作时需要）

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
pnpm db:push          # 仅本地开发用的快速同步；生产环境绝不使用
pnpm db:studio

# 进程 / 构建
pnpm worker
pnpm ws
pnpm build:worker
```

日常开发至少需要 `pnpm dev` 与 `pnpm worker:dev`；动到白名单同步或私服集成时再加 `pnpm ws:dev`。

`pnpm test` 会先执行 `set -a; . ./.env.example` 注入测试环境变量，然后收集 `src` / `prisma` / `scripts` 下的 `*.test.ts(x)` 与 `*.spec.ts(x)` 一起运行。要单独跑一个测试文件，需要自己复刻同样的 env 加载流程，例如：

```bash
sh -c 'set -a; . ./.env.example; set +a; node --import tsx --test src/lib/auth.test.ts'
```

直接 `tsx --test <file>` 会因为缺少 `DATABASE_URL` 等环境变量而失败。

## 提交前检查

提交前至少跑：

1. `pnpm lint`
2. `pnpm tsc --noEmit`
3. `pnpm test`
4. 确认 `.env*` 没有进暂存区

Commit message 推荐使用约定式前缀（不强制中英文）：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`。

## 目录结构

| 目录                      | 职责                                                          | 不要放这里                                |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `src/app/`                | 页面容器与 App Router 路由                                    | 业务逻辑、数据库访问                      |
| `src/app/api/`            | REST API Route Handlers                                       | 页面组件                                  |
| `src/app/admin/`          | 管理后台页面                                                  | 普通用户功能                              |
| `src/app/console/`        | 服主控制台页面                                                | 仅管理员才能用的逻辑                      |
| `src/app/servers/`        | 服务器详情、申请、编辑、整合包页面                            | 通用业务逻辑                              |
| `src/components/`         | 可复用 UI 组件                                                | 直接的数据库访问                          |
| `src/components/console/` | 仅控制台使用的交互组件                                        | 跨控制台的共享逻辑                        |
| `src/hooks/`              | React hooks                                                   | 页面路由、数据库访问                      |
| `src/lib/`                | 业务逻辑、数据访问封装、校验、工具方法                        | React 组件                                |
| `src/i18n/`               | `next-intl` 配置（`config.ts`、`request.ts`）                 | 文案 JSON、UI 组件                        |
| `src/worker/`             | ping / sync 后台作业                                          | API Route                                 |
| `src/ws/`                 | 白名单同步 WebSocket 服务                                     | 页面组件                                  |
| `messages/`               | `next-intl` 文案包，每个 locale 一个 JSON                     | 翻译以外的任何东西                        |
| `prisma/`                 | Schema 与迁移                                                 | 应用 UI 代码                              |
| `docs/`                   | 当前在线的文档与归档                                          | 源代码实现                                |

## 路由清单

**用户 / 公开页面**

- `/`：服务器发现首页
- `/servers`：服务器列表
- `/search`：旧的搜索入口，重定向到 `/servers`
- `/servers/{id}`：服务器详情
- `/servers/{id}/apply`：申请加入私服
- `/servers/{id}/join/{code}`：通过邀请码加入
- `/servers/{id}/edit`：服主编辑服务器
- `/servers/{id}/modpacks`：整合包页面
- `/submit`：提交服务器
- `/favorites`：我的收藏
- `/notifications`：通知中心
- `/u/{misskeyId}`：公开用户主页（以服务器为中心）
- `/settings/profile`：只读资料页（每次登录从 Misskey 同步）
- `/login`：Misskey MiAuth 登录入口（**唯一**登录入口）
- `/changelog`

**控制台 / 管理后台**

- `/console`：我的服务器与控制台入口
- `/console/{serverId}`：服主控制台（默认 Overview Tab）
- `/console/{serverId}/settings`：Settings Tab
- `/console/{serverId}/members`：Members Tab
- `/console/{serverId}/integration`：Integration Tab
- `/console/{serverId}/form`：Apply Form Tab（私服申请表单编辑器，含评分与分支规则）
- `/my-servers`：旧入口，重定向到 `/console`
- `/admin`
- `/admin/servers`
- `/admin/users`
- `/admin/reports`
- `/admin/moderation`
- `/admin/changelog`

## API 模块

完整接口参考见 `docs/API.md`。在线 API 表面应当**仅**围绕以下模块维护：

- 认证：`/api/auth/[...nextauth]`、`/api/auth/misskey/start`、`/api/auth/misskey/callback`
- 服务器：`/api/servers`、`/api/servers/{id}`
- 收藏：`/api/servers/{id}/favorite`、`/api/user/favorites*`
- 评论：`/api/servers/{id}/comments*`
- 私服：`settings` / `applications` / `invites` / `membership` / `members` / `api-key`
- 同步：`/api/servers/{id}/sync/*`、`/api/sync/{syncId}/ack`
- 通知：`/api/notifications*`
- 举报：`/api/reports`、`/api/admin/reports*`
- 管理员：`/api/admin/servers*`、`/api/admin/users*`、`/api/admin/moderation*`、`/api/admin/changelog*`
- 系统：`/api/health`、`/api/changelog`、`/api/uploads/editor-image`

## 命名与代码风格

- 组件文件 / 组件名：PascalCase，优先具名导出；Next.js 页面文件除外
- 工具 / 业务文件：camelCase
- 页面文件统一为 `page.tsx`，API 路由统一为 `route.ts`
- Type import 用 `import type`
- Path alias 是 `@/*`
- `strict: true` 必须保持开启；不要使用 `any`，优先 `unknown` + 类型守卫

Import 顺序：

1. Node.js 内置模块
2. 第三方依赖
3. `@/` path alias
4. 相对路径
5. 同组内 type import 放最后

## 错误处理与 API 约定

- 每个 API Route 必须显式做参数校验与错误分支
- 错误响应统一为 `{ error: string, details?: unknown }`
- 常见状态码：400 / 401 / 403 / 404 / 409 / 429 / 500
- 非关键的副作用失败仅记录日志，不阻断主流程
- 删除、审核、同步逻辑优先保证幂等与重试安全

## 安全规则

- 密钥、对象存储、Redis 等必须来自 `.env*`
- 每个写接口都必须在服务端做权限校验，**绝不**依赖前端隐藏按钮
- 服务器地址校验必须继续拒绝 localhost / 私网 IP；端口范围 1–65535
- 私服地址与端口仅对 owner / admin / 成员可见
- API key 在生成时只展示一次；只持久化哈希
- Misskey 登录 ticket 短时、HMAC 签名、一次消费
- 举报对象限制在在线集合：`server`、`comment`、`user`
- 用户提供的外链必须使用 `rel="noopener noreferrer" target="_blank"`
- 任何未净化的内容**绝不**用 `dangerouslySetInnerHTML` 渲染

## 性能规则

- 页面请求与 API Route **绝不**直接 ping Minecraft 服务器；状态由 Worker 异步写入
- 服务器列表与详情应当复用缓存字段：`isOnline`、`playerCount`、`maxPlayers`、`favoriteCount`
- 高频列表接口必须避免 N+1；收藏状态与成员关系要批量查询
- 图片上传在客户端继续做压缩：头像 256px，服务器图标 512px
- 白名单同步与未读通知数不能阻塞主页面渲染

## 数据模型与数据库

主要模型：

- `User`（以上游 `misskeyId` 为主键来源；`name` / `image` / `bio` / `misskeyUsername` 每次登录覆盖）
- `Server`
- `ServerStatus`
- `ReservedNumericId`（PSID 等数字 ID 删除后的预留，避免回收复用）
- `ServerComment`（数据表 `comments`）
- `Favorite`
- `ServerNotification`（数据表 `notifications`）
- `Modpack`
- `ServerApplication`
- `ServerInvite`
- `ServerMember`
- `WhitelistSync`
- `ModerationLog`
- `Changelog`
- `Report`

数据库约定：

- 迁移命令：`pnpm prisma migrate dev --name <snake_case_name>`
- **绝不**在生产用 `db push`
- 一般主键用 `cuid()`
- 时间字段用 `DateTime`
- 关系必须显式声明 `onDelete`
- `address + port` 保持复合唯一
- 缓存字段更新与主写入在同一事务里完成

申请表单文档相关模块（命中频率高）：`src/lib/applicationFormDocument.ts`（schema + content hash）与 `src/lib/applicationFormEvaluation.ts`（评分与分支）。任何对文档结构的修改都必须**同时**更新 hash 与对应 Prisma 迁移——只改 schema 不写 migration 是已记录的过去错误（见下文）。

## Worker / WebSocket 规则

- `server-ping`：周期性刷新缓存的在线状态、人数、延迟
- 白名单同步走 Redis Pub/Sub，再桥接到 WebSocket 服务
- 同步记录必须覆盖 `pending / pushed / acked / failed` 四种状态
- 插件集成遵循 `handshake -> realtime push -> ack` 流程

## UI 主题（Claude Clay）

- 主题：**Claude Clay** —— 暖奶油纸 + 黏土橙品牌色。玩家界面叠加按 mode 区分的土系点缀，相同 token 一路延伸到服主控制台（`/console`），让控制台与玩家界面在视觉上属于同一个世界。
- 主色（按钮、链接、聚焦）：`#CC7D5E`（黏土）。Hover：`#BC6E4F`。Active：`#A45F40`。
- 页面背景：`#F4EFE6`（奶油纸）。卡片表面：`#FFFEFA`。表面变体 / 软面板：`#EDE6D9`。
- 主文：`#1A1A18` · 正文：`#494842` · 次要：`#847F71` · 元信息：`#B5AE9A`。
- 边框：`#E2DCCC`。强调边框：`#D5CDB7`。
- 成功 / 在线：`#5C8C4E` · 警告：`#C97C3F` · 错误 / 危险：`#C0392B`。
- Mode 调色板（服务器卡封面渐变 + 筛选器色块）：`--mode-survival #6B8E5B`（鼠尾草）、`--mode-creative #4A7C9D`（雾蓝）、`--mode-rpg #8B6FA8`（紫罗兰）、`--mode-pvp #C0392B`（陶土红）、`--mode-tech #C97C3F`（焦赭）、`--mode-sky #70A5B5`（雾松）、`--mode-vanilla #9C8F75`（卡其）、`--mode-mod #C9A93F`（芥末）、`--mode-mini #B86E8E`（玫瑰）。
- 字体：HarmonyOS Sans SC，自托管在 `/public/fonts/HarmonyOS_SansSC_Regular.woff2`，通过 `globals.css` 中的 `@font-face` 声明。回退链：`-apple-system, BlinkMacSystemFont, system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`。正文 letter-spacing `-0.005em`。
- Hero 排版用大字（`clamp(36px, 5vw, 56px)`，weight 700，letter-spacing `-0.035em`）—— 仅限营销页（首页 `/`）。内页保持紧凑。
- 服务器卡封面用 `.cover-{mode}` 类（16:9 渐变 + 网格底纹），徽章用 `.mode-tag` 叠加。筛选器上的 mode chip 带颜色色块。
- 边框 + 暖阴影承担景深；除封面图与首页 Hero 卡片预览外，避免 neumorphism / inner shadow / 渐变填充。
- Mobile-first；断点 `sm:640 md:768 lg:1024`
- 优先使用 Next.js `<Image>`；`<img>` 仅用于已经过净化、白名单中的来源
- 复用共享的 Toast / EmptyState / PageLoading 原语

## 文档纪律

- `AGENTS.md` 与 `CLAUDE.md` 从 `## 先读这个` 起**逐字一致**。仅顶部标题 + 简介段不同。每次同步修改，绝不让二者漂移。
- 产品范围、路由、模型、API 发生改动时，必须**与代码同一个 commit / PR**地更新 `AGENTS.md`、`CLAUDE.md`、`docs/API.md`。文档漂移视为 bug，不是 follow-up。
- 标记任务完成前先做一遍 doc pass：「我这次改了什么是未来读者（包括下一个 Claude 会话）需要知道的？」 如果答案不是「没有」，就现在更新文档。
- 影响在线表面的改动**不能**只反映在历史设计文档里。
- 文档与代码冲突时，**代码与在线路由是事实**——立刻把文档改正。

## 过去的错误（不要重犯）

把具体的踩坑记录在这里，避免同一种错误发生第二次。每次有新错误被发现（review、用户反馈、CI / 测试失败追溯到一个被遗漏的假设），就在 `CLAUDE.md` 与 `AGENTS.md` **两个文件**中追加一条。条目要短：发生了什么、为什么发生、下次怎么做。

- **通过文档悄悄扩大范围（PR #55、#56）**。在产品决策已经定为「仅服务器」之后，论坛 / MoltBook 仍然被设计、部分实现并写进文档当作在线能力，最后必须做完整回滚。下次：如果某个能力不在上面「产品范围」一节里，就**不要**实现、不要接路由 / API、也不要把它写成当前行为。范围调整必须**先**落到 `CLAUDE.md` / `AGENTS.md`，再写代码。
- **文档与代码漂移**。`docs/API.md`、`CLAUDE.md`、`AGENTS.md` 没有跟随代码同 PR 更新，导致后来的读者（包括 Claude 自己）把过期的指引当作现状继续叠加。下次：任何修改路由 / 模型 / API / 范围的 PR 必须在同一 PR 触及这三份文档，否则在 PR 描述里**显式**说明为什么不需要。
- **让 `CLAUDE.md` 与 `AGENTS.md` 漂移**。一份被更新而另一份没更新，导致不同工具看到的指引互相矛盾。下次：编辑其中一份后立即 diff，从 `## 先读这个` 起必须 byte-for-byte 一致。
- **i18n 落地后又内联 UI 文案**。`next-intl` 接好之后，后续改动仍然在已迁移文件里写裸中文字符串，悄悄破坏翻译契约。下次：如果一个文件已经在用 `useTranslations` / `getTranslations`，新增任意用户可见文案都必须经由 `messages/*.json` 的新 key，**不**写字符串字面量。
- **API 字段长得像展示字符串（例如 `peakTime: "暂无数据"`）**。在 API payload 里返回已渲染的人类可读字符串，把后端绑死在单一 locale 上。这个问题在 Batch 2 浮现，Batch 4 把 `/api/servers/[id]/stats` 重构为 `string | null` 才修复。下次：API 返回机器可读值（枚举、null、原始数据），UI 层负责展示格式与翻译。
- **跨请求边界的 lib 函数返回内联错误文案**（例如 `requireAdmin` 返回 `{ error: "请先登录" }`）。它阻断了翻译，因为调用方不知道收件人 locale。Pattern：lib 返回 `errorKey`，调用方再 `getTranslations({ locale })` 翻译。`requireActiveUser` / `requireAdmin` / `resolveActiveUserResult` 就是这样重构的。
- **领域库通过 `Error.message` 抛出用户可见中文**（例如 `src/lib/modpack.ts` 里 `throw new Error("整合包缺少 modrinth.index.json")`）。Route handler 直接把 `error.message` 透传给客户端，把库绑在单一 locale 上，英文化变得不可能。下次：自定义错误类暴露机器可读的 `.key`（与 params），由 route handler 通过 keyed namespace 翻译。参考 `ModpackError` + `errors.api.modpacks.*`；同样的形态适用于 `ImageValidationError.code` 与 `VerifyJobResult.reasonKey`。
- **Zod 的 `.min(3, "MC 用户名至少 3 个字符")` 内联文案绕过 `errorMap`**。Batch 3 一开始假设 `getZodErrorMap` 能拦截所有 Zod 报错——但 Zod 的 `errorMap` **只**对没有内联 message 的 issue 生效。字段级文案必须改用 `errors.validation.<area>.<key>` 的 key path，并在序列化时由 `flattenZodErrorWithLocale` 翻译。任何对 `src/lib/validation.ts` 的改动都要配上断言「序列化后的 `details.fieldErrors` 拿到了正确 locale」的回环测试。
- **把 `isVerified` 当作 claim/verify 流程的产物**。2026-04-30 用户架构整改之后，`Server.isVerified` **不再**意味着「服主完成 MOTD 验证」——它是管理员通过 `/admin/servers` 手动切换的官方认证徽章。原先的 claim/verify 流程（`/servers/{id}/verify`、`/api/servers/{id}/verify*`、`server-verify` worker job）整体移除。已存在的 `isVerified=true` 记录视为管理员授予。下次：**不要**尝试重新引入 MOTD 验证或用户侧的认证申请流程，那条路径是被有意拆掉的。`isVerified` 只能由管理员后台设置。
- **半迁移的身份系统（Misskey MiAuth 接管）**。从本地凭据迁移到 Misskey 时，**每一处**引用 `User.uid` / `User.email` / `User.passwordHash` / `Account` / `Session` / `VerificationToken` 的代码都必须在同一变更里处理——只要剩下一个过期的 `select: { uid: true }` 或一处 `signIn("credentials", { email })`，整条管线就会断。下次替换身份系统：**先**全树 grep 旧字段，写下完整调用图，把整个迁移当作一个 PR（schema + 类型 + 所有调用点 + i18n + 文档 + 测试），不要做「先合 一半，剩下回头扫」。依赖旧 auth 的移动端接口（`/api/mobile/*`）在同一变更里同步退役，因为它们没有 MiAuth 路径——没有专门的移动端 MiAuth 设计前不要复活它们。
- **MiAuth 回调信任未经请求的 session ID（账号被夺风险）**。`/api/auth/misskey/callback` 第一版只用 `sessionId` 在 Redis 查重定向 URL，但即使查不到也照样调用 `checkMiAuthSession(sessionId)`。攻击者只要自己批准一个 MiAuth session，把 URL 发给受害者，受害者就会登录到攻击者的账号。下次实现 OAuth / MiAuth 类流程：session ID 必须 (a) 在任何外部调用前做 shape 校验，(b) 用 Redis `GETDEL` 原子消费（杜绝重放），(c) 找不到 state 时**直接 fail closed**，(d) 验证上游用户是 local 而不是联邦实例。校验辅助函数放在纯模块里，让 forged-session 测试不必启动 Next.js 即可覆盖拒绝路径。
- **特性删除后遗留的 schema 列**（`verify_token` 等）。MOTD claim/verify 流程删除时，路由 / worker / lib / 页面都删掉了，但 `servers` 表上的 `verify_token` / `verify_expires_at` / `verify_user_id` 列还在。auth 相关的死列不只是死重，从 schema 看上去仍像是一个生效中的门禁系统，构成了持久攻击面。下次退役一个特性：在删代码的同一 PR 里附上 `DROP COLUMN` 迁移；并在迁移测试包里加「schema 不应声明 X」的断言，让任何回退式的 PR 在 CI 里直接失败。
- **「下次再写 migration」式的 schema 改动**。`ServerApplication.formContentHash` 一度只加进 `prisma/schema.prisma` 并被 API 写入，但迁移被推迟到「合并之后」。这种状态下生产部署后，第一次 POST `/applications` 就会因为缺列而 500。下次：schema 改动直到 `prisma/migrations/<timestamp>_*/migration.sql` 真的生成、并跑过 `pnpm prisma generate`，才算「落地」；像 `(row as { formContentHash?: string }).formContentHash ?? null` 这样的防御性强转是缺迁移的气味，不是可接受的临时垫片。
