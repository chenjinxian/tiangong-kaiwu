# AIRR — Onshape 鼠标交互对齐（导航 / 框选 / 右键判定）

日期：2026-11-12
状态：已批准（用户直接指令：修改鼠标交互必须与 Onshape 一致）

## 1. 证据（live UI，自有副本 `LubanLivePostman`）

直接在 Onshape 可编辑副本的 Part Studio / Sketch 编辑态操作（非正式采集）：

| 交互 | Onshape 实测 | 截图（私有） |
|---|---|---|
| 右键拖拽 | 旋转视图；松开不弹菜单 | `ui-evidence/ui-direct-mouse-20261112/03-sketch-right-drag.png` |
| Ctrl+右键拖拽 | 平移视图（方向不变，仅位置移动） | `18-sketch-shift-right-drag.png`、`19-sketch-ctrl-right-drag.png` |
| Shift+右键拖拽 | 旋转（与右键一致） | `18-sketch-shift-right-drag.png` |
| 中键拖拽 | 平移 | `04-sketch-middle-drag.png` |
| 滚轮 | 缩放 | `05-sketch-wheel.png` |
| 右键单击（无拖拽） | 弹出上下文菜单；不改变相机 | `07-sketch-right-click` state（菜单项 DOM） |
| 左键拖拽空白（草图编辑态） | 蓝色框选；左→右为窗口选择（完全包含才选中），右→左为交叉选择（接触即选中） | `11-sketch-left-drag-inprogress.png`、`36-box2-partial-ltr.png`（未选）、`37-box2-partial-rtl.png`（选中）、`38-box2-full.png`（选中） |
| 左键拖拽空白（3D Part Studio） | 无框选、无相机动作 | `01-sketch-baseline` 与 `02-sketch-left-drag` 哈希相同 |
| 双击空白（3D） | 选中光标下基准面（等价两次单击） | `06-sketch-double-click.png` |
| 双击草图曲线 | 无特殊动作（不弹尺寸输入） | `16-sketch-circle-double-click.png` |

结论：本产品需补齐 **右键旋转 / Ctrl+右键平移 / 草图框选 / 拖拽后不弹菜单**；左键拖拽 3D 空白保持无动作。

## 2. 范围与非目标

**范围**
1. 3D 与草图编辑态：右键拖拽旋转，Ctrl+右键拖拽平移，中键平移/滚轮缩放维持既有。
2. 右键拖拽结束后不弹 `CanvasContextMenu` / 草图实体菜单；右键单击（无位移）照旧弹菜单。
3. 草图编辑态空白左键拖拽框选：左→右窗口选择（全部投影采样点位于框内），右→左交叉选择（曲线与框相交或点在框内）；Ctrl/Cmd 叠加选择。
4. 框选结果写回现有唯一选择权威 `store.canvas.selection`（`kind='sketchEntity'`），不改选择模型。

**非目标（本切片不做）**
- 3D 框选（Onshape 实测左键拖拽空白无动作）。
- 草图空白菜单中「复制草图」「曲线/曲面分析…」「选择创建选定内容…」「创建选定内容…」「选择其他…」仍禁用（无对应后端/实现）；菜单面与已支持动作见 §9。
- 图元双击特殊行为（Onshape 实测无特殊动作）。
- 拾取优先级/悬停阈值改动（既有 顶点>边>面 保持不变）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `@itwin/core-frontend` | `IdleTool` 子类 + `IModelApp.tools.create('View.Rotate'/'View.Pan', vp, true, true)` + `ViewManip.startHandleDrag` | 与上游 `IdleTool.onMouseStartDrag` 完全同路径；不修改 vendored core |
| `OnshapeSelectTool` | 增加 `onMouseStartDrag(Reset) → EventHandled.No`，让右键拖拽落到 idle tool | 不改选择/悬停逻辑 |
| `SketchEntityPicker` | 复用现有 `geometry`（折线/控制点）与 `onSelectionChange` | 框选纯函数独立可测 |
| shared / backend | 无改动 | 无 RPC/schema/params 变更 |
| 选择权威 | `store.canvas.selection` 唯一写入点 | 不新增选择状态 |

## 4. 设计

1. **`OnshapeIdleTool`（web 内）**：继承 `IdleTool`；`onMouseStartDrag` 中 `BeButton.Reset` 时按 Ctrl 选择 `View.Pan` 或 `View.Rotate`，`oneShot=true, isDraggingRequired=true`，调用 `run()` + `startHandleDrag(ev)`；其他按键交 `super`。通过 `useOnshapeMouseNavigation()` 安装/卸载（保存/恢复原 idleTool）。
2. **菜单元数据**：模块级一次性抑制标志；右键拖拽开始时置位，`contextmenu` 事件消费后清除；画布 `mousedown`（右键）重置，避免拖拽未产生 contextmenu 时误吞下一次单击。
3. **框选纯函数** `selectSketchEntitiesInScreenBox(geometry, project, box, mode, sketchId)`：窗口模式要求全部采样点在框内；交叉模式用线段-矩形相交（Liang–Barsky）+ 点包含；点实体（polylines 不含）按控制点 `kind='point'` 纳入。按 entityId 去重。
4. **`SketchEntityPicker`**：空白左键按下建立候选框；超过 4px 开始显示 `.part-studio-sketch-box` 覆盖层并拦截事件；释放时计算模式与选择；Ctrl/Cmd 叠加；Escape/pointercancel 取消。框选期间不清 hover 之外的既有选择，释放后统一写回。
5. **右键拖拽抑制**：`SketchEntityPicker` 的 capture `contextmenu` 处理器先消费抑制标志；`PartStudioCanvas` 的 React `onContextMenu` 同样消费。右键单击路径不变。

## 5. 跨仓影响

无。不触碰 shared 契约、后端、schema、native、渲染管线；仅 web 前端交互层 + 文档。

## 6. 测试

- 纯单测：`sketch-box-select.test.ts`（窗口/交叉、左右方向、线段相交、点实体、去重）。
- 组件/工具单测：`OnshapeIdleTool.test.ts`（右键→View.Rotate、Ctrl+右键→View.Pan、抑制标志只消费一次、非 Reset 走 super）；`SketchEntityPicker` 框选可加组件测试（若 mock 允许）。
- 真栈 e2e `mouse-interaction.spec.ts`：
  - 3D：右键拖拽后相机变化且无菜单；右键单击后菜单可见且相机不变；Ctrl+右键拖拽相机变化。
  - 草图：用 RPC 建两条分离直线 → 进草图 → 全包含窗口选择只选一条；同一局部框左→右不选、右→左选（交叉）；`data-selected` 断言。
- 回归：现有 `b-viewport`、`sketch-entity-menu`、`sketch-fillet`、`tree-interactions`；全量 web 单测、tsc、lint。

## 7. 风险与回滚

- **工具挂起**：ViewManip 为 InputCollector，拖拽期间挂起选择工具；结束后恢复。若出现选择高亮丢失，沿用现有 `activeToolChanged` 的 ViewTool 例外分支（不清选择）。
- **事件时序**：Chrome 在右键 `mouseup` 后派发 `contextmenu`（已实测），抑制标志在拖拽开始置位、菜单处理消费；右键按下重置标志。
- **性能**：框选为 O(实体×采样点) 线性扫描，与现有悬停命中同量级；不引入 RPC。
- **回滚**：移除 `useOnshapeMouseNavigation` 安装与框选监听/覆盖层即可；无数据/契约迁移，旧 iModel 不受影响。

## 8. P0 对照

- P0-01/P0-03：全部基于 iTwin 标准 `IdleTool`/`ViewManip`，无第二套相机/渲染。
- P0-05/P0-06/P0-07：不涉及建模/RPC/契约。
- P0-10：框选仅改变选择态，不产生写事务。

## 9. 追加切片（2026-11-12）：草图空白右键菜单

Live 证据：在 `LubanLivePostman` 草图编辑态空白处右键，菜单项依次为
「确认 草图 N、复制草图、粘贴草图图元、全部显示、曲线/曲面分析…、
选择创建选定内容…、创建选定内容…、选择其他…、缩放到合适大小、
视图垂直于草图平面」（`ui-evidence/ui-direct-mouse-20261112/40-sketch-blank-menu.png`；
工具 `tools/ui-probe-sketch-blank-menu-20261112.mjs`）。

实现（无契约/后端改动）：
- `SketchEntityPicker` 空白右键显示菜单，实体右键菜单与空白菜单互斥；
  外点/Escape 同时收合两者。
- 已实现动作：确认草图 N（复用宿主 `handleSketchConfirm`：exitSketch +
  清平面快照 + closeDialog）、粘贴草图图元（会话剪贴板非空时可用）、
  全部显示（`showNodes(store.canvas.hiddenIds)`；无隐藏项时禁用并提示）、
  缩放到合适大小、视图垂直于草图平面。
- `复制草图`、`曲线/曲面分析…`、三种选择… 保持禁用并带「未支持」title，
  不伪造能力。
- 真栈 `e2e/mouse-interaction.spec.ts` 追加：空白右键 → 菜单可见 →
  复制草图禁用 → 视图垂直于草图平面生效 → 再次右键「确认 草图 1」退出
  草图并恢复特征工具栏。
