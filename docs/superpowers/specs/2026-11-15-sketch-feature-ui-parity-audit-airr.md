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

## 8. 首轮 live 复核（2026-11-15，已登录后采集）

采集方式：探测 Chrome（已登录）逐工具打开特征对话框，抓整页/对话框截图 +
可见字段/计算样式；空态 16 个特征 + 有实体填充态 + 展开区 + 下拉菜单。
证据与逐项 diff 在私有仓（见文首）。

**已确认的公共 chrome 指标（修正 2026-11-13 的错误采样）**：

- 标题 500 **13px rgb(170,37,45)**（此前 16px #333 采到的是容器）；
- header 29px、白底、**1px #d7d7d7 下边线**；
- ✓ 28×28 实心绿 **#009400**，禁用=同底色 **opacity 0.2**（此前浅绿底错误）；
- ✗ 透明底红 sprite X；
- 页签 12px，活动 #1651b0/500 + 2px 下划线；
- 图元选择字段：空态 **26px**、底 rgb(222,241,251)、1px 边框 rgb(22,81,176)、
  2px 圆角；已选态 42px、白底、1px #d7d7d7；值 13.3333px；行小标签 12px；
- 数值行：左 label、右值与单位、1px 下划线 + 计算器图标；可展开行用 chevron。

**首轮已修复（SK-1 重校准）**：草图对话框标题/✓/平面字段两态按上述 live 值
纠正，单元与真栈 `sketch-create-parity` 断言同步更新（此前断言值全部为错误
采样，已替换）。

**F-A 首批（拉伸/旋转 query field 与数值行）**：

- 草图通道的实体选择改为 Onshape query field 形态（空态 26px 蓝底只显示
  字段标签；已选态 42px 白底：12px 小标签 + 13.3333px 值行）；外层 section
  不再重复描边；无草图时字段仍在（空态）而不是消失。
- 字段文案按 live：拉伸「要拉伸的面和草图面域」、旋转「要旋转的面和草图面域」；
  圆角「要设置圆角的图元」、倒角「要创建倒角的图元」；拉伸第二方向行改为
  「第二个终止位置」并补一个诚实禁用的「拔模」子项（后端无第二方向拔模）。
- 数值行：12px 灰色标签、右对齐值、`mm` 单位后缀、底部 1px #d7d7d7 下划线；
  计算器图标按 live 位置渲染但**尚未实现**——诚实禁用并标注（后续切片）。
- 已知未做：合并范围行、终止条件行的翻转箭头、方向/起始偏移/拔模的折叠行
  结构、计算器弹层、文档单位制（live 英寸显示）——列入后续 F-A 切片。

**已采到的特征结构**（逐字段 diff 正在形成；关键结构差异）：

- 拉伸：结果类型页签 + 布尔页签（新建/加入/移除/相交）、图元字段、终止条件
  （给定深度/成形到下一个面/成形到面/成形到零件/成形到顶点/完全贯穿）、
  深度行、方向/起始偏移/对称/拔模/第二个终止位置、合并范围（全部合并+chip）；
- 圆角/倒角：页签 边/全圆角；图元字段；测量/控制下拉；半径/距离行；
  不对称与折叠子选项；
- 孔：顶部摘要、Inch/公制、孔类型、钻孔/钻孔尺寸、起始平面、终止、钻尖角；
- 抽壳：挖空 + 移除面 + 厚度（默认 0.1 in）；
- 放样/扫掠：轮廓/路径选择器 + 终止形态/引导线/连接/显示等参线等；
- 镜像/阵列：作用域下拉 + 布尔页签 + 图元/方向/平面选择器；
- 分割：零件/面页签 + 保留工具/修剪到面边界/保留两侧（默认勾选）；
- 变换：模式下拉（按直线平动/按距离平动/按 XYZ 平动/按配合连接器变换/
  旋转/原位复制/缩放）+ 线或点 + 复制零件；
- 移动面：偏移/终止类型下拉、距离行、重新应用圆角；
- 布尔：运算页签 + 工具 + 保留工具。

这些结构差异将按 F-A..F-E 波次逐个对齐；后端未实现的能力（曲面、全圆角、
引导线、按直线平动、阵列布尔作用域、保留两侧等）以**诚实禁用**呈现，
不造假、不静默 no-op。

## 9. 子代理逐组审计结论（2026-11-15，read-only）

四个只读审计子代理逐字段比对 live 证据与实现（报告在本地
`.superpowers/audit-20261115/reports/`，不入公共仓）。已回两组：

- **A 圆角/倒角/阵列/镜像**：
  - P0 假控件：`pattern`/`mirror` 的通用布尔作用域页签可点击但载荷从不读取；
    mirror 另有已接线的 `镜像操作` 页签 → 双行冲突。`fillet` 的「允许边溢出」
    复选框启用且默认勾选、onChange 为空操作。
  - 结构：pattern/mirror 顶部应为作用域下拉；字段标签应为「要镜像的图元」；
    pattern 行序需显式 order；文案「间距→距离」「实例数量→实例数」；
    标题只在 regen 错误态为红色，正常态 #333。
  - 能力缺口（诚实禁用）：fillet 不对称/部分/可变/允许边溢出/平滑/全圆角/
    测量/控制；chamfer 测量替代模式与面选择；pattern 布尔作用/跳过实例/
    任意方向/特征面 scope；mirror 新建独立体/面镜像/重新应用特征/体子集。
- **C 孔/抽壳/移动面/分割**：
  - 结构缺口（P1，全部先把 live 控件面摆出来再诚实禁用）：SplitPartDialog 完全
    缺 `零件/面` 页签与 `保留工具/修剪到面边界/保留两侧` 复选框行（现为 static
    文本 + 世界平面下拉）；Shell/MoveFace 缺空态 query field 两态、chip ×、
    live 数值行图标与 `挖空` 行；Hole 缺标题摘要 `Ø…↧…`、孔位/合并范围 query
    字段、图标化直径/深度/钻尖行，`英寸` 文案应为 `Inch`，方向 select 应改为
    数值行右侧反向箭头（并且 zh/en 缺 `direction` key 显示原始 key）；
  - 测试影响：四个 Dialog 单测与 hole/shell/move-face-ui/split-part-ui 真栈
    基线（体积必须不变）。
- **D 变换/基准面/布尔/特征阵列 + 草图 UI**：
  - **P0 数据损坏**：CPlaneDialog 忽略 `line+angleDeg`/`line+point`/`threePoints`
    定义，打开后直接 ✓ 会把高级平面**静默改写**成基准面偏移 → 必须只读保护
    （已派修复代理）；
  - Transform 结构与 live 差异大（图元 query、7 种模式、默认角度 30/缩放 1、
    均匀缩放行、footer）；booleanBodies 需去掉重复「运算」select、改名
    「保留工具」、按 live 顺序排列；FeaturePatternDialog 语义标签有误
    （`零件阵列` 是对象类型而非线性/环形）且无 live 证据（blocked）；
  - 草图实体右键菜单 live 顺序已采：删除草图图元在**最后**、有「确认 草图 N」、
    复制在建构线之前、变换草图图元应接到现有 transform gizmo；其余草图工具
    值弹框/提示/阵列 gizmo/使用工具仍 blocked，需先补 probe。
- **B 拉伸/旋转/放样/扫掠**：
  - P0：平铺的「方向/起始偏移/第二个终止位置」缺 CSS order，实际渲染在
    query field 之前；loft/sweep 完全没有结果类型/布尔页签壳。
  - P1：方向语义（live 方向是可展开的「拉伸方向」图元字段，反向在终止行用
    flip 按钮）；起始偏移组（终止+深度）；合并范围（全部合并 + body chip）；
    第二端重排（终止→深度→禁用拔模）；薄壁「厚度1/厚度2/终止/深度」；
    旋转「全方位旋转」文案与轴 query 壳；loft/sweep 禁用占位行与 query 壳；
    标题状态色；默认值与单位（产品目前固定 mm，不伪造 in）。

**已修复的 P0（W1，2026-11-15）**：

- `pattern`/`mirror` 不再渲染通用布尔作用域页签（载荷不读取，旧为可点 no-op）；
  页签只对真正消费作用域的 extrude/revolve/booleanAdd/booleanSubtract 渲染；
  mirror 只保留已接线的「镜像操作」单行。
- `fillet` 的「允许边溢出」改为禁用、未勾选、带「尚未实现」提示（旧
  enabled+checked 且 onChange 为空操作）。
- `CPlaneDialog` 打开 `line+angleDeg`/`line+point`/`threePoints` 定义的高级
  平面时进入只读态：显示定义类型与「删除后重建」提示，✓ 禁用且 confirm 提前
  返回，**不再把降级参数集写回**（旧行为会静默改写为基准面偏移）。

后续按 W2（圆角/倒角）→ W3（孔/抽壳/移动面/分割）→
W4（拉伸/旋转剩余）→ W5（镜像/阵列/布尔/变换/基准面）→ W6（放样/扫掠）→
W7（草图工具画布 UI）串行实施。

## 10. 当前状态

- 已完成基线：SK-1（草图创建对话框，`fd31417f`；2026-11-15 按 live 重校准）、
  SK-2（工具栏/飞菜单）、SK-6 部分（实体右键菜单、删除）、SK-9（相机命令/平面框）。
- live 采集已打通（探测 Chrome 登录恢复）；后续按波次继续采集/修复。
