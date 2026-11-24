# AIRR：G1 B3.1a — PEP 入口覆盖清单与路由元数据门禁（仅分类）

- 标题：G1 B3.1a — modeling-server 覆盖清单 v2、Hub 内容路由元数据门禁、BFF/storage/tile/WA 分类
- 日期：2026-11-24
- Owner：平台/安全
- 关联：`B3-ENTRY-PEP-AUDIT-2026-11-24.md`（入口矩阵与 B3.1a–g 顺序）；
  `AIRR-2026-11-23-B2-OBO-B3-ACL.md` §4.1/§4.2（状态语义与启动断言）；
  `IDENTITY-ACL-DESIGN.md`；`EXCEPTIONS.md` X-27；`G1-EXECUTION-PLAN.md` WS-B
- 影响仓：私有 `luban-backend/modeling-server`（`pepCoverage.ts`、启动日志、catalog 测试）；
  私有 `imodelhub-services`（仅 `test/unit/**` 路由元数据门禁与例外目录，不改 guard/controller）；
  公共仓本 AIRR、BFF manifest/测试、`docs/README.md`、`G1-WAVE2-STATUS-2026-11-23.md`、
  `EXCEPTIONS.md` X-27
- 是否需要 ADR：**否**。本切片不新增接口、RPC、schema、迁移、native、渲染管线或求解器契约；
  只把既有入口静态分类并用测试钉住。后续强制切片仍需按 B3.1b–g 各自 AIRR/签字。

> 状态：**覆盖/分类完成（代码与测试已本地提交，未 push）；未启用任何强制、未新增拒绝路径、
> 未改 Hub guard/controller、未跑真栈/live DB。B3 未完成，X-21 仍 open，不勾选任何 G1 Gate 项。**

---

## 0. 结论摘要

1. **只做分类，不做强制**：MS `pepCoverage` 从 v1 扩展到 v2，覆盖审计列出的 30 个入口；
   `covered-shadow` 仍只有 `downloadBriefcase` 与 `openBriefcase` 两项；没有 `covered-enforce`
   或 `fail-closed` 声明。所有既有的 `p0-not-covered` 语义保持不变。
2. **状态集闭合**：`covered-shadow | covered-enforce | fail-closed | registered-exception |
   p0-not-covered`。`registered-exception` 必须携带 `id/owner/expires`，否则启动断言与测试失败。
3. **真实名称校验**：MS catalog 测试从源码派生 `LubanIpcHandler` / `AppFunctionIpcHandler` /
   `LubanFeatureRpcImpl` / `LubanRpcImpl` 的 public 方法，要求每个 document 方法被 manifest
   binding 覆盖或列入显式 non-document 名单；新增 public 方法未分类即失败。HTTP binding 与
   `main.ts` / `routes/retry.ts` / `middleware/webhookEvents.ts` 的注册源码逐字比对。
4. **Hub 元数据门禁**：新增 unit test 反射 27 个选中内容 controller（>100 条路由），每条 handler
   必须有 `@RequirePermission` 或 `@RequireServiceAuth`，否则必须命中 `PEP_ROUTE_EXCEPTIONS`
   的 46 条显式例外（route/method/reason/owner/exception/expiry）。新增内容路由未登记即失败；
   已有元数据的路由不允许再被例外“遮蔽”。
5. **BFF/storage/tile/WA 记录现实**：BFF `/api/*` 仅终止 JWT 后原样代理，progress/retry 缺口
   以 `registered-exception` 记录；HUB 九前缀为 `p0-not-covered`；storage/SAS、tile、
   WA baseline 在 MS manifest 与本文矩阵中保持 `p0-not-covered`。
6. **唯一例外源**：MS 用 `pepCoverage.ts`、Hub 用 `test/unit/authorization/pep-route-exceptions.ts`、
   BFF 用 `src/pepCoverage.ts`；三处 `registered-exception` 统一引用 `EXCEPTIONS.md` X-27
   （owner 平台/安全，2027-03-31 到期）。没有第二套策略引擎，也没有放宽任何 guard。
7. **证据**：MS 全量 **158 files / 1629 passed + 1 expected fail + 8 skipped**，`tsc --noEmit` 通过；
   Hub 新增 spec **6/6 passed**，`tsc --noEmit` 通过；BFF **2 files / 33 passed**，`tsc --noEmit`
   通过。覆盖切片不要求真栈 canary；本轮未运行真栈/live DB。
8. **未完成**：B3.1b–g 全部未做；MS 本地仍无 per-document ACL，Hub 共享 key/legacy 服务通道
   仍在，groups/shares 未进入 resolver，storage/tile 匿名面仍在。B3/X-21 保持 open。

---

## 1. 范围与非目标

### 1.1 本切片范围

1. 把审计 §2/§4 的 MS 入口映射为可执行 manifest（名称、传输、binding、action、状态、备注）。
2. 增加纯校验/查询 helper（唯一名称、闭合状态、异常字段、按状态查询）并在启动时断言/记录。
3. 用测试把 manifest 与真实类方法、HTTP 路由、direct-edit/storage 接线绑定。
4. 用反射测试把 Hub 选中内容 controller 的每个路由 handler 绑定到元数据或显式例外。
5. 为 BFF `/api` progress/retry 透传与 HUB 九前缀代理增加小型 manifest/测试；
   storage/tile/WA baseline 在文档矩阵中明确保持未覆盖。
6. 登记 X-27 作为本分类切片的唯一例外引用，并更新文档索引与 G1 第二波状态。

### 1.2 明确非目标

- 不新增 403/401、不改任何请求结果、不加 middleware/guard、不删除 legacy 路径、不改客户端。
- 不把 `p0-not-covered` 升级为 `covered-enforce`/`fail-closed`；不安装 `DirectEditWriteGate`
  的 ACL hook；不接 FeatureOp/直改/save/push/pull/export/tile/progress/retry 的决策。
- 不修改 Hub controller/guard/runtime 授权；不迁移共享 API key、不启用 `AUTHZ_ENFORCE`。
- 不做 groups/shares/deny/link、tenant、审计 v1、storage/tile/WA 改造。
- 不跑真栈/live DB/迁移/canary；不勾 G1 Gate；不宣称 B3、B6/X-21 完成。

---

## 2. 状态语义与唯一事实源

| 状态 | 含义 | 本切片是否允许出现 |
|---|---|---|
| `covered-shadow` | 已计算/记录决策，不拒绝 | 是（仅 download/open） |
| `covered-enforce` | 已计算并拒绝 | 是（本切片计数为 0） |
| `fail-closed` | 入口默认拒绝、不进 legacy | 是（本切片计数为 0） |
| `registered-exception` | 显式例外，必须有 id/owner/expiry | 是 |
| `p0-not-covered` | 未触碰的 legacy 入口，强制前必须重分类 | 是 |

**单一事实源**

| 面 | 文件 | 说明 |
|---|---|---|
| MS | `luban-backend/modeling-server/src/authz/pepCoverage.ts` | manifest、校验、启动断言、状态查询 |
| Hub | `imodelhub-services/test/unit/authorization/pep-route-exceptions.ts` | 路由例外唯一目录（测试契约，不是运行时 guard） |
| BFF | `tiangong-kaiwu/services/bff/src/pepCoverage.ts` | BFF face 分类 manifest |
| 例外登记 | `docs/architecture/EXCEPTIONS.md` X-27 | owner/失效日/退出条件 |

---

## 3. MS 入口矩阵（manifest v2，30 条）

> `bindings` 是代码中的真实方法/路由名；完整列表与备注以 `pepCoverage.ts` 为准。

| 入口 | 传输 | 状态 | 关键 binding / 说明 |
|---|---|---|---|
| `luban-ipc.downloadBriefcase` | IPC | `covered-shadow` | `downloadBriefcase`；只读/可写 scope 影子记录 |
| `luban-ipc.downloadVersionBriefcase` | IPC | `p0-not-covered` | D5 只读版本打开，无影子决策 |
| `luban-ipc.assembly` | IPC | `p0-not-covered` | `createAssembly` / `listAssemblies` |
| `ipc-app.openBriefcase` | IPC | `covered-shadow` | `openBriefcase`；仅 open |
| `ipc-app.openCheckpoint` | IPC | `p0-not-covered` | `openCheckpoint` / `openStandalone` / `openSnapshot` |
| `ipc-app.closeIModel` | IPC | `p0-not-covered` | `closeIModel` |
| `ipc-app.saveChanges` | IPC | `p0-not-covered` | `saveChanges`；仅 session/lease |
| `ipc-app.abandonChanges` | IPC | `p0-not-covered` | `abandonChanges` |
| `ipc-app.pullChanges` | IPC | `p0-not-covered` | `pullChanges` |
| `ipc-app.pushChanges` | IPC | `p0-not-covered` | `pushChanges`；服务 push（X-21） |
| `ipc-app.txn-read` | IPC | `p0-not-covered` | undo/redo 状态读取 |
| `ipc-app.undo-redo` | IPC | `p0-not-covered` | reverse/reinstate/restart/graphical editing |
| `feature.read` | RPC | `p0-not-covered` | tree/sketch/bodies/variables/mass/resolveEdge/Face/listPartStudios |
| `feature.write` | RPC | `p0-not-covered` | apply/preview/renameFeature/renameBody |
| `partstudio.write` | RPC | `p0-not-covered` | create/rename/deletePartStudio |
| `feature.writeLease` | RPC | `p0-not-covered` | acquire/releaseWriteLease（进程内租约，X-06） |
| `direct-edit` | IPC/editor | `p0-not-covered` | `installDirectEditWriteGate`、`setDirectEditAclHook` 未接、基础命令族 |
| `exportIModel` | RPC | `p0-not-covered` | 无 session/owner ACL 变化 |
| `saved-views/local-paths` | RPC | `p0-not-covered` | 外部 saved views / camera paths |
| `luban-rpc.briefcase-stubs` | RPC | `p0-not-covered` | acquire/release/pull/pushChangesets 恒抛错 |
| `luban-rpc.conflicts` | RPC | `p0-not-covered` | compare/detect/resolve 不可用桩 |
| `luban-rpc.config` | RPC | `p0-not-covered` | getConfiguration/hasLocalChanges |
| `progress` | HTTP | `p0-not-covered` | `GET /api/imodels/:id/progress`，仅 Hub `/auth/me` |
| `retry` | HTTP | `p0-not-covered` | `POST /api/imodels/:id/retry`，服务凭据转发 |
| `tile/requestElementGraphics` | HTTP RPC | `p0-not-covered` | `IModelTileRpcInterface`；匿名 tile/SAS 仍开放 |
| `storage/SAS` | storage | `p0-not-covered` | `HostRewritingAzureStorage` / `PublicUrlTileStorage` |
| `named-version/checkpoint` | cross-service | `p0-not-covered` | Hub NV/checkpoint 路由与 flag（X-17） |
| `hub-data-plane` | cross-service | `p0-not-covered` | changesets/briefcases/namedversions 服务通道（X-21） |
| `bff.api` | cross-service | `registered-exception` | X-27；JWT 终止 + 原样代理 |
| `wa.baseline` | cross-service | `p0-not-covered` | `/baseline/process`、`/webhook/events` |

**计数（v2）**：`covered-shadow=2`、`covered-enforce=0`、`fail-closed=0`、
`registered-exception=1`、`p0-not-covered=27`。`uncoveredEntries()` 返回后两类（28 条），供启动
告警/后续强制门禁使用。

---

## 4. Hub 路由元数据门禁

- 选中 controller（27 个）：iModels / Changesets / ChangesetsAgent / Briefcases / Checkpoints /
  CheckpointsAgent / Locks / NamedVersions / ChangesetGroups / Permissions / UserPermissions /
  iModelUsers / iModelsBaseline / iModelsAdmin / Thumbnails / Operations / iTwins / iTwinMembers /
  UserMemberships / iTwinExports / AccessControl / Users / Webhooks / Repositories / Files（local /
  s3 / s3-presigned）。
- 门禁规则：每个反射出的路由 handler 必须有 `@RequirePermission` 或 `@RequireServiceAuth`
  （方法级或类级），或命中 `PEP_ROUTE_EXCEPTIONS`。
- 例外目录（46 条）覆盖当前现实：
  - iModels 列表可见性、favorites/recents（handler 按用户过滤）；
  - baseline failed/requeue 与 `/imodels/admin/*`（仅 Agent/Api key 服务通道，X-21）；
  - 用户自查端点（handler 强制本人）；
  - iTwins create/list/favorites/recents/primary account（用户作用域/尚无资源）；
  - iTwin exports（handler/service 检查 + 按 userId 过滤）；
  - access-control 全局权限词表；
  - platform admin users（`@Roles(admin)` + RolesGuard）；
  - webhook 订阅（自定义 `WebhookAccessGuard`，非元数据）；
  - repositories create/list（handler/service 检查）；
  - files 三种上传/本地下载（仅 JWT，路径无 iTwin/iModel）。
- 每条例外含 `controller/handler/method/path/reason/owner/exceptionRef/expires`；测试同时拒绝
  过期目标（路由已删/改名）、重复条目、以及“已有元数据却仍登记例外”的遮蔽。
- **未改 guard/controller**；该测试是 CI 门禁，不是运行时 PEP。

---

## 5. BFF / storage / tile / WA

| 面 | 当前行为 | 分类 |
|---|---|---|
| BFF `/api/*` | JWT 终止后原样代理 MS；无逐路由授权 | `registered-exception`（X-27） |
| BFF `/api/imodels/:id/progress` | MS 缺口透传 | `registered-exception`（X-27） |
| BFF `/api/imodels/:id/retry` | MS 缺口透传 | `registered-exception`（X-27） |
| BFF `/health` | 公开健康检查 | `registered-exception`（无文档数据） |
| BFF HUB 九前缀 | 无终止原样代理，Hub guard 负责 | `p0-not-covered` |
| nginx `/azurite/`、tile URL | 匿名可读；SAS 可重放 | `p0-not-covered`（审计 §2） |
| WA `/baseline/process`、`/webhook/events` | 共享 key / HMAC；不绑定作业 ACL | `p0-not-covered`（X-21） |

BFF 测试钉住 `/api` 仍是“JWT 终止 + 通用代理”两个 middleware，没有新增
`/api/imodels` 专有分支；progress/retry 不获得 BFF 级授权。

---

## 6. 例外策略

1. **X-27（新登记）**：B3.1a 覆盖分类切片。登记范围：MS 本地未覆盖入口、Hub 无元数据路由例外、
   BFF `/api` 透传、storage/tile/WA baseline。owner 平台/安全，失效日 2027-03-31。
2. **退出条件**：B3.1b–g 把每个入口变成 `covered-enforce` 或 `fail-closed`，或为保留的公开/服务
   路由提供独立、带 owner/失效日的正式例外；Hub 例外目录缩至零（或仅剩正式公开路由）。
3. **不得**用本例外放宽任何现有 guard；Hub 测试禁止例外遮蔽已有元数据，MS 测试禁止把
   `registered-exception` 宣称为强制。
4. 新增入口只有一个合法路径：manifest/元数据 + 例外字段；测试失败优先于运行时静默放行。

---

## 7. 测试与证据（2026-11-24，本机；无真栈）

| 命令 | 结果 |
|---|---|
| `cd luban-backend/modeling-server && npx vitest run src/authz/pepCoverage.test.ts` | **1 file / 10 tests passed** |
| `cd luban-backend/modeling-server && npx vitest run` | **158 files / 1629 passed + 1 expected fail + 8 skipped (1638)** |
| `cd luban-backend/modeling-server && npx tsc --noEmit` | 通过（无输出） |
| `cd luban-backend/modeling-server && npx tsc` | 构建通过（exit 0；`dist/` 被 git 忽略） |
| `cd imodelhub-services && npx jest --config ./test/jest-unit.json test/unit/authorization/pep-route-metadata.spec.ts --coverage=false --runInBand` | **1 suite / 6 tests passed**（加入 agent controllers 后复跑仍绿） |
| `cd imodelhub-services && npx jest --config ./test/jest-unit.json --runInBand` | **168 suites / 1510 tests passed**（含 coverage，667s，exit 0） |
| `cd imodelhub-services && npx tsc --noEmit` | 通过（无输出；tsconfig 仅覆盖 src，测试类型由 ts-jest 校验） |
| `cd tiangong-kaiwu/services/bff && npx vitest run` | **2 files / 33 tests passed** |
| `cd tiangong-kaiwu/services/bff && npx tsc --noEmit` | 通过（无输出） |

- **Hub 全量 unit**：168 suites / 1510 tests 全绿，coverage thresholds 未触发失败；新增门禁 spec
  在加入 `ChangesetsAgentController` / `CheckpointsAgentController` 后单独复跑 6/6。
- **真栈**：覆盖/分类切片不需要真实栈 canary；本轮**未运行** Hub/MS/BFF/WA live 栈、未连 live DB、
  未执行迁移、未开启任何 shadow/enforce flag。不得据此宣称 B3 或任何 Gate 通过。

---

## 8. B3.1b–g 对本切片的依赖

1. **B3.1b Hub resolver 对等/PDP**：先把 groups/shares/deny 与 `doc.*` 映射做进同一 resolver；
   本切片的 Hub 例外目录就是改造清单（列表可见性、exports、repositories、files 等）。
2. **B3.1c MS 读强制**：依赖本 manifest 的 `feature.read`、`ipc-app.openCheckpoint`、
   `luban-ipc.downloadVersionBriefcase`、tile/progress 条目逐一从 `p0-not-covered` 改为
   `covered-enforce` 或 `fail-closed`；BFF 透传条目同步复核。
3. **B3.1d MS 写强制**：依赖 `ipc-app.save/abandon/pull/push`、`feature.write`、
   `partstudio.write`、`feature.writeLease`、`ipc-app.undo-redo`、`direct-edit` 条目；
   安装 `setDirectEditAclHook` 时必须在同一 PR 更新 manifest 与测试。
4. **B3.1e Hub 数据面强制 + 归因**：`hub-data-plane`、`named-version/checkpoint` 条目与
   Hub 例外中的服务 key/admin 路由一起收敛；X-21 关闭前不得宣称数据面 PEP 完整。
5. **B3.1f 未用/危险表面 fail-closed**：`exportIModel`、`progress`、`retry`、`wa.baseline`、
   `storage/SAS`、`tile/requestElementGraphics` 是第一批候选；改变默认拒绝时需更新
   manifest 状态、Hub/BFF 例外与负例。
6. **B3.1g 负例矩阵与 G1 证据**：以本 manifest 为入口清单执行两用户/非成员/只读/K/
   service-scope/匿名 tile 负例；未跑真栈的项保持 unproven。

---

## 9. 残余风险与明确未完成

1. **不是强制**：所有 `p0-not-covered`/`registered-exception` 入口仍按 legacy 行为执行；
   B3.1a 不提供任何用户可见 ACL 结论。
2. **Hub 例外目录是测试契约**：它记录当前路由现实，不能阻止运行时调用；真正的 PEP 仍由
   `@RequirePermission`/`@RequireServiceAuth`/现有 guard 与后续 B3.1b–e 提供。
3. **服务通道旁路仍在**：baseline/admin key-only、Hub `X-API-Key`、MS 服务账号 JWT、
   BFF 仅认证、storage/tile 匿名面均为已知缺口；X-21 保持 open。
4. **测试覆盖边界**：Hub 门禁只覆盖选中的内容 controller（不含 auth/oidc/session-status/
   authz/audit/health/home/well-known/metrics 等非内容面）；MS catalog 只覆盖四个 handler 类
   与显式路由源码，不运行时枚举 iTwin.js 内部 IPC。
5. **未运行**：真栈 canary、live DB、迁移、镜像重建、发布门；所有“通过”仅指上述本地命令。
6. **不勾 Gate**：G0 ARB 未签字，G1 Gate 仍未勾选；B3 未完成。

---

## 10. 变更文件

- `luban-backend/modeling-server/src/authz/pepCoverage.ts`（v2 manifest + 校验/查询 helper）
- `luban-backend/modeling-server/src/authz/pepCoverage.test.ts`（catalog/静态名称测试）
- `luban-backend/modeling-server/src/main.ts`（启动断言/摘要日志；无请求路径变化）
- `imodelhub-services/test/unit/authorization/pep-route-exceptions.ts`（46 条显式路由例外）
- `imodelhub-services/test/unit/authorization/pep-route-metadata.spec.ts`（27 controller 反射门禁）
- `tiangong-kaiwu/services/bff/src/pepCoverage.ts`（BFF face manifest）
- `tiangong-kaiwu/services/bff/test/pepCoverage.test.ts`（BFF manifest/接线测试）
- `docs/architecture/AIRR-2026-11-24-B3-PEP-COVERAGE.md`、`docs/README.md`、
  `docs/architecture/G1-WAVE2-STATUS-2026-11-23.md`、`docs/architecture/EXCEPTIONS.md`（X-27）
