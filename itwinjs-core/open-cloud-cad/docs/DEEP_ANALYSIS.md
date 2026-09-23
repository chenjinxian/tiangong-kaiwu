# Open Cloud CAD - 深度技术分析报告

**分析日期**: 2026-04-08  
**基准更新**: 2026-09-22（初版 2026-04-08）  
**代码规模**: 44,122 行 TS/TSX（全树口径；六区小计 37,584 行），58 个测试文件（2026-09-22 实测，`platform-docs/analysis/2026-09-22-itwinjs-core-open-cloud-cad.md` §2）  
**架构版本**: v1.0.0

---

## 一、架构概览

> **（跨仓结论以上游 platform-docs 为准）**——本节为应用内架构快照；平台级分层与服务边界归 platform-docs/AI-ARCHITECTURE.md / VISION.md。

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Open Cloud CAD                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Frontend (Port 3000)          │  Backend (Port 4001)    │  Web-Agent (4002)│
│  ─────────────────────────     │  ───────────────────    │  ─────────────  │
│  React 18 + TypeScript 5.6     │  Express + WebSocket    │  Webhook Receiver│
│  ┌─────────────────────┐      │  ┌─────────────────┐    │  ┌───────────┐  │
│  │  @itwin/core-frontend│◄────►│  │  LocalhostIpcHost│◄───►│  │  Baseline │  │
│  │  @itwin/editor-frontend     │  │  BentleyCloudRpc │    │  │  Generator│  │
│  └─────────────────────┘      │  │  OpenCloudRpcImpl│    │  └───────────┘  │
│         │                     │  └─────────────────┘    │        ▲         │
│         │ RPC/HTTP            │         │               │        │         │
│         ▼                     │         ▼ IPC           │        │         │
│  ┌─────────────────────┐      │  ┌─────────────────┐    │   Webhook       │
│  │  imodelhub-services │      │  │  BriefcaseDb    │    │   Events        │
│  │  (Port 4000)        │      │  │  IModelHost     │    │        │         │
│  └─────────────────────┘      │  └─────────────────┘    │        ▼         │
│                               │                         │  ┌───────────┐  │
│                               │                         │  │  Azurite  │  │
│                               │                         │  │ (Storage) │  │
│                               │                         │  └───────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 服务职责划分

| 服务 | 端口 | 核心职责 | 技术特点 |
|------|------|----------|----------|
| **Frontend** | 3000 | UI渲染、用户交互、3D视图 | React + iTwinUI, Vite构建 |
| **Backend** | 4001 | RPC处理、Briefcase管理、编辑命令 | Express + WebSocket, 单端口架构 |
| **Web-Agent** | 4002 | Webhook接收、Baseline生成 | 自动故障恢复、CloudSqlite上传 |
| **imodelhub-services** | 4000 | 用户认证、项目管理、变更集 | 独立服务、PostgreSQL + Azurite |

---

## 二、核心设计决策分析

### 2.1 单端口架构 (Backend)

**设计选择**: HTTP API 和 WebSocket IPC 共享端口 4001

```typescript
// main.ts:122-143
const server = http.createServer(app);
enableWs(app, server, { ... });
```

**优势**:
- 简化部署配置
- WS Upgrade JWT（`verifyClient`）；RPC 路由无鉴权，见 §8.1
- 减少端口占用

**实现细节**:
- `/ws` - 通用 WebSocket 连接
- `/ipc` - iTwin.js IPC 通道 (BriefcaseConnection 使用)
- `/{title}/{version}/mode/*` - Bentley Cloud RPC 端点

### 2.2 V2 Checkpoint 与 CloudSqlite

**关键技术点**:

```typescript
// baseline-generator.ts:659-762
private async _createCloudContainerAndUpload(...) {
  // 1. 创建 Azure Container 带 metadata
  await containerClient.create({
    metadata: {
      containertype: 'cloud-sqlite',
      itwinid: iModelId,
      ...
    }
  });
  
  // 2. 创建 CloudCache
  const cache = CloudSqlite.CloudCaches.getCache({ ... });
  
  // 3. 创建 CloudContainer 并初始化
  const container = CloudSqlite.createCloudContainer({ ... });
  container.initializeContainer({ blockSize: 4 * 1024 * 1024 });
  
  // 4. 上传数据库
  await CloudSqlite.withWriteLock({ ... }, async () => {
    await CloudSqlite.uploadDb(container, { ... });
  });
}
```

**设计亮点**:
1. **流式加载**: BCVV 格式支持块级流式下载，大模型无需完全下载即可打开
2. **自动故障恢复**: BaselineCompensationJob 每2分钟检查未完成的初始化
3. **双重验证**: 文件上传后通过 API 确认并等待初始化完成

### 2.3 编辑命令架构

**三层架构**:

```
Frontend (useEditTools.ts)
    │
    ▼ RPC
OpenCloudRpcImpl.ts (Backend)
    │
    ▼ IPC
EditCommandAdmin (editor-backend)
    │
    ▼ Native
SolidModelingCommand / BasicManipulationCommand
```

**代码示例**:

```typescript
// useEditTools.ts:51-74
deleteSelected: useCallback(async () => {
  const compressedIds = CompressedId64Set.compressIds(ids);
  const rpc = OpenCloudRpcInterface.getClient();
  
  // 1. 启动编辑命令
  await rpc.startEditCommand('basicManipulation', conn.key);
  
  // 2. 调用具体方法
  await rpc.callEditMethod('deleteElements', compressedIds);
  
  // 3. 完成命令
  await rpc.finishEditCommand();
  
  // 4. 保存变更
  await conn.saveChanges('删除元素');
}, [])
```

**设计优点**:
- 命令模式封装，支持撤销/重做
- 批量操作优化 (CompressedId64Set)
- 事务边界明确

---

## 三、实体建模系统分析

### 3.1 继承层次

```
@itwin/editor-frontend
├── LocateSubEntityTool (基类)
    │
    └── SolidModelingToolBase<T> (Open Cloud CAD 扩展)
        │
        ├── RoundEdgesTool      (圆角)
        ├── ChamferEdgesTool    (倒角)
        ├── HollowFacesTool     (抽壳)
        ├── OffsetFacesTool     (面偏移)
        ├── SweepFacesTool      (面扫掠)
        └── DraftFacesTool      (拔模)
```

### 3.2 子实体选择机制

**核心流程**:

```typescript
// SolidModelingToolBase.ts:74-84
protected override async addSubEntity(
  id: string,
  props: SubEntityLocationProps,
): Promise<void> {
  await super.addSubEntity(id, props);
  this._currentElementId = id;
  this._selectedEntities.push(props);
  this._onEntitySelected?.(id, props);
  
  // 更新提示
  IModelApp.notifications.outputPrompt(...);
}
```

**关键特性**:
1. **BRep 子实体定位**: 使用 `SubEntityLocationProps` 精确定位边/面
2. **动态高亮**: 选择时实时高亮显示
3. **事件驱动**: 通过 `solidModelingEvents` 与 UI 解耦

### 3.3 编辑命令执行流程

```typescript
// executeEditCommand.ts
export async function executeEditCommand(...): Promise<void> {
  // 1. 获取 BriefcaseConnection
  const connection = await getBriefcaseConnection();
  
  // 2. 启动编辑会话
  await connection.editingScope.enter();
  
  // 3. 执行具体命令
  await commandFunc();
  
  // 4. 保存并退出
  await connection.saveChanges();
  await connection.editingScope.exit();
}
```

---

## 四、与 itwinjs-core 的集成关系

> **（跨仓结论以上游 platform-docs 为准）**——fork 修改面与同步策略归 platform-docs/KERNEL-STRATEGY.md §6 与勘察笔记 §7。

### 4.1 依赖矩阵

| Open Cloud CAD 包 | 依赖的 itwinjs-core 包 | 用途 |
|-------------------|------------------------|------|
| `@open-cloud-cad/viewer-core` | `@itwin/core-frontend` | 视图渲染 |
| `@open-cloud-cad/shared` | `@itwin/core-common` | RPC 接口定义 |
| `apps/backend` | `@itwin/core-backend`, `@itwin/editor-backend` | 后端逻辑 |
| `apps/web` | `@itwin/editor-frontend` | 实体建模工具 |

### 4.2 关键集成点

#### 4.2.1 LocalhostIpcHost

**用途**: 在 Web 环境中模拟 NativeApp 的 IPC 功能

```typescript
// main.ts:80-87
await LocalhostIpcHost.startup({
  localhostIpcHost: { noServer: true },  // 使用自定义 Express 服务器
  iModelHost: {
    hubAccess,
    authorizationClient: authClient,
    cacheDir: process.env.IMJS_BRIEFCASE_CACHE_LOCATION,
  },
});
```

**为什么重要**:
- `BriefcaseConnection` 需要 IPC 通道与后端通信
- 在浏览器环境中无法使用原生 IPC
- LocalhostIpcHost 通过 WebSocket 模拟 IPC

#### 4.2.2 BackendIModelsAccess

**用途**: 连接 imodelhub-services 进行 iModel 管理

```typescript
const iModelClient = new IModelsClient({
  api: { baseUrl: `${IMODELHUB_URL}/imodels` },
  cloudStorage: azureStorage,
});
const hubAccess = new BackendIModelsAccess(iModelClient);
```

**架构意义**:
- 抽象了 iModelHub 的具体实现
- 支持本地部署的 imodelhub-services
- 统一了 V1/V2 Checkpoint 访问

### 4.3 自定义扩展点

#### 4.3.1 OpenCloudIpcHandler

```typescript
// 扩展标准 IPC 接口，添加 CAD 特定功能
export class OpenCloudIpcHandler extends IpcHandler {
  public async downloadBriefcase(...): Promise<BriefcaseDownloadResult>
  public async createFeature(...): Promise<string>
  public async listFeatures(...): Promise<CadFeatureRecord[]>
  public async createAssembly(...): Promise<string>
}
```

#### 4.3.2 CAD 特征历史 Schema

```typescript
// OpenCloudCADSchema.ts
const OPENCAD_SCHEMA_XML = `<?xml version="1.0"?>
<ECSchema ...>
  <ECEntityClass typeName="CadFeature">
    <ECProperty propertyName="FeatureType" typeName="string" />
    <ECProperty propertyName="Parameters" typeName="string" />
    <ECProperty propertyName="FeatureOrder" typeName="int" />
    <ECProperty propertyName="Suppressed" typeName="boolean" />
  </ECEntityClass>
</ECSchema>`;
```

---

## 五、状态管理与数据流

### 5.1 Briefcase 连接状态机

```
                    ┌─────────────┐
                    │   Idle      │
                    └──────┬──────┘
                           │ useBriefcaseConnection()
                           ▼
                    ┌─────────────┐
         ┌─────────│  Loading    │─────────┐
         │         └──────┬──────┘         │
         │                │                │
    Error│                │ Success        │Error
         │                ▼                │
         │         ┌─────────────┐         │
         └────────►│  Connected  │◄────────┘
                   └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │  Save   │    │  Push   │    │  Pull   │
    │ Changes │    │ Changes │    │ Changes │
    └─────────┘    └─────────┘    └─────────┘
```

### 5.2 冲突检测与解决流程

```typescript
// OpenCloudRpcImpl.ts:402-461
detectConflicts(request): Promise<ConflictDetectionResult> {
  // 1. 获取本地变更
  const localChanges = await this.getLocalChanges(iModel);
  
  // 2. 获取远程变更
  const remoteChanges = await this.getRemoteChanges(iModelId, targetChangesetId);
  
  // 3. 检测冲突
  const conflicts = this.detectConflictsBetweenChanges(localChanges, remoteChanges);
  
  // 4. 返回冲突摘要
  return { hasConflicts, totalConflicts, conflicts, summary };
}
```

**支持的冲突类型**:
- `modify-modify`: 双方修改同一元素
- `delete-modify`: 一方删除，一方修改
- `modify-delete`: 一方修改，一方删除
- `add-add`: 双方添加相同 ID 元素

**解决策略**:
- `local`: 保留本地版本
- `remote`: 应用远程版本
- `merged`: 三路合并
- `manual`: 用户指定值

---

## 六、性能优化策略

### 6.1 Briefcase 下载优化

```typescript
// OpenCloudIpcHandler.ts:47-75
private readonly _inFlight = new Map<string, Promise<BriefcaseDownloadResult>>();

public async downloadBriefcase(iTwinId, iModelId, readonly): Promise<...> {
  // 序列化同一 iModel 的并发请求
  const cacheKey = `${iModelId}:${readonly}`;
  const existing = this._inFlight.get(cacheKey);
  if (existing) return existing;
  
  const work = this._doDownloadBriefcase(...);
  this._inFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    this._inFlight.delete(cacheKey);
  }
}
```

### 6.2 选择集压缩

```typescript
// useEditTools.ts:57
const compressedIds = CompressedId64Set.compressIds(ids);
```

**优势**:
- 大量元素 ID 压缩为字符串
- 减少 RPC 传输大小
- 64位 ID 的 Base64 编码

### 6.3 懒加载路由

```typescript
// App.tsx:11-24
const Login = lazy(() => import('../src/pages/Login/Login.js'));
const Editor = lazy(() => import('../src/pages/Editor/Editor.js'));
// ...
<Suspense fallback={<PageLoader />}>...</Suspense>
```

---

## 七、安全设计

### 7.1 认证层次

| 层级 | 机制 | 实现 |
|------|------|------|
| HTTP API | JWT Token | Authorization header |
| WebSocket | Token 验证 | verifyClient hook |
| RPC | ❌ 无鉴权（2026-09-22 实测） | 路由直通 `protocol.handleOperation*`，无 JWT/中间件（`apps/backend/src/main.ts:214-231`，见 §8.1 安全债①） |
| Admin API | API Key | X-API-Key header |

### 7.2 Webhook 签名验证

```typescript
// validator.ts
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### 7.3 输入清理

```typescript
// security.ts
export const sanitizeInput = (req, res, next) => {
  // 清理请求体中的潜在危险字符
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
};
```

---

## 八、潜在问题（2026-09-22 实测清单）

> 一事一源：债务分级、消项动作与验收归 `platform-docs/analysis/2026-09-22-itwinjs-core-open-cloud-cad.md` §7–§8 与 platform-docs/ROADMAP.md Phase 0；本文只录实测问题清单（file:line 均为 2026-09-22 复测命中）。

### 8.1 安全债（部署阻断级，4 项——修复前不可对外部署）

1. **RPC 无鉴权**：RPC 路由 `/:title/:version/mode/*` 的 GET/POST 直通 `protocol.handleOperation*`，无任何 JWT/中间件校验（`apps/backend/src/main.ts:214-231`）。
2. **任意文件 IO**：`readExternalFile`/`writeExternalFile` 按调用方给定路径裸 `fs.readFileSync`/`fs.writeFileSync`，可读写服务器任意路径（`apps/backend/src/rpc/OpenCloudRpcImpl.ts:275-287`）。
3. **token 泄露**：`getAccessToken` 把服务端 token 原样回传调用方（`apps/backend/src/rpc/OpenCloudRpcImpl.ts:302`）。
4. **默认口令**：服务账号默认 `admin@example.com`/`secret`（`apps/backend/src/rpc/OpenCloudRpcImpl.ts:1124-1127`，env 未设即生效），且每次调用重新登录。

### 8.2 功能债

- **mock API**：`compareChangesets` 返回 mock 空数据（`apps/backend/src/rpc/OpenCloudRpcImpl.ts:119-128`，"For now, return mock data" + 全 0 计数）；`exportToGltf` 产出 buffers/accessors 为空的 JSON 壳（`apps/backend/src/rpc/OpenCloudRpcImpl.ts:166-230`）。处置：实现或下线/标注 experimental【P1】。
- **PatternTools ID 收集 bug**：内层循环 `newId` 单变量覆盖后才 push，副本只有最后一个 ID 入选集（`apps/web/features/modeling/PatternTools.ts:131-134` 与 `:331-334`）；另有错误吞咽 `catch → console.error → return undefined`（`:138-140`、`:338-340`）【P1】。
- **死代码 PatternCommand**：`apps/backend/src/commands/PatternCommand.ts` 从未注册——`apps/backend/src/main.ts:99` 只注册 `editorBuiltInCommands`；实际阵列路径走前端 `basicManipulationIpc.insertGeometricElement`。处置：删除【P1】。

### 8.3 硬编码绝对路径（4 月已记录未修）

- `apps/backend/src/ipc/OpenCloudIpcHandler.ts:207`：本机绝对路径 `/Users/xunzhang/...` 拼接文件名。
- `apps/web/vite.config.ts:11,134`：fs.allow 与 core-markup alias 均含本机用户名路径。
- 风险：部署环境需要修改代码【P1】。

### 8.4 卫生问题

- 死 CI 配置：`open-cloud-cad/.github/workflows/`（cd/ci/pr）——GitHub 只认仓根 `.github/`，本目录配置不生效【P2】。
- 构建产物入库：`apps/web/{playwright-report,test-results,__blobstorage__}`；itwinjs-core 仓根游离 `web-agent.log`【P2】。

### 8.5 其他

- **依赖不齐** 🟠：vitest 4.1.11 vs 4.1.10、`@vitest/browser-playwright` 错位（`rush update` peer 警告）。
- **文档-现实偏差清单**（10 项）：归勘察笔记 §8 逐项消项（`platform-docs/analysis/2026-09-22-itwinjs-core-open-cloud-cad.md:111-126`），随文档任务更新状态。
- 旧版建议（事件总线/缓存层/存储抽象/结构化日志等）不再维护：架构改进方向以 platform-docs 上游文档为准。

---

## 九、技术亮点总结

> **（跨仓结论以上游 platform-docs 为准）**——能力现状以 platform-docs/STATUS.md 与勘察笔记为准（亮点同样受 §八 债务约束）。

### 9.1 创新点

1. **本地部署的 iTwin.js 解决方案**: 不依赖 Bentley 云服务
2. **Web 端实体建模**: 完整的 CAD 编辑功能在浏览器中运行
3. **V2 Checkpoint 集成**: 流式加载支持大模型
4. **特征历史系统**: 类似 SolidWorks 的特征树实现

### 9.2 工程实践

1. **Monorepo 架构**: Rush + pnpm 管理多包依赖
2. **TypeScript 严格模式**: 类型安全贯穿全栈
3. **分层设计**: 清晰的 Frontend → RPC → IPC → Native 层次
4. **故障恢复**: BaselineCompensationJob 自动修复失败任务

---

## 十、与 itwinjs-core 的关系图

> **（跨仓结论以上游 platform-docs 为准）**——fork 修改面台账归 docs/ITWINJS_CORE_MODIFICATIONS.md，同步策略归 platform-docs/KERNEL-STRATEGY.md。

```
itwinjs-core (Upstream)
│
├── core/
│   ├── @itwin/core-frontend  ◄───── 渲染、视图、工具
│   ├── @itwin/core-backend   ◄───── IModelHost、BriefcaseDb
│   ├── @itwin/core-common    ◄───── RPC 接口定义
│   └── @itwin/core-bentley   ◄───── Id64、CompressedId64Set
│
├── editor/
│   ├── @itwin/editor-frontend ◄──── 实体建模工具基类
│   ├── @itwin/editor-backend  ◄──── EditCommandAdmin
│   └── @itwin/editor-common   ◄──── SubEntityLocationProps
│
└── presentation/              (未使用)

Open Cloud CAD (Extension)
│
├── apps/
│   ├── web/           ──► 基于 core-frontend 构建前端
│   ├── backend/       ──► 集成 core-backend + editor-backend
│   └── web-agent/     ──► 独立服务，处理 webhook
│
├── packages/
│   ├── shared/        ──► 扩展 core-common 的 RPC 接口
│   ├── viewer-core/   ──► 封装 core-frontend 的查看器
│   └── web-viewer/    ──► 针对 Web 平台的初始化
│
└── modules/
    ├── core/          ──► 扩展的 CAD 应用层
    └── ui/            ──► 自定义 UI 组件
```

---

## 附录：关键文件索引

| 文件 | 作用 |
|------|------|
| `apps/backend/src/main.ts` | 后端服务入口，初始化 IpcHost 和 RPC |
| `apps/backend/src/rpc/OpenCloudRpcImpl.ts` | RPC 方法实现，包含编辑命令和冲突检测 |
| `apps/backend/src/ipc/OpenCloudIpcHandler.ts` | IPC 处理器，管理 Briefcase 下载和 CAD 特征 |
| `apps/web-agent/src/baseline-generator.ts` | Baseline 文件生成和 CloudSqlite 上传 |
| `apps/web/app/App.tsx` | 前端路由和主题配置 |
| `packages/viewer-core/src/hooks/useBriefcaseConnection.ts` | 可写连接管理 Hook |
| `apps/web/features/editor/hooks/useEditTools.ts` | 编辑工具 Hook |
| `apps/web/features/modeling/SolidModelingToolBase.ts` | 实体建模工具基类 |

---

*报告完成*
