# 全站 UI 暖化重设计

> 日期：2026-03-15
> 状态：已批准

## 目标

将 Pudcraft Community 从通用冷色 SaaS 风格转变为温暖、有归属感的 Minecraft 社区平台。建立独特的品牌视觉辨识度。

## 设计决策

- **风格方向**：温暖社区感，珊瑚赤陶主色调
- **骨架**：方案 A「暖陶」— 克制、圆润、柔和
- **色彩密度**：局部使用方案 C「晚霞」的珊瑚→琥珀渐变
- **范围**：全站所有页面

## 色彩体系

### 基础色盘

| 用途 | CSS 变量 | 色值 | 说明 |
|---|---|---|---|
| 页面背景 | `--m3-bg` | `#FDF6F0` | 暖奶油色 |
| 卡片/表面 | `--m3-surface` | `#FFFAF6` | 微暖白 |
| 表面变体 | `--m3-surface-variant` | `#FBEEE6` | 浅珊瑚，高亮背景 |
| 主色 | `--m3-primary` | `#D4715E` | 珊瑚赤陶 |
| 主色悬停 | `--m3-primary-hover` | `#C4604D` | 略深 |
| 主色按下 | `--m3-primary-active` | `#B8533F` | 更深 |
| 主色上文字 | `--m3-on-primary` | `#ffffff` | 白 |
| 深色强调 | `--m3-accent-dark` | `#8B4533` | 标题、重要文字 |
| 正文色 | `--m3-text` | `#4A3728` | 暖深棕 |
| 次要文字 | `--m3-text-muted` | `#9C8577` | 暖灰棕 |
| 链接 | `--m3-link` | `#D4715E` | 同主色 |
| 边框 | `--m3-outline` | `#E8DDD4` | 暖米色 |
| 强边框 | `--m3-outline-strong` | `#D6C8BC` | 深一级 |
| 品牌底色 | `--m3-accent-soft` | `#FBEEE6` | 浅珊瑚 |

### 渐变（局部使用）

- 卡片顶部横条：`linear-gradient(135deg, #D4715E, #D4956A)`
- Hero 区背景：`linear-gradient(180deg, #FBEEE6, #FDF6F0)`
- 头像回退底色：`linear-gradient(135deg, #D4715E, #D4956A)`

### 状态色

| 状态 | 色值 |
|---|---|
| 在线 | `#5B9A6E`（暖绿） |
| 离线 | `#B8ADA4`（暖灰） |
| 低延迟 | `#5B9A6E` |
| 中延迟 | `#D4956A`（琥珀） |
| 高延迟 | `#C4604D`（深珊瑚） |
| 成功背景 | `#EEF6EF` + 文字 `#2D5A3A` |
| 错误背景 | `#FDF0ED` + 文字 `#8B4533` |

## 字体

- 西文/数字：Nunito（Google Fonts, weight 400/600/700/800）
- 中文回退：`"Nunito", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 取代现有 Inter

### 字号层级

| 层级 | 尺寸 | 字重 | 用途 |
|---|---|---|---|
| 页面标题 | `clamp(1.5rem, 4vw, 2rem)` | 800 | 页面大标题 |
| 区块标题 | `clamp(1.125rem, 3vw, 1.5rem)` | 700 | 段落/卡片区域标题 |
| 卡片标题 | `1rem` | 700 | 服务器名称等 |
| 正文 | `0.9375rem` | 400 | 主体文字 |
| 辅助文字 | `0.8125rem` | 400 | 次要信息 |
| 标签 | `0.75rem` | 600 | 标签、状态文字 |

- 标题颜色：`#8B4533`（深赤陶）
- 正文行高：1.6，标题行高：1.3

## 组件形态

### 卡片

- 圆角：`rounded-2xl`（1rem）
- 边框：`#E8DDD4`
- 阴影：`0 2px 8px rgba(139, 69, 51, 0.06)`
- hover：`translateY(-2px)` + 阴影加深
- 服务器卡片顶部 4px 渐变条 `#D4715E → #D4956A`

### 按钮

- 主按钮：`#D4715E` 底 + 白字 + `rounded-xl`
- 次要按钮：`#FBEEE6` 底 + `#D4715E` 字
- 幽灵按钮：透明底 + `#D4715E` 字，hover 显浅底
- 按下态：`scale(0.97)`

### 标签/芯片

- `rounded-full`
- 默认：`#FBEEE6` 底 + `#8B4533` 字
- 激活：`#D4715E` 底 + 白字

### 输入框

- `#FFFAF6` 底 + `#E8DDD4` 边框
- focus：边框 `#D4715E` + `ring-2 ring-[#D4715E]/20`

### 头像

- 无图片：珊瑚→琥珀渐变底 + 白色首字母

## 布局

### Header

- 背景：`#FFFAF6` + `backdrop-blur`
- 底部 1px `#E8DDD4` 分隔线
- 品牌名：`#8B4533` + font-weight 800
- 导航 hover：底部 2px `#D4715E` 下划线滑入

### 首页

- Hero 区渐变背景 `#FBEEE6 → #FDF6F0`
- 搜索框居中、宽大
- 卡片 grid gap `gap-5`

### Footer

- `#FBEEE6` 底 + `#4A3728` 文字

## 动效

### 页面加载

- 卡片交错浮入：`opacity 0→1` + `translateY(12px→0)`，间隔 50ms
- 纯 CSS `@keyframes` + `animation-delay`

### 交互反馈

- 按钮 hover/active：`transition-all 150ms ease-out`
- 卡片 hover：`translateY(-2px)` + 阴影过渡 200ms
- 收藏按钮点击：`scale(1.2)` 后回弹
- 标签切换：背景色 150ms 过渡

### 状态切换

- Toast 右侧滑入
- 内容区切换 opacity 淡入

### 无障碍

- `prefers-reduced-motion: reduce` 时关闭所有动效
