# G1 B2/B3 身份与按文档授权设计

> 状态：**Proposed**（2026-11-22）
> 范围：`G1-EXECUTION-PLAN.md` WS-B 的 B2（on-behalf-of / 真实归因）与 B3（入口清单 / per-doc ACL 骨架）。
> 目标：用户触发的每条路径都使用 **on-behalf-of**；Hub 是 **PDP**；Modeling Server（MS）、Webhook Agent（WA）、Storage/Tile 是 **PEP**；changeset/briefcase/OpLog/audit 写入真实用户。
> 非目标：实时协同、评论/presence、装配/工程图、PDM、完整多租户 SaaS 承诺（B10）、ABAC 策略语言、外部 IdP 联邦。
> 实施门禁：本文不是 AIRR。按 P0-04，每个切片开工前仍需 AIRR；新增令牌契约、ACL schema、跨仓 auth IPC 契约需 ADR；接口冻结、例外登记、能力账本同实施 PR 更新。
> 脱敏声明：本文只使用仓内相对路径与设计级伪契约，不包含密钥、私有绝对路径、私有源码、运行日志或未脱敏证据。

---

## 0. 结论摘要

1. **两条凭据平面，禁止混用**
   - **用户委托平面（OBO）**：Hub 以真实用户为主体签发短时、单 iModel、单用途的委托令牌；MS 代表用户访问 Hub 数据面，MS 的本地操作以该委托的权限判定为准。
   - **服务身份平面**：WA/MS 的后台任务（baseline、checkpoint、清理、进度回传）使用 Hub 签发的服务令牌；服务令牌无用户主体，只能调用显式系统路由。
   - `X-API-Key` 可以保留为服务间传输因子，但**不得再作为用户身份或用户数据面的授权依据**；enforce 模式下仅凭 API key 的用户数据面请求必须失败。

2. **Hub 是唯一 PDP**
   - 有效权限只在一处解析：iTwin 角色 + iModel ACL + groups + shares + link share + deny。
   - Hub 同时是自身数据面的 PEP：每个数据面路由都验证 token 主体、iModel 绑定、scope 和有效权限。
   - MS/WA/Storage 是本地资源的 PEP：打开本地 briefcase、FeatureOp、直改、导出、tile 读取等，必须在本地判定或调用 Hub 决策端点；不得用客户端传来的 `user`/`sessionId` 自行推断身份。

3. **归因不靠改调用点**
   - changeset/briefcase 的 actor 由 Hub 从 OBO token 派生（`sub=user`，`act=service:modeling-server`），现有控制器本来就读 `req.user.id`，只需把该字段绑定到 OBO 主体。
   - OpLog 的 `payload.user` 统一从 `WriteLeaseRegistry` 的持有者派生；把 `acquire`/`holderUser` 改为 principal-aware 后，全部现有插入点不改。
   - 直改在 `EditCommandAdmin.runCommand` 一处加授权钩子；导入/导出/进度/重试各自一个包装点。

4. **分阶段强制，可回滚**
   - 先 shadow（只记录不拒绝）→ 再归因 → 再读强制 → 再写强制 → 最后 groups/shares/link 与 storage。
   - 每个阶段都有独立开关、旧服务账号兼容窗口和回滚步骤；OBO 令牌 TTL 很短，回滚无需等待长期凭据过期。

---

## 1. 事实核验与现状缺口

### 1.1 核验结论

| # | 待核验事实 | 结论 | 代码证据（相对路径） |
|---|---|---|---|
| 1 | Hub 有 iTwin/iModel ACL 与 JWT/refresh | **确认**。JWT 为 HS256，access 默认 15m、refresh 默认 30d；session 行持久化；`/auth/refresh` 原子轮换。 | `imodelhub-services/src/auth/auth.service.ts`、`auth/config/auth.config.ts`、`auth/strategies/jwt.strategy.ts`、`session/` |
| 2 | Hub 有效权限 = iTwin owner/creator + 成员角色；secured iModel 额外看显式行 | **确认**。`isSecured=false` 走 iTwin RBAC；`isSecured=true` 时 iTwin manage 绕过，否则必须命中 `imodel_user_permissions` 且资源维度等级足够。所有 mutation 路由目前声明为 `imodels_manage`，显式 **Write 等级在路由层是惰性的**。 | `imodelhub-services/src/common/authorization/authorization.service.ts`、`permissions.enum.ts`、`imodels/domain/permission.ts`、`imodels/permissions.service.ts` |
| 3 | Groups/shares/link tables 存在但不在有效权限解析中 | **部分确认，需纠正**。`access_control_groups`/`access_control_group_members` 与 iTwin 级 `access_control_shares` 存在，但 `AuthorizationService` 只读 owner/member/role 与 iModel 显式行；**未发现 tokenized link-share 表、兑换端点或 UI**。当前产品“分享”对话框用的是 iTwin 成员 + 显式 iModel 用户权限 + `isSecured`，不是 `access_control_shares`。 | `imodelhub-services/src/access-control/`、`common/authorization/authorization.service.ts`；`luban-cad/apps/web/src/modules/documents/components/ShareDocumentDialog.tsx`（测试注记“无链接页签”） |
| 4 | MS 以服务账号 + 共享 API key 认证 Hub，可访问任意 iModel | **确认**。MS 用 admin 邮箱/密码登录 Hub 取得服务 JWT；IModelsClient 额外注入 `X-API-Key`；Hub 的 `SystemAgentOrResourceGuard` 命中 API key 即跳过 RBAC。 | `luban-backend/modeling-server/src/auth/ServiceAccountAuthClient.ts`、`hub/createIModelsClient.ts`、`main.ts`；`imodelhub-services/src/common/authorization/system-agent-or-resource.guard.ts` |
| 5 | MS 入口（download/open/FeatureOp/直改/push/export/progress/retry）不执行 per-iModel ACL | **确认**。WS/IPC 只在升级时验 token；IPC handler 无 principal；download/open 用全局 briefcase 缓存；FeatureOp 只校验客户端 `sessionId` 的写租约；export/retry/progress 只验 token 或直接使用服务账号。 | `modeling-server/src/middleware/wsAuth.ts`、`ipc/LubanIpcHandler.ts`、`ipc/AppFunctionIpcHandler.ts`、`feature/FeatureRpcImpl.ts`、`rpc/LubanRpcImpl.ts`、`routes/retry.ts`、`main.ts` |
| 6 | Changeset/briefcase actor 是服务账号 | **确认**。changeset 创建用 `req.user?.id`，而服务通道的 `req.user` 仍是服务账号；briefcase 服务通道允许 body `userId`，但 SDK 不传，最终落服务账号。 | `imodelhub-services/src/imodels/changesets.controller.ts`、`briefcases.controller.ts`；`modeling-server/src/feature/FeatureRpcImpl.ts`（push 的 accessToken 来自 `IModelHost`） |
| 7 | OpLog.user 是客户端 sessionId | **确认**。写入点是 `writeLeases.holderUser()`；`acquire(key, sessionId, user=sessionId)` 缺省把 sessionId 当 user；前端每次挂载生成随机 `crypto.randomUUID()`，且调用 `acquireWriteLease(iModelKey, sessionId)` 不传 user。 | `modeling-server/src/feature/WriteLease.ts`、`feature/FeatureService.ts`（各 `insertOpLogEntry` 调用）、`luban-cad/apps/web/src/modules/part-studio/hooks/useEditorSession.ts` |
| 8 | Storage 直接暴露面 | **确认存在**。changeset 下载 SAS 10 分钟、checkpoint 容器 SAS 15 分钟；WA 生成 baseline 容器 SAS 目前可达 30 天（Hub 读回时重新签名但不改变 WA 侧姿态）；部署 nginx 有 `/azurite/` 通用直通与 tiles 专用直通。 | `imodelhub-services/src/imodels/changeset-download-url.util.ts`、`common/storage/domain/storage.port.ts`；`luban-backend/webhook-agent/src/baseline-generator.ts`；`deploy/default.conf.template` |
| 9 | WA 入口鉴权 | **确认但不完整**。`/webhook/events` 有 HMAC 验签；`/baseline/process` 无鉴权；debug GET 路由无鉴权。 | `luban-backend/webhook-agent/src/webhook-server.ts`、`validator.ts` |
| 10 | 会话生命周期 | **确认存在缺口**。Hub logout 删除 session 行，但 JWT 策略不查 session；多个控制器只有 `AuthGuard('jwt')`，没有 `JwtUserValidationGuard`；MS WS 只在升级时验一次，缓存 60s，连接建立后不复查；`/ws` 进度广播给所有已连接客户端。 | `imodelhub-services/src/auth/strategies/jwt.strategy.ts`、`common/guards/jwt-user-validation.guard.ts`、各控制器；`modeling-server/src/middleware/wsAuth.ts`、`main.ts` |
| 11 | 前端 JWT 生命周期与 MS 传输 | **确认**。`AuthSession` 存 sessionStorage 单键，refresh 单飞并在过期前 5 分钟刷新；WS `/ipc` 升级用同源 `luban_cad_auth` cookie；HTTP RPC/tile 的 `IModelApp.authorizationClient` 在生产传入**裸 JWT**（`LubanAuthorizationClient` 仅测试引用），Header 是否带 `Bearer ` 依赖 BFF/MS 的兼容解析；BFF 仍保留 `?token=` fallback。 | `luban-cad/apps/web/src/clients/auth/AuthSession.ts`、`clients/auth/LubanAuthorizationClient.ts`、`packages/viewer/src/host/web-initializer.ts`、`services/bff/src/auth.ts` |
| 12 | 前端权限门 | **确认存在安全不对称**。`usePermissions` 对**非 403** 查询错误回退 `editable`（availability-first）；`DocumentDetailsPage`/分享门等管理动作是 fail-closed。 | `luban-cad/apps/web/src/modules/part-studio/hooks/usePermissions.ts`、`modules/document-details/DocumentDetailsPage.tsx` |
| 13 | FeatureOp 身份信封 | **确认缺失**。shared `FeatureOp` 没有 `opId`/`userId`/`baseChangeset` 字段，与 `luban-cad/CLAUDE.md` 的目标信封不一致；MS 只能从连接 principal 取身份，不能信任 op 内字段。 | `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`；`luban-cad/CLAUDE.md` |
| 14 | 契约版本握手 | **确认缺口**。`@luban-cad/shared` package 版本为 `1.0.0`，而 `LubanFeatureRpcInterface.interfaceVersion=1.85.0`、`LubanRpcInterface.interfaceVersion=1.1.0`；`EXCEPTIONS.md` X-11 记录无运行时 handshake。 | `luban-cad/packages/shared/package.json`、`src/rpc/LubanFeatureRpcInterface.ts`、`docs/architecture/EXCEPTIONS.md` |

### 1.2 当前用户触发链（以打开文档并编辑为例）

```text
浏览器
  └─ /ipc WebSocket 升级：携带 luban_cad_auth cookie
       └─ MS wsAuth：向 Hub /auth/me 验 token，只得到 valid/invalid，不保存 principal
  └─ luban-ipc downloadBriefcase(iTwinId, iModelId, readonly)
       └─ LubanIpcHandler：直接 BriefcaseManager.downloadBriefcase
            └─ IModelHost.authorizationClient = ServiceAccountAuthClient
            └─ IModelsClient 额外 X-API-Key
  └─ BriefcaseConnection.openFile → ipc-app openBriefcase
       └─ AppFunctionIpcHandler：按 key 打开任意本地文件，无 owner 校验
  └─ LubanFeatureRpcInterface.applyFeatureOp(iModelKey, op, sessionId)
       └─ FeatureService：只 assert 写租约；OpLog.user = holderUser = sessionId
       └─ 本地 saveChanges + push
            └─ IModelHost.getAccessToken() = 服务账号
            └─ Hub changeset.create(creatorId = 服务账号)
```

补充事实：

- 直改应用路径是 `EditTools.startCommand({ commandId, iModelKey })` + `solidModelingIpc`（`subentity-delete.ts` 等）；`basicManipulationIpc` 只在 editor 工具内部使用。两者都走 `itwinjs-core/editor` IPC，不携带 `sessionId`/`userId`。
- `exportIModel`、`pullChanges`、progress、retry 目前没有生产前端调用方（契约/运维/WA 路径存在），但仍是 PEP 清单的一部分：未来 UI、Agent、外部脚本都可能触发，且它们已经暴露在 MS 进程中。
- `sessionId` 是每个编辑页挂载时生成的随机 UUID，不持久化、不跨页面复用，也没有传给 direct edit/openBriefcase/save/push/pull。

### 1.3 关键缺口（按利用面排序）

1. **服务身份即超级用户**：只要拿到 `AGENT_API_KEY` 或服务账号凭据，就能跨 iTwin 读写任意 iModel；MS 进程自身也没有按用户隔离。
2. **本地资源无 ACL**：FeatureOp/直改/导出/tile 在 MS 本地完成，Hub 的 ACL 完全不在路径上。
3. **会话身份不可信**：`sessionId` 由客户端生成，`user` 参数可由客户端伪造；MS 不把连接与用户绑定。
4. **归因失真**：changeset/briefcase 全记服务账号；OpLog 记随机 sessionId；审计无法回答“谁改了什么”。
5. **撤销不生效**：logout/角色移除/账号停用后，已签发的 access token 与既有 WS 仍可用。
6. **存储旁路**：SAS 与 `/azurite` 直通绕过 Hub/MS 的 PEP；tile 路径公开可猜。
7. **分享语义假实现**：UI 的分享 = 成员 + 显式 iModel ACL；`access_control_shares`/groups 未参与解析；无链接分享。G1 Gate 要求“真正执行或删除”，不能保留假分享。
8. **前端可用性优先的权限回退**：`usePermissions` 对非 403 错误回退 `editable`，把“权限查询失败”变成“可编辑 UI”；服务端必须拒绝，但 UI 会先呈现可写入口，属于安全相关的错误语义。
9. **身份传输形态不统一**：WS 用 cookie、Hub REST 用 Bearer、HTTP RPC/tile 生产传裸 JWT，BFF 还接受 `?token=`；没有任何一处把“连接 → 用户 → iModel”的绑定固定下来。
10. **契约与信封缺口**：FeatureOp 无身份/幂等信封；shared 包版本与 interfaceVersion 不一致；无运行时版本握手。跨仓升级无法自动发现 MS/shared 不匹配。

---

## 2. 令牌与委托设计

### 2.1 主体与凭据类型

| 凭据 | 主体 | 签发者 | 默认 TTL | 受众 | 用途 | 刷新 |
|---|---|---|---|---|---|---|
| 用户 access token | `user:<id>` | Hub | 15m（现有） | Hub UI/API | 浏览器直连 Hub REST | refresh token，30d，原子轮换 |
| **OBO token** | `user:<id>` + `act=service:<name>` | Hub | **5m** | Hub 数据面（`luban-hub:/imodels`） | MS 代用户访问 Hub；MS 本地 PEP 的权限依据 | 不刷新；用有效用户 token 重新交换 |
| **Service token** | `service:<name>` | Hub | **15m** | Hub 系统路由 / 目标内部服务 | WA/MS 后台任务 | client credentials |
| WS ticket | 用户 + client instance | Hub | 30s、一次性 | MS `/ipc` | 替代长期 cookie 中的 access token | 每次连接/重连 |
| Link guest token（可选 B4） | `link:<shareId>` | Hub | 15m–2h，可配置 | Hub/MS 受限读路径 | 链接分享的只读/评论访问 | 不刷新；重新兑换 |

**原则**

- OBO 是**用户身份 + 服务行为者**的组合，二者都进入审计：`sub=user`、`act=service:modeling-server`。
- Service token **没有用户主体**；任何需要“用户是谁”的路由都不得接受 service token。
- API key 只作为服务间额外传输因子；不得映射为 user，也不得触发 RBAC 绕过。enforce 模式下 Hub 用户数据面拒绝“仅 API key”的请求。

### 2.2 交换流程

#### A. 用户打开/操作文档（OBO）

1. 浏览器持有 Hub access token（现有 AuthSession）。
2. 建立 `/ipc` 时，浏览器先取一次性 WS ticket（推荐）或沿用同源 cookie；MS 验 ticket/token，得到 principal，但**此时不授予任何 iModel 权限**。
3. 首次 `downloadBriefcase(iTwinId, iModelId)` 或打开会话时，MS 调 Hub：
   - `POST /auth/token/on-behalf-of`
   - 用户 access token 放 `Authorization`；
   - 服务身份用 mTLS 或 MS service token 标识；
   - body：`{ iModelId, scopes, clientInstanceId }`。
4. Hub 依次校验：
   - 用户 token 签名、`exp`、session 存活、账号 `active`；
   - 调用方是允许请求 OBO 的服务客户端；
   - iModel 存在、属于声明的 iTwin、tenant 匹配；
   - 用 PDP 解析请求 scopes 的有效权限；无权限直接 403；
   - 签发**单 iModel** OBO token；scope 只能小于等于有效权限。
5. MS 在内存保存 `{token, claims, expiresAt}`，按 `(connection, iModelId)` 分键；令牌不下发浏览器、不写日志、不写数据库。
6. MS 用该 token 调 Hub 数据面；Hub 的 OBO guard 每次请求重新验证 token 状态、iModel 绑定、scope 与 `authzVersion`。
7. MS 对本地操作（FeatureOp/直改/导出/tile）调用 `POST /authz/decisions`（内部端点，携带 OBO token）取 allow/deny 与 `cacheTtlMs`；按第 4.5 节缓存。

#### B. 后台任务（Service）

- WA baseline、checkpoint 生成、清理、进度回传使用 `POST /auth/token/service`（client credentials）。
- 服务令牌带 `scope`（如 `baseline:process`、`baseline:complete`、`progress:ingest`、`checkpoint:maintain`、`cleanup:run`）和 `aud`（Hub 系统路由或目标内部服务）。
- 后台任务**不携带用户 token**；如果任务由用户触发，用户在 Hub 侧已落到 job 行（`requestedBy`），WA 只携带 `jobId`，审计把 `actor=service`、`onBehalfOf=requestedBy` 关联起来。

#### C. 用户触发的 retry/baseline

- retry 由用户发起时，MS 用 OBO token 调 Hub 的用户可访问 retry 路由（要求 `doc.manage`），Hub 写 `requestedBy`。
- WA 的 recovery 轮询是系统行为，用 service token 调系统 requeue 路由；两者共用同一底层状态机，但授权主体不同。

#### D. 为什么不做“直接透传用户 access token”

- 现有用户 token 无 `aud`、无 iModel 绑定、TTL 15m，MS 拿到后可重放到任意 Hub UI 路由。
- 透传无法表达“服务代表用户”的 `act`，审计只能看到用户，无法区分用户直接调用与 MS 代调用。
- OBO 把 token 缩到单 iModel、单用途、5m，并把 `act` 与 `jti` 写进审计。

### 2.3 Claims 与校验

OBO token 推荐**不透明令牌**（256-bit 随机值，服务端存哈希与 claims）。理由：G1 期间 Hub 同时是签发者与资源服务器，不透明令牌可在 Hub 本地即时撤销；无需把 HS256 secret 分享给 MS；MS 只信任交换响应（TLS）中的 claims。Phase 2 可切换 RS256 + JWKS 做无状态校验，但撤销仍需版本/denylist。

**OBO claims（交换响应与 Hub 存储一致）**

| 字段 | 示例 | 说明 |
|---|---|---|
| `typ` | `obo` | 与用户/服务 token 区分 |
| `iss` | `https://<hub>` | 签发者 |
| `aud` | `luban-hub:/imodels` | 只接受 Hub 数据面 |
| `sub` | `<user-id>` | 真实用户 |
| `act` | `{ sub: "service:modeling-server", client: "<client-id>" }` | 代行为者 |
| `scope` | `["doc.read","doc.write","changeset.push"]` | 只能是被授予权限的子集 |
| `iTwinId` / `iModelId` | UUID | 单文档绑定；跨文档必须重新交换 |
| `sid` | `<hub-session-id>` | 与用户登录 session 绑定 |
| `jti` | 随机 | 审计与撤销 |
| `authzVersion` | 整数 | 权限版本；变更即失效 |
| `tenantId` | `<iTwin account / deployment tenant>` | 跨租户负例 |
| `clientInstanceId` | 浏览器标签/连接实例 | 连接与 session 绑定 |
| `iat`/`nbf`/`exp` | epoch | 5m |

**Service claims**

| 字段 | 示例 | 说明 |
|---|---|---|
| `typ` | `service` | |
| `sub` | `service:webhook-agent` | 无用户 |
| `aud` | `luban-hub:/internal` 或 `modeling-server:/internal` | 目标服务 |
| `scope` | `["baseline:process","baseline:complete"]` | 显式系统能力 |
| `jti`/`exp` | | 15m，可撤销 |

**校验规则（必须全部满足）**

1. `typ` 与接受面匹配；用户数据面拒绝 `service`，系统路由拒绝用户/OBO。
2. `aud` 精确匹配；不接受“数组包含任意一个”的宽松匹配。
3. `exp > now`、`nbf <= now`；允许不超过 60s 的时钟偏差。
4. OBO：token 记录存在且未撤销；`sid` 对应用户 session 仍存活；用户状态 `active`、未锁定、未软删；tenant 匹配；路径 iModel 与 claims `iModelId` 一致；请求动作在 `scope` 内。
5. OBO：`authzVersion` 不低于该用户/iTwin 的当前版本；低版本返回 `authz_stale`，MS 重新交换并重试一次，仍失败则拒绝。
6. Service：client 已注册、未禁用、scope 允许、目标路由在 allowlist。
7. 任何一项失败都 fail-closed，返回稳定错误码；不得回退到服务账号或 API key。

### 2.4 TTL、续期、撤销

| 事件 | 处理 | 生效窗口 |
|---|---|---|
| 用户 logout | 删除 Hub session；删除所有 `sid` 对应 OBO；MS 下次操作/心跳发现 401 后关闭连接 | 下一次 Hub 调用立即；MS 本地写 ≤5s、读 ≤30s（见缓存） |
| 密码修改 | 删除其他 session；撤销对应 OBO；bump user `authzVersion` | 下次请求 |
| 账号 inactive/locked/deleted | 登录拒绝；Hub 每次 token 校验查状态；撤销 OBO/service 绑定 | 下次请求 |
| 成员移除/角色变更 | bump iTwin/user `authzVersion`；清除决策缓存 | 下一次 PDP/写检查；OBO 因版本落后被 Hub 拒绝 |
| iModel 显式 ACL grant/revoke | bump iModel/user 版本；失效相关缓存 | 下一次 PDP/写检查 |
| `isSecured` 切换 | bump iModel 版本 | 下一次请求 |
| group/share/link 变更 | bump 对应版本并失效标签 | 下一次 PDP |
| service client 轮换/禁用 | 撤销其 service token | 下一次请求 |
| OBO 到期 | 5m；MS 在剩余 <2m 时主动重新交换 | 无刷新令牌 |
| access token 到期 | 现有 AuthSession 单飞 refresh；WS 用新 token 重新绑会话 | 15m |

**关于“共享 API key 不是用户身份”的硬约束**

- Hub 的 `SystemAgentOrResourceGuard` 在 enforce 模式下只接受 **service token** 的系统路由；`X-API-Key` 不再使请求进入 RBAC 绕过分支。
- MS 的 IModelsClient 不再对所有请求注入 `X-API-Key`；用户触发路径只用 OBO。
- 服务账号的 admin 用户仅是迁移桥；目标状态是专用 service principal（client_id + secret/mTLS），不是可登录的人类账号。

### 2.5 传输与存储

- 浏览器：REST 用 `Authorization: Bearer`；WS 推荐一次性 ticket（`Sec-WebSocket-Protocol` 或短期 query/ticket），不再把 15m access token 放进 cookie。过渡期保留 cookie 时，MS 必须对每个连接做周期性 session 复查。
- Token 不得进入 URL（现有 `?token=` fallback 标记为 deprecated，enforce 模式关闭）、console、nginx access log、错误体。
- MS 内存中的 OBO 按连接分键，连接关闭即清除；不得写入 briefcase 文件、iModel、数据库或 OpLog。
- Hub 只存 OBO 哈希、claims、状态、`jti`、`exp`；service client secret 只存哈希；所有密钥可轮换。

---

## 3. PEP 入口清单

> 以下“当前”是代码核验结果；“目标”是本设计要求的强制点。所有入口在 enforce 模式下必须 fail-closed。

### 3.1 Hub（PDP + 自身数据面 PEP）

| 入口 | 当前 | 目标 |
|---|---|---|
| `/auth/email/login`、`/auth/refresh`、`/auth/logout`、`/auth/me` | 登录限流；logout 只删 session | 增加 `iss/aud/jti/sid`；logout/refresh 联动 OBO 撤销；`/auth/me` 检查账号状态 |
| `POST /auth/token/on-behalf-of` | 不存在 | 新增；用户 token + 服务身份 + iModel/scope；PDP 通过才签发 |
| `POST /auth/token/service` | 不存在 | 新增；client credentials；scope/aud allowlist |
| `POST /auth/ws-ticket` | 不存在 | 新增；30s、一次性、绑定 clientInstance |
| `GET /itwins`、`/itwins/:id`、成员/角色/邀请/groups/shares | JWT + `itwins_webview`/`itwins_modify` | 保持；groups/shares 进入有效权限解析或删除；所有 mutation 要求 iTwin manage |
| `POST /imodels`、`GET /imodels`、`GET /imodels/:id` | JWT；列表按可见性过滤；详情 `imodels_webview` | 保持；显式 iModel grant 也要能被列表可见性解析看到 |
| `PATCH/DELETE /imodels/:id`、clone/fork | `imodels_manage` | 要求 iTwin manage（不是显式 iModel Manage） |
| `GET/POST /imodels/:id/baselinefile`、`upload`、`failed`、`requeue` | `SystemAgentOrResourceGuard`；API key 可绕过 | 用户路径用 OBO + `doc.manage`；服务路径用 service token + `baseline:*`；API key 不得绕过 |
| `GET/POST/PATCH/DELETE /imodels/:id/briefcases*` | JWT + `SystemAgentOrResourceGuard`；create owner 可被服务通道 body 指定 | OBO 主体为 owner；body `userId` 仅服务迁移显式允许；读 `briefcases` 维度、写 `doc.write` |
| `/imodels/:id/changesets*`（create/list/get/index/file/download/batch/complete/locks/groups/extendeddata） | JWT + `SystemAgentOrResourceGuard`；create `creatorId=req.user.id` | create 从 OBO `sub` 取 `creatorId`；读 `changesets` 维度；写 `changeset.push` |
| `/imodels/:id/namedversions*`、checkpoints | JWT + guard | 读 `versions`；写 `version.create`/`doc.write` |
| `/imodels/:id/locks*` | JWT + guard | 写 `locks`；读 `doc.read` |
| `/imodels/:id/permissions*` | JWT + ResourceAccessGuard；授权面要求 iTwin manage | 保持；有效权限与 PDP 同一解析器；加 `authzVersion` |
| `/imodels/:id/users*` | JWT + ResourceAccessGuard | 保持；只返回真实用户归因后的数据 |
| `/imodels/:id/operations` | JWT + ResourceAccessGuard | 保持 |
| `/itwins/exports*` | **仅 JWT，无资源守卫** | 新增 iTwin/iModel 权限检查；导出审计 |
| `/webhooks*` | JWT + `WebhookAccessGuard` | 保持；复核 guard 的 iTwin 权限来源 |
| `/repositories*`、thumbnails、itwin image | ResourceAccessGuard | 保持；storage URL 受控 |
| `/imodels/:id/permissions`（GET） | 资源守卫后返回有效权限 | UI 与 MS PDP 使用同一结果；不返回内部 deny 细节 |

### 3.2 Modeling Server（本地 PEP）

| 入口 | 当前 | 目标 |
|---|---|---|
| `/ipc` WebSocket 升级 | 只验 token 有效；不保存 principal；token cache 60s | 验 ticket/token + 账号/session；建立 `ConnectionContext`；周期性复查；logout 关闭连接 |
| `/ws` WebSocket | 同样验 token；进度广播给所有连接 | 按 iModel 订阅；只向有 `doc.read` 的连接推送 |
| **BFF `/api/*`**（`services/bff`） | 接受 `Authorization: Bearer`、`luban_cad_auth` cookie、`?token=` fallback；作为 `/api` 的 JWT 终止面 | BFF 是 PEP/身份转发点：只解析用户 token，不把 service 凭据升级为用户；移除 `?token=`；转发 principal 用签名头/短 token，不转发浏览器原 token 到下游日志 |
| HTTP RPC `/:title/:version/mode/*` | `rpcGuard` 只验 token；前端生产 `authorizationClient` 传裸 JWT，Header 是否带 `Bearer ` 依赖兼容解析 | 统一 `Authorization: Bearer <jwt>`；绑定 principal；按调用的 iModel 做 PDP；`/rpc/metadata` 保持公开 |
| `luban-ipc downloadBriefcase` | 无 ACL；全局缓存；无 owner | 校验 iTwin/iModel 一致性；读/写分别判定；per-principal cache key；记录 owner |
| `ipc-app openBriefcase` | 按 key 打开任意文件/关闭他人 DB | 只允许该 principal 已下载且登记的 briefcase；禁止跨会话关闭；路径规范化白名单 |
| `saveChanges` / `pullChanges` / `pushChanges` / `closeIModel` | 按 key 无 owner | owner + `doc.write`；push 用 OBO；pull 用 OBO；close 只关自己的 |
| `toggleGraphicalEditingScope`、`reverseTxns*`、`reinstateTxn*`、`restartTxnSession` | 无 owner | owner + `doc.write`；checkpoint/读会话只读 |
| `LubanFeatureRpcInterface` 读方法（tree/sketch/list/bodies/variables/mass properties/resolveEdge/Face） | 无 ACL | `doc.read`；读缓存 30s |
| `applyFeatureOp` / `previewFeatureOp` | 只 assert 客户端 `sessionId` 写租约 | `doc.write` + session 绑定；写检查 5s；preview 保持写租约语义 |
| PartStudio `create/rename/delete`、`renameFeature/Body` | 写租约，user 可伪造 | `doc.write` + owner session；user 从 principal 取 |
| `acquireWriteLease` / `releaseWriteLease` | `user` 参数可由客户端传 | 忽略/校验客户端 user；绑定 `(sessionId, connection, user)`；lease 超时 30s |
| `LubanRpcInterface.exportIModel` | 无 ACL | `doc.read` + 导出审计；只导出该 principal 已打开的 DB |
| saved views/camera paths 读写 | 任意文件名 | 绑定 principal 与已登记 briefcase 路径；拒绝绝对路径越界 |
| `compareChangesets` / `detectConflicts` / `resolveConflicts` / `hasLocalChanges` | 无 ACL | `doc.read`；resolve 仍按未实现诚实返回，但入口先鉴权 |
| `IModelTileRpcInterface` / `requestElementGraphics` | token 仅升级时验 | `doc.read`；tile URL 受控（第 3.4 节） |
| `GET /api/imodels/:id/progress` | 验 token，任意 id 可读 | `doc.read`；只返回该 iModel |
| `POST /api/imodels/:id/retry` | 验 token，任意 id 可触发；服务账号写 | `doc.manage`；OBO 调 Hub；审计 requestedBy |
| `POST /api/webhook/events`、`POST /api/imodels/:id/progress`（入站） | `BACKEND_API_KEY` | service token；只接受 WA；actor=service |
| `/api/users/*`、forgot/reset | 转发用户 token | 保持；失败不伪造成功 |
| direct edit（应用路径 `EditTools.startCommand` + `solidModelingIpc`；`basicManipulationIpc` 为 editor 工具内部） | 仅数据打标，无授权；命令不携带 session/user | `EditCommandAdmin.runCommand` 统一授权；`doc.write` + owner；命令启动/保存点检查；提交审计 |
| `health`、`/rpc/metadata` | 公开 | 保持；不返回敏感数据 |

### 3.3 Webhook Agent

| 入口 | 当前 | 目标 |
|---|---|---|
| `POST /webhook/events` | HMAC 验签 | 保持；增加 messageId 去重/重放窗口 |
| `GET /webhook/events/recent`、`/webhook/events/:type`、`/forwarder/stats` | 无鉴权 | service token 或生产关闭 |
| `POST /baseline/process` | **无鉴权** | service token；绑定 `jobId`/`iModelId`/`iTwinId`；Hub 创建 job 时才允许 |
| baseline 生成/完成/失败回传 | 服务账号 + API key | service token；scope `baseline:*`；短 SAS；记录 requestedBy/actor |
| `forwarder` → MS | `BACKEND_API_KEY` | service token 或保留 key 作为传输因子，但 MS 不得将其当用户身份 |
| recovery 轮询 | 服务身份 | 保持 service actor；不得处理用户未授权的 iModel |

### 3.4 Storage / Tile

| 入口 | 当前 | 目标 |
|---|---|---|
| changeset 下载 | Hub 路由鉴权后签 10m SAS | Hub 鉴权后签 5m、单 blob、只读 SAS；无 list 权限；每次读取重新签发；审计 |
| changeset 上传 | create 时给 upload URL | `doc.write` 后签 5m、单 blob、只写 SAS；complete 校验大小/hash（D1.4） |
| checkpoint 容器 SAS | 15m（Hub 读时重签） | 保持 15m 以内；只对 `doc.read` 的请求签发；WA 的 30d SAS 改为 ≤15m |
| baseline 容器 SAS | WA 侧最长 30d | service token + Hub 签发 ≤15m；不得持久化长 SAS |
| thumbnail URL | 路由鉴权后重定向 | 5m 单 blob SAS 或代理 |
| `/azurite/` 通用直通 | 无鉴权 | 生产禁用；仅保留经 gateway 验证的 tile 路径 |
| `/azurite/.../tiles/` | 无鉴权，404→204 | 需签名 cookie/ticket 或 `auth_request` 到 MS/Hub；匿名 401/403 |
| tile 生成写入 | MS 用 Azurite account key | 服务端凭据；客户端只拿短期签名 URL；容器/前缀按 iModel 隔离 |
| tile 读取 | 公开 URL | `doc.read` 后签发；tile 内容仍视为模型数据，不得匿名 |

**Storage 作为 PEP 的现实约束**

Azure Blob SAS 本身不携带用户主体，无法在存储层区分用户。G1 提供两档：

- **严格档（推荐 tile/缩略图）**：Hub/MS 代理读取，或 nginx `auth_request` 先验证签名/会话，再 proxy 到 Azurite；存储凭据不出服务端。
- **带宽档（推荐大 changeset/baseline）**：Hub 鉴权后签发 5m、单 blob、路径绑定的 SAS；网关记录签发/使用；残余风险是 URL 在 5m 内可被持有者重放。若接受该风险，需在 `EXCEPTIONS.md` 登记并到期复核。

### 3.5 失败语义

| 场景 | 状态码/错误码 | 说明 |
|---|---|---|
| 无 token / ticket 无效 / 过期 | 401 `unauthorized` | 不泄露资源存在性 |
| token 有效但无权限（非成员、跨租户、只读写） | 403 `forbidden` / `insufficient_permission` | G1 Gate 要求非成员全入口 403 |
| 资源不存在 | 404 | 与 403 区分；跨租户不因 404 泄露 |
| token 版本落后 | 401/409 `authz_stale` | MS 重新交换一次；仍失败则拒绝 |
| PDP 不可用 | 503 `authorization_unavailable` | 写 fail-closed；读可使用未过期缓存，否则拒绝 |
| API key 走用户数据面 | 401/403 `service_identity_not_allowed` | enforce 模式硬失败 |
| service token 走用户数据面 | 403 `service_scope_denied` | |
| 客户端版本不支持 OBO | 403 `client_update_required` | 迁移期使用；不得静默降级为服务账号 |

---

## 4. 有效权限模型

### 4.1 输入与解析顺序

有效权限由以下输入合成，全部在 Hub 的单一 resolver 中完成：

| 输入 | 表/来源 | 语义 |
|---|---|---|
| iTwin owner | `access_control_owner_members`、`itwins.createdBy` | iTwin 全权限；可管理 ACL；是否可绕过 deny 见 4.3 |
| iTwin 成员角色 | `access_control_user_members.roleIds` → `access_control_roles.permissions` | 现有序；无角色时默认 viewer 权限 |
| Groups | `access_control_groups` + `access_control_group_members` + 新增 group roleIds | 组成员继承组角色；G1 只展平一层，IMS 嵌套组不支持 |
| iModel 显式权限 | `imodel_user_permissions`（`briefcasesLevel`/`changesetsLevel`/`versionsLevel`/`locksLevel`） | 文档级 grant；`isSecured=true` 的主要来源 |
| iModel deny | 新增 `access_control_denies` 或等价表 | 文档/用户/邮箱/域/组拒绝；优先于 grant |
| iTwin share | `access_control_shares` | email/domain 允许、allowList/denyList、过期；当前未解析 |
| Link share（可选） | 新增 `share_links` + 兑换记录 | token 哈希、目标、权限、过期、撤销、最大使用次数 |
| 账号/session/tenant | `user.status`、`lockedUntil`、`session`、tenant 映射 | 硬门禁；任何 grant 都不能覆盖 |
| `isSecured` | `imodels.isSecured` | 切换严格模式 |

**解析顺序（目标）**

```text
1. 账号硬门禁：active + 未锁定 + 未软删 + session 存活 + tenant 匹配
2. 资源硬门禁：iModel 存在且属于声明 iTwin；service 不得访问用户数据面
3. Deny：显式 deny、share denyList、link 过期/撤销、跨租户 → 拒绝
4. iModel 显式 grant（最高 grant）
5. Group grant（用户所在组的角色并集）
6. iTwin 成员角色 grant
7. iTwin 级 share grant（email/domain；仅在该 iModel 未 secured 时生效；secured 时默认不展开，必须由显式 iModel grant 或 link grant 授权）
8. Link guest grant（仅链接绑定的 iModel，且 min(link 权限, 目标 ACL)）
9. 默认拒绝
```

**当前 resolver 与目标的差异**

- 当前 `AuthorizationService` 没有 group/share/link/deny；`isSecured=false` 时完全忽略显式 iModel 行。
- 当前 `PermissionsService.getUserPermissions` 对无显式行返回 `[webview]`，并在 iModel 创建者上返回全权限；但 `checkIModelAccess` 并不特判 iModel `createdBy`，存在 UI 与服务端不一致。目标统一到同一 resolver，二选一：承认创建者为 owner 并写审计，或从 UI 移除该假设。
- 当前 mutation 路由全部要求 `imodels_manage`，显式 `Write` 不生效。目标 action 目录引入 `doc.write`，但首期可保持“写=Manage”以兼容，再在 B4 激活 Write。

### 4.2 Action 目录与等级

等级偏序：`None < Read < Write < Manage < Owner`（每个资源维度独立）。

| Action | 资源维度要求 | 最低等级 | 说明 |
|---|---|---|---|
| `doc.read` | briefcases / changesets / versions / locks 任一，或未 secured 的 iTwin `imodels_webview` | Read | 元数据、树、几何、tile、导出、进度 |
| `doc.write` | briefcases **且** changesets **且** locks | Write（首期可映射 Manage） | FeatureOp、直改、save/push |
| `briefcase.write` | briefcases | Write | acquire/下载可写 briefcase |
| `changeset.push` | changesets + briefcases | Write | push |
| `lock.write` | locks | Write | acquire/release/update lock |
| `version.create` | versions | Write | named version |
| `doc.manage` | 不看显式 iModel Manage | iTwin `imodels_manage` | grant/revoke、isSecured、删除、baseline 上传/retry、clone/fork |
| `doc.share` | 同 `doc.manage` | iTwin manage | 共享/链接管理 |
| `export.read` | `doc.read` | Read | 导出额外写审计 |
| `tile.read` | `doc.read` | Read | tile/缩略图 |
| `progress.read` | `doc.read` | Read | 进度查询 |
| `baseline.process` / `baseline.complete` | service scope | — | 仅 service token |
| `progress.ingest` | service scope | — | 仅 WA → MS |
| `checkpoint.maintain` / `cleanup.run` | service scope | — | 仅后台 |

**为什么管理动作只认 iTwin manage**：现有 F4 修复已裁决“显式 iModel Manage 不得 grant/revoke/关安全/删库”，否则被共享方会把文档管理员抬成 iTwin 管理员。本设计保留该口径，并把它扩展到 link share 管理。

**迁移期映射**：首期 Hub 路由仍保留现有 `imodels_webview`/`imodels_manage` 元数据；`doc.read`/`doc.write`/`briefcase.write` 先在 MS 本地 PEP 生效，Hub 路由按阶段替换。这样不会在开启 OBO 的同一次发布中改变所有路由的等级语义；Write 等级在 B4 激活。

### 4.3 Deny 优先级

| 优先级 | Deny 来源 | 可否被 iTwin owner 覆盖 | 说明 |
|---|---|---|---|
| 1 | 账号 inactive/locked/deleted、session 撤销、跨租户 | 否 | 硬门禁；只能通过恢复账号/重新邀请解决 |
| 2 | 显式用户/iModel deny | 否（默认） | 合规/保密拒绝；owner 可删除 deny 记录，但不能在保留记录时绕过；删除动作审计 |
| 3 | share denyList / 域拒绝 | 否 | 精确邮箱优先于域；denyList 优先于 allowList |
| 4 | link 过期/撤销/超次数 | 否 | 链接记录状态即拒绝 |
| 5 | 任何 grant（iModel/group/role/share/link） | — | 只决定允许范围，不覆盖 1–4 |
| 6 | 默认拒绝 | — | 无 grant 即拒绝 |

**冲突示例**

- 用户在 iTwin 是 Editor（有 `imodels_manage`），但 iModel 有显式 deny → 拒绝读写；owner 可在 ACL 面板移除 deny，移除动作写审计。
- 用户有显式 iModel Read，同时 share denyList 命中其邮箱 → 拒绝；denyList 优先。
- 用户是 iTwin Viewer，持有有效 link（Read） → 允许读取链接绑定的 iModel；不能写。
- `isSecured=true` 且用户只有 iTwin share（无显式 iModel 行） → 默认拒绝；需要显式 grant 或 link 授权。
- 服务 token 访问任何用户数据面 → 拒绝，即使它有 `imodels_manage` 等价 scope。

### 4.4 Groups / shares / link share

**Groups（B4 或 B3 最小实现）**

- 现状：group 成员表存在，但 group 没有 roleIds，authorization 不读 group。
- 目标 schema：`access_control_groups` 增加 `roleIds text[]`，或新增 `access_control_group_roles(groupId, roleId)`；组成员继续用 `userId`/`email`。
- 解析：用户 → 其 iTwin 内所有组成员行 → 组 roleIds → 角色权限并集；与用户直接角色并集。
- 不支持：IMS 外部组、嵌套组（`imsGroups` 仅保存不解析）；遇到时记录 `unsupported_group_source` 并拒绝该组授予，不能静默忽略成“无权限”或“有权限”。
- 失效：组成员/角色变更 bump group + iTwin/user 版本。

**iTwin shares**

- 现状：`access_control_shares` 有 `permission`（View/Edit/Manage）、`sharedWithEmails`、`sharedWithDomains`、`allowList`、`denyList`、`expirationDate`，但无解析、无 UI 使用。
- 目标二选一（G1 Gate 要求“真正执行或删除”）：
  - **执行**：作为 iTwin 级 email/domain grant；`denyList` 优先；过期即拒绝；仅在 `isSecured=false` 的 iModel 上展开为读/写；secured 文档仍需显式 iModel grant，避免项目级分享意外打开保密文档。
  - **删除**：移除表/路由/后台入口，UI 不展示；在 `EXCEPTIONS.md`/能力账本记为“未实现并删除”。本设计推荐先删除，避免半成品分享；若产品要求保留，则按执行路径实现。
- 若执行：`View → Read`、`Edit → Write`、`Manage → Manage`；`denyList` 优先于 `allowList`/`sharedWithEmails`/`sharedWithDomains`；domain 按后缀匹配但要求精确域边界（`example.com` 不匹配 `notexample.com`）；`expirationDate` 过期即拒绝。域/邮箱分享无法枚举用户，缓存失效按 iTwin 全清。
- 当前产品分享 UI 实际使用 iTwin 成员 + 显式 iModel ACL + `isSecured`；本设计把这条路径作为主路径，并确保 UI 与服务端同一 resolver。

**Link share（可选，B4）**

- 新表 `share_links`：`id`、`iTwinId`、`iModelId`（或 `scopeType/scopeId`）、`tokenHash`、`permission`（Read/Write）、`expiresAt`、`revokedAt`、`maxUses`、`useCount`、`createdBy`、`createdAt`、可选 `passwordHash`/`allowedDomains`。
- 兑换：`POST /shares/links/:token/redeem`（公开但限流）→ 校验哈希/过期/撤销/次数/密码/域 → 签发 link guest OBO（15m–2h，单 iModel，read 或 write）。
- 有效权限：`min(link.permission, 目标 ACL 对 link guest 的授予)`；`denyList`/deny 记录优先；secured 文档默认不允许 link，除非显式创建 link grant。
- 撤销：删除/置 revoked；bump iModel/link 版本；已签发 guest token 在 TTL 内仍有效，除非每次请求查 link 状态（推荐查，因为 link 是低频入口）。
- 审计：兑换、每次使用、撤销都写 audit；token 只存哈希，不写日志。
- 如果 G1 不做链接分享，则**不创建表、不暴露 UI/路由**，并在能力账本明确“无链接分享”。不能保留“看起来能分享、实际不生效”的入口。

### 4.5 PDP 接口

**内部决策端点**

```text
POST /authz/decisions
Authorization: Bearer <obo-token>
X-Service-Name: modeling-server
{
  "iModelId": "<uuid>",
  "actions": ["doc.read", "doc.write"],
  "resource": { "type": "imodel" }
}
→ 200
{
  "decisionId": "<uuid>",
  "allow": false,
  "actions": { "doc.read": "allow", "doc.write": "deny" },
  "permissions": ["imodels_webview", "imodels_read"],
  "reason": "read_only",
  "authzVersion": 42,
  "decidedAt": "<iso>",
  "cacheTtlMs": 5000
}
```

- 端点只接受 service/OBO 组合，不暴露给浏览器。
- `reason` 使用稳定码：`not_member`、`cross_tenant`、`revoked`、`read_only`、`explicit_deny`、`share_denied`、`link_expired`、`service_identity_not_allowed`、`session_revoked`、`authz_stale`、`unsupported_group_source`。
- `GET /imodels/:id/permissions` 保留为浏览器可读的有效权限投影，内部调用同一 resolver；不得成为第二套判定。
- 决策可批量（一个 iModel 多个 action）；会话打开时一次取 `doc.read`/`doc.write`，写操作按 4.6 复查。

### 4.6 缓存键与失效

**新键空间（与旧 `authz:*` 并存，迁移后删除旧键）**

| 键 | 值 | TTL | 标签 |
|---|---|---|---|
| `authz:v2:base:{tenant}:{iTwinId}:{userId}` | 角色/组/share 展开后的基础权限 | 30s | `authz:itwin:{iTwinId}`、`authz:user:{userId}`、`authz:group:*`、`authz:share:*` |
| `authz:v2:imodel:{iModelId}:{userId}` | 显式 levels/deny/isSecured 摘要 | 30s | `authz:imodel:{iModelId}`、`authz:user:{userId}` |
| `authz:v2:decision:{tenant}:{userId}:{iModelId}:{action}` | allow/deny + version | 读 30s、写 5s、负 5s | 同上 |
| `authz:v2:version:user:{userId}` / `itwin:{iTwinId}` / `imodel:{iModelId}` / `group:{groupId}` / `share:{shareId}` | 单调版本 | 持久 | — |
| `authz:v2:session:{sid}` | 会话状态、撤销标记 | 与 session 同步 | `authz:user:{userId}` |
| `authz:v2:token:{jti}` | OBO/service 状态、exp | 与 token 同步 | — |

**失效矩阵**

| 变更 | 失效键/标签 |
|---|---|
| 成员 add/remove/update | `authz:itwin` + `authz:user`；bump itwin/user 版本 |
| 角色 create/update/delete | `authz:itwin`（全体成员）；bump itwin 版本 |
| group create/delete、成员、roleIds | `authz:group` + 受影响 user/itwin；bump group/itwin 版本 |
| share create/update/delete | `authz:share` + `authz:itwin`；bump share/itwin 版本（域分享无法枚举用户，按 itwin 全清） |
| iModel 显式 grant/update/revoke/deny | `authz:imodel` + `authz:user`；bump imodel/user 版本 |
| `isSecured` 切换 | `authz:imodel`；bump imodel 版本 |
| iModel clone/fork/transfer/delete | 源/目标 itwin + imodel；bump 双方版本 |
| 用户状态/锁定/删除、logout、改密 | `authz:user` + session/token；撤销 OBO/service |
| service client 轮换/禁用 | token 键；bump service 版本 |
| link 创建/撤销/过期 | `authz:share`/`authz:imodel`；bump link/share 版本 |

**当前缓存问题（必须一并修）**

- `authz:imodel:{iModelId}` 目前 60s 且无标签，iModel 转移/删除不会失效。
- 显式 iModel grant/revoke 不经过权限缓存（`checkIModelAccess` 直查库），但 `PermissionsService` 的 UI 投影与 `isSecured` 读取路径需要统一版本。
- MS 的 WS token cache 60s 只缓存 valid/invalid，不缓存用户/权限；不能作为授权缓存。
- 负缓存必须 ≤5s，否则“刚授权仍 403”。

---

## 5. 真实归因（不重写每个调用点）

### 5.1 Hub：changeset / briefcase / named version

- `changesets.controller.create` 已把 `req.user?.id` 传给 service。OBO guard 把 `req.user.id` 设为 `sub`，因此 `creatorId` 自动变成真实用户；无需改 service 签名。
- 新增 `actorService`/`actorType`/`authSessionId`（nullable）列，或在 `audit_events` 记录 `act`；`creatorId` 只放真实用户。
- `briefcases.controller.resolveOwnerUserId`：
  - OBO 路径返回 `req.user.id`；
  - body `userId` 仅在迁移/后台显式 scope 下允许；
  - 普通 OBO 用户传他人 userId → 403；
  - 新增 `createdByService`/`authSessionId`。
- named version 的 `createdBy` 同样取 OBO `sub`；锁的 `userId` 取 OBO `sub`（若实体有该列）。
- `iModelUsers` 统计从此按真实用户聚合；历史服务账号行保留，标记 `legacy_service`，不篡改历史。

### 5.2 MS：连接、session、OpLog

**连接上下文（新增）**

```text
ConnectionContext {
  connectionId, userId, hubSessionId, clientInstanceId,
  clientVersion, oboByIModel: Map<iModelId, {token, claims, expiresAt}>,
  subscriptions: Set<iModelId>, lastValidatedAt
}
```

- `/ipc` 升级时从 ticket/token 得到 principal，创建 context；用 `AsyncLocalStorage` 在每条 IPC/RPC 消息分发期间暴露给 handler。
- `LocalhostIpcHost` 的连接分发需要一处 fork 改动：在 `LocalTransport.connect` 的消息监听外层建立 ALS 作用域，使同步/异步 handler 都能读到当前连接。该改动必须登记到 `docs/ITWINJS_CORE_MODIFICATIONS.md`（P0-08），并加并发双连接测试，证明不会串用户。
- 若不做 fork 改动，替代方案是新增自定义 IPC 封包层；但会偏离标准 `IpcApp`/`RpcSessionInvocation` 通道，不推荐。

**Session 绑定（不信任客户端 sessionId）**

- `SessionRegistry.bind(externalSessionId, principal, iModelKey)`：首次 `acquireWriteLease` 或首次写 RPC 时绑定。
- 同一个 `sessionId` 被另一个 connection/user 使用时 → 403 `session_owner_mismatch`。
- 每次 RPC 校验 `(connectionId, sessionId, iModelKey, principal)`；只读 RPC 也校验 connection 与 iModel。
- `acquireWriteLease(..., user?)`：忽略客户端 `user`；若传入且与 principal 不一致，返回错误而不是静默使用。

**OpLog（调用点零改动）**

- `WriteLeaseRegistry` 从 `{sessionId,user,expiresAt}` 改为 `{sessionId,userId,actorService,connectionId,expiresAt}`。
- `holderUser()` 返回真实 `userId`；新增 `holderContext()` 返回 `{userId, sessionId, actor, connectionId}`。
- 现有约二十处 `insertOpLogEntry(..., user: writeLeases.holderUser(...))` **不改**；`payload.user` 变成真实用户。为兼容旧库，新增可选 `payload.clientSessionId` 与 `payload.actor`；旧条目无这些键，读取方按缺省处理。
- 如果某条路径没有 principal（后台/测试），必须显式使用 `system` actor；不得回退到客户端 sessionId。

**Push 的令牌选择**

- 现有 `BriefcaseManager.pushChanges` 内部调用 `IModelHost.getAccessToken()`，不会使用调用方传入的 `accessToken`；`pullChanges` 也可能走同一全局客户端。
- 因此把全局 `IModelHost.authorizationClient` 从 `ServiceAccountAuthClient` 替换为 `SessionAwareAuthorizationClient`：
  - 读取 ALS 中的当前 connection OBO；
  - 无 ALS 时，只有显式标记的后台上下文才返回 service token；
  - 两者都没有 → 抛错（fail-closed），不返回服务账号。
- `FeatureService` 的 push 回调必须在 op 的 ALS 作用域内被 await；若改为延迟队列，捕获 `{token}` 并在 push 时重新建立 ALS 作用域。加并发布测试（两个用户同时 push，各自 token）。
- `downloadBriefcase`/`acquireNewBriefcaseId` 可以显式传 `accessToken`（iTwin API 支持 `TokenArg`）；但仍建议在 ALS 作用域内调用，避免遗漏。

**本地 briefcase 所有权**

- `BriefcaseOwnershipRegistry`：`(iModelId, fileName) → {userId, connectionId, writable, briefcaseId}`。
- `downloadBriefcase` 成功后登记；`openBriefcase` 只允许登记路径；`save/pull/push/close/undo` 校验 owner。
- 进程重启后 registry 丢失：默认拒绝打开未知文件；前端重新走 downloadBriefcase 流程（缓存命中时重新登记）。不能因为文件在磁盘上就信任。

### 5.3 Direct edit

- 在 `packages/editor/backend/src/EditCommand.ts` 的 `EditCommandAdmin.runCommand` 增加一个可注入的 authorizer：
  - RPC 启动命令前调用 `authorize(principal, iModel, 'doc.write')`；
  - 无 principal 或 deny → 拒绝启动；
  - 应用路径是 `EditTools.startCommand` + `solidModelingIpc`；`basicManipulationIpc` 由 editor 工具内部调用，同样落到 `runCommand`/`callMethod`，因此一个钩子覆盖；
  - `EditorAppHandler.callMethod` 继续受 active command 约束；命令启动后不再逐方法授权，但保存/提交点再校验一次 owner + `doc.write`。
- `DirectEditGuard` 的 overridden 标记增加 `userId`/`connectionId`（如有 `sessionId` 一并记录；direct edit 当前不携带 sessionId），仍写 jsonProperties，保持现有双读面契约；ECE/EDE 提交后写 audit。
- 直接调用 `EditCommandAdmin.runCommand` 的非 IPC 路径（测试/脚本）必须显式提供 `system` principal，否则拒绝；加测试防止绕过。

### 5.4 导出、进度、重试

- 导出：`LubanRpcImpl.exportIModel` 前查 `doc.read`；导出结果附带 audit（user、iModel、格式、字节数、requestId）。导出是数据外带，按 P0-10 属于敏感操作，需审计；是否强制 HITL 由产品决定（未决问题）。
- 进度：`GET /api/imodels/:id/progress` 前查 `doc.read`；只返回该 iModel。`/ws` 只向订阅且已授权的连接推送。
- 重试：用户路径查 `doc.manage`，用 OBO 调 Hub；服务 recovery 用 service token；两者都写 audit，前者 `requestedBy=user`，后者 `actor=service`。

**审计记录（最小字段）**

| 字段 | 说明 |
|---|---|
| `eventId` / `decisionId` / `requestId` | 关联一条决策与一次请求 |
| `userId` | 真实用户；service 路径为空 |
| `actorService` / `onBehalfOf` | `service:modeling-server`/`service:webhook-agent`；后台任务记录 `requestedBy` |
| `hubSessionId` / `clientInstanceId` | 用户会话；service 路径为空 |
| `iTwinId` / `iModelId` / `action` | 资源与动作 |
| `decision` / `reason` | allow/deny + 稳定原因码 |
| `jti` / `authzVersion` | token 与权限版本 |
| `ip` / `userAgent` | 入口审计；不记录 token |
| `createdAt` / `hashPrev` | 时间与 B7 hash chain（先留字段） |

审计写入必须与业务提交同事务或由 outbox 保证至少一次；拒绝决策也要记录（deny 审计不得只在成功路径写）。

### 5.5 不重写调用点的落点清单

| 目标 | 单点改动 | 不改的调用点 |
|---|---|---|
| changeset creator = 用户 | Hub OBO guard + changeset controller 现有 `req.user.id` | 所有 SDK/FeatureOp 调用 |
| briefcase owner = 用户 | Hub `resolveOwnerUserId` 一处 | MS 下载/打开调用 |
| OpLog.user = 用户 | `WriteLeaseRegistry.acquire/holderUser` | 全部 `insertOpLogEntry` 调用 |
| push 用用户 token | `SessionAwareAuthorizationClient` + `FeatureService` push 回调上下文 | 各 feature 写方法 |
| 直改授权 | `EditCommandAdmin.runCommand` 一个钩子 | 各 `EditTool`/`solidModelingIpc` 调用（`basicManipulationIpc` 为 editor 工具内部） |
| 下载/打开 owner | `LubanIpcHandler` + `AppFunctionIpcHandler` 各一处 registry | 前端打开流程 |
| 导出/进度/重试 | 各 route/handler 一个包装 | 前端调用签名 |

---

## 6. 迁移与发布

### 6.1 功能开关

| 服务 | 开关 | 取值 | 说明 |
|---|---|---|---|
| Hub | `AUTH_OBO_ENABLED` | `off`/`shadow`/`on` | shadow：签发并记录，但数据面仍可走旧服务账号 |
| Hub | `AUTH_SERVICE_CLIENTS_ENABLED` | `off`/`shadow`/`on` | client credentials 签发 |
| Hub | `AUTHZ_ENFORCE` | `off`/`read`/`write`/`full` | read：读入口拒绝；write：写入口拒绝；full：含 storage/link |
| Hub | `AUTHZ_LEGACY_APIKEY_USER_PLANE` | `true`/`false` | 仅迁移期允许 API key 走用户数据面；最终必须 false |
| Hub | `AUTHZ_REQUIRE_SESSION` | `true`/`false` | B1.2 全局 session 校验 |
| Hub | `AUTHZ_CACHE_V2` | `true`/`false` | 新键空间/版本失效 |
| Hub | `AUTHZ_LINK_SHARE_ENABLED` | `true`/`false` | 未实现则 false，且不暴露路由/UI |
| MS | `IDENTITY_MODE` | `service`/`obo-shadow`/`obo` | shadow：交换 OBO 并记录，但 hub 调用仍可用旧通道 |
| MS | `ACL_MODE` | `off`/`shadow`/`read`/`full` | 本地 PEP 强制等级 |
| MS | `SESSION_BINDING` | `off`/`shadow`/`enforce` | sessionId 绑定 |
| MS | `PDP_FAIL_CLOSED` | `true` | 写路径 PDP 不可用必须拒绝 |
| MS | `AUTHZ_STORAGE_MODE` | `legacy`/`signed`/`proxy` | storage/tile 姿态 |
| WA | `SERVICE_AUTH_MODE` | `legacy-admin`/`service-token` | 服务身份迁移 |
| WA | `BASELINE_TRIGGER_AUTH` | `off`/`service` | `/baseline/process` 鉴权 |
| WA | `BASELINE_SAS_TTL_SECONDS` | ≤900 | 消除 30d SAS |
| Web | build flag | `authz.sessionBinding` | 旧客户端回退/提示升级 |

### 6.2 分阶段

| 阶段 | 内容 | 退出标准 | 回滚 |
|---|---|---|---|
| **P0 Shadow** | 连接 principal、OBO 交换、PDP 决策记录；不拒绝；audit 开始写 | 所有服务可启动；owner/viewer 决策与现行为一致；无双连接串线 | 关 OBO/ACL 开关，回旧服务账号 |
| **P1 归因** | Hub 用 OBO `sub` 写 creator/owner；MS 用 principal 写 OpLog；直改/导出 audit | 真栈 push 的 changeset/briefcase/OpLog 出现真实用户；后台仍是 service；旧数据不改写 | 关归因开关；旧行保留 |
| **P2 读强制** | Hub 读入口拒绝非成员/跨租户/撤销；MS 读入口 PDP；存储 SAS 缩短 | 读负例全 403/401；正常读无回归；SAS 过期测试通过 | `AUTHZ_ENFORCE=off`、MS `ACL_MODE=off` |
| **P3 写强制** | 写入口要求 OBO；session 绑定；API key 退出用户数据面；直改 gate | 只读写 403、跨文档 OBO 403、service bypass 失败、双用户不互踢 | 退回 P2；保留 service 账号凭据 |
| **P4 全量** | groups/shares/link、Write 等级、storage/tile PEP、WA 全入口、tenant 负例 | G1 Gate 全部满足；link 要么生效要么删除；storage 匿名 401 | 按子系统开关退回 |
| **P5 清理** | 删除死表/死路由/假 UI；禁用 admin 人类账号；轮换密钥；移除 flags | 无 legacy API key 用户路径；无假分享；审计可查 | 不适用；先备份 |

### 6.3 兼容策略

- **旧 MS/旧客户端**：没有 OBO 的连接在 P2 起没有用户数据权限；返回 `client_update_required`。不允许静默降级为服务账号。
- **旧 Hub token**：无 `typ` 的 token 只作为 Hub UI token 接受；MS 不能把它当 OBO。P1 期间 Hub 可同时接受新旧 token；OBO guard 只认 `typ=obo`。
- **旧 changeset/briefcase 行**：不改写 `creatorId`/`userId`；新增 `actorType='legacy_service'` 或 audit 标注。`iModelUsers` 不把 legacy 行伪装成用户行。
- **旧 service 账号**：保留到 P4，仅用于系统路由/回滚；P5 转为不可登录的 service principal。
- **共享契约**：现有 `LubanFeatureRpcInterface` 1.85.0、`LubanRpcInterface` 1.1.0 的方法签名不变；新增 auth IPC 契约并独立版本化。shared → editor → viewer → web 按依赖顺序重建（P0-02/P0-07）。
- **发布顺序**：Hub（token/PDP）→ shared（auth IPC）→ MS（OBO/PEP）→ WA（service token）→ web/viewer（session 绑定）→ 开启强制。每步必须双端同版本；不允许只升一侧。

### 6.4 数据迁移（全部加法）

1. `authz_versions` 或等价表：按 user/iTwin/iModel/group/share 初始化版本 1。
2. `access_control_denies`（或等价）：scope、principal、reason、expiresAt、createdBy。
3. `access_control_groups.roleIds`（或 group_roles 表）：nullable，默认空。
4. `share_links`（若批准）：tokenHash、target、permission、expiry、revocation、usage。
5. `audit_events`：append-only，字段见 5.4；后续 B7 加 hash chain/WORM。
6. `changesets`/`briefcases`/`named_versions` 增加 nullable `actorService`/`authSessionId`；不回填历史。
7. `obo_tokens`/`service_clients`：哈希、claims、状态、exp；索引 `jti`/`sid`。
8. `isSecured` 默认不变；不批量改现有 iModel。
9. 旧 `access_control_shares`：决定执行或删除；若删除，先导出/备份，再移除路由/UI（审计迁移）。
10. 旧索引：为 `(iTwinId,userId)`、`(iModelId,userId)`、`(shareId,expiresAt)` 增加解析索引。

**迁移回滚**：迁移脚本 additive；旧代码可忽略新表/列；回滚只关开关，不删数据。若必须 down migration，先确认没有写入新列。

### 6.5 回滚

- 每个阶段独立：Hub `AUTHZ_ENFORCE`、MS `ACL_MODE`/`IDENTITY_MODE`、WA `SERVICE_AUTH_MODE`。
- OBO 5m TTL，回滚后旧 token 很快自然过期；回滚前主动撤销新 token（`sid`/service client）。
- 缓存键 `authz:v2:*` 与旧 `authz:*` 分离；回滚时旧代码不读新键。
- 保留 service 账号凭据直到 P5；保留旧 API key 通道直到 P4，但只在 `AUTHZ_LEGACY_APIKEY_USER_PLANE=true` 时生效。
- 存储：签名 URL 回滚到旧 TTL；代理模式可切回 SAS；不得删除已上传对象。
- 审计：回滚不丢 audit；新表保留只读。

### 6.6 密钥与服务身份

- 新增 OBO/service token 存储密钥/签名密钥；支持双密钥轮换（`kid`/版本）。
- Service client secret 只存哈希；提供创建、轮换、禁用、scope 变更。
- 禁用服务账号的人类登录（或至少从 MS/WA 配置中移除邮箱/密码）；改用 client credentials/mTLS。
- API key 仍可作传输因子，但不得作为身份；轮换时双 key 并行窗口。
- 所有 token、secret、SAS 不得进入日志/错误体/公开文档。

---

## 7. 测试矩阵

> 负例必须在专用测试用户/iTwin/iModel 上运行，不向共享数据做破坏性测试。每个入口至少覆盖 401/403/正常三态；写入口额外覆盖只读、撤销、跨文档。

### 7.1 主体

| 代号 | 主体 |
|---|---|
| O | iTwin owner |
| A | iTwin Admin（含 `imodels_manage`） |
| E | iTwin Editor（含 `imodels_manage`） |
| V | iTwin Viewer（仅 webview） |
| IR | secured iModel 显式 Read |
| IM | secured iModel 显式 Manage |
| N | 已登录、非成员（同租户） |
| X | 另一 iTwin/租户的用户 |
| R | 撤销中（角色移除/logout/停用） |
| RO | 只读显式 grant |
| L | 有效 link guest |
| LX | 过期/撤销/超次 link |
| S | 有效 service token（正确 scope） |
| K | 仅 API key / 服务账号 |
| OA | iModel A 的 OBO，用于 iModel B |
| OX | 过期/错 audience/错 scope OBO |

### 7.2 Hub 数据面

| 入口 | O | A/E | V | IR | IM | N | X | R | S | K |
|---|---|---|---|---|---|---|---|---|---|---|
| `GET /imodels/:id` | A | A | A | A | A | D | D | D | D | D |
| `GET /imodels/:id/changesets` | A | A | A | A | A | D | D | D | D | D |
| `POST /imodels/:id/changesets` | A | A | D | D | A* | D | D | D | D | D |
| `POST /imodels/:id/briefcases` / `acquire` | A | A | D | D | A* | D | D | D | D | D |
| `GET /imodels/:id/briefcases` | A | A | A | A | A | D | D | D | D | D |
| `POST /imodels/:id/baselinefile/requeue` | A | A | D | D | D | D | D | D | A** | D |
| `GET/POST /imodels/:id/baselinefile` | A | A | A(read)/D(write) | A(read) | A(read)/A*(write) | D | D | D | A** | D |
| `/imodels/:id/locks*` | A | A | D(write)/A(read) | D(write)/A(read) | A | D | D | D | D | D |
| `/imodels/:id/namedversions*` | A | A | A(read)/D(write) | A(read) | A | D | D | D | D | D |
| `/imodels/:id/permissions` | A | A | A(read) | A(read) | A(read) | D | D | D | D | D |
| `/itwins/exports*` | A | A | A(read)/D(create?) | A(read) | A(read) | D | D | D | D | D |
| `/webhooks*` | A | A | A(read) | A(read) | A(read) | D | D | D | D | D |

`*` 首期 mutation 仍要求 Manage；显式 Write 在 B4 激活。
`**` 仅 recovery 使用 service token；用户触发的 retry 必须 OBO + `doc.manage`。
`V` 列按 `isSecured=false` 语义；`isSecured=true` 时无显式行的 Viewer 应为 D，只有 IR/IM 或 iTwin manage 通过。列表 `GET /imodels` 还需按可见性过滤 secured 文档。

### 7.3 MS 入口

| 入口 | O/A/E | V | IR | IM | N | X | R | S | K | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| `/ipc` 升级（有效 token/ticket） | A | A | A | A | A | A | D | D | D | 连接不等于文档权限 |
| `downloadBriefcase` 读 | A | A | A | A | D | D | D | D | D | `doc.read` |
| `downloadBriefcase` 写 | A | D | D | A* | D | D | D | D | D | briefcase.write |
| `openBriefcase` 已登记文件 | A | A | A | A | D | D | D | D | D | owner/registry |
| `openBriefcase` 未登记/越界路径 | D | D | D | D | D | D | D | D | D | 路径白名单 |
| FeatureOp 读（tree/sketch/bodies/variables/mass） | A | A | A | A | D | D | D | D | D | `doc.read` |
| `applyFeatureOp` 写 | A | D | D | A* | D | D | D | D | D | `doc.write` + session |
| `previewFeatureOp` | A | D | D | A* | D | D | D | D | D | 现有写租约语义 |
| PartStudio create/rename/delete | A | D | D | A* | D | D | D | D | D | owner session |
| `acquireWriteLease` | A | D | D | A* | D | D | D | D | D | 绑定 principal |
| direct edit（`EditTools.startCommand` + `solidModelingIpc`；basicManipulation 为工具内部） | A | D | D | A* | D | D | D | D | D | 命令启动 gate |
| `exportIModel` | A | A | A | A | D | D | D | D | D | 导出 audit |
| saved views/camera paths | A | A | A | A | D | D | D | D | D | 仅已登记路径 |
| tile / requestElementGraphics | A | A | A | A | D | D | D | D | D | `doc.read` |
| `GET progress` | A | A | A | A | D | D | D | D | D | 该 iModel |
| `POST retry` | A | D | D | D | D | D | D | A** | D | `doc.manage`（用户）/ service recovery（S） |
| `/api/webhook/events` 入站 | D | D | D | D | D | D | D | S | K? | 仅 WA service token |
| `/api/users/*` | A | A | A | A | A | A | D | D | D | 仅本人 |

### 7.4 WA / Storage / Tile

| 入口 | 有效用户 | 非成员 | 撤销 | Service | 匿名 | API key |
|---|---|---|---|---|---|---|
| `POST /webhook/events`（HMAC） | D | D | D | A（WA） | D | D |
| `POST /baseline/process` | D | D | D | A（job 绑定） | D | D |
| baseline 完成/失败回传 | D | D | D | A（job 绑定） | D | D |
| changeset 下载 SAS | A（TTL 内） | 签发时 D | 签发时 D | — | D | D |
| changeset 上传 SAS | A（写） | D | D | — | D | D |
| checkpoint SAS | A（读） | D | D | A（后台） | D | D |
| `/azurite/` 通用直通 | D | D | D | D | D | D |
| tile URL | A（签名/TTL） | D | D | A（后台生成） | D | D |

Link guest（L）走与 V 相同的读入口，但只对链接绑定的 iModel；LX 在所有入口 D；link Write 仅当 `link.permission=Write` 且目标 ACL 允许。`isSecured=true` 的文档默认不签发 link。

### 7.5 Token / 负例专项

| # | 用例 | 期望 |
|---|---|---|
| 1 | API key only → `/imodels/:id/changesets`（enforce） | 401/403，不得 200 |
| 2 | 服务账号 JWT（非成员）→ 用户数据面 | 403 |
| 3 | service token → 用户数据面 | 403 `service_scope_denied` |
| 4 | OBO-A → iModel B | 403 `imodel_mismatch` |
| 5 | OBO 过期/错 audience/错 scope | 401/403 |
| 6 | OBO 版本落后（角色已移除） | 401/409 `authz_stale`，刷新后仍 403 |
| 7 | 用户 logout 后旧 access token/OBO | 401 |
| 8 | 用户停用/锁定/软删后旧 token | 401 |
| 9 | body `userId` 冒充他人（普通 OBO） | 403 |
| 10 | 客户端 `sessionId` 冒用他人连接 | 403 |
| 11 | 只读用户写 FeatureOp/直改/push | 403 |
| 12 | 跨租户 iTwin/iModel path/body | 403 |
| 13 | `openBriefcase` 任意路径/`..` | 400/403 |
| 14 | progress/retry 非成员 | 403 |
| 15 | tile/SAS 匿名或 TTL 过期 | 401/403 |
| 16 | WA `/baseline/process` 无 token | 401 |
| 17 | 链接 share 过期/撤销/denyList/只读写 | 401/403 |
| 18 | group 移除后下一次写 | 403（≤5s 缓存） |
| 19 | share 撤销后下一次读 | 403（≤30s 缓存） |
| 20 | PDP/Redis 不可用 | 写 503；读无缓存则 503，不得放行 |
| 21 | 并发双连接 A/B：A 的 token 不用于 B 的 push | 各自 token；审计分属 |
| 22 | 直改绕过 `runCommand` | 拒绝或显式 system principal |
| 23 | 服务账号恢复 baseline（系统） | 200，audit actor=service |
| 24 | 用户 retry（有 manage） | 200，audit onBehalfOf=user |
| 25 | 导出无读权限 | 403，无文件产生 |
| 26 | 权限查询非 403 失败时前端 `usePermissions` | 必须 fail-closed（readonly/禁用），不得回退 editable；服务端仍拒绝 |
| 27 | HTTP RPC/tile 的 Authorization 形态 | 统一 `Bearer <jwt>`；裸 JWT/cookie/`?token=` 兼容路径不得绕过主体校验 |
| 28 | FeatureOp 内伪造 `userId`/`opId`/`baseChangeset`（未来信封） | 服务端以连接 principal 为准；伪造字段不得改变归因 |
| 29 | shared 包与 MS 的 interfaceVersion 不匹配 | 运行时拒绝（`contract_version_mismatch`），不得静默跑旧代码 |
| 30 | BFF 收到 service 凭据冒充用户 | 拒绝；BFF 只转发用户 principal，不转发服务身份为用户 |
| 31 | group 授予后读取 | 允许；组移除后下一次请求 403 |
| 32 | share denyList 命中显式 iModel grant 用户 | deny 优先，403 |
| 33 | link guest 写 FeatureOp/push | 403（View link）或按 Write link + 目标 ACL 判定 |
| 34 | link guest 访问链接之外的 iModel | 403 |

### 7.6 测试层与证据

| 层 | 范围 | 证据 |
|---|---|---|
| Unit | Hub AuthorizationService/token/cache；MS WriteLease/SessionRegistry/AuthClient；WA validator | 单测；失败路径；fake clock |
| Contract | Hub controllers（Supertest/Nest）每个 PEP 路由；shared auth IPC 类型 | 契约测试；版本/hash |
| Real-stack e2e | 两用户同文档（读写/撤销/重登）、Service bypass、跨租户、storage/tile、WA baseline | Playwright + 后端日志（无 token）+ audit 行 |
| Fault injection | Hub/Redis/PDP 宕机、token 过期、连接断开、进程重启 | fail-closed；恢复后可重新交换 |
| Perf | PDP p95、token exchange p95、并发双连接 | 预算见第 9 节 |

---

## 8. 文件级实现计划

> 路径均为仓内相对路径；私有仓只列模块/文件职责，不粘贴源码。

### 8.1 公共仓（contracts / client / editor / deploy）

| 文件 | 变更 | 测试 |
|---|---|---|
| `luban-cad/packages/shared/src/auth/IpcAuthTypes.ts`（新） | `SessionBootstrap`/`SessionRefresh`/`AuthDecision` DTO；不包含 token 日志字段 | 类型/契约测试 |
| `luban-cad/packages/shared/src/rpc/LubanAuthIpcInterface.ts`（新） | 新 IPC 接口：`beginSession(accessToken, clientInstanceId, iModelKey, sessionId)`、`refreshSession(accessToken)`、`endSession()`；独立 `interfaceVersion` 1.0.0 | 签名/版本测试 |
| `luban-cad/packages/shared/src/LubanIpcInterface.ts`、`lubanIpcChannel` | 保持 `downloadBriefcase` 签名；补充 owner/session 语义文档；新 auth 会话走独立 channel，不把 token 塞进 download 参数 | 契约测试 |
| `luban-cad/packages/shared/src/index.ts`、`package.json` | 导出新接口；shared 版本 bump；对齐 package 版本与 interfaceVersion；加运行时版本握手（X-11） | build/test/contract |
| `luban-cad/apps/web/src/clients/auth/LubanAuthorizationClient.ts` | 生产接入或删除；统一 `Authorization: Bearer` 形态 | frontend 单测 |
| `luban-cad/apps/web/src/modules/part-studio/hooks/usePermissions.ts` | 非 403 错误改为 fail-closed；与服务端 PDP 错误码对齐 | hook 测试 |
| `services/bff/src/auth.ts` | BFF PEP：用户 token 解析、principal 转发、移除 `?token=`、不升级 service 凭据 | BFF 单测/e2e |
| `luban-cad/packages/viewer/src/host/web-initializer.ts` | WS 改 ticket；startup 后 `beginSession`；token 刷新走 `refreshSession`；不再把 15m token 写 cookie 作为长期凭据 | viewer 单测 |
| `luban-cad/packages/viewer/src/connection/use-briefcase-connection.ts` | 确保 auth session 就绪后再 download/open；401/403 状态映射；不重试越权 | hook 单测 |
| `luban-cad/apps/web/src/clients/auth/AuthSession.ts` | 暴露 refresh 事件/回调；登出撤销 session；不把 token 写 URL | AuthSession 测试 |
| `luban-cad/apps/web/src/modules/part-studio/hooks/useEditorSession.ts` | sessionId 绑定服务端会话；不再传 `user`；连接/令牌刷新处理 | hook 测试 |
| `luban-cad/apps/web/src/modules/documents/internal/share.api.ts` | 增加/删除 link share API；错误码透传 | API 测试 |
| `luban-cad/apps/web/src/modules/documents/components/ShareDocumentDialog.tsx` | 有 link 才显示链接页签；无 link 明确不展示；deny/只读原因展示 | 组件测试 |
| `luban-cad/packages/editor/backend/src/EditCommand.ts` | `EditCommandAdmin` 注入 authorizer；`runCommand` gate；`callMethod` 保持 active command | editor 后端单测 |
| `luban-cad/packages/editor/backend/src/EditBuiltInCommand.ts` | 提交/保存点 audit；不改变标准 IPC 签名 | 真栈测试 |
| `itwinjs-core/core/backend/src/LocalhostIpcHost.ts` | ALS 连接上下文包装（最小 fork 改动） | 并发双连接测试；记录 `docs/ITWINJS_CORE_MODIFICATIONS.md` |
| `deploy/default.conf.template`、`luban-cad/apps/web/vite.config.ts` | `/azurite` 生产关闭或 auth_request；tile 路径鉴权；dev 代理注释 | 手工/脚本验证 |
| `luban-cad/apps/web/src/clients/imodels/ImodelsClient.ts` | 分享/权限 UI 与有效权限对齐；不显示未实现 link | 客户端测试 |

### 8.2 私有 Hub（`imodelhub-services/src/...`）

| 模块/文件 | 变更 |
|---|---|
| `auth/` | OBO/service token 签发、WS ticket、session 校验、撤销、JWKS/不透明存储、客户端注册 |
| `auth/strategies/`、`common/guards/` | OBO guard、service guard；JWT 策略加 session 状态；全局账号生命周期 |
| `common/authorization/` | 单一 resolver（iTwin + groups + shares + link + deny + version）；PDP 决策端点；缓存键/标签/失效；`SystemAgentOrResourceGuard` 改为 service-only |
| `access-control/` | group roleIds、deny 表、share 执行或删除、link share 表/兑换；审计事件 |
| `imodels/` | changesets/briefcases 归因、baseline/retry、checkpoint、locks、named versions 的 OBO/service 分流；`imodels.controller` 的列表可见性 |
| `itwins/itwin-exports.controller.ts` | 增加权限守卫与导出审计 |
| `imodels/operations/` | 操作状态入口的权限复核 |
| `common/storage/` | 5m 单 blob SAS、容器 SAS ≤15m、签发审计、代理/签名 URL 模式 |
| `database/migrations/` | `obo_tokens`、`service_clients`、`access_control_denies`、group roles、`share_links`、`audit_events`、actor 列、索引 |
| `webhooks/` | 复核 `WebhookAccessGuard` 的 iTwin 权限来源 |

### 8.3 私有 MS（`luban-backend/modeling-server/src/...`）

| 文件 | 变更 |
|---|---|
| `auth/ServiceAccountAuthClient.ts` | 保留为迁移适配器；新增 `OboTokenClient`、`ServiceTokenClient`、`SessionAwareAuthorizationClient` |
| `auth/PrincipalContext.ts`（新） | ALS、ConnectionRegistry、SessionRegistry、BriefcaseOwnershipRegistry、PDP client |
| `middleware/wsAuth.ts` | ticket/token 验证返回 principal；连接绑定；周期 session 复查；按 iModel 订阅；logout 关闭 |
| `middleware/rpcGuard.ts` | 绑定 principal；HTTP RPC 按调用 iModel 做 PDP |
| `ipc/LubanIpcHandler.ts` | downloadBriefcase 的读写判定、per-principal cache、owner 登记、OBO token |
| `ipc/AppFunctionIpcHandler.ts` | open/save/pull/push/close/undo/redo/toggle 的 owner + ACL；拒绝未登记路径 |
| `feature/FeatureRpcImpl.ts` | 从 principal 注入 session/user；读写 action；push 上下文；PartStudio 写 |
| `feature/FeatureService.ts` | `applyOp` 接受 principal/context；WriteLease 绑定；push 回调在 ALS 内；OpLog 上下文 |
| `feature/WriteLease.ts` | principal-aware lease；`holderUser`/`holderContext`；忽略客户端 user |
| `feature/OpLog.ts` | `payload.user` 真实用户；新增 `clientSessionId`/`actor` 可选键 |
| `feature/DirectEditGuard.ts` | overridden 标记加用户/连接；提交 audit |
| `rpc/LubanRpcImpl.ts` | export/import/saved views/conflicts 的 `doc.read` 与路径绑定 |
| `routes/retry.ts`、`main.ts` | retry/progress 的 PDP；OBO 调 Hub；`/ws` 订阅路由；`/rpc/metadata` 保持公开 |
| `hub/createIModelsClient.ts` | 用户路径移除 `X-API-Key`；按 ALS 选择 OBO；系统路径独立 client |
| `storage/HostRewritingAzureStorage.ts`、`tile/PublicUrlTileStorage.ts` | 签名 URL/TTL/主机改写保持；不向客户端泄账号 key |
| `config.ts` | 新开关/端点；secrets 无默认；启动校验 |
| `middleware/security.ts`、`csrf.ts` | 复核 cookie/ticket 形态；不记录 token；限流按用户 |

### 8.4 私有 WA（`luban-backend/webhook-agent/src/...`）

| 文件 | 变更 |
|---|---|
| `webhook-server.ts` | `/baseline/process` service token + job 绑定；debug GET 鉴权/关闭 |
| `hubAuthClient.ts` | client credentials service token；移除 admin 邮箱/密码 |
| `baseline-generator.ts` | ≤15m SAS；记录 jobId/requestedBy；完成/失败回传带 service token |
| `forwarder.ts` | service token 或明确 transport key；不冒充用户 |
| `config.ts` | 新开关；secrets 无默认 |

### 8.5 契约/发布顺序

0. 统一身份传输与版本门：BFF/MS 只接受 `Authorization: Bearer`；移除 `?token=`；shared/MS 运行时 interfaceVersion 握手；`LubanAuthorizationClient` 生产接入或删除；前端权限查询 fail-closed。
1. Hub token/PDP + migrations（先 shadow）。
2. shared 新 auth IPC + 版本 bump；editor/viewer/web 重建。
3. MS 连接 principal/OBO/PEP（先 shadow）。
4. WA service token + baseline 鉴权。
5. Hub 开启读/写强制；MS 开启 ACL；storage/tile 切换。
6. 清理死表/死路由/假 UI；轮换密钥；更新 `INTERFACE-FREEZE-MATRIX.md`、`EXCEPTIONS.md`、能力账本、文档索引。

**门禁**：每个切片需 AIRR；新增 token/ACL schema/auth IPC 需 ADR；接口冻结矩阵记录新契约版本；若保留 API key 过渡，登记例外与到期日。

---

## 9. 性能与残余风险

### 9.1 预算

| 项 | 预算 |
|---|---|
| Hub `/authz/decisions` p95（本地缓存命中） | ≤10ms |
| Hub `/authz/decisions` p95（回源解析） | ≤50ms |
| OBO 交换 p95 | ≤100ms；仅在打开/续期时 |
| MS 读操作额外 PDP 开销 | 缓存命中 ≤1ms；回源 ≤50ms |
| MS 写操作额外 PDP 开销 | 5s 缓存；每写最多一次回源 |
| WS 连接建立额外 | ticket + session 校验 ≤150ms |
| Storage SAS 签发 | ≤20ms；不阻塞下载 |

- 读路径不得每个 tile/RPC 都回源 Hub；tile 以签名 URL/短 cookie 覆盖，读决策 30s 缓存。
- 写路径按人类操作频率设计，5s 缓存足以抵御突发，同时限制撤销窗口。
- 所有 PDP 超时（建议 2s）必须 fail-closed；写路径返回 503，读路径无缓存则拒绝。

### 9.2 残余风险

| 风险 | 缓解 | 状态 |
|---|---|---|
| OBO 5m 内被窃取重放 | 单 iModel/scope、5m、`jti` 审计、TLS、不落盘 | 接受并登记 |
| MS 本地读缓存 30s 内撤权未生效 | 写 5s；读缓存到期；Hub 数据面仍拒绝 | 接受；B5 可缩短 |
| Storage SAS bearer 5m 内可重放 | 单 blob、只读、无 list、审计；严格档用代理 | 需 `EXCEPTIONS.md`（若采用带宽档） |
| 直改命令执行中途撤权 | 启动/保存点检查；下一次 push 被 Hub 拒绝 | 残余窗口 ≤命令时长 |
| ALS fork 改动的并发正确性 | 双连接并发测试；最小改动；记录台账 | 必须验证 |
| Service token 泄露 | 15m、scope allowlist、client 禁用、审计 | 接受 |
| 链接分享被滥用 | 过期/次数/域/密码/deny；只读默认 | B4 决策 |
| 旧数据归因不可追溯 | 历史行标 legacy；不伪造用户 | 永久记录事实 |
| 跨租户模型未定义 | G1 以 iTwin/account 为租户边界；B10 再做 RLS/tenantId | 待 B10 |

---

## 10. 未决问题

1. **OBO 格式**：G1 用不透明令牌 + Hub 本地校验，还是直接上 RS256/JWKS？前者撤销简单，后者跨服务无状态；建议 G1 不透明，B5 评估签名。
2. **OBO 续期**：每次用用户 access token 重新交换，还是给 MS 一个受限 refresh？本设计倾向前者（无新 refresh 面）。
3. **iTwin owner 与显式 deny**：owner 是否可在保留 deny 的情况下 break-glass？本设计默认“不可”，只能删 deny 并审计；需合规确认。
4. **iModel.createdBy 隐式 owner**：UI 现有“创建者全权限”假设与服务端 `checkIModelAccess` 不一致；承认还是移除？
5. **Write 等级激活**：首期是否保持“写=Manage”，B4 再开放 Write？UI 分享目前只授 Read/Manage；开放 Write 需要 UI/契约同步。
6. **iTwin shares**：执行 email/domain 分享，还是删除整表/路由/UI？G1 Gate 允许二选一，必须明确。
7. **Link share**：G1 是否需要？若需要，scope 是否支持 Write？secured 文档是否允许 link？
8. **Groups**：group roleIds 是数组还是 join 表？是否接 IMS 外部组/嵌套组？G1 是否只做展平一层？
9. **Tenant 定义**：当前无 `tenantId`；用 `iTwinAccountId` 还是新建 tenant 表？跨租户外部分享如何表达？
10. **Storage PEP 档位**：大 changeset/baseline 用签名 URL（带宽档）还是代理（严格档）？tile 是否强制代理？
11. **WS 传输**：一次性 ticket 是否兼容所有浏览器/代理？过渡期 cookie + 周期复查是否足够？
12. **Service 身份**：G1 是否完成 client credentials，还是保留 admin 服务账号到 P4？谁持有轮换职责？
13. **直接编辑覆盖**：是否存在绕过 `EditCommandAdmin.runCommand` 的 backend 路径（脚本/测试/未来 Agent）？需要白名单/禁用。
14. **审计保留与 PII**：audit 保留期、WORM、导出/删除请求；B7 的 hash chain 是否在 B2/B3 先落最小版？
15. **性能**：PDP 回源 p95/可用性预算需在真实栈测量；是否允许读路径在 PDP 不可用时使用 30s 缓存？
16. **旧库归因**：历史 changeset/briefcase 是否需要在 UI 标注“legacy service”，以及是否提供一次性迁移工具（默认不改写）。
17. **公共契约版本**：新增 auth IPC 是否只加接口不升 `LubanFeatureRpcInterface`（1.85.0）/`LubanRpcInterface`（1.1.0）？若行为变化需要双端最小版本门，如何表达？
18. **Token 日志红线**：现有 `?token=` fallback、错误体、代理日志的清除顺序；需要与 B8 网络收敛同批。
19. **前端权限查询失败语义**：`usePermissions` 非 403 回退 editable 是否立即改 fail-closed？离线/网关故障时的产品可用性如何提示？
20. **BFF 角色**：BFF 只做用户 token 终止与 principal 转发，还是也承担 PDP 缓存？如何防止 BFF 把 service 凭据当用户？
21. **Authorization 形态**：是否强制 `Bearer` 并删除裸 JWT/cookie/`?token=` 兼容？旧客户端/旧 MS 的升级窗口多长？
22. **运行时契约门**：是否采用 interfaceVersion handshake（X-11）还是继续 build-time pin？不匹配时 426/403 的客户端行为。
23. **FeatureOp 信封**：是否在 shared 增加 `opId/userId/baseChangeset`？若增加，`userId` 只能用于审计提示，服务端仍以 principal 为准；不能把客户端 userId 当身份。
24. **无生产调用方的入口**：export/pull/progress/retry 现在没有前端调用方；G1 是先加 PEP 还是删除死契约/端点？删除会改变能力账本。

---

## 11. 参考（仓内相对路径）

**公共仓**

- `docs/architecture/G1-EXECUTION-PLAN.md`
- `docs/architecture/AIRR-TEMPLATE.md`
- `docs/architecture/INTERFACE-FREEZE-MATRIX.md`
- `docs/architecture/EXCEPTIONS.md`
- `docs/architecture/VIEWER-IPC-LIFECYCLE.md`
- `docs/ITWINJS_CORE_MODIFICATIONS.md`
- `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（1.85.0）
- `luban-cad/packages/shared/src/rpc/LubanRpcInterface.ts`（1.1.0）
- `luban-cad/packages/shared/src/LubanIpcInterface.ts`
- `luban-cad/packages/viewer/src/host/web-initializer.ts`
- `luban-cad/packages/viewer/src/connection/use-briefcase-connection.ts`
- `luban-cad/apps/web/src/clients/auth/AuthSession.ts`
- `luban-cad/apps/web/src/clients/auth/LubanAuthorizationClient.ts`
- `luban-cad/apps/web/src/modules/part-studio/hooks/usePermissions.ts`
- `luban-cad/apps/web/src/modules/part-studio/hooks/useEditorSession.ts`
- `services/bff/src/auth.ts`
- `luban-cad/apps/web/src/modules/documents/components/ShareDocumentDialog.tsx`
- `luban-cad/packages/editor/backend/src/EditCommand.ts`
- `itwinjs-core/core/backend/src/LocalhostIpcHost.ts`
- `itwinjs-core/core/backend/src/BriefcaseManager.ts`（`TokenArg`/push 的全局 token 行为）
- `deploy/default.conf.template`

**私有 Hub（相对模块）**

- `imodelhub-services/src/auth/`、`auth/strategies/`、`common/guards/`
- `imodelhub-services/src/common/authorization/`
- `imodelhub-services/src/access-control/`
- `imodelhub-services/src/imodels/`、`itwins/`
- `imodelhub-services/src/common/storage/`
- `imodelhub-services/src/database/migrations/`

**私有 MS / WA（相对模块）**

- `luban-backend/modeling-server/src/auth/`、`middleware/`、`ipc/`、`feature/`、`rpc/`、`routes/`、`hub/`、`storage/`、`tile/`
- `luban-backend/webhook-agent/src/`
