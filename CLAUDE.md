# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pudcraft Community is currently a server-only Minecraft server community platform. The live product surface only covers server discovery, submission (submit-and-own with auto content moderation), owner management via the console, comments, favorites, private-server membership flow, notifications, changelog, and the admin console. Historical forum / MoltBook features have been removed from this branch and must not be treated as live capabilities, developed against, or documented as current behavior.

## Read this first

- When editing spec documents, `AGENTS.md` and `CLAUDE.md` must stay in sync. If one is missing, restore it and align it with the other.
- `docs/API.md` and `docs/PRD.md` are the live documents. Older design drafts or forum-era planning docs (no longer tracked in this branch; some may exist locally under `docs/plans/` or `docs/superpowers/` but are gitignored) are archival only and do not override current behavior.
- Dependency upgrade policy is in `docs/dependency-pins.md`. The rule: keep the live runtime stack fresh, retain only the few pins that still have a real migration cost.
- UI text extraction and translation rules live in `docs/i18n.md`. All user-visible copy goes through `messages/<locale>.json` via `next-intl`; never inline new user-facing strings in a migrated file.

## Written output language

Default all written output that lands in the repo or on GitHub to **English**:

- Commit messages (subject and body)
- Pull request titles and descriptions
- GitHub issue / PR / review comments
- Documentation (`.md` files, including inline code fences)
- Code comments, TODOs, JSDoc
- Log statements and internal error messages (`logger.*`, thrown `Error` messages)
- Branch names

Exceptions — keep as-is, do not rewrite:

- Interactive conversation with the user (reply in whatever language the user writes in)
- User-facing UI strings and API error responses visible to end users (these are product copy; change them only when the task is about copy)
- Existing quoted content, screenshots, or data samples inside docs
- Third-party content (upstream changelogs, dependency notes, vendor docs)

## Internationalization (i18n)

- Library: `next-intl`. Messages live in `messages/zh.json` (default) and `messages/en.json`. Config is under `src/i18n/`.
- Locale is resolved per request from the `x-locale` header, then the `NEXT_LOCALE` cookie, then the best supported `Accept-Language` match by q-value, then falls back to `zh`. No URL prefix yet — adding path-based routing (`/en/...`) is a follow-up once English is ready to launch.
- Every user-visible string in `.tsx` components must resolve through `useTranslations` (client) or `getTranslations` (server). Do not inline new Chinese or English UI copy in migrated files; new components should use translation keys from day one.
- When adding a key, add it to **both** `messages/zh.json` and `messages/en.json` in the same change. English may be a draft, but the key must exist.
- Do not extract `logger.*`, thrown `Error` messages, commit messages, code comments, or docs — those stay in English per the Written output language rules.
- Full convention, namespace table, and rollout plan are in `docs/i18n.md`. Treat it as the single source of truth for i18n questions.

## Product scope

Current live scope:

1. Server discovery and search: `/` and `/servers` share the server-list experience.
2. Server submission: signed-in users submit a server; auto content moderation (Alibaba Cloud Green text + image) runs immediately. Pass → `reviewStatus = "approved"`, `ownerId = submitter`. Fail → `reviewStatus = "rejected"` with reason. No admin review step for new submissions; no server-connectivity check on submit.
3. Owner management: submitter is automatically the owner. Owners manage their servers via `/console` and `/console/{serverId}` (tabs: Overview, Settings, Members, Integration). No MOTD claim/verify flow.
4. Admin controls: `/admin/servers` lets admins set `ownerId` for legacy `ownerId=null` servers and toggle `isVerified` (official certification badge, writes `ModerationLog`). `isVerified` is admin-assigned only — no user-initiated verify flow.
5. Server interaction: comments, favorites, notifications, public changelog, reports.

Authentication: identities are sourced exclusively from a self-hosted Misskey instance via MiAuth (shown as "咖啡厅" in user-visible UI; code, routes, DB fields, and env vars keep "misskey"). There is no local password / email / verification-code flow; profile fields (name / avatar / bio / handle) and admin role are re-synced from Misskey on every login.

Explicitly out of scope:

- Circles
- Post feed
- Forum bookmarks / forum notifications
- Native mobile API surface (`/api/mobile/*` was removed; mobile clients are deferred until a dedicated MiAuth mobile flow ships)
- Anything that would restore removed surfaces such as `src/components/forum/*`, `/c/*`, `/post/*`, `/explore`, `/new`

## Stack

- Framework: Next.js 16.2.4 (App Router) + React 19.2.5 + TypeScript 5.9.3 (strict)
- Styling: Tailwind CSS 3 + Warm Clay Community UI
- Database: Prisma ORM 6.19.2 + PostgreSQL
- Auth: NextAuth v5 beta (JWT session) backed by Misskey MiAuth (single self-hosted instance via `MISSKEY_HOST`); a short-lived HMAC ticket bridges the MiAuth callback into NextAuth's Credentials provider
- Queue: BullMQ 5.74.1 + Redis (ioredis 5.10.1)
- Realtime: a standalone WebSocket process used for whitelist-sync push
- Package manager: pnpm 10.28.x
- Runtime: production minimum Node.js 20.9+; this working tree is validated on Node.js 25.2.1

## Common commands

```bash
# Development
pnpm dev              # Next.js dev server
pnpm worker:dev       # Worker (auto-restart)
pnpm ws:dev           # WebSocket service (needed for whitelist / private-server integration work)

# Checks
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm build
pnpm format
pnpm format:check

# Database
pnpm db:generate
pnpm db:migrate
pnpm db:push          # Local dev quick sync only; never use in production
pnpm db:studio

# Processes / build
pnpm worker
pnpm ws
pnpm build:worker
```

Day-to-day local development needs at least `pnpm dev` and `pnpm worker:dev`; add `pnpm ws:dev` when working on whitelist sync or private-server integration.

`pnpm test` first runs `set -a; . ./.env.example` to inject test env vars, then collects `*.test.ts(x)` and `*.spec.ts(x)` under `src` / `prisma` / `scripts` and runs them together. To run a single test file, replicate the env load yourself, for example:

```bash
sh -c 'set -a; . ./.env.example; set +a; node --import tsx --test src/lib/auth.test.ts'
```

Running `tsx --test <file>` directly fails because env vars like `DATABASE_URL` are missing.

## Pre-commit checks

Before committing, run at minimum:

1. `pnpm lint`
2. `pnpm tsc --noEmit`
3. `pnpm test`
4. Confirm `.env*` files are not staged

Commit messages use `<type>: <description>`, e.g. `feat:` / `fix:` / `refactor:` / `docs:` / `chore:`.

## Directory layout

| Directory                 | Responsibility                                              | Do not put here                         |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `src/app/`                | Page containers and App Router routes                       | Business logic, database access         |
| `src/app/api/`            | REST API Route Handlers                                     | Page components                         |
| `src/app/admin/`          | Admin console pages                                         | Regular user features                   |
| `src/app/console/`        | Owner console pages                                         | Admin-only logic                        |
| `src/app/servers/`        | Server detail, apply, edit, modpack pages                   | Generic business logic                  |
| `src/components/`         | Reusable UI components                                      | Direct database access                  |
| `src/components/console/` | Console-only interactive components                         | Shared logic beyond console layout      |
| `src/hooks/`              | React hooks                                                 | Page routing, database access           |
| `src/lib/`                | Business logic, data-access wrappers, validation, utilities | React components                        |
| `src/i18n/`               | `next-intl` config (`config.ts`, `request.ts`)              | Message JSON, UI components             |
| `src/worker/`             | ping / verify / sync background jobs                        | API Routes                              |
| `src/ws/`                 | Whitelist-sync WebSocket service                            | Page components                         |
| `messages/`               | `next-intl` message bundles, one JSON per locale            | Anything other than translation strings |
| `prisma/`                 | Schema and migrations                                       | Application UI code                     |
| `docs/`                   | Live documents and archival material                        | Source implementation                   |

## Live page routes

User / public pages:

- `/`: server discovery home
- `/servers`: server list
- `/search`: legacy search entry, redirects to `/servers`
- `/servers/{id}`: server detail
- `/servers/{id}/apply`: apply to a private server
- `/servers/{id}/join/{code}`: join via invite code
- `/servers/{id}/edit`: owner edits server
- `/servers/{id}/modpacks`: modpacks page
- `/submit`: submit a server
- `/favorites`: my favorites
- `/notifications`: notification center
- `/u/{misskeyId}`: public user profile (server-centric)
- `/settings/profile`: read-only profile view (synced from Misskey on every login)
- `/login`: Misskey MiAuth gateway (the only sign-in entry point)
- `/changelog`

Console / admin pages:

- `/console`: my servers and console entry
- `/console/{serverId}`: owner console (Overview tab, default)
- `/console/{serverId}/settings`: Settings tab
- `/console/{serverId}/members`: Members tab
- `/console/{serverId}/integration`: Integration tab
- `/my-servers`: legacy entry, redirects to `/console`
- `/admin`
- `/admin/servers`
- `/admin/users`
- `/admin/reports`
- `/admin/moderation`
- `/admin/changelog`

## API modules

Full interface reference lives in `docs/API.md`. The live API surface should be maintained only around these modules:

- Auth: `/api/auth/[...nextauth]`, `/api/auth/misskey/start`, `/api/auth/misskey/callback`
- Servers: `/api/servers`, `/api/servers/{id}`
- Favorites: `/api/servers/{id}/favorite`, `/api/user/favorites*`
- Comments: `/api/servers/{id}/comments*`
- Private servers: `settings` / `applications` / `invites` / `membership` / `members` / `api-key`
- Sync: `/api/servers/{id}/sync/*`, `/api/sync/{syncId}/ack`
- Notifications: `/api/notifications*`
- Reports: `/api/reports`, `/api/admin/reports*`
- Admin: `/api/admin/servers*`, `/api/admin/users*`, `/api/admin/moderation*`, `/api/admin/changelog*`
- System: `/api/health`, `/api/changelog`, `/api/uploads/editor-image`

## Naming and code style

- Component files / component names: PascalCase, prefer named exports; Next.js page files are the exception
- Utility / business files: camelCase
- Page files are always `page.tsx`, API routes are always `route.ts`
- Type imports use `import type`
- Path alias is `@/*`
- `strict: true` must stay on; do not use `any`, prefer `unknown` + type guards

Import order:

1. Node.js built-ins
2. Third-party dependencies
3. `@/` path aliases
4. Relative paths
5. Type imports last within each group

## Error handling and API conventions

- Every API Route must have explicit parameter validation and error branches
- Error responses use `{ error: string, details?: unknown }` uniformly
- Common status codes: 400 / 401 / 403 / 404 / 409 / 429 / 500
- Non-critical side-effect failures should be logged only, not blocked
- Delete, review, and sync logic must prioritize idempotency and safe retries

## Security rules

- Secrets, object storage, Redis, etc. must come from `.env*`
- Every write endpoint must enforce permission on the server; do not rely on a hidden front-end button
- Server address validation must continue to reject localhost / private IPs; port range is 1–65535
- Private server addresses and ports are visible only to owner / admin / members
- API keys are shown once at generation; only a hash is persisted
- The Misskey login ticket is short-lived, HMAC-signed, and one-shot consumed
- Report targets are limited to the live set: `server`, `comment`, `user`
- User-provided external links must use `rel="noopener noreferrer" target="_blank"`
- Never apply `dangerouslySetInnerHTML` to unsanitized content

## Performance rules

- Page requests and API Routes must not ping Minecraft servers directly; status is written by the Worker asynchronously
- Server lists and details should reuse the cached fields: `isOnline`, `playerCount`, `maxPlayers`, `favoriteCount`
- High-frequency list endpoints must avoid N+1; favorite state and membership relations should be batched
- Image uploads stay compressed on the client: avatar 256px, server icon 512px
- Whitelist sync and notification counts must not block primary page rendering

## Database / domain model

Primary models today:

- `User` (keyed by upstream `misskeyId`; `name` / `image` / `bio` / `misskeyUsername` are overwritten on every login)
- `Server`
- `ServerStatus`
- `ServerComment` (table `comments`)
- `Favorite`
- `ServerNotification` (table `notifications`)
- `Modpack`
- `ServerApplication`
- `ServerInvite`
- `ServerMember`
- `WhitelistSync`
- `ModerationLog`
- `Changelog`
- `Report`

Database conventions:

- Migration command: `pnpm prisma migrate dev --name <snake_case_name>`
- Never use `db push` in production
- Common IDs use `cuid()`
- Time fields use `DateTime`
- Relations must declare `onDelete` explicitly
- `address + port` remains a composite unique
- Cached-field updates run in the same transaction as the main write

## Worker / WebSocket rules

- `server-ping`: periodically refreshes cached online status, player count, latency
- Whitelist sync uses Redis Pub/Sub bridged to the WebSocket service
- Sync records must cover `pending / pushed / acked / failed`
- Plugin integration follows `handshake -> realtime push -> ack`

## UI rules

- Theme: **Claude Clay** — warm cream paper + clay-orange brand. Mode-keyed earthen accents on player surfaces; the same tokens carry through to the owner console (`/console`) so the dashboard reads as cohesive with the player surfaces, not a separate visual world.
- Primary (buttons, links, focus): `#CC7D5E` (clay). Hover: `#BC6E4F`. Active: `#A45F40`.
- Page background: `#F4EFE6` (cream paper). Surface (cards): `#FFFEFA`. Surface variant / soft panels: `#EDE6D9`.
- Primary text: `#1A1A18` · body: `#494842` · secondary: `#847F71` · meta: `#B5AE9A`.
- Border: `#E2DCCC`. Strong border: `#D5CDB7`.
- Success / online: `#5C8C4E` · Warning: `#C97C3F` · Error / danger: `#C0392B`.
- Mode palette (server-card cover gradients + chip swatches): `--mode-survival #6B8E5B` (sage), `--mode-creative #4A7C9D` (dusty blue), `--mode-rpg #8B6FA8` (mauve), `--mode-pvp #C0392B` (terracotta), `--mode-tech #C97C3F` (burnt sienna), `--mode-sky #70A5B5` (hazy teal), `--mode-vanilla #9C8F75` (khaki), `--mode-mod #C9A93F` (mustard), `--mode-mini #B86E8E` (dusty rose).
- Fonts: HarmonyOS Sans SC self-hosted at `/public/fonts/HarmonyOS_SansSC_Regular.woff2`, declared via `@font-face` in `globals.css`. Fallback chain: `-apple-system, BlinkMacSystemFont, system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`. Body letter-spacing `-0.005em`.
- Hero typography goes large (`clamp(36px, 5vw, 56px)`, weight 700, letter-spacing `-0.035em`) — only on the marketing surfaces (home `/`). Inner pages stay compact.
- Use `.cover-{mode}` classes for server-card covers (16:9 gradient + grid pattern) and `.mode-tag` overlays for badges. Mode chips on filters carry a colored swatch.
- Borders + warm shadows do the depth work. Avoid neumorphism, inner shadows, or gradient fills outside cover artwork and the hero card preview.
- Mobile-first; breakpoints `sm:640 md:768 lg:1024`
- Prefer Next.js `<Image>`; `<img>` is only acceptable for sanitized, whitelisted sources
- Reuse the shared Toast / EmptyState / PageLoading primitives

## Documentation rules

- `AGENTS.md` and `CLAUDE.md` are kept byte-identical from the `## Read this first` section onwards. Only the opening title + intro paragraph differ. Edit both in the same change; never let them drift.
- Whenever product scope, routes, models, or APIs change, update `AGENTS.md`, `CLAUDE.md`, `docs/API.md`, and `docs/PRD.md` **in the same commit / PR as the code change**. Doc drift is a bug, not a follow-up.
- Before marking any task complete, run a doc pass: "what did I change that a future reader (or a future Claude session) needs to know?" If the answer is anything other than "nothing", update the docs now.
- Changes that affect the live surface must not be reflected only in historical design notes.
- If documentation and code disagree, code and live routes win — correct the docs immediately.

## Past mistakes — do not repeat

Record concrete mistakes here so the same one does not happen twice. When a new mistake is caught (by review, by the user, by a CI / test failure that traces back to a missed assumption), append an entry here in **both** `CLAUDE.md` and `AGENTS.md`. Keep entries short: what went wrong, why it happened, what to do next time.

- **Scope creep through documentation (PRs #55, #56).** Forum / MoltBook features were designed, partially built, and documented as live even after the product decision to stay server-only. A full rollback was required. Next time: if a capability is not in the "Product scope" block above, do not build it, do not wire routes / APIs for it, and do not describe it as current behavior. A scope change must land in `CLAUDE.md` / `AGENTS.md` / `docs/PRD.md` **before** code.
- **Docs drifting from code.** `docs/API.md`, `docs/PRD.md`, `CLAUDE.md`, and `AGENTS.md` were not updated in the same change as code, so later readers (including Claude itself) treated stale guidance as current and kept building on top of it. Next time: any PR that changes routes / models / APIs / scope must touch these four docs in the same PR, or explicitly call out why it does not.
- **Letting `CLAUDE.md` and `AGENTS.md` diverge.** One was updated, the other was not, producing contradictory guidance depending on which tool opened the repo. Next time: after editing either file, diff them — everything from `## Read this first` down must match byte-for-byte.
- **Inlining UI copy after i18n landed.** Once `next-intl` was wired up, follow-up changes kept adding hard-coded Chinese strings in files that had already been migrated, silently breaking the translation contract. Next time: if a file already uses `useTranslations` / `getTranslations`, any new user-visible string goes through a new key in `messages/*.json`, not a string literal.
- **API fields that look like display strings (e.g. `peakTime: "暂无数据"`).** Returning a user-facing rendered string in an API payload couples the backend to a single locale. It surfaced during Batch 2 and Batch 4 had to refactor `/api/servers/[id]/stats` to `string | null`. Next time: API returns machine-readable values (enums, nulls, raw data); the UI layer handles display formatting and translation.
- **Inline error copy in lib functions that cross request boundaries (e.g. `requireAdmin` returning `{ error: "请先登录" }`).** Blocks translation because the caller doesn't know the recipient's locale. Pattern: lib returns an `errorKey`, the caller translates via `getTranslations({ locale })`. This is how `requireActiveUser` / `requireAdmin` / `resolveActiveUserResult` were refactored.
- **Throwing user-facing Chinese from `Error.message` in domain libraries (e.g. `throw new Error("整合包缺少 modrinth.index.json")` in `src/lib/modpack.ts`).** The route handler surfaced `error.message` verbatim, which couples the library to a single locale and makes English translation impossible. Next time: custom error classes expose a machine-readable `.key` (and params), and the route handler translates via a keyed namespace. See `ModpackError` + `errors.api.modpacks.*` for the pattern; the same shape applies to `ImageValidationError.code` / `VerifyJobResult.reasonKey`.
- **Zod inline `.min(3, "MC 用户名至少 3 个字符")` messages bypass `errorMap`.** The initial Batch 3 plan assumed `getZodErrorMap` could intercept every Zod message, but Zod's `errorMap` only fires for issues that do NOT carry an inline message. Field-specific copy must instead use the `errors.validation.<area>.<key>` key-path form and be translated at serialization time via `flattenZodErrorWithLocale`. Validate any change to `src/lib/validation.ts` with a round-trip test that asserts the serialized `details.fieldErrors` picks up the locale.
- **Treating `isVerified` as a claim/verify flow artifact.** After the user architecture overhaul (2026-04-30), `Server.isVerified` no longer means "owner completed MOTD verification" — it is an admin-assigned official certification badge toggled via `/admin/servers`. The claim/verify flow (`/servers/{id}/verify`, `/api/servers/{id}/verify*`, `server-verify` worker job) was removed entirely. Existing `isVerified=true` records are treated as admin-granted. Next time: do not attempt to re-introduce MOTD verification or a user-initiated claim flow; that path was deliberately removed. The only way to set `isVerified` is through the admin panel.
- **Half-migrated identity systems (Misskey MiAuth takeover).** When the project moved from local credentials to Misskey, every codepath that referenced `User.uid` / `User.email` / `User.passwordHash` / `Account` / `Session` / `VerificationToken` had to go in the same change — leaving even one stale `select: { uid: true }` or one `signIn("credentials", { email })` call would have broken the whole pipeline. Next time we replace an identity system: grep the entire `src/` tree for the old field names _before_ the rename, write down the full call graph, and treat the migration as one PR (schema + types + every call site + i18n + docs + tests) rather than a "we'll mop up later" two-step. Mobile-only API surfaces depending on the old auth (`/api/mobile/*`) were retired in the same change because they had no MiAuth path; do not resurrect them without a dedicated mobile MiAuth design.
- **MiAuth callback that trusted unsolicited session IDs (account-takeover risk).** The first cut of `/api/auth/misskey/callback` looked up Redis state by `sessionId` for the redirect URL but still proceeded to `checkMiAuthSession(sessionId)` even when the lookup missed. An attacker could approve their own MiAuth session and send the URL to a victim, who would log into the attacker's account. Next time we wire OAuth/MiAuth-style flows: the session ID MUST be (a) shape-validated before any external call, (b) atomically consumed from Redis with `GETDEL` (so replay is impossible), (c) **fail closed** when no state exists, and (d) verified that the upstream user is local (not federated). The validation helpers belong in a pure module so a forged-session test can exercise the rejection path without booting Next.js.
- **Schema columns left behind after a feature removal (orphaned `verify_token` etc.).** When the MOTD claim/verify flow was deleted, the routes/worker/lib/pages went but the `verify_token` / `verify_expires_at` / `verify_user_id` columns stayed on `servers`. Dead columns with auth-adjacent names are not just dead weight — they look like a still-active gating system to anyone reading the schema and represent durable attack surface. Next time we retire a feature: include a `DROP COLUMN` migration in the same PR as the code deletion, and add a "schema does not declare X" assertion to the migration test pack so a regression PR re-introducing the column fails CI.
- **Schema-with-no-migration ("run prisma migrate dev later").** `ServerApplication.formContentHash` was added to `prisma/schema.prisma` and written to in the API, but the migration was deferred to "after merge". A production deploy on that state would 500 the first POST `/applications` because the column wouldn't exist. Next time: a schema change is not landed until its `prisma/migrations/<timestamp>_*/migration.sql` exists and `pnpm prisma generate` has been run; treat a defensive cast like `(row as { formContentHash?: string }).formContentHash ?? null` as a smell pointing at a missing migration, not as an acceptable shim.
