FROM node:24-alpine AS base

ARG ESBUILD_VERSION=0.27.3

# Stage 1: Build application
FROM base AS builder
ARG ESBUILD_VERSION
ARG S3_BUCKET=""
ARG S3_REGION=""
ARG S3_ENDPOINT=""
ARG S3_PUBLIC_BASE_URL=""
ARG S3_FORCE_PATH_STYLE=""
ARG OSS_BUCKET=""
ARG OSS_REGION=""
ARG OSS_ENDPOINT=""
ARG OSS_PUBLIC_BASE_URL=""
ARG OSS_FORCE_PATH_STYLE=""
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
ENV S3_BUCKET="${S3_BUCKET}"
ENV S3_REGION="${S3_REGION}"
ENV S3_ENDPOINT="${S3_ENDPOINT}"
ENV S3_PUBLIC_BASE_URL="${S3_PUBLIC_BASE_URL}"
ENV S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE}"
ENV OSS_BUCKET="${OSS_BUCKET}"
ENV OSS_REGION="${OSS_REGION}"
ENV OSS_ENDPOINT="${OSS_ENDPOINT}"
ENV OSS_PUBLIC_BASE_URL="${OSS_PUBLIC_BASE_URL}"
ENV OSS_FORCE_PATH_STYLE="${OSS_FORCE_PATH_STYLE}"

RUN pnpm build

# esbuild binary is unavailable via pnpm strict mode; install globally
RUN npm install -g esbuild@${ESBUILD_VERSION} && \
    esbuild src/worker/index.ts \
    --bundle \
    --platform=node \
    --target=node24 \
    --outfile=dist/worker.js \
    --tsconfig=tsconfig.json \
    --external:@prisma/client

RUN esbuild src/ws/index.ts \
    --bundle \
    --platform=node \
    --target=node24 \
    --outfile=dist/ws-server.js \
    --tsconfig=tsconfig.json \
    --external:@prisma/client

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

# WS server bundle
COPY --from=builder --chown=nextjs:nodejs /app/dist/ws-server.js ./ws-server.js

# Prisma schema (for migrations)
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000
EXPOSE 3001
ENV PORT=3000
ENV WS_PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
