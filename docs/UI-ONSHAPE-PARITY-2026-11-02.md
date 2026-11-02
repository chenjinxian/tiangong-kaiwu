# Onshape UI 对齐（2026-11-02）

本轮对齐五项用户可见差距：ViewCube、默认几何图元、ViewCube 显示/渲染设置、
草图/拉伸相机、Tutorial 2 圆角边选择。实现均在 `luban-cad/`（不修改
`itwinjs-core/`），ViewCube 用自有 React + core-frontend API（不引入 AppUI）。

## 1. ViewCube

- 组件：`apps/web/src/modules/part-studio/components/ViewCube.tsx|css`
  - 六面 + 四角 + 罗盘环/四向箭头 + 轴三色 triad；面点击走
    `StandardViewId`（Top/Bottom/Front/Back/Left/Right），四角走自定义
    RightIso/LeftIso 方向。
  - 实时朝向订阅 `viewport.onViewChanged`。**两个关键修正**：
    1. core 的 `setStandardRotation`/`synchWithView` 不保证 raise
       `onViewChanged`；程序化换视图后必须显式回读（ViewCube 动作内 +
       `sketch-camera`/`viewport-actions` 的 `raiseEvent`）。
    2. `view.getRotation()` 可能返回被原地改写的同一 `Matrix3d`；React state
       必须存 `clone()`，否则 `Object.is` 判等跳过渲染、cube 停在旧朝向。
  - 世界→CSS 旋转做 `F·R·F` 共轭（`F=diag(1,-1,1)`，iTwin y-up ↔ CSS
    y-down；cube 局部 +Z=世界 +Z=Top）。面标签按投影位置屏幕对齐渲染，
    不随面旋转。
- 纯函数：`internal/view-orientation.ts`（方向→矩阵、CSS matrix3d、
  可见面标签投影、轴 triad 方向、Iso/Dimetric/Trimetric 预设）与单测。
- 下拉菜单：标准视图/自定义方向、适应视图、缩放窗口（`View.WindowArea`）、
  显示模式、透视+FOV、阴影、AO+强度、抗锯齿、背景、边线宽/色，以及
  「更多显示设置…」打开右停靠 display 页签。

## 2. 默认几何图元

- 树：`tree/DefaultGeometryGroup.tsx`（Origin/Top/Front/Right，组名
  本地化、行标签固定英文）；特征计数计入这 4 项（与 Onshape 截图一致）。
- 状态：`use-part-studio-store` 的独立 `datum` 切片（visibility/expanded/
  selectedId/autoHiddenOnce）；**绝不写入** `tree.selectedNodeIds` 或
  `canvas.hiddenIds`（eye 只切 datum 切片）。
- 视口批注：`packages/viewer/src/viewport/decorations/datum-planes-decoration.ts`
  画 Top(XY)/Front(XZ)/Right(YZ) 半透明矩形 + 屏幕标签 + Origin 靶心；
  `useDatumPlaneDecorations` 负责注册/卸载/可见性同步。
- 首次 body-producing 特征成功后自动隐藏三平面（Origin 保留，eye 可重开）。

## 3. 显示/渲染设置

- 共享状态：`hooks/useDisplaySettings.ts`，ViewCube 下拉与右停靠
  `DisplaySettingsPanel` 同源；localStorage
  `luban.partStudio.displaySettings.v1`；background=theme 跟主题 observer。
- 映射：`internal/display-actions.ts`
  - 六模式 → `renderMode`/`visEdges`/`hidEdges`（SmoothShade、HiddenLine、
    Wireframe；translucent = SmoothShade + 模型 `FeatureAppearance` 0.5）；
  - 透视/FOV → `turnCameraOn(Angle)`/`turnCameraOff`；
  - 阴影 → `viewFlags.shadows`；AO → `viewFlags.ambientOcclusion` +
    `AmbientOcclusion.Settings.intensity`（37.5% ↔ 2.0，clamp）；
  - 抗锯齿 → `viewport.antialiasSamples`；背景 → `applyViewportBackground`；
  - 边线 → `hiddenLineSettings.visible`（ovrColor/color/width）。
- 默认值与既有 render-profile 基线一致：Shaded、AO 37.5%、阴影关、正交、
  FOV 90、边 `#3d3d3d`/1px、AA 4、背景 theme。

## 4. 相机

- 进入草图：`canvas/sketch-camera.ts` 用真实 `SketchPlaneDto` frame 定向
  （`Matrix3d.createRows(xDir,yDir,normal)`），关透视；**不得**直接映射
  `StandardViewId.Front`（Front 帧 normal=+Y、yDir=-Z，标准 Front 矩阵镜像）。
- 取景：读到既有草图实体后按实体 2D 包围盒 → 世界范围 `lookAtVolume`，
  左侧留 padding 避开草图面板；**新建空草图首次实体不得触发 fit**（否则
  鼠标流坐标系中途跳变，tutorial2-tools 曾因此失败）。
- 退出草图：恢复 rotation + origin + extents（只恢复 rotation 会停在草图缩放）。
- 产体后自动适应：`applyOpAndFit` 在成功 `insertFeature` 后调用
  `fitViewToModelRanges`；首次布局稳定后按最终 `viewRect.aspect` 再 fit 一次。
- **取景 API 修正**：`computeFitRange()` / 模型范围是世界坐标，必须走
  `view.lookAtVolume(...)`（内部旋转到 view-aligned）；直接喂
  `lookAtViewAlignedVolume` 会在非轴对齐视图错位/裁切。已在
  `fit-view.ts`、`use-viewport.ts`、`viewport-actions.ts`、ViewCube 修正。

## 5. Tutorial 2 圆角与体积

- 圆角边：底座 **4 条短竖棱**（Z 向 19.05 mm，x=±41.275、y=±63.5，
  z=-9.525..+9.525；own ids `1:1/1:3/1:8/1:10`），不是 127 mm 长 Y 棱。
- 面域拆分：E2 = `band`(JGa 1153.56) + `bandWing`(JGe 483.87)；
  R1 = `revolveProfile`(JGW 725.775)。旧 fixture 把 JGe/JGW 合并导致
  +2.5 cm³ 无圆角体积差。
- 体积：后端 replay 无圆角 357.988 / 终 357.566 cm³（-0.001% vs API
  357.568）；UI 严格鼠标流终 357.712 cm³（+0.040%），去材 0.422 cm³。
  0.5% 门未放宽。

## 验证

- 单测：`view-orientation`、`display-actions`、`useDisplaySettings`、
  `DisplaySettingsPanel`、`ViewCube`、`sketch-camera`、`useSketchCamera`、
  `fit-view`、`datum-planes-decoration`、`FeatureTree`/结构计数（含默认
  几何 +4）。
- e2e：`ui-parity.spec.ts`（ViewCube/默认几何/显示模式持久化/草图相机与
  退出恢复）、`tutorial2.spec.ts`（四短竖棱 4/4）、`tutorial2-tools.spec.ts`、
  `sketch-extrude.spec.ts`、`feature-contracts.spec.ts`、`b-model.spec.ts`、
  `b-viewport.spec.ts`。
- 视觉基线：`editor-read-only-light.png` / `editor-b-default-light.png`
  已按默认几何图元 + ViewCube 重钉（画布仍 mask）。
- Chrome 全程演示：`.superpowers/t2-demo-20261102/`（webm 2:43 + 关键截图
  + 每 15s 抽帧 + demo.html），四短竖棱圆角、默认几何、ViewCube 均在画面内。
