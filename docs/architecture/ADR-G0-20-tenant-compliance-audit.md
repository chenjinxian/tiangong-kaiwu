# ADR-G0-20：租户边界、合规与不可变审计

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-2 部署/租户、D0-12 市场/合规）、`G1-EXECUTION-PLAN.md`（B7/B10、L5/L6）、`EXCEPTIONS.md`（X-22、X-26）、`AIRR-2026-11-23-B7-AUDIT-V1.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §5、§13、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-B/WS-L
> 影响面：tenantId/RLS/对象前缀/KMS、Hub/MS/WA/storage 的 PEP、审计表/链/异地 WORM/锚定、保留/法律保留/DSR、多租户与合规声明

> 本 ADR 冻结租户边界与生产审计的最低要求，**不表示多租户或合规审计已实现**。当前 `tenantId` 可空且恒为 NULL、无 RLS；审计 v1 只有本地 DB 触发器/哈希链，无异地 WORM/保留/legal hold；跨租户负例仍 blocked，不得写成 passed。

---

## 1. 背景与约束

### 1.1 租户现状

1. **`tenantId` 只是占位**：B2/B3 P0 的 handle/OBO/audit schema 只有 nullable `tenantId`，且恒为 `NULL`；授权决策只做 iTwin 边界（X-22）。
2. **无 RLS/无租户强制**：数据库没有 row-level security 或等价的强制查询作用域；Hub/BFF/MS/WA/storage/tile 入口没有统一的 tenant PEP；对象 key/表结构没有可执行的租户前缀/密钥隔离。
3. **B10 未做**：tenant 映射/RLS/前缀/配额/跨租户负例均未实现；跨租户负例按 B10 **blocked**，不得写成 passed。
4. **D0-2 是单租户先上线**：`tenantId` 从第一天预留，但不得用 iTwinId 临时冒充；单租户假设不得写死进 schema/对象键/权限模型。
5. **市场/驻留未定**：D0-12 未裁决前不得收集生产客户数据；数据驻留/出口/隐私是发布阻断项。

### 1.2 审计现状

1. **B7 v1 是本地 DB 审计**：`audit_events` 有 `seq/prevHash/entryHash` 哈希链，DB 触发器拒绝 `UPDATE/DELETE/TRUNCATE`；应用端口只有 append/read；服务专用查询/校验路由存在（`AIRR-2026-11-23-B7-AUDIT-V1.md`）。
2. **覆盖范围狭窄**：只覆盖 authz shadow decision；登录/登出/撤权、权限/成员/角色变更、iModel/changeset/briefcase 写、FeatureOp/直改、导出、checkpoint 调度/claim、storage SAS、webhook 管理、管理员/API key 操作等高风险操作未接入审计。
3. **不是生产 WORM**：触发器级 append-only 是本地防御；表 owner/超级用户可显式禁用/删除触发器；无异地不可变副本/对象锁/保留期/legal hold；链无法检测删除最新行；有权限者禁用触发器后可重算整链，本地表无法自证被重写；`createdAt` 哈希为毫秒精度（X-26）。
4. **无外部锚定**：没有周期性把 `lastSeq + entryHash` 锚定到外部不可变存储/账本；尾删/整链重写无法检测。
5. **查询凭据仍是共享 key**：审计查询/校验仍用共享 `AGENT_API_KEY`（B6 未完成）；`tenantId=NULL`（B10 未完成）。
6. **无合规证据链**：没有 retention/legal hold/DSR/审计导出 SIEM/访问评审/供应商评估的运行证据；不能宣称 SOC 2/ISO 认证或合规审计完成。

**约束**：

- 租户边界是 **P0 安全边界**，不是 UI/查询过滤的装饰；必须在 PDP/PEP、数据库、对象存储、KMS 与审计多处落地。
- Hub 是 PDP；MS/worker/storage/tile/WA 的每个入口是 PEP；不得用客户端传入的 tenant/user 推断身份（ADR-G0-16）。
- iTwinId 不是 tenantId；不得用 iTwinId 代替租户键或授权判断。
- 审计是事实源，不是日志；审计写失败对高风险操作必须 fail-closed（逐步落地，未覆盖项诚实登记）。
- 法务/保留/驻留结论由 Legal/Product 给出；本 ADR 不伪造合规结论。

---

## 2. 决策

### D-A 租户边界（多租户声明前置）

1. **tenantId 是一等租户键**：所有租户拥有的表/对象/索引/审计记录必须带 `tenantId`；租户映射（Tenant → Project/iTwin → Document/iModel）由控制面维护；不得用 iTwinId、项目名或用户邮箱充当 tenantId。
2. **生产多租户模式必须有租户上下文**：每个请求/连接/作业必须解析出唯一 tenant；缺失/歧义/冲突 → fail-closed（401/403/409），不得回退到默认租户或“全局可见”。
3. **多层隔离**：
   - PostgreSQL：tenantId 列 + 索引/唯一约束 + RLS（或等价强制查询作用域）；应用角色不得绕过；跨租户查询/聚合/列表默认拒绝；
   - 对象存储：tenant 前缀/容器 + 按租户 KMS key（或等价信封加密上下文）+ 访问策略；
   - 入口 PEP：Hub/BFF/MS/WA/storage/tile 的下载、打开、FeatureOp、直改、push/pull、export、checkpoint、progress/retry、baseline/tile 等每个入口执行租户 + 文档权限；
   - 审计：每条记录带 tenantId、actor、resource；查询按 tenant 过滤。
4. **单租户先上线**：单租户部署必须显式配置一个 tenant；`tenantId` 可为过渡期 nullable，但不得作为授权依据；单租户假设不得写死进 schema/对象键。
5. **多租户声明门**：在 B10 完成、RLS/PEP 生效、跨租户负例真栈全绿之前，**不得**对外宣称多租户、不得开放跨租户注册/邀请/分享。
6. **租户生命周期**：provision、配额、导出、删除、legal hold、审计保留；删除必须覆盖 DB 行/对象/tile/缓存/审计引用，不能只删一侧留下孤儿；删除/导出必须可审计、可验证。
7. **租户隔离测试**：至少覆盖跨租户 ID 猜测、列表/搜索、对象 key、tile/storage 直链、WA baseline、审计查询、管理员路由；任何负例 blocked 不得记作 passed。

### D-B 不可变审计与异地锚定

1. **append-only 事实源**：审计事件只能追加；本地 DB 触发器/哈希链作为防御纵深保留，但**不足以单独满足生产合规**；生产必须同时写入异地不可变存储（WORM/对象锁/保留 vault，独立账户/订阅或等价隔离）。
2. **异地副本与锚定**：
   - 高风险事件在本地事务成功后必须尽快同步/流式写入异地不可变副本；失败时本地保留待重试，超过阈值对高风险操作 fail-closed；
   - 周期性将 `lastSeq + entryHash`（及必要批次摘要）签名锚定到外部不可变存储/独立账本；锚定频率由 Security Owner 在 G3 前批准；
   - 锚定必须能检测尾删/整链重写/缺行；本地 `audit_events` 表 owner 禁用触发器不得成为不可检测的改写路径。
3. **覆盖清单（生产最低）**：登录成功/失败/登出、token 撤销/轮换/停用、权限/成员/角色/组/share 变更、iModel/changeset/briefcase 创建与写、FeatureOp/直改、导入/导出、checkpoint 调度/claim/complete、storage SAS 签发/续签、webhook 管理/投递管理、管理员/API key/service client 操作、租户生命周期、审计查询/导出。未接入项必须有 owner/期限并登记，不得宣称已覆盖。
4. **字段与隐私**：至少记录 `eventId/seq/prevHash/entryHash`、actorUserId、onBehalfOf、actorService、tenantId、iTwinId、iModelId、resource、action、decision/reason、requestId、sessionId/jti、before/after hash、时间；不得记录 token/SAS/密码/邮箱/IP 等不必要 PII；必须可导出 SIEM。
5. **失败语义**：高风险操作的审计写入失败必须阻断操作（fail-closed）；低风险/后台事件可重试但不能静默丢弃；审计查询/校验只允许服务身份（B6 后使用注册服务身份，逐步退役共享 key）。
6. **保留/法律保留/DSR**：保留期、legal hold、租户删除、个人数据导出/删除必须可配置、可审计、可验证；审计删除必须经 HITL/审批并留删除证据；不得用“清空/重算链”解决保留问题。
7. **冻结与版本**：审计哈希规范 v1 一旦应用不可原地修改；变更需 v2 + 新版本串 + 迁移（沿用 B7 v1 约束）。查询/校验响应不得泄露 token/SAS/PII。

### D-C 生产/合规声明门

1. **多租户声明**：仅当 B10 完成、RLS/PEP 生效、跨租户负例真栈全绿、租户审计可查、对象/KMS 隔离证据齐备后，才可对外宣称多租户；否则只能按单租户/私有化交付。
2. **生产审计声明**：仅当异地不可变副本、锚定、保留/legal hold、高风险覆盖与 fail-closed、SIEM 导出、B6 服务身份（或登记例外）齐备后，才可宣称生产合规审计；本地 DB 触发器只能表述为“本地 append-only 防御”。
3. **合规认证**：SOC 2/ISO 27001 等是审计/商务结果；本 ADR 只要求控制存在与证据可重复生成，不宣称已认证。
4. **数据驻留/DSR**：按 D0-12 的目标市场配置存储区域、保留与删除；未裁决前不得收集生产客户数据。

### D-D 所有权与证据

- Security Owner：租户边界/RLS/PEP/审计覆盖/密钥/KMS；Data Owner：tenantId 迁移、审计存储/保留/锚定、备份恢复；Legal/Product：驻留/隐私/许可/合规结论；Release Owner：发布门与证据归档。
- 任何“跨租户已隔离/审计已 WORM/合规已达标”的声明必须附真栈负例、异地副本/锚定验证、保留/删除演练与 owner 签字。

---

## 3. 备选方案

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 保持 nullable tenantId + 无 RLS | 只按 iTwin/接口过滤；单租户假设 | **仅过渡**；不得多租户；不得作为授权边界；不满足 X-22 退出 |
| B. tenantId + RLS + 对象/KMS 前缀 + 入口 PEP | 租户键全链路强制，单租户先上线 | **采用**（多租户前置） |
| C. 只靠外部 IdP/组做租户 | Hub 仍按 iTwin/组解析，不落 tenantId/RLS | **不采用**；无法防止对象/查询/审计跨租户；Hub 仍是 PDP |
| D. 本地 DB 触发器即可 | 现有 B7 v1 作为合规 WORM | **不采用为生产**；无异地副本/锚定/保留，尾删不可检测 |
| E. 异地 WORM + 周期签名锚定 | 本地链 + 对象锁/不可变 vault + 外部锚 | **采用**（生产审计最低） |
| F. 第三方 SIEM/WORM 服务 | 托管不可变日志/审计平台 | **允许**，须满足 E 的可验证性、保留/legal hold 与不泄露要求 |

---

## 4. 后果

**正向**

- 多租户从“查询过滤”升级为可执行边界：DB/对象/KMS/入口 PEP/审计同源。
- 审计从本地触发器升级为可检测尾删/重写、可保留/legal hold、可导出 SIEM 的生产证据链。
- 跨租户负例与审计证据可支撑 G3/企业客户尽调，而不是口头承诺。
- 租户删除/导出/DSR 有明确生命周期，减少孤儿数据与合规风险。

**负向/成本**

- tenantId 回填、RLS/索引/唯一约束、对象前缀/KMS 隔离需要 schema/数据迁移与性能评估。
- 异地 WORM/锚定/SIEM/保留/legal hold 增加存储、网络与运维成本。
- 高风险操作审计接入与 fail-closed 会影响可用性，需要逐项批准/演练。
- 法务/驻留/隐私结论依赖外部流程，可能阻断多租户/生产数据收集。

**未决**

- 目标市场/数据驻留/出口（D0-12）与租户删除/DSR 的具体法律要求。
- 异地 WORM 的存储产品/账户隔离/保留 vault 选型与锚定频率。
- RLS 的性能/连接池/读写分离影响；是否需要独立 tenant service。
- 审计事件 schema 的最终字段与 SIEM 格式；高风险的完整清单与 fail-closed 顺序。
- B6 服务身份与共享 key 退役（X-21）对审计查询的影响。

---

## 5. 迁移、回滚与失败判据

### 5.1 租户迁移

1. **加列/回填**：additive `tenantId`（nullable）→ 基于显式 Tenant→Project/iTwin 映射回填 → 统计 NULL/冲突 → 校验无跨租户错配。
2. **约束/索引**：为租户拥有的表加 tenantId 索引与包含 tenant 的唯一约束；对象 key 前缀迁移/双读校验。
3. **RLS/PEP**：先 shadow/report（记录将拒绝的跨租户访问），再 enforce；每个入口接入 tenant PEP；缺失 tenant 一律 fail-closed。
4. **删除/导出**：租户删除/导出先在隔离环境演练，覆盖 DB/对象/tile/缓存/审计引用。
5. **回滚**：保留 tenantId 列/数据，关闭 RLS/enforcement 回到单租户模式；不得 drop 列/删除审计；若已产生新租户写入，必须保留映射并避免回滚后串租户。

### 5.2 审计迁移与恢复

1. **双写**：本地链 + 异地不可变副本；先报告差异，再要求高风险事件同步成功；锚定服务上线后验证尾删/重写检测。
2. **回填/历史**：v1 规范冻结，不原地修改；历史 legacy 行的处理必须显式策略，不得伪造成“已验证”。
3. **保留/legal hold**：定义保留期与 legal hold 覆盖；删除必须审批并留证据；DSR 导出/删除走同一审计。
4. **恢复**：从 WORM/异地副本恢复审计并重算链、核对锚定；本地恢复不得覆盖更新的异地记录；审计恢复失败不得继续高风险操作。
5. **回滚**：回到本地-only 审计必须登记例外（owner/失效日期）并停止“合规/WORM”声明；永久保留已写审计，不得删链。

### 5.3 失败判据（发现即不得多租户/合规声明）

1. `tenantId` 仍 nullable/NULL 或无 RLS/PEP 即宣称多租户；用 iTwinId 冒充 tenantId 做授权。
2. 跨租户负例 blocked/未执行却记为 passed；列表/搜索/对象直链/tile/WA/审计存在跨租户可见。
3. 对象 key/KMS key 不按租户隔离；租户删除只删 DB 行或只删对象，留下孤儿/悬挂引用。
4. 审计只有本地 DB 触发器/哈希链，无异地不可变副本/对象锁/保留；尾删/整链重写不可检测。
5. 无外部链头锚定；无 retention/legal hold/DSR；审计可被无审批删除/清空。
6. 高风险操作未接入审计，或审计写失败不阻断高风险操作。
7. 审计查询/校验仍以共享 key 为唯一控制且未登记 B6 例外；审计记录含 token/SAS/PII。
8. 本地审计表 owner 可禁用触发器并重算链而无外部证据可发现。
9. 以“日志/OpLog/webhook 状态”替代独立审计事实源。
10. 宣称 SOC 2/ISO 认证或“合规审计完成”而没有控制证据/审计报告。

---

## 6. 证据状态（截至 2026-11-24）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| tenantId | **nullable / 恒 NULL** | X-22；B2/B3 handle/OBO/audit schema 仅占位；只做 iTwin 边界 |
| RLS/租户 PEP | **未实现** | 无 RLS；Hub/MS/WA/storage/tile 无统一 tenant PEP；对象/KMS 未按租户隔离 |
| B10 租户隔离 | **未做** | G1-WAVE2 §1/§2；跨租户负例 **blocked**，不得写成 passed |
| 多租户声明 | **禁止** | D0-2 单租户先上线；B10 完成前不得宣称多租户 |
| 审计 v1 | **本地 DB 触发器/哈希链** | `AIRR-2026-11-23-B7-AUDIT-V1.md`：append-only + v1 链 + service-only 查询/校验；只覆盖 authz shadow decision |
| 高风险操作审计/阻断 | **未实现** | X-26；登录/撤权/权限/写/直改/导出/checkpoint/SAS/webhook 等未覆盖；审计失败不阻断高风险操作 |
| 异地 WORM/对象锁/保留 | **未实现** | X-26；无异地不可变副本、retention、legal hold |
| 外部链头锚定 | **未实现** | 尾删/整链重写不可检测；DB owner 可禁用触发器 |
| 审计查询身份 | **共享 key** | 仍用 `AGENT_API_KEY`（B6/X-21）；`tenantId=NULL` |
| 审计测试证据 | **仅本地/隔离** | B7 v1：153 suites/1418 tests、隔离 relational e2e 6/6；不是生产部署/合规证据 |
| 数据驻留/DSR/合规 | **未裁决/未实现** | D0-12；无 retention/legal hold/DSR/SIEM/访问评审运行证据 |
| G1 Gate | **未通过** | B7/B10 相关项未完成；不得把本 ADR 当 Gate 证据 |

**明确不宣称**：多租户已隔离、跨租户负例已通过、B10 完成、B7/WORM/合规审计完成、高风险操作已被审计/阻断、审计可检测尾删/整链重写、SOC 2/ISO 已认证。上述结论必须有真栈负例、异地副本/锚定验证与 owner/法务签字。

---

## 7. 未决与后续 ADR

1. Tenant→Project/iTwin/Document 映射与租户服务边界；是否引入独立 tenant service。
2. RLS 策略/性能/连接池/读写分离；对象前缀/KMS key 粒度与轮换。
3. 异地 WORM 存储产品/账户隔离/保留 vault/锚定频率与签名密钥。
4. 高风险操作完整清单、审计 schema、fail-closed 顺序与可用性权衡。
5. 保留期/legal hold/DSR/数据驻留的法律要求（D0-12、Legal）。
6. B6 服务身份替代共享 key 的审计查询/校验路径（X-21）。
7. 租户删除/导出/灾难恢复的联合演练（与 ADR-G0-14/17 协同）。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（租户/合规 ADR 先行）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB、Security、Data、Legal owner 签字前，本 ADR 只作为实现约束，不能作为多租户/合规/审计完成的证据。
- D0-2 仍为单租户先上线；X-22/X-26 保持 open。

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Security owner | | | |
| Data owner | | | |
| Legal/合规 | | | |

---

## 9. 关联文档

- `G0-DECISION-REGISTER.md`（D0-2、D0-12）
- `G1-EXECUTION-PLAN.md`（B7/B10、L5/L6）
- `EXCEPTIONS.md`（X-21 服务身份、X-22 租户、X-26 审计、X-27 PEP 覆盖）
- `AIRR-2026-11-23-B7-AUDIT-V1.md`（审计 v1 实现、边界与延期项）
- `ADR-G0-16-identity-attribution.md`（真实归因/OBO/服务身份）
- `ADR-G0-14-dr-rpo-rto.md`（备份/恢复与异地副本）
- `ADR-G0-17-data-platform-object-storage-queue.md`（对象存储/前缀/KMS/迁移门）
- `ADR-G0-19-supply-chain-sbom-license.md`（数据驻留/出口/许可）
- `../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §5.4–§5.6、§13
- `../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` WS-B、WS-L、G1/G3 验收
- `G1-WAVE2-STATUS-2026-11-23.md`（B7/B10 实际状态与未完成项）
