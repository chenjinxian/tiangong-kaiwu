# G0 Gate 评估报告（2026-11-24）

> 状态：**正式 Gate 结论 NO-GO；按 owner directive 允许 G1 条件推进（CONDITIONAL GO for G1 work packages）**。
> 本报告不是签字记录，不替代 ARB/owner 裁决。证据截止 2026-11-24。
> 关联：`G0-EXECUTION-PLAN.md`、`G0-DECISION-REGISTER.md`、`G0-SPIKE-REGISTER.md`、
> `INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`、20 份 `ADR-G0-*.md`。
> 团队执行方案见 [`TEAM-EXECUTION-PLAN-2026-11-25.md`](./TEAM-EXECUTION-PLAN-2026-11-25.md)；
> 该方案不改变本报告的 NO-GO / CONDITIONAL GO 结论。

---

## 0. 结论

1. **G0 正式 Gate：NO-GO**。16/16 决策未签字；20 份 ADR 全部 Proposed；16 个 Spike
   只有 S0-4 有真栈 PASS，S0-2 部分，S0-5/S0-13 fail-closed，S0-12 blocked，其余
   未跑/单元级；法律 stop-ship 未解。2026-11-24 追加的隔离真栈负例（§8）不改变
   任何 Gate 结论：S0-3 仍为 PARTIAL（API fail-closed，DB 边界仍有缺口），
   S0-5/S0-13 仍为 fail-closed，S0-16 仍未跑。
2. **G1 条件推进**：在 owner 已下达“架构优先、暂停铺功能”的指令下，G1 的会话、身份、
   账本工作可以继续，但必须满足本报告 §5 的条件，且任何强制保持默认 off。
3. **G2/G3 不得启动/冻结**：G2 契约冻结和 G3 生产化必须等 G1 Gate；当前不得宣称
   多用户、生产、DR、SLA 或 Onshape 全量。
4. **本报告的用途**：把“未签字的 16 项决策 + 20 份 ADR + 16 个 Spike”变成可评审的
   条件化决策包；由 owner/ARB 完成 Accept/Conditional/Defer 后，再重签 G0。

---

## 1. Gate 检查表（按 G0 计划）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 09/10 目标架构与计划批准 | **FAIL** | 仍为 Proposed；无 ARB 签字 |
| 16 项决策有记录/备选/失败判据 | **PARTIAL** | 16 项均有记录，但 0 签字；14 项需条件化 |
| 16 个 Spike 有结论 | **FAIL** | 1 PASS、2 PARTIAL、2 FAIL/fail-closed、1 BLOCKED、10 NOT RUN/DEFERRED |
| 单行道登记零未决或明确负责人 | **FAIL** | tenant/kernel/fork/DR/attribution 等仍有未决/条件 |
| ACIS/libslvs/STEP 许可书面结论 | **FAIL** | 无书面法律结论；外部分发 stop-ship |
| 20 个 ADR | **PARTIAL** | 20 份文件均存在，但全部 Proposed，无签字 |
| 证据可复现/脱敏 | **PARTIAL** | 部分 canary/单测有；Spike 登记册仍陈旧 |
| 未在 G0 前写功能代码 | **FAIL（已发生的偏差）** | G1 代码在 G0 GO 前已实施；本报告要求 owner 明确追认/条件接受 |

**裁决**：G0 不能以 PASS 结论进入 G1；只能按 **CONDITIONAL GO** 继续受限的 G1 工作。

---

## 2. 决策状态（D0-1..D0-16）

> 状态均为 **Proposed under owner directive 2026-11-24; not ARB-signed**。
> “建议”是本文的评审建议，不是已签字裁决。

| ID | 建议裁决 | 条件/阻塞 | ADR |
|---|---|---|---|
| D0-1 产品范围 | Conditional | 近期 Part Studio+基础 PDM；G4/G5 分开；功能冻结至 G1/G2 | 01 |
| D0-2 部署/租户 | Conditional | 单租户先；tenantId/RLS 预留；B10 前不得称多租户 | 02 |
| D0-3 协同 | Conditional | 单写者/异步多 briefcase；实时另立 ADR；S0-1 双用户证据前不称多用户 | 03 |
| D0-4 账本/版本 | Conditional | D1/D2/D5/D6a 有基础；D3/D6/D7/D8 未闭环；checkpoint flag OFF | 04 |
| D0-5 几何持久化 | Conditional | ACIS SAB 生产；format/kernel tag 未实现；TrueForm M1 未启动 | 05 |
| D0-6 渲染 | Accept（建议） | iTwin 唯一交互；PBR/离线另立 ADR；DanQing 未接入 | 06 |
| D0-7 导入导出 | Conditional | mesh/DXF 先；STEP/IGES/Parasolid/InterOp 无书面许可，stop-ship | 07 |
| D0-8 装配/工程图 | Defer | 实例/只读显示先；Mate/HLR/PDM 后置独立域 | 08 |
| D0-9 进程模型 | Conditional | 单 MS 进程 + owner-scoped；process-per-doc 作为 HA 目标；S0-1 未跑 | 09 |
| D0-10 Undo | Conditional | 操作组统一；X-05/X-15 未解；真实 undo 测试未跑 | 10 |
| D0-11 变量/配置 | Conditional | 文档级目标；当前 per-PS 为过渡；config 层未实现 | 11 |
| D0-12 市场/合规 | Conditional/Defer | 无数据驻留/出口/许可书面结论前不收集生产客户数据 | 12 |
| D0-13 持久化 ack | Conditional | local-saved vs cloud-persisted vs checkpoint；ADR-0017 冲突需裁决；S0-16 未跑 | 13 |
| D0-14 灾备 | Conditional | HA+PITR+对象版本化；RPO≤5m/RTO≤1h；S0-15 未跑 | 14 |
| D0-15 迁移 | Conditional | schema/params/native 版本化；旧 fixture/dry-run/rollback 未实现 | 15 |
| D0-16 身份归因 | Conditional | OBO 方向已定；push/changeset 仍服务账号；B2.2/B6/X-21 未闭环 | 16 |

**需要 owner/ARB 明确处理的冲突**：

1. D0-13 要求“未推送”UI；ADR-0017 移除了 save/push/unpushed UI，X-15 记录 undo 副作用。
2. D0-9 写 per-document actor；会话设计建议先 in-process owner-scoped，process actor 作为
   HA 目标；需明确 G1 的实现口径。
3. D0-4 写“真实 checkpoint 绑定/Duplicate/Fork with history”；当前 D3 为 409/501 桩，
   checkpoint flag OFF，Named Version 未绑定真实 checkpoint。
4. D0-16 写真实用户归因；当前 push 仍服务账号，changeset `creatorId` 为空。
5. D0-2/D0-5 写 tenantId/format tag；当前 tenantId 为 NULL 占位，BRepData 无 tag。

---

## 3. Spike 结论

| ID | 结论 | 证据级别 | 最小下一步 |
|---|---|---|---|
| S0-1 双用户隔离 | PARTIAL | 单元/代码；无真实双用户部署 canary | 隔离栈两用户同文档，requestId/关闭/撤销 |
| S0-2 直改门禁 | PARTIAL | 真栈 deny；audit/lease/endEdits 未证 | 补 audit + lease + endEdits 断言 |
| S0-3 账本不可变/恢复 | PARTIAL | 隔离真栈 HTTP+DB 负例（§8）：API fail-closed；DB 触发器有可绕过缺口；进程 kill 后重试可恢复 | 补 DB 约束/4xx 映射/自动恢复 |
| S0-4 版本只读打开 | **PASS** | D5 真栈 canary：baseline/index/NV、几何/树、head 不变、写 403 | 证据索引；X-25 残余不关闭 |
| S0-5 checkpoint×fork | FAIL→fail-closed | 隔离真栈（§8）：无 checkpoint 422；baseline/mid-history 409；仅 head 可 clone/fork | D3 修复前不承诺 mid-history |
| S0-6 多输出/拓扑 | NOT RUN/DEFERRED | 无 harness；当前单输出 | G2 ADR/spike；不铺特征 |
| S0-7 occurrence transform | NOT RUN/DEFERRED | 无 occurrence 实现 | G2/G5 |
| S0-8 500-face pick | NOT RUN/DEFERRED | 逐面 RPC | G2 性能 spike |
| S0-9 BRep→tile | NOT RUN/DEFERRED | 生产 BRep→tile 无 native 测试 | G2/G5 |
| S0-10 HLR | NOT RUN/BLOCKED | 无 HLR 引擎 | Drawing 独立 ADR |
| S0-11 format/kernel tag | NOT RUN/DEFERRED | BRepData 无 tag；TrueForm M0 | G2/G5 前置 |
| S0-12 租户隔离 | BLOCKED | tenantId NULL，无 RLS | B10/G3 |
| S0-13 clone/fork 内容 | PARTIAL→fail-closed | 隔离真栈（§8）：head content-only clone/fork 201 且容器字节复制成功，但目标 changesets=0；preserveHistory 501 | D3 实现 history 复制 |
| S0-14 200/1000 冷开 | NOT RUN | 无生成器/报告 | 先做 harness；checkpoint flag 前置 |
| S0-15 DR 恢复 | NOT RUN | 手动 dump，非 PITR；无演练 | 隔离 drill；D0-14 条件 |
| S0-16 未推送边界 | NOT RUN | 无杀进程/删缓存实验；ADR-0017 | 先定 D0-13，再测 |

**不得标记 PASS**：S0-1、S0-3、S0-6..S0-16（除 S0-4 外）；S0-2 仅 deny 部分。

---

## 4. ADR 状态

20 份 ADR 均存在（`ADR-G0-01..20`），全部 **Proposed under owner directive；
not ARB-signed**。各 ADR 已明确：当前事实、决策、备选、后果、迁移/回滚、失败判据、
证据状态与未完成项。没有伪造签字/证据。

---

## 5. G1 条件推进（本报告的唯一放行口径）

在 G0 正式 NO-GO 的前提下，允许以下 G1 工作继续，条件是：

1. **只做架构/正确性/安全，不新增 Part Studio 功能**；G2 契约不得冻结。
2. 所有强制开关默认 off；隔离 canary 不得写成部署形态证据。
3. 优先顺序：B3.1f/g → B2.2/B6 P4b → B4/B7/B8/B10 决策 → D3/D6/D7/D8 →
   read purity → checkpoint 生产化 → 200/1000 → E1/E2/E8 → J2/J4。
4. 每项必须在同一 PR/Slice 更新 AIRR/ADR、测试、例外/台账，并有真栈或故障注入证据。
5. 每日/每周报告必须区分：代码存在、单元/fake-Hub、隔离真栈、部署形态、生产证据。
6. 在 G0 签字前，不得对外宣称 G0/G1 通过、生产可用、多用户、DR 达标、Onshape 全量。

**G1 的 15 项验收**仍按 `G1-EXECUTION-PLAN.md` §7 执行；当前 0/15，不以条件放行代替。

---

## 6. 5 天收口建议

| 日 | 动作 | 产出 |
|---|---|---|
| D1 | ARB 逐项裁决 16 决策；登记 Accept/Conditional/Defer；法务请求 L1–L3 | 决策登记册 v2 |
| D2 | 跑 S0-1/S0-3/S0-16/S0-2 audit；隔离栈；真实负例 | Spike 证据 |
| D3 | 确认 S0-5/S0-13 409/501；跑 S0-15 DR；S0-14 视生成器 | Spike 证据/延期 |
| D4 | 评审 20 份 ADR；解决 D0-9/D0-13/D0-16 冲突 | ADR v1 |
| D5 | G0 Gate 重签：GO/CONDITIONAL GO/NO-GO | Gate 报告 v2 |

---

## 7. Stop-ship 与不得宣称

- 未签字前：G0/G1 Gate 未通过；20 份 ADR 只是评审材料。
- 未部署前：B3.1c/d/e、B6、B7、B8 的默认 off 不能被写成生产强制。
- 未演练前：RPO/RTO、备份可恢复、DR 达标不可宣称。
- 未完成 B2.2 前：changeset/briefcase/OpLog/audit 真实用户归因不可宣称。
- 未完成 D3/D6/D7/D8 前：clone/fork/history、Named Version 真实 checkpoint、restore/compare 不可宣称。
- 未完成 G2 前：Feature Manifest/输出端口/DAG/拓扑/typed tab 可扩展性不可宣称。
- 未获书面法律结论前：ACIS 外部分发、STEP/IGES/Parasolid、on-prem libslvs 均 stop-ship。

---

## 8. 2026-11-24 隔离真栈复测（S0-3/S0-5/S0-13；不改变 Gate 结论）

> 结论先行：**G0 仍为 NO-GO；本轮不把任何 Spike 标为 PASS**。S0-3 仍为 PARTIAL
> （HTTP 面 fail-closed，但 DB 边界存在可绕过缺口）；S0-5 仍为 FAIL→fail-closed；
> S0-13 为 PARTIAL→fail-closed；S0-16 未跑。证据级别是“隔离真栈 +
> 真实 API 登录/iTwin/iModel/HTTP”，但 checkpoint 行与 Azurite 容器内容为手工
> 构造，**不是真实 checkpoint worker 产物**，不能据此宣称生产 clone/fork。

### 8.1 环境与命令（已脱敏，测试后已清理）

- Hub 源：私有仓 `imodelhub-services` **HEAD `8cb85ba61e243a3c41902e333f85ea24cdaadb81`**。
  工作树存在未提交 WIP 且当前不编译；本轮以 `git archive HEAD` 只读导出到临时目录
  构建，未修改、未检出、未提交原仓。
- 编排：relational test compose，项目名 `g0-spike`，fresh Postgres/Redis/Azurite，
  API 发布到 `127.0.0.1:4440`（容器内 4000），
  `CHANGESET_WAITING_FOR_FILE_TTL_MINUTES=2`（仅隔离栈覆盖，用于 TTL 重试）。
- 真实 API：`POST /auth/email/login`（test compose 种子管理员）、`POST /itwins`、
  `POST /imodels`、changesets create/upload/complete/PATCH/DELETE、clone/fork、
  checkpoint GET；Azurite 预签名直传。
- 关键命令（临时脚本/日志在收口时删除）：

```text
docker compose -p g0-spike --env-file <head>/env-example-relational \
  -f <head>/docker-compose.relational.test.yaml -f <temp>/g0-spike.override.yaml \
  up -d --build
docker run --rm --network g0-spike_default -v <temp>:/work -w /work \
  g0-spike-api:latest node /work/spike.mjs <phase>
docker kill g0-spike-api-1 && docker start g0-spike-api-1   # 进程级 crash
docker exec g0-spike-postgres-1 psql -U root -d api -c "<SQL 负例/手工 checkpoint>"
docker compose -p g0-spike ... down -v --rmi local          # 收口
```

- 环境隔离：独立 project/network/volumes/端口；未触碰 `tiangong-kaiwu-*` live
  stack、live DB 或 live Azurite。测试后 `down -v --rmi local`，临时脚本/日志删除。

### 8.2 S0-3 账本不可变/可恢复

| 用例 | 期望 | 实测 |
|---|---|---|
| changeset 创建（genesis，无 parent） | 201 | **201** |
| blob 未上传即 complete | 422 | **422** `UnprocessableEntity`（has no uploaded file） |
| blob 已上传、checksum 省略 complete | 2xx | **201**（Nest POST 默认；控制器注释写 200，属文档偏差） |
| 错误 checksum complete | 422 | **422** `UnprocessableEntity`（checksum does not match） |
| 重复创建已 sealed id | 409 | **409** `Conflict` |
| 第二 root / 无 parent（API） | 422 | **422** `UnprocessableEntity`（root already exists） |
| 不存在 parent | 422 | **422** `UnprocessableEntity` |
| PATCH `parentId` | 不产生历史改写 | **200 no-op**；DB/响应 parentId 不变（whitelist 静默丢弃未知字段） |
| PATCH `checksum`/`chainHash`/`prevHash` | 不产生历史改写 | **200 no-op**；checksum 不变 |
| PATCH `state` 回退 `waitingForFile` | 422 | **422** `UnprocessableEntity` |
| PATCH `briefcaseId` | 4xx | **500** `InternalServerError`，message `changeset history is append-only`（DB 触发器命中但未映射为 409/422；值未变） |
| API DELETE 中间 changeset | 409 | **409** `Conflict`（referenced by later history/NV/checkpoint） |
| API DELETE 叶子 changeset | 允许 | **204**；后续新建 index=4，软删 index=3 留下编号空洞 |
| create 后、complete 前 SIGKILL API | 重试可完成 | 行存活；重启后 complete **201**；重启耗时约 73s |
| 超 TTL（133s > 120s）后同 id 重试 create | 替换 abandoned 行 | create **201** 且 index 复用 2；upload **201**；complete **201**；列表 2 行、无幽灵行 |
| DB 直改 `parentId` / `prevHash` | 拒绝 | SQL `ERROR: changeset history is append-only`（exit 1） |
| DB 直删 sealed 中间/叶子行 | 拒绝 | SQL `ERROR: changeset history is append-only`（exit 1） |
| DB 单独改 `checksum` 或 `chainHash` | 读面发现 | UPDATE 允许；GET/list **409**（chainHashMismatch） |
| DB 协同改 `checksum`+`chainHash`（重新计算） | 应发现 | **未发现**；GET/list **200**（叶子） |
| DB 直接 INSERT 第二 root | 拒绝 | **允许**；`waitingForFile` 列表隐藏，改成 `fileUploaded` 后列表 **200** 且以 legacy 行返回（indexes 1,2,4；parentId 两个空） |
| DB 注入的 `fileUploaded` 行先改 state→`waitingForFile` 再 DELETE | 拒绝 | **UPDATE 1 + DELETE 1 成功**；触发器 DELETE 仅检查 `OLD.state` 与子行，真实 sealed 叶子按同一逻辑存在绕过（未单独实测） |
| 手工恢复 checksum/chainHash 后读 | 200 | **200**（仅测试操作员手工修复，不是产品自动恢复） |

**判定：S0-3 = PARTIAL，不得标 PASS。** HTTP 面在 append-only、根、挖洞、blob/checksum、
崩溃重试上均 fail-closed；但 DB 边界不完整：second-root INSERT 无约束；
`state` 未钉住，`fileUploaded` 行可先翻回 `waitingForFile` 再 DELETE（真实 sealed
叶子按同一触发器逻辑同险）；`checksum`/`chainHash` 可协同重写且读面接受；触发器错误
映射为 500；错误码被脱敏为泛化 `Conflict`。进程 kill 后重试可恢复，但篡改后只有
检测（409）与手工修复，**没有自动 clean recovery**。

### 8.3 S0-5 mid-history checkpoint × fork

| 场景 | 实测 |
|---|---|
| 无 successful checkpoint | clone **422**；fork content-only **422**；fork `preserveHistory=true` **501** |
| 仅 baseline checkpoint（index 0），head index 1 | clone **409**；fork **409**；显式 index 0/1 **409**；`preserveHistory=true` **501** |
| mid-history checkpoint（index 1），head index 3 | clone **409**；fork **409**；显式 mid index/id **409**；`preserveHistory=true` **501** |
| checkpoint 在 head（index 3） | clone **201**；fork content-only **201**；显式 stale index **422** |

**判定：S0-5 = FAIL→fail-closed，维持不变。** 非 head checkpoint 的 clone/fork 仍
不可用；`preserveHistory` 仍 501；没有 FK 崩溃，但“mid-history fork 可用”的假设不成立。

### 8.4 S0-13 clone/fork 内容

- head clone/fork 均 **201**；目标 iModel `state=initialized`、`baselineChangesetIndex=3`、
  `fileSize=4242`（手工 checkpoint 元数据）。
- 目标 changesets **0 条**（history 不复制）；目标 checkpoint index 3 存在，但其
  `changesetId` 仍是**源 iModel 的 D3 changeset id**（跨 iModel 引用），
  `directoryAccessInfo.baseDirectory` 已改写为目标 id。
- Azurite 容器复制**真实发生**：源/目标均含 `baseline.bim`（3B）与 `seed.bin`（26B），
  目标 `seed.bin` 内容与源一致（`g0-spike-source-content-v1`）。
- `fork preserveHistory=true` 始终 **501**；显式 stale changeset **422**。

**判定：S0-13 = PARTIAL→fail-closed，不得标 PASS。** 当前语义是“仅复制最新
checkpoint 容器”的 content-only duplicate，不是带 changeset history 的 clone/fork；
且本轮 checkpoint/容器为手工构造。在真实部署中若只有 baseline checkpoint，
head clone/fork 会被 409 拒绝，当前不可对外承诺“复制/分支”。

### 8.5 S0-16 未推送编辑边界

**未跑（NOT RUN）**。本轮范围是 Hub-only 隔离栈；没有启动隔离 modeling-server、
没有 briefcase 编辑/未 push 路径，因此 8.2 的 API 进程 kill 不能替代 S0-16，
也不能据此量化未推送编辑丢失或 UI 提示。仍需隔离 MS + briefcase 的 kill/删缓存实验。

### 8.6 本轮未改变与剩余

1. G0 仍为 NO-GO；16 项决策未签字、20 份 ADR 仍 Proposed；不得对外宣称 G0/G1 通过。
2. checkpoint 生成器仍默认 OFF，本轮 checkpoint 行/容器为手工构造；S0-4 的既有
   真栈证据不受本轮影响，但 clone/fork 不能借用手工证据升级为 PASS。
3. 需补的 D1/D2 余项：DB 层 second-root 约束、sealed 状态转换钉死、checksum/chainHash
   不可协同重写、触发器错误映射 409/422、错误码白名单保留
   `ChangesetIntegrityViolation`/`CheckpointAtHeadRequired`。
4. 需补的 D3 余项：changeset/history 复制、`preserveHistory`、checkpoint 与源
   changeset 的跨 iModel 引用设计、mid-history clone/fork。
5. 需补的恢复能力：tamper 后自动重建/隔离/审计，而非仅 409 + 手工 SQL 修复。
6. S0-16：隔离 MS/briefcase kill 实验；在 D0-13 裁决前不承诺未推送边界。
