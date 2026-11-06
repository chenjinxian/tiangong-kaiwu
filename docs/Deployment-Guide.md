# LubanCAD 部署指南

## 概述

LubanCAD 使用 **imodelhub-services 模式**，所有服务在本地或私有环境运行，**不依赖 Bentley iTwin Platform 云服务**。

**后端私有化（2026-10-01）**：后端源码在私有仓 **luban-backend**，本仓只**消费产物**——imodelhub / webhook-agent 为 **GHCR 镜像**，modeling-server 以 **GitHub Releases 产物**（`dist-backend\`）在宿主进程运行。

## 外部体验者本地部署（推荐路径）

给没有后端源码、没有 GitHub 账号、也不想登录任何镜像仓库的同事/朋友：

**一键起栈**（Windows 10/11 x64）：

```powershell
git clone --depth 1 https://github.com/chenjinxian/tiangong-kaiwu.git
cd tiangong-kaiwu
powershell -NoProfile -File scripts/quickstart.ps1
```

脚本会依次完成：环境检查 → 生成根 `.env`（随机密钥）→ 匿名下载 modeling-server 产物（Release，带 SHA256 校验）→ 拉取公开 GHCR 镜像 → `docker compose up -d` → 启动宿主 modeling-server → 全栈验收 → 打开 **http://localhost:5301**。注册任意邮箱即可体验（HUB 自带 seed 管理员，账号密码在仓库根 `.env` 的 `IMODELHUB_ADMIN_EMAIL` / `IMODELHUB_ADMIN_PASSWORD`）。

**需要获取的完整服务清单**（只有本仓公开；以下全部为公开可匿名获取，无第二私有仓依赖）：

| # | 服务/产物 | 来源 | 认证 | 说明 |
|---|---|---|---|---|
| 1 | **web** | GHCR `ghcr.io/chenjinxian/luban-web-public:latest` | 无 | React/Vite 前端静态镜像（含 viewer/editor 构建产物） |
| 2 | **bff** | GHCR `ghcr.io/chenjinxian/luban-bff-public:latest` | 无 | 同源 API 网关（/api JWT/限流/CORS） |
| 3 | **imodelhub** | GHCR `ghcr.io/chenjinxian/imodelhub-public:latest` | 无 | iModel/项目/changeset/权限 API |
| 4 | **webhook-agent** | GHCR `ghcr.io/chenjinxian/luban-webhook-agent-public:latest` | 无 | Webhook + baseline 生成 |
| 5 | **modeling-server** | GitHub Releases `modeling-server-win-x64-*.tgz` | 无 | Windows 宿主进程（含真形/ACIS 原生依赖、slvs.node；非容器） |
| 6 | postgres | Docker Hub `postgres:17-alpine` | 无 | HUB 数据库 |
| 7 | redis | Docker Hub `redis:7-alpine` | 无 | HUB 队列 |
| 8 | maildev | Docker Hub `maildev/maildev:latest` | 无 | 本地邮件 |
| 9 | azurite | MCR `mcr.microsoft.com/azure-storage/azurite` | 无 | Blob 存储 |
| 10 | nginx | Docker Hub `nginx:alpine` | 无 | 单入口 :5301 |

宿主侧只需 **Node.js 20.12+**（运行 modeling-server）。**没有其他需要单独下载的私有服务、原生库或求解器**：native/slvs/ACIS 均随 modeling-server 产物分发；TrueForm/绳墨尚未单独接入部署面。

随时验证公开依赖是否完整可匿名获取：

```powershell
powershell -NoProfile -File scripts/verify-public-deps.ps1
```

该脚本检查 4 个 GHCR 镜像的匿名 manifest、最新 Release 的 MS 资产，以及 compose 中 5 个官方基础设施镜像引用；发布前必须全绿。

**当前公开基线（2026-11-06）**：

| 产物 | Tag / Release | Digest / SHA256 |
|---|---|---|
| web | `backend-20261106` / `latest` | `sha256:706a6dd5d0c6892be8a9f7165b151c81c95047ad3ea2c5bf07b6712a8634c5d3` |
| bff | `backend-20261106` / `latest` | `sha256:f0f8f6b7eca9425c4d2f828a0763b62ffc5a5057047fc6e4ae56a8eab877fd19` |
| imodelhub | `backend-20261106` / `latest` | `sha256:24eb26b352db3a0b0afa9b0726f987f9e6fd34afc93aba395be23b2d1d4c71cc` |
| webhook-agent | `backend-20261106` / `latest` | `sha256:27eb8103705cd9b64ba56c402aa0e9c3e325d9c3a722893708844734625951b4` |
| modeling-server | Release `backend-20261106` | `sha256:fc35aa45c9f395168cb7ac47f8f4fbe27528a133221faecc231bc6960a60bbcf`（178,691,226 B，契约 1.32.0，Windows x64） |

> modeling-server 的原生库 provenance 记录在产物内 `native-provenance.json`（发布时使用显式 store dev build，已在发布记录披露）。

**为什么不需要 `gh` / `docker login`**：

| 依赖 | 分发方式 | 认证 |
|---|---|---|
| imodelhub | GHCR `ghcr.io/chenjinxian/imodelhub-public:latest` | **公开包，匿名拉取** |
| webhook-agent | GHCR `ghcr.io/chenjinxian/luban-webhook-agent-public:latest` | **公开包，匿名拉取** |
| modeling-server | GitHub Releases `modeling-server-win-x64-*.tgz` | 公开 Release，匿名 API/下载 |
| web | GHCR `ghcr.io/chenjinxian/luban-web-public:latest` | **公开包，匿名拉取**（纯静态前端） |
| bff | GHCR `ghcr.io/chenjinxian/luban-bff-public:latest` | **公开包，匿名拉取** |

> 公开镜像是**脱敏运行产物**：不含私有源码、`src/`、source map、`.d.ts`、测试文件；镜像内的 hub `.env` 仅为模板占位，真实密钥全部由仓库根 `.env` 经 compose 注入。后端源码仍只在私有仓。
>
> `scripts/fetch-backend.ps1` 默认走匿名 GitHub API + `curl.exe`，只有匿名 API 被限流时才回退到已登录的 `gh`（可选）。资产带 `digest` 时自动校验 SHA256。
>
> **契约版本提示**：脚本会对比公共产物与当前源码的 `LubanFeatureRpcInterface.interfaceVersion`。若公共 Release 落后（例如产物 1.18.0 而源码 1.32.0），会打印黄色警告——基础建模可继续用，但最新特征可能不可用；需由 release owner 重新发布匹配产物。

**机器要求**：Windows 10/11 x64；Docker Desktop（WSL2 后端）已启动；Node.js 20.12+（推荐 22 LTS）；内存 ≥ 8 GB；磁盘约 6–8 GB。首次下载约 5–30 分钟（视 GitHub/Docker 网络；后端产物约 170 MB + 4 个公开镜像）；**下载中断后直接重跑脚本即可断点续传**。**当前不支持 Linux/macOS/Apple Silicon**：modeling-server 是 Windows 原生宿主进程（本地编译的几何原生库）。

**停止与升级**：

```powershell
# 停止
docker compose down
powershell -File scripts/stop-ms-host.ps1

# 升级（先停宿主 MS，否则产物解压会被占用）
powershell -File scripts/stop-ms-host.ps1
git pull
powershell -File scripts/fetch-backend.ps1     # 新产物 + 新公开镜像（含 web）
docker compose up -d
docker compose restart nginx                   # hub/WA 重建后刷新上游 IP 缓存
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/verify-stack.ps1
```

## 统一部署链路（部署权威：根 `docker-compose.yml`）

```bash
powershell -File scripts/generate-env.ps1            # 0) 仓库根 .env（幂等；密钥缺失拒启）
powershell -File scripts/fetch-backend.ps1           # 1) Releases 拉 MS 产物 tgz→dist-backend\ + docker compose pull（GHCR 镜像）
docker compose up -d                                 # 2) 栈：imodelhub/WA/web/nginx + 基础设施
powershell -File scripts/start-ms-host.ps1 -Detach   # 3) 宿主 MS :5401（产物模式）
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
│  │  (5300)  │◀───│  (5401)         │◀───│         (5400)                       │  │
│  └──────────┘    └────┬────────────┘    └──────────────────────────────────────┘  │
│                       │                                                     │
│                       ▼                                                     │
│              ┌──────────────────┐                                          │
│              │     azurite      │  Azure Blob Storage 模拟器               │
│              │  (10500/1/2)     │                                          │
│              └──────────────────┘                                          │
│                                                                             │
│  ┌────────────────┐                                                             │
│  │ webhook-agent  │  Webhook 接收器 + Baseline 生成器 (必需)                     │
│  │   (5402)       │                                                             │
│  └────────────────┘                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 服务列表

| 服务 | 端口 | 说明 | 必需 |
|-----|------|------|------|
| PostgreSQL | 5432 | imodelhub-services 数据库 | 是 |
| azurite | 10500 | Azure Blob 存储模拟器 | 是 |
| imodelhub-services | 5400 | iModel 管理服务 | 是 |
| modeling-server | 5401 | LubanCAD 后端（宿主进程） | 是 |
| Web | 栈内 3000 | 前端静态（仅经 nginx 暴露） | 是 |
| nginx | **5301** | 单入口（外部访问 http://localhost:5301） | 是 |
| Webhook-Agent | 5402 | Webhook 接收器 + Baseline 生成 | 是 |

**镜像/产物来源（后端私有化）**：

| 服务 | 来源 |
|---|---|
| imodelhub | **GHCR 镜像** `ghcr.io/chenjinxian/imodelhub-public:latest`（构建在私有仓 luban-backend） |
| webhook-agent | **GHCR 镜像** `ghcr.io/chenjinxian/luban-webhook-agent-public:latest`（构建在私有仓 luban-backend） |
| modeling-server | **GitHub Releases 产物** `modeling-server-win-x64-*.tgz`（`scripts/fetch-backend.ps1` 解压到 `dist-backend\`，`scripts/start-ms-host.ps1` 宿主运行） |
| web | **GHCR 镜像** `ghcr.io/chenjinxian/luban-web-public:latest`（纯静态前端；开发者可 `scripts/rebuild-web.ps1` 本地重建） |
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
curl http://localhost:5400/imodels/admin/compensation-status \
  -H "X-API-Key: internal-api-key-for-webhook-agent"
```

## 前置要求

- Docker Desktop（栈：PostgreSQL/Azurite/Redis/Maildev + GHCR 公开镜像 + web/nginx）
- Node.js 20+（宿主 modeling-server 必需；推荐 22 LTS。开发态另需 pnpm 10.x——lockfile 为 lockfileVersion 9.0，pnpm 12 供应链策略会拒装，用 `corepack pnpm@10`）
- gh CLI **可选**：`fetch-backend.ps1` 默认匿名下载公开 Release；仅当匿名 GitHub API 被限流时才回退到已登录的 gh
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
curl http://localhost:10500/devstoreaccount1?comp=list
```

### 3. 配置环境变量

统一栈的环境变量**单源在仓库根 `.env`**（`scripts/generate-env.ps1` 幂等生成；compose 插值与服务级 `env_file` 均读它，密钥缺失会拒启）。密钥项：`IMODELHUB_API_KEY` / `WEBHOOK_SECRET` / `AUTH_JWT_SECRET` / `IMODELHUB_ADMIN_PASSWORD` / `AZURITE_ACCOUNT_KEY` 等（私有仓后端运行时亦读仓库根这一份 `.env`，见其 README）。

前端开发态用 `luban-cad/apps/web/.env.development`（已入库，直连 :5401）。

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

访问: http://localhost:5300

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

compose 内 **9 个服务**，镜像来源如下；MS 不占 compose 服务位（宿主进程）：

| 服务 | 来源 | 端口 |
|---|---|---|
| postgres | 官方 `postgres:17-alpine` | 栈内 5432；源码模式宿主发布 55432 |
| redis | 官方 `redis:7-alpine` | 栈内 6379；源码模式宿主发布 56379 |
| maildev | 官方 `maildev/maildev` | 栈内 SMTP 1025 / UI 1080；源码模式宿主发布 11025 / 11080 |
| azurite | 官方 `mcr.microsoft.com/azure-storage/azurite` | 宿主 10500-10502（容器内 10000-10002） |
| imodelhub | **GHCR** `ghcr.io/chenjinxian/imodelhub-public:latest` | 宿主 5400（容器内 4000） |
| webhook-agent | **GHCR** `ghcr.io/chenjinxian/luban-webhook-agent-public:latest` | 宿主 5402（容器内 4002） |
| web | **GHCR** `ghcr.io/chenjinxian/luban-web-public:latest`（开发者可本地 build 覆盖） | 栈内 3000（仅经 nginx 5301 暴露） |
| bff | **GHCR** `ghcr.io/chenjinxian/luban-bff-public:latest`（可选；未启用时 nginx 直连宿主 MS） | 容器内 5403 |
| nginx | 官方 `nginx:alpine`（单域名入口） | 宿主 5301（容器内 80） |
| modeling-server | **非 compose 服务**：宿主进程，`scripts/start-ms-host.ps1` 跑 `dist-backend\` 产物 | 宿主 5401 |

## 生产环境部署

### 1. 拉取产物与镜像

```bash
# 后端镜像（GHCR）+ MS 产物（Releases）一键拉齐，幂等
powershell -File scripts/fetch-backend.ps1

# web / bff / hub / WA 均来自公开 GHCR（外部零本地构建）
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
        proxy_pass http://localhost:5300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:5401;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:5401;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 健康检查

### 全栈验收脚本（推荐，唯一权威）

健康检查统一使用根仓 `scripts/verify-stack.ps1`（health×5 → iTwin/iModel/baseline 数据链 → WS cookie 握手 → 原生库 dev-build 横幅 → web 镜像陈旧检测）：

```powershell
# 全量（含 baseline 数据链，最慢 ~5min）
powershell -NoProfile -File scripts/verify-stack.ps1

# 快速模式（跳过数据链）
powershell -NoProfile -File scripts/verify-stack.ps1 -SkipBaseline
```

**部署前/后必须运行**，目标 17/17 全绿；退出码非 0 即失败。

> 旧的 `scripts/health-check.sh`（`luban-cad/scripts`，硬编码已退役的 4000/4001/4002/10000 宿主端口）已删除，不再可用。

### 手动服务状态检查

```bash
# 1. 检查 Azurite
curl http://localhost:10500/devstoreaccount1?comp=list

# 2. 检查 modeling-server
curl http://localhost:5401/health

# 3. 检查 Webhook-Agent
curl http://localhost:5402/health

# 4. 检查 Frontend
curl http://localhost:5300
```

### modeling-server 健康响应

```json
{
  "status": "healthy",
  "timestamp": "2026-04-04T12:00:00.000Z",
  "version": "1.0.0",
  "websocket": {
    "connectedClients": 5,
    "endpoint": "ws://localhost:5401/ws"
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

### 端口冲突（Windows）

```powershell
# 查找占用端口的进程
Get-NetTCPConnection -State Listen -LocalPort 5301,5400,5401,5402 |
  Select-Object LocalPort, OwningProcess
Get-Process -Id <PID> | Select-Object Id, ProcessName, Path

# 仅停止宿主 modeling-server（脚本会校验进程身份，避免误杀）
powershell -File scripts/stop-ms-host.ps1
```

### 镜像拉取失败 / 提示 unauthorized

公开镜像无需 `docker login`。先确认能否访问 GHCR：

```powershell
docker pull ghcr.io/chenjinxian/imodelhub-public:latest
docker pull ghcr.io/chenjinxian/luban-webhook-agent-public:latest
```

失败通常是网络/代理问题（Docker Desktop → Settings → Resources → Proxies），不是权限问题。若包被误设为 private，需由仓库所有者改回 Public。

### 重建 hub/WA 后 502

nginx 会缓存上游容器 IP。重建 hub 或 webhook-agent 后若 5301 报 502：

```powershell
docker compose restart nginx
```

### Release 下载失败

`fetch-backend.ps1` 默认匿名访问 GitHub API（未登录限流 60 次/小时）。若返回 403：

- 等待一段时间重试；或
- 在已登录 `gh` 的机器上运行同一脚本（自动回退）；或
- 手动从 https://github.com/chenjinxian/tiangong-kaiwu/releases/latest 下载 `modeling-server-win-x64-*.tgz`，放到 `dist-backend\` 后重跑脚本。

### 服务启动失败

1. **modeling-server 启动失败**
   - 先确认产物就位：`dist-backend\modeling-server\dist\main.js`（缺则跑 `scripts/fetch-backend.ps1`）
   - 检查 imodelhub-services 是否运行、Azurite 是否运行
   - 检查端口 5401 是否被占用
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
   - 检查 webhook-agent 是否运行: `powershell -NoProfile -File scripts/verify-stack.ps1 -SkipBaseline`
   - 查看补偿任务状态: `curl http://localhost:5400/imodels/admin/compensation-status -H "X-API-Key: internal-api-key-for-webhook-agent"`
   - 手动触发修复: `curl -X POST http://localhost:5400/imodels/admin/repair/{id} -H "X-API-Key: internal-api-key-for-webhook-agent"`

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
curl -f http://localhost:5401/health || echo "modeling-server unhealthy"

# 添加到 crontab
*/5 * * * * curl -f http://localhost:5401/health || echo "modeling-server down" | mail -s "Alert" admin@example.com
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
curl http://localhost:5400/imodels/admin/uninitialized \
  -H "X-API-Key: internal-api-key-for-webhook-agent"

# 修复特定 iModel
curl -X POST http://localhost:5400/imodels/admin/repair/{iModelId} \
  -H "X-API-Key: internal-api-key-for-webhook-agent"

# 批量修复所有失败的 baseline
curl -X POST http://localhost:5400/imodels/admin/repair-baselines \
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

# 3. 重启栈与宿主 MS（web 默认拉公开镜像；改了 web 源码的开发者用 rebuild-web.ps1）
docker compose up -d
docker compose restart nginx
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/verify-stack.ps1
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
| Azurite | 10500 | ✅ | Blob 存储 |
| imodelhub-services | 5400 | ✅ | 核心 API |
| modeling-server | 5401 | ✅ | CAD 服务 |
| Frontend | 5300 | ✅ | Web 应用 |
| Webhook-Agent | 5402 | ✅ | Webhook + Baseline 生成 |

**访问地址**:
- 产品入口（nginx）: **http://localhost:5301**
- 前端 dev server（开发态）: http://localhost:5300
- modeling-server Health: http://localhost:5401/health
- modeling-server WebSocket: ws://localhost:5401/ws
- modeling-server RPC: http://localhost:5401/rpc/metadata

---

*文档版本: 2.5*
*最后更新: 2026-11-06（外部体验者一键起栈：公开 GHCR 镜像 + 匿名 Release 下载 + quickstart/stop-ms-host 脚本）*
