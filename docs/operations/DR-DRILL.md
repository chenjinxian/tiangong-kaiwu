# 灾备演练 Runbook（非破坏性 Skeleton v1）

> 状态：**Skeleton v1 — 规范/步骤骨架，未执行任何破坏性演练**（2026-11-24）
> 定位：在**隔离环境**验证“同一 backupId 的 DB + 对象存储可成套恢复”，并记录 RPO/RTO；
> 不是生产 HA/PITR 方案，也不是自动化执行器。
> 关联：`docs/operations/BACKUP-RESTORE.md`、`docs/operations/INTEGRITY-SCAN.md`、
> `docs/architecture/G1-EXECUTION-PLAN.md` E1/E2/E8、`docs/architecture/G0-DECISION-REGISTER.md` D0-14。

## 0. 一句话原则

**只动演练项目；绝不碰共享/生产栈。** 默认场景（S0/S1/S2）对源栈只读；可选的破坏性场景（S3）
只允许在**一次性、可删除的演练项目**内执行，并且必须在 HITL 批准后、由演练负责人现场执行。
本切片只交付本 runbook 与只读扫描工具，**没有执行任何恢复、删除或故障注入**。

---

## 1. 隔离模型（必须先满足）

### 1.1 推荐形态

优先级从高到低：

1. **独立 VM / 独立 Docker 主机**（最强隔离；推荐）；
2. **独立 checkout + 独立 Docker context**，演练项目名 `tiangong-kaiwu-drill`；
3. 同一 Docker 主机上的独立 project + 独立 `.env` + 独立卷 + 宿主端口重映射（最弱，仅限无独立主机时）。

**不要**在主 checkout 上直接使用主 `.env` 执行 `restore-stack.ps1`。恢复脚本按 checkout 根部
`.env` 的 `COMPOSE_PROJECT_NAME` 和 `docker-compose.yml` 定位目标；主 `.env` 会把恢复打到主栈。

### 1.2 演练前硬检查（全部通过才继续）

```powershell
# 在演练 checkout 中执行；确认 .env 至少含：
#   COMPOSE_PROJECT_NAME=tiangong-kaiwu-drill
Get-Content .env | Select-String '^COMPOSE_PROJECT_NAME='

# 只允许看到演练项目；不应出现主项目或生产项目
docker compose -p tiangong-kaiwu-drill ps -a

# 演练卷必须带 drill 前缀；确认没有主项目卷被误用
docker volume ls --filter name=tiangong-kaiwu-drill

# 确认主项目没有被本会话操作（只读检查，不停止任何东西）
docker compose -p tiangong-kaiwu ps
```

- [ ] 已确认演练项目的容器、网络、卷都带 `tiangong-kaiwu-drill` 前缀。
- [ ] 已确认主项目容器/卷不在本次命令的目标内。
- [ ] 同一主机时，已通过**仓外** override 重映射宿主端口（5300/5301/5400/5401/5402/10500-10502
      等），避免与主栈冲突；本切片不修改根 compose。
- [ ] 演练机磁盘可容纳备份解包 + 索引/临时文件（建议 ≥ 2× 对象卷大小）。
- [ ] 已记录演练负责人、见证人、变更窗口、源提交、脚本版本。

### 1.3 密钥与数据

- 备份、DB dump、Azurite 卷、完整性报告都可能含客户模型数据：只放私有存储，演练结束按保留策略销毁。
- 演练 `.env` 使用独立密钥/密码；不要把主栈密钥复制到演练证据。
- 不把 `backups/`、对象卷导出、报告、token、密码提交到公开仓。

---

## 2. 角色与 HITL

| 角色 | 职责 |
|---|---|
| 演练负责人 | 执行命令、确认隔离、记录时间；对“是否进入破坏性场景”负责 |
| 见证人 | 复核目标项目/卷/备份 ID；核对没有主栈资源被选中 |
| 数据/平台 owner | 批准恢复、批准 S3 故障注入、判定业务验收通过 |
| 安全/运维（按需） | 密钥注入、证据脱敏、清理确认 |

**HITL 规则**：

1. `restore-stack.ps1` 必须显式 `-Confirm`；目标非空/有写者时再加 `-Force`。
2. S3 的任何删除/故障注入必须单独书面批准，并再次人工确认项目名；不得全自动执行。
3. 发现主栈资源被选中：**立即中止**，不做任何“清理性”删除。
4. 演练中任何不确定时，先停止；不要用 `--force`/`--no-verify` 类参数绕过。

---

## 3. 场景

### S0 — 只读预检（无恢复、无删除）

目的：确认备份成套、扫描基线、记录当前 head/体积。

- [ ] 校验备份目录结构：`manifest.json`、`manifest.sha256`、`postgres.dump`、
      `azurite-data.tar.gz`，且来自同一 `backupId`。
- [ ] 用 `Get-FileHash` 核对 manifest 与两个产物的 SHA-256/大小。
- [ ] 在演练环境运行 `Invoke-IntegrityScan.mjs`（只读）：
  - 若已有 DB snapshot/对象清单，直接离线扫描；
  - 若在隔离栈上，用 `--db-mode docker` + `--blob-mode azure` 扫描。
- [ ] 保存 baseline 报告与 `summary`；记录 `chains[]` 的 head/root、blob 数、error/unverified。
- [ ] 记录 RPO 起点：最后一次已知已 push 编辑的时间/changeset（若有）。

**S0 不触碰源栈。** 若 S0 已经 exit 1/3，先解释/修复扫描配置；不要在未知状态下进入恢复。

### S1 — 空演练栈恢复（源栈只读）

目的：证明同一备份集能恢复到干净环境，且恢复后通过扫描与业务验收。

- [ ] 在演练 checkout 中起**空**目标栈（独立 project）：
      `docker compose -p tiangong-kaiwu-drill up -d postgres azurite`。
- [ ] 确认 `postgres` 容器运行；`azurite` 容器存在且**已停止**（恢复脚本硬要求）。
- [ ] 把备份目录**复制**到演练机；不要在主栈目录上恢复。
- [ ] 在演练 checkout 执行：
      `powershell -File scripts/restore-stack.ps1 -BackupDir <drill-backup-dir> -Confirm`
      （空目标通常不需要 `-Force`；如脚本要求，先按提示核对目标非空原因）。
- [ ] 恢复后按 `BACKUP-RESTORE.md` §7.3 启动演练栈并跑 `verify-stack.ps1`（指向演练栈）。
- [ ] 对恢复后的演练栈跑完整性扫描，保存报告；比较 S0 baseline。
- [ ] 打开 ≥3 个样例文档（至少 1 个 ≥100 changeset）核对几何/特征树/历史/Named Version。
- [ ] 在演练栈做一次编辑 → push → 关闭 → 重开冒烟（只写演练栈）。
- [ ] 记录 **RTO**：恢复开始 → `verify-stack` 全绿 + 业务验收通过。
- [ ] 记录 **RPO**：最后一次已 push 编辑到备份时刻的差值。

**S1 对源栈只读。** 目标栈是 disposable；即使 S1 失败，也只能清理演练 project。

### S2 — 恢复后完整性/一致性复检

目的：把“可打开”提升为“账本与对象存储成套”。

- [ ] `Invoke-IntegrityScan` 在恢复后目标上 exit 0；或明确列出 exit 3 的未验证项。
- [ ] 对比 S0 baseline 与 S1 后的 `chains[]`：head index/id、chain root、committed 数一致
      （除非备份是 online-best-effort，且差异能解释）。
- [ ] 抽查最近 changeset 的 blob 下载/打开；抽查 checkpoint/Named Version（若该备份有）。
- [ ] 若发现悬挂 blob/历史缺口：不要只补一侧；从同一 `backupId` 重新成套恢复。
- [ ] 检查 Redis/队列未恢复的影响（WA recovery checker 是否重新排队 baseline），记录为已知缺口。

### S3 — 可选的“故障注入/破坏性”场景（仅演练项目，默认不执行）

> **本切片没有执行 S3。** 只有书面批准后才在一次性演练项目内进行；绝不对主栈/共享栈执行。
> 若组织政策不允许任何破坏性步骤，跳过 S3 并在证据中明确记录“故障检测路径未演练”，
> 不得用 S0–S2 的结果替代该结论。

目的：证明扫描能发现漂移，且重复恢复可恢复。

- [ ] 先完成 S0/S1/S2 并保存证据。
- [ ] 在演练对象存储中删除**一个** changeset blob（或把字节改小），记录操作与对象名。
- [ ] 运行扫描：预期 `missing-changeset-blob` 或 `blob-size-mismatch`/`blob-sha256-mismatch`，exit 1。
- [ ] 在演练 DB 中制造一条悬挂/缺口（仅在批准后）：例如软删/断链的单条测试行；
      预期 `dangling-parent`/`missing-changeset`。
- [ ] 不清扫现场；直接从同一备份集重新恢复演练栈。
- [ ] 重跑扫描：预期恢复 exit 0（或在已知未验证项下 exit 3）；记录可重复性。
- [ ] 记录“检测 → 恢复 → 再检测”的耗时，作为 RTO 的故障分支证据。

执行 S3 前必须确认：

- [ ] `docker compose -p tiangong-kaiwu-drill ps` 只显示演练项目；
- [ ] 目标卷名带 `tiangong-kaiwu-drill`；
- [ ] 备份已复制到演练机且 SHA-256 已核对；
- [ ] 已获得数据/平台 owner 的书面批准；
- [ ] 见证人现场确认“不是主项目”。

### S4 — 调度/重复演练（建议季度）

- [ ] 至少每季度跑一次 S0→S1→S2；任何 schema/存储迁移前后加做一次。
- [ ] 记录趋势：备份耗时、恢复耗时、扫描 error/unverified 数、RPO/RTO 是否接近 D0-14 目标。
- [ ] 未达到 RPO≤5m/RTO≤1h 时，登记差距与改进项；不得用本 runbook 宣称已达标。

---

## 4. Runner skeleton（人工步骤，不自动执行）

以下只是命令/检查骨架；占位符必须替换为**演练项目**资源。任何一步失败都停止并取证。

```text
[0] Preflight (read-only)
    - verify drill checkout/.env project name = tiangong-kaiwu-drill
    - docker compose -p tiangong-kaiwu-drill ps -a
    - docker volume ls --filter name=tiangong-kaiwu-drill
    - record git rev-parse HEAD, script hashes, operator/witness, window

[1] Backup set verification (read-only)
    - confirm one backupId; manifest.sha256; artifact size/SHA-256
    - copy backup to drill host/VM; verify again on destination

[2] Isolated target preparation
    - docker compose -p tiangong-kaiwu-drill up -d postgres azurite
    - confirm postgres running; stop azurite before restore
    - confirm no main-project container/volume is in scope

[3] Restore (HITL; drill only)
    - powershell -File scripts/restore-stack.ps1 -BackupDir <drill-backup> -Confirm
    - if target non-empty/writers: stop writers, take a new backup, then -Force only after approval

[4] Start + verify (drill only)
    - docker compose -p tiangong-kaiwu-drill up -d
    - powershell -File scripts/verify-stack.ps1 (drill endpoints)
    - record timestamps

[5] Integrity + business acceptance
    - node scripts/integrity/Invoke-IntegrityScan.mjs ... (drill DB + blob endpoint)
    - 3 sample docs incl. >=100 changeset; history/geometry/version checks
    - edit -> push -> reopen smoke in drill only

[6] Optional S3 fault injection (only with written approval)
    - alter/delete one drill-only object/row
    - scan must exit 1 with expected code
    - re-restore from the same backup; scan again

[7] Evidence + cleanup
    - store manifests/reports/timings in private evidence store
    - docker compose -p tiangong-kaiwu-drill down -v
    - confirm main project still untouched
```

**禁止**在 Runner 中加入：对主项目/共享项目的 `down -v`、跨项目卷复用、自动 `-Force`、
“失败就删数据重来”而不取证、把密钥写入日志。

---

## 5. 验收与记录模板

### 5.1 必填字段

| 字段 | 示例/说明 |
|---|---|
| drillId | `drill-20261124-01` |
| dateUtc / operator / witness | 时间与人员 |
| sourceCommit | 演练 checkout 的 `git rev-parse HEAD` |
| backupId / manifestSha256 | 来自 `manifest.json` / `manifest.sha256` |
| artifacts | `postgres.dump`、`azurite-data.tar.gz` 的大小 + SHA-256 |
| consistency.mode | `quiesced` / `online-best-effort` / `unknown`（不得省略） |
| restore command | 不含密码的完整命令；是否 `-Force` 及原因 |
| RTO | 恢复开始 → verify-stack 全绿 + 业务验收通过 |
| RPO | 最后一次已 push 编辑 → 备份快照 |
| integrity pre/post | exit code、result、error/unverified 摘要、报告 SHA-256 |
| sample docs | 文档 id/名称、changeset 数、几何/树/版本核对结果 |
| anomalies | 缺失 blob/历史缺口/未验证项/人工干预 |
| conclusion | 仅写证据支持的结论；未达标时写差距 |

### 5.2 结论边界

- 只有 S1/S2 完整通过（且 S3 若执行）才能说“本备份集在演练环境可恢复”。
- 不能从一次演练推导生产 HA/PITR 达标；不能推导未备份数据（Redis/briefcase/cache）可恢复。
- 完整性扫描 exit 3 时，结论必须写“部分未验证”，不能写 clean。

---

## 6. 清理（仅演练项目）

```powershell
# 三重确认后再执行；只允许 drill project。
docker compose -p tiangong-kaiwu-drill ps -a
docker volume ls --filter name=tiangong-kaiwu-drill
docker compose -p tiangong-kaiwu-drill down -v

# 确认真实主项目仍在/未被触碰（只读检查）
docker compose -p tiangong-kaiwu ps
```

- 证据先从演练机复制到私有证据库，再销毁演练环境。
- **绝不要**对 `tiangong-kaiwu`（主项目）执行 `down -v`。
- 清理失败不掩盖演练结论；记录残留资源并在批准后单独处理。

---

## 7. 本切片明确未做

- 未执行任何备份、恢复、删除、故障注入或 `down -v`。
- 未修改 `backup-stack.ps1` / `restore-stack.ps1` / `docker-compose.yml`。
- 未对 live DB/栈做读写；未产生 RPO/RTO 实测值。
- 未验证生产对象存储的版本化/对象锁/跨区复制。
- 本文件是演练规范与步骤骨架，不是自动化执行许可；每次演练仍需 HITL 与变更审批。

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-24 | Skeleton v1：隔离项目模型、S0–S4 场景、人工 runner 骨架、验收/清理/证据模板；未执行破坏性演练 |
