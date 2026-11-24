# AIRR：G1 B6 服务身份（P0 Hub 签发/校验 → P1 worker → P2 MS 内部调用）

- 标题：G1 B6 P0 — Hub `service_clients`、client-credentials 短时 JWT、内部端点双模服务鉴权；P1 worker 内部控制面；P2 MS session-status/OBO 内部调用
- 日期：2026-11-24
- Owner：平台/安全（owner directive 2026-11-23）
- 关联：`G1-EXECUTION-PLAN.md` B6；`10-ARCHITECTURE-HARDENING-PLAN.md` B6；`IDENTITY-ACL-DESIGN.md` §2/§6；`ADR-G0-16-identity-attribution.md` 附录 A；`EXCEPTIONS.md` X-21/X-26；`INTERFACE-FREEZE-MATRIX.md`
- 影响仓：Hub P0 改私有 `imodelhub-services`（auth/config/service-identity/migrations/tests）；公共仓改本 AIRR、`ADR-G0-16` 附录、`EXCEPTIONS.md`、`INTERFACE-FREEZE-MATRIX.md`、`docs/README.md`。2026-11-24 worker 切片仅改私有 `luban-backend/checkpoint-worker` 与公开文档。2026-11-24 B6 P2 切片改私有 `imodelhub-services/src/session`、`src/service-identity`、新增 scope 迁移，以及私有 `luban-backend/modeling-server`（session/authz/hub/config/tests）与公开文档/`.env.example`；**未改 WA/web/BFF/checkpoint-worker 数据面**。`luban-cad/**`、Part Studio/草图/UI/native 未触碰。
- 是否需要 ADR：**是（Proposed 附录）**。服务身份凭据格式、传输头、作用域与回滚开关属于跨仓安全契约，记录于 `ADR-G0-16` 附录 A；本 AIRR 记录实现切片与证据。

> 状态：**Hub P0 已实现并通过单元 + 隔离 relational e2e；worker 内部控制面与 MS 内部调用（session-status + OBO shadow）已完成代码迁移（fake Hub/单测，未跑真栈 canary）。不是 B6 完成，不勾选任何 G1 Gate 项。**
> 共享 `AGENT_API_KEY`、人类 admin 服务登录、MS/WA **数据面**、worker 数据面与用户数据面强制均**未移除**；legacy 仍按显式条件接受（见 §4、§8）。
> 2026-11-24 后续 P3 切片（Hub 官方数据面选定路由 + closed `data.*` scope 矩阵）另见 [`AIRR-2026-11-23-B6-DATA-PLANE-P3.md`](./AIRR-2026-11-23-B6-DATA-PLANE-P3.md)；本 P0 中“未接触数据面”的描述仅适用于 P0/P1/P2 切片，B6/X-21 仍 open。

---

## 0. 结论摘要

1. 新增 additive `service_clients` 表：服务名唯一、scrypt 加盐哈希（无明文列）、JSON scope allowlist、`enabled`、`secretVersion`、`createdAt/rotatedAt/lastUsedAt`、nullable `tenantId` 占位。迁移不包含任何默认/well-known 密钥。
2. 新增 `POST /auth/token/service`：`serviceName`（或 `clientId`）+ `clientSecret` → 300–900s（默认 600s）Hub 签名 HS256 JWT。Claims：`typ=service`、`ver=1`、`iss`、`aud`、`sub=service:<name>`、`scopes`、`jti`、`secretVersion`、`iat/exp`。**无 session 行、无 refresh token**。
3. 凭据校验：salted scrypt + `timingSafeEqual`；未知客户端也执行一次 dummy scrypt；错误统一为 `Invalid service credentials`；限流；禁用/轮换/未知/错误 scope 全部 fail closed；禁用与轮换在下一请求使既有 token 失效。
4. 新增 `ServiceAuthGuard` 双模守卫：优先校验签名 service token，服务名只取签名 `sub`（不再是 `X-Service-Name`）；`AUTH_SERVICE_CLIENTS_ENABLED=off`（默认）保持 legacy；`shadow` 下 legacy API key 仅当显式 `AUTH_SERVICE_LEGACY_API_KEY=allow` 时接受。出现但无效的 service token **绝不回退**到共享 key。
5. 已接入内部 audit、authz decision、delegation/OBO、checkpoint agent/changeset agent 路由。audit/checkpoint 允许 `Authorization: Bearer`；authz/delegation 因 `Authorization` 已承载 OBO/handle/user token，服务令牌走 `X-Service-Token`。
6. 2026-11-24 worker 切片：checkpoint-worker 的 `claim`/`heartbeat`/`complete`/`failed`/`storage-token`/`chain` 已在显式 `service-token` 模式改用 `X-Service-Token`，带内存缓存、到期前刷新、401/403 清除且不回落 legacy；worker 数据面（官方 IModelsClient/公共 changeset 读取）仍用共享 key + 服务账号 JWT。
7. 2026-11-24 B6 P2 切片（本切片）：Hub `session-status` 接入同一 `ServiceAuthGuard`，新增独立 scope `session.status`（additive 迁移 `20261124000003`）；MS 新增 service-token provider（内存缓存至 `exp-skew`、并发合并、401/403 清除、无 legacy 回落、有界重试），把 `session-status` 探针和 OBO shadow 内部调用（delegation handle/OBO exchange/authz decision/revoke）切到 `X-Service-Token`；Legacy API-key 仅为显式、启动告警的弃用回滚。MS 数据面（官方 IModelsClient + 服务账号 JWT + X-API-Key、baseline requeue、version open）**未改**。未做：MS 真栈 canary、WA 迁移、移除共享 key/人类 admin 服务账号、用户数据面拒绝 service/API-key 主体、baseline 等剩余内部路由、RS256/JWKS、KMS/双密钥签名轮换、审计表接入。**不得宣称 B6 完成或 X-21 关闭。**

---

## 1. 目标、验收与非目标

### 1.1 本切片目标

1. 建立可运维、可轮换、可禁用的服务客户端注册表，密钥只存强哈希。
2. 提供独立的 client-credentials 短时令牌端点，不依赖外部 IdP、不产生 refresh/session。
3. 在**不破坏既有客户端**的前提下，把选定内部端点从“共享 key + 可伪造头部”迁移为“签名服务主体优先、legacy 显式回滚”。
4. 明确 service token 与 user/OBO 凭据互不冒充：service guard 不设置 `request.user`；用户 JWT strategy 显式拒绝 `typ=service`。
5. 用单元 + 隔离 relational e2e 证明签发、校验、负例、回滚与无密钥日志；不触碰用户数据面。

### 1.2 可观察验收

| # | 验收 | 证据 |
|---|---|---|
| A1 | 迁移 additive、无默认密钥、scope allowlist/名称校验在 DB 边界 | `20261124000002-CreateServiceClients.ts`、迁移单测 |
| A2 | 密钥 salted scrypt、常量时间比较、未知客户端 dummy 校验 | `service-secret.spec.ts`、`service-clients.service.spec.ts` |
| A3 | Token claims 固定、TTL 有界、无 refresh/session，错误统一 | `service-token.service.spec.ts`、隔离 e2e |
| A4 | 禁用/轮换/未知/错误 aud/iss/scope/jti/exp 全部拒绝 | 单测 + 隔离 e2e（disable/rotate） |
| A5 | 双模守卫：service token 优先；legacy 仅 off 或显式 allow；坏 token 不降级 | `service-auth.guard.spec.ts`、隔离 e2e |
| A6 | 选定内部路由接入且 signed name 为权威；用户 JWT 不可用 | 路由元数据单测、隔离 e2e |
| A7 | 无 secret/token 进入日志或错误体 | 日志脱敏测试、Logger spy 测试、隔离 e2e 响应断言 |
| A8 | 全量单测/tsc/eslint 绿 | 见 §7（提交前执行结果） |
| A9 | session-status 独立 scope、双模守卫、legacy 仅显式 | Hub route-wiring/route-auth/scope-migration 单测 + e2e 用例（未执行真栈）；§7.7 |
| A10 | MS session-status/OBO 只发 service token、缓存/刷新/401 无回落、数据面无污染 | MS provider/internalAuth/fake-Hub/data-plane 单测；§7.6 |

### 1.3 明确非目标（本 AIRR 不做）

- 不迁移 MS/WA 的**数据面**调用；worker 数据面与共享 key 退役不在本切片。worker 内部控制面已在 2026-11-24 后续切片迁移（§7.5），MS 内部调用已在 B6 P2 切片迁移（§5.2/§7.6）。
- 不删除共享 `AGENT_API_KEY`、`AgentApiKeyGuard`、`SystemAgentOrResourceGuard`、人类 admin 服务登录或任何用户数据面旁路。
- 不允许 service token 访问用户数据 API；不改变公共 changesets/briefcases/versions 等路由语义。
- 不接入 baseline failed/requeue 等剩余内部路由（见 §6）；`session-status` 已在 B6 P2 接入。
- 不做 RS256/JWKS、外部 IdP、KMS、签名密钥双版本轮换、token 撤销列表、审计表写入。
- 不做 B10 租户/RLS；`tenantId` 仍恒为 `NULL`。
- 不勾选 G1 Gate；不宣称 B6/X-21 完成。

---

## 2. 复用矩阵

| 能力 | 现有实现 | 本切片决策 | 理由 |
|---|---|---|---|
| 用户 JWT 签名/校验 | `AuthService` + `JwtStrategy`（HS256, `auth.secret`） | **复用密钥/库，独立 claims/守卫** | 不新增 IdP/JWKS；service token 无 session |
| 服务传输因子 | `AgentApiKeyGuard` + pinned `X-Service-Name` | **保留为显式 legacy 分支** | 不破坏未迁移客户端 |
| 密码哈希 | `bcryptjs` | **不用**；用 Node 内置 `crypto.scrypt` | 需要显式盐+编码+常量时间比较，无新依赖 |
| 常量时间比较 | `safeCompare`（legacy key） | **复用 legacy 路径**；scrypt 用 `timingSafeEqual` | 与仓内既有安全模式一致 |
| TypeORM/迁移 | 手写 migration + 仓储端口 | **复用** | additive，可 revert |
| 限流 | 全局 Throttler + `@Throttle` | **复用并加路由预算** | 端点位于 `/auth*`，auth/strict-auth 桶生效 |
| 结构化日志 | Nest `Logger` / pino + redact | **复用并新增 `x-service-token` 脱敏** | 不新增日志框架 |
| 内部端点开关 | `OboEnabledGuard` 模式 | **新增 `ServiceClientsEnabledGuard`** | off 时端点 404，不查表 |

**无新增 npm 依赖**；无 native/渲染/求解器/公共 REST DTO 变更。

---

## 3. Schema 与密钥

### 3.1 迁移

`src/database/migrations/20261124000002-CreateServiceClients.ts`（additive）：

| 列 | 类型 | 约束/含义 |
|---|---|---|
| `id` | uuid | PK，`uuid_generate_v4()` |
| `serviceName` | varchar(64) | UNIQUE；`^[a-z][a-z0-9-]{1,63}$` |
| `secretHash` | varchar(255) | scrypt 编码；无明文列 |
| `scopes` | jsonb | 非空数组，DB CHECK 限定 P0 allowlist |
| `enabled` | boolean | 默认 true；false 在下一请求 fail closed |
| `secretVersion` | int | 默认 1；轮换 +1，token 携带并复核 |
| `tenantId` | varchar(64) | B10 占位，P0 恒 NULL |
| `createdAt` | timestamptz | 默认 now() |
| `rotatedAt` | timestamptz | 轮换时间 |
| `lastUsedAt` | timestamptz | 使用时间（最多每分钟写一次） |

P0 scope allowlist（同时存在于 `service-scope.ts` 与 DB CHECK；B6 P2 经 additive 迁移 `20261124000003-AddSessionStatusServiceScope.ts` 追加 `session.status`）：

- `authz.decide`
- `auth.delegation`
- `auth.obo`
- `audit.read`
- `checkpoint.agent`
- `session.status`（B6 P2：MS WebSocket 会话复验探针；只返回 `{active:boolean}`）

**没有用户数据 scope**（无 `doc.read`/`doc.write`/`briefcase.write`）。新增 scope 需 additive migration + AIRR/ADR。`session.status` 不是数据面 scope，也不得被用户数据 API 接受。

### 3.2 密钥编码与校验

- 编码：`scrypt$v1$<N>$<r>$<p>$<salt-base64url>$<key-base64url>`；N=16384、r=8、p=1、128-bit salt、512-bit key。
- 校验：解析参数（带上界防篡改 DoS）→ 派生 → `timingSafeEqual`；格式错误/参数越界/长度不符一律 false，不抛异常。
- 未知客户端仍对 dummy hash 执行一次 scrypt；禁用客户端先校验哈希再拒绝，降低枚举时序差异。
- 原始 secret 不写 DB、不写日志、不返回；CLI 只接受 stdin/env，输出非敏感摘要。

### 3.3 运维 provisioning（无 HTTP 创建端点）

```bash
# 创建（secret 从 SERVICE_CLIENT_SECRET 或 stdin 读取）
npm run service-client:provision -- \
  --service-name checkpoint-worker --scopes checkpoint.agent

# 轮换（旧 token 下一请求失效）
npm run service-client:provision -- --rotate --service-name checkpoint-worker

# 禁用/启用
npm run service-client:provision -- --disable --service-name checkpoint-worker
npm run service-client:provision -- --enable  --service-name checkpoint-worker
```

生产镜像不含 `src/`/`ts-node`（P4 瘦身），运维使用编译产物：
`node dist/service-identity/cli/provision-service-client.js --service-name ... --scopes ...`。

理由：P0 不暴露公网客户端注册面； compromised Hub 进程不能自行新增服务身份。轮换/禁用通过同一 CLI，secret 永不回显。

---

## 4. 令牌与双模守卫

### 4.1 Token 契约

`POST /auth/token/service`（默认 404；`AUTH_SERVICE_CLIENTS_ENABLED=shadow` 时挂载）：

请求：`{ "serviceName": "...", "clientSecret": "..." }`；`clientId` 为等价别名（两者同时出现必须一致）。

响应：

```json
{
  "token": "<Hub-signed JWT>",
  "tokenType": "Service",
  "expiresAt": "2026-11-24T...Z",
  "scopes": ["checkpoint.agent"],
  "audience": "luban-hub:internal"
}
```

JWT claims（冻结 P0 v1）：

| Claim | 值/约束 |
|---|---|
| `typ` | `service`（用户 token 无此值；用户 strategy 显式拒绝） |
| `ver` | `1` |
| `iss` | `AUTH_SERVICE_TOKEN_ISSUER`（默认 `luban-hub`） |
| `aud` | `AUTH_SERVICE_TOKEN_AUDIENCE`（默认 `luban-hub:internal`） |
| `sub` | `service:<serviceName>`，服务名权威来源 |
| `scopes` | 客户端注册 scope，非空、allowlist 子集 |
| `jti` | UUID；日志/关联用，P0 不是一次性重放表 |
| `secretVersion` | 必须等于客户端当前代次 |
| `iat`/`exp` | 秒；`exp-iat = AUTH_SERVICE_TOKEN_TTL_SECONDS`（300–900，默认 600） |

签名：Hub `auth.secret`，HS256。**无 refresh、无 session 行、无服务端 token 行。**

失败语义：未知/错 secret/禁用/未知 scope/内部错误统一 `401 Invalid service credentials`；请求体不泄露 secret/hash。

限流：`/auth*` 路由的 auth/strict-auth 桶 + 路由级 short/auth/strict 预算（默认 20/min、60/15min、120/h，可用 `AUTH_SERVICE_TOKEN_*_LIMIT` 覆盖）。

### 4.2 校验与撤销

每次内部请求校验：签名/alg、`exp`（5s clock tolerance）、`aud`、`iss`、`typ`、`ver`、`sub` 格式、`jti` UUID、scope allowlist、客户端存在且 enabled、`secretVersion` 匹配、token scopes 仍是客户端当前 scope 子集。

撤销语义：

| 动作 | 效果 |
|---|---|
| 禁用客户端 | 下一请求 401 |
| 轮换 secret | `secretVersion+1`，所有旧 token 下一请求 401 |
| 删除/未知客户端 | 下一请求 401 |
| scope 收回 | 下一请求 401（scope 不再是子集） |
| 自然过期 | 300–900s 后 401 |

无全局 token 撤销列表是 P0 已知边界；短 TTL + 禁用/轮换是撤销手段。

### 4.3 双模守卫与传输

`ServiceAuthGuard` 读取路由元数据 `{profile, scope, allowBearerServiceToken}`：

- profile `internal-obo` → 期望服务名 `AUTH_OBO_SERVICE_NAME`（默认 `modeling-server`）
- profile `checkpoint-worker` → 期望服务名 `CHECKPOINT_WORKER_SERVICE_NAME`（默认 `checkpoint-worker`）
- 服务 token 存在时：签名服务名必须等于 profile 期望值，scope 必须包含路由要求；**忽略 `X-Service-Name`**；不设置 `request.user`。
- 服务 token 不存在时：
  - `AUTH_SERVICE_CLIENTS_ENABLED=off`（默认）→ 沿用旧 `X-API-Key` + pinned `X-Service-Name`；
  - `shadow` → legacy 仅当 `AUTH_SERVICE_LEGACY_API_KEY=allow`（默认 deny）时接受；
  - 出现但无效的 `X-Service-Token`/Bearer service token → 401，**绝不回退**到 legacy key。

传输：

| 路由族 | 服务凭据 | 原因 |
|---|---|---|
| audit、checkpoint/changeset agent | `Authorization: Bearer` 或 `X-Service-Token` | `Authorization` 未承载其它凭据 |
| authz decision | `X-Service-Token` | `Authorization` 是 OBO token |
| delegation handle / OBO exchange / revoke | `X-Service-Token` | `Authorization` 是 user token / Delegation handle / OBO token |
| session-status（B6 P2） | `X-Service-Token` 或 `Authorization: Bearer` | 路由不使用 `Authorization` 承载其它凭据；scope `session.status` |
| baseline failed/requeue、用户数据面 | **不接入**（legacy 原样） | 本切片不让 service token 进入数据面 |

---

## 5. 端点接入清单

| 端点 | 变化 | Scope/profile |
|---|---|---|
| `POST /auth/token/service` | 新增（flag off 时 404） | client credentials |
| `GET /internal/v1/authz/audit`、`/verify` | `AgentApiKeyGuard`+`OboServiceGuard` → `ServiceAuthGuard` | `audit.read` / internal-obo |
| `POST /internal/v1/authz/decisions` | 同上（`X-Service-Token`） | `authz.decide` / internal-obo |
| `POST /internal/v1/auth/delegation-handles` | 同上 + 保留用户 JWT guard | `auth.delegation` / internal-obo |
| `POST /internal/v1/auth/on-behalf-of` | 同上 | `auth.obo` / internal-obo |
| `POST /internal/v1/auth/delegation-handles/:id/revoke` | 同上 | `auth.delegation` / internal-obo |
| `POST /internal/imodels/:id/checkpoints/*` | `AgentApiKeyGuard`+`CheckpointWorkerServiceGuard` → `ServiceAuthGuard` | `checkpoint.agent` / checkpoint-worker |
| `GET /internal/imodels/:id/changesets/:id/chain` | 同上 | `checkpoint.agent` / checkpoint-worker |
| `GET /internal/auth/sessions/:sessionId/status` | B6 P2：`AgentApiKeyGuard` → `ServiceAuthGuard` | `session.status` / internal-obo（modeling-server） |

原 `OboServiceGuard` / `CheckpointWorkerServiceGuard` 已删除，避免遗留“header 即身份”的第二条路径；其 legacy 行为由 `ServiceAuthGuard` 的显式分支承接。

### 5.1 checkpoint-worker 内部控制面（2026-11-24 后续切片）

- 配置：`CHECKPOINT_WORKER_HUB_AUTH_MODE=service-token|legacy-api-key`（启用时必填，无隐式 legacy）；`CHECKPOINT_WORKER_HUB_SERVICE_CLIENT_ID`/`..._SERVICE_CLIENT_SECRET`；token URL/audience 可选；refresh skew 0–300s（默认 60s），token 请求 timeout/retries 有界。Secret 仅来自环境/密钥库，不落盘、不打印。
- `HubServiceTokenProvider` 在内存缓存 token 至 `exp - skew`，并发请求合并为一次签发；401/403/404 与畸形响应 fail closed 不重试，网络/5xx/429 有界重试；401/403 时清除缓存 token。错误与日志均不含 secret/token。
- worker 的 `claim`/`heartbeat`/`complete`/`failed`/`storage-token`/`chain` 统一发送 `X-Service-Token`（Hub checkpoint/changeset agent 路由均接受），且不发送 `X-API-Key`/`X-Service-Name`；坏 token 不回落共享 key。
- 数据面保持不变：`getChangesetByIndex`（官方 changeset 读取）与 `IModelsClient` 仍用共享 `X-API-Key` + 服务账号 JWT；service token 无用户数据 scope，未被附加到数据面。
- 未跑真栈 canary；MS/WA、worker 数据面与共享 key 退役仍延期。B6/X-21 保持 open。

### 5.2 modeling-server 内部调用（B6 P2，2026-11-24）

- **Hub**：`SessionStatusController` 由 `ServiceAuthGuard` 保护，元数据 `{profile: internal-obo, scope: session.status, allowBearerServiceToken: true}`；服务名仍取 Hub `AUTH_OBO_SERVICE_NAME`（默认 `modeling-server`）。新增 additive 迁移 `20261124000003` 只替换 `CHK_service_clients_scopes`，不改表/行。Legacy 分支保留 pinned `X-Service-Name`；MS 探针由硬编码名改为发送 `AUTH_OBO_SERVICE_NAME`（缺省 `modeling-server`）。
- **MS 配置**（缺省 `AUTH_OBO_MODE=off` 不变）：
  - `IMODELHUB_AUTH_MODE=service-token|legacy-api-key`。未设置=legacy（启动 `WARN` 标注 default/DEPRECATED）；只要出现任一 service-client 配置而未显式选择 service-token，配置导入直接失败（不静默忽略）。
  - `IMODELHUB_SERVICE_CLIENT_ID`（Hub 注册名/签名 `sub`；service-token 下必须匹配 Hub 服务名模式，且与 `AUTH_OBO_SERVICE_NAME` 同时设置时必须相等）；可回退到 `AUTH_OBO_SERVICE_NAME`，再回退 `modeling-server`。
  - `IMODELHUB_SERVICE_CLIENT_SECRET`（16–512 位；仅环境/密钥库；不落盘、不打印）。
  - `IMODELHUB_SERVICE_TOKEN_URL`（缺省 `<IMODELHUB_URL>/auth/token/service`）、`..._AUDIENCE`、`..._REFRESH_SKEW_SECONDS`（0–300，默认 60）、`..._TIMEOUT_MS`（1–120s）、`..._RETRIES`（0–5）。
- **scope 配对**：provider 固定要求 `session.status`；`AUTH_OBO_MODE=shadow` 时追加 `auth.delegation`、`auth.obo`、`authz.decide`。Hub 客户端少任一 scope 时，provider 在首次调用前拒绝 token（fail closed），不会只降级某个路由。
- **传输**：service-token 模式的 session-status 与 OBO shadow 四个内部调用（handle 创建、OBO exchange、authz decision、handle revoke）只发 `X-Service-Token`，不发 `X-API-Key`/`X-Service-Name`；token 获取失败/401/403 时清除缓存并失败，**绝不回落共享 key**。legacy 模式只发 `X-API-Key`+pinned `X-Service-Name`。
- **数据面不变**：官方 `IModelsClient`（服务账号 JWT + `X-API-Key`）、baseline requeue、version open 均未引入 `InternalHubAuth`；数据面请求永不带 service token。
- **provider 行为**：内存缓存至 `exp-skew`；并发请求合并为一次签发；401/403/404 与畸形响应不重试；网络/5xx/429 有界重试；日志/错误只含 service 名、过期时间、稳定 code，不含 secret/token。共享一个进程级实例供 session-status 与 OBO 复用。
- **证据**：Hub 单测新增 route-auth/route-wiring/scope-migration；MS 新增 `serviceToken`/`internalAuth`/data-plane guard tests，并更新 `hubSessionStatus`/`oboShadowClient` fake-Hub 测试。**未跑真栈 canary**（见 §5.3），MS 数据面、WA、共享 key 退役仍未完成。

### 5.3 真栈 canary 步骤（本轮未执行）

1. Hub 应用迁移（含 `20261124000003`）；用 CLI 以 stdin/密钥库 secret 注册 `modeling-server` 客户端，scopes 至少 `session.status`；若 MS `AUTH_OBO_MODE=shadow`，同批加 `auth.delegation,auth.obo,authz.decide`。确认输出无 secret/hash/SQL。
2. Hub 设 `AUTH_SERVICE_CLIENTS_ENABLED=shadow`；canary 期间保留 `AUTH_SERVICE_LEGACY_API_KEY=allow`（便于回滚），MS 切换完成后改 `deny`。
3. MS 设 `IMODELHUB_AUTH_MODE=service-token`、`IMODELHUB_SERVICE_CLIENT_ID=modeling-server`、`IMODELHUB_SERVICE_CLIENT_SECRET=<同 secret>`；如设 `AUTH_OBO_SERVICE_NAME` 必须同为 `modeling-server`；保持 `AUTH_OBO_MODE=off` 先验证探针，再切 `shadow` 验证 OBO。
4. 重启 MS。启动日志必须显示 `Hub internal auth: service-token (service=modeling-server, scopes=...)`；Hub 访问日志对 `/internal/auth/sessions/*/status`（及 shadow 下的 OBO 路由）显示 `transport=token`；抓包/代理确认请求无 `X-API-Key`/`X-Service-Name`。
5. 负例：Hub 禁用/轮换 MS 客户端 → MS 探针返回 `unavailable` 且不断开既有连接；OBO shadow 记录 `service_token_*`/`hub_http_401`，并且**不**改发共享 key；恢复后下一次调用重新签发成功。`AUTH_OBO_MODE=off` 时确认无 OBO 请求。
6. 回滚：MS 显式设 `IMODELHUB_AUTH_MODE=legacy-api-key`（启动告警）或回退 MS；Hub 恢复 `AUTH_SERVICE_CLIENTS_ENABLED=off`（token 端点 404、旧 service token 全部拒绝）。不得以“未设置 mode”掩盖回滚——未设置即 legacy，但必须记录告警。

---

## 6. 明确延期与剩余退出步骤（X-21）

**本 P0/P2 后仍然成立：**

- 共享 `AGENT_API_KEY` 仍可访问用户数据面（`SystemAgentOrResourceGuard` 未改），worker/MS 数据面也仍使用它。
- MS **内部调用**（session-status + OBO shadow）已切换为 service token（2026-11-24，code-only）；checkpoint-worker 内部控制面同样已切换（code-only）。MS 数据面、WA 全部调用与其数据面、worker 数据面均未切换。
- 人类 admin 服务账号登录仍存在。
- `session-status` 已接 service token（scope `session.status`）；baseline failed/requeue 与用户数据面仍未接。
- 无 RS256/JWKS、KMS、双签名密钥、全局撤销列表、审计表写入。
- MS 的 `IMODELHUB_AUTH_MODE` 未设置时仍为 legacy（启动 WARN），尚无真栈 canary 证明 service-token 路径在部署形态可用。

**精确剩余退出步骤（关闭 X-21 前必须全部完成）：**

1. 在目标环境用 CLI 注册真实客户端（secret 来自密钥库/stdin，不落日志）：MS（`session.status` + shadow 时的 `auth.delegation,auth.obo,authz.decide`）、WA、checkpoint-worker、必要的运维客户端。
2. MS **数据面**与 WA 改用 service token 或退役对应凭据；MS 内部调用已用 `X-Service-Token`（§5.2），worker 内部 agent 路由已用 `X-Service-Token`（§5.1）；剩余是 MS/WA/worker 真栈 canary、移除 worker 数据面/共享 key 依赖与 admin 邮箱/密码。
3. 设 `AUTH_SERVICE_CLIENTS_ENABLED=shadow`、`AUTH_SERVICE_LEGACY_API_KEY=deny`；跑真栈负例（无 token/错 token/错 profile/错 scope/禁用/轮换均 401/403），含 worker claim/complete、MS session-status/OBO，并断言数据面仍无 `X-Service-Token`。
4. 用户数据面拒绝 service/API-key 主体；删除 `SystemAgentOrResourceGuard` 的 API-key 绕过分支；保留入口 RBAC/OBO。
5. 删除人类 admin 服务账号登录与 MS/WA 中的凭据；轮换并退役 `AGENT_API_KEY`；删除 `AgentApiKeyGuard` 在内部路由的挂载与 `AUTH_SERVICE_LEGACY_API_KEY` 分支。
6. 补剩余内部路由（baseline 系统行为）与 token 撤销/审计覆盖；验收=仅 API-key 用户数据面 401/403、共享 key 不能单独换取 OBO/service token、service token 不能访问用户数据、内部路由负例 401/403 且日志无 token/secret。
7. 完成后在 `EXCEPTIONS.md` 关闭 X-21；此前不得宣称 B6 完成。

---

## 7. 测试与证据

### 7.1 单元（Hub）

新增 `test/unit/service-identity/*` 共 **46** 个用例：

- `service-secret.spec.ts`（5）：编码/盐/错误 secret/篡改/参数越界。
- `service-clients.service.spec.ts`（10）：provision/重复/非法 scope/secret/name、rotate、enable/disable、正确/错误/禁用/未知、usage 写失败不改变认证。
- `service-token.service.spec.ts`（8）：claims/no-refresh、统一 401、mode off、真实校验、exp/aud/iss、user JWT/畸形 claims、rotate/disable/delete/scope 撤销、日志无 secret/token。
- `service-auth.guard.spec.ts`（12）：Bearer/`X-Service-Token`、header 不作权威、profile/scope、坏 token/重复头不降级、off/allow/deny legacy、legacy 稳定错误码（`service_identity_required`/`CheckpointWorkerServiceRequired`）、无元数据 fail closed、日志无凭据。
- `service-token.controller.spec.ts`（3）：别名/冲突/缺失统一 401。
- `service-clients-migration.spec.ts`（2）：additive/CHECK/无 INSERT 默认密钥、down 仅 drop。
- `service-identity-config.spec.ts`（3）：默认 off/deny/TTL/aud/iss、shadow/allow/覆盖、非法模式/TTL 拒绝。
- `service-identity-route-wiring.spec.ts`（3）：audit/authz/delegation 守卫与 scope 元数据。
- 受影响更新：`jwt-strategy.spec.ts`（service token 被用户 strategy 拒绝且不查 session/user）、`logger.module.spec.ts`（`x-service-token` 脱敏）、`checkpoint-worker-service.guard.spec.ts`（改为新守卫/元数据）、`obo-guards.spec.ts`。

### 7.2 隔离 relational e2e

`test/user/service-identity.e2e-spec.ts`，fresh Postgres + 真实 Hub（独立 compose project，结束后 `down -v`）：

- **8/8 passed**：JWT 签发/claims/no-refresh、错误/未知/禁用统一 401、audit 路由 Bearer 与 `X-Service-Token` 成功、冲突 `X-Service-Name` 不影响签名主体、用户 JWT/未知 token/无凭据 401、legacy key/错误 pin/错误 key、缺 scope 403、checkpoint profile/scope（无凭据 401、错 profile 401、正确 worker 到 404 领域错误）、disable/enable/rotate 后旧 token 与旧 secret 失效。
- 测试栈使用 `AUTH_SERVICE_CLIENTS_ENABLED=shadow`、`AUTH_SERVICE_LEGACY_API_KEY=allow`、`AUTH_OBO_ENABLED=shadow`，仅用于隔离测试；生产默认仍 off/deny。
- 同一隔离栈另做 CLI smoke：`npm run service-client:provision`（stdin secret）创建与 `--rotate` 成功，输出仅非敏感摘要；首次 smoke 发现开发态 TypeORM SQL 日志会打印 scrypt 参数，已改为 CLI 专用 `logging:false` DataSource 并复测输出无 `scrypt$`/secret/SQL；测试行已清理。
- e2e 证据为 2026-11-24 最终运行 **3 suites / 30 tests passed**：本切片 8/8；同栈回归既有 `authz-obo-shadow` + `authz-audit-chain` **22/22 passed**，证明 legacy `X-API-Key` + pinned `X-Service-Name` 路径与稳定错误码 `service_identity_required` 未被 B6 守卫替换破坏；测试栈随后 `down -v` 清理。

### 7.3 静态检查

- `npx tsc --noEmit -p tsconfig.json`：0 错误。
- `npm run lint`（全量）：**0 errors / 88 warnings（均为存量 warning）**。
- `npm run build`（nest build + prod 依赖裁剪前构建）：exit 0。
- 全量 unit 见 §7.4。

### 7.4 全量单测（提交前）

`npm run test:unit -- --runInBand`（带 coverageThreshold；2026-11-24 运行）：

- **161 suites / 1458 tests passed**，exit 0。
- 全局覆盖率：statements **60.1%**、branches **48.37%**、functions **41.33%**、lines **59.75%**（阈值 50/33/30/50）。
- `src/service-identity/cli` 单测覆盖为 0（薄运维封装）；其调用的 service/repository 由单测 + e2e 覆盖，CLI 自身通过 §7.2 的隔离 smoke（create/rotate/stdin/无 SQL/hash 日志）验证。
- 局部 `test/unit/service-identity`：8 suites / 46 tests passed；`test/unit/auth/jwt-strategy.spec.ts`、`logger.module.spec.ts`、`checkpoint-worker-service.guard.spec.ts`、`obo-guards.spec.ts` 同批更新并通过。

### 7.5 checkpoint-worker 切片证据（2026-11-24）

`luban-backend/checkpoint-worker`（未提交、未 push；无 live Hub/DB/Redis/native）：

- 新增 `src/hub/serviceToken.ts` + `src/hub/serviceToken.test.ts`：签发/缓存/`exp-skew` 刷新/并发合并、错误 secret/401/404、5xx 有界重试、expired/audience/subject/typ/scope 拒绝、invalidate、日志与错误无 secret/token。
- `src/hub/http.ts`：service-token 模式内部调用仅发 `X-Service-Token`；legacy 模式仅发 `X-API-Key`+`X-Service-Name`；带 `Authorization` 的数据面请求保持共享 key + JWT 且永不带 service token；401/403 清除 token、单次请求不重试、不回落。
- `src/config.ts`/`main.ts`：`CHECKPOINT_WORKER_HUB_AUTH_MODE` 启用时必填；service-token 需 client id/secret；legacy 需共享 key；native 数据面仍需 API key；token URL/audience/skew/timeout/retries 有界；启动日志不含 secret/token。
- `src/fakeHub.test.ts`：真实本地 HTTP fake Hub 下 claim/chain/complete 与 heartbeat/storage-token/failed 全部携带 service token，断言无 `X-API-Key`/`X-Service-Name`。
- 验证命令与结果（最终运行）：`corepack pnpm@10 test` **14 files / 156 tests passed**；`corepack pnpm@10 typecheck` 0 错误；`corepack pnpm@10 lint` 0 错误/0 warning；`corepack pnpm@10 build` exit 0。
- 未做：真栈 canary（启用 service clients、provision worker、签发 token、claim/complete）、MS/WA 迁移、数据面 service token、共享 key 退役。不得据此关闭 X-21 或勾选 G1 Gate。

### 7.6 modeling-server 切片证据（2026-11-24，B6 P2）

`luban-backend/modeling-server`（未提交、未 push；无 live Hub/DB/native）：

- 新增 `src/hub/serviceToken.ts` + `serviceToken.test.ts`：签发/内存缓存至 `exp-skew`/并发合并/401 清缓存/404 不重试/网络/5xx 有界重试/畸形 token/exp/aud/subject/typ/ver/scope 拒绝/invalidate 只清指定 token/日志与错误无 secret/token。
- 新增 `src/hub/internalAuth.ts` + `internalAuth.test.ts`：legacy 只发 `X-API-Key`+pinned `X-Service-Name`；service-token 只发 `X-Service-Token` 并返回 token 供失效；缺 provider/secret 构造即失败；`session.status`（+ shadow OBO scopes）配对与 `describe` 无 secret。
- `src/config.ts`/`config.test.ts`：`IMODELHUB_AUTH_MODE` 缺省 legacy；service 配置存在但未显式选 mode → 启动失败；service-token 缺 secret/名称不匹配/非法名称 → 启动失败；token URL/audience/skew/timeout/retries 有界。
- `src/session/hubSessionStatus.ts` + 测试：service-token 只带 `X-Service-Token`；401/403 清除 token 且无 legacy 回落；token 获取失败不发请求、返回 `unavailable`；legacy 头保持；transient 分类不变。
- `src/authz/oboShadowClient.ts` + 测试：四个内部调用全部只带 service token；401 清除 token、下一次重新签发且无 legacy 头；签发失败 `auth`/`service_token_rejected|unavailable` 且零请求。
- `src/hub/createIModelsClient.test.ts`：官方数据面请求实测仍为 `X-API-Key` + 服务 JWT，且无 `X-Service-Token`/`X-Service-Name`（防污染）。
- 验证命令与结果（最终运行）：受影响 8 files / **89 tests passed**；全量 `npx vitest run` **155 files / 1532 passed + 1 expected fail + 8 skipped**（exit 0）；`npx tsc --noEmit -p tsconfig.json` 0 错误；受影响文件 ESLint 0 错误（`src/config.ts` 仅存既有 `z.string().url/email` deprecated 与 `console` 基线告警，未新增）。一次中间全量重跑出现 `CorpusReplay` 并行 import flake（`DefinitionPartition.classFullName`），该文件隔离重跑 6/6 并在最终全量中通过，与认证改动无关。
- 未做：真栈 canary（§5.3）、MS 数据面/WA 迁移、共享 key 退役。不得据此关闭 X-21 或勾选 G1 Gate。

### 7.7 Hub 切片证据（2026-11-24，B6 P2）

- 单测：`test/unit/service-identity` + `test/unit/auth/session-status.controller.spec.ts` 共 **11 suites / 64 tests passed**；全量 unit **163 suites / 1466 tests passed**（exit 0；Jest 提示 worker 未优雅退出，属既有 teardown 告警）。新增：
  - `service-session-status-route-auth.spec.ts`：modeling-server token+`session.status` 接受（header/Bearer）；缺 scope 403；错服务/用户 JWT/缺失/坏 token 401；legacy 仅 off 或显式 allow，错误 pin 拒绝。
  - `service-session-status-scope-migration.spec.ts`：additive 约束替换、down 恢复 P0 allowlist、无数据写入。
  - `service-identity-route-wiring.spec.ts`：session-status 守卫与 scope 元数据。
- `npx tsc --noEmit -p tsconfig.json`：0 错误；改动文件 ESLint 0 错误。
- 隔离 relational e2e 已加入 session-status 用例（service token/Bearer 接受、错服务/用户 JWT/缺坏 token 401、缺 scope 403、legacy pinned name、disable/rotate 401），但按“无 live DB/stack”约束**本轮未执行**；执行命令与前置见 §5.3/仓库 e2e runbook。既有 `session-revocation` e2e 的 legacy pin 改为 `modeling-server` 以匹配新守卫。

---

## 8. 风险、回滚与为什么仍接受 legacy

**为什么 legacy 仍可用**：Hub P0 只改 Hub，不部署/修改 MS/WA/worker；默认 `AUTH_SERVICE_CLIENTS_ENABLED=off` 使所有内部路由行为与之前一致。worker 与 MS 后续切片只在调用方侧显式选择模式（`service-token` 或 `legacy-api-key`），未切换 Hub 默认。MS 的 `IMODELHUB_AUTH_MODE` 未设置时仍为 legacy（启动 WARN），而 service-token 是显式 opt-in；一旦选择 service-token，调用方**不会**在 token 失败时回退共享 key。只有运维显式把 Hub 模式切到 `shadow` 并（可选）设 `AUTH_SERVICE_LEGACY_API_KEY=allow` 才进入双模。这样迁移可分批：先注册客户端 → 切 shadow 双跑 → 把 legacy 设 deny → 迁移调用方 → 最终删除共享 key。直接默认 deny/删除会立即打断现有服务，不符合本切片“非破坏”约束。

**回滚**：

1. 立即设 `AUTH_SERVICE_CLIENTS_ENABLED=off`：token 端点 404、service token 全部拒绝、内部路由回到 legacy（若调用方尚未发送 service token）。
2. 若已发 service token，先切回 legacy 或禁用/轮换客户端；token 最长 900s 自然过期。
3. 迁移 down 可删除 `service_clients`；运行手册要求先禁用/轮换调用方，删除后未过期 token 因找不到客户端而 401。

**残余风险**：

- 共享 key 仍存在（X-21），本切片不缩小其用户数据面权限。
- MS 缺省仍是 legacy（启动告警）；只有显式 `IMODELHUB_AUTH_MODE=service-token` 才迁移。未跑真栈 canary，部署形态（Hub 路由、代理头、日志脱敏）未验证。
- MS 的 provider 为进程内缓存，无跨副本协调；多副本各自签发短 TTL token，属预期但不做全局限流。
- 无全局 token 撤销/重放表；`jti` 仅关联，不阻止重放（P0 接受短 TTL）。
- 限流为 IP+路由桶，分布式攻击面未完全覆盖；后续可与服务客户端级预算结合。
- 签名密钥单版本；泄漏需轮换 `AUTH_JWT_SECRET`（会同时影响用户 token），KMS/双密钥属后续。
- service token 签发/校验只写结构化日志，未进 `audit_events`（X-26）；不新增高风险操作，但也不宣称已审计。
- `20261124000003` 的 down 在仍有客户端持有 `session.status` scope 时会失败；回滚 runbook 要求先移除该 scope/客户端或切回 legacy。
- `tenantId` 恒 NULL，不做跨租户强制（X-22/B10）。
