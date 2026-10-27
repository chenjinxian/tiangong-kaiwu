# M7 特征契约补齐（boolean / loft / sweep / mirror / pattern / compositePart）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把六个缺口特征从「共享契约 → 后端参数化求值 → 前端参数面板 → 语料回放/测试」全链补齐；先做可复用语料与内核已证的 boolean/loft/sweep，最后做依赖多体架构的 body boolean/compositePart。

**Architecture:** 每个特征独立走「共享类型 → Registry schema → FeatureEngine 求值 → FeatureDialog 表单 → 语料/合成测试」同一模板；复用现有 `FeatureFormField` 与 `resolveEdgeRef/resolveFaceRef` 机制，新增引用种类（planeRef/bodyRef）单独裁剪。首版一律收窄参数面（无 guides/twist/任意轴），先让内核通道与特征树闭环。

**Tech Stack:** TypeScript / zod / iTwin.js `BRepGeometryOperation` / editor op（`EditBuiltInCommand`）/ React / Vitest / CorpusReplay.

**Spec:** `.superpowers/sdd/onshape-tutorial2-analysis/REPLAY-DESIGN.md`（Wave 4 规划）、`CORPUS-REPORT.md`、M6 系列计划；现状证据见本轮只读勘察（下文章节引用）。

## Global Constraints

- 特征必须可撤销：一律走 `BriefcaseTxns`/`saveChanges`，禁止第二套建模 API。
- 共享契约版本号递增并同步三处编译期精确断言：`LubanFeatureRpcInterface.test.ts:319`、`FeatureTypeRegistry.test.ts:181`、`FeatureRpcImpl.test.ts:124`。
- 每个特征首版参数面收窄（明确列出不支持项），不得静默降级；不支持即 zod 拒收。
- 语料回放新增 op 必须同步扩展 `corpus-to-ir.js` 与 `CorpusReplay.test.ts` 的 IR op 联合/执行器；未接线类型保持诚实停链。
- 每个任务结束：私有仓 `vitest` + `tsc --noEmit`；公开仓 web-next `vitest` + `tsc --noEmit`；真栈至少一条合成用例。

## 现状缺口矩阵（2026-10-27 勘察）

| 特征 | 共享契约 | MS 后端 | 内核/editor | UI | 语料可回放 | 结论 |
|---|---|---|---|---|---|---|
| mirror | ❌ | ❌ | 🟠 直改工具大概率空操作 | 🟠 ribbon 伪 toolId | 0 | 无参数化通道 |
| pattern | ❌ | ❌ | 🟠 仅前端复制元素 | 🟠 伪 ID/不一致 | 0 | 仅直改 |
| boolean（profile） | 🟠 复用 ExtrudeParams | 🟠 拒收 sketchId | ✅ Unite/Subtract | ❌ 无入口 | 间接（REMOVE） | 最小可闭环 |
| boolean（body） | ❌ | ❌ | 🟠 editor op 直改 | 🟠 伪 ID | 0 | 需多体 |
| compositePart | ❌ | ❌ | ❌ | ❌ | 0 | 需多体 |
| loft | ❌ | ❌ | ✅ 内核 Loft=9 + op30 | 🟠 伪 ID | 前缀体积 2 例 | 内核已证 |
| sweep | ❌ | ❌ | ✅ 内核 Sweep=8 + op20/29 | 🟠 仅面扫掠 | 0 | 内核已证 |

关键证据：
- 类型联合仅 7 项（`luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:30`），`FeatureFormFieldKind` 无 planeRef/bodyRef（:151）。
- 后端单 body：`FeatureService.ts:42,281-302,745`；`LubanCadSchema.ts:115`。
- mirror 直改调用 `mirrorElement`，但 `BasicManipulationCommand`/`BasicManipulationCommandIpc` 无该方法（`EditBuiltInCommand.ts:54-59`、`EditorBuiltInIpc.ts:44-56`）。
- pattern 通过 `insertGeometricElement` 复制（`PatternTools.ts:148,354`），不入特征树。
- loft/sweep 内核枚举见 `itwinjs-core/core/common/src/geometry/ElementGeometry.ts:217-220`；上游测试 `GeometryStream.test.ts:3035-3068` 已证 entry-array 通道。

## Task 1: boolean 草图驱动（首个里程碑，最小闭环）

**Files:**
- Modify: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（新增 `BooleanParams`；或显式扩 `ExtrudeParams` 并注释互斥）
- Modify: `luban-backend/modeling-server/src/feature/FeatureTypeRegistry.ts:87-96`（移除 `sketchId: z.never()`，加互斥 refine）
- Modify: `luban-backend/modeling-server/src/feature/FeatureService.ts:691-704`（两步制消费 sketchId）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.tsx:646-658,711-754`（布尔作用域映射到 featureType）
- Test: `FeatureService.test.ts`、`FeatureEngine.test.ts`、`FeatureTypeRegistry.test.ts`、`FeatureDialog.test.tsx`

**Interfaces:**
- Consumes: `resolveSketchRegions`（M6-a 已有）、`booleanAdd/booleanSubtract` 求值通道（`FeatureEngine.ts:258-272`）。
- Produces: `BooleanParams { sketchId: string; regionIndex?: number; regions?: number[]; distance: number; operation: 'unite'|'subtract' }`；`sketchId` 与 `profile` 互斥。

- [ ] **Step 1: 写失败测试**：`booleanSubtract` + `sketchId` 单面域 → 树新增节点 status=0，体积 = 解析值 ±1%；`sketchId` 与 `profile` 同时给 → zod 拒收；空面域 → 诚实错误。
- [ ] **Step 2: 跑测试确认失败**（当前 `sketchId` 被 `z.never()` 拒收）。
- [ ] **Step 3: 实现契约 + schema + 两步制 + UI 分支**：对话框的布尔作用域写入 `featureType`，提交 `sketchId/regions`；不支持的任意面域拾取保留下拉。
- [ ] **Step 4: 回归**：私有仓 feature 测试全绿；web-next unit + tsc；真栈合成用例（草图→booleanSubtract）。
- [ ] **Step 5: 提交**：`feat(shared/ms/web): boolean 草图驱动闭环——v1.10`。

## Task 2: loft（多草图截面）

**Files:**
- Modify: shared 契约（`LoftParams { sketchIds: [string, string]; sections?: number; bodyType: 'SOLID' }`）
- Modify: `FeatureTypeRegistry.ts`、`FeatureEngine.ts`（注册表分派零引擎改动，参考 `:365-370,523-527`）
- Modify: `FeatureDialog.tsx`（双草图选择器；首版不做 guides/end conditions）
- Test: 私有仓 `LoftFlow.test.ts`（合成两截面）；web-next 对话框测试

- [ ] **Step 1: 失败测试**：两个平行矩形草图 → Loft 体，体积介于两截面扫掠上下界且 bbox 正确；单草图 → zod 拒收。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：用 `SketchRegions` 提取每截面 Loop；`BRepGeometryOperation.Loft=9` entryArray；单 body 写回。
- [ ] **Step 4: 回归**：CorpusReplay loft 两例（`FeatureScript-Extend-Surface`、`FeatureScript-Surface-Pattern`）做**前缀体积**回放；默认 6/6 不回归。
- [ ] **Step 5: 提交**：`feat(shared/ms): loft 特征通道——v1.11`。

## Task 3: sweep（profile 沿路径）

**Files:**
- shared `SweepParams { profileSketchId: string; pathSketchId: string; bodyType: 'SOLID' }`
- Registry/FeatureEngine：内核 `Sweep=8`，entryArray = profile + path；复用 Task 2 多草图解析
- FeatureDialog：双草图选择器（首版无 twist/scale/lock）

- [ ] **Step 1: 失败测试**：圆截面沿直线路径扫掠 → 体积 = πr²L ±1%；路径非线/非相切 → 诚实拒收。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**（注意 `FeatureEngine.ts:100,139` 现有 Sweep 只用于 extrude 直线路径，需区分 profile/path entry）。
- [ ] **Step 4: 回归**：合成用例；语料唯一 sweep（Mold-Die）为生态过滤，仅登记不可回放。
- [ ] **Step 5: 提交**：`feat(shared/ms): sweep 特征通道——v1.12`。

## Task 4: mirror（参数化，最小平面集）

**Files:**
- shared `MirrorParams { plane: 'XY'|'YZ'|'XZ'; keepOriginal: true }`
- 后端：需先验证 BRep 反射变换通道（entryArray 变换或 editor op23 TransformSubEntity）；不可行则降级为 element-level 直改并如实标注
- 同时修复现有直改 `mirrorElement` 空操作（`EditBuiltInCommand.ts:54-59`、`EditorBuiltInIpc.ts:44-56`）

- [ ] **Step 1: Spike**：单测验证反射 placement/entryArray 能否作用于整个 body；输出可行/不可行证据。
- [ ] **Step 2: 失败测试**：盒体绕 XZ 镜像 + Unite → 体积 2×且 bbox 对称。
- [ ] **Step 3: 实现**（按 spike 结论选参数化或直改修复）；首版不支持任意面/基准面引用。
- [ ] **Step 4: 回归**：合成用例；语料 8 例全部登记「不可回放」原因。
- [ ] **Step 5: 提交**：`feat(shared/ms/web): mirror 通道`。

## Task 5: pattern（body 线性/圆周，首版）

**Files:**
- shared `PatternParams { kind: 'linear'|'circular'; count: number; spacing?: number; angle?: number; axis: 'X'|'Y'|'Z' }`
- 复用 Task 4 的 body 变换原语；首版只做 PART/body pattern（Onshape 样本多为 FEATURE pattern，明确不支持）
- 修正 ribbon 伪 toolId（`ribbon-registry.ts:424-432` vs `register-edit-tools.ts:166-167`）

- [ ] **Step 1: 失败测试**：盒体沿 X 线性 3 份 spacing 10 → 3 体/单 body 合并体积 3×；count=0/负 → 拒收。
- [ ] **Step 2: 确认失败**。
- [ ] **Step 3: 实现**；语料 17 例登记 FEATURE pattern 不支持的原因。
- [ ] **Step 4: 回归**：合成用例 + 与直改 PatternTools 的边界说明。
- [ ] **Step 5: 提交**：`feat(shared/ms/web): pattern 参数化通道（PART 级）`。

## Task 6: 多体架构 → body boolean / compositePart

**前置**：Task 4/5 的变换原语稳定；单 body 模型改造方案评审通过。

- [ ] **6.1 Spike 架构**：`LubanBodySolid` 单元素 → 多 body 的 schema/EDE/UDL 影响面；输出迁移与回滚方案。
- [ ] **6.2 compositePart 最小里程碑**：no-op 元数据特征 `{ bodies: LubanTopologyId[]; closed: boolean }`，status=0 入树，让语料链越过；不做几何合并。
- [ ] **6.3 body boolean**：`BooleanBodiesParams { tools: bodyRef[]; targets: bodyRef[]; operation: 'unite'|'subtract'|'intersect'; keepTools: boolean }`；新增 bodyRef 表单种类 + resolveBodyRef。
- [ ] **6.4 真多体写回**：多 body 树、可见性、保存/撤销、回放执行器。
- [ ] **验收**：33 例 booleanBodies/4 例 compositePart 语料中至少 1 例从停链转为可回放；默认 CorpusReplay 不回归。

## 验收与发布

- 每任务：单测 + tsc + 真栈合成用例；共享契约三处精确断言同步；发布窗重发 MS/镜像。
- 语料：新增接线必须扩展 IR op 联合与执行器；不可回放项在 `REPLAY-DESIGN.md` 登记原因。
- 回退：每任务独立 commit；首版参数面收窄，后续扩展不破坏既有参数。

## 风险与不确定项

1. mirror 的 BRep 反射通道未验证；若 entryArray 不支持非刚体反射，参数化 mirror 需降级或更高成本。
2. loft/sweep 的 entry-array 通道仅由上游 core-backend 测试证明，必须在 MS StandaloneDb 重新钉死。
3. Onshape pattern 样本多为 FEATURE pattern；首版 PART pattern 对语料覆盖率提升有限。
4. body boolean/compositePart 依赖多体架构，属本计划最大不确定项，先 spike 再承诺。

## Task 1 实现结果（B1 boolean，2026-10-27 本地）

- public `d0d133c`（shared v1.10 BooleanParams + FeatureDialog 映射）+ `ac44dab`（无上游门禁/相交禁用）；
  private `aa45267`（schema/两步制/sketchId 求值）+ `2f08ce3`（op 边界无上游拒收）。
- 契约：`BooleanParams { sketchId, regionIndex?, regions?, distance, operation }`；与内联 profile
  互斥；operation⇔featureType 一致；内联布尔旧路径保留。
- 验证：shared 108；web FeatureDialog 80、part-studio 668、i18n 10；MS feature 250+8 skip；
  三仓 tsc/lint 均绿。**真栈 synthetic 延后到发布窗**（MS 需重建产物/重启）。
- 复审修复：sketch-only 选加入/移除 不再产生 ok:true+status=1 死特征（MS 边界拒收 + UI 禁用/提示）；
  相交页签禁用并提示。
- 未推送（两仓本地 commit）；剩余 minor：cold/suppressed 上游同类吞错（既有）、禁用页签视觉、
  multi-region/regionIndex 端到端测试、测试顺序/租约。
