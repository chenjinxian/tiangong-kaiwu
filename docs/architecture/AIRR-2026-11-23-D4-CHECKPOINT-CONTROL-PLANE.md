# AIRR — G1 账本硬化与 D4 Checkpoint 控制面（Hub 切片）

- 标题：G1 D1/D2/D4/D6a Hub 硬化：字节校验、悬挂恢复、checkpoint outbox 控制面、Named Version 防护
- 日期：2026-11-23
- Owner：平台/账本（Hub）
- 关联需求：`G1-EXECUTION-PLAN.md` D1.4/D1.7/D2.1/D2.2/D4/D6；`CHECKPOINT-GENERATOR-DESIGN.md`；ADR `ADR-G0-04-ledger-version-checkpoint.md`
- 预计影响仓：`imodelhub-services`（代码/迁移/测试）；公共仓仅文档；私有后端 `luban-backend` **不在本切片**
- 是否需要 ADR：**是**（账本不可变、Version→checkpoint 绑定、clone/fork 语义；见 ADR-G0-04，状态 Proposed/未签字）

---

## 1. 目标与验收

### 目标

1. **D1.4**：changeset complete 校验存储对象存在、大小 > 0、与声明大小一致，并计算服务端 SHA-256；客户端 checksum 仅在可验证形态下做一致性断言。
2. **D1.7**：下载/预签/批量下载路径强制校验自身链哈希与父链接；legacy（null chainHash）由显式策略开关放行，不静默信任；新增拒绝测试。
3. **D2**：`waitingForFile` 超时恢复：新建 push 时可清理废弃行（无引用硬删以复用 index，有引用软删），周期 reaper 兜底；崩溃注入测试证明 create→complete 失败后重试 push 成功。
4. **D6a**：Named Version 创建要求 changeset 已封账；更新 DTO/服务/仓储禁止改写 `changesetId`；有 checkpoint 引用的 NV 删除返回 409；未 ready 的 NV checkpoint GET 返回 409 `CheckpointNotReady`；按 changeset index 回退解析；停止 NV 专属 db 命名。
5. **D4 控制面（flag 默认 OFF）**：checkpoint 生成元数据 + `checkpoint_jobs` 事务性 outbox；scheduler/dispatcher/reaper；内部 agent claim/heartbeat/complete/fail 端点（复用现有服务鉴权）；GET 投影不把 scheduled/failed 当 latest、不返回访问信息。
6. **不伪造成功**：没有 worker readback 证据不得置 `successful`；本切片不生成真实 checkpoint 字节、不写 sidecar manifest、不启用 flag。

### 可观察验收

- 新增/修改单测全绿（见 §7）；迁移可 up/down（down 有 fail-closed 守卫）。
- complete 在大小/哈希不符时拒绝且状态保持 `waitingForFile`。
- 下载路径在链哈希被篡改（非 legacy）时拒绝。
- 假时钟推进后，悬挂 `waitingForFile` 被清理，重试 push 成功且 index 复用。
- NV 未封账 changeset 不能创建版本；PATCH 无法改写 changesetId；被 checkpoint 引用不能删除。
- flag OFF 时：NV checkpoint PUT 显式 409 且**不写行**；GET 返回 409 `CheckpointNotReady`；scheduler/dispatcher 不产生作业；reaper 终结残留活动作业。
- flag ON（仅测试配置）时：schedule 同时写 checkpoint+job；Redis 投递失败后 outbox 保留并可重投；重复投递只 claim 一次；lease 过期可重排；complete 冲突返回 409。
- GET latest 只返回 `successful`；scheduled/failed 不返回 `directoryAccessInfo`/下载链接。

### 非目标（明确不做）

- **D4 真实 worker**：不生成/上传/回读真实 CloudSqlite checkpoint 字节；不写 sidecar manifest；不置真实 `successful`（测试中的 complete 只由 fake worker 提供 readback 证据）。
- **D3**：不做 changeset `(iModelId,id)` 身份迁移、历史复制、async Create operation、squash/Duplicate。保持现有 fail-closed（501/409）并登记例外。
- **D5**：不实现 `openCheckpoint`/按版本只读打开 IPC。
- **D7/D8**：不实现 restore/compare、Version/Tab/Refs。
- **身份/ACL/SAS 策略**：不修改 `src/auth/**`、`src/common/guards/**`、`src/common/authorization/**`、`src/access-control/**`、`src/session/**`；不新增写 SAS 签发策略（claim 不返回 SAS）。
- **前端/Part Studio/真形/绳墨/DanQing**：零改动。
- **路由顺序**：不改变现有控制器注册顺序（`checkpoints-route-order.spec.ts` 守卫）；内部端点使用独立 `/internal/...` 前缀。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有实现 | 结论 |
|---|---|---|---|
| imodelhub-services | NestJS 模块/控制器/服务、TypeORM、迁移、BullMQ/Redis、`@nestjs/schedule` cron、advisory lock、`StoragePort`、`AgentApiKeyGuard` | 已具备 | **复用/扩展** |
| imodelhub-services | changeset append-only 触发器、chainHash、current-or-preceding checkpoint、checkpoint upsert 事务锁 | 已有 | **复用并加固** |
| imodelhub-services | clone/fork 容器复制 + 501/409 fail-closed | 已有 | **保持**，不在本切片扩展 |
| 官方 iModels v2 API/clients | checkpoint 状态语义、Named Version checkpoint、clone/fork | 参考规格 | **遵循** |
| itwinjs-core / imodel-native | CloudSqlite/Briefcase 生成素材 | 后续 worker 使用 | 不在本切片 |
| luban-backend | webhook-agent baseline、modeling-server 打开 | 后续 D5/worker | 不在本切片 |
| @luban-cad/shared | FeatureOp/RPC | 无关 | **不触碰** |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 | 许可 |
|---|---|---|---|---|---|
| 作业队列 | 现有 BullMQ + Redis（webhook 队列同基础设施） | 高 | 复用，新增独立 queue 名 `checkpoint-generate` | 不引入第二套队列 | MIT/项目内 |
| 定时调度/补偿 | `@nestjs/schedule` cron（现有 jobs 同款） | 高 | 复用 | 无新调度器 | 项目内 |
| 事务串行/防并发 | `pg_advisory_xact_lock` + TypeORM 事务（现有 checkpoint upsert 同款） | 高 | 复用 | per-iModel 串行无需新锁服务 | 项目内 |
| 服务鉴权 | `AgentApiKeyGuard`（现有 baseline agent 路由） | 高 | 复用；仅 import，不修改 guard/auth 文件 | 满足“现有服务鉴权” | 项目内 |
| checkpoint 存储访问 | `StoragePort`（`exists/getFileSize/downloadStream/refreshContainerAccessInfo/deleteContainer`） | 中 | 扩展（additive）：`containerExists`、`containerBlobExists`、`getContainerAccessInfo`；**X-23 退出切片新增** `generateContainerSasTokenForPermission`（见 §7.5） | 控制面需验证容器存在且构造稳定身份；SAS 由控制面按目标容器现签 | 项目内 |
| checkpoint 状态机 | 现有 `successful/scheduled/failed/notGenerated` 枚举 | 高 | 复用；内部 job 状态仅存在于 outbox | 不新增第二套对外状态 | 项目内 |
| Named Version 解析 | 现有 checkpoint 仓储查询 | 中 | 扩展 index 回退 + 409 语义 | 官方 NV 与 changeset index 是一等关联 | 项目内 |
| changeset 字节哈希 | Node `crypto`（现有 chainHash 同款） | 高 | 复用 | 无新依赖 | 项目内 |

---

## 4. 数据/Schema 变化

### 4.1 `checkpoints` 增列（nullable/additive）

`generationSource`、`scheduledAt/startedAt/completedAt/verifiedAt`、`attemptCount`、`lastErrorCode/lastErrorMessage`、`manifestPath/manifestSha256`、`contentSha256`、`cloudSqliteHash`、`chainRoot`、`generatorVersion`、`headChangesetIndexAtSchedule`、`retiredAt/retiredReason`。

约束：`successful` 行必须有 `verifiedAt`、`fileSize>0`、`contentSha256`、稳定容器身份；非成功行不得有访问信息/下载链接。本切片不写 `manifest*`（sidecar 属真实 worker）。

### 4.2 `checkpoint_jobs`（内部 outbox）

`id uuid PK`、`checkpointId uuid UNIQUE FK CASCADE`、`iModelId`、`state varchar CHECK (queued|dispatched|claimed|done|dead)`、`priority`、`attempt`、`leaseOwner/leaseExpiresAt`、`dispatchedAt`、`lastErrorCode/lastErrorMessage`、`createdAt/updatedAt`。索引：`(iModelId,state)`、`(state,leaseExpiresAt)`、`(iModelId,checkpointId)`。

### 4.3 唯一约束与迁移去重

- `UNIQUE (iModelId, changesetIndex) WHERE changesetIndex IS NOT NULL`。
- 迁移先去重（successful > scheduled > failed > notGenerated；较新优先），旧无作业 `scheduled` 统一置 `failed`（`LegacyScheduledWithoutJob`）。
- **down**：结构可回滚；去重/幽灵修复不可逆。down 守卫：存在非终态 job 或 `verifiedAt IS NOT NULL` 的成功 checkpoint 时拒绝，提示先导出/降级。

### 4.4 changeset 读取支持

- 增加“截至 index 的链行”查询，用于 hub 独立重算 `chainRoot`（不依赖 worker 输入）。
- 不修改 changeset 表结构；legacy 链策略由配置显式控制（`allow-legacy`/`strict`；checkpoint complete 默认拒绝 legacy 链）。

### 4.5 配置开关

| 键 | 默认 | 说明 |
|---|---|---|
| `CHECKPOINT_GENERATION_ENABLED` | `false` | 控制面总开关；关闭时不调度、不投递，schedule 端点 409 |
| `CHECKPOINT_CHANGESET_INTERVAL` | `100` | 距最近成功 checkpoint 的 changeset 阈值（允许 1–500） |
| `CHECKPOINT_MAX_ATTEMPTS` | `5` | 领取尝试上限 |
| `CHECKPOINT_LEASE_SECONDS` | `1800` | claim lease |
| `CHECKPOINT_DISPATCH_REDELIVER_SECONDS` | `60` | dispatched 行多久未 claim 视为可重投 |
| `CHECKPOINT_ALLOW_LEGACY_CHAIN` | `false` | complete 是否允许链上存在 legacy null chainHash |
| `CHANGESET_WAITING_FOR_FILE_TTL_MINUTES` | `15` | 悬挂 changeset 超时 |
| `CHANGESET_CHAIN_ENFORCEMENT` | `allow-legacy` | 下载路径链校验策略（`strict` 拒绝 legacy） |

---

## 5. 控制面流程与不变量

```text
触发（NV PUT / 周期 scheduler / 手动内部）
  └─ 事务：advisory lock schedule:{iModelId}
       - 目标 changeset 必须已封账且属于本 iModel
       - 已有 successful(index) → 复用返回
       - 否则写 checkpoints(scheduled) + checkpoint_jobs(queued)（同一事务）
dispatcher（10s）→ BullMQ jobId=job.id；失败保留 outbox 行
worker claim（事务）→ per-iModel lease + attempt++；忙 409
heartbeat（2min）→ 续 lease；丢失 409
complete → 校验 lease/目标/dbName/index/大小/hash/readback/chainRoot/容器
           → checkpoint successful + job done（同一事务；同摘要幂等，异摘要 409）
failed → 可重试回 queued；达上限/不可重试 → job dead + checkpoint failed
reaper（2min）→ 过期 lease 重排或失败；scheduled 缺作业修复；flag 关闭时终结活动作业
```

不变量：

- `scheduled` ⇔ 存在 active/replayable job；`successful` ⇒ readback + `verifiedAt` + 正大小 + 稳定容器身份。
- 同一 iModel 同时最多一个有效 lease；重复投递只 claim 一次。
- GET latest 只返回 successful；非成功行不返回访问信息/下载链接。
- 内部端点不接受 worker 指定任意容器/URL/SAS；claim 只返回目标元数据（storage token 端点延后到真实 worker 任务）。内部路径 `:checkpointId` 语义 = **outbox job id**（同时是 BullMQ `jobId`），不是 checkpoint 行 id；worker 不需要知道行 id。
- sidecar manifest 本切片不写（真实 worker 任务）；`manifestPath/manifestSha256` 列已预留但保持为空。
- 列表/详情响应内嵌的预签下载链接也做**自身哈希**校验（零额外查询）；显式下载/预签/批量路径再做父链接校验。
- 所有 complete/fail 写操作在事务内复查 lease 与目标，避免 TOCTOU。

---

## 6. 失败/回滚

| 场景 | 行为 |
|---|---|
| Redis 丢消息/重启 | outbox 行保留；dispatcher 按 queued/超时 dispatched 重投；`jobId=job.id` 去重 |
| 重复投递 | claim 条件更新 + lease 检查；第二次 busy/lease lost |
| DB 提交后、投递前崩溃 | dispatcher 下一 tick 从 outbox 重投 |
| worker 崩溃/lease 过期 | reaper 重排（attempt++），达上限 failed；不产生 successful |
| complete 冲突（同摘要） | 200 幂等返回；异摘要 409 `CheckpointAlreadyCompleted` |
| flag 关闭 | schedule 409；scheduler/dispatcher no-op；reaper 把 active job 置 dead、scheduled 行 failed（`GenerationDisabled`）；成功 checkpoint 保留 |
| 迁移 down | 有非终态 job 或真实成功 checkpoint 时拒绝；否则删表/索引/列 |
| changeset 悬挂 | TTL 后清理；无引用硬删复用 index，有引用软删并从链头排除；已封账行不动 |

---

## 7. 测试证据

### 7.1 新增/修改单测

| 用例 | 断言 |
|---|---|
| D1.4 complete：对象不存在/0 字节/声明大小不符/哈希不符 | 422；状态保持 waitingForFile；不写 chainHash |
| D1.4 complete：成功 | 服务端 SHA-256 持久化为 checksum；chainHash 使用服务端摘要；重复 complete 幂等 |
| D1.4 complete：已封账行字节变化 | 409，不改变已封账行 |
| D1.7 下载/预签/批量：链哈希或父链接被篡改 | 拒绝；legacy 在 allow-legacy 放行、strict 拒绝 |
| D2 悬挂：fake clock 推进后重试 push | 旧行被清理；index 复用；complete 成功 |
| D2 悬挂：reaper | 无引用硬删、有引用软删；已封账行不被删 |
| D2 崩溃注入 | create→upload 失败→重试 push 成功（无需等待周期 reaper） |
| D6a NV 创建 | 未封账 changeset → 422；封账 → 成功 |
| D6a NV PATCH | changesetId 被 DTO/服务剥离，仓储请求不含 changesetId |
| D6a NV 删除 | 有 checkpoint 引用 → 409 |
| D6a GET NV checkpoint | 无行/scheduled/failed → 409 `CheckpointNotReady`；successful → 200；index 回退命中 |
| D6a PUT NV checkpoint（flag OFF） | 409 `CheckpointGenerationDisabled`；不产生行 |
| D4 schedule | checkpoint+job 同事务；successful 复用；failed 可重排；无 job 不写 scheduled |
| D4 dispatcher | Redis 投递失败保留 queued；重复投递同 jobId；DB 提交后崩溃可恢复 |
| D4 claim/heartbeat | 双 claim 仅一成功；lease 过期 reaper 重排；心跳丢失 409 |
| D4 complete | 缺 readback/大小不符/dbName 非法/链根不符/容器缺失 → 拒绝；同摘要幂等；异摘要 409 |
| D4 flag OFF | scheduler/dispatcher 不写作业；reaper 终结活动作业；GET latest 不返回非成功行 |
| 迁移 | up/down SQL 形态、去重、唯一索引、down 守卫 |

### 7.2 运行命令（预期）

```bash
cd imodelhub-services
npx jest --config ./test/jest-unit.json --runInBand test/unit/imodels/changeset-integrity.spec.ts
npx jest --config ./test/jest-unit.json --runInBand test/unit/imodels/changeset-hanging-recovery.spec.ts
npx jest --config ./test/jest-unit.json --runInBand test/unit/imodels/named-version-guardrails.spec.ts
npx jest --config ./test/jest-unit.json --runInBand test/unit/imodels/checkpoint-control-plane.spec.ts
npx jest --config ./test/jest-unit.json --runInBand test/unit/database/checkpoint-generation-migration.spec.ts
```

若本地 Postgres/Azurite 不可用，只运行上述纯单测；真栈/迁移 dry-run 结果必须如实记录为“未执行”。不得伪造绿。

### 7.3 迁移 dry-run 证据（2026-11-23）

本地 compose 栈的 Postgres **未发布宿主端口**，无法从宿主直接跑 TypeORM CLI；在 Postgres 容器内以事务方式执行了迁移 up 的完整 SQL 并 `ROLLBACK`：17 个列、幽灵 scheduled→failed（1 行）、去重、唯一索引、`checkpoint_jobs` 建表与索引全部成功；回滚后 scheduled 行与列状态恢复。down 守卫另行验证：存在非终态 job 时 `RAISE EXCEPTION`（fail-closed），无活动 job 时通过。未在真实库上持久化执行迁移（本切片不发布）。

### 7.4 未在本切片执行的证据

- 真实 checkpoint 生成/readback/manifest/冷开基线（真实 worker 任务）。
- clone/fork 内容与历史复制真栈 e2e（D3）。
- D5 版本打开、D7 restore、D8 引用。D5/D7 的打开/恢复入口落地时必须复用 `ChangesetsService.verifyForRead`（链校验）与 checkpoint latest/ready 语义，不得绕过。
- 迁移在真实库上的持久化执行与旧库 fixture 回归（需发布窗口）。

### 7.5 X-23/X-24 Hub 侧退出切片实现记录（2026-11-23）

> 本记录只证明 Hub 侧契约与测试；**不关闭 X-23/X-24**，不打开 `CHECKPOINT_GENERATION_ENABLED`，不生成任何真实 checkpoint 字节，不构成 G1 Gate 证据。

**Claim 元数据（X-24 部分退出）**

- `POST /internal/imodels/:iModelId/checkpoints/:jobId/claim` 响应新增：
  - `iTwinId`：目标 iModel 的 owner iTwin（Hub 从 iModel 行读取并校验存在，缺失 → 404 `IModelNotFound`，**不领取 lease**）。
  - `container`：稳定容器身份 `{containerId, baseDirectory, baseUrl, baseUri, storage, storageType}`，`containerId=baseDirectory={iModelId}`；**无 SAS/URL 凭据**。`baseUri` 是给 checkpoint-worker 的兼容别名。
- claim 在取 lease 前完成 iTwin/容器校验；storage 适配器无法描述容器（如 S3）→ 503 `CheckpointStorageUnsupported`，job 保持 queued、无 lease。
- 鉴权在 `AgentApiKeyGuard` 之上新增 `CheckpointWorkerServiceGuard`：`X-Service-Name` 必须等于 `CHECKPOINT_WORKER_SERVICE_NAME`（默认 `checkpoint-worker`）。

**Storage token（X-23 Hub 侧）**

- `POST /internal/imodels/:iModelId/checkpoints/:jobId/storage-token`，body：`{permission: "read"|"write", leaseOwner}`（兼容已提交 worker 的 `purpose` 别名；两者同时出现必须一致）。
- 采用 **claim-token bound**：job 必须存在且属于路径 iModel、state=`claimed`、lease 未过期、`leaseOwner` 匹配；checkpoint 行必须仍为 `scheduled` 且目标 changeset 已封账。
- 容器由 Hub 权威决定：`getiModelCheckpointContainer(iModelId)`（即 `{iModelId}`）；**不接受**调用方容器/URL/SAS。
- `StoragePort.generateContainerSasTokenForPermission(container, permission, ttl)`：Azure 容器级 SAS，read=`rl`、write=`racwdl`，TTL 900s（适配器强制 60–900s）；**拒绝为默认容器签写 SAS**；S3 显式不支持（fail-closed）。现有 `generateContainerSasToken` 读行为不变。
- 响应：`{baseUri, storage, storageAccount, containerId, storageType, sasToken, permissions, permission, expiresAt}`；SAS 仅返回一次，不写 DB、不写日志、不进入 checkpoint GET。
- 响应示例（字段名稳定；值脱敏）：

```json
{
  "baseUri": "https://<account>.blob.core.windows.net",
  "storage": "<account>",
  "storageAccount": "<account>",
  "containerId": "<iModelId>",
  "storageType": "azure",
  "sasToken": "<redacted>",
  "permissions": "racwdl",
  "permission": "write",
  "expiresAt": "2026-11-23T00:15:00.000Z"
}
```

**Changeset chain evidence（X-24 部分退出）**

- `GET /internal/imodels/:iModelId/changesets/:changesetIdOrIndex/chain`（service-only，同一 pinned 服务名）。
- 目标可为 40-hex id 或十进制 index；必须存在、属于路径 iModel、state=`fileUploaded`、index ≥ 1。
- 响应：`{iModelId, changesetId, changesetIndex, chainRoot, legacyChain, algorithm: "sha256-index-changesetId-chainHash-v1", count, links: [{index, changesetId, parentId, prevHash, chainHash}]}`；`chainRoot` 与 Hub complete 校验使用同一 helper（`computeChangesetChainRoot`）。
- 链必须从 1 连续到目标（缺口/不完整 → 422 `CheckpointVerificationFailed`）；单次响应上限 `MAX_CHAIN_EVIDENCE_ROWS=10000`，超限 → 422 `CheckpointChainEvidenceTooLarge`。
- 仅暴露链哈希/父子 id，无用户 PII、SAS、URL；公开 changeset REST DTO **不变**。

**测试证据（2026-11-23，Hub 仓）**

```text
npx tsc --noEmit                          # 0 errors
npx eslint <changed src/test files>       # 0 errors / 0 warnings
npx jest --config ./test/jest-unit.json --runInBand --coverage=false \
  test/unit/imodels/checkpoint-control-plane.spec.ts \
  test/unit/imodels/checkpoint-worker-service.guard.spec.ts \
  test/unit/common/storage/checkpoint-container-sas.spec.ts \
  test/unit/imodels/checkpoints-route-order.spec.ts
# 4 suites / 54 tests passed

npx jest --config ./test/jest-unit.json --runInBand --coverage=false
# full hub unit suite: 149 suites / 1370 tests passed
```

隔离关系型 e2e（不触 live DB/栈）：`test/integration/checkpoint-agent-x23.e2e-spec.ts`，对独立 `postgres:17.6-alpine` 容器执行全量迁移后运行真实仓储 + 真实 HTTP 路由 + 真实 Azure/Azurite SAS 适配器，8/8 通过；覆盖 claim 字段、read/write token、错误 API key/service name、错误 lease、跨 iModel job/chain 负例；跑完删除测试行并销毁独立容器/卷。

**仍未完成（不得据此关闭例外）**

- worker 尚未切换/消费新契约（claim `iTwinId`/`container`、storage-token、chain endpoint）；X-23 的 `local-account-key` bridge 与 X-24 的独立双算仍需 worker 侧改造与 native canary。
- `CHECKPOINT_GENERATION_ENABLED` 仍为 OFF；无真实 checkpoint 生成/readback/manifest/冷开基线。
- 公开 REST 契约、schema/迁移：本切片**无变更**（无需新列）。

### 7.6 Canary blocker 修复：changeset checkpoint 读取投影（2026-11-23）

> 本节只记录 Hub 读取投影修复与其测试证据；**不关闭 X-23/X-24、不打开生成 flag、不写真实 checkpoint 字节、不勾选 G1 Gate**。canary 中的临时 gateway shim 不是修复，重跑 native canary 前必须移除。

**Canary 发现（权威）**

真实 scheduled checkpoint 行位于 index 1（`directoryAccessInfo=null`）时，官方 `BriefcaseManager.downloadBriefcase({asOf: target})` 失败 `V2 checkpoint not found`：

1. `BackendIModelsAccess.queryV2Checkpoint` 先请求 `checkpoints.getSingle({iModelId, changesetId})`；Hub 命中精确 scheduled 行并按读取投影剥离访问信息（`directoryAccessInfo=null`）。
2. 官方客户端因 `directoryAccessInfo === null` 进入 `queryCurrentOrPrecedingV2Checkpoint`，解析 index=1 后经 `changeset.getCurrentOrPrecedingCheckpoint()` 再次请求同一 index；Hub 仍返回同一 scheduled 行。
3. 客户端判定该行不可用后递归 `index-1 = 0`，而 `findLatestCheckpointForChangeset(0)` 直接返回 `undefined`——不会走 baseline 分支，最终抛 `V2 checkpoint not found`。canary 用 gateway shim 替换为最新 successful 行才让 worker 跑通，属临时绕过。

根因在 Hub 公开读取投影：`GET /imodels/:iModelId/changesets/:changesetIdOrIndex/checkpoint` 只要命中精确行就返回，未区分 `state`。该端点/链接名是官方 `currentOrPrecedingCheckpoint` 语义，`scheduled`/`failed`/`notGenerated` 不是可用 V2 checkpoint。

**路由事实（官方 client 6.2.2）**

- `IModelsApiUrlFormatter.getCheckpointUrl` 生成 `GET /imodels/{id}/changesets/{changesetId 或数字 index}/checkpoint`；`Changeset._links.currentOrPrecedingCheckpoint.href` 为按 changeset id 的同一路由。官方客户端**不使用** `/changesets/index/:index/checkpoint`。
- Hub 原有 `changesets/:changesetIdOrIndex/checkpoint` 已覆盖官方形态；本次额外注册 `GET /imodels/:iModelId/changesets/index/:index/checkpoint`（在动态路由之前），与既有 `GET /changesets/index/:index` 兼容形态及 canary index 探测保持一致，避免 index 前缀探测 404。

**修复语义（仅公开读取投影）**

- 精确行且 `state=successful` → 原样返回。
- 精确行为 `scheduled`/`failed`/`notGenerated`（或精确行不存在）→ 返回 `changesetIndex <= 请求 index` 的最新 `successful` 行（典型为 baseline index 0）；按 id 请求时用精确行的 `changesetIndex` 作为上界。
- 无任何 successful 前置 → 404 `CheckpointNotFound`。公开 REST DTO/包络不变；仅 successful 行在读取时短签容器 SAS/下载 URL，响应不含持久化凭据。
- `GET /briefcases/checkpoint`（latest）仍只取 `successful`；Named Version GET 的 409 `CheckpointNotReady`（scheduled/failed/notGenerated）保持不变（D6a 未削弱）。控制面仓储的 `findByChangesetIndex/Id` 仍返回精确行供调度/claim 使用，未改变写入语义。

**证据（Hub 仓，2026-11-23）**

```text
npx tsc --noEmit                                      # 0 errors
npx eslint <changed src/test files>                   # 0 errors / 0 warnings
npx jest --config ./test/jest-unit.json --runInBand --coverage=false \
  test/unit/imodels/checkpoint-current-or-preceding.spec.ts \
  test/unit/imodels/checkpoints-route-order.spec.ts \
  test/unit/imodels/service-account-channel.guard.spec.ts \
  test/unit/imodels/named-version-checkpoint-delegation.spec.ts \
  test/unit/imodels/checkpoint-sas-read.spec.ts
# 5 suites / 127 tests passed

npx jest --config ./test/jest-unit.json --runInBand --coverage=false
# full hub unit suite: 149 suites / 1381 tests passed
```

隔离关系型 e2e（不触 live DB/栈）：`test/integration/checkpoint-read-projection.e2e-spec.ts`。在一次性 `postgres:17.6-alpine` 容器（宿主随机端口）执行全量迁移后，写入真实 iTwin/iModel/changeset/checkpoint 行（successful baseline index 0 + scheduled index 1，`directoryAccessInfo=null`），以真实 `CheckpointsController`/`CheckpointsService`/关系仓储经 HTTP 验证：按 changeset id、数字 index、`index/:index` 三种路由均返回 baseline 且带短签访问信息；latest 忽略 scheduled；未知 changeset 返回 404 `CheckpointNotFound`。5/5 通过，跑完删除测试行并销毁容器/卷。`CHECKPOINT_GENERATION_ENABLED` 未打开，未生成任何真实 checkpoint 字节。

**仍未完成（不得据此关闭例外）**

- 必须在**移除 canary gateway shim** 后重跑真实 native canary：官方 `BriefcaseManager.downloadBriefcase({asOf})` 成功下载 baseline 并应用后续 changeset，且 readback/冷开基线成立，才可讨论 X-23/X-24 退出。
- `CHECKPOINT_GENERATION_ENABLED` 仍为 OFF；本次未生成/上传/回读真实 checkpoint，也未改 worker。
- G1 Gate 未变化：本文不构成 Gate 通过证据。

---

## 8. 回滚与发布

- 发布顺序：hub 迁移 → hub 控制面（flag OFF）→ 观察 → 真实 worker → 开 flag（后续任务）。本切片只到 flag OFF。
- 回滚：关闭 flag；停止 dispatcher/scheduler；reaper 终结残留活动作业；成功 checkpoint 不动；clone/fork 保持 fail-closed。
- 迁移回滚：见 §4.3 的 fail-closed 守卫；去重与幽灵修复不可逆，回滚前必须备份。
- 兼容窗口：internal agent API 以路径版本化（`/internal/...`），后续 worker 可兼容扩展；不改变公开 REST 包络。
- 发布门：本切片不发布、不 commit（按任务指令）；实现完成后由 owner 决定提交/发布。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是（本切片仅 hub；私有后端/公开契约不变）
- P0 例外已登记：是（X-16 D3 fail-closed；X-17 D4 默认关闭）
- ADR：需要（ADR-G0-04，Proposed/未签字）
- Owner 签字：待
- 结论：**修改后批准前仅作为实现约束；不得据此宣称 G1 Gate 通过**
