# 团队执行方案（2026-11-25）

> 状态：**现行执行方案（owner directive 2026-11-25）**。本文件规定团队分工、排期与协作方式；
> 不替代 G0/G1/G2/G3 验收，不记录进度流水账，不改变任何 Gate 结论。
>
> 现行事实（不得改写）：**G0 = NO-GO，G1 = 0/15**。以
> [`G0-GATE-REPORT-2026-11-24.md`](./G0-GATE-REPORT-2026-11-24.md) 与
> [`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`](./INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md)
> 为准。P2/P3 的预研、默认 off 切片、单机/假 Hub canary 均不构成 Gate 证据。
>
> 适用：自 2026-11-25 起，所有开发工作按本方案排期与分工。与
> [`DEVELOPMENT-RULES.md`](../DEVELOPMENT-RULES.md) 的 P0 规则或 Gate 证据冲突时，
> 以规则/Gate 为准。

---

## 0. 结论

1. **P1 全速**：负责整体技术架构与平台落地，立即开发，不等 P2/P3。
2. **P2/P3 预研先行**：两人为团队新成员，先用 4 周完成学习、技术路线与试点，再转正式开发。
3. **互不阻塞**：P2/P3 的预研使用现有 FeatureOp/RPC/parity harness 即可推进，不依赖 P1 的 G1/G2 完成。
4. **生产启用要评审**：P2/P3 的原型进入生产路径前，`shared`/schema/FeatureOp/native/安全变更必须过 P1 评审；这是评审门，不是阻塞依赖。
5. **Gate 不变**：本方案不改变 G0–G5 顺序，不把研究/试点/默认 off 切片算作 Gate 通过素材。

---

## 1. 团队与写域

> "完整实现"在本文的口径：P1 对架构落地负责，主写跨切面平台与契约，做最终评审和集成；
> P2/P3 实现各自轨道。P1 不是所有代码的唯一作者，否则会成为单点瓶颈。

| 角色 | 主写域 | 关键产出 | 硬边界 |
|---|---|---|---|
| **P1 架构/平台** | `packages/shared` 契约、schema/params、FeatureOp 契约、身份/ACL/审计/账本/会话、CI/发布、itwinjs-core 修改 | G1/G2 契约、manifest v0、AI envelope、release/CI | 不把 parity oracle 或安全/许可签字给自己；不替 P2/P3 做学习任务 |
| **P2 AI 建模** | MCP server、内嵌 agent harness、tool registry、AI eval、web AI 面板 | 只读 MCP、提案式 agent、HITL 写路径、AI 评测 | 不直连 DB/native；不建第二套建模/undo/selection API；不绕过 FeatureOp |
| **P3 Onshape/验证** | FeatureType evaluator/params、特征 UI、parity harness/oracle、示例、能力账本、BRepCore 审计 | 新特征、strict 示例、诚实能力账本、BRepCore 台账 | 不单方面改 `shared`/schema；不伪造 full；不实现被测功能（oracle 独立） |

**共享规则**：

- 任何 `shared`/schema/FeatureOp/native 改动走**契约变更板**，P1 批准；P2/P3 不直接改。
- **Manifest-first**：新特征、AI 工具都从 Feature Manifest 生成，不手写注册点/工具目录。
- 所有建模写操作只走 **FeatureOp / 标准工具生命周期**；AI 不例外。
- 每周一次契约同步，避免 P2/P3 猜契约、P1 天天救火。

---

## 2. 执行原则

1. **单一编辑管道（P0-05）**：参数化建模只走 `LubanFeatureRpcInterface` FeatureOp；直改只走 `EditTools.startCommand` + 标准 IPC。禁止第二套建模 API。
2. **单一数据源（P0-06）**：iModel/BIS + `params` 是事实源；派生显示只做投影。
3. **可撤销或 HITL（P0-10）**：用户/Agent 写操作走标准事务；破坏性操作预览→确认→提交+审计。
4. **证据优先**：每项完成定义 = 代码/文档 + 可复现证据；"默认 off"不等于完成。
5. **不伪造状态**：能力账本/parity 只登记实测结果；不支持/近似/blocked 必须显式。
6. **公司边界（P0-07）**：公共仓不出现私有源码、密钥、native 构建证据、客户数据。
7. **未授权不提交**：P2/P3 原型放私有仓或独立包；未经明确授权不 commit/push/publish。

---

## 3. P1：未来 2 周（10 个工作日）

> 按当前工作树状态可跳过已完成项，直接补证据。每天最多 30 分钟答疑；P2/P3 代码评审集中到周二/周四各 30 分钟。

| Day | 主任务 | 具体动作 | 交付/证据 |
|---|---|---|---|
| **D1** | 基线盘点 | `cd luban-cad && corepack pnpm@10 install`；按 shared→editor→viewer 构建；跑 shared test、web test/lint、`check-contract-freeze`、`check-release-hygiene --mode ci`；记录红项 | 红/绿基线清单；命令与输出 |
| **D2** | 修 CI 红 | 修 `shared/src/opDsl.test.ts` 类型错误（`draft` 缺失、`RevolveParams` fixture、tsconfig lib）；跑 shared build/test | shared 全绿；diff |
| **D3** | 发布门 + onboarding（2h） | release manifest 骨架 + SBOM/signature/attestation 占位；`check-release-hygiene --mode release`；G0 登记册补 owner/失败判据；发 onboarding 包给 P2/P3 | release hygiene 报告；G0 缺口清单；onboarding 包 |
| **D4** | B2.2 归因 | 隔离 Hub+MS 跑 OBO canary；验证 changeset/briefcase/audit 真实 actor；列 enforce 阻塞项 | canary 日志；阻塞清单 |
| **D5** | D3/D6 账本 | fresh Postgres 跑 D3 迁移；clone/fork K=0/K>0；NV↔checkpoint 绑定；旧库 fixture | 迁移日志；缺口清单；周五评审 |
| **D6** | B3.1f/g ACL | MS 危险面 + Hub 路由 enforce canary；更新负例矩阵；确认默认 off 开关 | 矩阵更新；canary 证据 |
| **D7** | B4/B6 收口 | B4 Write/Share/Link 真值；B6 P4b owner-route service/OBO canary；共享 key 退役阻塞项 | canary；能力真值表 |
| **D8** | C5/C7 会话 | 外部 lease/fencing 设计；recover/reattach 首切片；双实例不双写测试计划 | 设计 note + 测试计划 |
| **D9** | G2 契约 | manifest v0/opDsl 契约设计；发契约变更板；处理 P2/P3 契约问题 | manifest 草案；变更板 |
| **D10** | 收口 | release candidate dry run；DR 基线状态；更新 Gate 仪表；排下两周 | Gate 仪表；下两周计划 |

**P1 不做什么**：不手写 parity 数据、不写 AI 原型、不替 P2/P3 学习；不把"默认 off"写成 Gate 通过。

---

## 4. P2：4 周学习 + 预研试点（MCP + 内嵌 agent harness）

### 前置（D1 上午，2 小时）

- 私有仓 `luban-backend` 访问、MCP 客户端（Claude Desktop/Claude Code）、本地 Docker/WSL。
- 安全简报：P0 规则、公共仓不得出现私有源码/密钥/native 证据、未授权不 commit/push。
- 交付：能起栈（`scripts/quickstart.ps1` + `verify-stack.ps1`）、能打开 `/examples`。

### Week 1：架构与 FeatureOp 管道

| Day | 任务 | 交付 |
|---|---|---|
| **D1** | 环境、起栈、跑 web dev；读根 `CLAUDE.md`、`DEVELOPMENT-RULES.md` | 能起栈；P0 红线笔记 |
| **D2** | 读 `PRODUCT-GOALS`、`09/10`（重点读 G1/G2/F10）、`AIRR-TEMPLATE`、`INTERFACE-FREEZE-MATRIX` | 10 个问题清单（给 P1） |
| **D3** | 代码导览：`apps/web/src/modules/part-studio`、`packages/shared/src/rpc`、`packages/viewer/src/tools`、`packages/editor` | 架构/入口点一页图 |
| **D4** | 跟踪一条 FeatureOp（extrude）端到端：UI→RPC→私有 backend evaluator→native→结果；抓 RPC 载荷 | 端到端流程图 + 问题清单 |
| **D5** | 读 `ADR-G2-01` Feature Manifest、F10 AI envelope、`opDsl.ts`、AI 工具注册规约；读 MCP 规范 | 候选 MCP 工具清单（读/写分开） |

### Week 2：MCP 只读 + agent 提案设计

| Day | 任务 | 交付 |
|---|---|---|
| **D6** | 工具目录盘点：现有 FeatureOp/读 RPC → MCP tool schema；定义 auth/scope/错误语义 | 工具目录 v0 |
| **D7** | MCP server 骨架（私有仓/独立包）：stdio transport；只读工具 `getFeatureTree/getBodies/getMassProperties/listPartStudios` | 可本地启动的 MCP server |
| **D8** | 接入 MCP 客户端，跑通只读工具；补错误处理/日志（不含 token/私有路径） | 只读 MCP demo |
| **D9** | agent harness 设计：plan→preview→confirm→commit；HITL；审计；幂等；不建第二套 API | 设计 note v0 |
| **D10** | 提案原型：自然语言→FeatureOp plan JSON；用 `opDsl` 校验；不执行写 | 提案 demo；周评审 |

### Week 3：试点（只读 + 提案，不自动写）

| Day | 任务 | 交付 |
|---|---|---|
| **D11** | 只读工具硬化：token 处理、错误码、限流意识、无 secrets 日志 | 工具 v0.1 |
| **D12** | agent 选特征/填参数：调用 `previewFeatureOp`（只预览，不提交） | 预览链路 |
| **D13** | HITL 流程：展示 plan/preview，人工确认后走 `applyFeatureOp`；写审计日志 | HITL demo |
| **D14** | 简单零件（extrude→fillet）跑通；undo/redo；push+冷重开 | 真栈证据 |
| **D15** | 记录失败路径/权限边界；与 P1/P3 评审 | 试点报告 v0 |

### Week 4：评测 + 技术路线收口

| Day | 任务 | 交付 |
|---|---|---|
| **D16** | AI eval：选 3 个 parity 场景，agent 提案→执行→P3 oracle 判卷；记录 pass/fail/blocked | eval 报告 |
| **D17** | 安全评审：prompt injection、破坏性操作 HITL、token 作用域、限流、禁止直连 DB/native | 风险清单 + 修复项 |
| **D18** | 技术路线文档 v1：架构、工具目录、auth、HITL、eval、风险、未决问题 | 路线文档 |
| **D19** | Demo 给 P1/P3；go/no-go 进生产实现（默认 off/feature flag） | 评审结论 |
| **D20** | 下 4 周计划；backlog；交接 | 计划 + backlog |

**P2 边界**：不直连 DB/native；不建第二套建模/undo/selection API；不改 `shared`；原型放私有仓/独立包；写路径等 P1 评审。工具目录从现有 FeatureOp 生成，不等 manifest；manifest 出来后再替换手写目录。

---

## 5. P3：4 周学习 + 预研试点（Onshape 建模能力 + 示例）

### 前置（D1 上午，2 小时）

- 私有 parity 数据 `onshape-parity-data`、Onshape 账号、私有后端访问。
- 起栈 + `verify-stack`；打开 `/examples` 至少一个示例。
- 安全简报：live 证据/账号信息不进公共仓。

### Week 1：Onshape 领域与特征管道

| Day | 任务 | 交付 |
|---|---|---|
| **D1** | 环境、起栈、跑示例；读根 `CLAUDE.md`、`luban-cad/CLAUDE.md`、`DEVELOPMENT-RULES.md` | 能起栈；规则笔记 |
| **D2** | 读 `ONSHAPE-LIVE-REPLICATION.md`、`docs/parity/README.md`、`STATUS-DEFINITIONS.md`、`feature-depth-matrix.md` | 术语/状态笔记 |
| **D3** | 打开 1 个 strict/approx 示例，对照 Onshape 观察 Part Studio UI/特征树/对话框 | 差异清单 v0 |
| **D4** | 跟踪一个特征端到端（extrude）：shared params → web dialog → RPC → 私有 evaluator → native op | 特征实现流程图 |
| **D5** | 跑 `build-capability-ledger`/`verify-capability-ledger`、一个 parity e2e；看 oracle 逻辑 | 命令记录 + 问题清单 |

### Week 2：能力 gap + 实现指南

| Day | 任务 | 交付 |
|---|---|---|
| **D6** | 20 个 FeatureType × Onshape 能力 gap 矩阵（含草图实体/约束/UI/后端） | gap 矩阵 v0；Top 10 缺口 |
| **D7** | 写《新增一个特征》实现指南：AIRR→shared→zod→evaluator→RPC→UI→e2e→账本→oracle | 指南 v0 |
| **D8** | 选 1–2 个契约兼容的试点特征；确认 ADR/AIRR 需求 | 试点候选 + 文件清单 |
| **D9** | 复现一个 parity 失败，定位根因（内核/契约/UI/数据） | 根因报告 |
| **D10** | 周评审：gap 矩阵 + 指南 + 试点选择；向 P1 提契约问题 | 评审结论 |

### Week 3：试点实现

| Day | 任务 | 交付 |
|---|---|---|
| **D11** | 写试点 AIRR：复用矩阵、跨仓影响、测试/回滚 | AIRR 草案 |
| **D12** | `shared` 契约/params（如需要）+ zod + 单测 | 契约变更 + 单测 |
| **D13** | 私有 backend evaluator + web UI/ribbon（如需要） | 实现 |
| **D14** | 真栈 e2e + 体积 oracle + undo/redo + push/冷重开 | 真栈证据 |
| **D15** | 修失败；更新能力账本；P1 代码评审 | 评审通过 |

### Week 4：第二个试点 + 审计计划

| Day | 任务 | 交付 |
|---|---|---|
| **D16** | 第二个试点特征或 parity 场景；跑 oracle | 试点 2 证据 |
| **D17** | 示例回归：跑 3–5 个相关示例；记录 strict/approx/blocked | 回归报告 |
| **D18** | BRepCore 审计计划：Top 10 blocker、ctest/interface-freeze、台账格式 | 审计队列 v0 |
| **D19** | Demo + go/no-go；记录经验教训 | 评审结论 |
| **D20** | 下 4 周特征波次计划；backlog | 计划 |

**P3 边界**：不单方面改 `shared`/schema；新 FeatureType 只走 manifest 试点（≤3）；不伪造 full；oracle 独立（P2 的 AI 结果由 P3 判卷，不互判）。

---

## 6. 检查点与协作

任务状态与证据跟踪看板：[`TEAM-BOARD-2026-11-25.md`](./TEAM-BOARD-2026-11-25.md)。

| 时间 | 检查点 | 通过标准 |
|---|---|---|
| **W1 末** | 能起栈、能讲清架构、能列问题 | P2/P3 各交 10 个高质量问题；P1 已答 |
| **W2 末** | P2 工具目录 + MCP 骨架；P3 gap 矩阵 + 实现指南 | 可演示；P1 评审通过 |
| **W3 末** | P2 只读 MCP + 提案 demo；P3 试点实现中 | 真栈跑通 |
| **W4 末** | P2 路线文档 + eval；P3 试点证据 + 审计计划 | go/no-go 进正式开发 |

- **每周一 30 分钟架构同步**：P2/P3 带问题/契约需求，P1 裁决。
- **P1 办公时间**：前 4 周周二/周四各 30 分钟；不随时打断。
- **代码边界**：P2 原型私有仓/独立包；P3 在现有特征代码上做，改 `shared`/schema/native 前必须 P1 评审；两人都不碰 P1 的平台分支。
- **未授权不提交**：P2/P3 不 commit/push/publish；公共仓不出现私有源码/密钥/native 证据。

---

## 7. Gate 关系与不宣称

- 本方案是**执行分工**，不是 Gate 通过记录。G0 仍 NO-GO，G1 仍 0/15，G2/G3 不得提前冻结/生产化。
- P1 的 2 周/10 天计划是"blocking 收敛 + 证据补齐"，不承诺 Gate 日期；Gate 需外部评审/ARB 签字。
- P2/P3 的研究、试点、单机 canary、默认 off 切片一律不勾 Gate；写路径启用前必须过 P1 的契约/安全评审。
- 不得对外宣称多用户、生产、DR、SLA、Onshape 全量；能力状态以能力账本/parity registry 为准。

---

## 8. 文档治理

- **权威入口**：`DEVELOPMENT-RULES.md`（规则唯一权威）、`PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md`（目标）、`10-ARCHITECTURE-HARDENING-PLAN.md`（Gate/范围）、`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`（工业级总纲）、`G0-GATE-REPORT-2026-11-24.md`、`G1-EXECUTION-PLAN.md`、`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md`、本文件（团队执行）。
- **历史证据**：ADR、AIRR、已接受的设计/发布记录、被 ADR/AIRR 引用的历史计划保留；状态在索引中标注"历史/Proposed/Implemented"。
- **清理口径**：删除无现行入链、已被取代的纯执行计划/草稿；删除前必须检查 ADR/AIRR/现行方案引用；删除记录写入 `docs/HISTORY.md`，正文可从 Git 历史恢复。
- **不记录进度**：`CLAUDE.md` 只放规范/参考；进度、测试基线、发布证据写入专题文档、能力账本、ADR/AIRR 与发布记录。
- **公私边界**：公共仓只放契约/脱敏结论；私有源码、密钥、native 证据、客户数据不入公共仓。
