**English** | [简体中文](./README.zh-CN.md)

# Pudcraft Community

A Minecraft server community platform. Players browse, comment on, favorite, and apply to join Minecraft servers; server owners submit and manage their servers through the owner console; identities are sourced from a self-hosted Misskey instance via MiAuth (no local credentials, no email/password).

> **Status: pre-launch.** The first public release is still in progress.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5 (strict)
- Tailwind CSS 3 + Warm Clay UI
- PostgreSQL + Prisma ORM 6
- NextAuth v5 (JWT session) backed by Misskey MiAuth
- Redis + BullMQ
- Standalone WebSocket service (whitelist-sync push)
- next-intl (zh / en)
- Zod
- pnpm 10

## Quick start

```bash
git clone <repo-url> pudcraft-community
cd pudcraft-community
pnpm install

# Local Postgres + Redis (the repo-root docker-compose.yml is for production)
docker run -d --name pudcraft-pg \
  -e POSTGRES_DB=pudcraft -e POSTGRES_USER=pudcraft -e POSTGRES_PASSWORD=pudcraft_dev \
  -p 5432:5432 postgres:16-alpine
docker run -d --name pudcraft-redis -p 6379:6379 redis:7-alpine

cp .env.example .env       # set MISSKEY_HOST, MISSKEY_TICKET_SECRET, NEXTAUTH_SECRET
pnpm db:migrate

pnpm dev          # web
pnpm worker:dev   # background worker (in another terminal)
pnpm ws:dev       # whitelist-sync WebSocket (only when working on plugin integration)
```

Full setup including Misskey configuration, single-test invocation, and troubleshooting: see [`docs/dev/setup.md`](./docs/dev/setup.md).

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Build & run production bundle |
| `pnpm worker` / `pnpm worker:dev` | Background worker (server-ping) |
| `pnpm ws` / `pnpm ws:dev` | Whitelist-sync WebSocket service |
| `pnpm lint` | ESLint |
| `pnpm tsc --noEmit` | Type check |
| `pnpm test` | Test suite (`tsx --test`, env-loaded from `.env.example`) |
| `pnpm i18n:check` | Verify zh/en message-key parity |
| `pnpm db:migrate` / `pnpm db:generate` / `pnpm db:studio` | Prisma migrations / client / GUI |

## Core environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Set explicitly when self-hosting in production |
| `MISSKEY_HOST` | Self-hosted Misskey instance hostname (no scheme/slash) |
| `MISSKEY_TICKET_SECRET` | HMAC secret for the cross-domain login ticket (`openssl rand -hex 32`) |
| `STORAGE_DRIVER` | `local` (default) or `s3` for S3-compatible object storage |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; invalid values fall back to `info` |

S3 / object storage and content-moderation (Aliyun Green) variables are documented in [`.env.example`](./.env.example).

## Runtime boundaries

- Pages and APIs never ping Minecraft servers directly; they read cached fields written by the worker.
- The worker periodically refreshes `isOnline` / `playerCount` / `maxPlayers` for approved servers.
- The WebSocket service is only required for whitelist-sync push to plugin clients; web/worker work without it.
- Unapproved or non-public servers are not publicly accessible — owners and admins are the exceptions.

## Documentation

This repo currently uses plain Markdown docs (no doc site yet):

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — first-time contributors start here
- [`docs/README.md`](./docs/README.md) — full documentation index
- [`docs/dev/setup.md`](./docs/dev/setup.md), [`architecture.md`](./docs/dev/architecture.md), [`data-model.md`](./docs/dev/data-model.md) — contributor docs
- [`docs/API.md`](./docs/API.md) — REST API contract
- [`docs/i18n.md`](./docs/i18n.md) — i18n conventions
- [`docs/dependency-pins.md`](./docs/dependency-pins.md) — dependency-pin policy

`CLAUDE.md` and `AGENTS.md` are guidelines for AI coding assistants (Claude Code, Codex, Cursor, etc.). **Human contributors do not need to read them.**

## Pre-commit checks

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
# pnpm i18n:check   # if you touched messages/*.json
```

Confirm no `.env*` files are staged.

## License

[GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0). If you run a modified copy of this software as a network service, you must offer your modified source to the users of that service.
