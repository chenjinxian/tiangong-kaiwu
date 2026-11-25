# 生产级灾备演练 Runbook（PostgreSQL PITR / 对象存储版本化恢复）

> 状态：**Definition v1 — 未执行（2026-11-25）**。
> 本文件只定义生产级 PostgreSQL PITR（base backup + WAL replay）与生产对象存储版本化/恢复演练的
> **输入、预检、步骤、证据字段、RPO/RTO 测量、HITL、清理与回滚**。它**不表示**任何 provider 已接入、
> 任何环境已准备、任何演练已执行、任何结果已产生。
> 本仓公开文档只允许 `<UPPER_SNAKE>` 占位符；**禁止**写入真实 provider/区域/端点/账号/桶名/对象名/
> 凭据/客户数据。解析后的值与命令输出只进私有证据库。
> **RPO≤5m / RTO≤1h 未达成**，除非在真实生产级隔离环境完成本文件的两类演练、记录可复算证据并由
> Data/SRE owner 签字；单次演练也不等于持续合规。G1 E1/E2/E8 与 DR Gate **未勾选**。

---

## 0. 定位：三层能力必须分开

| 层级 | 本仓现有资产 | 实际能力 | 生产资格 |
|---|---|---|---|
| **开发/内网基线** | `docs/operations/BACKUP-RESTORE.md`、`scripts/backup-stack.ps1` / `restore-stack.ps1` | PostgreSQL `pg_dump` + Azurite 命名卷 `tar`；手动全量；无 WAL 归档/PITR、无对象版本化 | **否**；只能作为开发/验证起点 |
| **隔离演练 Phase A** | `docs/operations/DR-DRILL.md`、`scripts/dr/drill-runner.mjs` | 在一次性 `tiangong-kaiwu-drill*` 项目内做非破坏性 roundtrip；Azurite + 最小 seed | **否**；不证明生产 HA/PITR/对象版本化 |
| **生产 DR（本文件）** | 仅 provider-neutral 定义/runbook/校验逻辑 | PITR + 对象版本化 + 跨存储对账的演练规范 | **未执行、未达成**；必须有真实生产级隔离环境证据 |

**隔离 harness 只能打印场景元数据/计划，不能执行本文件的演练**：

```powershell
node scripts/dr/drill-runner.mjs scenarios --format json
node scripts/dr/drill-runner.mjs plan --scenario postgres-pitr --format json
node scripts/dr/drill-runner.mjs plan --scenario object-storage-versioning --format json
```

`plan` 输出固定 `runnableHere=false` / `executableByIsolatedHarness=false`。生产演练由 Data/SRE owner
在真实生产级隔离环境按本文件人工执行，并把证据写入私有证据库。

---

## 1. 适用对象与硬不变量

适用于**生产级** PostgreSQL 与**生产级**对象存储（含托管或自建形态；本文件不锁定 provider）。

1. **成套恢复**：PostgreSQL 元数据与对象存储 blob 必须来自同一恢复目标（时间点或版本 manifest）。
   只恢复数据库或只恢复对象存储都不算灾备。
2. **目标隔离**：恢复目标必须是可丢弃的隔离实例/桶/前缀；**禁止**对主栈或生产写路径执行恢复。
3. **HITL**：演练窗口、恢复、清理、证据与声明均有具名负责人+见证人审批；无审批不执行、不声明。
4. **无秘密入公开仓**：凭据只从批准的 secret manager 读取；证据只记录 redacted 标签与私有引用。
5. **失败封闭**：预检/恢复/校验任一步失败即停止；不得“先开放服务再补证据”。
6. **目标不是成就**：定义、计划、模板、场景列表都不构成 RPO/RTO 或生产 DR 证据。

---

## 2. 占位符与秘密边界

| 占位符 | 用途 | 是否允许入公开仓 |
|---|---|---|
| `<PG_PRIMARY_ENDPOINT>` | 生产级 PostgreSQL 只读参考端点 | 仅占位符；解析值只进私有证据 |
| `<PG_DATABASE_NAME>` | 待恢复数据库名 | 仅占位符 |
| `<PG_BACKUP_REPOSITORY_REF>` | base backup/WAL 仓库的私有引用 | 仅引用，不含凭据 |
| `<PITR_TARGET_UTC>` | 本次演练的恢复目标时间（ISO-8601） | 仅占位符；真实值入私有证据 |
| `<RESTORE_INSTANCE_REF>` | 一次性隔离恢复实例的私有引用 | 仅引用 |
| `<EXPECTED_SCHEMA_VERSION>` | 期望的迁移/schema 版本 | 可记录版本号，不记录连接信息 |
| `<LAST_ACKED_EDIT_UTC>` | 最新已确认编辑时间，用于损失窗口说明 | 仅占位符 |
| `<PAIRED_OBJECT_MANIFEST_REF>` | 与同一恢复目标对齐的对象版本 manifest 私有引用 | 仅引用 |
| `<SECRET_SOURCE_REF>` | secret manager 引用（不是凭据本身） | 仅引用 |
| `<EVIDENCE_VAULT_REF>` | 私有证据库位置 | 仅引用 |
| `<OBJECT_STORE_ENDPOINT>` | 生产对象存储端点引用 | 仅占位符；解析值只进私有证据 |
| `<SOURCE_BUCKET>` | 生产源桶/容器名 | 仅占位符 |
| `<RESTORE_TARGET_BUCKET>` | 一次性隔离恢复目标桶/前缀 | 仅占位符 |
| `<OBJECT_RESTORE_SET_MANIFEST_REF>` | 对象版本/大小/SHA-256 清单私有引用 | 仅引用 |
| `<CHECKSUM_ALGORITHM>` | 演练校验算法；必须解析为 SHA-256 | 可记录算法名 |
| `<OBJECT_RECOVERY_TARGET_UTC>` | 与 PostgreSQL 共享的恢复目标时间 | 仅占位符；真实值入私有证据 |

**规则**：

- 仓库中的计划/模板/文档只出现占位符；`validateProductionInputs(..., { mode: 'template' })` 会拒绝具体端点。
- Operator 解析值不得提交；证据中的 `environment.*` 只能是 `provider/region/environmentClass` 等
  redacted 标签，不得含 provider 账号、端点、桶名、对象名或凭据。
- 不得把 provider 控制台输出、SAS/token、连接串、证书、客户对象名粘贴到公开 issue/PR/文档。

---

## 3. 生产级能力前提（缺一即按开发环境对待）

| 层 | 生产演练前必须具备 | 明确拒绝 |
|---|---|---|
| PostgreSQL | 连续 WAL 归档/流式归档；可用 base backup；保留窗口覆盖目标时间；PITR-capable 隔离实例；TLS；备份/恢复校验和 | 仅 `pg_dump`；无 WAL；目标超出保留；主栈就地恢复 |
| 对象存储 | 版本化已启用且未 suspended；可按 version ID 读取；静态加密；SHA-256 校验和；隔离恢复目标；容量足够 | Azurite；单命名卷；无版本化；仅 MD5/CRC；源桶就地覆盖 |
| 凭据 | 短时、最小权限，经 secret manager 获取；演练后撤销 | 长期共享 key；把凭据写入证据/命令历史 |
| 证据 | 私有证据库、哈希/清单、审批与见证人、命令输出脱敏 | 公开仓记录真实环境/客户数据/未脱敏输出 |

> 对象锁/不可变保留、跨区复制（CRR）属于 ADR-G0-17 的生产能力要求；本 runbook 的恢复演练至少验证
> **版本化 + 版本级读取 + SHA-256 + 隔离恢复**。CRR/对象锁若尚未启用，必须在证据中登记为残余差距，
> 不得写成“生产对象存储已验证”。

---

## 4. 场景 P1：PostgreSQL PITR（base backup + WAL replay）

### 4.1 输入

| 输入 | 占位符 | 说明 |
|---|---|---|
| 主库参考端点 | `<PG_PRIMARY_ENDPOINT>` | 只读引用；不是凭据 |
| 数据库名 | `<PG_DATABASE_NAME>` | 恢复目标库 |
| 备份仓库引用 | `<PG_BACKUP_REPOSITORY_REF>` | base backup + WAL 的私有位置引用 |
| 恢复目标时间 | `<PITR_TARGET_UTC>` | 必须在保留窗口内、不得在未来 |
| 隔离恢复实例 | `<RESTORE_INSTANCE_REF>` | 一次性、可丢弃、与主栈无关 |
| 期望 schema 版本 | `<EXPECTED_SCHEMA_VERSION>` | 恢复后必须一致 |
| 最新已确认编辑时间 | `<LAST_ACKED_EDIT_UTC>` | 损失窗口说明 |
| 配对对象 manifest | `<PAIRED_OBJECT_MANIFEST_REF>` | 同一恢复目标的对象版本清单 |
| secret 来源 | `<SECRET_SOURCE_REF>` | 仅引用，不记录凭据 |
| 证据库 | `<EVIDENCE_VAULT_REF>` | 私有证据目的地 |

### 4.2 预检（全部为阻断项，未知=失败）

| 检查 ID | 通过条件 | 失败动作 |
|---|---|---|
| `wal-archiving-enabled` | 连续 WAL 归档/流式归档已启用且可观测 | 停止；不得用 `pg_dump` 冒充 PITR |
| `base-backup-available` | 存在完成且可校验的 base backup | 停止；先修复备份链 |
| `pitr-target-present` | 有具体 ISO-8601 目标，非占位符 | 停止；补齐目标时间 |
| `pitr-target-within-retention` | 目标在保留窗口内且不在未来 | 重选目标或登记保留缺口；不得伪造目标 |
| `base-backup-before-target` | 至少一个 base backup 早于目标 | 停止；备份链不成立 |
| `target-isolated` | 恢复实例一次性、隔离、非主栈 | 停止；重新准备隔离环境 |
| `target-not-main-stack` | 显式 `isMainStack=false` | 停止；主栈永不作为演练目标 |
| `writers-frozen` | 演练窗口内写者已冻结/fenced | 停止；否则 RPO/RTO 不可解释 |
| `secret-source-declared` | 凭据仅来自批准 secret manager | 停止；不得把凭据写入命令/证据 |
| `paired-object-manifest-declared` | 已有同目标的解析后对象版本 manifest 引用 | 停止；否则无法做跨存储对账 |
| `expected-schema-declared` | 期望 schema/迁移版本已记录 | 停止；否则无法判定恢复正确性 |
| `capacity-verified` | 恢复磁盘/WAL/临时空间足够 | 停止；扩容后重跑预检 |

### 4.3 步骤

> 具体命令因 provider/部署形态而异；以下只规定**必须发生的事实与证据**，不提供任何真实端点。
> PostgreSQL 原生机制为 base backup + 归档 WAL replay（如 `recovery_target_time`）；托管服务的
> point-in-time restore 只要满足等价语义即可。

1. **宣布窗口**：记录 UTC 开始时间（RTO 起点）、操作者、见证人、变更单/审批引用。
2. **冻结写者**：停止所有写入路径（Hub/MS/WA/用户写请求），记录最新已确认编辑时间 `<LAST_ACKED_EDIT_UTC>`。
3. **采集基线证据**：数据库标识、schema/迁移版本、base backup 引用、WAL 归档区间、配对对象 manifest 引用。
4. **选定目标**：记录 `<PITR_TARGET_UTC>` 及保留窗口依据；不得在恢复过程中“猜一个更晚的时间”。
5. **恢复 base backup 到隔离实例**（破坏性；仅目标实例）。
6. **按目标时间 replay WAL**：记录实际停止时间/恢复点；必须恰好停在目标容差内（默认 ±60s）。
7. **只读打开**：恢复目标保持只读，禁止用户流量与写者接入。
8. **数据库校验**：
   - schema/迁移版本 = `<EXPECTED_SCHEMA_VERSION>`；
   - 关键表行数、changeset 链/head、checkpoint 状态、Named Version 映射；
   - 运行只读完整性扫描（参见 `INTEGRITY-SCAN.md`），exit 3/1 不得写成 clean。
9. **跨存储对账**：用 `<PAIRED_OBJECT_MANIFEST_REF>` 校验 changeset/baseline/checkpoint/tile 的
   版本、大小、SHA-256；不得以“最新对象”猜测。
10. **业务验收**：至少 3 个样例文档（含 1 个 ≥100 changeset），核对几何/特征树/参数/history/
    Named Version/checkpoint；执行一次编辑→push→关闭→重开冒烟与 undo/redo 冒烟。
11. **测量与签字**：按 §6 公式计算 RPO/RTO；记录失败/告警/人工干预/残余项；操作者+见证人签字。
12. **清理**：仅销毁一次性隔离恢复实例；保留源备份/WAL/对象版本与全部证据。

### 4.4 证据字段

证据 schema 与校验实现见 `scripts/dr/production-drills.mjs`；模板见
`scripts/dr/fixtures/production-pitr-evidence.not-run.json`。

| 字段 | 要求 |
|---|---|
| `status` | `not-run`/`in-progress`/`passed`/`failed`/`incomplete`；仓库模板固定 `not-run` |
| `environment.*` | 仅 redacted 标签；`isolated=true`、`isMainStack=false` |
| `hitl.*` | 窗口/恢复/清理审批 + 审批人/见证人/UTC |
| `preflight[]` | 每个阻断项 `ok` 与脱敏 detail |
| `restore.backupRepositoryRef/baseBackupUtc/requestedTargetUtc/achievedRecoveryPointUtc` | 私有引用与时间 |
| `restore.walReplayComplete/readOnly` | 必须为 true 才能 passed |
| `verification.schemaVersionObserved/schemaVersionExpected/ledgerVerificationPassed` | 必须一致/通过 |
| `verification.crossStoreReconciliationPassed` | 配对对象 manifest 校验通过 |
| `rpo.*` | 组件 RPO 时间戳、`lastAckedEditUtc`（PITR）与 `measuredSeconds`；必须可复算 |
| `rto.*` | 宣布→技术+业务验收签字的时间戳与 `measuredSeconds` |
| `claims.pitrProven` | 仅通过且 `verification.pitrVerified=true` 时才可为 true |
| `claims.productionDisasterRecoveryProven` | **单场景恒为 false**；组合 DR 须另证 |
| `cleanup.*` / `rollback.*` / `evidenceRefs[]` | 清理、回滚检查与私有证据引用 |

---

## 5. 场景 P2：对象存储版本化/恢复

### 5.1 输入

| 输入 | 占位符 | 说明 |
|---|---|---|
| 对象存储端点引用 | `<OBJECT_STORE_ENDPOINT>` | provider-neutral；不含凭据 |
| 源桶/容器 | `<SOURCE_BUCKET>` | 生产源 |
| 隔离恢复目标 | `<RESTORE_TARGET_BUCKET>` | 必须不同于源，且一次性 |
| 恢复集 manifest | `<OBJECT_RESTORE_SET_MANIFEST_REF>` | 对象名/version ID/大小/SHA-256 |
| 校验算法 | `<CHECKSUM_ALGORITHM>` | 必须为 SHA-256 |
| 共享恢复目标 | `<OBJECT_RECOVERY_TARGET_UTC>` | 与 PostgreSQL 场景一致 |
| 隔离实例 | `<RESTORE_INSTANCE_REF>` | 一次性环境 |
| secret 来源 | `<SECRET_SOURCE_REF>` | 仅引用 |
| 证据库 | `<EVIDENCE_VAULT_REF>` | 私有证据目的地 |

### 5.2 预检（全部为阻断项，未知=失败）

| 检查 ID | 通过条件 | 失败动作 |
|---|---|---|
| `versioning-status-enabled` | 桶/容器版本化状态为 enabled | **停止；未版本化存储不进入恢复** |
| `versioning-not-suspended` | 非 suspended，且可按 version ID 读取 | 停止；恢复不可重复 |
| `checksum-manifest-present` | 有含 version ID/大小/SHA-256 的 manifest | 停止；无清单不得恢复 |
| `checksum-algorithm-sha256` | 校验算法为 SHA-256 | 停止；MD5/CRC 不能替代内容校验 |
| `target-isolated` | 恢复目标一次性、隔离、非主栈 | 停止 |
| `target-not-main-stack` | 显式 `isMainStack=false` | 停止 |
| `source-target-separated` | 恢复目标 ≠ 源桶/前缀 | 停止；禁止就地覆盖历史 |
| `writers-frozen` | 写者已冻结/fenced | 停止 |
| `restore-set-declared` | 精确对象版本集已声明 | 停止；不得“边恢复边猜” |
| `secret-source-declared` | 凭据仅来自批准 secret manager | 停止 |
| `encryption-at-rest-enabled` | 生产级存储报告静态加密 | 停止；dev emulator 不满足 |
| `capacity-verified` | 恢复目标容量足够 | 停止 |

### 5.3 步骤

1. **宣布窗口**：记录 UTC 开始（RTO 起点）、操作者、见证人、审批引用。
2. **冻结写者**：记录与 PostgreSQL 场景共享的恢复目标时间。
3. **采集版本清单**：对 matched set 记录对象名、version ID、大小、SHA-256、版本时间戳；
   不得记录真实对象名到公开仓。
4. **验证版本化**：确认 versioning=enabled、声明版本可读；**未版本化/ suspended 直接失败**。
5. **恢复到隔离目标**（破坏性；仅隔离桶/前缀）：禁止覆盖源对象。
6. **逐对象校验**：对象数一致；version ID 一致；大小一致；SHA-256 一致。
7. **目标时间校验**：拒绝任何版本时间戳晚于共享恢复目标的版本（默认 ±60s 容差）。
8. **跨存储对账**：DB 中 changeset/baseline/checkpoint/tile 引用必须能匹配恢复后的对象版本。
9. **业务验收**：样例文档打开、历史链、tile/baseline 下载。
10. **测量与签字**：按 §6 计算组件 RPO/RTO；记录残余项；操作者+见证人签字。
11. **清理**：仅销毁隔离恢复目标；保留源对象版本与证据。

### 5.4 证据字段

证据 schema 与校验实现见 `scripts/dr/production-drills.mjs`；模板见
`scripts/dr/fixtures/production-object-versioning-evidence.not-run.json`。

| 字段 | 要求 |
|---|---|
| `status` | 仓库模板固定 `not-run` |
| `environment.*` | 仅 redacted 标签；隔离且非主栈 |
| `preflight[]` | 含 versioning status、checksum algorithm 等阻断项 |
| `restore.versioningStatus/restoreCompleted` | 必须 `enabled`/true 才能 passed |
| `restore.objectsExpected/objectsRestored` | 必须相等且 >0 |
| `restore.newestRestoredVersionUtc` | 最新使用版本的 UTC 时间 |
| `verification.checksumsVerified/objectVersionIdsVerified` | 必须为 true |
| `verification.crossStoreReconciliationPassed` | DB 引用与对象版本对齐 |
| `rpo.*` | 组件 RPO 时间戳与可复算的 `measuredSeconds` |
| `rto.*` | 宣布→技术+业务验收签字的时间戳与 `measuredSeconds` |
| `claims.objectVersioningProven` | 仅通过且 `checksumsVerified=true` 时才可为 true |
| `claims.productionDisasterRecoveryProven` | **单场景恒为 false** |
| `cleanup.*` / `rollback.*` / `evidenceRefs[]` | 清理、回滚检查与私有证据引用 |

---

## 6. RPO / RTO 口径（两类场景统一）

### 6.1 目标

- **RPO ≤ 5 分钟（300s）**：PostgreSQL 与对象存储组合恢复点。有效 RPO 取两侧组件最大值。
- **RTO ≤ 1 小时（3600s）**：从“宣布进入恢复”到技术验收 + 业务验收 + HITL 签字完成。
- 已 push 且收到 ack 的编辑目标 RPO=0；该目标需要同步复制/仲裁或等价持久化证据，当前不承诺。

### 6.2 测量公式

| 指标 | 公式 | 说明 |
|---|---|---|
| PITR 组件 RPO | `max(0, <PITR_TARGET_UTC> - achievedRecoveryPointUtc)` | 恢复点早于目标的部分即损失窗口；晚于目标超过容差属于 `pitr-target-overshot` 失败 |
| 对象组件 RPO | `max(0, <OBJECT_RECOVERY_TARGET_UTC> - newestRestoredVersionUtc)` | 选中的最新版本必须不晚于共享恢复目标 |
| 组合 RPO | `max(PITR 组件 RPO, 对象组件 RPO)` | 不得只报较小的一侧 |
| RTO | `verifiedAtUtc - announcedAtUtc` | 含恢复、WAL replay、对象复制、校验、跨存储对账、业务验收与签字 |

**时间来源**：备份/版本时间戳、恢复目标与完成时间、最后一条已确认编辑、业务验收签字；
真实值只进私有证据库，公开仓只放脱敏结论。

### 6.3 诚实边界

- 证据模板固定 `not-run`，`claims.*` 初始全为 false；计划只是定义、没有测量值；
  **没有真实演练就没有 RPO/RTO 数字**。
- 单次通过只能支持“该次演练在目标内”的组件测量；不能证明持续合规、HA 切换、跨主机时延、
  生产规模、Redis/队列恢复或对象锁/CRR。
- `productionDisasterRecoveryProven` 在单场景证据中**恒为 false**；组合 DR 需要两类场景 + 跨存储
  对账 + owner 签字。
- 证据校验会拒绝：未通过却声称目标达成、测量值与时间戳不一致、清理/HITL/证据引用缺失、
  未解析占位符、把单场景写成组合 DR。

---

## 7. 证据模板与校验

| 资产 | 作用 |
|---|---|
| `scripts/dr/production-drills.mjs` | 场景定义、预检、恢复评估、RPO/RTO 计算、证据 schema 校验 |
| `scripts/dr/fixtures/production-pitr-evidence.not-run.json` | PITR 未执行证据模板（仅占位符） |
| `scripts/dr/fixtures/production-object-versioning-evidence.not-run.json` | 对象版本化未执行证据模板（仅占位符） |
| `scripts/dr/production-drills.test.mjs` | 无 Docker/云的纯单测：占位符约束、预检失败、缺失目标、未版本化、校验和不符、恢复不完整、声明膨胀 |
| `scripts/dr/drill-runner.mjs` 的 `scenarios` / `plan` | 只打印定义，**不执行**生产演练 |

> 校验器只检查证据结构、时间戳与内部一致性；它**不能**证明演练真实发生、操作者/见证人身份可信，
> 也不能替代私有证据库与 owner 签字。`passed` 证据仍必须由人审阅私有命令输出/哈希后签字。

本地校验（不接触任何真实环境）：

```powershell
node --test scripts/dr/production-drills.test.mjs
node scripts/dr/drill-runner.mjs scenarios --format json
node scripts/dr/drill-runner.mjs plan --scenario postgres-pitr --format json
```

---

## 8. HITL 闸门（两类场景共用）

| 闸门 | 必须记录 | 未满足时的动作 |
|---|---|---|
| 演练窗口批准 | Data/SRE owner + 见证人 + 变更单/时间窗 | 不执行 |
| 恢复批准 | 隔离目标引用、确认非主栈、配对 manifest/时间点 | 不执行 |
| 清理批准 | 仅销毁 drill-only 资源；源备份/WAL/对象版本保留 | 不清理、不销毁 |
| 证据/声明签字 | 操作者+见证人逐项确认 claims 与残余差距 | 不得对外声明达标 |

**任何“RPO≤5m/RTO≤1h 已达成”“生产 DR 已证明”的声明都需要 owner 明确签字；本仓库当前没有该证据。**

---

## 9. 清理、回滚与失败判据

### 9.1 清理

1. 先把预检/命令输出/时间戳/哈希/审批/残余项写入 `<EVIDENCE_VAULT_REF>`。
2. 仅销毁一次性隔离恢复实例/桶/前缀；**不得删除**源 base backup、WAL 归档、对象版本或原始备份集。
3. 通过 secret manager 撤销临时凭据并记录吊销时间。
4. 记录残留资源与 owner；不得把残留隐藏在“passed”里。

### 9.2 回滚

- 不删除 WAL 归档/对象版本/源备份；回滚不得制造历史分叉。
- 校验失败时停止隔离目标、保留证据、不得提升或对外服务。
- 如发生端点切换，必须由 owner 书面决定并在新的配对大验证后才可回切；禁止双写历史。
- 任何回退到“单卷生产/只有 `pg_dump`”的方案必须登记例外并停止对外可靠性承诺。

### 9.3 失败判据（发现即不得宣称达标）

1. 无具体 PITR 目标、目标超出保留窗口、无 base backup 或 WAL 归档。
2. WAL replay 未完成、恢复点早于/晚于目标超过容差、数据库被读写打开。
3. schema/迁移版本不一致，或 changeset 链/head/checkpoint/Named Version 校验失败。
4. 对象存储未版本化、versioning suspended/unknown、无法按版本读取。
5. 对象缺失、version ID/大小/SHA-256 不一致、恢复对象数少于声明或恢复未完成。
6. 选中的对象版本晚于共享恢复目标，或无法与 DB 引用对账。
7. 目标为主栈、非隔离、可被用户访问，或恢复期间写者未冻结。
8. RPO/RTO 无时间戳/证据、测量值与公式不一致、清理/HITL/私有证据引用缺失。
9. 清理删除源历史或留下隔离目标/临时凭据。
10. 用单场景证据声称组合生产 DR，或用 Azurite/`pg_dump`/Phase A roundtrip 替代生产演练。

---

## 10. 当前证据状态（2026-11-25）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| 本文件定义（PITR / 对象版本化） | **已登记，未执行** | 仅 provider-neutral runbook；无 provider/环境/凭据/结果 |
| `production-drills.mjs` 校验逻辑 | **已实现（纯逻辑）** | 单测覆盖占位符、预检失败、缺失 PITR 目标、未版本化、校验和不符、恢复不完整、声明膨胀 |
| PostgreSQL HA/WAL/PITR | **未实现** | 单 PostgreSQL；见 ADR-G0-14 §6 |
| 对象存储版本化/对象锁/CRR | **未实现** | Azurite 单卷；见 ADR-G0-17 §6 |
| 生产 PITR 演练 | **未执行** | 无真实恢复点、无 RPO/RTO 证据 |
| 生产对象版本化恢复演练 | **未执行** | 无真实版本/校验和/对账证据 |
| 组合 DR（DB+对象+跨存储对账） | **未证明** | 单场景证据固定 `productionDisasterRecoveryProven=false` |
| RPO≤5m / RTO≤1h | **未达成** | 无通过的真实生产级演练；隔离 Phase A 计时不是生产证据 |
| G1 E1/E2/E8 / DR Gate | **未完成、未勾选** | 本文件不改变 Gate 状态 |

**明确不宣称**：生产 PITR 已上线、对象版本化已上线、HA 已具备、RPO≤5m/RTO≤1h 已达成、
生产灾难恢复已被证明、任何 provider 已完成接入或演练。上述结论只能来自真实生产级隔离环境的
完整演练、可复算证据与 owner 签字。

---

## 11. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-25 | Definition v1：新增 provider-neutral PITR 与对象存储版本化恢复 runbook；明确与开发基线/Phase A 的边界；新增纯逻辑定义/预检/证据校验与 `scenarios`/`plan` 只读命令；**未执行任何生产演练，未宣称 RPO/RTO 或 Gate 完成** |
