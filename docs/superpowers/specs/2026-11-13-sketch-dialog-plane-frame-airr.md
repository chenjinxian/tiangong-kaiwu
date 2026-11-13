# AIRR — 草图创建对话框 Onshape 对齐 + 草图平面框 + 取消删除 + 对话框按钮图标 + 下拉菜单图标

- 状态：Implemented（2026-11-13 工作树；纯前端；无契约/后端/schema 变更）
- 关联：Onshape live 证据（私有仓
  `ui-evidence/editor-flow-parity-20261112/`（f4/f5 草图创建/编辑、f6 拉伸）、
  `ui-evidence/icons-20261113/`（飞菜单 icon 名 + sprite symbol 抽取）；探针
  `tools/probe-icons-20261113.mjs` / `tools/probe-symbols-20261113.mjs`）。
- P0-10：取消删除走标准 `deleteSketch` FeatureOp + 事务（可撤销），无静默 no-op。
- P0-07：无 shared 契约变更。

## 需求（用户 2026-11-13 复核）

1. 创建草图对话框与 Onshape 未完全对齐；
2. 创建草图选择平面时，Onshape 会多渲染一个草图平面框（本仓缺失）；
3. 新建草图中点关闭（✗/Esc）没有删除特征树中的草图节点（Onshape 会删）；
4. 所有草图和特征对话框的按钮图标与 Onshape 不一致；
5. 工具栏下拉菜单有多个按钮缺少图标。

## Live 证据要点（像素/计算样式，2026-11-13）

| 项 | 值 |
|---|---|
| 对话框标题 | `rgb(51,51,51)`，`500 16px`，header 高 29px（f4/f5/f6） |
| ✓ 按钮 | 28×28，启用底 `rgb(65,146,40)`（#419228），禁用底 `rgb(217,233,212)`（#d9e9d4），白色 sprite 对勾 `ok-button` |
| ✗ 按钮 | 28×28，**透明底** + 红色 sprite X `cancel-button`（#BD3039）——旧实心红方块不符 |
| 平面字段（空态） | 42px 堆叠字段：底色 `rgb(226,240,250)`（#e2f0fa），2px 边框 `rgb(40,80,170)`；标签「草图平面」 |
| 平面字段（已选/编辑） | 底 `rgb(251,253,254)`，1px 边框 `rgb(149,149,149)`；堆叠「草图平面」小标签 + 值 + × |
| 时钟 | 字段框外右侧，创建/编辑均显示（装饰，无真实历史面板） |
| 底栏 | 右对齐：草图分析工具（sprite `sketch-analysis-tools`）+「成品」（仅编辑既有草图）+ ?（sprite `help-button`）；无「缩放到合适大小/正视草图平面」 |
| 标题变化 | 创建前泛称「草图」；选平面后「草图 N」 |
| pending 草图 | 创建后树行立即可见；✗ 取消=删除 pending 草图 |
| 平面框 | 浅蓝 `rgb(182,200,223)` 2px 线框，以平面原点为中心；f4 零件 ≈1.5× 框、f5 75mm 草图 vs ≈150mm 框 → 随内容范围自适应 |
| 飞菜单图标 | 18 个 sketch id 的 live icon 名（见下），sprite symbol 全部可抽取 |

## 实现

### 1. 草图对话框（`dialogs/SketchDialog.tsx` + `.css`）

- 标题颜色/字重/字号按 live；创建前显示泛称。
- 平面字段改为堆叠结构（label + chip + ×），空/选中两态样式按像素采样；
  时钟移出字段并恒显；清除 × 在既有草图编辑态禁用（updateSketch 无 plane 键，
  不清除真状态）。
- 底栏改为 `analysisTools（禁用+诚实提示，未实现）` + `成品（编辑既有草图，
  复用完成出口）` + `?`；移除底栏「缩放到合适大小/正视草图平面」（live 在
  草图工具栏/ViewCube，全局入口保留）。
- 「成品」/分析工具文案新增 zh/en 词库。

### 2. 草图平面框（`internal/sketch-plane-frame.ts` + `SketchPlanePicker`）

- 纯几何：`sketchPlaneFrameCorners`（平面正交基四角）、
  `sketchPlaneFrameHalfSize`（范围 8 角在 u/v 最大投影 × 1.5，min 12mm）。
- Picker 新增 `framePlane`/`sketchRange`：矩形按选中/活动草图平面绘制
  （基准面/cPlane/模型面均可），尺寸优先草图实体范围，否则查询模型范围，
  最后回退基准面尺寸；存在 frame 时不再重复描基准面选中边。
- 宿主 `PartStudioCanvas` 由活动草图落库平面 → 草稿平面解析来源，传给 Picker。

### 3. 取消新建草图 = 删除 pending 草壳

- `SketchDialog` 记录本对话框 `insertSketch` 成功返回的 featureId；
  ✗/Esc → `applyOp({ kind:'deleteSketch', sketchId })`（标准事务，Ctrl+Z 可撤销）
  → 成功后 `exitSketch + onCancel`；失败就地 Alert、不关框（不留孤儿）。
- 第二次 ✓ = 提交草图 → 清除 pending 标记；此后（重新打开）的 ✗ 只退出不删。

### 4. 对话框按钮图标（新增 `dialogs/DialogHeaderButtons.tsx`）

- 统一 9 个对话框（FeatureDialog/SketchDialog/Hole/CPlane/Shell/MoveFace/
  SplitPart/Transform/FeaturePattern）头部 ✓/✗ 为 Onshape sprite
  `ok-button`/`cancel-button`；✗ 透明底；标题 500 16px #333。
- `onshape-icons.tsx` 新增 sprite：ok-button、cancel-button、edit-button、
  sketch-analysis-tools（+ 下述草图图标）。

### 5. 工具栏下拉图标

- `ribbon-registry.ONSHAPE_TOOL_ICONS` 补 18 个 live 飞菜单 id → sprite 名：
  Midline→midpoint-line、ellipse/ellipseArc/splineControlPoints/intersection/
  chamfer/extend/split/slot/circularPattern/transform/insertImage/
  concentric/normal/pierce/symmetric/curvature(equal-curvature)/flow(flow-continuity)。
- `onshape-icons.tsx` 从 live sprite 抽取 16 个缺失 symbol（上述 + elliptical-arc、
  add-spline-point、sketch_split_icon 等）。

## 测试

- 单测：`SketchDialog.test.tsx`（41 passed：布局/字段两态/成品/取消删除/
  删除失败不关框/编辑不删/字段 × 清 pending）、`sketch-plane-frame.test.ts`
  （4 组纯几何）、`FeatureDialog.test.tsx`（✗ 透明底 CSS 契约）；web 全量
  **139 files / 1847 passed**；tsc（src/e2e）/eslint 绿。
- 真栈：新增 `e2e/sketch-create-parity.spec.ts`（创建态计算样式/平面框像素/
  取消删除/编辑成品/飞菜单 5+15 项图标全在场）；受影响
  `sketch-edit`、`sketch-camera-parity`、`sketch-camera-fit`、
  `sketch-region-fill` 共 **7 passed（1.6 min）**。
- **真栈选择器迁移**：底栏「缩放到合适大小」按 live 移除后，13 个既有草图
  spec 的 18 处 `getByRole('button', {name:'缩放到合适大小'})` 改走
  ViewCube 相机菜单（`viewcube-menu-trigger` → `viewcube-menu-zoom-fit`）。
  「正视草图平面」按 live 属工具栏动作，但本仓保留编辑态底栏显式入口
  （`sketch-view-normal`，18 处既有用例依赖；创建态不显示）。

## 已知边界 / 后续

- 草图分析工具未实现 → 按钮禁用+title 诚实说明（不伪造打开）。
- 「正视草图平面」在 live 属工具栏动作；本仓暂保留编辑态底栏左端显式入口
  （既有 18 处真栈用例依赖），创建态不显示。
- 平面框为 2D overlay（与既有 SketchPlanePicker 选中描边同层），不做模型遮挡
  深度裁剪；若后续要求与 live 完全一致的遮挡效果，再上 3D WorldDecoration。
- 平面框尺寸系数 1.5 来自两例 live 比例（1.5–2×），非契约值。
- 「成品」复用完成出口（等价 ✓），Onshape 的「成品」附加语义（保留草图工具
  上下文）未单列。

## 风险 / 回滚

- 纯前端 UI/交互：逐文件 revert 即可；无数据迁移。
- 取消删除依赖标准 `deleteSketch` 可撤销；后端拒收时保持对话框 + Alert，
  不乐观改树。
