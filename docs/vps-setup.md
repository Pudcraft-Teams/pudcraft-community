# VPS 部署初始化指南

本文档记录在 VPS 上首次部署 Pudcraft Community 所需的手动步骤。

## 前置要求

- VPS 已安装 Docker 和 Docker Compose
- 已安装 1Panel（可选，用于管理容器）
- GitHub 仓库已配置 Actions Secrets

---

## 1. 生成 SSH 部署密钥

在本地机器上执行：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key
ssh-copy-id -i ~/.ssh/deploy_key.pub root@VPS_IP
cat ~/.ssh/deploy_key  # 复制内容填到 GitHub Secrets → VPS_SSH_KEY
```

## 2. 配置 GitHub Secrets

进入仓库 Settings → Secrets and variables → Actions，添加：

| Secret 名称 | 说明 |
|---|---|
| `VPS_HOST` | VPS 公网 IP |
| `VPS_USER` | SSH 用户名（如 `root`） |
| `VPS_SSH_KEY` | 上一步生成的 SSH 私钥内容 |

> 注：GHCR 登录使用内置 `GITHUB_TOKEN`，无需额外配置。

## 3. VPS 上配置 GHCR 登录

在 GitHub 生成 Personal Access Token（PAT）：
Settings → Developer settings → Personal access tokens → Fine-grained tokens，
权限勾选：`read:packages`

然后在 VPS 上执行：

```bash
echo "你的PAT" | docker login ghcr.io -u 你的GitHub用户名 --password-stdin
```

登录后凭据缓存在 `~/.docker/config.json`，之后 `docker compose pull` 可正常拉取。

## 4. 创建部署目录和配置文件

```bash
mkdir -p /opt/pudcraft
```

### 4.1 部署脚本 `/opt/pudcraft/deploy.sh`

```bash
cat > /opt/pudcraft/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e
cd /opt/pudcraft
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
echo "✅ Deployed at $(date)"
SCRIPT
chmod +x /opt/pudcraft/deploy.sh
```

### 4.2 Docker Compose `/opt/pudcraft/docker-compose.yml`

将 `IMAGE` 替换为实际镜像地址（如 `ghcr.io/hepudding/pudcraft-community:latest`）。

```yaml
services:
  web:
    image: IMAGE:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    image: IMAGE:latest
    restart: unless-stopped
    command: ["node", "worker.js"]
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    env_file: .env.production
    environment:
      POSTGRES_DB: pudcraft
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-postgres}"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

### 4.3 环境变量 `/opt/pudcraft/.env.production`

```bash
# 数据库（容器内网络，host 用服务名）
DATABASE_URL="postgresql://postgres:你的密码@postgres:5432/pudcraft"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=你的密码

# Redis
REDIS_URL="redis://redis:6379"

# NextAuth
NEXTAUTH_SECRET="用 openssl rand -base64 32 生成"

# 对象存储（按实际填写）
STORAGE_DRIVER=s3
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=

# 飞书邮件 SMTP
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## 5. 首次部署

```bash
cd /opt/pudcraft

# 拉取镜像并启动
docker compose pull
docker compose up -d

# 执行数据库迁移
docker compose exec web npx prisma migrate deploy

# 检查服务状态
docker compose ps
curl http://localhost:3000/api/health
```

## 6. 数据库迁移说明

Prisma 迁移**不会**在每次部署时自动执行。如果有 schema 变更：

```bash
# SSH 进 VPS 后手动执行
docker compose exec web npx prisma migrate deploy
```

如需自动迁移，可在 `deploy.sh` 的 `docker compose up` 之前添加：

```bash
docker compose run --rm web npx prisma migrate deploy
```

> 注意：自动迁移有风险，建议重大变更前先在测试环境验证。

## 7. 常用运维命令

```bash
# 查看日志
docker compose logs -f web
docker compose logs -f worker

# 重启单个服务
docker compose restart web

# 回滚到指定版本（使用 commit SHA tag）
# 修改 docker-compose.yml 中 image tag 为具体 SHA，然后：
docker compose pull && docker compose up -d

# 进入容器调试
docker compose exec web sh
```
