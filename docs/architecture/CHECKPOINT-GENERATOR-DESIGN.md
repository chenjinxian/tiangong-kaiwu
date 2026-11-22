# G1 D4 Checkpoint 生成器与 D3 Clone/Fork 依赖 — 实施级设计

> 状态：**Proposed（待 G1 Gate / ADR 签字）**
> 日期：2026-11-22
> 范围：G1 WS-D `D4 checkpoint worker`；以及 `D3 clone/fork` 对 checkpoint 的依赖与账本身份改造
> 关联：`G1-EXECUTION-PLAN.md`（D3/D4 验收）、`G0-DECISION-REGISTER.md`（D0-4）、`../research/lubancad-architecture-assessment/04-COLLABORATION-AND-DATA.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`
> 本文只做设计，不包含实现代码；开工前按 `AIRR-TEMPLATE.md` 补 AIRR，按 P0-04 走 ADR（账本身份/FK 改造属数据迁移 ADR）。

---

## 0. 现状核查（代码事实与影响）

| # | 事实 | 证据位置（仓内相对路径） | 影响 |
|---|---|---|---|
| F1 | 生产中只有 **baseline（index 0）** checkpoint 被生成：WA 生成空 `.bim` 并以 CloudSqlite 上传 `baseline.bim`，hub 在 baselinefile complete 时写 index 0 行 | `luban-backend/webhook-agent/src/baseline-generator.ts`；`imodelhub-services/src/imodels/imodels.service.ts`（`completeBaselineUpload` → `upsertBaselineCheckpoint`） | 冷开 = 下载 baseline + 按序 apply 全部 changeset；历史越长打开越慢 |
| F2 | `createOrUpdateForChangeset` **无生产调用方**，仅定义/单测；Named Version 的 `PUT checkpoint` 只写 `state=scheduled` 行，不创建任何作业 | `imodelhub-services/src/imodels/checkpoints.service.ts`；`imodelhub-services/src/imodels/named-versions.controller.ts`、`checkpoints.controller.ts` | Named Version 是 “Scheduled 幽灵行”；冷开永远拿不到 mid-history checkpoint |
| F3 | clone/fork 选择 **latest successful checkpoint**，用 `copyContainer(source.iModelId, new.iModelId)` 复制容器，写目标 checkpoint 行时直接沿用源 `changesetId` / `changesetIndex`；**不复制 changesets** | `imodelhub-services/src/imodels/imodels.service.ts`（`cloneOrFork`） | 对已编辑但只有 baseline 的文档，clone/fork 得到**空 baseline**；对 mid-history checkpoint，目标行指向源 changeset，跨文档语义悬挂 |
| F4 | changeset 的 `id` 是**全局主键**（40-hex / varchar(64)），`checkpoints.changesetId` FK → `changesets.id`（`ON DELETE SET NULL`）；`named_versions`、`changeset_groups`、`changeset_extended_data` 等也引用全局 `changesets.id` | `imodelhub-services/src/imodels/infrastructure/persistence/relational/entities/changeset.entity.ts`；`imodelhub-services/src/database/migrations/2026102922000-CheckpointForeignKeys.ts`；`20260305000003-CreateiModelTables.ts` | 当前插目标行**不会**因 FK 立即失败（源 changeset 行仍存在）；真正问题是跨 iModel 引用、源清理时 `SET NULL` 抹掉身份、以及**正确复制同 ID changeset 到目标会撞全局 PK** |
| F5 | `changesets` 已有 append-only 触发器：禁止 UPDATE `id/iModelId/index/parentId/prevHash/filePath/briefcaseId/fileSize`；DELETE 在 `fileUploaded` 或有子节点时拒绝。其子节点 EXISTS 查询**未按 iModelId 限定** | `imodelhub-services/src/database/migrations/20261122000001-ChangesetAppendOnlyTrigger.ts` | fork 复制历史必须走 INSERT；触发器需随 `(iModelId,id)` 复合身份改造，否则复制后源/目标互相“有子节点” |
| F6 | 官方 clone/fork 语义不是“只带 baseline”：clone/fork 总是复制 baseline，并复制**截至请求 changeset 的 changesets**（默认全部）；`changesetId:""`/`changesetIndex:0` 才只复制 baseline。`fork preserveHistory=false` 表示把 changesets **squash 进 baseline**（内容副本、无历史） | `docs/api-specs/imodels-v2.json`（clone/fork 描述与 `CloneiModel`/`ForkiModel` schema）；官方客户端 `clients/imodels-client-management/src/operations/imodel/IModelOperationParams.ts` | 当前实现与官方契约不符；“Duplicate（内容副本）”对应的是 `fork preserveHistory=false`，不是 `clone` |
| F7 | 官方 clone/fork 是异步操作：返回 201 + `Location`，客户端轮询 **Create Operation**（`GET /imodels/:id/operations/create`）直到 `successful`；目标 iModel 可先 `initialized` 再完成附加数据复制 | 官方客户端 `IModelOperations.clone/fork`、`waitForClonedIModelInitialization`；hub `imodelhub-services/src/imodels/operations/operations.controller.ts` | 当前 clone/fork 写的是 `OperationType.Clone/Fork`，`/operations/create` 查不到 → 官方 SDK 轮询 404；D3 必须改为生成 Create operation |
| F8 | 原生/CloudSqlite 生成素材已具备：`BriefcaseManager.downloadBriefcase` 支持 `asOf` + `briefcaseId:0`；`CloudSqlite.uploadDb/downloadDb/queryDatabase/queryDatabaseHash/deleteDatabase/cleanDeletedBlocks` 可用；`CheckpointManager.validateCheckpointGuids` 可自动改写 iModelId、对 iTwinId 不匹配硬失败 | `itwinjs-core/core/backend/src/BriefcaseManager.ts`、`CloudSqlite.ts`、`CheckpointManager.ts` | worker 可下载“目标 changeset 的只读 unassigned briefcase”作为 checkpoint 候选；跨 iTwin 必须显式处理 |
| F9 | WA 已有 CloudSqlite 容器创建/上传/回读校验/单飞与恢复；MS 已有 `IModelHost + BackendIModelsAccess + AzureClientStorage + 服务账号` 组装；MS 的 `openCheckpoint()` 仍是未实现桩 | `luban-backend/webhook-agent/src/baseline-generator.ts`、`lifecycle.ts`；`luban-backend/modeling-server/src/main.ts`、`ipc/AppFunctionIpcHandler.ts` | 生成逻辑可复用现有模式；只读版本打开属 D5，不在本设计内 |
| F10 | Hub 已有 Redis + BullMQ webhook 队列、cron job、事务级 advisory lock、软删 iModel 存储清理 job | `imodelhub-services/src/webhooks/queue/*`、`imodelhub-services/src/imodels/jobs/*`、`imodelhub-services/src/common/database/transaction.util.ts` | checkpoint 调度/outbox/claim 可复用同一基础设施，不引入第二套队列 |

**结论（对任务前提的精确化）**：mid-history checkpoint 之后 clone/fork 的当前故障不是“INSERT 时 FK 立即报错”，而是：
1. 目标 checkpoint 行引用**源 iModel 的 changeset**（跨文档引用，目标 changeset 列表为空）；
2. 源 changeset 后续被硬删/级联时 `ON DELETE SET NULL` 静默丢失目标 checkpoint 的版本身份；
3. 若要按官方语义复制 changeset 历史，同 ID 行会撞**全局 PK**；换新 ID 又会让 checkpoint 内嵌 changeset 身份与客户端校验失配。
因此 D3 必须先改造 changeset 身份（§3.5），不能只在 clone 代码里“补一个 FK 判断”。

---

## 1. 目标、非目标与不变量

### 1.1 目标

1. **真实 checkpoint**：在每 N 个 changeset（建议默认 100，允许 100–500）、Named Version、Release、手动触发、clone/fork 按需时，生成可云端只读打开的 CloudSqlite checkpoint。
2. **可验证**：每次成功必须经过生成端 readback（下载/打开/GUID/changeset/哈希）+ hub 端结构校验（目标、链根、容器、manifest）；失败有上限、告警、可重试。
3. **冷开基线**：200 / 1000 changeset 文档在 checkpoint 存在时，冷开只下载最近 checkpoint + 少量 changeset；给出 p50/p95 基线报告。
4. **账本正确**：checkpoint 只指向本 iModel 已封账（D1）的 changeset；不产生任何跨 iModel 引用。
5. **Clone/Fork 正确**：按官方语义复制 baseline + changesets（clone、fork preserveHistory=true），或 squash 出内容副本（fork preserveHistory=false）；绝不产出“空 baseline 冒充当前内容”。
6. **不产幽灵**：`scheduled` 必然有可领取/可重放的持久作业；`successful` 必然有已验证字节；GET 不对未成功 checkpoint 伪造容器/下载链接。
7. **可运维**：per-iModel 串行、重试上限、告警、审计、保留/GC、回滚开关。

### 1.2 非目标

- D5 的 `openCheckpoint`/按 version 只读打开（本设计只保证 checkpoint 数据可被 D5 消费）。
- D6 Named Version UI/409 等待语义/事件/计数（D4 只提供真实状态与 ready 判定）。
- 分支/合并（version graph）、跨 iModel merge。
- 跨 iTwin 的**历史复制**（D3 Phase C 之前显式拒绝；squash 路径可另行支持）。
- changeset 压缩/归档、全量 legal hold/配额（E6）。
- 多租户/HA 的 checkpoint 服务 SLA（沿用 G1 单栈假设；但设计不阻塞多实例）。
- 修改 `@luban-cad/shared` 或 Feature RPC（D4/D3 只动 hub REST + 私有后端，无 shared 版本 bump）。

### 1.3 不变量（实现必须编码/测试）

| ID | 不变量 | 强制点 |
|---|---|---|
| I1 | **成功 checkpoint 的内容不可变**：`(iModelId, changesetIndex, changesetId, dbName, contentSha256)` 一旦 `successful` 不再改指向；修复只能新建 generation 并在审计中记录 | DB 触发器/服务层白名单；生成端只允许新 dbName 或同一 dbName 的“未成功”重试 |
| I2 | **目标 changeset 必须已封账**：存在、`fileUploaded`、属于本 iModel、链头可达；不接受 `waitingForFile`/幽灵行 | 调度事务内校验 + FK |
| I3 | **per-iModel 串行**：同一 iModel 同时最多一个持有 lease 的生成作业；容器写入串行；只读回读可并发 | claim 事务 + advisory lock + CloudSqlite write lock |
| I4 | **Never phantom**：`scheduled` ⇔ 存在 active/replayable job；`successful` ⇒ `verifiedAt`、`fileSize>0`、稳定容器身份、哈希；未成功 GET 无 access info/download | 唯一写入口 + outbox + reaper + GET 投影 |
| I5 | **无跨 iModel 引用**：checkpoint 的 `changesetId` 必须是目标 iModel 的 changeset；目标不存在时只能 NULL + baseline 语义 | D3 复合 FK + 服务校验 |
| I6 | **Clone/Fork 安全顺序**：选成功且 verified 的 checkpoint → 复制字节 → 校验目标 → 单事务写元数据 → 标记 initialized/operation；失败补偿删除目标字节 | materializer 状态机 |
| I7 | **跨 iTwin fail-closed**：历史复制在 G1 一律 422；绝不 201 后首次打开才失败 | clone/fork 入口前置检查 |
| I8 | **凭据不落库/不回吐**：`directoryAccessInfo` 只存稳定身份；SAS/URL 读时现签；manifest 不含凭据 | `stripContainerCredentials` + 读时 `refreshContainerAccessInfo` |
| I9 | **幂等**：同一 target index 同一 dbName；jobId 去重；重复完成返回同一结果；重试不产生双成功行 | 唯一索引 + 幂等 complete |
| I10 | **生成器只读用户数据**：只下载只读 briefcase/checkpoint/changeset；不写 iModel、不拿用户 JWT、不写默认存储容器 | worker 权限面 + 代码审查 |
| I11 | **账本身份按 iModel 作用域**：D3 复制后目标 changeset 使用**相同 changeset id**，但归属目标 iModel；`(iModelId,id)` 唯一 | §3.5 schema |
| I12 | **checkpoint 目标精确**：行 `changesetIndex/changesetId` 必须等于生成目标；不接受“最近成功”代替目标 | complete 校验 |

---

## 2. 方案架构

### 2.1 生成进程选型

| 候选 | 能力 | 结论 | 理由 |
|---|---|---|---|
| **modeling-server（MS）** | 已有 `IModelHost`、`BackendIModelsAccess`、本地 briefcase 缓存、Windows native | **不作权威生成器** | 有状态交互会话进程、按用户/机器生命周期、可能随时被杀；生成 checkpoint 的 I/O/native 开销会与用户编辑争用；单实例假设下不是可靠作业面 |
| **webhook-agent（WA）** | Linux 容器、官方 npm native、CloudSqlite 容器初始化/上传/回读、hub 服务身份、baseline 单飞/恢复 | **可作 Phase 0 承载模块，但不作长期形态** | WA 已是 webhook/baseline 入口，加入重 checkpoint 作业会造成队头阻塞并耦合两条生命周期；但代码与凭据可复用 |
| **新 `checkpoint-worker`（推荐）** | 独立容器/进程，复用 WA 的 CloudSqlite 生成模式 + MS 的 hub 客户端组装；无 DB 权限、无用户 JWT | **目标形态** | 作业面隔离；可水平扩容（per-iModel lease 保证串行）；故障不拖垮 webhook/baseline；权限最小 |

**职责切分**：

- **Hub（控制面）**：调度、目标选择、状态机、lease/outbox、目标校验、manifest 落盘、公开 API 投影、告警/审计。Hub **不**打开 CloudSqlite/原生库。
- **Checkpoint worker（作业面）**：领取作业 → 下载目标 changeset 的只读 briefcase → quiesce/校验 → CloudSqlite 上传 → 独立 readback → 回报 `complete/failed`。worker 不写 DB；只调用 hub 的 agent 端点。
- **存储（数据面）**：CloudSqlite 块 + 默认容器中的 sidecar manifest。字节事实源仍是对象存储；DB 只是元数据指针。

**权限**：

- worker 使用独立 service account（`X-API-Key` + 服务 JWT），只允许读 changesets/checkpoints、claim/complete 自己 iModel 的 checkpoint；**不**持有 DB 口令、`AUTH_JWT_SECRET`、默认容器写权限。
- CloudSqlite 写/读使用 hub 现签的 **容器级短 TTL SAS**（5–15 分钟，写 `racwdl` / 读 `rl`），按目标容器 `{iModelId}` 限定；worker 不得自选容器。大 checkpoint 上传超过单次 SAS 时，worker 通过 CloudSqlite `tokenFn` 向 hub 续签（`POST .../storage-token`），不是把长 SAS 写盘/落库。
- sidecar manifest 由 hub 写入默认容器，避免给 worker 默认容器写权限。
- 日志不得出现 SAS、密码、完整 URL 查询串；只记录 hash/尺寸/索引。

### 2.2 触发与队列

#### 2.2.1 触发源

| 触发 | 条件 | 优先级 | 目标 | 说明 |
|---|---|---|---|---|
| **每 N changeset** | `head.index - latestSuccessful.index >= N`（默认 100，范围 100–500） | 中 | head | 在 `completeFileUpload` 提交后异步触发；周期 sweeper 兜底 |
| **Named Version** | NV 创建/其 changeset 已封账 | 高 | NV 的 changeset index（**精确**） | 不得复用更晚 checkpoint 冒充该版本；若同 index 已有成功行则复用 |
| **Release/发布** | 发布流程绑定 head | 高 | head | release 记录 `checkpointId + contentSha256 + chainRoot` |
| **手动** | 管理员/诊断 | 中 | 指定 index/head | 受配额/审计约束 |
| **Clone/Fork** | 需要目标点 K 的 checkpoint（squash 必需；历史复制可选，用于加速目标首开） | 最高 | K | 按需调度并在 operation 中等待 |
| **Backfill** | 存量文档已有大量历史 | 低 | 最新优先，向下每 N | 仅补 head + 最近窗口；历史深处按需 |
| **Sweeper** | 漏触发/NV 无 checkpoint | 低 | 补偿 | 每 5 分钟扫描，不重复建 active 行 |

**阈值语义**：`N` 是“距离最近成功 checkpoint 的 changeset 数”，不是“每个 N 的固定边界”。`head - latestSuccessfulIndex >= N` 即在当前 head 生成；允许后续 coalesce 到新 head（未 claim 时）。

#### 2.2.2 队列与 outbox

复用 hub 的 Redis/BullMQ（与 webhook 队列同一基础设施，独立 queue 名）：

- `checkpoint-generate`：生成作业。
- `checkpoint-verify`：独立复核（可后置）。
- `checkpoint-gc`：保留/删除作业。
- `clone-materialize`：D3 目标物化（§5.4 / §5.8）。

**事务性 outbox（避免“DB 有 scheduled、队列无 job”的幽灵）**：

1. 调度事务同时写 `checkpoints`（`scheduled`）与 `checkpoint_jobs`（`queued`，唯一 `checkpointId`）；**没有 job 行就不允许有 scheduled 行**。
2. `CheckpointJobDispatcher`（cron 10s）读取 `queued`/`dispatched` 超时行，投递 BullMQ，`jobId = checkpoint job id`（去重），写 `dispatchedAt`。
3. worker claim 成功写 `claimed + lease`；完成写 `done`；失败可按策略回到 `queued`（attempt++）或 `dead`（checkpoint `failed`）。
4. Redis 丢消息/重启：outbox 行仍在，dispatcher 重投；重复投递由 claim 条件与 jobId 去重吸收。
5. 进程在“提交 DB 后、投递前”崩溃：sweeper/dispatcher 兜底。

**per-iModel 串行**：
- 调度可以存在多个目标行（例如 NV 精确点 + 周期 head 点），但 **claim 时**在事务内取 `pg_advisory_xact_lock(hashtext('checkpoint-claim:'||iModelId))`，并检查该 iModel 是否有未过期 lease；有则返回 busy（作业延迟重试），不并行生成。
- 容器写入另有 CloudSqlite write lock 作最后防线。

**重试/退避**：
- 默认 5 次，指数退避 + jitter；retryable 错误回到 `queued`，非 retryable 直接 `failed`。
- 手动/NV `PUT` 可重置失败行（保留 `attemptCount` 总量与最后错误，审计记录）。
- 队列优先级：clone/fork > NV/release > periodic > backfill；同一 iModel 内部仍由 claim 串行。

### 2.3 对象存储布局

**容器模型：每 iModel 一个 CloudSqlite 容器 `{iModelId}`**（与 WA baseline、hub `getiModelCheckpointContainer`、现有 clone 的 `copyContainer` 假设一致）。

| 对象 | 容器 | 命名 | 写入方 | 生命周期 |
|---|---|---|---|---|
| baseline db | `{iModelId}` | `baseline.bim` | WA（创建 iModel 时） | 永久（随 iModel 清理） |
| changeset checkpoint db | `{iModelId}` | `checkpoint-<changesetIndex>.db` | checkpoint worker | 由保留策略管理 |
| baseline 容器元数据 | `{iModelId}` | `containertype=cloud-sqlite`、`blockSize=4M` | WA / 生成器（仅新容器初始化） | 容器级 |
| sidecar manifest | 默认容器（`AZURE_BLOB_CONTAINER_NAME`） | `imodels/{iModelId}/checkpoints/<index>/<dbName>.json` | **hub** | 与 checkpoint 行同生命周期 |
| 历史 legacy baseline 文件 | 默认容器 | `imodels/{iModelId}/baseline/<fileName>` | 旧创建路径 | 只读兼容 |

**硬规则**：

- **禁止按 Named Version 命名 db**（如 `checkpoint_<iModelId>_<nvId>.db`）。一个 changeset index 只有一个物理 checkpoint；NV 通过 `changesetId/index` 解析到它（可多 NV 共享同一 checkpoint）。
- **禁止对已存在容器调用 `initializeContainer`**：该调用会清空 manifest（等价删掉 baseline + 所有 checkpoint）。worker 必须先探测容器是否存在；不存在 → 非重试错误 `CheckpointContainerMissing`（转 baseline 修复告警），绝不能重建。
- 容器不存在 ≠ 创建机会：初始化后的 iModel 必须已有 baseline 容器；checkpoint 只追加 db。
- 块大小固定 4 MB（与现有 baseline 一致）；`checksumBlockNames` 决定内容块是否可跨 checkpoint 共享，需在环境验证并记录（见 §7 open questions）。
- 建议保留 **CloudSqlite 块级共享**：同一 iModel 的多份 checkpoint 只增量存变化块；但 `copyContainer` 会把容器内所有块复制到目标，clone 成本需压测。
- 凭据：容器身份 `baseDirectory={iModelId}`、`baseUrl`、`storage`、`storageType=azure` 可持久化；SAS 只在读取时现签。manifest 中不含凭据。

### 2.4 DB 状态机与 schema

#### 2.4.1 官方状态（对外不变）

`notGenerated | scheduled | successful | failed`（保持官方 enum 与 API 语义）。

```text
（无行 / notGenerated）
   │ schedule（事务：checkpoint 行 + job 行）
   ▼
 scheduled ──claim/attempt 成功且 complete 校验通过──► successful
   │  ▲
   │  └── retryable 失败（attempt < cap）── scheduled
   │
   └── 非重试或 attempt 达上限 ──► failed
failed ──手动/NV PUT 重新调度（审计）──► scheduled
successful ──独立 scrub 发现哈希/打开失败──► failed（隔离，另起 generation 修复）
```

**各状态字段约束**：

| 状态 | 必须 | 必须为空/不可用 |
|---|---|---|
| `scheduled` | 有 active/replayable job；`changesetId/index` 已定；`scheduledAt` | `directoryAccessInfo=null`；`downloadPath=null`；无下载链接；`fileSize=0`（除非保留上次失败尺寸仅作诊断） |
| `successful` | `verifiedAt`、`fileSize>0`、`dbName`、稳定 `directoryAccessInfo`、`contentSha256`、`manifestPath`、`chainRoot`（非 legacy） | 不存 SAS/URL；`downloadUrl` 恒 null |
| `failed` | `lastErrorCode/message`、`attemptCount` | 不暴露 access info/下载链接；不得被 clone/fork 选中 |

#### 2.4.2 `checkpoints` 增列（nullable，非破坏）

| 列 | 类型 | 用途 |
|---|---|---|
| `generationSource` | varchar(32) | `periodic / namedVersion / release / manual / clone / backfill / baseline` |
| `scheduledAt` / `startedAt` / `completedAt` / `verifiedAt` | timestamptz | 生命周期/告警 |
| `attemptCount` | int default 0 | 重试上限 |
| `lastErrorCode` / `lastErrorMessage` | varchar/text | 失败诊断 |
| `manifestPath` | varchar | sidecar 稳定路径（不含签名） |
| `manifestSha256` | varchar(64) | sidecar 规范化 JSON 哈希 |
| `contentSha256` | varchar(64) | 回读得到的 db 字节 SHA-256 |
| `cloudSqliteHash` | varchar(64) | `queryDatabaseHash`（SHA-1）快速比对 |
| `chainRoot` | varchar(64) | 截至目标的账本链根（§2.5） |
| `generatorVersion` | varchar(64) | worker 版本/镜像 digest 可追溯 |
| `headChangesetIndexAtSchedule` | int | 调度时 head（诊断 coalesce） |
| `retiredAt` / `retiredReason` | timestamptz/varchar | 保留策略 tombstone（不物理删行） |

#### 2.4.3 `checkpoint_jobs`（内部 outbox/claim）

| 列 | 说明 |
|---|---|
| `id` uuid PK | BullMQ `jobId` 来源 |
| `checkpointId` uuid UK, FK → checkpoints(id) CASCADE | 一个目标一行 |
| `iModelId` uuid（冗余/索引） | 便于 claim 扫描 |
| `state` | `queued / dispatched / claimed / done / dead` |
| `priority` int | 调度优先级 |
| `attempt` int | 当前尝试 |
| `leaseOwner` / `leaseExpiresAt` | worker 身份/租约（默认 30 min，心跳 2 min） |
| `dispatchedAt` | 投递时间 |
| `lastErrorCode/message` | 最近错误 |
| `createdAt/updatedAt` | 审计 |

#### 2.4.4 唯一约束与索引

- `UNIQUE (iModelId, changesetIndex)` on `checkpoints`：**一个 changeset index 只有一个物理 checkpoint 行**。失败重试复用同一行；NV/周期触发同 index 复用。
- `UNIQUE (checkpointId)` on `checkpoint_jobs`。
- `(iModelId, state)`、`(iModelId, changesetIndex DESC)`、`(state, leaseExpiresAt)` 索引用于 sweeper/claim。
- **迁移前去重**：现存库可能有 baseline 行 + 多个 NV scheduled 行指向同一 index；迁移先按“successful > scheduled > failed、较新优先”保留一行，其余合并/删除并记录审计。旧库 fixture 必须覆盖。

**Named Version 解析**：不再要求每 NV 一行。`GET/PUT namedversions/:id/checkpoint` 先按 `namedVersionId` 查；未命中则用 NV 的 `changesetId/index` 查目标 changeset 的 checkpoint（可多 NV 共享）。`namedVersionId` 列仅作“首个触发来源”审计，不作唯一关联。

### 2.5 Manifest 与哈希

每个成功 checkpoint 在默认容器写 sidecar（hub 写），示例：

```json
{
  "schemaVersion": 1,
  "iModelId": "<uuid>",
  "iTwinId": "<uuid>",
  "changesetId": "<40-hex>",
  "changesetIndex": 128,
  "changesetCount": 128,
  "baseCheckpointIndex": 100,
  "chainRoot": "<sha256-hex>",
  "legacyChain": false,
  "container": { "baseDirectory": "<iModelId>", "storageType": "azure" },
  "dbName": "checkpoint-128.db",
  "dbSize": 12345678,
  "blockCount": 42,
  "blockSize": 4194304,
  "contentSha256": "<sha256-hex>",
  "cloudSqliteHash": "<sha1-hex>",
  "generatedAt": "2026-11-22T00:00:00Z",
  "generator": { "name": "checkpoint-worker", "version": "<image-digest>" },
  "readback": { "verifiedAt": "...", "verifiedSize": 12345678, "openedReadonly": true }
}
```

- **`contentSha256`**：对 quiesce 后的候选 db 文件字节做 SHA-256；readback 下载后再算一次并比对。
- **`cloudSqliteHash`**：`CloudSqlite.queryDatabaseHash(dbName)`，作为低成本一致性检查。
- **`chainRoot`**：账本链根。定义为将 `index 1..N` 的 `chainHash` 按序拼接（`index|changesetId|chainHash\n`）后的 SHA-256；baseline 不计。hub 用 DB 中的 `changesets.chainHash` 独立重算并比对；任何 `chainHash` 为 null（legacy）时 `legacyChain=true` 且 `chainRoot=null`，是否允许由 `CHECKPOINT_ALLOW_LEGACY_CHAIN` 决定（默认拒绝，先修复账本）。
- **`baseCheckpointIndex`**：worker 实际用于 apply 的最近成功 checkpoint index，辅助诊断“从哪个点增量生成”。
- **`manifestSha256`**：sidecar 规范化 JSON（键排序、无空白）的 SHA-256，写入 `checkpoints.manifestSha256`；读路径无需下载 sidecar。
- manifest 不含 SAS、下载 URL、用户信息、私有路径。

### 2.6 回读校验（Readback）

**生成端物理校验（worker，必须全过）**：

1. 下载目标 changeset 的只读 unassigned briefcase（`briefcaseId=0`, `asOf=target`）。
2. Quiesce：无 pending txns、briefcaseId=0、无 WAL/SHM 残留（或已 checkpoint 合并）；关闭所有连接。
3. 只读 native 打开：`iModelId`、`iTwinId`、`getCurrentChangeset().id/index` 必须等于目标；文件大小 > 0。
4. CloudSqlite 写入后，使用**全新 read-only cache/container**（不复用写连接）：
   - `queryDatabase(dbName).totalBlocks > 0`；
   - `downloadDb` 到临时文件；
   - 重新计算大小/SHA-256，与上传前一致；
   - native 只读打开并通过 GUID/changeset/无 pending txn 校验；
   - `queryDatabaseHash` 与写入后读值一致。
5. 任一步失败：不调用 complete；按错误分类重试（readback 可见性窗口允许 ~30s 重试）。

**Hub 结构校验（complete 时）**：

- 目标行仍为同一 `scheduled` 目标且 lease 属于该 worker；
- `changesetId/index` 属于本 iModel、`fileUploaded`、链可达；
- `dbName` 严格匹配 `^checkpoint-\d+(-g\d+)?\.db$` 且 index 与目标一致；
- `chainRoot` 与 DB 重算值一致（或 legacy 策略允许）；
- 容器身份固定为 `{iModelId}`（**不接受 worker 传入任意容器**）；
- 新增 `StoragePort` 能力：`containerExists(container)` 与 `containerBlobExists(container, 'manifest.bcv')`（Azure adapter 实现；不支持容器概念的后端显式拒绝）；
- 尺寸/哈希格式/上限；manifest 字段与目标一致；
- 通过后 hub 写 sidecar → 更新行 `successful`。

**独立复核（D4b/E8）**：周期 scrubber 重新下载 latest N 个成功 checkpoint 并重算哈希/打开；不匹配 → `failed` 隔离 + 告警 + 冷开自动回退到前一个成功 checkpoint。G1 先以“生成端 readback + hub 链根校验”为门；scrubber 作为硬化项。

### 2.7 保留与 GC

**保留集合（per iModel）**：

1. baseline（index 0，永不由 checkpoint GC 删除）；
2. 最新成功 checkpoint（head 可用性）；
3. 每个 Named Version 绑定的 checkpoint（D6 依赖）；
4. 最近 K 个成功 checkpoint（默认 3，可配 3–10）；
5. 持有 clone/fork **snapshot lease** 的 checkpoint；
6. Release/legal hold 引用（后续 E6）。

**退役流程**：

1. hub 计算非保留集合，先写 `retiredAt/retiredReason`（tombstone），不立即删字节；
2. 宽限 ≥24h，避免预热客户端继续用旧行；
3. `checkpoint-gc` 作业由 worker 执行：CloudSqlite 写连接 + write lock → `deleteDatabase(dbName)` → `cleanDeletedBlocks({nSeconds: ≥3600, findOrphanedBlocks:true})`；
4. 失败降级为告警，不阻塞生成；
5. 行不物理删除（历史/审计），GET 对 retired 行按“不存在”处理并回退到更早 checkpoint。

**与 iModel 删除的关系**：现有 `DeletedIModelStorageCleanupJob` 在软删 30 天后删整个 `{iModelId}` 容器与 checkpoint 行；D4 需在该 job 中先取消/标记该 iModel 的 active job，避免“删除后仍生成”。

**Clone/Fork snapshot lease**：clone/fork 选择 checkpoint 后写 `checkpoint_jobs` 或独立 `checkpoint_snapshot_leases`（lease TTL 1h），GC 跳过 leased 行；复制完成/失败后释放。

---

## 3. 关键时序

### 3.1 调度（Hub）

```text
触发（changeset complete / NV / release / manual / clone / sweeper）
  │
  ├─ 事务开始
  │   advisory lock: checkpoint-schedule:{iModelId}
  │   校验 iModel initialized + baseline successful + 目标 changeset fileUploaded
  │   按 (iModelId, changesetIndex) 查找已有 checkpoint 行
  │     无 → INSERT scheduled + INSERT checkpoint_jobs(queued)
  │     failed → 若允许重排：重置 scheduled + job queued（attempt++/审计）
  │     scheduled → 确保 job 行存在（否则修复）
  │     successful → 直接返回（NV 复用；不重复生成）
  │   多个目标：NV 精确点优先；周期点未 claim 可 coalesce 到 head
  │   事务结束
  ▼
dispatcher（10s）→ BullMQ checkpoint-generate(jobId=checkpointJobId)
  │     失败则 outbox 行保留，下一 tick 重投
  ▼
worker claim（事务）
  advisory lock: checkpoint-claim:{iModelId}
  检查该 iModel 无未过期 lease
  UPDATE job SET claimed, leaseOwner/ExpiresAt, attempt=attempt+1
  UPDATE checkpoint SET startedAt, attemptCount=attemptCount+1
  返回目标描述（changesetId/index、iTwinId、dbName、容器、chainRoot 期望）
```

**调度必须不做的事**：不复制/不扫全表重算哈希；不对未封账 changeset 建行；不在无 job 的情况下写 `scheduled`。

### 3.2 生成、上传、校验、完成（Worker）

```text
1. claim 成功（否则 409/busy，延迟重试）
2. 准备隔离 cache 目录（per job；进程启动清理陈旧目录）
3. hub 换取短 TTL 容器 SAS（写/读分离）
4. BriefcaseManager.downloadBriefcase({
     iTwinId, iModelId, briefcaseId: 0,
     asOf: targetChangeset, fileName: <unique temp>
   })
5. quiesce + 只读校验（GUID/changeset/no pending txn/no WAL）
6. 计算 contentSha256/dbSize/blockCount
7. CloudSqlite.createCloudContainer({ containerId: iModelId, storageType:'azure',
     baseUri, accessToken: writeSas, writeable:true })
   - 容器不存在 → 非重试错误（不 initialize！）
   - 已存在 → connect + checkForChanges
8. withWriteLock({user:'checkpoint-worker'}):
     uploadDb(container, { dbName:'checkpoint-<index>.db', localFileName })
9. disconnect；全新 read-only cache/container 做 readback（§2.6）
10. POST /internal/imodels/{iModelId}/checkpoints/{checkpointId}/complete
      body: {dbName,fileSize,contentSha256,cloudSqliteHash,chainRoot,blockCount,
             baseCheckpointIndex,generatorVersion,readback}
11. hub 校验 + 写 sidecar + 行 successful + job done
12. 清理临时 db/cache；释放 lease（失败路径同样清理）
```

**心跳**：每 2 分钟 `POST .../heartbeat` 续 lease；lease 过期由 reaper 重新排队。worker 被杀不会留下成功行。

**候选 checkpoint 的来源**：`downloadBriefcase` 下载的是“最近可用 checkpoint + 后续 changesets 应用到目标”的 unassigned briefcase；这正是可上传的 checkpoint 候选。**不直接复制用户正在编辑的 briefcase**，避免锁/未提交事务/本地状态污染。

### 3.3 完成与“写行”顺序

```text
hub complete:
  1. 幂等检查：若已 successful 且 contentSha256 相同 → 200 返回现状
  2. 校验 lease/target/dbName/chainRoot/尺寸/容器存在
  3. 写 sidecar manifest 到默认容器（稳定路径；覆盖幂等）
  4. DB 事务：
       re-check target/lease
       UPDATE checkpoints SET state='successful', verifiedAt, fileSize, dbName,
         directoryAccessInfo=<稳定身份>, contentSha256, chainRoot, manifestPath,
         lastError=null, completedAt
       UPDATE checkpoint_jobs SET state='done'
     （directoryAccessInfo 由 hub 按 {iModelId} 构造，凭据读时现签）
  5. 返回 {checkpoint:{state:'successful',changesetIndex,dbName,...}}
```

- sidecar 写失败 → 503，行保持 `scheduled`，可重试；不会出现“行成功但无 manifest”。
- DB 更新失败 → sidecar 成为孤儿，下一次尝试覆盖；不会出现“manifest 成功但行未成功且无重试”。
- 任何情况下不得把 `fileSize=0`/无容器的行置为 successful。

### 3.4 失败、重试与告警

**错误分类**：

| 错误码（内部） | 场景 | 重试 | 最终状态 |
|---|---|---|---|
| `CONTAINER_MISSING` | 目标 iModel 无 baseline 容器 | 否 | failed + 告警（走 baseline 修复） |
| `CHANGESET_NOT_FOUND` / `CHANGESET_NOT_UPLOADED` | 目标行消失/未封账 | 否 | failed |
| `GUID_MISMATCH` / `ITWIN_MISMATCH` | 候选 db 的 GUID/iTwin 与目标不符 | 否 | failed（数据损坏） |
| `LEGACY_CHAIN_FORBIDDEN` | 链上有 null chainHash 且策略禁止 | 否 | failed |
| `SIZE_LIMIT_EXCEEDED` | db 超过配置上限 | 否 | failed |
| `STORAGE_5XX` / `SAS_EXPIRED` / `UPLOAD_TIMEOUT` | 对象存储/SAS 瞬时故障 | 是 | scheduled → retry |
| `READBACK_NOT_VISIBLE` | manifest/块可见性窗口 | 是（≤30s 轮询） | retry |
| `WRITE_LOCK_TIMEOUT` | 容器写锁被占 | 是 | retry |
| `LEASE_LOST` / `HUB_5XX` / `DUPLICATE_DELIVERY` | 租约/网络/重复消息 | 是 | retry |
| `ATTEMPTS_EXHAUSTED` | 达 5 次上限 | 否 | failed |

**恢复**：

- reaper（2 分钟）：`claimed` 且 `leaseExpiresAt < now()` → 重新 `queued`（attempt++）；`scheduled` 但 job 缺失/`dead` → 修复或 failed。
- 手动/NV `PUT` 可重排 failed（审计），但保留历史错误与 attemptCount。
- 告警：`scheduled` 超过 15 分钟无 claim、failed 行、readback 失败率、队列深度、lease 过期、success rate < 99%、存储 5xx。
- 清理：临时 briefcase/cache 每次作业 finally 删除；失败上传的孤儿块由 `cleanDeletedBlocks(findOrphanedBlocks:true)` 周期清理；iModel 删除时取消作业。

### 3.5 FK 与账本身份（D3 硬依赖）

#### 3.5.1 当前形态的问题

- `changesets.id` 是**全局 PK**；`checkpoints.changesetId → changesets.id`。因此：
  - 目标行写源 changeset id：源行存在时 INSERT 成功，但这是跨文档引用；源 changeset 硬删时 `SET NULL` 抹掉目标 checkpoint 的版本身份；
  - 复制 changeset 历史到目标：同 id 撞全局 PK；换 id 则 checkpoint 内嵌 `changesetId`（native local value）与客户端 `verifyCheckpoint` 不匹配。
- 因此不能通过“补外键检查/加 ON DELETE”解决，必须引入**按 iModel 作用域的 changeset 身份**。

#### 3.5.2 目标 schema（建议）

1. `changesets` 增加合成主键 `pk uuid`（或改为复合 PK `(iModelId,id)`；推荐合成键，减少仓储层改动）；
2. `id` 降为普通列 `varchar(64) NOT NULL`，加 `UNIQUE (iModelId,id)`；
3. 自引用：`FK_changesets_parent (iModelId,parentId) → changesets(iModelId,id) ON DELETE SET NULL (parentId)`（PostgreSQL 17 支持列级 SET NULL，避免把 `iModelId` 置空）；
4. 子表复合 FK：
   - `named_versions (iModelId,changesetId) → changesets(iModelId,id)`（保持 CASCADE）；
   - `checkpoints (iModelId,changesetId) → changesets(iModelId,id) ON DELETE SET NULL (changesetId)`；
   - `changeset_groups`、`changeset_group_members`、`changeset_extended_data`、`changeset_groups_v2` 等所有现有 `changesetId` 引用补 `iModelId` 或复合键（逐表登记）；
5. append-only 触发器的子节点 EXISTS 改为按 `iModelId` 限定；
6. 所有 `findOne({id})` 形式的 changeset 查询改为 `(iModelId,id)`（重复 id 检查、parent 检查、group 成员等）。

**迁移顺序**（单事务或分步 + dry-run）：备份 → 去重/校验 → 加 `pk`/unique → 建复合 FK → 更新触发器 → 旧 fixture 回归。`down` 在目标 iModel 已复制同 id changeset 时不可逆（全局 PK 冲突），必须在文档/CLI 中阻止。

#### 3.5.3 Fork 复制链哈希

- 目标 changeset 使用**相同 id**，但 `iModelId` 不同；`computeChangesetChainHash` 包含 `iModelId`，因此复制时按目标 iModel **重新计算** `prevHash/chainHash`（INSERT 时写，避免触发 UPDATE 禁令）。
- 源账本不变；目标成为独立账本（同 changeset 内容身份、不同本地链哈希）。`chainRoot` 在目标按目标链重新计算并写入目标 checkpoint manifest。
- 复制 `parentId` 保持源 id（在目标同 id 行上有效）。

#### 3.5.4 D4 的临时边界

- D4 生成的 checkpoint **只写本 iModel 的 changeset id**；baseline 行 `changesetId=NULL`。
- 在 D3 schema 迁移完成前，**不允许**任何路径把源 changeset id 写入目标 checkpoint 行。临时策略：
  - `clone` 仅允许 `changesetIndex:0`/`changesetId:""`（官方 baseline-only 语义）；其他请求返回 501/422 `CloneHistoryRequiresLedgerMigration`；
  - 或直接关闭 clone/fork（503），避免继续产出空 baseline/悬挂行。
  - 绝不保留当前“复制最新 baseline 却宣称 clone 当前内容”的行为。

---

## 4. API / 元数据契约与失败恢复

### 4.1 对外 iModels API（保持官方契约）

| 端点 | D4 行为 |
|---|---|
| `GET /imodels/:id/briefcases/checkpoint` | 仍只返回 latest **successful**；无则 404 `CheckpointNotFound` |
| `GET /imodels/:id/changesets/:idOrIndex/checkpoint` | 精确行存在（含 scheduled/failed，官方允许 state）则返回该行；否则回退到 `changesetIndex <= 请求值` 的最新 successful（现有 current-or-preceding 行为保持） |
| `GET /imodels/:id/namedversions/:versionId/checkpoint` | 解析到该 NV 的精确目标 checkpoint；scheduled 行可返回 scheduled；D6 决定未 ready 的 409/等待语义 |
| `PUT /imodels/:id/namedversions/:versionId/checkpoint` | **改为真实调度**：已有 successful → 原样返回；failed → 重排；scheduled → 确保 job；绝不写无 job 行 |
| clone/fork | 见 §5；异步 Create operation；跨 iTwin 历史复制 422 |

**未成功 checkpoint 的响应约束**：`directoryAccessInfo=null`、`_links.download` 不存在、`fileSize=0`（scheduled）/诊断值（failed）；不得返回可下载 URL。

### 4.2 内部 agent API（不对公共 SDK/前端暴露）

| 方法/路径（建议） | 用途 | 幂等/状态 |
|---|---|---|
| `POST /internal/imodels/:id/checkpoints/schedule` | 手动/内部触发（body: `changesetId`/`index`, `reason`） | 已有 active/成功则返回现状；权限 `imodels_manage` 或 agent key |
| `POST /internal/imodels/:id/checkpoints/:checkpointId/claim` | worker 领取，返回目标与短 TTL 存储 SAS | lease 忙 → 409 `CheckpointJobBusy` |
| `POST .../:checkpointId/heartbeat` | 续 lease | lease 丢失 → 409 `CheckpointLeaseLost` |
| `POST .../:checkpointId/complete` | 物理校验结果 + manifest 字段 | 幂等；同 digest 200，冲突 409 |
| `POST .../:checkpointId/failed` | 分类失败 | attempt < cap → 保持 scheduled；否则 failed |
| `POST .../:checkpointId/release` | 主动释放 | 幂等 |
| `POST .../:checkpointId/storage-token` | 续签容器读/写 SAS（CloudSqlite `tokenFn`） | 5–15 min；只按 checkpoint 目标容器签发 |
| `POST /internal/imodels/:id/checkpoints/:checkpointId/snapshot-lease` | clone/fork 保护源 checkpoint | TTL 1h；释放幂等 |

- 全部走 `AgentApiKeyGuard` + 服务 JWT；路由与官方控制器分开注册（避免 `briefcases/checkpoint` 之类路径遮蔽；现有 CheckpointsController 必须先于 BriefcasesController 的规则继续保持）。
- 请求/响应只含稳定标识与哈希；不接受 worker 指定容器/URL/SAS。

### 4.3 元数据字段（manifest 与 DB 的对应）

| 字段 | DB | manifest | 说明 |
|---|---|---|---|
| `iModelId` / `iTwinId` | 行 `iModelId` + iModel 行 | ✓ | 目标归属 |
| `changesetId` / `changesetIndex` | ✓ | ✓ | 目标精确 |
| `dbName` | ✓ | ✓ | `checkpoint-<index>.db` |
| `fileSize` / `dbSize` | ✓ | ✓ | 回读字节数 |
| `contentSha256` | ✓ | ✓ | 字节哈希 |
| `cloudSqliteHash` | ✓ | ✓ | 容器快速哈希 |
| `chainRoot` / `legacyChain` | ✓ | ✓ | 账本绑定 |
| `manifestPath` | ✓ | 路径自身 | `imodels/{iModelId}/checkpoints/...` |
| `generatorVersion` | ✓ | ✓ | 镜像 digest/版本 |
| `readback` | `verifiedAt` | ✓ | 生成端物理校验证据 |
| SAS / downloadUrl | **不存** | **不含** | 读时现签 |

### 4.4 错误码（业务错误注册表新增）

| code | HTTP | 含义 | 重试性 |
|---|---|---|---|
| `CheckpointNotReady` | 409 + `Retry-After` | 版本打开（D5）/同步路径需要 checkpoint 但尚在生成 | 客户端稍后重试 |
| `CheckpointGenerationFailed` | 409/422 | 目标 checkpoint 最终失败 | 需重排/诊断 |
| `CheckpointJobBusy` | 409 | 同 iModel 已有生成 lease | 稍后 |
| `CheckpointLeaseLost` | 409 | worker 租约过期/被接管 | 重新 claim |
| `CheckpointVerificationFailed` | 422 | 链根/manifest/目标/GUID 校验失败 | 视分类 |
| `CheckpointContainerMissing` | 503/422 | 目标 iModel 无 baseline 容器 | 否（修 baseline） |
| `CheckpointTargetNotUploaded` | 422 | 目标 changeset 未封账 | 否 |
| `CheckpointAlreadyExists` | 内部 409 | 内部 schedule 撞同 index 成功行（公开 PUT 返回现有 successful 200） | 否（复用） |
| `CrossITwinHistoryCopyUnsupported` | 422 | 跨 iTwin 历史复制未支持 | 否 |
| `CloneHistoryRequiresLedgerMigration` | 501/422 | D3 账本迁移未完成 | 否 |
| `CloneMaterializationFailed` / `ForkMaterializationFailed` | operation.error | D3 物化失败 | 视原因 |
| `MainIModelIsMissingFederationGuids` | operation.state | squash 前提失败 | 否（先补 FederationGuid） |

### 4.5 失败/恢复原则

- **Retry cap**：per checkpoint 5 次；attempt 持久化；超限 failed + 告警，不无限重试。
- **Alert**：见 §3.4；关键告警接入现有 metrics（P2-04）与日志，不引入第二套监控。
- **No phantom**：唯一写入口 + outbox + reaper + GET 投影；测试必须覆盖“Redis 丢消息/进程崩溃/重复投递”仍无幽灵。
- **Cleanup**：临时文件/缓存 finally 清理；失败上传的孤儿块由 GC；软删 iModel 取消 job；clone 失败删除目标容器/前缀。
- **审计**：schedule/claim/complete/fail/retire/snapshot-lease 写结构化日志（requestId、iModelId、checkpointId、attempt、hash、errorCode）；B7 落地后进 append-only 审计。

---

## 5. Clone / Fork 语义（D3）

### 5.1 官方语义（以 API spec/官方客户端为准）

| 请求 | baseline | changesets | 结果 |
|---|---|---|---|
| `clone` 无 changeset 参数 | 复制 | **全部** | 目标 head = 源 head |
| `clone changesetIndex=K` | 复制 | 1..K | 目标 head = K |
| `clone changesetIndex=0` / `changesetId:""` | 复制 | 无 | 仅 baseline |
| `fork preserveHistory=true` | 复制 | 1..K（默认全部） | 历史保留 |
| `fork preserveHistory=false` | 复制并 squash 到 K | 无 | 内容为 K，无历史 |
| 其他实体（NV/briefcase/lock/group/permission） | 不复制 | — | 官方“rest of source entities are not copied” |

- clone/fork 均是**异步**；target 可先 `initialized`，Create Operation 之后 `successful`；客户端轮询 `/operations/create`。
- fork squash 需要源元素具备 FederationGuid；缺失时 operation state=`mainIModelIsMissingFederationGuids`。

### 5.2 当前实现偏差（D3 必须修）

1. clone/fork 只复制 latest checkpoint 容器，**不复制 changesets** → 编辑过的文档得到空 baseline；
2. 目标 checkpoint 行引用源 changeset id，目标无 changeset 行；
3. `changesetId/index` 参数仅允许等于 latest checkpoint，不支持“任意 ≤ head 的复制点”；
4. 没有 squash 路径，`preserveHistory` 只进 operation metadata；
5. 写 Clone/Fork operation，官方客户端轮询 Create operation 404；
6. 跨 iTwin 复制容器不重写 iTwinId，201 后首次打开才 `ValidationFailed`。

### 5.3 “Duplicate”与“Fork with history”的术语

- **History copy** = `clone`（任意 K）或 `fork preserveHistory=true`：复制 baseline + changesets 1..K + （可选）checkpoint dbs；目标账本线性独立。
- **Duplicate（内容副本）** = `fork preserveHistory=false`：在 K 处 squash 成新 baseline，目标 changesetCount=0。
- 产品文案不得把 `clone` 称为“仅复制当前内容”；也不得把“preserveHistory=false”只写成 metadata。

### 5.4 History Copy 管线（D3 Phase A/B）

前置：§3.5 的 `(iModelId,id)` 身份迁移完成；否则不开启。

```text
POST clone/fork
  │
  ├─ 校验源 iModel 可读、目标 iTwin 可 manage
  ├─ 解析 K（默认 head；index 0 = baseline-only；K 必须 <= head）
  ├─ 跨 iTwin 且 history copy → 422（G1）
  ├─ 选 checkpoint：
  │     · K 有成功 checkpoint → 用它（目标首开最快）
  │     · 否则选 <= K 的最新成功 checkpoint（可为 baseline）
  │     · squash 必须要有 K 的 checkpoint：无则调度并等待
  ├─ 创建目标 iModel（notInitialized）+ Create operation（scheduled）
  │     metadata: {mode, sourceIModelId, sourceChangesetId/Index,
  │                preserveHistory, copiedCheckpointId, sourceContentSha256}
  ├─ 201 + Location + operation link
  ▼
clone-materialize worker（异步）
  1. snapshot lease 源 checkpoint（防 GC）
  2. copyContainer(source.iModelId → target.iModelId)（server-side）
     - 目标容器必须带与源一致的 CloudSqlite 元数据（containertype/blockSize/json）
     - 校验目标容器 manifest.bcv 存在
  3. 复制 changeset 行 1..K（INSERT，同 id、目标 iModelId；重算 prevHash/chainHash）
     + copyPrefix(imodels/{source}/changesets/ → imodels/{target}/changesets/)
     - 只复制 1..K；不复制 group/extended data/NV/briefcase/lock
  4. 复制成功 checkpoint 行 <= K（目标 iModelId、目标 changeset id、目标容器身份）
     - 复制 fileSize/contentSha256/cloudSqliteHash/chainRoot（目标链重算）/manifest 元数据
     - baseline 行 changesetId=NULL, index=0
  5. 目标 iModel: initialized, baselineBriefcaseId=新 uuid, baselineChangesetIndex=源基线值,
     changesetCount=K, namedVersionCount=0, briefcaseCount=0, fileSize=baseline size
  6. Create operation → successful（或按“附加数据”两阶段：先 initialized，后 successful）
  7. 释放 snapshot lease
失败：Create operation=failed/error；删除目标容器与已复制前缀；目标不得 initialized。
```

**可选的 checkpoint 复制**：历史复制的**正确性不依赖** mid checkpoint；没有 checkpoint 时目标首次打开会从 baseline 重放 1..K（慢但正确）。复制 checkpoint 是为了性能；若源没有 ≤K 的成功 checkpoint，可不复制，或先调度生成 K 的 checkpoint 再物化（优先保证 clone 体验时使用）。

**Copy 粒度**：
- `copyContainer` 当前复制整容器（baseline + 所有 checkpoint db）。目标可能拿到 >K 的 checkpoint dbs；这些 db 在目标无行引用，后续 GC 清理。若复制成本过高，D3 可改为“只复制 baseline + 所需 checkpoint”的 manifest 级复制（需要解析 CloudSqlite manifest，见 open questions）。
- changeset blobs 位于默认容器 `imodels/{iModelId}/changesets/...`；新增 `StoragePort.copyPrefix(sourcePrefix, targetPrefix)`（服务端逐 blob copy，幂等）。

### 5.5 Squash 管线（D3 Phase C，gated）

- 触发：`fork preserveHistory=false`（Duplicate）。
- 前置：K 的 checkpoint 已成功且 readback 通过；源元素具备 FederationGuid。
- 实现：使用与官方 fork 等价的原生 **iModel transformation**（元素级复制到新 baseline），而不是文件级改 local value：
  1. worker 打开 K 的只读 checkpoint/briefcase；
  2. 创建目标 iModel 的新 baseline（空 iModel）；
  3. transformer 复制元素/关系/几何到目标 baseline，写入目标 iModelId/iTwinId；
  4. 上传目标 `baseline.bim`（CloudSqlite）；
  5. 目标 changesetCount=0、无 changeset/checkpoint 行（baseline index 0）；
  6. 校验目标可打开、体积/特征数与 K 一致（测试断言）。
- 失败：缺 FederationGuid → Create operation state `mainIModelIsMissingFederationGuids`；transform 失败 → operation failed；目标不 initialized。
- **风险**：LubanCAD 的原生 BRep/geometry stream/Feature 数据是否能被 transformer 完整复制需 S0 级 spike；在通过前，squash 保持 `blocked-design`，不得用“复制 checkpoint 文件 + 改 local value”冒充。

### 5.6 跨 iTwin GUID 处理

| 路径 | iModelId | iTwinId | G1 决策 |
|---|---|---|---|
| History copy 同 iTwin | 目标新 id；客户端首次写打开会 `validateCheckpointGuids` 自动改写 | 相同 | **支持** |
| History copy 跨 iTwin | 同上 | 不同 → native 硬失败 | **422 `CrossITwinHistoryCopyUnsupported`**（绝不 201 假成功） |
| Squash 同/跨 iTwin | transformer 写入目标 id | transformer 写目标 iTwinId | Phase C 支持（依赖 spike） |
| 仅 baseline（index 0）跨 iTwin | 复制 baseline 后仍需 iTwin 改写 | 不同 | 同样 422，直到 squash/re-stamp 能力落地 |

- `directoryAccessInfo` 的容器身份与 iTwin 无关；GUID 在 db 内部。
- 若未来支持跨 iTwin 历史复制，必须由原生作业重写每个复制 checkpoint db 的 iTwinId 并重算哈希/新建 generation；不能只改 DB 行。

### 5.7 复制/不复制清单

| 实体 | Clone / Fork history | Fork squash | 说明 |
|---|---|---|---|
| baseline db + 容器 | 复制 | 生成新 baseline | 容器身份改为目标 iModelId |
| changeset 行 + blobs（1..K） | 复制（同 id） | 不复制 | 需 §3.5 身份 |
| checkpoint 行 + dbs（≤K） | 复制（可选/性能） | 不复制（K checkpoint 仅作输入） | 只选 successful+verified |
| Named Versions | 不复制 | 不复制 | 官方“rest of entities” |
| briefcases / locks / groups / extended data | 不复制 | 不复制 | 避免第二套历史 |
| thumbnails / tiles | 不复制（后续性能可选项） | 不复制 | 可由 viewer 重建 |
| permissions / shares / ACL | 不复制 | 不复制 | 目标 iTwin 的权限独立 |
| `baselineBriefcaseId` | 新 uuid（源值记入 operation metadata） | 新 uuid | 不沿用源身份 |
| extent / containers / dataCenter | 复制 | 复制 | 与官方描述一致 |
| name/description | 请求覆盖，否则源值；fork description 可加后缀 | 同 | 保持现有语义 |

### 5.8 Create Operation 与异步物化

- 目标 iModel 创建时必须写 **`OperationType.Create`**（`/operations/create` 是官方客户端唯一轮询入口）。可另写 Clone/Fork 审计 operation，但不得替代 Create。
- 状态机：`scheduled → successful`；失败 `failed`；squash 特例 `mainIModelIsMissingFederationGuids`。
- 目标 `state=initialized` 可在“baseline + changesets + 最新 checkpoint（如复制）”完成后先置；Create operation 在附加数据（其余 checkpoint/tiles）完成后置 successful。客户端 `clone()`/`fork()` 等待 operation successful；期间 target 可能已可打开。
- 失败补偿：删除目标容器/前缀；目标保持 notInitialized 或按策略软删；operation failed；不得留下“initialized 空文档”。

---

## 6. 测试矩阵

### 6.1 单元测试（Hub）

| 用例 | 断言 |
|---|---|
| N 阈值 | 99 不调度；100 调度 head；`N` 越界拒绝 |
| coalesce | 未 claim 的 scheduled 行可更新到新 head；已 claim 不更新；完成后若仍落后 N 再排 |
| Named Version | 创建即产生真实 job；同 index 已有成功行复用；PUT 不再产幽灵；失败可重排 |
| outbox | DB 提交后 Redis 投递失败，dispatcher 重投；重复投递只 claim 一次 |
| 状态机 | scheduled/successful/failed 字段约束；非成功无 access info/download；failed 不被 latest 选中 |
| complete 校验 | 目标变化、链根不符、dbName 非法、容器缺失、哈希格式错、lease 不符 → 拒绝 |
| 幂等 | 重复 complete 同 digest 200；不同 digest 409 |
| 租约 | 过期 reaper 重排；双 claim 仅一个成功；心跳续租 |
| 重试分类 | retryable 回到 scheduled；非 retryable/超限 failed；告警计数 |
| 唯一约束 | 同 `(iModelId,changesetIndex)` 双插入只成功一个；迁移去重 fixture |
| 保留 | keep-set（baseline/latest/NV/最近 K/lease）；retired 行 GET 回退；GC 不删 baseline/latest |
| clone/fork 语义矩阵 | clone 默认/K/0；fork history/squash；参数非法；跨 iTwin 422；不复制 NV/briefcase/lock |
| clone 物化顺序 | copy→写行；中途失败删除目标容器；Create operation 先 initialized 后 successful；无空 initialized |
| FK/身份 | 目标 checkpoint 只能引用目标 changeset；源 changeset 删除不影响目标；同 id 跨 iModel 合法 |

### 6.2 单元测试（Worker / 私有后端）

| 用例 | 断言 |
|---|---|
| 候选 quiesce | pending txn/WAL/未 reset briefcase → 拒绝上传 |
| GUID/changeset | 候选 db 与目标不一致 → 非重试失败 |
| 容器守卫 | 容器不存在 → 不 initialize、非重试；容器存在 → 不 initialize |
| 写锁 | 锁忙 → retryable；SAS 过期 → 刷新/失败分类 |
| 上传/回读 | 成功路径哈希/尺寸/块数一致；回读 404/412 重试；下载后 native 打开通过 |
| 清单 | manifest 规范化哈希确定；无 SAS/URL/私有路径 |
| 清理 | 成功/失败均删临时 db/cache；不误删共享 cache |
| 权限 | 不接受外部传入容器/URL；日志无 SAS |

### 6.3 集成测试（Postgres + Redis + Azurite）

- 真实调度→outbox→dispatcher→worker stub/real claim→complete→GET 全链；`scheduled` 期间 latest 不返回它；成功后 latest 返回。
- 崩溃注入：process kill 在 upload 前/后、complete 前、sidecar 后 DB 前；验证 lease/reaper/幂等。
- Redis 重启/丢消息；dispatcher 重投；无双 job/双成功。
- 故障注入：Azurite 503、容器缺失、readback 不可见、SAS 过期、写锁忙。
- 迁移 fixture：旧库含 baseline + 重复 NV scheduled 行 + mid checkpoint + legacy chainHash null；迁移/去重/回滚 dry-run。
- clone/fork：mid-history checkpoint 后复制；FK 不失败；源删除不影响目标；目标无 NV/briefcase/lock。

### 6.4 真栈 e2e（compose + worker + native）

| 场景 | 验收 |
|---|---|
| 每 N 生成 | 推 100 条 changeset → checkpoint 成功；`GET changesets/head/checkpoint` 返回成功行；冷开下载命中它 |
| Named Version | NV 创建 → 真实 checkpoint successful（不是永久 scheduled）；GET NV checkpoint 可解析；D5 打开后几何/树符合该版本 |
| Release/manual | 触发后 checkpoint 可在预算内 ready；release metadata 记 hash |
| 200/1000 冷开 | 200 与 1000 changeset 文档：有/无 checkpoint 对比，记录下载字节、apply 数、打开 p50/p95；checkpoint 情况下 apply 数 < N |
| Clone 当前内容 | 编辑后 push → clone（默认）→ 目标 feature 数/体积与源 head 一致；不是空 baseline；changeset 历史 1..head 存在 |
| Clone 任意点 | `changesetIndex=K` → 目标 head=K；几何符合 K |
| Clone baseline-only | `changesetIndex=0` → 目标空 baseline（官方语义） |
| Fork history | `preserveHistory=true` → 历史/链/checkpoint 一致；可打开、可继续编辑 |
| Fork mid-history checkpoint | 源在 index 2/5 有 checkpoint，fork 到 5 → 不 FK 失败；目标 0/2/5 行正确；打开成功 |
| Fork squash | `preserveHistory=false`（gated）→ 目标 changesetCount=0、内容=K；缺 FederationGuid 时 operation state 正确 |
| 跨 iTwin | history copy 422；squash（若启用）成功并打开 |
| iModel 删除 | 软删后不再调度；保留期后容器/行清理；目标 clone 不受源删除影响 |
| 版本打开（D5 联调） | 按 `changesetId`/NV 只读打开成功，head 不变 |

### 6.5 失败注入矩阵

| 注入 | 期望 |
|---|---|
| worker 在上传中 kill | lease 过期→重排；无 successful；孤儿块由 GC |
| worker 在上传后/complete 前 kill | 同 target 重试幂等；无双行 |
| hub 在 sidecar 后 DB 前 kill | 重试覆盖 sidecar；最终一致 |
| Redis 全丢 | outbox 重投；无幽灵 |
| Azurite 只读/503 | retryable；不误判 data corruption |
| SAS 中途过期 | 刷新或 retry；不落库 |
| 容器被误删 | 非重试 `ContainerMissing` + 告警；不 initialize 重建 |
| 重复 BullMQ 投递 | 单 claim；单成功 |
| clone 与 GC 并发 | snapshot lease 阻止删除；clone 成功 |
| clone 复制一半 DB 失败 | 目标容器清理；operation failed；无 initialized |
| 迁移中断 | 事务回滚/可重放；旧库可读 |

### 6.6 性能与规模

- 200 / 1000 changeset：checkpoint 生成耗时/尺寸/块数、readback 耗时、冷开 p50/p95（多次冷 cache）。
- N=100 vs 500 的存储/打开权衡；队列吞吐与并发 iModel 数。
- clone copy 字节/时间（整容器 vs 仅所需 db）；fork 历史复制的行/blob 数。
- 资源上限：worker 临时磁盘、单 db 大小、单作业超时、并发 claim 数。
- 基线报告作为 G1 Gate 证据；具体阈值在 S0-14 基线后冻结，不在本文凭空拍数。

---

## 7. 发布/回滚与开放问题

### 7.1 发布阶段

| 阶段 | 内容 | 开关/门 |
|---|---|---|
| P0 | 迁移：checkpoint 增列、job/outbox 表、唯一索引去重；无行为变化 | 迁移 dry-run + 旧 fixture |
| P1 | hub 调度/claim/complete + worker 上线；`CHECKPOINT_GENERATION_ENABLED=false` | 健康检查；canary iModel |
| P2 | 打开周期 N + Named Version + release/manual；监控/告警 | 单 iModel canary → 全量 |
| P3 | D3 Phase A（changeset 身份迁移）+ Phase B（history copy + async Create operation）；clone/fork 开关 | 旧库 fixture；clone 内容/打开验收 |
| P4 | D3 Phase C（squash，gated）+ checkpoint GC/scrubber | FederationGuid/transformer spike 通过 |

- 部署顺序：hub schema/端点 → worker → 打开开关；worker 未就绪时 hub 只入 outbox，不置 successful。
- 发布产物：hub 镜像、checkpoint-worker 镜像、MS/WA 不改；`verify-stack` 增加 worker health 与一次 checkpoint 生成/读取 smoke。
- 观测：`checkpoint_scheduled_total`、`..._success_total`、`..._failure_total{code}`、`..._duration_seconds`、`checkpoint_size_bytes`、`checkpoint_readback_failure_total`、`checkpoint_queue_depth`、`checkpoint_lease_expired_total`、`clone_copy_bytes/duration`、冷开 `applied_changesets`。
- 告警：failed >0、scheduled >15min、lease 过期、readback 失败、队列深度、成功率 <99%。

### 7.2 回滚

| 回滚对象 | 操作 | 影响 |
|---|---|---|
| 调度/生成 | 关闭 `CHECKPOINT_GENERATION_ENABLED`；停止 worker；outbox 暂停 | 已有 checkpoint 仍可读；冷开回退 baseline+changeset（正确但慢） |
| 已 scheduled 行 | 宽限后标记 failed（`GenerationDisabled`）或保留待恢复；不得无限幽灵 | GET 显示 failed，不伪造 |
| GC | 关闭 `CHECKPOINT_GC_ENABLED`；不删任何字节 | 存储继续增长（可接受） |
| D3 clone/fork | 关闭新管线开关；**不要回退到旧的“复制 baseline 冒充当前内容”**；返回 503/501 | 避免错误数据；旧 clone 语义不可恢复 |
| D3 schema | 若存在跨 iModel 同 id，禁止 down；否则按迁移 down | 需备份；文档化不可逆条件 |
| worker 镜像 | 回退到上一 digest；hub 兼容旧 worker（agent API 版本化） | 已成功 checkpoint 不受影响 |

### 7.3 开放问题（需 ADR/Spike 决策）

1. **N 默认值与自适应**：100 还是 500？按 changeset 大小/文档活跃度自动调整是否值得？
2. **`checksumBlockNames`**：现有 baseline 容器是否启用内容块命名？若否，checkpoint 是否全量块复制（存储/克隆成本）？需真栈验证，不能重建现有容器。
3. **独立校验强度**：G1 接受“worker readback + hub 链根/结构校验”，还是必须加独立 verifier/scrubber 才能置 successful？scrub 周期与隔离策略？
4. **D3 身份迁移形态**：合成 `pk uuid` vs 复合 PK；子表 FK 清单（groups/members/extended data）与 down 策略；旧库 fixture。
5. **Squash 可行性**：`@itwin/imodel-transformer` 对 LubanCAD 原生 BRep/geometry stream/Feature 数据的保真度；FederationGuid 覆盖率；是否需要重跑 feature 历史而非元素复制。
6. **跨 iTwin 历史复制**：永久拒绝还是后续原生 re-stamp？客户/合规要求？
7. **Clone 的 K checkpoint**：强制先生成 K（clone 等待）还是允许从更早 checkpoint 重放？影响 clone 时延与 D4 队列优先级。
8. **Named Version 未 ready 的 API 语义**：D6 的 409 vs 返回 scheduled；客户端调用 `openCheckpoint` 的等待预算。
9. **保留 K 与 legal hold**：保留几个历史 checkpoint；Named Version 永久钉住；存储预算。
10. **clone 时容器复制范围**：整容器（当前 `copyContainer`）vs 仅 baseline+所需 checkpoint（需 manifest 解析/新存储能力）；前者简单但复制历史 checkpoint 块。
11. **squash 与 checkpoint 的关系**：squash 后目标 baseline 是否也生成 index 0 checkpoint 行（baseline 本身）；D5 如何打开无 changeset 的目标。
12. **多实例 hub**：sweeper/dispatcher/reaper 的 leader election（advisory lock 或单副本）；当前单副本假设是否足够 G1。
13. **`changesetIndex:0` 的 clone 跨 iTwin**：官方说只复制 baseline，但 baseline 内 iTwinId 仍需改写；是否一律 422 直到 squash/re-stamp。
14. **公共 DTO 的 `size` 字段**：官方 Checkpoint 有 `size`，当前 hub DTO 未暴露；D6 是否补齐（不在 D4 悄悄改契约）。
15. **Legacy chainHash null**：存量文档是否允许生成 checkpoint（`legacyChain=true`）还是先修复账本（默认拒绝）。

---

## 8. 待修改文件/入口（实现清单）

> 路径均为仓内相对路径；私有仓文件只列入口，不在公开文档粘贴代码。

### 8.1 公共仓（本仓）

| 文件/入口 | 变更 |
|---|---|
| `docs/architecture/CHECKPOINT-GENERATOR-DESIGN.md` | 本设计（唯一新增公开文档） |
| `docs/architecture/G1-EXECUTION-PLAN.md` | D3/D4 完成后回填证据/状态（后续 PR） |
| `docs/architecture/EXCEPTIONS.md` | 若 G1 期间 clone/fork 临时 501/503 或 squash blocked，登记例外 |
| `docker-compose.yml` | 新增 `checkpoint-worker` 服务（私有 GHCR 镜像；无宿主发布端口或仅内部 health） |
| `scripts/fetch-backend.ps1` | 拉取 worker 镜像 |
| `scripts/verify-stack.ps1` | worker health + checkpoint 生成/读取 smoke（Canary iModel） |
| `docs/PORTS.md` | 登记 worker 内部 health 端口（如 4004，禁止宿主 0.0.0.0 发布） |
| `luban-cad/apps/web/e2e/*`（D6/D5 联调时） | 版本/克隆打开的真栈断言；D4 本身不新增 UI |

### 8.2 私有仓 `imodelhub-services`（控制面）

| 文件/入口 | 变更 |
|---|---|
| `src/imodels/checkpoints.service.ts` | 调度/claim/complete/fail/lease/校验；`createOrUpdateForChangeset` 接生产；`createOrUpdateForNamedVersion` 改为真实调度；GET 状态投影 |
| `src/imodels/checkpoints.controller.ts` | 保持公开包络；未成功行不返回 access info/download；named version 解析回退 |
| `src/imodels/checkpoints-agent.controller.ts`（新）或扩展 `imodels-baseline.controller.ts` | `/internal/...` claim/heartbeat/complete/failed/schedule/snapshot-lease（agent key） |
| `src/imodels/named-versions.service.ts` / `named-versions.controller.ts` | 创建/GET/PUT 接入调度；禁止幽灵 scheduled |
| `src/imodels/changesets.service.ts` | `completeFileUpload` 提交后触发 `onChangesetCompleted`（无内联生成逻辑） |
| `src/imodels/imodels.service.ts` | 重写 `cloneOrFork`：官方语义矩阵、异步 Create operation、跨 iTwin 422、物化编排、补偿 |
| `src/imodels/imodels.controller.ts` | clone/fork 前置校验/错误码/Location 语义 |
| `src/imodels/jobs/checkpoint-scheduler.job.ts`（新） | 周期 sweeper + coalesce |
| `src/imodels/jobs/checkpoint-job-dispatcher.job.ts`（新） | outbox → BullMQ |
| `src/imodels/jobs/checkpoint-lease-reaper.job.ts`（新） | lease 过期重排/失败 |
| `src/imodels/jobs/checkpoint-retention.job.ts`（新） | keep-set/retired/GC 投递 |
| `src/imodels/jobs/deleted-imodel-storage-cleanup.job.ts` | 删除前取消 active checkpoint/clone job |
| `src/imodels/infrastructure/persistence/relational/entities/checkpoint.entity.ts` | 增列 |
| `src/imodels/infrastructure/persistence/relational/entities/checkpoint-job.entity.ts`（新） | outbox/claim |
| `src/imodels/infrastructure/persistence/relational/repositories/checkpoint.repository.ts` + mapper | 状态/lease/唯一索引查询 |
| `src/database/migrations/<new>-CheckpointGenerationMetadata.ts` | 增列/索引 |
| `src/database/migrations/<new>-CheckpointJobOutbox.ts` | job 表 |
| `src/database/migrations/<new>-CheckpointDedupeAndUnique.ts` | 旧行去重 + `(iModelId,changesetIndex)` 唯一 |
| `src/database/migrations/<new>-ChangesetIdentityPerIModel.ts` | D3：合成 PK/unique/复合 FK/触发器 |
| `src/common/storage/domain/storage.port.ts` | 新增 `containerExists`、`containerBlobExists`、`copyPrefix`（D3）、`generateContainerWriteSasToken`（写 `racwdl`，供 claim 下发；现有 `generateContainerSasToken` 仅读 `rl`） |
| `src/common/storage/infrastructure/itwin-azure-storage.adapter.ts` | 实现上述能力；短 TTL 写 SAS/读 SAS 由 hub 签发；`copyContainer` 复制/重建目标容器 CloudSqlite 元数据（不能只 `createIfNotExists`）；不支持容器概念的后端显式拒绝 |
| `src/config/app-config.type.ts` / `app.config.ts` | `CHECKPOINT_*` 开关/阈值/上限 |
| `src/imodels/imodels.module.ts` | 注册新 job/队列/依赖 |
| `test/unit/imodels/clone-fork.spec.ts` | 按新语义重写（当前断言的是旧行为） |
| `test/unit/imodels/checkpoint-current-or-preceding.spec.ts` | 保持回退语义 + 新状态断言 |
| `test/unit/imodels/named-version-checkpoint-delegation.spec.ts` | PUT 真实调度/复用断言 |
| `test/unit/imodels/checkpoint-scheduler.spec.ts`、`checkpoint-job-outbox.spec.ts`、`checkpoint-retention.spec.ts`、`checkpoint-complete-verify.spec.ts`（新） | 见 §6.1 |
| `test/integration/checkpoint-generation.e2e-spec.ts`、`checkpoint-clone-fork.e2e-spec.ts`（新） | 真实 PG/Redis/Azurite |
| `test/integration/sdk-compat.e2e-spec.ts`、`smoke-crud.e2e-spec.ts` | 升级 Named Version/checkpoint 断言（不再接受永久 scheduled） |

### 8.3 私有仓 `luban-backend`（作业面）

> 推荐新包 `checkpoint-worker/`；若 Phase 0 暂放 WA，文件名为 `webhook-agent/src/checkpoint-generator.ts`，后续必须拆出。

| 文件/入口 | 变更 |
|---|---|
| `checkpoint-worker/package.json`、`tsconfig.json`、`Dockerfile`（新） | 独立镜像；官方 npm `@itwin/core-backend`/`@itwin/imodels-access-backend`/`@itwin/object-storage-azure`（与 WA 同类，不依赖 Windows 本地 native） |
| `checkpoint-worker/src/index.ts`（新） | IModelHost 生命周期、队列 Worker 启动/退出、health |
| `checkpoint-worker/src/config.ts`（新） | hub URL、agent key、service account、Azurite endpoint、cache dir、并发/上限；启动校验 |
| `checkpoint-worker/src/hubClient.ts`（新） | `createIModelsClient` 模式（`X-API-Key` 注入）+ agent claim/complete/heartbeat 客户端 + 服务 JWT |
| `checkpoint-worker/src/generate.ts`（新） | `downloadBriefcase(asOf,briefcaseId:0)` → quiesce → 校验 → 上传 → readback → complete |
| `checkpoint-worker/src/cloudSqlite.ts`（新） | 容器存在探测（不 initialize）、写锁、`uploadDb`、readback、`deleteDatabase/cleanDeletedBlocks`（GC） |
| `checkpoint-worker/src/manifest.ts`（新） | 哈希/链根/规范化 |
| `checkpoint-worker/src/cleanup.ts`（新） | 临时文件/cache/启动清理 |
| `checkpoint-worker/src/*.test.ts`（新） | §6.2 |
| 参考复用（不改）：`modeling-server/src/main.ts` | IModelHost + BackendIModelsAccess + ServiceAccountAuthClient + HostRewritingAzureStorage 组装 |
| 参考复用（不改）：`webhook-agent/src/baseline-generator.ts` | 容器 metadata、`initializeContainer`（仅 baseline）、`uploadDb`、readback、SAS |
| 参考复用（不改）：`webhook-agent/src/lifecycle.ts`、`hubAuthClient.ts` | IModelHost 单例与 hub 认证模式 |
| `modeling-server/src/ipc/AppFunctionIpcHandler.ts`（D5） | `openCheckpoint` 桩在 D5 实现；D4 只保证 checkpoint 数据可用 |
| 私有仓 compose/release 脚本 | worker 镜像构建/发布/provenance；服务依赖 Redis/Azurite/hub |
| `scripts/start-ms-host.ps1` | 不变（worker 不是宿主进程） |

### 8.4 明确不改

- `@luban-cad/shared` / Feature RPC / `LubanFeatureRpcInterface` 版本。
- iTwin.js core checker/editor 行为（除 D5/D3 所需的原生使用，不 fork 新逻辑）。
- changeset 账本内容（D4 只读；D3 复制是 INSERT 新行）。
- 用户 briefcase/编辑会话路径（生成器只下载只读 unassigned briefcase）。

---

## 9. 参考

- `docs/architecture/G1-EXECUTION-PLAN.md`（D3/D4 验收与 G1 Gate）
- `docs/architecture/G0-DECISION-REGISTER.md`（D0-4 账本/版本/分支）
- `docs/research/lubancad-architecture-assessment/04-COLLABORATION-AND-DATA.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`
- `docs/api-specs/imodels-v2.json`（Clone/Fork/Checkpoint 官方契约）
- 官方客户端 `imodels-clients`（`CheckpointOperations`、`IModelOperationParams`、`BackendIModelsAccess`、`CheckpointHelperFunctions`）
- `itwinjs-core/core/backend/src/CheckpointManager.ts`、`BriefcaseManager.ts`、`CloudSqlite.ts`、`BackendHubAccess.ts`
- 现有实现：`luban-backend/webhook-agent/src/baseline-generator.ts`、`luban-backend/modeling-server/src/main.ts`、`imodelhub-services/src/imodels/checkpoints.service.ts`、`imodels.service.ts`

---

**评审要点（本文必须被签字确认的决策）**：

1. 生成进程 = 独立 `checkpoint-worker`（非 MS/WA 长期承载）。
2. checkpoint 容器 = 每 iModel 一个 `{iModelId}`，db 名 `checkpoint-<index>.db`；禁止 NV 专属 db；禁止重建已存在容器。
3. `checkpoint` 行唯一 `(iModelId,changesetIndex)` + outbox/claim/lease；`scheduled` 无 job 即违规。
4. 成功前必须生成端 readback + hub 链根/结构校验；无“强制成功”。
5. D3 必须先做 `(iModelId,id)` changeset 身份/复合 FK 迁移；clone/fork 按官方复制 changesets，异步 Create operation；跨 iTwin 历史复制 422；squash 单独 gated。
