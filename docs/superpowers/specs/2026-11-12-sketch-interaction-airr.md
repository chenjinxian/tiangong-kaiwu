# AIRR — 草图交互与控制点（Onshape 对拍）

- 标题：草图交互与控制点（Sketch Direct Manipulation Parity）
- 日期：2026-11-12
- Owner：editor parity program
- 关联 Issue/需求：用户指令「对比 Onshape 测试草图的每一个功能……特别是曲线的控制点逻辑；特征树交互/渲染全面对标」
- 预计影响仓：luban-cad（web/viewer/shared）、luban-backend（读面/契约不变，必要时补 dof 派生）、imodel-native（本切片不动）
- 是否需要 ADR：**是**（选择权威扩展 + 草图编辑交互管线；见 `docs/adr/0018-sketch-direct-manipulation.md`）

---

## 1. 目标与验收

- 用户问题/业务目标：目前 LubanCAD 草图只能「点击创建」，不能选中/悬停/拖拽实体，没有控制点，不能删除实体/约束，不能改尺寸值；曲线颜色与 Onshape 的约束状态着色不一致。目标是把草图编辑器做到与 Onshape 同构的直接操作体验。
- 可观察验收标准：
  1. 编辑态草图曲线按约束状态着色：欠约束蓝 `#1a1acc`、全约束黑 `#1f1f1f`、失败红（live 采样）；构造曲线虚线；封闭面域浅灰填充。
  2. 点/线端点/圆心/弧起止中点/样条控制点显示为蓝色小控制点；悬停高亮；单击选中（橙 + 浅橙填充），Ctrl 多选，空白清空。
  3. 拖拽控制点/实体：端点只动端点、实体整体移动；预览实时，释放后 `updateSketch` 提交并标准 undo；Esc 取消拖拽。
  4. Delete 删除选中实体/约束；约束被依赖时诚实拒收。
  5. 双击尺寸标注改值（`updateSketchConstraint`）；双击空白不改草图。
  6. 特征树：单击选中与几何高亮、双击草图/特征、右键菜单、eye 显隐、重命名/抑制/删除与 Onshape 一致（独立切片 S2）。
- Onshape/live/参考证据（截图/DOM/接口/测试）：
  - 私有 `onshape-parity-data/ui-evidence/editor-flow-parity-20261112/sketch-tools/`：直线/圆/弧的控制点、选中橙、欠约束蓝、Delete 删除、平面 hover 橙、编辑态不强制正视相机。
  - `docs/adr/0018-sketch-direct-manipulation.md` 中的像素采样值。
- 非目标（明确不做，另立切片）：文字/使用(投影实体边)/线性阵列/DXF/圆锥曲线工具；多段/周期样条；变量表达式；3D 草图；每实体 DOF 精确着色（先用整草图 dof 近似）。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | ScreenViewport 命中/投影、Decoration、Tool 生命周期、BriefcaseTxns | `worldToView`、`addCanvasDecoration`、`PrimitiveTool`、`onCommitted` | 5.9 fork | 复用 |
| luban-cad/packages/editor | 草图工具基类（已收编） | `Sketch.*` 唯一族（vendored editor SketchTools 未注册） | 2026-10-22 收编 | 复用（不新增族） |
| luban-cad/packages/viewer | 草图曲线装饰、datum 装饰 | `SketchCurvesDecoration`（本次扩展着色/控制点） | viewer src | 扩展 |
| luban-cad/packages/shared | 草图 DTO、约束、`updateSketch`/`updateSketchConstraint` | `SketchDto.solve.dof`、`SketchEntityDto`、17 约束 | 1.x | 复用（无契约变更；若需 per-entity DOF 再加字段→bump） |
| luban-backend/modeling-server | 草图写面/求解 | `precomputeSketchWrite`、`updateSketch`、`updateSketchConstraint`、`getSketch.solve` | 私有仓 | 复用（无新 op；删除实体 = updateSketch 全量覆写） |
| luban-backend/webhook-agent | — | — | — | 不适用 |
| imodel-native | BRepCore 拓扑/求值 | 本切片不触碰 | — | 不适用 |
| imodelhub-services | — | — | — | 不适用 |
| 官方 clients/BisSchemas | — | — | — | 不适用 |
| DanQing/参考项目 | — | 未接入 | — | 不适用 |

复用矩阵结论：全部交互复用 iTwin 视口/工具/事务与既有 `updateSketch` 通道；不新增模型库、不新增 RPC、不改 schema。

---

## 3. 架构影响

- **选择权威（P1-01）**：草图实体选择扩展 `store.canvas.selection`（唯一权威）新增 `kind:'sketchEntity'`（后续 `sketchConstraint`），经 `internal/selection-authority.ts` 投影时**忽略**草图条目（不是 iModel 元素）；`OnshapeSelectTool` 在草图编辑态暂停的既有姿态保持。
- **渲染（P1-05）**：`SketchCurvesDecoration` 增加约束着色与控制点；数据仍来自 `getSketch`/树 params，装饰件不参与拾取事实（拾取用独立的轻量 hit-test，结果写 store）。
- **编辑管线（P0-05/P0-10）**：拖拽/删除/改值最终都走 `LubanFeatureRpcInterface` 的既有 `updateSketch`/`updateSketchConstraint`（BriefcaseTxns 可撤销）；不做第二套建模 API。
- **契约**：不新增 RPC/字段。整草图 `solve.dof` 已足够做首版状态着色；每实体 DOF 需后端求解分析，作为后续 bump。
- **相机**：Onshape live 显示进入编辑不强制正视；本切片不改相机（后续单独评估是否提供「正视」命令而非自动）。

---

## 4. 测试与证据

- 单元：viewer 装饰（颜色/控制点/构造虚线）、web 转换器（控制点/去重/平面变换）、选择状态与工具交互。
- 真栈：新建草图→画线/圆/弧→选中/拖拽→undo→Delete→改尺寸→push+冷重开；树交互 S2 独立 spec。
- 视觉：控制点/颜色像素与 live 对照（私有证据）；不新钉视觉基线前先人工审。
- 已知风险/回滚：拖拽高频写会造成 RPC 风暴——拖拽期间只本地预览，释放后单次提交；失败保留原几何并 toast。回滚 = 移除着色/控制点/选择路由提交（数据无迁移）。

---

## 5. 切片计划

- **S1a（本次已实现，补文档）**：约束状态着色 + 控制点渲染 + 点实体显示（只读）。
- **S1b**：实体/控制点 hover + 选择（store.canvas.selection 扩展）。
- **S1c**：拖拽编辑（端点/实体/圆半径）→ `updateSketch` + undo。
- **S1d**：Delete 实体/约束；被引用约束拒收文案。
- **S1e**：尺寸双击改值（`updateSketchConstraint`）。
- **S1f**：面域浅灰填充 + 自动正视命令（可选）。
- **S2**：特征树点击/双击/右键/eye/重命名/抑制/删除/回滚条与渲染对拍。
- **S3**：未实现草图/特征功能（BRepCore 已就绪者优先：standalone draft、投影实体边、多截面 loft、刚性移动面、emboss/imprint/offset edges）。
