# Server-Only Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the circle/feed/forum system and its database tables while restoring Pudcraft Community to a server-only product that keeps server comments, server notifications, server search, and server favorites.

**Architecture:** Treat `pr33`-era behavior as the product target, but perform a surgical rollback on the current codebase instead of a git revert. First collapse shared shell state back to server-only behavior, then delete forum routes/components/APIs, then drop the forum Prisma models and tables while protecting `comments` and `notifications` (`ServerComment` and `ServerNotification`).

**Tech Stack:** Next.js App Router, React 19, TypeScript 5, Tailwind CSS 3, Prisma ORM, PostgreSQL, `node:test` via `tsx --test`

---

## File Map

**Create:**
- `src/lib/serverListPage.ts` — shared parsing + data-loading helper for server list pages (`/` and `/servers`)
- `src/lib/serverListPage.test.ts` — `node:test` coverage for query normalization and URL building
- `prisma/migrations/*_remove_forum_module/migration.sql` — generated migration that drops forum tables and enums only

**Modify:**
- `src/components/HomePageClient.tsx` — make the server list client reusable from both `/` and `/servers` without forcing the URL to `/servers`
- `src/app/page.tsx` — stop rendering forum feed, render server landing page instead
- `src/app/servers/page.tsx` — delegate to shared server list helper
- `src/app/search/page.tsx` — keep route, redirect or funnel query into server search only
- `src/app/favorites/page.tsx` — remove post bookmarks tab, keep server favorites only
- `src/app/notifications/page.tsx` — server notifications only
- `src/components/Providers.tsx` — remove `ComposeProvider`
- `src/components/AuthButtons.tsx` — remove forum navigation; keep the `/u/:uid` user menu entry
- `src/app/u/[uid]/page.tsx` — reframe as a general user profile page: drop forum surfaces (joined circles, post history, bookmarks) and instead show the user's owned/approved servers and basic profile. Keep the route as every site needs a user profile page.
- `src/components/NotificationBell.tsx` — remove forum tab + forum fetches
- `src/lib/mobile/inboxFacade.ts` — collapse merged forum/server inbox into server-only inbox
- `src/lib/mobile/inboxFacade.test.ts` — update tests for server-only inbox semantics
- `src/app/api/mobile/inbox/route.ts` — remove forum query path
- `src/app/api/mobile/inbox/unread-summary/route.ts` — remove forum unread count query
- `src/app/api/mobile/inbox/read/route.ts` — remove forum mark-read query
- `src/lib/types.ts` — remove forum DTOs and keep server DTOs only
- `src/lib/validation.ts` — remove post/circle/tag/forum notification schemas that are no longer used
- `prisma/schema.prisma` — remove forum enums, models, and relations from `User`/`Server`

**Delete:**
- `src/components/forum/` — delete the entire directory
- `src/app/explore/page.tsx`
- `src/app/new/page.tsx`
- `src/app/post/[postId]/page.tsx`
- `src/app/c/[slug]/layout.tsx`
- `src/app/c/[slug]/page.tsx`
- `src/app/c/[slug]/new/page.tsx`
- `src/app/c/[slug]/post/[postId]/page.tsx`
- `src/app/c/[slug]/settings/page.tsx`
- `src/app/user/[id]/page.tsx` — legacy `/user/:id` route, replaced by `/u/:uid`
- `src/app/circles/create/page.tsx`
- `src/app/api/forum/notifications/route.ts`
- `src/app/api/forum/notifications/read/route.ts`
- `src/app/api/forum/notifications/unread-count/route.ts`
- `src/app/api/posts/route.ts`
- `src/app/api/posts/[id]/route.ts`
- `src/app/api/posts/[id]/comments/route.ts`
- `src/app/api/posts/[id]/like/route.ts`
- `src/app/api/posts/[id]/bookmark/route.ts`
- `src/app/api/comments/[id]/route.ts`
- `src/app/api/comments/[id]/like/route.ts`
- `src/app/api/tags/search/route.ts`
- `src/app/api/users/search/route.ts`
- `src/app/api/users/[id]/circles/route.ts`
- `src/app/api/user/bookmarks/route.ts`
- `src/lib/forum-ui-state.ts`
- `src/lib/forum-ui-state.test.ts`
- `src/lib/mentions.ts`
- `src/lib/validation-circle-image.test.ts`

### Task 1: Extract a reusable server list page helper

**Files:**
- Create: `src/lib/serverListPage.ts`
- Create: `src/lib/serverListPage.test.ts`
- Modify: `src/components/HomePageClient.tsx`
- Modify: `src/app/servers/page.tsx`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildServerListPath, parseServerListQuery } from "@/lib/serverListPage";

test("parseServerListQuery normalizes invalid values to server defaults", () => {
  const parsed = parseServerListQuery({
    page: "0",
    sort: "bogus",
    tag: ["生存"],
    search: ["  vanilla  "],
  });

  assert.deepEqual(parsed, {
    page: 1,
    sort: "newest",
    tag: "生存",
    search: "vanilla",
  });
});

test("buildServerListPath preserves valid server filters", () => {
  assert.equal(
    buildServerListPath({ page: 3, sort: "popular", tag: "RPG", search: "fabric" }),
    "/servers?tag=RPG&search=fabric&sort=popular&page=3",
  );
});
```

- [ ] **Step 2: Run the new test file and confirm it fails because the helper does not exist yet**

Run: `pnpm tsx --test src/lib/serverListPage.test.ts`
Expected: FAIL with `Cannot find module '@/lib/serverListPage'` or missing export errors.

- [ ] **Step 3: Implement the helper with the existing `/servers` query behavior**

```ts
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { buildServerStatusResponse } from "@/lib/serverStatus";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";
import type { ServerSort } from "@/components/SortButtons";

const DEFAULT_LIMIT = 12;
const DEFAULT_SORT: ServerSort = "newest";
const SORT_SET = new Set<ServerSort>(["newest", "popular", "players", "name"]);

export interface ServerListPageQuery {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

export function parseServerListQuery(raw: Record<string, string | string[] | undefined>): ServerListPageQuery {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const rawPage = Number(first(raw.page));
  const rawSort = first(raw.sort);

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    sort: SORT_SET.has(rawSort as ServerSort) ? (rawSort as ServerSort) : DEFAULT_SORT,
    tag: first(raw.tag).trim(),
    search: first(raw.search).trim(),
  };
}

export function buildServerListPath(query: ServerListPageQuery): string {
  const params = new URLSearchParams();
  if (query.tag) params.set("tag", query.tag);
  if (query.search) params.set("search", query.search);
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  return params.size > 0 ? `/servers?${params.toString()}` : "/servers";
}

export async function loadServerListPageData(query: ServerListPageQuery): Promise<{
  servers: ServerListItem[];
  totalPages: number;
}> {
  const where: Prisma.ServerWhereInput = {
    status: "approved",
    NOT: { visibility: "private", discoverable: false },
  };

  if (query.tag) {
    where.tags = { has: query.tag };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, servers] = await Promise.all([
    prisma.server.count({ where }),
    prisma.server.findMany({
      where,
      skip: (query.page - 1) * DEFAULT_LIMIT,
      take: DEFAULT_LIMIT,
      orderBy: [
        { isOnline: "desc" },
        query.sort === "popular"
          ? { favoriteCount: "desc" }
          : query.sort === "players"
            ? { playerCount: "desc" }
            : query.sort === "name"
              ? { name: "asc" }
              : { createdAt: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        psid: true,
        name: true,
        host: true,
        port: true,
        description: true,
        tags: true,
        iconUrl: true,
        favoriteCount: true,
        isVerified: true,
        verifiedAt: true,
        isOnline: true,
        playerCount: true,
        maxPlayers: true,
        lastPingedAt: true,
        updatedAt: true,
        visibility: true,
      },
    }),
  ]);

  return {
    servers: servers.map((server) => ({
      id: server.id,
      psid: server.psid,
      name: server.name,
      host: server.visibility === "public" ? server.host : "hidden",
      port: server.visibility === "public" ? server.port : 0,
      description: server.description,
      tags: server.tags,
      iconUrl: getPublicUrl(server.iconUrl),
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      status: buildServerStatusResponse(server),
    })),
    totalPages: Math.max(1, Math.ceil(total / DEFAULT_LIMIT)),
  };
}
```

- [ ] **Step 4: Make `HomePageClient` accept a configurable base path and update `/servers` to use the helper**

```ts
// src/components/HomePageClient.tsx
interface HomePageClientProps {
  initialServers: ServerListItem[];
  initialPage: number;
  initialSort: ServerSort;
  initialTag: string;
  initialSearch: string;
  initialTotalPages: number;
  basePath?: "/" | "/servers";
}

function buildUrl(query: QueryState, basePath: "/" | "/servers"): string {
  const params = new URLSearchParams();
  if (query.tag) params.set("tag", query.tag);
  if (query.search) params.set("search", query.search);
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

import { HomePageClient } from "@/components/HomePageClient";
import { loadServerListPageData, parseServerListQuery } from "@/lib/serverListPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "服务器列表",
  description: "浏览国内优质 Minecraft 私人服务器，找到适合你的社区。",
};

interface ServersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const query = parseServerListQuery(await searchParams);
  const { servers, totalPages } = await loadServerListPageData(query).catch(() => ({
    servers: [],
    totalPages: 1,
  }));

  return (
    <HomePageClient
      initialServers={servers}
      initialPage={query.page}
      initialSort={query.sort}
      initialTag={query.tag}
      initialSearch={query.search}
      initialTotalPages={totalPages}
      basePath="/servers"
    />
  );
}
```

- [ ] **Step 5: Re-run the helper tests and targeted lint**

Run: `pnpm tsx --test src/lib/serverListPage.test.ts && pnpm lint src/lib/serverListPage.ts src/components/HomePageClient.tsx src/app/servers/page.tsx`
Expected: PASS, then ESLint exits with code `0`.

- [ ] **Step 6: Commit the shared server list helper**

```bash
git add src/lib/serverListPage.ts src/lib/serverListPage.test.ts src/components/HomePageClient.tsx src/app/servers/page.tsx
git commit -m "refactor: extract server list page helper"
```

### Task 2: Restore `/` and `/search` to server-only entry points

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/search/page.tsx`
- Modify: `src/lib/serverListPage.test.ts`

- [ ] **Step 1: Extend the helper test with the `/search` redirect contract**

```ts
test("buildServerListPath drops default values for a clean redirect URL", () => {
  assert.equal(
    buildServerListPath({ page: 1, sort: "newest", tag: "", search: "modpack" }),
    "/servers?search=modpack",
  );
});
```

- [ ] **Step 2: Run the helper test file again and confirm the new assertion fails before the route update**

Run: `pnpm tsx --test src/lib/serverListPage.test.ts`
Expected: FAIL if the URL builder still includes defaults or inconsistent ordering.

- [ ] **Step 3: Replace the forum feed homepage with the shared server list page**

```ts
import { HomePageClient } from "@/components/HomePageClient";
import { loadServerListPageData, parseServerListQuery } from "@/lib/serverListPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PudCraft Community",
  description: "发现优质 Minecraft 服务器，找到适合你的社区。",
};

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = parseServerListQuery(await searchParams);
  const { servers, totalPages } = await loadServerListPageData(query).catch(() => ({
    servers: [],
    totalPages: 1,
  }));

  return (
    <HomePageClient
      initialServers={servers}
      initialPage={query.page}
      initialSort={query.sort}
      initialTag={query.tag}
      initialSearch={query.search}
      initialTotalPages={totalPages}
      basePath="/"
    />
  );
}
```

Also update the existing homepage JSON-LD (or remove it if unnecessary) so it describes server discovery rather than the removed forum feed.

- [ ] **Step 4: Keep `/search` alive by redirecting it into `/servers` with the same query string**

```ts
import { redirect } from "next/navigation";

import { buildServerListPath, parseServerListQuery } from "@/lib/serverListPage";

interface SearchPageRouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPageRoute({ searchParams }: SearchPageRouteProps) {
  const query = parseServerListQuery(await searchParams);
  redirect(buildServerListPath(query));
}
```

- [ ] **Step 5: Re-run helper tests and lint the two routes**

Run: `pnpm tsx --test src/lib/serverListPage.test.ts && pnpm lint src/app/page.tsx src/app/search/page.tsx`
Expected: PASS, then ESLint exits with code `0`.

- [ ] **Step 6: Commit the server-only entry-point rollback**

```bash
git add src/app/page.tsx src/app/search/page.tsx src/lib/serverListPage.test.ts
git commit -m "refactor: restore server-only landing routes"
```

### Task 3: Collapse global shell, bell, and mobile inbox back to server-only notifications

**Files:**
- Modify: `src/components/Providers.tsx`
- Modify: `src/components/AuthButtons.tsx`
- Modify: `src/components/NotificationBell.tsx`
- Modify: `src/app/notifications/page.tsx`
- Modify: `src/lib/mobile/inboxFacade.ts`
- Modify: `src/lib/mobile/inboxFacade.test.ts`
- Modify: `src/app/api/mobile/inbox/route.ts`
- Modify: `src/app/api/mobile/inbox/unread-summary/route.ts`
- Modify: `src/app/api/mobile/inbox/read/route.ts`

- [ ] **Step 1: Rewrite the mobile inbox tests to assert a server-only contract**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildMobileInboxUnreadSummary, handleMobileInboxGet } from "./inboxFacade";

test("buildMobileInboxUnreadSummary zeros forum counts after forum removal", () => {
  assert.deepEqual(buildMobileInboxUnreadSummary(7), {
    serverUnread: 7,
    forumUnread: 0,
    unreadCount: 7,
  });
});

test("handleMobileInboxGet returns only server notifications", async () => {
  const response = await handleMobileInboxGet(new Request("https://example.com/api/mobile/inbox?page=1&limit=20"), {
    requireActiveUserImpl: async () => ({ user: { id: "user-1" } }),
    loadInboxData: async () => ({
      serverTotal: 1,
      serverUnread: 1,
      serverNotifications: [
        {
          id: "server-1",
          title: "你的服务器有新回复",
          message: "点击查看评论",
          link: "/servers/123456",
          readAt: null,
          createdAt: new Date("2026-04-14T09:00:00.000Z"),
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    notifications: [
      {
        id: "server-1",
        kind: "server",
        title: "你的服务器有新回复",
        body: "点击查看评论",
        destination: "/servers/123456",
        read: false,
        createdAt: "2026-04-14T09:00:00.000Z",
      },
    ],
    total: 1,
    unreadCount: 1,
    serverUnread: 1,
    forumUnread: 0,
    page: 1,
    totalPages: 1,
  });
});
```

- [ ] **Step 2: Run the mobile inbox tests and confirm they fail against the merged forum/server implementation**

Run: `pnpm tsx --test src/lib/mobile/inboxFacade.test.ts`
Expected: FAIL because `buildMobileInboxUnreadSummary` still expects two inputs and `handleMobileInboxGet` still merges forum notifications.

- [ ] **Step 3: Refactor the global providers and top navigation to stop importing forum UI**

```tsx
// src/components/Providers.tsx
export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <ToastProvider>{children}</ToastProvider>
      </ConfirmProvider>
    </SessionProvider>
  );
}

// src/components/AuthButtons.tsx
const PRIMARY_LINKS = [
  { href: "/", label: "首页" },
  { href: "/servers", label: "服务器" },
  { href: "/changelog", label: "更新日志" },
] as const;

// remove Link href={`/u/${session.user.uid}`} and keep only /user/:uid
```

- [ ] **Step 4: Strip forum state and forum fetches from the bell, inbox facade, and mobile inbox APIs**

```ts
// src/lib/mobile/inboxFacade.ts
export interface MobileInboxData {
  serverTotal: number;
  serverUnread: number;
  serverNotifications: ServerInboxNotificationRecord[];
}

export function buildMobileInboxUnreadSummary(serverUnread: number) {
  return {
    serverUnread,
    forumUnread: 0,
    unreadCount: serverUnread,
  };
}

export async function handleMobileInboxGet(request: Request, deps: MobileInboxGetDependencies) {
  // keep auth + pagination validation
  const merged = inboxData.serverNotifications.map((notification) => ({
    id: notification.id,
    kind: "server" as const,
    title: notification.title,
    body: notification.message,
    destination: notification.link,
    read: notification.readAt !== null,
    createdAt: notification.createdAt.toISOString(),
  }));

  return NextResponse.json({
    notifications: merged.slice((page - 1) * limit, page * limit),
    total: inboxData.serverTotal,
    ...buildMobileInboxUnreadSummary(inboxData.serverUnread),
    page,
    totalPages: getMobileInboxTotalPages(inboxData.serverTotal, limit, maxMergedFetchWindow),
  });
}

// src/components/NotificationBell.tsx
const [unreadCount, setUnreadCount] = useState(0);
const [notifications, setNotifications] = useState<NotificationItem[]>([]);
// remove ActiveTab, forum state, forum fetches, and forum mark-all-read handlers
```

- [ ] **Step 5: Keep the notifications center page server-only and refresh text copy**

```tsx
<EmptyState
  title="暂无通知"
  description="当有人回复你的服务器评论、你的服务器通过审核，或你收藏的服务器上线时，会显示在这里"
/>
```

- [ ] **Step 6: Re-run the mobile inbox tests and lint all notification-shell files**

Run: `pnpm tsx --test src/lib/mobile/inboxFacade.test.ts && pnpm lint src/components/Providers.tsx src/components/AuthButtons.tsx src/components/NotificationBell.tsx src/app/notifications/page.tsx src/lib/mobile/inboxFacade.ts src/app/api/mobile/inbox/route.ts src/app/api/mobile/inbox/unread-summary/route.ts src/app/api/mobile/inbox/read/route.ts`
Expected: PASS, then ESLint exits with code `0`.

- [ ] **Step 7: Commit the server-only shell rollback**

```bash
git add src/components/Providers.tsx src/components/AuthButtons.tsx src/components/NotificationBell.tsx src/app/notifications/page.tsx src/lib/mobile/inboxFacade.ts src/lib/mobile/inboxFacade.test.ts src/app/api/mobile/inbox/route.ts src/app/api/mobile/inbox/unread-summary/route.ts src/app/api/mobile/inbox/read/route.ts
git commit -m "refactor: remove forum notification shell"
```

### Task 4: Convert `/favorites` into a pure server favorites page

**Files:**
- Modify: `src/app/favorites/page.tsx`
- Delete: `src/app/api/user/bookmarks/route.ts`

- [ ] **Step 1: Remove the post bookmarks tab and its fetch path from the page component**

```tsx
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { ServerCard } from "@/components/ServerCard";

import type { ServerListItem } from "@/lib/types";

export default function FavoritesPage() {
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [serversLoading, setServersLoading] = useState(true);

  useEffect(() => {
    async function fetchServers() {
      const res = await fetch("/api/user/favorites");
      const json = (await res.json()) as { data: ServerListItem[] };
      setServers(json.data ?? []);
      setServersLoading(false);
    }

    void fetchServers();
  }, []);

  if (serversLoading) {
    return <PageLoading />;
  }

  return servers.length === 0 ? (
    <EmptyState
      title="暂无收藏的服务器"
      description="浏览服务器列表，点击星标收藏"
      action={{ label: "去发现服务器", href: "/servers" }}
    />
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => (
        <ServerCard key={server.id} server={server} initialFavorited />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Delete the bookmarks API that only serves forum posts**

```bash
rm src/app/api/user/bookmarks/route.ts
```

- [ ] **Step 3: Lint the favorites page after the forum imports are gone**

Run: `pnpm lint src/app/favorites/page.tsx`
Expected: PASS with no `PostCard` or `PostItem` import remaining.

- [ ] **Step 4: Commit the favorites rollback**

```bash
git add src/app/favorites/page.tsx src/app/api/user/bookmarks/route.ts
git commit -m "refactor: keep only server favorites"
```

### Task 5: Delete forum routes, components, APIs, and dead shared types

**Files:**
- Delete: `src/components/forum/`
- Delete: `src/app/explore/page.tsx`
- Delete: `src/app/new/page.tsx`
- Delete: `src/app/post/[postId]/page.tsx`
- Delete: `src/app/c/[slug]/layout.tsx`
- Delete: `src/app/c/[slug]/page.tsx`
- Delete: `src/app/c/[slug]/new/page.tsx`
- Delete: `src/app/c/[slug]/post/[postId]/page.tsx`
- Delete: `src/app/c/[slug]/settings/page.tsx`
- Delete: `src/app/u/[uid]/page.tsx`
- Delete: `src/app/circles/create/page.tsx`
- Delete: `src/app/api/forum/notifications/route.ts`
- Delete: `src/app/api/forum/notifications/read/route.ts`
- Delete: `src/app/api/forum/notifications/unread-count/route.ts`
- Delete: `src/app/api/posts/route.ts`
- Delete: `src/app/api/posts/[id]/route.ts`
- Delete: `src/app/api/posts/[id]/comments/route.ts`
- Delete: `src/app/api/posts/[id]/like/route.ts`
- Delete: `src/app/api/posts/[id]/bookmark/route.ts`
- Delete: `src/app/api/comments/[id]/route.ts`
- Delete: `src/app/api/comments/[id]/like/route.ts`
- Delete: `src/app/api/tags/search/route.ts`
- Delete: `src/app/api/users/search/route.ts`
- Delete: `src/app/api/users/[id]/circles/route.ts`
- Delete: `src/lib/forum-ui-state.ts`
- Delete: `src/lib/forum-ui-state.test.ts`
- Delete: `src/lib/mentions.ts`
- Delete: `src/lib/validation-circle-image.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Delete the forum pages, components, and API route trees in one sweep**

```bash
rm -rf src/components/forum \
  src/app/explore/page.tsx \
  src/app/new/page.tsx \
  src/app/post/[postId]/page.tsx \
  src/app/c/[slug] \
  src/app/u/[uid]/page.tsx \
  src/app/circles/create/page.tsx \
  src/app/api/forum/notifications \
  src/app/api/posts \
  src/app/api/comments/[id] \
  src/app/api/tags/search/route.ts \
  src/app/api/users/search/route.ts \
  src/app/api/users/[id]/circles/route.ts \
  src/lib/forum-ui-state.ts \
  src/lib/forum-ui-state.test.ts \
  src/lib/mentions.ts \
  src/lib/validation-circle-image.test.ts
```

- [ ] **Step 2: Remove forum DTOs from `src/lib/types.ts` while keeping all server DTOs intact**

```ts
// Keep:
export interface ServerListItem { /* existing server fields */ }
export interface ServerComment { /* existing server fields */ }
export interface NotificationItem { /* existing server notification fields */ }

// Delete:
// export interface CircleItem { ... }
// export interface CircleDetail { ... }
// export interface PostItem { ... }
// export interface ForumComment { ... }
// export interface ForumNotificationItem { ... }
```

- [ ] **Step 3: Prune forum-only Zod schemas and validation helpers**

```ts
// Remove forum-only exports such as:
// createCircleSchema
// updateCircleSchema
// createPostSchema
// createForumCommentSchema
// markForumNotificationsReadSchema
// tag-search-specific query schemas
```

- [ ] **Step 4: Run full-project lint once the forum tree is gone and fix any dead imports that surface**

Run: `pnpm lint`
Expected: PASS after removing any leftover `@/components/forum/*`, `PostItem`, `ForumNotificationItem`, or deleted route imports.

- [ ] **Step 5: Commit the forum code deletion**

```bash
git add src/components/forum src/app/explore/page.tsx src/app/new/page.tsx src/app/post/[postId]/page.tsx src/app/c src/app/u/[uid]/page.tsx src/app/circles/create/page.tsx src/app/api/forum/notifications src/app/api/posts src/app/api/comments/[id] src/app/api/tags/search/route.ts src/app/api/users/search/route.ts src/app/api/users/[id]/circles/route.ts src/lib/forum-ui-state.ts src/lib/forum-ui-state.test.ts src/lib/mentions.ts src/lib/validation-circle-image.test.ts src/lib/types.ts src/lib/validation.ts
git commit -m "refactor: remove forum application code"
```

### Task 6: Drop forum Prisma models and generate the destructive migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_remove_forum_module/migration.sql`

- [ ] **Step 1: Remove forum enums, relations, and models from the Prisma schema**

```prisma
// Delete these enums
// enum CircleRole { ... }
// enum PostStatus { ... }
// enum CommentStatus { ... }
// enum NotificationType { ... }

// Delete these models
// model Circle { ... }
// model CircleMembership { ... }
// model Section { ... }
// model Post { ... }
// model Comment { ... }
// model PostLike { ... }
// model CommentLike { ... }
// model Bookmark { ... }
// model Notification { ... }
// model CircleBan { ... }
// model Tag { ... }
// model PostTag { ... }

// Keep these mappings untouched
model ServerComment {
  @@map("comments")
}

model ServerNotification {
  @@map("notifications")
}
```

- [ ] **Step 2: Run Prisma validation before generating the migration**

Run: `pnpm prisma validate`
Expected: PASS with no remaining references from `User`, `Server`, or other models to deleted forum models.

- [ ] **Step 3: Generate the destructive migration with the agreed name**

Run: `pnpm prisma migrate dev --name remove_forum_module`
Expected: Prisma creates a migration directory whose SQL drops `circles`, `circle_memberships`, `sections`, `posts`, `forum_comments`, `post_likes`, `comment_likes`, `bookmarks`, `forum_notifications`, `circle_bans`, `tags`, and `post_tags`, while leaving `comments` and `notifications` alone.

- [ ] **Step 4: Inspect the generated SQL and remove any accidental drops of server tables before accepting it**

```sql
DROP TABLE "circles";
DROP TABLE "circle_memberships";
DROP TABLE "sections";
DROP TABLE "posts";
DROP TABLE "forum_comments";
DROP TABLE "post_likes";
DROP TABLE "comment_likes";
DROP TABLE "bookmarks";
DROP TABLE "forum_notifications";
DROP TABLE "circle_bans";
DROP TABLE "tags";
DROP TABLE "post_tags";
```

- [ ] **Step 5: Re-run Prisma validation after reviewing the SQL**

Run: `pnpm prisma validate`
Expected: PASS.

- [ ] **Step 6: Commit the schema + migration removal**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore: drop forum prisma models"
```

### Task 7: Final verification and release-readiness pass

**Files:**
- Modify as needed: any file surfaced by lint/TypeScript after tasks 1-6

- [ ] **Step 1: Run the two targeted node tests that protect the new shared helpers**

Run: `pnpm tsx --test src/lib/serverListPage.test.ts src/lib/mobile/inboxFacade.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the required lint gate from `AGENTS.md`**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Run the required type-check gate from `AGENTS.md`**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Do one product smoke pass in code review before shipping**

```text
Check these routes manually in the diff or local run:
- /
- /servers
- /search?search=vanilla
- /favorites
- /notifications
- /servers/[id]

Confirm these routes/files are gone:
- /explore
- /new
- /post/[postId]
- /c/[slug]
- /u/[uid]
- forum notification APIs
```

- [ ] **Step 5: Commit the verification fixes (if any) and prepare handoff**

```bash
git add .
git commit -m "chore: finalize server-only rollback"
```
