# VPS deployment setup

This document records the manual steps needed to deploy Pudcraft Community on a VPS for the first time.

## Prerequisites

- Docker and Docker Compose installed on the VPS
- 1Panel (optional, for container management)
- GitHub repository Actions secrets configured

---

## 1. Generate an SSH deploy key

On your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key
ssh-copy-id -i ~/.ssh/deploy_key.pub root@VPS_IP
cat ~/.ssh/deploy_key  # copy this value into GitHub Secrets → VPS_SSH_KEY
```

## 2. Configure GitHub secrets

In the repository, open Settings → Secrets and variables → Actions and add:

| Secret | Description |
|---|---|
| `VPS_HOST` | Public IP of the VPS |
| `VPS_USER` | SSH username (e.g. `root`) |
| `VPS_SSH_KEY` | The private SSH key generated in the previous step |

> Note: GHCR login uses the built-in `GITHUB_TOKEN`, no extra configuration required.

## 3. Configure GHCR login on the VPS

Create a Personal Access Token (PAT) on GitHub:
Settings → Developer settings → Personal access tokens → Fine-grained tokens,
with the `read:packages` permission.

Then on the VPS:

```bash
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Credentials are cached in `~/.docker/config.json` and `docker compose pull` will work afterwards.

## 4. Create the deploy directory and config files

```bash
mkdir -p /opt/pudcraft
```

### 4.1 Deploy script `/opt/pudcraft/deploy.sh`

```bash
cat > /opt/pudcraft/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e
cd /opt/pudcraft
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
echo "Deployed at $(date)"
SCRIPT
chmod +x /opt/pudcraft/deploy.sh
```

### 4.2 Docker Compose `/opt/pudcraft/docker-compose.yml`

Set `IMAGE` to the real image address (e.g. `ghcr.io/pudcraft-teams/pudcraft-community:latest`).

The repo ships a `docker-compose.yml`; copy it to the VPS directly:

```bash
scp docker-compose.yml root@VPS_IP:/opt/pudcraft/
```

To override the image address, set the `IMAGE` env var:

```bash
IMAGE=ghcr.io/your-user/pudcraft-community docker compose up -d
```

> The compose file defines three application services: `web` (Next.js, port 3000), `worker` (BullMQ queue), and `ws` (WebSocket whitelist sync, port 3001).

### 4.3 Environment variables `/opt/pudcraft/.env.production`

```bash
# Database (container network; use service name as host)
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@postgres:5432/pudcraft"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_PASSWORD

# Redis
REDIS_URL="redis://redis:6379"

# NextAuth
NEXTAUTH_SECRET="generate with: openssl rand -base64 32"

# Object storage (fill in with real values)
STORAGE_DRIVER=s3
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=

# Feishu email SMTP
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# WebSocket (plugin whitelist sync)
WS_PUBLIC_URL=wss://your-domain
```

## 5. First deploy

```bash
cd /opt/pudcraft

# Pull images and start
docker compose pull
docker compose up -d

# Run database migrations
docker compose exec web npx prisma migrate deploy

# Check service status
docker compose ps
curl http://localhost:3000/api/health
```

## 6. Database migrations

Prisma migrations **do not** run automatically on every deploy. When the schema changes:

```bash
# SSH into the VPS and run manually
docker compose exec web npx prisma migrate deploy
```

To auto-run migrations, add this before `docker compose up` in `deploy.sh`:

```bash
docker compose run --rm web npx prisma migrate deploy
```

> Note: automatic migrations carry risk; validate significant changes in a staging environment first.

## 7. Operational commands

```bash
# Tail logs
docker compose logs -f web
docker compose logs -f worker
docker compose logs -f ws

# Restart a single service
docker compose restart web

# Roll back to a specific version (using commit SHA tag)
# Edit the image tag in docker-compose.yml to the desired SHA, then:
docker compose pull && docker compose up -d

# Shell into a container
docker compose exec web sh
```
