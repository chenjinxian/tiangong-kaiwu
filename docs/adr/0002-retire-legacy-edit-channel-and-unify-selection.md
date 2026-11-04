# ADR-0002：退役旧编辑通道并统一选择权威

- 状态：接受（2026-11-04）
- 决策者：平台/编辑器架构 owner
- 关联：`docs/DEVELOPMENT-RULES.md` P0-05/P0-06/P0-07/P1-01；`docs/architecture/EXCEPTIONS.md` X-01/X-02/X-03；`docs/superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md`
- 影响仓：`luban-cad/packages/{shared,editor,viewer}`、`luban-cad/apps/web`、`luban-backend/modeling-server`

## 背景

平台同时存在：

1. 标准 iTwin 编辑管道（`EditTools.startCommand` + `basicManipulationIpc` + `BriefcaseTxns`）；
2. 第二套 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand`；
3. 两套草图创建工具族（editor vendored `SketchTools` 与 app `Sketch.*`）；
4. 两个选择状态承载体（`store.canvas.selection` 与 `connection.selectionSet`），多处双向手写同步。

这违反 P0-05（单一建模管道）、P0-06（单一数据源）与 P1-01（能力唯一实现），并让 undo、选择与草图数据路径出现分叉。X-01/X-02/X-03 已按 P0 例外流程登记并确认，退出计划就是本 ADR。

## 决策

### D1：删除旧编辑 RPC 通道

- `LubanRpcInterface` 删除 `startEditCommand`、`callEditMethod`、`finishEditCommand`；`interfaceVersion` 1.0.0 → **1.1.0**。
- 直接编辑一律走 `EditTools.startCommand({ commandId: editorBuiltInCmdIds.cmdBasicManipulation, iModelKey })` + `basicManipulationIpc.*` + `saveChanges` + `EditTools.finishCommand`。
- 参数化建模一律走 `LubanFeatureRpcInterface` FeatureOp。
- 后端 `LubanRpcImpl` 删除对应 override；`EditCommandAdmin` 仍用于注册/驱动标准 `basicManipulation`/`solidModeling` 命令，不删除。
- 删除后端无对应命令的 `CreateHoleTool`/`DraftFacesTool`（历史实现调用不存在的 `createHole`/`draftFaces` 命令，属死代码）。`hole` 能力从 `full` 翻 `gated`，UI 走能力引导；拔模已是 `gated`。

### D2：草图工具族唯一

- 产品草图绘制只保留 app 的 `Sketch.Line/Rectangle/CenterCircle/Arc3Point/Spline`（以及约束/尺寸/偏移工具）。
- `EditTools.initialize(options?: { registerSketchTools?: boolean })` 增加显式退出项；产品传 `{ registerSketchTools: false }`。
- viewer 注册表不再注册 `CreateLineString/CreateArc/CreateCircle/CreateEllipse/CreateRectangle/CreateBCurve`。
- editor vendored `SketchTools` 保留在包内供上游对齐/参考，不作为产品路径。

### D3：`store.canvas.selection` 是唯一选择事实源

- 所有选择写入（画布拾取、树选中、右键「选中所属实体」、空白清除、对话框暂停清空）只写 store。
- `connection.selectionSet` 是 **part 选择的单向投影**：只包含 `kind==='part'` 的 id；子实体选择时为空。由单一 `useSelectionProjection` effect 写入。
- 删除 `useCanvasBodySelection` 反向桥（selectionSet → store）与所有分散的 `selectionSet.replace/emptyAll` 直接写点。
- `selectionSet` 只作为标准元素集工具（Delete/Move/Rotate）的输入；不反向成为 UI 事实源。
- undo/redo 快照只从 store 取；Onshape 工具的 `getSelectionSnapshot` 保持。

## 后果

正面：

- 新工具只有一个编辑入口、一个选择入口；undo/选择/草图数据不再分叉。
- 删除三方法后，旧通道无法被误用；版本 bump 让旧客户端显式失败。
- 选择投影逻辑集中，UI 与标准工具输入一致。

负面/代价：

- 旧 web 客户端连接新 MS 会因 RPC 版本不匹配失败（同发布列车发布，可接受）。
- iTwin 回退 `Select` 工具直接改 `selectionSet` 时，UI 不再自动回流（产品默认工具是 OnshapeSelectTool；回退路径只用于故障兜底）。若未来恢复 fallback 选择，需在投影层增加显式、单向的 intake ADR。
- 孔/拔模从「可点但假启动」变为「可点但如实引导」，属产品行为变化。

## 验证

- shared/backend 编译；`LubanRpcInterface.test` 断言 1.1.0。
- editor/viewer/app 单测：镜像标准 IPC 序列、注册表、选择桥、页面选择。
- 真栈：Tutorial 2 草图/镜像、删除/undo、树/画布选择。
- 全局 `rg` 证明产品代码无旧通道调用。

## 回滚

git revert；shared 恢复 1.0.0 + 三方法；MS/web 回退上一产物。无数据迁移，无 schema 影响。
