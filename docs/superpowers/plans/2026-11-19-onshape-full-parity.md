# Onshape 草图/约束/特征全量严格复刻 + 全语料示例验证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把草图、约束、特征全部按 Onshape 严格对齐（UI/交互/契约/后端/求解器/几何内核/持久化/撤销逐项验收），并把私有语料中的全部 Onshape 示例（526 文档 / 1,505 PS 目录 / 1,685 API Part Studio）建成 strict/approx/blocked 三态测试资产。

**Architecture:** iTwin.js/iModel/BIS 唯一底座；`LubanFeatureRpcInterface` 唯一跨仓契约；FeatureOp 唯一建模/编辑管道；solver-neutral 约束层；几何内核经 `SolidKernel.h`/PSBRep（ACIS 授权范围）接入。三份单一事实源：能力账本、ACIS 内核探针矩阵、语料三态 registry；所有 UI 门禁、批次调度、发布门都从它们生成，禁止第二份能力表。

**Tech Stack:** shared/backend/web 三仓 link: 链路；modeling-server（私有）；imodel-native（ACIS Modeler/Polyhedra）；Playwright 真栈；私有 onshape-parity-data 语料/证据仓。

**Spec:** 本计划；新契约/schema/native/solver/迁移按 P0-04 先出 AIRR/ADR。

## Global Constraints

- **P0-01/P0-05/P0-06**：不引入第二套模型、渲染、选择、编辑或撤销状态机；草图与实体事实源仍是 params/BIS + FeatureOp。
- **P0-04**：每个新契约/字段/FeatureOp/schema/native/solver/渲染/迁移先 AIRR/ADR；未批准不编码。
- **P0-07**：shared 版本 bump + shared→backend→web 同批；旧载荷/fixture 兼容；不泄露私有证据。
- **P0-09**：ACIS 只用 Modeler+Polyhedra；InterOp/healing/STEP 禁止接线；超范围进 `blocked-license` 或真形 backlog。
- **P0-10 / 不伪造**：每个写操作走标准事务、可撤销；未实现能力必须 gated/blocked 且有真实原因，禁止假成功、静默 no-op、近似冒充 strict。
- 公共 `/examples` 只收 strict；原始特征/坐标/DXF/截图/内核错误码只留私有仓。
- 发布/发布流水线需用户明确授权；本计划不授权 commit/push/publish 之外的发布动作。
- 路径别名：`<PARITY_DATA>` = `D:\Github\onshape-parity-data`；`<IMODEL_NATIVE>` = `D:\Github\imodel-native`；`<LUBAN_BACKEND>` = `D:\Github\luban-backend`。

## 用户裁决（2026-11-19）

1. **示例范围**：私有语料 526 文档 / 1,505 PS 目录 / 1,685 API PS；“全部示例”即此绑定范围，后续另议扩大发现。
2. **内核路线**：优先**扩展 ACIS 暴露面**（在授权范围内把已存在但未接线的操作产品化）；真形仅作长期后备，不占关键路径。
3. **示例测试口径**：私有全量三态 registry（strict/approx/blocked）；公共目录只收 strict；blocked 是显式清单门禁，不得静默跳过。
4. **节奏**：能力优先、示例并行验证；每补一项能力即重跑受影响示例批次并扩充 live-spec。

---

## 0. 当前基线（2026-11-19 审计）

| 层 | 事实 | 结论 |
|---|---|---|
| 公共前端 | 20 个草图工具（多数 partial）、17 种约束 kind、20 个 FeatureType、55 个 gated capability key；5 个草图约束 flyout 项无 DTO | UI 有大量“可见但未实现/半实现”，不能按入口数量宣称完成 |
| 私有后端 | 20 个 feature type + zod schema；libslvs 适配 17 种约束；缺 ellipse/conic/text/N 点样条、PROJECTED/PIERCE/INTERSECTED/SILHOUETTED、symmetric/normal 等；投影仅草图→草图 | 后台“支持”是有限子集；大量功能必须新增契约/求解器/后端 |
| 几何内核 | ACIS `SolidKernel.h` 111 个 static API、PSBRep opcode 0–36；backend 仅用 createBRepGeometry {Unite,Subtract,Intersect,Sweep,Loft,Sew} + blend/chamfer/hollow/offsetFaces/spinFaces | 内核能力存在但大量未接线；删除面/替换面/抽壳/曲面/螺纹等受 API/许可/行为边界约束 |
| 示例语料 | 526 docs / 1,505 PS 目录 / 1,685 API PS；22 条 legacy strict（其中 4 条 working-tree-only）、38 条 approx live-spec、1,289 blocked-evidence、32 blocked-converter、15 blocked-capability、2 blocked-kernel；公共 catalog 22 | 示例资产远未全量，且旧 strict 口径需按新标准重审 |
| 证据链 | API 配额窗口约 21h；live 副本 + CDP 是当前主路径；无规模化 live-spec 自动采集、无工作队列驱动的 test registry、无 real-stack CI | 示例工业化是独立 P0 工程，不是附属测试任务 |

**总判断**：严格全量对齐不是“补 UI”项目，而是契约 + 后端 + 求解器 + 内核 + 语料证据五条链同时收口；任何没有 backend/kernel 证据的“全绿”都视为假绿。本计划以能力账本、内核探针矩阵、三态 registry 为单一事实源，按波次推进并在每波重跑示例。

## 1. 完成定义（strict/full）

### 1.1 能力 full

一个 Onshape 工具/约束/特征族只有在以下全部成立时才可标 `full`：

1. **UI**：入口、对话框/面板、字段顺序/默认值/禁用态/菜单/交互按 live 证据逐项对齐，无假控件。
2. **契约**：shared DTO/FeatureOp 字段、校验、版本、opDsl/旧载荷兼容完整。
3. **后端**：registry schema、evaluator、preview、update/suppress/delete、多 body、错误零变更。
4. **求解器/内核**：solver-neutral 方程与 DOF 对拍；内核结果逐 body volume/centroid/bbox 可核验；失败 status=1 且保留旧几何。
5. **持久化/撤销**：一次事务、undo/redo、push + 冷重开、多 scope 一致。
6. **测试**：单元 + contract + StandaloneDb + 真栈 e2e + 受影响示例 strict 批。
7. **证据**：能力账本一行、私有 live/内核证据指针、公共脱敏结论。

否则状态只能是 `partial` / `gated` / `blocked-*` / `excluded`，不得对外称完成。

### 1.2 示例 strict

`geometry / constraints / ui / persist` 四维 complete，且：

- 特征树类型/顺序/名称/`status=0` 与 Onshape 一致；
- 草图实体/约束/solveStatus/DOF 与 oracle 一致，无 dropped constraint；
- body 数一致，逐 body volume 在 0.5%（难例 ≤1% 且有原因）、centroid 在 0.05 mm 或 bbox 相对容差内；
- 多 body 按 volume+centroid 一一配对，禁止用总体积替代；
- 无 approximateSteps / record / test.fail；
- push + 冷重开一致；undo/redo 可用；
- 依赖能力全部 `full`。

`approx` 仅私有，必须带 `approxReasons[]` 与证据；`blocked` 必须有 blocker code + 证据指针；`excluded` 是范围外显式轨道。每条 PS 恰有一行状态，1,685 个 API PS 全部覆盖（180 个无 PS 目录者以 `blocked-evidence:no-ps-dir` 登记）。

### 1.3 已知内核可行性结论（W0 探针后更新）

- **已暴露且可用（ACIS Modeler）**：布尔 Unite/Subtract/Intersect、Sweep/Loft（受限）、Blend/Chamfer/Hollow/OffsetFaces/SpinFaces、Imprint、DeleteSubEntity（healing 有边界）、SweepFaces、Emboss。
- **API 已存在但未接线（优先扩展）**：TaperFaces（需新增 PSBRep op/editor IPC）、DeleteFaces/Edges（createCap/失败语义待补）、OffsetBody/Edges、TransformSubEntity（native stub 待修）、IntersectSheetFaces、ConvertSolidToSheet、DisjoinBody、BooleanCut。
- **许可/范围风险**：ThickenSheet 被 native 注释标为 InterOp 嫌疑，未获书面许可前 `blocked-license`；healing/STEP/InterOp 一律 `blocked-license`，不接线；任何依赖 healing 的 delete/replace face 形态同样 blocked。
- **已知内核边界（blocked-kernel 候选）**：多边 blend `BL_MITRE_TOO_CMPLX`、无开口面的闭合抽壳、盒面 delete-face healing、曲线 sweep 弦近似、chamfer angle-distance 需 partner coedge、step-face 选项未生效。
- **子系统/产品缺失**：sheet metal、frame、externalThread、wrap、surface 族、curve features、text/ellipse/conic 等须独立 ADR/能力；不得用近似几何冒充。

### 1.4 显式排除（不删条目，只登记）

- importForeign/importDerived、STEP/healing：`blocked:excluded-import`（81 PS），不接 ACIS InterOp。
- 任意 FeatureScript 解释器：`blocked:excluded-custom-feature`（25 PS），除非用户另行授权。
- sheet metal：独立 `blocked:excluded-sheet-metal` 轨道（18 PS），需单独 ADR/内核。
- assembly/drawing-only：不产生 Part Studio，登记 `excluded-assembly-only`，不计 Part 完成率。
- 非几何 decal/mateConnector/image：单列显示/非几何轨道，不计几何 strict。

---

## 2. 单一事实源与基础设施

### 2.1 能力账本（Capability Ledger）

- 公共：`docs/parity/capability-ledger.json`、`docs/parity/CAPABILITY-LEDGER.md`、`docs/parity/STATUS-DEFINITIONS.md`。
- 生成/校验：`scripts/parity/build-capability-ledger.mjs`、`verify-capability-ledger.mjs`；UI 一致性由 `capabilities.test.ts` 断言。
- 行字段：`id/family/onshapeEntry/status/scopeNote/contractRef/uiRef/backendRef/kernelRef/exampleImpact/evidence/wave/owner/lastUpdated`。
- 生成输入：shared 类型与版本、backend registry（私有导出）、web `capabilities.ts`/ribbon、内核 probe matrix、三态 registry blocker 计数。
- 规则：每个 Onshape family 恰一行；每个 gated UI key 必须映射；每个 feature type/constraint kind/entity kind 必须有状态；strict 示例依赖能力必须 `full`；ledger 与运行时 registry 不一致视为 P0 缺陷。

### 2.2 ACIS 内核探针矩阵

- 私有：`<IMODEL_NATIVE>/docs/audit/ACIS-EXPOSURE-MATRIX.md`、`BREPCORE-AUDIT-LEDGER.md`；sanitized 摘要进 `<LUBAN_BACKEND>/docs/architecture/kernel-probe-summary.json`。
- 公共：`docs/parity/KERNEL-BOUNDARIES.md` 只写逻辑操作、许可状态、结论，不写 raw 错误码/私有路径。
- 字段：`probeId, operation, SolidKernel API, PSBRep op, editor method, TS wire, license, reachability, ctest, synthetic result, failure mode, decision, capability, wave`。
- 协议：native 直探 → editor 通道 → backend 通道 → 失败注入 → 许可分类 → sanitized 结论；每步记录回滚是否干净。

### 2.3 语料三态 registry

- 私有：`<PARITY_DATA>/tools/build-tristate-registry.mjs`、`verify-tristate-registry.mjs`、`manifest/tri-state-registry.json`、`manifest/batches/*.json`、`reports/batches/*.json`。
- 输入：`example-index.json`、`work-queue.json`、`scenarios/*`、`live-specs/*`、`live-probes/*`、batch 报告、内核 probe 摘要。
- 行字段：`key, owner, docName, psName, state, reasonCode, blockers[], capabilities[], expected{bodyCount,bodies[{partId,volumeMm3,centroid}]}, evidence{index,liveSpec,batchRun,publicTest}, publicEligible, lastVerified`。
- 不变量：1,685 行、0 unknown、strict 全证据、public 只 strict、计数对账 fail closed。

---

## 3. 波次总览

| 波次 | 内容 | 依赖 | 退出标准 |
|---|---|---|---|
| W0 | 真相基座：ledger、ACIS 探针、三段 registry、旧计划合并、旧 22 重审 | — | 1,685 PS 三态 100%；每个目标 ACIS op 有决定；ledger 0 error；旧 22 重分类完成 |
| W1 | 草图实体/约束/solver 基座 | W0 | 实体/约束清单全部 full 或 blocked；solver conformance 绿；每项有 strict 或 blocked 例 |
| W2 | 草图工具/UI/关联性/外部引用 | W1 | 全部工具/变体无静默占位；trim/extend/split/offset/pattern/projection 真栈；0 假控件 |
| W3 | 现有 20 个 FeatureType 深度补齐 | W0/W1 | 每个参数分支 full/blocked；featurePattern 插入 UI、featureMirror 编辑、boolean 多形态有结论 |
| W4 | ACIS 暴露后的缺失特征族 | W0 决策/W3 | 许可允许的 op 已产品化；每族 synthetic + 真实例或 blocked；无未授权接线 |
| W5 | 专用/非几何/排除轨道 | ADR | sheet metal/frame/thread/decal/user features 全部显式状态；0 假完成 |
| W6 | 示例工业化（采集/registry/batch/nightly） | W0 起并行 | 三态 registry、逐 body 批跑、triage、公共 catalog 生成器就绪 |
| W7 | 全语料收口 | W1–W6 | 526 文档/1,685 PS 全部 strict 或 blocked；公共目录全 strict；0 unknown |
| W8 | 发布 | W7 + 授权 | verify-stack 全绿、provenance、release checklist、无未登记 P0 例外 |

> 指示性 strict 目标（每波复核，不是硬承诺）：W1 ≥45、W3 ≥80、W4 ≥150、W6 持续增长、W7 = 全部 PS 有最终状态。任何未达项必须登记原因，不得改口径。

---

## 4. 阶段 A（W0）：真相基座与 ACIS 暴露审计

### A1 基线冻结与计划合并
- 新计划落盘 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md`；旧 `2026-11-10-onshape-all-parts-master.md`、`2026-11-11-live-onshape-ui-replication.md`、`2026-11-09-ps-blocker-*` 加 superseded 头；`docs/README.md` 索引更新。
- 退出：单一主线；无冲突计划并行。

### A2 ACIS 全量探针
- 依据：`SolidKernel.h`（111 static）、`PSBRepOperation.h`（0–36）、`PSBRepEdit.cpp`、`AcisModify.cpp`、`EditBuiltInCommand.ts`/`EditorBuiltInIpc.ts`、`NativeLibrary.ts`、backend `AsyncFeatureEval.ts`。
- 目标：TaperFaces、DeleteFaces/Edges、ThickenSheet、SweepFaces、OffsetBody/Edges、Emboss、IntersectSheetFaces、TransformSubEntity、BooleanCut、SewBodies/DisjoinBody、ConvertSolidToSheet、BodyFromExtrusionToBody 等逐项探针。
- 每个 op 记录：API/许可/现有 wire、成功/失败/回滚、体积/拓扑、决定（`existing` / `expose` / `fix` / `blocked-license` / `blocked-kernel`）。
- 退出：probe matrix 每项有决定；公共只留 sanitized 摘要。

### A3 Capability ledger
- 生成器/校验器 + sanitized 公共表 + 私有全表；UI 一致性测试；每个 gated key/feature/constraint/entity 有行。
- 退出：0 error；与 runtime registry 一致；每个 strict 示例依赖能力为 full。

### A4 三态 registry v0
- 生成 1,685 行；180 个 API-only 显式登记；分类与 `example-index` 对账；strict/approx/blocked 规则落地。
- 退出：0 unknown；无静默跳过；verify 通过。

### A5 许可/架构 ADR
- `docs/adr/0021-acis-exposure-expansion.md`（授权范围、op 清单、禁止事项）；`docs/adr/0022-example-tristate-registry.md`；sketch entity/constraint AIRR。
- 退出：批准后才进入依赖编码。

### A6 旧 22 条 strict 重审
- 按新四维门重新验收公共 catalog/registry；不满足者降级 approx/blocked；4 条 working-tree 促销重新登记。
- 退出：公共目录可信；重分类报告留档。

**W0 门**：1,685 PS 三态；每个目标 ACIS op 有决定；ledger 0 error；旧 22 重审完成；旧计划 superseded。

---

## 5. 阶段 B（W1–W2）：草图、约束、求解器、工具

### B1 实体模型（W1）
- 目标：ellipse、elliptical arc、conic、N-point spline（fit/control/rational/periodic）、text（轮廓）、slot（组合工具）、image（非几何显示轨道）。
- 链路：shared DTO → solver-neutral → backend normalize/regions/tessellation → web 创建/编辑/标注/约束 → undo/cold reopen。
- 每个实体先做 AIRR：求解器是否支持（libslvs 能力或方程方案）、region 边界、尺寸/约束槽位、渲染/拾取。
- 退出：每个实体 full 或 blocked（有证据）；每个新增实体至少一个 strict/blocked 示例。

### B2 约束与 solver（W1）
- 补齐 17 个现有约束的实体组合/槽位（point+line coincident、arc+arc equal/concentric、整圆/样条等）。
- 新约束：symmetric、normal、pierce、intersection、curvature/flow（continuous）、collinear、ratio、fix-curve/block、CENTERLINE_DIMENSION、sketch pattern（LINEAR/CIRCULAR）约束。
- 每个约束：kind/refs/value 语义、方程、DOF/status/failed ids、UI 槽位、glyph、converter 映射、driven 行为。
- 退出：solver conformance 套件全绿；5 个 gated 约束 full 或 blocked；原生完整 PS 无 dropped constraint。

### B3 外部引用（W1–W2）
- ADR-0009 切片 1b：模型边/面投影、PIERCE/INTERSECTED/SILHOUETTED、轮廓投影；草图→草图保持 full。
- 设计要点：读路径异步重投影、源变更驱动、投影实体不参与 DOF、非平行圆/弧投影语义（椭圆/拒绝）、约束可引用策略。
- 退出：PROJECTED/PIERCE/INTERSECTED/SILHOUETTED 每类有 full 或 blocked-design 证据；converter 映射。

### B4 工具/UI 对拍（W2）
- 工具：polygon 构造圆关联、tangent arc 弧/样条/边源、trim/extend/split 全曲线、offset 全实体/链式/双向、sketch pattern 关联关系、transform 数值/基点/非均匀、fillet/chamfer 全模式、text/slot/image、sketch analysis。
- 每个工具：live 证据 → 交互/状态机 → 单测 + 真栈；无静默占位。
- 退出：20 个现有工具及变体全部 full/gated/blocked；关联性/撤销/重开测试通过。

### B5 持久化/撤销/错误态（W1–W2 持续）
- 每个写操作一次事务、undo/redo、失败零变更、冷重建；错误文案本地化（后端结构化 error detail/code）。
- 退出：所有新增实体/约束/工具证据链完整；无假成功。

---

## 6. 阶段 C（W3）：现有 20 个 FeatureType 深度

按族补齐，每族一个能力矩阵行：

| 族 | 目标补齐（完整或 blocked 证据） |
|---|---|
| extrude | 终止条件全形态、第二方向拔模/偏移、薄壁对称/双厚度、upToPart、多区域 NEW、count 表达式（live 允许者） |
| revolve | 任意轴/边轴、thin/surface、intersect、区域完整 |
| sweep | 曲线路径、guides、twist/scale/lock、多 profile、曲面结果 |
| loft | 非平行截面、guides、端条件、thin/surface、编辑 |
| fillet | full-round、变半径、不对称、face blend、modifyFillet、溢流、边集 |
| chamfer | mode 0–4 创建/编辑、面/边选择、逐边数组 |
| hole | thread/钻表、upToSurface/upToVertex、start plane、mateConnector 轴、标准孔径 |
| shell | closed hollow、逐面厚度 UI、开口面规则 |
| pattern/featurePattern | skip、curvePattern、count 表达式、任意轴、featurePattern UI 插入、多源增删 |
| featureMirror | 编辑、face/datum 轴、多源、源链 status |
| booleanBodies | 多 target、结构可编辑、offset/reFillet、预览 |
| splitPart | 面/草图/平面、双侧、keep tools、trim boundary |
| moveFace | 逐面距离 UI、旋转/替换面、reapply fillet |
| transform | 7 模式、数值输入、非均匀/任意轴、组件编辑 |
| faceExtrude | UI 入口、起始面/面集/offset/draft 完整 |
| cPlane | 参考子项、任意面/边、非世界帧、UI 编辑 |
| booleanAdd/Subtract | profile/多区域/作用域/intersect |
| cPlane/变量/表达式 | 所有 live 支持字段；count/tip 等不支持者显式登记 |

- 每族：live 证据 → AIRR/ADR → shared bump → backend → UI → 单测/StandaloneDb/真栈 → 受影响示例批。
- 退出：每个参数分支 full/blocked；每族至少一个真实例或 blocked 证据；无 `record/test.fail` 进入 strict。

---

## 7. 阶段 D（W4–W5）：缺失特征族与内核依赖

### D1 ACIS 暴露族优先
- 优先顺序按示例影响与内核决定：
  1. deleteFace/deleteEdges（DeleteSubEntity 已 wire，healing 边界需证据）
  2. deleteBodies（纯 backend 生命周期）
  3. draft（TaperFaces 新增 op + editor + backend）
  4. replaceFace（评估 API/许可；否则 blocked）
  5. thicken（ThickenSheet 许可待核；否则 blocked-license）
  6. rib（组合 licensed op；无新内核则 backend 组合）
  7. curvePattern/featurePattern 扩展（纯 backend/UI）
  8. surface 族（offsetSurface/fill/enclose/boundary/ruled/extend/faceBlend/modifyFillet）
  9. wrap（Emboss 或贴合算法；无证据不产品化）
  10. externalThread/helix、frame、sheet metal（独立 ADR/子系统）
- 每个 op：probe → 许可 → 绑定（PSBRep/editor/native wire）→ backend evaluator → ctest/flow → UI → 示例。不允许 replay/kernel 旁路。

### D2 ACIS 暴露协议（强制）
- 发现顺序：SolidKernel API → AcisModify 实现 → PSBRep opcode → PSBRepEdit handler → editor method → IPC → NativeLibrary → backend evaluator → UI。
- 新 op 必须：opcode、props、TS wire、ctest、失败回滚、provenance、下游回归、接口冻结矩阵更新。
- 禁止：InterOp/healing/STEP；未探针接线；多份 native checkout；手改生成产物。

### D3 状态与后备
- 许可/API 不支持 → `blocked-license`/`blocked-kernel`，进真形 backlog；不得近似或静默。
- 真形（TrueForm）保持独立里程碑（M1–M7），仅在后备轨道推进；切换需一致性套件 + 双后端回归 + 回滚。

**W4 门**：目标 ACIS op 每项有决定；许可允许者产品化；每族有 synthetic + 真实例或 blocked；无未授权接线。  
**W5 门**：sheet metal/frame/thread/decal/user features 全部显式轨道；excluded 完整；0 假完成。

---

## 8. 阶段 E（W6–W7）：示例工业化

### E1 证据采集
- 私有工具：`tools/live/capture-copy.mjs`（幂等副本）、`capture-tree.mjs`、`capture-dialogs.mjs`、`capture-dxf.mjs`、`capture-body-props.mjs`；API 采集继续按 429 窗口断点续跑。
- 规则：会话过期/401/403/429 立即停批并记录 retry-after；不改原文档；原始证据只进私有仓。

### E2 归一化
- `normalize-live-spec.mjs` → `ParityScenario` 形状，`provenance.mode`、`feature.status`、`approxReasons[]`、sourceHash；草图优先 DXF，其次 corpus solved entities 并标注；约束无证据则 approx/blocked，不猜。

### E3 三态 registry + 批次计划
- 生成/校验全部 PS；`plan-batches.mjs` 按 wave/capability 排序；`build-work-queue.mjs` 改为消费 registry。
- 命令：
  ```bash
  node tools/index-examples.mjs && node tools/verify-example-index.mjs
  node tools/live/capture-*.mjs ...
  node tools/live/normalize-live-spec.mjs ...
  node tools/build-tristate-registry.mjs && node tools/verify-tristate-registry.mjs
  node tools/plan-batches.mjs --wave W1 --out manifest/batches/W1.json
  node tools/run-batch.mjs --batch manifest/batches/W1.json --out reports/batches/W1.json
  ```

### E4 批量 runner 与逐 body 比较
- 新增 `apps/web/e2e/examples/corpus/batch.spec.ts`（由 `ONSHAPE_BATCH_FILE` 驱动）、`compare-bodies.ts`；复用 `live/run-live.ts`、`replay/run-file.ts`、`imodel.ts`。
- 每 PS 独立 iModel、顺序执行；比较 body 数、逐 body volume/centroid/bbox、tree/status、push+冷重开、undo/redo；无 oracle 不得 strict。

### E5 Triage / CI
- 失败分类：产品 bug / selector / kernel / evidence / UI / 环境限流；产品 bug 入能力 backlog，kernel 入 probe matrix，evidence 入采集队列，限流不判回归。
- 私有夜间批跑 + 报告；公共 CI 保持单测/tsc；real-stack 门在发布/夜间执行；MS 100 req/15min、Onshape retry-after 不绕过。

### E6 公共目录
- `build-public-catalog.mjs` 只从 `strict && publicEligible` 生成 `catalog.ts`/`registry.json`；旧 22 重审后不符者降级；`catalog.spec.ts` 由生成结果驱动；公共不出现 approx/私有字段。

**W6 门**：三态 registry、batch runner、triage、nightly、catalog 生成器就绪。  
**W7 门**：526 docs/1,685 PS 全部 strict 或 blocked；公共目录全 strict；0 unknown。

---

## 9. 阶段 F（W8）：治理、审计与发布

- 每个能力切片：AIRR/ADR（如触发）、接口冻结矩阵、例外登记、能力账本、文档、单测/真栈/示例证据同 PR 更新。
- BRepCore 持续审计：内存/生命周期、线程、错误传播、精度、拓扑、布尔/圆角/扫掠语义；问题进私有台账，内核问题转真形/绳墨仓。
- 发布门：`verify-stack` 全绿、strict registry 全绿、kernel conformance、provenance/digest、release checklist；**发布由用户明确授权**。
- 回滚：能力 flag/gating、shared additive 兼容、native op 可移除重建、示例 strict 可降级并重生成 catalog。

---

## 10. 能力 backlog（摘要）

### 10.1 草图实体/工具
- full 基础：point/line/circle/arc；需扩展：cubic→N 点/periodic spline、ellipse/elliptical arc、conic、text、slot、image（非几何）、polygon 构造圆关联、tangent arc 全源、trim/extend/split/offset 全曲线/链式、关联 patterns、transform 数值/非均匀、use/模型投影、intersection/pierce 工具。
- 每项：contract + solver + regions + display + picker + dimension + undo + cold reopen；无证据不实现。

### 10.2 约束
- 现有 17 种形态补齐（含 point+line、arc+arc 等 UI 槽位）；新增 symmetric/normal/pierce/intersection/collinear/ratio/fix-curve/CENTERLINE_DIMENSION/sketch pattern；PROJECTED/PIERCE/INTERSECTED/SILHOUETTED 外部引用；curvature/flow/quadrant 等按语料与 solver 可行性 full 或 blocked。

### 10.3 特征
- 现有 20 种深度补齐（见 §6）；缺失族 draft/deleteFace/deleteEdges/deleteBodies/replaceFace/thicken/surface 族/rib/curvePattern/wrap/externalThread/frame/sheet metal；按 ACIS 探针决定 full 或 blocked。
- 树与操作：reorder 依赖感知、rollback、folders、comments、dependencies、appearance、show dimensions、visibility、feature copy/transform、multi-select；不实现者诚实禁用并登记。

### 10.4 内核决定（W0 后更新）
- 已 wire：DeleteFaces/Edges、SweepFaces、OffsetFaces/Edges、Emboss、ThickenSheets、TransformSubEntity（stub 待修）、SpinFaces、HollowFaces、Blend/Chamfer。
- API-only：TaperFaces（需新 op）；其余 surface/convert/disjoin 按需求评估。
- 许可风险：ThickenSheet（InterOp 嫌疑）、delete face healing、STEP/healing → `blocked-license`，不接线。

---

## 11. 验证策略

| 层级 | 要求 |
|---|---|
| 单元 | shared DTO/opDsl、UI 纯逻辑、solver 映射；每个切片 |
| 契约 | 版本/旧载荷/旧库 fixture；shared→backend→web 同批 |
| Solver conformance | 实体/约束方程、DOF/status、冲突/欠定/冗余、driven |
| StandaloneDb | FeatureFlow、多 body、undo/redo、冷重开、失败回滚 |
| Kernel ctest | 新 native op 成功/失败/回滚/许可范围/确定性 |
| 真栈 e2e | 真实 ribbon/对话框/画布/事务；所有 UI/feature |
| 示例 strict | tree/status/body/per-body/oracle/push/reopen/undo，无 approx |
| 性能 | 大文档（39 PS/146 body）dry-run、mass、冷开、批跑 |
| 限流 | Onshape retry-after、MS 100/15min，记录不绕过 |

**每切片证据清单**：shared 单测+build；backend 目标+全量；web 单测/tsc/lint；真栈目标 spec；示例批；逐 body volume/centroid；undo/redo；push+冷重开；失败路径；文档/ledger/ADR/冻结矩阵。

---

## 12. 风险 / 回滚 / 排除

| 风险 | 缓解 | 停止条件 |
|---|---|---|
| ACIS op 许可不通过 | 先许可审计；blocked-license；真形 backlog | 无书面许可即停 |
| native stub/绑定 bug | 先修 ctest/绑定；未修前 blocked | 无干净回滚即停 |
| delete face healing / closed shell / sweep / blend 边界 | 只用 Modeler；失败 status=1；登记 blocked | 依赖 healing 或放宽断言即停 |
| solver 新方程失败 | solver-neutral conformance；双跑语料 | 无对拍不升级 |
| 契约漂移 | 单源生成、版本 bump、旧 fixture | 手写第二 DTO 即停 |
| 429/会话过期 | retry-after、断点、单线程 | 绕过限流即停 |
| 公私泄漏 | sanitizer/公共目录扫描 | 出现 raw 证据即停 |
| 旧 22 假绿 | 新四维定义重审、自动降级 | 保留旧口径即停 |
| 并行 agent 冲突 | 文件 owner、版本列车、worktree | 共享文件并发改即停 |

回滚：能力 flag/gating；shared additive；native op 可移除重建；示例 strict 可降级并重生成 catalog；发布回滚按 release checklist。

---

## 13. 前两周立即行动（文件级）

### 第 1 周
1. 落盘本计划到 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md`；旧三份计划加 superseded 头；`docs/README.md` 索引。
2. `docs/parity/STATUS-DEFINITIONS.md`、`docs/parity/README.md`：strict/full/gated/blocked 定义。
3. `scripts/parity/build-capability-ledger.mjs`、`verify-capability-ledger.mjs`、`docs/parity/capability-ledger.json`（骨架 + 0 error）。
4. `<PARITY_DATA>/tools/build-tristate-registry.mjs` + `manifest/tri-state-registry.json`：1,685 行、180 API-only 显式、0 unknown。
5. `<IMODEL_NATIVE>` ACIS 探针 v0：TaperFaces/DeleteFaces/ThickenSheet/SweepFaces/OffsetBody/Emboss/TransformSubEntity/OffsetEdges；私有矩阵 + 公共 sanitized 结论。
6. `docs/adr/0021-acis-exposure-expansion.md` 草案（Modeler/Polyhedra 边界、禁止项、探针决定规则）。
7. 旧 22 条 strict 重审报告；公共 catalog 降级清单。

### 第 2 周
8. `scripts/parity/build-public-catalog.mjs`/`verify-public-catalog.mjs`；`catalog.ts` 只从 strict 生成。
9. `capabilities.test.ts` 增加 ledger 一致性断言（full/gated 与运行时一致）。
10. `<PARITY_DATA>/tools/live/capture-*.mjs` 骨架：copy/tree/dialogs/DXF/body props；2–3 文档跑通。
11. `normalize-live-spec.mjs` + `live/live-spec.ts`：2 个 spec 可被 runner 读取。
12. `apps/web/e2e/examples/corpus/batch.spec.ts` + `compare-bodies.ts` + `run-batch.mjs`：单批生成 JSON 报告。
13. Sketch AIRR：`docs/superpowers/specs/2026-11-19-sketch-entity-constraint-expansion-airr.md`（实体/约束/外部引用；批准前不编码）。
14. Feature depth matrix：`docs/parity/feature-depth-matrix.md`（20 个 FeatureType 每个分支 full/blocked）。
15. W1 子任务 briefs：`docs/superpowers/briefs/W1/*.md`（scope/files/gates/evidence）。

**执行顺序：** W0 先落 SOT/内核决策 → E1 采集与 registry 并行 → W1 草图与 W3 特征深度并行（shared 版本列车串行）→ 每波独立 reviewer 验证据 → 公共目录只由 strict 生成 → 无授权不 commit/push/publish。

### 子代理任务简报模板
```text
Task ID / capability ledger ID / wave
目标与用户可见验收
允许修改的文件（精确路径）
禁止修改的文件/禁止的第二路径
依赖（能力/契约/内核 probe）
验收命令（unit/StandaloneDb/真栈/示例）
证据存放位置（公共/私有）
失败与 blocked 登记规则
回滚方式
```

---

## 14. Critical Files

- `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（契约/实体/约束/版本）
- `luban-backend/modeling-server/src/feature/FeatureTypeRegistry.ts`、`FeatureService.ts`、`AsyncFeatureEval.ts`、`FeatureEngine.ts`、`sketch/SlvsSolver.ts`/`sketch/SolverTypes.ts`
- `imodel-native/iModelCore/BRepCore/PublicAPI/BRepCore/SolidKernel.h`、`PSBRepGeometry/PSBRepOperation.h`、`PSBRepEdit.cpp`、`AcisModify.cpp`
- `luban-cad/packages/editor/backend/src/EditBuiltInCommand.ts`、`core/frontend` editor IPC
- `luban-cad/apps/web/src/modules/part-studio/{tools/sketch,ribbon,dialogs,tree,internal/capabilities.ts}`
- `onshape-parity-data/tools/index-examples.mjs`、新增 `tools/build-tristate-registry.mjs`、`tools/live/*`、`manifest/example-index.json`
- `luban-cad/apps/web/e2e/examples/{registry.ts,imodel.ts,live/run-live.ts,replay/run-file.ts,corpus/batch.spec.ts}`
