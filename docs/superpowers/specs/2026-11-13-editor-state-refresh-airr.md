# AIRR — 编辑器状态/渲染刷新（草图选面即编辑 + 特征删除/下游体视口同步）

- 状态：Implemented（2026-11-13 工作树；无契约/后端/native 变更）
- 关联：用户 2026-11-13 反馈三项；P0-05（FeatureOp 单一编辑管道）、P0-06
  （params 唯一数据源，隐藏只是视口投影）、P0-10（事务/撤销语义不变）；
  接口冻结矩阵无变更、shared `interfaceVersion` 不变。

## 问题（用户报告）

1. 点击「草图」后在视口选择草图平面/草图面，仍需再点对话框 ✓ 才进入编辑；
   Onshape 语义是选面即创建并进入草图编辑。
2. 拉伸成功后双击特征树里的草图节点编辑时，下游拉伸体仍然显示；新建第二个
   Part Studio 也能看到第一个 Part Studio 的拉伸体。
3. 删除草图/拉伸节点后，渲染窗口不同步（实体残留）。

## 根因

1. `SketchDialog` 的平面选择只写本地/受控 `plane` 状态，创建动作唯一入口是 ✓ 的
   `handleConfirm`。视口 `SketchPlanePicker` / 特征树基准面拾取属于「外部
   `planeId` 变化」，没有提交路径。
2. 草图编辑时没有「下游体回滚」显示：`FeatureTree` 的 neverDrawn 隐藏集只有
   consumed body ∪ 手动隐藏；编辑草图时不推导「体源特征位于该草图之后」的
   active body。BRep 拓扑叠加（`BrepTopologyDecoration`）仍按 active bodies 绘制，
   即使 faces 已隐藏也会残留灰色拓扑线框。
3. 删除特征后体残留：`FeatureTree` 的 consumed 隐藏集从 `bodies` 推导，而宿主
   传入的 `bodies` 是 `displayBodies`（已过滤 `active=false`）——隐藏集恒空。
   调试观测：删除拉伸后 `getBodies` 已返回 `active=false`，但 `vp.neverDrawn`
   为空。这是本条的根因（数据源接错层，而非 EmphasizeElements 失效）。
4. 第二 Part Studio 短暂泄漏：B 模式 `activeModelIds` 在 `activePhysModelId`
   缺省/页签切换过渡窗口回落 `undefined`——viewer 语义是「全部模型」，过渡期
   会短暂显示其它 scope 的体。

## 修复

| 文件 | 变更 |
|---|---|
| `dialogs/SketchDialog.tsx` | 增加 `dropdownPlaneRef` 区分来源；新增 effect：**外部** `plane` 变化（视口/树拾取）且非编辑/非提交中/可编辑/平面非空时自动 `handleConfirm`（insertSketch → enterSketch）；下拉选择保留显式 ✓；初始平面不自动触发；编辑态不受影响 |
| `PartStudioPage.tsx` | ① `consumedBodyKeys` 改从**未过滤** `featureSystem.bodies`（`active === false`）计算并下传；② B 模式 scope 未解析时 `activeModelIds` 传 `[]`（fail-closed，清空 selector），A legacy 仍是 `undefined`；③ `useBrepTopology({ suppressed: sketchActiveForBrep })` |
| `hooks/useBrepTopology.ts` | 新增 `suppressed`：草图编辑时清空拓扑并**不**发后端读命令（草图工具会话占用 SolidModeling），退出草图后自动重读 |
| `tree/FeatureTree.tsx` | 新增 `consumedBodyKeys` prop（未过滤读面）；新增 `downstreamBodyKeys`：编辑某草图时，按 `entries` 顺序找出源特征在该草图之后的 active authored body；neverDrawn 并集 = consumed ∪ manual ∪ downstream，`replace=true`；并集空时 `clearHiddenElements` |
| `components/PartStudioSidebar.tsx` | `consumedBodyKeys` 透传到 `FeatureTree` |
| `e2e/*.spec.ts`（14 个既有） | 删除 `chooseSketchPlaneInViewport(...)` 后紧跟的对话框「确认」点击（新流程自动创建） |
| `e2e/editor-state-refresh.spec.ts` | 新增真栈回归 4 用例（见下） |

## 复用矩阵

| 关注面 | 复用 | 新增 |
|---|---|---|
| 视口隐藏 | iTwin `EmphasizeElements.hideElements/clearHiddenElements` + `vp.neverDrawn` | 无 |
| 模型 scope | viewer `activeModelIds` → `view.modelSelector.models` | B 过渡窗口空数组 fail-closed |
| 拓扑叠加 | 既有 `BrepTopologyDecoration`/`readBrepTopology` | `suppressed` 清空分支（不发读命令） |
| 草图创建 | 既有 `insertSketch` FeatureOp + `enterSketch`（orientCamera） | 外部平面变化自动触发；无新 RPC/新工具 |
| 事务/撤销 | `BriefcaseTxns`/FeatureOp 原样 | 无 |

## 范围与非目标

- 范围：草图新建入口、草图编辑态下游体显示、特征删除后的视口隐藏、Part Studio
  scope 过滤过渡窗口。
- 非目标：真正的 Onshape「回滚到该特征之前」特征回滚（仅显示近似：源特征序在
  草图之后的 body 隐藏）；跨 body 下游体推导不覆盖非 sourceFeatureId 的体；
  第二 PS 相机记忆/页签独立相机未做。

## 测试

- 单测：`apps/web` **137 files / 1784 tests passed**（更新 `FeatureTree` consumed
  并集/晚到 viewport 用例，`consumedBodyKeys` 显式下传；`PartStudioPage` B 半图
  damaged scope 断言改为 `activeModelIds: []`）。
- 真栈新增 `e2e/editor-state-refresh.spec.ts` **4 passed**：
  1) 选 Front 平面后不点 ✓ → 草图工具条出现、平面字段 Front、完成后树行可见；
  2) RPC 建盒（草图+拉伸）→ 双击草图 → `neverDrawn` 含 bodyKey、完成草图后清空；
     删除拉伸 → 零件数 (0)、`neverDrawn` 含 bodyKey；删除草图 → 树行消失；
  3) 第二个 Part Studio 只选自己的物理模型，切回/切回 selector 各归其位
     （首个 PS 体不泄漏）。
- 自动进入编辑流程回归（真栈 passed）：`sketch-bezier`、`sketch-center-arc`、
  `sketch-aligned-rectangle`、`sketch-center-rectangle`、`sketch-polygon`(2)、
  `sketch-point-tool`、`sketch-point-hole`、`sketch-tangent-arc`、
  `sketch-perimeter-circle`、`sketch-mirror-tool`、`hole`。
- 已知红（**本机环境既有失败，已用 `git stash` 还原未修改代码复跑同值复现**，
  不归因本改动，也未放宽断言）：
  - `tutorial2.spec.ts` 实时宽度像素断言 `width=83.38`（上界 83）；
  - `tutorial2-tools.spec.ts` 两用例实体/约束计数差 1（5/6、15/16，单次点击丢失）；
  - `examples/basic-drawing.spec.ts` 复用示例 iModel 上 20 条线只落 12 条
    （`getSketch.regions=[]`，草图面域为空）。
- `tsc`（src/e2e）与 `eslint` 绿。

## 风险 / 回滚

- 自动确认只作用于「新建 + 外部平面变化」；下拉选择、编辑态、初始平面保持原
  语义。回滚：删除 effect 与 `dropdownPlaneRef` 分支，恢复 14 个 spec 的确认点击。
- consumed/下游体隐藏只写视口 neverDrawn，不落 iModel/BIS；清除即恢复。
- B 模式 `[]` 在 scope 未解析时清空显示而非回落全模型；A legacy 行为不变。
- `suppressed` 只在草图编辑期间清空拓扑叠加，退出后重读，无持久副作用。
