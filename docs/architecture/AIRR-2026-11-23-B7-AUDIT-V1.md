# AIRR：G1 B7 审计 v1（Hub append-only 哈希链）

- 标题：G1 B7 审计 v1 — authz 决策审计的 DB 强制 append-only、哈希链、服务侧查询与校验
- 日期：2026-11-24
- Owner：平台/安全（owner directive 2026-11-23）
- 关联 Issue/需求：`G1-EXECUTION-PLAN.md` B7；`10-ARCHITECTURE-HARDENING-PLAN.md` B7；`IDENTITY-ACL-DESIGN.md` §5.4；`AIRR-2026-11-23-B2-OBO-B3-ACL.md`；`EXCEPTIONS.md` X-26；`INTERFACE-FREEZE-MATRIX.md`
- 预计影响仓：私有 `imodelhub-services`（authz/migrations/测试）；公共仓仅本 AIRR、`EXCEPTIONS.md` 与 `docs/README.md`。**不触碰** `luban-cad/**`、Part Studio、草图、UI、native、`luban-backend/**`。
- 是否需要 ADR：**否（本切片）**。不新增跨仓契约、不新增公共 REST DTO、不改 shared IPC；只对私有 Hub 的既有 `audit_events` 做 additive schema 与内部端点。B7 的“高风险操作阻断/保留与异地 WORM/保留期”需要后续 AIRR/ADR。

> 状态：**B7 v1 已实现并在隔离真库验证；不是 B7 全量完成，不宣称 WORM/合规审计完成，不勾选任何 G1 Gate 项。**
> 真实边界、延期项与迁移风险见 §5–§8。隔离 e2e 重复运行发现并修复了一个真实排序缺陷（§7.3）。

---

## 0. 结论摘要

1. `audit_events` 获得 additive 链身份：`seq bigint UNIQUE NOT NULL`、`prevHash`、`entryHash`；运行期写入在事务内用 PostgreSQL advisory lock 串行化，按 `prevHash + 规范字段` 计算 SHA-256。
2. DB 触发器拒绝任何 `UPDATE`/`DELETE`（行级）与 `TRUNCATE`（语句级）；应用层端口仍只有 append/read，没有 update/delete 方法。**这是数据库触发器级 WORM，不是异地不可变存储/合规 WORM**。
3. 新增服务专用只读面：`GET /internal/v1/authz/audit`（actor/iTwin/iModel/action/decision/time 过滤 + `afterSeq` keyset 分页，`limit ≤ 200`）与 `GET /internal/v1/authz/audit/verify`（全链重算，检测缺行/乱序/篡改）。二者只接受既有服务身份（`AgentApiKeyGuard` + 固定 `X-Service-Name`），普通用户 JWT 不可读。
4. 现有 B3 shadow decision 仍经 `AuditEventsService.record` 写入；审计失败继续把决策变成 503（fail closed）。**本切片不新增高风险操作审计，也不做“审计失败即阻断高风险操作”的 enforcement**（明确延期，登记 X-26）。
5. 未做：异地 WORM/保留期/legal hold、链头外部锚定（尾删检测）、登录/权限/导出/直改/checkpoint/storage/webhook 等高危操作审计、B6 服务身份、B10 租户、查询 UI/导出。不得把本 AIRR 当作 B7 完成或 G1 Gate 通过。

---

## 1. 目标、验收与非目标

### 1.1 本切片目标

1. 在**不改既有列/数据**的前提下，为 `audit_events` 增加可验证的链身份与确定性回填。
2. 写入路径事务化、串行化、可审计：任何并发写入不得分叉或复用 seq。
3. 数据库层面拒绝审计行改写/删除，并把该能力用真实 PostgreSQL 触发器验证。
4. 提供**服务专用**的按主体/文档/时间/动作/结果查询与全链校验能力，且不泄露 token/SAS/PII。
5. 保持 shadow decision 的 fail-closed 语义；明确哪些 B7 内容仍未做。

### 1.2 可观察验收

| # | 验收 | 证据 |
|---|---|---|
| A1 | 旧行无损；链列 additive；确定性回填 | `20261124000001-CreateAuditEventChain.ts`、迁移单测、scratch DB e2e |
| A2 | 并发 append 产生连续 seq 与有效链 | 12 路并发 decision e2e；DB 连贯 + `/verify` 有效 |
| A3 | `UPDATE`/`DELETE`/`TRUNCATE` 被 DB 拒绝 | 主测试库 + scratch DB 的真实 SQL 负例 |
| A4 | 篡改、缺行、乱序可检测 | 域单测 + 真实 DB 篡改后 `/verify` 报 `entryHashMismatch`，恢复后转绿 |
| A5 | 查询过滤/分页/上限；service-only；无 token 泄漏 | 隔离 e2e HTTP 用例；用户 JWT/无凭证/错误服务名 401 |
| A6 | 审计失败仍 fail closed | 既有 `authz-decisions.service.spec.ts`（`record` 失败 → 503）+ 隔离 e2e decision 正常路径 200/allow/deny |
| A7 | 全量单测/tsc/eslint 绿 | 153 suites / 1418 tests；tsc 0；eslint 0 errors（88 条既有 warning） |

### 1.3 明确非目标（本 AIRR 不做）

- 不做高风险操作审计覆盖与阻断（登录/登出/撤权、权限与成员变更、iModel/changeset/briefcase 写、直改/FeatureOp、导出、checkpoint 调度/claim、storage SAS、webhook 管理等）。
- 不做异地不可变存储、对象锁、保留期/legal hold、DSR/导出删除、链头对外锚定。
- 不做 B6 服务身份；查询/校验仍用共享 `AGENT_API_KEY` + 固定服务名（X-21/X-26）。
- 不做 B10 `tenantId`、RLS、跨租户强制；`tenantId` 仍恒为 `NULL`（X-22）。
- 不改公共 REST DTO、不改官方 clients 契约、不改 shared IPC、不改 web/viewer/MS/native。
- 不勾选 G1 Gate；不宣称合规审计或 WORM 全量完成。

---

## 2. 复用矩阵

| 能力 | 现有实现 | 本切片决策 | 理由 |
|---|---|---|---|
| 审计事实源 | `audit_events`（B2/B3） | **扩展（additive）** | 不建第二审计表/第二模型 |
| 写入入口 | `AuditEventsService.record` → `AuditEventRepository` | **扩展** | 现有 decision 调用点不变 |
| ORM/迁移 | TypeORM 0.3、手写 migration | **复用** | 不引入新依赖 |
| append-only 触发器 | `changesets` 的 `TR_changesets_append_only` 模式 | **复用模式** | 同一类 DB 触发器保护，不发明新机制 |
| 哈希链规范形式 | `changeset-chain.util.ts` 的 canonical JSON 思路 | **新建冻结 v1（本域）** | 字段集不同且不可变，单独模块 |
| 服务身份 | `AgentApiKeyGuard` + `OboServiceGuard` | **复用** | 与现有 internal authz 一致；不新造鉴权 |
| 内部开关 | `OboEnabledGuard` | **复用** | flag off 时路由不存在，不查表 |
| 查询分页 | 现有 keyset/`limit` DTO 模式 | **复用** | 不新增公共分页契约 |
| 校验算法 | SHA-256（Node crypto） | **复用** | 无新依赖 |

**无新增依赖**；无 npm registry 变更；无 native/渲染/求解器变更。

---

## 3. Schema、链与写入

### 3.1 迁移与 schema

迁移：`src/database/migrations/20261124000001-CreateAuditEventChain.ts`。

| 列 | 类型 | 约束/含义 |
|---|---|---|
| `seq` | `bigint` | `NOT NULL`、`UNIQUE`、`CHECK (seq > 0)`；连续链位置，应用赋值（不用 DB sequence，回滚不留空洞） |
| `prevHash` | `varchar(64)` | 上一行 `entryHash`；仅 seq=1 为 `NULL` |
| `entryHash` | `varchar(64)` | v1 规范字段的 SHA-256 hex；`NOT NULL` |

新增索引：`UQ_audit_events_seq`、`IDX_audit_events_actorUserId`、`IDX_audit_events_iTwinId`、`IDX_audit_events_action`、`IDX_audit_events_decision`；既有 `decisionId`、`iModelId+actorUserId`、`createdAt` 索引保留。

**确定性旧行回填策略**（仅既有本地/测试行）：

1. `LOCK TABLE "audit_events" IN ACCESS EXCLUSIVE MODE`；
2. 按 `("createdAt" ASC, "id" ASC)` 取旧行（同毫秒以 id 决胜）；
3. `seq` 从 1 连续编号；`prevHash` 为首行 `NULL`、其余为上一行 `entryHash`；
4. 用与运行期同一冻结 v1 helper 计算 `entryHash`；
5. 再设置 `NOT NULL`、加唯一/查询索引与触发器。

### 3.2 冻结的 v1 规范哈希

实现：`src/authz/domain/audit-chain.ts`。**一旦迁移在任何环境应用，此规范不可修改**；变更需 `audit-chain-v2.ts` + 新版本串 + 迁移，不得原地改 v1。

```
SHA-256(JSON.stringify([
  'audit.v1', seq, id, eventType, decisionId,
  actorUserId, actorService, iTwinId, iModelId, action,
  decision, reason, mode, tenantId, createdAtISO, prevHash
]))
```

- null 原样编码；`seq` 为十进制字符串；`createdAt` 为毫秒精度 ISO。
- 不含 token、SAS、email、IP、user-agent。
- 金标哈希固定在 `test/unit/authz/audit-chain.spec.ts`（`a6ce07be…`），helper 漂移会立即红灯。
- 旧行由 `now()` 产生微秒；哈希只覆盖毫秒，亚毫秒级改 `createdAt` 不可检测（X-26）。

### 3.3 事务化追加

`RelationalAuditEventRepository.append`：

1. `repository.manager.transaction` 开启事务；
2. `SELECT pg_advisory_xact_lock(hashtext('lubancad.audit_events.chain'), 1)` 串行化；
3. 读取尾行 `("seq"::text AS "seqValue", "entryHash") ORDER BY "audit_events"."seq" DESC LIMIT 1`；
4. 逐行生成 `seq`、`prevHash`、`entryHash`，同一 decision 批次共享 `createdAt`（同一 Date 实例既参与哈希也落库）；
5. 单次批量 `INSERT`；提交后锁释放；失败回滚、无空洞。

> **真实缺陷（e2e 捕获）**：尾行 SQL 初版为 `SELECT "seq"::text AS "seq" ... ORDER BY "seq"`；PostgreSQL 将 `ORDER BY "seq"` 解析为**文本输出别名**，`"9" > "10"`，导致第 11 行起永久读到 seq 9 并反复冲突。已改为 `AS "seqValue"` + 表限定 `ORDER BY "audit_events"."seq"`，并加单测锁定；12 路并发与重复运行均通过。该缺陷未进入文档/发布结论。

### 3.4 DB 强制 append-only（WORM 边界）

- 函数 `lubancad_audit_events_immutable()`：任何 `UPDATE`/`DELETE`/`TRUNCATE` 均 `RAISE EXCEPTION 'audit_events is append-only (G1 B7 WORM)'`。
- 触发器：`TR_audit_events_append_only`（BEFORE UPDATE OR DELETE，FOR EACH ROW）、`TR_audit_events_no_truncate`（BEFORE TRUNCATE，FOR EACH STATEMENT）。
- `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC`（应用角色只需 INSERT/SELECT）。
- **不宣称超出 DB 的能力**：表 owner/超级用户可显式 `DISABLE TRIGGER` / `DROP`；无异地不可变副本；无保留期/legal hold；链无法检测**删除最新行**（见 §3.6、§8）。若有权限者同时禁用触发器并重算后续整链，本地表无法自证被重写；必须依赖外部链头锚定/异地不可变副本（延期，X-26）。

### 3.5 查询/校验面（service-only）

| 路由 | 能力 | 认证 |
|---|---|---|
| `GET /internal/v1/authz/audit` | `actorUserId`、`iTwinId`、`iModelId`、`action`、`decision`、`from`、`to`、`limit`（1–200，默认 50）、`afterSeq` keyset | `OboEnabledGuard` + `AgentApiKeyGuard` + 固定 `X-Service-Name`（`OboServiceGuard`） |
| `GET /internal/v1/authz/audit/verify` | 全链重算；返回 `valid/checked/firstSeq/lastSeq/issues/issuesTruncated` | 同上 |

- 普通用户 JWT、无凭证、错误服务名均 401；路由在 `AUTH_OBO_ENABLED!=shadow` 时 404（与现有 internal authz 一致）。
- 响应只含既有审计字段；不含 token/SAS/email/IP；issues 上限 100，避免全表篡改造成大响应。
- 校验规则：seq 必须自 1 连续（缺行 `missingRow`）、不得重复/逆序（`outOfOrder`）、`prevHash` 必须链接上一行实际 `entryHash`、`entryHash` 重算必须一致、空哈希报 `unhashedRow`。
- **尾删不可由链自身检测**；响应暴露 `lastSeq` 供外部锚定（延期，见 X-26）。

### 3.6 decision 接线与 fail-closed

- `AuthzDecisionsService` 原有 `persistAudit` 调用不变；`record` 改为事务化链追加。
- 审计写失败仍抛 `authorization_unavailable` → 503；不返回未审计的 allow/deny。
- **不新增**：审计失败阻断高风险操作（本切片尚无高风险操作审计）；登录/权限/导出/直改/checkpoint 等入口不在链内。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| `imodelhub-services` | 新增仅内部 `internal/v1/authz/audit` 只读路由；公共 REST 不变 | 1 个 additive migration | 无 | 单测 + 隔离 relational e2e | 需随 Hub 正常发布；无 shared 变更 |
| `luban-cad/**` | 无 | 无 | 无 | 无 | 无 |
| `luban-backend/**` | 无（未改 MS/worker） | 无 | 无 | 无 | 无 |
| 公共仓 | 仅本 AIRR + X-26 + 索引 | 无 | 无 | 无 | 无 |

- 版本兼容：内部路由未进官方 client 契约；`INTERFACE-FREEZE-MATRIX` 无新公共条目。若后续 MS 消费查询/校验面，需登记内部接口与版本。
- 发布顺序：Hub migration 与 Hub 代码同批；旧代码不得在新 schema 上长期运行（§6）。

---

## 5. 安全/隐私/威胁分析

| 威胁 | 本切片状态 | 说明 |
|---|---|---|
| 应用层误改/误删审计 | **阻止** | 端口无 update/delete；DB 触发器拒绝 |
| DBA/owner 改行 | **检测/阻止（有限）** | 触发器默认拒绝；owner 可显式禁用/删除，需审计运维；无异地副本；owner 禁用触发器并重算整链无法本地自证 |
| 篡改字段/重排 seq | **检测** | 字段含在哈希中；`/verify` 报错 |
| 删除中间行 | **检测** | seq 空洞 + `prevHash` 断链 |
| 删除最新行 | **不可检测** | 需外部链头锚定/异地保留（延期） |
| 亚毫秒改 `createdAt` | **不可检测** | 哈希毫秒精度（延期） |
| 伪造/重放 token | 不在本切片 | 审计不存 token；鉴权沿用 B2/B3 |
| 普通用户读审计 | **阻止** | 只接受服务 API key + 固定服务名 |
| 共享 API key 旁路 | **仍存在** | B6 未完成（X-21/X-26） |
| 跨租户 | **未实现** | B10；`tenantId=NULL`（X-22） |
| PII 扩张 | **未发生** | 响应仅既有字段；测试扫描 token/SAS |

---

## 6. 迁移与回滚风险

1. **回填锁表**：`ALTER TABLE ... ADD COLUMN` + 显式 `ACCESS EXCLUSIVE` + 逐行 `UPDATE` 会在迁移期间阻塞审计写入。当前仅 P0 小表；生产大表须维护窗口/先在演练库计时。审计写被阻塞时 decision 会 fail closed（503）。
2. **代码/迁移同批**：旧代码 `insertMany` 不写 `seq/entryHash`，在新 schema 下会触发 `NOT NULL` 失败 → 审计 503。不得做“先迁移、旧代码长跑”的滚动发布；需同批发布或在窗口内接受 fail closed。
3. **Down fail-closed**：只要 `audit_events` 有任意行，down 直接 `RAISE EXCEPTION`，不会从非空日志删链列。移除证据需先导出/归档，并由安全 owner 批准显式禁用触发器、清空后再回滚。
4. **冻结哈希**：迁移与运行期共用 v1 helper；若后人修改 v1 规范，历史行会“变成篡改”。金标单测用于阻止误改；新规则必须新版本模块/迁移。
5. **回填确定性**：`createdAt` 相同则按 `id` 顺序；回填后链自洽。旧行 `createdAt` 的微秒部分不参与哈希（§3.2）。
6. **普通回滚（B7 v1 代码）**：关闭 `AUTH_OBO_ENABLED` 可停止新审计写入；schema 不回滚时旧表仍可读。数据保留按 append-only 处理，不做删行。

---

## 7. 测试证据（2026-11-24）

### 7.1 单元（Hub）

命令：`npx jest --config ./test/jest-unit.json --runInBand --coverage=false`

- **153 suites / 1418 tests 全绿**。
- 新增 B7 单测 4 个 suite / 37 用例：
  - `test/unit/authz/audit-chain.spec.ts`：金标哈希、确定性、首行 `prevHash=null`、篡改/缺行/乱序/重复、尾删边界、issue 上限、额外属性不入哈希。
  - `test/unit/authz/audit-event.repository.spec.ts`：advisory lock 先于尾读、seq/prevHash 链接、事务化并发串行、过滤/游标 SQL、token/SAS 不入实体、尾行排序不得使用文本别名。
  - `test/unit/authz/audit-events.service.spec.ts`：limit 上限/默认/绕过收敛、keyset 分页、时间倒置、分批 verify、篡改报告、空链有效。
  - `test/unit/authz/audit-chain-migration.spec.ts`：additive 列、回填确定性、触发器 SQL、down fail-closed、无 DELETE/DROP TABLE。

### 7.2 隔离 relational e2e（真实 Hub + 全新 Postgres；`-p tests`）

命令（栈内）：`npm run test:e2e -- --runInBand --watchAll=false --forceExit test/user/authz-audit-chain.e2e-spec.ts`

- **B7 spec 6/6 连续两次通过**（第二次在已有 >10 行链上重跑）：
  1. 12 路并发 decision：seq 连续、DB 全链校验有效、`/verify` `valid=true`；
  2. 用户 JWT/无凭证/错误服务名 401；
  3. 过滤（actor/iModel/action/decision/time）、`limit=1 + afterSeq` 分页、inverted range 400、limit=201 422、响应无 token；
  4. 真实 `UPDATE`/`DELETE`/`TRUNCATE` 均被触发器拒绝，行数不变；
  5. 禁用触发器→篡改→`/verify` 报 `entryHashMismatch`→恢复→转绿（仅隔离测试库，finally 强制恢复触发器）；
  6. scratch 数据库上 B2 迁移→旧行回填→链校验→触发器负例→down fail-closed→导出/清空后 down 成功、列/函数移除。
- **既有 B2/B3 shadow e2e 16/16 通过**（`test/user/authz-obo-shadow.e2e-spec.ts`），证明链迁移未破坏原 decision/audit 行为。
- 测试栈已 `down -v` 清理；未执行真实生产栈/DB。

### 7.3 e2e 发现并修复的真实缺陷

首次重复运行在 seq 10 之后失败：所有并发请求读到 seq 9 并反复 `UQ_audit_events_seq` 冲突。根因是尾行查询的 `ORDER BY "seq"` 被 PostgreSQL 解析为文本输出别名（字典序 "9" > "10"）。修复为 `AS "seqValue"` + `ORDER BY "audit_events"."seq"`，并增加单测与 12 路并发/重复运行证据。未放宽任何断言，未跳过失败。

### 7.4 静态检查

- `npx tsc --noEmit`：exit 0。
- `npx eslint "{src,apps,libs,test}/**/*.ts"`：**0 errors**，88 warnings（均为既有 `no-explicit-any` 基线，无新增 error）。

---

## 8. 延期项与 B7 剩余（不得写成完成）

| 项 | 状态 | 后续 |
|---|---|---|
| 高风险操作审计 + 审计失败阻断 | **未做** | B7 enforcement：建立高风险操作清单（登录/撤权/权限变更/导出/直改/FeatureOp/push/checkpoint/SAS/webhook 等），接同一 append，定义 fail-closed 阻断与 HITL（X-26） |
| 异地不可变 WORM/对象锁/保留期/legal hold | **未做** | 生产对象存储 immutable retention + 定期导出校验；保留/DSR 策略 |
| 链头外部锚定（尾删检测） | **未做** | 周期性签名头/外部账本锚定 `lastSeq+entryHash`；验收=删尾可检测 |
| 亚毫秒时间戳覆盖 | **未做** | 若需，新增 v2 规范（微秒文本）与迁移，不改 v1 |
| B6 服务身份 | **未做** | 查询/校验目前仍为共享 API key（X-21）；B6 后换 registered service/mTLS |
| B10 租户 | **未做** | `tenantId` 仍 NULL；无 RLS/跨租户负例（X-22） |
| 查询 UI/导出/审计运营 | **未做** | 本切片仅内部只读 API |
| 规模/性能 | **未做** | 当前 advisory lock 串行化审计写；未做高吞吐基准/异步批写 |

**明确不宣称**：B7 完成、WORM 全量、合规审计、G1 Gate 通过、B6/B10 完成、高风险操作被阻断。

---

## 9. 回滚与发布

- **代码回滚**：`AUTH_OBO_ENABLED=off` 停止内部 authz 路由与 shadow decision；审计历史保留（append-only）。
- **schema 回滚**：仅在 `audit_events` 清空（导出/归档 + 安全 owner 批准禁用触发器）后执行 `migration:revert`；非空时 down 必失败。
- **发布**：Hub migration + 代码同批；不涉及 shared/web/MS/native 产物；无需重建前端镜像。
- 不做数据修复/删行；不恢复已撤销凭据。

---

## 10. 评审结论

- 复用矩阵：完成（复用既有审计表/服务/守卫/触发器模式，无新依赖）。
- 跨仓影响：仅私有 Hub + 公共文档；公共契约未变。
- P0 例外：**X-26 已登记**（高风险操作未审计/未阻断 + WORM/异地/保留限制）。
- ADR：本切片不需要；B7 enforcement/保留/异地 WORM 需要后续 AIRR/ADR。
- Gate：**未勾选任何 G1 Gate 项**；B7 v1 只是可验证的 append-only/哈希链基础。

*证据边界：本 AIRR 的所有“通过”仅限上述单元 + 隔离 relational e2e；不代表生产部署、真实保留策略或合规结论。*
