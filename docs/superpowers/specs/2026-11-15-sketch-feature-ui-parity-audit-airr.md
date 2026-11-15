# AIRR — 草图与特征全量 UI/交互 Onshape 对标审计与修复（2026-11-15）

> 状态：**进行中**（证据采集中）。用户 2026-11-15 指令：「按照同样的标准检查全部草图和特征，
> 要求全部做到和 Onshape 一样，所有细节都要对齐，所有 UI 和交互都全面对齐」。
> 本文是本次全量审计的开工门禁（P0-04）与执行台账；逐对话框的字段级差异矩阵
> 与 live 截图在私有仓 `onshape-parity-data/docs/UI-DIALOG-AUDIT-20261115.md`
> 与 `ui-evidence/dialog-audit-20261115/`（公共仓不出现 live 截图/DOM 原文）。

## 1. 背景

2026-11-13 已完成草图**创建对话框**的 live 像素级对齐（标题/平面字段两态/底栏/
✓✗ sprite/平面框/取消删除，AIRR `2026-11-13-sketch-dialog-plane-frame-airr.md`），
并在此过程中确立了本轮对标的标准方法：

1. 先 live 采集（截图 + DOM + computedStyles + 交互录屏），不以记忆或推测为准；
2. 字段/样式/交互逐项对照，产出 diff；
3. 修复后单元 + 真栈 e2e 验收，证据落私有仓，公共仓只放脱敏结论。

用户要求把同一标准推广到**全部草图工具与全部特征对话框**。

## 2. 范围（审计对象全量清单）

### 2.1 草图（SK）

| 编号 | 对象 | 当前实现 |
|---|---|---|
| SK-1 | 草图创建/编辑对话框 | `dialogs/SketchDialog.tsx`（2026-11-13 已对齐，需回归复核） |
| SK-2 | 草图工具栏 + 全部飞菜单（绘制/约束/尺寸/修改） | ribbon-registry + `Ribbon`（2026-11-13 toolbar-live-parity 已审计） |
| SK-3 | 绘制工具画布交互：连续绘制、双击结束、Esc/右键退出、热捕捉/ AccuSnap、光标旁实时读数 | `tools/sketch/SketchCreateTool.ts`、`sketch-pick.ts`、`SketchValuePopup`、`SketchToolFeedbackOverlay` |
| SK-4 | 尺寸工具：线性/角度/半径/直径、双击改值、值弹框、漂移/冲突提示 | `SketchAddDimensionTool`、`SketchDimensionEditor`、`sketch-dimension-logic.ts` |
| SK-5 | 修改工具：圆角/倒角/偏移/修剪/延伸/分割/镜像/阵列 | `SketchFilletTool`/`SketchChamferTool`/`SketchOffsetTool`/`SketchTrimTool`/`SketchExtendTool`/`SketchSplitTool`/`SketchMirrorTool`/`SketchPatternGizmo` |
| SK-6 | 草图实体选中/拖拽/控制点/右键菜单/复制粘贴/删除 | `SketchEntityPicker`、`sketch-drag.ts`、`CanvasContextMenu`（2026-11-12/13 已部分审计） |
| SK-7 | 约束工具：添加约束/自动推断/欠约束提示/矛盾面板/约束图标 | `SketchAddConstraintTool`、`sketch-constraint-glyphs.ts` |
| SK-8 | 「使用/投影」：使用边、投影到草图、交叉曲线入口与对话框 | `SketchUseOverlay`、`tools/sketch` 投影通道 |
| SK-9 | 草图退出/完成/成品、草图相机命令（正视/取景） | `PartStudioCanvas`、`ViewCubeCameraMenu`（2026-11-13 已对齐） |

### 2.2 特征（F）

| 编号 | 对象 | 当前实现 |
|---|---|---|
| F-1 | 拉伸 extrude（实体/曲面/薄壁页签、方向、终止条件、第二方向、拔模、偏移） | `FeatureDialog` |
| F-2 | 旋转 revolve（轴、角度、面域、全方位） | `FeatureDialog` |
| F-3 | 圆角 fillet（边页签/全圆角、半径、切向延伸、可变圆角 gated） | `FeatureDialog` |
| F-4 | 倒角 chamfer（等距离/两个距离/距离和角度、测量、切向延伸） | `FeatureDialog` |
| F-5 | 孔 hole（简单/沉头/倒角孔、直径、深度/终止条件、钻尖角、位置） | `HoleDialog` |
| F-6 | 抽壳 shell（移除面、壁厚、方向） | `ShellDialog` |
| F-7 | 放样 loft（截面列表、多截面） | `FeatureDialog` |
| F-8 | 扫掠 sweep（轮廓/路径、路径限制） | `FeatureDialog` |
| F-9 | 镜像 mirror（零件/特征范围、平面来源、操作 加入/移除/相交/新建） | `FeatureDialog` |
| F-10 | 阵列 pattern（零件/特征、线性/圆周、方向、距离/角度、居中、第二方向、跳过实例） | `FeatureDialog` / `FeaturePatternDialog` |
| F-11 | 布尔 booleanBodies（目标/工具/运算/保留工具） | `FeatureDialog` |
| F-12 | 基准面 cPlane（偏移/平面点/线角度/线点/三点、反转法线） | `CPlaneDialog` |
| F-13 | 变换 transform（平动/旋转/缩放/复制） | `TransformDialog` |
| F-14 | 分割 splitPart（目标/平面/偏移/保留侧） | `SplitPartDialog` |
| F-15 | 移动面 moveFace（面/偏移/距离/内外） | `MoveFaceDialog` |
| F-16 | 特征对话框通用 chrome：标题、✓/✗、?、透明度/预览、字段两态、禁用/错误提示、编辑态 | `DialogHeaderButtons`、`FeatureDialog.css` |
| F-17 | 未实现族（拔模/加厚/筋/删除面/替换面/框架/钣金/曲面族…）的工具栏与对话框诚实禁用态 | ribbon gating + 能力引导（不伪造） |

## 3. 方法与证据

### 3.1 live 采集规范（每个对象产出）

- 截图：整页 + 对话框/工具单独截图（原始分辨率）。
- DOM/ARIA：可见字段树（顺序、标签、占位、当前值、单位、复选框/页签/下拉）。
- computedStyles：对话框底色/边框/圆角/阴影、标题字号字重颜色、label/input 字号颜色、
  行高、间距、按钮尺寸与颜色。
- 交互：默认值、字段出现/隐藏条件、页签切换、菜单项、聚焦/键盘、提交按钮禁用条件、
  错误提示文案、编辑态回显。
- 证据目录（私有）：`ui-evidence/dialog-audit-20261115/<object>/`；
  汇总矩阵：私有 `docs/UI-DIALOG-AUDIT-20261115.md`。

### 3.2 diff 维度（逐字段/逐交互）

存在性、顺序、文案（中英）、默认值、单位、控件形态（输入/下拉/复选/页签/分段）、
可编辑性（插入态/编辑态/只读）、依赖关系（选中面/草图后出现）、禁用与提示文案、
预览与透明度、提交/取消行为、撤销与重开回显。

### 3.3 阻塞与诚实原则

- live 不可达（登录过期/页面不可用）→ 标记 blocked，不凭记忆改 UI。
- 内核/后端未实现的能力 → 保持禁用并显示真实原因（`gated`），不造假、不静默 no-op。
- 只对齐**有 live 证据**的细节；推断项在矩阵中标注「外推」。

## 4. 分波执行（每波独立提交/推送，发布未授权）

| 波次 | 内容 | 交付门 |
|---|---|---|
| SK-A | 草图对话框回归复核 + 草图值弹框/反馈层/工具提示 | live 证据 + 单测 + 真栈 |
| SK-B | 尺寸工具全链（线性/角度/半径/直径、双击改值、冲突） | 同上 |
| SK-C | 修改工具（圆角/倒角/偏移/修剪/延伸/分割/镜像/阵列） | 同上 |
| SK-D | 约束/使用/投影/实体菜单/复制粘贴 | 同上 |
| F-A | 拉伸 + 旋转（页签/终止条件/方向/第二方向/薄壁/拔模） | 同上 |
| F-B | 圆角 + 倒角 + 孔 | 同上 |
| F-C | 抽壳 + 放样 + 扫掠 | 同上 |
| F-D | 镜像 + 阵列（零件/特征、两方向、居中、跳过实例） | 同上 |
| F-E | 布尔 + 基准面 + 变换 + 分割 + 移动面 | 同上 |
| F-F | 通用 chrome 与 gated 族诚实态 | 同上 |

顺序原则：先高频基础特征（F-A/F-B），再参数化长尾；每波先证据、再 diff、再改，
diff 矩阵随波次更新。

## 5. 复用矩阵（P0-03）

| 能力 | 复用 |
|---|---|
| 对话框/表单/按钮 | 既有 React 组件 + `DialogHeaderButtons` + Onshape sprite（`onshape-icons.tsx`） |
| 几何/选择/预览 | 现有 `FeatureProfilePicker`、`store.canvas.selection`、`FeaturePreviewOverlay`、后端 `previewOp` |
| 草图工具 | iTwin `PrimitiveTool`/`AccuSnap`/`Sketch.*` 唯一族；不给第二套工具/状态机 |
| 样式 | 现有 `part-studio-*` CSS 变量与对话框皮肤；不引入第二套主题 |
| 测试 | 现有 vitest/Playwright 真栈 + seed B 模型；不新增假数据通道 |

## 6. 验收

- 每个对象：live 证据存在（或 blocked 说明）、diff 矩阵逐项闭环（修复/保持并记录原因）。
- 单元：受影响组件/工具单测通过；web 全量保持绿（当前基线 1848）。
- 真栈：每个对话框至少一条真实用例（打开→填参→提交→体积/树/undo→冷重开），
  编辑态与禁用态按证据断言；不接受 jsdom-only。
- 文档：本 AIRR 台账、`docs/README.md` 索引、`luban-cad/CLAUDE.md` 基线同批更新；
  known-red 如实登记，不放松断言。
- 公共仓不出现 live 截图/DOM/私有路径；证据只进私有仓。

## 7. 约束与回滚

- P0-01/05/06/10 不变：iTwin 唯一底座、FeatureOp 唯一参数化管道、params 唯一事实源、
  标准事务可撤销；UI 对齐不得引入第二套数据/选择/预览通道。
- 所有改动为前端 UI/交互层（除非证据要求后端行为变更，则单独 ADR + shared bump）。
- 回滚：按波次逐文件 revert；无数据迁移。

## 8. 当前状态

- 已完成基线：SK-1（草图创建对话框，`fd31417f`）、SK-2（工具栏/飞菜单）、
  SK-6 部分（实体右键菜单、删除）、SK-9（相机命令/平面框）。
- 阻塞：Onshape live 会话 2026-11-15 过期（需人工登录探测 Chrome），
  登录前只做代码侧清点；不凭记忆修改 UI。
