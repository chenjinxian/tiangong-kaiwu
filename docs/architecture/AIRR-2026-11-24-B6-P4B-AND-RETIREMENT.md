# AIRR：G1 B6 P4b — 剩余服务路由、service actor、共享 key/人类 admin 退役与 KMS/RS256/JWKS/撤销

- 标题：B6 P4b — owner 依赖路由与 baseline/admin 收口、service actor 语义、共享 key/人类 admin 删除顺序、KMS/RS256/JWKS/撤销
- 日期：2026-11-24
- Owner：平台/安全
- 关联：`G1-EXECUTION-PLAN.md` B6；`10-ARCHITECTURE-HARDENING-PLAN.md` B6；`IDENTITY-ACL-DESIGN.md` §2/§4.7/§6；`ADR-G0-16-identity-attribution.md` 附录 A；`AIRR-2026-11-23-B6-SERVICE-IDENTITY-P0.md`；`AIRR-2026-11-23-B6-DATA-PLANE-P3.md`；`AIRR-2026-11-24-B6-P4-DATA-PLANE-CLIENTS.md`；`EXCEPTIONS.md` X-21/X-26
- 预计影响仓：私有 `imodelhub-services`（service-identity、imodels controllers、guards、migrations、tests）；私有 `luban-backend/modeling-server`、`webhook-agent`、`checkpoint-worker`（数据面/owner 路由/OBO/服务令牌/配置）；公共仓仅本 AIRR。**不改** `luban-cad/**`、web/viewer/editor、shared IPC、公共 REST DTO、native/求解器/渲染。
- 是否需要 ADR：**是（Proposed）**。共享 key/人类 admin 的删除顺序、数据面 service token 的传输形态、RS256/JWKS/KMS 与撤销语义属于跨仓安全契约，需在 `ADR-G0-16` 下新增附录（编号由 ARB 分配，Proposed）并 ARB 签字。本 AIRR 只给设计与实施顺序，不代表已接受。

> **状态：Proposed；未实现；未运行测试；未改代码；未 commit/push。**
> P4a 的“三进程数据面 code-only、默认 legacy”是既成事实；本 P4b 的 owner 路由、baseline/admin、共享 key/人类 admin 退役、KMS/RS256/JWKS/撤销全部为 Proposed。
> 本文中的“当前”只表示 2026-11-24 对私有仓源码的只读走查；“Proposed”表示尚未落地的设计。
> 不勾选任何 G1 Gate 项；不宣称 B6 或 X-21 完成。

---

## 0. 结论摘要

1. **P4b 的剩余不是“再选几条路由”**：owner 依赖路由（briefcase create/acquire/release、锁写、extended-data/groups、named-version 写）、baseline failed/requeue、`/imodels/admin/*` 仍未接入签名服务身份；MS/WA/worker 仍有人类 admin 服务登录；共享 `AGENT_API_KEY` 仍可绕过用户数据面。
2. **推荐 owner 路由用 OBO 用户委托，不引入“服务拥有 briefcase”**：用户触发的 acquire/release/锁写/NV 写必须代表真实用户；服务 actor 只用于无 owner 的系统路由。这样官方 `Briefcase.ownerId` 继续是非空用户 id，不需要发明“服务用户”。后台任务当前不需要写 briefcase；若未来出现后台写者，另立 ADR。
3. **推荐数据面 service token 也接受 `Authorization: Bearer <service JWT>`**：官方 `BackendIModelsAccess` 只通过 `AuthorizationClient.getAccessToken()` 取一个 token；接受签名 service JWT 后，MS/worker/WA 可以用 `ServiceTokenAuthorizationClient` 替换人类 admin 登录，而不再依赖 `X-API-Key` 或占位 Bearer。**迁移期约束**：全局 AuthorizationClient 会影响该进程的全部官方客户端调用；必须先把该进程实际使用的每条 official-client 路由迁到 service/OBO，或在 `restClient` 按路由覆写 `Authorization`，仅对已迁移路由使用 service JWT，未迁移路由仍用 admin JWT。全部迁移完成前不得全局切换，否则 legacy 路由会 401。`X-Service-Token` 继续保留为兼容/内部路由形态。
4. **退役顺序**：先加签名服务身份与 OBO owner 路由 → 三进程显式 opt-in → `shadow+deny` 真栈负例 → 删除人类 admin 登录 → 删除共享 key/legacy 分支/环境变量 → 最后切 KMS/RS256。任何一步都可回退；删除代码后回退需部署旧版并临时恢复 key。
5. **KMS/RS256/JWKS/撤销**：服务 token 从 HS256（共享 `AUTH_JWT_SECRET`）迁移到 KMS 托管的非对称签名（RS256/ES256）+ `kid` + JWKS；保留在线客户端状态检查（enabled/secretVersion/scope）和 session 撤销；新增 `tokenVersion/notBefore` 与短 TTL 的 `jti` denylist 作为定向撤销；JWKS 本身不提供撤销。用户 token 可后迁，避免与 B1.2 同时爆炸。
6. **主要阻塞**：ADR 未签字；OBO 数据面未实现；官方 SDK 无 per-request 用户 Authorization；owner 路由的 OBO 与 briefcase owner 必须与 B2.2 同批；B4 Write 未激活；KMS/TLS 基础设施未就绪；无真栈 canary；隐藏调用方（脚本/运维/测试）未盘点完。

---

## 1. 目标、验收与非目标

### 1.1 目标

1. 把 Hub 上剩余的服务/owner/admin 路由逐条分类，并给出明确的终止状态：`service-token`、`OBO user`、`user-only`、`retired`。
2. 定义 service actor 的语义：服务主体不是用户、不能借用 admin、不能写入需要人类 owner 的资源；系统写入必须有显式 scope 与审计。
3. 给出共享 `AGENT_API_KEY`、`AgentApiKeyGuard`/`ApiKeyGuard`、人类 admin 服务登录、`SystemAgentOrResourceGuard` legacy 分支的删除顺序、前置条件、canary 与回退。
4. 设计 KMS/RS256/JWKS 与服务 token 撤销，覆盖密钥轮换、禁用/轮换客户端、定向 `jti` 撤销、session 撤销、KMS 故障。
5. 保持官方 changeset/briefcase/NV DTO 与公共 REST 语义不变；不新增公共 DTO。

### 1.2 可观察验收（Proposed，未执行）

| # | 验收 |
|---|---|
| A1 | 每条剩余路由有分类：`service-token`/`OBO user`/`user-only`/`retired`；不存在“未分类默认放行” |
| A2 | owner 路由在 OBO 下创建/获取的 briefcase `ownerId=真实用户`；锁写/NV 写的 owner 校验使用同一用户；service-only 被拒绝 |
| A3 | baseline failed/requeue 与 admin 路由只接受签名服务身份（或已退役）；共享 key 在 `deny` 下 401 |
| A4 | MS/WA/worker 不再调用 `/auth/email/login`；进程环境无 admin 密码；官方客户端仍能完成 P3 数据面调用 |
| A5 | `AUTH_SERVICE_CLIENTS_ENABLED=shadow` + `AUTH_SERVICE_LEGACY_API_KEY=deny` 下，无 token/坏 token/错服务/错 scope/禁用/轮换全部 401/403；无回落 |
| A6 | 删除共享 key/legacy 分支后，用户数据面仅 JWT/OBO；service token 不能访问用户数据；日志无 token/key/secret |
| A7 | RS256/JWKS：`kid` 选择、轮换重叠、旧 key 过期、JWKS 缓存、未知 kid、错误 alg 全部符合预期；KMS 不可用时新签发失败关闭、既有 token 验证不受影响 |
| A8 | 撤销：客户端 disable、secret rotate、scope 收回、tokenVersion/notBefore、jti denylist、session revoke 各自在下一请求生效；有 TTL 清理 |
| A9 | 每个阶段有 canary 与回退演练记录；未跑即写“未执行” |

### 1.3 非目标

- 不做 B2.2 的 changeset/briefcase 官方字段归因（另文）；本文只定义 service actor 与 owner 路由 auth。
- 不做 B4 Write 激活；不改变 Manage-only 语义。
- 不做 B10 tenantId/RLS。
- 不做 storage/tile/SAS、BFF、WA webhook 验签、DB/Redis/对象存储 TLS 的完整 B6 范围；这些列为依赖/后续。
- 不删除人类 admin 用户账号本身（仅删除服务使用其凭据）；是否保留 UI 管理员由运维决定。
- 不实现服务拥有的 briefcase/锁/NV；不新增官方 DTO。
- 不勾选 G1 Gate。

---

## 2. 当前状态（只读代码走查，2026-11-24）

### 2.1 P4a 既有事实

- MS/worker/WA 各有一个独立数据面模式开关，默认 `legacy`；只有显式 `service-token` 时才按 Hub P3 矩阵对选定路由注入 `X-Service-Token`。
- P3 已接受 service token 的路由：changesets 读/写（create/file/complete）、briefcases 读/删除、checkpoints 读/写、locks 读、namedversions 读、baseline read/write（仅 webhook-agent）。
- P4a 明确不迁移：briefcase create/acquire/release、锁写、extended-data/groups、named-version 写、baseline failed/requeue、`/imodels/admin/*`、iModel list/detail、用户/权限/缩略图。
- P4a 的官方 client 注入点是 `restClient` 装饰官方 `AxiosRestClient`；`headers` 只保留 `X-API-Key`。该事实继续适用于 P4b。

### 2.2 剩余路由清单

> 分类是本文 Proposed 目标；当前列是只读走查。`SystemAgent` 指 `SystemAgentOrResourceGuard`。

#### A. 系统/运维路由（无需 owner）

| 路由 | 当前调用方 | 当前鉴权 | Proposed 目标 |
|---|---|---|---|
| `POST /imodels/:id/baselinefile/failed` | webhook-agent `_notifyFailure` | `AgentApiKeyGuard`（共享 key） | `ServiceAuthGuard` + `data.baseline.write`；建议 pin `webhook-agent`；写 service actor 审计 |
| `POST /imodels/:id/baselinefile/requeue` | MS retry 路由（FE→MS→Hub） | Hub `AgentApiKeyGuard`；MS 先验用户 JWT 再转发 | 二选一：`ServiceAuthGuard` + `data.baseline.write` pin `modeling-server` + `requestedBy` 审计；或 **retire**（B3.1f-a `AUTH_B3_SURFACES_MODE=enforce` 已拒绝无 session 的 retry）。不得继续共享 key |
| `GET /imodels/admin/uninitialized` | WA recovery | `ApiKeyGuard`（共享 key） | `ServiceAuthGuard` + 新 scope `baseline.admin`；pin WA 或独立 ops client |
| `POST /imodels/admin/repair-baselines` | 运维 | `ApiKeyGuard` | `baseline.admin` + ops client；或 retire 为运维 CLI |
| `POST /imodels/admin/repair/:id` | 运维 | `ApiKeyGuard` | 同上 |
| `GET /imodels/admin/compensation-status` | 运维 | `ApiKeyGuard` | 同上；只读可 `baseline.admin` |

#### B. owner/user 路由（需要人类或属主）

> 下表省略公共前缀 `/imodels/:iModelId`；`/briefcases/...` 表示 `/imodels/:iModelId/briefcases/...`，其余同理。

| 路由族 | 当前 | 当前 owner 语义 | Proposed 目标 |
|---|---|---|---|
| `POST /imodels/:id/briefcases`（create） | `IMODELS_MANAGE` + `SystemAgent`；无 data-plane scope | service 通道 body `userId`，否则 `req.user.id` | **OBO user** `briefcase.write`；service-only 拒绝；官方请求体不承载 owner |
| `POST /briefcases/acquire` | 同上 | `req.user.id` | **OBO user** `briefcase.write`；owner=OBO sub |
| `POST /briefcases/:id/release` | 同上 | `req.user.id` 且必须等于行 owner | **OBO user** `briefcase.write`；service-only 拒绝 |
| `PATCH /briefcases/:id`、`POST /:id/keep-alive` | `IMODELS_MANAGE` + `ResourceAccessGuard` | 用户 JWT | user JWT 或 OBO user；service-only 拒绝 |
| `GET /briefcases/user/:userId` | 用户 ACL | 用户 JWT | user-only；service 不可用（没有人类可见性语义） |
| `POST/PATCH /locks`、`POST /locks/release-chunk`、`/batch`、`POST /:lockId/release`、`POST /briefcase/:id/release-all`、`DELETE /:lockId` | `IMODELS_MANAGE` + `SystemAgent`/`ResourceAccessGuard` | 依赖 briefcase owner `userId` | **OBO user** `doc.write`/`briefcase.write`；必须与 OBO acquire 同批，否则 owner 不一致会导致锁 403/错配 |
| `POST/PATCH/DELETE /changesets/:id/extendeddata`、`/extended-data` | `IMODELS_MANAGE` + `SystemAgent` | `req.user.id` | OBO user `doc.write` 或 user JWT；service-only 拒绝 |
| `POST/PATCH/DELETE /changesets/:id/groups` | `IMODELS_MANAGE` + `ResourceAccessGuard` | 用户 JWT | user-only（或 OBO user `doc.write`）；不允许 service actor |
| `POST /changesets/:id/locks/release` | `IMODELS_MANAGE` + `SystemAgent` | `req.user.id` | OBO user `doc.write` |
| `POST /changesets/download/batch` | `IMODELS_MANAGE` + `SystemAgent` | 用户 JWT | user-only；读语义但当前仍 Manage，不改为 service |
| `PATCH/DELETE /changesets/:id` | `IMODELS_MANAGE` + `ResourceAccessGuard` | 用户 JWT | user-only / `doc.manage` |
| `POST /namedversions`、`PATCH/DELETE /namedversions/:id`、`PUT /namedversions/:id/checkpoint` | `IMODELS_MANAGE` + `ResourceAccessGuard` | `req.user.id` 写 `createdBy` | OBO user `doc.write`（或 user JWT）；service-only 拒绝 |
| `GET /imodels`、`GET /imodels/:id`、`GET /imodels/:id/users*`、`permissions*`、`thumbnails`、`favorites`、`recents`、`clone`、`fork` | 用户 ACL/RBAC | 用户可见性/ACL | user-only；不引入 service actor（可见性无法用服务 scope 表达） |

#### C. 已经 P3（不在 P4b 重做）

changesets 读/写、briefcases 读/删除、checkpoints 读/写、locks 读、namedversions 读、baseline read/write（WA）已由 P3 接受 `X-Service-Token`；P4b 只复核 pin/scope 与客户端迁移。

### 2.3 service token 当前形态

| 项 | 当前 |
|---|---|
| 签名 | HS256，`auth.secret`（`AUTH_JWT_SECRET` 同源） |
| Claims | `typ=service`、`ver=1`、`iss`、`aud`、`sub=service:<name>`、`scopes`、`jti`、`secretVersion`、`iat/exp` |
| TTL | 300–900s，默认 600s |
| 校验 | 每次请求验签 + 客户端 `enabled` + `secretVersion` + scope 子集；`ServiceTokenService.validate` 要求 `auth.serviceClients.enabled === 'shadow'` |
| 撤销 | disable、rotate secret、scope 收回、自然过期；无全局 `jti` denylist |
| 密钥 | 单版本、进程内 secret；无 KMS/JWKS/双密钥 `kid` |
| 传输 | 内部路由 `X-Service-Token` 或 Bearer；数据面只 `X-Service-Token`；用户数据面不接受 service token |
| 审计 | 结构化日志；未写 `audit_events`（X-26） |

### 2.4 共享 key 与人类 admin 登录

| 位置 | 当前 |
|---|---|
| Hub `AgentApiKeyGuard` | `X-API-Key` 与 `AGENT_API_KEY` 常量时间比较；设 `isServiceRequest/serviceName` |
| Hub `ApiKeyGuard` | `X-API-Key` 与 `INTERNAL_API_KEY` 常量时间比较；admin 路由 |
| Hub `SystemAgentOrResourceGuard` | 分支 2：匹配共享 key 时绕过 RBAC；`AUTH_SERVICE_CLIENTS_ENABLED=off` 或 `shadow+allow` 才生效；`shadow+deny` 不授予旁路 |
| MS | `ServiceAccountAuthClient` 用 `IMODELHUB_ADMIN_EMAIL/PASSWORD` 调 `/auth/email/login`；IModelsClient 注入 `X-API-Key` |
| WA | `hubAuthClient` 用同一 admin email/password；baselinefile 请求带 JWT + `X-API-Key`；admin uninitialized 只带 key |
| checkpoint-worker | `main.ts`/`native/runtime.ts` 用 admin email/password 构造 authorization client；内部 agent 已用 service token，数据面 P4a 只对 P3 注入 |
| 环境 | `AGENT_API_KEY`、`INTERNAL_API_KEY`、`IMODELHUB_API_KEY`、`IMODELHUB_ADMIN_EMAIL/PASSWORD`、`AUTH_JWT_SECRET` 均由 `.env`/compose 注入 |

---

## 3. Service actor 与 owner 语义（Proposed）

### 3.1 原则

1. **service principal 不是 user**：`sub=service:<name>`，`request.user` 永不由 service principal 填充；需要用户身份的路由必须用 OBO 或用户 JWT。
2. **不借用人类 admin**：service actor 不得以 admin 用户 id 写入；如果路由需要 owner，必须走 OBO 用户委托。
3. **scope 即服务授权**：系统路由只按路由声明的 scope + pin service 判定；不查 iTwin RBAC，不把 service 映射成用户。
4. **owner 路由用 OBO**：OBO 同时提供用户 `sub`、Hub session、单 iModel、动作集合；Hub 校验后设置 `request.user=OBO.sub`（仅该路由/该动作），并保留 service principal 作为 `act`。
5. **不引入服务拥有的资源**：本切片不创建 `ownerType=service` 的 briefcase/lock/NV；后台任务（checkpoint、baseline）没有写 briefcase 的需求。若未来出现后台写者，必须另立 ADR，明确官方 `ownerId` 表示、锁 owner、配额和清理。同理，若未来出现真正的系统 changeset 写者，必须使用独立的 `data.changesets.system_write`（或等价）closed scope 并 pin 到该系统客户端；MS 用户路径不得用 `data.changesets.write` 在无 OBO 时降级为 service actor。
6. **服务 actor 审计**：每条系统写入记录 `actorType=service`、`actorService`、scope、resource；不记录 token。

### 3.2 路由分类规则

| 类型 | 认证 | 授权 | 资源归因 |
|---|---|---|---|
| 系统/运维 | `ServiceAuthGuard`（`X-Service-Token` 或 Bearer service JWT） | 路由 scope + pin service | service actor；无人类 owner |
| owner/user（用户触发） | 用户 JWT 或 service token + OBO | OBO action + 当前 resolver；service token scope | user_via_service（OBO sub） |
| 用户可见性/管理 | 用户 JWT | iTwin RBAC/iModel ACL | user |
| 已退役 | 无路由/410 | — | — |
| legacy 回退 | 共享 key + admin JWT | 旧行为 | legacy_service_account（过渡期，必须可观测） |

**禁止**：在 owner 路由上接受“service token + body userId”；这是当前 briefcase create 的 legacy 漏洞面，P4b 必须关闭。

### 3.3 owner 路由与 B2.2 的耦合

- B2.2 enforce 要求用户 acquire 的 briefcase `ownerId=真实用户`。一旦 owner 变了，锁写的 `assertBriefcaseOwnership` 仍用 `req.user.id`；如果锁写仍走 admin 服务账号，会出现“owner=用户、锁操作用 admin”的 403/错配。
- 因此顺序必须是：
  1. Hub 数据面接受 OBO；
  2. MS acquire/release + 锁写/extended-data/NV 同批走 OBO；
  3. 再开 B2.2 的 briefcase owner enforce；
  4. 最后删除 admin 服务登录。
- 不得只改 acquire 的 owner 而不改锁写；这会让编辑器在第一次取锁时失败。

### 3.4 baseline/requeue 语义

- `baselinefile/failed`：WA 的系统行为，service actor + `data.baseline.write`；记录 `failureReason` 与 service 归因。
- `baselinefile/requeue`：当前是用户在 MS 触发的 retry。两条路径：
  - **推荐（安全优先）**：保留 MS 用户 JWT 校验；Hub 接受 service token + `data.baseline.write`，并记录 `requestedBy`（MS 从用户 JWT 派生、签名/内部头传递，不作为 Hub 授权依据）；或
  - **更严格**：在 `AUTH_B3_SURFACES_MODE=enforce` 下 retire 该路由，改为用户在编辑器内通过 OBO `doc.manage` 触发；需 B3.1g。
- 不得让共享 key 继续调用 requeue；不得用 body `userId` 伪造 requestedBy。

### 3.5 admin 路由语义

- `/imodels/admin/*` 是高风险管理面，不应与普通 service data scope 混用。建议新增 `baseline.admin`（closed allowlist）并只 pin 给独立 `ops`/`webhook-agent` 服务客户端；或整体 retire 为运维 CLI（走同一 service token）。
- 必须记录 actor service、operation、目标 iModel、结果；失败也要结构化日志（B7 高风险审计未完成前，不宣称已审计）。
- 不能把 `baseline.admin` 发给 MS/WA 的普通 worker 客户端；最小权限。

---

## 4. 数据面 service token 传输（Proposed）

### 4.1 问题

官方 `BackendIModelsAccess` 通过 `IModelHost.getAccessToken()` 取一个 Bearer token 作为 `Authorization`；P4a 为了不覆盖它，使用 `X-Service-Token` 额外头。删除人类 admin 登录后，必须给官方客户端一个可用的 `AuthorizationClient`，否则 `getAccessToken` 没有实现。

### 4.2 选项

| 方案 | 做法 | 优点 | 风险 | 结论 |
|---|---|---|---|---|
| A. 占位 Bearer + X-Service-Token | `AuthorizationClient` 返回固定占位串；Hub 只认 X-Service-Token | 改动小 | 占位串可能被官方客户端用于非 Hub 请求/日志；语义不干净；TLS 代理可能拒绝 | 不推荐 |
| B. **服务 JWT 作为 Bearer** | `ServiceTokenAuthorizationClient` 返回 `Bearer <service JWT>`；Hub 数据面 guard 识别 `typ=service` 并当作 service principal；`X-Service-Token` 继续兼容 | 官方客户端只用一个标准头；不再需要共享 key；worker native 可直接用；与 RS256/JWKS 兼容 | guard 必须区分用户 JWT 与 service JWT；错误 token 不得回落用户策略；需要 e2e | **推荐（Proposed）** |
| C. 保留非人类服务账号用户 | 新建一个受限用户作为官方客户端身份 | 官方客户端零改动 | 仍是用户身份；违反 B6 目标；RBAC/可见性污染 | 拒绝 |
| D. 保留人类 admin 登录 | 现状 | 零改动 | 违反退役目标 | 拒绝 |

### 4.3 推荐 guard 行为

1. `Authorization: Bearer <token>` 存在时，先无验签读取 header/claims 的 `typ`（或尝试 service 验签）：
   - `typ=service` → 用 service token verifier；失败 401，**不回落用户 JWT**。
   - 其他/无 `typ` → 走既有 passport JWT 用户策略。
2. 数据面路由仍要求 `profile=data-plane` + 显式 scope + pin service；scope/pin 规则与 `X-Service-Token` 完全相同。
3. `X-Service-Token` 与 Bearer service JWT 同时存在时，必须解析为同一 service 且 scope 至少覆盖路由要求；两个 token 的 `jti` 可以不同（各自签发），但 service/scope 冲突 401。
4. `request.user` 不由 service JWT 设置；OBO 另由 `X-OBO-Token` 设置。
5. 日志只记录 method/path/service/scope/result。

### 4.4 客户端改造（Proposed）

- MS/worker：新增 `ServiceTokenAuthorizationClient implements AuthorizationClient`，从现有 `HubServiceTokenProvider` 取 token，返回 `Bearer <token>`；删除 `ServiceAccountAuthClient` 的 email/password 路径。**前提**：该进程 official-client 全部路由已迁移，或迁移期由 `restClient` 对已迁移路由覆写 `Authorization`，legacy 路由仍由 admin AuthorizationClient 提供。
- WA：`hubAuthClient` 改为 service token provider；baseline 请求使用 `Authorization: Bearer <service JWT>`，不再发送 `X-API-Key`；`X-Service-Token` 可保留为兼容。
- 三进程：数据面模式为 `service-token` 时，已迁移路由带 service JWT（+ 必要的 OBO header）；未迁移路由必须显式分类并保留 admin 或失败，**不得把 service JWT 发到只接受用户 JWT 的路由**。
- 启动校验：service-token 模式缺 client id/secret 启动失败；仍配置 admin email/password 时启动告警/失败（由阶段决定）；official-client 路由清单未全覆盖时启动告警/失败（建议硬失败）。

---

## 5. 共享 key/人类 admin 退役顺序

> 顺序是安全关键。任何“先删 key 再迁客户端”都会造成全断。

### 5.1 阶段表

| 阶段 | Hub | 客户端 | 前置/退出证据 | 回退 |
|---|---|---|---|---|
| P0 盘点 | 保留 legacy | 保留 legacy | 调用方清单（MS/WA/worker/脚本/运维/测试）、env 清单、日志基线；未知调用方清零 | — |
| P1 路由收口 | 给剩余系统路由加 `ServiceAuthGuard` + scope；owner 路由加 OBO 数据面；共享 key 仍允许 | 不切 | 单测/契约/隔离 e2e；每条路由有分类；`legacy_key_hits` 可按 caller 统计 | 关新 guard 代码/flag |
| P2 客户端迁移 | `AUTH_SERVICE_CLIENTS_ENABLED=shadow`；`AUTH_SERVICE_LEGACY_API_KEY=allow` | MS/WA/worker 切 `service-token`；MS owner 路由 OBO；WA 去 email login；worker 去 admin login | 三进程 canary：P3+owner+baseline/admin 允许/拒绝矩阵；`legacy_key_hits=0`；日志无 secret | 客户端切回 legacy；Hub 保持 allow |
| P3 拒绝共享 key | `AUTH_SERVICE_LEGACY_API_KEY=deny` | 保持 service-token | 负例：共享 key 对内部/数据面 401；service token 正确 scope 200；无回落；真实用户数据面仍 JWT/OBO | 临时 `allow` + 客户端 legacy |
| P4 删除人类 admin 服务登录 | 保留 admin 用户账号（供 UI/运维），但服务不再使用 | 删除 MS/WA/worker 的 email/password 配置与登录代码；轮换 admin 密码 | 启动日志无 email login；进程 env 无 admin password；官方客户端仍完成 P3 下载/编辑 | 部署旧版 + 临时恢复凭据（需 HITL/审计） |
| P5 删除共享 key/legacy 分支 | 删除 `AgentApiKeyGuard`/`ApiKeyGuard` 挂载；`SystemAgentOrResourceGuard` 删除 key 分支；删除 `AUTH_SERVICE_LEGACY_API_KEY`；`AGENT_API_KEY`/`INTERNAL_API_KEY` 退役 | 删除 `X-API-Key` 注入（数据面/内部） | 代码扫描无 `X-API-Key` 用户数据面读取；compose/generate-env/verify-stack 不再要求 key；轮换/销毁 key | 部署旧版 + 恢复 key（窗口化） |
| P6 KMS/RS256 | 见 §6 | provider 不变（只换 token 内容） | JWKS/轮换/撤销 canary | 切回 HS256 校验 |

### 5.2 删除顺序的硬约束

1. **先有替代、再拒绝**：每条路由必须有 service/OBO 替代并通过 canary，才可 `deny` 共享 key。
2. **先服务身份、后 admin 账号**：删除 admin 登录前，官方客户端必须能只用 service token 完成 P3/owner 路由；否则会断编辑。
3. **先 owner OBO、后 B2.2 briefcase owner enforce**：锁写与 acquire 必须同批；否则 owner 不一致。
4. **先 deny、后删代码**：`AUTH_SERVICE_LEGACY_API_KEY=deny` 观察至少一个发布周期，确认 `legacy_key_hits=0`，再删 guard。
5. **key 退役要轮换**：删除 env 不等于 key 失效；必须轮换/销毁 `AGENT_API_KEY`/`INTERNAL_API_KEY`，并清理 compose、`.env.example`、generate-env、verify-stack、CI secrets。
6. **admin 用户账号不是服务账号**：只删除服务使用其凭据；如果 UI 仍需管理员，保留用户但轮换密码、限制登录来源、审计。

### 5.3 环境变量删除顺序（Proposed）

| 变量 | P4 | P5 | 说明 |
|---|---|---|---|
| `IMODELHUB_ADMIN_EMAIL` | 服务不再读取 | 可保留给运维/seed | 不作为服务身份 |
| `IMODELHUB_ADMIN_PASSWORD` | 服务不再读取；轮换 | 从服务 env 删除 | 不得出现在 MS/WA/worker |
| `AGENT_API_KEY` / `IMODELHUB_API_KEY`（服务） | 仅 legacy 回退 | 删除并轮换 | 共享 key |
| `INTERNAL_API_KEY` | 仅 admin legacy | 删除并轮换 | admin 路由 |
| `AUTH_SERVICE_LEGACY_API_KEY` | `deny` | 删除 | 无回退开关 |
| `AUTH_SERVICE_CLIENTS_ENABLED` | `shadow`/`on` | `on` | 见 §6.5 |
| `AUTH_JWT_SECRET` | 保留（用户 token/HS256） | 等 KMS 后处理 | 不与 service key 混用 |

### 5.4 canary 矩阵

| 场景 | 期望 |
|---|---|
| 无凭据访问系统路由 | 401 |
| 共享 key 访问系统路由（`deny`） | 401，不查 RBAC |
| service token 正确 service+scope | 200/2xx |
| service token 错 service/scope/过期/禁用/轮换 | 401/403 |
| owner 路由 service-only | 403 `service_actor_not_allowed` |
| owner 路由 OBO user | 200；owner/锁/NV 均为同一用户 |
| OBO 跨 iModel/撤销/session 失效 | 401/403 |
| MS/WA/worker 启动 | 无 admin email/password；`service-token` 摘要；日志无 token/key/secret |
| 用户数据面 | 只 JWT/OBO；service token/共享 key 均 401/403 |
| 回退 | 客户端 legacy + Hub `allow` 恢复；或部署旧版 |

---

## 6. KMS/RS256/JWKS/撤销（Proposed）

### 6.1 当前差距

- 单版本 HS256，`AUTH_JWT_SECRET` 同时签用户 token；service token 与用户 token 共享密钥。
- 无 `kid`、无 JWKS、无 KMS、无双密钥轮换；泄漏只能轮换全局 secret，影响所有用户 token。
- 撤销依赖在线 DB（enabled/secretVersion/scope）与短 TTL；无定向 `jti` 撤销；`jti` 只用于日志。
- 无签名密钥使用审计；无 KMS 故障语义。

### 6.2 目标密钥架构

| 层 | 设计 |
|---|---|
| 主密钥 | 云 KMS（Azure Key Vault/AWS KMS/Vault，按部署）托管非对称密钥；应用无私有密钥材料 |
| 签名 | 服务 token 用 RS256（或 ES256）签名；`kid` 在 JWT header；KMS `sign` API；每次签发一次调用 |
| 验证 | Hub 本地用 JWKS 公钥验证；缓存 `kid→publicKey`；未知 `kid` 401；不调用 KMS 验证 |
| JWKS | `GET /auth/.well-known/jwks.json`（或部署约定路径）返回 active + overlapping public keys；`Cache-Control: max-age=300`；无 token/secret |
| 轮换 | 新 `kid` 发布 → 新 token 用新 key → 旧 key 保留 ≥ max TTL + skew → 退役；事故可即时撤销客户端/`jti` |
| 分离 | service token 与 user token 使用不同 key/aud/iss；用户 token 迁移另立阶段，避免同时影响登录 |
| 算法 | 固定允许列表（RS256/ES256）；拒绝 `none`/HS 混用/算法混淆；`typ/ver` 继续校验 |

### 6.3 Token 版本与 claims

- 保留 `typ=service`、`ver`、`iss`、`aud`、`sub`、`scopes`、`jti`、`secretVersion`、`iat/exp`。
- Proposed 新增：`tokenVersion`（客户端代次，随 disable/rotate/scope 变更递增）、`notBefore`（可选）、`kid`（header）。
- `ver=2` 可用于 RS256 切换；迁移期同时接受 `ver=1` HS256 与 `ver=2` RS256，按 `alg/kid` 选择 verifier；新签发只发 v2。
- 不接受外部签发的 service token；JWKS 只用于验证 Hub 签发的 token。

### 6.4 撤销语义

| 动作 | 生效 | 机制 |
|---|---|---|
| 禁用客户端 | 下一请求 401 | `service_clients.enabled=false`，在线检查 |
| 轮换 secret | 下一请求 401 | `secretVersion+1`，token claim 不匹配 |
| 收回 scope | 下一请求 401/403 | token scopes 不是客户端当前 scope 子集 |
| 客户端级 `tokenVersion`/`notBefore` | 下一请求 401 | 新列；用于“撤销该客户端全部旧 token”而不轮换 secret |
| 单 token `jti` denylist | 下一请求 401 | 新表 `service_token_revocations(jti, serviceName, expiresAt, revokedAt, reason)`；TTL 清理 |
| session 撤销（OBO/用户） | 下一 decision/数据面请求 401 | 现有 B1.2 session 事实；OBO 绑定 sid |
| 签名密钥泄漏 | 新 token 用新 key；旧 key 从 JWKS 移除 | KMS 轮换 + 短 TTL；必要时 denylist 全部 jti |

**边界**：JWKS 只让验证者拿到公钥，不提供撤销；任何离线验证（未来第三方）都必须接受“撤销延迟到 token 过期”，或在线回调 Hub。Hub 自身始终在线检查客户端状态，因此不禁用离线验证能力，也不宣称离线撤销。

### 6.5 迁移与开关

| 开关 | 默认 | 说明 |
|---|---|---|
| `AUTH_SERVICE_TOKEN_ALG` | `HS256` | `HS256`/`RS256`/`ES256`；迁移期 verifier 可同时接受 |
| `AUTH_SERVICE_TOKEN_KID` | 空 | KMS key alias/version |
| `AUTH_SERVICE_JWKS_ENABLED` | `false` | 发布公钥 |
| `AUTH_SERVICE_TOKEN_REVOCATION_MODE` | `off` | `off`/`shadow`/`enforce`（jti/ tokenVersion 检查） |
| `AUTH_SERVICE_CLIENTS_ENABLED` | `off` | 建议新增 `on`/`enforce` 值；当前只有 `off`/`shadow`，P4b 实现时须避免“shadow 即强制”的命名歧义 |

迁移步骤：

1. KMS 创建签名密钥与 alias；发布 JWKS（可先只读）。
2. Hub verifier 支持 HS256 + RS256 双栈；新签发仍 HS256（shadow）。
3. 内部/三进程 canary 用 RS256 token；验证 `kid`/JWKS/过期/错 alg。
4. 新签发切 RS256；保留 HS256 verifier 至旧 token 最大 TTL + skew。
5. 关闭 HS256 签发；删除 `AUTH_JWT_SECRET` 对 service 的依赖；用户 token 迁移另立。
6. 打开 `jti`/tokenVersion 撤销（shadow → enforce）。

### 6.6 KMS 故障与性能

- KMS 不可用：新签发失败关闭；已有 token 验证不依赖 KMS（本地公钥），直到过期；MS/worker/WA provider 缓存 token 至 `exp-skew`，可撑过短故障。
- 签名延迟预算：p95 ≤ 300ms（仅签发，每 5–10 分钟一次）；验证不调 KMS。
- JWKS 缓存/刷新：`kid` 未知时强制刷新一次，仍未知 401；防止缓存投毒。
- 审计：KMS 调用记录 `kid/service/jti/result`，不记录 token；密钥轮换/禁用需 HITL 与审计。
- TLS：KMS、Hub、DB/Redis/对象存储 TLS 是 B6/B8 的前置；未完成前不宣称“密钥平面完成”。

### 6.7 canary/回退

- Canary：`kid` 轮换重叠、旧 key 过期、未知 kid、错 alg、禁用客户端、rotate secret、scope 收回、jti revoke、tokenVersion、KMS 超时、JWKS 缓存。
- 回退：`AUTH_SERVICE_TOKEN_ALG=HS256` + 保留旧 secret；不删 JWKS 公钥；`REVOCATION_MODE=off`；已签发 RS256 token 在 TTL 内仍可验证（保留公钥）。
- 不删除审计/撤销行；不回滚 schema 数据。

---

## 7. Schema/API 变更（Proposed）

| 变更 | 类型 | 说明 |
|---|---|---|
| `service_clients.tokenVersion` | additive int | 客户端级代次；disable/rotate/scope 变更递增 |
| `service_clients.notBefore` | additive timestamptz | 可选；早于该时间的 token 拒绝 |
| `service_clients.disabledAt` | additive timestamptz | 可观测 |
| `service_token_revocations` | 新表 | `jti` UNIQUE、serviceName、expiresAt、revokedAt、reason；TTL 清理 |
| `baseline.admin` scope | additive CHECK | admin 路由；closed allowlist；pin ops/WA |
| 数据面 Bearer service JWT | guard 语义 | 无公共 DTO；内部合同 |
| `X-OBO-Token` | 内部 header | 见 B2.2 AIRR |
| owner 路由 `data-plane` 元数据 | 路由元数据 | `briefcase.write`/`doc.write`；与 OBO 配对 |

- **不新增**公共 REST DTO；不改官方 changeset/briefcase/NV 语义。
- 新 scope 需 additive migration + AIRR/ADR；DB CHECK 与 `SERVICE_SCOPE_ALLOWLIST` 双向镜像。
- 实现 PR 必须更新 `INTERFACE-FREEZE-MATRIX.md`（本文不修改）。

---

## 8. 测试与证据计划（Proposed，未执行）

### 8.1 Hub 单元/契约

1. 每条剩余路由的 guard/scope/pin 元数据；未分类路由测试失败。
2. service actor：scope allow/deny、错 service、无元数据拒绝、`request.user` 不被填充。
3. 数据面 Bearer service JWT：正确/错误/用户 JWT/过期/禁用/轮换；`X-Service-Token` 与 Bearer 冲突 401。
4. owner 路由 service-only 403；OBO user 200；body userId 伪造 403。
5. baseline/admin：service token 正确/错 scope/错 service；共享 key `deny` 401。
6. KMS/JWKS：kid、alg、轮换、缓存、未知 kid、KMS 超时。
7. 撤销：enabled/secretVersion/scope/tokenVersion/notBefore/jti/session。
8. 日志脱敏。

### 8.2 隔离 relational e2e

- 真实 Postgres + Hub；provision MS/WA/worker/ops clients；覆盖 P3 + P4b 路由。
- 用户 A/B、owner 路由、OBO、service-only、共享 key `allow`/`deny`、disable/rotate、jti revoke。
- 旧 fixture：existing scopes/rows 可读；migration up/down。
- 明确 blocked：跨租户（B10）、真实 KMS（若无可用的测试 KMS，则用本地测试 key 并标注）、生产代理/TLS。

### 8.3 三进程 canary

- MS：下载/打开、FeatureOp、save/push、锁 acquire/release、NV；service-token + OBO；无 admin login。
- worker：claim/complete/storage-token、native download、内部 agent。
- WA：baseline GET/POST/failed、admin uninitialized/repair（若保留）。
- 断言：无 `X-API-Key`、无 `/auth/email/login`、无 token/secret 日志；共享 key 在 `deny` 401；回退路径可用。

### 8.4 证据诚实

- 本 AIRR 无测试结果；实现后记录命令/环境/通过/失败。
- 未跑真栈/KMS 时写“未执行”；不得把 fake Hub/单测写成真栈。
- B6/X-21/G1 Gate 不因本文完成而关闭。

---

## 9. 依赖、阻塞与决策点

### 9.1 阻塞

| # | 阻塞 | 影响 | 解除 |
|---|---|---|---|
| 1 | ADR-G0-16 附录未签字 | 不能把删除顺序当已接受 | ARB |
| 2 | OBO 数据面未实现（B2.2） | owner 路由无法真实用户化 | B2.2 AIRR |
| 3 | 官方 SDK 只有 `AuthorizationClient.getAccessToken()`，且全局影响所有 official-client 路由 | admin 登录删除受阻；全局切换会打断未迁移路由 | 方案 B（Bearer service JWT）+ 逐路由清单/覆写 Authorization |
| 3b | 进程内 official-client 路由未全量盘点（含 SDK 内部调用） | 无法证明全局 service JWT 安全 | P4b 实现的静态分类器 + 启动断言 + 真栈 canary |
| 4 | B4 Write 未激活 | 显式 Edit 用户仍按 Manage；OBO owner 路由可用性受限 | B4 AIRR |
| 5 | 无 KMS/TLS 基础设施 | RS256/KMS 无法生产化 | 平台/安全 |
| 6 | 隐藏调用方未盘点 | 删 key/admin 可能断运维脚本 | P0 盘点 |
| 7 | 无真栈 canary | 不能宣称三进程/代理/日志可用 | staging |
| 8 | 多副本 token provider 无共享 | 每副本独立签发；不影响正确性，影响配额/观测 | 可接受；记录 |
| 9 | B7 高风险审计未完成 | admin/密钥轮换不能宣称已审计 | B7 enforcement |
| 10 | B10 tenantId 缺失 | 跨租户服务身份边界未定义 | B10 |

### 9.2 决策点

| # | 决策 | 建议 |
|---|---|---|
| D-1 | owner 路由用 OBO 还是服务拥有资源 | OBO；不做 service-owned |
| D-2 | 数据面 service token 传输 | 接受 Bearer service JWT；保留 X-Service-Token 兼容 |
| D-3 | baseline requeue | 保留但 service-token + requestedBy，或 retire；不得共享 key |
| D-4 | admin 路由 | 新 `baseline.admin` + ops client，或 retire 为 CLI |
| D-5 | 删除 admin 账号 | 只删服务凭据；保留人类管理员（轮换/限制） |
| D-6 | KMS 厂商 | 按部署云；应用经 `TokenSigner` 接口解耦 |
| D-7 | RS256 覆盖范围 | 先 service token，后用户 token；不同 key/aud |
| D-8 | 撤销策略 | 在线客户端状态 + tokenVersion + 短 jti denylist；不宣称离线撤销 |
| D-9 | `AUTH_SERVICE_CLIENTS_ENABLED` 值 | 新增 `on`/`enforce`，避免 `shadow` 语义歧义 |
| D-10 | 删除共享 key 的窗口 | 至少一个发布周期 `deny` + 零命中 + 回退演练 |

### 9.3 明确不宣称

- 不宣称 B6 完成、X-21 关闭、共享 key 已是纯传输因子、服务身份与用户平面已分离。
- 不宣称 owner 路由已服务化、KMS/RS256/JWKS 已部署、撤销已全量。
- 不宣称 G1 Gate 通过。

---

## 10. 评审结论

- 复用矩阵：完成（复用现有 service client/guard/provider、官方 restClient 接缝、OBO、B1.2 session；无第二套身份系统）。
- 跨仓影响：Hub + MS/WA/worker + 公共文档；shared/web/viewer/editor/native 未改。
- P0 例外：实现 PR 需更新 X-21（共享 key/admin）、X-26（审计）；本 docs-only 变更不修改例外表。
- ADR：需要，Proposed（ADR-G0-16 新附录，编号由 ARB 分配）。
- Owner 签字：无。
- 结论：**Proposed；未批准；未实现；不勾选 G1 Gate。**
