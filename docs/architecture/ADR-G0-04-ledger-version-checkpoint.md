# ADR-G0-04：不可变账本、Version→真实 Checkpoint 绑定与 Duplicate/Fork 语义

> 状态：**Proposed under owner directive 2026-11-23; not ARB-signed**（业主指令下拟制，尚未经 ARB 签字）
> 日期：2026-11-23
> 关联：`G0-DECISION-REGISTER.md`（D0-4 账本/版本/分支）、`G1-EXECUTION-PLAN.md`（D1–D6）、`CHECKPOINT-GENERATOR-DESIGN.md`、`AIRR-2026-11-23-D4-CHECKPOINT-CONTROL-PLANE.md`、`INTERFACE-FREEZE-MATRIX.md`（Hub REST）、`../research/lubancad-architecture-assessment/04-COLLABORATION-AND-DATA.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`
> 影响面：Hub REST/数据库、checkpoint 作业面（后续私有后端）、Named Version 语义、clone/fork 语义
> 本 ADR 不含私有源码、密钥、native 构建证据；实现证据以可复现命令与测试报告记录。

---

## 1. 背景与约束

G1 要把“账本/版本/checkpoint”从演示级提升为可验证的平台正确性。当前事实（与 `CHECKPOINT-GENERATOR-DESIGN.md` §0 一致，并已在代码中复核）：

1. changeset 账本已有 append-only 触发器与父链哈希，但 `complete` 只检查对象存在，未校验字节大小/哈希；链哈希使用客户端自报 checksum，读路径不强制校验。
2. 生产只有 baseline checkpoint；`createOrUpdateForChangeset` 无生产调用方。Named Version 的 `PUT checkpoint` 只写 `scheduled` 行，不产生作业。
3. clone/fork 是 fail-closed 切片：仅复制最新 checkpoint 容器，`preserveHistory=true` 返回 501，非 head checkpoint 返回 409，目标 checkpoint 行沿用源 changeset 身份；官方“复制历史/内容副本”语义未实现。
4. Named Version 未要求 changeset 已封账；更新 DTO 继承 `changesetId`，存在改写版本指向的完整性缺陷；删除 Named Version 未保护其 checkpoint 引用；未 ready 的 checkpoint 没有显式 409 语义。
5. `waitingForFile` 的悬挂 changeset 可以永久占住链头，后续 push 无法恢复。

约束：

- Hub REST 以官方 iModels v2 契约与官方 clients 为语义基准（P0-07）；本地扩展不得私改官方语义。
- 模型数据事实源仍是 iModel/BIS + `params`；checkpoint 是加速与版本打开的**派生数据**，不是新的模型事实源。
- G1 不引入第二套队列/状态机；复用现有 Postgres、Redis/BullMQ、cron、advisory lock 与 `StoragePort`。
- 真实 checkpoint 字节生成与 readback 属于独立作业面（后续任务）；本 ADR 只冻结控制面与不变量。
- 跨 iTwin 历史复制在能力落地前必须 fail-closed。

---

## 2. 决策

### D-A 不可变账本（D1）

1. **封账条件**：changeset 只在 `complete` 通过“对象存在 + 存储大小 > 0 + 声明大小一致 + 服务端 SHA-256 计算”后进入 `fileUploaded`；失败保持 `waitingForFile`，不得发下载链接。
2. **服务端内容哈希是权威**：complete 计算对象字节 SHA-256，持久化为 changeset `checksum`（64-hex）；客户端 checksum 仅在可验证形态（64-hex SHA-256 或 40-hex SHA-1）时作为一致性断言，不匹配即拒绝；不可验证形态不进入链哈希，不静默信任。
3. **链哈希**：`chainHash = SHA-256(canonical(id, iModelId, index, parentId, checksum, prevHash))`，`prevHash` 在 create 时取父行 `chainHash`。已封账行不得以不同字节重新封账（同摘要幂等，异摘要 409）。
4. **读路径强制**：changeset 下载/预签/批量下载路径验证自身链哈希与父链接；non-null 不匹配一律拒绝（fail closed）。列表/详情响应内嵌的预签链接至少验证**自身哈希**（零额外查询），显式下载/预签/批量路径再做父链接校验。历史 legacy 行（`chainHash IS NULL`）由显式策略开关决定是否放行：默认 `allow-legacy`（兼容存量），可切换 `strict`；任何策略下都不把 legacy 行当作“已验证”。
5. **append-only 兜底**：DB 触发器继续禁止改写 `id/iModelId/index/parentId/prevHash/filePath/briefcaseId/fileSize`；`checksum/chainHash/state/deletedAt` 仅由封账/恢复路径写。
6. **悬挂恢复（D2）**：`waitingForFile` 行超过显式 TTL 视为废弃；新建/重试 push 在事务内清理废弃行（无引用则硬删以复用 index，有引用则软删并从链头判定中排除）；周期 reaper 兜底。已封账行永不因超时被删除。

### D-B Version → 真实 checkpoint 绑定（D4 控制面 + D6）

1. **一个 changeset index 只有一个物理 checkpoint 行**：`UNIQUE (iModelId, changesetIndex) WHERE changesetIndex IS NOT NULL`；baseline 为 index 0。Named Version 通过 `changesetId/changesetIndex` **解析**到该行，可多版本共享；禁止按 NV 命名 db（如 `checkpoint_<iModel>_<nv>.db`）。
2. **`scheduled` 必须有可重放作业**：checkpoint 行与 `checkpoint_jobs` outbox 行在同一事务写入；没有 job 就不允许存在 `scheduled`。生产写入只经控制面服务，不提供旁路。
3. **per-iModel 串行**：claim 在事务内取 `pg_advisory_xact_lock` 并检查未过期 lease；同一 iModel 同时最多一个持有 lease 的生成作业。
4. **成功前必须 readback**：complete 必须携带 worker 回读证据（`openedReadonly=true`、`verifiedSize`）与哈希/目标/链根；hub 独立校验目标已封账、dbName 形态、index 一致、fileSize>0、链根重算一致、容器存在。缺一不得置 `successful`。
5. **GET 投影**：latest checkpoint 只返回 `successful`；`scheduled/failed` 行不返回容器访问信息/下载链接；Named Version checkpoint 未 ready 返回 **409 `CheckpointNotReady`**（不伪造容器/大小/URL）。
6. **NV 封账前置**：创建 Named Version 要求目标 changeset 已 `fileUploaded`；NV 更新不得改写 `changesetId/changesetIndex`；存在 checkpoint 引用的 NV 删除返回 409。
7. **生成开关**：自动/按需生成由 `CHECKPOINT_GENERATION_ENABLED` 控制，默认 **OFF**。关闭时 schedule 端点显式拒绝（409 `CheckpointGenerationDisabled`），后台 scheduler/dispatcher 不产生新作业；reaper 仍负责释放 lease 并把残留活动作业终结为 failed（`GenerationDisabled`），避免幽灵。关闭不删除既有成功 checkpoint。
8. **凭据不落库**：checkpoint 行只存稳定容器身份；SAS/URL 读时现签；本 ADR 不改变 SAS 凭据策略（身份/凭据工作包所有）。

### D-C Duplicate 与 Fork with history（D3）

1. **术语按官方语义**：
   - **History copy** = `clone`（默认全部，或 `changesetIndex=K`）或 `fork preserveHistory=true`：复制 baseline + 1..K changesets（可选复制 ≤K 的成功 checkpoint），目标账本线性独立。
   - **Duplicate（内容副本）** = `fork preserveHistory=false`：在 K 处把内容快照成新 baseline（squash），目标 changesetCount=0。
2. **身份迁移是前置**：changeset 身份改为 `UNIQUE (iModelId, id)`（建议合成 `pk uuid`），子表 FK 复合到 `(iModelId, changesetId)`，触发器 EXISTS 按 iModel 限定；复制历史对目标**重算** `prevHash/chainHash`。迁移完成前，不得把源 changeset 身份写入目标 checkpoint 行。
3. **异步 Create operation**：clone/fork 必须写 `OperationType.Create`（官方客户端轮询 `/operations/create`），目标可先 `initialized` 后 `successful`；失败补偿删除目标容器/前缀。
4. **G1 fail-closed**：身份迁移与物化器落地前，`fork preserveHistory=true` 返回 501；非 head checkpoint 的 clone/fork 返回 409；`preserveHistory=false` 的 squash 在原生 spike 通过前保持 blocked，不得以“复制 checkpoint 文件 + 改 local value”冒充。
5. **跨 iTwin**：历史复制一律 422 `CrossITwinHistoryCopyUnsupported`；绝不 201 后首次打开才失败。

---

## 3. 不变量（实现与测试必须编码）

| ID | 不变量 |
|---|---|
| INV-1 | 已封账 changeset 的字节内容由服务端摘要绑定；异字节重封账被拒 |
| INV-2 | 非 legacy 的链哈希/父链接不匹配时，下载/打开前置路径 fail closed |
| INV-3 | `scheduled` ⇔ 存在 queued/dispatched/claimed 的 outbox 作业；`successful` ⇒ 有 readback 证据与 `verifiedAt` |
| INV-4 | latest checkpoint 只可能是 `successful`；未成功行不返回访问信息/下载链接 |
| INV-5 | 同一 iModel 同时最多一个有效 lease；重复投递只产生一次 claim |
| INV-6 | Named Version 只指向已封账 changeset；不可更新其 changeset 身份；被 checkpoint 引用时不可删除 |
| INV-7 | 生成开关关闭时，不产生新 checkpoint 行/作业，也不把旧活动作业留成永久 scheduled |
| INV-8 | 跨 iModel/跨 iTwin 的 checkpoint 引用与历史复制 fail closed |

---

## 4. 迁移与数据修复

1. **checkpoints 增列**（nullable/additive）：generation source、scheduled/started/completed/verified 时间、attempt/error、manifest/db 哈希、chainRoot、generatorVersion、retired 字段。
2. **`checkpoint_jobs` outbox**：唯一 `checkpointId`、per-iModel 索引、lease 字段、`queued/dispatched/claimed/done/dead` 状态。
3. **迁移内去重**：按 `(iModelId, changesetIndex)` 保留 “successful > scheduled > failed > notGenerated、较新优先” 一行，其余删除；旧 `scheduled` 幽灵行统一标记 `failed`（`LegacyScheduledWithoutJob`），因为无作业可重放。
4. **唯一索引**：`(iModelId, changesetIndex) WHERE changesetIndex IS NOT NULL`。
5. **down 策略**：回滚结构（删表/索引/列）可以执行；迁移内的幽灵状态修复与去重**不可逆**。down 必须 fail-closed：只要存在 `checkpoint_jobs` 非终态行或 `verifiedAt IS NOT NULL` 的成功 checkpoint，就拒绝 down 并提示先导出/降级，不假装可逆。
6. **D3 身份迁移**：单独 ADR/迁移；本 ADR 只冻结前置关系，不在 D4 切片内执行。

---

## 5. 发布、回滚与观测

| 阶段 | 内容 | 门 |
|---|---|---|
| P0 | hub 迁移（增列/outbox/去重/唯一索引）+ 账本/悬挂/NV 硬化；无生成行为 | 迁移 dry-run + 旧库 fixture + 单测 |
| P1 | 控制面端点与 scheduler/dispatcher/reaper，`CHECKPOINT_GENERATION_ENABLED=false` | 假 worker 故障注入（丢消息/重复投递/lease 过期/崩溃） |
| P2 | 真实 checkpoint worker、readback、manifest/GC（后续任务） | 真栈生成/冷开基线证据后才可开 flag |
| P3 | D3 身份迁移 + history copy/async Create operation | 旧库 fixture + clone 内容验收 |
| P4 | squash/Duplicate、D5 版本打开、D7 恢复 | 原生 spike + 真栈打开证据 |

回滚：

- 关闭 `CHECKPOINT_GENERATION_ENABLED`；停止 dispatcher/scheduler 产生新作业；reaper 终结残留活动作业为 failed。
- 不删除既有成功 checkpoint；冷开自动回退 baseline + changesets（正确但慢）。
- clone/fork 保持 fail-closed；**禁止**回退到“复制 baseline 冒充当前内容”。
- hub 回滚不要求 worker 同版本；agent 端点做版本化兼容。

观测（最小集）：scheduled/success/failure 计数、失败错误码、排队深度、lease 过期、readback 失败、complete 校验拒绝原因、每 iModel 生成耗时/尺寸。

---

## 6. 后果

正向：

- 账本不能被静默改写；悬挂 changeset 不再永久堵链。
- Named Version 的“checkpoint”不再是幽灵行，未 ready 有明确 409。
- checkpoint 控制面具备真实作业语义与回滚开关，为真实 worker/D5 提供稳定契约。
- clone/fork 不再产出“空 baseline 冒充当前内容”。

代价/未决：

- D4 默认 OFF 期间，Named Version checkpoint 不可用（已登记例外 X-17）。
- 真实 checkpoint 生成、sidecar manifest、GC、D3 历史复制、D5 版本打开、D7/D8 仍未实现；G1 Gate 对应项不得勾选。
- 存量 legacy 链（chainHash null）在 `strict` 策略下下载会被拒绝；默认 `allow-legacy` 仅表示“显式放行”，不表示已通过完整性验证。

---

## 7. 本 ADR 未决定（后续 ADR/Spike）

1. checkpoint worker 的镜像形态、readback 原生打开、sidecar manifest 与 GC 策略。
2. D3 changeset 身份迁移形态（合成 PK vs 复合 PK）、历史复制物化器和 squash 的 transformer 保真度。
3. D5 版本只读打开 IPC 与 `openCheckpoint` 语义。
4. D6 事件/计数/UI 等待体验、D7 restore/compare、D8 引用键。
5. SAS 凭据策略与身份/ACL 归属（由身份工作包所有，本 ADR 不改）。
6. `checksumBlockNames`、存储块共享与 clone 成本基线。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-23 指令（“G1 architecture-hardening”，先文档后代码）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束，不能作为 G1 Gate “已通过”的证据。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Hub owner | | | |
| 平台/账本 owner | | | |
| 安全/身份 owner（SAS 边界） | | | |
