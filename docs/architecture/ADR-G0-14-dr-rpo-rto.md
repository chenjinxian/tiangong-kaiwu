# ADR-G0-14：灾备等级、RPO/RTO 与恢复顺序

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-14）、`G1-EXECUTION-PLAN.md`（E1/E2/E3/E8、J8/J9）、`../operations/BACKUP-RESTORE.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.4、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-E/WS-J
> 影响面：PostgreSQL、对象存储、Redis/队列、modeling-server（MS）宿主进程、webhook-agent（WA）、备份/恢复 runbook、生产 DR 承诺

> 本 ADR 只冻结灾备等级与恢复约束，**不表示任何灾备能力已达标**。未执行的演练、未测量的 RPO/RTO 不得写成通过；公开仓不记录私有证据、密钥或客户数据。

---

## 1. 背景与约束

当前栈的持久数据只有两类：**PostgreSQL 平台元数据**与**对象存储 blob（changeset / baseline / checkpoint / tile）**；二者必须成套恢复，单独恢复任一侧会产生悬挂引用（`../operations/BACKUP-RESTORE.md` §0、§5）。

当前实际拓扑与能力（截至 2026-11-24）：

1. **备份是手工全量快照**：`scripts/backup-stack.ps1` 先 `pg_dump --format=custom`，再对 Azurite 命名卷做 `tar`；产物带文件大小与 SHA-256 manifest，恢复顺序为 PostgreSQL → Azurite。它是可演练基线，不是 PITR（`../operations/BACKUP-RESTORE.md` §3.2、§10）。
2. **无 HA/副本/WAL 归档**：单个 PostgreSQL、单个 Azurite 命名卷、单宿主 MS；没有流复制、自动故障切换、连续 WAL 归档或 PITR。RPO 只能等于“最近一次成功备份的时刻”。
3. **无对象版本化/对象锁/跨区复制**：Azurite 是开发模拟器，使用 well-known 账户/密钥；没有对象版本化、不可变保留、跨区复制（CRR）、生命周期或校验和策略。
4. **Redis/队列单节点**：`docker-compose.yml` 只有单个 Redis（`appendonly yes`、`maxmemory 256mb`、`noeviction`），没有 Sentinel/Cluster 或托管 HA；队列与缓存未分离。
5. **WA 队列数据在容器工作目录**：WA forward queue 的待转发事件未落到持久卷/外置队列；容器重建会丢失 pending forwards（`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.4、§6.3；`08-ARCHITECTURE-EXTENSIBILITY.md` 现状条目）。
6. **MS 是手工宿主进程**：由 `scripts/start-ms-host.ps1` 以 PID 文件启动，`scripts/stop-ms-host.ps1` 使用 `Stop-Process -Force`；没有服务守护、开机自启或优雅停机。恢复 RTO 依赖人工重新拉起。
7. **无 RPO/RTO 证据**：S0-15（DR 演练）没有通过证据；G1-WAVE2 明确记录 E1/E2/E8 全部未完成、没有 RPO≤5m/RTO≤1h 证据，禁止宣称灾备达标。
8. **单卷即唯一副本**：卷损坏或宿主磁盘丢失意味着历史可能永久丢失；本地备份 tar 不是异地副本，也不能替代生产灾备。

**约束**：

- 本 ADR 采用的生产最低等级为 **HA + PITR + 对象版本化**；跨区/WORM 是对象存储与审计的组成部分，但“全量 active-active 双活”不在本 ADR 承诺内。
- 已 push 且收到 ack 的编辑目标 RPO=0；未 push 的本地 briefcase 编辑不在云端持久化承诺内（D0-13）。RPO=0 需要同步复制/仲裁证据，未证明前不得宣称。
- 恢复是破坏性操作，必须 HITL；恢复脚本不得自动启动服务或跳过校验（`../operations/BACKUP-RESTORE.md` §7）。
- 所有演练在隔离环境执行；公开仓只记录脱敏结论与命令，不记录客户模型、密钥或私有路径。

---

## 2. 决策

### D-A 生产最低灾备等级

生产环境必须同时满足以下各项；缺任一项只能按开发/内网验证环境对待，不得对外承诺“数据可靠/可恢复”：

| 层 | 生产最低要求 | 明确禁止 |
|---|---|---|
| PostgreSQL | HA（主备 + 自动/可编排故障切换）+ WAL 归档 + PITR + 自动基础备份 + 恢复验证 | 单实例；只有 `pg_dump` 无 WAL；备份无调度/告警 |
| 对象存储 | 生产级 S3/Azure Blob 等持久服务；版本化 + 静态加密 + 校验和 + 跨区复制；按需对象锁/不可变保留 | Azurite；单命名卷；无版本化/无 CRR；well-known 密钥 |
| Redis/队列 | HA（托管或 Sentinel/Cluster）；队列与缓存分离；持久化 + 容量告警；WA 队列落持久卷/外置队列；作业幂等/outbox | 单节点；队列在容器 cwd；`noeviction` 无容量告警；重建丢 pending forwards |
| 会话/作业面 | MS 以服务/守护方式运行，支持优雅停机、崩溃重启、版本化目录与日志轮转 | 手工 `Start-Process` + `Stop-Process -Force` 作为生产运行方式 |
| 备份编排 | 自动调度、失败告警、加密、异机/异地副本、保留策略、周期完整性巡检 | 只靠人工全量 tar；本地唯一副本；无告警 |
| DR 演练 | 至少每季度一次完整演练；schema/存储迁移前后加做；隔离环境；记录 RPO/RTO | 无演练；用“未验证”通过 Gate；用 mock 替代真栈 |

### D-B RPO/RTO 目标与计量口径

1. **RPO ≤ 5 分钟**：覆盖 PostgreSQL 元数据与对象存储 blob 的组合恢复点。有效 RPO 取两侧最大值；不得只报数据库或只报对象存储的较小值。
2. **RTO ≤ 1 小时**：从“宣布进入恢复”到 `verify-stack` 全绿且业务验收通过。大对象解包/复制、服务启动、迁移脚本与人工确认都计入 RTO。
3. **已 push 且收到 ack 的编辑**：目标 RPO=0。该目标只有在同步复制/仲裁或等价持久化证据成立后才可宣称；当前基线不承诺。
4. **未 push 本地编辑**：不承诺；UI 必须明示未保存窗口（D0-13），恢复后本地 briefcase 缓存按可丢弃处理。
5. **计时来源**：恢复开始/结束时间、备份时间、最后一条已 push changeset、对象版本时间戳、`verify-stack` 与业务验收结果；证据存私有证据库，公开只放脱敏结论。
6. **演练样本**：至少 3 个样例文档，其中至少 1 个含 ≥100 changeset；覆盖几何/特征树/history/Named Version/checkpoint 与一次编辑→push→重开冒烟。

### D-C 恢复顺序（本 ADR 约束）

恢复必须按以下顺序执行；任何一步失败都停在原地，不得“先启动服务再说”。基于本仓 `backup-stack.ps1` 的恢复仍沿用 runbook 的 PostgreSQL → Azurite 顺序；PITR 恢复以时间点/版本 manifest 对齐。两种方式都必须 DB + 对象成套，不得只恢复一侧。

1. **冻结与取证**：宣布事故/恢复窗口，停止所有写者（Hub/WA/宿主 MS/用户写请求）；对当前状态先做一份新备份或明确记录无法备份的原因；保留故障现场。
2. **准备目标基础设施**：在隔离/目标环境准备 PostgreSQL 与对象存储；对象存储先启用版本化/加密/访问控制；确认网络、密钥与容量。
3. **恢复 PostgreSQL**：按选定的 PITR 目标时间/LSN 或同一 `backupId` 的 dump 恢复；记录实际恢复目标；校验 schema/迁移版本；数据库未通过校验前不继续。
4. **对齐对象存储**：按同一恢复目标时间/版本 manifest 选择对象版本；不得使用“最新对象”猜测；对 changeset/baseline/checkpoint/tile 计算并核对大小 + SHA-256。
5. **跨存储对账**：运行 scrubber/reconciler（E8）或人工对账，检查 DB 行 ↔ 对象引用、链哈希/父链、checkpoint manifest；悬挂引用隔离并告警，未对账通过不得开放服务。
6. **恢复队列与作业**：恢复/重建 Redis/队列；WA forward queue 从持久卷/外置队列恢复；checkpoint/baseline 作业按幂等语义重放或重新排队；本地 briefcase 缓存不恢复，按可丢弃缓存重建。
7. **按依赖启动服务**：确认已恢复的对象存储/PostgreSQL 健康后，按 Hub → WA/worker → MS → BFF/web/nginx 顺序启动；每级通过健康/就绪检查后再进入下一级；MS 必须优雅启动，不沿用旧 PID 文件/旧缓存。
8. **技术验收**：`verify-stack` 全绿（health、iTwin/iModel/baseline 链、WS 握手、native 横幅、web 镜像陈旧检测）；检查恢复窗口内无 5xx、无 blob 404、无 baseline 失败。
9. **业务验收**：打开 3 个样例文档（含 ≥100 changeset），核对几何/特征树/参数/history/Named Version/checkpoint；编辑→push→关闭→重开；undo/redo 冒烟；tile/baseline 下载正常。
10. **HITL 宣布完成**：由 Data/SRE owner 明确记录 RTO、RPO、异常与后续项；未完成前不得对外宣布恢复完成。

### D-D 决策状态与证据门

- D0-14 维持 **Proposed / conditional**，直至：E1/E2 实现并有真实环境证据；至少一次完整 DR 演练达到 RPO≤5m/RTO≤1h；恢复记录与 owner 签字齐备。
- 生产 Gate（G3）以本 ADR 的目标与演练证据为准；G1 Gate 的“备份/PITR + 对象版本化 + 成套恢复演练”未勾选前，不得进入生产承诺。
- 任何“暂时用单卷/Azurite/手工备份上线”的请求必须登记例外，写明 owner、失效日期、退出计划，并禁止对外承诺可恢复性。

---

## 3. 备选方案

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 单卷 + 手工全量备份 | 维持当前 `pg_dump` + Azurite tar；RPO=备份间隔；无 PITR/HA | **仅开发/内网验证**；不可作为生产方案；卷损坏即永久丢失 |
| B. HA + PITR + 对象版本化 | PostgreSQL HA/WAL/PITR；生产对象存储版本化/加密/CRR；Redis/队列 HA；季度演练 | **采用**（生产最低） |
| C. 跨区双活 + 全量 WORM | 多区域主动-主动、全量不可变账本、跨区零切换 | 成本/一致性复杂度高；本 ADR 只吸收对象 CRR、对象锁与审计 WORM 的必要部分；双活另立 ADR |
| D. 托管 DR 服务 | 使用云厂商托管 Postgres/对象存储/队列与备份 | **允许**，但必须满足 B 的全部不变量与证据要求；提供商选择不改变决策 |

---

## 4. 后果

**正向**

- 历史不再依赖单卷单副本；恢复点与恢复时间成为可测量、可审计的承诺。
- 备份/恢复从“手工 tar”升级为“PITR + 对象版本 + 跨存储对账”，与账本/checkpoint 的不可变语义一致。
- 演练证据可直接支撑 G1/G3 的 DR 门，而不是口头声明。

**负向/成本**

- 需要生产对象存储、HA PostgreSQL、Redis/队列 HA、备份编排、KMS、跨区网络与持续演练成本。
- 大对象卷的复制/解包仍是 RTO 主要瓶颈；`pg_restore --single-transaction` 的原子回滚在大库上需要更多磁盘/WAL。
- MS 服务化、WA 队列持久化和分布式 cron 需要额外工程；在完成前 RTO 目标不能宣称。
- 演练需要隔离环境与客户样例数据，存在数据脱敏与访问控制成本。

**未决**

- 生产对象存储提供商/区域、跨区拓扑与数据驻留（D0-12）。
- 是否采用同步复制实现“已 push 编辑 RPO=0”，以及仲裁/降级策略。
- 备份加密/KMS/密钥轮换、保留期与法律保留的具体值。
- 是否引入第三方 DR 编排/备份产品；本 ADR 只约束能力，不锁定产品。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移阶段

| 阶段 | 内容 | 门 |
|---|---|---|
| E1-P1 | 启用 WAL 归档/PITR 与自动基础备份；验证恢复到隔离库 | 恢复时间/目标 LSN 记录；旧备份仍可读 |
| E2-P1 | 切换生产对象存储；启用版本化/加密/校验和/CRR；Azurite 降为开发 | 对象清单/哈希对账；版本可回读 |
| E2-P2 | Redis/队列 HA；WA forward queue 持久化；Hub cron 分布式幂等 | 容器重建不丢 pending forwards；双实例不双写 |
| E3 | 更新 runbook、脚本、告警、调度；建立恢复演练模板 | 演练可复现；RPO/RTO 记录 |
| E8 | scrubber/reconciler、悬挂引用隔离、备份完整性巡检 | 损坏可检测；对账报告 |

### 5.2 回滚

- **配置回滚**：PITR/备份策略可回退到上一策略，但**不得删除已有 WAL 归档/对象版本**；对象存储端点回退前必须完成双向校验，避免写入分叉。
- **对象存储回切**：只在切换后尚无新写入时允许直接回切；一旦有新写入，必须通过版本/清单对账后再回切，禁止双写历史。
- **队列回切**：先停止新入队，排空/导出待处理事件，按幂等键重放；不得丢弃 pending forwards。
- **MS 回退**：可从服务化运行回退到手工进程仅作为临时故障处置，须登记例外并限期恢复；不得把手工 `Stop-Process -Force` 作为生产常态。
- **禁止回滚到“单卷生产”**：任何回退不得删除对象版本、WAL 归档或异地副本；生产降级必须由 owner 书面批准并停止对外可靠性承诺。

### 5.3 失败判据（发现即不得宣称达标）

1. 生产使用 Azurite、单命名卷或单 PostgreSQL；对象存储无版本化/加密/CRR。
2. 无 WAL 归档/PITR；备份间隔大于 5 分钟且没有等价 RPO 证据。
3. Redis/队列单节点；WA 队列在容器 cwd，重建后 pending forwards 丢失。
4. 恢复演练未执行，或实测 RPO >5 分钟 / RTO >1 小时且无批准的差距说明。
5. DB 与对象存储未成套恢复；恢复后存在悬挂 blob/历史缺口却继续开放服务。
6. 恢复未经过 `verify-stack` + 3 文档业务验收即宣布完成。
7. MS 仍以手工进程 + 硬杀作为生产运行方式，且无优雅停机/重启证据。
8. 备份脚本/命令与当前拓扑不一致（例如仍 tar Azurite 卷冒充生产对象存储备份）。
9. 备份/恢复产物未加密、无异地副本、无访问控制或误入公开仓。
10. 以“未验证”通过 G1/G3 灾备门，或把单次手工恢复当成季度演练。

---

## 6. 证据状态（截至 2026-11-24）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| 手工全量备份基线 | 存在，**非生产 DR** | `../operations/BACKUP-RESTORE.md` v1：`pg_dump` + Azurite tar + manifest；明确“不是 HA/PITR，不能承诺 RPO≤5m/RTO≤1h” |
| PostgreSQL HA/WAL/PITR | **未实现** | 单 PostgreSQL；无副本/WAL 归档/自动故障切换 |
| 对象存储版本化/对象锁/CRR | **未实现** | Azurite 单卷；无版本化/对象锁/跨区复制；生产对象存储未接入 |
| Redis/队列 HA | **未实现** | 单 Redis（AOF、256MB、noeviction）；队列与缓存未分离 |
| WA pending forwards 持久化 | **未实现** | 队列数据在容器 cwd；容器重建丢事件 |
| MS 优雅运行 | **未实现** | 宿主手工进程；PID 文件；`Stop-Process -Force` |
| RPO/RTO 实测 | **无生产证据** | S0-15 无通过证据；G1-WAVE2 §1/§2：E1/E2/E8 全部未完成，无 RPO≤5m/RTO≤1h 证据 |
| 隔离 Phase A 演练 | **已执行一次（开发基线）** | `../operations/DR-DRILL.md` §7：2026-11-24 非破坏性 roundtrip；Azurite + `pg_dump`/卷 tar；不能证明生产 |
| 生产 PITR 演练 | **定义已登记，未执行** | `../operations/PRODUCTION-DR-DRILL.md` §4（2026-11-25）；无 provider/恢复点/WAL replay/RPO/RTO 证据 |
| 生产对象版本化恢复演练 | **定义已登记，未执行** | `../operations/PRODUCTION-DR-DRILL.md` §5；无版本 ID/SHA-256/跨存储对账证据 |
| D0-14 决策状态 | **Proposed / conditional** | 需 E1/E2 + 演练证据 + owner 签字后才可接受 |

**2026-11-25 注记**：生产 PITR / 对象版本化恢复演练已登记 provider-neutral 定义与 runbook
（`../operations/PRODUCTION-DR-DRILL.md`），但其状态为**未执行**；本 ADR 的决策状态、RPO/RTO
目标与 G1/G3 证据门均不变。定义/计划/模板不构成演练结果。

**明确不宣称**：灾备达标、RPO≤5m/RTO≤1h 已实现、生产可恢复、PITR/对象版本化已上线、WA/MS 已具备生产级故障恢复。上述结论必须有真实环境演练与测量证据。

---

## 7. 未决与后续 ADR

1. 生产对象存储与区域/数据驻留选择（依赖 ADR-G0-12、ADR-G0-17）。
2. 同步复制/仲裁与“已 push 编辑 RPO=0”的可行性；若不做，UI/合同必须明示。
3. 备份加密/KMS、保留期、法律保留与删除策略（与 ADR-G0-20 协同）。
4. MS 服务化形态（Windows 服务/容器/守护）与优雅停机；需要独立部署设计。
5. 大对象/大库的 RTO 优化与恢复资源预算。
6. 第三方 DR 编排/备份产品的选型与供应商风险评估。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（灾备 ADR 先行，未执行不写成通过）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB 与 Data/SRE owner 签字前，本 ADR 只作为实现约束，不能作为 G1/G3 Gate 的通过证据。
- D0-14 仍为 **Proposed / conditional**；在真实演练与 owner 批准前，不得改为 Accepted。

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Data owner | | | |
| SRE owner | | | |
| 安全/合规 owner（备份加密/留存） | | | |

---

## 9. 关联文档

- `G0-DECISION-REGISTER.md`（D0-14；D0-13 持久化 ack；D0-12 市场/驻留）
- `G0-EXECUTION-PLAN.md`（S0-15 DR spike）
- `G1-EXECUTION-PLAN.md`（E1/E2/E3/E8；J8/J9）
- `../operations/BACKUP-RESTORE.md`（备份/恢复基线、限制与演练清单）
- `../operations/PRODUCTION-DR-DRILL.md`（生产 PITR/对象版本化演练定义；未执行）
- `../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.4、§6.3、§12
- `../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` WS-E、WS-J、G1/G3 验收
- `ADR-G0-17-data-platform-object-storage-queue.md`（数据平台/对象存储/队列支撑）
- `ADR-G0-20-tenant-compliance-audit.md`（审计 WORM/保留与租户删除）
- `EXCEPTIONS.md`（X-22 租户删除、X-26 审计保留、X-23/X-24 checkpoint 凭据/链证据与恢复边界）
- `../../docker-compose.yml`、`../../scripts/backup-stack.ps1`、`../../scripts/restore-stack.ps1`、`../../scripts/start-ms-host.ps1`、`../../scripts/stop-ms-host.ps1`
