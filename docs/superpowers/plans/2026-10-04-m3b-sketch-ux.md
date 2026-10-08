# M3-b 草图交互 UX（绘制+约束/尺寸+状态显示+既有 bug 清偿）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「草图」从空壳做成真功能——参数化草图全管道（op 面/读面/求解往返/绘制工具/模式行为），用户在草图模式里画线/圆、加约束/尺寸、改尺寸看全零件联动（M2 后端闭环的 UX 化），外加 M3-a 终审 ticket 波清偿（registerAllTools 修复/suppress e2e/EditorSidebar 清理/T7 盲点断言/归一化注释）。

**Architecture:** 后端净新增两 op（`insertSketch`/`updateSketch`——整体参数覆写+求解三态+几何流重写+EDE 传播，复用 M2 既有 `updateSketchConstraint` 管道骨架）与 `getSketch` 读面（实体/约束/最近求解状态结构化下发）；前端净新增草图绘制工具链（PrimitiveTool 子类：线/矩形/圆，点击放置+动态预览+实体累积面板）与约束/尺寸创建工具（拾取草图实体→构造约束→updateSketch 提交），SketchPanel 换真数据源，草图模式补行为（俯视图对齐+栅格+提示区）。交互求解走 MS 同步 RPC（T4.3 裁决：MS 往返，Onshape 先例）。

**Tech Stack:** 同 M3-a（私有仓 MS：ESM/zod/Vitest；前端：React hooks/iTwinUI v3/PrimitiveTool+Decorator/Playwright）。跨双仓。

**Spec:** `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（T6.5 :138 / T4.6 :102 / T4.7 :103 / M2-UX 清单 :106-114）；M3-a 终审 ticket 清单（`.superpowers/sdd/2026-10-04-m3a-v1-feature-complete/progress.md` 末段，已随 M3-a 合并入 git 历史）；memory `m3a-v1-feature-complete.md`（原生事实）。

## Global Constraints

- 双仓记账/分支/门禁/lint 口径/link: 禁 pnpm add/shared 改后必 build/非交互 CI=true——全沿 M3-a Global Constraints 逐字（见该计划，不重抄）。
- 分支：两仓各开 `feature/m3b-sketch-ux`（自各自 main HEAD：公开 `18839788ef` / 私有 `5aea8e4`）。
- **schema 演进纪律**：LubanCAD schema 只加不删不改——本计划**零 schema 变更**（草图平面扩展用 planeZ 既有字段之外的净新增属性一律不加；平面原点/法向属 T6.5 完整版，本计划裁定不做，见 Design Note 2）。
- **T4.3 裁决约束**：求解只在 MS（SlvsSolver 已在）；前端禁止 wasm/本地求解第二实现。
- **编辑硬约束**：一切真实库写经 EditTxn+saveChanges；草图 op 与特征 op 同一租约（WriteLease）。
- **每任务收尾门禁**：私有仓 `corepack pnpm@10 test`（基线 296 过/8 跳不回归）+ tsc 0 + lint 增量零新增；公开仓相关包 vitest 不回归（apps/web 基线 454 过/11 跳）；e2e 任务真栈（MS 源码模式）。
- **M3-b 不含**（显式划出）：T3.9/T3.10/T3.11/T3.12 完整版、装配、工程图、视口几何级预览（D-4 跟进归后续）、carrier dispose（ticket 留 M4）、op7/radii 原生修复（imodel-native 专项）、非流形集成臂（后端测试债，随原生专项）、e2e flake 专项排查（记录不阻塞）、lint 债 220 清偿（留 M4）、草图平面原点/法向自定义（T6.5 完整版——本计划只做 XY@z=0 的模式行为）。
- commit 风格：沿 M3-a（conventional+中文主语+任务号+trailer）。

## Design Notes（执行前必读）

1. **【裁决 E-1】草图 op 形状 = 两个 op 而非一套细粒度 op**。交互动作（画线/画圆/删实体/加约束/删约束/改约束值）全部收敛为 `updateSketch`（整体参数覆写）：前端工具维护实体/约束草稿集 → 任何变更即全量提交 → 后端求解三态 → 落库传播。理由：① 后端 `updateSketchParams` 已是整体覆写语义（FeatureService.ts:349-359），细粒度 op（addEntity/addConstraint…）是双倍协议面换来相同落库形状；② 撤销语义与 M1 口径一致（整体覆写 old/new params 天然可逆——但**本计划裁决草图 op 暂不入 invertible**，见 Design Note 5）；③ 工具实现只需维护一个草稿对象。`updateSketchConstraint`（改值专用）保留不动——updateSketch 是其超集。
2. **【裁决 E-2】草图平面 = XY@z=0 固定，T6.5 只做「模式行为」**。planeZ 存而不读、无原点/法向（探查实证）；完整平面定义是独立的较大工程（solver 工作平面参数化/几何流变换/读回投影三处净新增）。本计划：进入草图模式=俯视图对齐（StandardViewId.Top）+栅格显示+提示区；退出=恢复。平面选择 UI 与数据面显式划出。
3. **【裁决 E-3】绘制工具不继承 iTwin Create\* 工具**（它们写普通 3D 元素进不了草图领域模型，探查实证）。新写 `SketchLineTool/SketchRectangleTool/SketchCircleTool extends PrimitiveTool`：点击放置点（AccuSnap 已有）→ 累积为草稿实体 → 动态预览（Decorator 橡皮筋，仿 FenceDecorator 先例）→ 每次放置即 updateSketch 提交（乐观绘制：求解 ok/underconstrained 放行落库；conflicting/failed 拒收→前端回滚草稿+错误提示——与后端「拒收即库零变更」口径匹配）。
4. **【裁决 E-4】约束/尺寸创建复用 updateSketch，废弃 14 个空壳工具而非修补**。空壳工具（未注册/死 RPC/无预览）全部删除，新写 `SketchAddConstraintTool`（按 kind 参数化，拾取草图实体（草图元素是 GeometricElement3d 可 locate——但**实体级拾取需要几何流内子实体分辨**；v1 简化：拾取=点选实体顺序入队，候选面板上显式列出已选，右键确认）+ `SketchAddDimensionTool`（distance/radius，含 value 输入——尺寸放置点 v1 不做视口标注渲染，值入约束即生效，DOF 清单可见）。理由：空壳的工具类骨架（拾取计数/exitTool）可借鉴但 RPC 通道（OpenCloudRpcInterface 'sketch' commandId）是不存在的第二套 API，违反 CLAUDE.md 硬约束「禁止第二套建模 API」——特征 RPC 才是草图的正道。
5. **【裁决 E-5】草图 op 不入 invertible（undo 口径不变）**。M2 已裁决 updateSketchConstraint 不可逆（params 与几何流双写的回放一致性问题）；updateSketch/insertSketch 同理记 oplog 但 undo 报「无可撤销」。完整 undo 扩展（M2-UX #1）维持挂起——其正确解需要 params+几何流快照对，独立专项。
6. **【裁决 E-6】求解状态显示 = 面板清单（T4.7），视口分色不做**。分色需要 appearance 覆盖机制（零先例，净新增面大）；DOF/矛盾清单纯数据驱动（getSketch 返回最近求解结果），矛盾约束 id 在面板高亮——达 T4.7 出口「UI 可见」。视口内矛盾实体高亮留后续。
7. **【裁决 E-7】previewOp 对 updateSketch 的口径**：v1 沿用 M3-a「按现几何求值」最小口径（Task 5 deferred minor 同族）——updateSketch 的预览=试求解（不落库）返回三态+错误，不做全链影子求值。绘制工具的「乐观提交+拒绝回滚」与「先试算再提交」二选一：**本计划选先试算（previewOp(updateSketch)）再提交**——避免草稿回滚的闪烁，且 previewOp 管道已在。
8. **前端新文件布局**：`features/sketch/tools/SketchCreateTool.ts`（线/矩形/圆三子类+公共基类）、`features/sketch/tools/SketchAddConstraintTool.ts`、`features/sketch/tools/SketchAddDimensionTool.ts`、`features/sketch/hooks/useSketchSystem.ts`（草图数据 hook：getSketch/updateSketch 提交/求解状态/草稿管理）、`features/sketch/components/SketchPanel.tsx`（重构）；空壳 `SketchConstraintTool.ts`/`SketchDimensionTool.ts` 删除。e2e 新 spec `e2e/sketch.spec.ts`。
9. **既有 bug 清偿项**（M3-a 终审 ticket）：registerAllTools 修复（SelectAllTool 命名空间——修后全局快捷键含 Escape 复活，useEdgeRefPicker 自绑 Escape 需评估保留还是移除，裁决：保留（幂等安全，审查已判））；suppress e2e 臂；EditorSidebar 死容器清理（删除或正挂）；T7 旧两例补「面板无 db-not-open」断言；归一化函数计划注释（TestHost 文档已与代码一致，roadmap 风险 #9 注记补一句）。
10. **getSketch 的求解状态来源**：库内不存求解结果（只有 params+oplog dof）；`getSketch` 在服务端现场求解一次（实体/约束即参数）返回 status/dof/failedConstraintIds/conflictingRank/redundant——与面板「当前状态」语义一致（存结果会引入与 params 的一致性维护面）。SlvsSolver 同步调用，MS 进程内毫秒级（M2 实证）。
11. **多个草图**：querySketch 只读首张（LIMIT 1，v1 单草图假设）。`insertSketch` 需支持多草图（UI 切换），getSketch 按 sketchId 取（非首张）——querySketch 加可选 sketchId 参数。草图列表 RPC（listSketches）随 getSketch 一并下发（v1：返回全部 Sketch 行 id+实体数摘要）。FeatureParamForm 的 sketchId readonlyText 与「进入草图」入口联动（从特征树跳到对应草图）。

## File Structure

```
私有仓 D:\Github\luban-backend\modeling-server\src\
  feature/FeatureService.ts      [改] insertSketch/updateSketch op 分支（校验+apply+oplog+preEvaluateDirty）
  feature/FeatureRpcImpl.ts      [改] getSketch/listSketches RPC 实现（现场求解）
  feature/LubanCadSchema.ts      [改] querySketch 加 sketchId 可选参 / listSketchRows 助手
  feature/SketchOps.test.ts      [新] 两 op 出口测试（建→画线加约束→三态→拒绝零变更→EDE 传播→getSketch 读面）
公开仓 D:\Github\tiangong-kaiwu\luban-cad\
  packages/shared/src/rpc/LubanFeatureRpcInterface.ts  [改] FeatureOp +2 分支 / SketchDto/SketchSolveStatusDto 类型 / getSketch/listSketches 方法（v1.2.0）
  apps/web/features/sketch/
    hooks/useSketchSystem.ts     [新] 草图数据 hook
    tools/SketchCreateTool.ts    [新] 线/矩形/圆绘制工具链（+动态预览 Decorator）
    tools/SketchAddConstraintTool.ts [新] 约束创建工具
    tools/SketchAddDimensionTool.ts  [新] 尺寸创建工具
    components/SketchPanel.tsx   [改] 真数据源+实体/约束/尺寸三清单+DOF/矛盾显示
    components/SketchPanel.css   [改]
  apps/web/features/sketch/tools/SketchConstraintTool.ts [删] 空壳
  apps/web/features/sketch/tools/SketchDimensionTool.ts  [删] 空壳
  apps/web/src/pages/Editor/Editor.tsx [改] 草图模式行为（视角/栅格/提示）+SketchPanel 接线
  apps/web/features/editor/registerTools.ts [改] 修复 SelectAllTool 注册死亡（ticket）+注册新草图工具
  apps/web/e2e/sketch.spec.ts    [新] 草图 UX e2e
  apps/web/e2e/features.spec.ts  [改] suppress 臂+T7 盲点断言（ticket）
  apps/web/features/editor/components/EditorSidebar.tsx [删或正挂]（ticket）
```

---

### Task 1: shared 契约扩展（insertSketch/updateSketch op + getSketch/listSketches 读面，v1.2.0）

**Files:**
- Modify: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`、`src/index.ts`
- Test: `LubanFeatureRpcInterface.test.ts`（追加）

**Interfaces:**
- Produces（后续任务 wire 真相，逐字）:

```ts
/** 草图实体/约束（solver-neutral，与后端 SolverTypes.ts 同形——注释注明两端同源维护） */
export type SketchEntityDto =
  | { kind: "point"; id: number; x?: number; y?: number }
  | { kind: "line"; id: number; p1: number; p2: number }
  | { kind: "circle"; id: number; center: number; radius?: number };
export interface SketchConstraintDto {
  kind: "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "equal" | "distance" | "radius";
  id: number; refs: number[]; value?: number;
}
export type SketchSolveStatusDto = "ok" | "underconstrained" | "conflicting" | "failed";
export interface SketchSolveStateDto { status: SketchSolveStatusDto; dof: number; failedConstraintIds: number[]; conflictingRank: number[]; redundant?: boolean }
export interface SketchDto { id: string; entities: SketchEntityDto[]; constraints: SketchConstraintDto[]; solve: SketchSolveStateDto }
export interface SketchSummaryDto { id: string; entityCount: number; constraintCount: number }

export type FeatureOp =
  | ...（既有 8 分支不变）
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }
  | { kind: "updateSketch"; sketchId: string; entities: SketchEntityDto[]; constraints: SketchConstraintDto[] };

// RPC 类新增（interfaceVersion 升 "1.2.0"）：
public async getSketch(_iModelKey: string, _sketchId: string): Promise<SketchDto | undefined> { return this.forward(arguments); }
public async listSketches(_iModelKey: string): Promise<SketchSummaryDto[]> { return this.forward(arguments); }
```

- [ ] **Step 1: 失败测试**——类型断言（新 op 分支可赋值、SketchDto 形状、interfaceVersion==="1.2.0"）；同步改既有版本断言。
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 绿 + `corepack pnpm@10 build`**
- [ ] **Step 5: Commit** `feat(shared): 特征 RPC v1.2——insertSketch/updateSketch op+getSketch/listSketches 读面（M3-b T1）`

### Task 2: MS insertSketch/updateSketch op + getSketch/listSketches

**Files:**
- Modify: `FeatureService.ts`（两 op 分支）、`FeatureRpcImpl.ts`（两读面）、`LubanCadSchema.ts`（querySketch 参数化+listSketchRows）
- Test: `src/feature/SketchOps.test.ts`（新）

**Interfaces:**
- Consumes: Task 1 类型；`insertSketchElement/updateSketchParams/writeSketchLineGeometry/sketchLinesFromEntities`（既有）；`SlvsSolver`/`validateSketchRequest`（solver 面）；`solveSketchChecked` 三态口径（ok+underconstrained 放行，conflicting/failed 拒收库零变更）；`writeBackSolvedCoordinates`（解算坐标回写）
- Produces: `applyOp` 两新分支——insertSketch：校验请求 → 求解放行 → insertSketchElement+初始解算落几何流 → oplog → save（空闭包，无下游）→ `{ok:true, featureId: sketchId}`；updateSketch：整体覆写 params+解算坐标+几何流 → oplog → preEvaluateDirty（草图脏闭包）→ save 传播；getSketch(sketchId)→现场求解返回 SketchDto（草图不存在→undefined）；listSketches→全行摘要。

- [ ] **Step 1: 出口测试（先红）**：(a) insertSketch 矩形（SketchFlow fixture 同构）→ ok+sketchId 返回+几何流非空+getSketch 读回实体/约束+求解 dof=0；(b) updateSketch 加一条线+约束 → ok:true、实体清单增长、求解状态变（dof 变化）；(c) updateSketch 注入矛盾约束 → ok:false 错误含冲突 id、库三处零变更（params/几何流/body）；(d) updateSketch 改尺寸值（经 updateSketch 全量提交，不用 updateSketchConstraint）→ 下游 extrude body 联动（EDE 传播）；(e) getSketch 不存在 id→undefined；listSketches 多草图摘要；(f) undo 对两 op 报「无可撤销」。
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 绿+门禁 → Step 5: Commit** `feat(modeling-server): insertSketch/updateSketch op+getSketch/listSketches——草图写面全管道（M3-b T2）`

### Task 3: useSketchSystem hook（前端数据管道）

**Files:**
- Create: `apps/web/features/sketch/hooks/useSketchSystem.ts` + test
- Test: `useSketchSystem.test.ts`

**Interfaces:**
- Consumes: Task 1 `SketchDto/SketchSummaryDto/FeatureOp`；`LubanFeatureRpcInterface.getClient()`（Task 6 范式）
- Produces:

```ts
export interface UseSketchSystem {
  sketches: SketchSummaryDto[]; activeSketch?: SketchDto; loading: boolean; error?: string;
  openSketch(id: string): Promise<void>; closeSketch(): void;
  previewUpdate(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<SketchSolveStateDto | { ok: false; error: string }>;
  applyUpdate(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult>;
  createSketch(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult>;
  refresh(): Promise<void>;
}
export function useSketchSystem(connection: BriefcaseConnection | undefined, fs: UseFeatureSystem | undefined): UseSketchSystem;
```

行为规格：activeSketch=getSketch 结果（含 solve 状态）；previewUpdate=构造 updateSketch op 走 fs.previewOp（返回三态——预览的 PreviewResult.error 文本含 dof/冲突 id（Task 5 口径）；**简化裁决：previewUpdate 直接调 applyFeatureOp 太写、调 previewFeatureOp 得文本——getSketch 的现场求解才是结构化解。previewUpdate 的实现=调 previewFeatureOp 解析 error 文本？否——更好的路：previewUpdate 走 getSketch 同构的「试求解」是不存在的 RPC。裁决实现：previewUpdate 先 applyUpdate（真提交），失败回滚由后端拒收零变更天然保证——即 Design Note 7 简化为「乐观提交+拒收零变更=天然无脏态」，previewUpdate 方法删除，工具直接 applyUpdate 读 FeatureOpResult。**（实现者注意：接口以本段最终裁决为准——无 previewUpdate，错误从 applyUpdate 的 ok:false.error 拿）；onCommitted（connection.txns）→ refresh activeSketch。

- [ ] **Step 1: 失败测试**（mock getClient+fs；建/开/关/applyUpdate 成功刷新/失败 error 透出/onCommitted 刷新）
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 绿+apps/web 门禁 → Step 5: Commit** `feat(web): useSketchSystem 草图数据 hook——getSketch/listSketches/op 提交管道（M3-b T3）`

### Task 4: 草图绘制工具链（线/矩形/圆+动态预览）

**Files:**
- Create: `apps/web/features/sketch/tools/SketchCreateTool.ts` + test
- Modify: `features/editor/registerTools.ts`（注册三工具）
- Test: `SketchCreateTool.test.ts`

**Interfaces:**
- Consumes: `PrimitiveTool`（@itwin/core-frontend）；`IModelApp.accuSnap.currHit`（取点）；`AccuDrawHintBuilder`（XY 面强制）；FenceDecorator 橡皮筋先例（`src/core/tools/SelectionTools.ts:209-263`）；Task 3 `UseSketchSystem.applyUpdate`（提交）；实体 id 分配约定（客户端递增 maxId+1）
- Produces: `abstract class SketchCreateTool extends PrimitiveTool`（requireWriteableTarget；initLocateElements(false)；onDataButtonDown 取点→草稿实体累积→applyUpdate 提交→失败 toast+草稿回滚；Decorator 橡皮筋动态预览（wantDynamics=false，用 onMouseMotion 更新+invalidateDecorations））+ `SketchLineTool（两点）/SketchRectangleTool（对角两点→4 点 4 线+coincident×4 自动）/SketchCircleTool（圆心+半径点）`；`runSketchCreateTool(kind, sketchSystem, opts)` 启动函数。工具 id：`Sketch.CreateLine/Sketch.CreateRectangle/Sketch.CreateCircle`。

- [ ] **Step 1: 失败测试**（mock accuSnap/decorator/sketchSystem；线的两次点击→实体集（2 point+1 line）→applyUpdate 参数断言；矩形→4+4+4 coincident；圆→point+circle；提交失败→草稿回滚+toast）
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 注册+门禁 → Step 5: Commit** `feat(web): 草图绘制工具链——线/矩形/圆+橡皮筋预览+乐观提交（M3-b T4.6 绘制面）`

### Task 5: 约束/尺寸创建工具

**Files:**
- Create: `apps/web/features/sketch/tools/SketchAddConstraintTool.ts`、`SketchAddDimensionTool.ts` + tests
- Modify: `features/editor/registerTools.ts`（注册）
- Test: 两测试文件

**Interfaces:**
- Consumes: Task 4 工具基类范式；Task 3 applyUpdate；`SketchConstraintDto` 槽位规则（SolverTypes 冻结：coincident=2 point、horizontal/vertical=1 line 或 2 point、parallel/perpendicular=2 line、equal=2 line 或 2 circle、distance=2 point+value>0、radius=1 circle+value>0）
- Produces: `SketchAddConstraintTool(constraintKind)`——onDataButtonDown 拾取草图实体（locate 到草图元素后按命中点距离取最近实体——**v1 简化：按 hitPoint 与实体端点距离选 point/line/circle**，实现细节实现者定但测试须钉行为）；累积 refs 至槽位数 → 自动提交（无值约束）或弹值输入（distance/radius——用 iTwinUI Dialog 或 outputPrompt+AccuDraw 值输入？**裁决：工具内小 Dialog（React 面板侧值输入框，工具经事件桥把候选约束发给面板，面板确认后提交）**——与 M3-a 的「工具→面板事件」先例（SolidModelingToolBase 的 solidModelingEvents）同构）；工具 id：`Sketch.AddConstraint.<kind>`/`Sketch.AddDimension.<kind>`。

- [ ] **Step 1: 失败测试**（拾取 2 point→coincident 提交参数断言；distance 经值确认事件→带 value 提交；槽位错误（distance 选 line）→提示不提交；右键取消）
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 注册+门禁 → Step 5: Commit** `feat(web): 约束/尺寸创建工具——槽位驱动拾取+值确认桥（M3-b T4.6 约束面）`

### Task 6: SketchPanel 重构（真数据+DOF/矛盾清单，T4.7）

**Files:**
- Modify: `SketchPanel.tsx`（重构）、`SketchPanel.css`
- Delete: 空壳 `SketchConstraintTool.ts`、`SketchDimensionTool.ts`（及 index.ts 引用）
- Test: `SketchPanel.test.tsx`（重写）+ e2e 第一批

**Interfaces:**
- Consumes: Task 3 `UseSketchSystem`；Task 4/5 工具启动函数；Task 1 `SketchDto`
- Produces: SketchPanel props 改 `{ isActive, onExit, sketchSystem, onToast }`；三 tab 真实化——元素 tab=实体清单（`#id kind（坐标/半径摘要）`+删除（updateSketch 移除实体+连带约束））；约束 tab=约束清单（kind+refs+**矛盾/失败 id 红标**（solve.failedConstraintIds/conflictingRank 命中））；尺寸 tab=distance/radius 清单（value 可编辑→updateSketch 提交）；头部 DOF 徽标（`自由度: N`（恰定 0=positive 绿/欠约束>0=informational/矛盾=negative 红））+「新建草图」按钮（空实体起步）+绘制工具按钮组（线/矩形/圆）+约束工具按钮组（kind 下拉或按钮排）+尺寸按钮组（distance/radius）。

- [ ] **Step 1: 失败测试**（三清单渲染/DOF 徽标三态/矛盾红标/删除实体连带约束提交/尺寸编辑提交）
- [ ] **Step 2: 红 → Step 3: 实现（空壳删除）→ Step 4: e2e 第一批（sketch.spec.ts：进入草图模式→SketchPanel 可见→新建草图→绘制按钮激活 Sketch.CreateLine 工具→退出模式）→ Step 5: 绿+门禁+e2e → Step 6: Commit** `feat(web): SketchPanel 接真数据——实体/约束/尺寸清单+DOF/矛盾显示（M3-b T4.7+面板）`

### Task 7: 草图模式行为（T6.5：俯视对齐+栅格+提示区）+ 特征树联动

**Files:**
- Modify: `src/pages/Editor/Editor.tsx`（模式切换行为）、`FeaturePanel.tsx`（sketchId 行加「编辑草图」入口）
- Test: `Editor.test.tsx`（追加）+ e2e 追加

**Interfaces:**
- Produces: 进入草图模式→viewport `changeView` 俯视（StandardViewId.Top 等价 API——用 viewManager.selectedView 的 ViewController 旋转到顶视，保持中心/比例）+栅格显示（viewFlags.grid=true 恢复时还原）+状态栏提示文本（「草图模式：XY 平面」）；退出→恢复视角/栅格。特征树中 sketch 驱动特征（params.sketchId 存在）行显示「编辑草图」按钮→点击→onEnterSketchMode+useSketchSystem.openSketch(sketchId)。

- [ ] **Step 1: 失败测试**（模式切换调 viewController/栅格 flag 断言（mock viewport）；特征行 sketchId→按钮出现→点击回调）
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: e2e 追加（进入模式→状态栏提示可见；特征树建 sketch 驱动 extrude（经 e2e 流程：先建草图再建特征）→「编辑草图」按钮回跳）→ Step 5: 绿+门禁+e2e → Step 6: Commit** `feat(web): 草图模式行为——俯视对齐/栅格/提示+特征树联动入口（M3-b T6.5 模式面）`

### Task 8: ticket 清偿波（registerAllTools 修复+suppress e2e+EditorSidebar+T7 盲点+归一化注记）

**Files:**
- Modify: `features/editor/registerTools.ts`（SelectAllTool 修复）、`e2e/features.spec.ts`（suppress 臂+盲点断言）、`EditorSidebar.tsx`（删除或正挂）、`docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（风险 #9 注记）
- Test: registerTools 修复验证（全局 Escape 复活——单测断言工具注册零抛错+`IModelApp.tools.run` 可达）+ e2e

**Interfaces:**
- Consumes: M3-a 终审 ticket 清单
- Produces: ① registerAllTools 死因修复（SelectAllTool 裸 Tool 无 namespace——查 itwinjs-core SelectionTools 的正确注册姿势（`IModelApp.tools.register(SelectAllTool, typeof Tool)` 或 namespace 补建）；修复后 `registerAllTools()` 全程零抛错，全局快捷键链（KeyboardManager→startDefaultTool）复活——useEdgeRefPicker 自绑 Escape **保留**（M3-a 裁决：幂等安全）但注释更新）② features.spec.ts 追加 suppress 臂（建特征→抑制→灰标→解除）③ T7 旧两例补「面板无 db-not-open 文本」断言 ④ EditorSidebar：删除（grep 零生产挂载后删+barrel 清理）或正挂——**裁决：删除**（FeatureTreePanel 已是正主）⑤ roadmap 风险 #9 注记补「归一化函数选择以 TestHost 文档为准（缓存条目=normalizeFeatureCacheJson，持久几何流=normalizeBrepGeomJson）」。

- [ ] **Step 1: 失败测试**（registerAllTools 调用零抛错断言——当前必红；suppress e2e 臂；盲点断言）
- [ ] **Step 2: 红 → Step 3: 实现 → Step 4: 绿+门禁+e2e 全量（45+5+新 suppress=51？——按实际计数）→ Step 5: Commit** `fix(web): registerAllTools 注册死亡修复+ticket 清偿（suppress e2e/盲点断言/EditorSidebar 删除）（M3-b T8）`

### Task 9: 收口——全量门禁、roadmap/CLAUDE.md、终审、合并

**Files:**
- Modify: roadmap（T6.5/T4.6/T4.7 ✅ 含裁决注记；M3 里程碑行 M3-b 达成；M2-UX 清单核销 #3/#4（#4 已在 M3-a 清偿——核对）/更新 #1/#2 状态；审查记录追加 M3-b 节）
- Modify: `luban-cad/CLAUDE.md`（功能状态表草图行）
- Modify: 私有仓 `CLAUDE.md`（基线数）

- [ ] **Step 1: 双仓全量门禁**（私有 296+N 过/8 跳+tsc 0+lint 零新增；公开各包+e2e 全量真栈）
- [ ] **Step 2: demo-flow.mjs 复核**（草图模式步骤可选增补）
- [ ] **Step 3: 文档更新+commit** `docs: M3-b 收口——roadmap/CLAUDE.md（M3-b T9）`
- [ ] **Step 4: 终审请求**（fable 整支；台账含本计划裁决 E-1~E-7 与 deferred minor）
- [ ] **Step 5: 终审修复波→memory→合并（用户确认点·四停）**
- [ ] **Step 6: 产物发布决定（用户确认点）**——M3-a+M3-b 合并后发 `publish.ps1 -Tag backend-202610XX`（原生 DLL 含 aacbcf2d0 修复，发布链含 dev build 覆盖——发布后 verify-stack 14/14 复核）

## Self-Review 结论

1. **Spec 覆盖**：T6.5=Task 7（模式面；完整平面定义显式划出并注记）；T4.6=Task 4+5（绘制+约束+尺寸）；T4.7=Task 6（DOF/矛盾清单 UI 可见）；M2-UX #3（端点吸附）=Task 4 AccuSnap 启用现状+绘制工具取点经 accuSnap.currHit（吸附已开——断链诊断属后端 chainClosedLoop 消费面，extrude 轮廓读取已有断链守卫报错经 FeatureOpResult 上呈，Task 6 面板可见错误）；M2-UX #1/#2 维持挂起（Design Note 5/E-2 注记）；终审 ticket=Task 8（registerAllTools/suppress e2e/EditorSidebar/T7 盲点/归一化注记）+显式划出项（carrier dispose/op7/radii/非流形臂/flake 专项/lint 债——roadmap/台账有主）。
2. **占位符扫描**：Task 5 拾取实体分辨留了「按 hitPoint 距离」的 v1 简化裁决（非占位，是显式简化+测试钉行为）；Task 3 的 previewUpdate 在 Interfaces 段内完成裁决（删除，乐观提交）——实现者读到的就是最终口径。
3. **类型一致性**：SketchEntityDto/SketchConstraintDto 与后端 SolverTypes 同形（Task 1 注释同源纪律）；insertSketch/updateSketch 参数形状 Task 1↔2↔3↔4↔5 一致（entities+constraints 全量）；getSketch 返回 `SketchDto | undefined` Task 1↔2↔3 一致；工具 id 命名空间 `Sketch.*` Task 4/5/6 一致；UseSketchSystem 方法集 Task 3 定义=Task 4/5/6 消费集。
4. **裁决偏离清单**（供用户评审）：E-1 草图 op=两个整体覆写 op（非细粒度 op 族）；E-2 平面=XY 固定（T6.5 只做模式行为）；E-3 绘制工具全新写（不继承 iTwin Create*）；E-4 14 空壳工具删除（非修补）；E-5 草图 op 不入 invertible；E-6 状态显示=面板（视口分色不做）；E-7 预览=乐观提交+拒收零变更（不做试算预览）。
