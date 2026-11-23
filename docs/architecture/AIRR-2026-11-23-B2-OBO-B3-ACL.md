# AIRR：G1 B2/B3 身份委托与 ACL PEP 第一阶段（Shadow）

- 标题：G1 B2.1/B2.2/B3.1/B3.2 — OBO 影子签发、MS 本地 PEP 影子决策与下载/打开入口
- 日期：2026-11-23
- Owner：平台/安全（owner directive 2026-11-23）
- 关联 Issue/需求：`G1-EXECUTION-PLAN.md` WS-B B2.1/B2.2/B3.1/B3.2；`IDENTITY-ACL-DESIGN.md`；`ADR-G0-16-identity-attribution.md`；`EXCEPTIONS.md` X-18；`INTERFACE-FREEZE-MATRIX.md`
- 预计影响仓：私有 `imodelhub-services`（auth/session/token/authorization/audit/migrations）；私有 `luban-backend/modeling-server`（principal/connection/OBO client/decision client/download-open shadow/coverage registry）。公共仓仅本 AIRR；`luban-cad/**`、`services/bff`、`webhook-agent` 不在 P0。
- 是否需要 ADR：**是**。ADR-G0-16 提供 OBO/真实归因方向，但状态为 Proposed、未 ARB 签字；P0 新增的 OBO token schema、delegation handle、authz decision 内部契约与 additive schema 属于 P0-04 的 ADR 范围，需在 ADR-G0-16 下补充 token/ACL 契约附录并取得签字。签字前只允许按 owner directive 实施 shadow。

> 状态：**Proposed under owner directive 2026-11-23; not ARB-signed**。本 AIRR 只授权 P0 shadow 实施；不勾选任何 G1 Gate 项；不宣称 OBO、ACL、真实归因或会话隔离已完成。P1–P4 的强制阶段需另行 AIRR/签字。

---

## 0. 结论摘要

1. **只读审计基线**（不作为本 AIRR 的重新审计结论）：
   - B2.1 OBO 仍是设计态：MS 以人类 admin 的 `ServiceAccountAuthClient` 登录 Hub，并注入共享 `X-API-Key`；Hub 服务通道仍信任 body `userId`；不存在 token exchange、audience、scope、`jti` 或 WS ticket。
   - B2.2 OpLog 作者在 session 路径已是真实用户，但 changeset/briefcase 归因仍解析到服务账号；持久审计缺失。
   - B3.1 PEP 清单仍是设计态：download/open/FeatureOp/export/tile/progress/retry 没有 ACL。
   - B3.2 Hub ACL resolver 已存在（iTwin RBAC + secured iModel 显式权限），但 mutation 仍要求 `imodels_manage`，显式 `Write` 惰性，groups/shares/deny/link 未解析；MS 无本地 PDP 调用，`DirectEditWriteGate` 的 ACL 钩子未接。
   - B6 共享 `AGENT_API_KEY` 旁路与人类 admin 服务登录阻塞 OBO；B10 `tenantId` 缺失。
   - B1.2a/b 的 session 绑定与 WS 周期复验已按 owner directive 落地（unit 绿，真栈待服务重建）。

2. **P0 的最小安全切片**：只做 **shadow 签发/决策**，默认不拒绝、不改变用户行为。
   - Hub：新增内部 OBO exchange、delegation handle、authz decision 端点；新增 additive token/audit 表与 nullable 归因列。
   - MS：在现有 WS/session 中间件上建立连接 principal 上下文；WS 升级时用用户 access token 换取 **delegation handle**（WS ticket 的等价物），首个 download/open 用 handle 换取单 iModel OBO；对 download/open 调 Hub decision 并记录 shadow 结果；**实际下载/打开仍走现有 legacy 路径**。
   - 审计：Hub 持久化 allow/deny 决策（最小字段）；MS 结构化记录 shadow 决策与失败原因；token 不落日志/URL/DB 明文。
   - 覆盖清单：所有 PEP 入口必须被标记为 `covered-shadow`、`covered-enforce`、`fail-closed` 或 `registered-exception`；enforce 模式在存在未覆盖项时 **拒绝启动**，杜绝静默放行。

3. **不搞大爆炸切换**：P0 shadow → P1 真实归因 → P2 读强制 → P3 写强制 → P4 全量（groups/shares/deny/link、B6 服务身份、B10 租户、storage/tile/WA、B7 审计 v1）。每个阶段独立开关与回滚；P0 不勾选 G1 Gate。

4. **不新建第二套 auth 栈**：复用 Hub 现有 JWT/session、`AgentApiKeyGuard`、`authorization.service` resolver、changeset/briefcase controllers；复用 MS 现有 `wsAuth`/`SessionRegistry`/`PrincipalContext`/`DirectEditWriteGate` 接缝与现有 shared IPC；只新增最小 token store、decision client 与 coverage registry。

5. **P0 明确不做**：不强制 ACL、不拒绝 download/open、不切换 changeset/briefcase 归因、不接 FeatureOp/direct edit/push/tile/checkpoint 的 PEP、不改 shared IPC、不改 web/viewer、不删 API key、不移除人类 admin 登录、不做 `tenantId`、不做 B7 WORM/hash chain。

---

## 1. 目标、验收与非目标

### 1.1 P0 目标

1. 让 Hub 能以真实用户为主体、以 MS 为代行为者，签发 **短时、单 iModel、scope 受限、可撤销** 的 shadow OBO token。
2. 让 MS 在不持有长期用户凭据的前提下获得 OBO，并对 **download/open** 调用 Hub 决策端点，记录“如果强制会发生什么”。
3. 用 additive schema 持久化最小 authz 审计与 token 元数据；不修改任何历史行。
4. 建立 PEP 覆盖清单与启动断言，证明没有“默认放过且未登记”的入口。
5. 为 P1 归因、P2/P3 强制提供可比较、可回滚的证据基础。

### 1.2 P0 可观察验收标准

1. **无行为变化**：在 `AUTH_OBO_ENABLED=shadow`、`IDENTITY_MODE=obo-shadow`、`ACL_MODE=shadow` 下，合法用户下载/打开文档的成功率、错误码、耗时与全部 flags off 时一致；影子决策不得拒绝请求。
2. **OBO 可签发**：WS 升级成功后，MS 取得 delegation handle；首次 download/open 用 handle 换到 `typ=obo`、`aud=luban-hub:/imodels`、单 iModel、5 分钟 TTL、含 `jti`/`sid` 的 token；token 只在 MS 内存，按连接/iModel 分键。
3. **决策可复核**：download/open 的每次 shadow decision 有 `decisionId`、`userId`、`actorService`、`iModelId`、`action`、`decision`、`reason`、`mode=shadow`，并持久化到 Hub `audit_events`；allow 与 deny 都记录。
4. **撤销可用**：logout/改密/重置/停用后，handle/OBO 的下一 exchange/decision 返回 401；refresh 轮换不误杀 OBO（OBO 绑定 `sid`，不绑定 access token hash）。
5. **覆盖清单可执行**：`ACL_MODE=read|full` 或 `IDENTITY_MODE=obo` 时，若存在未覆盖或仅登记例外（非 `covered-enforce`/`fail-closed`）的入口，MS 启动失败并点名；shadow 模式启动告警并输出 `pep_uncovered` 指标。
6. **无用入口默认拒绝**：export/progress/retry 的用户路径默认 403 `pep_not_implemented`（当前无生产调用方的审计结论）；若实现时发现调用方，必须在同一 PR 接入 PEP 或取得显式例外，不得静默恢复。
7. **证据层完整**：Hub unit + contract + Postgres relational e2e；MS unit + 真栈两用户负例；shadow-vs-enforce 对照；撤销/租户负例（租户负例因 B10 明确登记为 blocked，不伪造通过）。
8. **不勾选 G1 Gate**：本文所有“验收”只针对 P0 shadow，不等于 G1 Gate 满足。

### 1.3 非目标（明确不做）

- 不做 ACL 强制：不拒绝 download/open，不对 FeatureOp/直改/push/export/tile/progress/retry 做 deny。
- 不切换 changeset/briefcase 归因：P0 实际写入仍走 legacy 服务账号；只新增 nullable 列与 shadow 审计，不回填历史。
- 不新增 shared IPC、不改 `LubanFeatureRpcInterface` 1.85.0、`LubanRpcInterface` 1.1.0、`LubanIpcInterface.downloadBriefcase` 签名。
- 不做浏览器 WS ticket 流程；用 **delegation handle** 作为 P0 等价物（见 §3.6），不把 OBO 下发浏览器。
- 不做 B6 服务身份：不移除共享 `AGENT_API_KEY`、不移除人类 admin 登录、不注册 service client。
- 不做 B10 租户：不填真实 `tenantId`、不做 RLS/跨租户强制；`tenantId` 仅占位。
- 不做 B4 groups/shares/deny/link；不改 `access_control_*` schema；不对依赖这些来源的用户提供强制结论。
- 不做 B7 审计 v1：不实现 WORM/hash chain/不可变 DB 约束；只写最小 append-only 应用层审计。
- 不做 storage/tile/SAS/WA 改造，不改 `deploy/`、nginx、BFF。
- 不做 Hub 公共 REST 语义变更；不新增公共 DTO。
- 不做 `LocalhostIpcHost` ALS fork；P0 的 download/open 通过连接上下文显式传参，不需要 fork 改动。
- 不勾选任何 G1 Gate。

---

## 2. 复用矩阵

| 项目/仓 | 现有能力 | 现有实现/路径 | P0 决策 | 理由 |
|---|---|---|---|---|
| `imodelhub-services` | JWT 签发/校验、session 绑定、logout/refresh/改密/停用撤销 | `src/auth/**`、`src/session/**`；B1.2a 已落地 | **复用** | OBO/handle 校验复用同一 session 事实源，不建第二 session store |
| `imodelhub-services` | 服务间预共享密钥 | `AgentApiKeyGuard`、`X-API-Key` | **复用（临时传输因子）** | P0 不新增 service client；API key 只做 exchange/decision 的服务鉴权，不做用户身份（B6 替换） |
| `imodelhub-services` | 唯一权限 resolver | `src/common/authorization/authorization.service.ts`、`permissions.enum.ts`、`imodels/domain/permission.ts` | **复用** | decision 端点直接调用同一 resolver；不在 MS 复制策略，不做第二 PDP |
| `imodelhub-services` | changeset/briefcase/named version controllers | `src/imodels/**` | **复用，P0 不改签名** | 后续 OBO guard 只需把 `req.user` 绑定到 `sub`；controller 既有 `req.user?.id` 语义 |
| `imodelhub-services` | TypeORM 迁移、审计表基础 | `src/database/migrations/**` | **扩展（additive）** | 新增 token/handle/audit 表与 nullable 列；不引入第二 ORM |
| `modeling-server` | WS/session 中间件、SessionRegistry | `src/middleware/wsAuth.ts`、`src/session/**`、B1.2b | **扩展** | 在现有 SessionRecord/连接上下文上加 principal、handle、OBO map |
| `modeling-server` | 连接上下文接缝 | `PrincipalContext`/session middleware 既有结构 | **扩展** | 不新建 auth 中间件栈；按 connectionId/sessionId 解析 |
| `modeling-server` | 直接编辑授权接缝 | `DirectEditWriteGate`（钩子当前未设） | **保留未接，P0 登记为未覆盖** | P0 不接直改；P3 在同一 seam 注入 decision client |
| `modeling-server` | 下载/打开 IPC | `ipc/LubanIpcHandler.ts`、`ipc/AppFunctionIpcHandler.ts`、标准 `ipc-app` | **扩展（shadow only）** | 在 handler 前置 shadow decision，legacy 下载/打开不变 |
| `@luban-cad/shared` | 现有 IPC/RPC 契约 | `LubanIpcInterface`、`LubanFeatureRpcInterface` 1.85.0、`LubanRpcInterface` 1.1.0 | **P0 完全不动** | 不新增 shared 契约；后续 auth IPC 独立版本化 |
| `itwinjs-core` | 标准 IPC/工具生命周期 | `LocalhostIpcHost`、`EditCommandAdmin` | **P0 不 fork、不改**；`EditCommandAdmin` 仅作为 P3 seam | 避免 ALS fork 进入首个切片 |
| 官方 iModels clients/REST | 数据面语义 | 官方 clients + `docs/api-specs/*.json` | **只作参考** | Hub REST 以官方契约优先，不造平行 DTO |
| storage/WA/BFF | SAS、baseline、`/api` | 现有实现 | **P0 不动** | 登记为未覆盖，P4 处理 |

**规则**：优先复用；P0 只新建三样东西——OBO/handle token store、MS 的 OBO/decision client、PEP coverage registry。三者都是现有 auth/resolver/中间件的薄封装，不是第二套认证或授权实现。

---

## 3. 令牌与身份设计

### 3.1 凭据平面

| 凭据 | 主体 | 签发者 | P0 TTL/形态 | 受众 | 用途 | P0 是否实施 |
|---|---|---|---|---|---|---|
| 用户 access token | `user:<id>` | Hub（现有） | 15m，`sessionId`+`sessionHash` 绑定 | Hub UI/API | 浏览器登录；换取 handle | 已有（B1.2a） |
| **delegation handle** | `user:<id>` + `sid` + `clientInstanceId` | Hub | **15m**、不透明、最长 16 次 exchange、单连接 | `luban-hub:/auth/obo-exchange` | MS 换取 OBO；**不可访问数据面** | **实施** |
| **OBO token** | `user:<id>` + `act=service:modeling-server` | Hub | **5m**、不透明、单 iModel、scope 子集 | `luban-hub:/imodels`（decision 端点属于同一数据面受众） | MS 以用户身份请求 Hub 决策；后续数据面/PEP | **实施（shadow）** |
| WS ticket | 用户 + client instance | Hub | 30s、一次性 | MS `/ipc` | 目标形态，替代 P0 handle 的 bootstrap | P1/P2，见 §3.6 |
| Service token | `service:<name>` | Hub | 15m | Hub 系统路由/目标内部服务 | WA/MS 后台任务 | P4（B6） |
| API key | 无用户主体 | 运维 | 预共享 | MS/WA → Hub 内部 | 传输因子；不得当用户身份 | 临时保留，登记 X-20 |
| Link guest token | `link:<shareId>` | Hub | 15m–2h | 受限读路径 | 链接分享 | 不做（B4） |

**硬规则**

1. API key **不能**单独换 OBO；exchange 必须同时出示有效用户 access token/handle。
2. service token（未来）**不能**调用用户数据面，也不能换 OBO。
3. OBO 只代表用户权限的 **子集**；Hub 不得签发超出 resolver 有效权限的 scope。
4. Hub 不得为配置中的服务账号（MS 的 admin 人类账号）签发 OBO；exchange 必须按配置 denylist 拒绝 `sub=<service account user id>`，防止“服务账号换 OBO 后仍以 admin 身份穿透”。
5. OBO/handle 不写日志、不写 URL、不写 DB 明文、不写 briefcase/iModel；只存哈希与 claims。

### 3.2 P0 交换流程

```text
浏览器 --(现有 luban_cad_auth cookie / Bearer access token)--> MS /ipc 升级
  MS wsAuth：现有 token 校验（Hub /auth/me + B1.2b session 记录）
  MS -> Hub：POST /internal/v1/auth/delegation-handles
             Authorization: Bearer <user-access-token>
             X-API-Key: <service transport key>
             X-Service-Name: modeling-server
             { clientInstanceId, connectionId }
  Hub：校验用户 token 的 sessionId/sessionHash、账号状态、service 凭据、
       服务账号 denylist；写入 handle 哈希（15m/16 次）；返回 handle
  MS：丢弃用户 access token（不进入 ConnectionContext）；只保存 handle

首次 downloadBriefcase / openBriefcase：
  MS -> Hub：POST /internal/v1/auth/on-behalf-of
             Authorization: Delegation <handle>
             X-API-Key / X-Service-Name
             { iTwinId, iModelId, scopes:["doc.read"(, "briefcase.write")], clientInstanceId }
  Hub：校验 handle（存在/未过期/未撤销/次数）、session 存活、用户 active、
       iModel 属于 iTwin、调用方为 modeling-server、PDP 解析请求 scopes；
       签发单 iModel、5m、scope=允许子集的 OBO；返回 grantedScopes/deniedScopes
  MS -> Hub：POST /internal/v1/authz/decisions
             Authorization: Bearer <obo-token>
             X-API-Key / X-Service-Name
             { iModelId, actions:["doc.read","briefcase.write"] }
  Hub：校验 OBO（typ/aud/ver/exp/iModel 绑定/session/scope），调用现有 resolver；
       写 audit_events（allow/deny，mode=shadow）；返回 decisionId/actions/reason
  MS：记录 shadow 决策；**继续执行现有 legacy 下载/打开**；不因 deny 拒绝
```

说明：

- **P0 不把 OBO 用于 Hub 公共数据面**。OBO 只被 MS 用于 `/internal/v1/authz/decisions`，避免在首个切片给公共路由加第二种认证。
- Hub 数据面仍由 legacy 服务账号访问；这是被登记的 B6/X-20 缺口，不是 P0 已修复项。
- decision 端点同时要求 OBO + 服务凭据；即使 OBO 泄露，单独持有者不能调用 decision，也无法访问数据面。
- 所有内部端点放在 `/internal/v1/**`，不经 nginx 暴露；与 B1.2b 的 `/internal/auth/sessions/:sessionId/status` 并列，不改变其语义。

### 3.3 Claims

**Delegation handle（不透明令牌，Hub 存哈希与 claims）**

| 字段 | 示例 | 说明 |
|---|---|---|
| `typ` | `delegation` | 只能用于 OBO exchange，不能用于 decision/数据面 |
| `ver` | `1` | 令牌格式版本；MS 拒绝未知版本 |
| `iss` | `https://<hub>` | Hub 签发者 |
| `aud` | `luban-hub:/auth/obo-exchange` | 精确匹配 |
| `sub` | `<user-id>` | 真实用户；拒绝服务账号 |
| `sid` | `<hub-session-id>` | 绑定 B1.2 session |
| `clientInstanceId` | `<tab/connection>` | 客户端实例；审计/绑定，不作为安全边界 |
| `service` | `service:modeling-server` | 由服务凭据映射，不信任请求头自报 |
| `jti` | 256-bit 随机 | 唯一；审计；撤销 |
| `maxUses` / `useCount` | `16` / `0..16` | 限制 exchange 次数 |
| `tenantId` | `null` | **占位**；B10 前不用于授权，不得用 iTwinId 冒充 |
| `iat`/`nbf`/`exp` | epoch | 15m；允许 60s 时钟偏差 |

**OBO token**

| 字段 | 示例 | 说明 |
|---|---|---|
| `typ` | `obo` | 与用户/服务 token 区分 |
| `ver` | `1` | 格式版本 |
| `iss` | `https://<hub>` | |
| `aud` | `luban-hub:/imodels` | 精确匹配；decision 端点属于同一数据面受众 |
| `sub` | `<user-id>` | 真实用户 |
| `act` | `{sub:"service:modeling-server",client:"modeling-server"}` | 代行为者来自已认证服务凭据 |
| `scope` | `["doc.read"]` / `["doc.read","briefcase.write"]` | P0 只允许这两个；只可以是 resolver 允许的子集 |
| `iTwinId` / `iModelId` | UUID | 单文档绑定；跨文档必须重新 exchange |
| `sid` | `<hub-session-id>` | 绑定 session，不绑定 access token hash |
| `jti` | 256-bit 随机 | 审计/撤销 |
| `authzVersion` | `null` | **占位**；P0 无版本表，MS 不得据此做 stale 判断 |
| `tenantId` | `null` | **占位**；P0 只做 iTwin 边界，不做跨租户结论 |
| `clientInstanceId` | `<tab/connection>` | 审计/绑定 |
| `iat`/`nbf`/`exp` | epoch | 5m；60s 时钟偏差 |

**校验必须全部满足**（任一失败即 fail closed，不得回退服务账号/API key）：

1. `typ` 与接受面精确匹配；decision 只接受 `obo`，exchange 只接受 `delegation`。
2. `ver` 等于本端支持的版本；未知版本拒绝（`unsupported_token_version`）。
3. `aud` 精确相等；不接受数组包含任意匹配。
4. `exp + 60s > now`、`nbf <= now + 60s`；过期返回 401。
5. handle：存在、未撤销、`useCount < maxUses`、`sid` 会话存活、用户 active、服务凭据匹配、`sub` 不在服务账号 denylist。
6. OBO：存在、未撤销、`sid` 会话存活、用户 active、路径 iModel 等于 claims `iModelId`、请求 action 在 `scope` 内、`aud` 精确匹配。
7. 请求的 `iTwinId`/`iModelId` 必须与 iModel 实际归属一致；不一致返回 403 `imodel_mismatch`/`cross_itwin`。
8. service 凭据只证明“调用方是 MS”，不改变 OBO 的 `sub`；`act` 只能由 Hub 从服务凭据映射。

### 3.4 scope 与 action 映射（P0）

| Action | 资源维度/最低等级 | P0 用途 | 说明 |
|---|---|---|---|
| `doc.read` | briefcases/changesets/versions/locks 任一 Read，或未 secured 的 iTwin `imodels_webview` | 只读 download/open shadow decision | 复用现有 resolver；不新增策略分支 |
| `briefcase.write` | briefcases Write（若现有 resolver 只能表达 Manage，则 P0 标记 `write_semantics=manage_compat`） | 可写 download shadow decision | 不得把 `manage_compat` 宣称为显式 Write 已生效 |
| `doc.write` / `changeset.push` / `export.read` / `tile.read` / `progress.read` / `version.create` / `doc.manage` | 见 `IDENTITY-ACL-DESIGN.md` §4.2 | P1–P4 | P0 不签发这些 scope，不计算对应决策 |

- exchange 请求 scopes 与 resolver 允许集合取交集；返回 `grantedScopes`/`deniedScopes`，token 只含 granted。
- 若所有请求 scope 都被拒绝：403 `insufficient_permission`，不签发 token（shadow 也如此，避免把无权限 token 交给 MS）。
- decision 的 action 必须同时满足：在 OBO `scope` 内 **且** resolver 当前允许；否则 deny，reason 分别为 `insufficient_scope`/`insufficient_permission`。
- P0 不做 Hub 决策缓存；decision 每次回源 resolver，保证 shadow 与 enforce 使用同一实时策略。MS 可按 `cacheTtlMs`（读 30s）做本地缓存，连接关闭/撤销即清空。

### 3.5 服务身份与用户平面分离

| 规则 | P0 行为 | 目标（P4/B6） |
|---|---|---|
| API key 作为用户身份 | **禁止**；exchange 必须带用户 token/handle | 继续禁止 |
| API key 单独访问用户数据面 | **仍然允许**（legacy `SystemAgentOrResourceGuard`）；登记 X-20 | Hub 用户数据面拒绝 service/API-key；`service_identity_not_allowed` |
| MS 人类 admin 服务登录 | **仍然存在**；仅用于 legacy 数据面，不用于 OBO | 改为不可登录 service principal/client credentials |
| MS 用自身服务 JWT 换 OBO | **禁止**；exchange 拒绝配置的服务账号 `sub` | 服务主体不是用户，不能换 OBO |
| OBO 调系统路由 | **禁止**；`typ=obo` 只接受数据面/decision | 继续禁止 |
| service token 调用户数据面 | 尚不存在（P4） | 403 `service_scope_denied` |

**P0 的诚实结论**：OBO shadow 可以与 legacy 服务通道并存，但 **不等于服务身份分离完成**。任何“共享 API key 不再是旁路”的声明必须等 B6/X-20 关闭。

### 3.6 WS ticket 或等价物

**目标形态（P2 前）**：

1. 浏览器用用户 access token 调 Hub `POST /auth/ws-ticket`，获得 30s、一次性、绑定 `sid`+`clientInstanceId` 的 ticket。
2. 浏览器经 `Sec-WebSocket-Protocol`（或等价的标准握手字段）把 ticket 交给 MS；MS 用服务凭据向 Hub redeem，得到连接 principal 与短时 delegation handle。
3. 用户 access token 从不进入 MS 内存；MS 只持有 handle 与 OBO。

**P0 等价物（本 AIRR 实施）**：

- 浏览器仍走现有 `luban_cad_auth` cookie/Bearer；MS 在 WS 升级栈内用该 token 调 `POST /internal/v1/auth/delegation-handles`，**调用返回后立即丢弃 token**。
- handle 是“只能换 OBO、不能访问数据面”的短时凭据；绑定 `sid`/`clientInstanceId`/connection，15m/16 次，连接关闭 best-effort revoke，session 撤销即失效。
- 这避免了 MS 长期保存 15m 用户 access token，也不需要 P0 改 viewer/web 握手；代价是 handle 仍是 MS 内存中的 bearer（登记风险，见 §9）。
- P0 的长会话限制：handle 15m 到期后，MS 不能再用旧 token 换 OBO；已有 OBO 最多再用 5m。shadow 下记录 `handle_expired` 并继续 legacy；enforce 前必须完成 WS ticket 刷新流程，否则长会话会在 15–20 分钟后无 OBO 而 fail closed。该限制列入 P2 门禁。
- P0 不改 `Sec-WebSocket-Protocol`，不新增浏览器契约。

### 3.7 与 B1.2 access-token session 绑定的交互

| 事件 | Hub access token（B1.2a） | delegation handle | OBO | MS 行为 |
|---|---|---|---|---|
| 正常登录 | 绑定 `sessionId`+`sessionHash` | 由 token 换发，绑定 `sid` | 由 handle 换发，绑定 `sid` | 正常 |
| logout | 下一请求 401 | 按 `sid` 撤销；下一 exchange 401 | 按 `sid` 撤销；下一 decision 401 | B1.2b 关闭同 session socket；清理 context |
| refresh 轮换 | 旧 access token 401，新 token 可用 | **保持有效**（只绑 `sid`，不绑 token hash） | **保持有效**（不因 refresh 误杀） | 可用现有 handle 换新 OBO；无需重连 |
| 改密（删除其他 session） | 其他 session 401 | 对应 `sid` 撤销 | 对应 `sid` 撤销 | 当前 session 按 B1.2a 语义保留 |
| reset/全部 session 删除 | 全部 401 | 全部撤销 | 全部撤销 | 全部连接关闭/等待重登 |
| 账号 inactive/locked/soft-deleted | Hub 每请求拒绝 | 下一 exchange 401 | 下一 decision 401 | B1.2b 周期复验关闭 |
| 角色/成员变更 | token 仍有效 | handle 仍有效 | P0 无 `authzVersion`，OBO 最多 5m 后过期；decision 每次实时解析 | 读决策最多受 MS 30s 缓存影响；P2 前需补版本失效或缩短缓存 |
| B1.2b session-status 探针 | — | 复用同一 session 事实 | 复用同一 session 事实 | 不新增第二探针 |

**关键点**：OBO 绑定 `sid` 而非 access token hash，避免每次合法 refresh 都使 OBO 失效；session 撤销是唯一硬失效信号。P0 没有 `authzVersion`，因此成员/角色撤销对 OBO 的生效窗口是“下一次 decision（实时 resolver）+ MS 30s 读缓存”，P2 强制前必须评估是否收紧到 5s 或补版本。

### 3.8 TTL、续期、撤销与失败语义

| 项 | P0 规则 |
|---|---|
| TTL | handle 15m；OBO 5m；无 refresh token |
| 续期 | MS 在 OBO 剩余 <2m 时用 handle 重新 exchange；handle 用尽/过期则 shadow 记录 `handle_expired`，不阻塞 legacy |
| 撤销 | logout/改密/reset/停用按 `sid` 撤销 handle/OBO；连接关闭 best-effort 撤销 handle；不依赖长期凭据过期 |
| 存储 | Hub 只存 handle/OBO 的 SHA-256 哈希、claims、状态、`jti`/`sid`/`exp`；不存明文 token |
| 清理 | exchange 时机会式删除同 `sid` 的过期行；周期 reaper 可延后到 P1 |
| 日志 | 只记录 `decisionId`/`jti`/`sid` 哈希/请求 id；不记录 token、Authorization、cookie、SAS |

**失败语义**

| 场景 | HTTP/错误码 | MS shadow 行为 | MS enforce 行为（P1+） |
|---|---|---|---|
| 无/无效用户 token、handle 失效 | 401 `unauthorized` / `invalid_delegation_handle` | 记录 `shadow_unavailable`，继续 legacy | 拒绝连接/操作 |
| handle 过期/次数用尽 | 401 `delegation_handle_expired` | 继续 legacy；记录指标 | fail closed |
| session 撤销/账号停用 | 401 `session_revoked` | 继续 legacy；B1.2b 关闭 | fail closed |
| 服务凭据缺失/错误 | 401 `service_identity_required` | 继续 legacy；告警 | fail closed |
| 服务账号换 OBO | 403 `service_account_obo_denied` | 记录告警；不签发 | fail closed |
| iModel/iTwin 不匹配 | 403 `imodel_mismatch`/`cross_itwin` | 记录 shadow deny；继续 legacy | 403，不泄露资源存在性 |
| 用户无任何请求 scope | 403 `insufficient_permission` | 记录 shadow deny；继续 legacy | 403 |
| 部分 scope 被拒 | 200，`grantedScopes` 子集 + `deniedScopes` | 记录；legacy 继续 | 按入口所需 scope 判断 |
| PDP 不可用/超时 | 503 `authorization_unavailable` | 记录 `pdp_unavailable`；继续 legacy | 写 fail closed；读无缓存则拒绝 |
| OBO 版本未知 | 401 `unsupported_token_version` | 继续 legacy；告警 | fail closed |
| 未知 action | 400 `unknown_action` | 记录；不签发 | fail closed |
| 限流 | 429 | 继续 legacy；计数 | fail closed（或按 B8 策略） |

**任何失败都不得**：降级为服务账号、降级为 API key、静默匿名放行、返回 token/claims 细节。

---

## 4. PEP 矩阵

### 4.1 入口矩阵

> “第一阶段”指本 AIRR 的 P0；“强制阶段”是后续阶段。每个未实现入口必须有明确姿态：`fail-closed`、`registered-exception` 或 `covered-shadow`；不允许“未分类默认 allow”。

| # | 入口 | 必需动作 | P0（本 AIRR） | 强制阶段 | 未覆盖时的姿态 |
|---|---|---|---|---|---|
| 1 | MS `luban-ipc downloadBriefcase`（只读） | `doc.read` | **覆盖（shadow）**：handle→OBO→decision→audit；不拒绝；legacy 下载不变 | P2 读强制 | —（已覆盖） |
| 2 | MS `luban-ipc downloadBriefcase`（可写） | `briefcase.write`（resolver 只能表达 Manage 时记 `manage_compat`） | **覆盖（shadow）** | P3 写强制 | 记 `write_semantics`，不得宣称显式 Write 已生效 |
| 3 | MS `ipc-app openBriefcase/close/save` | owner + `doc.read`/`doc.write` | **覆盖（shadow）**：P0 只对 open 的 `doc.read` 做 decision + ownership registry；close/save 属 P3；不拒绝 | P2/P3 | —（shadow） |
| 4 | FeatureOp 读（tree/sketch/bodies/variables/mass/resolveEdge/Face） | `doc.read` | 未覆盖；发 `pep_uncovered`；登记 X-19 | P2 读强制 | 登记例外；enforce 禁止启动 |
| 5 | `applyFeatureOp` / `previewFeatureOp` | `doc.write` + owner session | 未覆盖；登记 X-19 | P3 写强制 | 同上 |
| 6 | PartStudio create/rename/delete、renameFeature/Body | `doc.write` + owner session | 未覆盖；登记 X-19 | P3 | 同上 |
| 7 | direct edit（`EditCommandAdmin.runCommand`，`solidModelingIpc`） | `doc.write` | `DirectEditWriteGate` 钩子未接；未覆盖；登记 X-19 | P3（先接 gate） | 同上；P3 前不得宣称直改受 ACL |
| 8 | push/pull/saveChanges | `changeset.push`/`doc.write` | 未覆盖；legacy service push；登记 X-19/X-22 | P1 归因 + P3 强制 | 同上；P0 不改归因 |
| 9 | Hub changeset create/list/download | `changeset.push`/`doc.read` | 未覆盖（Hub 数据面仍 legacy）；登记 X-20 | P1/P2 | 登记；P0 不改公共路由 |
| 10 | Hub briefcase create/list | `briefcase.write`/`doc.read` | 未覆盖；服务通道 body `userId` 仍可指定；登记 X-20 | P1/P3 | 同上 |
| 11 | Named Version create/update/delete | `version.create`/`doc.read` | 未覆盖；登记 X-19/X-20 | P2/P3 | 同上 |
| 12 | checkpoint GET/PUT/下载 SAS | `doc.read`/`doc.manage`/service `checkpoint.maintain` | 未覆盖；checkpoint flag OFF（X-17）；登记 X-19 | P4 | 同上 |
| 13 | MS `exportIModel` | `export.read` + 导出审计 | **fail-closed**：用户路径默认 403 `pep_not_implemented`（审计结论：无生产调用方） | P2/P4 | 默认拒绝；恢复 legacy 需 owner 例外 |
| 14 | tile / `requestElementGraphics` / tile URL | `doc.read` | 未覆盖；签名 URL 姿态不变；登记 X-19 | P4 | 登记；匿名 tile 仍是已知旁路 |
| 15 | `GET /api/imodels/:id/progress` | `doc.read` | **fail-closed** 用户路径；服务路径不变 | P2 | 默认拒绝 |
| 16 | `POST /api/imodels/:id/retry` | `doc.manage` | **fail-closed** 用户路径；服务 recovery 路径不变 | P3/P4 + B6 | 默认拒绝 |
| 17 | saved views/camera paths、open 任意本地路径 | owner + 路径白名单 | 未覆盖；ownership registry 只记录不拒绝；登记 X-19 | P3 | 登记 |
| 18 | WA `/baseline/process`、debug GET | service token/job 绑定 | 未覆盖/不变；B6 | P4 | 登记（service-only） |
| 19 | storage `/azurite/`、SAS、tile 直通 | 签名/代理 | 未覆盖/不变；登记 X-19 | P4 | 登记 |
| 20 | BFF `/api/*` | 用户 token/session | B1.2a Hub 生效；BFF 60s 正缓存残余；登记（B5/B8，见 §9.2） | P2 | 登记 |

补充：

- P0 的 **download/open shadow** 只覆盖“用户请求读/写打开”的决策，不覆盖 Hub 数据面的实际执行；Hub 仍用 legacy 服务账号。两者之间的差异正是 P0 要量化的证据。
- P0 对 export/progress/retry 的 fail-closed 是**安全默认**，不是用户可见 ACL 强制；这三个入口按审计/设计结论当前无生产调用方。若实现时发现调用方，必须同一 PR 接入 PEP 或按 owner 例外恢复，不能静默 `allow`。
- `checkpoint/NV` 的 Hub 路由、`imodel_users`/permissions、itwin exports 等仍走现有 guard；P0 不改，登记为后续。
- `direct edit` 的 `DirectEditWriteGate` 钩子未设；P0 不设置，避免在无 OBO 数据面时引入半强制。P3 在同一 seam 注入 `doc.write` 决策。

### 4.2 覆盖清单与“无静默放行”

实现必须提交一份 **PEP coverage manifest**（MS 与 Hub 各一份，或有明确分区的单一清单），每条入口标记：

| 状态 | 含义 | 允许的 flag |
|---|---|---|
| `covered-shadow` | 已接 decision，但只记录不拒绝 | `shadow` |
| `covered-enforce` | 已接 decision 并拒绝 | `read`/`full`（按动作） |
| `fail-closed` | 入口默认拒绝，不进入 legacy | 任意 |
| `registered-exception:<id>` | 明确登记到 `EXCEPTIONS.md`，有 owner/失效日/退出计划 | **仅 shadow** |

启动断言：

- `IDENTITY_MODE=service` 且 `ACL_MODE=off`：legacy 模式，不要求覆盖（但仍输出 manifest 版本）。
- `IDENTITY_MODE=obo-shadow` 或 `ACL_MODE=shadow`：允许 `covered-shadow`/`fail-closed`/`registered-exception`；对每个未覆盖但被调用的入口输出 `pep_uncovered{entry}` 与启动告警。
- `IDENTITY_MODE=obo` 或 `ACL_MODE=read|full` 或 Hub `AUTHZ_ENFORCE!=off`：**只允许 `covered-enforce`/`fail-closed`**；存在 `covered-shadow`/`registered-exception`/未知入口时进程退出 1，点名入口与例外 ID。
- CI 测试：清单必须覆盖实现枚举出的 IPC/RPC/route 入口；新增入口未分类即失败。对无法运行时枚举的路径（如 itwinjs 内部 IPC），采用静态清单 + PR 评审 + 启动断言三重约束。

**测试专用的逐入口强制**：为避免 P0 尚未覆盖 FeatureOp/direct edit 时无法预演“download/open 被拒绝”的行为，MS 可提供 `PEP_ENFORCE_ENTRIES`（默认空，仅 staging/test；生产构建必须为空或不允许启用）。它只对 allowlist 中的入口强制，coverage 断言只要求这些入口为 `covered-enforce`；allowlist 之外的入口必须保持 `covered-shadow`/登记例外，且不得因此被强制。生产 `ACL_MODE=read|full` 不读该变量，仍要求该动作类的完整覆盖。该变量是测试工具，不是生产灰度开关。

这样，“未实现”只有两种合法结局：**fail closed** 或 **登记例外且只能 shadow**；enforce 不会带着已知空洞启动。

### 4.3 P0 的 download/open 具体行为

**downloadBriefcase**：

1. 解析 `(iTwinId, iModelId, readonly)`；校验 iModel 属于 iTwin（格式/归属）。
2. 需要 scope：只读 `["doc.read"]`；可写 `["doc.read","briefcase.write"]`。
3. 用连接 handle 换 OBO；若部分 scope 被拒，记录 `deniedScopes`。
4. 调 decision（actions=`["doc.read","briefcase.write"]` 或只读子集），拿到 `decisionId`。
5. shadow：记录 `shadow_decision`（actual legacy 结果稍后回填），继续 legacy 下载；不改变 cache key/全局 briefcase 行为（P0 不修会话隔离）。
6. 若 handle/OBO/decision 不可用：记录 `shadow_unavailable`/`pdp_unavailable`，继续 legacy。
7. 可写下载但 `briefcase.write` 被 deny：shadow 记录 `would_downgrade_or_deny`；legacy 仍按原参数下载。P3 的强制策略需 owner 决定“拒绝 vs 降级只读”，见 §10。

**openBriefcase**：

1. 现有 `ipc-app` 打开流程不变；P0 增加 `BriefcaseOwnershipRegistry` 记录 `(iModelId,fileName) → {userId,connectionId,writable}`（进程内存）。
2. 打开前解析连接 principal；若文件未登记/属于他人，P0 **只告警不拒绝**（登记 X-19），P3 起拒绝。
3. 已登记文件调 decision（`doc.read`；可写打开的 save/close 另计）；shadow 记录，不拒绝。
4. 路径规范化/白名单的强制属于 C6/P3，P0 不改变行为。

---

## 5. 归因与审计

### 5.1 changeset creatorId

- 目标：OBO 路径下 `req.user.id = sub`，现有 `changesets.controller.create` 的 `creatorId=req.user?.id` 自动变成真实用户，**不改 controller 签名**。
- P0：不切换 push；changeset 仍由 legacy 服务账号创建，`creatorId` 仍是服务账号。P0 只新增 nullable `actor_type`/`actor_service`/`auth_session_id` 列，**不写入、不回填**。
- P1：MS push 改用 OBO（`SessionAwareAuthorizationClient`/连接上下文），Hub 接受 OBO 数据面；新 changeset 写入真实 `creatorId`，`actor_service=service:modeling-server`、`auth_session_id=<sid>`；历史行不动。
- 禁止：用 body `userId` 或客户端 `sessionId` 作为 `creatorId`。

### 5.2 briefcase owner

- 目标：OBO 路径 `resolveOwnerUserId` 返回 `req.user.id`；普通用户 body `userId` 被忽略/403；只有显式 service 迁移 scope 可以指定他人。
- P0：不切换；legacy 服务通道仍可 body `userId`（登记 X-20）。
- P1：新 briefcase 写真实 owner；旧行不改；服务通道的 body `userId` 仅在 `actor_type=service` 且显式 scope 下允许，并写审计。

### 5.3 OpLog 与审计 onBehalfOf

- 审计结论：OpLog 作者在 session 路径已是真实用户；P0 不得回退。P0 不改 OpLog 写入点；后续 P1 补 `actor`/`clientSessionId` 可选键。
- P0 新增 `audit_events` 最小字段：

| 字段 | 说明 |
|---|---|
| `id`/`decisionId`/`requestId` | 关联决策与请求 |
| `eventType` | `authz.decision`、`obo.issue`、`handle.issue`、`obo.revoke`（P0 至少 decision） |
| `userId` | 真实用户；service 路径为空 |
| `actorService`/`onBehalfOf` | `service:modeling-server`；后台任务 `onBehalfOf` 为空、`requestedBy` 后续 |
| `hubSessionId`/`clientInstanceId` | 用户会话；不写 token |
| `iTwinId`/`iModelId`/`action` | 资源与动作 |
| `decision`/`reason` | allow/deny + 稳定原因码 |
| `jti`/`authzVersion` | token 标识；P0 `authzVersion=null` |
| `mode` | `shadow`/`enforce` |
| `ip`/`userAgent` | 入口审计；不写 token |
| `createdAt` | 时间 |

- allow 与 deny 都必须写；拒绝路径不得只写日志不写审计。
- P0 的 `audit_events` 是 **append-only 应用契约**（无 update/delete API）；WORM/hash chain/DB 触发器归 B7，不得宣称审计 v1 已完成。

### 5.4 迁移（全部 additive）

| 变更 | P0 内容 | 回填 |
|---|---|---|
| `auth_delegation_handles` | `id`、`tokenHash`、`typ=delegation`、`ver`、`userId`、`sid`、`clientInstanceId`、`service`、`maxUses`、`useCount`、`status`、`jti`、`issuedAt`、`expiresAt`、`revokedAt`、`tenantId`(null) | 否 |
| `auth_obo_tokens` | `id`、`tokenHash`、`typ=obo`、`ver`、`userId`、`sid`、`actService`、`scope`、`iTwinId`、`iModelId`、`clientInstanceId`、`authzVersion`(null)、`tenantId`(null)、`jti`、`status`、`issuedAt`、`expiresAt`、`revokedAt` | 否 |
| `audit_events` | 见 §5.3；P0 只写 authz 事件 | 否 |
| `changesets`/`briefcases`/`named_versions` | nullable `actor_type`、`actor_service`、`auth_session_id`；无默认值 | **不回填历史行** |
| 索引 | `(sid,status)`、`(jti)`、`(expiresAt)`、`(iModelId,userId)`（审计查询） | — |

- 不新增 `authz_versions`、`access_control_denies`、group roles、`share_links`；这些属于 B4/P2+。
- 不修改 `isSecured`、不改现有 ACL 行、不迁移旧 `creatorId`/`userId`。
- down：代码先回滚，再删除新表/新列；审计数据先导出（可选）；不得在旧代码仍运行时 down。
- 旧库 fixture：迁移后旧 changeset/briefcase 行可正常读写，`creatorId`/owner 保持原值。

### 5.5 归因阶段门禁（P1，非本 AIRR 授权）

P1 必须满足：OBO 数据面 push 可用；changeset/briefcase 新行写真实用户；`actor_service`/`auth_session_id` 写入；旧行标记 `legacy_service` 但不改写；审计 `onBehalfOf` 可查；回滚开关切回 legacy 后新写入不再带用户归因。P0 只提供列与证据基础，不提前宣称 P1 完成。

---

## 6. 接口冻结与版本

### 6.1 新增 Hub 内部端点（P0）

| 端点 | 鉴权 | 契约 | 冻结级别 | 变更/回滚 |
|---|---|---|---|---|
| `POST /internal/v1/auth/delegation-handles` | 用户 access token + `AgentApiKeyGuard` + `X-Service-Name` | 请求 `{clientInstanceId, connectionId}`；响应 `{handle, expiresAt, maxUses, handleId}` | P1 内部 | 版本随路径；回滚停发/删端点；无公共契约 |
| `POST /internal/v1/auth/on-behalf-of` | `Authorization: Delegation <handle>` + service guard | 请求 `{iTwinId,iModelId,scopes,clientInstanceId}`；响应 `{token, tokenType:"OBO", expiresAt, grantedScopes, deniedScopes, claimsVersion:1}` | P1 内部 | 同上；OBO 5m 自然过期 |
| `POST /internal/v1/authz/decisions` | OBO (`typ=obo`) + service guard | 请求 `{iModelId,actions}`；响应 `{decisionId, allow, actions, reason, authzVersion:null, decidedAt, cacheTtlMs, mode}` | P1 内部 | 同上；响应只增不改 |
| `POST /internal/v1/auth/delegation-handles/:id/revoke`（可选） | service guard | best-effort 撤销 | P1 内部 | 可省略；P0 可不实现 |
| `GET /internal/auth/sessions/:sessionId/status`（已有 B1.2b） | `AgentApiKeyGuard` | 只返回 `active` | P1 内部 | **不改**；OBO/handle 复用同一 session 事实 |

- 新增端点挂在 `/internal/v1/**`；已存在的 B1.2b `/internal/auth/sessions/:sessionId/status` 保持原路径不变。内部端点不经 nginx/公共入口暴露；`/rpc/metadata`、health 等公开面不变。
- 端点错误码稳定（§3.8）；不得返回 token、claims 细节、内部 deny 来源。
- Hub 内部 authz 端点不得被浏览器直接调用；CORS/网关必须拒绝外部来源。

### 6.2 shared IPC 与公共契约

- **P0 无 shared 变更**：`LubanFeatureRpcInterface` 1.85.0、`LubanRpcInterface` 1.1.0、`LubanIpcInterface.downloadBriefcase` 签名与导出 hash 不变；`docs/architecture/contract-freeze.json` 不变；`check-contract-freeze.mjs` 应保持通过。
- 后续若需要 `LubanAuthIpcInterface`（`beginSession`/`refreshSession`/`endSession`）：
  - 新接口独立 `interfaceVersion` **1.0.0**，不改旧接口版本；
  - `@luban-cad/shared` bump 并同 PR 更新 `contract-freeze.json`；
  - 按 shared → editor → viewer → web 顺序重建；
  - 旧 web/旧 MS 不匹配返回 `client_update_required` 或运行时版本拒绝，**不得静默降级为服务账号**。
- WS ticket 若引入新的 subprotocol/header，名称必须登记为 web/MS 契约（shared 常量或 `INTERFACE-FREEZE-MATRIX.md`），P0 不引入。

### 6.3 Hub REST 官方契约优先

- P0 不改变任何公共 `/imodels`/`/itwins` 路由语义、DTO、状态码；OBO 只用于内部 decision。
- 后续 OBO 数据面 guard 必须复用现有 controller 与官方 DTO，把 `req.user` 绑定到 `sub`；不得新增平行 REST DTO。
- 任何公共语义变化（例如 deny 的 403/404 选择、body `userId` 行为）需对齐 `docs/api-specs/*.json` 与官方 clients，并另立 ADR/AIRR；不得由本地实现私改。

### 6.4 冻结矩阵与版本动作

实现 PR 必须新增/更新以下条目（本 AIRR 不修改矩阵文件）：

| 条目 | 版本/形态 | 冻结级别 | 变更流程 |
|---|---|---|---|
| Hub internal authz/OBO API | `/internal/v1` | P1 内部 | 更新本 AIRR + hub unit/contract；不得复用为公共 API |
| OBO token format | `ver=1` | P1 内部跨服务 | Hub/MS 同批；ADR 附录签字；未知版本拒绝 |
| Delegation handle format | `ver=1` | P1 内部跨服务 | 同上 |
| Authz decision response | `v1` | P1 内部 | 只增字段；破坏性变更 `/internal/v2` |
| MS PEP coverage manifest | `v1` | P1 内部测试契约 | 新增入口必须分类；CI 失败 |
| Shared auth IPC（后续） | `1.0.0` | P0（若进 shared） | 新接口独立版本 + contract-freeze + 双端同发布 |

**回滚**：P0 无 shared/公共版本需要回滚；停用 `/internal/v1` 或关 flags 即回 legacy。后续 shared 变更回滚需回退 shared 版本并重建 viewer/web，旧 MS/web 组合由 interfaceVersion 校验拒绝，不静默运行。

---

## 7. 测试与证据

> 本节是 P0 的验收计划，**不是已执行结果**。实现后必须记录真实命令、通过/失败数量与环境；不得伪造绿，不得把未跑的真栈写成已通过。

### 7.1 测试层

| 层 | 范围 | 证据 |
|---|---|---|
| Hub unit | handle/OBO 签发与校验、session/撤销、scope 子集、服务账号 deny、decision 映射、audit、迁移 | Jest 单测；fake clock；失败路径 |
| Hub contract | 每个内部端点的请求/响应/错误码；不泄露 token/内部原因 | Supertest/Nest 契约测试 |
| Hub relational e2e | 真实 Postgres + 真实 TypeORM 仓储/迁移；用户/iTwin/iModel/ACL 组合；audit 行 | 专用测试库；固定 fixture；清理 |
| MS unit | handle/OBO/decision client、连接绑定、缓存、shadow 记录、coverage 启动断言、无 token 日志 | Vitest；fake Hub |
| MS real-stack two-user | Hub+MS+web 真栈；A/B 两用户、同 iModel、非成员、撤销、refresh | Playwright/脚本 + 服务日志（无 token）+ audit 行 |
| Fault injection | Hub/decision 超时/5xx/429、handle 过期、session 撤销、审计写失败 | shadow 继续 legacy；enforce fail closed |
| Perf | exchange/decision p95、缓存命中、连接建立增量 | 见 §9.4 预算 |

### 7.2 Hub 单测/契约用例（计划）

1. handle：合法用户 token → 200；无 `sessionId`/`sessionHash` → 401；session 不存在/他人/停用 → 401；服务账号 `sub` → 403；缺 service 凭据 → 401；`maxUses`/过期/撤销 → 401；不返回 token 明文到日志。
2. OBO：合法 handle → 200；scope 子集/全拒/部分拒；iModel 不属于 iTwin → 403；跨 iTwin → 403；handle 过期/次数用尽 → 401；用户 session 撤销 → 401；`tenantId`/`authzVersion` 为 null 且不被用于授权。
3. decision：OBO+service → 200；仅 OBO/仅 service/仅 API key → 401/403；action 不在 scope → deny `insufficient_scope`；resolver 非成员/只读/跨 iTwin → deny；allow/deny 都写 audit；`mode=shadow`；未知 action → 400。
4. 撤销：logout/refresh 轮换/改密/reset/停用各场景；refresh 后 handle/OBO 不误杀；logout 后下一 exchange/decision 401。
5. audit：append-only 应用契约；无 update/delete；token 不入库明文；字段完整；deny 也记录。
6. 迁移：up/down SQL；旧 changeset/briefcase 行可读；无历史行被改写；新列 nullable。

### 7.3 Hub relational e2e（计划）

- 夹具：两个 iTwin；用户 `owner`/`editor`/`viewer`/`outsider`；一个 `isSecured=false` iModel 与一个 `isSecured=true` iModel；一个 changeset/briefcase/Named Version；专用测试库/前缀。
- 用例：
  1. owner/editor/viewer 分别 exchange + decision `doc.read`/`briefcase.write`；断言结果与设计 §7 矩阵一致（首期 write 可能 `manage_compat`）。
  2. outsider/跨 iTwin → 403，不泄露 iModel 存在性。
  3. secured iModel 无显式 grant → deny；显式 Read/Manage → 对应 allow；不依赖 groups/shares（B4 未做）。
  4. logout/停用/改密后 handle/OBO 401；refresh 后 OBO 仍可用；audit 行可查。
  5. 同一用户两个连接：各自的 handle/OBO 不串用；decision 的 `clientInstanceId`/`sid` 正确。
  6. 审计 allow/deny 行与 decisionId 对应；无 token 列。
- 明确跳过：group/share/deny/link 场景（B4）；跨租户（B10）；这两类在报告中写 **blocked**，不得写成 passed。

### 7.4 MS 单测用例（计划）

1. `wsAuth` 升级成功后换取 handle：仅保存 handle；用户 token 不进入 `ConnectionContext`；日志无 token/cookie。
2. OBO client：校验 `typ/ver/aud/exp/iModel/scope`；未知版本/错 aud/跨 iModel → 拒绝；不落盘。
3. decision client：读 30s 缓存；连接关闭/撤销清空；Hub 5xx/超时 → shadow 继续/Enforce 拒绝；`decisionId` 关联。
4. download/open shadow：只读/可写、allow/deny、部分 scope、handle 过期、Hub 不可用；legacy 调用次数与结果不变；`pep_uncovered` 计数。
5. coverage：manifest 覆盖枚举入口；未知入口测试失败；`ACL_MODE=read/full` 且存在 `covered-shadow`/例外时启动失败；`shadow` 只告警。
6. export/progress/retry：用户路径 403 `pep_not_implemented`；服务路径不变；若发现调用方，测试必须明确登记。
7. 日志扫描：401/403/429/RPC 错误/安全日志无 token、Authorization、cookie、SAS、handle 明文。

### 7.5 MS 真栈两用户负例（计划）

环境：真实 Hub/MS/web 栈 + 专用测试 iTwin/iModel + A/B 两用户；flags 按场景设置。

1. **shadow 无行为变化**：A 合法打开/下载；B 非成员打开/下载；两者实际 legacy 结果与 flags off 一致；A allow/B deny 的 shadow 决策与 audit 行分开；B 无用户可见错误（因为 P0 不强制）。
2. **不串线**：A/B 同时下载同一文档；各自 handle/OBO/decisionId 不同；A 的 token 不出现在 B 的请求/审计；日志无 token。
3. **撤销**：A logout → A 的 handle/OBO 下一 exchange/decision 401；B 不受影响；B1.2b 关闭 A 的 socket；A 重新登录后可重新建立。
4. **refresh**：A 在连接期间 refresh → 旧 access token 失效但 OBO 仍有效；新的 exchange 成功；不误断 WS。
5. **只读**：viewer 可写下载请求得到 `briefcase.write` shadow deny；legacy 仍按原参数成功；P3 强制时按 owner 决定拒绝或降级。
6. **enforce 预演（staging，逐入口）**：同一夹具用 `PEP_ENFORCE_ENTRIES=downloadBriefcase,openBriefcase` 只强制这两个入口；非成员/只读写的 download/open 403；合法用户 200；任何不在 allowlist 的入口保持 shadow；生产 `ACL_MODE=read|full` 在 P0 仍应因覆盖不全而启动失败（该失败本身是验收项）。
7. **fail-closed**：export/progress/retry 用户路径 403；无文件产生/无副作用。

### 7.6 shadow-vs-enforce 对照（计划）

- 同一夹具、同一脚本，分别在 `shadow` 与 `enforce` profile 执行 20 条固定用例（owner/editor/viewer/outsider/跨 iTwin/已撤销/refresh/只读写/可写写/无 scope/错 aud 等）。
- 对照项：
  - shadow 决策 vs enforce 决策：covered 入口必须完全一致（allow/deny/reason）。
  - shadow 实际 legacy 结果 vs enforce 结果：预期差异只能出现在被 deny 的负例；正例不得回归。
  - 任何“shadow deny 但 enforce allow”/“shadow allow 但 enforce deny”都阻断晋级。
- 输出：矩阵计数、差异清单、每条差异的原因（例外/未覆盖/缓存/时钟）；不得只写“全绿”。

### 7.7 撤销/租户负例

| 用例 | P0 期望 | 状态 |
|---|---|---|
| logout 后 handle/OBO | 401；MS 清理；B1.2b 关闭 | 可执行 |
| refresh 轮换 | OBO 保持；新 exchange 成功 | 可执行 |
| 改密其他会话 | 其他 handle/OBO 401；当前会话保留 | 可执行 |
| reset 全部 | 全部 401 | 可执行 |
| 停用/锁定/软删 | 下一请求/decision 401 | 可执行 |
| 角色/成员移除 | decision 实时 deny；MS 读缓存 ≤30s | 可执行；P2 前评估收紧 |
| 跨 iTwin iModel | 403 `cross_itwin` | 可执行 |
| 跨租户 | **blocked（B10）**：`tenantId` 为 null；不伪造通过 | 记录 blocked |
| group/share/deny/link | **blocked（B4）**：resolver 未解析；不得用于强制 | 记录 blocked |
| 服务账号换 OBO | 403 `service_account_obo_denied` | 可执行 |
| API key only → exchange/decision | 401/403 | 可执行 |
| 服务账号 legacy 用户数据面 | P0 仍 200；登记 X-20 | 记录为已知缺口 |

### 7.8 夹具与清理

- 夹具版本 `authz-fixture-v1`：确定性用户 id/邮箱、两个 iTwin、两个 iModel、一个 briefcase/changeset、一个 Named Version；不包含真实用户数据/密钥。
- Hub relational e2e 用专用测试库（迁移从零执行）；MS 真栈用专用测试 iTwin/iModel，测试后删除/隔离；不得对共享/生产数据做破坏性测试。
- 记录夹具创建/清理命令与残留检查；测试失败时保留审计行用于诊断，但不含 token。
- 所有负例使用专用账号；禁止用真实管理员账号做越权测试。

### 7.9 证据诚实

- 本 AIRR 是计划；实现后必须附实际命令、环境、通过/失败计数、已知失败。
- 真栈未重建/未运行时，写“未执行”，不得用 unit 代替真栈结论。
- tenant/B4/storage/WA 未覆盖项写 blocked；不得写成“已验证”。
- 任何 token/secret 出现在日志即测试失败，不得以“已脱敏”口头通过。

---

## 8. 发布、开关与回滚

### 8.1 开关

| 服务 | 开关 | P0 默认 | P0 允许值 | 说明 |
|---|---|---|---|---|
| Hub | `AUTH_OBO_ENABLED` | `off` | `off`/`shadow` | `shadow` 只签发/决策；`on` 留给 P1+ |
| Hub | `AUTHZ_ENFORCE` | `off` | `off`（P0 不得设 read/write/full） | 强制总开关；P0 不启用 |
| Hub | `AUTHZ_LEGACY_APIKEY_USER_PLANE` | `true`（现状） | `true`（P0）；P4 前必须 false | 登记 X-20 |
| Hub | `AUTH_OBO_DENY_SERVICE_USER_IDS` | 无默认，启动必填（生产） | 服务账号 user id 列表 | 防 admin OBO 穿透 |
| Hub | `AUTH_OBO_SERVICE_NAME` | `modeling-server` | 固定 allowlist | 只允许 MS |
| MS | `IDENTITY_MODE` | `service` | `service`/`obo-shadow` | `obo` 留给 P1+ |
| MS | `ACL_MODE` | `off` | `off`/`shadow` | `read`/`full` 在 P0 启动即拒绝 |
| MS | `PEP_UNUSED_ROUTE_MODE` | `deny` | `deny`/`legacy` | `legacy` 仅 owner 例外 |
| MS | `PEP_ENFORCE_ENTRIES` | 空 | 空（仅 staging/test 可设） | 逐入口强制预演；生产构建不得启用 |
| MS | `PDP_FAIL_CLOSED` | `true` | `true` | P0 只影响 enforce 语义；shadow 不拒绝 |
| MS | `SESSION_BINDING` | `off` | `off` | C 系列/P3 |
| WA | `SERVICE_AUTH_MODE` | `legacy-admin` | 不变 | P4/B6 |
| Web/Viewer | 无新 flag | — | — | P0 不改 |

- 非法组合（例如 `AUTHZ_ENFORCE=read` 但 coverage 未全绿）启动失败，不允许“先跑起来再说”。
- 所有开关默认关闭/legacy；P0 的生产部署可以只部署代码、不开 shadow；shadow 首先在 staging 开启。

### 8.2 分阶段（P0–P4）

> 本节的 P0–P4 指 `IDENTITY-ACL-DESIGN.md` §6.2 的迁移阶段，不是 `DEVELOPMENT-RULES.md` 的 P0 规则优先级。

| 阶段 | 内容 | 晋级条件 | 回滚 |
|---|---|---|---|
| **P0 Shadow（本 AIRR）** | handle/OBO 签发、download/open shadow decision、audit、coverage | 单测/契约/relational e2e 绿；真栈两用户 shadow 无行为变化；shadow-vs-enforce 对照在 staging 无正例差异；审计可查 | 关 `AUTH_OBO_ENABLED`/`IDENTITY_MODE`/`ACL_MODE`；legacy 不变；token 自然过期 |
| **P1 归因** | push 用 OBO；changeset/briefcase 新行真实 user；audit onBehalfOf | P0 证据 + 归因回滚演练；旧行不改；Hub OBO 数据面 guard | 切回 legacy service；新行保留；旧行不动 |
| **P2 读强制** | download/open/FeatureOp 读/tile/progress/NV 读 403；读缓存 30s | B4 至少覆盖受影响主体，或明确只对 direct grant 主体强制；Hub/MS 真栈负例 | `AUTHZ_ENFORCE=off`/`ACL_MODE=off`；恢复 legacy |
| **P3 写强制** | FeatureOp 写/直改/push/NV 写；DirectEditWriteGate；session owner | P2 + B6 服务身份 + 直改 gate + 5s 写缓存；只读写/跨文档负例 | 退回 P2；保留 service 凭据 |
| **P4 全量** | groups/shares/deny/link、B10 租户、storage/tile/WA、B7 审计 | G1 Gate 对应项；B4/B6/B7/B10 关闭或登记；外部入口最小化 | 按子系统开关退回 |

- P0 只实施第一行；P1–P4 需各自 AIRR/签字，本文只给路线图。
- 不搞 big-bang：每阶段按入口/主体开关，先内部 iTwin/用户，再 allowlist，再扩大。

### 8.3 可观测性

**Hub 指标/日志**

- `auth_handle_issue_total{result,reason}`、`auth_obo_issue_total{result,reason}`、`authz_decision_total{action,decision,reason,mode}`、`authz_decision_latency_ms`、`authz_audit_write_failures_total`。
- 日志字段：`decisionId`、`userId`、`actorService`、`iModelId`、`action`、`decision`、`reason`、`mode`、`jti`（可）、`sid` 哈希；**无 token/Authorization/cookie/SAS**。
- 告警：exchange/decision 5xx >0；audit 写失败 >0；401/403 比例异常；`service_account_obo_denied` 非零（配置错误/攻击）。
- 外部日志扫描：CI/发布门扫描 token-like 串；命中即阻断。

**MS 指标/日志**

- `ms_handle_issue_total`、`ms_obo_exchange_total{result}`、`ms_shadow_decision_total{action,decision}`、`ms_pep_uncovered_total{entry}`、`ms_decision_latency_ms`、`ms_obo_refresh_total`。
- shadow 对照：`legacy_actual_result` vs `shadow_decision`；记录 `would_deny_but_legacy_allowed` 计数（这是 P0 的核心证据）。
- 启动日志：flags、coverage manifest 版本、未覆盖项告警（不打印 token/端点敏感值）。

### 8.4 金丝雀

1. 本地/dev：flags off；单测/契约。
2. Staging：`shadow`；固定夹具 + 两用户并发 24h；检查无行为变化、无 token 日志、decision 延迟。
3. 生产内部 iTwin：2 个内部用户、一个专用文档；`shadow` ≥5 个工作日；只观察，不改变用户行为。
4. 生产 allowlist iTwin：扩大 shadow 主体；对照矩阵；仍不强制。
5. 强制阶段（P2+）：先在内部 iTwin 开 read，再 allowlist；每个入口独立开关；每次晋级前复核 §8.2 条件。
6. 任一阶段出现正例回归、5xx、审计失败、token 泄露，立即回滚并停止晋级。

### 8.5 回滚

| 场景 | 动作 |
|---|---|
| P0 shadow 异常 | Hub `AUTH_OBO_ENABLED=off`；MS `IDENTITY_MODE=service`/`ACL_MODE=off`；`PEP_UNUSED_ROUTE_MODE=legacy` 仅按例外；无需代码回滚 |
| token 泄露/异常签发 | 停发；按 `sid` 撤销 handle/OBO；轮换服务 key（B6 前共享 key 轮换窗口）；审计排查 |
| 性能超预算 | 关闭 shadow decision；保留 legacy；缩小主体 |
| 迁移问题 | 代码回滚 → down 删除新表/列；审计数据先导出；旧行不受影响 |
| 后续 shared IPC 问题 | 回退 shared 版本 + 重建 viewer/web；旧 MS/web 由 interfaceVersion 拒绝，不静默降级 |
| 强制阶段问题 | 逐级退回 P2/P1/P0；保留 service 账号凭据到 P4 |

- P0 无历史数据改写，回滚不需要数据修复；handle/OBO 最长 15m/5m 自然过期，回滚时主动按 sid 撤销。
- 回滚不删除已写 audit；审计保留供复盘。
- 回滚后不得自动恢复已撤销 session/token。

### 8.6 不勾选 G1 Gate

本 AIRR 的完成不等于 G1 Gate 任何一项满足。P0 交付后仍需：B4/B6/B7/B10、C 系列会话隔离、D 系列账本、E 系列灾备、J 系列 CI/发布。不得在发布说明/能力账本中写成“身份/ACL 已完成”。

---

## 9. 依赖、风险与阻塞

### 9.1 依赖

| 依赖 | 现状 | 对 P0 的影响 | 对强制的影响 | 处理 |
|---|---|---|---|---|
| **D0-16/ADR-G0-16** | Proposed；未 ARB 签字 | P0 可按 owner directive 做 shadow；不得宣称接受 | 强制前需签字 | 本文状态行；ADR 契约附录 |
| **B1.2a/b** | unit 绿；真栈待重建 | handle/OBO 的撤销依赖 session 事实；真栈未跑前证据有限 | 强制前需真栈撤销证据 | staging 重建后补 |
| **B6 服务身份** | 未做；共享 `AGENT_API_KEY` + 人类 admin 登录 | P0 用 API key 做服务鉴权；不是用户身份 | **强制阻塞**：用户数据面仍可被服务账号/API key 旁路 | X-20；P4 前 service client |
| **B10 tenantId** | 缺失 | `tenantId=null`；只做 iTwin 边界 | **跨租户强制阻塞** | X-21；P4 |
| **B7 审计 v1** | 缺失（仅 P0 最小审计） | P0 只有 append-only 应用层决策审计 | 强制/合规审计需 WORM/hash chain | P1+；不得宣称 B7 完成 |
| **B4 groups/shares/deny/link** | resolver 未解析 | P0 只对直接 iTwin 角色/显式 iModel grant 有效 | **依赖组/分享的主体强制阻塞** | 夹具限定 direct grant；P2 前补 B4 |
| **B3.2 Write 惰性** | mutation 需要 `imodels_manage` | P0 `briefcase.write` 可能只能 `manage_compat` | 显式 Write 强制需 B3.2/B4 | decision 记 `write_semantics` |
| **DirectEditWriteGate** | 钩子未设 | P0 直改未覆盖；登记 X-19 | P3 前必须接 | P3 |
| **Hub 公共数据面 OBO guard** | 未做 | P0 OBO 只走内部 decision | P1/P2 必须 | P1 |
| **Storage/tile/WA** | 未做 | P0 不覆盖 | P4 | 登记 |
| **Interface freeze** | 内部端点未登记 | P0 实现 PR 必须补矩阵 | 强制前 | 见 §6.4 |

### 9.2 风险

| 风险 | 影响 | 缓解 | 状态 |
|---|---|---|---|
| shadow 与 enforce 决策不一致 | 晋级后误拒/误放 | 同 resolver、实时 decision、对照矩阵、每入口独立门 | 必须验证 |
| OBO 5m 内被窃取/重放 | 单用户单 iModel 短时权限 | 不落盘/不日志、单 iModel、scope、jti、OBO+service 双凭据、TLS | 接受并登记 |
| handle 是 15m bearer | MS 内存泄露可换 OBO | 只换 OBO、绑定 sid/connection、16 次上限、revoke、不落盘 | 接受；WS ticket 前登记 |
| 共享 API key 泄露 | 可调用 exchange/decision；但不能单独换 OBO | 仍需用户 token；服务账号 denylist；B6 替换 | 接受；X-20 |
| 人类 admin 服务账号 | 仍可直通数据面 | P0 不用于 OBO；X-20；B6 | 阻塞强制 |
| resolver 不完整（groups/shares） | shadow 证据偏差；强制误拒 | 夹具限定 direct grant；B4 前不强制受影响主体 | 阻塞部分强制 |
| 无 tenantId | 跨租户无法强制 | 只做 iTwin 边界；X-21 | 阻塞多租户 |
| 无 authzVersion | 角色撤销最多 5m/30s 窗口 | decision 实时；读缓存 30s；P2 前评估收紧 | 接受；P2 门禁 |
| 审计仅应用层 append-only | 可被有 DB 权限者改写 | B7 前不宣称合规；最小字段 | 接受；B7 |
| 迁移 additive 但新表增长 | 存储/清理 | 5m/15m TTL；机会式清理；P1 reaper | 可接受 |
| 旧客户端/旧 MS | P0 无 shared 变更，无影响 | P1+ 用 interfaceVersion | 受控 |
| 测试数据污染 | 误判/泄漏 | 专用 fixture/测试库；清理；禁止共享数据 | 必须遵守 |

### 9.3 明确阻塞（blocked，不得写成通过）

1. **B6 未完成前**：不得声称“共享 API key 不再绕过数据面”或“服务身份与用户平面分离完成”；P0 的 exchange 仍以共享 key 为传输因子。
2. **B10 未完成前**：不得做/宣称跨租户强制；`tenantId` 只是占位；跨租户负例 blocked。
3. **B4 未完成前**：不得对依赖 group/share/deny/link 的主体做强制；shadow 证据只对 direct grant 主体有效。
4. **B7 未完成前**：不得宣称审计 v1/WORM/合规审计完成；P0 只有最小决策审计。
5. **DirectEditWriteGate 未接前**：不得宣称 direct edit 受 ACL。
6. **storage/tile/WA 未改前**：不得宣称全入口 PEP；匿名 tile/SAS 仍是旁路。
7. **B1.2 真栈未复跑前**：撤销只有 unit 证据；不得宣称真栈撤销绿。
8. **D0-16/ARB 未签字前**：只能按 owner directive 做 shadow；不得把 ADR 当已接受。

### 9.4 性能预算

| 项 | 预算 | 说明 |
|---|---|---|
| handle 签发 p95 | ≤100ms | WS 升级路径；失败不阻塞 shadow |
| OBO exchange p95 | ≤100ms | 仅打开/续期 |
| Hub decision p95 | ≤50ms（回源） | P0 不做 Hub 缓存；MS 读缓存 30s |
| MS decision 缓存命中 | ≤1ms | 连接内缓存；撤销即清 |
| WS 建立增量（handle） | ≤150ms | shadow 失败不阻塞 |
| PDP 超时 | 2s | enforce 下写 fail closed；P0 只记录 |
| 审计写失败 | 0 | 非零告警；P0 shadow 不因审计失败拒绝 legacy，但必须记录 |

- 读路径不得逐 tile/RPC 回源 Hub；P0 只对 download/open 调 decision，tile 不调。
- 上述为预算而非实测；实现后按 §7 记录实际 p50/p95。

---

## 10. 评审结论与需 owner 确认的决策

### 10.1 评审检查

- 复用矩阵完成：是。
- 跨仓影响明确：是（Hub 私有 auth/token/audit/migrations；MS 私有 principal/client/shadow；公共仓仅文档；P0 不改 shared/web/BFF/WA）。
- P0 例外：需在实现 PR 登记（本 docs-only 变更不修改 `EXCEPTIONS.md`）：
  - **X-19（建议）**：MS 本地 PEP/存储/tile 覆盖缺口（FeatureOp 读/写、直改、push/pull、saved views、tile、storage）；owner 平台/安全；失效日不晚于强制阶段或 2027-03-31；退出=入口全部 `covered-enforce` 或 `fail-closed`。
  - **X-20（建议）**：Hub 共享 API key/人类 admin 服务账号用户数据面旁路（B6）；owner 安全；失效日不晚于 P3 或 2027-03-31；退出=service client + API key 不作用户身份 + 用户面拒绝 service。
  - **X-21（建议）**：`tenantId` 缺失/占位（B10）；owner 安全/数据；失效日不晚于多租户或 2027-03-31；退出=tenantId/RLS/跨租户负例。
  - **X-22（建议）**：P0/P1 前 changeset/briefcase 仍归因服务账号（B2.2）；owner 平台/数据；失效日不晚于 P1 或 2027-03-31；退出=OBO push + 真实 creator/owner + 旧行 legacy 标记。
  - 以上为建议 ID，最终以 `EXCEPTIONS.md` 登记为准；**未登记前不得把对应入口用于强制**。
- ADR：需要；ADR-G0-16 及 token/ACL 契约附录均为 Proposed，未 ARB 签字。
- Owner 签字：owner directive 2026-11-23（仅 shadow 实施授权）；ARB 签字未记录。
- 结论：**Proposed under owner directive 2026-11-23; not ARB-signed**。仅按 P0 shadow 实施；P1–P4 另行审批；不勾选 G1 Gate。

### 10.2 需 owner 确认的决策

1. **OBO 格式**：P0 用不透明令牌 + Hub 本地哈希/撤销（建议），还是直接 RS256/JWKS？后者需要密钥/撤销设计，P0 不建议。
2. **WS ticket 等价物**：P0 用 15m delegation handle（建议，不改 viewer），还是在 P0 就实现浏览器 30s WS ticket（改 viewer/握手）？P2 强制前必须完成 ticket 刷新，否则长会话会无 OBO。
3. **P0 PEP 范围**：只 download/open shadow（建议）；export/progress/retry 默认 fail-closed；FeatureOp/直改/push/tile/NV/checkpoint 登记 X-19，enforce 前补齐。是否接受“无生产调用方”的 fail-closed 判断？
4. **可写下载的强制语义**（P3）：只读用户请求可写下载时，拒绝还是降级只读？P0 只记录 `would_downgrade_or_deny`。
5. **归因切换时点**：P1 在 shadow 证据后切 push 到 OBO（建议），还是与 P0 同批？P0 不切，避免无 OBO 数据面时产生半归因。
6. **强制前置依赖**：P2 读强制是否必须等 B4（groups/shares）？还是只对 direct grant 主体/内部 iTwin 先开？B6 是否必须早于 P1 归因？本文建议：P1 可先于 B6（仅归因，不宣称分离），P2/P3 强制必须 B6；B4 影响主体范围。
7. **tenant 占位**：`tenantId=null`、只用 iTwin 边界（建议），还是在 P0 就把 iTwin account 写进 tenant 占位？后者会制造假租户，P0 不建议。
8. **例外登记**：是否接受 X-19/X-20/X-21/X-22 的建议范围/owner/失效日？实现 PR 必须登记后才能使用 shadow/enforce 对应能力。
9. **内部端点命名/冻结**：`/internal/v1/**` + P1 内部冻结（建议）；是否要求 P0 就写入 `INTERFACE-FREEZE-MATRIX.md`（实现 PR）？
10. **服务凭据过渡**：P0 用共享 `AGENT_API_KEY` + `X-Service-Name` 作为 exchange/decision 服务鉴权（建议，B6 替换），还是等 B6 后再开始 P0？前者可先取得 shadow 证据，但不得宣称服务身份分离。

---

## 11. P0 MS 实施状态（2026-11-23，shadow-only）

> 状态：**MS 侧 P0 shadow 已实现（代码 + 单测），默认关闭；未部署、未跑真栈、未启用任何 flag；不勾选任何 G1 Gate 项。** Hub 侧内部端点仍为私有仓未提交代码，本节只记录 MS 侧范围与证据。

### 11.1 已实现范围

- **WS 升级（`/ipc` 与 `/ws`）**：在现有 token 校验/session 检查之后，`AUTH_OBO_MODE=shadow` 时用用户 access token 换取 opaque delegation handle；只在 `SessionRecord.oboShadow` 保存 handle/expiry/handleId/clientInstanceId，**不保存用户 access token**、不落盘、不写日志/URL；签发请求在升级时发起但**不阻塞升级完成**（慢 Hub 不增加 WS 延迟）；签发失败/429/超时不拒绝连接；429/超时/网络/5xx 进入有界冷却（不阻塞后续 legacy）。
- **download/open（仅此二入口）**：
  - `LubanIpcHandler.downloadBriefcase`：只读请求 `doc.read`；可写请求 `doc.read`+`briefcase.write`（Hub 返回 `writeSemantics=manage_compat`）。
  - `AppFunctionIpcHandler.openBriefcase`：`doc.read`（save/close/push 属 P3，未覆盖）。
  - 用 handle 换单 iModel OBO → 调 Hub decision → 在内存有界记录 + 结构化日志中记录 allow/deny；**legacy 下载/打开继续执行，绝不因 deny 或 Hub 错误改变结果/错误码**（观察为 fire-and-forget，不增加 legacy 路径等待）。
  - OBO 按连接+iModel 缓存至过期（剩余 <2m 时重新 exchange）；handle `maxUses`/expiry 用尽后记录 `handle_exhausted`/`handle_expired` 并继续 legacy；P0 不保留用户 token，故**不重新签发 handle**（长会话续期属 P2 WS ticket）。
  - 连接关闭：清空 handle/OBO/decision 内存并 best-effort revoke handle。
- **覆盖清单**：`src/authz/pepCoverage.ts` 将 download/open 标记为 `covered-shadow`，把 FeatureOp 读/写、direct edit、push/pull/saveChanges、export、tile、progress/retry、Named Version/checkpoint、storage/SAS、Hub 数据面、BFF 等显式标记为 `p0-not-covered`；启动日志点名未覆盖项。**`DirectEditWriteGate` ACL 钩子未安装。**
- **未触碰**：Hub/shared IPC/FeatureOp/web/viewer/BFF/checkpoint/ledger；未删除 API key；未启用 enforce；无行为变化。

### 11.2 MS 开关（默认全关）

| 变量 | 默认 | P0 说明 |
|---|---|---|
| `AUTH_OBO_MODE` | `off` | 仅接受 `off`/`shadow`；`off` 时零 Hub authz 调用；`on` 非法 |
| `AUTH_OBO_SERVICE_NAME` | 无（shadow 必填） | 必须与 Hub `AUTH_OBO_SERVICE_NAME` allowlist 精确一致（如 `modeling-server`） |
| `AUTH_OBO_CLIENT_INSTANCE_PREFIX` | `modeling-server` | 逐连接生成 `prefix.<connectionId>` 作为 `clientInstanceId` |
| `AUTH_OBO_HUB_URL` | 空 → `IMODELHUB_URL` | 仅 staging/canary 需要 |
| `AUTH_OBO_HTTP_TIMEOUT_MS` | `2000` | 单次 shadow Hub 调用上限；失败记录后继续 legacy |
| `AUTH_OBO_RATE_LIMIT_COOLDOWN_MS` | `30000` | 429/超时/网络/5xx 后的签发冷却 |

复用既有 `IMODELHUB_API_KEY` 作为 `X-API-Key`（共享服务传输因子，X-21 未关闭）；无新增 secret。

### 11.3 文件

- 新增：`src/authz/oboShadowClient.ts`（内部端点 HTTP 客户端与响应校验/错误脱敏）、`src/authz/oboShadowService.ts`（handle/OBO/decision 编排、缓存、记录、冷却、revoke）、`src/authz/oboShadow.ts`（runtime 单例）、`src/authz/oboShadowTypes.ts`（仅内存类型）、`src/authz/pepCoverage.ts`（覆盖清单）。
- 修改：`src/config.ts`（flags + shadow 必填 service name 校验）、`src/main.ts`（启动告警 + 未覆盖项点名）、`src/session/SessionRegistry.ts`（`SessionRecord.oboShadow` 可选状态）、`src/session/sessionLifecycle.ts`（升级签发 + 关闭清理/revoke）、`src/ipc/LubanIpcHandler.ts`、`src/ipc/AppFunctionIpcHandler.ts`（入口观察）。
- 测试：`src/authz/oboShadowClient.test.ts`、`src/authz/oboShadowService.test.ts`、`src/authz/pepCoverage.test.ts`、`src/ipc/LubanIpcHandler.oboShadow.test.ts`，以及在 `src/config.test.ts` 增加 flags 默认/必填/非法值用例（fake Hub HTTP server）。

### 11.4 已执行证据（2026-11-23，本机；无真栈）

- `npx tsc --noEmit`：通过。
- `npx vitest run src/authz src/ipc/LubanIpcHandler.oboShadow.test.ts`：**4 files / 29 tests passed**（handle 签发成功/失败/429/timeout、exchange、decision allow/deny、flag off 零调用、OBO/handle 过期与 maxUses、缓存、关闭 revoke、日志/记录无 token/handle/API key）。
- `npx vitest run src/config.test.ts`：**1 file / 16 tests passed**（含新增 shadow flags 用例）。
- `npx vitest run src/authz src/session src/middleware src/ipc src/config.test.ts`：**28 files / 268 tests passed**（B1.2/C6 等既有 suite 未回归）。
- ESLint：新增 `src/authz/**`、集成测试、`main.ts`、`SessionRegistry.ts`、`sessionLifecycle.ts`、`config.test.ts` 通过；完整触及文件中仍有 11 个**既有基线**错误（`config.ts` 的 zod `z.string().url()/email()` 弃用与 `load()` console；`AppFunctionIpcHandler.ts`/`LubanIpcHandler.ts` 上游 `saveChanges/abandonChanges/PhysicalModel.insert` 弃用），均不在本次新增行。
- **未执行**：Hub/MS 真栈、真实账号/文档、Postgres 迁移、镜像重建/canary、任何 flag 开启。不得据此宣称 B2/B3 或 G1 Gate 完成。

### 11.5 真栈剩余步骤

1. Hub：应用 additive 迁移并以 `AUTH_OBO_ENABLED=shadow`、`AUTH_OBO_SERVICE_NAME=modeling-server`、`AUTH_OBO_DENY_SERVICE_USER_IDS=<service account user ids>` 部署；确认 `/internal/v1/**` 不经 nginx/公网暴露。
2. MS：以 `AUTH_OBO_MODE=shadow`、匹配的 `AUTH_OBO_SERVICE_NAME`（必要时 `AUTH_OBO_HUB_URL`）部署/重启；保持 `AUTHZ_ENFORCE=off`、B3 未强制。
3. Staging 内部 iTwin + A/B 两用户 canary：对比 flags off/shadow 的下载/打开成功率、错误码、耗时；检查 MS 结构化 `shadow_decision`/`shadow_failure` 与 Hub `audit_events`；扫描日志无 token/handle/API key；验证 logout/refresh/handle 过期与连接关闭 revoke。
4. P2 前置：WS ticket/长会话续期流程（P0 handle 15m 上限），否则 15–20 分钟后无 OBO；tenant/B4/B6/B7 仍按 X-21/X-22 与后续阶段处理。

### 11.6 例外与限制

- **未新增 EXCEPTIONS 行**：X-21 已覆盖共享 API key/人类 admin 用户面旁路，X-22 已覆盖 `tenantId` 占位；P0 的“只覆盖 download/open、其余不强制”是 shadow 范围声明（见覆盖清单），不是对已声称能力的豁免。
- `p0-not-covered` 入口在 enforce 前必须重新分类为 `covered-enforce` 或 `fail-closed`；P0 不提供 enforce，也不得被解读为 ACL 已生效。

**关联**：`G1-EXECUTION-PLAN.md`、`IDENTITY-ACL-DESIGN.md`、`ADR-G0-16-identity-attribution.md`、`EXCEPTIONS.md`、`INTERFACE-FREEZE-MATRIX.md`、`AIRR-2026-11-23-B1.2-SESSION-REVOCATION.md`、`AIRR-2026-11-23-B1.2b-WS-REVALIDATION.md`、`AIRR-2026-11-23-B5-TOKEN-TRANSPORT.md`。
