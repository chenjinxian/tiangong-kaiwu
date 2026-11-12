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
Delete 删除选中实体/约束 = `updateSketch`：移除选中曲线并级联移除引用它的约束（Onshape 删除图元带走附着约束）；单击尺寸数值把约束并入同一选择权威（`sketchConstraint`），Delete 移除该约束（实体/其余约束不动，与实体选择互斥）；选中点实体仍被未删除实体引用时整单拒收并提示（不产生悬挂引用），后端另有拒收兜底；尺寸双击改值 = `updateSketchConstraint`（既有 API）：双击数值标签弹出原位输入框（标签屏幕位置由 viewer 布局纯函数与绘制同源给出），Enter 提交、Escape/点击别处取消、失败保留输入框；仅 `distance/radius/diameter/length` 可改（后端 updateSketchConstraint 白名单；直径 2026-11-12 同期后端扩展），角度双击仍诚实提示未支持。
撤销语义：`onAfterUndoRedo` 也刷新活动草图（撤/重做不发 `onCommitted`）。注意自动保存（ADR-0017 Stage F）推送会开启新 changeset 会话，原生 undo 只覆盖**推送前**窗口；S1c 真栈在推送前点击撤销验证（`sketch-entity-drag.spec.ts`）。该窗口与 Stage F 已登记限制同源，不新增第二套撤销状态机（P0-01/P0-05）。

### D5. 相机
- 编辑既有草图（树双击/编辑入口）：**不**强制正视、**不**按实体范围取景、退出**不**回放相机（live：保持进入前 iso）。`store.sketch.orientCameraOnEnter` 只在新建草图确认时置 true。
- 新建草图仍按所选平面法向定向（既有创建语义），退出回放快照。
- 显式“正视草图平面”= 草图对话框底栏按钮（`orientCameraToSketchPlane`，标准 ViewState 旋转），不新增相机权威。
- 草图对话框底栏“缩放到合适大小”在编辑态按**草图实体范围**取景（Onshape 语义），非全局模型范围。

### D6. 非目标
文字/投影实体边/线性阵列/DXF/圆锥曲线/多段样条/3D 草图/表达式由独立切片立项；本 ADR 不改变后端 schema/RPC。

### D7. 面域填充
活动草图按 `getSketch().regions` 的采样边界（`outerBoundary`/`holeBoundaries`，局部 2D）经平面刚体变换后画浅灰填充 `rgb(228,230,233)`（live 像素采样），孔环按 evenodd 处理；直接使用后端面域集，不自行推导区域/不做第二几何事实源。只显示不拾取；拖拽预览期间隐藏（边界仍是旧解）。

## 3. 备选方案

- **A. 平行选择切片（sketch.selection）**：违反 P1-01 单一选择权威，拒绝。
- **B. 用 iModel 元素装饰承载可拾取草图**：会引入第二套几何事实源/持久化，违反 P0-06，拒绝。
- **C. 拖拽逐帧 updateSketch**：RPC/求解风暴与 undo 噪声，拒绝。

## 4. 影响与回滚

- 无 schema/RPC 变更；compat 面不变。
- 渲染为纯显示投影，可单独回退；选择扩展为 additive 类型，不影响既有 face/edge/vertex/body 路由；拖拽/删除/改值均走既有写面，数据可撤销。
- 视觉：依赖 live 像素采样；若后续发现每实体 DOF 必要，先补后端分析再启用逐实体颜色。

## 5. 实施切片

S1a 着色+控制点（已实现）→ S1b 选择（已实现，`sketch-entity-select.spec.ts`）→ S1c 拖拽（已实现：曲线本体/控制点/圆弧端点、Escape 取消、撤销刷新，`sketch-entity-drag.spec.ts` 真栈）→ S1d Delete（已实现：曲线删除+约束级联+撤销恢复，`sketch-entity-delete.spec.ts` 真栈）→ S1e 尺寸改值（已实现：半径/长度双击内联编辑，`sketch-dimension-edit.spec.ts` 真栈）→ S1f 面域填充/正视命令/编辑不抢相机（已实现：`sketch-region-fill.spec.ts`、`sketch-camera-parity.spec.ts` 真栈；填充像素 PIL 核对 rgb(228,230,233)）；草图图元右键菜单（已实现：删除/建构线/正视/适合窗口/放大/清除选择，复制·变换·拉伸·旋转等未支持项诚实禁用；证据 `ui-evidence/sketch-entity-menu-20261112`，`sketch-entity-menu.spec.ts` 真栈）；S2 特征树交互对拍；S3 缺失功能（BRepCore 就绪优先）。
