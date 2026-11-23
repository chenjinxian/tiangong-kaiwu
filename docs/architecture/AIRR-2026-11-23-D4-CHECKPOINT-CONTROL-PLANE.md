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
| checkpoint 存储访问 | `StoragePort`（`exists/getFileSize/downloadStream/refreshContainerAccessInfo/deleteContainer`） | 中 | 扩展（additive）：`containerExists`、`containerBlobExists`、`getContainerAccessInfo`；**不新增写 SAS**（storage-token 端点延后到真实 worker 任务） | 控制面需验证容器存在且构造稳定身份；SAS 策略归身份工作包 | 项目内 |
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
