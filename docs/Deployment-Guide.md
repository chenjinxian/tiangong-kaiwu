# LubanCAD 部署指南

## 概述

LubanCAD 使用 **imodelhub-services 模式**，所有服务在本地或私有环境运行，**不依赖 Bentley iTwin Platform 云服务**。

**后端私有化（2026-10-01）**：后端源码在私有仓 **luban-backend**，本仓只**消费产物**——imodelhub / webhook-agent 为 **GHCR 镜像**，modeling-server 以 **GitHub Releases 产物**（`dist-backend\`）在宿主进程运行。

## 统一部署链路（部署权威：根 `docker-compose.yml`）

```bash
powershell -File scripts/generate-env.ps1            # 0) 仓库根 .env（幂等；密钥缺失拒启）
powershell -File scripts/fetch-backend.ps1           # 1) Releases 拉 MS 产物 tgz→dist-backend\ + docker compose pull（GHCR 镜像）
docker compose up -d                                 # 2) 栈：imodelhub/WA/web/nginx + 基础设施
powershell -File scripts/start-ms-host.ps1 -Detach   # 3) 宿主 MS :4001（产物模式）
powershell -File scripts/verify-stack.ps1            # 4) 全栈验收
```

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

**镜像/产物来源（后端私有化）**：

| 服务 | 来源 |
|---|---|
| imodelhub | **GHCR 镜像** `ghcr.io/chenjinxian/imodelhub:latest`（构建在私有仓 luban-backend） |
| webhook-agent | **GHCR 镜像** `ghcr.io/chenjinxian/luban-webhook-agent:latest`（构建在私有仓 luban-backend） |
| modeling-server | **GitHub Releases 产物** `modeling-server-win-x64-*.tgz`（`scripts/fetch-backend.ps1` 解压到 `dist-backend\`，`scripts/start-ms-host.ps1` 宿主运行） |
| web | 本仓构建（`luban-cad/Dockerfile`） |
| postgres / redis / maildev / azurite / nginx | 官方镜像 |

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

- Docker Desktop（栈：PostgreSQL/Azurite/Redis/Maildev + GHCR 镜像 + web/nginx）
- gh CLI（已登录，且可读 `chenjinxian/tiangong-kaiwu` 的 Releases——`scripts/fetch-backend.ps1` 拉 MS 产物用）
- Node.js 20.x + pnpm 10.x（仅前端/itwinjs-core 开发需要；lockfile 为 lockfileVersion 9.0，pnpm 12 供应链策略会拒装，用 `corepack pnpm@10`）
- Rush（仅 itwinjs-core 底座需要，经 `node common/scripts/install-run-rush.js` 调用，无需全局安装）
- imodelhub-services / luban-backend 源码检出**非必需**（栈内消费 GHCR 镜像与 Releases 产物；后端源码开发见私有仓 luban-backend README）

## 开发环境部署

### 1. 安装依赖

```bash
# 0. 首次或改动 itwinjs-core 后：构建底座依赖包（在 itwinjs-core/ 内）
cd itwinjs-core
node common/scripts/install-run-rush.js update
node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend --to @itwin/editor-backend --to @itwin/editor-frontend --to @itwin/presentation-frontend --to @itwin/presentation-common --to @itwin/appui-abstract --to @itwin/ecschema-metadata --to @itwin/ecschema-rpcinterface-common --to @itwin/core-i18n --to @itwin/core-quantity

# 1. 前端应用（pnpm；link: 源码消费 itwinjs-core）
cd luban-cad && pnpm install && pnpm -r build

# 1'. 后端源码开发仅在私有仓 luban-backend 检出后进行（本仓不检出也能跑：
#     走产物分发，见「统一部署链路」）；源码 dev/test/lint 流程见该私有仓 README
```

### 2. 启动基础设施（Azurite 等）

```bash
# Azurite/PostgreSQL/Redis/Maildev 均在根 compose 内
docker compose up -d azurite postgres redis maildev
```

验证 Azurite:
```bash
curl http://localhost:10000/devstoreaccount1?comp=list
```

### 3. 配置环境变量

统一栈的环境变量**单源在仓库根 `.env`**（`scripts/generate-env.ps1` 幂等生成；compose 插值与服务级 `env_file` 均读它，密钥缺失会拒启）。密钥项：`IMODELHUB_API_KEY` / `WEBHOOK_SECRET` / `AUTH_JWT_SECRET` / `IMODELHUB_ADMIN_PASSWORD` / `AZURITE_ACCOUNT_KEY` 等（私有仓后端运行时亦读仓库根这一份 `.env`，见其 README）。

前端开发态用 `luban-cad/apps/web/.env.development`（已入库，直连 :4001）。

### 4. 启动服务

```bash
# 栈（imodelhub/WA/web/nginx + 基础设施，GHCR 镜像零后端构建）
docker compose up -d

# 终端 1: 宿主 modeling-server（产物模式；源码调试加 -Source 指私有仓检出）
powershell -File scripts/start-ms-host.ps1 -Detach

# 终端 2: Webhook-Agent 随 compose 容器运行（GHCR 镜像，无需本地起）
#   单独重启：docker compose restart webhook-agent

# 终端 3: Frontend（开发态）
cd luban-cad/apps/web && pnpm dev
```

访问: http://localhost:3000

## Docker 部署

### 使用 Docker Compose

```bash
# 启动所有服务（后端镜像来自 GHCR；MS 为宿主进程，另行 start-ms-host.ps1）
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

### docker-compose.yml（部署权威：仓库根 `docker-compose.yml`，后端零 build）

compose 内 **8 个服务**，镜像来源如下；MS 不占 compose 服务位（宿主进程）：

| 服务 | 来源 | 端口 |
|---|---|---|
| postgres | 官方 `postgres:17-alpine` | 5432（栈内） |
| redis | 官方 `redis:7-alpine` | 6379（栈内） |
| maildev | 官方 `maildev/maildev` | 1025（栈内） |
| azurite | 官方 `mcr.microsoft.com/azure-storage/azurite` | 10000-10002 |
| imodelhub | **GHCR** `ghcr.io/chenjinxian/imodelhub:latest` | 4000 |
| webhook-agent | **GHCR** `ghcr.io/chenjinxian/luban-webhook-agent:latest` | 4002 |
| web | 本仓构建（`luban-cad/Dockerfile`） | 3000（栈内） |
| nginx | 官方 `nginx:alpine`（单域名入口） | 80 |
| modeling-server | **非 compose 服务**：宿主进程，`scripts/start-ms-host.ps1` 跑 `dist-backend\` 产物 | 4001 |

## 生产环境部署

### 1. 拉取产物与镜像

```bash
# 后端镜像（GHCR）+ MS 产物（Releases）一键拉齐，幂等
powershell -File scripts/fetch-backend.ps1

# web 镜像由 compose 按本仓源码构建；其余服务均为官方/GHCR 镜像
# （后端镜像的构建/发布属私有仓 luban-backend 的事务，不在本仓）
```

### 2. 环境变量配置

生产环境的密钥/拓扑变量**单源在仓库根 `.env`**（`scripts/generate-env.ps1` 生成骨架后手工改值；compose 与后端服务均读它）。主要项：

```bash
# 仓库根 .env（compose 插值 + 服务级 env_file 单源）
IMODELHUB_API_KEY=<internal-api-key>          # WA↔HUB
WEBHOOK_SECRET=<strong-secret>                # WA↔MS 必须一致（同源天然一致）
AUTH_JWT_SECRET=<strong-secret>
IMODELHUB_ADMIN_EMAIL=admin@your-domain.com
IMODELHUB_ADMIN_PASSWORD=<secure-password>
AZURITE_ACCOUNT_KEY=<key>

# Frontend（构建期注入；本地开发用 .env.development，已入库）
VITE_API_URL=https://your-backend.com
VITE_IMODELHUB_URL=https://your-imodelhub-services.com
VITE_AZURITE_URL=https://your-storage.com
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
# modeling-server 日志（宿主进程；start-ms-host.ps1 -Detach 重定向）
#   %TEMP%\luban-cad-modeling-server.log（.err 为错误流）

# Webhook-Agent 日志（GHCR 镜像容器）
docker logs -f tiangong-kaiwu-webhook-agent-1

# 所有服务日志
docker compose logs -f
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
   - 先确认产物就位：`dist-backend\modeling-server\dist\main.js`（缺则跑 `scripts/fetch-backend.ps1`）
   - 检查 imodelhub-services 是否运行、Azurite 是否运行
   - 检查端口 4001 是否被占用
   - 查看日志: `%TEMP%\luban-cad-modeling-server.log(.err)`（宿主进程）

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
docker compose down

# 删除数据卷
docker volume rm tiangong-kaiwu_azurite-data

# 清除 MS briefcase 缓存（宿主进程；位置由仓库根 .env 的 BRIEFCASE_CACHE_LOCATION 决定）
rm -rf briefcase-cache/*

# 重新启动
docker compose up -d
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
# 统一栈环境变量单源在仓库根 .env（WA 镜像与宿主 MS 读同一份，天然一致）
```

## 更新部署

### 滚动更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重拉后端产物与镜像（幂等；Releases/GHCR 有新版即更新）
powershell -File scripts/fetch-backend.ps1

# 3. 重启栈与宿主 MS（web 有变更时 --build）
docker compose up -d --build web
powershell -File scripts/start-ms-host.ps1 -Detach
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

*文档版本: 2.3*
*最后更新: 2026-10-01（后端私有化：新增「统一部署链路」generate-env → fetch-backend → compose up → start-ms-host → verify-stack；imodelhub/webhook-agent 标注 GHCR 镜像来源，MS 改 Releases 产物宿主运行；删除示意 compose 与仓内后端 dev 指引）*
