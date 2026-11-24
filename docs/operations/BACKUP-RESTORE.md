# 备份与恢复 Runbook（G1 E1/E2 基线）

> 状态：**Baseline v1**（2026-11-22）
> 适用：本仓根 `docker-compose.yml` 的单机开发/内网验证栈（PostgreSQL + Azurite）。
> 定位：G1 E1/E2 的**可备份、可恢复、可演练基线**，不是生产 HA/PITR 方案。
> 关联：`docs/architecture/G0-DECISION-REGISTER.md`（D0-14 灾备等级）、
> `docs/architecture/G1-EXECUTION-PLAN.md`（E1/E2、E3/E5、E8）、
> `docs/research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.4。

## 0. 一句话结论

当前栈的持久数据只有两处：**PostgreSQL 平台元数据**与 **Azurite 对象卷（changeset / baseline / tile 等 blob）**。
`scripts/backup-stack.ps1` 对两者做时点快照并写 `manifest.json`；`scripts/restore-stack.ps1`
先校验 SHA-256，再按 **PostgreSQL → Azurite** 的顺序恢复。两者必须成套恢复，单独恢复任一侧都会留下悬挂引用。

**明确限制：本基线本身不是 HA，也不是 PITR；它不能单独承诺 RPO≤5m/RTO≤1h。**
**明确限制：Azurite 仅用于开发/本地验证；生产必须使用 S3/Azure Blob 等带版本化/复制能力的持久对象存储。**

---

## 1. 范围与非目标

### 1.1 在范围

- PostgreSQL：HUB/平台元数据（iModel、changeset 行、用户/项目、权限等）。
- Azurite：`/data` 命名卷中的 blob 与 Azurite 自身元数据文件。
- 备份产物完整性：文件大小 + SHA-256 清单、源提交、一致性说明。
- 同一备份集的成套恢复与恢复后验收步骤。
- 恢复演练记录模板（RPO/RTO 实测）。

### 1.2 不在范围

- Redis/队列（WA forward queue 等）、宿主 briefcase 缓存、宿主 `dist-backend`/镜像/原生库。
- 生产对象存储（S3/Azure Blob）的版本化、跨区复制、对象锁；本脚本只认 Docker 命名卷。
- HA、自动故障切换、WAL 归档/PITR、自动调度与告警。
- 应用一致性（application-consistent）快照；在线备份最多是 crash-consistent/best-effort。
- 跨租户/跨项目选择性恢复；本基线恢复整库 + 整卷。

---

## 2. 前置条件

### 2.1 环境

- Windows + PowerShell 5.1 或更高（脚本按 PS 5.1 语法编写）。
- Docker Desktop 已启动，`docker compose` v2 可用。
- 仓库根存在 `.env`（`powershell -File scripts/generate-env.ps1` 生成/合并）。
- 栈已按根 compose 起过（至少 `postgres` 与 `azurite` 容器存在；备份时 `postgres` 必须运行）。
- `alpine:3.20` 可拉取/已预拉取（或通过 `-TarImage` 指定内部镜像）。脚本用一次性容器执行 `tar`，
  不会把工具装进运行中的服务容器。
- 备份盘可用空间至少覆盖 Azurite 卷大小 + DB dump 大小；建议预留 2× Azurite 卷空间。
- Docker 容器 `/tmp` 需容纳 pg_dump/pg_restore 的临时 dump（备份与恢复各一次）。
- 恢复前必须有人工停机窗口：至少停止 `azurite`，推荐同时停止 `webhook-agent`、`imodelhub` 和宿主 MS。

### 2.2 `.env` 约定（不打印值）

脚本只读取以下键，并回退到 compose 缺省值：

| 键 | 缺省 | 用途 |
|---|---|---|
| `HUB_DATABASE_USERNAME` | `root` | pg_dump/pg_restore/psql 角色 |
| `HUB_DATABASE_PASSWORD` | `secret`（compose 缺省） | 仅经 docker exec 的进程环境传递，不进命令行、不进 manifest |
| `HUB_DATABASE_NAME` | `api` | 目标库名 |
| `PORT` | `5401` | 用于检测宿主 modeling-server 是否仍在运行 |
| `COMPOSE_PROJECT_NAME` | `tiangong-kaiwu` | 可选；演练/多栈隔离时用于定位 compose 项目 |

**脚本不会把 `.env` 或密码写入任何产物。** 若 `.env` 未设置 `HUB_DATABASE_PASSWORD`，脚本会显式告警
“使用 compose 缺省值”，操作者需自行确认它与运行中的容器一致。

### 2.3 容器/卷假设

- compose 项目名：`tiangong-kaiwu`（或 `.env` 的 `COMPOSE_PROJECT_NAME`）。
- 容器通过 `docker compose ps` 发现，失败时按 compose 标签 `com.docker.compose.project/service` 回退。
- 预期名称（不是硬编码依赖）：`tiangong-kaiwu-postgres-1`、`tiangong-kaiwu-azurite-1`。
- Azurite 数据挂载：容器内 `/data` 且类型必须是 **Docker 命名卷**；预期卷名
  `tiangong-kaiwu_azurite-data`。脚本从 `docker inspect` 读取实际卷名；绑定挂载会直接报错。
- **Azurite 必须显式 `--location /data`**：官方镜像的 WORKDIR 是 `/opt/azurite`，不传
  `--location` 时数据写容器可写层，`/data` 命名卷始终为空——容器重建即丢全部 blob，
  备份也只是一个空 tar（2026-11-22 迁移演练实证）。根 compose 已固化该参数。
- **空卷哨兵**：备份 tar 必须含 `__azurite_db_blob__.json`，否则脚本默认失败；仅当
  全新栈从未写入对象时才用 `-AllowEmptyAzurite` 显式放行。恢复前先用
  `tar -tzf azurite-data.tar.gz` 确认 blob 元数据文件存在。
- 恢复假设目标 compose 栈已创建数据库/角色（`docker compose up -d postgres` 即可），
  本基线不负责 `CREATE ROLE` / `CREATE DATABASE`。

#### 2.3.1 旧容器层 → 命名卷一次性迁移

适用：2026-11-22 之前启动、未传 `--location` 的 `tiangong-kaiwu-azurite-1`（数据在
容器层 `/opt/azurite`）。**先迁移再让 compose 重建容器**，否则旧层随容器删除而丢失。

```powershell
# 1) 停写者（宿主 MS 也停）；确认旧容器仍在
docker compose stop webhook-agent imodelhub azurite
# 2) 启动旧容器（不要 compose up——新配置会重建并删除旧层）
docker start tiangong-kaiwu-azurite-1
# 3) 容器内复制（同一 VM，避免 docker cp 大卷的 EOF/500）；先确认 /data 为空
docker exec tiangong-kaiwu-azurite-1 sh -c 'ls -A /data; rm -rf /data/*; cp -a /opt/azurite/. /data/; sync'
# 4) 校验：两侧文件数与字节数一致，且 /data/__azurite_db_blob__.json 存在
docker exec tiangong-kaiwu-azurite-1 sh -c 'du -sb /opt/azurite /data; find /opt/azurite -type f | wc -l; find /data -type f | wc -l'
# 5) 停旧容器，按新 compose 启动（此时数据已在卷中）
docker stop tiangong-kaiwu-azurite-1
docker compose up -d azurite
# 6) 写者仍停时重跑备份，确认 tar 内含 __azurite_db_blob__.json
powershell -File scripts/backup-stack.ps1
```

禁止 `docker compose down -v`（删除命名卷）。迁移前可用
`__azurite_db_blob_extent__.json` 的 extents 数核对 `__blobstorage__` 文件数；
2026-11-22 实测旧容器为 593 extents / 约 38 GB。

**大对象卷的本地备份**：`backup-stack.ps1` 的 tar 经 Docker Desktop 绑定挂载写出，
实测约 2.5 MB/s（38 GB 卷需数小时），不适合大卷。开发机可用同 VM 内命名卷克隆：

```powershell
docker volume create tiangong-kaiwu_azurite-backup-<date>
docker run --rm -v tiangong-kaiwu_azurite-data:/src:ro `
  -v tiangong-kaiwu_azurite-backup-<date>:/dst alpine:3.20 `
  sh -c 'cp -a /src/. /dst/ && sync'
# 校验：两侧文件数一致 + 全量内容哈希一致
```

这只是同盘快照，不是异地备份；生产仍需对象存储版本化/跨区复制。

---

## 3. RPO / RTO 目标与诚实差距

### 3.1 目标（D0-14）

- **RPO ≤ 5 分钟**（PostgreSQL 元数据与对象存储）。
- **RTO ≤ 1 小时**（从恢复开始到验收通过）。
- 已 push 且收到 ack 的编辑目标 RPO=0；未 push 的本地编辑不在云端持久化承诺内（见 D0-13）。

### 3.2 本基线实际能做到什么

| 指标 | 本基线 | 说明 |
|---|---|---|
| RPO | **= 最近一次成功备份的时刻** | 这是手动/按需全量快照，不是 PITR。RPO 由调度间隔决定；本脚本不提供 WAL 归档，不能单独保证 ≤5m。 |
| RTO | **未保证，需演练实测** | 脚本把恢复步骤自动化，但大对象卷的解包/复制、服务启动和验收耗时需在演练中记录。 |
| 已 push 编辑 | 最多丢失“备份时刻之后、last push ack 之前”的数据 | 仅生产 HA/同步复制才能讨论 RPO=0；本基线不承诺。 |
| 未 push 本地编辑 | 不承诺 | briefcase 本地缓存不在备份内；见 D0-13 的 UI 未保存窗口。 |

**结论：本基线不满足 D0-14 的生产灾备等级。** 要满足 RPO≤5m/RTO≤1h，需要：
PostgreSQL HA + WAL 归档/PITR + 自动备份；对象存储版本化/跨区复制；Redis HA/持久队列；
外部调度、监控、加密/KMS、异机/异地副本。本脚本是这些能力的“可演练起点”，不是替代品。

---

## 4. 备份策略与保留

### 4.1 建议策略

- **每日一次全量** + **每次 schema 迁移/发布/高风险操作前**手动一次。
- 开发/验证环境至少保留一份“最近一次成功”的备份；跨版本升级前保留迁移前备份。
- 生产化前必须改为自动调度（Windows 任务计划/CI/cron），并接入成功/失败告警。
- 备份完成立刻复制到异机/离线介质；本地唯一副本不算灾备。
- 备份包含完整模型数据（客户 IP/PII 风险）：**不得提交到公开仓**，需访问控制与静态加密。
  本脚本默认写到仓库根 `backups/`，会在该目录创建 `.gitignore`（内容 `*`）避免误提交；
  也可以 `-BackupRoot D:\stack-backups` 放到仓外。

### 4.2 保留

- `-KeepDays 0`（缺省）不清理；建议显式使用 `-KeepDays 14` 或 `-KeepDays 30`。
- 清理只删除同时满足以下条件的目录：
  1. 目录名匹配 `backup-YYYYMMDD-HHMMSS`（可带 `-N` 后缀）；
  2. 目录内有 `manifest.json`；
  3. 目录名时间戳超过保留期；
  4. 不是重解析点（symlink/junction）。
- 永不删除 `.partial-*` 之外的其他目录；`.partial-*` 会在失败时由脚本自行清理。
- 清理发生在**本次备份成功落盘之后**；清理失败只告警，不影响本次备份有效性。
- 备份产物未加密。生产需使用 BitLocker/磁盘加密 + KMS/信封加密 + 访问审计。

### 4.3 备份产物

```text
backups/
  .gitignore                  # *
  backup-20261122-101500/
    postgres.dump             # pg_dump custom format
    azurite-data.tar.gz       # Azurite /data 卷快照
    manifest.json             # 源提交、容器/卷、大小、SHA-256、一致性、限制
    manifest.sha256           # manifest.json 自身的 SHA-256 + 文件名
```

`manifest.json` 关键字段：

- `schemaVersion`、`kind`（`tiangong-kaiwu-baseline-backup`）、`backupId`、`createdAtUtc/Local`；
- `source.commit/branch/describe/dirtyTracked`；
- `stack`（compose 项目、容器、镜像、卷、库名、角色——**不含密码**）；
- `postgres` / `azurite`（格式、版本、采集起止时间）；
- `artifacts[]`（`path`、`bytes`、`sha256`、起止时间）；
- `consistency`（`mode`、运行中的服务、写者、顺序窗口秒数、说明、跨存储说明）；
- `restoreOrder`、`retention`、`rpo`、`rto`、`limitations`。

---

## 5. 跨存储一致性（DB + 对象 manifest）

### 5.1 为什么必须成套

PostgreSQL 行引用 Azurite 中的 blob（changeset、baseline、tile）。
只恢复 DB → 行存在但 blob 404；只恢复对象卷 → blob 存在但 DB 链/索引不匹配。
**永远从同一个 `backupId`/`manifest.json` 成套恢复。** 本基线的恢复脚本也强制这一语义。

### 5.2 本脚本的采集顺序与一致性模式

采集顺序：**先 PostgreSQL dump，后 Azurite 卷 tar**。两者是顺序执行，**不是跨存储原子快照**。
manifest 的 `consistency.mode` 记录：

| mode | 含义 | 风险 |
|---|---|---|
| `quiesced` | 采集时未检测到 azurite/imodelhub/webhook-agent/宿主 MS 写者 | 仍非原子，但配对窗口最小 |
| `online-best-effort` | 采集时有写者或宿主 MS 在运行 | 两次快照之间的写入不会同时出现在两侧；恢复后可能出现悬挂/缺失引用 |
| `unknown` | 无法枚举 compose 服务 | 按 best-effort 对待 |

manifest 同时记录 `sequentialWindowSeconds`（从 DB dump 开始到 Azurite tar 结束的窗口）。
**需要一致性配对时，先停写者再跑备份：**

```powershell
docker compose stop webhook-agent imodelhub azurite
powershell -File scripts/stop-ms-host.ps1
powershell -File scripts/backup-stack.ps1 -BackupRoot D:\stack-backups -KeepDays 14
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
```

注意：停止 Azurite 会让下载/上传/baseline 暂时不可用；这是可接受的一致性换停机窗口。
若业务不能停，接受 `online-best-effort`，并在恢复后按 §8.3 做完整性检查。

### 5.3 完整性校验

- 备份：每个产物计算 SHA-256 和字节数，写入 manifest；manifest 自身写 `manifest.sha256`。
- 恢复：**必须存在** `manifest.sha256` 并先校验 manifest 自身，再逐个校验产物大小 + SHA-256；
  **任何不一致/缺失都在写入前失败**，不会“先恢复再说”。
- 跨存储：恢复后按 §8.3 打开样例文档、检查历史/几何/blob 访问；E8 的 scrubber/reconciler 落地后应加入自动对账。
- SHA-256 只证明“文件与 manifest 一致”，不是数字签名；需要防篡改时，把 `manifest.sha256`
  另存到受控系统/工单/只读介质，恢复时做带外比对。

---

## 6. 备份操作

### 6.1 先看计划（无写入）

```powershell
powershell -File scripts/backup-stack.ps1 -WhatIf
```

`-WhatIf` 只做只读预检（`.env`、Docker、容器、卷、运行中服务、保留策略），打印将执行的
`docker exec`/`docker cp`/`docker run tar` 命令路径与 manifest 计划；**不创建目录、不 dump、不 tar**。
密码在计划里以 `<role>`/`<db>` 占位，不打印。

### 6.2 正式备份

```powershell
# 默认写到 <repo>\backups\
powershell -File scripts/backup-stack.ps1

# 推荐：仓外目录 + 14 天保留
powershell -File scripts/backup-stack.ps1 -BackupRoot D:\stack-backups -KeepDays 14

# 离线/内网镜像
powershell -File scripts/backup-stack.ps1 -TarImage registry.internal/alpine:3.20
```

脚本行为：

1. 读取 `.env`，发现 compose 项目、postgres/azurite 容器、Azurite `/data` 命名卷。
2. 在 `BackupRoot` 下创建 `.partial-<guid>` 暂存目录（同盘 rename，避免半成品出现在最终目录）。
3. `pg_dump --format=custom --no-password` → 容器 `/tmp` → `docker cp` 到 `postgres.dump`。
4. `docker run --rm -v <volume>:/data:ro -v <stage>:/backup alpine:3.20 tar -czf ...` → `azurite-data.tar.gz`。
5. 计算 SHA-256/大小，写 `manifest.json` + `manifest.sha256`，rename 为 `backup-<timestamp>`。
6. 按 `-KeepDays` 清理过期备份（仅完整 manifest 目录）。
7. 失败：非零退出，删除 `.partial-*`，不留下没有 manifest 的“成功”目录。

**脚本不停止、不重启、不重建任何容器。** 若 tar 返回 1（文件在读取中变化），脚本会保留归档并
在 manifest/控制台显式告警；这通常意味着在线卷快照不一致，需要停写者重跑。

### 6.3 备份后必做

```powershell
$dir = 'D:\stack-backups\backup-20261122-101500'
Get-Content (Join-Path $dir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json |
  Select-Object backupId, createdAtUtc, source, consistency, artifacts

# 抽查哈希（恢复脚本会自动全量校验）
Get-FileHash (Join-Path $dir 'postgres.dump') -Algorithm SHA256
Get-FileHash (Join-Path $dir 'azurite-data.tar.gz') -Algorithm SHA256
Get-Content (Join-Path $dir 'manifest.sha256')
```

- 确认 `consistency.mode`；若为 `online-best-effort` 且需要强一致，停写者重跑。
- 把整个 `backup-*` 目录复制到异机/离线介质（robocopy/rsync/对象存储），并记录校验值。
- 不要把 `backups/` 或任何备份产物提交进仓库。

---

## 7. 恢复操作（HITL）

> **恢复是破坏性操作。** 没有 `-Confirm` 不会执行；目标已有数据/写者时还需要 `-Force`。
> 脚本不会自动停止/启动任何容器，也不会自动跑 `verify-stack.ps1`。

### 7.1 恢复前

1. 发通知/开变更窗口，确认无人编辑。
2. **先给当前状态做一份新备份**（即使当前已损坏，也保留取证副本；若无法备份则明确记录）。
3. 停止写者（HITL，人工执行）：

```powershell
# Azurite 是恢复对象卷的硬前提；不停止则 restore 脚本会直接拒绝
docker compose stop webhook-agent imodelhub azurite
# 可选：把只读入口也停掉，避免用户看到半恢复状态
docker compose stop web nginx bff
# 宿主 modeling-server（如正在运行）
powershell -File scripts/stop-ms-host.ps1
```

4. 确认 Azurite 已停止：

```powershell
docker compose ps azurite
docker inspect -f '{{.State.Running}}' (docker compose ps -q -a azurite)
```

5. 确认备份目录完整（manifest + 两个产物），记录 `backupId`、时间、源提交。

### 7.2 执行恢复

```powershell
# 目标为空/安全状态（无用户表、卷为空、写者已停）
powershell -File scripts/restore-stack.ps1 `
  -BackupDir D:\stack-backups\backup-20261122-101500 `
  -Confirm

# 目标已有数据或仍有写者：显式确认覆盖（先备份！）
powershell -File scripts/restore-stack.ps1 `
  -BackupDir D:\stack-backups\backup-20261122-101500 `
  -Confirm -Force
```

脚本按以下顺序执行：

1. **校验（写入前）**：`manifest.sha256`（必须存在）→ `manifest.json` schema/kind → 每个产物的
   大小 + SHA-256 → 必需产物 → `restoreOrder`。
2. **目标检查（写入前）**：`.env`、Docker、compose 项目、postgres 运行、azurite 存在且**已停止**、
   `/data` 命名卷、目标 DB 用户表数、目标卷是否非空、运行中的写者、宿主 MS 端口 5401。
3. **HITL 判定**：非空 DB / 非空卷 / 写者仍运行 / 宿主 MS 运行 → 无 `-Force` 时 `exit 3`，不写任何数据；
   Azurite 运行中是**硬阻断**，`-Force` 也不覆盖。
4. **归档格式校验**：`pg_restore --list`（容器内临时文件）与 `tar -tzf`，均在目标数据写入前完成。
5. **PostgreSQL 恢复**：`docker cp` dump 到容器 `/tmp` →
   `pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error`。
   失败时单事务预期回滚；脚本报告 DB 未恢复，不继续对象卷。
6. **Azurite 恢复**：再次确认容器已停止 → 清空目标卷 → `tar -xzf` 解包 → 复查卷（空卷仅告警；
   归档可读性已在第 4 步验证）。
7. **不自动启动**：打印后续启动与验收命令。

> `pg_restore --clean` 只删除 dump 中存在的对象；目标库若有 dump 之外的对象会保留。
> 需要“完全干净”的恢复时，应在空数据库/空栈上恢复（先让 compose 创建空库），不要依赖 `--clean` 清空历史残留。

### 7.3 恢复后启动与验收

```powershell
# 1) 先起对象存储并等 healthy
docker compose up -d azurite

# 2) 起其余服务（依赖健康检查）
docker compose up -d

# 3) 如宿主 MS 已停止
powershell -File scripts/start-ms-host.ps1 -Detach

# 4) 全栈验收
powershell -File scripts/verify-stack.ps1
```

然后完成 §8 的验收清单。**确认全部通过前，不要对外宣布恢复完成。**

---

## 8. 恢复后验收

### 8.1 自动验收

- `scripts/verify-stack.ps1`：health ×5、iTwin/iModel/baseline 数据链、WS cookie 握手、
  native 横幅、web 镜像陈旧检测全部通过。
- 如有 HUB/MS/WA 日志，检查恢复窗口内无 5xx、无 blob 404、无 baseline 失败。

### 8.2 业务验收（每次恢复必做）

- 打开 **3 个样例文档**，其中至少 1 个含 **≥100 changeset**（对标 S0-15 演练判据）。
- 核对几何体积/质量属性、特征树、参数、历史 changeset 链、Named Version/checkpoint（若存在）。
- 编辑 → push → 关闭 → 重开，确认新 changeset 可见且旧历史未被改写。
- 做一次 undo/redo 冒烟（至少确认 undo 不会跨用户/跨 briefcase 串线）。
- 检查 tile/baseline 下载正常（Azurite 对象可达）。

### 8.3 交叉一致性检查

- 若备份是 `online-best-effort`：重点检查最近 changeset 的 blob 是否 404、历史链是否连续、
  iModel 打开是否报缺失文件；发现悬挂引用时，从同一备份集重恢复两侧，不要只补一侧。
- 如已有 E8 scrubber/reconciler，运行并保存对账报告；当前只读 v1 见
  `docs/operations/INTEGRITY-SCAN.md`（不修复，exit 3 表示未验证，不得当作 clean），
  未覆盖部分人工抽查。
- Redis/队列未恢复：确认 WA recovery checker 能重新排队 baseline；检查是否有丢失的 forward 事件。

### 8.4 记录

记录以下内容到私有证据库（不要提交公开仓）：

- `backupId`、manifest SHA-256、备份时间、源提交、一致性模式；
- 恢复开始/结束时间、`-Force` 原因；
- **RTO**：恢复开始 → `verify-stack` 全绿 + 3 个样例文档验收通过；
- **RPO**：最后一次已 push 编辑到备份快照的时间差（演练中可直接比较最新 changeset）；
- 失败/告警、人工干预、后续修复项。

---

## 9. 恢复演练清单（建议每季度一次）

> 架构要求每季度至少一次完整 DR 演练；任何 schema/存储迁移前后加做一次。
> 演练必须在隔离环境进行，禁止对共享/生产栈执行破坏性步骤。

### 9.1 演练前

- [ ] 使用独立 Docker 主机/VM，或独立 checkout + 独立 `COMPOSE_PROJECT_NAME`（如 `tiangong-kaiwu-drill`）。
- [ ] 确认 `docker compose ps` 只显示演练项目；确认卷名带演练项目前缀。
- [ ] 准备样例数据：3 个文档，至少 1 个 ≥100 changeset；记录当前 head/体积。
- [ ] 记录演练开始时间、操作者、源提交、脚本版本。
- [ ] 确认有足够磁盘空间和异机备份位置。

### 9.2 演练步骤

- [ ] 停止演练栈写者，执行一次 `quiesced` 备份（或明确选择 `online-best-effort`）。
- [ ] 记录 manifest、产物 SHA-256、备份耗时、备份结束时间。
- [ ] 模拟故障：仅在演练环境删除/破坏目标 iModel、DB 或 Azurite 卷。
- [ ] 停止 azurite/webhook-agent/imodelhub/宿主 MS（按 §7.1）。
- [ ] `restore-stack.ps1 -BackupDir ... -Confirm`（目标非空时加 `-Force`）。
- [ ] 启动栈，等待 health；运行 `verify-stack.ps1`。
- [ ] 打开 3 个样例文档（含 100+ changeset），核对几何/树/历史。
- [ ] 编辑 → push → 重开冒烟。
- [ ] 记录 RTO（恢复开始 → 验收通过）与 RPO（最后一次 push 编辑 vs 备份时间）。
- [ ] 如出现悬挂 blob/历史缺口，记录并从同一备份集重试，确认可重复性。

### 9.3 演练后

- [ ] 保存 manifest、命令输出、verify-stack 结果、计时记录到私有证据库。
- [ ] 对照 D0-14 目标评估差距：RPO≤5m、RTO≤1h 是否达成；未达成时登记原因与改进项。
- [ ] 更新本 runbook / 脚本 / 告警/调度配置。
- [ ] 清理演练环境（仅演练项目）：`docker compose -p tiangong-kaiwu-drill down -v`。
  **绝不要对主项目执行 `down -v`。**
- [ ] 安排下一次演练日期。

---

## 10. 生产化差距（必须显式承认）

1. **非 HA**：单 PostgreSQL、单 Azurite 卷、单宿主；无副本/故障切换。
2. **非 PITR**：无 WAL 归档/连续归档；RPO = 备份间隔，不是 5 分钟。
3. **对象存储**：Azurite 是开发模拟器（well-known 密钥、无版本化/对象锁/跨区复制）。
   生产必须使用 S3/Azure Blob 等；本脚本的卷 tar 方法不适用于生产对象存储。
4. **Redis/队列**：未备份；WA forward queue、cron、锁/限流状态可能在恢复后丢失或需重建。
5. **briefcase/本地缓存**：未备份；恢复后应重启宿主 MS 并清理陈旧缓存，避免旧本地状态覆盖服务端。
6. **应用一致性**：没有全局写屏障；在线备份最多 crash-consistent，可能包含跨存储时序偏差。
7. **加密/合规**：本地备份未加密、未做保留期/删除合规；生产需 KMS、静态加密、审计与 legal hold。
8. **自动化**：本基线无调度、无告警、无异地复制、无备份完整性周期巡检（E8 未落地）。
9. **恢复粒度**：整库 + 整卷；不支持单 iModel/单文档恢复，不支持恢复到不同 DB 名的自动化。
10. **验证覆盖**：当前验收是 `verify-stack` + 3 个样例文档；生产需要更广的模型语料与故障注入。
11. **恢复资源**：`pg_restore --single-transaction` 为原子回滚而启用；超大 DB 需要更多容器磁盘/WAL。
    失败时不要直接去掉该旗标而不评估“部分恢复”的风险。

---

## 11. 故障排查

| 症状 | 处理 |
|---|---|
| `找不到仓库根 .env` | 运行 `powershell -File scripts/generate-env.ps1`；确认在仓库根执行脚本。 |
| `Docker 守护进程不可达` | 启动 Docker Desktop；确认 `docker version` 可用。 |
| `找不到 compose 服务 postgres 的容器` | `docker compose up -d postgres`；检查 compose 项目名/`COMPOSE_PROJECT_NAME`。 |
| `找不到 compose 服务 azurite 的容器` | `docker compose up -d azurite`；备份需要容器存在；恢复前再停止。 |
| `Azurite /data 是 bind 挂载` | 本基线只支持命名卷；改回根 compose 的 `azurite-data` 卷，或另写迁移方案。 |
| `alpine:3.20` 拉取失败 | 预拉取或 `-TarImage` 指向内网镜像；脚本在写入前会失败，不会碰数据。 |
| `manifest.json SHA-256 不匹配` / 产物哈希不匹配 | 备份损坏或被篡改；换用另一份备份，禁止强行恢复。 |
| `备份目录缺少 manifest.sha256` | 不是 `backup-stack.ps1` 生成的完整备份；换用完整备份，不能跳过校验。 |
| 恢复被拒（`RESTORE REFUSED`） | 目标有数据/写者；先做新备份、停写者，再显式 `-Force`。 |
| 恢复被拒（Azurite 运行中） | 硬阻断：`docker compose stop azurite webhook-agent imodelhub`；`-Force` 不覆盖。 |
| `pg_restore` 失败（活动连接/权限） | 停 imodelhub/webhook-agent/宿主 MS；检查 `pg_stat_activity`；失败在单事务内应回滚，确认后重试。 |
| Azurite 恢复 CRITICAL（卷已清空但解包失败） | **不要启动服务**；修复磁盘/权限/归档后，从同一备份重新解包到该卷；在成功前该卷数据不可用。 |
| 恢复后 `verify-stack` baseline 未 initialized | 等 WA recovery checker 重试；查 `docker compose logs webhook-agent` 与宿主 MS 日志；必要时重跑验收。 |
| 打开文档报缺失 blob / 历史缺口 | 典型跨存储不一致；从同一 `backupId` 重恢复 DB+对象，禁止只补一侧。 |
| 备份根下残留 `.partial-*` 目录 | 上次备份被硬中断（进程被杀/断电），不是有效备份；确认没有备份进程在跑后手动删除。 |

---

## 12. 证据与变更记录

- 备份/恢复/演练的 manifest、日志、计时、验收输出都存私有证据库（公开仓只放脱敏结论）。
- 每次演练后更新本文件：日期、环境、RPO/RTO 实测、问题、脚本版本、改进项。
- 任何对备份脚本/恢复顺序/存储拓扑的改动，都应同步更新本 runbook，并在 G1 证据中登记。
- 相关接口/状态变更遵循 `docs/DEVELOPMENT-RULES.md` 与 G1 的 DoD；本基线不新增 Part Studio 功能。

---

**关联文档**

- `docs/architecture/G0-DECISION-REGISTER.md`（D0-14：HA+PITR+对象版本化；RPO≤5m/RTO≤1h；Azurite 仅开发）
- `docs/architecture/G1-EXECUTION-PLAN.md`（E1/E2 DR 基线、E3/E5 迁移、E8 完整性）
- `docs/research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.4
- `docs/operations/BACKUP-RESTORE.md`（本文件）
- `docs/operations/INTEGRITY-SCAN.md`（E8 只读完整性扫描 v1）
- `docs/operations/DR-DRILL.md`（非破坏性演练规范 skeleton）
- `scripts/backup-stack.ps1`、`scripts/restore-stack.ps1`
- `scripts/integrity/Invoke-IntegrityScan.mjs`、`scripts/integrity/scan-core.mjs`
