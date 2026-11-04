# 天工开物 / 鲁班CAD 开发规则（v1.0）

- 状态：**已确认并生效（owner 确认：2026-11-04）**
- 适用范围：`tiangong-kaiwu`、`luban-backend`、`imodel-native`、`imodelhub-services`、`DanQing` 及所有关联/参考仓
- 权威性：本文件是**开发规则唯一权威**；各仓 `CLAUDE.md`、`CONTRIBUTING.md` 只能补充领域细节，冲突以本文件为准
- 配套文件：
  - 接口冻结：[`architecture/INTERFACE-FREEZE-MATRIX.md`](./architecture/INTERFACE-FREEZE-MATRIX.md)
  - AIRR 模板：[`architecture/AIRR-TEMPLATE.md`](./architecture/AIRR-TEMPLATE.md)
  - 规范来源表：[`architecture/CANONICAL-SOURCES.md`](./architecture/CANONICAL-SOURCES.md)
  - 例外登记：[`architecture/EXCEPTIONS.md`](./architecture/EXCEPTIONS.md)
  - 后端/原生逐文件证据（私有）：`luban-backend/docs/architecture/backend-native-interface-evidence-2026-11-04.md`

---

## 0. 首要原则

1. **iTwin 唯一底座**：数据、事务、工具、视图、RPC 都建立在 iTwin.js / iModel / BIS 上。
2. **源码唯一事实源**：itwinjs-core、imodel-native、BisSchemas、官方 clients 以源码/官方包为准。
3. **参考即规范，复用优先**：任何能力先查关联项目；参考实现不是“素材”，是规格。
4. **先论证后编码**：功能开工前必须完成跨仓影响、复用决策、总体架构/技术路线、ADR（如需）。
5. **单一事实源**：同一数据不得有两套持久表示；同一能力不得有两个实现路径。
6. **可撤销或 HITL**：不可逆操作必须登记并强制预览→确认→提交。

---

## 1. 严重度与适用

| 级别 | 含义 | 违反后果 |
|---|---|---|
| **P0 硬约束** | 不可妥协的架构/契约/安全/许可红线 | 不得合并、不得发布；例外需 owner 书面签字 + ADR + 期限 |
| **P1 强规则** | 必须遵守，允许有期限的例外 | 评审打回；例外登记 |
| **P2 指南** | 推荐做法 | 不作为门禁 |

规则变更：ADR + 本文件版本 bump；P0 变更需平台 owner 签字。

---

## 2. P0 平台宪法（10 条）

### P0-01 iTwin 唯一底座

- 所有模型数据、变更历史、事务、视图、工具生命周期必须建立在 iTwin.js/iModel/BIS 之上。
- 禁止第二套模型数据库、第二套渲染平台、第二套建模 API、第二套选择/撤销状态机。
- **解释口径**：“基于 Bentley iTwin 平台”指技术栈与数据模型；运行时可以是本地/私有化 hub，不要求依赖 Bentley SaaS。
- 执行：架构评审 + 依赖方向检查 + 真栈 e2e。

### P0-02 源码唯一事实源

- `itwinjs-core`、`imodel-native`、`BisSchemas`、官方 REST clients 以源码/官方发布为准。
- 禁止用 npm registry 包替换 `link:` 源码、手改 `lib/`/`dist`、未登记 fork、未记录版本的二进制。
- 执行：Rush/pnpm 构建门、lockfile/link 检查、native provenance 清单。

### P0-03 参考优先，禁止重复造轮子

- 任何功能先建立 **复用矩阵**：iTwin/editor/imodel-native/官方 clients/BisSchemas/DanQing/参考项目。
- 参考实现是“规范”：行为修复先读参考实现，按机制修，不做症状补丁；移植代码/测试标注真实来源。
- 新建实现必须写明“为什么现有 API/工具/参考实现不能满足”，并经 AIRR 批准。
- 执行：AIRR + 复用矩阵 + 评审。

### P0-04 先论证后编码

- 未完成 AIRR（跨仓影响 + 复用决策 + 架构/技术路线 + 测试/回滚计划）不得开始实现。
- 涉及以下任一项必须 ADR：新包/新 RPC/schema 变更/native 接口/渲染管线/求解器接口/数据迁移/新外部依赖/AI 工具。
- 执行：AIRR 门禁；PR 必须链接批准的 AIRR/ADR。

### P0-05 单一建模/编辑管道

- 参数化操作走 FeatureOp RPC（后端 `FeatureService`）。
- 直接编辑走标准工具基类 + `basicManipulationIpc` / `solidModelingIpc`。
- 工具必须继承 `ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`/`LocateSubEntityTool` 等标准基类，遵循生命周期。
- 禁止 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 这类第二套编辑通道新增调用者；该路径进入退役流程。
- 禁止自定义事件替代 `BriefcaseTxns.onCommitted` / `onModelGeometryChanged` 等标准事件。
- 执行：调用图检查 + 评审 + 真栈 undo/redo e2e。

### P0-06 单一数据源与 BIS

- 同一数据只能有一处持久事实源；iModel/BIS + `params` 是模型事实源；客户端缓存/装饰件只是投影。
- 禁止把派生几何/显示数据再次持久化（例如同一草图既存 params 又存 native geometry stream）。
- schema、`params` JSON、feature op 形态变更必须：版本化 + 迁移 + 旧数据 fixture + 回滚方案。
- Part Studio 必须使用 `PartStudioScope`/`WorkspaceRef` 抽象，禁止硬编码“Document=iTwin、Part Studio=iModel”。
- 执行：schema/migration 测试 + 旧库回归 + 数据模型 ADR。

### P0-07 契约唯一、版本握手、公私边界

- `@luban-cad/shared` 是唯一跨仓应用契约；RPC/DTO/常量/错误码在其中版本化。
- 禁止并行 REST DTO：Hub REST 以官方 clients + `docs/api-specs/*.json` 为语义基准。
- P0 接口变更必须 bump 版本并做运行时兼容校验；shared → backend → web 同批次发布。
- 公共仓不得包含私有源码、密钥、native 细节、内部证据。
- 执行：契约测试 + 运行时握手 + 发布矩阵。

### P0-08 Fork/native 最小、可追溯、可重建

- itwinjs-core/imodel-native 改动最小化、登记、可重建；禁止手改生成产物。
- 所有 native 变更必须：源码 + `NativeLibrary.ts` 同步 + ctest + 下游替换回归 + provenance 记录。
- 只保留一个 canonical native checkout/版本；禁止多版本副本并行。
- 执行：修改台账 + 构建/provenance 脚本 + ctest。

### P0-09 内核/求解器冻结接口与许可红线

- 真形（TrueForm）几何内核只经 `SolidKernel.h` 契约接入；绳墨只经 solver-neutral 接口接入；不得把 ACIS/libslvs 类型泄漏进业务层。
- ACIS 只使用授权范围（Modeler + Polyhedra）；STEP/healing 等未授权能力不得接线。
- libslvs（GPL-3.0-only）只允许纯云 SaaS 姿态；on-prem/客户端交付前必须替换为绳墨或取得合规方案。
- 所有外部代码与资料必须有合法授权、可追溯来源和许可证记录；禁止引入未获合法授权的代码或资料。
- 执行：SBOM/许可清单 + 接口冻结 + 双后端一致性测试。

### P0-10 可撤销或 HITL + 审计

- 每个用户/Agent 操作要么走标准事务可撤销，要么明确登记为不可逆并强制 HITL（预览→确认→提交）+ 审计。
- 当前不可逆/受限操作（如草图整体覆写、部分 native 操作）必须进入 [`architecture/EXCEPTIONS.md`](./architecture/EXCEPTIONS.md)，有 owner、期限、退出计划。
- 禁止“静默不可逆”“假成功 no-op”。
- 执行：例外登记 + 真栈 undo/redo e2e + AI 审计日志。

---

## 3. P1 架构与工程规则（12 条）

### P1-01 能力唯一实现

- 一个能力只能有一个工具族、一个选择权威、一个预览管道、一个命令调度器。
- 新增实现前必须删除/冻结旧路径；禁止“新旧并存、逐步看”。
- 典型反例：两套草图工具族、store/`selectionSet` 双选择权威、两个预览管道。

### P1-02 标准事件/失效机制

- 使用 `BriefcaseTxns.onCommitted`、`onModelGeometryChanged`、`ModelChangeMonitor`、标准 `onCleanup` 等。
- 禁止克隆核心失效流程、依赖内部 `Symbol.dispose`、自建事件总线。

### P1-03 单向依赖与包边界

- `shared → core`；`viewer/editor → core + shared`；`web → shared/viewer/editor`；backend 只消费 shared/editor/core。
- 禁止反向依赖、跨层直接 import、应用层下沉平台逻辑。
- 执行：ESLint/dependency-cruiser/CI 边界检查。

### P1-04 数据模型目标 B 抽象

- 新代码不得假设“Document=iTwin、Part Studio=iModel”；使用 `WorkspaceRef`/Part Studio scope。
- 为 ADR-0001 的目标 B（iTwin=项目、iModel=文档、Model=Part Studio/Assembly）保留迁移路径。
- 旧 A 兼容代码必须标注、隔离、有退役计划。

### P1-05 渲染/UX 纪律

- 默认使用 iTwin 渲染器、灯光、材质、视图标志；自定义 shader/渲染管线必须 ADR。
- 自定义装饰件只做显示增强，不参与拾取/数据事实。
- Onshape 对齐以 live 证据/DOM/截图为准；禁止凭空设计交互。
- DanQing 是独立渲染项目，未接入 LubanCAD；接入/替换必须有 ADR。

### P1-06 测试证据等级

- 四级：纯单元 / StandaloneDb 集成 / 真栈 e2e / 视觉性能。
- 任何触碰 iModel、RPC、native、schema、工具事务的改动必须有真栈证据；禁止 jsdom-only 宣称。
- Bug 修复先写失败测试；性能/视觉变更必须有基线。

### P1-07 全仓 CI

- public、backend、native、editor-backend 均须有 required checks；至少覆盖 typecheck/lint/unit/契约/native ctest。
- 全量慢测试至少 nightly；发布门必须有当前基线。
- 执行：CI workflow + 分支保护（Free 计划先以评审 + 脚本门替代）。

### P1-08 性能预算

- 对 hover/pick、tile 加载、特征重建、IPC 次数、装饰件 draw call 设预算。
- 新功能不得无测量地增加每帧/每 hover 成本；大模型路径必须做规模测试。

### P1-09 文档/ADR/状态真实且同步

- 能力状态必须由代码/测试证据支撑（✅/🟠/⚪/❌）。
- ADR、台账、发布清单、文档索引同 PR 更新；禁止硬编码过期测试基线。
- fork 修改台账、native 台账、上游同步记录必须与代码一致。

### P1-10 发布矩阵与 provenance

- shared/backend/web/hub/native 版本兼容矩阵；镜像/产物 hash；`verify-stack` 门。
- 禁止陈旧镜像、宿主 `dist` 遮蔽、未记录 commit 的产物。
- 发布清单以机器生成基线为准，不手写数字。

### P1-11 安全/许可/SBOM

- 认证/RBAC/write lease/rate limit；RPC/WS 鉴权 fail-closed。
- 依赖许可证清单；GPL/研究代码隔离；ACIS 授权范围门禁。
- 公共仓不得出现密钥、私有源码、内部证据。

### P1-12 AI 工具规约

- Agent 只复用现有 `toolId`/op 管道；禁止第二套建模 API。
- 破坏性操作强制 HITL；所有 Agent 调用可审计/可回放。
- 验证 oracle：validity check + 求解三态；生成物必须走真实内核与事务。

---

## 4. 强制流程：AIRR

任何功能/修复在写代码前必须完成 [`architecture/AIRR-TEMPLATE.md`](./architecture/AIRR-TEMPLATE.md)，至少包含：

1. 目标/用户证据（Onshape live、issue、验收标准）；
2. 全关联项目能力清单；
3. 复用/扩展/fork/新建决策 + 许可证；
4. 跨仓影响（web/shared/viewer/editor/itwinjs-core/imodel-native/MS/WA/hub/docs）；
5. 数据/schema/迁移/undo/HITL/性能/安全/发布影响；
6. 测试证据计划；
7. 回滚与兼容方案；
8. ADR 是否需要 + owner 签字。

**AIRR 未通过，不进入实现。**

---

## 5. 例外与豁免

- P0 例外：owner 书面签字 + ADR + 明确失效日期 + 退出计划；登记在 [`architecture/EXCEPTIONS.md`](./architecture/EXCEPTIONS.md)。
- P1 例外：评审同意 + 登记 + 期限。
- 例外不是永久豁免；到期必须修复或升级为正式架构决策。
- 禁止用“先这样”“临时”绕过规则而不登记。

---

## 6. 执行机制

| 机制 | 内容 | 频率 |
|---|---|---|
| AIRR | 功能开工门禁 | 每功能 |
| 接口冻结矩阵 | P0/P1 接口、owner、版本、验收 | 持续 |
| Canonical Sources | 能力→规范来源→禁止项 | 持续 |
| 契约/发布列车 | shared → backend → web 同批次；版本握手 | 每次发布 |
| CI 门禁 | typecheck/lint/unit/contract/native ctest/真栈/视觉 | 每次 PR/发布 |
| 例外登记 | P0/P1 例外与债务 | 持续，季度审计 |
| 架构审计 | fork diff、canonical 版本、许可/SBOM、文档/基线漂移 | 季度 |

---

## 7. 当前 P0 债务（规则落地前必须处理/冻结）

1. ~~旧 edit-command 通道与标准编辑管道并存~~ → **已关闭（2026-11-04，X-01）**：shared 1.1.0，旧三方法删除。
2. ~~两套草图工具族、两套选择权威~~ → **已关闭（2026-11-04，X-02/X-03）**：唯一 `Sketch.*` 工具族；store 单一选择权威 + 唯一 SelectionSet 投影。
3. `FeatureService` God service（生命周期/事务/迁移/租约/推送）→ P0-06。
4. `FEATURE_TYPES` 与 `LubanFeatureType` 漂移（本次已补 `booleanBodies` 并加穷举测试）→ P0-07。
5. 不可逆草图 op / Undo 例外 → P0-10。
6. 原生接口静态 ABI + 真形（TrueForm）几何内核未落地 → P0-08/P0-09（证据在私有仓）。
7. libslvs GPL/on-prem 红线、ACIS 授权范围 → P0-09。
8. backend feature/native/editor-backend 未进托管 CI → P1-07。
9. fork 台账/文档/测试基线漂移 → P1-09。
10. `WriteLease` 单进程内存态 → P0-05/P1-11；多实例前必须决策。

详见 [`architecture/INTERFACE-FREEZE-MATRIX.md`](./architecture/INTERFACE-FREEZE-MATRIX.md) 与私有证据附件。

---

## 8. 与仓库规则的关系

- 根 `CLAUDE.md`：仓库布局、构建/测试命令、上游同步；规则冲突以本文件为准。
- `luban-cad/CLAUDE.md`：产品/工具领域细则；规则冲突以本文件为准。
- `luban-backend/CONTRIBUTING.md`：私有仓分支/PR/发布流程；规则冲突以本文件为准。
- `imodel-native/CONTRIBUTING.md`：native 构建/ctest/上游同步细则；规则冲突以本文件为准。

---

## 9. 功能完成定义（DoD）

- [ ] AIRR 已批准；如需 ADR 已落盘
- [ ] 复用矩阵完整；没有新增重复实现
- [ ] 契约/schema/native 接口已版本化/迁移
- [ ] 标准工具/事务/undo 或 HITL 登记
- [ ] 单元 + 集成 + 真栈证据（按改动面）
- [ ] 性能/视觉基线（如适用）
- [ ] 文档/状态/索引/台账同 PR
- [ ] 释放/兼容/回滚计划
- [ ] 无 P0 例外未登记

---

*v1.0；2026-11-04 owner 确认生效。P0/P1 例外与期限见 `architecture/EXCEPTIONS.md`。*
