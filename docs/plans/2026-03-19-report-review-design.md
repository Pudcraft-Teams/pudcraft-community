# 举报与管理员审查系统设计

> 日期: 2026-03-19

## 背景

当前所有服务器提交后 `status="pending"`，必须管理员手动审核才能上线。改为 AI 内容审核通过即直接上线，同时引入举报系统和管理员后审（巡检）机制。

## 核心变更

### 1. 服务器提交流程

- AI 审核通过 → `status="approved"` 直接上线，`reviewStatus="unreviewed"` 进入巡检队列
- AI 审核不通过 → 仍 `status="pending"`，走现有管理员手动审核流程
- 管理员可随时将服务器改为 rejected

**Server 表新增字段**：

```
reviewStatus  String    @default("unreviewed")  // "unreviewed" | "reviewed"
reviewedAt    DateTime?
reviewedBy    String?
```

### 2. 举报系统

**Report 表**：

```
Report {
  id          String    @id @default(cuid())
  targetType  String    // "server" | "comment" | "user"
  targetId    String
  reporterId  String
  reporter    User      @relation
  category    String    // "misinformation" | "pornography" | "harassment" | "fraud" | "other"
  description String?   // max 500
  status      String    @default("pending")  // "pending" | "resolved" | "dismissed"
  actions     String?   // JSON 数组: ["warn", "takedown", "ban_user"]
  adminNote   String?
  resolvedBy  String?
  resolvedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@unique([reporterId, targetType, targetId])
  @@index([targetType, targetId])
  @@index([status])
}
```

**举报分类**：

| key | 中文 |
|-----|------|
| misinformation | 虚假信息 |
| pornography | 色情低俗 |
| harassment | 骚扰攻击 |
| fraud | 广告欺诈 |
| other | 其他 |

**防滥用信誉机制**：

查询用户过去 30 天被驳回（dismissed）的举报数量：

- 0-2 次：每天上限 10 次
- 3-5 次：每天上限 3 次
- 6+ 次：每天上限 1 次

### 3. 管理后台

**`/admin/servers` 页面改造，新增 tab**：

| Tab | 内容 | 排序 |
|-----|------|------|
| 待巡检 | status="approved" + reviewStatus="unreviewed" | 创建时间倒序 |
| 被举报 | 有 pending Report 且 targetType="server" | 举报时间倒序，显示举报数 |
| 已巡检 | reviewStatus="reviewed" | 巡检时间倒序 |

保留现有 pending / rejected tab 处理 AI 拦截的服务器。

**管理员操作**：

- 巡检：标记已巡检 / 下架（填原因）
- 被举报：驳回举报 / 警告发布者 / 下架内容 / 封禁用户（可多选）

**新增 `/admin/reports` 页面**（评论和用户举报）：

| Tab | 内容 |
|-----|------|
| 待处理 | status="pending"，可按 targetType 筛选 |
| 已处理 | status="resolved" 或 "dismissed" |

### 4. 用户端举报入口

**入口位置**：

- 服务器详情页：操作栏中的举报按钮（不能举报自己的服务器）
- 评论区：评论更多菜单中的举报选项（不能举报自己的评论）
- 用户主页：举报按钮（不能举报自己）

**举报弹窗**：选择分类（单选 5 项）+ 补充说明（可选 textarea，max 500）

### 5. API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/reports | 提交举报（鉴权 + 信誉限频） |
| GET | /api/admin/reports | 管理员查看举报列表 |
| PATCH | /api/admin/reports/:id | 管理员处置举报 |
| PATCH | /api/admin/servers/:id | 扩展 action，新增 "review" |

### 6. 通知

| type | 接收者 | 场景 |
|------|--------|------|
| report_resolved | 举报者 | 举报被处理（非驳回） |
| report_dismissed | 举报者 | 举报被驳回 |
| content_warning | 被举报者 | 被警告 |
| content_takedown | 被举报者 | 内容被下架 |
