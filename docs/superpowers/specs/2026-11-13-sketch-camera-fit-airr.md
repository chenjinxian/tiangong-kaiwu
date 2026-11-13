# AIRR — 草图相机零副作用 + 「缩放到合适大小」可见内容取景

- 状态：Implemented（2026-11-13 工作树；无契约/后端/native 变更）
- 关联：用户 2026-11-13 反馈（选草图平面后相机不应该变动；缩放到合适大小要与
  Onshape 一样，不是 project extent 或某个几何体的包围盒）；P0-01（唯一渲染
  底座）、P0-03（live 证据优先）、P1-05（默认 iTwin 相机/视图状态，不引入
  第二相机权威）；接口冻结矩阵无变更、shared `interfaceVersion` 不变。

## Live 证据（私有 `onshape-parity-data/ui-evidence/sketch-camera-fit-20261113/`）

- `f4-sketch-plane-selected.png`（Stage 0）：Onshape 新建草图选定 Front 平面后
  **仍是等轴测视角**——不转正、不自动缩放。
- `40-ps2-before.png` → `43-after-plane-1s8.png`：有 12 个实体的 Part Studio 中
  新建草图选 Front 平面，相机**逐像素一致**（仅多出草图对话框与平面高亮）。
- `12-global-fit.png` / `21-ps1-fit.png`：草图编辑中按 `f`（Zoom to fit）→
  取景**草图实体**（此前在视口外的线段全部可见），ViewCube 旋转不变；可见的
  基准面边框越过视口边缘，说明基准面装饰不并入实体取景。
- `23-ps2-fit.png` → `44-empty-sketch-fit.png`：有实体 + 空草图时按 `f`，取景
  仍为实体范围（空草图不改变取景）。
- 探针产生的临时 `草图 3` 已用红 X 取消并核对树/12 零件未变（`50-after-cancel.png`）。

## 问题与根因

1. 选中草图平面后相机被 `useSketchCamera` 接管：新建草图按平面 frame
   `orientCameraToSketchPlane`（转正）+ 空草图后按实体范围取景；退出恢复快照。
   与 live 证据不符（用户明确要求相机交给用户）。
2. 「缩放到合适大小」存在三条不一致实现：
   - 页签条/画布右键：`viewport-actions.fitView()` → `view.computeFitRange()`
     = 已加载 tile 树并集，空集回退 **projectExtents（±500 m）**；
   - ViewCube 菜单：模型联合范围（只含实体，忽略可见草图）；
   - 草图对话框：只取草图实体包围盒，空草图回退模型范围。
   均与 Onshape「可见内容取景」不一致。

## 修复

| 文件 | 变更 |
|---|---|
| `dialogs/SketchDialog.tsx` | `enterSketch(id)` 不再携带相机选项（新建/纯回调路径一致） |
| `stores/use-part-studio-store.ts`、`types.ts` | 删除 `orientCamera` 选项与 `orientCameraOnEnter` 状态（无相机权威字段） |
| `hooks/useSketchCamera.ts`（删除） | 移除进入定向/取景/退出快照回放 |
| `canvas/sketch-camera.ts` | 删除 `captureSketchCamera`/`restoreSketchCamera`；保留显式命令：`orientCameraToSketchPlane`（正视草图平面）与 `fitCameraToSketch`（草图实体右键的实体级取景） |
| `packages/viewer/src/viewport/fit-view.ts` | 新增 `fitViewToVisibleContent(viewport, {modelIds, sketchRange, datumPlanesVisible, paddingPercent})`：模型范围 ∪ 草图范围；仅当并集为空且基准面可见时用基准面装饰范围兜底；**永不使用 projectExtents**；无任何内容时 no-op（相机不动）；`lookAtVolume` 按当前旋转取景（不旋转） |
| `internal/fit-visible.ts`（新增） | 应用出口：从 view state 的 model selector 取当前可见模型、活动草图 → `sketchWorldRange`、store 的 datum 可见性；草图态留白 `22/5/8/8`（避让左面板），普通态 `6/6/8/8` |
| `components/ViewCubeCameraMenu.tsx`、`ViewCube.tsx`、`ItwinViewCube.tsx` | 「缩放到合适大小」经宿主 `onFitVisibleContent` 出口；缺省回退模型范围（壳期/测试） |
| `components/PartStudioCanvas.tsx` | 统一 `fitVisible`；ViewCube/右键菜单/草图对话框三处共用；README 草图对话框按钮不再是草图包围盒特例 |
| `PartStudioPage.tsx` | 页签条「适应视图」改走 `fitVisible`；删除 `useSketchCamera` 调用 |
| `canvas/CanvasContextMenu.tsx` | 新增 `onFitView` 出口（缺省模块级 `fitView` 仅测试/壳期） |
| `e2e/sketch-camera-fit.spec.ts`（新增） | 真栈回归 2 用例（见下） |

## 复用矩阵

| 关注面 | 复用 | 新增 |
|---|---|---|
| 相机 | iTwin `ViewState.setRotation/lookAtVolume/synchWithView`（显式命令） | 删除应用级自动相机状态机 |
| 模型范围 | `IModelConnection.models.queryModelRanges`（内容感知，非 tile 时序） | 可见内容并集 API |
| 基准面 | 既有 `DatumPlanesDecoration`/`datumPlanesRange`（同一 `emptyViewRangeMm=150` 口径） | 空场景取景兜底分支（不旋转） |
| 草图范围 | 既有 `sketchWorldRange`（已解算实体） | 传给 viewer 的显式输入 |
| 旋转 | `lookAtVolume` 按当前旋转 | 无 |

## 测试

- viewer：18 files / **154 tests passed**（新增 6 例：模型∪草图、空模型+草图、
  基准面兜底非 projectExtents、无内容 no-op、范围查询失败仍取景草图、晚到守卫）。
- web 单测：**136 files / 1778 tests passed**（删除 `useSketchCamera` 及其 5 例、
  裁剪 snapshot 用例；受影响 6 files 先行 131 passed）。
- 真栈新增 `e2e/sketch-camera-fit.spec.ts` **3 passed**（含 auth）：
  1) 选 Front 平面后相机旋转/origin/extents 完全不变；缩远后 ViewCube
     「缩放到合适大小」回到基准面量级（< 1000，且 > 20），旋转不变；
  2) 未转正的相机下画 20×20 mm 矩形 → 草图对话框「缩放到合适大小」聚焦草图
     （extents < 100）、旋转不变。
- 受影响草图工具真栈批（11 specs / 17 tests）：**15 passed**；
  `sketch-polygon`（外切）与 `sketch-tangent-arc` 在 15.7 min 长批末段失败，
  单独重跑各 **2 passed**（批量负载下的点击抖动）。
- 相关真栈：`ui-parity.spec.ts`（相机断言已改为进入/退出均不变）、
  `sketch-camera-parity.spec.ts`（编辑既有草图保持相机 + 显式正视命令）、
  `editor-state-refresh.spec.ts` 均绿。
- 既有红（与本次无关）：`sketch-extrude.spec.ts` T8（线+三点弧闭环→面域）
  在当前环境失败；用 `git stash` 回到**不含本次相机改动的已提交代码**复跑
  同样失败（三点弧未与线闭合、`regions=0`），属既有问题，登记不归因本切片。
  其余既有红见 `2026-11-13-editor-state-refresh-airr.md`。
- `tsc`（src/e2e）与 `eslint` 绿。

## 范围与非目标

- 非目标：Onshape 草图对话框底栏控件本身（live 为「显示草图诊断工具 + 成品 +
  ?」；本仓保留既有「正视草图平面 / 缩放到合适大小 / ?」按钮，仅统一取景语义）；
  视图相机记忆/页签独立相机；特征提交后自动取景（既有行为，未在本切片改动）。
- 草图实体右键「缩放到合适大小」仍是**显式实体范围**取景（选择驱动的独立动作），
  不并入全局可见内容取景。
- 隐藏/consumed body 的**元素级**排除不在本切片：范围查询按 scope 内模型粒度
  （iTwin 无 element 范围读面；与旧行为一致），模型内被隐藏 body 仍计入范围。

## 风险 / 回滚

- 回滚：恢复 `useSketchCamera`/store 字段与 `enterSketch` 选项、把四处 fit 调用
  还原为原实现；无数据/契约迁移。
- 行为变化：进入草图不再自动正对平面（与 live 一致）；用户可用「正视草图平面」
  显式命令。既有依赖自动转正的脚本/测试必须自行设定相机（已更新受影响 spec）。
- 可见内容取景在 B scope 未解析（selector 为空）时只取基准面/草图兜底，不会
  再落到 projectExtents；无内容时保持相机（no-op）。
