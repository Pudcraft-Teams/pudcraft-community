# 话题系统设计

## 概述

轻量标签系统，用户在帖子中使用 `#话题` 标记内容分类，点击话题通过搜索页筛选相关帖子。管理员可合并、重命名、设置别名、删除话题。

## 设计决策

| 决策 | 选择 |
|------|------|
| 定位 | 轻量标签，用于帖子分类和筛选 |
| 归一化 | 大小写不敏感，存储小写，显示保留帖子原文 |
| 数量限制 | 每帖最多 5 个话题 |
| 筛选体验 | 集成在搜索功能内，类似 Twitter |
| 管理能力 | 完整管理：合并、重命名、别名、删除 |
| 存储方案 | Tag 表 + PostTag 关联表 |

## 数据模型

### Tag 表

```prisma
model Tag {
  id          String   @id @default(cuid())
  name        String   @unique              // 归一化小写："minecraft"
  displayName String   @map("display_name") // 首次创建时的原始形式："Minecraft"
  aliases     String[] @default([])          // 别名列表（小写），搜索时一起匹配
  postCount   Int      @default(0) @map("post_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  posts PostTag[]

  @@index([postCount(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("tags")
}
```

### PostTag 关联表

```prisma
model PostTag {
  id     String @id @default(cuid())
  postId String @map("post_id")
  tagId  String @map("tag_id")

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([postId, tagId], name: "unique_post_tag")
  @@index([tagId])
  @@map("post_tags")
}
```

### Post 模型变更

Post 模型新增关联：`tags PostTag[]`

## 发帖时话题提取与存储

1. 前端提交时从 content 正则提取 `#话题`，去重取前 5 个，作为 `tags` 字段传给 API
2. 后端校验 tags 数量 ≤ 5
3. 对每个 tag 归一化为小写，upsert 到 Tag 表（不存在则创建，`displayName` 取首次创建时的原文）
4. 创建 PostTag 关联 + 递增 `postCount`，全在一个事务里
5. 删帖时：事务内删除 PostTag + 递减对应 Tag 的 `postCount`

## 搜索集成

### 路由

`/search?q=xxx`

### 搜索逻辑

- `#Minecraft` → 识别 `#` 前缀，按话题筛选帖子（匹配 Tag.name 或 Tag.aliases）
- `@用户名` → 识别 `@` 前缀，搜索用户
- 普通文本 → 搜索帖子标题和内容（PostgreSQL `ILIKE`）

### API

`GET /api/search?q=xxx&cursor=xxx&limit=20`

```typescript
{
  type: "tag" | "mention" | "text",
  tag?: { name, displayName, postCount },  // type=tag 时附带话题信息
  posts: PostItem[],
  nextCursor: string | null
}
```

### 页面 UI

- 顶部搜索框（带当前搜索词）
- `type=tag` 时显示话题卡片：`#Minecraft · 128 篇帖子`
- 下方帖子列表，复用 PostCard，游标分页

### 链接改造

PostContentRenderer 中 `#话题` 链接从 `/?tag=xxx` 改为 `/search?q=%23xxx`

## 管理员话题管理

集成在 `/admin/tags` 页面。

| 操作 | 说明 |
|------|------|
| 列表 | 按 postCount 降序分页，显示 name、displayName、aliases、postCount、创建时间 |
| 重命名 | 修改 name 和 displayName，旧 name 自动加入 aliases |
| 设置别名 | 编辑 aliases 数组，搜索时一并匹配 |
| 合并 | 源 Tag 的 PostTag 指向目标，源 name 加入目标 aliases，删源 Tag，重算目标 postCount |
| 删除 | 删除 Tag + PostTag（帖子内容中的文字不动，只移除索引） |

### 管理 API

- `GET /api/admin/tags?page=1&limit=20&search=xxx` — 列表
- `PUT /api/admin/tags/:id` — 重命名 / 编辑别名
- `POST /api/admin/tags/merge` — 合并 `{ sourceId, targetId }`
- `DELETE /api/admin/tags/:id` — 删除

全部需要 admin 权限校验。

## 改造点

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 Tag、PostTag 模型，Post 加 `tags PostTag[]` |
| `src/lib/validation.ts` | createPostSchema 加 tags 字段 |
| `POST /api/posts` | 提取 tags → upsert Tag → 创建 PostTag，事务内 |
| `DELETE /api/posts/[id]` | 事务内删 PostTag + 递减 postCount |
| `GET /api/tags/search` | 改为查 Tag 表 + aliases |
| `PostTextarea.tsx` | 自动补全查 Tag 表（API 不变，后端换数据源） |
| `PostContentRenderer.tsx` | 话题链接改为 `/search?q=%23xxx` |
| `CreatePostForm.tsx` | 提交时从 content 提取 tags 传给 API |

### 新增文件

- `/search` 页面 + `GET /api/search`
- `/admin/tags` 页面 + 管理 API 4 个

### 不动的

- 帖子内容存储格式（纯文本，`#话题` 仍是文本的一部分）
- PostCard 展示
- `@提及` 相关逻辑
