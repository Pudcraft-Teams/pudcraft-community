FROM node:24-alpine AS base

# Stage 1: Build application
FROM base AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Dummy env vars for Next.js build-time page collection (not used at runtime)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="build-time-placeholder-key-32chars"
ENV REDIS_HOST="localhost"
ENV SMTP_HOST="localhost"
ENV SMTP_PORT="465"
ENV SMTP_USER="build@example.com"
ENV SMTP_PASS="dummy"
ENV SMTP_FROM="Build <build@example.com>"

RUN pnpm build && pnpm run build:worker

# Stage 2: Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Worker bundle
COPY --from=builder --chown=nextjs:nodejs /app/dist/worker.js ./worker.js

# Prisma schema (for migrations)
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
