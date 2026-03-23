# Topic System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight hashtag/topic system — Tag + PostTag tables, tag extraction on post create/delete, search page integration, admin management.

**Architecture:** Tag model stores normalized (lowercase) topic names with display names and aliases. PostTag junction table links posts to tags. Tags are extracted from post content at create time. Search page at `/search?q=xxx` handles `#tag`, `@user`, and text queries. Admin CRUD at `/admin/tags`.

**Tech Stack:** Prisma (PostgreSQL), Next.js App Router, React, Tailwind CSS, Zod validation.

**Design doc:** `docs/plans/2026-03-22-topic-system-design.md`

---

### Task 1: Database Migration — Tag + PostTag models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1:** Add Tag model after the CircleBan model (line ~638):

```prisma
/// 话题标签 —— 从帖子内容中提取的 #话题
model Tag {
  id          String   @id @default(cuid())
  name        String   @unique
  displayName String   @map("display_name")
  aliases     String[] @default([])
  postCount   Int      @default(0) @map("post_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  posts PostTag[]

  @@index([postCount(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("tags")
}

/// 帖子-话题关联
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

**Step 2:** Add `postTags PostTag[]` relation to the Post model (after `notifications Notification[]`, around line 521):

```prisma
  postTags      PostTag[]
```

**Step 3:** Run migration:

```bash
pnpm prisma migrate dev --name add_tag_and_post_tag
```

**Step 4:** Verify:

```bash
pnpm db:generate
pnpm tsc --noEmit
```

**Step 5:** Commit:

```bash
git add prisma/
git commit -m "feat: add Tag and PostTag models for topic system"
```

---

### Task 2: Tag utility — extraction and upsert helper

**Files:**
- Create: `src/lib/tags.ts`

**Step 1:** Create the tag utility module:

```typescript
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const TAG_PATTERN = /#([\w\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+)/g;
const MAX_TAGS_PER_POST = 5;

/**
 * Extract unique hashtags from text content.
 * Returns at most MAX_TAGS_PER_POST tags, preserving original casing.
 */
export function extractTags(content: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(content)) !== null) {
    const raw = match[1]!;
    const normalized = raw.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(raw);
    }
    if (tags.length >= MAX_TAGS_PER_POST) break;
  }

  return tags;
}

/**
 * Upsert tags and create PostTag links within a transaction.
 * - Normalizes tag names to lowercase
 * - Creates Tag if not exists (displayName = first user's original text)
 * - Creates PostTag associations
 * - Increments postCount on each tag
 */
export async function linkTagsToPost(
  tx: TxClient,
  postId: string,
  rawTags: string[],
): Promise<void> {
  for (const raw of rawTags) {
    const normalized = raw.toLowerCase();

    // Upsert tag: create if not exists, do nothing if exists
    const tag = await tx.tag.upsert({
      where: { name: normalized },
      create: { name: normalized, displayName: raw },
      update: {},
      select: { id: true },
    });

    // Create PostTag link (ignore if duplicate)
    await tx.postTag.upsert({
      where: { unique_post_tag: { postId, tagId: tag.id } },
      create: { postId, tagId: tag.id },
      update: {},
    });

    // Increment postCount
    await tx.tag.update({
      where: { id: tag.id },
      data: { postCount: { increment: 1 } },
    });
  }
}

/**
 * Remove all PostTag links for a post and decrement tag postCounts.
 * Called when soft-deleting a post.
 */
export async function unlinkTagsFromPost(
  tx: TxClient,
  postId: string,
): Promise<void> {
  const postTags = await tx.postTag.findMany({
    where: { postId },
    select: { id: true, tagId: true },
  });

  if (postTags.length === 0) return;

  // Delete all PostTag links
  await tx.postTag.deleteMany({ where: { postId } });

  // Decrement postCount for each tag
  for (const pt of postTags) {
    const updated = await tx.tag.update({
      where: { id: pt.tagId },
      data: { postCount: { decrement: 1 } },
      select: { postCount: true },
    });

    if (updated.postCount < 0) {
      await tx.tag.update({
        where: { id: pt.tagId },
        data: { postCount: 0 },
      });
    }
  }
}
```

**Step 2:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 3:** Commit:

```bash
git add src/lib/tags.ts
git commit -m "feat: add tag extraction and upsert utilities"
```

---

### Task 3: Integrate tags into post creation API

**Files:**
- Modify: `src/lib/validation.ts` (~line 481)
- Modify: `src/app/api/posts/route.ts` (POST handler)

**Step 1:** Update `createPostSchema` in `validation.ts` — add `tags` field:

```typescript
export const createPostSchema = z.object({
  title: z.string().trim().max(100, "标题最多 100 个字符").optional().default(""),
  content: z.string().trim().min(1, "请输入内容").max(50000, "内容最多 50000 个字符"),
  circleId: z.string().cuid().optional().nullable(),
  sectionId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(5).optional().default([]),
});
```

**Step 2:** In `src/app/api/posts/route.ts` POST handler, after `const { title, content, circleId, sectionId } = parsed.data;` add tags destructure:

```typescript
const { title, content, circleId, sectionId, tags } = parsed.data;
```

Import `linkTagsToPost` at the top:

```typescript
import { linkTagsToPost } from "@/lib/tags";
```

**Step 3:** In both the circle-post branch (existing `$transaction`) and the square-post branch, add tag linking inside the transaction. For the circle-post branch, add after `circle.update`:

```typescript
if (tags.length > 0) {
  await linkTagsToPost(tx, created.id, tags);
}
```

For the square-post branch, wrap it in a transaction:

```typescript
const post = await prisma.$transaction(async (tx) => {
  const created = await tx.post.create({
    data: {
      title,
      content,
      authorId: userId,
      circleId: null,
      sectionId: null,
    },
    select: { id: true, title: true, circleId: true, sectionId: true, createdAt: true },
  });

  if (tags.length > 0) {
    await linkTagsToPost(tx, created.id, tags);
  }

  return created;
});
```

**Step 4:** Verify:

```bash
pnpm tsc --noEmit && pnpm lint
```

**Step 5:** Commit:

```bash
git add src/lib/validation.ts src/app/api/posts/route.ts
git commit -m "feat: extract and store tags on post creation"
```

---

### Task 4: Integrate tags into post deletion

**Files:**
- Modify: `src/app/api/posts/[id]/route.ts` (DELETE handler)

**Step 1:** Import `unlinkTagsFromPost`:

```typescript
import { unlinkTagsFromPost } from "@/lib/tags";
```

**Step 2:** In both the circle-post transaction branch and the no-circle branch, add `unlinkTagsFromPost(tx, id)` before the soft-delete. For the no-circle branch, wrap in a transaction.

Inside the existing `if (post.circleId)` transaction, add before `tx.post.update`:

```typescript
await unlinkTagsFromPost(tx, id);
```

Replace the `else` branch:

```typescript
} else {
  await prisma.$transaction(async (tx) => {
    await unlinkTagsFromPost(tx, id);
    await tx.post.update({
      where: { id },
      data: { status: "DELETED" },
    });
  });
}
```

**Step 3:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 4:** Commit:

```bash
git add src/app/api/posts/[id]/route.ts
git commit -m "feat: unlink tags on post deletion"
```

---

### Task 5: Rewrite tag search API to use Tag table

**Files:**
- Modify: `src/app/api/tags/search/route.ts`

**Step 1:** Rewrite the GET handler to query the Tag table instead of scanning post content:

```typescript
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 8, 20);

    if (!q || q.length === 0) {
      return NextResponse.json({ tags: [] });
    }

    const qLower = q.toLowerCase();

    const tags = await prisma.tag.findMany({
      where: {
        OR: [
          { name: { contains: qLower } },
          { aliases: { has: qLower } },
        ],
      },
      select: { name: true, displayName: true, postCount: true },
      orderBy: { postCount: "desc" },
      take: limit,
    });

    const results = tags.map((t) => ({
      tag: t.displayName,
      count: t.postCount,
    }));

    return NextResponse.json({ tags: results });
  } catch (err) {
    logger.error("[api/tags/search] Unexpected error", err);
    return NextResponse.json({ error: "搜索失败" }, { status: 500 });
  }
}
```

Note: The `aliases: { has: qLower }` checks exact match against the aliases array. For partial matching on aliases, use a raw query or iterate. Exact match is acceptable since aliases are created from merged tag names.

**Step 2:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 3:** Commit:

```bash
git add src/app/api/tags/search/route.ts
git commit -m "refactor: tag search uses Tag table instead of scanning posts"
```

---

### Task 6: Frontend — send tags on post creation

**Files:**
- Modify: `src/components/forum/CreatePostForm.tsx`

**Step 1:** Add tag extraction in `handleSubmit`, before the fetch call. Reuse the same regex pattern:

```typescript
// Extract tags from content
const tagPattern = /#([\w\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+)/g;
const tagSet = new Set<string>();
let tagMatch: RegExpExecArray | null;
while ((tagMatch = tagPattern.exec(content.trim())) !== null) {
  tagSet.add(tagMatch[1]!);
  if (tagSet.size >= 5) break;
}

const body: Record<string, unknown> = {
  title: title.trim(),
  content: content.trim(),
  tags: [...tagSet],
};
```

Remove the old `body` construction that didn't include tags.

**Step 2:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 3:** Commit:

```bash
git add src/components/forum/CreatePostForm.tsx
git commit -m "feat: extract and send tags on post creation"
```

---

### Task 7: Update PostContentRenderer links

**Files:**
- Modify: `src/components/forum/PostContentRenderer.tsx`

**Step 1:** Change hashtag link `href` from `/?tag=xxx` to `/search?q=%23xxx`:

```typescript
case "hashtag":
  return (
    <Link
      key={i}
      href={`/search?q=${encodeURIComponent("#" + seg.tag)}`}
      ...
```

**Step 2:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 3:** Commit:

```bash
git add src/components/forum/PostContentRenderer.tsx
git commit -m "feat: hashtag links point to search page"
```

---

### Task 8: Search API

**Files:**
- Create: `src/app/api/search/route.ts`

**Step 1:** Create the unified search API:

- Parse `q` parameter: detect `#` prefix (tag search), `@` prefix (user search), or plain text
- For tag search: find Tag by name or aliases, then query PostTag → Post with cursor pagination
- For text search: query posts where title or content `contains` the query (case-insensitive)
- For user search: redirect to existing `/api/users/search` logic or inline it
- Return `{ type, tag?, posts: PostItem[], nextCursor }`
- Reuse the same PostItem mapping pattern from `GET /api/posts`

**Step 2:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 3:** Commit:

```bash
git add src/app/api/search/route.ts
git commit -m "feat: add unified search API with tag, mention, and text modes"
```

---

### Task 9: Search page

**Files:**
- Create: `src/app/search/page.tsx`
- Create: `src/components/forum/SearchPage.tsx`

**Step 1:** Create the page route (`src/app/search/page.tsx`):

```typescript
import { SearchPage } from "@/components/forum/SearchPage";

export default function SearchPageRoute() {
  return <SearchPage />;
}
```

**Step 2:** Create the SearchPage component (`src/components/forum/SearchPage.tsx`):

- Read `q` from `useSearchParams()`
- Search input at top (controlled, updates URL on submit)
- If `type=tag`: show tag info card (`#DisplayName · N 篇帖子`)
- Post list with cursor pagination using PostCard
- Empty state when no results
- Loading spinner during fetch

**Step 3:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 4:** Commit:

```bash
git add src/app/search/ src/components/forum/SearchPage.tsx
git commit -m "feat: add search page with tag, mention, and text search"
```

---

### Task 10: Admin tag management API

**Files:**
- Create: `src/app/api/admin/tags/route.ts` (GET list + DELETE)
- Create: `src/app/api/admin/tags/[id]/route.ts` (PUT rename/aliases)
- Create: `src/app/api/admin/tags/merge/route.ts` (POST merge)

**Step 1:** `GET /api/admin/tags` — paginated list, optional `search` filter. `DELETE /api/admin/tags/:id` in same file as alternate export.

**Step 2:** `PUT /api/admin/tags/:id` — accept `{ name?, displayName?, aliases? }`. If name changes, add old name to aliases. Validate with Zod.

**Step 3:** `POST /api/admin/tags/merge` — accept `{ sourceId, targetId }`. Transaction: move PostTag rows from source to target (skip duplicates), merge aliases, delete source, recount target postCount.

All endpoints: import `requireAdmin` / `isAdminError` from `@/lib/admin`, return 403 if not admin.

**Step 4:** Verify:

```bash
pnpm tsc --noEmit
```

**Step 5:** Commit:

```bash
git add src/app/api/admin/tags/
git commit -m "feat: add admin tag management API (CRUD + merge)"
```

---

### Task 11: Admin tags page

**Files:**
- Create: `src/app/admin/tags/page.tsx`
- Modify: `src/app/admin/layout.tsx` (add nav link)

**Step 1:** Create admin tags page with:

- Paginated tag table: name, displayName, aliases, postCount, createdAt
- Search input to filter
- Rename dialog (edit name + displayName)
- Aliases editor (add/remove alias chips)
- Merge dialog (select target tag)
- Delete button with confirmation
- All actions call the admin API endpoints from Task 10

**Step 2:** Add "话题管理" link to admin layout sidebar nav and mobile nav chips.

**Step 3:** Verify:

```bash
pnpm tsc --noEmit && pnpm lint
```

**Step 4:** Commit:

```bash
git add src/app/admin/tags/ src/app/admin/layout.tsx
git commit -m "feat: add admin tags management page"
```

---

### Task 12: Final verification

**Step 1:** Full type check and lint:

```bash
pnpm tsc --noEmit && pnpm lint
```

**Step 2:** Manual smoke test checklist:

- [ ] Create a post with `#测试话题 #Minecraft` in content
- [ ] Verify tags appear in DB (`prisma studio`)
- [ ] Click a `#话题` link in post detail → goes to `/search?q=%23话题`
- [ ] Search page shows tag info card + filtered posts
- [ ] Search plain text shows matching posts
- [ ] Tag autocomplete in PostTextarea shows results from Tag table
- [ ] Delete post → tag postCount decrements
- [ ] Admin: list tags, rename, add alias, merge two tags, delete tag

**Step 3:** Commit any remaining fixes, then final commit:

```bash
git add -A
git commit -m "feat: complete topic system implementation"
```
