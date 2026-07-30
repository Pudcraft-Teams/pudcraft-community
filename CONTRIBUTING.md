# 贡献指南

谢谢你愿意为 Pudcraft Community 投入时间。本指南带你跑通开发环境、提交第一份 PR，并避开几条我们已经踩过的坑。

## 1. 开始之前

**产品范围**：当前是仅 Minecraft 服务器的社区平台——服务器发现 / 提交（提交即拥有，配合自动审核）/ 服主控制台 / 评论 / 收藏 / 私服成员申请 / 通知 / 更新日志 / 管理后台。论坛 / MoltBook / 圈子 / 帖子流等都不在范围内，相关代码已经从本分支移除，**不要**当作在线能力开发。

项目文档当前是纯 Markdown 形态（暂未上 VitePress 站点）。索引见 [`docs/README.md`](./docs/README.md)。常用入口：

- [`docs/dev/setup.md`](./docs/dev/setup.md)：开发环境搭建
- [`docs/dev/architecture.md`](./docs/dev/architecture.md)：架构概览
- [`docs/dev/data-model.md`](./docs/dev/data-model.md)：数据模型导览
- [`docs/API.md`](./docs/API.md)：接口契约
- [`docs/i18n.md`](./docs/i18n.md)：国际化方案
- [`docs/dependency-pins.md`](./docs/dependency-pins.md)：依赖固定政策

## 2. 环境与上手

按 [`docs/dev/setup.md`](./docs/dev/setup.md) 跑通本地开发。任何步骤卡住，欢迎在 issue 里复述错误信息。

## 3. 提 issue

- **Bug**：附上稳定复现步骤、期望行为、实际行为，以及你的 Node / pnpm / 浏览器版本。能给到 `pnpm tsc --noEmit` / `pnpm test` 的输出最好。
- **新特性**：先描述场景与动机；动手前等到我们在 issue 里确认。「产品范围」之外的提案大概率不会被接收（参考过去的 PR #55、#56 教训）。
- **安全相关问题**：**不要**在公开 issue 提，私下联系仓库 owner。

## 4. 提 PR 流程

1. 从 `main` 切分支。分支名风格不强制中英文，但建议带清晰前缀，比如 `feat/private-server-applications`、`fix/auth-callback-url`。
2. 改代码 + **同时改文档**。任何动到路由 / 模型 / API / 产品范围的 PR，都必须在同一 PR 更新 `docs/API.md` 与相关 `docs/dev/*` 文档；同时同步 AI 指引 `CLAUDE.md` / `AGENTS.md`，避免 AI 助手用过期信息继续叠加错误。
3. 提交前依次跑通：
   ```bash
   pnpm lint
   pnpm tsc --noEmit
   pnpm test
   ```
4. 改了 i18n 还要跑 `pnpm i18n:check`。
5. 改了 `prisma/schema.prisma` 必须**同 PR**生成迁移：
   ```bash
   pnpm db:migrate --name <snake_case_name>
   ```
   只改 schema 不写 migration 的 PR 会被打回——这是已记录的过去错误。
6. Commit message 不强制中英文，沿用作者习惯；建议带 conventional 前缀（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`）。
7. PR 描述里写清：
   - 改了什么 / 为什么改
   - 哪些路由 / 模型受影响
   - 风险点（schema 改动、auth 流程改动、数据迁移等）
   - 测试方式（自动化 + 手动验证）

## 5. 容易被打回的几类 PR

以下都是已经踩过的坑：

- **范围超出**：动了产品范围之外的能力（例如顺手加论坛 / 圈子 / 帖子流）。
- **文档没同步**：路由 / 模型 / API 改了但 `docs/API.md`（以及 AI 指引 `CLAUDE.md` / `AGENTS.md`）没改。
- **schema 改动没迁移**：只动 `prisma/schema.prisma` 没生成 `prisma/migrations/<timestamp>_*` —— 部署上线就会 500。
- **退役特性留下死列**：删一个特性时漏掉对应的 `DROP COLUMN`。
- **i18n 倒退**：在已迁移的文件里又内联中文 / 英文字面量。
- **API 返回展示字符串**：把 locale 相关字符串塞进 API payload，把后端绑死在某个 locale 上。
- **lib 抛出用户可见文案**：`throw new Error("整合包缺少 modrinth.index.json")` 这种是错的；用错误码 + key，由 route handler 翻译。
- **Auth 流程信任未经请求的 state**：MiAuth / OAuth 类回调必须 fail closed + 原子消费 state。

## 6. 安全

- **绝不**在 commit 里加 `.env*`。
- **绝不**把密钥、token、对象存储凭据写死在代码里。
- 写接口时永远在服务端校验权限——前端隐藏按钮不算权限控制。
- 用户提供的外链必须 `rel="noopener noreferrer" target="_blank"`。
- 任何未净化的内容**绝不**用 `dangerouslySetInnerHTML` 渲染。

## 7. 写作语言

- 仓库内 `.md` 文档默认简体中文。
- 代码注释、`logger.*`、`throw new Error(...)`、JSDoc、TODO 保持英文。
- Commit message / PR 标题 / 分支名不强制语言，沿用作者习惯。
- 用户可见 UI 文案与对外 API 错误响应必须走 `messages/<locale>.json` + `next-intl`，详见 [`docs/i18n.md`](./docs/i18n.md)。

## 8. 许可与 inbound 授权

本项目以 [AGPL-3.0](./LICENSE) 发布。**提交 PR 即视为你同意将所贡献的内容以 AGPL-3.0 授权给本项目**，并确认你对该内容拥有著作权或已获得对应授权。如果 PR 引入了第三方代码 / 资源 / 文档，必须在 PR 描述里写明来源与原始许可证，且该许可证必须与 AGPL-3.0 兼容。

## 9. 行为准则

讨论代码不讨论人。Review 对事不对人，作者收 review 也是。看到不当言行直接联系 owner。

谢谢你的贡献。
