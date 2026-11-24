# AIRR：G1 B6 P4a — 客户端数据面服务身份（MS/worker/WA 显式 opt-in）

- 标题：G1 B6 P4a — modeling-server / checkpoint-worker / webhook-agent 官方数据面调用按 P3 矩阵注入 `X-Service-Token`；legacy 仍为默认
- 日期：2026-11-24
- Owner：平台/安全（owner directive 2026-11-23）
- 关联：`G1-EXECUTION-PLAN.md` B6；`10-ARCHITECTURE-HARDENING-PLAN.md` B6；`ADR-G0-16-identity-attribution.md` 附录 A；`AIRR-2026-11-23-B6-SERVICE-IDENTITY-P0.md`（P0/P1/P2）；`AIRR-2026-11-23-B6-DATA-PLANE-P3.md`（Hub P3 权威端点/scope 矩阵）；`EXCEPTIONS.md` X-21；`INTERFACE-FREEZE-MATRIX.md`
- 影响仓：私有 `luban-backend/modeling-server`、`checkpoint-worker`、`webhook-agent`；公共仓本 AIRR、`AIRR-2026-11-23-B6-DATA-PLANE-P3.md` §4.2（评审后最小权限更正）、`EXCEPTIONS.md` X-21、`docs/README.md`、`G1-WAVE2-STATUS-2026-11-23.md`、`.env.example`；另有一份独立的 B3 入口审计，不属本切片。**未改** Hub（P3 已提交 `3f2dc5a`）、`luban-cad/**`、web/BFF、native/求解器/渲染。
- 是否需要 ADR：**是（附录延续）**。数据面服务身份的客户端传输模式、按路由注入与回滚开关属于跨仓安全契约，延续 `ADR-G0-16` 附录 A；本 AIRR 记录 P4a 实现切片与证据。

> 状态：**P4a 代码完成（三进程均未提交/未 push）；单元 + fake-Hub/测试传输层证据绿，另有隔离 Hub 跨仓 canary（真实 Hub 应用 + MS provider 签发票/路由 allow/deny）通过；未跑部署形态三进程 canary，未做真栈 native 下载。B6/X-21 仍 open，不勾选任何 G1 Gate 项。**
> P4b（owner/service actor、briefcase/锁/命名版本写）、TLS/KMS/token 撤销、共享 key/admin 登录退役、B10 租户仍全部未做。

---

## 0. 结论摘要

1. **legacy 仍是默认且逐字保留**：三个进程新增独立数据面模式开关（默认 `legacy`）。未显式 opt-in 时，官方 IModelsClient 继续使用服务账号 JWT + `X-API-Key`，version resolver 继续用同一对头，WA baseline 调用继续用服务账号 JWT + `X-API-Key`；没有任何 service token 被获取或发送。
2. **只迁 P3 矩阵内路由**：MS/worker 的官方客户端 transport 按 `(method, URL)` 精确分类，只对 Hub P3 已启用、且本服务被 pin 的路由附加 `X-Service-Token`；legacy-only 路由（briefcase create/acquire/release、锁写、extended-data、命名版本写、owner/user 路由、baseline failed/requeue/admin）永不附加。
3. **官方接缝取证**：vendored `@itwin/imodels-client-management@6.2.2` 的 `IModelsClientOptions.headers` 是同步 `HeaderFactories`（`() => string | undefined`），对全部操作生效且无法按 URL 区分；`restClient` 是官方公开的传输扩展点（`RestClient` 接口）。实现用官方 `restClient` 装饰器包住官方 `AxiosRestClient`（默认 3 次/300ms/因子 3 重试不变），每请求 await 缓存/刷新后的 token 并按矩阵注入。**未 fork/patch 库、未另写 REST 客户端、未手写签名。**
4. **复用同一身份**：MS/worker 复用 B6 P2/P1 的 `HubServiceTokenProvider`（同一 client-credentials 端点、内存缓存至 `exp-skew`、并发合并、401/403/404 不重试、网络/5xx/429 有界重试、不记录 token/secret）；WA 新增同协议最小 provider。三进程使用各自已注册的 Hub service client（`modeling-server` / `checkpoint-worker` / `webhook-agent`），不是第二套身份系统。
5. **scope 配对（最小权限）**：MS 只要求/注入 8 个非 baseline scope（changesets/briefcases/checkpoints read+write、locks read、namedversions read）；baseline 仅 webhook-agent pinned，MS 不申请。worker 只要求/注入 3 个只读 scope；WA 只要求/注入 `data.baseline.read/write`。缺任一 scope 时 provider 在首次签发即拒绝（fail closed）。
6. **无回落**：service-token 模式下 token 获取失败则请求不发出；数据面 401/403 清除缓存并原样失败，**绝不**改发共享 key/JWT。legacy 路由上的 401 不会触发任何 service-token 逻辑。
7. **归属安全**：没有伪造用户；briefcase create/acquire/release、锁写、extended-data/groups、named-version 写等需要 `req.user` 的路径既未接 service token，也未改 Hub 授权。它们是 P4b 前置。
8. **未做**：真实 Hub 部署 canary、native checkpoint 下载、P4b owner/service actor、TLS/KMS/token 撤销、RS256/JWKS、共享 key/admin 登录退役、审计表扩展、B10。**不得宣称 B6 完成或 X-21 关闭。**

---

## 1. 目标、验收与非目标

### 1.1 本切片目标

1. 从三个后台服务的真实调用面盘点官方数据面调用，标出 P3-enabled / owner/user / legacy-only。
2. 在显式 opt-in 下，把 P3 已启用的数据面调用改为携带 Hub 签名 service token。
3. legacy 保持默认且行为不变；service-token 缺失配置启动即失败，运行期失败关闭且不回落。
4. 不改变用户/服务账号 JWT、`X-API-Key`、公共 DTO 或 Hub 授权策略。
5. 用单元 + fake-Hub/测试传输层证明注入面、缓存/刷新/401、日志脱敏与路由分类。

### 1.2 可观察验收

| # | 验收 | 证据 |
|---|---|---|
| A1 | 真实调用面清单完整，P3/legacy/owner 标注明确 | 本 AIRR §3；源码路径 |
| A2 | 官方客户端只经公开接缝注入，不 fork/不并行 REST | §4；`createIModelsClient.ts`、`dataPlaneRestClient.ts`；官方类型取证 |
| A3 | legacy 默认不获取/不发送 service token | MS/worker/WA 单测；既有测试保持绿 |
| A4 | opt-in 只对 P3 + 本服务 pin 的路由注入 | 三进程 route classifier 单测 + 官方操作驱动测试 |
| A5 | token 缓存/刷新/并发/401 清除/有界重试/无回落 | MS/worker/WA provider 与传输测试 |
| A6 | 缺失 client id/secret/非法模式启动失败 | 三进程 config 测试 |
| A7 | 日志/错误不含 token 或 secret | provider/log 单测 |
| A8 | owner/user 路由不被 tokenize | classifier legacy 用例 + MS 官方 briefcase acquire/lock write 测试 |
| A9 | 三进程 test/typecheck/build 绿；新增/改动文件 lint 无新增错误 | §7 |

### 1.3 明确非目标

- 不迁移 briefcase create/acquire/release、锁写、extended-data/groups、named-version 写、baseline failed/requeue、`/imodels/admin/*`、iModel list/detail。
- 不启用 service actor / owner 归属；不借用人类 admin。
- 不做 TLS/mTLS、KMS、token 撤销列表、RS256/JWKS、审计表扩展、B10。
- 不删除共享 `AGENT_API_KEY`、人类 admin 服务登录或 legacy 分支。
- 不跑 live DB/stack/migration；不勾 G1 Gate；不宣称 B6/X-21 完成。

---

## 2. 复用矩阵

| 能力 | 现有实现 | P4a 决策 | 理由 |
|---|---|---|---|
| Hub 签发/校验 service JWT | B6 P0 `/auth/token/service` + `DataPlaneAuthGuard` | **原样复用** | 不新增 IdP/签名 |
| MS/worker token provider | B6 P2 `modeling-server/src/hub/serviceToken.ts`、P1 `checkpoint-worker/src/hub/serviceToken.ts` | **原样复用** | 同一缓存/刷新/重试/脱敏语义 |
| WA token provider | 无 | **新增同协议最小实现** | WA 无既有 provider；不引入第二身份系统 |
| 官方客户端 header 接缝 | `IModelsClientOptions.headers: HeaderFactories` | **只用于 `X-API-Key`** | 同步工厂、全操作生效，无法 await 刷新或按路由区分 |
| 官方客户端传输接缝 | `IModelsClientOptions.restClient: RestClient` | **装饰官方 `AxiosRestClient`** | 官方公开扩展点；每请求可 await token + 按 URL 分类 |
| 内部调用 service token | `HubInternalAuth`（MS）、`JsonHttpClient`（worker） | **保持独立** | 数据面与内部控制面 scope/传输不同；同一服务身份 |
| Hub P3 scope/pin | `DataPlaneAuthGuard` + `@RequireServiceAuth` | **客户端镜像** | 不新增/放宽 Hub 策略 |

**新增直接依赖**：MS/worker 的 `package.json` 增加 `@itwin/imodels-client-management@^6.2.2`（原本已是 authoring 的传递依赖，版本未变），用于实现官方 `RestClient` 装饰器；lockfile 仅新增该直接依赖条目。

---

## 3. 调用面清单与迁移状态

图例：P3=Hub P3 已启用并接受本服务 token；Owner/User=需要人类/属主身份，保持 legacy；Legacy=其他 legacy 路由。

### 3.1 modeling-server

| 调用点 | 路由（方法） | 状态 | 说明 |
|---|---|---|---|
| `createIModelsClient` 官方 client（`BackendIModelsAccess` 驱动） | `GET /imodels/:id/changesets`、`/:idOrIndex`、`/index/:index`、`/:id/file`、`/:id/download` | **P3** `data.changesets.read` | transport 装饰器按 URL 注入 |
| 同上 | `POST /imodels/:id/changesets`、`POST /:id/file`、`POST/PATCH /:id/complete` | **P3** `data.changesets.write` | push 路径；Hub 行归因 `service:<name>` |
| 同上 | `GET/POST /imodels/:id/changesets/:id/extendeddata`、`POST /:id/locks/release` | Legacy | handler 读 `req.user`，不注入 |
| 同上 | `GET /imodels/:id/briefcases`、`/:briefcaseId`、`/by-id/:id`、`/:briefcaseId/sync` | **P3** `data.briefcases.read` | |
| 同上 | `DELETE /imodels/:id/briefcases/:briefcaseId` | **P3** `data.briefcases.write` | 官方 client 删除路径；当前 MS 主流程未调用 |
| 同上 | `POST /imodels/:id/briefcases`（create）、`/acquire`、`/:id/release`、`GET /briefcases/user/:userId` | Owner/User | **P4b**；不注入 |
| 同上 | `GET /imodels/:id/briefcases/checkpoint`、`/briefcases/:id/checkpoint`、`/changesets/index/:index/checkpoint`、`/changesets/:idOrIndex/checkpoint`、`/namedversions/:id/checkpoint` | **P3** `data.checkpoints.read` | |
| 同上 | `PUT /imodels/:id/namedversions/:id/checkpoint` | **P3** `data.checkpoints.write` | |
| 同上 | `GET /imodels/:id/locks`、`/released-locks`、`/:lockId`、`/briefcase/:id`、`/object/:id`、`/object/:id/active`、`/batch` | **P3** `data.locks.read` | |
| 同上 | `PATCH/POST /imodels/:id/locks`、`/release-chunk`、`/:id/release`、`/briefcase/:id/release-all`、`/batch` | Owner/User | 锁写需要 briefcase 属主；**P4b** |
| 同上 | `GET /imodels/:id/namedversions`、`/:id`、`/name/:name` | **P3** `data.namedversions.read` | |
| 同上 | `POST/PATCH/DELETE /imodels/:id/namedversions...` | Owner/User | **P4b** |
| 同上 | iModels list/detail、users、permissions、thumbnails | Legacy | 需要用户可见性/ACL |
| `version/hubVersionResolver.ts`（现有 fetch） | `GET /changesets`、`/changesets/:idOrIndex`、`/changesets/:idOrIndex/checkpoint`、`/namedversions/:id`、`/namedversions/:id/checkpoint` | **P3** read | 每个调用带显式 scope；401 清缓存 |
| `routes/retry.ts` | `POST /imodels/:id/baselinefile/requeue` | Legacy | AgentApiKeyGuard；**未迁移** |
| `createVersionOpenService` | 组合根 | — | 传入同一进程数据面 auth |

MS 的 required/injection 集合（`MODELING_SERVER_DATA_PLANE_SCOPES`，8 个）：changesets read/write、briefcases read/write、checkpoints read/write、locks read、namedversions read。`data.baseline.*` 仅 webhook-agent pinned，MS **不申请也不注入**（最小权限；provider 要求 8 个，缺任一即失败关闭）。

### 3.2 checkpoint-worker

| 调用点 | 路由 | 状态 | 说明 |
|---|---|---|---|
| `native/runtime.ts` 官方 IModelsClient + `BriefcaseManager.downloadBriefcase({briefcaseId:0})` | changeset GET、checkpoint GET（`queryV2Checkpoint` current-or-preceding） | **P3** read | 只读；不 acquire briefcase |
| `hub/client.ts#getChangesetByIndex` | `GET /imodels/:id/changesets/index/:index` | **P3** `data.changesets.read` | 现有 fetch 增加 `dataPlaneScope` |
| `hub/http.ts` 内部 agent | claim/heartbeat/complete/failed/storage-token/chain | 既有 P0/P1 | 已是 `X-Service-Token`/legacy 双模；本切片不改 |
| 官方 client 的其他操作（release/写） | — | — | worker 不调用；supported scopes 只有 3 个 read |

注入集合：`data.changesets.read`、`data.briefcases.read`、`data.checkpoints.read`（read-only，匹配 Hub pin）。

### 3.3 webhook-agent

| 调用点 | 路由 | 状态 | 说明 |
|---|---|---|---|
| `_getBaselineFileState` | `GET /imodels/:id/baselinefile` | **P3** `data.baseline.read` | 新增 `X-Service-Token` |
| `_confirmBaselineUpload` | `POST /imodels/:id/baselinefile` | **P3** `data.baseline.write` | 新增 `X-Service-Token` |
| — | `POST /imodels/:id/baselinefile/upload` | **P3**（Hub 已启用） | **WA 当前无调用点**；若未来接入，auth 已支持 write scope |
| `_notifyFailure` | `POST /imodels/:id/baselinefile/failed` | Legacy | AgentApiKeyGuard；不注入，不调用 provider |
| 恢复检查 | `/imodels/admin/uninitialized` | Legacy | ApiKeyGuard；不变 |
| `hubAuthClient` | `POST /auth/email/login` | 非数据面 | 人类 admin 服务登录；本切片不退役 |

WA 继续发送既有 `authorization` + `X-API-Key`；Hub 在 `X-Service-Token` 存在时忽略两者。WA 注入集合仅 `data.baseline.read/write`。

---

## 4. 官方客户端接缝取证

- 取证对象：`luban-backend/modeling-server/node_modules/.pnpm/@itwin+imodels-client-management@6.2.2/.../lib/cjs/`（与 `@itwin/imodels-client-authoring@6.2.2` 同源）。
- `IModelsClientOptions.headers?: HeaderFactories`；`HeaderFactories = { [name]: (() => string | undefined) | string }`。工厂同步、无请求上下文、对每个操作生效。
- `IModelsClientOptions.restClient?: RestClient`；`RestClient` 是官方公开接口（`sendGet/Post/Put/Patch/DeleteRequest`）。默认 `AxiosRestClient` 用官方重试策略。
- **决策**：
  - `headers` 仅继续注入 `X-API-Key`（既有 Sync F1 行为不动）。
  - `restClient` 用 `DataPlaneRestClient` 装饰官方 `AxiosRestClient`：先 `classifyDataPlaneRoute(method, url)`，仅当 scope 属于本进程 supported 且 mode=`service-token` 时 `await provider.getToken()` 并加入 `X-Service-Token`；其余请求原样委托。401/403 清除缓存并原样抛出。
  - 默认重试策略显式复制为 3 次/300ms/因子 3（与 `IModelsClient.fillManagementClientConfiguration` 一致）。
- **未使用**：fork/patch `@itwin/imodels-client-*`、自写 Axios/HTTP 数据面客户端、手写 JWT 或签名。MS 既有 `hubVersionResolver` 是既有 fetch，仅加头，不新建客户端。
- 变体风险：若 Hub 返回的 `complete`/download link 路径不在分类器内，该请求保持 legacy（不带 token）；不会误发到 legacy 路由。

---

## 5. 配置与失败关闭

### 5.1 模式开关（默认 legacy）

| 进程 | 环境变量 | 值 | 默认 |
|---|---|---|---|
| modeling-server | `IMODELHUB_DATA_PLANE_AUTH_MODE` | `legacy` \| `service-token` | `legacy` |
| checkpoint-worker | `CHECKPOINT_WORKER_HUB_DATA_PLANE_AUTH_MODE` | `legacy` \| `service-token` | `legacy` |
| webhook-agent | `WEBHOOK_AGENT_DATA_PLANE_AUTH_MODE` | `legacy` \| `service-token` | `legacy` |

数据面模式与 MS/worker 的内部控制面模式（`IMODELHUB_AUTH_MODE` / `CHECKPOINT_WORKER_HUB_AUTH_MODE`）**相互独立**，但共用同一 service client 凭据。允许“内部 legacy + 数据面 service-token”的分阶段组合；任一模式为 service-token 时都必须提供 client id/secret。

### 5.2 凭据（仅环境/密钥库；不落盘、不打印）

- MS：复用 `IMODELHUB_SERVICE_CLIENT_ID`（缺省回退 `AUTH_OBO_SERVICE_NAME` → `modeling-server`）、`IMODELHUB_SERVICE_CLIENT_SECRET`、`IMODELHUB_SERVICE_TOKEN_URL`、`..._AUDIENCE`、`..._REFRESH_SKEW_SECONDS`（0–300，默认 60）、`..._TIMEOUT_MS`、`..._RETRIES`。
- worker：复用 `CHECKPOINT_WORKER_HUB_SERVICE_CLIENT_ID`、`..._SECRET`、`..._SERVICE_TOKEN_URL/AUDIENCE/REFRESH_SKEW_SECONDS/TIMEOUT_MS/RETRIES`。
- WA：新增 `WEBHOOK_AGENT_SERVICE_CLIENT_ID`（默认 `webhook-agent`，必须匹配 Hub `WEBHOOK_AGENT_SERVICE_NAME`）、`WEBHOOK_AGENT_SERVICE_CLIENT_SECRET`、`WEBHOOK_AGENT_SERVICE_TOKEN_URL/AUDIENCE/REFRESH_SKEW_SECONDS/TIMEOUT_MS/RETRIES`；与 MS 变量名分离，避免同一 root `.env` 身份冲突。
- 启动失败规则：
  - mode=`service-token` 但缺 secret → 配置校验失败（MS/WA）或 `loadWorkerConfig` 失败（worker）。
  - 出现 service client 物料但未显式选择 service-token → 配置校验失败（不静默忽略）。
  - 非法模式值/非法服务名/越界 lifecycle → 启动失败。
  - MS 在 `initializeBackend()` 构造进程级 auth；worker/WA 在 main 依 config 构造；均发生在开始服务前。

### 5.3 scope 配对与失败关闭

| 进程 | token 必须包含的 scopes | 实际注入的 scopes |
|---|---|---|
| MS | 8 个非 baseline scope（changesets/briefcases/checkpoints read+write、locks read、namedversions read） | 同左；不申请 `data.baseline.*`（仅 WA pinned） |
| worker | `data.changesets.read`、`data.briefcases.read`、`data.checkpoints.read` | 同左 |
| WA | `data.baseline.read`、`data.baseline.write` | 同左 |

- Provider 在签发结果中校验 `typ=service`/`ver=1`/`sub=service:<name>`/aud/exp/必需 scopes；缺失即拒绝 token，首次调用失败，不会降级到“少发某个头”。
- 运行期 401/403：清除对应缓存 token，请求失败；**没有**第二次请求改发 legacy 头。
- 404（token 端点）：不重试；网络/429/5xx：有界重试。
- `X-API-Key`/`Authorization`/`X-Service-Name` 在 P3 请求上按原样保留；Hub 在 service token 存在时以其为权威，不构成冲突。

---

## 6. 回滚

1. **客户端回滚（推荐首选）**：将对应进程的数据面模式改回 `legacy` 并重启。无需 Hub 变更；官方 client/version resolver 立即恢复既有两个头，不再获取 service token。
2. **Hub 侧回滚**：`AUTH_SERVICE_CLIENTS_ENABLED=off` 会使所有 service token 失效。若客户端仍为 service-token 模式，请求会 401 且**不会**回落；因此应先/同批把客户端切回 legacy。
3. 禁用或轮换 service client：下一请求 401（token TTL 300–900s 自然过期）；无全局撤销列表。
4. 代码回滚：三进程均为独立工作树改动，无 schema/migration；回退代码即可。Hub 不需要回退。
5. 不要用“删除环境变量但不改 mode”回滚：缺 secret 会启动失败（有意 fail closed）。

---

## 7. 测试与证据

### 7.1 新增/更新测试

**modeling-server**
- `src/hub/dataPlaneRoutes.test.ts`：P3 正例矩阵（changesets/briefcases/checkpoints/locks/namedversions/baseline）；legacy 排除（briefcase create/acquire/release、user list、锁写、extended-data、named-version 写、baseline failed/requeue、iModels list/detail/admin）；MS 恰好 8 个非 baseline required/injection scope，不申请 `data.baseline.*`。
- `src/hub/dataPlaneAuth.test.ts`：legacy 不取 token；service-token 只为 supported P3 scope 注入；undefined/unsupported 不注入；签发失败上抛；invalidate 委托；缺 provider/非法服务名拒绝；`createDataPlaneAuth` 缺 secret 失败；summary/startup log 不含 secret。
- `src/hub/dataPlaneRestClient.test.ts`：P3 GET/DELETE 注入；legacy POST/PATCH 不取不注入；worker-like profile 不注入写路由；签发失败不调用 transport；401/403 清除并单次传播（无 legacy 重试）；500 不清除；`httpStatusOfError` 形状；相对 Hub URL 注入；**跨 origin 的 P3 形状 URL 不注入**。
- `src/hub/createIModelsClient.test.ts`：官方 SDK 驱动 P3 changeset GET 注入 token 且保留 JWT/API key；briefcase acquire + lock update（legacy）不取不注入；legacy 默认全部无 token。
- `src/version/hubVersionResolver.test.ts`：P3 read 注入；签发失败零请求；401 清缓存 + 单次失败；既有 legacy 头断言保持。
- `src/config.test.ts`：默认 legacy；DP service-token 缺 secret 失败；物料未选 mode 失败；DP-only 组合成功；非法模式/名称失败。

**checkpoint-worker**
- `src/hub/dataPlaneRoutes.test.ts`、`dataPlaneAuth.test.ts`、`dataPlaneRestClient.test.ts`：worker 只读 profile；写/legacy 不注入；缓存/失败语义。
- `src/hub/http.test.ts`：`dataPlaneScope` + legacy auth 不发 token；service-token 只发对应 P3 GET；401/403 清 data-plane 缓存且不回落；签发失败零请求；内部 agent 路径与既有测试不变。
- `src/hub/client.test.ts`：`getChangesetByIndex` 携带 `data.changesets.read` 分类。
- `src/config.test.ts`：默认 legacy；DP-only 组合；缺 secret；非法模式；describe 不含 secret。

**webhook-agent**
- `src/hubServiceToken.test.ts`：签发/缓存至 skew/并发合并/401/403/404 不重试/5xx 有界重试/畸形 token（sub/scope/aud/exp）/日志与网络错误不含 secret/token。
- `src/dataPlaneAuth.test.ts`：legacy 不发；service-token 发；失败上抛；缺 provider/非法名拒绝；缺 secret 启动失败；summary 不含 secret。
- `src/baseline-generator.dataPlane.test.ts`：baselinefile POST/GET 注入并保留旧头；legacy 不发；401 清 token 且单次失败；签发失败零请求；`failed` 永不调用 provider。
- `src/config.test.ts`：默认 legacy；缺 secret/物料未选 mode/非法名/非法模式失败。

### 7.2 执行结果（2026-11-24，本机工作树；无 live DB/stack）

```text
# modeling-server
npx tsc --noEmit -p tsconfig.json      → exit 0
corepack pnpm@10 run build             → exit 0
npx vitest run                         → 158 files / 1622 passed + 1 expected fail + 8 skipped (1631)
# checkpoint-worker
corepack pnpm@10 run typecheck         → exit 0
corepack pnpm@10 run build             → exit 0
npx vitest run                         → 17 files / 240 passed
corepack pnpm@10 run lint              → exit 0 (0 errors)
# webhook-agent
npx tsc --noEmit -p tsconfig.json      → exit 0
corepack pnpm@10 run build             → exit 0
npx vitest run                         → 15 files / 98 passed
```

Lint 说明（如实）：
- worker 全量 lint 0 错误。
- MS/WA 全量 lint 存在**存量基线**错误（例如既有 `logger.ts`/`config.ts` 的 naming-convention、deprecated zod、`no-console`；与本切片无关）。本切片新增文件与 MS 改动文件单独执行 ESLint 均 0 错误；MS `config.ts` 仅余既有 7 条 deprecated/console 错误（未新增行）；MS `src/main.ts` 单独 lint 0 错误；WA `src/main.ts` 仅余既有 `express`/`WebhookEvent` 未使用与 `no-floating-promises` 基线（非本切片行），WA 其余改动/新增文件 0 错误。
- 未运行部署形态三进程 canary、native checkpoint 下载或任何 live DB 迁移。

**隔离 Hub 跨仓 canary（2026-11-24，`tests-p4`）**：

在独立 compose 项目（Hub 测试栈 + 临时 host 端口 4400，独立 Postgres/Azurite/Redis；
`AUTH_SERVICE_CLIENTS_ENABLED=shadow`）中 provision `modeling-server` service client
（8 个非 baseline scope），用 modeling-server 的真实 `HubServiceTokenProvider` +
`HubDataPlaneAuth` 对真实 Hub 应用执行：

```text
token_attached=true
changesets_read_status=404          # P3 read 通过，iModel 不存在→domain 404
namedversions_read_status=404       # namedversions.read 通过
baseline_wrong_service_status=401   # baseline 仅 webhook-agent pinned，MS token 被拒
legacy_invalid_status=401           # 无 service token 的无效 JWT/共享 key 不通过
Hub logs: secret_hits=0, x-service-token header hits=0
```

用后 compose `down -v` 并删除项目镜像；live DB/stack 未触碰。这是**真实 Hub 应用 + 真实
provider 的隔离 canary**，不是部署形态三进程/native 下载证据，也不证明 Hub 生产路由注册顺序、
TLS、限流或日志平台。

**评审加固（2026-11-24，评审后重跑）**：

1. **最小权限**：MS 的 required/injection scope 从“全部 10 个”收紧为 8 个非 baseline scope；
   provider 不再要求 `data.baseline.*`（仅 WA pinned），AIRR P3 §4.2、本 AIRR 与 `.env.example` 同步更正。
2. **凭据不跨 origin**：MS/worker 的官方 `restClient` 装饰器在注入前校验 URL：相对 URL 或与配置
   Hub origin 相同才注入；指向其他 origin 的 P3 形状 URL（存储/SAS/恶意链接）**永不**收到
   `X-Service-Token`。新增跨 origin 单测（MS/worker）。
3. **启动摘要脱敏**：WA/worker 的 `describeDataPlaneAuth` token URL 只输出 origin+path，
   不含 userinfo/query/fragment；MS 原有同一脱敏保持不变。
4. 重跑：MS `158 files / 1622 passed + 1 expected fail + 8 skipped`；worker `17 files / 240 passed`；
   WA `15 files / 98 passed`；三包 tsc/build 绿；worker 全量 lint 0，MS/WA 新文件 lint 0（存量基线不变）。

### 7.3 证据边界

- 单测/传输层证据使用 fake fetch/测试 transport；跨仓 canary 使用隔离 Hub 测试栈的真实应用，
  但不是部署形态 Hub、不是 MS/WA/worker 全进程栈。
- 未验证真实 Hub 的路由注册顺序（尤其 namedversions/checkpoints 同名 checkpoint 路径）、真实代理头、TLS、限流、日志平台。
- 未证明 native `BriefcaseManager.downloadBriefcase` 在真实 Hub 下全链路成功；只证明其 HTTP 参数面在测试 transport 上正确分类/注入。
- 不据此关闭 X-21 或勾选 G1 Gate。

---

## 8. 残余风险与 P4b/后续

1. **P4b owner/service actor**：briefcase create/acquire/release、锁写、extended-data/groups、named-version 写仍 legacy；需要 service actor 或 service-owned briefcase 语义，不能借用人类 admin。
2. **剩余路由**：baseline failed/requeue、`/imodels/admin/*`、iModel list/detail 仍未接；WA upload 路由无当前调用点。
3. **部署形态三进程 canary**：本切片已有隔离 Hub + MS provider 的跨仓 canary；仍需在隔离/暂存环境启用 Hub `shadow`、provision 三客户端、分别切换三进程模式，验证真实允许/拒绝矩阵、日志无 token/secret、共享 key 在 `deny` 下不再旁路，以及 native 下载全链路。
4. **传输安全**：TLS/mTLS、密钥库、KMS、token 撤销/审计表、RS256/JWKS 未做。
5. **退役**：共享 `AGENT_API_KEY`、人类 admin 登录、legacy 分支未删除；MS/worker 在 service-token 模式下仍保留 `X-API-Key`（P3 上被 Hub 忽略；legacy 路由仍需要）。
6. **双 provider 缓存**：MS/worker 的内部与数据面 provider 各有一份缓存（同 client、不同 required scopes）；token 签发最多每 5–10 分钟多一次请求，不是身份分裂。若需合并，应统一 scope 策略后再做。
7. **路由分类漂移**：官方 SDK 升级可能新增/改路径；classifier 未识别的新路径会保持 legacy（安全但不完整）。升级 SDK 时必须复核分类器与测试。
8. **MS provisioning 最小 scope**：MS token 必须含 8 个非 baseline data scope；不申请 `data.baseline.*`（仅 WA pinned）。Hub 运维若漏授任一所需 scope，MS 首次签发失败（fail closed），需按 AIRR P3 §4.2 的 MS 列 provisioning。
9. **未提交**：本次改动留在三个工作树，未 commit/push/publish；评审通过后由 owner 按发布流程处理。

---

## 9. 明确未完成（stop-and-report）

- 若 Hub 侧出现路由未启用、scope 配对错误或 service pin 不匹配，应停止客户端迁移并报告，不得放宽 Hub 授权或增加并行策略。本切片实现期间未发现需偏离 P3 矩阵的 Hub 缺口；namedversions/checkpoints 同名 GET 路径的 scope 由 Hub 注册顺序决定，MS 同时持有两个 scope，规避了该歧义（worker 不调用该路径）。
- 本文不声称任何 G1 Gate 项通过；B6/X-21 保持 open。
