**English** | [简体中文](./README.zh-CN.md)

# Pudcraft Community

A Minecraft server community platform. Players can browse, submit, claim, comment on, and favorite servers, as well as download modpacks that server owners publish.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5 (strict)
- Tailwind CSS 3
- PostgreSQL + Prisma ORM
- NextAuth v5 (Credentials + JWT session)
- Redis + BullMQ
- Standalone WebSocket service (whitelist-sync push)
- Nodemailer
- Zod
- pnpm

## Local development

### Prerequisites

- Node.js 20.9+
- pnpm 10+
- Docker and Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

`postinstall` will run `prisma generate` automatically.

### 2. Start PostgreSQL and Redis

```bash
docker compose up -d
docker compose ps
```

Default ports:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 3. Configure environment variables

```bash
cp .env.example .env
```

For local development the defaults in `.env.example` work as-is; in production use real secrets and service endpoints.

### 4. Initialize the database

```bash
pnpm db:migrate --name init_local
```

Use Prisma migrations for subsequent schema changes. Never use `db push` in production.

### 5. Start the app and worker

Two terminals in development:

```bash
pnpm dev
```

```bash
pnpm worker:dev
```

`web` serves pages and APIs; `worker` runs Minecraft-status probing and claim verification jobs.

## Common commands

| Command                         | Description                                |
| ------------------------------- | ------------------------------------------ |
| `pnpm dev`                      | Start the Next.js dev server               |
| `pnpm build`                    | Build production bundle                    |
| `pnpm start`                    | Run the production server                  |
| `pnpm lint`                     | Run ESLint                                 |
| `pnpm format`                   | Format `src/` with Prettier                |
| `pnpm format:check`             | Check `src/` formatting                    |
| `pnpm db:migrate --name <name>` | Create and apply a Prisma migration        |
| `pnpm db:generate`              | Regenerate the Prisma client               |
| `pnpm db:studio`                | Open Prisma Studio                         |
| `pnpm db:push`                  | Dev-only quick schema sync                 |
| `pnpm worker`                   | Start the worker                           |
| `pnpm worker:dev`               | Start the worker in watch mode             |
| `pnpm ws`                       | Start the whitelist-sync WebSocket service |
| `pnpm ws:dev`                   | Start the WebSocket service in watch mode  |
| `pnpm test`                     | Run the `tsx --test` test suite            |
| `pnpm sync:favorite-counts`     | Reconcile favorite counts                  |
| `pnpm storage:check`            | Check object-storage behavior              |

## Core environment variables

### Basic

| Variable          | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string                                         |
| `NEXTAUTH_SECRET` | NextAuth secret                                                      |
| `NEXTAUTH_URL`    | Set explicitly when self-hosting in production                       |
| `LOG_LEVEL`       | `debug` / `info` / `warn` / `error`; invalid values fall back to `info` |

### Redis

Either:

- `REDIS_URL`
- `REDIS_HOST` + `REDIS_PORT` (optional `REDIS_PASSWORD`)

Application rate-limiting, verification codes, and the BullMQ queues share the same Redis resolver.

### Email

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

### File storage

- `STORAGE_DRIVER=local|s3|oss`
- When using an S3-compatible backend, set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_ACCESS_KEY_SECRET`, plus either `S3_ENDPOINT` or `S3_REGION`

### Reverse-proxy client IP

| Variable                   | Description                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `TRUSTED_PROXY_IP_HEADER`  | Optional. Trusted client-IP header used for rate-limiting; when unset, falls back to `x-real-ip`, `cf-connecting-ip`, `x-vercel-forwarded-for` in that order |

## Project layout

```text
src/
├── app/                # Next.js pages and API Routes
├── components/         # Reusable UI components
├── hooks/              # Custom hooks
├── lib/                # Utilities, auth, queues, storage wrappers
├── styles/             # Global styles
├── types/              # Type declarations
├── worker/             # BullMQ workers and scheduler
└── ws/                 # Whitelist-sync WebSocket service
prisma/
├── migrations/         # Prisma migrations
└── schema.prisma       # Data model
```

## Runtime boundaries

- Pages and APIs never ping Minecraft servers directly; they read cached fields from the database
- The `server-ping` queue probes approved servers every 5 minutes
- The `server-verify` queue handles MOTD claim verification
- Unapproved servers are not publicly accessible; owners and admins are the exception

## Pre-commit checks

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
```

Also confirm no `.env*` files are staged.
