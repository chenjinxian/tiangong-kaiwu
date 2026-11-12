# AIRR — 草图线性阵列（Onshape canvas gizmo 首切片）

日期：2026-11-12
状态：**已实现（首切片，2026-11-12）**（用户指令：继续实现全部缺口）

## 1. 证据（live UI，自有副本 `LubanLivePostman` / Part Studio 2 / 草图 1）

- 草图工具栏「变换」组（`command-id=SKETCHLPATTERN`）下拉为
  `线性阵列 / 环形阵列 / 变换`；工具栏清单见私有
  `ui-evidence/ui-direct-mouse-20261112/50-sketch-toolbar.png`。
- 选中一个圆后点击「线性阵列」：工具进入 active（DOM `tool ... is-active`），
  **不弹对话框、无 input**；画布上出现：
  - 橙色种子圆（原选中几何）；
  - 两个蓝色预览实例（默认总实例数 **3**，沿 X 方向）；
  - 方向手柄（方形 + 三角箭头）；
  - 计数标签 **`3x`**；
  - 间距尺寸（两箭头 + 数值 `1`，文档单位 inch）；
  - 蓝色虚线构造线连接种子/实例/手柄。
- 证据：`ui-evidence/ui-direct-mouse-20261112/64-pattern-seeded-hover.png`
  与 `64-pattern-crop.png`；全 DOM/shadow-root 扫描确认无对话框。
- 结论：Onshape 草图阵列是 **canvas manipulator**（手柄 + 内联数值），
  不是参数对话框；数值可拖动手柄改变。

## 2. 范围（本切片）

实现 **线性阵列** 首切片：
1. 工具栏「线性阵列」入口激活；选中至少一条草图曲线作为种子（无种子时提示
   选择，拾取层保持可交互，选中后立即出现手柄）。
2. 画布 gizmo：方向手柄、间距手柄/数值、计数手柄/`Nx` 标签；蓝色预览实例。
3. 交互：
   - 拖方向手柄：绕种子中心旋转方向（Shift 吸附 15°）。
   - 拖间距手柄：沿方向改变间距（>0）。
   - 拖计数手柄：按间距步长增/减实例数（2..100）。
   - 点击 `Nx` / 间距数值：内联输入，Enter 应用、Esc 取消输入。
   - Enter 或草图对话框 ✓：一次 `updateSketch` 提交（可撤销）；
     Esc 取消阵列模式，不写数据。
4. 几何语义：
   - 种子集=选中曲线 + 直接引用的显式 point（同复制/粘贴自包含口径）；
   - 每个实例为独立副本（新 id + 内部约束重映射）；跨外部几何/原点的约束
     不复制（不把副本锁到外部几何）；
   - 实例按草图局部方向/间距平移；点实体与所有内联点引用一并平移。
   - **近似登记**：Onshape 的草图阵列是带“阵列关系”的可编辑历史项；本产品
     shared 无此约束 kind，实例是独立几何副本（可再次编辑/删除）。该差异在
     文档与测试注释中显式声明，不声称完全等价。

**非目标（后续切片）**
- 变换的数值输入与可拖动/自定义基点（当前基点=选区质心，手柄拖拽），
  以及非均匀缩放/带外部约束的缩放。
- 环形阵列的部分角度/角度手柄（当前固定整周 360°；builder 已支持部分角度，UI 未暴露）。
- 第二方向阵列、跳过实例、曲线驱动阵列。
- 阵列关系的参数化（改数量/间距后联动更新历史实例）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `sketch-clipboard` | 复制集口径/ID 重映射/内部约束过滤 | 抽出纯函数供 pattern 复用，剪贴板行为不变 |
| `SketchEntityPicker` 覆盖层 | 屏幕投影、蓝色预览绘制、控制点/曲线几何 | 阵列期间禁用其指针拾取 |
| `screenDeltaToLocal` | 屏幕位移 → 草图局部 (du,dv) | 方向/间距拖拽 |
| `updateSketch` | 一次提交全部实例 | 可撤销；失败诚实 toast |
| store | 新增 `sketch.pattern` 会话态 + start/cancel actions | 不新增选择权威 |
| shared/backend | 无改动 | 不涉及 FeatureOp/schema |

## 4. 设计

1. **纯逻辑** `internal/sketch-pattern.ts`
   - `buildSketchLinearPattern(entities, constraints, selection, {directionDeg, spacingMm, count})`
   - 返回 `{ok, entities, constraints, instanceCurveIds}` 或 `{ok:false,error}`。
   - 校验：有曲线种子、count 2..100、spacing>0、方向非零。
   - 复用 `sketch-clipboard` 抽出的 `collectSketchCopySet` / `instantiateSketchCopy`
     （全局 nextId 递推），再平移副本实体/内联点。
2. **会话态** store `sketch.pattern: { kind:'linear' } | null`；Ribbon
   `useToolActivation('sketchLinearPattern')` → `startSketchPattern('linear')`
   （不写 tool.activeToolId、不跑 PrimitiveTool）。
3. **覆盖层组件** `components/SketchPatternGizmo.tsx`
   - 仅当 `sketch.pattern` 活跃时渲染；无种子 → 顶部提示「选择要阵列的草图图元」，
     拾取层保持可交互（Onshape 工具允许先选后选种子）。
   - 本地 options 状态（directionDeg=0、spacing=10 mm、count=3）。
   - 预览 canvas（绝对定位，pointer-events:none）画蓝色实例曲线；
     手柄为 DOM 按钮（testid `sketch-pattern-direction/spacing/count`），
     位置由 `viewport.worldToView` 计算。
   - 拖拽用 pointer capture；内联输入框 `data-testid=sketch-pattern-input`。
   - Enter 提交；Esc 取消；提交期间禁用重入。
   - 提交调用宿主 `onCommit`（一次 `updateSketch`，含全部实例），成功后
     选中新实例曲线并退出阵列模式。
4. **草图对话框 ✓**：通过模块级会话注册 `commitActiveSketchPattern()`；
   `PartStudioCanvas.handleSketchConfirm` 在退出草图前先提交未完成的阵列
   （失败则保持草图与模式，不退出），保证点「成品」不会丢预览。
5. **禁用**：只读（canEdit=false）不启动；无选中曲线提示先选图元。

## 5. 跨仓影响

无 shared/后端/RPC/schema/native/渲染管线改动；仅 web 前端。草图事实源仍是
`params`（entities+constraints），一次 `updateSketch`。

## 6. 测试

- 纯单测 `sketch-pattern.test.ts`：数量/间距平移、点实体与内联点、
  id 唯一、内部约束重映射、外部约束丢弃、校验矩阵、方向角度。
- 组件单测（可选）：句柄屏幕投影/拖拽换算纯函数。
- 真栈 `e2e/sketch-pattern.spec.ts`：RPC 建一圆 → 进入草图 → 选中圆 →
  ribbon「线性阵列」→ 拖/输入 count=3、spacing=20 → 预览可见 → Enter →
  `getSketch` 3 个圆、圆心位移 20/40 mm、内部约束数量正确 → undo 回到 1 个圆。
  另测草图对话框 ✓ 提交未完成的阵列。
- 回归：`sketch-entity-menu`、`sketch-fillet`、`sketch-fillet 5 cases`、
  全量 web 单测、tsc/lint。

## 6.1 实现记录（2026-11-12）

- 纯逻辑 `internal/sketch-pattern.ts`（复用剪贴板的复制集/ID 重映射）+
  `SketchPatternGizmo` + store `sketch.pattern` + Ribbon 激活路由 +
  `sketch-pattern-session`（成品/右键确认先提交）。
- 同时修复：`SketchEntityPicker` 原来把画布外的 window pointer 事件当成空白
  点击，点击 ribbon 会清空草图选择（阵列入口激活时选中集被清空）；现在只处理
  画布内指针（`inCanvas`），画布外的 ribbon/对话框点击不再影响选择。
- 单测 `sketch-pattern.test.ts` 6 条 + 剪贴板回归 3 条；真栈
  `e2e/sketch-pattern.spec.ts` **3 passed**：
  1. 选中圆 → 间距改为 20 mm / 3 实例 → Enter 提交 → `getSketch` 3 圆
     （x=0/0.02/0.04 m）+ 3 条 radius 约束 → undo 回到 1 圆；
  2. 阵列未提交时点草图「确认」→ 先提交 3 实例再退出草图；
  3. 画布 gizmo 预览/手柄渲染（截图 70）。
- 视觉证据（本产品）：私有
  `ui-evidence/ui-direct-mouse-20261112/70-luban-sketch-pattern.png`
  （橙色种子、两个蓝色预览、`3x`/间距手柄）。
- **环形阵列同批实现（2026-11-12）**：live 实测「环形阵列」默认 count=3、
  旋转中心为草图原点、整周均分（预览蓝色圆实例 + 虚线圆路径 + 中心手柄 +
  `3x`），无对话框（证据私有
  `ui-evidence/ui-direct-mouse-20261112/71-onshape-circular-pattern.png`、
  `72-onshape-circular-pattern-seeded.png`）。实现：
  `buildSketchCircularPattern`（整周 step=2π/count；部分角度 step=angle/(count-1)）
  + 同一 `SketchPatternGizmo`（`kind='circular'`，中心/计数手柄、拖动中心、
  整周固定；本产品截图 `73-luban-circular-pattern.png`）；Ribbon「线性阵列 ▾」
  增加「环形阵列」。真栈 `e2e/sketch-pattern.spec.ts` **4 passed**（含环形
  count 4 → 4 圆绕原点 90° 均分 + undo）。
- **变换平移首切片（2026-11-12）**：live 实测「变换」进入 canvas gizmo
  （`ui-evidence/ui-direct-mouse-20261112/74-onshape-sketch-transform.png`；
  选区手柄在画布上、无对话框/输入框）。实现：`buildSketchTranslation` 直接平移
  选中曲线及其直接引用的显式 point（共享点随动；不复制、id 不变、约束不变）+
  同一 gizmo 的 `kind='transform'` 四向移动手柄/蓝色预览/虚线位移；真栈
  `e2e/sketch-pattern.spec.ts` **5 passed**（含拖动手柄 +20 mm → 圆圆心
  x=0.02 → undo 回 0；本产品截图
  `ui-evidence/ui-direct-mouse-20261112/75-luban-sketch-transform.png`）。
  Onshape 的旋转/缩放手柄已同批实现：`buildSketchTransform` 以选区质心为
  基点先缩放、再旋转、再平移；圆弧的圆心/半径随动且 `startAngle` 平移旋转角
  （sweep 不变）；均匀缩放同步缩放**内部** radius/diameter/
  length/distance 尺寸值（跨外部几何的尺寸保持不变，solver 可能限制缩放，
  如实接受）。gizmo 增加顶部旋转手柄与四角均匀缩放手柄（Shift 15° 吸附）；
  真栈缩放用例（拖角到 2× → 半径 ≈20 mm → undo）通过；本产品截图
  `76-luban-transform-rotate-scale.png`。数值输入/自定义基点/非均匀缩放
  未实现。
- 已知近似：实例为独立几何副本，无“阵列关系”约束/历史联动；线性方向/间距
  默认值为 0°/10 mm（Onshape 文档单位相关）；环形角度固定整周、无角度输入；
  变换以选区质心为基点、仅均匀缩放，数值输入未实现。

## 7. 风险与回滚

- **无阵列关系**：实例为独立副本，改动种子不会联动；如实登记。
- **指针冲突**：阵列模式禁用 SketchEntityPicker 拾取；Escape 先取消输入/阵列，
  不再触发草图退出。
- **性能**：单个 updateSketch 最大 100 实例；实体集上限复用现有校验/规模。
- **回滚**：移除 store.pattern 会话、Ribbon 路由、Gizmo 组件与纯函数；
  无数据/契约迁移。

## 8. P0 对照

- P0-01/P0-03/P0-05：复用现有草图事实源与 `updateSketch`，无第二套模型/事务。
- P0-06：事实源仍是 params；预览仅为显示层。
- P0-07：无契约变更。
- P0-10：一次 updateSketch 可撤销；取消模式不写数据。
