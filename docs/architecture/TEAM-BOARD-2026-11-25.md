# 团队任务看板（2026-11-25）

> 状态：**活文档**。执行方案见 [`TEAM-EXECUTION-PLAN-2026-11-25.md`](./TEAM-EXECUTION-PLAN-2026-11-25.md)；
> 本看板只跟踪任务状态与证据，不替代 Gate/AIRR/ADR。
>
> 状态：⚪ 未开始 · 🟡 进行中 · ✅ 完成（有证据） · 🚫 阻塞 · ⏸ 暂缓。
> 完成定义：代码/文档 + 可复现证据；默认 off 切片不等于完成；P2/P3 预研/试点不勾 Gate。
> WIP：P1 同时 1 个大切片；P2 1 个学习/试点；P3 1 个实现 + 1 个审计。

---

## 检查点

| 时间 | 检查点 | 通过标准 | 状态 |
|---|---|---|---|
| W1 末 | 能起栈、能讲清架构、能列问题 | P2/P3 各交 10 个高质量问题；P1 已答 | ⚪ |
| W2 末 | P2 工具目录 + MCP 骨架；P3 gap 矩阵 + 实现指南 | 可演示；P1 评审通过 | ⚪ |
| W3 末 | P2 只读 MCP + 提案 demo；P3 试点实现中 | 真栈跑通 | ⚪ |
| W4 末 | P2 路线文档 + eval；P3 试点证据 + 审计计划 | go/no-go 进正式开发 | ⚪ |

---

## P1：平台/架构（未来 2 周）

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P1-D1 | D1 | 基线盘点：install/build/test/lint/contract/release hygiene | ⚪ | |
| P1-D2 | D2 | 修 CI 红：`opDsl.test.ts` 类型错误、shared build/test | ⚪ | |
| P1-D3 | D3 | 发布门 + onboarding 包（2h）：release manifest/SBOM/signature 骨架 | ⚪ | |
| P1-D4 | D4 | B2.2 归因：隔离 Hub+MS OBO canary、actor 验证、enforce 阻塞项 | ⚪ | |
| P1-D5 | D5 | D3/D6 账本：fresh PG 迁移、clone/fork、NV↔checkpoint、旧 fixture | ⚪ | |
| P1-D6 | D6 | B3.1f/g ACL：MS 危险面 + Hub 路由 enforce canary、负例矩阵 | ⚪ | |
| P1-D7 | D7 | B4/B6 收口：Write/Share/Link 真值、P4b owner-route、key 退役 | ⚪ | |
| P1-D8 | D8 | C5/C7：外部 lease/fencing、recover/reattach、双实例测试计划 | ⚪ | |
| P1-D9 | D9 | G2 契约：manifest v0/opDsl 设计、契约变更板、P2/P3 契约问题 | ⚪ | |
| P1-D10 | D10 | 收口：release candidate dry run、DR 状态、Gate 仪表、下两周计划 | ⚪ | |

---

## P2：AI 建模预研（4 周）

### Week 1：架构与 FeatureOp 管道

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P2-W1D1 | D1 | 环境、起栈、web dev；读 CLAUDE.md/DEVELOPMENT-RULES | ⚪ | |
| P2-W1D2 | D2 | 读 PRODUCT-GOALS、09/10、AIRR-TEMPLATE、INTERFACE-FREEZE-MATRIX | ⚪ | |
| P2-W1D3 | D3 | 代码导览：part-studio、shared/rpc、viewer/tools、editor | ⚪ | |
| P2-W1D4 | D4 | FeatureOp（extrude）端到端跟踪 + RPC 载荷 | ⚪ | |
| P2-W1D5 | D5 | 读 ADR-G2-01、F10、opDsl、AI 注册规约、MCP 规范 | ⚪ | |

### Week 2：MCP 只读 + agent 提案设计

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P2-W2D1 | D6 | 工具目录盘点：FeatureOp/读 RPC → MCP schema、auth/scope | ⚪ | |
| P2-W2D2 | D7 | MCP server 骨架：stdio、只读工具 4 个 | ⚪ | |
| P2-W2D3 | D8 | 接入 MCP 客户端、只读 demo、日志脱敏 | ⚪ | |
| P2-W2D4 | D9 | agent harness 设计：plan→preview→confirm→commit、HITL、审计 | ⚪ | |
| P2-W2D5 | D10 | 提案原型：自然语言→FeatureOp plan JSON、opDsl 校验 | ⚪ | |

### Week 3：试点（只读 + 提案，不自动写）

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P2-W3D1 | D11 | 只读工具硬化：token/错误码/限流意识/无 secrets 日志 | ⚪ | |
| P2-W3D2 | D12 | agent 选特征/填参数、`previewFeatureOp` | ⚪ | |
| P2-W3D3 | D13 | HITL：确认后 `applyFeatureOp` + 审计 | ⚪ | |
| P2-W3D4 | D14 | 简单零件 extrude→fillet、undo/redo、push+冷重开 | ⚪ | |
| P2-W3D5 | D15 | 失败路径/权限边界、P1/P3 评审 | ⚪ | |

### Week 4：评测 + 技术路线收口

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P2-W4D1 | D16 | AI eval：3 个 parity 场景，P3 oracle 判卷 | ⚪ | |
| P2-W4D2 | D17 | 安全评审：prompt injection、破坏性操作、token 作用域 | ⚪ | |
| P2-W4D3 | D18 | 技术路线文档 v1 | ⚪ | |
| P2-W4D4 | D19 | Demo + go/no-go | ⚪ | |
| P2-W4D5 | D20 | 下 4 周计划/backlog/交接 | ⚪ | |

---

## P3：Onshape 建模能力/示例预研（4 周）

### Week 1：Onshape 领域与特征管道

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P3-W1D1 | D1 | 环境、起栈、示例；读 CLAUDE.md/luban-cad CLAUDE.md/DEVELOPMENT-RULES | ⚪ | |
| P3-W1D2 | D2 | 读 ONSHAPE-LIVE-REPLICATION、parity README、STATUS、feature-depth-matrix | ⚪ | |
| P3-W1D3 | D3 | 打开示例，对照 Onshape UI/树/对话框 | ⚪ | |
| P3-W1D4 | D4 | 特征（extrude）端到端跟踪 | ⚪ | |
| P3-W1D5 | D5 | 跑 ledger/verify、一个 parity e2e、看 oracle | ⚪ | |

### Week 2：能力 gap + 实现指南

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P3-W2D1 | D6 | 20 FeatureType × Onshape gap 矩阵、Top 10 缺口 | ⚪ | |
| P3-W2D2 | D7 | 《新增一个特征》实现指南 | ⚪ | |
| P3-W2D3 | D8 | 选 1–2 个契约兼容试点、确认 AIRR/ADR | ⚪ | |
| P3-W2D4 | D9 | 复现一个 parity 失败、定位根因 | ⚪ | |
| P3-W2D5 | D10 | 周评审：gap/指南/试点、向 P1 提契约问题 | ⚪ | |

### Week 3：试点实现

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P3-W3D1 | D11 | 试点 AIRR：复用矩阵、跨仓影响、测试/回滚 | ⚪ | |
| P3-W3D2 | D12 | shared 契约/params（如需）+ zod + 单测 | ⚪ | |
| P3-W3D3 | D13 | 私有 backend evaluator + web UI/ribbon（如需） | ⚪ | |
| P3-W3D4 | D14 | 真栈 e2e + 体积 oracle + undo/redo + push/冷重开 | ⚪ | |
| P3-W3D5 | D15 | 修失败、更新能力账本、P1 评审 | ⚪ | |

### Week 4：第二个试点 + 审计计划

| ID | Day | 任务 | 状态 | 证据 |
|---|---|---|---|---|
| P3-W4D1 | D16 | 第二个试点/parity 场景 + oracle | ⚪ | |
| P3-W4D2 | D17 | 示例回归 3–5 个、记录 strict/approx/blocked | ⚪ | |
| P3-W4D3 | D18 | BRepCore 审计计划：Top 10、ctest/interface-freeze、台账格式 | ⚪ | |
| P3-W4D4 | D19 | Demo + go/no-go | ⚪ | |
| P3-W4D5 | D20 | 下 4 周特征波次计划/backlog | ⚪ | |

---

## 更新规则

1. 每完成一项，把状态改为 ✅ 并在"证据"列填 commit/PR/测试输出/文档路径；没有证据不得标 ✅。
2. 阻塞项标 🚫，在证据列写阻塞原因和 owner；不要静默降级。
3. 每周一架构同步前更新一次；周五证据评审只认看板里的证据。
4. 新增任务必须关联 `TEAM-EXECUTION-PLAN-2026-11-25.md` 的目标或 Gate；不要在看板里塞未立项功能。
5. 本看板不替代 AIRR/ADR/Gate；P2/P3 的预研/试点完成不等于 Gate 通过。
