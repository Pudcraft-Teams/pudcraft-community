# Mobile UI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the missing mobile-first UI behavior across the shared shell, forum flows, console, and admin surfaces without changing business rules or desktop information architecture.

**Architecture:** Tighten the implementation around one shared mobile interaction layer first, then let forum pages and back-office surfaces adopt that layer independently. Keep global shell edits isolated to a single task, use existing Tailwind + `m3-*` tokens, and treat page-level mobile fixes as layout/action-entry refactors rather than feature rewrites.

**Tech Stack:** Next.js App Router, React 19 client/server components, TypeScript 5 strict mode, Tailwind CSS 3, existing Warm Clay Community UI tokens, ESLint, `tsc --noEmit`

---

## File Map

**Create**

- `src/components/admin/AdminNav.tsx`

**Modify**

- `src/app/layout.tsx`
- `src/app/admin/layout.tsx`
- `src/app/console/layout.tsx`
- `src/components/AuthButtons.tsx`
- `src/components/HeaderSearch.tsx`
- `src/components/console/Sidebar.tsx`
- `src/components/forum/ComposeDialog.tsx`
- `src/components/forum/FeedPage.tsx`
- `src/components/forum/CirclePage.tsx`
- `src/components/forum/ExplorePage.tsx`
- `src/components/forum/PostDetailPage.tsx`
- `src/components/forum/CircleSettings.tsx`
- `src/styles/globals.css`

---

### Task 1: Build The Shared Mobile Shell

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/HeaderSearch.tsx`
- Modify: `src/components/AuthButtons.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/forum/ComposeDialog.tsx`

- [ ] **Step 1: Add shared mobile rail and safe-spacing utilities**

```css
/* src/styles/globals.css */
@layer components {
  .m3-mobile-rail {
    @apply -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide;
  }

  .m3-mobile-rail-card {
    @apply shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors;
    border-color: var(--m3-outline);
    background-color: var(--m3-surface);
    color: var(--m3-text-muted);
  }

  .m3-mobile-rail-card-active {
    border-color: var(--m3-primary);
    background-color: var(--m3-accent-soft);
    color: var(--m3-primary);
    box-shadow: 0 1px 0 rgba(194, 112, 60, 0.08);
  }

  .m3-safe-bottom-pad {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 2: Expand `HeaderSearch` to support a real mobile search entry**

```tsx
// src/components/HeaderSearch.tsx
interface HeaderSearchProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function HeaderSearch({
  variant = "desktop",
  onNavigate,
}: HeaderSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function submit(nextQuery: string) {
    const q = nextQuery.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  }

  if (variant === "mobile") {
    return open ? (
      <div className="fixed inset-x-0 top-14 z-[120] border-b border-warm-200 bg-surface px-4 py-3 md:hidden">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(query);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索帖子、圈子、用户..."
            className="m3-input min-w-0 flex-1"
            autoFocus
          />
          <button type="submit" className="m3-btn m3-btn-primary px-3 py-2 text-xs">搜索</button>
          <button type="button" className="m3-btn m3-btn-tonal px-3 py-2 text-xs" onClick={() => setOpen(false)}>取消</button>
        </form>
      </div>
    ) : (
      <button
        type="button"
        className="m3-btn m3-btn-tonal inline-flex h-11 min-w-0 items-center gap-2 px-3"
        onClick={() => setOpen(true)}
        aria-label="打开搜索"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-warm-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-warm-500">搜索</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(query);
      }}
      className="relative"
    >
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索..."
        className="m3-input w-28 py-1.5 pl-7 pr-2 text-xs sm:w-36"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
    </form>
  );
}
```

- [ ] **Step 3: Rework `MobileNavMenu` into grouped mobile navigation**

```tsx
// src/components/AuthButtons.tsx
const PRIMARY_LINKS = [
  { href: "/", label: "广场" },
  { href: "/explore", label: "探索" },
  { href: "/servers", label: "服务器" },
  { href: "/changelog", label: "更新日志" },
];

function MobileMenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-400">{title}</p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function MobileNavMenu() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/" });
    setIsSigningOut(false);
  }

  return (
    <>
      <button
        type="button"
        className="m3-btn m3-btn-tonal inline-flex h-11 w-11 items-center justify-center p-0"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        aria-expanded={open}
      >
        <span className="space-y-1">
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
          <span className="block h-0.5 w-4 rounded bg-warm-800" />
        </span>
      </button>
      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-[100] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-warm-900/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="关闭菜单"
          />
          <div className="m3-surface absolute inset-x-4 top-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain p-3">
            <div className="mb-3 rounded-xl bg-warm-50 px-3 py-3">
              {session?.user ? (
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={session.user.image}
                    name={session.user.name}
                    email={session.user.email}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-warm-800">{displayName}</p>
                    <p className="truncate text-xs text-warm-400">{session.user.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-warm-500">登录后可发帖、收藏和管理你的圈子。</p>
              )}
            </div>

            <nav className="space-y-4">
              <MobileMenuSection title="导航">
                {PRIMARY_LINKS.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">
                    {item.label}
                  </Link>
                ))}
              </MobileMenuSection>

              <MobileMenuSection title="个人">
                {session?.user ? (
                  <>
                    <Link href="/submit" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">提交服务器</Link>
                    <Link href="/notifications" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">通知中心</Link>
                    <Link href={`/u/${session.user.uid}`} className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">我的主页</Link>
                    <Link href="/console" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">控制台</Link>
                    <Link href="/favorites" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">我的收藏</Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-accent-hover hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSigningOut ? "退出中..." : "退出"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">登录</Link>
                    <Link href="/register" className="block rounded-lg px-3 py-2.5 text-sm text-warm-800 hover:bg-warm-100">注册</Link>
                  </>
                )}
              </MobileMenuSection>

              {session?.user?.role === "admin" && (
                <MobileMenuSection title="管理">
                  <Link href="/admin" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent-muted">
                    管理后台
                  </Link>
                </MobileMenuSection>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Update the root layout and compose dialog to respect mobile spacing**

```tsx
// src/app/layout.tsx
<header className="sticky top-0 z-50 border-b border-warm-200 bg-surface/95 backdrop-blur-sm">
  <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
    <div className="flex items-center gap-2 md:hidden">
      <HeaderSearch variant="mobile" />
      <MobileNavMenu />
    </div>
  </div>
</header>

<main
  id="main-content"
  className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8"
>
  {children}
</main>
```

```tsx
// src/components/forum/ComposeDialog.tsx
<div className="relative z-10 mx-4 mt-[6vh] w-full max-w-xl animate-dialog-in sm:mt-[12vh]">
  <div
    ref={dialogRef}
    className="max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-warm-200 bg-surface shadow-xl outline-none"
  >
    <div className="flex items-center justify-between border-b border-warm-100 px-4 py-3">
      <button
        type="button"
        onClick={closeCompose}
        className="rounded-full p-1 text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
      <span id="compose-dialog-title" className="text-sm font-medium text-warm-600">发帖</span>
      <div className="w-7" />
    </div>
    <div className="px-4 py-3">
      <CreatePostForm
        circleId={options.circleId}
        circleName={options.circleName}
        circleSlug={options.circleSlug}
        onSuccess={closeCompose}
      />
    </div>
  </div>
</div>

function ComposeFAB({ defaults, openCompose }: ComposeFABProps) {
  return (
    <button
      type="button"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
      aria-label="发帖"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-6 w-6"
      >
        <path
          fillRule="evenodd"
          d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 5: Verify the shared shell changes compile cleanly**

Run:

```bash
pnpm exec eslint src/components/HeaderSearch.tsx src/components/AuthButtons.tsx src/app/layout.tsx src/components/forum/ComposeDialog.tsx
pnpm tsc --noEmit
```

Expected:

```text
No ESLint warnings or errors
```

- [ ] **Step 6: Commit the shared shell task**

```bash
git add src/styles/globals.css src/components/HeaderSearch.tsx src/components/AuthButtons.tsx src/app/layout.tsx src/components/forum/ComposeDialog.tsx
git commit -m "feat: improve shared mobile shell"
```

---

### Task 2: Adapt Forum Pages For Mobile-First Actions

**Files:**
- Modify: `src/components/forum/FeedPage.tsx`
- Modify: `src/components/forum/CirclePage.tsx`
- Modify: `src/components/forum/ExplorePage.tsx`
- Modify: `src/components/forum/PostDetailPage.tsx`
- Modify: `src/components/forum/CircleSettings.tsx`

- [ ] **Step 1: Add a mobile-only community action strip to the square feed**

```tsx
// src/components/forum/FeedPage.tsx
function renderMobileQuickActions() {
  return (
    <div className="mb-6 space-y-3 lg:hidden">
      {sessionStatus === "authenticated" && myCircles.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-warm-800">我的圈子</h2>
            <Link href="/explore" className="text-xs m3-link">找更多</Link>
          </div>
          <div className="m3-mobile-rail">
            {myCircles.map((circle) => (
              <Link key={circle.id} href={`/c/${circle.slug}`} className="m3-mobile-rail-card">
                {circle.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="m3-surface flex items-center justify-between gap-3 p-3">
        <div>
          <p className="text-sm font-semibold text-warm-800">想开一个新圈子？</p>
          <p className="text-xs text-warm-400">创建后可直接开始运营讨论区。</p>
        </div>
        <Link href="/circles/create" className="m3-btn m3-btn-primary px-3 py-2 text-xs">创建圈子</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pull circle actions and metadata into the mobile content flow**

```tsx
// src/components/forum/CirclePage.tsx
<div className="relative -mt-10 flex flex-col gap-4 px-2 sm:flex-row sm:items-end sm:gap-5">
  <div className="relative z-10 h-20 w-20 shrink-0 overflow-hidden rounded-xl border-4 border-surface bg-surface shadow-sm">
    {circle.icon ? (
      <Image
        src={normalizeImageSrc(circle.icon)!}
        alt={`${circle.name} 图标`}
        width={80}
        height={80}
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent to-accent-hover text-2xl font-bold text-white">
        {circle.name.charAt(0)}
      </div>
    )}
  </div>

  <div className="flex flex-1 flex-col gap-2">
    <div>
      <h1 className="text-xl font-bold text-warm-800">{circle.name}</h1>
      {circle.description && <p className="mt-0.5 text-sm text-warm-500">{circle.description}</p>}
      <p className="mt-1 text-xs text-warm-400">
        {circle.memberCount} 成员
        <span className="mx-1.5">&middot;</span>
        {circle.postCount} 帖子
        <span className="mx-1.5">&middot;</span>
        创建于 <span suppressHydrationWarning>{timeAgo(circle.createdAt)}</span>
      </p>
    </div>
  </div>
</div>

<div className="mt-4 space-y-3 lg:hidden">
  <div className="m3-surface p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleJoinToggle}
        className={`m3-btn text-sm ${circle.isMember ? "m3-btn-tonal" : "m3-btn-primary"}`}
      >
        {circle.isMember ? "已加入" : "加入圈子"}
      </button>
      {circle.isMember && (
        <button
          type="button"
          onClick={() => openCompose({ circleId: circle.id, circleName: circle.name, circleSlug: slug })}
          className="m3-btn m3-btn-tonal text-sm"
        >
          发帖
        </button>
      )}
      {isOwnerOrAdmin && (
        <Link href={`/c/${slug}/settings`} className="m3-btn m3-btn-tonal text-sm">
          管理圈子
        </Link>
      )}
    </div>
  </div>

  <div className="m3-surface p-4">
    <h2 className="mb-3 text-sm font-semibold text-warm-800">圈子信息</h2>
    <dl className="space-y-2 text-sm">
      <div className="flex items-center justify-between"><dt className="text-warm-400">成员</dt><dd>{circle.memberCount}</dd></div>
      <div className="flex items-center justify-between"><dt className="text-warm-400">帖子</dt><dd>{circle.postCount}</dd></div>
      <div className="flex items-center justify-between"><dt className="text-warm-400">创建时间</dt><dd>{formatCalendarDate(circle.createdAt)}</dd></div>
    </dl>
  </div>
</div>
```

- [ ] **Step 3: Make the explore page search and sort controls breathe on narrow screens**

```tsx
// src/components/forum/ExplorePage.tsx
<section className="mb-6 pt-2">
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">探索圈子</h1>
        <p className="mt-1.5 text-sm text-warm-500">发现感兴趣的游戏圈子，加入讨论</p>
      </div>
      {status === "authenticated" && (
        <Link href="/circles/create" className="m3-btn m3-btn-primary inline-flex shrink-0 items-center gap-1.5 self-start">
          <span className="text-base leading-none">+</span>
          创建圈子
        </Link>
      )}
    </div>

    <div className="m3-surface-soft flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索圈子名称..."
          className="m3-input w-full pr-10"
        />
      </div>
      <div className="m3-mobile-rail sm:mx-0 sm:px-0 sm:pb-0">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`m3-mobile-rail-card ${sort === option.value ? "m3-mobile-rail-card-active" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Tighten the post detail meta and action bar layout for touch screens**

```tsx
// src/components/forum/PostDetailPage.tsx
<div className="mb-4 flex items-start gap-3">
  <Link href={`/u/${post.author.uid}`}>
    <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
      <Image
        src={normalizeImageSrc(post.author.image) || "/default-avatar.png"}
        alt={post.author.name ?? "用户头像"}
        width={40}
        height={40}
        className="h-full w-full object-cover"
      />
    </span>
  </Link>
  <div className="min-w-0 flex-1">
    <Link href={`/u/${post.author.uid}`} className="text-sm font-medium text-warm-800 transition-colors hover:text-accent">
      {post.author.name ?? `用户${post.author.uid}`}
    </Link>
    <p className="text-xs text-warm-400">
      <span suppressHydrationWarning>{timeAgo(post.createdAt)}</span>
      {post.section && (
        <span className="ml-2 rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-500">
          {post.section.name}
        </span>
      )}
    </p>
  </div>
  {isPinned && <span className="shrink-0 rounded-full bg-accent-muted px-2 py-1 text-xs text-accent">置顶</span>}
</div>

<div className="mb-4 flex flex-wrap items-center gap-3 border-t border-warm-200 pt-4 text-sm text-warm-400">
  <span className="inline-flex items-center gap-1">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4.5C5.5 4.5 2 10 2 10s3.5 5.5 8 5.5 8-5.5 8-5.5-3.5-5.5-8-5.5Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
    <span className="tabular-nums">{post.viewCount}</span>
  </span>
  <span className="inline-flex items-center gap-1">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V5Z" />
    </svg>
    <span className="tabular-nums">{post.commentCount}</span>
  </span>
</div>

<div className="grid grid-cols-2 gap-2 border-t border-warm-200 pt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:pt-4">
  <button type="button" onClick={() => { void handleLike(); }} disabled={likePending} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
    <span>{liked ? "已赞" : "点赞"}</span>
    <span className="tabular-nums">{likeCount}</span>
  </button>
  <button type="button" onClick={() => { void handleBookmark(); }} disabled={bookmarkPending} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
    {bookmarked ? "已收藏" : "收藏"}
  </button>
  <button type="button" onClick={handleShare} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
    分享
  </button>
  {canPin && (
    <button type="button" onClick={() => { void handlePin(); }} disabled={pinPending} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
      {isPinned ? "取消置顶" : "置顶"}
    </button>
  )}
  <button type="button" onClick={() => setReportOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm">
    举报
  </button>
  {(canModerate || isAuthor) && (
    <button type="button" onClick={() => { void handleDelete(); }} disabled={deletePending} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent-hover">
      删除
    </button>
  )}
</div>
```

- [ ] **Step 5: Convert circle settings tabs into a mobile rail and stabilize the page header**

```tsx
// src/components/forum/CircleSettings.tsx
<section className="m3-surface p-4 sm:p-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      {circle.icon ? (
        <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={normalizeImageSrc(circle.icon) || circle.icon}
            alt={`${circle.name} 图标`}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        </span>
      ) : (
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-white">
          {circle.name.charAt(0)}
        </span>
      )}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-warm-700">{circle.name}</h1>
        <p className="text-sm text-warm-500">圈子设置</p>
      </div>
    </div>
    <Link href={`/c/${circleSlug}`} className="m3-btn m3-btn-tonal self-start px-3 py-2 text-sm">
      返回圈子
    </Link>
  </div>
</section>

<div className="m3-mobile-rail rounded-xl border border-warm-200 bg-surface p-1">
  {accessibleTabs.map((tab) => (
    <button
      key={tab.key}
      type="button"
      onClick={() => setActiveTab(tab.key)}
      className={`m3-mobile-rail-card ${activeTab === tab.key ? "m3-mobile-rail-card-active" : ""}`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Verify the forum task**

Run:

```bash
pnpm exec eslint src/components/forum/FeedPage.tsx src/components/forum/CirclePage.tsx src/components/forum/ExplorePage.tsx src/components/forum/PostDetailPage.tsx src/components/forum/CircleSettings.tsx
pnpm tsc --noEmit
```

Expected:

```text
No ESLint warnings or errors
```

- [ ] **Step 7: Commit the forum task**

```bash
git add src/components/forum/FeedPage.tsx src/components/forum/CirclePage.tsx src/components/forum/ExplorePage.tsx src/components/forum/PostDetailPage.tsx src/components/forum/CircleSettings.tsx
git commit -m "feat: improve forum mobile layouts"
```

---

### Task 3: Improve Console And Admin Mobile Navigation

**Files:**
- Create: `src/components/admin/AdminNav.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/console/layout.tsx`
- Modify: `src/components/console/Sidebar.tsx`

- [ ] **Step 1: Create a client admin nav component with active mobile state**

```tsx
// src/components/admin/AdminNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_ITEMS = [
  { href: "/admin", label: "概览", match: "/admin" },
  { href: "/admin/servers", label: "服务器", match: "/admin/servers" },
  { href: "/admin/users", label: "用户", match: "/admin/users" },
  { href: "/admin/moderation", label: "审查", match: "/admin/moderation" },
  { href: "/admin/reports", label: "举报", match: "/admin/reports" },
  { href: "/admin/changelog", label: "日志", match: "/admin/changelog" },
  { href: "/admin/tags", label: "话题", match: "/admin/tags" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="m3-surface sticky top-24 space-y-1 p-3">
          <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-warm-400">管理后台</h2>
          {ADMIN_ITEMS.map((item) => {
            const active = pathname === item.match || pathname.startsWith(`${item.match}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted font-medium text-accent"
                    : "text-warm-700 hover:bg-warm-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="m3-mobile-rail md:hidden">
        {ADMIN_ITEMS.map((item) => {
          const active = pathname === item.match || pathname.startsWith(`${item.match}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`m3-mobile-rail-card ${active ? "m3-mobile-rail-card-active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace the inline admin nav with the new component**

```tsx
// src/app/admin/layout.tsx
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await requireAdmin();
  if (isAdminError(result)) {
    redirect("/");
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4 md:flex-row md:gap-6">
      <AdminNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Rebuild the console mobile header and selector block around one action group**

```tsx
// src/app/console/layout.tsx
<div className="m3-surface mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <p className="text-sm font-semibold text-warm-700">PudCraft Community</p>
    <p className="text-xs text-warm-500">服主控制台</p>
  </div>

  <div className="flex flex-wrap items-center gap-2">
    <Link href="/" className="m3-btn m3-btn-tonal px-3 py-2 text-xs">返回首页</Link>
    <Link href={`/user/${session?.user?.uid}`} className="m3-btn m3-btn-tonal flex items-center gap-2 px-2 py-2">
      <UserAvatar
        src={session?.user?.image}
        name={session?.user?.name}
        email={session?.user?.email}
        className="h-6 w-6"
        fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
      />
      <span className="max-w-24 truncate text-xs">{displayName}</span>
    </Link>
  </div>
</div>
```

```tsx
// src/components/console/Sidebar.tsx
<div className="m3-surface mb-4 space-y-3 p-3 md:hidden">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">我的服务器</p>
      <p className="text-xs text-warm-400">
        {hasServers ? "切换服务器后查看对应控制台数据" : "你还没有可管理的服务器"}
      </p>
    </div>
    <Link href="/submit" className="m3-btn m3-btn-primary px-3 py-2 text-xs">
      {hasServers ? "提交新服务器" : "去提交"}
    </Link>
  </div>

  {hasServers ? (
    <select
      className="m3-input w-full"
      value={selectedServerId}
      onChange={(event) => {
        const targetServerId = event.target.value;
        if (targetServerId) {
          router.push(`/console/${targetServerId}`);
        }
      }}
    >
      {servers.map((server) => (
        <option key={server.id} value={server.id}>
          {server.isOnline ? "● " : "○ "}
          {server.name}
        </option>
      ))}
    </select>
  ) : null}
</div>
```

- [ ] **Step 4: Verify the admin and console task**

Run:

```bash
pnpm exec eslint src/components/admin/AdminNav.tsx src/app/admin/layout.tsx src/app/console/layout.tsx src/components/console/Sidebar.tsx
pnpm tsc --noEmit
```

Expected:

```text
No ESLint warnings or errors
```

- [ ] **Step 5: Commit the admin/console task**

```bash
git add src/components/admin/AdminNav.tsx src/app/admin/layout.tsx src/app/console/layout.tsx src/components/console/Sidebar.tsx
git commit -m "feat: improve admin and console mobile navigation"
```

---

### Task 4: Run Final Mobile Regression Checks

**Files:**
- Modify: any touched file above if spacing or active-state fixes are still needed after QA

- [ ] **Step 1: Run the full static verification pass**

Run:

```bash
pnpm lint
pnpm tsc --noEmit
```

Expected:

```text
Both commands complete without errors
```

- [ ] **Step 2: Start the dev server and inspect the mobile layouts at a narrow viewport**

Run:

```bash
pnpm dev
```

Then verify at ~390px width:

```text
1. / shows热门圈子 + 我的圈子/创建圈子移动区块，FAB 不遮挡内容
2. /explore 搜索、排序、创建圈子按钮不会互相挤压
3. 从 `/explore` 进入任意一个已有圈子页后，首屏可加入圈子、发帖、进设置，圈子信息卡在正文中可见
4. 从 `/` 打开任意一个已有帖子详情页后，操作栏按钮可点且不乱换行
5. /console 顶部操作和服务器切换器可在手机宽度下正常使用
6. /admin 移动导航条可横向滚动且当前页高亮
```

- [ ] **Step 3: Apply any final spacing fixes revealed by QA, then make the finishing commit**

```bash
git add src/app/layout.tsx src/app/admin/layout.tsx src/app/console/layout.tsx src/components/AuthButtons.tsx src/components/HeaderSearch.tsx src/components/console/Sidebar.tsx src/components/forum/ComposeDialog.tsx src/components/forum/FeedPage.tsx src/components/forum/CirclePage.tsx src/components/forum/ExplorePage.tsx src/components/forum/PostDetailPage.tsx src/components/forum/CircleSettings.tsx src/components/admin/AdminNav.tsx src/styles/globals.css
git commit -m "fix: polish mobile ui interactions"
```

---

## Self-Review

### Spec coverage

- Shared shell: covered by Task 1.
- Forum square/circle/explore/post/settings mobile behaviors: covered by Task 2.
- Console/admin mobile navigation: covered by Task 3.
- Final regression + desktop non-regression checks: covered by Task 4.

### Placeholder scan

- No `TODO`, `TBD`, “similar to above”, or undefined file references remain.
- Every task lists concrete files and concrete verification commands.

### Type consistency

- Shared utility classes are consistently named `m3-mobile-rail`, `m3-mobile-rail-card`, and `m3-mobile-rail-card-active`.
- `HeaderSearch` prop name is fixed as `variant`.
- Admin mobile nav is consistently named `AdminNav`.
