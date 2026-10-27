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

- [x] **6.1 Spike 架构（2026-10-27 完成）**：`LubanBodySolid` 单元素 → 多 body 的 schema/EDE/UDL 影响面；输出迁移与回滚方案。见下方「Task 6.1 spike 结论」。
- [ ] **6.2 compositePart 最小里程碑（暂缓；仅契约完整性 fallback）**：no-op 元数据特征 `{ bodies: BodyRef[]; closed: boolean }`，status=0 入树；**须 body-driving**（`bodyDriver=false` 已撤回）+ 只读 `getBodies` 折入 + compositePart 后下游特征测试；不做几何合并。
- [ ] **6.3 body boolean（前置改为 NEW-body + body 身份）**：`BooleanBodiesParams { tools: BodyRef[]; targets: BodyRef[]; operation; keepTools }`；真实前置是能生成第二个 body 的 NEW-body 语义 + bodyRef 解析，不是先做 6.4 树/可见性。
- [ ] **6.4 真多体写回（先做 1–2 周最小 A spike）**：两 body 元素 + getBodies/bodyKey=elementId + 逐 body 投影/写回 + 逐 body carrier/串行化 + 合成两体冷重建/undo；通过后再做多 body 树、可见性、保存/撤销、回放执行器。
- [ ] **验收（2026-10-27 spike 修订）**：默认 CorpusReplay 6/6 不回归；合成 `sketch→extrude→compositePart（含下游特征）` 可回放；合成两体 body boolean 夹具；真实 33 例 booleanBodies / 4 例 compositePart 逐例登记阻断原因，**不承诺真实语料转绿**（独立复核 0/33、0/4）。

### Task 6.1 spike 结论（2026-10-27，Revision 2，独立复审 decision-grade）

- 报告：`.superpowers/sdd/2026-10-27-b6-multibody-spike/task-1-report.md`；复审：同目录 `task-1-review.md`。
- **主推荐 Pivot，6.2 现在不开工**：最小 A spike（1–2 周，回答逐 body 投影/载体/两体冷重建/undo）→ NEW-body + `getBodies`/body 身份 → 合成两体 body boolean；暂缓 compositePart 与 importForeign。
- **单 body 是应用层约定**（schema 无唯一约束）：`queryBodySolid LIMIT 1`、单 `bodyId` ctx、`writeBody` 串接全部 source cache、单 carrier、单输出引擎；测试耦合 156 处/28 文件。
- **语料不可达**：33 booleanBodies 节点/29 PS 全被 importForeign/生态过滤（0 clean）；4 compositePart 中 3 例过滤，唯一原生 Isomantle 停在其前 8 个未接线特征、后还有 `linearPattern`（23/26）——0/33、0/4。
- **无第二 body 生成源**：B1–B5 有上游必 Unite，NEW≡ADD 是执行层死区分；body boolean 需先有 NEW-body（或 importForeign，后者 129 特征/0 几何 blob，属 XL 独立项目）。
- **表达层**：A（每 body 一个 `GeometricElement3d` + bodyKey=elementId）是唯一满足逐 body 可见性/选择的路线；B（单元素多 BRep）仅内部语义，历史 fillet 风险证据降级 `[I]/[S]`；C（容器 schema）无增量收益，D 不选。
- **修正版 6.2 仅契约完整性 fallback**（S/M，4–8 人日）：compositePart **body-driving**（旧 `bodyDriver=false` 会留陈旧 `prev→body`、下游插入后双 source 重复几何）、`getBodies` 必须折入、合成测试须含 compositePart 后的下游特征并断言每 body 一 source/单 BRep/体积 bbox 不变。
- **直改 PatternTools 泄漏**：复制 `LubanBodySolid` 且无 D7 标记，当前 ribbon 已改道参数化对话框，属 latent/historical；A 迁移前须审计并清理/收编多 BodySolid 副本。
- **需顺手修**：`booleanBodies` ribbon 是死点击命令（capability full、无注册工具）；`queryBodySolid LIMIT 1` 无 ORDER BY；FeatureTree 零件查询无 model/category 过滤。

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

## Task 2 实现结果（B2 loft，2026-10-27 本地）

- public `595c4bf` + `5164c0c` + `8144281`；private `697b01a` + `78920b5` + `3bd0b1c`。
- `LoftParams { sketchIds: [string,string]; sections?; bodyType:'SOLID' }`（v1.11）；两平行截面、
  单 body；`BRepGeometryOperation.Loft=9` entryArray；zod 拒收单/重复/非 SOLID。
- 合成验收：两平行矩形 → 解析体积 14/3 ±1%、bbox 三轴双侧 [0,2]、单 BRep；
  非平行在 apply/preview **事务前**拒收；holes 走 eval 诚实失败（前体保留）。
- UI：FeatureDialog 双草图选择器 + 最小入口；ribbon 伪 `loft` toolId 改接真对话框；
  陈旧选择/重复/两草图缺失均有门禁与提示。
- 测试：shared 112、web 685、private 259+8 skip；两仓 tsc/lint 绿。**未推送**。
- 剩余：upstream-ADD 测试、updateParams 守卫测试、`sections` 惰性、语料前缀回放、
  真栈 synthetic（发布窗）。

## Task 3 实现结果（B3 sweep，2026-10-27 本地）

- public `00c6960` + `2083bdb`；private `044f3b9` + `3a8bc93`。
- `SweepParams { profileSketchId; pathSketchId; bodyType:'SOLID' }`（v1.12）；`Sweep=8`
  entryArray=[profile,path]，单 body；路径=恰一条直线、方向与轮廓法向点积 >1e-6、
  无孔轮廓、无额外曲线；apply/preview 事务前拒收，eval 复用。
- 合成验收：圆半径 1、直线长 5 → 体积 5π ±1%、bbox 正确、单 BRep；斜向路径正例；
  同/平行面异草图路径、含孔、多曲线、多段路径均诚实拒收。
- UI：双草图选择器（轮廓/路径）+ 最小入口/ribbon 改接；测试 shared 116、MS 272+8 skip、
  web 855；tsc/lint 绿。**未推送**。
- 剩余：upstream-ADD/multi-lump 测试、真栈与语料（Mold-Die 生态不可回放）、
  updateParams 孔洞复查、测试顺序/重复块。

## Task 4 实现结果（B4 mirror，2026-10-27 本地）

- public `8b47038`；private `698de8e`。
- **Spike（先验证后实现）**：entryArray BRep `entityTransform` 反射**可行**（内核以 BODY
  transform 装回）；单镜像体是内翻体（有符号体积 −V），**原体在前 Unite 镜像体归正
  （+2V 单 mesh）**，反序整体内翻（−2V）——并集次序钉死。editor op23
  `transformSubEntities` 为 native stub（恒 ERROR）；`Placement3d` 只收 YPR（det=+1），
  负行列式不可表示 → 参数化 mirror 走反射 transform + Unite。
- `MirrorParams { plane:'XY'|'YZ'|'XZ'; keepOriginal:true }`（v1.13）；首版仅过世界原点
  主平面，整上游体反射后与上游 Unite（保留原体），单 body/多 lump 写回；无任意面/基准面
  引用；无上游/非 BRep displayable/非实体诚实拒收（apply/preview txn 前同文案）。
- UI：FeatureDialog 镜像平面下拉 + 上游门禁 + 范围提示；Ribbon `MirrorElements` 改道
  参数化入口；tree 标签 zh/en。
- **直改空操作修复**：`basicManipulation/mirrorElement` 落地——就地
  `Unite(原体, 镜像体)`（世界平面转元素局部系）+ D7 直改守卫 + 仅 BRep 实体；
  MirrorElementsTool 由「startEditCommand 塞载荷」改为 start → 逐元素 callEditMethod →
  save → finish。
- 验收：盒 [0,2]³ 绕 XZ → 有符号体积 16、bbox y∈[−2,2] 对称、单 BRep；YZ/XY
  updateParams 重求值；无上游 apply+preview 拒收不入树；直改同元素 2× 体积 + 守卫命中。
  测试 shared 120、web 860、MS feature 283+8 skip、editor frontend 35；tsc/build 绿。**未推送**。
- 语料 8 例**全部不可回放**（mirrorPlane 为任意面/基准面查询；MirrorType
  FEATURE/PART + NewBodyOperationType NEW 新体语义；上游 importForeign/FeatureScript
  Beam/Frame/splitJoint/booleanBodies/moveFace/compositePart 或配置相关）——仅登记原因，
  未尝试 replay。
- 剩余：任意面/基准面引用、`keepOriginal:false`（需 native 实体反倒向暴露）、非 BRep
  曲线镜像、真栈合成（发布窗重发产物）。

## Task 5 实现结果（B5 pattern，2026-10-27 本地）

- public `45e21fc384`（shared v1.14 + FeatureDialog/ribbon/i18n）+ `46e7bda4d7`（复审修复：
  hybrid 步进/REPLAY-DESIGN/count 上限/注释/remount 用例）；private `5a1c21c`（registry/
  schema/evaluator + PatternFlow）+ `071254e`（复审修复：I1/I2 + M1–M5）。
- **Spike（先验证后实现）**：entryArray BRep `entityTransform` 平移/旋转可行；N 实例一次
  Unite 得单 BRep/单 Polyface。线性 3× spacing 10 → 有符号体积 24、bbox [0,22]；偏轴盒
  圆周 3× → 24、bbox 与解析一致；旋转 det=+1 不翻绕序；互不接触实例的并集为多 lump 单
  body（合法形态）。无 native 改动需求。
- `PatternParams { kind:'linear'|'circular'; count; spacing?; angle?; axis }`（v1.14）；
  首版仅 PART/body：linear 沿世界 X/Y/Z、实例 k 位移 `k*spacing`；circular 绕世界 Z 过
  原点、`count` 含原件、`0<angle≤360`；步进 **整周 360 → angle/count，部分角 →
  angle/(count-1)**（首末夹总角）；count 2..1000；两形态键集互斥；整条上游体实例并集
  写回单 body（体积 count×；重叠实例按布尔去重）。
- MS：注册表 patternSchema/formFields；`evaluatePatternAsync` 逐 BRep 条目重编码
  `entityTransform` 后一次 Unite；apply/preview **事务前**同一文案拒收：无上游、链尾
  status≠0/缓存缺失、非 BRep/非实体；求值层兜底 count/spacing/angle/axis。复审 I2 修复
  堵住了「上游缓存缺失 → ok:true + status=1 死特征」B1 类回归（真实失败 fillet 复现）。
- UI：FeatureDialog kind/count/spacing/angle/axis + 上游门禁 + 字段级错误；Ribbon 下拉
  伪 id `circularPattern` → 真 toolId `CircularPattern`（改道参数化对话框）；`curvePattern`
  无工具/后端面，翻能力引导；`BODY_PRODUCING_FEATURE_TYPES` + pattern。
- 验收：PatternFlow 16/16（线性 3× → 24；圆周 360/部分角；updateParams 重求值；无上游/
  非 BRep/Sheet/上游不可用拒收；多 BRep 32；非恒等基组合；count 1001 拒收）；MS feature
  302+8 skip；shared 124；web 874；editor PatternTools 9/9；三仓 tsc 绿（web lint clean）。
- 语料 17 例（linear 5 + circular 6 + surface 5 + fill 1）**全部不可回放**：FEATURE
  pattern 不在首版契约；PART/NEW 独立新体语义 + 链内 importForeign/FS/moveFace 等未支持
  特征；surface/fill 为面级 FS。原因已登记 REPLAY-DESIGN v7（含 B4 8 例）。**未推送**。
- 剩余：FEATURE pattern/任意轴引用/曲线阵列/per-instance 变换；真栈合成（发布窗重发
  shared dist + MS 产物 + web，v1.14.0 须同发）；严格 360 才整周闭合；cap 内成本线性。
