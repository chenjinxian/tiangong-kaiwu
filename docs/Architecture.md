# 鲁班CAD 架构设计（luban-cad，天工开物平台）

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LubanCAD 系统架构                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                           前端层 (Frontend)                               │  │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      React Web Application                          │  │  │
│  │  │                                                                      │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │  │  │
│  │  │  │   Auth       │  │   iTwin      │  │   iModel     │             │  │  │
│  │  │  │   Feature    │  │   Feature    │  │   Feature    │             │  │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘             │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │  │  │
│  │  │  │   Editor     │  │   Modeling   │  │  Version     │             │  │  │
│  │  │  │   Feature    │  │   Feature    │  │  Control     │             │  │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘             │  │  │
│  │  │                                                                      │  │  │
│  │  └────────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  AI 通路（规划中，虚线为规划中链路）:                                            │
│  ┌──────────────┐        ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐        ┌──────────────┐        │
│  │ 前端 AI 面板 │─ ─ ─ ▶  │ ai-service（规划中） │  ─ ─ ─ ▶  │  工具注册表  │    │
│  │ （规划中）   │        └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘        │ registerTools│        │
│  └──────────────┘                                        └──────────────┘        │
│                                                                                  │
│                                    │                                             │
│                     ┌──────────────┼──────────────┐                             │
│                     │              │              │                             │
│                     ▼              ▼              ▼                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        服务层 (Services)                                  │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │  │
│  │  │   imodelhub      │  │   Backend        │  │   Web-Agent            │  │  │
│  │  │   services       │  │   (4001)         │  │   (4002, 必需)     │  │  │
│  │  │   (4000)         │  │                  │  │                        │  │  │
│  │  │                  │  │  • RPC Server    │  │  • Webhook Receiver    │  │  │
│  │  │  • REST API      │  │  • WebSocket     │  │  • Event Forwarder     │  │  │
│  │  │  • Auth          │  │  • IPC Handler   │  │  • Baseline Generator  │  │  │
│  │  │  • iModel CRUD   │  │  • Edit Commands │  │                        │  │  │
│  │  │  • Briefcase Mgmt│  │                  │  │                        │  │  │
│  │  └────────┬─────────┘  └────────┬─────────┘  └──────────┬─────────────┘  │  │
│  └───────────┼─────────────────────┼───────────────────────┼────────────────┘  │
│              │                     │                       │                   │
│              │                     │                       │                   │
│              ▼                     ▼                       ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      数据层 (Data Layer)                                  │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │  │
│  │  │   PostgreSQL     │  │   Azurite        │  │   Local Filesystem     │  │  │
│  │  │   (5432)         │  │   (10000)        │  │   (Briefcase Cache)    │  │  │
│  │  │                  │  │                  │  │                        │  │  │
│  │  │  • Users         │  │  • Blob Storage  │  │  • Briefcase Cache     │  │  │
│  │  │  • iTwins        │  │  • Baseline Files│  │  • External Files      │  │  │
│  │  │  • iModels       │  │  • Changesets    │  │  • Saved Views         │  │  │
│  │  │  • Changesets    │  │                  │  │                        │  │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 架构原则

### 1. 本地部署优先
- 所有服务在本地或私有环境运行
- 不依赖 Bentley iTwin Platform 云服务
- 使用 Azurite 替代 Azure Blob Storage

### 2. 单端口架构
Backend 采用单端口架构，HTTP API 和 WebSocket 共享同一端口（`apps/backend/src/main.ts:126-146`）：
- 简化配置和部署
- 避免跨域问题
- WebSocket Upgrade 统一 JWT 校验（`verifyClient`，`apps/backend/src/main.ts:131-143`）；RPC 路由鉴权缺失为已知安全债（见 DEEP_ANALYSIS §8.1）

### 3. Feature-Based 组织
前端按功能模块组织代码：
- 每个 feature 包含组件、hooks、类型
- 便于代码维护和团队协作
- 清晰的模块边界

## 服务详解

### imodelhub-services (Port 4000)

**职责**: 核心数据管理服务

**提供 API**:
- `POST /auth/*` - 用户认证
- `GET|POST /itwins` - iTwin 项目管理
- `GET|POST /imodels` - iModel 模型管理
- `GET|POST /briefcases` - Briefcase 管理
- `GET|POST /changesets` - 变更集管理

**依赖**:
- PostgreSQL: 元数据存储
- Azurite: Blob 存储

### Backend (Port 4001)

**职责**: CAD 功能服务和 RPC 网关

**架构特点**（对照 `apps/backend/src/main.ts:122-252` 实测核对）:
```
http.createServer(app) + enableWs(app, server, ...)   // main.ts:126-146
│   └── verifyClient: JWT 校验，覆盖 /ws 与 /ipc 的 Upgrade  // main.ts:131-143
├── WebSocket 端点（与 HTTP 共享 4001 端口）
│   ├── /ws  - 通知通道            // main.ts:166
│   └── /ipc - iTwin.js IPC 通道   // main.ts:188
├── HTTP 路由
│   ├── GET|POST /:title/:version/mode/* - Bentley Cloud RPC
│   │       （无鉴权，见安全债①）   // main.ts:214-231
│   ├── GET  /rpc/metadata - OpenAPI 描述   // main.ts:233
│   ├── GET  /health                       // main.ts:245
│   └── POST /api/webhook/events（web-agent 转发）// main.ts:260
```

**核心组件**:
- `LocalhostIpcHost`: iTwin.js IPC 主机
- `BentleyCloudRpcManager`: RPC 管理器
- `OpenCloudRpcInterface`: 自定义 RPC 接口
- `EditCommandAdmin`: 编辑器命令管理

**初始化流程**:
```
1. 初始化 AzureClientStorage (Azurite)
2. 创建 IModelsClient
3. 启动 LocalhostIpcHost
4. 注册 IPC Handlers
5. 注册 Edit Commands
6. 初始化 BentleyCloudRpcManager
7. 启动 Express + WebSocket 服务
```

### Web-Agent (Port 4002, 必需)

**职责**: Webhook 事件接收、处理和 Baseline 生成

**为什么必需**:
创建空 iModel 时，imodelhub-services 发送 `iModelCreated` webhook，Web-Agent 必须生成 baseline 文件并上传到 Azurite，否则 iModel 无法初始化。

**核心功能**:
1. **接收 Webhook**: 从 imodelhub-services 接收事件
2. **验证签名**: HMAC-SHA256 验证确保事件真实性
3. **生成 Baseline**: 使用 `SnapshotDb.createEmpty()` 创建空 iModel 基线
4. **上传存储**: 将 baseline 上传到 Azurite
5. **通知完成**: 调用 imodelhub-services API 标记初始化完成
6. **转发事件**: 将事件转发到 Backend

**处理流程**:
```
imodelhub-services
       │
       │ POST /webhook/events
       ▼
[Web-Agent: 验证签名]
       │
       ▼
[检查 needBaseline 标志]
       │
       ├─ 是 ──▶ [生成 baseline.bim]
       │           │
       │           ▼
       │          [上传至 Azurite]
       │           │
       │           ▼
       │          [通知初始化完成]
       │
       ▼
[转发到 Backend]
       │
       ▼
Frontend (通过 polling/WebSocket)
```

**支持的事件**:
- `iModels.iModelCreated.v1` - 触发 baseline 生成（关键）
- `iModels.iModelDeleted.v1` - 清理资源
- `iModels.ChangesetPushed.v1` - 通知变更
- `iModels.NamedVersionCreated.v1` - 通知版本
- `iModels.BriefcaseAcquired.v1` / `BriefcaseReleased.v1` - Briefcase 状态
- `iTwin.MemberAdded.v1` / `MemberRemoved.v1` - 成员变更

## 通信协议

### 1. Frontend → imodelhub-services (REST)

直接调用 REST API，使用 JWT Token 认证：

```typescript
const response = await fetch('http://localhost:4000/itwins', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### 2. Frontend → Backend (RPC)

使用 Bentley Cloud RPC 协议：

```typescript
const rpcClient = BentleyCloudRpcManager.getClient(OpenCloudRpcInterface);
const briefcase = await rpcClient.acquireBriefcase(iModelId);
```

RPC 请求格式（路由 `/:title/:version/mode/*`，`apps/backend/src/main.ts:214-231`）:
```
POST /Open%20Cloud%20CAD/v1.0/mode/2/invocation
Content-Type: application/json

{
  "operation": {
    "interfaceName": "OpenCloudRpcInterface",
    "interfaceVersion": "1.0.0",
    "operationName": "acquireBriefcase",
    "requestId": "uuid"
  },
  "parameters": [{"iModelId": "..."}]
}
```

### 3. Backend ↔ imodelhub-services (REST)

Backend 使用 ServiceAccountAuthClient 进行服务间认证：

```typescript
const authClient = new ServiceAccountAuthClient({
  loginUrl: `${IMODELHUB_URL}/auth/email/login`,
  email: IMODELHUB_ADMIN_EMAIL,
  password: IMODELHUB_ADMIN_PASSWORD,
});
```

### 4. WebSocket 通信

**通知通道** (`/ws`):
```javascript
// 连接
const ws = new WebSocket('ws://localhost:4001/ws');

// 接收消息
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // { type: 'event', eventType: 'ChangesetPushed', ... }
};
```

**IPC 通道** (`/ipc`):
- 用于 iTwin.js BriefcaseConnection
- 本地 IPC over WebSocket

**升级鉴权**: `/ws` 与 `/ipc` 的 WebSocket Upgrade 均经 `verifyClient` JWT 校验（`apps/backend/src/main.ts:131-143`）；RPC 路由 `/:title/:version/mode/*` 无鉴权（`apps/backend/src/main.ts:214-231`，安全债见 DEEP_ANALYSIS §8.1）。

## 数据流

### 创建 iModel

```
User
 │
 ▼
[CreateIModelDialog]
 │
 ▼
POST /imodels (imodelhub-services)
 │
 ▼
[Webhook: iModelCreated]
 │
 ▼
[Web-Agent]
 │
 ▼
[Baseline Generator]
 │
 ▼
PUT baseline.bim (Azurite)
 │
 ▼
POST /baseline/complete (imodelhub-services)
 │
 ▼
[iModel state: initialized]
 │
 ▼
Frontend ← polling
```

### 编辑模式

```
User clicks "Edit"
 │
 ▼
acquireBriefcase() [RPC]
 │
 ▼
[Backend: download briefcase]
 │
 ▼
BriefcaseConnection.open()
 │
 ▼
enterEditingScope()
 │
 ▼
[Edit Tools Active]
 │
 ▼
saveChanges()
 │
 ▼
pushChanges() [RPC]
 │
 ▼
[Backend: push to iModelHub]
 │
 ▼
[Changeset created]
```

## 安全设计

### 认证流程

```
Frontend                           Backend                    imodelhub-services
   │                                  │                              │
   │  POST /auth/email/login          │                              │
   │─────────────────────────────────▶│                              │
   │                                  │  POST /auth/email/login      │
   │                                  │─────────────────────────────▶│
   │                                  │                              │
   │                                  │◀─────────────────────────────│
   │  {token, refreshToken, user}     │  {token, refreshToken, user} │
   │◀─────────────────────────────────│                              │
   │                                  │                              │
   │  Store token                     │                              │
   │  (sessionStorage/localStorage)   │                              │
```

### CSRF 防护

Backend 启用 CSRF 保护：
- Cookie 中设置 CSRF token
- 请求头携带 X-CSRF-Token
- 中间件验证一致性

### 安全中间件

```typescript
// middleware/security.ts
- securityHeaders: 安全响应头
- rateLimiter: 速率限制
- sanitizeInput: 输入清理
- csrfMiddleware: CSRF 防护
```

## 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                      模块依赖图                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │     web      │                                           │
│  │   (app)      │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│    ┌────┴────┬────────┬────────┐                           │
│    ▼         ▼        ▼        ▼                           │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
│ │shared│ │viewer│ │core  │ │ui    │                       │
│ │      │ │-core │ │      │ │      │                       │
│ └──┬───┘ └──┬───┘ └──┬───┘ └──────┘                       │
│    │        │        │                                      │
│    └────────┴────────┘                                      │
│              │                                               │
│              ▼                                               │
│  ┌──────────────────────────┐                               │
│  │      @itwin/* packages   │                               │
│  │  (core-frontend, editor) │                               │
│  └──────────────────────────┘                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 扩展性设计

### 添加新的 CAD 工具

1. 创建工具类继承 `PrimitiveTool`
2. 注册到 `ToolRegistry`
3. 在工具栏添加按钮
4. 实现工具激活逻辑

### 添加新的 RPC 方法

1. 在 `OpenCloudRpcInterface` 添加方法声明
2. 在 `OpenCloudRpcImpl` 实现方法
3. 前端通过 RPC client 调用

### 添加新的 Webhook 处理器

1. 在 `processor.ts` 添加事件处理函数
2. 在 `forwarder.ts` 配置转发规则
3. 更新 `validator.ts` 签名验证（如需要）

## 性能优化

### 缓存策略

| 数据 | 缓存位置 | 策略 |
|------|----------|------|
| iTwin 列表 | React Query | 5分钟 |
| iModel 列表 | React Query | 2分钟 |
| Briefcase | LocalStorage | 持久化 |
| Tile Data | Browser Cache | HTTP Cache |
| Baseline Files | Azurite | CDN / Local |

### 懒加载

前端路由级别代码分割：
```typescript
const Editor = lazy(() => import('../pages/Editor/Editor.js'));
```

### 虚拟化

大型列表使用虚拟化渲染：
- iTwin 列表
- iModel 列表
- Changeset 列表

## 部署模式

### 开发模式
```
imodelhub-services (localhost:4000)
Backend (localhost:4001)
Web-Agent (localhost:4002)
Frontend (localhost:3000)
Azurite (localhost:10000)
PostgreSQL (localhost:5432)
```

### 生产模式
```
Docker Compose:
  - azurite
  - backend
  - web-agent (optional)
  - web (nginx)
  
External:
  - imodelhub-services
  - PostgreSQL
```

---

*文档版本: 3.2*
*最后更新: 2026-09-22*
