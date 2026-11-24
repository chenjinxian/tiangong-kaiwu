# AIRR：G1 B6 P3 — Hub 数据面服务主体授权（endpoint/scope 矩阵 + 双模）

- 标题：G1 B6 P3 — Hub 官方数据面路由的签名服务身份与逐端点 scope；legacy 共享 key 仅显式回滚
- 日期：2026-11-24
- Owner：平台/安全（owner directive 2026-11-23）
- 关联：`G1-EXECUTION-PLAN.md` B6；`10-ARCHITECTURE-HARDENING-PLAN.md` B6；`ADR-G0-16-identity-attribution.md` 附录 A；`AIRR-2026-11-23-B6-SERVICE-IDENTITY-P0.md`（P0/P1/P2）；`EXCEPTIONS.md` X-21；`INTERFACE-FREEZE-MATRIX.md`
- 影响仓：Hub（私有 `imodelhub-services`：`service-identity`、`common/authorization`、`imodels` controllers、`changesets.service`、auth config、additive migration、tests）；公共仓仅改本 AIRR、`EXCEPTIONS.md` X-21、`docs/README.md`。**未改** MS/WA/worker/web/BFF 代码、`luban-cad/**`、native/求解器/渲染。
- 是否需要 ADR：**是（附录延续）**。数据面 scope 名称、端点绑定与双模传输属于跨仓安全契约，延续 `ADR-G0-16` 附录 A；本 AIRR 记录 P3 实现切片与证据。

> 状态：**Hub P3 已实现并通过单元/tsc/eslint + 隔离 relational e2e（6/6，fresh Postgres 上真实应用 `20261124000004` 迁移）。客户端未迁移，未跑部署形态 canary；B6/X-21 仍 open，不勾选任何 G1 Gate 项。**
> 共享 `AGENT_API_KEY`、人类 admin 服务登录、MS/WA/worker 数据面调用与 TLS 未退役；owner 依赖路由仍 legacy-only（见 §6）。

---

## 0. 结论摘要

1. 新增 10 个 closed data-plane scope（additive 迁移 `20261124000004`）：`data.changesets.read/write`、`data.briefcases.read/write`、`data.checkpoints.read/write`、`data.locks.read`、`data.namedversions.read`、`data.baseline.read/write`。**没有** `data.*`、`admin`、iModel 元数据 scope，也没有锁/命名版本写 scope。
2. 新增 `DataPlaneAuthGuard`（class-level）：有 `X-Service-Token` 时校验 Hub 签名 service JWT，并要求 handler 上存在显式 `data-plane` scope 元数据与 pinned service 列表；否则**在校验 token 前**即拒绝。无 token 时原样委托 passport `jwt` 策略，用户/服务账号 JWT 行为不变。
3. 无用户冒充：service token 路径只写 `request.servicePrincipal` / `isServiceRequest` / `serviceName`，**从不写 `request.user`**。需要用户身份的路由不挂 data-plane 元数据，service token 在 class guard 即被拒绝。
4. `SystemAgentOrResourceGuard` 增加服务主体分支：只按路由显式 scope 判定，不查 RBAC、不回退 API key；legacy X-API-Key 旁路仅在 `AUTH_SERVICE_CLIENTS_ENABLED=off`（默认）或 `shadow` + `AUTH_SERVICE_LEGACY_API_KEY=allow` 生效。`shadow` + `deny` 时共享 key 不授予旁路，请求落回 RBAC（服务账号通常 403）。
5. 变更集服务归因：服务主体 push 的 changeset 落 `creatorId=NULL`、`creatorName=service:<name>`，官方 DTO 的 `creator` link 为 null；不伪造人类用户。
6. 端点绑定采用配置服务名（`AUTH_OBO_SERVICE_NAME` / `CHECKPOINT_WORKER_SERVICE_NAME` / `WEBHOOK_AGENT_SERVICE_NAME`），请求头 `X-Service-Name` 不作身份权威。错误服务、错误 audience/issuer、过期、禁用、轮换后 token 全部 401；缺 scope 403。
7. **未做 / P4**：MS/WA/worker 客户端迁移（官方 IModelsClient 注入 `X-Service-Token`、WA baseline、worker 数据面）、briefcase owner 相关写、锁写、extended-data/命名版本写、baseline `failed/requeue`、`/imodels/admin/*`、iModel list/detail、TLS、共享 key/admin 退役、B10 tenant、审计表接入。B6 未完成，X-21 保持 open。

---

## 1. 目标、验收与非目标

### 1.1 本切片目标

1. 从后端真实调用面（checkpoint-worker、modeling-server、webhook-agent）反推出官方数据面端点清单，标出读/写与 baseline/internal-only。
2. 定义最小、封闭、逐端点的 scope 矩阵，并让 Hub 官方路由在双模下接受签名 service token。
3. 服务主体绝不映射为用户；无显式 scope 的端点一律拒绝；legacy 共享 key 只在显式回滚/关闭模式可用。
4. 不改变用户 JWT、公共 REST DTO、官方客户端响应形态。
5. 用单元/路由元数据/迁移测试证明矩阵与失败关闭；新增隔离 relational e2e（本切片不执行）。

### 1.2 可观察验收

| # | 验收 | 证据 |
|---|---|---|
| A1 | 端点清单来自真实后端调用面，读/写/legacy-only 明确 | 本 AIRR §3；后端源码路径引用 |
| A2 | scope 封闭、无通配/admin/iModel 元数据/锁写 | `service-scope.ts`、`service-scope-matrix.spec.ts` |
| A3 | 迁移 additive，CHECK 镜像 allowlist，可回滚 | `20261124000004-AddDataPlaneServiceScopes.ts`、迁移单测 |
| A4 | service token 正确 scope + pinned service → 通过 | `data-plane-auth.guard.spec.ts`、路由元数据单测、隔离 e2e 6/6 |
| A5 | 缺/错 scope、错误服务、错误 audience、过期、禁用、轮换、畸形 token → 401/403 | 单测 + 隔离 e2e 6/6 |
| A6 | 无元数据端点、owner 依赖写、用户路由拒绝 service token | 路由元数据单测、隔离 e2e 6/6 |
| A7 | 用户 JWT 路径与 legacy off/allow 路径不变 | 既有 guard/e2e 单测、隔离 e2e 6/6 |
| A8 | 不记录 token/secret/query | guard Logger spy 单测 |
| A9 | Hub 全量单测/tsc/eslint 绿 | §7（实际命令与结果） |

### 1.3 明确非目标

- 不迁移任何客户端；不修改 MS/WA/worker/web/BFF。
- 不删除 `AGENT_API_KEY`、`SystemAgentOrResourceGuard` legacy 分支、人类 admin 登录或任何用户数据面。
- 不给 owner 依赖路由（briefcase create/acquire/release、锁写）授予服务主体；不伪造 `userId`。
- 不做 RS256/JWKS、KMS、token 撤销列表、TLS/mTLS、B10 租户/RLS、WORM/审计表写入。
- 不勾选 G1 Gate；不宣称 B6/X-21 完成。

---

## 2. 复用矩阵

| 能力 | 现有实现 | P3 决策 | 理由 |
|---|---|---|---|
| 服务客户端注册/哈希/JWT 签发 | B6 P0 `service_clients` + `ServiceTokenService` | **原样复用** | 不新增 IdP/JWKS/refresh |
| 内部双模守卫 | `ServiceAuthGuard` | **复用其 service 名解析与 legacy 模式判定** | 一个策略来源；不建第二策略引擎 |
| 数据面鉴权 | class JWT + `SystemAgentOrResourceGuard`（X-API-Key 旁路） | **新增 `DataPlaneAuthGuard` + service 分支** | 保留用户 JWT 路径，同时允许服务 token |
| RBAC | `AuthorizationService` / `ResourceAccessGuard` | **服务主体分支不使用 RBAC；用户分支原样** | 服务主体不是用户，scope 即授权 |
| 审计 | B7 `audit_events`（authz decision 形状） | **不写表；结构化日志 + row 归因** | 数据面读/写没有 decisionId；避免伪审计 |
| 行归因 | changeset `creatorId/creatorName` | **service 主体写 `creatorName=service:<name>`，creatorId NULL** | 不冒充用户，无 schema 变更 |
| 迁移 | 手写 TypeORM additive | **复用** | CHECK 约束追加，可 revert |
| 日志脱敏 | pino redact `x-service-token` | **复用** | 不记录 token/key/query |

**无新增 npm 依赖；无公共 REST DTO 变更；无 native/渲染/求解器变更。**

---

## 3. 数据面端点清单（来自真实服务客户端）

调用面取证：
- checkpoint-worker：`luban-backend/checkpoint-worker/src/hub/client.ts`、`native/runtime.ts`、`native/nativeCheckpointGenerator.ts`；官方 `BriefcaseManager.downloadBriefcase` → `BackendIModelsAccess`。
- modeling-server：`luban-backend/modeling-server/src/hub/createIModelsClient.ts`、`version/hubVersionResolver.ts`、`routes/retry.ts`；官方 `IModelsClient` + `BackendIModelsAccess`。
- webhook-agent：`luban-backend/webhook-agent/src/baseline-generator.ts`、`main.ts`、`hubAuthClient.ts`。
- 官方路径：`imodels-clients` 的 `IModelsApiUrlFormatter`、`BackendIModelsAccess`、`CheckpointHelperFunctions`。

图例：R=读，W=写，B=baseline/internal-only，P3=本切片接入，Legacy=仍仅用户 JWT/共享 key/服务账号。

| 端点 | 方法 | 使用方 | R/W | P3 状态 | scope / 备注 |
|---|---|---|---|---|---|
| `/imodels/:iModelId/changesets` | GET | MS/worker（官方 list/download） | R | **P3** | `data.changesets.read` |
| `/imodels/:iModelId/changesets/:idOrIndex` | GET | MS/worker | R | **P3** | `data.changesets.read` |
| `/imodels/:iModelId/changesets/index/:index` | GET | worker | R | **P3** | `data.changesets.read`（兼容路由） |
| `/imodels/:iModelId/changesets/:id/file` | GET | MS/worker | R | **P3** | `data.changesets.read` |
| `/imodels/:iModelId/changesets/:id/download` | GET | MS/worker（字节流） | R | **P3** | `data.changesets.read` |
| `/imodels/:iModelId/changesets` | POST | MS（push） | W | **P3** | `data.changesets.write`；行归因 `creatorName=service:<name>` |
| `/imodels/:iModelId/changesets/:id/file` | POST | MS（initiate upload） | W | **P3** | `data.changesets.write` |
| `/imodels/:iModelId/changesets/:id/complete` | POST/PATCH | MS（官方 confirm） | W | **P3** | `data.changesets.write` |
| `/imodels/:iModelId/changesets/:id/extendeddata` (list/single) | GET | 官方 SDK（非当前服务路径） | R | Legacy | 非本切片必要面；留 P4 |
| `/imodels/:iModelId/changesets/:id/extendeddata` | POST | 官方 SDK（非当前服务路径） | W | Legacy | handler 读 `req.user`，P4 需归因设计 |
| `/imodels/:iModelId/changesets/:id/locks` | GET | MS | R | **P3** | `data.locks.read` |
| `/imodels/:iModelId/changesets/:id/locks/release` | POST | 用户/服务账号 | W | Legacy | handler 读 `req.user.id` |
| `/imodels/:iModelId/changesets/:id/complete`（旧 POST 形态） | POST | 兼容 | W | **P3** | 同上 |
| `/imodels/:iModelId/briefcases` | GET | MS/worker | R | **P3** | `data.briefcases.read` |
| `/imodels/:iModelId/briefcases/:briefcaseId` | GET | MS/worker | R | **P3** | `data.briefcases.read` |
| `/imodels/:iModelId/briefcases/by-id/:id` | GET | 兼容 | R | **P3** | `data.briefcases.read` |
| `/imodels/:iModelId/briefcases/:briefcaseId/sync` | GET | MS | R | **P3** | `data.briefcases.read` |
| `/imodels/:iModelId/briefcases/:briefcaseId` | DELETE | MS（release） | W | **P3** | `data.briefcases.write` |
| `/imodels/:iModelId/briefcases` | POST | MS（owner create） | W | **Legacy** | handler 需要 `userId`；不冒充用户，P4 |
| `/imodels/:iModelId/briefcases/acquire` | POST | MS（官方 acquire） | W | **Legacy** | handler 读 `req.user.id` 且属主语义；P4 |
| `/imodels/:iModelId/briefcases/:id/release` | POST | MS（official release） | W | **Legacy** | handler 读 `req.user.id`；P4 |
| `/imodels/:iModelId/briefcases/user/:userId` | GET | 用户面 | R | **Legacy** | 用户维度列举；不给服务主体 |
| `/imodels/:iModelId/briefcases/checkpoint` | GET | MS/worker（V1 fallback） | R | **P3** | `data.checkpoints.read` |
| `/imodels/:iModelId/changesets/index/:index/checkpoint` | GET | MS/worker | R | **P3** | `data.checkpoints.read` |
| `/imodels/:iModelId/changesets/:idOrIndex/checkpoint` | GET | MS/worker（V2） | R | **P3** | `data.checkpoints.read` |
| `/imodels/:iModelId/namedversions/:id/checkpoint` | GET | MS | R | **P3** | `data.checkpoints.read` |
| `/imodels/:iModelId/briefcases/:briefcaseId/checkpoint` | GET | MS/worker | R | **P3** | `data.checkpoints.read` |
| `/imodels/:iModelId/namedversions/:id/checkpoint` | PUT | MS（schedule） | W | **P3** | `data.checkpoints.write` |
| `/imodels/:iModelId/locks` | GET | MS（官方 list） | R | **P3** | `data.locks.read` |
| `/imodels/:iModelId/locks/released-locks` | GET | MS（官方 released list） | R | **P3** | `data.locks.read` |
| `/imodels/:iModelId/locks/:lockId`、`/briefcase/:id`、`/object/:id`、`/object/:id/active`、`/batch` | GET | MS/兼容 | R | **P3** | `data.locks.read` |
| `/imodels/:iModelId/locks` | POST/PATCH | MS（官方 acquire/update） | W | **Legacy** | 属主断言需要 `userId`；P4 |
| `/imodels/:iModelId/locks/release-chunk`、`/batch`、`/:lockId/release`、`/briefcase/:id/release-all` | POST/PATCH | MS/兼容 | W | **Legacy** | 同上 |
| `/imodels/:iModelId/namedversions`、`/:id`、`/name/:name` | GET | MS/官方 | R | **P3** | `data.namedversions.read` |
| `/imodels/:iModelId/namedversions`、`/:id`、`/:id/checkpoint` | POST/PATCH/DELETE/PUT | 用户面 | W | **Legacy** | 用户 RBAC |
| `/imodels/:iModelId/baselinefile` | GET | WA | R/B | **P3** | `data.baseline.read`（仅 webhook-agent） |
| `/imodels/:iModelId/baselinefile` | POST | WA（complete） | W/B | **P3** | `data.baseline.write`（仅 webhook-agent） |
| `/imodels/:iModelId/baselinefile/upload` | POST | 官方 authoring/WA | W/B | **P3** | `data.baseline.write`（仅 webhook-agent） |
| `/imodels/:iModelId/baselinefile/failed` | POST | WA | W/B | **Legacy** | `AgentApiKeyGuard`；P4 |
| `/imodels/:iModelId/baselinefile/requeue` | POST | MS retry | W/B | **Legacy** | `AgentApiKeyGuard`；P4 |
| `/imodels/admin/uninitialized`、`repair*`、`compensation-status` | GET/POST | WA/运维 | B | **Legacy** | `ApiKeyGuard`；P4 |
| `/imodels`（list）、`/imodels/:id`（detail）、创建/删除/权限/缩略图 | GET/POST/PATCH/DELETE | 用户面 | R/W | **Legacy** | 需要用户可见性/ACL 或 `req.user`；P4 |
| `/internal/imodels/...`（claim/complete/chain 等） | POST/GET | worker | W/R | 已由 P0 | `checkpoint.agent`，本切片不改 |
| `/auth/token/service`、`/internal/...` | POST/GET | 服务 | — | 已由 P0/P2 | 本切片不改 |

**结论**：P3 只覆盖可由“签名服务主体 + 资源 scope”安全授权、且 handler 不需要人类/属主身份的路由；owner 依赖写与 local-extension 路由明确留 legacy。

---

## 4. Scope 与服务矩阵

### 4.1 Scope（closed allowlist）

```text
data.changesets.read      data.changesets.write
data.briefcases.read      data.briefcases.write
data.checkpoints.read     data.checkpoints.write
data.locks.read           data.namedversions.read
data.baseline.read        data.baseline.write
```

- 无 `data.*`、`admin`、`data.imodels.read`、`data.locks.write`、`data.namedversions.write`。
- DB CHECK（迁移 `20261124000004`）与 `SERVICE_SCOPE_ALLOWLIST` 双向镜像。
- 缺失 scope → 403；token 只带无关 scope → 403；**额外的已 provision scope 不会扩大端点权限**（端点只检查自己声明的 required scope，且服务名必须在该端点 pin 列表内）。

### 4.2 服务 → scope（建议 provisioning）

| 服务（配置名） | 建议 scopes | 用途 |
|---|---|---|
| modeling-server（`AUTH_OBO_SERVICE_NAME`） | 8 个非 baseline scope：changesets/briefcases/checkpoints read+write、locks read、namedversions read | 官方 IModelsClient 编辑/推拉/锁读/版本读/checkpoint；baseline 路由仅 webhook-agent pinned，MS 不申请 |
| checkpoint-worker（`CHECKPOINT_WORKER_SERVICE_NAME`） | `data.changesets.read`、`data.briefcases.read`、`data.checkpoints.read` | 下载目标 briefcase/checkpoint 证据；只读 |
| webhook-agent（`WEBHOOK_AGENT_SERVICE_NAME`，默认 `webhook-agent`） | `data.baseline.read`、`data.baseline.write` | baseline 状态/完成 |

### 4.3 端点 pin（服务允许列表）

端点级 `@RequireServiceAuth({ profile: 'data-plane', scope, dataPlaneServices })`：

- changesets 读 / briefcases 读 / checkpoints 读 → `['modeling-server','checkpoint-worker']`
- changesets 写 / briefcases 写 / checkpoints 写 / locks 读 / namedversions 读 → `['modeling-server']`
- baseline 读/写 → `['webhook-agent']`

`DataPlaneAuthGuard` 校验签名 token 的 `serviceName` 是否在 pin 列表；错误服务即使 scope 正确也 401。检查顺序：

1. `X-Service-Token` 存在 → 路由必须有 data-plane profile + data scope + 非空 pin 列表，否则 401（不查 token）。
2. 校验签名/`typ=service`/`ver`/`iss`/`aud`/`exp`/`jti`/`secretVersion`/client enabled/current scopes → 失败 401。
3. service 名不在 pin 列表 → 401。
4. route scope 不在 token scopes → `SystemAgentOrResourceGuard` 403。
5. 无 `X-Service-Token` → 原 JWT 策略；后续 `SystemAgentOrResourceGuard` 按 legacy/RBAC 分支处理（与 P0 前一致）。

### 4.4 双模与 legacy

| 模式 | 数据面 service token | 数据面 legacy X-API-Key |
|---|---|---|
| `AUTH_SERVICE_CLIENTS_ENABLED=off`（默认） | 401（token 端点 404） | 接受（与旧行为一致） |
| `shadow` + `AUTH_SERVICE_LEGACY_API_KEY=allow` | 接受 | 接受（显式回滚/注册） |
| `shadow` + `deny`（默认） | 接受 | **不授予旁路**；继续 RBAC（普通用户可过，服务账号通常 403） |

- 呈现但无效的 service token **绝不**回退到共享 key 或用户 JWT。
- `X-Service-Name` 只在 legacy 分支使用；服务 token 的服务名只取签名 `sub`。
- 用户 JWT 路径、官方 DTO 与链接生成不变。

---

## 5. 实现

### 5.1 守卫

- 新增 `src/service-identity/guards/data-plane-auth.guard.ts`：class-level，继承 passport `AuthGuard('jwt')`；无 token 时走原策略，有 token 时走签名 service 校验。
- `src/common/authorization/system-agent-or-resource.guard.ts`：新增服务主体分支（只按显式 scope），legacy key 受模式开关约束；用户 RBAC 逻辑不变。
- `ResourceAccessGuard` 显式拒绝 `servicePrincipal`（纵深防御）；`JwtUserValidationGuard` 对服务主体跳过用户加载（class guard 已先做元数据门）。
- `resolveExpectedServiceNames` / `isLegacyServiceApiKeyAllowed` 统一解析配置名与 legacy 模式，`ServiceAuthGuard` 与数据面守卫共用。

### 5.2 控制器接线

六个控制器的 class guard 从 `AuthGuard('jwt')` 改为 `DataPlaneAuthGuard`（checkpoints/iModels 仍是 `DataPlaneAuthGuard + JwtUserValidationGuard`）。只在 §3 标 **P3** 的 handler 上加 data-plane 元数据；未标注 handler 对服务 token 一律 401。

### 5.3 迁移

`src/database/migrations/20261124000004-AddDataPlaneServiceScopes.ts`：additive 替换 `CHK_service_clients_scopes`，追加 10 个 data scope。Down 恢复 P2 allowlist；要求先把客户端 scope 收敛回 P2，否则回滚失败（runbook 见 §8）。

### 5.4 归因与审计

- changeset：`creatorId=NULL`、`creatorName=service:<name>`；官方响应 `creator` link 为 null。
- briefcase delete / checkpoint schedule：无人类归属列，记录结构化日志 `method/service/scope/result/path`。
- **不写 `audit_events`**：B7 表是 authz decision 形状（需要 decisionId/iTwin/action/decision），数据面读/写没有对应 decision；写入会制造伪审计。P4 若要求 append-only 服务审计，需单独 AIRR 扩展事件类型。
- 日志绝不包含 token、client secret、SAS、共享 key 或查询串。

### 5.5 配置

- `AUTH_SERVICE_CLIENTS_*` 沿用 P0。
- 新增 `WEBHOOK_AGENT_SERVICE_NAME`（默认 `webhook-agent`，必须匹配 `^[a-z][a-z0-9-]{1,63}$`）。
- `AUTH_OBO_SERVICE_NAME` / `CHECKPOINT_WORKER_SERVICE_NAME` 已存在，作为 pin 解析来源。

---

## 6. 明确未实现（stop-and-report）

以下端点**不**接受服务主体，因为控制器/服务需要人类或 briefcase 属主身份；本切片选择拒绝而不是绕过授权：

1. `POST /imodels/:id/briefcases`（`resolveOwnerUserId` 需要 `req.user` 或显式人类 `userId`）。
2. `POST /imodels/:id/briefcases/acquire`、`POST /:briefcaseId/release`（`req.user.id` + 属主匹配）。
3. 全部锁写：`PATCH /locks`、`POST /locks/release-chunk`、`POST /locks/:id/release`、`/briefcase/:id/release-all`、旧 batch（`assertBriefcaseOwnership` 需要 `userId`）。
4. changeset extended-data 写（一个 handler 直接读 `req.user.id`）、changeset groups 写、changeset lock release（`req.user.id`）。
5. named-version 创建/更新/删除/checkpoint PUT（`ResourceAccessGuard` 用户 RBAC）。
6. baseline `failed`/`requeue` 与 `/imodels/admin/*`（`AgentApiKeyGuard` / `ApiKeyGuard` legacy 控制器；WA/MS 仍依赖共享 key）。
7. iModel list/detail 与其他用户数据面：`GET /imodels` 需要按 `req.user` 过滤可见性；`GET /imodels/:id` 当前是用户 ACL 路由，P3 不把它改成服务旁路。因此 **没有定义 `data.imodels.read`**，官方 `iModels.getSingle/queryIModelByName` 仍 legacy。

这些是 P4 的前置：需要服务归属/服务 actor 模型（而非借用一个 admin 用户）或路由级 owner 语义扩展。

---

## 7. 测试与证据

### 7.1 新增/更新的单元测试

- `test/unit/service-identity/data-plane-auth.guard.spec.ts`（新）：无 token 委托 JWT、正确 token/服务通过、无元数据/非 data-plane/非 data scope/空 pin 列表拒绝、重复 header、坏 token 不回落、错误服务/错误端点 pin 拒绝、日志无 token/query。
- `test/unit/service-identity/data-plane-route-wiring.spec.ts`（新）：六控制器 class guard 接线；逐 handler scope/pin 断言；owner 依赖 handler 元数据为 undefined。
- `test/unit/service-identity/service-scope-matrix.spec.ts`（新）：矩阵精确值、拒绝 `data.*`/`admin`/`data.imodels.read`/锁写、内部 scope 非 data scope、normalize。
- `test/unit/service-identity/data-plane-scope-migration.spec.ts`（新）：迁移 up/down、无 DML。
- `test/unit/authorization/system-agent-or-resource.guard.spec.ts`（改）：service 主体 scope allow/deny、无元数据拒绝、服务主体优先于 legacy key、shadow+deny 不旁路、shadow+allow 保留回滚、日志脱敏。
- `test/unit/imodels/service-account-channel.guard.spec.ts`（改）：构造函数/config 适配；既有 legacy 通道断言保持。
- `test/unit/service-identity/service-identity-config.spec.ts`（改）：`WEBHOOK_AGENT_SERVICE_NAME` 默认/覆盖/非法值。
- `test/user/service-data-plane.e2e-spec.ts`（新，隔离 relational）：按 §4 矩阵验证允许/拒绝、错误服务/audience/expired/disabled/rotated、用户 JWT 仍可用、service token 不能访问 `/auth/me`/briefcase create/acquire/锁写、legacy allow 路径仍可用。

### 7.2 本地执行结果（2026-11-24）

```text
npx tsc --noEmit -p tsconfig.json
→ PASS (exit 0)

npx eslint "{src,apps,libs,test}/**/*.ts"
→ PASS (exit 0; 0 errors, 88 warnings; the new P3 files lint warning-free)

npx jest --config ./test/jest-unit.json --coverage=false
→ Test Suites: 167 passed, 167 total
→ Tests:       1504 passed, 1504 total
→ Time:        203.136 s

# 隔离 relational 栈（docker compose -p tests-p3，独立 volume；用后 down -v）
npx jest --config ./test/jest-e2e.json test/user/service-data-plane.e2e-spec.ts --runInBand --forceExit
→ Test Suites: 1 passed, 1 total
→ Tests:       6 passed, 6 total
```

隔离 Postgres 上的迁移实证（fresh volume，API 启动时真实执行 `migration:run`）：

```text
CHK_service_clients_scopes = CHECK (... scopes <@
  '["authz.decide",...,"session.status","data.changesets.read",...,"data.baseline.write"]'::jsonb)
INSERT scopes ["data.changesets.read","session.status"]  → INSERT 0 1
INSERT scopes ["data.*"]                                  → ERROR violates CHK_service_clients_scopes
```

**评审更正（2026-11-24）**：首次实现的 P2/P3 迁移把 scope 列表字符串再次包进 `["..."]`，实际生成
`[""authz.decide",...]` 的非法 JSON，`::jsonb` 会在真实迁移时失败；单元测试原先只做字符串包含，未捕获。
已改为 `'[${...}]'` / `'[${...},${...}]'`，并让 P2/P3 迁移单测提取 SQL 字面量做 `JSON.parse` 与精确
allowlist 断言。修复后在 fresh Postgres 上真实应用通过（上述证据）。P2 迁移此前未部署到任何环境，
故可直接更正，无需新增补偿迁移。

### 7.3 全量证据边界

- 上述结果来自本机 Hub 工作树与隔离 compose 栈（`tests-p3`，用后已 `down -v` 并删除项目镜像），未提交、
  未推送、未发布镜像、未触碰 live DB/stack。
- 隔离 e2e 会真实启动 Nest 应用、应用全部迁移、seed、签发并校验 service token；但**不是部署形态 canary**，
  不覆盖真实 TLS/KMS/Azurite 长上传/native checkpoint 与 MS/WA/worker 客户端迁移。
- 后端 MS/WA/worker 未运行任何测试（本切片未改其代码）；P4 迁移前必须补 fake Hub + 真栈 canary。

---

## 8. 发布/回滚

### 8.1 发布顺序

1. 应用 additive 迁移 `20261124000004`（无数据/凭据变更）。
2. 用 CLI provision/更新客户端 scopes（secret 来自密钥库/stdin，不落日志）：
   - MS：全部 data scopes；worker：只读；WA：baseline read/write。
3. 保持 `AUTH_SERVICE_CLIENTS_ENABLED=off` 部署 P3 代码：行为与旧版一致，service token 不被接受。
4. 切 `shadow` + `AUTH_SERVICE_LEGACY_API_KEY=allow`，让新旧客户端并存；观察 guard allow/deny 日志。
5. P4 客户端迁移完成后切 `shadow` + `deny`；最后退役共享 key/admin。

### 8.2 回滚

- 客户端仍发共享 key 时：先切回 `AUTH_SERVICE_CLIENTS_ENABLED=off`（legacy 全放行），再回滚代码。
- 若已切 `deny`：先 `allow`，再回滚。
- 迁移 down 仅恢复 CHECK allowlist；若客户端仍带 data scopes 会失败。先收敛客户端 scopes。
- 禁用 service client / 轮换 secret 可在 300–900s 内使既有 token 失效；无全局撤销列表。

---

## 9. P4 剩余（关闭 X-21 前）

1. **客户端迁移**：MS `createIModelsClient` 注入 `X-Service-Token`（HeaderFactories 为同步工厂，需内存缓存 provider）；worker 官方 IModelsClient 数据面；WA baseline。
2. **owner/归属语义**：briefcase create/acquire/release 与锁写需要 service actor（`actorService` 列/独立 owner 类型）或明确的 service-owned briefcase 语义；不得借用人类 admin。
3. **剩余路由**：baseline failed/requeue、`/imodels/admin/*`、extended-data/groups 写、named-version 写、iModel list/detail（可见性过滤的服务语义）。
4. **安全传输**：TLS/mTLS、密钥库集成、token 撤销/审计表扩展、RS256/JWKS（如需要）。
5. **退役**：共享 `AGENT_API_KEY`、人类 admin 服务登录、`AUTH_SERVICE_LEGACY_API_KEY` 分支；删除 `SystemAgentOrResourceGuard` 的 legacy 旁路。
6. **B10**：tenant 映射/RLS，让服务主体也有租户边界。
7. **真栈 canary**：启用 service clients，注册 MS/WA/worker，跑允许/拒绝矩阵，断言日志无 token/secret、数据面不再依赖共享 key。

**在 1–7 完成前：B6 未完成，X-21 保持 open；不得勾选 G1 Gate 或宣称数据面已全面服务主体化。**
