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
Delete 删除选中实体/约束 = `updateSketch`：移除选中曲线并级联移除引用它的约束（Onshape 删除图元带走附着约束）；单击尺寸数值把约束并入同一选择权威（`sketchConstraint`），Delete 移除该约束（实体/其余约束不动，与实体选择互斥）；**非尺寸约束 glyph（S1g，live `ui-evidence/sketch-constraint-glyphs-20261112`）**：活动草图按约束绘制 18px 屏幕方块（水平 —、竖直 |、⊥、∥、=、中点 —•—、重合 X、镜像双形+虚线轴；tangent/concentric/fixed/offset 本次未采到独立 live glyph，采用通用符号并登记为待复核视觉项），锚点取点位/线中点/实体代表点平均，重叠时向右成排避让（Onshape 实测 86 约束的 ⊥/∥/=/—/|/中点/重合/镜像成排聚在实体附近）；单击 glyph 选中同一 `sketchConstraint` 条目（浅蓝高亮 `#c7e2fa`，live 截图口径），Delete 删除该约束；glyph 常叠在实体线上，实体拾取层（`SketchEntityPicker`）经覆盖层命中通道让位——不拾取线条、不清约束选择（pointerdown/pointerup 双向抑制）；草图对话框「显示约束」（live 默认勾选）是唯一显隐开关：关闭时 non-dimension glyph 与尺寸标注**同时**隐藏并停用其选中/双击改值拾取（live `20/21-show-constraints-*.png`），状态存 `store.sketch.showConstraints` 并在 enterSketch 会话内延续；覆盖层命中时主动 blur 对话框控件（复选框/输入框），否则 preventDefault 令焦点滞留输入控件、Delete 被「输入框不吃键」守卫吞掉；选中点实体仍被未删除实体引用时整单拒收并提示（不产生悬挂引用），后端另有拒收兜底；尺寸双击改值 = `updateSketchConstraint`（既有 API）：双击数值标签弹出原位输入框（标签屏幕位置由 viewer 布局纯函数与绘制同源给出），Enter 提交、Escape/点击别处取消、失败保留输入框；仅 `distance/radius/diameter/length/angle` 可改（后端 updateSketchConstraint 白名单；直径与角度 2026-11-12 同期扩展）；角度标注按 Onshape 显示为度（弧 + 两端箭头 + `90°` 文本，viewer `angular` 布局），双击输入度、提交前换算回 shared 契约弧度（`sketch-dimension-value.ts` 单一转换；≥360°/≤0 拒收），`sketch-angle-dimension.spec.ts` 真栈 90°→45° 并重开持久。延伸（Onshape Extend，官方帮助：与修剪同一按钮下拉，快捷键 X）= `Sketch.Extend`，按帮助两相：第一击选**线/弧**（记录点击侧端点），第二击命中边界曲线→延伸到该边界最近交点（线/圆/弧段内），命中空白→投影到延伸射线（线）/圆周（弧）上止于点击位置（帮助：没有边界时止于点击点）；线源移动端点、弧源保持另一端不动增长扫角；圆/样条作为源诚实提示不支持；无边界/反方向保持原样并提示。与 Trim 共用 `sketch-screen.ts` 的屏幕→草图局部反解，本轮经官方 `viewport.viewToNpc` 修正了 view→NPC 的 y 轴镜像（旧实现手工除 viewRect 把上下翻转，水平线修剪因只用 x 而未暴露）。
撤销语义：`onAfterUndoRedo` 也刷新活动草图（撤/重做不发 `onCommitted`）。注意自动保存（ADR-0017 Stage F）推送会开启新 changeset 会话，原生 undo 只覆盖**推送前**窗口（默认 20s 防抖，与 ADR-0017 计划 20–30s 对齐）；S1c 真栈在推送前点击撤销验证（`sketch-entity-drag.spec.ts`）。该窗口与 Stage F 已登记限制同源，不新增第二套撤销状态机（P0-01/P0-05）。

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

S1a 着色+控制点（已实现）→ S1b 选择（已实现，`sketch-entity-select.spec.ts`）→ S1c 拖拽（已实现：曲线本体/控制点/圆弧端点、Escape 取消、撤销刷新，`sketch-entity-drag.spec.ts` 真栈）→ S1d Delete（已实现：曲线删除+约束级联+撤销恢复，`sketch-entity-delete.spec.ts` 真栈）→ S1e 尺寸改值（已实现：半径/长度双击内联编辑，`sketch-dimension-edit.spec.ts` 真栈）→ S1f 面域填充/正视命令/编辑不抢相机（已实现：`sketch-region-fill.spec.ts`、`sketch-camera-parity.spec.ts` 真栈；填充像素 PIL 核对 rgb(228,230,233)）；草图图元右键菜单（已实现：删除/建构线/正视/适合窗口/放大/清除选择，复制·变换·拉伸·旋转等未支持项诚实禁用；证据 `ui-evidence/sketch-entity-menu-20261112`，`sketch-entity-menu.spec.ts` 真栈）；修剪工具 `Sketch.Trim`（已实现：线/圆/弧按最近交点移除点击段、无交点整删、引用约束级联移除；ribbon「修剪」；`sketch-trim.spec.ts` 真栈 + 9 条纯逻辑单测；spline 诚实提示不支持）→ S1g 非尺寸约束 glyph（已实现：12 类 glyph 屏幕方块绘制 + 成排避让；单击选中/浅蓝高亮/Delete 删除；实体拾取覆盖层让位；`sketch-constraint-glyphs.spec.ts` 真栈 + viewer 6 条布局/绘制单测 + app 8 条锚点单测；`显示约束` 开关已接线：关闭时同时隐藏非尺寸 glyph 与尺寸标注（live 2026-11-12 实测 `20/21-show-constraints-*.png`），并关闭其选中/双击改值拾取；覆盖层命中时主动 blur 对话框控件，避免 Delete 被输入框守卫吞掉）；S1h 角度尺寸（已实现：viewer `angular` 标注弧/箭头/度数文本 + 双击度值；后端白名单 +angle；`sketch-angle-dimension.spec.ts` 真栈 90°→45° 重开持久；后端 `SketchAngleUpdateFlow` 2/2）；S1i 延伸（已实现：`Sketch.Extend` 两相——先选线/弧、再点边界曲线或自由端点；线源端点/弧源扫角；修剪同一下拉；`sketch-extend.spec.ts` 真栈（线/弧两例）+ 17 条纯逻辑单测；圆/样条作为源未做；共用反解修正 viewToNpc）；S1j 插入 DXF（已实现首切片：ASCII DXF 的 LINE/CIRCLE/ARC/POINT/LWPOLYLINE（直线段 + bulge 圆弧段，含闭合）/三次 4 控制点 SPLINE 导入当前草图，$INSUNITS 换算毫米，一次 updateSketch 可撤销；ribbon「插入 DXF 或 DWG」；`dxf-import.test.ts` 12 条 + `sketch-dxf-import.spec.ts` 真栈；DWG/二进制、BLOCKS/INSERT、非三次/周期样条、导入放置/旋转对话框未做，UI 仅文件选择+单位自动读取）；S1k 草图圆角（已实现首切片：live 2026-11-12 实测 Onshape 无独立半径框——圆角工具点击两条线共享角点即生成相切圆弧并显示可编辑 R 尺寸；`Sketch.Fillet` 点击角点 → 默认 R5 mm，两条线端点回缩到切点，插入 arc + coincident×2 + tangent×2 + radius，旧两线端点 coincident 移除；工具保持激活连续倒角，R 尺寸双击改值（圆角工具激活时尺寸编辑器仍可见可编辑）；同日补充 **Onshape「点两条曲线」**：依次单击两条不相连直线，在无限延长交点创建圆角（第一线选中后悬停第二线画预览弧；两线近端点回缩到切点）；平行/共线、交点在两线段内部（十字交叉四解歧义）、切点落在近端点外侧（间隙大于切距）诚实拒收；**显式 point 端点**支持：裁剪端改为内联点分离，旧 point 若不再被任何曲线/约束引用则清理，仍被引用时保留（不破坏共享点语义）；**直线-圆弧角点**支持：候选圆心=偏移线 × 源圆同心圆 R±r，切点须落在线段/源弧扫角内，源弧随 tangent 收窄（solver 既有 `SLVS_C_CURVE_CURVE_TANGENT` 弧-弧通道，无需改契约）；`sketch-fillet.test.ts` 14 条 + `sketch-fillet.spec.ts` 真栈 5 例（角点 R5→R8、两曲线间隙 L 形 R5、显式 point 角点分离/孤儿清理、直线-圆弧 R5 弧-弧相切重算）；剩余未支持：三条以上曲线共点、整圆/样条/投影几何——诚实提示）；S1l 工具退出收口（2026-11-12）：ribbon 的 `tool.activeToolId` 此前不随 PrimitiveTool 退出清理，修剪/延伸/偏移等工具 Esc 后 store 仍钉着激活 id，永久挡住 SketchEntityPicker 与尺寸编辑器（Onshape 退出即回到可选态）。Ribbon 监听 `IModelApp.toolAdmin.activeToolChanged`：默认选择工具恢复时延时一拍清空（防切换工具时旧工具 cleanup 的默认事件抹掉新工具刚写入的 id），并对 mock/壳期无事件面防御；真栈 `sketch-tool-activation.spec.ts`（修剪 Esc → store 清空 → 单击实体重新选中）。同轮把尺寸编辑器从「仅空闲/圆角」放开到**所有草图工具激活期间仍可见/可编辑**（Onshape live：圆角工具生成 R 后立即改值；非尺寸标签区域的点击不拦截，照常交给当前工具）。草图图元右键「拉伸…/旋转…」接线（live 实测：退出草图并打开对应特征对话框）：退出草图态 + 打开 FeatureDialog，会话内草图已逐次 updateSketch 持久化；「复制/粘贴/变换/曲线分析」仍禁用（复制/变换需 gizmo/剪贴板语义）。S2 特征树交互对拍；S3 缺失功能（BRepCore 就绪优先）。
