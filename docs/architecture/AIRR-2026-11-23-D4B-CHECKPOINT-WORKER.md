# AIRR — G1 D4b 真实 Checkpoint Worker（作业面）

- 标题：G1 D4b `checkpoint-worker`：领取/心跳/生成/回读/完成与失败分类
- 日期：2026-11-23
- Owner：平台/账本（作业面）
- 关联需求：`G1-EXECUTION-PLAN.md` D4；`CHECKPOINT-GENERATOR-DESIGN.md` §2.1/§2.5/§2.6/§3.2/§3.3/§3.4/§4.2；`AIRR-2026-11-23-D4-CHECKPOINT-CONTROL-PLANE.md`（Hub 切片，D4a）
- 预计影响仓：`luban-backend`（新独立包 `checkpoint-worker/`）；公共仓仅文档（本 AIRR + `EXCEPTIONS.md` + 索引）；`imodelhub-services` **只读消费**其未提交的 D4a 控制面（另一 Agent 实现，本任务不修改）
- 是否需要 ADR：**需要但本切片不产生新 ADR**。D4/D3 的账本、checkpoint 绑定与 clone/fork 语义归 `ADR-G0-04`（Proposed，未签字）。本切片新增的凭据/接口边界缺口登记为 X-23/X-24，退出条件与 ADR 同步复核。
- 状态：**Proposed under owner directive（2026-11-23）**。无 ARB 签字，不构成 G1 Gate 通过证据；`CHECKPOINT_GENERATION_ENABLED` 默认值不变（仍为 OFF）。2026-11-23 后续切片：worker 已切换到 Hub claim 元数据/chain evidence/storage-token 契约（X-23/X-24 code exit，见 §7.4）；native/真栈/真实 checkpoint 仍未验证。同日隔离 native canary 后续修复：容器探测改为受限 List Blobs + 真实 `manifest.bcv` HEAD（兼容 Azurite），补齐 BullMQ 必需 `ioredis` 依赖并增加队列接线/探针单测（见 §7.5）；shim-free canary 又暴露 BullMQ 锁在事件循环阻塞期间过期，已增加可配置的有界锁窗口（默认 30 min）并记录残留风险（见 §7.6）。X-23/X-24 仍 open，未勾选任何 G1 Gate。

> **2026-11-24 B6 P1 supersession**：worker 内部 Hub 路由鉴权已切换到 Hub client_credentials 签发的
> `X-Service-Token`；共享 `X-API-Key` 仅在显式 legacy 模式保留。本文以下关于
> `X-API-Key` 的表格/测试矩阵文字是早期 D4b 切片记录，当前契约以 B6 AIRR §5.1/§7.5
> 和 worker README 为准。

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
| SAS（读） | Hub checkpoint 读响应现签 SAS（native `downloadBriefcase` 路径）+ `storage-token` read | 高 | 复用；容器探测/回读走 `storage-token` read | 凭据不落盘 | 项目内 |
| SAS（写）/回读 SAS | Hub `POST .../storage-token`（已实现，claim-token bound） | 高 | 复用 `hub` 模式；`local-account-key` bridge 已删除（X-23 code exit） | 不修改 Hub；worker 仅持短 TTL SAS | 项目内 |
| 回读与哈希 | CloudSqlite + Node `crypto` + native 只读打开 | 高 | 复用 | 无新库 | MIT |
| chainRoot | claim 返回 `expectedChainRoot`；内部 chain evidence 提供 canonical links；Hub complete 独立重算 | 高 | worker 用同一 canonical 公式独立重算并与 claim 比对（X-24 code exit）；Hub 仍独立重算 | 不复制 Hub 账本存储，不读 DB | 项目内 |
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

- 版本兼容：内部 agent API 以 `/internal/...` 路径版本化；`claim` 的 `iTwinId`/`container` 与 `chain` 的 `algorithm` 为**必需契约字段**（缺失/畸形硬失败），其余响应容忍附加字段。
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
3. **候选 briefcase**（X-24 切换后，claim 必带 `iTwinId`）：
   - claim 元数据（`iTwinId` 与无凭据 `container`）缺失/畸形即硬失败；`container.containerId` 与 `container.baseDirectory` 必须都等于 claim `iModelId`（否则 `TARGET_MISMATCH`）。
   - `BriefcaseManager.downloadBriefcase({iTwinId: claim.iTwinId, iModelId, briefcaseId: 0, asOf: target, fileName: <隔离临时文件>})`；Hub 数据面解析最近 V2 checkpoint 并现签短 TTL 读 SAS，worker 不自选容器/URL/SAS。
   - 原 D4a “无 `iTwinId` 时下载 checkpoint + 自行 apply changesets” 的回退路径已删除，不再存在 iTwin 发现值。
   - claim `container.storageType` 必须为 Azure（否则 `STORAGE_TOKEN_UNAVAILABLE`，fail-closed）。
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
- `chainRoot`：claim 后立即调用 `GET /internal/imodels/:id/changesets/:changesetId/chain` 取 canonical links，worker 以同一公式 `sha256(concat("index|changesetId|chainHash\n" for 1..N) + "\n")` **独立重算**，并要求与 `claim.expectedChainRoot` 逐字一致；不一致为终态 `CHAIN_ROOT_MISMATCH`，不生成、不 complete。Hub complete 仍会再独立重算。
- legacy 链：链证据含 null `chainHash` 时 `chainRoot=null`；worker 必须同时看到 `claim.legacyChain=true`、`expectedChainRoot=null`，提交 `chainRoot=null`（绝不伪造 root）。claim 与链证据的 legacy 标志冲突即终态拒绝；是否放行由 Hub 的 `CHECKPOINT_ALLOW_LEGACY_CHAIN` 决定。
- baseline（index 0）：无 changeset 链，worker 要求 `expectedChainRoot=null`/`legacyChain=false` 且不调用链证据端点，提交 `chainRoot=null`。

### 5.5 完成门槛（runner 强制）

`complete` 前 runner 校验，任一失败即 `failed`（non-retryable `EVIDENCE_INVALID`/`TARGET_MISMATCH`）且**不** `complete`：

- `dbName === checkpoint-<claim.changesetIndex>.db`；
- `fileSize > 0` 且 ≤ `CHECKPOINT_WORKER_MAX_DB_BYTES`；
- `contentSha256` 64-hex；`cloudSqliteHash`（若有）40-hex；
- `readback.openedReadonly === true`；`readback.verifiedSize === fileSize`；`readback.verifiedAt` 为合法且非未来时间；
- `readback` 的 `iModelId/changesetId/changesetIndex` 与 claim 完全一致；
- `readback.iTwinId` 必须为 GUID 且与 claim `iTwinId` 完全一致（`ITWIN_MISMATCH`）；
- 独立重算的 chainRoot 与 `claim.expectedChainRoot`、生成证据 `chainRoot` 三者逐字一致；legacy 时三者均为 `null`；baseline 为 `null`；
- 租约未丢失（abort signal 未触发）。

### 5.6 错误分类（稳定内部码）

| 码 | 场景 | retryable | 备注 |
|---|---|---|---|
| `CONTAINER_MISSING` | `{iModelId}` 容器或 `manifest.bcv` 不存在 | 否 | 不 initialize；告警修复 baseline |
| `CHANGESET_NOT_FOUND` / `CHANGESET_NOT_UPLOADED` | 目标不存在/未封账 | 否 | 不生成 |
| `TARGET_MISMATCH` | containerId/dbName/briefcase GUID/changeset 与目标不符 | 否 | 数据/路由错误 |
| `ITWIN_MISMATCH` | claim `iTwinId` 与 db/回读不符，或 claim iTwin 畸形 | 否 | X-24 切换后 claim 必带 iTwinId，始终强制 |
| `CHAIN_ROOT_MISMATCH` | 链证据/claim/独立重算不一致，或 legacy 标志冲突 | 否 | 不生成、不 complete |
| `CHAIN_EVIDENCE_REJECTED` / `_GONE` / `_CONFLICT` | 链证据 422/410/409 | 否 | 终态拒绝 |
| `WAL_NOT_QUIESCED` | quiesce 后 WAL/SHM 非零 | 是 | 重试一次仍失败则终态 |
| `READBACK_NOT_VISIBLE` | 上传后 manifest/块可见性窗口 | 是 | ≤30s 轮询 |
| `READBACK_MISMATCH` | 大小/哈希/native 校验不符 | 否 | 数据损坏，隔离 |
| `WRITE_LOCK_TIMEOUT` | 容器写锁被占 | 是 | busyHandler 超时 |
| `STORAGE_5XX` / `SAS_EXPIRED` / `UPLOAD_TIMEOUT` | 对象存储/SAS 瞬时 | 是 | 续签/重试 |
| `STORAGE_TOKEN_UNAVAILABLE` | 存储类型非 Azure 或 storage-token 端点不可用 | 否 | fail-closed |
| `STORAGE_TOKEN_REJECTED` / `_GONE` | storage-token 409（非 lease）/410/422 | 否 | 资格/目标被 Hub 拒绝 |
| `SAS_EXPIRED` | Hub SAS 近过期/上传中失效 | 是 | 显式重新申请 SAS |
| `AUTH_FAILED` | 401/403 | 否 | 配置/服务账号问题 |
| `HUB_5XX` / `NETWORK_ERROR` | Hub/网络瞬时 | 是 | 有限退避 |
| `LEASE_LOST` | 心跳/complete/failed 409 租约丢失 | — | **不**调用 failed、不 complete |
| `DEFERRED` | claim busy/not ready/not schedulable | — | ack，让 outbox/reaper 处理 |
| `EVIDENCE_INVALID` | 本地门槛校验失败 | 否 | 不 complete |
| `HUB_VERIFICATION_FAILED` | complete 422 | 否 | 证据/目标被 Hub 拒绝 |
| `UNEXPECTED` | 未分类 | 否 | 日志 + failed（lease 在握时） |

### 5.7 凭据边界

- worker env 只允许：Hub URL、`X-API-Key`、独立服务账号邮箱/密码（换取服务 JWT）、Redis URL、临时/缓存目录。**不存在**存储账户 key/bridge 配置（`CHECKPOINT_WORKER_STORAGE_ACCESS_MODE=local-account-key` 启动即拒绝，X-23 code exit）。
- **禁止**：DB 口令、`AUTH_JWT_SECRET`、用户 JWT、存储账户 key、默认容器写凭据、Hub 内部签名密钥。
- 读 SAS：baseline/target briefcase 下载由 Hub 数据面现签；容器探测与回读使用 `POST .../storage-token` 的 `read`（`rl`）SAS。
- 写 SAS：`POST .../storage-token` 的 `write`（`racwdl`）SAS；claim-token bound（job 必须由该 `leaseOwner` 持未过期 lease、目标已封账），容器由 Hub 固定 `{iModelId}`，TTL ≤15 分钟，拒绝默认容器写 SAS。
- SAS 续签：`StorageGrantSession` 在剩余 TTL ≤60s 时显式重新请求写 SAS，作为 CloudSqlite `tokenFn`；回读每次重试都重新请求读 SAS。任何 SAS 只在内存，不写磁盘/env/DB/证据。
- 日志红线：不打印 `Authorization`/`X-API-Key`/SAS/密码/完整查询串；`redact` 对键名与值双向脱敏，并有单测；storage-token 校验错误不回显响应体。

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
| SAS 纪律 | 日志/序列化/错误无 SAS；容器名必须等于 iModelId；TTL ≤900s |
| claim 元数据（X-24） | 缺失/畸形 `iTwinId`/`container` → `INVALID_HUB_RESPONSE`；`containerId`/`baseDirectory` ≠ iModelId → `TARGET_MISMATCH`；legacy=false 却带 root（或反之）→ 硬失败 |
| chain evidence（X-24） | 取 canonical links；独立重算 root 不一致 → `CHAIN_ROOT_MISMATCH`、不生成/不 complete；legacy 三处一致且 root=null；baseline 明确无链 |
| storage-token（X-23） | read `rl`/write `racwdl` 成功；权限/容器/存储类型不符拒绝；近过期/超 15 分钟拒绝；409 lease loss/410/401/403 分类；错误不回显 SAS |
| 长上传续签 | `StorageGrantSession` 剩余 TTL ≤60s 时重新请求写 SAS；读回读每次重试重新请求读 SAS；SAS 不持久化 |
| 配置 | 默认 disabled；越界值拒绝；不读取 `CHECKPOINT_GENERATION_ENABLED`；`local-account-key` 已删除并启动拒绝 |
| fake Hub 全链 | 真实 HubClient + 本地 HTTP server（含 `/chain`）+ fake generator：claim→chain→heartbeat→complete 成功；lease-lost 分支无 complete |

### 7.2 命令与结果（2026-11-23 D4b Hub 契约切换后实测）

```bash
cd luban-backend/checkpoint-worker
corepack pnpm@10 test              # 13 files / 126 tests passed（锁窗口修复后复测）
corepack pnpm@10 exec tsc --noEmit # 0 errors（含测试）
corepack pnpm@10 lint              # 0 errors / 0 warnings
corepack pnpm@10 build             # tsc 成功（dist 不含测试）
```

额外冒烟：

- `CHECKPOINT_WORKER_ENABLED` 未设置时 `node dist/main.js` 输出 no-op 日志并以 0 退出（未加载 native）。
- `CHECKPOINT_WORKER_ENABLED=true` 且 `CHECKPOINT_WORKER_STORAGE_ACCESS_MODE=local-account-key` 时以 `CONFIG_INVALID` 拒绝启动（bridge 已删除），不再存在“等待 Hub 路由”的确认开关。
- `CHECKPOINT_WORKER_ENABLED=true` 缺 Hub URL 时以 `CONFIG_INVALID` 退出 1。

测试文件：`config`、`redact/logger`、`hub/http`、`hub/client`、`hub/auth`、`storage/storageAccess`、`job/heartbeat`、`job/runner`、`job/jobSource`、`evidence`、`cleanup`、`fakeHub`（真实 `HubClient` + 本地 HTTP fake Hub + fake generator）。全部为 fake/isolated，不触达 live Hub/DB/Redis。

实现边界说明：

- 真实实现（typecheck 通过、未执行）：`NativeCheckpointGenerator` 的 `downloadBriefcase`/`queryV2Checkpoint`/`pullAndApplyChangesets`/`CloudSqlite`/只读 native 校验路径。
- fake：单测/编排中的 generator、Hub 响应、容器与会话；不替代 native 真栈验证。
- 包内提供 `.env.example` 与 `README.md`（宿主运行路径、凭据禁令、回滚、容器 blocked 说明）。

### 7.3 未执行/未验证

- 真实 Hub（Postgres/Redis/Azurite）+ 真实 worker + native 的 claim→生成→upload→readback→complete 端到端。
- native `downloadBriefcase`（含 Hub 现签读 SAS）/`pullAndApplyChangesets`/`uploadDb` 重试覆盖/`performCheckpoint` 在目标环境的行为；`StorageGrantSession` 驱动 CloudSqlite `tokenFn` 的真实长上传续签。
- 200/1000 changeset 冷开基线、生成耗时/尺寸、容器块共享。
- Linux 容器镜像构建与官方 native 产物 provenance。
- 真栈 `verify-stack` worker health/smoke。
- `CHECKPOINT_GENERATION_ENABLED=true` 的任何 live 验证（本任务禁止）。
- 真实 Redis/BullMQ 队列消费与 Hub dispatcher 端到端。canary 修复后仅做了零 Redis 的 Worker 构造冒烟（构造成功，仅报 `ECONNREFUSED`，不再报 `Could not load ioredis`），不证明消费/ack/重投。
- 真实 Redis 下的锁续租、stalled 恢复与长作业（>canary 161s）行为：本切片只验证配置/Worker options 映射，未伪造或实测 BullMQ 锁续租；`lockDuration` 默认 30 min 覆盖已知 canary 预算，但真实长作业/并发 >1 未验证（见 §7.6）。
- 真实 Azure 容器 SAS 下的 List Blobs + blob HEAD 行为（Azurite 3.37/3.38 侧由隔离 canary 发现并修复；真实 Azure 未验证，见 §7.5 残留风险）。

### 7.4 Hub 契约消费（2026-11-23 worker 已切换，code exit）

> Hub 仓 `imodelhub-services` 已实现 X-23/X-24 的 Hub 侧契约（详见 `AIRR-2026-11-23-D4-CHECKPOINT-CONTROL-PLANE.md` §7.5）。本切片把 worker 切换到这些契约；仅证明**代码退出**，不证明 native/真栈 checkpoint 成功。

- **Claim**：worker 现在**强制要求** `iTwinId`（GUID）与无凭据 `container`（`{containerId, baseDirectory, baseUrl, baseUri, storage, storageType}`）；缺失/畸形为 `INVALID_HUB_RESPONSE`，`containerId`/`baseDirectory` 不等于 `claim.iModelId` 为 `TARGET_MISMATCH`，非 Azure 为 `STORAGE_TOKEN_UNAVAILABLE`（全部 fail-closed）。`claim.iTwinId` 直接用于 `downloadBriefcase`，下载/回读的 native `iTwinId` 不符即 `ITWIN_MISMATCH`。原“无 iTwinId 发现”回退路径已删除。
- **Storage token**：worker 默认且仅支持 `CHECKPOINT_WORKER_STORAGE_ACCESS_MODE=hub`；所有 read/write SAS 来自 `POST /internal/imodels/:iModelId/checkpoints/:jobId/storage-token`，body `{permission, leaseOwner}`。响应验证 `containerId===iModelId`、`permission`/`permissions`（`rl`/`racwdl`）、`storageType=azure`、`expiresAt`；近过期或 >15 分钟拒绝。401/403→`AUTH_FAILED`；409 lease 类→`LEASE_LOST`；410→`STORAGE_TOKEN_GONE`。`sasToken` 只入内存，错误/日志不回显。`StorageGrantSession` 在剩余 TTL ≤60s 时显式续签写 SAS（CloudSqlite `tokenFn`）；回读每次重试重新申请读 SAS。
- **X-23 代码退出**：删除 `LocalAccountSasAccess`、账户 key SAS signer、`AccountKeyContainerProbe`、`CHECKPOINT_WORKER_STORAGE_ACCOUNT*`/`STORAGE_BASE_URI`/`SAS_TTL_SECONDS`/`HUB_STORAGE_TOKEN_AVAILABLE` 配置；`local-account-key` 模式启动即 `CONFIG_INVALID`。worker env 不再包含存储 key。
- **Chain evidence**：claim 后调用 `GET /internal/imodels/:iModelId/changesets/:changesetId/chain`，校验 `algorithm=sha256-index-changesetId-chainHash-v1`、连续 `1..N`、目标 link、`legacyChain` 与 links 一致；用同一 canonical 公式独立重算 root，与 `claim.expectedChainRoot` 和生成证据逐字比较。不一致为 `CHAIN_ROOT_MISMATCH`（不生成、不 complete）。legacy 要求 claim/证据/提交三处均为 `null`；baseline（index 0）不调用链端点且必须无 root。
- **鉴权**：两条内部路由均要求 `X-API-Key` + `X-Service-Name=checkpoint-worker`（`CHECKPOINT_WORKER_HUB_SERVICE_NAME`，默认已匹配）；worker 不发送用户 JWT，chain/storage-token 均为服务路由。
- **证据（本切片，切换时点）**：`pnpm test` 12 files / 109 tests passed；`tsc --noEmit` 0 errors；`eslint` 0 errors/0 warnings；`tsc -p tsconfig.build.json` 成功。canary 与锁窗口修复后全包为 13 files / 126 tests（§7.2/§7.5/§7.6）。新增/更新覆盖：claim 元数据/iTwin/container 拒绝；chain evidence 独立重算、篡改 root、legacy 冲突、baseline；storage-token read/write、权限/容器/类型拒绝、过期/续签、409/410/401/403、SAS 不入错误；`local-account-key` 删除断言；真实 `HubClient`+本地 fake Hub 全链（含 `/chain`）。
- **仍未执行（不得宣称关闭）**：真实 Hub/Postgres/Redis/Azurite + native 生成/upload/readback、canary、`CHECKPOINT_GENERATION_ENABLED=true`。X-23/X-24 仍 open 至 native canary/部署验证；不得据此宣称真实 checkpoint 成功或 G1 Gate 通过。

### 7.5 隔离 native canary 后续修复（2026-11-23，worker-only）

> 隔离 canary 使用未经修改的 worker 产物 + 外部 shim；发现两项真实集成缺陷。本切片只修 worker 仓代码/单测/文档，未启用任何 flag、未运行 live DB/栈、未 commit/push。X-23/X-24 仍 open，未勾选 G1 Gate。

- **缺陷 1：Azurite 下容器探测失败。** `SasContainerProbe` 原用 `ContainerClient.exists()`（容器级 HEAD）。Azurite 3.37/3.38 对容器 SAS 的该调用一律返回 `AuthorizationPermissionMismatch`（`r`/`l`/`rl`/`racwdl` 均如此），而 List Blobs 与 blob HEAD 正常；真实 Azure 行为未验证。
  - **修复**：容器守卫改为 `listBlobsFlat({prefix:'manifest.bcv'}).byPage({maxPageSize:1})`（Hub 读 SAS 的 `l` 允许；200 即证明容器存在，404 缺失），并保留独立的真实 `manifest.bcv` blob HEAD。绝不调用容器 HEAD、`initializeContainer` 或任何写操作；401/403 仍为 `AUTH_FAILED`、404 为 `CONTAINER_MISSING`（fail-closed，不把拒绝当“不存在”）。
  - **测试**：新增 `src/storage/azure.test.ts`（9 例）覆盖 allowed / manifest missing / container missing / list denied / manifest denied / transient 5xx（list 与 manifest）/ 非 HTTP 错误 / `status` 字段；通过可注入 `ContainerProbeTarget` 适配器，无需 Azurite/Azure。
  - **残留风险**：真实 Azure 对 `rl` 容器 SAS 的 List Blobs + blob HEAD 未实测；若真实 Azure 对其中任一操作拒绝，worker 会 fail-closed 为 `AUTH_FAILED`（不会误判成功）。隔离 canary 通过外部 preload shim 已证明：在 Azurite 下用受限单条 List 替代容器 HEAD 后，真实 `manifest.bcv` 检查仍可执行；worker 现在原生实现同一路径，但**修复后的产物尚未重新跑 unmodified native canary**，因此不构成 Azurite 验收、真实 Azure 或真栈证据。
- **缺陷 2：Queue 模式无法启动。** `bullmq@6` 把 `ioredis` 声明为 optional peer，worker 包未安装；CLI 单作业模式不受影响。
  - **修复**：`package.json` 增加运行时依赖 `ioredis:^5.11.1`（手改后 `corepack pnpm@10 install --no-frozen-lockfile`；lockfile 仅新增 `ioredis@5.11.1` 及其传递依赖，`link:` 计数保持 12）。
  - **测试**：`jobSource.test.ts` 增加 ioredis 可解析/可加载断言、注入式 `QueueWorkerFactory` 的队列接线测试（queueName/connection/concurrency/drainDelay/事件注册/close），以及合法/畸形/处理器异常的 ack 语义测试，无需 Redis。另做一次零 Redis 构造冒烟：`new Worker(...)` 构造成功，仅报 `ECONNREFUSED`（不再报缺失 ioredis）。
  - **未验证**：真实 Redis 消费、Hub dispatcher 重投/ack、并发与 drain 行为仍属 §7.3。
- **非本仓问题（未修改，转交 Hub owner）**：canary 观察到的 checkpoint REST DTO 省略 `fileSize`、`manifestPath` 为 null、changeset `_links.download.storageType` 硬编码 `s3`（URL 为 Azure）、index checkpoint route 404。worker 不消费这些 REST 投影，按“不改 Hub/service”约束登记为 Hub 侧 follow-up；index checkpoint route 404 由 Hub agent 的 projection 修复处理。

### 7.6 Queue 锁缺陷后续修复（2026-11-23，worker-only）

> shim-free 隔离 D4 native canary 功能上通过，但暴露 BullMQ 锁缺陷：约 161 s 同步 native 工作期间 BullMQ 记录 `could not renew lock`；完成时记录 `Missing lock ... moveToFinished`；stalled 作业约 30 s 后被重试一次，Hub 返回 `CheckpointJobBusy`（作业已终态），BullMQ 最终 ack。未产生重复行/幻影，但队列行为不可接受。本切片只修 worker 配置/接线/文档，未运行 live Redis/DB/栈、未 commit/push。

- **根因**：`NativeCheckpointGenerator` 的同步 native 调用阻塞 Node 事件循环；BullMQ 默认 `lockDuration=30 s`，续租定时器在阻塞期间无法运行，锁在处理器返回前过期，随后 `moveToFinished` 因缺失锁失败并触发 stalled 重试。
- **修复（有界，不是根因修复）**：新增 `CHECKPOINT_WORKER_LOCK_DURATION_MS`（默认 1 800 000 = 30 min；合法 900 000–3 600 000 = 15–60 min）与 `CHECKPOINT_WORKER_LOCK_RENEW_TIME_MS`（默认 `lockDuration/6` = 5 min；合法 5 000–`lockDuration/2`），经 `QueueWorkerConfig`/`toBullMqWorkerOptions()` 注入 BullMQ `Worker` 的 `lockDuration`/`lockRenewTime`。默认窗口覆盖单次 native checkpoint 作业预算（已知 canary ~161 s；余量 ≥15 min）。越界、非整数或续租 ≥ 半窗口时启动即 `CONFIG_INVALID`，不会静默退回 BullMQ 30 s 默认值。Hub lease/heartbeat 配置与 runner 逻辑未改动。
- **测试**：`config.test.ts` 覆盖默认窗口 ≥15 min、显式配置、`lockDuration/6` 派生续租、低于 15 min/高于 60 min/非整数/续租越界拒绝；`jobSource.test.ts` 断言注入工厂收到配置值、`toBullMqWorkerOptions()` 生成的 Worker options 含 `lockDuration`/`lockRenewTime`，并覆盖 `loadWorkerConfig` 默认值到 Worker options 的映射。另做零 Redis 构造冒烟：BullMQ `Worker.opts` 实际为 `lockDuration=1800000`/`lockRenewTime=300000`，仅报 `ECONNREFUSED`。无需 Redis；**未**伪造 BullMQ 锁续租的内部行为。
- **残留风险（不得掩盖）**：延长 `lockDuration` 只保证作业在窗口内不丢锁，**没有修复事件循环阻塞**；native 工作期间锁续租、Hub 心跳与关停处理仍被延迟；超过锁窗口的作业仍可能丢锁并被 stalled 重试（Hub 侧可能返回 `CheckpointJobBusy`）。worker 崩溃时 BullMQ 锁最多保留 `lockDuration` 才可被 stalled 回收，恢复延迟随之增加（Hub lease/reaper 不受影响）。真实 Redis 下的长作业、并发 >1、stalled 恢复均未验证。不得据此宣称队列行为已彻底修复。
- **后续（独立切片）**：将 native 生成移入 worker thread 或 child process，父进程保留 claim/heartbeat/complete 与 SAS 获取，避免事件循环阻塞；需独立 AIRR/ADR、native runtime 线程安全评估与 native canary。本切片评估后未实施，以避免 destabilize 已验证路径。
- **未关闭**：X-23/X-24 仍 open；未勾选任何 G1 Gate。

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
| X-23 | P0-07 / 最小权限（checkpoint worker 凭据边界） | **状态 2026-11-23：Hub 契约已实现 + worker 已切换（code exit）**：默认/唯一 `hub` 模式，read/write SAS 均来自 storage-token；`local-account-key` bridge、账户 key signer 与 `CHECKPOINT_WORKER_STORAGE_ACCOUNT*` 配置已删除，启动拒绝旧模式；写 SAS 近过期显式续签。**例外仍 open 至 native canary/部署验证**。 | 代码面凭据已收敛；未验证真实 native 上传/回读与部署形态，不得宣称租户化就绪。 | 平台/账本（作业面） | 2027-03-31（季度复核） | Hub 契约完成 + worker code exit（D4B AIRR §7.4）→ **剩余**：native canary 证明写/回读 SAS 均来自 Hub、长上传续签、日志无 SAS；真实成功前不得关闭 |
| X-24 | P0-07（内部 agent 契约） | **状态 2026-11-23：Hub 契约已实现 + worker 已切换（code exit）**：claim `iTwinId`/container 强制校验并用于下载/回读（`ITWIN_MISMATCH`）；拉取内部 chain evidence 并以 canonical 公式独立重算 chainRoot，与 claim/证据比对；legacy/baseline 显式处理。**例外仍 open 至 native canary/部署验证**。公开 changeset DTO 仍不暴露 `chainHash`（改由 `GET /internal/.../changesets/:id/chain` 提供）。 | 代码面 iTwin/链根双算已落地；未验证真实账本/数据面组合，不得宣称 G1 Gate 通过。 | 平台/账本（Hub+作业面） | 2027-03-31（季度复核） | Hub 契约完成 + worker code exit（D4B AIRR §7.4）→ **剩余**：native canary 下篡改 iTwin/chainRoot 两处负例均终态拒绝；真实成功前不得关闭 |

> 不重复登记 X-17（D4 生成默认关闭）；X-17 仍是“真实 worker 未落地”的总例外，本切片落地 worker 后由 owner 在后续发布窗评估收敛。

---

## 10. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是（仅 `luban-backend` 新包 + 公共文档；Hub 只读消费）
- P0 例外已登记：是（X-23、X-24；X-17 不重复）
- ADR：既有 ADR-G0-04（Proposed）约束；本切片不新增 ADR
- Owner 签字：待（本 AIRR 依 owner 指令先行实现，未获 ARB 签字）
- 结论：**Proposed under owner directive；不构成 G1 Gate 通过；实现完成且测试结果回填前不得发布。**
