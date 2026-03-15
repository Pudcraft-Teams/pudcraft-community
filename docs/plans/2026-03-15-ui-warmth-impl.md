# UI 暖化重设计 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Pudcraft Community 的全站 UI 从冷色 teal/slate 风格转变为温暖的珊瑚赤陶主题，建立品牌视觉辨识度。

**Architecture:** 分层推进 —— 先更新设计系统基础（CSS 变量 + 字体 + Tailwind 配置），这会自动覆盖所有使用 `.m3-*` 类的元素；然后逐个更新使用硬编码 Tailwind 颜色类的组件和页面；最后添加动效。

**Tech Stack:** Next.js 15, Tailwind CSS 3, Google Fonts (Nunito), CSS @keyframes

**Color Mapping Reference:**

全局替换参考（非机械替换，需根据语义判断）：

| 旧色 | 新色 | 语义 |
|---|---|---|
| `slate-900` / `slate-800` | `[#4A3728]` 或 `[#8B4533]`（标题） | 深色文字 |
| `slate-700` | `[#4A3728]` | 正文 |
| `slate-600` | `[#6B5344]` | 次正文 |
| `slate-500` / `slate-400` | `[#9C8577]` | 辅助文字 |
| `slate-300` / `slate-200` | `[#E8DDD4]` | 边框 |
| `slate-100` / `slate-50` | `[#FBEEE6]` | 浅背景 |
| `teal-700` / `teal-600` | `[#D4715E]` | 主色 |
| `teal-500` | `[#C4604D]` | 主色悬停 |
| `teal-50` | `[#FBEEE6]` | 主色浅底 |
| `emerald-600` / `emerald-500` | `[#5B9A6E]` | 在线/成功 |
| `emerald-50` | `[#EEF6EF]` | 成功背景 |
| `amber-500` / `amber-600` | `[#D4956A]` | 警告/中延迟 |
| `rose-600` / `rose-500` | `[#C4604D]` | 错误/高延迟 |
| `bg-white` | `bg-[#FFFAF6]` | 卡片/表面 |
| `bg-gray-50` / `bg-slate-50` | `bg-[#FBEEE6]` | 浅色背景 |

---

### Task 1: 设计系统基础 — CSS 变量 + 字体 + Tailwind 配置

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `tailwind.config.ts`

**Step 1: 更新 CSS 变量和组件类**

修改 `src/styles/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --m3-bg: #FDF6F0;
    --m3-surface: #FFFAF6;
    --m3-surface-variant: #FBEEE6;
    --m3-outline: #E8DDD4;
    --m3-outline-strong: #D6C8BC;
    --m3-text: #4A3728;
    --m3-text-muted: #9C8577;
    --m3-primary: #D4715E;
    --m3-primary-hover: #C4604D;
    --m3-primary-active: #B8533F;
    --m3-on-primary: #ffffff;
    --m3-link: #D4715E;
    --m3-accent-soft: #FBEEE6;
    --m3-accent-dark: #8B4533;
  }

  body {
    background-color: var(--m3-bg);
    color: var(--m3-text);
    font-family:
      var(--font-nunito),
      "PingFang SC",
      "Hiragino Sans GB",
      "Microsoft YaHei",
      sans-serif;
  }

  .prose img {
    max-width: 100%;
    height: auto;
  }

  ::-webkit-scrollbar {
    @apply w-2;
  }

  ::-webkit-scrollbar-track {
    background: #FBEEE6;
  }

  ::-webkit-scrollbar-thumb {
    @apply rounded-full;
    background: #D6C8BC;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #C4B5A8;
  }
}

@layer components {
  .m3-surface {
    @apply rounded-2xl border;
    background-color: var(--m3-surface);
    border-color: var(--m3-outline);
    box-shadow: 0 2px 8px rgba(139, 69, 51, 0.06);
  }

  .m3-surface-soft {
    @apply rounded-2xl border;
    background-color: var(--m3-surface-variant);
    border-color: var(--m3-outline);
  }

  .m3-text-muted {
    color: var(--m3-text-muted);
  }

  .m3-link {
    color: var(--m3-link);
    transition: color 0.2s ease;
  }

  .m3-link:hover {
    color: var(--m3-primary-hover);
  }

  .m3-input {
    @apply rounded-xl border px-3 py-2.5 text-sm outline-none transition-all;
    background-color: var(--m3-surface);
    border-color: var(--m3-outline);
    color: var(--m3-text);
  }

  .m3-input::placeholder {
    color: var(--m3-text-muted);
  }

  .m3-input:focus {
    border-color: var(--m3-primary);
    box-shadow: 0 0 0 3px rgba(212, 113, 94, 0.18);
  }

  .m3-btn {
    @apply rounded-xl px-4 py-2 text-sm font-medium transition-all;
  }

  .m3-btn-primary {
    background-color: var(--m3-primary);
    color: var(--m3-on-primary);
    border: 1px solid var(--m3-primary);
  }

  .m3-btn-primary:hover {
    background-color: var(--m3-primary-hover);
    border-color: var(--m3-primary-hover);
  }

  .m3-btn-primary:active {
    background-color: var(--m3-primary-active);
    border-color: var(--m3-primary-active);
    transform: scale(0.97);
  }

  .m3-btn-tonal {
    background-color: var(--m3-surface);
    border: 1px solid var(--m3-outline);
    color: var(--m3-text);
  }

  .m3-btn-tonal:hover {
    border-color: var(--m3-outline-strong);
    background-color: var(--m3-surface-variant);
  }

  .m3-btn-danger {
    @apply text-white;
    background-color: #C4604D;
    border: 1px solid #C4604D;
  }

  .m3-btn-danger:hover {
    background-color: #B8533F;
    border-color: #B8533F;
  }

  .m3-btn-danger:active {
    transform: scale(0.97);
  }

  .m3-chip {
    @apply rounded-full border px-3 py-1 text-xs font-medium transition-colors;
    border-color: var(--m3-outline);
    background-color: var(--m3-surface-variant);
    color: var(--m3-accent-dark);
  }

  .m3-chip:hover {
    border-color: var(--m3-outline-strong);
    background-color: var(--m3-outline);
  }

  .m3-chip-active {
    border-color: #D4715E;
    background-color: #D4715E;
    color: #ffffff;
  }

  .m3-alert-error {
    @apply rounded-xl border px-3 py-2 text-sm;
    border-color: rgba(196, 96, 77, 0.3);
    background-color: #FDF0ED;
    color: #8B4533;
  }

  .m3-alert-success {
    @apply rounded-xl border px-3 py-2 text-sm;
    border-color: rgba(91, 154, 110, 0.3);
    background-color: #EEF6EF;
    color: #2D5A3A;
  }

  .hljs {
    color: #4A3728;
    background: #FFFAF6;
  }

  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-literal,
  .hljs-title,
  .hljs-section {
    color: #C4604D;
  }

  .hljs-string,
  .hljs-attr,
  .hljs-template-variable {
    color: #5B9A6E;
  }

  .hljs-number,
  .hljs-meta,
  .hljs-symbol,
  .hljs-built_in {
    color: #D4956A;
  }

  .hljs-comment,
  .hljs-quote {
    color: #9C8577;
    font-style: italic;
  }
}

@layer utilities {
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .animate-toast-in {
    animation: toast-in 220ms ease-out;
  }

  .animate-card-in {
    animation: card-in 400ms ease-out both;
  }
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-toast-in,
  .animate-card-in {
    animation: none !important;
  }
}
```

**Step 2: 更新字体和根布局**

修改 `src/app/layout.tsx`：
- 将 `Inter` 替换为 `Nunito`
- 更新 header/footer 颜色类
- header: `bg-white/90` → `bg-[#FFFAF6]/90`, `border-slate-200/90` → `border-[#E8DDD4]`
- 品牌名 link: 加 `text-[#8B4533]`
- nav 文字: `text-slate-500` → `text-[#9C8577]`
- footer: `border-slate-200` → `border-[#E8DDD4]`, `text-slate-500` → `text-[#9C8577]`

**Step 3: 更新 Tailwind 配置**

在 `tailwind.config.ts` 的 `theme.extend` 中添加自定义颜色，方便组件引用：

```ts
theme: {
  extend: {
    colors: {
      warm: {
        50: '#FDF6F0',
        100: '#FBEEE6',
        200: '#E8DDD4',
        300: '#D6C8BC',
        400: '#C4B5A8',
        500: '#9C8577',
        600: '#6B5344',
        700: '#4A3728',
        800: '#8B4533',
        900: '#3A2518',
      },
      coral: {
        DEFAULT: '#D4715E',
        light: '#FBEEE6',
        hover: '#C4604D',
        dark: '#B8533F',
        amber: '#D4956A',
      },
      forest: {
        DEFAULT: '#5B9A6E',
        light: '#EEF6EF',
        dark: '#2D5A3A',
      },
    },
  },
},
```

**Step 4: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 5: 提交**

```bash
git add src/styles/globals.css src/app/layout.tsx tailwind.config.ts
git commit -m "feat: 更新设计系统基础 — 暖色 CSS 变量 + Nunito 字体 + Tailwind 颜色配置"
```

---

### Task 2: 核心 UI 组件暖化

**Files:**
- Modify: `src/components/ServerCard.tsx`
- Modify: `src/components/FavoriteButton.tsx`
- Modify: `src/components/UserAvatar.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/components/EmptyState.tsx`
- Modify: `src/components/LoadingSpinner.tsx`
- Modify: `src/components/Pagination.tsx`
- Modify: `src/components/SearchBar.tsx`
- Modify: `src/components/SortButtons.tsx`

**Step 1: 更新 ServerCard**

关键变更：
- 外层 Link: `hover:border-slate-300` → `hover:border-[#D6C8BC]`，添加 `hover:shadow-[0_4px_16px_rgba(139,69,51,0.1)]`
- 添加卡片入场动效: `animate-card-in` class，用 `style={{ animationDelay }}` 传入延迟
- 图标容器: `border-slate-200 bg-slate-100` → `border-warm-200 bg-warm-100`
- 标题 h3: `text-slate-900 group-hover:text-slate-700` → `text-[#8B4533] group-hover:text-[#4A3728]`
- 已认领徽章: `bg-teal-50 text-teal-700 ring-teal-100` → `bg-coral-light text-coral ring-coral/20`
- 在线状态: `bg-emerald-500` → `bg-forest`, `text-emerald-600` → `text-forest`
- 离线: `bg-slate-400` → `bg-warm-400`, `text-slate-500` → `text-warm-500`
- 地址: `text-slate-500` → `text-warm-500`, `text-slate-400` → `text-warm-400`
- 描述: `text-slate-600` → `text-warm-600`
- 人数: `text-slate-600` → `text-warm-600`, `text-slate-800` → `text-warm-700`
- 延迟: `text-emerald-600` → `text-forest`, `text-amber-600` → `text-coral-amber`, `text-rose-600` → `text-coral-hover`
- 标签: `border-slate-200 bg-slate-50 text-slate-600` → `border-warm-200 bg-warm-100 text-warm-800`
- 为 HomePageClient 中的 ServerCard 渲染添加 `style={{ animationDelay: \`${index * 50}ms\` }}` 用于交错入场

**Step 2: 更新 FavoriteButton**

- `border-slate-200 bg-white hover:bg-slate-50` → `border-warm-200 bg-[#FFFAF6] hover:bg-warm-100`
- `text-amber-500` → `text-coral`（收藏激活色用珊瑚色更统一）
- `text-slate-400` → `text-warm-400`
- 添加点击动效: `active:scale-125` 过渡

**Step 3: 更新 UserAvatar**

- 默认 `fallbackClassName`: `bg-teal-600 text-white` → 使用珊瑚→琥珀渐变
- 渐变 fallback: `background: linear-gradient(135deg, #D4715E, #D4956A)` + `text-white`

**Step 4: 更新 Toast**

- success: `border-emerald-200 bg-emerald-50 text-emerald-700` → `border-forest/30 bg-forest-light text-forest-dark`
- error: `border-rose-200 bg-rose-50 text-rose-700` → `border-coral/30 bg-[#FDF0ED] text-[#8B4533]`
- Toast 入场改为从右侧滑入（已在 CSS keyframes 中更新）

**Step 5: 更新 EmptyState**

- 图标: `text-slate-500` → `text-warm-500`
- 标题: `text-slate-900` → `text-[#8B4533]`
- 描述: `text-slate-600` → `text-warm-600`

**Step 6: 更新 LoadingSpinner、Pagination、SearchBar、SortButtons**

对每个文件做相同的 slate→warm 颜色替换。

**Step 7: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 8: 提交**

```bash
git add src/components/ServerCard.tsx src/components/FavoriteButton.tsx src/components/UserAvatar.tsx src/components/Toast.tsx src/components/EmptyState.tsx src/components/LoadingSpinner.tsx src/components/Pagination.tsx src/components/SearchBar.tsx src/components/SortButtons.tsx
git commit -m "feat: 核心 UI 组件暖化 — ServerCard/FavoriteButton/Toast 等"
```

---

### Task 3: 首页暖化 + 卡片入场动效

**Files:**
- Modify: `src/components/HomePageClient.tsx`
- Modify: `src/app/page.tsx`

**Step 1: 更新 HomePageClient**

- Hero 区域: 添加渐变背景容器 `bg-gradient-to-b from-[#FBEEE6] to-transparent` 包裹标题和搜索
- 标题: `text-slate-900` → `text-[#8B4533]`
- 副标题: `text-slate-600` → `text-warm-600`
- 卡片 grid: `gap-4` → `gap-5`
- 为每个 ServerCard 传入 `style={{ animationDelay: \`${index * 50}ms\` }}` 做交错入场
- ServerCard 需要接受 `style` prop 并传递给外层元素，同时添加 `animate-card-in` class

**Step 2: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 3: 提交**

```bash
git add src/components/HomePageClient.tsx src/app/page.tsx
git commit -m "feat: 首页暖化 — Hero 渐变 + 卡片交错入场动效"
```

---

### Task 4: 表单组件暖化

**Files:**
- Modify: `src/components/ServerForm.tsx`
- Modify: `src/components/MarkdownEditor.tsx`
- Modify: `src/components/markdown-editor/RichTextEditor.tsx`
- Modify: `src/components/ImageUpload.tsx`
- Modify: `src/components/ImageCropDialog.tsx`
- Modify: `src/components/ApplicationForm.tsx`

**Step 1: 批量替换每个文件中的硬编码颜色**

对每个文件执行 slate/teal/emerald 颜色替换，遵循 Color Mapping Reference 表。重点：
- 表单标签: slate-700 → warm-700
- 输入框边框/背景: 已通过 `.m3-input` 自动更新
- 错误文字: rose/red → `text-[#C4604D]`
- 成功文字: teal/emerald → `text-forest`
- 按钮: 已通过 `.m3-btn-*` 自动更新
- 其他硬编码的 `bg-white` → `bg-[#FFFAF6]`

**Step 2: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 3: 提交**

```bash
git add src/components/ServerForm.tsx src/components/MarkdownEditor.tsx src/components/markdown-editor/RichTextEditor.tsx src/components/ImageUpload.tsx src/components/ImageCropDialog.tsx src/components/ApplicationForm.tsx
git commit -m "feat: 表单组件暖化 — ServerForm/MarkdownEditor/ImageUpload 等"
```

---

### Task 5: 内容组件暖化

**Files:**
- Modify: `src/components/CommentItem.tsx`
- Modify: `src/components/CommentSection.tsx`
- Modify: `src/components/CopyIdBadge.tsx`
- Modify: `src/components/CopyServerIpButton.tsx`
- Modify: `src/components/NotificationBell.tsx`
- Modify: `src/components/DeleteServerDialog.tsx`
- Modify: `src/components/DeleteModpackButton.tsx`
- Modify: `src/components/MarkdownRenderer.tsx`

**Step 1: 批量更新颜色**

每个文件按 Color Mapping Reference 替换。特别注意：
- `CopyIdBadge.tsx`: teal 背景/ring → coral 系
- `NotificationBell.tsx`: 红色未读小红点保留为醒目色，但调整为 `bg-coral`
- `MarkdownRenderer.tsx`: 品牌色 `#e2f4f7` → `#FBEEE6`, `#12373e` → `#8B4533`
- `DeleteServerDialog.tsx` / `DeleteModpackButton.tsx`: rose → coral-hover 系

**Step 2: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 3: 提交**

```bash
git add src/components/CommentItem.tsx src/components/CommentSection.tsx src/components/CopyIdBadge.tsx src/components/CopyServerIpButton.tsx src/components/NotificationBell.tsx src/components/DeleteServerDialog.tsx src/components/DeleteModpackButton.tsx src/components/MarkdownRenderer.tsx
git commit -m "feat: 内容组件暖化 — 评论/通知/复制/删除对话框等"
```

---

### Task 6: 控制台组件暖化

**Files:**
- Modify: `src/components/console/Sidebar.tsx`
- Modify: `src/components/console/StatCard.tsx`
- Modify: `src/components/console/ServerSettings.tsx`
- Modify: `src/components/console/ApplicationList.tsx`
- Modify: `src/components/console/InviteManager.tsx`
- Modify: `src/components/console/MemberList.tsx`
- Modify: `src/components/console/ApiKeyManager.tsx`
- Modify: `src/components/console/SyncStatus.tsx`
- Modify: `src/components/console/PlayerChart.tsx`
- Modify: `src/components/console/PeakHours.tsx`
- Modify: `src/components/console/RecentComments.tsx`
- Modify: `src/components/console/ServerActions.tsx`

**Step 1: 批量更新颜色**

- Sidebar: teal 选中态 → coral 选中态
- StatCard: slate 文字 → warm 文字，趋势色保留语义（绿涨红跌）但用 forest/coral
- MemberList: 角色颜色保持区分度但暖化
- 图表组件（PlayerChart/PeakHours）: teal 色系 → coral 色系

**Step 2: 运行验证**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 3: 提交**

```bash
git add src/components/console/
git commit -m "feat: 控制台组件暖化 — Sidebar/StatCard/Charts 等"
```

---

### Task 7: 认证页面暖化

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/register/page.tsx`
- Modify: `src/app/forgot-password/page.tsx`

**Step 1: 更新颜色**

- 页面标题/描述: slate → warm/accent-dark
- 表单卡片: `bg-white` → `bg-[#FFFAF6]`
- 链接: teal → coral (已通过 .m3-link 自动)
- 其他硬编码颜色替换

**Step 2: 运行验证 + 提交**

```bash
pnpm tsc --noEmit && pnpm lint
git add src/app/login/ src/app/register/ src/app/forgot-password/
git commit -m "feat: 认证页面暖化 — 登录/注册/忘记密码"
```

---

### Task 8: 服务器相关页面暖化

**Files:**
- Modify: `src/app/servers/[id]/page.tsx`
- Modify: `src/app/servers/[id]/edit/page.tsx`
- Modify: `src/app/servers/[id]/apply/page.tsx`
- Modify: `src/app/servers/[id]/join/[code]/page.tsx`
- Modify: `src/app/servers/[id]/verify/page.tsx`
- Modify: `src/app/servers/[id]/modpacks/page.tsx`
- Modify: `src/app/servers/[id]/not-found.tsx`

**Step 1: 批量更新颜色**

服务器详情页是信息最密集的页面，重点：
- 服务器名称/PSID: 使用 accent-dark
- 状态徽章: 用新状态色
- 标签: 同 ServerCard
- 操作按钮: 已通过 .m3-btn 自动
- 地址/端口区域: mono 字体保留，颜色暖化
- 其他 slate → warm 替换

**Step 2: 运行验证 + 提交**

```bash
pnpm tsc --noEmit && pnpm lint
git add src/app/servers/
git commit -m "feat: 服务器页面暖化 — 详情/编辑/申请/验证等"
```

---

### Task 9: 控制台 + 管理后台页面暖化

**Files:**
- Modify: `src/app/console/layout.tsx`
- Modify: `src/app/console/[serverId]/page.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/servers/page.tsx`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/app/admin/moderation/page.tsx`
- Modify: `src/app/admin/changelog/page.tsx`

**Step 1: 更新控制台布局和页面颜色**

- 控制台 layout: sidebar 背景/边框暖化
- 管理后台 layout: 导航链接 teal → coral
- 管理后台 dashboard: 统计卡片颜色暖化（保持各指标区分度）

**Step 2: 运行验证 + 提交**

```bash
pnpm tsc --noEmit && pnpm lint
git add src/app/console/ src/app/admin/
git commit -m "feat: 控制台和管理后台页面暖化"
```

---

### Task 10: 其余页面暖化

**Files:**
- Modify: `src/app/submit/page.tsx`
- Modify: `src/app/favorites/page.tsx`
- Modify: `src/app/notifications/page.tsx`
- Modify: `src/app/my-servers/page.tsx`
- Modify: `src/app/user/[id]/page.tsx`
- Modify: `src/app/settings/profile/page.tsx`
- Modify: `src/app/changelog/page.tsx`
- Modify: `src/app/changelog/ChangelogList.tsx`
- Modify: `src/app/error.tsx`
- Modify: `src/app/not-found.tsx`

**Step 1: 批量更新颜色**

这些页面大多是列表页或简单表单页，主要做 slate→warm、teal→coral 替换。

**Step 2: 运行验证 + 提交**

```bash
pnpm tsc --noEmit && pnpm lint
git add src/app/submit/ src/app/favorites/ src/app/notifications/ src/app/my-servers/ src/app/user/ src/app/settings/ src/app/changelog/ src/app/error.tsx src/app/not-found.tsx
git commit -m "feat: 其余页面暖化 — 提交/收藏/通知/用户等"
```

---

### Task 11: 最终验证和构建检查

**Step 1: 全量类型检查和 lint**

```bash
pnpm tsc --noEmit
pnpm lint
```

**Step 2: 尝试构建**

```bash
pnpm build
```

修复任何构建错误。

**Step 3: 视觉验证**

启动开发服务器 `pnpm dev`，手动检查：
- 首页卡片列表
- 服务器详情页
- 登录/注册页
- 控制台
- 移动端响应式

**Step 4: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: 修复暖化遗漏和构建问题"
```
