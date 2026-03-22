# Community Forum (MoltBook) Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a community forum module with circles (圈子), posts, comments, likes, bookmarks, and a feed-based homepage (大别野模式) to the existing pudcraft-community platform.

**Architecture:** New independent module alongside existing server system. Existing `Comment` → `ServerComment`, `Notification` → `ServerNotification` rename. New models for forum entities. Reuse existing auth, moderation, rich text editor, and UI patterns.

**Tech Stack:** Next.js 15 App Router, Prisma ORM + PostgreSQL, Tailwind CSS + Material 3 warm theme, NextAuth v5 JWT, Zod validation.

**Design doc:** `docs/plans/2026-03-22-community-forum-design.md`

---

## Reference: Existing Patterns

Before implementing, familiarize yourself with these files:

| Pattern | Reference File |
|---------|---------------|
| Auth guard | `src/lib/auth-guard.ts` — `requireActiveUser()` + `isActiveUserError()` |
| Zod validation | `src/lib/validation.ts` — schemas with `.safeParse()` |
| Content moderation | `src/lib/moderation.ts` — `moderateContent()` / `moderateFields()` |
| Type definitions | `src/lib/types.ts` — response types, data types |
| API route (CRUD) | `src/app/api/servers/route.ts` — GET list + POST create |
| API route (toggle) | `src/app/api/servers/[id]/favorite/route.ts` — POST/DELETE toggle with $transaction |
| Component (toggle btn) | `src/components/FavoriteButton.tsx` — optimistic update pattern |
| Component (comments) | `src/components/CommentSection.tsx` — list with pagination |
| Component (card) | `src/components/ServerCard.tsx` — card UI pattern |
| Logger | `src/lib/logger.ts` — `logger.error("[context] msg", error)` |
| Prisma client | `src/lib/prisma.ts` |
| Layout | `src/app/layout.tsx` — navigation, session provider |

---

## Task 1: Rename `Comment` → `ServerComment` (Schema + All References)

**Goal:** Rename existing Comment model to ServerComment to free the name for forum comments.

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/servers/[id]/comments/route.ts`
- Modify: `src/app/api/servers/[id]/comments/[commentId]/route.ts`
- Modify: `src/components/CommentSection.tsx`
- Modify: `src/components/CommentItem.tsx`
- Modify: All files importing/referencing `Comment` from Prisma or types

**Steps:**

1. In `prisma/schema.prisma`, rename `model Comment` to `model ServerComment`. Keep `@@map("comments")` so the DB table name stays the same. Update the self-referencing relation name. Update all relations pointing to this model (User, Server).

2. Run `grep -r "Comment" src/ --include="*.ts" --include="*.tsx"` to find all references. Rename:
   - Prisma calls: `prisma.comment.` → `prisma.serverComment.`
   - Type names: `Comment` → `ServerComment` (in types.ts, already named `ServerComment` for the interface — verify and align)
   - Component props/state referencing Comment type

3. Run `pnpm db:generate` to regenerate Prisma client.

4. Run `pnpm tsc --noEmit` to verify no type errors.

5. Run `pnpm lint` to verify no lint errors.

6. Commit: `refactor: rename Comment model to ServerComment`

---

## Task 2: Rename `Notification` → `ServerNotification` (Schema + All References)

**Goal:** Rename existing Notification model to ServerNotification to free the name for forum notifications.

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/types.ts`
- Modify: `src/components/NotificationBell.tsx`
- Modify: All API routes and components referencing Notification

**Steps:**

1. In `prisma/schema.prisma`, rename `model Notification` to `model ServerNotification`. Keep `@@map("notifications")`. Update User relation.

2. Find and rename all references:
   - `prisma.notification.` → `prisma.serverNotification.`
   - Type names in types.ts
   - Component imports

3. Run `pnpm db:generate`, `pnpm tsc --noEmit`, `pnpm lint`.

4. Commit: `refactor: rename Notification model to ServerNotification`

---

## Task 3: Add Forum Prisma Models + Migration

**Goal:** Add all new forum models to schema.prisma and run migration.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration file (auto-generated)

**Steps:**

1. Add enums to `prisma/schema.prisma`:

```prisma
enum CircleRole {
  OWNER
  ADMIN
  MEMBER
}

enum PostStatus {
  PUBLISHED
  HIDDEN
  DELETED
}

enum CommentStatus {
  PUBLISHED
  HIDDEN
  DELETED
}

enum NotificationType {
  POST_COMMENT
  COMMENT_REPLY
}
```

2. Add models (in this order for dependency resolution):

```prisma
model Circle {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?  @db.Text
  icon        String?
  banner      String?
  creatorId   String   @map("creator_id")
  memberCount Int      @default(0) @map("member_count")
  postCount   Int      @default(0) @map("post_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  creator     User               @relation("CircleCreator", fields: [creatorId], references: [id], onDelete: Cascade)
  memberships CircleMembership[]
  sections    Section[]
  posts       Post[]
  bans        CircleBan[]

  @@index([creatorId])
  @@index([createdAt(sort: Desc)])
  @@map("circles")
}

model CircleMembership {
  id       String     @id @default(cuid())
  userId   String     @map("user_id")
  circleId String     @map("circle_id")
  role     CircleRole @default(MEMBER)
  joinedAt DateTime   @default(now()) @map("joined_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  circle Circle @relation(fields: [circleId], references: [id], onDelete: Cascade)

  @@unique([userId, circleId], name: "unique_circle_membership")
  @@index([circleId])
  @@map("circle_memberships")
}

model Section {
  id          String   @id @default(cuid())
  name        String
  description String?
  circleId    String   @map("circle_id")
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")

  circle Circle @relation(fields: [circleId], references: [id], onDelete: Cascade)
  posts  Post[]

  @@index([circleId, sortOrder])
  @@map("sections")
}

model Post {
  id           String     @id @default(cuid())
  title        String
  content      Json
  authorId     String     @map("author_id")
  circleId     String?    @map("circle_id")
  sectionId    String?    @map("section_id")
  viewCount    Int        @default(0) @map("view_count")
  likeCount    Int        @default(0) @map("like_count")
  commentCount Int        @default(0) @map("comment_count")
  isPinned     Boolean    @default(false) @map("is_pinned")
  status       PostStatus @default(PUBLISHED)
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  author    User       @relation("PostAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  circle    Circle?    @relation(fields: [circleId], references: [id], onDelete: Cascade)
  section   Section?   @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  comments  Comment[]
  likes     PostLike[]
  bookmarks Bookmark[]

  @@index([circleId, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@index([authorId, createdAt(sort: Desc)])
  @@index([sectionId])
  @@map("posts")
}

model Comment {
  id              String        @id @default(cuid())
  content         String        @db.Text
  authorId        String        @map("author_id")
  postId          String        @map("post_id")
  parentCommentId String?       @map("parent_comment_id")
  likeCount       Int           @default(0) @map("like_count")
  status          CommentStatus @default(PUBLISHED)
  createdAt       DateTime      @default(now()) @map("created_at")

  author  User      @relation("ForumCommentAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  post    Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  parent  Comment?  @relation("CommentThread", fields: [parentCommentId], references: [id], onDelete: Cascade)
  replies Comment[] @relation("CommentThread")
  likes   CommentLike[]

  @@index([postId, createdAt(sort: Desc)])
  @@index([parentCommentId])
  @@map("forum_comments")
}

model PostLike {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  postId    String   @map("post_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId], name: "unique_post_like")
  @@index([postId])
  @@map("post_likes")
}

model CommentLike {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  commentId String   @map("comment_id")
  createdAt DateTime @default(now()) @map("created_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@unique([userId, commentId], name: "unique_comment_like")
  @@index([commentId])
  @@map("comment_likes")
}

model Bookmark {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  postId    String   @map("post_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId], name: "unique_bookmark")
  @@index([userId, createdAt(sort: Desc)])
  @@map("bookmarks")
}

model Notification {
  id           String           @id @default(cuid())
  recipientId  String           @map("recipient_id")
  type         NotificationType
  sourceUserId String           @map("source_user_id")
  postId       String?          @map("post_id")
  commentId    String?          @map("comment_id")
  isRead       Boolean          @default(false) @map("is_read")
  createdAt    DateTime         @default(now()) @map("created_at")

  recipient  User     @relation("ForumNotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  sourceUser User     @relation("ForumNotificationSource", fields: [sourceUserId], references: [id], onDelete: Cascade)
  post       Post?    @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment    Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@index([recipientId, isRead])
  @@index([createdAt(sort: Desc)])
  @@map("forum_notifications")
}

model CircleBan {
  id             String    @id @default(cuid())
  circleId       String    @map("circle_id")
  userId         String    @map("user_id")
  reason         String?
  expiresAt      DateTime? @map("expires_at")
  syncToServers  Boolean   @default(false) @map("sync_to_servers")
  bannedBy       String    @map("banned_by")
  createdAt      DateTime  @default(now()) @map("created_at")

  circle Circle @relation(fields: [circleId], references: [id], onDelete: Cascade)
  user   User   @relation("CircleBanUser", fields: [userId], references: [id], onDelete: Cascade)
  banner User   @relation("CircleBanBanner", fields: [bannedBy], references: [id], onDelete: Cascade)

  @@unique([circleId, userId], name: "unique_circle_ban")
  @@index([circleId])
  @@map("circle_bans")
}
```

3. Add reverse relations to User model (add these fields):

```prisma
// Add to User model:
  createdCircles      Circle[]           @relation("CircleCreator")
  circleMemberships   CircleMembership[]
  posts               Post[]             @relation("PostAuthor")
  forumComments       Comment[]          @relation("ForumCommentAuthor")
  postLikes           PostLike[]
  commentLikes        CommentLike[]
  bookmarks           Bookmark[]
  forumNotifications  Notification[]     @relation("ForumNotificationRecipient")
  forumNotifSources   Notification[]     @relation("ForumNotificationSource")
  circleBansReceived  CircleBan[]        @relation("CircleBanUser")
  circleBansIssued    CircleBan[]        @relation("CircleBanBanner")
```

4. Also add reverse relation to Post for Notification:

```prisma
// Add to Post model:
  notifications Notification[]
```

5. Run migration: `pnpm prisma migrate dev --name add_forum_models`

6. Run `pnpm db:generate`, `pnpm tsc --noEmit`.

7. Commit: `feat: add forum data models (Circle, Post, Comment, Like, Bookmark, Notification, CircleBan)`

---

## Task 4: Forum Validation Schemas + Type Definitions

**Goal:** Add Zod schemas and TypeScript types for all forum entities.

**Files:**
- Modify: `src/lib/validation.ts` — add forum schemas
- Modify: `src/lib/types.ts` — add forum types

**Steps:**

1. Add to `src/lib/validation.ts`:

```typescript
// ===== Forum Validation Schemas =====

export const circleSlugSchema = z
  .string()
  .trim()
  .min(2, "至少 2 个字符")
  .max(30, "最多 30 个字符")
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "只能包含小写字母、数字和连字符，不能以连字符开头或结尾");

export const createCircleSchema = z.object({
  name: z.string().trim().min(1, "请输入圈子名称").max(50, "最多 50 个字符"),
  slug: circleSlugSchema,
  description: z.string().trim().max(500, "最多 500 个字符").optional(),
});

export const updateCircleSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().url().optional().nullable(),
  banner: z.string().url().optional().nullable(),
});

export const createSectionSchema = z.object({
  name: z.string().trim().min(1, "请输入板块名称").max(30, "最多 30 个字符"),
  description: z.string().trim().max(200, "最多 200 个字符").optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const createPostSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(100, "标题最多 100 个字符"),
  content: z.any(), // Json from editor
  circleId: z.string().cuid().optional().nullable(),
  sectionId: z.string().cuid().optional().nullable(),
});

export const updatePostSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  content: z.any().optional(),
  sectionId: z.string().cuid().optional().nullable(),
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "请输入评论内容").max(5000, "评论最多 5000 个字符"),
  parentCommentId: z.string().cuid().optional().nullable(),
});

export const createCircleBanSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const feedQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  circleId: z.string().cuid().optional(),
  sectionId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
});
```

2. Add to `src/lib/types.ts`:

```typescript
// ===== Forum Types =====

export interface CircleItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  memberCount: number;
  postCount: number;
  createdAt: string;
}

export interface CircleDetail extends CircleItem {
  banner: string | null;
  creatorId: string;
  creator: { id: string; uid: number; name: string | null; image: string | null };
  isMember?: boolean;
  memberRole?: string | null;
}

export interface PostAuthor {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
}

export interface PostItem {
  id: string;
  title: string;
  contentPreview: string; // plain text truncated
  authorId: string;
  author: PostAuthor;
  circleId: string | null;
  circle: { id: string; name: string; slug: string } | null;
  sectionId: string | null;
  section: { id: string; name: string } | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  isLiked?: boolean;
  isBookmarked?: boolean;
  createdAt: string;
}

export interface PostDetail extends Omit<PostItem, "contentPreview"> {
  content: unknown; // Json from editor
  updatedAt: string;
}

export interface ForumComment {
  id: string;
  content: string;
  authorId: string;
  author: PostAuthor;
  parentCommentId: string | null;
  parentAuthor?: { id: string; name: string | null } | null;
  likeCount: number;
  isLiked?: boolean;
  createdAt: string;
}

export interface ForumCommentResponse {
  comments: ForumComment[];
  nextCursor: string | null;
}

export interface PostFeedResponse {
  posts: PostItem[];
  nextCursor: string | null;
}

export interface CircleListResponse {
  circles: CircleItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SectionItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface ForumNotificationItem {
  id: string;
  type: string;
  sourceUser: { id: string; uid: number; name: string | null; image: string | null };
  post: { id: string; title: string; circleId: string | null; circle: { slug: string } | null } | null;
  isRead: boolean;
  createdAt: string;
}
```

3. Run `pnpm tsc --noEmit`, `pnpm lint`.

4. Commit: `feat: add forum validation schemas and type definitions`

---

## Task 5: Circle API Routes

**Goal:** CRUD for circles + list/discover.

**Files:**
- Create: `src/app/api/circles/route.ts` — GET list, POST create
- Create: `src/app/api/circles/[id]/route.ts` — GET detail, PUT update, DELETE

**Steps:**

1. **`src/app/api/circles/route.ts`**:

   - `GET`: Public. Query params: `page`, `limit`, `search`. Return paginated `CircleItem[]`. Order by `memberCount DESC` (popular first). Include user's membership status if logged in.
   - `POST`: Auth required. Validate with `createCircleSchema`. Moderate name + description. Create Circle + CircleMembership (OWNER) in `$transaction`, increment `memberCount`. Return created circle.

2. **`src/app/api/circles/[id]/route.ts`**:

   - `GET`: Public. Lookup by `id` OR `slug` (check if param looks like a cuid, otherwise treat as slug). Return `CircleDetail` with creator info. Include `isMember` and `memberRole` if user is logged in.
   - `PUT`: Auth required, must be OWNER. Validate with `updateCircleSchema`. Moderate fields. Update circle.
   - `DELETE`: Auth required, must be OWNER or admin. Delete circle (cascades).

3. All routes: follow existing patterns — `requireActiveUser()`, try-catch, `logger.error()`, standard response format.

4. Run `pnpm tsc --noEmit`, `pnpm lint`.

5. Commit: `feat: add Circle API routes (CRUD + list)`

---

## Task 6: Circle Membership API Routes

**Goal:** Join/leave circle, role management.

**Files:**
- Create: `src/app/api/circles/[id]/members/route.ts` — GET list, POST join
- Create: `src/app/api/circles/[id]/members/[userId]/route.ts` — DELETE leave/kick, PATCH role

**Steps:**

1. **`GET /api/circles/[id]/members`**: Public. Paginated member list with user info and role. Order: OWNER first, then ADMIN, then MEMBER by joinedAt.

2. **`POST /api/circles/[id]/members`**: Auth required. Join circle. Check not banned (`CircleBan` with non-expired entry). Create CircleMembership (MEMBER) + increment `memberCount` in `$transaction`. Return 409 if already member.

3. **`DELETE /api/circles/[id]/members/[userId]`**: Auth required. If `userId` === self: leave (cannot leave if OWNER). If `userId` !== self: kick (requires OWNER/ADMIN, cannot kick OWNER). Decrement `memberCount` in `$transaction`.

4. **`PATCH /api/circles/[id]/members/[userId]`**: Auth required, OWNER only. Set role (ADMIN or MEMBER). Cannot change own role. Cannot have multiple OWNERs.

5. Run `pnpm tsc --noEmit`, `pnpm lint`.

6. Commit: `feat: add Circle membership API routes (join/leave/roles)`

---

## Task 7: Section API Routes

**Goal:** CRUD for circle sub-sections.

**Files:**
- Create: `src/app/api/circles/[id]/sections/route.ts` — GET list, POST create
- Create: `src/app/api/circles/[id]/sections/[sectionId]/route.ts` — PUT update, DELETE

**Steps:**

1. **`GET`**: Public. Return sections for circle, ordered by `sortOrder`.
2. **`POST`**: Auth required, OWNER or ADMIN. Validate with `createSectionSchema`. Create section.
3. **`PUT`**: Auth required, OWNER or ADMIN. Update name, description, sortOrder.
4. **`DELETE`**: Auth required, OWNER or ADMIN. Delete section (posts in section get `sectionId` set to null via `onDelete: SetNull`).

5. Run checks, commit: `feat: add Section API routes`

---

## Task 8: Post API Routes

**Goal:** Create, read, update, delete, pin posts. Feed endpoint.

**Files:**
- Create: `src/app/api/posts/route.ts` — GET feed, POST create
- Create: `src/app/api/posts/[id]/route.ts` — GET detail, PUT update, DELETE
- Create: `src/app/api/posts/[id]/pin/route.ts` — POST toggle pin

**Steps:**

1. **`GET /api/posts`** (Feed):
   - Query params via `feedQuerySchema`: `cursor`, `limit`, `circleId`, `sectionId`, `authorId`
   - Filter: `status: PUBLISHED`. If `circleId` provided, filter by circle. If no filter, return all (广场).
   - Cursor pagination: `WHERE (createdAt, id) < (cursorCreatedAt, cursorId)` using Prisma cursor.
   - Include author, circle (name, slug), section (name).
   - If user logged in: batch check `PostLike` and `Bookmark` for current user's liked/bookmarked status.
   - Generate `contentPreview`: extract plain text from Json content, truncate to 200 chars.
   - Return `PostFeedResponse` with `nextCursor`.

2. **`POST /api/posts`**:
   - Auth required. Validate with `createPostSchema`.
   - If `circleId` provided: verify user is a member of the circle and not banned.
   - Moderate title (and optionally extract text from content for moderation).
   - Create Post. If `circleId` provided, increment circle `postCount` in `$transaction`.
   - Return created post.

3. **`GET /api/posts/[id]`**:
   - Public. Return `PostDetail` with author, circle, section.
   - Increment `viewCount` (fire-and-forget, outside main query).
   - If user logged in: include `isLiked`, `isBookmarked`.

4. **`PUT /api/posts/[id]`**:
   - Auth required. Must be author, or circle OWNER/ADMIN, or site admin.
   - Validate with `updatePostSchema`. Moderate.

5. **`DELETE /api/posts/[id]`**:
   - Auth required. Must be author, or circle OWNER/ADMIN (for circle posts), or site admin (for all).
   - Set `status: DELETED`. Decrement circle `postCount` if applicable, in `$transaction`.

6. **`POST /api/posts/[id]/pin`**:
   - Auth required. Must be circle OWNER/ADMIN (for circle posts) or site admin (for 大别野 posts).
   - Toggle `isPinned`.

7. Run checks, commit: `feat: add Post API routes (CRUD + feed + pin)`

---

## Task 9: Forum Comment API Routes

**Goal:** Create, list, delete forum comments.

**Files:**
- Create: `src/app/api/posts/[id]/comments/route.ts` — GET list, POST create
- Create: `src/app/api/comments/[id]/route.ts` — DELETE

**Steps:**

1. **`GET /api/posts/[id]/comments`**:
   - Public. Cursor pagination by `(createdAt, id)`, limit default 30.
   - Flat list (not nested). Include author info.
   - If `parentCommentId` is set, include `parentAuthor` (name of the person being replied to).
   - If user logged in: batch check `CommentLike` for liked status.

2. **`POST /api/posts/[id]/comments`**:
   - Auth required. Validate with `createCommentSchema`.
   - If post belongs to a circle: verify user is member and not banned.
   - Moderate content.
   - Create Comment + increment Post `commentCount` in `$transaction`.
   - Create forum Notification:
     - If replying to another comment (`parentCommentId`): `COMMENT_REPLY` to parent comment author.
     - Otherwise: `POST_COMMENT` to post author.
     - Skip if author === recipient (don't notify self).

3. **`DELETE /api/comments/[id]`**:
   - Auth required. Must be author, or circle OWNER/ADMIN, or site admin.
   - Set `status: DELETED`. Decrement Post `commentCount` in `$transaction`.

4. Run checks, commit: `feat: add forum Comment API routes`

---

## Task 10: Like API Routes (PostLike + CommentLike)

**Goal:** Toggle like on posts and comments.

**Files:**
- Create: `src/app/api/posts/[id]/like/route.ts` — POST like, DELETE unlike
- Create: `src/app/api/comments/[id]/like/route.ts` — POST like, DELETE unlike

**Steps:**

1. **Post like** — follow exactly the pattern from `src/app/api/servers/[id]/favorite/route.ts`:
   - `POST`: Auth required. Create PostLike + increment Post `likeCount` in `$transaction`. Handle P2002 (already liked) gracefully.
   - `DELETE`: Auth required. Delete PostLike + decrement Post `likeCount` in `$transaction`. Handle not-found gracefully.
   - Return `{ liked: boolean, likeCount: number }`.

2. **Comment like** — same pattern:
   - `POST`/`DELETE`: Toggle CommentLike + update Comment `likeCount`.
   - Return `{ liked: boolean, likeCount: number }`.

3. Run checks, commit: `feat: add Like API routes (post + comment)`

---

## Task 11: Bookmark API Route

**Goal:** Toggle bookmark on posts.

**Files:**
- Create: `src/app/api/posts/[id]/bookmark/route.ts` — POST bookmark, DELETE unbookmark

**Steps:**

1. Same toggle pattern as likes/favorites:
   - `POST`: Create Bookmark. Handle P2002.
   - `DELETE`: Delete Bookmark. Handle not-found.
   - Return `{ bookmarked: boolean }`.

2. Run checks, commit: `feat: add Bookmark API route`

---

## Task 12: Circle Ban API Routes

**Goal:** Ban/unban users in a circle.

**Files:**
- Create: `src/app/api/circles/[id]/bans/route.ts` — GET list, POST ban
- Create: `src/app/api/circles/[id]/bans/[userId]/route.ts` — DELETE unban

**Steps:**

1. **`GET`**: Auth required, OWNER/ADMIN. Paginated list of bans with user info.
2. **`POST`**: Auth required, OWNER/ADMIN. Validate with `createCircleBanSchema`. Cannot ban OWNER. Create CircleBan. Also remove CircleMembership if exists + decrement `memberCount` in `$transaction`.
3. **`DELETE /bans/[userId]`**: Auth required, OWNER/ADMIN. Delete CircleBan.

4. Run checks, commit: `feat: add CircleBan API routes`

---

## Task 13: Forum Notification API Routes + NotificationBell Integration

**Goal:** List forum notifications, mark as read, integrate with existing NotificationBell.

**Files:**
- Create: `src/app/api/forum/notifications/route.ts` — GET list
- Create: `src/app/api/forum/notifications/read/route.ts` — POST mark read
- Modify: `src/components/NotificationBell.tsx` — merge forum + server notification counts

**Steps:**

1. **`GET /api/forum/notifications`**: Auth required. Paginated list of user's forum notifications. Include sourceUser, post info. Order by createdAt DESC.

2. **`POST /api/forum/notifications/read`**: Auth required. Body: `{ ids: string[] }` or `{ all: true }`. Mark as read.

3. **NotificationBell integration**: Fetch both server notification unread count AND forum notification unread count. Display combined count. Dropdown shows both types with visual distinction.

4. Run checks, commit: `feat: add forum notification API routes and integrate with NotificationBell`

---

## Task 14: PostCard Component

**Goal:** Reusable post card for feed display.

**Files:**
- Create: `src/components/forum/PostCard.tsx`

**Steps:**

1. Build `PostCard` component following `ServerCard` patterns:
   - Props: `post: PostItem`, `onLikeChange?: callback`
   - Display: author avatar + name + relative time, circle tag (or "广场"), title, content preview, stats bar (likes/comments/views/bookmark)
   - Click → navigate to post detail
   - Like button: optimistic toggle (follow `FavoriteButton` pattern)
   - Bookmark button: optimistic toggle
   - Pinned indicator if `isPinned`

2. Styling: warm theme, `rounded-xl`, `border-warm-200`, consistent with existing cards.

3. Run checks, commit: `feat: add PostCard component`

---

## Task 15: CircleCard Component

**Goal:** Reusable circle card for explore page and sidebars.

**Files:**
- Create: `src/components/forum/CircleCard.tsx`

**Steps:**

1. Build `CircleCard`:
   - Props: `circle: CircleItem`, `isMember?: boolean`, `onJoinChange?: callback`
   - Display: icon, name, description (truncated), member count, post count
   - Join/Joined button with optimistic toggle
   - Click → navigate to `/c/:slug`

2. Run checks, commit: `feat: add CircleCard component`

---

## Task 16: Forum Comment Section Component

**Goal:** Comment list + compose for post detail page.

**Files:**
- Create: `src/components/forum/ForumCommentSection.tsx`
- Create: `src/components/forum/ForumCommentItem.tsx`

**Steps:**

1. **`ForumCommentItem`**: Single comment display.
   - Author avatar + name + relative time
   - If reply: "回复 @parentAuthorName" prefix
   - Content text
   - Like button (optimistic toggle)
   - Reply button → opens inline reply input
   - Delete button (if author or admin)

2. **`ForumCommentSection`**: Comment list + compose.
   - Top-level comment input (requires login, requires circle membership if circle post)
   - Flat comment list with cursor pagination ("加载更多")
   - Follow existing `CommentSection.tsx` patterns for state management

3. Run checks, commit: `feat: add forum comment components`

---

## Task 17: Homepage — Feed Page

**Goal:** Replace current homepage with post feed (广场).

**Files:**
- Create: `src/components/forum/FeedPage.tsx` — client component
- Modify: `src/app/page.tsx` — render FeedPage
- Keep: `src/components/HomePageClient.tsx` — will be reused at `/servers`

**Steps:**

1. **`FeedPage`** client component:
   - Fetch `GET /api/posts` with cursor pagination
   - Infinite scroll or "加载更多" button
   - PostCard list
   - Right sidebar (desktop): hot circles list + "我的圈子" (if logged in)
   - Mobile: sidebar content as horizontal scroll above feed
   - Empty state when no posts

2. **`src/app/page.tsx`**: Replace current content. Render `<FeedPage />`. Add `export const dynamic = "force-dynamic"`.

3. Run checks, commit: `feat: replace homepage with forum feed (大别野广场)`

---

## Task 18: Servers Page — Move Existing Homepage

**Goal:** Move current server list to `/servers` (it may already exist there — verify and ensure it works standalone).

**Files:**
- Modify: `src/app/servers/page.tsx` — ensure it renders the server list (may already work)

**Steps:**

1. Check if `/servers` page already exists and shows the server list. If yes, verify it works independently from the old homepage.

2. If `/servers/page.tsx` delegates to `HomePageClient`, it should already work. If it has a different implementation, ensure the full server browse experience is preserved.

3. Run checks, commit: `refactor: ensure /servers page works standalone`

---

## Task 19: Explore Page (圈子发现)

**Goal:** Page to discover and search circles.

**Files:**
- Create: `src/app/explore/page.tsx`
- Create: `src/components/forum/ExplorePage.tsx` — client component

**Steps:**

1. **`ExplorePage`** client component:
   - Search bar (by circle name)
   - Grid of CircleCards, paginated
   - "创建圈子" button (top right, requires login)
   - Sort: by memberCount (popular) or createdAt (newest)

2. **`src/app/explore/page.tsx`**: Metadata + render `<ExplorePage />`.

3. Run checks, commit: `feat: add circle explore page`

---

## Task 20: Create Circle Page

**Goal:** Form to create a new circle.

**Files:**
- Create: `src/app/circles/create/page.tsx`
- Create: `src/components/forum/CreateCircleForm.tsx`

**Steps:**

1. **`CreateCircleForm`** client component:
   - Fields: name, slug (auto-generate from name, editable), description
   - Icon upload (reuse existing `ImageUpload` component with 1:1 crop)
   - Slug validation (real-time uniqueness check via API)
   - Submit → `POST /api/circles` → redirect to `/c/:slug`

2. **Page**: Auth guard (redirect to login if not authenticated).

3. Run checks, commit: `feat: add create circle page`

---

## Task 21: Circle Page (`/c/:slug`)

**Goal:** Circle homepage showing info + feed + sections.

**Files:**
- Create: `src/app/c/[slug]/page.tsx`
- Create: `src/app/c/[slug]/layout.tsx`
- Create: `src/components/forum/CirclePage.tsx`

**Steps:**

1. **`layout.tsx`**: Fetch circle detail by slug via API or server-side Prisma query. Pass to children. `export const dynamic = "force-dynamic"`.

2. **`CirclePage`** client component:
   - Header: banner, icon, name, description, member count, join button
   - Section tabs: "全部" + each section name
   - Post feed filtered by circle (and optionally section), cursor pagination
   - PostCards list
   - Right sidebar: circle info, management link (OWNER/ADMIN), member list preview

3. Run checks, commit: `feat: add circle page`

---

## Task 22: Post Creation Page

**Goal:** Page to create a new post.

**Files:**
- Create: `src/app/c/[slug]/new/page.tsx` — create post in a circle
- Create: `src/app/new/page.tsx` — create post to 广场 (大别野)
- Create: `src/components/forum/CreatePostForm.tsx`

**Steps:**

1. **`CreatePostForm`** client component:
   - Props: `circleId?: string`, `circleName?: string`, `sections?: SectionItem[]`
   - Fields: title, content (reuse `MarkdownEditor`), section select (if in circle)
   - Submit → `POST /api/posts` → redirect to post detail
   - If no `circleId` prop: show circle selector dropdown or "发到广场"

2. **`/c/[slug]/new/page.tsx`**: Auth guard. Fetch circle + sections. Must be member.
3. **`/new/page.tsx`**: Auth guard. Create post form with circle selection or 大别野.

3. Run checks, commit: `feat: add post creation pages`

---

## Task 23: Post Detail Page

**Goal:** View a post with its comments.

**Files:**
- Create: `src/app/c/[slug]/post/[postId]/page.tsx` — circle post
- Create: `src/app/post/[postId]/page.tsx` — 大别野 post
- Create: `src/components/forum/PostDetailPage.tsx`

**Steps:**

1. **`PostDetailPage`** client component:
   - Fetch post detail from `GET /api/posts/[id]`
   - Display: author info, time, circle link (or "广场"), title, rendered content (via `MarkdownRenderer`)
   - Action bar: like, bookmark, share
   - Admin actions (OWNER/ADMIN/site-admin): pin, hide, delete
   - Forum comment section below

2. **Circle post page**: Fetch by postId, verify it belongs to this circle slug.
3. **大别野 post page**: Fetch by postId, verify `circleId` is null.

3. Run checks, commit: `feat: add post detail pages`

---

## Task 24: Circle Settings Page (圈主管理)

**Goal:** Management panel for circle OWNER/ADMIN.

**Files:**
- Create: `src/app/c/[slug]/settings/page.tsx`
- Create: `src/components/forum/CircleSettings.tsx`
- Create: `src/components/forum/CircleMemberManager.tsx`
- Create: `src/components/forum/CircleSectionManager.tsx`
- Create: `src/components/forum/CircleBanManager.tsx`

**Steps:**

1. **`CircleSettings`**: Tab layout (similar to existing console settings):
   - **基本信息** (OWNER only): Edit name, description, icon, banner
   - **子板块管理** (OWNER/ADMIN): List sections, create/edit/delete/reorder
   - **成员管理** (OWNER/ADMIN): List members, kick, change roles (OWNER only for role changes)
   - **禁言管理** (OWNER/ADMIN): List bans, add/remove bans

2. **`CircleMemberManager`**: Table of members with role badges, action buttons. Follow existing `MemberList` component patterns.

3. **`CircleSectionManager`**: Draggable list or simple list with move up/down, add/edit/delete.

4. **`CircleBanManager`**: List of banned users with reason, expiry, unban button.

5. Page: Auth guard, must be OWNER or ADMIN.

6. Run checks, commit: `feat: add circle settings page`

---

## Task 25: User Profile Page (`/u/:uid`)

**Goal:** Public user profile showing posts and circles.

**Files:**
- Create: `src/app/u/[uid]/page.tsx`
- Create: `src/components/forum/UserProfilePage.tsx`

**Steps:**

1. **`UserProfilePage`** client component:
   - Header: avatar, name, bio, join date
   - Tabs: "帖子" (user's posts feed) / "圈子" (circles user has joined)
   - Posts tab: fetch `GET /api/posts?authorId=xxx`, cursor pagination
   - Circles tab: fetch user's CircleMemberships, display CircleCards

2. **Page**: Lookup user by UID (numeric). 404 if not found.

3. Run checks, commit: `feat: add user profile page`

---

## Task 26: Navigation Bar Update

**Goal:** Update top navigation to include forum entries.

**Files:**
- Modify: `src/app/layout.tsx` — update nav links
- Possibly modify: `src/components/Navbar.tsx` or equivalent nav component

**Steps:**

1. Update navigation items:
   - Logo → `/`
   - 广场 → `/` (active when on homepage)
   - 探索 → `/explore`
   - 服务器 → `/servers`
   - 更新日志 → `/changelog`
   - Add "发帖" button (right side, accent color) → `/new`
   - User menu: add "我的主页" → `/u/:uid`

2. Ensure active state highlighting works for new routes.

3. Run checks, commit: `feat: update navigation bar for forum module`

---

## Task 27: Final Integration Check

**Goal:** Verify everything works together.

**Steps:**

1. Run `pnpm db:generate` to ensure Prisma client is up to date.
2. Run `pnpm tsc --noEmit` — fix any remaining type errors.
3. Run `pnpm lint` — fix any lint issues.
4. Run `pnpm build` — verify production build succeeds.
5. Manual smoke test: start `pnpm dev`, test the full flow:
   - Visit homepage (should be feed)
   - Visit `/servers` (should be server list)
   - Visit `/explore` (should show circles)
   - Create a circle
   - Create a post in circle
   - Create a 大别野 post
   - Comment on a post
   - Like/bookmark
   - Circle settings
   - User profile

6. Commit any final fixes: `fix: integration fixes for forum module`

---

## Execution Notes

- Tasks 1-3 are **sequential** (schema changes must come first).
- Tasks 4-13 (API routes) can be **parallelized in groups** but each should be committed separately.
- Tasks 14-16 (components) depend on API routes being done.
- Tasks 17-26 (pages) depend on both API routes and components.
- Task 27 is the final checkpoint.
- Every task must end with `pnpm tsc --noEmit` + `pnpm lint` passing.
- Follow existing codebase patterns exactly — check reference files listed at the top.
