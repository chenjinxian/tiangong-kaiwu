# G0 执行计划：架构冻结第 0 阶段

> 状态：**Ready for ARB**（2026-11-22）
> 输入：`docs/research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`、`docs/DEVELOPMENT-RULES.md`、`docs/architecture/EXCEPTIONS.md`
> 输出：16 项决策记录、16 个 Spike 结论、20 个 ADR 草案/批准、G1 backlog、G0 Gate 报告
> 本阶段**不写功能代码、不改 schema/native、不发布**；只做决策、验证、冻结。

## 0. 目的与边界

**目的**：在铺开 Part Studio 功能之前，把所有已知单行道变成有证据的决策，避免后期在单输出、单文档、单 briefcase、可改写账本、无灾备、不可复现发布上返工。

**本阶段必须回答**：

- 产品/部署/协同/版本/内核/渲染/导入导出的边界是什么？
- 会话、身份、账本、版本、灾备、迁移、持久化语义是否按目标架构成立？
- 哪些能力现在不能做、必须 blocked 或延后？
- G1 的平台正确性工作包能否直接分派？

**本阶段禁止**：

- 新增 FeatureType、草图工具、UI 波次、schema 字段、native op。
- 对外分享、多人协作、版本发布、生产 SLA 承诺。
- 用 jsdom-only、mock 或单机演示替代真栈/故障注入证据。
- 把私有源码、密钥、native 证据写入公开仓。

## 1. 角色与节奏

| 角色 | 职责 |
|---|---|
| Architecture Owner | 主持 ARB；维护决策台账、单行道登记、G0 Gate 报告 |
| Security Owner | 身份/ACL/会话/密钥/威胁模型；B 工作流 |
| Session Owner | IPC/briefcase/Editor/undo/进程模型；C 工作流 |
| Data Owner | 账本/checkpoint/版本/迁移/DR；D/E 工作流 |
| Feature Platform Owner | Manifest/输出/拓扑/图执行器；F 工作流 |
| Frontend Owner | Workspace/Tab/Selection/Command/Form；G 工作流 |
| Kernel Owner | 几何/拓扑/facet/tile/格式；H 工作流 |
| SRE/QA Owner | CI/发布/观测/负载/故障注入；J 工作流 |
| Product/Legal | 范围/许可/数据驻留/合规裁决 |

**节奏**：

- 每日 15 分钟站会：昨天结论、今天 Spike、阻塞/需要裁决。
- 每个决策/Spike 当天更新台账，不把证据留到周末补。
- 第 5 天、第 10 天各一次 ARB 评审；第 10 天 G0 Gate。
- 任一 Spike 失败，当天登记失败动作；不得用“继续观察”代替结论。

## 2. 产物与模板

### 2.1 决策记录（Decision Record）

每个 D0 项必须有：

```text
ID / 问题
选项 A/B/C（含不做的后果）
建议 + 理由
裁决人 / 日期 / 状态（Proposed/Accepted/Rejected/Deferred）
影响的工作流与契约
失败判据 / 回滚方式
关联 ADR / Spike 证据
```

### 2.2 Spike 记录（Spike Report）

每个 S0 项必须有：

```text
ID / 假设
环境（commit/tag、数据库快照、是否隔离环境）
复现步骤 / 命令（可复制）
观测结果（日志、截图、计时、错误码）
结论：PASS / FAIL / STOP
失败动作（改方案/后置/接受边界）
关联决策 / ADR
证据存放位置（公开/私有，已脱敏）
```

### 2.3 证据规则

- 结论必须能由第二个人按步骤复现；命令、版本、输入数据齐全。
- 私有证据只放私有仓或受控目录；公开文档只放脱敏结论。
- 性能数字必须给出环境、样本量、p50/p95、是否冷/热。
- 失败也是产物：明确记录“当前不可行/需要改架构”，禁止伪造通过。

## 3. 两周日历（相对 T0，可按实际开工日顺延）

| 日 | 决策轨道 | Spike 轨道 | 当日产出 |
|---|---|---|---|
| D1 | 启动会；确认范围/角色/证据模板；宣布冻结期 | 建立隔离测试环境与基线快照 | G0 章程、owner 表、环境清单 |
| D2 | D0-1/D0-2/D0-3 初稿 | 准备 S0-1/S0-2/S0-12 环境 | 3 份决策草案；Spike 环境就绪 |
| D3 | D0-4/D0-5/D0-6 初稿 | 跑 S0-1/S0-2/S0-12；启动 S0-3/S0-13 | 会话/ACL/租户/账本首批证据 |
| D4 | D0-7/D0-8/D0-9 初稿 | 跑 S0-3/S0-13/S0-14/S0-16 | 账本/克隆/冷开/持久化证据 |
| D5 | D0-10/D0-11/D0-12 初稿；周评审 | 跑 S0-4/S0-5；补跑失败项 | 第一周报告；红项清单 |
| D6 | D0-13/D0-14/D0-15 初稿 | 跑 S0-6/S0-7/S0-8 | 特征输出/拓扑/实例/拾取证据 |
| D7 | D0-16 初稿；支撑 ADR 分工 | 跑 S0-9/S0-10/S0-11 | tile/HLR/format 证据 |
| D8 | 决策统一评审；冲突裁决 | 跑 S0-15；补齐失败/环境问题 | 决策台账 v1；DR 证据 |
| D9 | ADR 草案评审；G1 backlog 拆分 | 复跑关键 Spike；整理证据索引 | G1 backlog v1；Spike 报告 v1 |
| D10 | **G0 Gate** | 未过项明确“停止/改方案/后置” | G0 Gate 报告；G1 启动许可 |

> 说明：S0-15（DR 演练）需要提前准备备份/恢复环境；若环境未就绪，G0 不得以“未验证”通过，只能登记为 blocking 并推迟 G1 生产化门。

## 4. 16 项决策

> 推荐值不是自动裁决；需 owner/ARB 明确接受或修改。每项必须有 ADR 或决策记录。

| ID | 决策问题 | 选项 | 建议默认 | 主责 | 阻塞 |
|---|---|---|---|---|---|
| D0-1 | 产品范围：Part Studio / 主要功能 / 全量 Onshape | 分期 | 近期 Part Studio+基础 PDM；架构按全量预留 | Product | G4/G5 范围 |
| D0-2 | 部署/租户：单租户私有 / 多租户 SaaS | 分期 | 单租户先上线，`tenantId` 架构预留 | Product/Arch | B10/G3 |
| D0-3 | 协同模型：单写者 / 异步多 briefcase / 实时 | 分期 | 异步多 briefcase 先；实时独立 ADR | Product/Session | C/I |
| D0-4 | 账本/版本/分支：线性 / 版本图 / fork 语义 | 冻结 | 不可变账本 + 真实 checkpoint；Duplicate 与 Fork with history 双语义；分支后置 | Data | D1–D8 |
| D0-5 | 几何持久化：ACIS SAB / TrueForm | 双轨 | BRepData 加 format/kernel 标签；TrueForm 长期，M1 前完成 SAB 兼容决策 | Kernel | H10/L4 |
| D0-6 | 渲染：iTwin / PBR / DanQing / 离线 | 分层 | iTwin 唯一交互；PBR/离线独立 ADR | Frontend | K8 |
| D0-7 | 导入导出：mesh / DXF / STEP | 许可优先 | mesh/DXF 先；STEP/IGES/Parasolid 先许可裁决，不承诺 | Product/Legal | K6/L3 |
| D0-8 | 装配/工程图：实例 / Mate / HLR | 分期 | 实例/只读显示先；Mate/HLR 后置 | Product/Arch | K1–K5 |
| D0-9 | 进程模型：单进程多会话 / per-session / per-doc actor | 隔离优先 | per-document actor；先证明 IPC/Editor/briefcase 隔离 | Session | C4/J8 |
| D0-10 | Undo 粒度：文档 / 页签 / 操作组 | 统一 | 操作组；FeatureOp/原生/直改统一语义 | Frontend/Session | I2/F7 |
| D0-11 | 变量/配置作用域：per-PS / 文档 / 配置 | 预留 | 文档级变量 + config 层预留 | Feature | F9 |
| D0-12 | 目标市场/合规：中国 / 全球 / 私有化 | 先明确 | 先明确数据驻留/许可/出口，再收客户数据 | Product/Legal | L5/L6 |
| D0-13 | 持久化 ack：本地 commit / hub push / checkpoint | 明确 | RPC ok=本地已保存；push ack=云端持久化；UI 明示未推送窗口 | Data/Frontend | D/E7 |
| D0-14 | 灾备等级：单卷 / HA+PITR / 跨区 | 生产最低 | HA+PITR+对象版本化；RPO≤5m、RTO≤1h | Data/SRE | E1–E3 |
| D0-15 | 迁移契约：additive / 版本化+fixture+回滚 | 强制 | schema/params/native 全部版本化；旧 `.bim` fixture；dry-run/rollback | Data/Kernel | E4/E5 |
| D0-16 | 身份归因：服务账号 / on-behalf-of | 强制 | 用户路径 on-behalf-of；changeset/briefcase/OpLog/audit 记录真实 user | Security | B2/B3/D10 |

**裁决提示**：

- 任何“暂不决定”必须写明“阻塞哪些工作包、最晚何时决定、失败动作”；不能留空。
- 若 owner 选择与建议不同，必须在 ADR 记录失败判据和回滚方式。

## 5. 16 个 Spike

> 全部在隔离环境执行；破坏性实验使用可丢弃 iModel/数据库快照。涉及备份/恢复的 S0-15 必须先确认不会影响共享环境。

| ID | 问题/假设 | 方法（最小实验） | 通过判据 | 失败动作 | 主责 | 时限 |
|---|---|---|---|---|---|---|
| S0-1 | 双用户双连接能否隔离 | 两个独立浏览器/上下文打开同一文档；一个只读、一个编辑；抓 IPC 响应/requestId/关闭事件 | 不互踢、不串响应、只读独立；无跨用户命令接管 | 改 IPC 路由/briefcase/进程模型 | Session | 1d |
| S0-2 | 直改是否受同一门禁 | 用户 B 对 A 的 iModel 发起直改；检查租约/ACL/OpLog/审计 | 越权直改 403；直改有租约/审计；无静默写 | 封直改入口或改 Editor | Security | 1d |
| S0-3 | 账本是否可不可变/可恢复 | PATCH parentId、无父第二根、DELETE 中间 changeset、complete 无 blob、create→complete 崩溃重试 | 非法操作 400/409/422；崩溃后重试 push 成功；无幽灵行 | 先冻结账本，再 checkpoint | Data | 2d |
| S0-4 | 版本能否只读打开 | 手工造 index>0 successful checkpoint；按 version/changeset 只读打开 | 打开成功、几何/树符合该版本；不污染 head | 补 openCheckpoint/version 参数 | Data | 1d |
| S0-5 | mid-history checkpoint 后 fork 是否可用 | 在 S0-4 数据上 clone/fork；观察 FK/事务 | 不 FK 失败；目标内容/历史符合语义 | 重设计 fork/checkpoint 外键 | Data | 1d |
| S0-6 | 多输出/拓扑能否被下游消费 | 合成 split 双侧/多目标输出；下游特征引用；拓扑带 body/scope | 下游正确消费；插入/删除不静默错命中 | 冻结输出/拓扑契约后再铺特征 | Feature | 2d |
| S0-7 | occurrence transform 是否正确 | GeometryPart + placement 两实例；拾取/质量属性/坐标 | 实例坐标、拾取、质量属性正确 | 修 native/DTO transform | Kernel | 1d |
| S0-8 | 批量 pick/topology 预算 | 500 面模型 hover/选择/拓扑快照；记录 IPC/延迟 | 目标预算内；无逐面 IPC 风暴 | 接受元素级边界或先做批量服务 | Frontend/Kernel | 1d |
| S0-9 | BRep→tile 内容是否正确 | 真 BRep 几何流生成 tile；像素/几何对照 | tile 内容与 BRep 一致；无桩替代 | 补测试/修 facet 路由 | Kernel | 1d |
| S0-10 | HLR 能否生成 | 单 body 正交视图；可见/隐藏线 | 可生成可见/隐藏线；失败可诊断 | 工程图后置或引入 HLR 引擎 | Kernel | 1d |
| S0-11 | format/kernel 标签兼容 | 给旧 iModel 加标签；冷开/重建 | 旧库仍可读；标签可诊断混合后端 | 暂不启动 TrueForm M1 | Kernel | 1d |
| S0-12 | 租户隔离是否成立 | 租户 A/B 资源、对象前缀、查询、负例 | A 不能访问 B 任何资源；无跨租户枚举 | 先做 tenantId/RLS/前缀 | Security | 1d |
| S0-13 | clone/fork 是否复制内容 | 建文档+加特征+push；clone；对比几何/特征数 | 内容与源一致；不是空 baseline | 停止“复制/分支”对外承诺，修 fork | Data | 1d |
| S0-14 | 冷开基线 | 造 200/1000 changeset；测下载/apply/打开 p50/p95 | 有可复现报告；瓶颈可归因 | checkpoint worker 提前为 P0 | Data/SRE | 2d |
| S0-15 | DR 是否可恢复 | 备份 Postgres+对象存储；在隔离环境恢复；打开 3 个文档（含 100 changeset） | 恢复成功；RPO≤5m/RTO≤1h 有实测或明确差距 | 停止“数据可靠/可恢复”承诺 | SRE/Data | 2d |
| S0-16 | 未推送编辑边界 | 编辑不 push；杀 MS/删 briefcase；再开 | 丢失范围可量化；UI 明示未保存 | 先定 D0-13，改 outbox/ack | Data/Frontend | 1d |

**Spike 失败处理**：

- FAIL：记录失败条件与最小修复方案，进入 G1 backlog；对应决策标为“有条件接受”。
- STOP：当前路线不可行，必须换方案；在 G0 Gate 前给出替代方案与影响。
- 不允许把 FAIL 改写成 PASS；不允许只跑一次就宣称稳定。

## 6. 20 个 ADR

> G0 必须完成决策记录；ADR 可在 G0/G1 分阶段批准，但每项必须有 owner、备选、失败判据、回滚方式。

| ADR | 主题 | 对应决策 |
|---|---|---|
| ADR-G0-01 | 产品范围与分期边界 | D0-1 |
| ADR-G0-02 | 部署形态与租户键 | D0-2 |
| ADR-G0-03 | 协同模型与目标（单写/异步/实时） | D0-3 |
| ADR-G0-04 | 不可变账本、版本、fork/branch 语义 | D0-4 |
| ADR-G0-05 | 几何持久化与 TrueForm 切换门禁 | D0-5 |
| ADR-G0-06 | 渲染边界（iTwin/PBR/DanQing/离线） | D0-6 |
| ADR-G0-07 | 导入导出与许可边界 | D0-7 |
| ADR-G0-08 | 装配/工程图/PDM 边界 | D0-8 |
| ADR-G0-09 | 会话/进程/briefcase/Editor 隔离 | D0-9 |
| ADR-G0-10 | Undo 粒度与操作组 | D0-10 |
| ADR-G0-11 | 变量/配置作用域 | D0-11 |
| ADR-G0-12 | 目标市场、数据驻留、出口 | D0-12 |
| ADR-G0-13 | 持久化 ack 与未保存窗口 | D0-13 |
| ADR-G0-14 | 灾备等级、RPO/RTO、恢复顺序 | D0-14 |
| ADR-G0-15 | schema/params/native 迁移契约 | D0-15 |
| ADR-G0-16 | 身份归因与 on-behalf-of | D0-16 |
| ADR-G0-17 | 数据平台/对象存储/队列支撑 | 支撑决策 |
| ADR-G0-18 | 可观测/发布/回滚支撑 | 支撑决策 |
| ADR-G0-19 | 供应链/SBOM/许可门 | 支撑决策 |
| ADR-G0-20 | 租户/合规/审计证据 | 支撑决策 |

## 7. G1 初始 backlog（G0 后立即启动）

> 目标：G1 平台正确性；6–10 周指示性。G1 期间不对外分享/多用户生产。

### Sprint 1（第 1–2 周）

| 工作包 | 交付 | 验收 |
|---|---|---|
| C1 per-session IPC 路由 | 连接隔离、requestId 域 | 双连接无串响应 |
| C2 per-session briefcase | 文件/key 隔离 | 双用户同文档互不关闭 |
| C3 Editor/undo 所有权 | 会话级命令/undo | 直改/undo 不串用户 |
| B1/B2 身份骨架 | IdP/on-behalf-of 设计+最小实现 | 用户路径无服务账号直通 |
| B3 per-doc ACL 骨架 | PDP/PEP 入口清单 | 负例 403 |
| D1 账本不可变 | PATCH/DELETE/complete/列表治理 | 负例全拒，哈希校验 |
| D2 悬挂恢复 | waitingForFile 清理/重用 | 崩溃注入后 push 成功 |
| J1 interface-freeze | 冻结门修复+CI | 红门禁阻断合并 |

### Sprint 2（第 3–4 周）

| 工作包 | 交付 | 验收 |
|---|---|---|
| D3 fork 语义 | Duplicate/Fork with history | clone 内容正确；无 FK 失败 |
| D4 checkpoint worker | 每 N/Version 生成 | 200/1000 冷开基线 |
| D5 version read-only | openCheckpoint/version 参数 | 按版本打开正确 |
| B5 token 生命周期 | jti/撤销/WS 复验 | 登出/撤权后 403 |
| B6 secrets/KMS 基线 | 移除默认密钥/TLS 基线 | 扫描无泄露 |
| B7 审计 v1 | append-only 审计 | 按 user/doc/time 可查 |
| C5 外部 lease/fencing | 多实例租约 | 双实例不双写 |
| E1/E2 DR 基线 | PITR+对象版本化 | 恢复演练通过 |

### Sprint 3（第 5–8 周）

| 工作包 | 交付 | 验收 |
|---|---|---|
| D6 Named Version 真快照 | 绑真实 checkpoint | 打开/不可变/删除保护 |
| D7 restore/compare | 服务+API | 恢复为新 head；diff 正确 |
| B4 groups/shares 执行 | 权限合并/撤销 | 组/链接/撤销负例 |
| B8 网络/限流/WAF | TLS/代理/端口收敛 | 端口最小化；per-user 限流 |
| B10 租户隔离 | tenantId/RLS/前缀/配额 | 跨租户负例 |
| E3/E4/E5 迁移/DR | 旧 fixture/迁移 CLI/恢复手册 | 旧库可读；dry-run/rollback |
| C7 会话恢复 | 从 checkpoint 水化 | 崩溃/重启可恢复 |
| J2/J3 发布基线 | 可复现构建/manifest | digest 可对账；无 latest |

## 8. G0 Gate 验收清单

- [ ] 16 项决策均有记录（Accepted/Rejected/Deferred），无未登记单行道。
- [ ] 16 个 Spike 均有结论与证据；失败项有停止/改方案。
- [ ] 20 个 ADR 有 owner/状态；至少 16 个与决策相关 ADR 进入评审。
- [ ] 09/10/G0 计划获 ARB 批准。
- [ ] stop-ship 项全部关闭，或有 owner/截止日期/对外口径。
- [ ] G1 backlog 已拆分到工作包、owner、验收标准。
- [ ] 证据索引可复现；公开材料已脱敏。
- [ ] 未新增功能代码/schema/native 变更；未对外发布。

**Gate 结论只能是**：

- **GO**：进入 G1。
- **CONDITIONAL GO**：进入 G1，但列出 blocking 项与最晚关闭日。
- **NO-GO**：停止功能开发，先解决架构单行道。

## 9. 风险与升级

| 风险 | 触发 | 处理 |
|---|---|---|
| 决策悬空 | owner 不裁决/会议无结论 | 升级 ARB；默认建议不自动生效 |
| Spike 环境不可用 | 私有仓/依赖/备份环境缺失 | 当天升级 SRE；不得用 mock 替代真栈 |
| 证据不可复现 | 只截屏无命令/版本 | 退回重跑；不计入 Gate |
| 破坏性实验影响共享环境 | 误操作生产库/共享 hub | 立即停止，使用隔离环境；按 HITL/事故流程处理 |
| 范围膨胀 | G0 期间插入功能需求 | 记入 G4/G5 backlog，不在 G0 实现 |
| 许可/合规未决 | ACIS/libslvs/STEP/驻留 | 法务书面结论前不对外分发 |

## 10. 第一次 ARB 议程（60–90 分钟）

1. 确认 G0 范围与冻结期规则（10 min）。
2. 确认 16 项决策的建议值/需修改项（25 min）。
3. 分派 16 个 Spike owner 与环境（15 min）。
4. 确认证据模板/私有证据边界（10 min）。
5. 确认 G0 Gate 日期与升级路径（10 min）。
6. 行动项与下次评审（5 min）。

---

**关联文档**：`G0-DECISION-REGISTER.md`（逐项签字）、`G0-SPIKE-REGISTER.md`（执行/证据）、`G1-EXECUTION-PLAN.md`（G1 任务）、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md`（目标架构）、`../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md`（Gate/WBS）、`../DEVELOPMENT-RULES.md`（规则权威）、`EXCEPTIONS.md`（例外）。
