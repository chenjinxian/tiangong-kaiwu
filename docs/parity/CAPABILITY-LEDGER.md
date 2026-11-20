# Capability Ledger（生成产物，勿手改）

> 由 `scripts/parity/build-capability-ledger.mjs` 生成；状态定义见
> [`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md)。修改来源或
> `capability-overrides.json` 后重新生成并运行 verify。

- shared 接口版本：`1.84.0`
- 生成日期：2026-11-19
- 行数：121
- 状态分布：gated=52，partial=69

| ID | Family | Status | Wave | Scope / Missing | UI | Contract | Backend | Kernel | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| `constraint.angle` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.coincident` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.concentric` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.diameter` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.distance` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.equal` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.fixed` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.horizontal` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.length` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.midpoint` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.mirror` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.offset` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.parallel` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.perpendicular` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.radius` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.slotWidth` | constraint | partial | W1 | shared 1.84（ADR-0023 / ADR-0022 §2.12）solver-neutral 单宽度约束：ring（N 中线 line/arc + N 一侧边界 + N 另一侧边界，N≥2；线中线后端补 parallel+有符号垂距 ±w/2，弧中线补同心+隐藏径向构造径向间距 w/2）与 concentric（中线圆/弧+内+外，后端补圆心重合+8 条隐藏径向构造）；UI 尺寸标签（环槽 Ø、整圆线性）双击改值同时驱动两侧；支持长度类表达式（后端物化 value；数值改值清除 expression；updateVariables 联动）；真栈整圆/闭合环/闭合 line+arc 环/整圆槽宽表达式/变量驱动（w=10→#w*2→变量表改 15→宽 30）各用例、后端 updateSketchConstraint flow 2/2、SketchExpressionFlow slotWidth 3/3、solver conformance 5/5（含弧环 20→30 联动与类型门拒收）；样条中线的闭合环；live 宽度拖拽/放置交互（S2t 探针证据不足） | luban-cad/apps/web/src/modules/part-studio/tools/sketch/sketch-slot-logic.ts:1 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts | 私有后端：sketch/SolverTypes.ts、SketchWireNormalizer.ts、SlvsSolver.ts（证据私有） | none | luban-cad/apps/web/e2e/sketch-slot.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-mixed-ring-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-annotations.test.ts |
| `constraint.symmetric` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.tangent` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `constraint.vertical` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1292 | — | — | — |
| `entity.arc` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1284 | — | — | — |
| `entity.circle` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1283 | — | — | — |
| `entity.line` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1282 | — | — | — |
| `entity.point` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1281 | — | — | — |
| `entity.spline` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1288 | — | — | — |
| `feature.booleanAdd` | feature | partial | W3 | LubanFeatureType=booleanAdd；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.booleanBodies` | feature | partial | W3 | LubanFeatureType=booleanBodies；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.booleanSubtract` | feature | partial | W3 | LubanFeatureType=booleanSubtract；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.chamfer` | feature | partial | W3 | LubanFeatureType=chamfer；映射 UI 工具 chamfer；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:53 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.cPlane` | feature | partial | W3 | LubanFeatureType=cPlane；映射 UI 工具 cPlane；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:113 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.draft` | feature | partial | W4 | LubanFeatureType=draft（shared 1.82.0）；映射 UI 工具 draft；TaperFaces 已按 ADR-0021 AX-01 接线，单 body 侧面+中性面 15° 真栈 3732.051 mm³、30° 3422.648 mm³；多 body 形态与跨 body 中性面策略；线性/中面/分型线等其余拔模模式；受影响 Onshape 示例 strict 晋升（当前无 strict 示例依赖 draft） | luban-cad/apps/web/src/modules/part-studio/dialogs/DraftDialog.tsx:104 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | 私有后端：draft registry schema + evaluator（W4 审计；证据留在私有仓） | docs/parity/KERNEL-BOUNDARIES.md#2-操作边界2026-11-19-v0（TaperFaces） | luban-cad/apps/web/e2e/draft-ui.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/DraftDialog.test.tsx |
| `feature.extrude` | feature | partial | W3 | LubanFeatureType=extrude；映射 UI 工具 extrude；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:48 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.faceExtrude` | feature | partial | W3 | LubanFeatureType=faceExtrude；映射 UI 工具 extrude；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:48 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.featureMirror` | feature | partial | W3 | LubanFeatureType=featureMirror；映射 UI 工具 mirror；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:63 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.featurePattern` | feature | partial | W3 | LubanFeatureType=featurePattern；映射 UI 工具 linearPattern；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:60 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.fillet` | feature | partial | W3 | LubanFeatureType=fillet；映射 UI 工具 fillet；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:49 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.hole` | feature | partial | W3 | LubanFeatureType=hole；映射 UI 工具 hole；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:59 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.loft` | feature | partial | W3 | LubanFeatureType=loft；映射 UI 工具 loft；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:56 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.mirror` | feature | partial | W3 | LubanFeatureType=mirror；映射 UI 工具 mirror；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:63 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.moveFace` | feature | partial | W3 | LubanFeatureType=moveFace；映射 UI 工具 moveFace；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:108 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.pattern` | feature | partial | W3 | LubanFeatureType=pattern；映射 UI 工具 linearPattern；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:60 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.revolve` | feature | partial | W3 | LubanFeatureType=revolve；映射 UI 工具 revolve；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:54 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.shell` | feature | partial | W3 | LubanFeatureType=shell；映射 UI 工具 shell；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:119 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.splitPart` | feature | partial | W3 | LubanFeatureType=splitPart；映射 UI 工具 splitPart；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:65 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.sweep` | feature | partial | W3 | LubanFeatureType=sweep；映射 UI 工具 sweep；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:55 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `feature.transform` | feature | partial | W3 | LubanFeatureType=transform；映射 UI 工具 transform；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:66 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:239 | — | — | — |
| `ui.appearance` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:128 | — | — | — | — |
| `ui.assemblyEdit` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:131 | — | — | — | — |
| `ui.boolean` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | — | — | — | — |
| `ui.chamfer` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:53 | — | — | — | — |
| `ui.circularPattern` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:61 | — | — | — | — |
| `ui.compositePart` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:98 | — | — | — | — |
| `ui.copyWorkspace` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:140 | — | — | — | — |
| `ui.cPlane` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:113 | — | — | — | — |
| `ui.createSelection` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:103 | — | — | — | — |
| `ui.curvePattern` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:62 | — | — | — | — |
| `ui.curves` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:124 | — | — | — | — |
| `ui.decal` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:68 | — | — | — | — |
| `ui.deleteBodies` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:105 | — | — | — | — |
| `ui.deleteFace` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:107 | — | — | — | — |
| `ui.dependencies` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:134 | — | — | — | — |
| `ui.derived` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:95 | — | — | — | — |
| `ui.draft` | tooling | partial | W4 | 入口可用：DraftDialog（目标面/中性面同选集、X/Y/Z、角度、添加台阶面、实时预览、insert/updateParams）+ 标准 targetBodyId；真栈 3732.051 mm³ push+冷重开；live Onshape 拔模对话框逐项证据（字段顺序/默认值/独立中性面拾取交互）；线性/中面等其余拔模模式；多 body 形态与逐 body 拔模 | luban-cad/apps/web/src/modules/part-studio/dialogs/DraftDialog.tsx:104 | — | 私有后端：draft registry schema + evaluator（W4 审计；证据留在私有仓） | docs/parity/KERNEL-BOUNDARIES.md#2-操作边界2026-11-19-v0（TaperFaces） | luban-cad/apps/web/e2e/draft-ui.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/DraftDialog.test.tsx |
| `ui.drawing` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:126 | — | — | — | — |
| `ui.extrude` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:48 | — | — | — | — |
| `ui.faceBlend` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:52 | — | — | — | — |
| `ui.featureHistory` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:148 | — | — | — | — |
| `ui.fillet` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:49 | — | — | — | — |
| `ui.frames` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:122 | — | — | — | — |
| `ui.hole` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:59 | — | — | — | — |
| `ui.insertElement` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:146 | — | — | — | — |
| `ui.linearPattern` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:60 | — | — | — | — |
| `ui.loft` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:56 | — | — | — | — |
| `ui.mateConnector` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:94 | — | — | — | — |
| `ui.material` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:127 | — | — | — | — |
| `ui.mirror` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:63 | — | — | — | — |
| `ui.modifyFillet` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:106 | — | — | — | — |
| `ui.moveDocument` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:138 | — | — | — | — |
| `ui.moveFace` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:108 | — | — | — | — |
| `ui.notifications` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:129 | — | — | — | — |
| `ui.pauseRebuild` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:147 | — | — | — | — |
| `ui.print` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:130 | — | — | — | — |
| `ui.queryVariable` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:97 | — | — | — | — |
| `ui.render` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:125 | — | — | — | — |
| `ui.replaceFace` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:109 | — | — | — | — |
| `ui.restoreWorkspace` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:139 | — | — | — | — |
| `ui.revolve` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:54 | — | — | — | — |
| `ui.rib` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:118 | — | — | — | — |
| `ui.selection` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:46 | — | — | — | — |
| `ui.selectionFilters` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:102 | — | — | — | — |
| `ui.selectOther` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:104 | — | — | — | — |
| `ui.sheetMetal` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:121 | — | — | — | — |
| `ui.shell` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:119 | — | — | — | — |
| `ui.sketch` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:47 | — | — | — | — |
| `ui.sketchChamfer` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:83 | — | — | — | — |
| `ui.sketchConcentric` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:87 | — | — | — | — |
| `ui.sketchConic` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:72 | — | — | — | — |
| `ui.sketchCurvature` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:91 | — | — | — | — |
| `ui.sketchEllipse` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:75 | — | — | — | — |
| `ui.sketchEllipseArc` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:76 | — | — | — | — |
| `ui.sketchFlow` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:92 | — | — | — | — |
| `ui.sketchInsertImage` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:84 | — | — | — | — |
| `ui.sketchIntersection` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:78 | — | — | — | — |
| `ui.sketchMidline` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:74 | — | — | — | — |
| `ui.sketchNormal` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:88 | — | — | — | — |
| `ui.sketchPierce` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:89 | — | — | — | — |
| `ui.sketchSlot` | tooling | partial | W1 | 偏移 ▾ 第二项「槽」：单条直线、单条开放圆弧、预选相连/闭合直线链（live DXF 同构：圆弧槽=R±Ø/2 同心弧+两半圆帽；开放链=端帽+外侧圆角/内侧斜接；闭合环=外侧圆角/内侧斜接、无端帽）、整圆中线（两同心整圆 R±w/2）、多条互不相连直线（每条线一个槽、全部帽共享同一个 Ø）、line+arc 混合开放链（接缝外侧 r=w/2 转角弧/内侧偏移交点裁剪）、单毂分支链（≥3 线共点：窄缺口相邻偏移线斜接；宽缺口 ≥180° 改为绕毂 r=w/2 圆弧，live 扫角=180°−最小臂锥角）、多毂一般线树（逐节点窄缺口斜接/宽缺口毂弧）、多连通分量（弧+线独立、链+独立线：各分量独立槽、共享单 Ø 跨分量 equal）、闭合 line+arc 混合环（无端帽、外侧圆角/内侧斜接、单一 Ø）。宽度驱动：单线/链/弧/分支/线树/多分量=Ø 直径约束；整圆/闭合环=shared 1.84 `slotWidth`（concentric/ring，ring 中线支持 line/arc、N≥2）单一尺寸同时驱动两侧（环槽 live 显示 Ø、整圆槽为线性宽度）；尺寸字段接受表达式（长度类；标签 live 为 `ƒ ` + 求值）；默认 Ø20、一次 updateSketch/updateSketchConstraint + 原生 undo/redo；真栈 sketch-slot.spec.ts 14 用例分窗验证（2026-11-20 新增宽缺口线树 52.4 s、多分量 56.3 s、槽宽表达式 56.0 s、变量驱动槽宽 26.7 s，均含改宽与 finish+reload）；弧参与的分支链（未采证据）；自交闭合环（live 接受该输入，但未建模轮廓）；live 宽度光标/拖拽预览（本切片为默认 Ø20 + 尺寸编辑）；表达式尺寸编辑框 `(expr) mm` 闭合显示（live state-183，未实现） | luban-cad/apps/web/src/modules/part-studio/tools/sketch/SketchSlotTool.ts:1 | — | 私有后端：solver-neutral `slotWidth`（SolverTypes/SketchWireNormalizer/SlvsSolver；ring 线中线=2N 条 parallel+有符号垂距 ±w/2，ring 弧中线=同心+隐藏径向构造径向间距 w/2（与 concentric 同构），concentric=2 圆心重合+8 条隐藏径向构造）+ `updateSketchConstraint` 白名单 + 草图表达式白名单含 `slotWidth`（长度类） | none | luban-cad/apps/web/e2e/sketch-slot.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-mixed-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-mixed-ring-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-branch-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-tree-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-components-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-annotations.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/SketchSlotTool.test.ts |
| `ui.sketchSplineControlPoints` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:77 | — | — | — | — |
| `ui.sketchSymmetric` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:90 | — | — | — | — |
| `ui.sketchText` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:71 | — | — | — | — |
| `ui.splitPart` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:65 | — | — | — | — |
| `ui.surfaces` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:123 | — | — | — | — |
| `ui.sweep` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:55 | — | — | — | — |
| `ui.tag` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:99 | — | — | — | — |
| `ui.thicken` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:57 | — | — | — | — |
| `ui.thread` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:120 | — | — | — | — |
| `ui.transform` | tooling | partial | W2 | UI 入口可用；全量七维证据未审计；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:66 | — | — | — | — |
| `ui.updateWorkspace` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:141 | — | — | — | — |
| `ui.userFeatures` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:114 | — | — | — | — |
| `ui.variable` | tooling | gated | W2 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:96 | — | — | — | — |
| `ui.workspaceProperties` | tooling | gated | W5 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:142 | — | — | — | — |
| `ui.wrap` | tooling | gated | W4 | UI 入口 gated（能力引导）；未实现（诚实 gated） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:67 | — | — | — | — |
