# AIRR — 草图绘制工具连续模式（提交后保持激活）+ 草图平面取点修复

- 状态：Implemented（2026-11-13 工作树；纯前端；无契约/后端变更）
- 关联：Onshape live（绘制工具提交后保持激活；2026-11-13 真栈对拍）；
  `2026-11-13-sketch-camera-fit-airr.md`（草图相机零副作用——本切片发现其连带
  取点回归）；P0-05（`updateSketch` 唯一管道）、P0-10（标准可撤销）。
- 证据：Onshape live 副本交互（工具提交后仍高亮激活；直线连续链、双击结束链、
  Esc 退出工具）。

## 范围

### 1. 绘制工具提交后保持激活（基类）

`SketchCreateTool.commitAnchors` 成功分支不再 `exitTool()`：

- 新增 `continueAnchors(points)` 钩子：缺省 `[]`（保持激活，下一形状从空锚点
  开始）；`SketchLineTool` 覆写为 `[上一段终点]`（连续链）。
- 双击（`ev.isDoubleClick`）：结束当前链/当前形状，清空锚点、工具保持激活；
  首次双击（锚点为空）为 no-op，避免完成形状后第二击落下多余锚点。
- 右键/`onResetButtonUp` 两层语义不变：有锚点=取消本形状并留在工具；无锚点=
  退出工具。Esc 由 viewer 快捷键子集 `startDefaultTool` 结束工具；SketchDialog
  的 Esc 分支在 `activeTool` 仍为 `Sketch.*` 时阻止顺带退出草图（两层语义）。
- 受影响工具（全部继承基类）：线/中点线/矩形（拐角/中心点/对齐）/圆（中心点/
  周边）/多边形（内接/外接）/弧（三点/中心点/相切）/样条/Bezier；`Sketch.Point`
  原本即连续放点。
- `SketchTangentArcTool`（独立 PrimitiveTool）同步：提交成功后回到「选起点」阶段
  继续画下一条弧；连续链式弧（自动取上一弧端点）仍未做。

### 2. 退出草图停掉草图工具

`PartStudioCanvas` 监听 `sketch.isActive` true→false：若当前 `activeTool` 的
toolId 匹配 `/sketch/i` 则 `exitTool()`。✓/Esc/切 scope 退出草图后不会把
`Sketch.*` 工具带进特征环境接管输入。

### 3. 取点根因修复（真栈验证时发现，必须随本切片修复）

进入草图不再自动正视草图平面（2026-11-13 相机零副作用裁决）后，
`BeButtonEvent.point` 是**视口光标深度面**（缺省 XY@z=0）上的世界点，不落在
草图平面。旧实现直接 `plane.toLocal(ev.point)` 丢弃法向分量：Front 平面 + ISO
相机下所有点 v 恒 0 → 矩形/圆弧退化「零宽/零高」，直线被压到同一直线。

新增 `sketch-pick.ts`（唯一取点实现）：

1. AccuSnap 热捕捉 `adjustedPoint` 优先（吸附点来自草图几何，本就在平面上）；
2. 视口光标射线构造：`viewToNpc(viewPoint, z=0/1)` → `npcToWorld` 两端点 →
   与草图平面解析求交（平行/无效数值返回 undefined）；
3. 回退 `ev.point` 投影（视口缺失/退化时不崩死）。

接入：`SketchCreateTool._pickLocal`、`SketchPointTool`（提交与预览环）、
`SketchAddConstraintTool.pickHitLocal`（约束/尺寸/相切圆弧共用）。

### 4. 测试基础设施修正（e2e）

- `tutorial2-helpers.activate`：点击工具栏前给当前 PrimitiveTool 实例打标，
  等待**新实例**装好再返回。重激活同一 toolId（连续尺寸）时旧实现只比较
  toolId，切换窗口内的第一击会丢失（真栈实证）。
- `tutorial2.spec.ts`：密集约束段落起临时关闭「显示约束」（对话框复选框同一
  store 开关，纯显示态），完成草图前恢复——约束 glyph/尺寸标注的命中矩形会经
  editor 的 window 捕获 `pointerdown` + `preventDefault` 把画布点击吞成「选中
  约束」（真栈 sendButtonEvent 实证：事件未到达 ToolAdmin）。喉线中点改用最新
  RPC 快照（尺寸提交后 SLVS 会微调几何）。

## 非目标

- 拖拽式连续绘制（Onshape 部分工具支持按下-拖动生成）；本轮只做点击式连续。
- 草图工具的“保持激活时切换变体/快捷键”语义（如直线链中按 L 续链）未做。
- 相切圆弧自动从上一弧端点续链未做。

## 测试

- 单测：`sketch-pick.test.ts` 4（斜交求交/平行 undefined/射线优先/无回退）；
  `SketchCreateTool.test.ts` 19（含直线链/缺省续锚点）；web 全量 **138 files /
  1823 passed**。
- 真栈：`e2e/sketch-continuous-draw.spec.ts` **3 passed**（含 setup）——
  ① 直线 3 击 = 2 段、共享端点、两段垂直（钉住取点修复）、提交后工具仍激活；
  重激活 = 新实例不续链；Esc 退出工具。② 矩形连续两个（4→8 线、宽高非零）；
  工具仍激活时点 ✓ 完成草图 → 草图工具被停掉。
- 真栈回归：`sketch-midline` / `sketch-concentric` / `sketch-perimeter-circle` /
  `sketch-tangent-arc` **4 passed**；`sketch-point-tool` / `sketch-center-rectangle` /
  `sketch-camera-fit` / `editor-state-refresh` **6 passed**；
  `tutorial2.spec.ts` 全链 **2 passed（3.4 min）**——此前 known-red（像素宽度
  83.38 与前序截断），本切片后全绿（18 实体/48 约束/9 尺寸/六特征体积断言）；
  `tutorial2-tools.spec.ts` 4 passed + 2 既有 count off-by-one known-red + 1
  MS 429 限流（环境，非代码）；`sketch-extrude` T8 仍 known-red（弧闭环
  regions=0，既有，非本切片引入）。
- `tsc`（src/e2e）/eslint 绿。

## 风险 / 回滚

- 纯前端：回滚删除 `continueAnchors`/`sketch-pick`/退出清理 effect，恢复各
  工具提交后 `exitTool()` 即可；无数据迁移、无契约变更。
- 取点语义变为射线∩平面：相机正视草图平面时与旧投影等价（单测 + 8 个真栈
  spec 覆盖）；非正视相机下为**唯一正确**解。
- 保持激活改变既有交互：连续尺寸/连续绘制不再“一次一退”。所有既有真栈 spec
  已回归；回滚面为单提交。
