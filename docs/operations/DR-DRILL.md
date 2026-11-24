# 灾备演练 Runbook（Phase A 隔离执行器）

> 状态：**Phase A harness v1 — 非破坏性演练已在隔离 drill 项目实际执行**（2026-11-24）。
> 已执行：源 drill 的 create/up/seed/backup/manifest 校验，以及**空目标 drill 项目**的
> restore/post-restore 验证/报告。**未执行**：任何故障注入（S3）、主栈读写、`down -v`/teardown。
> 本次测量值只是单次演练计时；**不宣称 RPO≤5m / RTO≤1h 已达标**，也不宣称生产 HA/PITR。
>
> 关联：`docs/operations/BACKUP-RESTORE.md`、`docs/operations/INTEGRITY-SCAN.md`、
> `docs/architecture/G1-EXECUTION-PLAN.md` E1/E2/E8、`docs/architecture/G0-DECISION-REGISTER.md` D0-14。

## 0. 一句话原则

**只动演练项目；绝不碰共享/生产栈。** 演练器在 `<repo>/.drill/<drillId>/` 生成一次性工作区
（独立 `.env`、独立 compose、独立卷/网络、独立宿主端口），只允许
`tiangong-kaiwu-drill` 或 `tiangong-kaiwu-drill-*` 项目；主项目 `tiangong-kaiwu` 在任何
Docker 调用之前被拒绝。破坏性故障注入默认关闭，且需要三重显式闸门；本切片没有执行。

---

## 1. 交付物

| 文件 | 作用 |
|---|---|
| `scripts/dr/docker-compose.drill.yml` | 独立 drill compose（**不与根 compose 合并**）：postgres/redis/maildev/azurite/imodelhub/webhook-agent，显式 drill 卷、网络、高位端口 |
| `scripts/dr/drill-core.mjs` | 纯逻辑：参数校验、项目/端口/路径隔离、manifest 校验、主栈快照比较、报告 schema、Azurite SharedKey 签名 |
| `scripts/dr/drill-runner.mjs` | 执行器：create/preflight/up/seed/backup/verify-backup/restore/verify/report/down；破坏性命令仅以闸门形式存在 |
| `scripts/dr/drill-core.test.mjs` | 35 个 `node:test`：拒绝主项目、隔离检查、manifest/哈希、报告 schema、签名等 |
| `scripts/dr/fixtures/*.json` | 合成 manifest / drill report 夹具（无真实数据） |
| `scripts/dr/New-DrillEnvironment.ps1` | 创建演练工作区的 PowerShell 包装器 |
| `scripts/dr/Seed-DrillEnvironment.ps1` | 启动最小演练栈并播种的 PowerShell 包装器 |
| `scripts/dr/Remove-DrillEnvironment.ps1` | 停止（默认保卷）/ HITL 删除演练项目的包装器 |

工作区默认 `gitignore`：根 `.gitignore` 已加入 `.drill/`，工作区内另有 `.drill/.gitignore`。
`.drill/` 内含随机密钥、备份产物、报告和模型标识，**只能留在本机/私有证据库，禁止提交**。

---

## 2. 隔离模型

### 2.1 工作区与项目

每次演练使用一个一次性工作区：

```text
<repo>/.drill/<drillId>/
  .env                 # 演练专用随机密钥（0600）；打印/报告从不输出
  docker-compose.yml   # scripts/dr/docker-compose.drill.yml 的副本
  scripts/backup-stack.ps1   # 根脚本原样副本（行为未改）
  scripts/restore-stack.ps1  # 根脚本原样副本（行为未改）
  backups/             # drill-only 备份（manifest/大小/SHA-256）
  evidence/            # 报告、完整性扫描、哈希
  drill-meta.json      # 项目/端口/卷/网络/工具哈希/源提交
  state.json           # 各 phase 状态、seed、restore、verification
```

copy 到工作区的目的：`backup-stack.ps1` / `restore-stack.ps1` 以自身目录的父目录为
checkout 根，读取该目录的 `.env` 与 `docker-compose.yml`。这样**不需要修改这两个脚本**，
也不会误读主 `.env` / 主 compose。

### 2.2 端口与卷

演练端口按 `--port-offset 0..9` 分配（offset=0 示例）：

| 用途 | 宿主端口（仅 127.0.0.1） |
|---|---|
| HUB | 15400 |
| 宿主 MS（drill 不启动，仅记录） | 15401 |
| webhook-agent | 15402 |
| Azurite blob/queue/table | 20500 / 20501 / 20502 |

offset 每 +1，上述端口整体 +100。主栈端口 5300/5301/5400/5401/5402/5403/10500-10502
等都在保留集合中，演练计划与之不相交；`preflight` 还会检查这些端口是否已被其他项目发布。

卷/网络显式命名：

```text
<project>-pgdata
<project>-redis-data
<project>-azurite-data
<project>-net
```

`<project>` 必须是 `tiangong-kaiwu-drill` 或以 `tiangong-kaiwu-drill-` 开头。源和目标用不同
project + 不同 offset，可以同时运行，互不共享卷/网络/端口。

### 2.3 硬拒绝

运行器在任何 Docker 操作前执行：

- `verifyIsolation(meta)`：项目名、工作区位置（必须在 `<repo>/.drill` 下）、compose/env
  必须位于工作区（不得是根 `docker-compose.yml` / 根 `.env`）、卷/网络/端口必须匹配；
- `snapshotMainProject()` 前后比较主项目容器/卷标签；任何变化立即中止；
- `restore` 前重新校验备份 manifest/SHA-256，并检查目标 DB 用户表数=0、Azurite 卷为空、
  无写者运行；非空目标直接拒绝（**不会自动 `-Force`**）。

---

## 3. 安全闸门（HITL）

| 命令 | 闸门 | 说明 |
|---|---|---|
| `create` / `preflight` / `up` / `seed` / `backup` / `verify-backup` / `verify` / `report` / `down` | 无 | 只写 `.drill` 或演练容器；`backup` 会先停 drill 写者（hub/WA/azurite）以获得 quiesced 配对 |
| `restore` | `--confirm-project <drill-project>` | 只允许恢复到已验证为空的 drill 目标；**永不自动 `-Force`** |
| `roundtrip` | `--confirm-project <source-drill-project>` | 创建第二个 drill 目标并恢复；需操作者显式确认 |
| `reset-target` | `--allow-drill-reset` + `--confirm-project` | 仅删除**演练项目**卷；默认不执行 |
| `teardown` | `--confirm-project` | `docker compose down -v` 仅限演练项目；默认不执行 |
| `fault-inject` | `--scenario ... --allow-destructive --confirm-project <project>` + 环境变量 `DR_DRILL_DESTRUCTIVE_ACK=1` | 破坏性注入；本切片**未执行** |

`--confirm-project` 必须逐字等于演练项目名；`tiangong-kaiwu` 会被拒绝。恢复/销毁前必须由
演练负责人+见证人确认项目/卷/备份 ID，并记录窗口与源提交。

---

## 4. 精确命令（Windows PowerShell）

先跑单测（不碰 Docker/网络/live 数据）：

```powershell
node --test scripts/dr/drill-core.test.mjs
node --test scripts/integrity/integrity-scan.test.mjs
```

### 4.1 源演练：创建 → 启动 → 最小播种 → 备份

```powershell
$Runner = 'scripts/dr/drill-runner.mjs'
$DrillId = 'drill-20261124-01'

node $Runner create --drill-id $DrillId --project tiangong-kaiwu-drill --port-offset 0
node $Runner preflight --workspace ".drill/$DrillId"
node $Runner up     --workspace ".drill/$DrillId" --timeout-sec 240
node $Runner seed   --workspace ".drill/$DrillId"
node $Runner backup --workspace ".drill/$DrillId"
node $Runner verify-backup --workspace ".drill/$DrillId"
node $Runner report --workspace ".drill/$DrillId"
```

`seed` 只使用现有 API：

1. `POST /auth/email/login`（drill `.env` 的独立 admin 密码）；
2. `POST /itwins`（1 个 iTwin）与 `POST /imodels`（1 个 iModel）；
3. Azurite REST：幂等创建 `imodelhub` 容器，PUT `drill-seed/<drillId>.txt` 并回读 SHA-256。

不做生产数据导入；不要求 baseline 生成（Phase A 不启动宿主 MS）。

### 4.2 空目标演练：第二个 drill 项目 → 恢复 → 验证

```powershell
$TargetId = 'drill-20261124-01-restore'
$TargetProject = 'tiangong-kaiwu-drill-restore'
$Backup = (Get-ChildItem ".drill/$DrillId/backups" -Directory |
  Sort-Object Name -Descending | Select-Object -First 1).FullName

# 目标工作区从源工作区复制演练密钥（只允许 .drill 下的工作区；主 .env 不是合法模板）
node $Runner create --drill-id $TargetId --project $TargetProject --port-offset 1 `
  --env-template ".drill/$DrillId"

# HITL：restore 必须显式确认目标项目，且 --project/--confirm-project 必须一致
node $Runner restore --workspace ".drill/$TargetId" --project $TargetProject --port-offset 1 `
  --backup-dir "$Backup" --source-workspace ".drill/$DrillId" `
  --confirm-project $TargetProject

node $Runner verify --workspace ".drill/$TargetId" --project $TargetProject --port-offset 1 `
  --timeout-sec 240
node $Runner report  --workspace ".drill/$TargetId" --project $TargetProject --port-offset 1
node $Runner report-roundtrip --workspace ".drill/$TargetId" --project $TargetProject `
  --port-offset 1 --source-workspace ".drill/$DrillId"
```

注意：
- `--backup-dir` 在目标工作区命令中建议使用**绝对路径**；相对路径按目标工作区解析。
- `restore` 会先启动目标 Postgres、`create` 一个停止的 Azurite 容器（不启动它），
  再检查目标为空；非空则拒绝。恢复后由运行器启动完整 drill 栈并等待 HUB health。
- `verify` 是 drill 版验收：HUB health/login、备份前 seed 的 iModel 行、Azurite sentinel
  blob 的字节/SHA-256、以及只读 `Invoke-IntegrityScan.mjs`。**不是**根 `verify-stack.ps1`
  （后者钉死主栈端口，同宿主演练会误测主栈）。

### 4.3 一键非破坏性序列（可选）

```powershell
# 只做源侧：create -> up -> seed -> backup -> verify-backup -> report
node $Runner run --drill-id drill-20261124-02

# 源 + 空目标恢复（HITL：显式 --confirm-project；内部创建 <source>-restore 目标）
node $Runner roundtrip --drill-id drill-20261124-02 --confirm-project tiangong-kaiwu-drill
```

### 4.4 停止与环境清理

```powershell
# 默认：停止容器，保留卷/证据（非破坏性）
node $Runner down --workspace ".drill/$DrillId"
node $Runner down --workspace ".drill/$TargetId" --project $TargetProject

# 包装器等价（默认保留卷）
powershell -File scripts/dr/Remove-DrillEnvironment.ps1 -Workspace ".drill/$DrillId"
powershell -File scripts/dr/Remove-DrillEnvironment.ps1 -Workspace ".drill/$DrillId" -WhatIf

# HITL 删除演练卷（仅演练项目；本切片未执行）
powershell -File scripts/dr/Remove-DrillEnvironment.ps1 -Workspace ".drill/$DrillId" `
  -DeleteVolumes -ConfirmProject tiangong-kaiwu-drill
```

删除前先把 `backups/`、`evidence/` 复制到私有证据库；**绝不要**对主项目
`tiangong-kaiwu` 执行 `down -v`。

---

## 5. 场景映射

| 场景 | 对应命令 | 本次是否执行 |
|---|---|---|
| S0 只读预检/备份成套校验 | `preflight`、`verify-backup` | 是（drill 源） |
| S1 空演练栈恢复 | `create`(offset+1) → `restore` → `verify` | 是（第二个空 drill 项目） |
| S2 恢复后完整性/一致性 | `verify`（integrity scan）+ `report`/`report-roundtrip` | 是；扫描 exit 1，原因见 §7 |
| S3 故障注入/破坏性 | `fault-inject`（三重闸门） | **否** |
| S4 调度/重复演练 | 季度重复 S0–S2 | 未调度 |

S3 只能在一次性 drill 项目内、书面批准后、由演练负责人现场执行；本切片未执行，因此
“扫描能检测漂移”的结论仍未演练，不得用 S0–S2 结果替代。

---

## 6. 报告 JSON 与 RPO/RTO 口径

`report` 写 `<workspace>/evidence/drill-report.json`（+ `.sha256`），`report-roundtrip`
写 `drill-roundtrip-report.json`（源/目标各一份）。schema：
`tiangong-kaiwu-drill-report` v1；关键字段：

| 字段 | 含义 |
|---|---|
| `isolation` | 项目/端口/卷/网络/工作区检查；`mainProjectUntouched` 前后快照比较 |
| `phases[]` | 每 phase 的 status（passed/failed/partial/skipped）、起止 UTC、durationMs |
| `backup` | backupId、createdAtUtc、consistency.mode、manifest SHA-256、artifact 校验结果 |
| `restore` | targetWasEmpty、backupId、起止、durationMs、命令（脱敏） |
| `verification.stack` | HUB health/login、seed iModel 行、sentinel blob SHA-256 |
| `verification.integrity` | 扫描 exit code、result、summary、JSON/MD 路径与 SHA-256、局限说明 |
| `timings` | create/up/seed/backup/verify-backup/restore/verify/down 毫秒数 |
| `rpo` | `measuredSeconds` = 备份 createdAt → restore 开始；`trueRpoSeconds` 仅在提供最后 push 时间时才有值 |
| `rto` | `measuredSeconds` = restore 开始 → DB/blob 验证通过（`stackVerifiedAtUtc`） |
| `claims` | 逐项证据声明；`rpoTargetAchieved`/`rtoTargetAchieved`/`productionDisasterRecoveryProven` **恒为 false** |

**诚实边界**：
- `rpo.measuredSeconds` 是“这份备份在恢复开始时的年龄”，不是生产 RPO；不能证明 ≤5m。
- `rto.measuredSeconds` 是单次 drill 从开始恢复到 DB+对象可验证的耗时；不含业务验收、
  变更窗口、HA 切换、生产规模、Redis/队列恢复；不能证明 ≤1h。
- `integrity scan exit 3` = 部分未验证；exit 1 = 有 finding；都不能写成 clean。
- 报告包含 iModel/iTwin ID、blob 名和本机路径：只进私有证据库，不提交公开仓。

---

## 7. 2026-11-24 实际执行结果（隔离 drill）

执行环境：Windows；Docker server 29.8.1；Node v24.20.0；主栈 `tiangong-kaiwu` 全程运行。
演练器每个 phase 前后比较主项目容器/卷标签，结果 `mainProjectUntouched=true`；主栈未启动、
未停止、未备份、未恢复、未删除任何资源。

| 项目 | 结果 |
|---|---|
| 单元测试 | `node --test scripts/dr/drill-core.test.mjs` **35/35 pass**；`node --test scripts/integrity/integrity-scan.test.mjs` **24/24 pass**（合计 59） |
| 源 drill（`tiangong-kaiwu-drill`，offset 0） | create/up/seed/backup/verify-backup 全绿；备份 `backup-20261124-201520`、`consistency.mode=quiesced`；manifest sha256=`c9ee3ea4…6dea6e` + 两个 artifact 的 size/SHA-256 校验通过 |
| 空目标 restore（`tiangong-kaiwu-drill-restore2`，offset 2） | 目标 DB 用户表=0、Azurite 卷空；`restore-stack.ps1 -Confirm`（无 `-Force`）成功；恢复后 HUB health/login、seed iModel 行、sentinel blob SHA-256 全部通过 |
| 实测计时（仅本次） | backup manifest 校验通过；`restore-stack.ps1` 脚本本身约 12.3s（报告 `restore.durationMs`）；`rpo.measuredSeconds≈193.82`；`rto.measuredSeconds≈38.78`（restore 开始 → DB/blob 验证通过；含恢复后 drill 栈启动，**不是目标达标声明**） |
| 完整性扫描 | exit 1 / `FINDINGS`，3 error + 7 unverified：`invalid-checkpoint` 与 `baseline-blob-unmapped`。原因：Phase A 最小 seed 通过 HUB API 创建 iModel，但没有宿主 MS 生成 baseline/checkpoint 内容；**不是恢复路径造成的差异**。报告如实记录 `integrityScanClean=false`，verify 状态为 `partial` |
| 故障注入/teardown | **未执行**；未删除任何演练卷；`tiangong-kaiwu` 主项目未动 |
| 演练后状态 | 三个 drill 项目执行了 `down`（保留卷/证据，无 `-v`）：`tiangong-kaiwu-drill`、`tiangong-kaiwu-drill-restore`、`tiangong-kaiwu-drill-restore2`；容器已移除，drill 卷仍保留待人工批准清理。主栈 9 个容器仍运行 |

### 7.1 本次证明了什么

- 同一 drill backup set（DB dump + Azurite 卷）可恢复到**全新的空 drill 项目**；
- 恢复后 HUB 能启动、drill admin 能登录、备份前的 iModel 元数据行存在；
- 备份前的 Azurite sentinel blob 在恢复后字节与 SHA-256 完全一致；
- 备份 manifest 的 sidecar 与两个 artifact 大小/SHA-256 可独立复算；
- 隔离检查、主项目前后快照、报告 schema/拒绝主项目等安全逻辑有测试覆盖。

### 7.2 本次没有证明什么

- 不能证明生产 RPO/RTO 达标；193.82s / 38.78s 只是这次空库、小对象 drill 的测量。
- 不能证明 ledger 完整性 clean；最小 seed 没有 baseline/checkpoint 内容，扫描 3 error/7 unverified。
- 不能证明 Redis/队列、briefcase 缓存、宿主文件/镜像可恢复（不在备份范围）。
- 不能证明对象存储版本化/对象锁/跨区复制、KMS/ACL/审计。
- 不能证明故障检测（S3 未执行）、HA/PITR、生产规模、跨主机网络时延。
- 不能用 drill 版 verify 替代根 `verify-stack.ps1` 的全栈（web/nginx/BFF/宿主 MS）验收。

---

## 8. 已知限制与本切片附带修复

1. **根 `verify-stack.ps1` 不适合同宿主 drill**：它直探 5400/5401/5402/10500 并操作主
   compose 项目。Phase A 的同宿主 drill 使用运行器内置的 drill 验收（HUB REST + Azurite
   REST + integrity scan）。跨主机/独立 VM 演练仍可在演练 checkout 用标准端口跑根
   verify-stack。
2. **最小 seed 没有 MS baseline**：iModel 行存在但 state/baseline/checkpoint 内容不完整；
   integrity scan 的 `invalid-checkpoint`/`baseline-blob-unmapped` 是预期缺口。需要 clean
   ledger 时，必须做完整栈（含宿主 MS baseline 生成）的 S1 演练，而不是把 Phase A 结果
   写成 clean。
3. **`restore-stack.ps1` 对“空目标”的硬要求**：目标 Azurite 容器必须存在且停止；本运行器
   用 `docker compose create azurite` 创建空容器/空卷，不启动 Azurite，以免启动时的元数据
   文件让目标看起来“非空”。
4. **本切片修复了 integrity 工具的两个实测缺陷**（均有测试）：
   - Azurite path-style 端点的 SharedKey 规范化：必须像 Azure SDK 一样把 account 再前置一次
     （`/account/account/...`）；修复前所有 REST 请求 403。
   - 只读 SQL 包装器丢失 SELECT 终止分号，Postgres 把 `COMMIT` 当成 SELECT 的一部分并报
     `syntax error at or near "COMMIT"`。
   修复后已在隔离 drill Azurite/Postgres 实测通过；生产 Hub 仍未验证。
5. **Azurite 仅开发用途**：本演练不证明生产 S3/Azure Blob 的持久性/版本化/复制能力。
6. **备份脚本本身未改**：`backup-stack.ps1` / `restore-stack.ps1` 仍是有写者时 best-effort；
   drill 通过先停 drill 写者获得 quiesced 配对。

---

## 9. 清理（仅演练项目）

```powershell
# 1) 证据先复制到私有证据库（不要提交）
Get-ChildItem ".drill/<drillId>/evidence" | ForEach-Object {
  Copy-Item $_.FullName "<private-evidence-root>\"
}
Get-ChildItem ".drill/<drillId>/backups" -Recurse | Select-Object FullName

# 2) 只停止演练项目（保留卷）
node scripts/dr/drill-runner.mjs down --workspace ".drill/<drillId>"

# 3) 如批准销毁演练卷：必须逐字确认演练项目名
node scripts/dr/drill-runner.mjs teardown --workspace ".drill/<drillId>" `
  --project <drill-project> --confirm-project <drill-project>

# 4) 只读确认真实主项目仍在/未被触碰
docker compose -p tiangong-kaiwu ps
docker volume ls --filter name=tiangong-kaiwu_
```

- 绝不要对 `tiangong-kaiwu`（主项目）执行 `down -v`；运行器的 `teardown` 只接受
  `tiangong-kaiwu-drill*` 项目。
- 清理失败不掩盖演练结论；记录残留资源并在批准后单独处理。

---

## 10. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | Skeleton v1：隔离项目模型、S0–S4 场景、人工 runner 骨架、验收/清理/证据模板；未执行破坏性演练 |
| 2026-11-24 | Phase A harness v1：独立 drill compose + `.drill` 工作区 + 自动 seed/backup/verify-backup/空目标 restore/verify/report；35+24 单测；隔离 drill 实测非破坏性 roundtrip（无故障注入、无主栈触碰）；未宣称 RPO/RTO 达标；附带修复 integrity 工具的 Azurite SharedKey 与 SQL 终止符缺陷 |
