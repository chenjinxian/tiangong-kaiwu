# ADR-G0-17：数据平台、生产对象存储、队列与迁移门

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-14 灾备等级、D0-15 迁移契约、D0-2 租户键）、`G1-EXECUTION-PLAN.md`（E1/E2/E4/E7/E8、J8）、`ADR-G0-14-dr-rpo-rto.md`、`ADR-G0-04-ledger-version-checkpoint.md`、`../operations/BACKUP-RESTORE.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-E/WS-J
> 影响面：对象存储布局与生命周期、PostgreSQL 拓扑、Redis/队列、WA forward queue、checkpoint 作业、数据库/schema 迁移门、开发/生产环境隔离

> 本 ADR 冻结数据平台的**生产最低能力与迁移门**，不表示已实现。Azurite、单卷、单 Redis 的现状只能作为开发/内网验证；在证据齐备前不得宣称生产级数据平台或多租户就绪。

---

## 1. 背景与约束

控制面/会话面/作业面的数据都落在同一组基础设施上：Hub 的 iModel/changeset/briefcase/ACL/版本元数据在 PostgreSQL；changeset、baseline、checkpoint、tile 等 blob 在对象存储；checkpoint/baseline/forward 作业依赖 Redis/队列；MS 本地 briefcase 是可丢弃缓存。当前形态（截至 2026-11-24）：

1. **对象存储是 Azurite 单命名卷**：`docker-compose.yml` 的 Azurite 挂 `azurite-data:/data`，使用 well-known 账户/密钥，CORS 面向本机入口；没有对象版本化、对象锁、生命周期、跨区复制或生产级校验和策略。备份基线只能对卷做 tar（`../operations/BACKUP-RESTORE.md` §2.3、§10）。
2. **PostgreSQL 单节点**：单实例、无流复制/WAL 归档/PITR；Hub 启动即执行迁移，没有生产迁移门/预备份/审批编排（`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §12）。备份是手工 `pg_dump`，不是连续归档。
3. **Redis 单节点且队列/缓存未分离**：`redis:7-alpine`、`appendonly yes`、`maxmemory 256mb`、`noeviction`；没有 Sentinel/Cluster/托管 HA。`noeviction` 在容量耗尽时会让写入失败，但没有容量告警/背压证据。
4. **WA forward queue 在容器工作目录**：待转发事件未落持久卷/外置队列；容器重建会丢失 pending forwards（`09` §4.4、§6.3；`08-ARCHITECTURE-EXTENSIBILITY.md` 现状）。
5. **Hub cron/作业非分布式**：没有跨实例幂等/租约的 cron；checkpoint 作业虽有 outbox/lease 控制面，但真实队列与 worker 仍只在隔离 canary 验证过，未构成生产队列证据。
6. **迁移缺少生产门**：schema/params/native 迁移没有统一的版本化、旧 fixture、dry-run、备份、审批与回滚门；Hub 启动即迁移会放大“先迁移、旧代码长跑”的风险（`09` §4.3、§12；`10` E4/E5）。
7. **不具备单卷承载历史的资格**：当前 changeset/blob 的唯一副本在 Azurite 卷 + 单机备份；卷损坏即历史永久丢失。D0-14 的建议与本 ADR 都明确该形态不能作为生产。
8. **隔离 canary 的对象存储仍是 Azurite**：D4 checkpoint canary 只在 Azurite（需 `--skipApiVersionCheck`）上验证；真实 Azure/生产对象存储、长上传续签与部署形态未验证（`G1-WAVE2-STATUS-2026-11-23.md` §6）。

**约束**：

- 模型事实源仍是 iModel/BIS + `params`；对象存储承载 blob/派生数据，不成为第二模型库（P0-01/P0-06）。
- 对象键/表结构不得把单卷或单租户假设写死；`tenantId` 预留但不得在 B10 前冒充授权边界（X-22、ADR-G0-20）。
- 迁移必须与账本不可变、checkpoint 真实快照、版本打开语义一致（ADR-G0-04、ADR-G0-15）。
- 生产对象存储的凭据必须是短时、最小权限；不得把长期账户 key 下发到 MS/WA/web。
- 所有“已迁移/已 HA”结论必须有真实环境、可复现命令与对账报告；隔离 canary 不等于生产验证。

---

## 2. 决策

### D-A 生产对象存储

1. **生产必须使用持久对象存储服务**（S3、Azure Blob 或等价的兼容服务）；Azurite 仅用于开发/测试。生产启动必须显式拒绝 Azurite 端点、well-known 密钥、默认开发账户。
2. **强制能力**：bucket/container 版本化、静态加密（SSE-KMS 或等价信封加密）、TLS-only、对象级校验和（至少 SHA-256/CRC）、跨区复制（CRR）、生命周期与保留策略、访问日志/审计；需要合规保留的对象（审计、checkpoint/version 证据）启用对象锁/不可变保留。
3. **对象身份与不可变性**：changeset/checkpoint/baseline/tile 等历史对象按内容/版本寻址或使用不可变版本；禁止覆盖同一 key 的历史内容。删除走生命周期/显式删除流程，必须有引用检查与审计，不得无审计清理。
4. **权威边界**：PostgreSQL 保存元数据/索引/引用，对象存储保存字节；两者通过 manifest/校验和配对。任何一侧单独存在都不构成完整历史。
5. **访问控制**：对象访问使用 Hub 签发的短时 SAS/委托（与 ADR-G0-16 的 OBO/service identity 一致）；禁止长期共享 key；存储账户不公网可达；CORS 不得 `*`；直链必须可撤销/过期。
6. **校验与对账**：写入时计算并持久化大小/SHA-256；读取/恢复/复制时校验；周期 scrubber/reconciler（E8）对 DB ↔ 对象引用、链哈希、checkpoint manifest 做对账，悬挂/损坏对象隔离并告警。

### D-B PostgreSQL HA 与迁移门

1. **生产 PostgreSQL 必须是 HA**：主备 + 自动/可编排故障切换 + WAL 归档 + PITR + 自动基础备份 + 恢复验证；连接 TLS；按服务拆分数据库角色/最小权限。只读副本可用于读扩展，但不得作为写一致性证明。
2. **迁移门（所有 schema/params/native/storage 迁移）**：
   - 版本化迁移文件 + 迁移函数 + 旧 `.bim`/params fixture（ADR-G0-04/15）；
   - 迁移前自动/强制备份，记录 backupId 与目标版本；
   - dry-run/verify（隔离库或影子 schema），输出行数/对象数/哈希对账；
   - 变更审批与维护窗口（或在线 expansion 计划）；
   - down/rollback 经过测试；不可逆 down 必须 fail-closed 并给出前向修复/恢复方案；
   - 生产禁止“启动即迁移、无备份、无审批、无回滚”的路径。
3. **迁移顺序**：先 expansion（additive 列/表/索引/双写），再回填/校验，再切换读写，最后 contraction；不得一步删除旧列/旧对象。迁移期间写路径必须有明确锁/暂停/幂等语义。

### D-C Redis/队列与作业持久化

1. **生产 Redis 必须 HA**（托管或 Sentinel/Cluster），开启持久化；队列与缓存使用不同实例/命名空间/数据库，避免缓存驱逐影响队列。
2. **队列必须持久**：WA forward queue 落持久卷或外置队列；容器重建/重启不得丢 pending forwards；baseline/recovery/checkpoint 作业使用持久队列或 outbox + claim/lease。
3. **`noeviction` 必须有容量模型**：设置内存上限、告警、背压与扩容策略；队列满时不得静默丢事件；作业必须有幂等键、重试上限、死信/人工处置。
4. **Hub cron/定时作业分布式化**：跨实例使用租约/幂等键，单实例故障不重复执行、不产生幽灵作业；checkpoint 作业继续使用 `checkpoint_jobs` outbox/lease（ADR-G0-04）。
5. **队列恢复语义**：恢复/迁移时先停止新入队，导出/排空待处理事件；按幂等键重放；不得用“清空 Redis”代替恢复。

### D-D 环境隔离与“无单卷历史”

1. **开发/测试**：Azurite、单 Redis、单 Postgres 允许存在，但必须打上“非生产”标签，且不能接收客户数据。
2. **生产**：changeset/baseline/checkpoint/tile 历史必须同时具备对象版本化 + CRR + 备份/生命周期；**禁止**把生产历史只放在单个 Docker 命名卷、宿主磁盘或单节点文件系统。
3. **staging/prod 同形态**：staging 使用与生产同类的对象存储/HA Postgres/队列能力（可缩小容量），不得用 Azurite/单卷代替后再宣称 staging 已验证。
4. **数据迁移（Azurite → 生产对象存储）**：一次性复制 + 逐对象校验 + 冻结写 + 切换端点；不得双写历史。旧卷在切换后只读保留一段时间用于回滚/取证；一旦新写入发生，回切必须经过对账，禁止直接回切造成历史分叉。
5. **租户/环境命名空间**：对象 key 与表结构预留 `tenantId`/环境前缀；在 B10 完成前，前缀不是授权边界，不得据此宣称跨租户隔离（ADR-G0-20）。

### D-E 所有权与证据

- Data Owner 负责数据平台不变量、迁移门与恢复演练；SRE 负责 HA/队列/容量/告警；Security Owner 负责密钥/KMS/访问控制；application owner 负责校验和/幂等/引用完整性。
- 任何“HA/PITR/对象版本化/队列持久化已上线”的声明，必须附：真实环境配置、对象版本/复制证据、恢复/对账报告、演练时间与结果。

---

## 3. 备选方案

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 维持 Azurite + 单 Redis + 单 Postgres | 现状；仅 tar/dump；队列在容器 cwd | **仅开发/内网验证**；不满足生产；不满足 D0-14 |
| B. 托管/生产级对象存储 + HA Postgres + HA 队列 | 云托管或等价服务，版本化/加密/CRR/PITR/持久队列 | **采用**（生产基线） |
| C. 自建 HA（Patroni/MinIO/Ceph/Sentinel） | 自管主备/复制/对象版本化 | **允许**，前提是满足 D-A/D-B/D-C 的不变量与演练证据；运维成本自担 |
| D. 双写旧卷与新对象存储 | 迁移期同时写两侧 | **拒绝用于历史**：会产生双历史/分叉；只允许一次性复制 + 冻结切换 |
| E. 只做备份不做 HA/版本化 | 依赖定期 dump/tar | **拒绝作为生产**；RPO/RTO 不可控，单卷损坏仍可能永久丢失 |

---

## 4. 后果

**正向**

- 历史与 blob 不再依赖单卷/单节点；对象版本化/CRR 与 PITR 共同支撑 RPO/RTO。
- 队列持久化与幂等作业避免 WA 重建丢 forward、checkpoint 作业幽灵/重复。
- 迁移门把 schema/params/native 变更从“启动即迁移”变成可预演、可回滚、可审计的发布步骤。
- 为多租户/合规（前缀、KMS、保留、审计 WORM）提供稳定的数据底座。

**负向/成本**

- 对象存储/HA/队列的云成本与运维复杂度；跨区复制带来延迟与费用。
- Azurite 卷迁移、逐对象校验、切换窗口与旧卷保留需要专门演练。
- 迁移门的审批/备份/窗口会降低发布速度，但这是生产正确性的必要成本。
- 自建 HA 的故障切换/脑裂/复制滞后风险需要专门 SRE 能力。

**未决**

- 生产对象存储/Postgres/Redis 的具体提供商与区域（D0-12 数据驻留）。
- 对象锁/保留期与审计 WORM 的具体配置（ADR-G0-20）。
- 队列选型（BullMQ/托管队列/其他）与多实例 worker 的租约/公平性。
- 旧 Azurite 卷的迁移窗口、回滚保留期与客户数据脱敏。
- 迁移门的自动化程度（CI job/运维平台）与职责分离。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移阶段

| 阶段 | 内容 | 门 |
|---|---|---|
| P1 | 生产对象存储接入（版本化/加密/校验和/CRR）；Azurite 降为开发 | 对象写入/读取/版本回读/校验和对账；生产启动拒绝 Azurite |
| P2 | PostgreSQL HA/PITR；迁移门接入 | 故障切换演练；PITR 恢复；迁移 dry-run/回滚 |
| P3 | Redis/队列 HA；WA forward queue 持久化；cron 分布式化 | 容器重建不丢 forwards；双实例不双写；队列满不丢事件 |
| P4 | Azurite → 生产对象存储数据迁移 | 逐对象大小/SHA-256 对账；冻结切换；旧卷只读保留 |
| P5 | staging/prod 同形态与定期对账 | E8 scrubber 报告；季度 DR 演练 |

### 5.2 回滚

- **对象存储端点回滚**：切换后尚无新写入时可直接回切；已有新写入时必须按版本/manifest 对账，禁止双写历史；旧卷只读保留不得删除。
- **PostgreSQL**：迁移按 expansion/contraction 分步；代码回滚不得依赖已删除的旧列；不可逆 down 必须 fail-closed，优先前向修复或从备份恢复。
- **队列**：先停止新入队，导出/排空待处理事件，按幂等键重放；回退版本不得消费新格式事件而不兼容。
- **Redis**：HA 故障切换保留持久化数据；不得用清空 Redis 解决不一致；缓存可丢，队列不可丢。
- **迁移门回滚**：保留迁移前 backupId；任何回滚到旧 schema 必须有旧代码/旧 fixture 验证；不得“删库重建”冒充回滚。

### 5.3 失败判据（发现即不得宣称生产级）

1. 生产对象存储是 Azurite、单卷或 well-known 密钥；未启用版本化/加密/CRR/校验和。
2. changeset/baseline/checkpoint/tile 历史只存在单个卷/宿主磁盘；没有 CRR/备份配对。
3. PostgreSQL 单实例、无 WAL 归档/PITR 或迁移前无备份。
4. Redis 单节点/无持久化；队列与缓存未分离；`noeviction` 无容量告警/背压。
5. WA forward queue 仍在容器 cwd；容器重建丢 pending forwards。
6. Hub cron/作业可跨实例重复执行或产生幽灵作业；checkpoint 作业无幂等/租约证据。
7. 任何 schema/params/native/storage 迁移未经 dry-run、备份、审批、回滚验证即上生产。
8. 无 DB ↔ 对象对账（scrubber/reconciler）；悬挂引用/损坏对象不可检测。
9. 生产对象访问使用长期共享 key、公开 bucket 或 `*` CORS。
10. 用隔离 canary/Azurite 结果宣称真实对象存储/HA/队列已验证。

---

## 6. 证据状态（截至 2026-11-24）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| 生产对象存储 | **未接入** | 仅 Azurite；`docker-compose.yml` 单命名卷；well-known 密钥 |
| 对象版本化/对象锁/CRR/校验和 | **未实现** | `../operations/BACKUP-RESTORE.md` §10 明确列为差距 |
| PostgreSQL HA/PITR | **未实现** | 单 PostgreSQL；无 WAL 归档/PITR；迁移无生产门 |
| Redis/队列 HA | **未实现** | 单 Redis；`noeviction`；队列/缓存未分离 |
| WA forward queue 持久化 | **未实现** | 队列在容器 cwd；容器重建丢 pending forwards |
| Azurite 数据迁移 | **未执行** | 仅有卷 tar/本地卷克隆；无生产对象存储搬迁与对账 |
| 迁移门 | **未实现** | Hub 启动即迁移；无统一 pre-backup/dry-run/approval/rollback 证据 |
| 真实对象存储验证 | **未执行** | D4 canary 仅 Azurite（`--skipApiVersionCheck`）；真实 Azure/生产存储、长上传续签未验 |
| 队列/worker 生产形态 | **未验证** | checkpoint worker canary 仅隔离环境；BullMQ 锁续期在长 native 作业中出现失败并有界缓解，native 仍阻塞事件循环，未迁移到 worker thread/child process |
| G1 数据/DR 工作包 | **未完成** | `G1-WAVE2-STATUS-2026-11-23.md` §1/§2：E1/E2/E8 全部未完成；无 HA/版本化/演练证据 |

**明确不宣称**：生产对象存储已接入、HA/PITR 已上线、队列已持久化、数据迁移门已生效、Azurite 迁移已完成、真实 Azure/对象存储已验证。Azurite 单卷只能作为开发环境。

---

## 7. 未决与后续 ADR

1. 对象存储/Postgres/Redis 提供商与区域、数据驻留（ADR-G0-12）。
2. 对象锁/保留期/审计 WORM 的具体配置（ADR-G0-20）。
3. 队列选型与 worker 隔离（worker thread/child process、公平性、背压）。
4. Azurite 卷迁移的窗口、回滚保留与客户数据清理。
5. 迁移门的自动化与审批流（CI/运维平台/职责分离）。
6. 多租户前缀/KMS key 粒度；在 B10 前不得作为授权依据。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（数据平台 ADR 先行）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB、Data/SRE/Security owner 签字前，本 ADR 只作为实现约束，不能作为 G1/G3 Gate 的通过证据。

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Data owner | | | |
| SRE owner | | | |
| 安全/合规 owner（KMS/保留） | | | |

---

## 9. 关联文档

- `G0-DECISION-REGISTER.md`（D0-14、D0-15、D0-2）
- `G1-EXECUTION-PLAN.md`（E1/E2/E4/E7/E8；J8）
- `ADR-G0-14-dr-rpo-rto.md`（灾备等级/RPO/RTO/恢复顺序）
- `ADR-G0-04-ledger-version-checkpoint.md`（不可变账本/checkpoint）
- `../operations/BACKUP-RESTORE.md`（当前数据、备份限制与恢复顺序）
- `../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4、§6.3、§12
- `../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` WS-E、WS-J、G1/G3 验收
- `EXCEPTIONS.md`（X-16/X-17 账本/checkpoint、X-22 租户键、X-23/X-24 checkpoint 凭据/链证据）
- `../../docker-compose.yml`
