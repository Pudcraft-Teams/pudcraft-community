# 举报与管理员审查系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** AI 审核通过的服务器直接上线，同时引入用户举报系统和管理员后审（巡检）机制。

**Architecture:** 在 Server 表新增 `reviewStatus` 字段跟踪巡检状态；新建 Report 表存储举报；服务器创建时 AI 通过直接 approved；管理后台新增巡检 tab 和举报管理页面；用户端新增举报弹窗组件。

**Tech Stack:** Prisma + PostgreSQL, Next.js App Router API Routes, React 客户端组件, Zod 校验, Tailwind CSS

---

## Task 1: 数据库 Schema 变更

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Server 表新增巡检字段**

在 Server model 中（`rejectReason` 字段之后）新增：

```prisma
reviewStatus String    @default("unreviewed") @map("review_status") // unreviewed | reviewed
reviewedAt   DateTime? @map("reviewed_at")
reviewedBy   String?   @map("reviewed_by")
```

在 Server model 的 `@@index` 区域新增：

```prisma
@@index([reviewStatus])
```

**Step 2: 新建 Report model**

在 schema.prisma 文件末尾（ModerationLog 之后）添加：

```prisma
model Report {
  id          String    @id @default(cuid())
  targetType  String    @map("target_type")    // server | comment | user
  targetId    String    @map("target_id")
  reporterId  String    @map("reporter_id")
  reporter    User      @relation("reportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  category    String                            // misinformation | pornography | harassment | fraud | other
  description String?   @db.VarChar(500)
  status      String    @default("pending")     // pending | resolved | dismissed
  actions     String?   @db.Text                // JSON: ["warn","takedown","ban_user"]
  adminNote   String?   @map("admin_note") @db.VarChar(500)
  resolvedBy  String?   @map("resolved_by")
  resolvedAt  DateTime? @map("resolved_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@unique([reporterId, targetType, targetId])
  @@index([targetType, targetId])
  @@index([status])
  @@index([createdAt])
  @@map("reports")
}
```

在 User model 的 relations 区域添加：

```prisma
reports      Report[]  @relation("reportsMade")
```

**Step 3: 运行迁移**

Run: `pnpm prisma migrate dev --name add_report_and_review_status`

**Step 4: 生成 Prisma Client**

Run: `pnpm db:generate`

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: 添加 Report 表和 Server.reviewStatus 字段"
```

---

## Task 2: 通知类型和 Zod Schema 扩展

**Files:**
- Modify: `src/lib/notification.ts`
- Modify: `src/lib/validation.ts`

**Step 1: 扩展 NotificationType**

在 `src/lib/notification.ts` 的 `NotificationType` 联合类型中追加：

```typescript
  | "report_resolved"
  | "report_dismissed"
  | "content_warning"
  | "content_takedown"
```

**Step 2: 添加举报相关 Zod Schema**

在 `src/lib/validation.ts` 末尾添加：

```typescript
// ─── 举报 ───

export const reportCategoryEnum = z.enum([
  "misinformation",
  "pornography",
  "harassment",
  "fraud",
  "other",
]);

export const createReportSchema = z.object({
  targetType: z.enum(["server", "comment", "user"]),
  targetId: z.string().min(1),
  category: reportCategoryEnum,
  description: z.string().max(500).optional(),
});

export const adminQueryReportsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "resolved", "dismissed"]).default("pending"),
  targetType: z.enum(["all", "server", "comment", "user"]).default("all"),
});

export const adminReportActionSchema = z.object({
  action: z.enum(["dismiss", "resolve"]),
  actions: z.array(z.enum(["warn", "takedown", "ban_user"])).optional(),
  adminNote: z.string().max(500).optional(),
});
```

**Step 3: 扩展 adminServerActionSchema**

将 `adminServerActionSchema` 的 action enum 从 `["approve", "reject"]` 改为 `["approve", "reject", "review"]`。

**Step 4: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 5: Commit**

```bash
git add src/lib/notification.ts src/lib/validation.ts
git commit -m "feat: 添加举报相关 Zod Schema 和通知类型"
```

---

## Task 3: 服务器创建流程 — AI 通过直接上线

**Files:**
- Modify: `src/app/api/servers/route.ts` (Lines 335-354, 服务器创建区块)
- Modify: `src/app/api/servers/route.ts` (Lines 409-427, 响应消息)

**Step 1: 创建时根据 AI 审核结果设置 status**

在 `src/app/api/servers/route.ts` 的 `tx.server.create` data 中，`visibility` 字段之后新增：

```typescript
status: "approved",
reviewStatus: "unreviewed",
```

这样 AI 审核通过（代码能走到创建步骤）的服务器直接上线。AI 审核不通过的在前面已经 return 422 了，不会到达这里。

**Step 2: 修改响应消息**

将创建成功后的响应消息从 `"服务器已提交，等待管理员审核"` 改为 `"服务器已成功发布"`。

**Step 3: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/api/servers/route.ts
git commit -m "feat: AI 审核通过的服务器直接上线"
```

---

## Task 4: 举报 API — 用户提交举报

**Files:**
- Create: `src/app/api/reports/route.ts`

**Step 1: 实现 POST /api/reports**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { createReportSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

const REPORT_CATEGORY_NAMES: Record<string, string> = {
  misinformation: "虚假信息",
  pornography: "色情低俗",
  harassment: "骚扰攻击",
  fraud: "广告欺诈",
  other: "其他",
};

/** 信誉限频：根据近 30 天被驳回的举报数量决定每日上限 */
async function getDailyReportLimit(userId: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dismissedCount = await prisma.report.count({
    where: {
      reporterId: userId,
      status: "dismissed",
      resolvedAt: { gte: thirtyDaysAgo },
    },
  });
  if (dismissedCount >= 6) return 1;
  if (dismissedCount >= 3) return 3;
  return 10;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  const { userId } = authResult;

  const body = await request.json();
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { targetType, targetId, category, description } = parsed.data;

  // 不能举报自己
  if (targetType === "user" && targetId === userId) {
    return NextResponse.json({ error: "不能举报自己" }, { status: 400 });
  }

  // 验证目标存在 + 不能举报自己的内容
  if (targetType === "server") {
    const server = await prisma.server.findUnique({
      where: { id: targetId },
      select: { ownerId: true },
    });
    if (!server) return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
    if (server.ownerId === userId) {
      return NextResponse.json({ error: "不能举报自己的服务器" }, { status: 400 });
    }
  } else if (targetType === "comment") {
    const comment = await prisma.comment.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    });
    if (!comment) return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    if (comment.authorId === userId) {
      return NextResponse.json({ error: "不能举报自己的评论" }, { status: 400 });
    }
  } else if (targetType === "user") {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 信誉限频
  const dailyLimit = await getDailyReportLimit(userId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.report.count({
    where: {
      reporterId: userId,
      createdAt: { gte: todayStart },
    },
  });
  if (todayCount >= dailyLimit) {
    return NextResponse.json(
      { error: `今日举报次数已达上限（${dailyLimit} 次）` },
      { status: 429 },
    );
  }

  // 重复举报检查（由 @@unique 保证，但提前给友好提示）
  const existing = await prisma.report.findUnique({
    where: {
      reporterId_targetType_targetId: {
        reporterId: userId,
        targetType,
        targetId,
      },
    },
  });
  if (existing) {
    return NextResponse.json({ error: "你已经举报过该内容" }, { status: 409 });
  }

  try {
    await prisma.report.create({
      data: {
        targetType,
        targetId,
        reporterId: userId,
        category,
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ message: "举报已提交，感谢反馈" }, { status: 201 });
  } catch (error) {
    logger.error("[api/reports] Failed to create report:", error);
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
```

**Step 2: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/reports/route.ts
git commit -m "feat: 添加用户举报 API"
```

---

## Task 5: 管理员举报 API

**Files:**
- Create: `src/app/api/admin/reports/route.ts`
- Create: `src/app/api/admin/reports/[id]/route.ts`

**Step 1: 实现 GET /api/admin/reports**

`src/app/api/admin/reports/route.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { adminQueryReportsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminResult = await requireAdmin();
  if ("error" in adminResult) {
    return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = adminQueryReportsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const { page, limit, status, targetType } = parsed.data;

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  if (targetType !== "all") where.targetType = targetType;

  const [reports, total, pendingCount] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.report.count({ where }),
    prisma.report.count({ where: { status: "pending" } }),
  ]);

  return NextResponse.json({
    reports,
    total,
    pendingCount,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
```

**Step 2: 实现 PATCH /api/admin/reports/:id**

`src/app/api/admin/reports/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { adminReportActionSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notification";
import { logger } from "@/lib/logger";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireAdmin();
  if ("error" in adminResult) {
    return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
  }

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "举报不存在" }, { status: 404 });
  }
  if (report.status !== "pending") {
    return NextResponse.json({ error: "该举报已处理" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = adminReportActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const { action, actions, adminNote } = parsed.data;

  // 更新举报状态
  await prisma.report.update({
    where: { id },
    data: {
      status: action === "dismiss" ? "dismissed" : "resolved",
      actions: actions ? JSON.stringify(actions) : null,
      adminNote: adminNote?.trim() || null,
      resolvedBy: adminResult.userId,
      resolvedAt: new Date(),
    },
  });

  // 执行处置动作
  if (action === "resolve" && actions?.length) {
    try {
      await executeReportActions(report, actions);
    } catch (error) {
      logger.error("[api/admin/reports] Failed to execute actions:", error);
    }
  }

  // 通知举报者
  try {
    if (action === "dismiss") {
      await createNotification({
        userId: report.reporterId,
        type: "report_dismissed",
        title: "举报处理结果",
        message: "你的举报经审核后未发现违规，感谢你的反馈",
      });
    } else {
      await createNotification({
        userId: report.reporterId,
        type: "report_resolved",
        title: "举报处理结果",
        message: "你的举报已处理，感谢你帮助维护社区环境",
      });
    }
  } catch (error) {
    logger.error("[api/admin/reports] Failed to notify reporter:", error);
  }

  return NextResponse.json({ message: "处理成功" });
}

/** 执行具体处置动作 */
async function executeReportActions(
  report: { targetType: string; targetId: string },
  actions: string[],
) {
  // 查找被举报者 ID
  let targetOwnerId: string | null = null;
  let targetName = "";

  if (report.targetType === "server") {
    const server = await prisma.server.findUnique({
      where: { id: report.targetId },
      select: { ownerId: true, name: true, psid: true },
    });
    if (server) {
      targetOwnerId = server.ownerId;
      targetName = server.name;
    }
  } else if (report.targetType === "comment") {
    const comment = await prisma.comment.findUnique({
      where: { id: report.targetId },
      select: { authorId: true },
    });
    if (comment) targetOwnerId = comment.authorId;
  } else if (report.targetType === "user") {
    targetOwnerId = report.targetId;
  }

  for (const act of actions) {
    if (act === "warn" && targetOwnerId) {
      await createNotification({
        userId: targetOwnerId,
        type: "content_warning",
        title: "内容违规警告",
        message: `你的${report.targetType === "server" ? `服务器「${targetName}」` : report.targetType === "comment" ? "评论" : "账号"}收到违规举报，请注意社区规范`,
      });
    }

    if (act === "takedown") {
      if (report.targetType === "server") {
        await prisma.server.update({
          where: { id: report.targetId },
          data: { status: "rejected", rejectReason: "因举报被下架" },
        });
        if (targetOwnerId) {
          await createNotification({
            userId: targetOwnerId,
            type: "content_takedown",
            title: "服务器已下架",
            message: `你的服务器「${targetName}」因违规举报已被下架`,
          });
        }
      } else if (report.targetType === "comment") {
        await prisma.comment.delete({ where: { id: report.targetId } });
        if (targetOwnerId) {
          await createNotification({
            userId: targetOwnerId,
            type: "content_takedown",
            title: "评论已删除",
            message: "你的一条评论因违规举报已被删除",
          });
        }
      }
    }

    if (act === "ban_user" && targetOwnerId) {
      await prisma.user.update({
        where: { id: targetOwnerId },
        data: { bannedAt: new Date() },
      });
    }
  }
}
```

**Step 3: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/api/admin/reports/
git commit -m "feat: 添加管理员举报处置 API"
```

---

## Task 6: 管理员巡检 API 扩展

**Files:**
- Modify: `src/app/api/admin/servers/[id]/route.ts`
- Modify: `src/app/api/admin/servers/route.ts`

**Step 1: PATCH 处理器新增 "review" action**

在 `src/app/api/admin/servers/[id]/route.ts` 的 PATCH handler 中，`reject` 分支之后新增 `review` 分支：

```typescript
if (action === "review") {
  await prisma.server.update({
    where: { id: serverId },
    data: {
      reviewStatus: "reviewed",
      reviewedAt: new Date(),
      reviewedBy: adminResult.userId,
    },
  });
  return NextResponse.json({ message: "已标记为已巡检" });
}
```

**Step 2: GET 列表支持 reviewStatus 筛选**

在 `src/app/api/admin/servers/route.ts` 的查询条件构建中，支持新的 `reviewStatus` 查询参数：

当 `status` 参数为 `"unreviewed"` 或 `"reviewed"` 时，查询条件改为：
```typescript
if (status === "unreviewed" || status === "reviewed") {
  where.status = "approved";
  where.reviewStatus = status;
}
```

当 `status` 参数为 `"reported"` 时，查询有 pending 举报的服务器：
```typescript
if (status === "reported") {
  // 先查有 pending 举报的服务器 ID
  const reportedServerIds = await prisma.report.findMany({
    where: { targetType: "server", status: "pending" },
    select: { targetId: true },
    distinct: ["targetId"],
  });
  where.id = { in: reportedServerIds.map((r) => r.targetId) };
}
```

同时在返回数据中追加 `reportCount`（如果是 reported tab）。

**Step 3: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/api/admin/servers/
git commit -m "feat: 管理员 API 支持巡检和举报筛选"
```

---

## Task 7: 举报弹窗组件

**Files:**
- Create: `src/components/ReportDialog.tsx`

**Step 1: 实现 ReportDialog 组件**

```typescript
"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";

const REPORT_CATEGORIES = [
  { key: "misinformation", label: "虚假信息" },
  { key: "pornography", label: "色情低俗" },
  { key: "harassment", label: "骚扰攻击" },
  { key: "fraud", label: "广告欺诈" },
  { key: "other", label: "其他" },
] as const;

interface ReportDialogProps {
  targetType: "server" | "comment" | "user";
  targetId: string;
  open: boolean;
  onClose: () => void;
}

export function ReportDialog({ targetType, targetId, open, onClose }: ReportDialogProps) {
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  if (!open) return null;

  const handleSubmit = async () => {
    if (!category) {
      showToast("请选择举报分类", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, category, description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "举报失败", "error");
        return;
      }
      showToast("举报已提交，感谢反馈", "success");
      onClose();
      setCategory("");
      setDescription("");
    } catch {
      showToast("网络错误，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="m3-surface mx-4 w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-warm-800">
          举报{targetType === "server" ? "服务器" : targetType === "comment" ? "评论" : "用户"}
        </h3>

        <div className="mb-4 flex flex-wrap gap-2">
          {REPORT_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`m3-chip text-sm ${category === cat.key ? "m3-chip-active" : ""}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充说明（可选）"
          maxLength={500}
          rows={3}
          className="m3-input mb-4 w-full resize-none"
        />

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="m3-btn-text text-sm">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !category}
            className="m3-btn-primary text-sm"
          >
            {loading ? "提交中..." : "提交举报"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/ReportDialog.tsx
git commit -m "feat: 添加举报弹窗组件"
```

---

## Task 8: 用户端举报入口 — 服务器详情页

**Files:**
- Modify: `src/app/servers/[id]/page.tsx` (Line ~497, FavoriteButton 附近)

**Step 1: 在 FavoriteButton 旁添加举报按钮**

在服务器详情页的 `<FavoriteButton>` 所在的 `<div className="self-start sm:self-auto">` 中，FavoriteButton 之后添加举报按钮。

需要把这个区域包装为客户端组件（`ServerDetailActions`），因为举报弹窗需要 state。创建：

**Files:**
- Create: `src/components/ServerDetailActions.tsx`

```typescript
"use client";

import { useState } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ReportDialog } from "@/components/ReportDialog";

interface ServerDetailActionsProps {
  serverId: string;
  initialFavorited: boolean;
  isOwner: boolean;
  isLoggedIn: boolean;
}

export function ServerDetailActions({
  serverId,
  initialFavorited,
  isOwner,
  isLoggedIn,
}: ServerDetailActionsProps) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <FavoriteButton serverId={serverId} initialFavorited={initialFavorited} />
      {isLoggedIn && !isOwner && (
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="m3-btn-text text-sm text-warm-500 hover:text-accent"
          title="举报"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      <ReportDialog
        targetType="server"
        targetId={serverId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
```

**Step 2: 在 page.tsx 中替换 FavoriteButton**

将 `src/app/servers/[id]/page.tsx` 中的：
```tsx
<div className="self-start sm:self-auto">
  <FavoriteButton serverId={server.id} initialFavorited={initialFavorited} />
</div>
```

替换为：
```tsx
<div className="self-start sm:self-auto">
  <ServerDetailActions
    serverId={server.id}
    initialFavorited={initialFavorited}
    isOwner={isOwner}
    isLoggedIn={isLoggedIn}
  />
</div>
```

更新 import：移除 `FavoriteButton`，添加 `ServerDetailActions`。

**Step 3: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/ServerDetailActions.tsx src/app/servers/[id]/page.tsx
git commit -m "feat: 服务器详情页添加举报按钮"
```

---

## Task 9: 用户端举报入口 — 评论和用户

**Files:**
- Modify: `src/components/CommentSection.tsx` (评论操作菜单区域)

**Step 1: 在评论操作区域添加举报按钮**

在 `CommentSection.tsx` 中每条评论的操作按钮区域（删除按钮附近），为非作者用户添加举报按钮：

```tsx
{session?.user?.id && session.user.id !== comment.authorId && (
  <button
    type="button"
    onClick={() => {
      setReportTarget({ type: "comment", id: comment.id });
      setReportOpen(true);
    }}
    className="text-xs text-warm-400 hover:text-accent"
  >
    举报
  </button>
)}
```

在组件顶部添加 state：
```typescript
const [reportOpen, setReportOpen] = useState(false);
const [reportTarget, setReportTarget] = useState<{ type: "comment" | "user"; id: string } | null>(null);
```

在组件 return 末尾添加 ReportDialog：
```tsx
{reportTarget && (
  <ReportDialog
    targetType={reportTarget.type}
    targetId={reportTarget.id}
    open={reportOpen}
    onClose={() => {
      setReportOpen(false);
      setReportTarget(null);
    }}
  />
)}
```

**Step 2: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/CommentSection.tsx
git commit -m "feat: 评论区添加举报按钮"
```

---

## Task 10: 管理后台 — 服务器页面新增巡检和举报 tab

**Files:**
- Modify: `src/app/admin/servers/page.tsx`

**Step 1: 扩展 STATUS_TABS**

将 `STATUS_TABS` 从：
```typescript
const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
] as const;
```

改为：
```typescript
const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待审核" },
  { key: "unreviewed", label: "待巡检" },
  { key: "reported", label: "被举报" },
  { key: "reviewed", label: "已巡检" },
  { key: "rejected", label: "已拒绝" },
] as const;
```

**Step 2: 添加巡检操作按钮**

在服务器列表项的操作区域，当 `statusFilter === "unreviewed"` 时显示"标记已巡检"按钮：

```tsx
{statusFilter === "unreviewed" && (
  <button
    type="button"
    onClick={() => handleReview(server.id)}
    className="m3-btn-text text-sm text-forest"
  >
    标记已巡检
  </button>
)}
```

添加 `handleReview` 函数：
```typescript
async function handleReview(serverId: string) {
  setActionLoading(serverId);
  try {
    const res = await fetch(`/api/admin/servers/${serverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review" }),
    });
    if (!res.ok) throw new Error();
    showToast("已标记为已巡检", "success");
    fetchServers();
  } catch {
    showToast("操作失败", "error");
  } finally {
    setActionLoading(null);
  }
}
```

**Step 3: 被举报 tab 显示举报数**

当 `statusFilter === "reported"` 时，在服务器卡片中额外显示举报数量（从 API 返回的 `reportCount` 字段）。

**Step 4: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/admin/servers/page.tsx
git commit -m "feat: 管理后台服务器页面新增巡检和举报 tab"
```

---

## Task 11: 管理后台 — 举报管理页面

**Files:**
- Create: `src/app/admin/reports/page.tsx`

**Step 1: 实现举报管理页面**

参照 `src/app/admin/moderation/page.tsx` 的结构：

- 顶部统计卡片：待处理举报数 / 今日新增 / 已处理
- 状态 tab：待处理 | 已处理 | 已驳回 | 全部
- 类型筛选：全部 | 服务器 | 评论 | 用户
- 举报列表：时间、类型、举报分类、描述、举报者、状态
- 操作按钮：驳回 / 处置（展开多选：警告 + 下架 + 封禁）

关键实现点：
- fetch `/api/admin/reports` 获取列表
- 处置时 PATCH `/api/admin/reports/:id`
- 多选动作使用 checkbox group
- 使用现有 `m3-chip`、`m3-surface`、`m3-btn-*` 样式类

**Step 2: 在管理后台导航中添加入口**

在 `src/app/admin/layout.tsx` 的导航菜单中添加"举报管理"链接指向 `/admin/reports`。

**Step 3: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/admin/reports/ src/app/admin/layout.tsx
git commit -m "feat: 添加管理后台举报管理页面"
```

---

## Task 12: 最终验证与清理

**Files:** 所有已修改文件

**Step 1: Lint 检查**

Run: `pnpm lint`

**Step 2: 类型检查**

Run: `pnpm tsc --noEmit`

**Step 3: 格式化**

Run: `pnpm format`

**Step 4: 构建测试**

Run: `pnpm build`

**Step 5: 最终 Commit（如有格式化变更）**

```bash
git add -A
git commit -m "style: 格式化举报与审查系统代码"
```
