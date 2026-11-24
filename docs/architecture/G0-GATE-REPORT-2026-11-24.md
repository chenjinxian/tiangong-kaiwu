# G0 Gate 评估报告（2026-11-24）

> 状态：**正式 Gate 结论 NO-GO；按 owner directive 允许 G1 条件推进（CONDITIONAL GO for G1 work packages）**。
> 本报告不是签字记录，不替代 ARB/owner 裁决。证据截止 2026-11-24。
> 关联：`G0-EXECUTION-PLAN.md`、`G0-DECISION-REGISTER.md`、`G0-SPIKE-REGISTER.md`、
> `INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`、20 份 `ADR-G0-*.md`。

---

## 0. 结论

1. **G0 正式 Gate：NO-GO**。16/16 决策未签字；20 份 ADR 全部 Proposed；16 个 Spike
   只有 S0-4 有真栈 PASS，S0-2 部分，S0-5/S0-13 fail-closed，S0-12 blocked，其余
   未跑/单元级；法律 stop-ship 未解。
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
| S0-3 账本不可变/恢复 | PARTIAL | 单元；无真实 HTTP/DB 崩溃注入 | 隔离 Hub 负例 + process-kill 重试 |
| S0-4 版本只读打开 | **PASS** | D5 真栈 canary：baseline/index/NV、几何/树、head 不变、写 403 | 证据索引；X-25 残余不关闭 |
| S0-5 checkpoint×fork | FAIL→fail-closed | 非 head 409/history 501；无真栈 | 确认 409/501；D3 修复前不承诺 |
| S0-6 多输出/拓扑 | NOT RUN/DEFERRED | 无 harness；当前单输出 | G2 ADR/spike；不铺特征 |
| S0-7 occurrence transform | NOT RUN/DEFERRED | 无 occurrence 实现 | G2/G5 |
| S0-8 500-face pick | NOT RUN/DEFERRED | 逐面 RPC | G2 性能 spike |
| S0-9 BRep→tile | NOT RUN/DEFERRED | 生产 BRep→tile 无 native 测试 | G2/G5 |
| S0-10 HLR | NOT RUN/BLOCKED | 无 HLR 引擎 | Drawing 独立 ADR |
| S0-11 format/kernel tag | NOT RUN/DEFERRED | BRepData 无 tag；TrueForm M0 | G2/G5 前置 |
| S0-12 租户隔离 | BLOCKED | tenantId NULL，无 RLS | B10/G3 |
| S0-13 clone/fork 内容 | FAIL→fail-closed | 仅 head checkpoint；history 501；Duplicate 未实现 | D3 修复 |
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
