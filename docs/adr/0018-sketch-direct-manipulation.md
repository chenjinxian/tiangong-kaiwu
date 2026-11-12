# ADR-0018 — Sketch direct manipulation: constraint coloring, control points, entity selection, drag/edit

- 状态：Proposed（Owner 待签字）
- 日期：2026-11-12
- 关联：AIRR `docs/superpowers/specs/2026-11-12-sketch-interaction-airr.md`
- 影响仓：luban-cad（web/viewer/shared）；私有 luban-backend（复用既有草图写面，无契约变更）

## 1. 背景

用户要求草图工具与特征树的 UI/交互“与 Onshape 完全一致，特别是曲线的控制点逻辑”。Live 取证（私有 `editor-flow-parity-20261112/sketch-tools/`，LubanUIProbe 文档）确认：

- 编辑态草图曲线按约束状态着色：欠约束**蓝**（实测核心 rgb(26,26,204)≈`#1a1acc`，线/圆）；选中**橙**（实测混合 rgb(197,143,72)，取 Onshape 选择橙）；封闭轮廓浅灰填充（实测 rgb(228,230,233)）。
- 端点/圆心/弧起止中点显示为**蓝色小圆点控制点**；选中实体显示橙色描边与浅橙填充。
- 选中实体可拖拽：拖实体整体移动、拖端点只动端点（待补抓端点专项）；释放后即时保存，Ctrl+Z 可还原。
- 选中实体按 **Delete** 直接删除（弧实测消失）。
- 悬停基准面为**橙色填充**（当前实现为蓝色）。
- 进入草图编辑**不强制转正相机**（实测保持 iso）。

当前实现（代码审计）：无控制点渲染、无拖拽、草图实体不可选中、不能删实体/约束、尺寸不能改值；活动草图统一橙色实线；点/圆心不渲染；进入草图强制正视。

## 2. 决策

### D1. 约束状态着色（整草图 dof 首版）
`SketchCurvesDecoration` 按活动草图的 `SketchDto.solve` 着色：
- `solve.status ∈ {failed, conflicting}` → 红 `#c0392b`；
- `dof === 0` → 黑 `#1f1f1f`；
- 其余 → 蓝 `#1a1acc`；
- 构造曲线虚线；非活动草图保持灰色虚线。
首版使用**整草图** DOF（后端 `getSketch.solve.dof`），不伪造每实体 DOF；每实体颜色需后端逐实体自由度分析，届时按 P0-07 bump shared。

### D2. 控制点渲染
活动草图绘制控制点：点实体、线端点、圆心、弧起点/中点/终点、样条控制点（同坐标去重），蓝色实心小圆点（屏幕半径 2.4px）。控制点只做显示与后续拾取目标，不改变草图事实源（params）。

### D3. 选择权威扩展
草图实体/控制点选择加入既有 `store.canvas.selection`（唯一权威），新增条目类型 `sketchEntity`（entityId，part=`curve|handle`，handleIndex）；`internal/selection-authority.ts` 在投影到 `connection.selectionSet` 时忽略草图条目（非 iModel 元素）。不新增第二选择状态机；`OnshapeSelectTool` 在草图编辑态保持暂停。

### D4. 拖拽与编辑管线
拖拽在屏幕空间命中控制点/实体：拖拽期间仅本地预览（覆盖层），释放后一次 `updateSketch`（全量 entities+constraints，经 `useSketchSystem.applyUpdate → LubanFeatureRpcInterface`）提交；失败保留原几何并 toast，成功由 `onCommitted` 刷新；标准 undo 生效。禁止拖拽期间逐帧 RPC。
Delete 删除选中实体/约束 = `updateSketch`（移除实体及其引用约束，或被约束依赖时由后端诚实拒收）；尺寸双击改值 = `updateSketchConstraint`（既有 API）。

### D5. 相机
不在进入草图时强制正视（与 live 一致）；提供显式“正视草图平面”命令（后续切片），不改变默认相机权威（iModel 视图）。

### D6. 非目标
文字/投影实体边/线性阵列/DXF/圆锥曲线/多段样条/3D 草图/表达式由独立切片立项；本 ADR 不改变后端 schema/RPC。

## 3. 备选方案

- **A. 平行选择切片（sketch.selection）**：违反 P1-01 单一选择权威，拒绝。
- **B. 用 iModel 元素装饰承载可拾取草图**：会引入第二套几何事实源/持久化，违反 P0-06，拒绝。
- **C. 拖拽逐帧 updateSketch**：RPC/求解风暴与 undo 噪声，拒绝。

## 4. 影响与回滚

- 无 schema/RPC 变更；compat 面不变。
- 渲染为纯显示投影，可单独回退；选择扩展为 additive 类型，不影响既有 face/edge/vertex/body 路由；拖拽/删除/改值均走既有写面，数据可撤销。
- 视觉：依赖 live 像素采样；若后续发现每实体 DOF 必要，先补后端分析再启用逐实体颜色。

## 5. 实施切片

S1a 着色+控制点（已实现，本 ADR 同时落地文档）→ S1b hover/选择 → S1c 拖拽 → S1d Delete → S1e 尺寸改值 → S1f 面域填充/正视命令；S2 特征树交互对拍；S3 缺失功能（BRepCore 就绪优先）。
