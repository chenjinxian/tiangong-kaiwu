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

**W2 圆角/倒角（已完成）**：边选择改为单一 query field（空态 26px 蓝底单行、
字段本体点击开始拾取；已选 42px 白底：12px 标签 + 13.3333px `边 N` chips + ×），
DOM 行序与 live 一致（圆角：字段→切向延伸→测量→控制→半径→不对称→部分/可变/
允许边溢出/平滑；倒角：字段→测量→倒角类型→距离/距离2/角度→切向延伸）；
测量/控制保持禁用并带「尚未实现」提示；数值行 12px 标签 + 右对齐值 + mm 单位 +
下划线 + 诚实禁用的 `±` 状态按钮（角度无 mm）。载荷/默认值/拾取逻辑不变。

**W3 孔（已完成）**：标题改为 live 摘要（`Ø … ↧ …`，沉头孔追加
`| ⌴Ø … ↧ …`；`aria-label` 保留特征名）；单位页签 zh 字面量 `Inch`；孔位与
合并范围改为 query field 两态（孔位字段点击保留现有点/顶点列表）；孔类型/
钻孔尺寸保持禁用 + 提示；直径/深度/钻尖改为图标行（保留可访问名），直径与
深度加禁用计算器；删除单独「方向」下拉，改为深度行右侧「反向」图标按钮
（`direction` 语义不变，单测与 hole e2e 选择器已迁移）；终止行加可见标签、
起始平面改为禁用单选项、钻尖文案 `118 度/180 度`。载荷与默认值不变。

**W3 抽壳（已完成）**：首行新增诚实禁用的「挖空」（零移除面契约不支持）；
「要移除的面」改为单个两态 query field + 逐面 × 本地过滤（不改契约）；
删除可见目标实体行（owner 名放 title，错误 alert 保留）；「抽壳厚度」数值行
右对齐 + mm + 禁用计算器；方向下拉改为厚度行内方向箭头按钮
（`defaultDistance` 符号映射不变）。载荷/默认值/校验/预览不变。

**W7a 草图实体右键菜单（已完成）**：按 live 顺序重排——首项「确认 草图 N」
（复用 `blankMenuConfirm` key，调用既有 `onFinishSketch`）、复制在变换/建构线
之前、删除草图图元移到最后；其余禁用项与 testid 不变；单测与 e2e 增补首末项
与确认行为断言。

**W3 移动面 + 分割（已完成）**：
- 移动面：面选择改为两态 query field + 逐面 × 本地过滤；`偏移`/`终止类型`
  改为单一禁用下拉（title 说明）；距离行右对齐 + mm + 禁用计算器 + 方向箭头
  （符号映射不变）；删除可见目标实体行（owner 名移入字段 title）；
  `重新应用圆角` 保持禁用未勾选（后端无通道），逐面只读语义不变。
- 分割：新增真实 `零件/面` 页签（面禁用 + title，诚实提示保留在可访问树）；
  目标与工具改为两态 query field（工具唯一可用值=世界平面 chip，拾取器无通道
  如实只读）；`保留工具/修剪到面边界/保留两侧` 改为禁用未勾选复选框；
  世界平面/偏移/保留侧收进明确标注的产品通道分组；补底栏。
  载荷（plane/offsetMm/keepSide/targetBodyId）不变。

**W4a 拉伸行序/方向/合并范围（已完成）**：
- extrude 参数行改为显式 flex order（1–10）：query field → 终止条件 → 深度 →
  方向 → 起始偏移 →（薄壁）→ 对称 → 拔模 → 第二个终止位置 → 合并范围；
  直接子级提示排到参数之后；其他特征类型不受影响（作用域选择器）。
- 反向行为从「方向」复选迁到终止行的翻转箭头（aria-label 反向，
  aria-pressed=backward）；「方向」复选按 live 保留但诚实禁用（自定义方向
  无后端通道），展开的「拉伸方向」query field 同样禁用并标注未实现。
- 新增合并范围组：`全部合并` 默认未勾选；未勾选且可解析单一目标体时发
  `mergeScope:[{bodyKey}]`，勾选则省略该键（契约缺省=合并全部上游体）；
  多体未指定目标时字段留空 + 诚实提示，不发伪作用域；编辑态按同规则删除/更新。
- 载荷其余语义、默认值与校验不变。

环境注记：`extrude-up-to-surface-ui`/`-offset-ui` 两例在打开对话框**之前**的
“顶面拾取”步骤返回非面选择（同环境 `move-face-ui` 的面拾取正常），与 W4a
无关；另修复了产物 MS（shared 1.64.0）与工作区前端（1.70.0）的 RPC 版本
错配——建模服务已切源码模式验证。

**W4b 薄壁/第二终止位置/旋转（已完成）**：
- 第二个终止位置展开次序改为 live：终止条件 → 深度（可见标签「深度」，保留
  aria「第二方向深度」）→ 诚实禁用的拔模；深度行补 mm 与禁用计算器。
- 薄壁：可见标签「厚度 1」，默认值改 5 mm（旧版 mm 文档实测；文档单位显示仍
  为已登记缺口）；新增诚实禁用的「厚度 2」（0 mm，不参与载荷）；中间平面语义不变。
- 旋转：「全方位」→「全方位旋转」；轴下拉包进 Onshape query 字段壳
  （白底/1px #d7d7d7/2px 圆角 + 12px 标签 + 禁用装饰时钟），select 边框内嵌，
  可访问名与选项不变。

**W7-1 草图尺寸值弹框实测值预填（已完成）**：
- 尺寸候选事件新增可选 `measuredValue`；统一尺寸工具计算可证形态：线长、
  点-点距离、点-线垂距、平行线距离、圆/弧半径、直径；引用解析失败/几何退化
  保持空输入（不猜）。
- 弹框打开即预填 4 位小数并全选（input 改 text+inputMode=decimal 以支持选中，
  解析不变）；维度弹框加只读单位后缀（mm/°）。
- 确认/取消改为 live 的 22×22 实心绿/红圆钮 + 白色 sprite；卡片/输入尺寸对齐
  live。未实现（无证据）：参数状态下拉/切换、工具提交后保持激活、画布标注精度。
- 环境注记：`sketch-offset-circle` 整套跑与单独复跑均在 MS **429
  RATE_LIMIT_EXCEEDED**（retryAfter≈47s）下失败，非本切片回归；同批其余
  12 例真栈通过。

**W5a 镜像 + 布尔（已完成）**：
- 镜像：模式行改为真实作用域下拉（零件镜像/特征镜像/面镜像，面镜像诚实禁用
  + 说明）；删除重复的「镜像范围」行；已接线的「镜像操作」页签移到作用域下拉
  之后（新建仍禁用）；实体字段改用 `要镜像的图元` 标签 + query 壳（只读 chips，
  整体上游体无子集通道）；镜像平面改为 query 壳 + 禁用装饰时钟；特征镜像补
  「重新应用特征」禁用行。载荷/默认值不变。
- 布尔：删除重复的「运算」下拉，并集/差集/相交页签成为唯一操作权威；
  标签改「工具 / 保留工具」；工具复选框收进带标签的字段容器；目标实体行
  作为产品替代保留并注明；诚实门禁提示保留。
- 真栈：feature-mirror-ui / mirror-operation-ui / boolean-intersect-ui **4 passed**；
  `mirror-face-ui` 卡在打开对话框前的顶面拾取（“未获得持久面引用”），与
  up-to-surface 同因，与本次 UI 改动无关，记录为环境/选择回归待查。

**W5b 阵列 + 特征阵列（已完成）**：
- 体阵列：模式行拆成真实作用域下拉（零件阵列/特征阵列/面阵列，后两者诚实
  禁用 + 说明）与独立的「阵列类型」行（线性阵列/圆周阵列）；实体改两态 query
  壳 + 只读整件 chip（无子集通道）；方向改为 query 壳内的世界轴下拉 + 行内
  「反向」图标按钮（不再有独立文字复选框）；行序显式对齐 live（实体→方向→
  距离→实例数→居中→第二方向→跳过实例）；文案「间距→距离」「实例数量（含原件）
  →实例数」（title 说明含原件）；跳过实例补未实现提示；新建默认实例数 3→2。
- 特征阵列：类型选项改「线性阵列/环形阵列」（特征阵列不是零件阵列）；共享
  距离/实例数文案同步；无 live 证据（blocked）故不重排结构。
- 真栈：feature-pattern-edit-ui（3）、pattern-centered-ui、pattern-second-direction-ui
  共 **6 passed（4.2m，含 429 自动重试）**。

**W5c 变换（已完成）**：
- 目标改为两态 query 字段（`要变换或复制的图元`）+ 选中体 chip；编辑态只读；
  多体仍用内层 select（不伪造 ×）。
- 模式行改为 live 的无标签下拉，完整列出 7 种模式：按 XYZ 平动/旋转/缩放可用，
  按直线平动/按距离平动/按配合连接器变换/原位复制诚实禁用（无后端通道）；
  默认保持可用的按 XYZ 平动并注明与 live 默认的差异。
- 平移输入改为 X/Y/Z 值行（mm、右对齐、下划线、禁用计算器）；转角默认 90°→30°，
  缩放默认 2→1，新增默认勾选的「均匀缩放」（非均匀落库值仍只读）；
  补只读「点或配合连接器」提示行与共享底栏（滑杆禁用 + ?）。
- 载荷/预览/多分量守卫不变。真栈 transform-ui/transform/transform-scale/
  transform-nonuniform **5 passed（1.9m）**。

**W5d 基准面（已完成）**：
- 「图元」改为 Onshape query field 两态外壳（空 26px 浅蓝只显示字段标签、
  整字段可点；已选 42px 白底 chip + ×），右侧外置装饰时钟；空态触发按钮
  显式撑满字段（修复真栈 element-not-visible 回归）。
- 偏移/偏移距离改为 live 值行样式：12px 标签、右对齐值、1px #d7d7d7 下划线、
  mm 后缀、禁用计算器；偏移选项维持产品的 无/偏移（live 选项列表未采集）。
- 类型行保留为产品扩展（平面点=世界原点子集）并加 title 说明；底栏滑杆
  诚实禁用；高级平面只读保护不回退。
- 真栈：cplane-line-angle/line-point/three-point 通过；cplane-point 修好空态
  热区后 **4000.000 mm³ 通过**（此前因 0 高度触发按钮超时）。

**W6 放样/扫掠（已完成）**：
- 放样/扫掠补 live 两行页签壳（结果类型「实体」、布尔作用域「新建」为选中态，
  全部 disabled + title=未实现；aria 名带特征前缀）——信息展示，不提供可点
  no-op，载荷不变。
- 放样有序截面收进 `轮廓` query field（42px 选中壳；≤2 截面时无移除钮），
  新增 `终止形态` 可折叠组（起始/终止轮廓形态禁用「无」）与引导线/路径/
  连接/显示等参线四条禁用行；范围说明改 sr-only（testid/文本保留）。
- 扫掠 `要扫掠的面和草图面域` / `扫掠路径` 两个 query field，路径空值为
  live 红框必填；延伸至完整路径/轮廓控制（无）/扭曲/缩放禁用行。
- 单测 FeatureDialog **214/214**、web **1909/1909**；真栈
  loft-sweep-preview/loft-multi-section **3 passed（3.7m）**（三截面
  4000 mm³、两截面+扫掠 2427.575 mm³）。

**W7b 内联尺寸编辑 + 约束选中（已完成）**：
- 内联值输入框贴尺寸标签左侧（右缘距标签 4px、垂直居中；无标签矩形回退
  双击点），纯函数 `computeDimensionEditorPlacement`；live 皮肤 100×26 白底、
  1px #2850aa、radius 2、无阴影、13.3333px；右侧只读 mm/° 后缀（解析/载荷不变）。
- 非尺寸约束 glyph 选中改为纯 #e2f0fa 填充、无边框/圆角（live 14-single-origin）。
- picker/value 单测 **17/17**；真栈 sketch-dimension-edit/sketch-fillet/
  sketch-constraint-glyphs **8 passed（3.3m）**。

**E4 顶部提示 pill（已完成）**：
- 阶段提示从光标卡拆出为画布顶部居中 pill：live 实测 ~180×27、底 #e2f0fa、
  字 #1c4070 13px、radius 4、前导 ⓘ 14px、距工具栏 10px、无边框；
  光标卡只保留实时尺寸（无尺寸不渲染空白卡），`sketch-tool-feedback` /
  data-measures 锚点不变。
- 覆盖层组件测试 8 + 总线 3；干净窗口 tutorial2+sketch-create-parity
  **3 passed（5.4m）**（一次 HMR 打断的环境性红已如实记录，重跑通过）。

**标题错误态两态修正（已完成）**：
- live 复核纠正：健康对话框标题 **#333**，仅 `has-regen-error` 时 #AA252D
  （sketch-dialog-front #333 / sketch-dialog-initial 红；feature-extrude-filled
  等健康 #333 / 空态红）。此前校准误用错误态样本把标题恒钉为红。
- SketchDialog：未选平面或提交错误 → 红，否则 #333；FeatureDialog：可编辑
  但不可提交或提交错误 → 红，否则 #333。单测两态、e2e 增红→#333→红断言；
  web **1919/1919**、tsc/e2e tsc/eslint 绿。

**E3 圆角悬停徽标（已完成）**：
- 草图圆角工具悬停可倒角角点（直线-直线/直线-圆弧）时，画布在角点显示
  橙色实心圆点 **#f0b93f** + 右上角浅褐 **#cfa574** `R5` 纯文本（无底/无描边，
  2px 白色描边光晕；私有证据 item6-current-before-typing / after-esc-fillet）。
- 经 feedback bus 新增只读 `badge`（视口 CSS px，与 cursor 同空间），HTML
  覆盖层渲染（pointer-events none / aria-hidden），不参与拾取与几何。
- 仅圆角有 live 证据；倒角/偏移不加。反馈套件 32/32、web 1930/1930。

**E1b 尺寸工具弹层等待（已完成）**：
- live：尺寸值弹层打开期间工具保持激活（蓝色高亮），可链式标注；我方此前
  发候选即退出。
- 新增 `dimensionPopupClosed` 事件：仅在弹层关闭一个 dimension 候选
  （确认成功/取消/草图切换）时发射；非法值/提交失败不关闭不发射；offset
  候选由工具自持不发射。统一与旧尺寸工具发候选后保持安装、忽略画布拾取，
  收到关闭事件后退出；清理退订防陈旧监听。自动开始第二个尺寸仍需探针。
- 定向 46/46、web 1930/1930。

**2026-11-15 用户重新登录后的补充探针（sketch-probe-20261115b）**：
- 值弹层计算样式（覆盖此前像素估计）：面板 229×62 / panel 209×34；输入
  100×26；激活下缘 **1px #1651b0**；左 20×20 展开箭头禁用灰 #d7d7d7；
  确认 **#009400 / radius 4** 白勾、取消 **白底 1px #cccccc / radius 4**
  红 X（此前记录的 #419228/#ae3c3e 实心圆不是该构造）。`parameter-state-toggle`
  20×20 在此尺寸上禁用 → 下拉内容仍不可得。点击画布空白**不关闭弹层**。
- 草图线性阵列：方向三角箭头/方形柄/弧形导轨+圆柄；实例数 = 浅褐 chip
  （采样 rgb(214,188,160)）`3x`；间距 = 纯文本 + 白晕 `1`；pattern 工具
  无顶部提示条。
- 约束 chip 为 canvas 绘制（无 DOM）；hover 高亮关联实体（黄线+橙点），
  selected = 浅蓝填充；chip 未缩放几何仍只能估 16–18px。
- 状态栏 `长度:` = DOM span.measurement-name 13.3333px rgb(102,102,102)；
  点坐标读数为 canvas 未采样。Use 覆盖层悬停仍无可见候选（BLOCKED）。

**E1c 值弹层按钮 + E6a 阵列 chrome（已完成）**：
- 值弹层：确认/取消/展开箭头/聚焦下划线按上述计算样式修正（新增 zh/en
  `expandExpression` 键；展开箭头诚实禁用）。
- 草图阵列：计数浅褐 chip、间距纯文本白晕、pattern/use 提示条统一 E4
  pill；定向 33/33、web **1934/1934**。
- **E5 选中 chip 可见性修正（已完成）**：像素测量（dpr 2）得选中 chip 浅蓝
  填充 40×40 设备 px = **20×20 CSS px**；此前不透明 HTML 浅蓝覆盖层会遮住
  canvas 绘制的符号（真实回归），已改为 `mix-blend-mode: multiply`
  （白底染浅蓝、深色符号保留），CSS 钉同步。chip 本体 18→20 需改 viewer
  装饰器并重建 dist，且未选态度量受背景干扰，暂缓。
**2026-11-15 子代理全量续作（E5 / S4b）**：
- **E5 chip 尺寸**：选中浅蓝填充 40×40 设备 px（dpr2）= 20×20 CSS px；
  `CONSTRAINT_GLYPH_SIZE` 18 → 20（间距随之 22），viewer dist 重建。
- **E5 悬停关联高亮**：live 悬停非尺寸约束 chip 时，其引用曲线黄绿
  ~rgb(232,245,136)、控制点橙色 ~#f0b93f。viewer 曲线装饰器新增
  `entityId` / `highlightedEntityIds` / `setHighlightedEntities`，活动草图
  被引用曲线叠画 #e8f588 3.2px、控制点 #f0b93f r3.6；app 在画布 mousemove
  命中 glyph（canEdit 且无草图工具激活）→ `constraintEntityIds()` 收集
  引用实体 → PartStudioCanvas 传入装饰器；离开/切草图/工具激活即清空。
  纯显示层，不参与拾取/选择。
- **S4b 右下角状态读数**：新增 `SketchStatusReadout`（画布右下、仅草图
  模式、无数据自隐、pointer-events none）：单条选中曲线显示 `长度`/`半径`
  （尺图标 + 3 位小数 mm），光标世界点显示 `X … mm Y … mm Z … mm`。
  标签 13.3333px/#666（live `.measurement-name`），值 #333。
  **单位口径（代码审查纠正）**：草图 DTO/世界数值即产品固定 **mm**（20×20
  草图=4000 mm³ 的既有口径），**不 ×1000**；`sketch-plane.ts` 的「米制」
  注释是遗留误导。指针用 pointermove + rAF 合帧 + 3 位小数去重，且
  指针订阅放在读数叶子组件内（不重渲染整棵画布）；真栈
  `sketch-dimension-edit` 增读数格式/量级断言。
- 验证：viewer **157/157**、web **1957/1957**、tsc(src+e2e)/eslint 绿。
- 仍待证据：E5 未选态 chip 几何细项、E7 use 候选样式（再次探针仍无可见
  候选）、S1a 下拉菜单（该尺寸禁用）、S3a 内联编辑 blur。未采集前不改。

## 10. 当前状态

- 已完成基线：SK-1（草图创建对话框，`fd31417f`；2026-11-15 按 live 重校准）、
  SK-2（工具栏/飞菜单）、SK-6 部分（实体右键菜单、删除）、SK-9（相机命令/平面框）。
- live 采集已打通（探测 Chrome 登录恢复）；后续按波次继续采集/修复。

### 2026-11-16 命名 / 诚实波次（纯前端）

- **C1 新特征命名**：新增 `internal/feature-naming.ts`——`nextFeatureName(type,
  entries, labelFor)` 按树内同 `featureType` 计数 +1（抑制特征计入；删除后的
  空号可复用，与 Onshape 行为一致），15 类标签键。cPlane/shell/moveFace/
  transform/splitPart/featurePattern 与通用 FeatureDialog 插入均使用编号名，
  编辑既有特征保持原名；FeaturePatternDialog 源 chips 由原始 id 改为可读
  特征名（无匹配时回退 id）。
- **A4/A5**：FeaturePatternDialog 接收可选 `features` 列表渲染源标签；补共享
  底栏（禁用透明度滑杆 + ?），与其余对话框一致。
- **A3/D2/D3/E1/D7 诚实化**：倒角面→边分解提示；CPlane 仅基准面/世界原点提示；
  `CAPABILITY_SCOPE_NOTES`（cPlane 作用域说明，能力状态仍 full、行为不变）；
  草图阵列提示明示「实例为独立副本，无关联阵列约束」；草图实体菜单「选择▸」
  渲染 live 捕获的五行常驻禁用子项（逐项真实原因 title）。
- **D7 菜单可达性修复**：五行子项使菜单实际高度超过原有 520 估算，末项
  「删除草图图元」落在视口外且菜单不可滚（真栈表现为点击重试至 7 min 超时）。
  菜单改为以 `innerHeight - top - 8` 为内联 maxHeight + `overflowY: auto`，
  单元测试钉「top + maxHeight ≤ 视口高」不变量。
- **审查修复轮 F1–F6**：孔新特征名按树编号（可见标题仍为 Ø/↧ 摘要）；
  镜像特征作用域/布尔作用域的标题与成功 toast 跟随实际提交类型
  （`featureMirror`/`booleanAdd`/`booleanSubtract`，`featureNameForType`
  仅显示、`submittedFeatureType` 仍是提交权威）；FeaturePatternDialog 源
  chips 对**被抑制**源也显示树派生名（显示表不过滤抑制行，候选选择器仍过滤）；
  `CAPABILITY_SCOPE_NOTES` 注释改为事实（注册表/能力矩阵记录，当前可见提示
  在 CPlaneDialog）；pattern 底部 ?/滑杆补真实原因 title；菜单夹紧公式精确到
  极小视口（top/maxHeight 下界 0）。未做：水平夹紧、窗口 resize 重定位
  （记录残留）。
- **验证**：web **2000/2000**（首跑 1 例未捕获用例失败，立即重跑全绿，按
  flake 记录）、tsc（src/e2e）/eslint 绿；真栈（修复后）`feature-pattern-edit-ui`
  4 + `feature-mirror-ui` 1 **5 passed（2.7 min）**、`split-part-ui` +
  `hole`（完全贯穿）+ `boolean-intersect-ui` **4 passed（2.0 min，含 setup）**；
  修复前已绿：`sketch-entity-menu` 4、`shell` 2、`transform-ui` 2、
  `sketch-pattern` 9、`move-face-ui` 1。`split-part-ui` 曾因 MS 429 窗口
  中断一次，干净窗口复跑通过（非产品失败）。

### 2026-11-16 W8a/W8b 数值行 / 对话框细节 / 草图变换入口

- **W8a**：A1 圆角五个次要选项（不对称/部分圆角/可变圆角/允许边溢出/
  平滑圆角）逐项 `notImplemented` title；B2 起始偏移组 = 禁用单选项终止
  选择（真实原因 title）+ 值行（label/input/mm/禁用计算器/下划线），
  `startOffsetMm` 条件与载荷不变；B3 拔模/旋转/变换角度补 `°` + 禁用
  计算器，均匀缩放无单位 + 计算器（`__angle` 网格规则扩展，chamfer/pattern
  角度行视觉随之统一）；C2 特征对话框复选框 `accent-color:#1651b0`（CSS
  文本断言）；B1 拉伸深度默认 **10 mm** 注释记录为产品单位裁决（不复制
  live 英寸值，不改行为）。
- **W8b**：C3 孔沉孔/倒角、Split 偏移、CPlane 原点 X/Y/Z 行补禁用计算器；
  C7 Split 「用于分割的图元」字段补装饰时钟；A6 featurePattern 轴方向改为
  只读「方向」值行（原文案入 title）+ skip 行禁用 chevron；D6 草图实体
  菜单「变换草图图元」接既有 `startSketchPattern('transform')` gizmo
  （无第二工具/无新载荷），真栈验证提示出现 + Esc 退出；只读会话/未接线
  时该行诚实禁用（真实原因 title），不启动无法提交的 gizmo。C3/C7 为
  纯装饰，jsdom 单测 + 沉头孔/分割真栈复核。
- **审查修复（W8 复审）**：孔沉孔/倒角行网格补到 4 列（计算器不再换行）；
  变换草图图元行在只读会话/未接线时禁用（真实原因 title），宿主仅 canEdit
  传 handler（ribbon 路径原本已有门禁）；e2e 旋转对话框 Escape 后补关闭
  等待；Split 工具字段时钟改用 mirror clock 的 button 惯用标记。C3 计算器
  维持“禁用按钮 + aria-label”的主行惯用（brief 的 aria-hidden 描述已更正）。
- **验证**：web **2013/2013**、tsc（src/e2e）/eslint 绿、i18n zh/en 1541
  键零差集；真栈 `sketch-entity-menu` **4 passed（2.1 min）**、
  `feature-pattern-edit-ui` **4 passed（2.1 min）**、`feature-flow-parity`
  （B2：2000.000 mm³、质心 z=-0.500）+ `transform-ui` 2 **3 passed（1.5 min，
  含 setup）**、`hole`（沉头孔 373.052 vs 373.064）+ `split-part-ui`
  **3 passed（1.3 min，含 setup）**。

### 2026-11-16 W9 孔行排版 / 移动面提示收纳

- **C4**：孔「孔类型/钻孔尺寸」行采用 live 的 11px 灰标签 + 14px 无边框值
  变体（该变体在 `435f1c6f` 已存在；本波清理重复 CSS 草稿使其成为单源，并
  补 CSS 文本钉与可访问名结构断言）。
- **C6**：MoveFace「重新应用圆角」未支持理由移入复选框 `title`，可见提示块
  取消；原因文本与逐面只读说明保留为 sr-only 锚点（testid 不变，e2e 的
  `toContainText` 断言仍成立）。载荷/校验/禁用态不变。
- **验证**：web **2014/2014**、tsc（src/e2e）/eslint 绿；真栈
  `move-face-ui`（6000.000 mm³ 精确）复跑通过。
- **live 探针状态**：2026-11-16 04:03Z 探针页再次显示 Onshape 会话超时横幅；
  点击「单击此处重新连接」8 s 后仍未恢复。S1a/S3a/S5/S6a/S7、featurePattern
  live 形态（P1–P4）、boolean filled（B1–B3）、B5、C5 等继续阻塞，未改相关
  UI。A2（值行 chevron）裁定不做（无展开行为的惰性键=假可供性）。

### 2026-11-16 重新登录后补采（S3a / E5 / E6 / pattern）

- **S3a 内联尺寸编辑**：双击画布尺寸标签打开 `dimension-dialog`（179×62）：
  drag 条 159×13（4 方点 grip）、panel 159×34 白底 radius 0、
  shadow `0 5px 10px rgba(0,0,0,.2)`；输入 100×26 透明底、底部 inset
  1px #1651b0；✓ 22×22 #009400 radius 4，✗ 22×22 白底 1px #cccccc
  radius 4。**点击画布空白不关闭**；Esc 取消、Enter/✓ 提交、✗ 取消。
  旧实现（1px #2850aa 全边框、无按钮、blur 取消）据此纠正。
- **E5 约束 chip**：未选中 20×20 CSS、填充纯白 #FFFFFF、**无深色描边**；
  符号核心 ~#555；选中填充 #E2F0FA（web overlay multiply 保持）。
  viewer 装饰器由 `rgba(251,250,248,.96)`+深描边改为纯白无描边、符号 #555。
- **E6 绘制中读数**：拐角矩形拖动时宽/高数值沿边方向旋转显示（宽在顶边
  外侧上方、高在左边外侧，蓝色无卡片、无尺寸线箭头，值=文档单位 3 位小数）。
  我方当时为光标旁 measures 卡（产品扩展）；W11 已实现矩形贴边读数（见下）。
- **pattern 编辑形态**：作用域 select → 新建/加入/移除/相交页签 →
  要阵列化的图元 query（×）→ 方向 query（×）→ 距离（单位+图标）→
  实例数（图标）→ 居中 → 第二个方向 collapsible（未启用时 expander 禁用
  #d7d7d7，勾选后自动展开：方向/距离/实例数/居中，缩进竖线）→ 跳过实例
  collapsible → 透明度滑杆 + ?。据此外观收紧 FeaturePatternDialog
  （作用域/操作页签诚实禁用、距离/实例数单位与图标、第二个方向折叠组）。
- **仍未采到**：S1a 数量输入下拉（Deg 尺寸上未能重现）、E7 使用候选
  （此前多次无可见候选）、boolean/孔/拉伸新建对话框（本轮工具栏点击未
  弹出，待重试）、B5/C5。未采到前不改对应 UI。
- **实现（W10a/b/c，2026-11-16）**：
  - S3a：`SketchDimensionEditor` 重做为 live dimension-dialog（drag 条 +
    159×34 白面板 + 100×26 输入（inset 1px #1651b0）+ ✓/✗ 按钮）；
    **点击画布不关闭**，Esc/✗ 取消、Enter/✓ 提交，失焦后窗口级 Enter/Esc
    仍生效，提交中按钮禁用；错误态改为红色下划线。旧 blur-cancel 移除。
  - E5：viewer 约束 chip 改纯白无描边、符号 #555；选中 #E2F0FA 仍由 web
    overlay multiply 负责；20px 尺寸/布局/命中不变；viewer dist 重建。
  - pattern 形态：FeaturePatternDialog 增加只读作用域行（特征阵列）、四个
    禁用操作页签（无伪活动）、距离 mm + 禁用计算器、实例数禁用计算器、
    第二个方向折叠组（有落库轴=勾选/可用/默认展开；无轴=勾选与箭头禁用
    +原因；折叠仅可见性）、跳过实例禁用折叠行；载荷/提交语义不变。
  - **审查修复（W10 复审）**：键盘作用域重做（Cancel 按钮上的 Enter 归按钮、
    外部输入框 Enter 不提交、Escape 不吞其他消费者）；可见对话框
    （159×47）按视口夹紧（近边缘不裁按钮，输入垂直中心仍对标签中心），
    删除「标签保持可见」旧陈述（live 对话框覆盖标签）；drag 条去假
    `cursor: move`；blur 单测改用 `focusOut`（原 fireEvent.blur 为惰性断言）；
    e2e 空白点击改右上角并等待标注重排；pattern 作用域标签复用既有键、
    expander 在 busy/只读时禁用。
  - 验证：web **2034/2034**、viewer **159/159**、tsc(src/e2e/viewer)/
    eslint 绿；真栈 `sketch-dimension-edit`（含点击空白不关闭/✓提交/✗取消）
    + `sketch-constraint-glyphs` **4 passed（1.6 min，含 setup）**、
    `feature-pattern-edit-ui` **4 passed（1.9 min，含 setup）**；审查修复后
    `sketch-dimension-edit` + `feature-pattern-edit-ui` 合跑 **6 passed
    （2.8 min，含 setup）**。
  - 注：一次 Playwright 收集出现「test.describe 不在预期位置/No tests found」，
    显式 `--config=playwright.config.ts` 后正常（环境性，已如实记录）。

### 2026-11-16 W11 绘制中贴边读数（E6/S5）

- 拐角矩形/中心矩形拖动时：宽/高数值以蓝色（#4a90e2 族、13.3333px、无底/
  无边框/无引线）沿对应边旋转显示于边中点外侧，替代该场景的白色光标卡；
  非矩形工具与对齐矩形保持原光标卡（未采证据）。纯显示投影：不新增
  RPC/schema/草图数据路径，投影复用工具既有 local→world→view 链。
- **审查修复**：白卡抑制只来自实际渲染的贴边标签（零长度边回退白卡，
  读数不会消失）；新增工具级 fake-viewport 测试钉 width/height 配对与
  角点/中心矩形边端点（交换或错锚点即失败）；旋转归一化为 (−90°, 90°]
  （±90° 同向直立）。标签位于边外侧上/左与 live 证据一致（AIRR 旧措辞已正）。
- 验证：web **2050/2050**、tsc(src/e2e)/eslint 绿；真栈新 spec
  `sketch-draw-readout` **2 passed（39.4 s，含 setup）**、`tutorial2` 全链
  **2 passed（4.6 min）**，终体积 **357.730 cm³**、去材 0.422 cm³ 与基线
  一致（贴边读数断言替换旧白卡断言，数值边界未放宽）；审查修复后
  `sketch-draw-readout` 复跑 **2 passed（38.6 s）**。

### 2026-11-16 W12 直线/中心圆绘制读数

- **line**：绘制中长度值沿线段旋转贴在中点上方；同一次拖拽的角度读数不进
  白卡（live 仅显示长度；零长度回退时两者仍回白卡）。
- **center-point circle**：圆心→光标半径段中点显示水平 `Ø<直径>` 读数
  （直径=2×半径，沿用实时数字格式），半径白卡被替代；圆弧/其他工具保留
  白卡（未采证据）。纯显示投影，无 RPC/schema/草图数据变更。
- 验证：web **2065/2065**、tsc(src/e2e)/eslint 绿；真栈
  `sketch-draw-readout`（矩形+直线+圆三路径）**2 passed（47.6 s，
  含 setup）**。
- **W15 三点圆弧读数**：终点已锚、移动弧上点时，弧旁显示水平 `R<半径>`
  （蓝色、无白卡；位置=弧角中点沿圆心→中点方向外偏 8px）；共线弧不发布
  标签并保留原回退；仅起点阶段无读数（与 live 一致）。纯显示，复用既有
  point-label/抑制机制。验证：web **2080/2080**、tsc(src/e2e)/eslint 绿；
  真栈 `sketch-draw-readout`（矩形+直线+圆+圆弧）**2 passed（53.1 s，
  含 setup）**。
- **W16 内切多边形读数**：圆心→光标半径阶段沿用中心圆 `Ø<直径>` 点标签
  （live 截图 Ø3.576），半径白卡抑制；纯显示。验证：web **2084/2084**、
  tsc(src/e2e)/eslint 绿；真栈 `sketch-draw-readout`（矩形+直线+圆+圆弧+
  多边形）**2 passed（51.6 s）**。测试修正：多边形上的 Escape 会同时退出
  工具并关闭草图对话框（真栈实测 dialog=false），末尾不再对已销毁的「取消」
  按钮重试点击，改为按可见/可用状态清理并等待隐藏（否则会拖到测试超时）。

### 2026-11-16 W13 拉伸薄壁页签行序（B5）

- 依据 newly captured live THIN 形态：query → 中间平面 → 厚度1 → 厚度2 →
  给定深度 → 深度 → 起始偏移 → 对称 → 拔模 → 第二个终止位置；THIN 页签
  **不渲染方向组**。实现：对话框根增加 `data-result-type`，仅对
  `[data-feature='extrude'][data-result-type='thinWall']` 覆盖行序；方向
  组在薄壁态隐藏（纯显示，载荷/默认值不变）。mm 厚度默认与禁用厚度2 原因
  保持不变。
- 验证：web **2068/2068**、tsc(src/e2e)/eslint 绿；真栈
  `extrude-thin-wall-ui` **4 passed（2.1 min，含 setup）**——360/400/
  18.712 mm³ 均精确不变。

### 2026-11-16 再登录后补充证据（filled 对话框 / 布尔重排 / 拉伸组）

- **拉伸 filled**：query → 给定深度 → 深度（1 in；行尾计算器 + 小 ±/括号
  图标 + 翻转箭头）→ 方向/起始偏移/第二终止（chevron + 驱动复选框）→
  对称/拔模（单复选框）。THIN 行序见 W13；THIN 无方向组。
- **布尔 filled**：并集/差集/相交 + 单一「工具」query（chips，每条 ×；字段
  头 `os-param-query-list-reorder-button` 20×24，点击进入拖拽重排态，提示
  「对项目重新排序」/「完成 重新排序已完成」）+ 保留工具；无独立目标字段。
  **裁决**：单字段“添加实体”依赖视口 query 拾取通道，我方尚无；移除现有
  target 下拉/复选框会导致无法添加第二个体 → 保留产品替换，登记
  blocked-on-body-picker，不凭证据半重构。
- **孔 filled**：标题仅「孔」；Inch/公制；简单/沉头孔/倒角孔；草图点 query
  （时钟）→ 合并范围 → 孔类型/钻孔尺寸查表行 → 直径 → 起始平面 → 终止 →
  深度 → 钻尖角（inch 文档默认，产品 mm 默认保持既有裁决）。
- **拉伸方向/第二终止组内容**：勾选后出现「（无效: 拉伸方向）」错误态且组
  未展开（chevron 红色折叠）；组内容仍 blocked，未据此改 UI。
- **W14 起始偏移折叠组（据 live 薄壁截图）**：组头=chevron（未勾选禁用灰，
  勾选后启用并自动展开）+ 驱动复选框 + 标签；内容缩进（竖引导线）为
  给定深度终止选择 + 深度值行（1 in live；产品 mm 默认 0 为既有裁决）。
  载荷/校验/禁用终止原因不变。验证：web **2073/2073**、tsc(src/e2e)/
  eslint 绿；真栈 `feature-flow-parity` **2 passed（1.0 min，含 setup）**
  ——2000.000 mm³、质心 z=-0.5 不变。

### 2026-11-16 S1a/S1b 结案（尺寸弹框下拉与连续标注，live）

- **S1a 转 closed-evidence**：值输入右侧的「下拉」是禁用的 parameter-state
  键（hole-tolerance-precision 图标，纯数值尺寸不可用），左侧 chevron 也是
  disabled expander；不存在可展开菜单。完整尺寸弹框 = 拖拽条 209×13（1px
  #ccc 边框、三个空心方块握把）+ 面板 209×34（0 圆角、0 5px 10px
  rgba(0,0,0,.2)、下内边距 5），内含禁用 expander 20×20、输入 100×26、
  禁用参数态键 20×20、按钮组 52×28（✓/✗ 22×22、4px 间距）。拖拽条可拖动
  （+60/+40 → +60/+39）。mm 文档 ArrowUp/Down 在**有光标无选区**时步进
  ±1 mm；初值精度=显示小数+3（mm 2→5 位，如 15.74583；inch 3→6 位）；
  ✗ 取消回滚步进值。产品 mm 文档显示小数固定 2 位（工作区单位证据）。
- **S1b**：✓ 提交后尺寸工具保持 `is-active`，不退出；下一次拾取直接进入
  下一个候选/编辑（已有尺寸的边打开其编辑器，不创建重复尺寸）。我方
  当前 `dimensionPopupClosed → exitTool` 与此不符，列为后续切片。
- 实现波次：W17（弹框结构/拖拽/步进/初值精度，进行中）、W18（画布尺寸/
  角度标签精度 2/3 位）、W19（尺寸工具连续标注，待 W17 之后）。证据仅存
  私有仓（本次未在公共仓记录路径）。

- **角度尺寸编辑（live 补采）**：两线夹角弹框初值 `83.7325188 deg`（7 位
  小数、单位 token `deg` 在值内）；ArrowDown 步进 −1°（82.7325188 deg）。
  结合工作区单位（长度 0.12 / 角度 0.123）→ W18 标签精度：长度最多 2 位、
  角度最多 3 位（尾零裁掉）；角度编辑器初值 7 位、步进 1°、单位后缀对齐
  `deg`（画布标签仍为 `°`）。

### 2026-11-16 W17 尺寸对话框全结构 + 拖拽 + 方向键步进

- live 尺寸弹框 **209×47**：拖拽条 209×13（白底、1px #cccccc、三枚 7×7
  空心方握把）+ 面板 209×34（0 圆角、`0 5px 10px rgba(0,0,0,.2)`、下内边距
  5）；面板内禁用展开器 20×20（#d7d7d7 chevron、不可点）、输入 100×26（透明
  + inset 1px #1651b0 下划线、左内边距 3）、禁用参数态键 20×20
  （hole-tolerance-precision、not-allowed；纯数值尺寸无菜单）、按钮组 52×28
  （4px 间距、4/5px 内缩）。放置锚点不变，面板左扩 21px；视口钳制 209×47。
- 拖拽：仅 13px 拖拽条可拖。真栈实测 `setPointerCapture` 后浏览器把
  pointermove 回投到拖拽条，但 React 合成 `onPointerMove` 不再派发 → 改为
  拖动会话期间 window 捕获段监听（起点+总位移、渲染时钳制、重开复位；
  buttons=0/blur/pointercancel 收口；捕获保留给触屏/笔语义）。
- 方向键：无选区（光标态）时长度类 ±1 mm；未编辑文本以约束原始值（全精度）
  为基线、步进后显示完整值；有选区不步进（live）；IME 合成不步进；非正值
  不做步进侧抑制（提交解析器拒收）。角度保持默认（W18 按新证据补 1°）。
- 初值：长度 5 位小数去尾零（live 显示小数 + 3；mm 2+3）；角度格式不变。
- 验证：web **2098/2098**（重跑；首轮一次无关 flake 未复现）、
  tsc(src/e2e)/eslint 绿；真栈 `sketch-dimension-edit` **3 passed
  （1.4 min）**（209×47、禁用 toggle、+40/+30 拖拽、ArrowDown −1 /
  ArrowUp 还原、取消不提交）。
- 残留：S1b 连续标注（✓/✗ 后工具保持激活）→ W19；S1c（点既有尺寸实体 =
  编辑该尺寸）→ 后续；角度步进/7 位/单位 `deg` → W18；放置值弹层同构 →
  W17b；尺寸标签右键菜单 → W20。

### 2026-11-16 W17b 放置值弹层与双击编辑器共用 live 尺寸弹框外壳

- live 的放置值弹层与双击编辑器是同一个 `dimension-dialog`；抽出共享外壳
  `SketchDimensionDialog`（唯一视觉实现）：209×47（拖拽条 209×13、三枚
  空心方、1px #ccc；面板 209×34、禁用 expander/参数态键、输入 100×26 常显
  inset 下划线 + 只读单位后缀、按钮组 52×28）。
- 放置弹层居中于放置点击（left=anchor.x−104.5、top=anchor.y−31、top ≥8
  安全钳制）；初值长度 5 位小数、角度 7 位（去尾零），单位 `mm`/`deg`；
  光标态 ±1 mm 步进（角度 W18）；每个候选复位拖拽位置；提交/取消/错误与
  `dimensionPopupClosed` 契约不变。偏移弹层保留产品旧卡（独立分支）。
- 编辑器经外壳重构后键盘作用域/聚焦/提交/取消/glyph 选择路径不变。
- 验证：目标单测 48/48、全量 web **2102/2102**、tsc(src/e2e)/eslint 绿；
  真栈 `sketch-dimension-edit` **3 passed**、扩展后的放置标注流通过
  （`tutorial2-tools` 8 passed；另 1 失败为该 spec 既有 count off-by-one
  known-red 的「竖直 约束数」15≠16，与本次 diff 无共同代码路径）。

### 2026-11-16 W18 草图标注精度 + 角度编辑器

- live：长度/距离/半径/直径标注最多 **2 位小数**、去尾零（25.98062 → 25.98）；
  角度标注 **3 位**（88.4961608° → 88.496°）；角度编辑器初值 **7 位度**
  （83.7325188 deg）、ArrowDown **±1°**、单位后缀 `deg`（画布标签仍 `°`）。
  取整为**十进制 half-up**（live 实采：mm 2 位小数下输入 28.575 → 标签 28.58；
  JS `toFixed` 给 28.57）→ 新增 `decimal-format.ts#formatFixedHalfUp`，标注/
  编辑器/弹层统一走它（负数 half-away-from-zero，噪声窗口 ~1 ulp）。
- 角度契约仍为弧度（显示度、提交换算），≥360/≤0 拒收不变；有选区/IME 不步进。
- 验证：目标单测 6 文件 **95/95**、全量 web **148 文件 2115/2115**、
  tsc(src/e2e)/eslint 绿；真栈 `sketch-angle-dimension` + `sketch-dimension-edit`
  通过、`tutorial2` **2 passed（4.7 min）**（体积 357.730 cm³ / 去材 0.422 不变）。
- 残留：放置弹层的角度候选通道未开（`SketchDimensionKind` 不含 angle；若接通
  需把度换算回弧度）。

### 2026-11-16 W19 尺寸工具连续标注（S1b）

- live：✓/✗ 关闭值弹层后单尺寸工具保持安装（`is-active`），清空拾取即可继续
  下一次标注，无需重激活 ribbon；Esc 退出。
- 实现：`SketchDimensionTool` 的 `dimensionPopupClosed` 回调改为清等待态 +
  清拾取 + 刷新提示、不 `exitTool`；弹层打开期间仍忽略画布拾取；候选/提交/
  事件契约不变；旧槽位工具（非 ribbon、独立类层级、无 live 证据）保持退出。
- 验证：目标单测 42/42、全量 web **2115/2115**、tsc(src/e2e)/eslint 绿；
  真栈 `tutorial2-tools` 标注流 **2 passed（1.3 min）**：确认后不重激活直接
  拾取圆弧 → 第二个值弹层；✗ 不落约束（12 条不变），随后半径/距离照常落库。

### 2026-11-16 W20 尺寸标签右键菜单

- live：右键尺寸标签 = 草图菜单 + 首行 `更改为驱动尺寸`（诚实禁用：params 不
  建模驱动尺寸）+ 末项（分隔后）`删除尺寸`；菜单 154×251、白底 1px #cccccc、
  radius 4、shadow `0 5px 10px rgba(0,0,0,.2)`、12px 文字。
- 实现：`SketchDimensionEditor` 注册尺寸标签命中 ref（返回约束 id）；
  `SketchEntityPicker` 在空闲草图态先命中标签 → 尺寸菜单（与空白/实体菜单
  互斥、不改实体选择、工具激活时不开）；行序按 live（确认草图/复制草图/
  全部显示/曲线·曲面分析…/选择 ›/选择其他…/添加评论/缩放/视图垂直），未实现
  能力诚实禁用；`删除尺寸` 走宿主既有 updateSketch 约束删除（可撤销）；
  maxHeight + overflow 夹紧。
- 验证：全量 web **2127/2127**、tsc(src/e2e)/eslint 绿；真栈
  `sketch-dimension-edit` **3 passed（1.7 min）**（含右键标签→删除尺寸→撤消
  恢复的现场验证）。
- 残留：live 菜单皮肤（154×251/#ccc/radius 4）未逐像素套用（沿用树菜单皮肤，
  视觉 pass 待做）；驱动尺寸切换需契约/ADR，保持禁用。

### 2026-11-16 W21 尺寸工具编辑既有尺寸（S1c）

- live：尺寸工具点击已带尺寸的几何（同实体/同一对引用）打开**该尺寸**的值
  对话框（预填约束全精度值），确认原地改值、不追加第二条；取消不变；工具
  保持安装（W19）。
- 实现：纯匹配器 `findExistingDimensionConstraint`（可编辑尺寸种类；`driven`
  参考尺寸排除；单实体按实体 id，圆/弧半径↔直径等价并取既有种类；两引用
  同种类 + 顺序无关归一化；多条取最小 id）；工具发候选带
  `existingConstraintId`/`existingValue`（kind 取既有约束、跳过测量）；弹层
  确认走 `applyConstraintValue`（与双击编辑器同通道），失败保留错误、取消
  不改、`dimensionPopupClosed` 契约不变。
- 验证：全量 web **2140/2140**、tsc(src/e2e)/eslint 绿；真栈
  `sketch-dimension-edit` **3 passed（1.4 min）**（含既有尺寸取消不变、改值
  原地更新且约束数不变）。
- 残留：只匹配同种类（width 若存为 endpoint-pair distance 不匹配 line length）；
  角度候选通道仍关闭；driven/变量未建模。

### 2026-11-17 W22 两线角度尺寸（单尺寸工具）

- live：尺寸工具拾取两条**非平行**线 → angle（值对话框按度、`deg`、7 位小数、
  ±1° 步进；画布标签角度 3 位）；平行线保持既有 distance（无 live 证据，
  不发明平行线角度语义）。
- 实现：推断层两线夹角 > `PARALLEL_LINE_ANGLE_MAX_DEG`（1e-4°，复用既有
  `lineAngleDeg` 锐角口径）→ angle；不可测回退 distance。`DimensionKind` /
  `SketchDimensionKind`（前端事件面）扩 angle，候选 `measuredValue` 为度；
  值弹层确认经 `parseConstraintEditorValue` 把**度换算弧度**（新建与既有
  angle 均如此；>0/<360° 校验），既有 angle 走 `applyConstraintValue(弧度)`。
  W19/W21 生命周期与共享外壳不变。
- 验证：目标单测 61/61、全量 web **2151/2151**、tsc(src+e2e)/eslint 绿；
  真栈 `sketch-dimension-edit`（含两线 angle 流）+ `tutorial2-tools` 标注 +
  `tutorial2` 严格 **6 passed（7.4 min）**（体积 357.730 cm³ / 去材 0.422 不变）。
- 残留：角度取锐角口径（钝角/方向选择未采）；平行线 distance 语义未 live 复核；
  同一对引用已有 distance 时不会命中既有 angle 匹配。

### 2026-11-17 W23 草图工具栏主钮记忆最近使用变体

- live：草图 14 个飞菜单组的主钮 = **最近使用变体**（行 label/tooltip/icon
  随选行切换并立即激活；工具退出 Esc、退出/重进草图均保持；飞菜单行序不变）。
  行 tooltip 与行文案不同的仅四处：相切圆弧→相切弧、3 点圆→三点圆、
  倒角→草图倒角、草图流→流；带快捷键的行 tooltip 追加 `(key)`。
- 实现：`RibbonDropdown` 可选 `selectedId`/`onSelect`（仅草图模式传入；特征
  工具栏不传，DOM/行为不变）；子行选中时主钮图标/aria/title 取该行，主钮
  点击激活该变体；行 `title` 携带 live tooltip；`RibbonDropdownItem` /
  `SketchRibbonTool` 增可选 `tooltipKey`（四处差异），Ribbon 会话态
  `variantSelections` + `sketchToolGroupFor` 让快捷键同记（只读 canEdit=false
  不记）；激活态改 `activeToolId === selectedId`（construct/pattern/use 特例
  保留）。无 shared/RPC/schema/后端改动。
- 验证：目标单测 33/33、全量 web **2158/2158**、tsc(src+e2e)/eslint 绿；
  真栈新 `sketch-toolbar-variants` **2 passed（39.1 s）** + 回归
  `sketch-create-parity`/`sketch-center-arc`/`sketch-center-rectangle`/
  `sketch-tangent-arc`/`sketch-chamfer` **6 passed（3.5 min）** +
  `tutorial2` 严格 **2 passed（4.6 min，357.730 cm³ / 去材 0.422 不变）**。
- 残留：仅会话内记忆（刷新回默认；live 跨刷新持久化未采）；gated 变体可从
  菜单成为主钮（主钮点击仍走能力引导，不伪造）；主钮 aria-label 取 tooltip
  （live 的隐藏 label 为行文案，可见 tooltip 已逐字对齐）。

### 2026-11-17 W24 尺寸标签右键菜单皮肤（live 复采）

- live：菜单 **154×251**（ul `margin:2px 0 0` → 点击 y+2）；白底、`1px solid
  #ccc`、radius 4、shadow `0 5px 10px rgba(0,0,0,.2)`、12px/18px
  Flama/Open Sans；行 152×22、`padding:2px 8px 2px 35px`；hover
  `rgb(222,241,251)`；Onshape 禁用色 `--os-text-quaternary` = #555（无 hover）；
  7 条 1px `#ddd` 分隔线；行分组/顺序 = 18 行 live 表；添加评论/删除尺寸 =
  17×17 sprite（`add-comment` / `clear-field-button`，left 10 绝对定位）；
  选择行 `::after content:"►" right:7 #666`，悬停子菜单存在但产品无该能力 →
  保持诚实禁用，不伪造动作。
- 实现：仅尺寸菜单加 `.part-studio-sketch-dimension-menu` 作用域覆盖
  （154 宽、margin-top 2、22/12px 行、#DEF1FB hover、#555 禁用、#ddd 分隔、
  图标与 ►），基础 `.part-studio-tree-menu*` 与其他空白/实体菜单不变；新增
  两枚 sprite 图标；菜单夹紧 154×253；行启用/禁用、testid、动作零变更。
- 验证：`sketch-entity-picker` 单测 **24/24**、全量 web **2158/2158**、
  tsc(src+e2e)/eslint 绿；真栈 `sketch-dimension-edit` **4 passed（2.1 min，
  含菜单/行/图标计算样式与 hover/禁用色断言）** + `sketch-entity-menu` +
  `context-menu-states` **8 passed（3.1 min，其他菜单不受影响）**。
- 残留：行内匿名 flex 文本的 `text-overflow:ellipsis` 不生效（live 用 span；
  当前文案均不溢出，未加包装）；选择子菜单动作仍为能力缺口（诚实禁用）。

### 2026-11-17 W25 圆心圆弧绘制读数（R 点标签）

- live：圆心圆弧两阶段均为蓝色水平 `R<半径>` 点标签、无白卡/角度卡；阶段 1
  （圆心已锚）标签居中于圆心→光标半径段的投影中点；阶段 2（圆心+起点已锚）
  固定在圆心→起点半径段中点，扫角光标不移动标签/不改读数，live 阶段 2 不显示
  角度。
- 实现：`computeSketchLiveMeasures` 的 centerArc 阶段 2 由角度改为半径
  （center→start，光标不参与）；`SketchCreateTool._drawLabels` 增 centerArc
  分支（阶段 1 半径点=光标、阶段 2=起点；`sketchPointLabelCenter` 投影中点、
  `R` 前缀、抑制半径卡；零半径/无视口回退既有白卡片）。无契约/后端改动。
- 验证：目标单测 44/44（6 新增）、全量 web **2164/2164**、tsc(src+e2e)/eslint
  绿；真栈 `sketch-draw-readout` **2 passed（58.7 s，含阶段 1/2 中点 ±2 px、
  同值、无白卡断言）**。
- 残留：相切圆弧 `R` 读数为切点→光标弦中点（两位置吻合），但工具是独立
  PrimitiveTool、需接 drawLabels 通道，未实现；周边圆 `Ø` 读数三次采样位置
  不一致（圆内靠原点/圆右侧/圆下方），锚点未定，不做；阶段 2 不再显示扫角
  （live 无该读数；若要角度需新 labelKey）。
