# Pudcraft Community

Pudcraft Community is currently a server-only Minecraft server community platform. The live product surface only covers server discovery, submission, claiming, comments, favorites, private-server membership flow, notifications, changelog, and the admin console. Historical forum / MoltBook features have been removed from this branch and must not be treated as live capabilities, developed against, or documented as current behavior.

## Read this first

- When editing spec documents, `AGENTS.md` and `CLAUDE.md` must stay in sync. If one is missing, restore it and align it with the other.
- `docs/API.md` and `docs/PRD.md` are the live documents. Older design drafts or forum-era planning docs (no longer tracked in this branch; some may exist locally under `docs/plans/` or `docs/superpowers/` but are gitignored) are archival only and do not override current behavior.
- Dependency upgrade policy is in `docs/dependency-pins.md`. The rule: keep the live runtime stack fresh, retain only the few pins that still have a real migration cost.

## Product scope

Current live scope:

1. Server discovery and search: `/` and `/servers` share the server-list experience.
2. Server submission and review: signed-in users can submit, admins approve before publishing.
3. Server claiming and owner management: MOTD verification, settings, applications, invite codes, API keys, whitelist sync.
4. Server interaction: comments, favorites, notifications, public changelog, reports.
5. Native mobile support: `/api/mobile/session*` and `/api/mobile/inbox*`.

Explicitly out of scope:

- Circles
- Post feed
- Forum bookmarks / forum notifications
- Anything that would restore removed surfaces such as `src/components/forum/*`, `/c/*`, `/post/*`, `/explore`, `/new`

## Stack

- Framework: Next.js 16.2.4 (App Router) + React 19.2.5 + TypeScript 5.9.3 (strict)
- Styling: Tailwind CSS 3 + Warm Clay Community UI
- Database: Prisma ORM 6.19.2 + PostgreSQL
- Auth: Auth.js / NextAuth v5 beta (Credentials + JWT session)
- Queue: BullMQ 5.74.1 + Redis (ioredis 5.10.1)
- Realtime: a standalone WebSocket process used for whitelist-sync push
- Email: Nodemailer 8.0.5
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

| Directory | Responsibility | Do not put here |
|---|---|---|
| `src/app/` | Page containers and App Router routes | Business logic, database access |
| `src/app/api/` | REST API Route Handlers | Page components |
| `src/app/admin/` | Admin console pages | Regular user features |
| `src/app/console/` | Owner console pages | Admin-only logic |
| `src/app/servers/` | Server detail, apply, claim, edit, modpack pages | Generic business logic |
| `src/components/` | Reusable UI components | Direct database access |
| `src/components/console/` | Console-only interactive components | Shared logic beyond console layout |
| `src/hooks/` | React hooks | Page routing, database access |
| `src/lib/` | Business logic, data-access wrappers, validation, utilities | React components |
| `src/worker/` | ping / verify / sync background jobs | API Routes |
| `src/ws/` | Whitelist-sync WebSocket service | Page components |
| `prisma/` | Schema and migrations | Application UI code |
| `docs/` | Live documents and archival material | Source implementation |

## Live page routes

User / public pages:

- `/`: server discovery home
- `/servers`: server list
- `/search`: legacy search entry, redirects to `/servers`
- `/servers/{id}`: server detail
- `/servers/{id}/apply`: apply to a private server
- `/servers/{id}/join/{code}`: join via invite code
- `/servers/{id}/verify`: claim a server
- `/servers/{id}/edit`: owner edits server
- `/servers/{id}/modpacks`: modpacks page
- `/submit`: submit a server
- `/favorites`: my favorites
- `/notifications`: notification center
- `/u/{uid}`: public user profile (server-centric)
- `/settings/profile`: profile settings
- `/login` / `/register` / `/forgot-password`
- `/changelog`

Console / admin pages:

- `/console`: my servers and console entry
- `/console/{serverId}`: owner console
- `/my-servers`: legacy entry, redirects to `/console`
- `/admin`
- `/admin/servers`
- `/admin/users`
- `/admin/reports`
- `/admin/moderation`
- `/admin/changelog`

## API modules

Full interface reference lives in `docs/API.md`. The live API surface should be maintained only around these modules:

- Auth: `/api/auth/*`
- Servers: `/api/servers`, `/api/servers/{id}`
- Favorites: `/api/servers/{id}/favorite`, `/api/user/favorites*`
- Comments: `/api/servers/{id}/comments*`
- Claiming: `/api/servers/{id}/verify*`
- Private servers: `settings` / `applications` / `invites` / `membership` / `members` / `api-key`
- Sync: `/api/servers/{id}/sync/*`, `/api/sync/{syncId}/ack`
- Notifications: `/api/notifications*`, `/api/mobile/inbox*`
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

- Secrets, SMTP, object storage, Redis, etc. must come from `.env*`
- Every write endpoint must enforce permission on the server; do not rely on a hidden front-end button
- Server address validation must continue to reject localhost / private IPs; port range is 1–65535
- Private server addresses and ports are visible only to owner / admin / members
- API keys are shown once at generation; only a hash is persisted
- Email verification codes keep their cooldown and lockout
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

- `User`
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
- `server-verify`: runs MOTD-token claim verification
- Whitelist sync uses Redis Pub/Sub bridged to the WebSocket service
- Sync records must cover `pending / pushed / acked / failed`
- Plugin integration follows `handshake -> realtime push -> ack`

## UI rules

- Theme: Warm Clay Community UI
- Primary: `#C2703C`
- Page background: `#F9F8F6`
- Surface: `#FFFFFF`
- Primary text: `#1A1816`
- Secondary text: `#6F6862`
- Border: `#E7E4E0`
- Success / online: `#5C946E`
- Fonts: Plus Jakarta Sans + PingFang SC fallback
- Mobile-first; breakpoints `sm:640 md:768 lg:1024`
- Prefer Next.js `<Image>`; `<img>` is only acceptable for sanitized, whitelisted sources
- Reuse the shared Toast / EmptyState / PageLoading primitives

## Deployment

- GitHub Actions builds the image and deploys to a VPS
- Containers: `web` + `worker` + `ws`
- PostgreSQL / Redis are reused from the 1Panel environment
- Deployment path: `/opt/pudcraft/`
- Reverse proxy is managed through 1Panel OpenResty

## Documentation rules

- Whenever product scope, routes, models, or APIs change, update `AGENTS.md`, `CLAUDE.md`, `docs/API.md`, and `docs/PRD.md` together
- Changes that affect the live surface must not be reflected only in historical design notes
- If documentation and code disagree, code and live routes win — correct the docs immediately
