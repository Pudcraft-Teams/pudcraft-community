# Pudcraft Community — Product Requirements Document (PRD)

> Branch: server-only
> Status: current-state document for this branch
> Updated: 2026-04-19

## 1. Product overview

### 1.1 Positioning today

Pudcraft Community is positioned as a server-only community platform for Minecraft players:

- Help players discover, filter, favorite, and comment on servers
- Help server owners manage server info, private-server members, and whitelist sync via the owner console
- Help platform admins run review, report handling, content moderation, and changelog publishing

The historical forum / MoltBook shape has been removed from the live surface. Any circle, post feed, forum notifications, bookmarks, or topic-page capability is no longer part of the product.

### 1.2 Target users

| Role | Description | Core needs |
|---|---|---|
| Player | Minecraft players looking for and comparing servers | Fast discovery, filtering, favorites, applying to join, checking notifications |
| Server owner | Administrators running a server | Submitting a server (auto-approved), managing it via the console, maintaining private-server members, syncing whitelists |
| Platform admin | Keeping the platform orderly and quality-controlled | Reviewing servers, handling reports, auditing moderation logs, publishing changelog entries |

### 1.3 Product goals

1. Provide a stable server discovery and search experience.
2. Provide a frictionless server submission loop: submit → auto content moderation → owner immediately manages their server via the console.
3. Support private-server applications, invites, member management, and whitelist sync.
4. Keep favorites, comments, notifications, and reports working end-to-end.
5. Use a single self-hosted Misskey instance as the only identity provider so the platform doesn't have to maintain its own credentials, email verification, or password reset.

## 2. Scope and non-goals

### 2.1 In scope

- Server list, search, sort, tag filters
- Server detail, comments, favorites
- Server submission with auto content moderation (Alibaba Cloud Green); submitter becomes owner immediately on pass; duplicate-address prompts
- Owner console at `/console` and `/console/{serverId}` (tabs: Overview, Settings, Members, Integration)
- Admin `isVerified` toggle and `ownerId` assignment for legacy servers (no user-initiated claim flow)
- Private-server settings, applications, invite codes, member management, API keys
- Whitelist sync (HTTP + Redis + WebSocket)
- Notification center, changelog, reports
- Admin console (servers, users, moderation, reports, changelog)
- Misskey MiAuth sign-in (shown as "咖啡厅" in UI; single self-hosted instance, profile + role re-synced on every login)

### 2.2 Explicit non-goals

- Circles / groups
- Post feed and post details
- Forum bookmarks / forum notifications
- Topic tag system (forum tags)
- User social profile pages built around posts and circles

### 2.3 Archival note

The repository may still contain historical design drafts, superpowers documents, or older forum plans locally. They are archival material and do not represent current product requirements.

## 3. Core user journeys

### 3.1 A player discovers a server

1. Open `/` or `/servers`
2. Filter by keyword, tag, and sort order
3. Open `/servers/{id}` to see details, status, modpacks, and comments
4. Favorite the server or enter the apply / invite flow

### 3.2 An owner submits a server

1. Sign in, go to `/submit`
2. Submit server info and icon
3. If the address is already registered, the system prompts with a duplicate-address notice
4. Auto content moderation runs immediately (text + image); on pass, `reviewStatus = "approved"` and the submitter becomes `ownerId`
5. The owner manages the server immediately under `/console` and `/console/{serverId}` (no MOTD verification step)

### 3.3 Private-server membership flow

1. The owner configures `visibility`, `joinMode`, application form, and invite codes in the console
2. Players join via the application page or an invite code
3. The owner approves or revokes members
4. The system writes member changes to sync records and pushes them to the plugin via WebSocket
5. Once the plugin ACKs, the console reflects the updated sync status

### 3.4 Players receive feedback

- Comment replies, review results, server-online events, and application outcomes arrive in the notification center
- The favorites page should reflect the current favorite set in real time
- Report outcomes and content-moderation feedback go through the notification system

## 4. Features

### 4.1 Accounts and profile

- Sign-in is exclusively through Misskey MiAuth (single self-hosted instance configured by `MISSKEY_HOST`); there is no local password, email registration, password reset, or email-verification flow
- The local `User` is keyed by `misskeyId`; `name` / `image` / `bio` / `misskeyUsername` are overwritten on every login from the upstream Misskey profile
- The local `role` is `admin` when the upstream Misskey user has `isAdmin || isModerator`, otherwise `user`; manual local edits are reset on the next login
- Profile page is read-only — to change display name / avatar / bio, the user must change them on Misskey and sign in again
- Public user pages only surface server-related information and identify the user by `misskeyId`
- Banned users cannot continue to use capabilities that require an active account; ban state is stored locally and is independent of Misskey

### 4.2 Server discovery

- `/` and `/servers` share the same server-list experience
- Sort: `newest / popular / players / name`
- Tag and keyword filtering
- Non-public server addresses are hidden from non-members

### 4.3 Server detail and interaction

- Shows basics, online status, favorite count, modpacks
- Two-level server comments
- Favorite / unfavorite
- Report on servers, comments, users

### 4.4 Server submission

- Signed-in users can submit a server at `/submit`
- Duplicate address submissions show a clear prompt (no claim redirect)
- Auto content moderation runs immediately on submit: Alibaba Cloud Green text moderation for name/description, image moderation for icon; pass → `reviewStatus = "approved"`, `ownerId = submitter`; fail → `reviewStatus = "rejected"` with reason
- No admin review step for new submissions; no server-connectivity check on submit
- Rejected submissions surface the rejection reason to the submitter

### 4.5 Owner management

- Submitter is automatically the owner; no MOTD claim/verify flow
- Owner console at `/console/{serverId}` with four tabs: Overview (stats, charts, recent comments), Settings (edit info, visibility, join mode), Members (applications, invites, member list), Integration (API key, whitelist sync, plugin config)
- Admin can assign `ownerId` to legacy `ownerId=null` servers via `/admin/servers/{id}`
- Admin can toggle `isVerified` (official certification badge) via `/admin/servers/{id}`; every toggle writes a `ModerationLog` entry

### 4.6 Private-server capabilities

> By default these are disabled in production via the `NEXT_PUBLIC_ENABLE_PRIVATE_SERVERS` feature flag; while disabled, application, invite-code, and member-management entry points are hidden, and corresponding APIs return `404`.

- Visibility modes: `public` / `unlisted` / `private`
- Join modes: `open` / `apply` / `invite` / `apply_and_invite`
- Application form, approvals, invites, member removal
- Whitelist sync status: `pending / pushed / acked / failed`

### 4.7 Notifications and changelog

- Notification center supports pagination and bulk mark-as-read
- Covers server-only notification types
- Changelog is public; admins maintain it from the console

### 4.8 Admin console

- Server review and deletion
- User ban / unban / management
- Moderation log review and resolution
- Report handling
- Changelog maintenance

## 5. Live page inventory

### Public / user pages

- `/`
- `/servers`
- `/search` (redirects to `/servers`)
- `/servers/{id}`
- `/servers/{id}/apply`
- `/servers/{id}/join/{code}`
- `/servers/{id}/edit`
- `/servers/{id}/modpacks`
- `/submit`
- `/favorites`
- `/notifications`
- `/u/{misskeyId}`
- `/settings/profile`
- `/login` (Misskey MiAuth gateway)
- `/changelog`

### Console / admin pages

- `/console`
- `/console/{serverId}` (Overview tab, default)
- `/console/{serverId}/settings`
- `/console/{serverId}/members`
- `/console/{serverId}/integration`
- `/my-servers` (legacy redirect)
- `/admin`
- `/admin/servers`
- `/admin/users`
- `/admin/reports`
- `/admin/moderation`
- `/admin/changelog`

## 6. Non-functional requirements

### 6.1 Security

- Server address validation continues to block localhost and private IPs
- Every write operation must enforce permission on the server
- API keys are shown once; only a hash is stored
- The cross-domain Misskey login ticket (`MISSKEY_TICKET_SECRET`) is signed with HMAC-SHA256, expires after 60s, and is one-shot consumed via Redis to prevent replay
- Reports must have deduplication, abuse prevention, and reputation-based rate limiting

### 6.2 Performance

- Page requests do not ping servers directly
- Workers asynchronously write cached online status and player counts
- High-frequency lists avoid N+1 queries
- Favorite state and membership should be read in batches
- Whitelist sync must not block primary page rendering

### 6.3 Maintainability

- Live documentation must be updated alongside live routes and APIs
- `AGENTS.md` and `CLAUDE.md` must stay in sync
- Old forum documents must not bleed back into live descriptions
- Dependency pins and upgrade limits are recorded in `docs/dependency-pins.md`

### 6.4 Internationalization

- The platform is Chinese-first today; English is a drafted locale at parity with the Chinese key set (`messages/zh.json` and `messages/en.json`), and `User.locale` persists the per-user preference. Real English translations are deferred — the product decision is to keep keys populated with Chinese placeholders until a translator pass lands.
- `next-intl` owns locale resolution (request headers / cookie / fallback) and render-time formatting.
- Path-based locale routing (`/en/...`), in-app language switcher UI, and localized date / number formatting are explicit follow-ups, not live features.
- Full extraction policy, server-side helpers, and residual exemptions are documented in `docs/i18n.md`.

## 7. Current constraints and known boundaries

- The product today is scoped around the server system only; it no longer hosts a forum.
- The search entry is simplified to server search — no mixed search across posts, circles, or topics.
- The user profile page is a server-centric public page and no longer surfaces post or circle history.
- Admin and notification models are maintained with server-only semantics.

## 8. Principles for future evolution

New requirements must first answer two questions:

1. Does it still serve the core server-only product goal?
2. Will it reintroduce the complexity surface of the forum era without a clear migration and maintenance budget?

If the answer is unclear, the feature does not enter the live PRD for this branch by default.
