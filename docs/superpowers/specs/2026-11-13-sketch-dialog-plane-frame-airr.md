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
| 平面框 | 浅蓝 `rgb(182,200,223)` 2px 线框；**以平面原点为中心的世界固定长方形**：半宽 = 基准面半宽 × 2.0、半高 = × 1.15（空 PS 选 Front 实测外框 1090×617 px vs 基准面方框 545×545 px，同心；缩放实验证明世界固定）。内容超出时对称扩张；「草图 N」为**水平文字**，位于框左上角内侧（不是正方形、不是内容包围盒、不沿顶边旋转；2026-11-13 二轮 live 复核） |
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

- 纯几何：`sketchPlaneFrameRect(plane, datumHalfSize, contentRange?)`——以平面
  原点为中心的**固定长方形**：半宽 = 基准面半宽 × `SKETCH_FRAME_WIDTH_RATIO`
  （2.0）、半高 = × `SKETCH_FRAME_HEIGHT_RATIO`（1.15）；`contentRange` 在
  u/v 上最大绝对值超出最小框时**对称扩张**（×1.08，无 live 直测的保守外推）。
  不再有内容包围盒/基准面方框两套口径。
- Picker 新增 `framePlane`/`sketchRange`：框按选中/活动草图平面绘制
  （基准面/cPlane/模型面均可），内容范围优先草图实体，否则查询模型范围；
  存在 frame 时不再重复描基准面选中边。标签 `frameLabel ?? pendingSketchName`
  以**水平文字**绘制在投影四角的左上角内侧（+12/+24 px），颜色
  `rgba(150,200,238,0.95)`、600 16px。
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
  删除失败不关框/编辑不删/字段 × 清 pending 且不关框/无下拉）、
  `sketch-plane-frame.test.ts`（7 组纯几何：固定长方形比例/内容扩张/退化）、
  `FeatureDialog.test.tsx`、
  `ViewCube.test.tsx`（相机菜单「正视草图平面」命令）；web 全量
  **139 files / 1848 passed**；tsc（src/e2e）/eslint 绿。
- 真栈：`e2e/sketch-create-parity.spec.ts` **1 passed**（创建态计算样式/
  字号 16/12/13.3333px/平面框像素+`data-frame-label`+正视后投影宽高比
  1.5–2.0（排除正方形）/取消删除/编辑成品/飞菜单 5+15 项图标）；
  `sketch-edit`、`sketch-camera-parity`、
  `sketch-camera-fit`、`sketch-region-fill`、`sketch-chamfer`、
  `cplane-point` **9 passed**（含 cPlane 树选中桥 4000 mm³ 真栈）；
  `autosave-version`/`ui-parity`/`sketch-extrude`（T1）在迁移批次通过；
  `sketch-face-plane` **2 passed**（新 dev server；旧 HMR 长跑进程下拾取
  偶发空选择，已加 viewport-ready/多候选点稳定窗）；`intro-to-cad`
  `EXAMPLE_RESET=1` **2 passed**（cPlane 树选中→背面草图整链）。
- **真栈选择器迁移**：底栏「缩放到合适大小」按 live 移除后，13 个既有草图
  spec 的 18 处 `getByRole('button', {name:'缩放到合适大小'})` 改走
  ViewCube 相机菜单（`viewcube-menu-trigger` → `viewcube-menu-zoom-fit`）；
  「正视草图平面」从对话框移除后，18 处改为 `viewcube-menu-trigger` →
  `viewcube-menu-view-normal-to-sketch`；平面下拉移除后，7 个 spec 的
  combobox/option 用法改为树行选中（基准面/cPlane）或 store 驱动，5 处
  combobox 文本断言改为 `sketch-plane-chip`。

## 二次复核（2026-11-13 用户反馈，已修正上一轮偏差）

1. **对话框无「正视草图平面」按钮**（live f4/f5 确认）：移除底栏入口；新增
   ViewCube 相机菜单命令 `viewcube-menu-view-normal-to-sketch`（草图激活时
   出现，label「正视草图平面」），18 处真栈选择器迁移。
2. **平面字段无下拉选择**（live 确认）：移除 combobox/listbox 与字段菜单；
   平面只来自视口拾取（基准面/模型面）与特征树（基准面/cPlane）。cPlane 经
   新桥选取：`store.tree.selectedNodeIds` 单选 + 该节点是带世界平面的 cPlane
   选项 → 草稿平面（PartStudioCanvas effect）。全部 e2e/单测迁移到树选中或
   store 驱动。
3. **× 清除不退出对话框**：若本框已自动创建 pending 草壳 → 先标准
   `deleteSketch` 删除并退出草图模式，再把字段清空、**对话框保持打开**等待
   重新选面；无草壳时纯本地清除。编辑既有草图的 × 禁用。
4. **字号统一为 live computedStyles**：标题 16px；字段小标签 12px；字段值、
   开关行、提示 13.3333px（上一轮 chip 16px/开关 12px 与 live 不符）。
5. **选面后视口同步显示平面框 + 草图名文字**：`SketchPlanePicker` 新增
   `frameLabel`（草图名沿框顶边外侧绘制，与边框同步）；marker 暴露
   `data-frame-plane`/`data-frame-label` 供真栈断言。
   用户同日进一步复核：Onshape 的框是**比草图基准面大一点的长方形**（不是正方形）。
   第三轮 live 采集（empty-front-zoomed-out/in、live-sketch-frame-crop）实测：
   外框 1090×617 px vs 基准面方框 545×545 px，两者同心；缩放后比例不变，
   证明框是**世界固定长方形**（半宽 2×、半高 1.15× 基准面），标签为框左上角
   内侧的**水平**浅蓝文字。据此重写 `sketch-plane-frame.ts`（删除内容包围盒
   口径，改为固定长方形 + 内容超限对称扩张），单测覆盖空内容比例、
   内容小不缩、内容大对称扩张、偏侧仍居中、空 Range/退化点/退化平面。

## 已知边界 / 后续

- 草图分析工具未实现 → 按钮禁用+title 诚实说明（不伪造打开）。
- 「正视草图平面」在 live 属视图菜单命令（非对话框）；本仓落在 ViewCube
  相机菜单，草图激活时可用。
- 平面框为 2D overlay（与既有 SketchPlanePicker 选中描边同层），不做模型遮挡
  深度裁剪；若后续要求与 live 完全一致的遮挡效果，再上 3D WorldDecoration。
- 平面框是**世界固定长方形**（2× / 1.15× 基准面）——零件远小于框时框边会
  落在视口外（Onshape live 同样如此，缩放实验已证）；内容超出最小框时的
  对称扩张（×1.08）无 live 直测，是「框至少包住内容」的保守外推；
  比例/留白参数非契约值。
- 真栈 `sketch-create-parity` 以 ViewCube「正视草图平面」+ 滚轮缩小验证框的
  绘制像素与投影宽高比（600:345 ≈ 1.74，断言 1.5–2.0，排除正方形）。
- 「成品」复用完成出口（等价 ✓），Onshape 的「成品」附加语义（保留草图工具
  上下文）未单列。

## 风险 / 回滚

- 纯前端 UI/交互：逐文件 revert 即可；无数据迁移。
- 取消删除依赖标准 `deleteSketch` 可撤销；后端拒收时保持对话框 + Alert，
  不乐观改树。
