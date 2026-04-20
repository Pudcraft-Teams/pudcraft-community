# Pudcraft Community 回归纯服务器板块设计

> 日期：2026-04-14
> 状态：已确认，待实现计划
> 范围：移除圈子与广场论坛体系，回归仅保留服务器社区

## 1. 背景与目标

当前项目已经引入了 MoltBook 论坛体系：

- 首页 `/` 为广场 feed
- 存在圈子、帖子、发帖、论坛搜索、论坛收藏、论坛通知等前台能力
- Prisma 中包含完整的论坛模型与缓存字段

本次调整的目标不是简单隐藏入口，而是将产品与代码库整体收敛回 `pr33` 之前的产品形态：只保留服务器板块，同时保留服务器评论与服务器通知。

### 核心目标

1. 移除圈子、广场、帖子、论坛通知、论坛收藏等整套论坛能力
2. 首页恢复为服务器首页语义，不再展示广场帖子流
3. 保留服务器系统的现有核心能力：
   - 服务器列表与详情
   - 服务器搜索
   - 服务器收藏
   - 服务器评论
   - 服务器通知
   - 服主控制台与私有服务器能力
4. Prisma 层删除论坛模型与论坛数据，不做封存

### 非目标

1. 不保留任何可恢复论坛前台入口
2. 不保留论坛数据库表作为临时过渡
3. 不通过直接硬回滚历史提交来完成本次工作

## 2. 设计原则

### 2.1 以 `pr33` 前产品形态为参照，不做硬回滚

`pr33` 前的结构只作为产品边界参考，而不是直接执行 git revert。原因如下：

1. 论坛落地后，共享层代码仍持续演化，直接回滚可能误伤服务器功能
2. 通知、导航、Providers、搜索、收藏等层面已经出现共享逻辑
3. 本次需要的是“定向拆除论坛”，而不是“整库回到旧时点”

### 2.2 保护服务器评论与服务器通知链路

以下能力必须完整保留：

1. `ServerComment`
2. `ServerNotification`
3. `/api/servers/[id]/comments*`
4. `/api/notifications*`
5. 通知页与通知铃铛中的服务器通知能力

这两套能力已经与论坛模型分离，后续迁移应保证不触碰其底层映射表：

1. `ServerComment -> @@map("comments")`
2. `ServerNotification -> @@map("notifications")`

### 2.3 产品彻底移除，数据库同步清理

本次回退不做“代码删除但数据保留”的折中方案。论坛代码、论坛路由、论坛 API、论坛组件、论坛类型、论坛模型及其数据都应一并移除。

## 3. 最终产品边界

回退完成后，用户能看到且可使用的能力仅包含：

1. 首页服务器入口
2. 服务器列表与详情
3. 服务器搜索
4. 服务器收藏
5. 服务器评论
6. 服务器通知
7. 服主控制台
8. 私有服务器申请、邀请码、白名单同步

以下产品能力整体移除：

1. 广场 feed
2. 圈子系统
3. 帖子详情与发帖
4. 圈子管理与子板块
5. 论坛评论
6. 论坛点赞
7. 论坛收藏
8. 论坛通知
9. 论坛搜索
10. 用户主页中的论坛内容

## 4. 路由与页面调整

### 4.1 首页回退

- [src/app/page.tsx](/Users/hepudding/pudcraft-community/src/app/page.tsx) 不再渲染论坛 `FeedPage`
- 首页恢复为服务器首页语义
- 页面文案、SEO 描述、结构化数据同步改为服务器社区描述

### 4.2 删除的前台路由

以下页面路由整体删除：

1. `/explore`
2. `/new`
3. `/post/[postId]`
4. `/c/[slug]`
5. `/c/[slug]/new`
6. `/c/[slug]/post/[postId]`
7. `/c/[slug]/settings`
8. `/u/[uid]`
9. `/circles/create`

对应文件包括但不限于：

1. [src/app/explore/page.tsx](/Users/hepudding/pudcraft-community/src/app/explore/page.tsx)
2. [src/app/new/page.tsx](/Users/hepudding/pudcraft-community/src/app/new/page.tsx)
3. [src/app/post/[postId]/page.tsx](/Users/hepudding/pudcraft-community/src/app/post/[postId]/page.tsx)
4. [src/app/c/[slug]/page.tsx](/Users/hepudding/pudcraft-community/src/app/c/[slug]/page.tsx)
5. [src/app/c/[slug]/new/page.tsx](/Users/hepudding/pudcraft-community/src/app/c/[slug]/new/page.tsx)
6. [src/app/c/[slug]/post/[postId]/page.tsx](/Users/hepudding/pudcraft-community/src/app/c/[slug]/post/[postId]/page.tsx)
7. [src/app/c/[slug]/settings/page.tsx](/Users/hepudding/pudcraft-community/src/app/c/[slug]/settings/page.tsx)
8. [src/app/u/[uid]/page.tsx](/Users/hepudding/pudcraft-community/src/app/u/[uid]/page.tsx)
9. [src/app/circles/create/page.tsx](/Users/hepudding/pudcraft-community/src/app/circles/create/page.tsx)

### 4.3 保留并改造的页面

#### `/search`

- [src/app/search/page.tsx](/Users/hepudding/pudcraft-community/src/app/search/page.tsx) 保留
- 从“全局搜索帖子、话题、用户”改造为“纯服务器搜索”
- 只展示服务器搜索结果

#### `/favorites`

- [src/app/favorites/page.tsx](/Users/hepudding/pudcraft-community/src/app/favorites/page.tsx) 保留
- 从论坛帖子收藏展示改造为纯服务器收藏列表
- 不再依赖帖子 `Bookmark` 模型

#### `/notifications`

- [src/app/notifications/page.tsx](/Users/hepudding/pudcraft-community/src/app/notifications/page.tsx) 保留
- 页面仅展示服务器通知
- 去掉任何论坛通知合并逻辑

## 5. API 调整边界

### 5.1 保留的 API

以下能力必须继续存在：

1. `/api/servers/*`
2. `/api/notifications`
3. `/api/notifications/unread-count`
4. `/api/servers/[id]/comments`
5. `/api/servers/[id]/comments/[commentId]`

### 5.2 删除的论坛 API

以下 API 整体删除：

1. `/api/forum/notifications/*`
2. `/api/posts/*`
3. `/api/comments/[id]/*` 中论坛评论点赞与删除链路
4. `/api/circles*`
5. `/api/tags/search`
6. `/api/users/search`（若只服务论坛）
7. `/api/users/[id]/circles`
8. `/api/user/bookmarks`（若只服务帖子收藏）

### 5.3 `/search` 与 `/favorites` 的数据源改造

#### 搜索

- 搜索 API 仅返回服务器结果
- 删除帖子、圈子、话题、论坛用户相关查询

#### 收藏

- 收藏页只依赖服务器收藏关系
- 删除帖子 `Bookmark` 相关 API 与数据结构

## 6. 共享 UI 与客户端状态收口

### 6.1 删除论坛组件目录

整目录删除：

- [src/components/forum](/Users/hepudding/pudcraft-community/src/components/forum)

包括但不限于：

1. `FeedPage`
2. `CirclePage`
3. `ExplorePage`
4. `PostDetailPage`
5. `CreatePostForm`
6. `ComposeDialog`
7. `ForumCommentSection`
8. `CircleSettings`
9. `CircleCard`
10. `PostCard`

### 6.2 调整共享组件

#### Providers

- [src/components/Providers.tsx](/Users/hepudding/pudcraft-community/src/components/Providers.tsx) 去掉 `ComposeProvider`

#### 导航

- [src/components/AuthButtons.tsx](/Users/hepudding/pudcraft-community/src/components/AuthButtons.tsx) 去掉：
  - `探索`
  - 发帖相关入口
  - 指向圈子或广场的导航项
- 导航重新以服务器为主

#### 通知铃铛

- [src/components/NotificationBell.tsx](/Users/hepudding/pudcraft-community/src/components/NotificationBell.tsx) 回退成只读服务器通知
- 删除对以下接口的请求：
  - `/api/forum/notifications`
  - `/api/forum/notifications/unread-count`
  - `/api/forum/notifications/read`
- 删除 forum/server 通知合并逻辑

## 7. 类型、工具与测试清理

### 7.1 `src/lib/types.ts`

保留：

1. `ServerComment`
2. 服务器通知相关类型
3. 服务器搜索、服务器收藏所需类型

删除：

1. `Circle*`
2. `Post*`
3. `ForumComment*`
4. `ForumNotification*`
5. `Tag*`

### 7.2 删除论坛专用工具

删除或停用：

1. [src/lib/forum-ui-state.ts](/Users/hepudding/pudcraft-community/src/lib/forum-ui-state.ts)
2. forum 相关测试文件
3. 帖子、圈子、话题、论坛通知相关工具
4. 论坛专用移动端 inbox 合并逻辑

### 7.3 保留的工具

必须保留：

1. 服务器评论相关工具
2. 服务器通知相关工具
3. 服务器收藏相关工具
4. 服务器搜索相关工具

## 8. Prisma 与数据库迁移

### 8.1 需要删除的论坛模型

从 [prisma/schema.prisma](/Users/hepudding/pudcraft-community/prisma/schema.prisma) 中删除：

1. `Circle`
2. `CircleMembership`
3. `Section`
4. `Post`
5. `Comment`
6. `PostLike`
7. `CommentLike`
8. `Bookmark`
9. `Notification`
10. `CircleBan`
11. `Tag`
12. `PostTag`

### 8.2 需要删除的论坛枚举

删除论坛专用枚举，包括但不限于：

1. `CircleRole`
2. `PostStatus`
3. `CommentStatus`
4. 论坛 `NotificationType`

### 8.3 需要保留的模型

必须保留：

1. `Server`
2. `ServerComment`
3. `ServerNotification`
4. `Favorite`
5. 服务器系统全部其余模型

### 8.4 迁移策略

1. 使用 Prisma migration 正式删除论坛表
2. 不做论坛数据封存
3. 不使用 `db push`
4. 删除关系字段时，同步清理 `User` 等模型中的论坛 relation

### 8.5 迁移保护重点

以下底层表映射不得误删：

1. `comments`
2. `notifications`

需要 drop 的应是论坛独立表，例如：

1. `forum_comments`
2. `forum_notifications`
3. `circles`
4. `posts`
5. `post_likes`
6. `comment_likes`
7. `bookmarks`
8. `tags`
9. `post_tags`

## 9. 执行顺序

### 第一步：收口产品外壳

1. 首页改回服务器语义
2. 导航移除论坛入口
3. 通知铃铛改回只显示服务器通知
4. Providers 去掉发帖弹窗上下文

### 第二步：删除论坛页面与 API

1. 删除论坛页面路由
2. 删除论坛 API
3. 删除论坛组件目录
4. 删除论坛客户端状态与工具

### 第三步：改造保留页

1. `/search` 改为纯服务器搜索
2. `/favorites` 改为纯服务器收藏
3. `/notifications` 改为纯服务器通知

### 第四步：删除 Prisma 论坛模型并生成迁移

1. 从 schema 中移除论坛模型与关联
2. 生成删除论坛表的迁移
3. 确保服务器评论与通知映射不受影响

### 第五步：清理余波

1. 删除遗留 import
2. 清理 SEO 文案
3. 清理结构化数据
4. 清理论坛测试与无用工具

## 10. 风险与缓解

### 风险 1：误伤服务器通知

现状中通知铃铛已合并 forum/server 两条线。若清理不彻底，容易误删服务器通知 UI 或保留失效请求。

缓解：

1. 将通知铃铛视为共享层重点文件优先处理
2. 明确只保留 `/api/notifications*`
3. 删除 forum 通知状态与请求逻辑

### 风险 2：误伤服务器评论

论坛评论模型名为 `Comment`，服务器评论模型为 `ServerComment`，且底层映射不同，迁移时需要防止误删 `comments` 表。

缓解：

1. 迁移前明确核对 `@@map`
2. 仅 drop `forum_comments`
3. 保留所有 `/api/servers/[id]/comments*` 路由

### 风险 3：共享页面出现半论坛半服务器状态

`/search`、`/favorites`、`/notifications` 已经被论坛能力污染，如果简单删文件会留下断裂体验。

缓解：

1. 这三页不删除，改造成纯服务器版本
2. 页面文案和数据源一起回退
3. 同时删除论坛依赖组件与类型

### 风险 4：以硬回滚方式误带出旧代码

若直接回滚到历史提交，可能把后续服务器模块修复一起抹掉。

缓解：

1. 采用定向拆除策略
2. 仅将 `pr33` 前作为参考边界

## 11. 验收标准

完成后应满足：

1. 站点前台不再存在圈子、广场、帖子、发帖入口
2. 首页只表现服务器社区
3. `/search` 只搜服务器
4. `/favorites` 只展示服务器收藏
5. `/notifications` 与通知铃铛只展示服务器通知
6. 服务器详情页评论仍可正常展示与发布
7. Prisma schema 中不再存在论坛模型
8. 数据库迁移将论坛表删除，但保留服务器评论与通知表

## 12. 后续步骤

本设计确认后，下一步进入实现计划编写阶段，输出按文件和迁移顺序拆分的执行计划，再开始代码修改。
