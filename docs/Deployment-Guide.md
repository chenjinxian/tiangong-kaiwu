# LubanCAD 部署指南

## 概述

LubanCAD 使用 **imodelhub-services 模式**，所有服务在本地或私有环境运行，**不依赖 Bentley iTwin Platform 云服务**。

## 服务架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LubanCAD 部署架构                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌─────────────────┐    ┌──────────────────────────────────────┐  │
│  │   Web    │───▶│ modeling-server │───▶│      imodelhub-services              │  │
│  │  (3000)  │◀───│  (4001)         │◀───│         (4000)                       │  │
│  └──────────┘    └────┬────────────┘    └──────────────────────────────────────┘  │
│                       │                                                     │
│                       ▼                                                     │
│              ┌──────────────────┐                                          │
│              │     azurite      │  Azure Blob Storage 模拟器               │
│              │  (10000/1/2)     │                                          │
│              └──────────────────┘                                          │
│                                                                             │
│  ┌────────────────┐                                                             │
│  │ webhook-agent  │  Webhook 接收器 + Baseline 生成器 (必需)                     │
│  │   (4002)       │                                                             │
│  └────────────────┘                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 服务列表

| 服务 | 端口 | 说明 | 必需 |
|-----|------|------|------|
| PostgreSQL | 5432 | imodelhub-services 数据库 | 是 |
| azurite | 10000 | Azure Blob 存储模拟器 | 是 |
| imodelhub-services | 4000 | iModel 管理服务 | 是 |
| modeling-server | 4001 | LubanCAD 后端 | 是 |
| Web | 3000 | 前端应用 | 是 |
| Webhook-Agent | 4002 | Webhook 接收器 + Baseline 生成 | 是 |

### Webhook-Agent 为什么是必需的？

**核心功能**: 当用户创建空 iModel 时，imodelhub-services 会发送 `iModelCreated` webhook 事件。Webhook-Agent 必须处理此事件并生成 baseline 文件：

1. **接收 Webhook**: 从 imodelhub-services 接收 `iModelCreated` 事件
2. **生成 Baseline**: 使用 `SnapshotDb.createEmpty()` 创建空 iModel 基线文件
3. **上传存储**: 将 baseline.bim 上传到 Azurite Blob 存储
4. **通知完成**: 调用 imodelhub-services API 标记 iModel 初始化完成

**如果不启动 Webhook-Agent**:
- 创建空 iModel 后会一直显示 "初始化中" 状态
- iModel 无法打开（因为没有 baseline 文件）
- 用户上传的 baseline 文件也无法正确处理

**注意**: Webhook-Agent 和 modeling-server 需要相同的 `WEBHOOK_SECRET` 环境变量。

### Baseline 补偿任务 (自动故障恢复)

为避免 iModel 因 webhook-agent 临时故障而卡在初始化状态，系统部署了自动补偿机制：

**BaselineCompensationJob**:
- 每 2 分钟扫描数据库，检测状态异常 iModel
- 自动重新触发 baseline 生成
- 批量处理（每次最多 10 个），避免系统过载

**查看补偿状态**:
```bash
curl http://localhost:4000/imodels/admin/compensation-status \
  -H "X-API-Key: internal-api-key-for-webhook-agent"
```

## 前置要求

- Node.js 20.x+
- pnpm 10.x（lockfile 为 lockfileVersion 9.0；pnpm 12 的默认供应链策略会拒绝安装。本机未装 pnpm 时可用 `corepack pnpm@10`）
- Rush（仅 itwinjs-core 底座需要，经 `node common/scripts/install-run-rush.js` 调用，无需全局安装）
- Docker (用于 PostgreSQL 和 Azurite)
- imodelhub-services (仓外项目，单独部署)

## 开发环境部署

### 1. 安装依赖

```bash
# 0. 首次或改动 itwinjs-core 后：构建底座依赖包（在 itwinjs-core/ 内）
cd itwinjs-core
node common/scripts/install-run-rush.js update
node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend --to @itwin/editor-backend --to @itwin/editor-frontend --to @itwin/presentation-frontend --to @itwin/presentation-common --to @itwin/appui-abstract --to @itwin/ecschema-metadata --to @itwin/ecschema-rpcinterface-common --to @itwin/core-i18n --to @itwin/core-quantity

# 1. 应用各项目（pnpm；link: 源码消费 itwinjs-core）
cd luban-cad && pnpm install && pnpm -r build
cd ../modeling-server && pnpm install && pnpm build
cd ../webhook-agent && pnpm install && pnpm build
```

### 2. 启动 Azurite

```bash
# Azurite/PostgreSQL 定义在 dev compose（基础 docker-compose.yml 不含这两项）
docker-compose -f docker-compose.dev.yml up -d azurite
```

验证 Azurite:
```bash
curl http://localhost:10000/devstoreaccount1?comp=list
```

### 3. 配置环境变量

#### modeling-server (`modeling-server/.env`)

```env
PORT=4001
IMODELHUB_URL=http://localhost:4000
AZURITE_HOST=127.0.0.1:10000
AZURITE_ACCOUNT_NAME=devstoreaccount1
FRONTEND_URL=http://localhost:3000
IMJS_BRIEFCASE_CACHE_LOCATION=./briefcase-cache
WEBHOOK_SECRET=your-webhook-secret
IMODELHUB_ADMIN_EMAIL=admin@example.com
IMODELHUB_ADMIN_PASSWORD=secret
```

#### Frontend (`luban-cad/apps/web/.env`)

```env
VITE_API_URL=http://localhost:4001
VITE_IMODELHUB_URL=http://localhost:4000
VITE_AZURITE_URL=http://localhost:10000
```

#### Webhook-Agent (`webhook-agent/.env`)

```env
PORT=4002
BACKEND_URL=http://localhost:4001
WEBHOOK_SECRET=your-webhook-secret
```

### 4. 启动服务

分别在三个终端启动：

```bash
# 终端 1: modeling-server
cd modeling-server && pnpm dev

# 终端 2: Webhook-Agent (必需 - baseline 生成)
cd webhook-agent && pnpm dev

# 终端 3: Frontend
cd luban-cad/apps/web && pnpm dev
```

访问: http://localhost:3000

## Docker 部署

### 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 包含 Webhook-Agent
docker-compose --profile with-webhook-agent up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

### docker-compose.yml（示意精简版；实际以仓库 `docker-compose.yml` 为准——Azurite/PostgreSQL 由 `docker-compose.dev.yml` 或 imodelhub-services 侧启动）

```yaml
version: '3.8'

services:
  azurite:
    image: mcr.microsoft.com/azure-storage/azurite:latest
    container_name: luban-cad-azurite
    ports:
      - "10000:10000"
      - "10001:10001"
      - "10002:10002"
    volumes:
      - azurite-data:/data
    command: "azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0"
    networks:
      - luban-cad-network

  modeling-server:
    build:
      context: .
      dockerfile: modeling-server/Dockerfile
    container_name: luban-cad-modeling-server
    ports:
      - "4001:4001"
    environment:
      - NODE_ENV=production
      - PORT=4001
      - IMODELHUB_URL=http://host.docker.internal:4000
      - AZURITE_URL=http://azurite:10000
      - FRONTEND_URL=http://localhost:3000
      - IMJS_BRIEFCASE_CACHE_LOCATION=/app/cache
      - WEBHOOK_SECRET=your-webhook-secret
    volumes:
      - modeling-server-cache:/app/cache
    depends_on:
      - azurite
    networks:
      - luban-cad-network
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

  webhook-agent:
    build:
      context: .
      dockerfile: webhook-agent/Dockerfile
    container_name: luban-cad-webhook-agent
    ports:
      - "4002:4002"
    environment:
      - NODE_ENV=production
      - PORT=4002
      - BACKEND_URL=http://modeling-server:4001
      - WEBHOOK_SECRET=your-webhook-secret
    depends_on:
      - modeling-server
    networks:
      - luban-cad-network
    restart: unless-stopped
    profiles:
      - with-webhook-agent

  web:
    build:
      context: .
      dockerfile: luban-cad/apps/web/Dockerfile
    container_name: luban-cad-web
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:4001
      - VITE_IMODELHUB_URL=http://localhost:4000
      - VITE_AZURITE_URL=http://localhost:10000
    depends_on:
      - modeling-server
    networks:
      - luban-cad-network
    restart: unless-stopped

volumes:
  azurite-data:
  modeling-server-cache:

networks:
  luban-cad-network:
    driver: bridge
```

## 生产环境部署

### 1. 构建生产镜像

```bash
# 构建所有镜像（仓库无单独的 prod compose，直接使用 docker-compose.yml）
docker-compose build

# 推送镜像到仓库
docker tag luban-cad-web:latest your-registry/luban-cad-web:v1.0
docker push your-registry/luban-cad-web:v1.0
```

### 2. 环境变量配置

生产环境需要设置以下环境变量：

```bash
# modeling-server
export PORT=4001
export IMODELHUB_URL=https://your-imodelhub-services.com
export AZURITE_URL=https://your-storage.com
export FRONTEND_URL=https://your-frontend.com
export WEBHOOK_SECRET=your-production-secret
export IMODELHUB_ADMIN_EMAIL=admin@your-domain.com
export IMODELHUB_ADMIN_PASSWORD=your-secure-password

# Frontend
export VITE_API_URL=https://your-backend.com
export VITE_IMODELHUB_URL=https://your-imodelhub-services.com
export VITE_AZURITE_URL=https://your-storage.com
```

### 3. SSL/TLS 配置

使用 Nginx 作为反向代理：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 健康检查

### 使用健康检查脚本（推荐）

项目提供 `scripts/health-check.sh` 脚本，一键检查所有服务状态：

```bash
# 运行健康检查
./scripts/health-check.sh

# 输出示例：
# ==========================================
# LubanCAD - Health Check
# ==========================================
#
# 1. Core Services
# ----------------
# Checking imodelhub-services... ✓ OK
# Checking modeling-server... ✓ OK
# Checking webhook-agent... ✓ OK
# Checking Azurite... ✓ OK
#
# 2. Webhook Configuration
# ------------------------
# Checking webhook-agent recent events... ✓ OK (events received: 5)
#
# 3. Orphaned iModels Check
# -------------------------
# Checking compensation job status... ✓ OK (no pending repairs)
#
# 4. Database Status
# ------------------
# Checking database... ✓ OK (connected)
#
# ==========================================
# Summary
# ==========================================
# All checks passed!
```

**部署前必须运行**，确保所有服务健康。

### 手动服务状态检查

```bash
# 1. 检查 Azurite
curl http://localhost:10000/devstoreaccount1?comp=list

# 2. 检查 modeling-server
curl http://localhost:4001/health

# 3. 检查 Webhook-Agent
curl http://localhost:4002/health

# 4. 检查 Frontend
curl http://localhost:3000
```

### modeling-server 健康响应

```json
{
  "status": "healthy",
  "timestamp": "2026-04-04T12:00:00.000Z",
  "version": "1.0.0",
  "websocket": {
    "connectedClients": 5,
    "endpoint": "ws://localhost:4001/ws"
  }
}
```

## 日志管理

### 查看日志

```bash
# modeling-server 日志
docker logs -f luban-cad-modeling-server

# Webhook-Agent 日志
docker logs -f luban-cad-webhook-agent

# 所有服务日志
docker-compose logs -f
```

### 日志配置

modeling-server 使用结构化日志：

```typescript
// 日志级别: debug, info, warn, error, fatal
logger.info('Operation completed', { iModelId, duration: 1234 });
logger.error('Operation failed', error, { iModelId });
```

## 备份与恢复

### 数据库备份

```bash
# PostgreSQL 备份
docker exec -t luban-cad-postgres pg_dump -U imodelhub imodelhub > backup.sql

# Azurite 数据备份
tar -czvf azurite-backup.tar.gz /var/lib/azurite
```

### 数据库恢复

```bash
# PostgreSQL 恢复
docker exec -i luban-cad-postgres psql -U imodelhub imodelhub < backup.sql

# Azurite 数据恢复
tar -xzvf azurite-backup.tar.gz -C /
```

## 故障排除

### 端口冲突

```bash
# 查找占用端口的进程
lsof -i :4000
lsof -i :4001
lsof -i :3000

# 终止进程
kill -9 <PID>
```

### 服务启动失败

1. **modeling-server 启动失败**
   - 检查 imodelhub-services 是否运行
   - 检查 Azurite 是否运行
   - 检查端口是否被占用
   - 查看日志: `docker logs luban-cad-modeling-server`

2. **Frontend 构建失败**
   - 检查 node_modules: `pnpm install`
   - 检查类型错误: `pnpm -r build`（luban-cad workspace 全量）
   - 检查环境变量: `.env` 文件

3. **RPC 调用失败**
   - 检查 modeling-server 健康状态
   - 检查网络连接
   - 查看浏览器控制台错误

4. **iModel 卡在"初始化中"**
   - 检查 webhook-agent 是否运行: `./scripts/health-check.sh`
   - 查看补偿任务状态: `curl http://localhost:4000/imodels/admin/compensation-status -H "X-API-Key: internal-api-key-for-webhook-agent"`
   - 手动触发修复: `curl -X POST http://localhost:4000/imodels/admin/repair/{id} -H "X-API-Key: internal-api-key-for-webhook-agent"`

### 数据重置

```bash
# 停止所有服务
docker-compose down

# 删除数据卷
docker volume rm luban-cad_azurite-data

# 清除 modeling-server 缓存
rm -rf modeling-server/briefcase-cache/*

# 重新启动
docker-compose up -d
```

## 性能优化

### 1. 缓存配置

```bash
# modeling-server 缓存大小限制
IMJS_BRIEFCASE_CACHE_LOCATION=/app/cache
IMJS_BRIEFCASE_CACHE_SIZE=10GB
```

### 2. 数据库优化

```sql
-- PostgreSQL 索引优化
CREATE INDEX CONCURRENTLY idx_imodels_itwinid ON imodels(iTwinId);
CREATE INDEX CONCURRENTLY idx_changesets_imodelid ON changesets(iModelId);
```

### 3. Nginx 缓存

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

## 监控与告警

### 健康检查端点

```bash
# modeling-server 健康检查
curl -f http://localhost:4001/health || echo "modeling-server unhealthy"

# 添加到 crontab
*/5 * * * * curl -f http://localhost:4001/health || echo "modeling-server down" | mail -s "Alert" admin@example.com
```

### Prometheus 指标 (可选)

```typescript
// modeling-server 可以暴露 Prometheus 指标
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});
```

## Admin API 端点

imodelhub-services 提供管理端点用于故障排查和修复（需要 API Key）：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/imodels/admin/uninitialized` | GET | 获取未初始化的 iModel 列表 |
| `/imodels/admin/repair-baselines` | POST | 修复所有失败的 baseline |
| `/imodels/admin/repair/:id` | POST | 修复特定 iModel 的 baseline |
| `/imodels/admin/compensation-status` | GET | 获取补偿任务状态 |

**认证头**: `X-API-Key: internal-api-key-for-webhook-agent`

**使用示例**:
```bash
# 查看有哪些 iModel 需要修复
curl http://localhost:4000/imodels/admin/uninitialized \
  -H "X-API-Key: internal-api-key-for-webhook-agent"

# 修复特定 iModel
curl -X POST http://localhost:4000/imodels/admin/repair/{iModelId} \
  -H "X-API-Key: internal-api-key-for-webhook-agent"

# 批量修复所有失败的 baseline
curl -X POST http://localhost:4000/imodels/admin/repair-baselines \
  -H "X-API-Key: internal-api-key-for-webhook-agent"
```

## 安全加固

### 1. 防火墙配置

```bash
# 只允许必要的端口
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

### 2. 环境变量保护

```bash
# 使用 Docker Secrets 或环境变量文件
# 不要提交 .env 文件到版本控制
echo ".env" >> .gitignore
```

### 3. Webhook Secret

```bash
# 生成强密码
openssl rand -base64 32

# 确保一致
# modeling-server/.env 和 webhook-agent/.env 中的 WEBHOOK_SECRET 必须相同
```

## 更新部署

### 滚动更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建（应用各项目；itwinjs-core 有变更时先 rush build --to …）
cd luban-cad && pnpm -r build
cd ../modeling-server && pnpm build
cd ../webhook-agent && pnpm build

# 3. 重启服务
docker-compose up -d --build
```

### 数据库迁移

```bash
# 在 imodelhub-services 目录
npm run migration:run
```

## 总结

**必需服务清单**:

| 服务 | 端口 | 必需 | 说明 |
|------|------|------|------|
| PostgreSQL | 5432 | ✅ | 数据库 |
| Azurite | 10000 | ✅ | Blob 存储 |
| imodelhub-services | 4000 | ✅ | 核心 API |
| modeling-server | 4001 | ✅ | CAD 服务 |
| Frontend | 3000 | ✅ | Web 应用 |
| Webhook-Agent | 4002 | ✅ | Webhook + Baseline 生成 |

**访问地址**:
- Frontend: http://localhost:3000
- modeling-server Health: http://localhost:4001/health
- modeling-server WebSocket: ws://localhost:4001/ws
- modeling-server RPC: http://localhost:4001/rpc/metadata

---

*文档版本: 2.2*
*最后更新: 2026-09-22（校对：端口/健康检查/补偿任务/Admin API 与实测一致；Azurite 启动改用 docker-compose.dev.yml；修正不存在的 prod compose 引用）*
