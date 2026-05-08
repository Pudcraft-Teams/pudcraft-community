# 依赖固定（Dependency pins）

最近一次核对：2026-04-19，对照 `package.json`、`npm view` 与各包维护者给出的上游迁移文档。

本分支让在线运行的 Next / React 栈保持当前版本，并且**只**记录那些目前仍存在迁移成本的 pin。如果某个包只是落后于 latest 但没有任何已确认的 blocker，**不要**把它当作政策上的 pin 写进来。

## 有意低于 latest 的固定版本

- `@prisma/client` / `prisma` 留在 `6.19.2`，latest 是 `7.7.0`。
  - 上游证据：Prisma 7 是 ESM-only，并且把更多 CLI / 数据库配置搬到了 `prisma.config.ts`。
  - 本地证据：本仓库仍在 `prisma/schema.prisma` 里使用 `generator client { provider = "prisma-client-js" }`，`package.json` 里跑的是普通 `prisma ...` 脚本，且包没有标记 `"type": "module"`。
  - 为什么 pin：这是一次 ORM / Runtime 的协调迁移，不是顺手能升的小版本。

- `tailwindcss` 留在 `3.4.19`，latest 是 `4.2.2`。
  - 上游证据：Tailwind 4 用 `@tailwindcss/postcss` 与 `@import "tailwindcss"` 替换掉旧的 PostCSS 接线和 `@tailwind` 指令。
  - 本地证据：仓库仍在用 `tailwind.config.ts`、`postcss.config.mjs` 中的 `tailwindcss` 插件，以及 `src/styles/globals.css` 里的 `@tailwind base;` / `@tailwind components;` / `@tailwind utilities;`。
  - 为什么 pin：当前 Warm Clay 主题仍然跑在 v3 配置管道上。

- `typescript` 留在 `5.9.3`，latest 是 `6.0.3`。
  - 上游证据：TypeScript 6 改了若干编译器默认行为，例如 `rootDir` 推断。
  - 本地证据：`tsconfig.json` 跨 `src` / `prisma` / `scripts` / `.next/types`，目前依赖根目录的隐式推断。
  - 为什么 pin：升级前必须有一遍全仓库 `pnpm tsc --noEmit` + 脚本 / 工具链的回归。

- `zod` 留在 `3.25.76`，latest 是 `4.3.6`。
  - 上游证据：从 `zod@4` 起，根包路径（`"zod"`）就是 Zod 4；想用 Zod 3 语义的代码需要切到 `zod/v3`。
  - 本地证据：代码库大量从 `"zod"` 引入，并且仍包含 Zod 3 时代的访问模式，比如 `src/app/api/reports/route.ts` 里的 `parsed.error.errors[0]`。
  - 为什么 pin：升级需要一次显式的全仓库兼容性检查，不能当作一次静默的大版本升级。

- `cropperjs` 留在 `1.6.2`，latest 是 `2.1.1`。
  - 上游证据：Cropper 2 用新的 custom-element 原语替换掉了 v1 大量的 option / event API。
  - 本地证据：当前裁剪流程使用 `react-cropper`、`cropperjs/dist/cropper.css`，并且 `src/components/ImageCropDialog.tsx` 与 `src/app/layout.tsx` 中仍在用 v1 风格的 `Cropper` 实例类型。
  - 为什么 pin：迁到 v2 是一次 UI 集成层重写，不属于例行依赖升级。

- `eslint` 留在 `9.39.2`，latest 是 `10.2.1`。
  - 上游证据：当前 Next 16 lint 栈拉到的插件，peer 范围还停在 ESLint 9。
  - 本地证据：尝试升级到 `eslint@10.2.1` 后，`pnpm lint` 在加载 `eslint-plugin-react`（经由 `eslint-config-next`）时直接报 `TypeError: contextOrFilename.getFilename is not a function`。
  - 为什么 pin：本仓库目前还跑不起 ESLint 10，即便其他校验通过。

## 已废弃但保留的包

- `minecraft-server-util`
  - `src/lib/mc-ping.ts` 仍用它做 ping / 验证。替换它需要单独的传输层 / Runtime 任务，不要顺手做。

- `@types/cropperjs`
  - 已废弃 —— `cropperjs` 自带类型。
  - 仅在 cropper 集成升级并完成回归之前继续保留。

## 政策

本分支的常规依赖维护：

1. 把 `next`、`react`、`react-dom`、`eslint-config-next` 以及兼容的直接依赖保持在最新。
2. 上面列出的包按各自的迁移工作真正排期之前不动。
3. 一旦解除某个 pin，必须**在同一次改动**里更新本文件并删掉对应的迁移说明。
