# 渲染回归 iTwin 默认 + Onshape 式 hover/pick/select 设计

日期：2026-11-03
状态：设计已确认，待实现计划
范围：`luban-cad/apps/web` + `luban-cad/packages/{viewer,editor}`；不改 `itwinjs-core` 主仓
关联文档：`docs/BREP-RENDERING-2026-11-03.md`、`docs/UI-ONSHAPE-PARITY-2026-11-02.md`、`luban-cad/CLAUDE.md`

## 1. 背景与目标

当前 Part Studio 的视觉基线是 2026-10-26～11-03 为对齐 Onshape 叠加的一套定制：
`render-profile.ts` 强制近竖直顶光、灰面 SubCategoryOverride、深色边线与 AO 默认开；
`display-actions.ts` 默认 AO 37.5%；白底来自 `theme-background.ts`。
用户对这套渲染效果不满意，要求把**材质与光照**改回 `itwinjs-core` 默认，同时把
hover/pick/select 修成 Onshape 的“随时直接拾取点/边/面”交互。

本设计的目标：

1. **渲染**：使用 iTwin.js 默认灯光与默认元素材质；保留现有白底与 BRep 全拓扑
   边线；AO 默认关；MSAA 保持 4；不引入第二种材质/灯光实现。
2. **拾取**：取消面/边/点显式模式，空闲态常驻一个 Onshape 式选择工具；悬停按
   “顶点 > 边 > 面”就近高亮，单击替换、Ctrl 切换、空白清除；整零件选择走零件
   列表或右键“选中所属实体”。
3. **修复现有拾取链缺陷**：跨 body 拾取失效、hover 可能失活、高亮与 store 分裂、
   顶点容差过大、持久 id 跨 body 碰撞、SolidModeling 命令常驻。
4. **复用优先**：继续以 editor 的 `LocateSubEntityTool` 为拾取基座，不重写
   boresite/几何缓存/子实体高亮链；只在行为差异处做最小覆写。

## 2. 非目标

- 不修改 BRep 拓扑读面/边线生成算法，不改 `generateAllPolyfaceEdges=false`。
- 不实现跨对话框/跨工具的持久选中高亮（用户已确认：仅空闲态保留选择）。
- 不新增面/边删除、面级特征归属、材质系统或第二套拾取 API。
- 不修改 `itwinjs-core` 主仓；仅修 `luban-cad/packages/editor`（第一方建模基座）。
- 不改变显示模式（Shaded / 隐藏边 / 半透明等）语义与 UI 入口。

## 3. 研究结论（证据）

### 3.1 iTwin.js 默认渲染值

- `itwinjs-core/core/common/src/LightSettings.ts`
  - solar：intensity `1.0`、`alwaysEnabled=false`、direction `(0.272166, 0.680414, 0.680414)`
  - ambient：intensity `0.2`，color 黑（shader 用表面自身颜色）
  - hemisphere：intensity `0`
  - portrait：`0.3`；specular：`1.0`
- 默认 view flags：SmoothShade 由 `ViewCreator3d` 显式设置；`visibleEdges=false`、
  `ambientOcclusion=false`、`shadows=false`、`whiteOnWhiteReversal=true`；背景默认黑。
- 默认材质来自元素/类别外观；`Material.default` 仅提供 diffuse `0.6` /
  specular `0.4` / exponent `13.5`，不覆盖颜色。
- `Viewport.setLightSettings(LightSettings.fromJSON())` 是公开的回到 stock 灯光通道
  （display-test-app `LightingEditor.ts` 同款）。

### 3.2 当前 luban-cad 偏离项

- `packages/viewer/src/viewport/render-profile.ts`
  - `LIGHTS_PROFILE`：solar `0.72`、direction `[0.1,0.15,-0.98]`、`alwaysEnabled=true`、
    ambient `0.5`、portrait `0.1`、specular `0.2`；
  - 所有 `BisCore.SubCategory` 强制 `#b4b4b6`；
  - view flags 强制 `visibleEdges=true`、`ambientOcclusion=true`；
  - hiddenLine visible 覆盖 `#1f1f1f` / 2px；
  - MSAA 4。
- `apps/web/src/modules/part-studio/internal/display-actions.ts`
  - `DEFAULT_DISPLAY_SETTINGS.ambientOcclusion=true`、`aoIntensityPct=37.5`。
- `packages/viewer/src/viewport/theme-background.ts`：白底 `#ffffff` / 暗色 `#262626`。
- `packages/viewer/src/host/web-initializer.ts`：`tileAdmin.generateAllPolyfaceEdges=false`
  （保留，避免三角网格线；BRep 叠加层负责真实拓扑边）。

### 3.3 现有拾取实现的问题

1. `LocateSubEntityTool.gatherElements` 首次点击把元素加入 agenda；`getCurrentElement()`
   优先取 agenda → 后续 hover/pick 钉死在第一个 body。
2. `ElementSetTool.shouldEnableLocate` 依赖 `wantAdditionalElements`；agenda 满后
   locate 可能失活 → hover 不稳定。
3. 重复点击时基类 `doLocateSubEntity` 只移除工具内高亮，`SubEntitySelectTool`
   无 remove 回调 → `store.canvas.selection` 仍保留。
4. 顶点容差：`SubEntitySelectTool.getLocateAperture` ×3，叠加后端 vertex `2×maxDistance`
   与默认 aperture `0.11in≈10.6px`，有效半径约 63px。
5. 面/边 selection id 仅 `face:<nodeId>:<entityId>` / `edge:<nodeId>:<entityId>`，
   两个 body 同号拓扑 id 会被 `useSubEntitySelection` 按 id 去重丢弃。
6. `ElementGeometryCacheTool.onCleanup` 只 `clearElementGeometryCache()`，不
   `EditTools.finishCommand()`；SolidModeling 命令可能常驻并与拓扑读面/删除命令抢槽。
7. `createSubEntityGraphic` 全局 `wantGeometry:true`，所有子实体工具每次 hover
   多取世界几何（仅 `FilletEdgePickTool` 需要）。
8. `useSubEntitySelection` 启动失败时不回退模式；右键菜单/命令搜索的模式入口与
   对话框禁用规则不一致。

## 4. 已确认决策

| 决策点 | 结论 |
|---|---|
| 渲染范围 | iTwin 默认材质/灯光 + 保留白底 + BRep 全拓扑边线；AO 默认关；MSAA 4 |
| 画布点击语义 | Onshape 纯语义：悬停 顶点>边>面；单击替换；Ctrl 切换；空白清除；无模式切换 |
| 整零件选择 | 零件列表 / 右键“选中所属实体” |
| 选中生命周期 | 仅空闲态保留；打开特征对话框或启动其它工具时清空 |
| 渲染风格切换 | 不保留双 profile |

## 5. 渲染设计

### 5.1 `render-profile.ts` 重写

保留文件作为“视口首次创建时的基线应用点”，函数改为
`applyViewportRenderBaseline(viewport: ScreenViewport): void`：

1. `viewport.setLightSettings(LightSettings.fromJSON(undefined))`：core 默认灯光。
2. `style.environment = Environment.fromJSON(undefined)`：关闭 baseline 可能携带的
   sky/ground/atmosphere（默认即全关）。
3. `viewport.viewFlags = viewport.viewFlags.copy({ ... })`：
   - `renderMode: SmoothShade`、`lighting: true`、`visibleEdges: true`、
     `hiddenEdges: false`、`ambientOcclusion: false`、`shadows: false`；
   - 清理 `grid` / `acsTriad` / `backgroundMap` / `monochrome` / `wiremesh` /
     `thematicDisplay` 等落库污染。
4. 保留 hiddenLine visible 边线覆盖：`#1f1f1f`、2px（BRep 叠加层的配套视觉）。
5. 保留 `viewport.antialiasSamples = 4`。
6. 删除所有 `SubCategoryOverride` 循环与 `queryAllSubCategoryIds` 依赖；不再写
   `BODY_COLOR`。
7. 删除 `LIGHTS_PROFILE` / `BODY_COLOR` 导出；`EDGE_COLOR` / `EDGE_WEIGHT` /
   `ANTIALIAS_SAMPLES` 保留。
8. `viewport.invalidateScene()` 保留（hiddenLine/lights 字典写入需显式失效）。

说明：白底仍由 `theme-background.ts` / `useDisplaySettings` 维护；BRep 叠加层
（`BrepTopologyDecoration`）与 `showBrepEdges` / `showBrepVertices` 设置不变。
`generateAllPolyfaceEdges=false` 保留。

### 5.2 调用点

- `packages/viewer/src/viewport/use-viewport.ts`
  - 删除 `queryAllSubCategoryIds` 函数与调用；
  - 改为 `applyViewportRenderBaseline(newViewport)`，失败不阻断视口。
- `apps/web/src/modules/part-studio/internal/display-actions.ts`
  - `DEFAULT_DISPLAY_SETTINGS`：`ambientOcclusion=false`（其余保持：
    shaded、白底、边 `#1f1f1f`/2px、BRep 边开、AA 4、正交 FOV 90、阴影关）。
  - `applyDisplaySettings` 的 AO 强度映射保留；AO 关闭时仍写强度但不生效。
- `apps/web/src/modules/part-studio/hooks/useDisplaySettings.ts`
  - localStorage key 从 `luban.partStudio.displaySettings.v1` 升为 `...v2`，
    避免旧库中的 AO=true / 旧边色覆盖新默认；旧键不迁移（视觉基线一次性换挡）。

### 5.3 不变的渲染件

- `theme-background.ts`：白底/暗色底。
- `BrepTopologyDecoration`：全部拓扑边、顶点小点、x-ray 模式。
- `FeaturePreviewOverlay`、草图/基准面装饰、选择高亮。
- `generateAllPolyfaceEdges=false`。

## 6. 拾取设计

### 6.1 新工具 `OnshapeSelectTool`

位置：`apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`
基类：`LocateSubEntityTool`（`@itwin/editor-frontend`）
`toolId = 'LubanCAD.SelectSubEntity'`、`namespace = 'LubanCad'`

构造参数：

```ts
interface OnshapeSelectOptions {
  connectionKey: string;
  onSelectionChanged: (selection: readonly CanvasSelection[]) => void;
  onError: (message: string) => void;
}
```

关键覆写：

| 成员 | 值/行为 |
|---|---|
| `requireWriteableTarget` | `false` |
| `wantAdditionalElements` | `false`（不再把 body 加入 agenda） |
| `shouldEnableLocate` | `true`（点击后 locate 不关闭） |
| `wantSubEntityType` | Face / Edge / Vertex 全 `true` |
| `getMaximumSubEntityHits` | Face 1、Edge 3、Vertex 3 |
| `get geometryCacheFilter` | `{ parts:true, curves:false, surfaces:true, solids:true, other:false }` |
| `requiredSubEntityCount` | `Number.POSITIVE_INFINITY`（不进入 agenda 完成态） |
| `onPostInstall` | `super` → `initLocateElements(true, false)` → 提示 |
| `onResetButtonUp` | `EventHandled.Yes`（右键保留工具/高亮，菜单由宿主打开） |
| `onCleanup` | 清空选择与图形 → `super`（基座负责清缓存并收口命令） |

### 6.2 跨 body 与 hover 常开

重写 `getCurrentElement()`：

```ts
const hit = IModelApp.accuSnap.currHit;
return (hit && hit.isElementHit) ? hit.sourceId : undefined;
```

重写 `doLocateSubEntity(ev, newSearch)`（不调用基类 agenda 版本）：

1. `id = this.getCurrentElement()`；无 id 且非 Ctrl → 清空选择，返回 `false`。
2. `newSearch`：`hits = await this.doPickSubEntities(id, ev)`；空 → 非 Ctrl 则清空，
   返回 `false`；否则把 `ev.point` 设为首个命中点并 `setAdjustedDataPoint`（沿用基类
   手感）。
3. 取 `hit = hits.shift()`：
   - 普通点击：`clearSelection()` 后 `addSubEntity(id, hit)`（同项重复点击保持选中）；
   - Ctrl：命中已选 → `removeSubEntity`；未选 → `addSubEntity`。
4. `invalidateDecorationsAllViews()`，返回 `true`。

### 6.3 悬停优先级与阈值

重写 `doPickSubEntities(id, ev)`：先 `super.doPickSubEntities(...)`，再统一做
屏幕空间筛选与排序（不依赖透视/正交分支）：

- 光标屏幕坐标：`vp.worldToView(ev.point)`。
- 每个命中：`d = vp.worldToView(Point3d.fromJSON(hit.point)).distanceXY(cursor)`。
- 阈值常量（真栈校准起点）：
  - `VERTEX_PICK_PX = 10`
  - `EDGE_PICK_PX = 6`
- 过滤：vertex 仅保留 `d <= VERTEX_PICK_PX`；edge 仅保留 `d <= EDGE_PICK_PX`；
  face 全部保留。
- 排序：最近 vertex（若有）→ 最近 edge（若有）→ face。返回数组首项即
  `doLocateSubEntity` 的默认命中；基类 `updateCurrentSubEntity` 取 `[0]` 显示 hover。
- 不做 3× aperture 放大；顶点容差只由 `VERTEX_PICK_PX` 决定。
- `hiddenEdgesVisible` 沿用基类（隐藏边可见模式仍可拾取隐藏边）。

### 6.4 选择/持久 id 与 store 同步

工具维护：

```ts
private readonly _selected = new Map<string, CanvasSelection>(); // key = owner:type:id:index
```

`addSubEntity(id, hit)`：

1. `await super.addSubEntity(id, hit)`（高亮先落）。
2. 若 `getAcceptedSubEntityData()` 无 `hasGraphic` → 移除并 `onError`。
3. 按类型解析：
   - face：`resolveFaceRef(connectionKey, id, cacheId)`；
     `CanvasSelection = { kind:'face', id:\`face:${id}:${ref.nodeId}:${ref.entityId}\`, ownerBodyKey:id, topologyId:ref, cacheId, label }`；
   - edge：`resolveEdgeRef(...)`；`id = \`edge:${id}:${ref.edge.nodeId}:${ref.edge.entityId}\``；
   - vertex：`id = \`vertex:${id}:${cacheId}\``（无持久拓扑 id，会话级）。
4. 解析失败：移除高亮、`onError`、不写 store。
5. 写 `_selected`，回调 `onSelectionChanged([..._selected.values()])`。

`removeSubEntity(id, props)`：`super.removeSubEntity`；按 key 删除 `_selected`；回调。
`clearSelection()`：清理所有 accepted `SubEntityData` 图形、清空数组/Map、回调 `[]`。

去重键包含 owner，修复两个 body 同号拓扑 id 的碰撞；`useCanvasBodySelection` 的
`canvasSelectionKey` 已含 owner，继续使用。

### 6.5 生命周期与默认工具

新 hook：`apps/web/src/modules/part-studio/hooks/useOnshapeSelection.ts`

- 挂载/连接变化：
  - `IModelApp.tools.register(OnshapeSelectTool)`（幂等；模块级 flag）；
  - `IModelApp.toolAdmin.defaultToolId = 'LubanCAD.SelectSubEntity'`；
  - `defaultToolArgs = [{ connectionKey, onSelectionChanged, onError }]`；
  - 空闲时 `startDefaultTool()`（若工具未激活）。
- `dialog.active !== null` 或 `sketch.isActive`：
  - 若当前工具是 `OnshapeSelectTool` → `pause({ clearSelection: true })`；
  - 设置模块级 `paused` 标志，保证工具重装时也处于暂停态。
- 回到空闲：若当前工具是我们的 → `resume()`；否则 `startDefaultTool()`。
- 卸载/连接清理：`defaultToolId = 'Select'`；若当前是我们的工具 → 退出/回默认；
  store 选择清空。
- 启动失败：回退 `defaultToolId='Select'` + `startDefaultTool()`，toast 可见错误
  （不留在“看似有模式、实际无工具”的状态）。
- `onSelectionChanged`：`usePartStudioStore.getState().setCanvasSelection(selection)`。
- `onSelectOwner` / 零件列表选择 body：
  - 先 `OnshapeSelectTool.clearSelection()`（清子实体高亮/store）；
  - 再写 tree 选中 + `connection.selectionSet.replace([bodyKey])`；
  - body 桥接回 store（kind='part'）。
  - 零件列表路径：`PartStudioPage` 增加一个 effect 监听 `tree.selectedNodeIds`，
    过滤出 `featureSystem.bodies` 中 `bodyKey` 命中的项；非空时先
    `clearActiveSelectTool()`（模块级运行时引用，经 `useOnshapeSelection` 注册），
    再 `connection.selectionSet.replace(partIds)`。效果=Onshape 零件列表选中整零件。
- 模块级运行时（`internal/onshape-selection-runtime.ts`）保存当前工具的
  `clearSelection` / `pause` / `resume` 引用，供宿主右键菜单、零件列表 effect 与
  命令协调器跨组件调用；工具清理时注销。

### 6.6 移除模式状态

- `CanvasSelectionMode` / `canvas.selectionMode` / `setSelectionMode` 删除。
- `useCanvasBodySelection` 去掉 `enabled` 门控（连接 + bodies 就绪即订阅）。
- 删除 `useSubEntitySelection.ts`。
- `CanvasContextMenu` 删除 `selection-mode` 动作组；“选中所属实体”保留。
- Ribbon/命令搜索/i18n 删除 `selectFace/selectEdge/selectVertex` 入口（不保留别名，
  避免出现不可达死命令）。
- `brepOverlayOptionsFor` 去掉 `selectionMode` 参数；顶点显示只由
  `showBrepVertices` 控制。
- `PartStudioPage` 中 `useBrepTopology` 的 `enabled` 改为
  `!sketch.isActive && !dialog.active`（不再依赖选择模式）。

### 6.7 选择高亮的生命周期（用户已选：仅空闲）

- 工具在空闲态保持激活，accepted `SubEntityData` 的 `Scene`/canvas 图形即选择高亮。
- 打开对话框/草图：`pause({clearSelection:true})` → 高亮与 store 一起清空。
- 启动其它 iTwin 工具：该工具替换默认工具，`onCleanup` 清空选择；工具结束后
  `startDefaultTool` 重新安装，空闲恢复 hover。
- Escape：全局快捷键 `startDefaultTool()` 重装本工具 → 选择清空、hover 恢复。

## 7. 命令槽协调

### 7.1 问题

本工具在空闲 hover 时通过 `EditTools.startCommand(cmdSolidModeling)` 持有 editor
命令；`readBrepTopology` 与 `subentity-delete` 也需要同一命令槽。不能长期争抢。

### 7.2 `BrepCommandCoordinator`

位置：`apps/web/src/modules/part-studio/internal/brep-command-coordinator.ts`

- 模块级串行队列 + 当前 hover 控制器注册点：
  - `registerHoverController({ suspend, resume })`
  - `withExclusiveCommand(task)`：入队 → 若控制器存在则 `await suspend()` →
    执行 task → `finally resume()`。
- `OnshapeSelectTool.suspendCommand()`：
  - `pausedForCommand = true`；
  - 清 hover、`changeLocateState(false,false)`；
  - 若 `_startedCmd` 存在 → `EditTools.finishCommand()` 并复位 `_startedCmd`；
  - 已选高亮保留（这是空闲态的短暂停顿，不是对话框）。
- `resumeAfterCommand()`：`pausedForCommand=false`；`initLocateElements(true,false)`；
  下一次鼠标移动重新建缓存/定位。
- `useBrepTopology` 的 `readBrepTopology(...)` 与 `canvas/subentity-delete.ts` 的
  `startCommand` 均经 `withExclusiveCommand` 调用。
- 控制器不存在（对话框/其它工具激活）时直接执行 task。

### 7.3 editor 基座修复

`packages/editor/frontend/src/ElementGeometryTool.ts`：

1. `ElementGeometryCacheTool.onCleanup`：
   - 若 `_startedCmd` 已定义，清缓存后调用 `EditTools.finishCommand()` 并复位；
   - 不再无条件 `startCommand` 只为清一个不存在的缓存。
2. `wantGeometry` 改为受保护 getter：
   ```ts
   protected get wantSubEntityGeometry(): boolean { return false; }
   ```
   `createSubEntityGraphic` 的 `wantGeometry` 使用该 getter；
   `FilletEdgePickTool` override 为 `true`（橙色 x-ray 边覆盖需要世界几何）。
   其它子实体工具不再为未使用数据付 IPC。

## 8. 数据流

```
pointermove
  → AccuSnap.locate（元素命中）
  → OnshapeSelectTool.onMouseMotion / updateCurrentSubEntity
  → doPickSubEntities（后端 locateSubEntities + 屏幕距离排序）
  → SubEntityData（Scene 图形：面蓝半透明/边蓝粗线/顶点蓝点）
  → decorate

click
  → processDataButton → gatherInput → OnshapeSelectTool.doLocateSubEntity
  → 普通点击 clearSelection + addSubEntity；Ctrl toggle；空白 clear
  → resolveFaceRef / resolveEdgeRef
  → onSelectionChanged → zustand store.canvas.selection
  → 右键菜单按 primary kind 构建

dialog.open / sketch.active
  → useOnshapeSelection.pause({clearSelection:true})
  → finishCommand + 清高亮 + store []

body commit / hidden 变化
  → useBrepTopology → withExclusiveCommand
  → suspend hover → readBrepTopology → finishCommand → resume hover
```

## 9. 文件影响

### 9.1 渲染

- `luban-cad/packages/viewer/src/viewport/render-profile.ts`（重写）
- `luban-cad/packages/viewer/src/viewport/use-viewport.ts`
- `luban-cad/packages/viewer/src/viewport/test/render-profile.test.ts`
- `luban-cad/apps/web/src/modules/part-studio/internal/display-actions.ts`
- `luban-cad/apps/web/src/modules/part-studio/hooks/useDisplaySettings.ts`
- `luban-cad/apps/web/src/modules/part-studio/test/display-actions.test.ts`
- `luban-cad/apps/web/src/modules/part-studio/test/useDisplaySettings.test.tsx`
- `luban-cad/apps/web/e2e/__screenshots__/editor-b-default-light.png`
- `luban-cad/apps/web/e2e/__screenshots__/editor-read-only-light.png`

### 9.2 拾取

- 新增 `apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`
- 删除/替换 `tools/modeling/SubEntitySelectTool.ts`（保留可复用的解析逻辑）
- 新增 `hooks/useOnshapeSelection.ts`；删除 `hooks/useSubEntitySelection.ts`
- 新增 `internal/brep-command-coordinator.ts`
- 新增 `internal/onshape-selection-runtime.ts`
- `apps/web/src/modules/part-studio/PartStudioPage.tsx`
- `apps/web/src/modules/part-studio/components/PartStudioCanvas.tsx`
- `apps/web/src/modules/part-studio/canvas/CanvasContextMenu.tsx`
- `apps/web/src/modules/part-studio/hooks/useCanvasBodySelection.ts`
- `apps/web/src/modules/part-studio/hooks/useBrepTopology.ts`
- `apps/web/src/modules/part-studio/stores/use-part-studio-store.ts`
- `apps/web/src/modules/part-studio/types.ts`
- `apps/web/src/modules/part-studio/canvas/subentity-delete.ts`
- `apps/web/src/modules/part-studio/ribbon/ribbon-registry.ts` / i18n（移除模式入口）
- `luban-cad/packages/editor/frontend/src/ElementGeometryTool.ts`
- `luban-cad/apps/web/src/modules/part-studio/tools/modeling/FilletEdgePickTool.ts`
  （`wantSubEntityGeometry` override）
- 测试：`test/SubEntitySelectTool.test.ts` → `OnshapeSelectTool.test.ts`、
  `test/useSubEntitySelection.test.tsx` → `useOnshapeSelection.test.tsx`、
  `test/useCanvasBodySelection.test.ts`、`test/CanvasContextMenu.test.tsx`、
  `test/PartStudioCanvas.test.tsx`、`test/PartStudioPage.test.tsx`、
  `test/use-part-studio-store.test.ts`、`test/part-studio-structure.test.tsx`、
  editor 侧 `DraftFacesTool.test.ts` / `FilletEdgePickTool.test.ts`

### 9.3 e2e

- `apps/web/e2e/newbody.spec.ts`：去掉模式切换，直接 hover/click 面/边/点，
  增加跨 body、Ctrl 多选、空白清除断言。
- `apps/web/e2e/render-showcase.spec.ts`：更新截图流程与拾取步骤。
- `apps/web/e2e/visual.spec.ts` 与 `__screenshots__`：重钉视觉基线。
- `apps/web/e2e/ui-parity.spec.ts`、`part-studio.spec.ts`、`tutorial2*.spec.ts`：
  出现模式菜单/选择状态的断言同步更新。
- 新增真栈渲染默认断言（可放 `b-viewport.spec.ts` 或 render-showcase）：
  `lights` 等于 `LightSettings.fromJSON(undefined).toJSON()`、
  `subCategoryOverrides.size === 0`、`ambientOcclusion === false`、
  `backgroundColor === #ffffff`、`antialiasSamples === 4`。

## 10. 错误处理与边界

- **后端 locate 失败/命令忙**：hover 保持上一帧或清空，不弹错；下一次鼠标移动重试。
- **ref 解析失败**：移除该高亮，toast 后端原文；普通点击替换语义下选择保持清空。
- **工具安装失败**：回退 core `Select`，toast；不保留“假模式”。
- **暂停态**：hover/click 被吞掉；右键菜单仍可打开（由宿主决定）。
- **连接切换/卸载**：清空选择、恢复 `defaultToolId='Select'`、退出工具。
- **顶点无持久 id**：会话级 id；打开对话框即清空（用户已确认）。
- **默认灯光 + 白底**：模型偏浅，深色 BRep 边线是主要轮廓；若对比不足只调边色/
  边宽，不再改灯光。
- **拾取阈值**：10px/6px 为首版常量；真栈 e2e 校准后在测试中钉版。
- **多视口**：ViewState 共享 displayStyle；本产品单视口形态，若未来多视口需克隆 view。

## 11. 测试与验收

### 11.1 单测

- `OnshapeSelectTool`：全类型 want；`wantAdditionalElements=false`；
  `shouldEnableLocate=true`；优先级排序（顶点>边>面 + 阈值）；普通点击替换、
  Ctrl toggle、空白清除；remove 回调与 store 同步；owner 去重键；跨 body
  `getCurrentElement`；pause/resume/cleanup；`onCleanup` 后命令 finish。
- `render-profile`：stock lights、默认 environment、无 SubCategoryOverride、
  AO false、MSAA 4、污染 flags 清理、幂等。
- `display-actions`：默认 AO false；AO 开关/强度映射不回归。
- `useDisplaySettings`：v2 key、旧 key 不覆盖。
- `BrepCommandCoordinator`：串行、暂停/恢复、task 抛错仍恢复。
- editor：`wantSubEntityGeometry` 默认 false、Fillet true；cleanup finishCommand。

### 11.2 真栈 e2e

- Tutorial 2 成品上：不切模式，hover 面/边/点各出现蓝高亮；单击选中；Ctrl 加选/
  取消；空白清除；右键“选中所属实体”切到 body 选择。
- 两 body 场景：连续拾取不同 body 的面/边（回归第一处 bug）。
- 选择打开特征对话框：选择清空、hover 暂停；关闭后恢复。
- 隐藏/显示 body 后 BRep 拓扑刷新不抢命令、不闪空。
- 渲染断言：display style 与 stock 默认一致；截图对照 `research-itwin-stock-full.png`
  的材质/光照层次（白底 + BRep 边）。
- 全量门禁：web 单测、viewer 单测、editor 单测、tsc、lint、全量 e2e、verify-stack。

### 11.3 验收定义

- 画布无模式切换；空闲时任意位置直接 hover/click 点/边/面；跨 body 连续拾取正确。
- 高亮与 store/右键菜单始终一致；重复点击/Ctrl/空白行为符合本设计。
- 渲染使用 iTwin 默认灯光/材质；白底与 BRep 边线保留；AO 默认关；MSAA 4。
- 打开对话框/工具即清空子实体选择；命令槽无残留。
- 无 `itwinjs-core` 改动；editor 两处修复有单测与记录
  （更新 `luban-cad/CLAUDE.md` 的基座修改说明与 `docs/BREP-RENDERING-2026-11-03.md`
  的渲染/拾取现状描述）。
