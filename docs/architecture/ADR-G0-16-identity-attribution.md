# ADR-G0-16：身份归因与 on-behalf-of

- 状态：**Proposed under owner directive 2026-11-23; not ARB-signed**
- 日期：2026-11-23
- 关联：`G0-DECISION-REGISTER.md` D0-16、`G1-EXECUTION-PLAN.md` WS-B、`IDENTITY-ACL-DESIGN.md`、`AIRR-2026-11-23-B5-TOKEN-TRANSPORT.md`
- 影响面：Hub 数据面、modeling-server（MS）、webhook-agent（WA）、storage/tile、审计与账本归因

> 本 ADR 只记录决策方向与迁移约束，**不表示已实现**。当前已落地的切片：B5a“查询串 token 默认拒绝 + 日志脱敏”；B1.2a“Hub access token 绑定 session 并在 logout/轮换/改密/重置/停用后下一请求 401”；B1.2b“MS WS 周期 session-status 复验/关闭”（unit + Hub 隔离 relational e2e 绿，MS WS 真栈待部署）。OBO、service token 与真实归因仍未实现。签字状态以 `G0-DECISION-REGISTER.md` 为准。

---

## 1. 背景

当前用户触发的建模路径在 MS 侧以服务账号与共享 API key 访问 Hub：

- MS 的全局 `IModelHost.authorizationClient` 使用服务账号 JWT，`IModelsClient` 额外注入 `X-API-Key`；Hub 的 API key 分支可绕过数据面 RBAC。
- changeset 的 `creatorId`、briefcase 的 owner、OpLog 的 `user` 因而落到服务账号或客户端随机 `sessionId`，审计无法回答“谁改了哪个文档”。
- MS 本地入口（download/open/FeatureOp/直改/导出/progress/retry）没有 per-iModel 授权；客户端可伪造 `sessionId`/`user`。
- 登出/停用/撤权后，已签发的 access token 与既有 WebSocket 仍可继续使用。

这些事实与差距的代码级核验记录在 `IDENTITY-ACL-DESIGN.md` §1（只使用仓内相对路径）。

## 2. 决策

### 2.1 两条凭据平面，禁止混用

1. **用户委托平面（OBO）**：Hub 以真实用户为主体签发短时、单 iModel、单用途的委托令牌；MS 代表用户访问 Hub 数据面，并在本地 PEP 判定时以该委托的权限为准。
2. **服务身份平面**：WA/MS 的后台任务（baseline、checkpoint、清理、进度回传）使用 Hub 签发的服务令牌；服务令牌无用户主体，只能调用显式系统路由。

`X-API-Key` 可保留为服务间传输因子，但**不得**再作为用户身份或用户数据面的授权依据。enforce 模式下，仅凭 API key 的用户数据面请求必须失败。

### 2.2 Hub 是唯一 PDP

有效权限只在一处解析：iTwin 角色 + iModel 显式 ACL + groups + shares + link share + deny + 账号/session/tenant 硬门禁。Hub 同时是自身数据面的 PEP；MS/WA/storage/tile 是本地资源的 PEP，不得用客户端传来的 `user`/`sessionId` 推断身份。

### 2.3 真实归因

- changeset 的 creator、briefcase 的 owner、named version 的创建者从 OBO `sub` 派生。
- OpLog 的 `payload.user` 从绑定到连接的 principal 派生，不再使用客户端 `sessionId`。
- 审计记录 `userId`、`actorService`（如 `service:modeling-server`）、`hubSessionId`、`iModelId`、`action`、`decision`/`reason`、`jti`/`authzVersion`；拒绝决策也必须记录。
- 历史服务账号行保留并标记 legacy，不篡改历史数据。

### 2.4 分阶段强制与回滚

按 `IDENTITY-ACL-DESIGN.md` §6 的 P0–P5 推进：shadow（只记录）→ 真实归因 → 读强制 → 写强制 → groups/shares/link/storage → 清理。每个阶段有独立开关（Hub `AUTH_OBO_ENABLED`/`AUTHZ_ENFORCE`，MS `IDENTITY_MODE`/`ACL_MODE`/`SESSION_BINDING`，WA `SERVICE_AUTH_MODE`）；回滚只关开关，不依赖长期凭据过期。

### 2.5 传输与日志红线

- 浏览器 REST 用 `Authorization: Bearer`；WS 过渡期使用同源 cookie，目标是 Hub 签发的一次性 WS ticket。
- Token 不得进入 URL 查询串、console、反向代理访问日志、错误体或公开文档。
- 任何临时兼容窗口必须显式配置、启动时告警、登记 `EXCEPTIONS.md`，并有过期/退出计划。
- 查询串 token 自 B5a 起默认拒绝；兼容开关 `SESSION_TOKEN_VIA_QUERY=allow` 仅作回滚，登记 X-18。

## 3. 迁移与发布约束

- Hub 先提供 OBO/service token 与 PDP 决策端点（不透明令牌优先，便于本地撤销；RS256/JWKS 作为后续演进）。
- MS 做连接 principal、OBO 交换与本地 PEP；在 ALS 作用域内调用 push，避免跨连接串 token。
- WA 用 service token 替代 admin 邮箱/密码登录；baseline 入口鉴权并绑定 `jobId`/`iModelId`。
- shared 新增 auth IPC 契约需独立版本化；按 shared → editor → viewer → web 顺序重建；Hub → MS → WA → web 的双端同版本发布。
- 旧客户端/旧 token 不静默降级为服务账号；返回稳定错误码（如 `client_update_required`）。

## 4. 失败语义

| 场景 | 结果 |
|---|---|
| 无 token / ticket 无效 / 过期 | 401 `unauthorized`，不泄露资源存在性 |
| token 有效但无权限（非成员/跨租户/只读） | 403 `forbidden` / `insufficient_permission` |
| token 版本落后 | 401/409 `authz_stale`；MS 重新交换一次，仍失败则拒绝 |
| PDP 不可用 | 写 503 `authorization_unavailable`；读无有效缓存则 503 |
| API key 走用户数据面 | 401/403 `service_identity_not_allowed` |
| service token 走用户数据面 | 403 `service_scope_denied` |
| 查询串 token（默认） | 401 `Unauthorized`，不调用 Hub，不降级 |

任何失败都 fail-closed，不得回退到服务账号或 API key。

## 5. 后果

**正向**

- 审计/撤销/计费/配额能绑定真实用户；客户端伪造身份字段不再影响归因。
- 共享 API key 不再是数据面 RBAC 旁路。
- token 生命周期有明确撤销点，泄露面收敛。

**负向/成本**

- 需要 Hub token/PDP、MS 连接上下文、WA service client 与数据库迁移，改动面大。
- 旧客户端/旧 MS 在强制阶段必须升级；存在兼容窗口管理成本。
- 审计与缓存增加写入/查询开销，需要预算与失效矩阵（见设计 §4.6/§9）。

## 6. 未决与阻塞

- **B1.2a（Hub）**：session-bound token 撤销已实现（access token 绑定 `sessionId` + `sessionHash`；JwtStrategy 每请求校验 session/owner/hash + 账号状态；logout/轮换/重置/停用下一请求 401）。隔离 relational Hub e2e 绿（18/18 + session 7/7），live Hub 仍为旧构建。
- **B1.2b（MS）**：已实现 WS 周期 session-status 复验与撤销关闭（4401），并新增 Hub 内部只读 session-status 探针以兼容 refresh 轮换；Hub 探针隔离真栈 e2e 绿，MS WebSocket 真栈需部署新 Hub+MS 后验证。
- **B1.2c（BFF/MS 缓存）**：正 token 缓存默认 `AUTH_TOKEN_CACHE_TTL_MS=0`，新 WS 升级/HTTP RPC/BFF `/api` 每请求回源；仅显式 >0 才缓存且只缓存成功结果，负结果永不缓存。既有 WS socket 仍是 30s 周期复验（X-20），不宣称“下一请求”。
- OBO 令牌格式（不透明 vs RS256/JWKS）、TTL/续期、groups/shares/link 执行或删除、storage PEP 档位等待签字决策。
- 在 ARB 签字前，不得把本 ADR 作为“已接受”引用；实施状态以各 AIRR/证据为准。
