# AIRR — G1 D4b 真实 Checkpoint Worker（作业面）

- 标题：G1 D4b `checkpoint-worker`：领取/心跳/生成/回读/完成与失败分类
- 日期：2026-11-23
- Owner：平台/账本（作业面）
- 关联需求：`G1-EXECUTION-PLAN.md` D4；`CHECKPOINT-GENERATOR-DESIGN.md` §2.1/§2.5/§2.6/§3.2/§3.3/§3.4/§4.2；`AIRR-2026-11-23-D4-CHECKPOINT-CONTROL-PLANE.md`（Hub 切片，D4a）
- 预计影响仓：`luban-backend`（新独立包 `checkpoint-worker/`）；公共仓仅文档（本 AIRR + `EXCEPTIONS.md` + 索引）；`imodelhub-services` **只读消费**其未提交的 D4a 控制面（另一 Agent 实现，本任务不修改）
- 是否需要 ADR：**需要但本切片不产生新 ADR**。D4/D3 的账本、checkpoint 绑定与 clone/fork 语义归 `ADR-G0-04`（Proposed，未签字）。本切片新增的凭据/接口边界缺口登记为 X-23/X-24，退出条件与 ADR 同步复核。
- 状态：**Proposed under owner directive（2026-11-23）**。无 ARB 签字，不构成 G1 Gate 通过证据；`CHECKPOINT_GENERATION_ENABLED` 默认值不变（仍为 OFF）。

---

## 1. 目标与验收

### 目标

1. 新增独立作业面进程 `luban-backend/checkpoint-worker`：从 Hub outbox 领取 checkpoint 作业，生成真实 CloudSqlite checkpoint 字节，完成**独立回读**后向 Hub `complete` 回报证据；失败按稳定错误码分类回报。
2. 严格遵守 Hub 唯一状态机：worker 只调用 `/internal/...` claim/heartbeat/complete/failed；不写 DB、不复制状态机、不绕过 lease、不自选容器/URL/SAS。
3. 凭据最小化：不持有 DB 口令、`AUTH_JWT_SECRET`、用户 JWT、默认容器写权限（bridge 模式例外登记 X-23）；SAS 只存在于进程内存，短 TTL，不落盘/不入日志。
4. 无回读不成功：`complete` 前必须本地回读（全新 cache/container、下载、大小/SHA-256/`queryDatabaseHash` 比对、原生只读打开、GUID/changeset/pending txn 校验）。任一不通过则不得 `complete`。
5. 可运维：单进程可跑、按 Hub lease 串行、心跳续租、租约丢失即中止、有限重试/指数退避、临时目录按作业隔离并在成功/失败路径清理。

### 可观察验收

- 包内单测全绿：claim/heartbeat/lease lost/idempotent complete/fail 分类、重试/退避、无回读不成功、target mismatch、SAS 脱敏。
- 真实 `HubClient` + 本地 fake HTTP Hub + fake generator 的编排测试：成功路径只调用一次 `complete`；lease 丢失路径**永不** `complete`；回读缺证据路径调用 `failed` 且不 `complete`。
- 类型检查、eslint、vitest 命令与结果在 §7 如实回填；未执行的 native/真栈步骤逐条列为“未验证”。
- 默认 `CHECKPOINT_WORKER_ENABLED=false` 时进程 no-op 退出；不读取、不改变 Hub 的 `CHECKPOINT_GENERATION_ENABLED`。

### 非目标（明确不做）

- **不实现 Hub 控制面**（调度/outbox/claim/lease/reaper/GET 投影/Hub 侧链根校验已在 D4a；本任务不改 `imodelhub-services`）。
- **不写 sidecar manifest**（由 Hub 写；worker 只提交证据字段，见 §5.4）。
- **不实现 D3 clone/fork**、D5 `openCheckpoint`、D6 Named Version UI、GC/scrubber、retention。
- **不改** `modeling-server/src/**`、`webhook-agent/src/**`、`@luban-cad/shared`、Feature RPC、前端/Part Studio/真形/绳墨/DanQing。
- **不启用** `CHECKPOINT_GENERATION_ENABLED`；不迁移/操作真实 DB；不对 live stack 做 destructive 操作；不 commit/push/tag/publish。
- **不宣称容器镜像可构建**：本任务无法在本地验证 Linux 容器内官方 native 产物；容器化标记 blocked（§8）。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| imodelhub-services（未提交 D4a） | outbox/claim/lease/complete/fail、内部 agent key 鉴权、BullMQ 队列 | `checkpoints-agent.controller.ts`、`checkpoint-control-plane.service.ts`、`checkpoint-job.entity.ts`、`jobs/checkpoint-*` | 工作区未提交（只读消费） | **复用**（HTTP 契约），不修改 |
| imodelhub-services | 目标 changeset 封账查询、当前/前序 checkpoint、服务账号鉴权 | `SystemAgentOrResourceGuard` + class-level JWT；`GET /imodels/:iModelId/changesets/index/:index`、`GET /imodels/:iModelId/briefcases/checkpoint` | 同上 | **复用**（读） |
| itwinjs-core | 只读 briefcase 下载、changeset apply、CloudSqlite 容器读写、checkpoint 下载 | `BriefcaseManager.downloadBriefcase`（`briefcaseId:0`、`asOf`）、`BriefcaseManager.pullAndApplyChangesets`、`CloudSqlite.createCloudContainer/withWriteLock/uploadDb/downloadDb/queryDatabaseHash`、`IModelDb.performCheckpoint` | `link:../../tiangong-kaiwu/itwinjs-core/core/backend` | **复用**，不 fork |
| imodel-native | SQLite/WAL、GUID/current changeset、WAL checkpoint | 经 `@itwin/core-backend` 公开面（`openDgnDb`/`openForApplyChangesets`/`performCheckpoint`） | 宿主 native | **复用**，不新增 ABI |
| luban-backend/webhook-agent | CloudSqlite 容器 metadata、上传、readback、SAS 构造、IModelHost 单例 | `baseline-generator.ts`、`lifecycle.ts`、`hubAuthClient.ts` | 只读参考 | **复用模式**（复制到新包，不改原文件） |
| luban-backend/modeling-server | `IModelHost`+`BackendIModelsAccess`+`ServiceAccountAuthClient`+Azure 存储组装 | `src/main.ts`、`src/hub/createIModelsClient.ts`、`src/auth/ServiceAccountAuthClient.ts` | 只读参考 | **复用模式** |
| Hub BullMQ | 生成队列 `checkpoint-generate`，`jobId=outbox job id`，data `{jobId,iModelId}` | `checkpoint-queue.constants.ts`、`checkpoint-job-dispatcher.job.ts` | 未提交 | **复用**（worker 消费同一队列） |
| @azure/storage-blob | 容器存在探测、本地账户 SAS 签发（bridge）/回读 | `BlobServiceClient`、`ContainerSASPermissions('racwdl'/'rl')` | `^12.28.0`（与 WA 同源） | **复用** |
| 官方 iModels clients | changeset/checkpoint 数据面读取 | `@itwin/imodels-access-backend`、`@itwin/imodels-client-authoring` | 与 MS 同版本族 | **复用** |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建的理由 | 许可证 |
|---|---|---|---|---|---|
| 作业调度/去重/lease | Hub D4a outbox + claim | 高 | 复用，不建 worker 队列 | 禁止第二套状态机；lease 是 per-iModel 串行的唯一权威 | 项目内 |
| 作业投递 | Hub 已投递 BullMQ `checkpoint-generate` | 高 | worker 消费同一 queue，`jobId` 即 outbox id | 不引入新 broker/轮询端点 | MIT |
| Changeset 目标校验 | Hub `GET changesets/index/:index` + claim 内封账校验 | 高 | 复用（worker 二次校验） | 失败关闭，不信任单一来源 | 项目内 |
| 只读候选 briefcase | `BriefcaseManager.downloadBriefcase` / `queryV2Checkpoint` + `pullAndApplyChangesets` | 高 | 复用；不复制用户编辑 briefcase | native 已验证路径；避免锁/未提交事务污染 | iTwin 许可 |
| CloudSqlite 写/读 | `CloudSqlite.*` + WA 模式 | 高 | 复用；**禁止** `initializeContainer` | 已存在容器初始化会清空 manifest | iTwin 许可 |
| 容器身份 | Hub 设计固定 `{iModelId}`；claim/BullMQ 提供 `iModelId` | 中 | 复用固定规则；`queryV2Checkpoint.containerId` 必须等于 `iModelId` | 不允许 worker 自选容器 | 项目内 |
| SAS（读） | Hub checkpoint 读响应现签 SAS（native 下载路径） | 高 | 复用（`queryV2Checkpoint` 下发） | 凭据不落盘 | 项目内 |
| SAS（写）/回读 SAS | Hub `POST .../storage-token`（设计 §4.2） | **低（D4a 未实现）** | 目标契约实现 `hub` 模式；另提供 `local-account-key` 显式 bridge（X-23） | 不修改 Hub；bridge 仅本地试点，fail-closed 默认 `hub` | 项目内 |
| 回读与哈希 | CloudSqlite + Node `crypto` + native 只读打开 | 高 | 复用 | 无新库 | MIT |
| chainRoot | claim 返回 `expectedChainRoot`；Hub complete 独立重算 | 高（校验侧）/中（worker 独立重算） | 使用 claim 期望值；Hub 仍独立重算拒绝不符。changeset DTO 未暴露 `chainHash`，worker 暂不能独立重算（X-24 记录为接口缺口） | 不复制 Hub 账本算法输入，不读 DB | 项目内 |
| 服务鉴权 | `X-API-Key` + 独立服务账号 JWT | 高 | 复用；JWT 只用于官方数据面（Hub class-level `AuthGuard('jwt')`），非用户 JWT | 不新增鉴权方案 | 项目内 |

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web / shared / viewer / editor | 无 | 无 | 无 | 无 | 无 |
| itwinjs-core | 只消费公开 API | 无 | 不改源码，不重建 | worker 包内单测；native 步骤未验证 | 无 |
| imodel-native | 只消费已构建 native | 无 | 不新增 ABI | 同上 | 无 |
| modeling-server | 无 | 无 | 无 | 无 | 无 |
| webhook-agent | 无（新包复制其模式） | 无 | 无 | 无 | 无 |
| imodelhub-services | **只读消费** D4a 内部契约 | 不迁移 | 不修改 | worker 侧 fake Hub 契约测试 | 不发布 |
| luban-backend | 新增 `checkpoint-worker/` 包、脚本/配置说明 | 无 | 官方 npm native（容器路径，未验证） | 包内 vitest/tsc/eslint | 宿主运行路径；镜像 blocked |
| Hub/DanQing | 无 | 无 | 无 | 无 | 无 |

- 版本兼容：内部 agent API 以 `/internal/...` 路径版本化；worker 对 claim/heartbeat/complete/failed 的响应字段做**可选扩展容忍**（未来 Hub 增加 `iTwinId`/container/SAS 不破坏 worker）。
- 发布顺序（后续，不在本切片）：Hub D4a 迁移与 flag OFF → worker 部署（仍 flag OFF）→ canary 打开 `CHECKPOINT_GENERATION_ENABLED` → 观察 → 扩大。本切片不发布、不打开 flag。

---

## 5. Worker 设计

### 5.1 位置、进程与队列

- 新独立包 `luban-backend/checkpoint-worker/`（TypeScript ESM，Node ≥20），**不放在 modeling-server/webhook-agent**：避免重 I/O 与用户编辑会话/ webhook 生命周期争用（设计 §2.1）。
- 生产作业来源：Hub 已投递的 BullMQ 队列 `checkpoint-generate`（`jobId` = outbox job id；data `{jobId,iModelId}`）。worker 用 `drainDelay = CHECKPOINT_WORKER_POLL_INTERVAL_MS` 轮询空队列。
- 另提供 CLI 单作业模式（`--job-id`/`--imodel-id`），用于隔离 smoke、人工恢复与无 Redis 环境验证；CLI **不绕过** claim/lease。
- 默认 `CHECKPOINT_WORKER_ENABLED=false`：进程打印 no-op 并退出。worker 从不读取/修改 Hub 的 `CHECKPOINT_GENERATION_ENABLED`。

### 5.2 Claim / heartbeat / lease

| 步骤 | 调用 | 语义 |
|---|---|---|
| claim | `POST /internal/imodels/{iModelId}/checkpoints/{jobId}/claim` body `{leaseOwner}` | 单次尝试；409 `CheckpointJobBusy`/`CheckpointNotReady`/`CheckpointJobNotSchedulable` → deferred，不调用 failed（无 lease）；404 → 丢弃；422 `CheckpointTargetNotUploaded` → Hub 已在 claim 内 fail，worker 不重复 fail |
| 心跳 | `POST .../heartbeat` body `{leaseOwner}`，每 `CHECKPOINT_WORKER_HEARTBEAT_SECONDS` | 续租；409 `CheckpointLeaseLost` → 立即置 abort，停止一切后续写/complete；网络错误在 `leaseExpiresAt` 前重试，超过安全边界视同租约丢失 |
| complete | `POST .../complete` | 仅当本地回读证据通过 §5.5 校验；同摘要 200 幂等；`CheckpointAlreadyCompleted`（异摘要）→ 不重试 |
| failed | `POST .../failed` body `{leaseOwner,code,message,retryable}` | 仅对已 claim 且非 lease-lost 的失败调用一次；`retryable=true` 由 Hub 决定回到 queued；`retryable=false` 终结；409 `CheckpointLeaseLost` 忽略（他人接管） |

- **claim 不重试**：读 D4a `claim` 实现，同一 owner 在租约未过期时再次 claim 返回 `busy`；请求超时后盲目重试会把“已领取”误判为忙。因此 claim 只发一次，失败即 ack 并让 outbox 重投/reaper 处理。
- heartbeat/complete/failed/storage-token/只读 GET 使用有限重试 + 指数退避 + jitter；只对网络错误/408/429/5xx 重试；complete 重试依赖 Hub 同摘要幂等。
- `leaseOwner` 进程级稳定标识（host-pid-随机后缀，≤128），同一进程内所有 iModel 共用；Hub 的 per-iModel lease 是串行权威，worker 并发 >1 时同 iModel 第二个作业会被 Hub 判 busy/deferred。

### 5.3 生成适配器与 native 路径

`CheckpointGenerator` 接口隔离编排与 native：

```ts
interface CheckpointGenerator {
  generate(target: ClaimedJob, signal: AbortSignal): Promise<GeneratedCheckpoint>;
}
```

真实实现 `NativeCheckpointGenerator`（唯一生产实现）：

1. **目标封账二次校验**：`GET /imodels/{iModelId}/changesets/index/{index}`（API key + 服务 JWT）→ `id/index/state` 必须等于 claim 且 `state=fileUploaded`；否则 `CHANGESET_NOT_FOUND`/`CHANGESET_NOT_UPLOADED`（非重试）。
2. **容器守卫**：确认 `{iModelId}` 容器存在且 `manifest.bcv` 存在；不存在 → `CONTAINER_MISSING`（非重试，**绝不** `initializeContainer`）。
3. **候选 briefcase**：
   - claim 提供 `iTwinId` 时：`BriefcaseManager.downloadBriefcase({iTwinId, iModelId, briefcaseId: 0, asOf: target, fileName: <隔离临时文件>})`。
   - claim 未提供 `iTwinId`（D4a 现状，X-24）：`queryV2Checkpoint({iModelId, iTwinId: Guid.empty, changeset, allowPreceding:true})` → `CloudSqlite.transferDb('download', …)` 下载最近 checkpoint → 原生只读打开取得真实 `iTwinId` → `SnapshotDb.openForApplyChangesets` + `BriefcaseManager.pullAndApplyChangesets({toIndex})` 应用到目标。`iTwinId` 仅作为发现值；`iModelId`/changeset id/index 校验不降级。
   - `queryV2Checkpoint.containerId` 必须等于 claim `iModelId`，`dbName` 必须为 `baseline.bim` 或 `checkpoint-<n>.db`；否则 `TARGET_MISMATCH`。
4. **Quiesce**：`deleteAllTxns`（若有）、`resetBriefcaseId(0)`、`IModelDb.performCheckpoint()`（SQLite WAL truncate）、关闭所有连接；`-wal`/`-shm` 不得留下非零残留，否则 `WAL_NOT_QUIESCED`（可重试）。
5. **校验候选**：只读 native 打开 → `getIModelId()===iModelId`、`getCurrentChangeset().id/index===target`、`hasPendingTxns()===false`、`getBriefcaseId()===0`、`iTwinId` 非空且（若 claim 提供）与 claim 完全一致；否则 `GUID_MISMATCH`/`ITWIN_MISMATCH`/`TARGET_MISMATCH`（非重试）。
6. **上传**：`CloudSqlite.createCloudContainer({containerId:iModelId, storageType:'azure', baseUri, accessToken:<短 TTL 写 SAS>, writeable:true, tokenRefreshSeconds:<≤SAS TTL 的安全值>, tokenFn:<续签>})` → `connect` → `withWriteLock({user:'checkpoint-worker', busyHandler})` → `uploadDb({dbName:'checkpoint-<index>.db', localFileName})`。禁止 `initializeContainer`。
7. READBACK：全新 cache + 全新只读 container（新读 SAS）→ `connect/checkForChanges` → `queryDatabase(dbName).totalBlocks>0`（可见性窗口 ≤30s 重试）→ `downloadDb` 到新临时文件 → 大小/SHA-256 与上传前一致 → `queryDatabaseHash` 与写后读值一致 → 原生只读打开重复第 5 步校验。
8. 证据组装：`dbName/fileSize/contentSha256/cloudSqliteHash/blockCount/baseCheckpointIndex/chainRoot/generatorVersion/readback`；`readback.openedReadonly` 只能来自真实只读打开成功。
9. finally：断开/drop cache、删除作业临时目录；失败路径同样清理，不删共享 cache。

**明确未在本环境验证的 native 步骤**（不得宣称通过）：真实 `downloadBriefcase`/`queryV2Checkpoint` 连 Hub、`pullAndApplyChangesets` 对目标 index 的应用、`uploadDb` 对已存在 dbName 的重试覆盖、Azurite 下 SAS/块可见性、`performCheckpoint` 后 WAL 无残留。单测通过 fake generator 验证编排，不替代这些 native 验证。

### 5.4 Manifest / 证据边界

- **sidecar manifest 由 Hub 写**（设计 §2.5/§3.3）；worker 不写默认容器，不传 `manifestPath/manifestSha256`。
- worker → Hub 的 `complete` 只包含 D4a `CompleteCheckpointBody` 已声明字段：`leaseOwner/dbName/fileSize/contentSha256/cloudSqliteHash/chainRoot/blockCount/baseCheckpointIndex/generatorVersion/readback{verifiedAt,verifiedSize,openedReadonly}`。
- worker 本地可构造同样的证据对象用于日志/测试，但**不含 SAS/URL/用户信息/私有路径**；日志只记录 hash/尺寸/index。
- `chainRoot`：使用 claim `expectedChainRoot`；Hub complete 独立按 `1..N` 的 `index|id|chainHash` 重算并比对。D4a changeset DTO 未暴露 `chainHash`，worker 不能独立重算（X-24 接口缺口）；不放宽 Hub 校验。
- legacy 链：claim `legacyChain=true` 时 worker 提交 `chainRoot=null`，由 Hub 的 `CHECKPOINT_ALLOW_LEGACY_CHAIN` 决定；worker 不自行放行。

### 5.5 完成门槛（runner 强制）

`complete` 前 runner 校验，任一失败即 `failed`（non-retryable `EVIDENCE_INVALID`/`TARGET_MISMATCH`）且**不** `complete`：

- `dbName === checkpoint-<claim.changesetIndex>.db`；
- `fileSize > 0` 且 ≤ `CHECKPOINT_WORKER_MAX_DB_BYTES`；
- `contentSha256` 64-hex；`cloudSqliteHash`（若有）40-hex；
- `readback.openedReadonly === true`；`readback.verifiedSize === fileSize`；`readback.verifiedAt` 为合法且非未来时间；
- `readback` 的 `iModelId/changesetId/changesetIndex` 与 claim 完全一致；
- claim 提供 `iTwinId` 时 `readback.iTwinId` 必须一致；未提供时记录发现值但不放宽 iModelId/changeset；
- claim `expectedChainRoot` 非空时提交值必须逐字一致；`legacyChain=true` 时必须为 `null`；
- 租约未丢失（abort signal 未触发）。

### 5.6 错误分类（稳定内部码）

| 码 | 场景 | retryable | 备注 |
|---|---|---|---|
| `CONTAINER_MISSING` | `{iModelId}` 容器或 `manifest.bcv` 不存在 | 否 | 不 initialize；告警修复 baseline |
| `CHANGESET_NOT_FOUND` / `CHANGESET_NOT_UPLOADED` | 目标不存在/未封账 | 否 | 不生成 |
| `TARGET_MISMATCH` | containerId/dbName/briefcase GUID/changeset 与目标不符 | 否 | 数据/路由错误 |
| `ITWIN_MISMATCH` | claim 提供 iTwinId 且与 db 不符 | 否 | X-24 期间仅 claim 提供时生效 |
| `WAL_NOT_QUIESCED` | quiesce 后 WAL/SHM 非零 | 是 | 重试一次仍失败则终态 |
| `READBACK_NOT_VISIBLE` | 上传后 manifest/块可见性窗口 | 是 | ≤30s 轮询 |
| `READBACK_MISMATCH` | 大小/哈希/native 校验不符 | 否 | 数据损坏，隔离 |
| `WRITE_LOCK_TIMEOUT` | 容器写锁被占 | 是 | busyHandler 超时 |
| `STORAGE_5XX` / `SAS_EXPIRED` / `UPLOAD_TIMEOUT` | 对象存储/SAS 瞬时 | 是 | 续签/重试 |
| `STORAGE_TOKEN_UNAVAILABLE` | `hub` 模式无 storage-token（D4a） | 否 | fail-closed，提示 X-23 |
| `AUTH_FAILED` | 401/403 | 否 | 配置/服务账号问题 |
| `HUB_5XX` / `NETWORK_ERROR` | Hub/网络瞬时 | 是 | 有限退避 |
| `LEASE_LOST` | 心跳/complete/failed 409 租约丢失 | — | **不**调用 failed、不 complete |
| `DEFERRED` | claim busy/not ready/not schedulable | — | ack，让 outbox/reaper 处理 |
| `EVIDENCE_INVALID` | 本地门槛校验失败 | 否 | 不 complete |
| `HUB_VERIFICATION_FAILED` | complete 422 | 否 | 证据/目标被 Hub 拒绝 |
| `UNEXPECTED` | 未分类 | 否 | 日志 + failed（lease 在握时） |

### 5.7 凭据边界

- worker env 只允许：Hub URL、`X-API-Key`、独立服务账号邮箱/密码（换取服务 JWT）、Redis URL、临时/缓存目录、存储 bridge 凭据（仅 `local-account-key` 模式）。
- **禁止**：DB 口令、`AUTH_JWT_SECRET`、用户 JWT、默认容器写凭据（bridge 例外）、Hub 内部签名密钥。
- 读 SAS：优先由 Hub `GET checkpoint` 现签（native `queryV2Checkpoint` 使用，5–15 分钟）。
- 写 SAS/回读 SAS：目标契约 `POST .../storage-token`；D4a 未实现 → 默认 `hub` 模式在启动时 fail-closed（`CHECKPOINT_WORKER_HUB_STORAGE_TOKEN_AVAILABLE=false` 时拒绝启动，避免误将作业终结）；显式 `local-account-key` bridge 由 worker 本地账户签**容器级、≤15 分钟、仅 `{iModelId}`** 的 SAS，仅内存持有（X-23）。
- 日志红线：不打印 `Authorization`/`X-API-Key`/SAS/密码/完整查询串；`redact` 对键名与值双向脱敏，并有单测。
- SAS 生命周期：每次上传/回读单独签发；`tokenFn` 续签仍在内存；作业结束对象丢弃，不写磁盘/env/DB。

---

## 6. 数据/事务/安全

- 数据事实源：iModel/BIS + changeset 账本；checkpoint 字节事实源是对象存储；worker 不写元数据 DB、不写 sidecar。
- 事务边界：cloud 容器写锁 + CloudSqlite 单 db 上传；无 Hub DB 事务。
- Undo/redo：不适用（作业面，无用户编辑）。
- 写租约/权限/限流：Hub claim/lease 是唯一调度权威；worker 不自行跨 iModel 并行写同一容器（Hub per-iModel lease）；`withWriteLock` 为容器最后防线。
- 密钥/日志/审计：§5.7；worker 打印结构化作业日志（jobId/iModelId/checkpointIndex/attempt/hash/errorCode），不含凭据。
- 无用户身份：worker 不冒用用户；Hub 侧变更归因仍由调度/审计记录（B7 后续）。

---

## 7. 测试证据

### 7.1 单元/编排测试矩阵（fake generator + fake/本地 HTTP Hub）

| 用例 | 断言 |
|---|---|
| claim 成功 | 发送 `X-API-Key` + `leaseOwner`；只 claim 一次；返回目标 |
| claim busy/not ready/404/422 | 不调用 failed、不生成、不 complete；deferred/丢弃 |
| heartbeat 正常 | 按间隔续租；租约截止时间前停止 |
| heartbeat 409 lease lost | abort 置位；生成器被中止；**永不** complete；不调用 failed |
| complete 幂等 | 同摘要 200 返回成功；不重复写 |
| complete 409 异摘要 | 不重试、不覆盖；记录 `CheckpointAlreadyCompleted` |
| 失败分类 | 非重试码 → failed(retryable=false)；瞬时码 → failed(retryable=true)；未 claim 不 fail |
| 重试/退避 | 网络/5xx 有限次指数退避；401/403/422 不重试；claim 不重试 |
| 无回读不成功 | 缺失/伪造 `readback`、size 不符 → failed(`EVIDENCE_INVALID`) 且无 complete |
| target mismatch | dbName/GUID/changeset/iTwin 不符 → 终态，无 complete |
| chainRoot | 与 claim 期望不一致 → 终态；legacy 必须 null |
| SAS 纪律 | 日志/序列化无 SAS；容器名必须等于 iModelId；TTL ≤900s |
| 配置 | 默认 disabled；越界值拒绝；不读取 `CHECKPOINT_GENERATION_ENABLED` |
| fake Hub 全链 | 真实 HubClient + 本地 HTTP server + fake generator：claim→heartbeat→complete 成功；lease-lost 分支无 complete |

### 7.2 命令与结果（2026-11-23 实测）

```bash
cd luban-backend/checkpoint-worker
corepack pnpm@10 install          # 成功；link: itwinjs-core 5.15.0-dev.2；bullmq 6.7.8
corepack pnpm@10 test             # 12 files / 82 tests passed
corepack pnpm@10 exec tsc --noEmit # 0 errors（含测试）
corepack pnpm@10 lint             # 0 errors / 0 warnings
corepack pnpm@10 build            # tsc 成功（dist 不含测试）
```

额外冒烟：

- `CHECKPOINT_WORKER_ENABLED` 未设置时 `node dist/main.js` 输出 no-op 日志并以 0 退出（未加载 native）。
- `CHECKPOINT_WORKER_ENABLED=true` 且 `STORAGE_ACCESS_MODE=hub`、`HUB_STORAGE_TOKEN_AVAILABLE=false` 时启动拒绝（日志含 X-23 指引）并以 1 退出，避免误将作业终结。
- `CHECKPOINT_WORKER_ENABLED=true` 缺 Hub URL 时以 `CONFIG_INVALID` 退出 1。

测试文件：`config`、`redact/logger`、`hub/http`、`hub/client`、`hub/auth`、`storage/storageAccess`、`job/heartbeat`、`job/runner`、`job/jobSource`、`evidence`、`cleanup`、`fakeHub`（真实 `HubClient` + 本地 HTTP fake Hub + fake generator）。全部为 fake/isolated，不触达 live Hub/DB/Redis。

实现边界说明：

- 真实实现（typecheck 通过、未执行）：`NativeCheckpointGenerator` 的 `downloadBriefcase`/`queryV2Checkpoint`/`pullAndApplyChangesets`/`CloudSqlite`/只读 native 校验路径。
- fake：单测/编排中的 generator、Hub 响应、容器与会话；不替代 native 真栈验证。
- 包内提供 `.env.example` 与 `README.md`（宿主运行路径、凭据禁令、回滚、容器 blocked 说明）。

### 7.3 未执行/未验证

- 真实 Hub（Postgres/Redis/Azurite）+ 真实 worker + native 的 claim→生成→upload→readback→complete 端到端。
- native `downloadBriefcase`/`queryV2Checkpoint`/`pullAndApplyChangesets`/`uploadDb` 重试覆盖/`performCheckpoint` 在目标环境的行为。
- 200/1000 changeset 冷开基线、生成耗时/尺寸、容器块共享。
- Linux 容器镜像构建与官方 native 产物 provenance。
- 真栈 `verify-stack` worker health/smoke。
- `CHECKPOINT_GENERATION_ENABLED=true` 的任何 live 验证（本任务禁止）。

---

## 8. 回滚与发布

- 回滚：停止 worker → 关闭 Hub `CHECKPOINT_GENERATION_ENABLED`（若曾打开）→ Hub reaper 终结活动作业；已成功 checkpoint 不动；冷开回退 baseline+changesets（正确但慢）。
- worker 无自有持久状态：临时目录可丢弃；SAS/租约只在内存；重启后重新 claim/由 outbox 重投。
- 半成品上传：同一 dbName 重试覆盖（设计 §3.3）；未 complete 的字节不被 GET 选中；孤儿块由后续 GC。
- 发布门（后续）：Hub 迁移/flag OFF → worker 宿主运行 smoke → canary → 打开 flag。本切片**不发布、不 commit、不启用 flag**。
- 镜像：**blocked**。原因：本包以 `link:` 消费本机 `itwinjs-core`（Windows native dev build）；容器需要官方 npm Linux native 与独立 provenance，本环境无法验证。宿主运行路径与 env 示例随包提供，容器化在后续任务完成并留证。

---

## 9. P0 例外登记（新增）

| ID | 规则 | 例外/债务 | 影响 | Owner | 失效日期 | 退出计划 |
|---|---|---|---|---|---|---|
| X-23 | P0-07 / 最小权限（checkpoint worker 凭据边界） | D4a Hub 未实现 `POST /internal/.../storage-token`，worker 无法获得 Hub 现签的容器写/回读 SAS。默认 `hub` 模式在未显式确认能力前**拒绝启动**；显式 `local-account-key` bridge 允许 worker 持存储账户 key 本地签**容器级、≤15 分钟** SAS（仅内存），且容器固定为 claim `iModelId`。 | bridge 期间 worker 凭据面大于“仅容器短 TTL SAS”；账户 key 泄露影响该账户所有容器；不得租户化部署。 | 平台/账本（作业面） | 2027-03-31（季度复核） | Hub 实现 storage-token（写/读、按 checkpoint 目标容器、5–15 分钟）→ worker 改默认 `hub` 模式并删除 bridge 与账户 key 配置；验收=写/回读 SAS 均来自 Hub、日志无 SAS、worker env 无存储 key |
| X-24 | P0-07（内部 agent 契约） | D4a claim 响应不含设计 §3.1/§4.2 约定的 `iTwinId`/container；worker 在缺失时从下载的 checkpoint 原生发现 `iTwinId`，无法与 Hub 期望值做 `ITWIN_MISMATCH` 拒绝（`iModelId`/changeset id/index/container 仍强校验）。changeset DTO 未暴露 `chainHash`，worker `chainRoot` 只能采用 claim 期望值（Hub 仍独立重算并拒绝不符）。 | 该窗口内 iTwin 归属错误无法由 worker 独立拒绝；chainRoot 不是 worker 独立证据。不得据此宣称“独立双算”。 | 平台/账本（Hub+作业面） | 2027-03-31（季度复核） | Hub claim 增加 `iTwinId`/container（可选字段向后兼容）→ worker 启用 `ITWIN_MISMATCH` 强校验；changeset API 增加只读 `chainHash` 或专用链行端点 → worker 独立重算 chainRoot；验收=两处负例测试（篡改 iTwin/chainRoot 均终态拒绝） |

> 不重复登记 X-17（D4 生成默认关闭）；X-17 仍是“真实 worker 未落地”的总例外，本切片落地 worker 后由 owner 在后续发布窗评估收敛。

---

## 10. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是（仅 `luban-backend` 新包 + 公共文档；Hub 只读消费）
- P0 例外已登记：是（X-23、X-24；X-17 不重复）
- ADR：既有 ADR-G0-04（Proposed）约束；本切片不新增 ADR
- Owner 签字：待（本 AIRR 依 owner 指令先行实现，未获 ARB 签字）
- 结论：**Proposed under owner directive；不构成 G1 Gate 通过；实现完成且测试结果回填前不得发布。**
