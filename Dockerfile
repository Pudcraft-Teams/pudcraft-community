FROM node:22-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile

# Stage 2: Build application
FROM base AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
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

RUN pnpm build
RUN pnpm exec esbuild src/worker/index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --outfile=dist/worker.js \
    --tsconfig=tsconfig.json \
    --external:@prisma/client

# Stage 3: Production runner
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
