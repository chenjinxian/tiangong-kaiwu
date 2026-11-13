# AIRR — 画布右键菜单状态差异对齐 Onshape（不可交互状态）

- 状态：Implemented（2026-11-13 工作树；纯前端；无契约/后端变更）
- 关联：Onshape live 证据（私有仓
  `ui-evidence/context-menus-20261113/`，探针
  `tools/probe-context-menus-20261113.mjs`）；草图右键菜单权威
  `SketchEntityPicker`（ADR-0018 S1b/S1d，2026-11-12 已落）。
- 需求：Onshape 右键菜单随状态变化——特征对话框打开、草图工具激活、
  空白态、选中态各不相同；本轮把“不可交互状态”的差异全部对齐。

## Live 证据（2026-11-13 采集，只读右键/只 Escape，不提交）

| 状态 | 菜单首项与关键差异 |
|---|---|
| 特征模式空白 | 全部显示｜选择▸｜创建选定内容…｜缩放到合适大小｜等轴测（**无**顶/前/右/显示设置） |
| 特征实体命中/选中 | 编辑 <特征>…｜显示依赖项…｜新草图/偏移平面/拉伸/旋转｜隐藏/隐藏其他/隐藏所有｜剖视图｜工程图/DXF｜选择▸｜添加评论｜缩放到合适大小/放大选定对象/视图垂直于｜删除｜编辑外观…；选中态另有「清除选定内容」 |
| **特征对话框打开** | **确认 <特征>｜取消** 前置 + 隐藏/全部显示/确认组/选择组/缩放/视图垂直于 |
| 草图模式空白 | 确认 草图 N｜复制草图｜（粘贴草图图元）｜全部显示｜曲线/曲面分析…｜选择▸/创建选定内容…/选择其他…｜缩放到合适大小｜视图垂直于草图平面 |
| **草图工具激活（无锚点）** | **退出 <工具>** 前置 + 上述草图空白菜单 |
| 草图工具激活（有锚点） | 右键取消待定形状（菜单无「退出」首项；本仓按“菜单承担退出”统一） |

## 实现

### 1. 特征空白态（CanvasContextMenu）

`buildCanvasMenu(selection, state)` 新增状态输入：

- 空白：`全部显示 / 选择(gated) / 创建选定内容…(gated) / 缩放到合适大小 / 等轴测`。
  删除自创的顶/前/右/显示设置项（与 live 不符；标准视图入口仍在 ViewCube 菜单）。
- 选中态：所有选择驱动菜单前置 `清除选定内容`（live 选中态证据）。
- 新 gated 能力（点击开能力引导，不静默 no-op）：`selectionFilters`（选择▸）、
  `createSelection`（创建选定内容…）、`selectOther`（选择其他…）。

### 2. 特征对话框打开 → 确认/取消前置（对话框命令槽）

- 新 `internal/dialog-commands.ts`：单槽位命令转发（`confirm`/`cancel`），
  React hook `useDialogCommandHandler` 由当前对话框登记；未登记时返回 false。
- 8 个特征对话框登记：FeatureDialog（拉伸/旋转/圆角/倒角/阵列/镜像/布尔/
  放样/扫掠等通用面）、HoleDialog、CPlaneDialog、ShellDialog、MoveFaceDialog、
  TransformDialog、SplitPartDialog、FeaturePatternDialog。
- 菜单「确认 <特征>」走对话框自身的提交函数（沿用 submitting/只读/参数守卫），
  「取消」= 对话框 ✗ 同源（onCancel）。**不引入第二套事务通道**：确认仍走
  FeatureOp/updateParams（P0-05/P0-10 不变）。

### 3. 草图模式右键菜单（唯一权威：SketchEntityPicker）

- 草图右键菜单此前已由 SketchEntityPicker 实现（确认 草图/复制/粘贴/全部显示/
  分析/选择组/缩放/视图垂直于草图平面）。本轮**不在 CanvasContextMenu 另起
  一套**（草图 picker 的 window 捕获 contextmenu 会 stopPropagation）。
- 新增：草图工具激活时菜单首项 `退出 <工具>`（`activeToolLabel/onExitTool/
  contextMenuEnabled`）；工具激活时 picker 仍挂载但 `interactive=false`——
  只开空白菜单、不拾取实体、不与绘制工具抢输入。
- 工具激活时一律空白菜单（`interactive=false → hit=undefined`），与 live
  “退出 <工具> 前置 + 空白菜单”一致。

### 4. 右键不再退出草图工具（Onshape 语义）

草图工具（绘制/点/相切弧/约束/尺寸/偏移/延伸/修剪/分割/圆角/倒角/镜像）
`onResetButtonUp` 不再调用 `exitTool()`：

- 有待定锚点/拾取：右键取消该状态（工具保持激活，菜单同时打开）；
- 无待定状态：右键只开菜单；**退出工具由菜单「退出 <工具>」或 Esc 承担**。
- 旧 M3-b“两层取消：再右键退出”语义退役（live 证据优先）。

## 非目标 / 已知差异

- 菜单**光标命中目标**（hover target）驱动的条目（隐藏 <平面>/隐藏其他平面/
  隐藏所有平面/添加评论/选择▸ 子项）未接：当前菜单按“状态 + 选择集”构建，
  无 hover 目标数据源；草图 glyph/标注命中由 SketchDimensionEditor 处理。
- 草图实体右键菜单（删除/建构线/复制/拉伸…）为既有实现，未改动。
- 对话框提交中菜单「确认」不会显示对话框 ✓ 的 disabled 视觉，但提交函数守卫
  保证不会重复提交（诚实 no-op）。

## 测试

- 单测：web 全量 **138 files / 1835 passed**；新增/更新
  `CanvasContextMenu.test.tsx`（空白态新集合、特征对话框前置项、确认/取消
  命令槽经 harness hook 真触发、清除选定内容前置、全部显示/等轴测动作）、
  `capabilities.test.ts`（gated 集合 51→54：选择过滤/创建选定内容/选择其他）。
- 真栈：`e2e/context-menu-states.spec.ts` **4 passed**——
  ① 特征空白菜单五键；拉伸对话框打开 → 右键 确认 拉伸/取消，点取消 → 对话框
  收合（dialog.active=null）；② 草图空白菜单（草图空白菜单 aria）+ 点
  「确认 草图」退出草图；③ 线工具激活 → 首项「退出 线」、右键不退出工具、
  点菜单项退出工具且草图仍在编辑。
- 回归：`mouse-interaction`（右键拖拽/框选）+ `part-studio` + `sketch-point-tool`
  **12 passed**；`tutorial2.spec.ts` 全链 **2 passed（3.4 min）**。
- `tsc`（src/e2e）/eslint 绿。

## 风险 / 回滚

- 纯前端：回滚 = 菜单模型/对话框命令槽/picker props/工具 reset 四处同退，
  无数据迁移、无契约变更。
- 右键不再退出草图工具是交互语义变化：Esc 与菜单项均保留退出路径；既有
  e2e（框选/空白菜单/绘制链/tutorial2）已回归。
- 对话框命令槽为单槽位：宿主每次只挂一个对话框；StrictMode 双挂载以
  “只清自己登记的对象”防御。
