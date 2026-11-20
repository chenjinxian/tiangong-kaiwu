# Capability Ledger（生成产物，勿手改）

> 由 `scripts/parity/build-capability-ledger.mjs` 生成；状态定义见
> [`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md)。修改来源或
> `capability-overrides.json` 后重新生成并运行 verify。

- shared 接口版本：`1.83.0`
- 生成日期：2026-11-19
- 行数：121
- 状态分布：gated=52，partial=69

| ID | Family | Status | Wave | Scope / Missing | UI | Contract | Backend | Kernel | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| `constraint.angle` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.coincident` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.concentric` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.diameter` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.distance` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.equal` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.fixed` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.horizontal` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.length` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.midpoint` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.mirror` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.offset` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.parallel` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.perpendicular` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.radius` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.slotWidth` | constraint | partial | W1 | shared 1.83（ADR-0023）solver-neutral 单宽度约束：ring（N 中线+N 外+N 内，后端补 2N 条 parallel+有符号垂距 ±w/2）与 concentric（中线圆/弧+内+外，后端补圆心重合+8 条隐藏径向构造）；UI 尺寸标签（环槽 Ø、整圆线性）双击改值同时驱动两侧；真栈整圆/闭合环各 1 用例、后端 updateSketchConstraint flow 2/2、solver conformance 3/3；弧/样条中线闭合环等其它实体组合；表达式/变量驱动（live 未采）；live 宽度拖拽/放置交互 | luban-cad/apps/web/src/modules/part-studio/tools/sketch/sketch-slot-logic.ts:1 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts | 私有后端：sketch/SolverTypes.ts、SketchWireNormalizer.ts、SlvsSolver.ts（证据私有） | none | luban-cad/apps/web/e2e/sketch-slot.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-annotations.test.ts |
| `constraint.symmetric` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.tangent` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `constraint.vertical` | constraint | partial | W1 | 契约存在；实体组合/求解器覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1286 | — | — | — |
| `entity.arc` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1278 | — | — | — |
| `entity.circle` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1277 | — | — | — |
| `entity.line` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1276 | — | — | — |
| `entity.point` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1275 | — | — | — |
| `entity.spline` | entity | partial | W1 | 契约存在；创建/编辑/面域/渲染/拾取覆盖未审计；未按七维 full 门审计（W0 基线） | — | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:1282 | — | — | — |
| `feature.booleanAdd` | feature | partial | W3 | LubanFeatureType=booleanAdd；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.booleanBodies` | feature | partial | W3 | LubanFeatureType=booleanBodies；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.booleanSubtract` | feature | partial | W3 | LubanFeatureType=booleanSubtract；映射 UI 工具 boolean；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:64 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.chamfer` | feature | partial | W3 | LubanFeatureType=chamfer；映射 UI 工具 chamfer；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:53 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.cPlane` | feature | partial | W3 | LubanFeatureType=cPlane；映射 UI 工具 cPlane；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:113 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.draft` | feature | partial | W4 | LubanFeatureType=draft（shared 1.82.0）；映射 UI 工具 draft；TaperFaces 已按 ADR-0021 AX-01 接线，单 body 侧面+中性面 15° 真栈 3732.051 mm³、30° 3422.648 mm³；多 body 形态与跨 body 中性面策略；线性/中面/分型线等其余拔模模式；受影响 Onshape 示例 strict 晋升（当前无 strict 示例依赖 draft） | luban-cad/apps/web/src/modules/part-studio/dialogs/DraftDialog.tsx:104 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | 私有后端：draft registry schema + evaluator（W4 审计；证据留在私有仓） | docs/parity/KERNEL-BOUNDARIES.md#2-操作边界2026-11-19-v0（TaperFaces） | luban-cad/apps/web/e2e/draft-ui.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/DraftDialog.test.tsx |
| `feature.extrude` | feature | partial | W3 | LubanFeatureType=extrude；映射 UI 工具 extrude；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:48 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.faceExtrude` | feature | partial | W3 | LubanFeatureType=faceExtrude；映射 UI 工具 extrude；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:48 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.featureMirror` | feature | partial | W3 | LubanFeatureType=featureMirror；映射 UI 工具 mirror；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:63 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.featurePattern` | feature | partial | W3 | LubanFeatureType=featurePattern；映射 UI 工具 linearPattern；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:60 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.fillet` | feature | partial | W3 | LubanFeatureType=fillet；映射 UI 工具 fillet；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:49 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.hole` | feature | partial | W3 | LubanFeatureType=hole；映射 UI 工具 hole；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:59 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.loft` | feature | partial | W3 | LubanFeatureType=loft；映射 UI 工具 loft；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:56 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.mirror` | feature | partial | W3 | LubanFeatureType=mirror；映射 UI 工具 mirror；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:63 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.moveFace` | feature | partial | W3 | LubanFeatureType=moveFace；映射 UI 工具 moveFace；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:108 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.pattern` | feature | partial | W3 | LubanFeatureType=pattern；映射 UI 工具 linearPattern；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:60 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.revolve` | feature | partial | W3 | LubanFeatureType=revolve；映射 UI 工具 revolve；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:54 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.shell` | feature | partial | W3 | LubanFeatureType=shell；映射 UI 工具 shell；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:119 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.splitPart` | feature | partial | W3 | LubanFeatureType=splitPart；映射 UI 工具 splitPart；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:65 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.sweep` | feature | partial | W3 | LubanFeatureType=sweep；映射 UI 工具 sweep；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:55 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
| `feature.transform` | feature | partial | W3 | LubanFeatureType=transform；映射 UI 工具 transform；未按七维 full 门审计（W0 基线） | luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts:66 | luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:233 | — | — | — |
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
| `ui.sketchSlot` | tooling | partial | W1 | 偏移 ▾ 第二项「槽」：单条直线、单条开放圆弧、预选相连/闭合直线链（live DXF 同构：圆弧槽=R±Ø/2 同心弧+两半圆帽；开放链=端帽+外侧圆角/内侧斜接；闭合环=外侧圆角/内侧斜接、无端帽）与整圆中线（两同心整圆 R±w/2）。宽度驱动：单线/链/弧=Ø 直径约束；整圆/闭合环=shared 1.83 `slotWidth`（concentric/ring）单一尺寸同时驱动两侧（环槽 live 显示 Ø、整圆槽为线性宽度）；默认 Ø20、一次 updateSketch/updateSketchConstraint + 原生 undo/redo；真栈 sketch-slot.spec.ts 5 passed（单线/链/圆弧/整圆/闭合环，整圆与闭合环含视口尺寸标签双击改宽与 finish+reload）；圆弧参与的相连链槽；分支链槽；凹多边形/自交闭合环（外侧圆角语义未采证据）；多条互不相连曲线联动的等宽槽；live 宽度光标/拖拽预览（本切片为默认 Ø20 + 尺寸编辑） | luban-cad/apps/web/src/modules/part-studio/tools/sketch/SketchSlotTool.ts:1 | — | 私有后端：solver-neutral `slotWidth`（SolverTypes/SketchWireNormalizer/SlvsSolver；ring=2N 条内部 parallel+有符号垂距 ±w/2，concentric=2 圆心重合+8 条隐藏径向构造）+ `updateSketchConstraint` 白名单 | none | luban-cad/apps/web/e2e/sketch-slot.spec.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-slot-logic.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/sketch-annotations.test.ts<br>luban-cad/apps/web/src/modules/part-studio/test/SketchSlotTool.test.ts |
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
