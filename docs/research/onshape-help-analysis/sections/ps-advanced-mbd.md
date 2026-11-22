# Part Studios — 曲线/曲面/MBD/表格/材料外观（组 4/14）分析报告

## 1. 本章概览

- 主题数：**32**；总词数：**54,380**（组文件头统计）。
- 覆盖子域：
  1. Part Studio 列表与显示管理：Features/Parts Lists、动态抑制、回滚条、再生时间、暂停再生。
  2. 外观与材料：Appearance（零件/面/特征/草图/曲线）、材料赋予与自定义库、Onshape 官方材料库。
  3. 表格：Custom Tables（FeatureScript）、Variable Table、Hole Table。
  4. MBD/PMI：Model-Based Definition、Tolerance options、Inspection table、Onshape Default Tolerances Library、Default Tolerances Library。
  5. 曲面工具：Offset Surface、Boundary Surface、Fill、Move Boundary、Ruled Surface、Mutual Trim、Constrained Surface。
  6. 曲线工具：Projected、3D Fit Spline、Bridging、Composite、Intersection、Trim、Isocline、Offset、Isoparametric、Edit、Routing（共 11 个专页 + Feature Tools 中的曲线工具集合）。
  7. 杂项：Feature Tools（工具入口总览）、Finish Sheet Metal Model（钣金收尾，因 TOC 归档进入本组）。
- 文档更新日期：语料未提供任何页面级更新日期，**无法判断新旧**。
- 整体质量/抽取限制：
  - 所有图片仅余 `[image: alt]`；很多关键信息（对话框布局、Zebra 条纹、曲面结果对比）只存在于图片中，正文只给图注。
  - 视频均只有文字转录，转录通常比正文更口语、更完整，可作为字段/步骤补充。
  - Onshape Material Library 是超大扁平表格（约 200 种材料、9 列），被压成每行一个单元格；个别行有额外空行（如 Steel Class 4.8/5.8），但不影响语义。
  - Onshape Default Tolerances Library 表格同样是扁平压缩，单位全部写成 cm；每个分组的首行 “Up to 0.05 cm” 只有上限、没有公差值，无法区分是原文留空还是抽取丢失，按“文档未给出”处理。
  - 部分 MBD 示例页只有图片图注（Extrude/Revolve/Fillet/Chamfer/Hole/Axis/Minimum/Maximum/Thickness/Centerline），字段细节须从相邻正文与图注推断，凡是语料没有的都不补写。
  - 移动端章节与桌面章节大量重复，且移动端常省略字段清单。

## 2. 主题清单与逐篇摘要

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Customizing Appearance | Part Studios > Customizing Appearance | /Content/PartStudio/customizing_appearances.htm | 通过右键 Edit appearance 编辑零件/面/特征/草图/曲线的颜色、透明度和 tessellation；默认 8 色轮换、Appearances 面板、导入面外观与按配置控制面颜色。 |
| Feature and Part Lists | Part Studios > Features and Parts Lists | /Content/PartStudio/features_and_parts_lists.htm | 特征列表与零件/曲面/曲线列表的双栏结构；回滚条与快捷键、`:` 搜索前缀、文件夹/抑制/动态抑制、显示再生时间、暂停再生、错误/警告/未完全定义标记、零件右键菜单与零件属性列。 |
| Customizing Part Materials | Part Studios > Customizing Part Materials | /Content/PartStudio/customizing_part_materials.htm | 右键 Assign material：Library 标签选库中材料、Custom 标签输 8 项材料属性；CSV（UTF-8，Category/Name/Density 表头）自定义库的导出、编辑、导入、共享、添加/移除/更新流程；未赋材料质量为零。 |
| Onshape Material Library | Part Studios > Customizing Part Materials > Onshape Material Library | /Content/Library/onshape_material_library.htm | Onshape 官方材料库的完整表格：类别、名称、密度（kg/m³）、泊松比、杨氏模量、抗拉屈服/极限抗拉、抗压屈服/极限抗压；提供 std.mat 导出，由 Onshape 创建与维护。 |
| Custom Tables | Part Studios > Custom Tables | /Content/PartStudio/custom_tables.htm | FeatureScript 自定义表：表定义在 Feature Studio、数据来自 Part Studio；企业管理员可添加企业级表；只能用版本中的 FeatureScript；列可移动/移除/恢复、Copy table。 |
| Model-Based Definition (MBD) | Part Studios > Model-Based Definition (MBD) | /Content/PartStudio/model_based_definition.htm | 在 Part Studio 模型内嵌尺寸/公差/标注（PMI/MBE）；驱动尺寸可在图形区直接编辑；Inspection 表实时联动；标注删除规则、派生只读、按零件校验、STEP 导出建议，并明确 MBD 不替代 Drawings。 |
| Tolerance options | Part Studios > Model-Based Definition (MBD) > Tolerance Options | /Content/Home/tolerance_options.htm | 尺寸与特征参数的公差对话框：Precision 0–6 位小数、Tolerance type（Default/No tolerance/Symmetrical/Deviation/Limits/Min/Max/Basic 及 Fit 系列）、ANSI/ISO 配合类；逐项列出可公差化的草图尺寸与特征字段。 |
| Inspection table | Part Studios > Model-Based Definition (MBD) > Inspection table | /Content/PartStudio/inspection_table.htm | MBD 检查表：Model 下拉、Datums/Characteristics 两表、Annotation 工具栏（Datum/Dimension/Fillet/Min/Max/Geometric tolerance/Weld symbol/对齐工具）、过滤与交叉高亮、视图分享链接、CSV 导出（含邮件下载链接）。 |
| Onshape Default Tolerances Library | Part Studios > Model-Based Definition (MBD) > Onshape Default Tolerances Library | /Content/Library/onshape_default_tolerances_library.htm | Onshape 官方默认公差库：ISO 2768-c/f/m/v 及 Precision 的线性、角度、倒角距离、圆角半径公差表；可复制到自有文档作为自定义库起点。 |
| Default Tolerances Library | Part Studios > Model-Based Definition (MBD) > Default Tolerances Library | /Content/Library/default_tolerances_library.htm | 企业/个人默认公差库：文件夹层级 Library/Standard/Type、文档内 Variable Studio、Constant/Precision/Range 三种值、Up to/Over 范围、Custom class 需 Display name 与 Custom Feature Class ID；创建→建版本→更新库→在 Inspection 表选用。 |
| Variable Table (Part Studio) | Part Studios > Variable Table (Part Studio) | /Content/PartStudio/variable_table.htm | 变量表：FeatureScript 标识符命名、类型/值/描述；可创建或插入 Variable Studio（跨文档引用只读、需有版本）；同名覆盖规则（最后一个表优先）、右键过滤/删除/移动、Copy table 与引用管理。 |
| Hole Table | Part Studios > Hole Table | /Content/PartStudio/hole_table.htm | 创建 Hole 特征后右侧出现 Hole table 图标，列出 Part Studio 全部孔并随新孔自动更新；hover/点击高亮、Copy table、列移动/隐藏/恢复。 |
| Feature Tools | Part Studios > Feature Tools | /Content/PartStudio/feature_tools.htm | 特征工具入口总览：Feature 工具栏与 S 键快捷工具栏、alt/opt+c 搜索、Preview slider、Final 按钮、对话框内 Undo/Redo；移动端工具栏结构；以 Shell 为例的典型流程。 |
| Offset Surface | Part Studios > Feature Tools > Offset Surface | /Content/PartStudio/offset_surface.htm | 对既有面、曲面或草图区域偏移生成新曲面；distance=0 原地复制；可用箭头反向；记住上次距离；多个面可合成为一张曲面。 |
| Boundary Surface | Part Studios > Feature Tools > Boundary Surface | /Content/PartStudio/boundary_surface.htm | 用 U/V 两组边界轮廓生成四边闭合曲面；New/Add；7 种边界条件（None/Normal to profile/Tangent to profile/Match tangent/Match curvature/Normal direction/Tangent direction）+ Magnitude + Faces；Show isocurves、Merge with all/Merge scope。 |
| Fill | Part Studios > Feature Tools > Fill | /Content/PartStudio/fill.htm | 以任意数量边界段补面；边界须闭合（红点提示开口）；Continuity 为 Position/Tangency/Curvature（G0/G1/G2）；Guides 支持 Sampled/Precise；Add 且闭合时自动生成实体。 |
| Move Boundary | Part Studios > Feature Tools > Move Boundary | /Content/PartStudio/move_boundary.htm | 移动曲面边界以延伸或修剪；Tangent propagation；Blind/Up to face/Up to part/surface/Up to vertex；负距离修剪；“Up to”可带 Offset distance；Maintain curvature。 |
| Ruled Surface | Part Studios > Feature Tools > Ruled Surface | /Content/PartStudio/ruled_surface.htm | 从边、草图线或曲线生成直纹面；Normal/Tangent/Aligned with direction/Angled from direction；Angle/Distance 与反向；Reference face；Vertex overrides（含 Up to vertex）；Cubic interpolation；Ruled lines 1–100 默认 40；4 种角类型。 |
| Mutual Trim | Part Studios > Feature Tools > Mutual Trim | /Content/PartStudio/mutual_trim.htm | 两组相邻连续曲面通过延伸交线互相修剪；每组可 Keep opposite side 翻转；Merge 默认开启合并为单曲面；移动端仅能编辑/查看桌面创建的 Mutual trim。 |
| Constrained Surface | Part Studios > Feature Tools > Constrained Surface | /Content/PartStudio/constrained_surface.htm | 由点或网格数据在指定容差内拟合曲面；点定义时可设 Normal/Mate connector/Flip normal；Optimize 选 Performance 或 Smoothness；Deviation/Show deviation（Maximum/All）+Limit；Android 不能创建。 |
| Projected Curve | Part Studios > Feature Tools > Projected Curve | /Content/PartStudio/projected_curve.htm | 两草图投影相交或曲线投影到面生成 Curve；投影须形成一条连续曲线；Curve to face 支持 Normal to target/Direction；Approximate 重近似；曲线在 Curves 列表显隐。 |
| 3D Fit Spline | Part Studios > Feature Tools > 3D Fit Spline | /Content/PartStudio/3d_fit_spline.htm | 过顶点序列或相切连续边创建 3D 拟合样条；Closed spline；起/终方向 + Magnitude + Match curvature；Approximate；结果列入 Curves 列表。 |
| Bridging Curve | Part Studios > Feature Tools > Bridging Curve | /Content/PartStudio/bridging_curve.htm | 连接两点/顶点/Mate connector 的桥接曲线；连续性 Match position/tangent/curvature/flow(G3)；Control points 或 Magnitude（正数，默认 1）/Bias（1.000e-4–0.999）；Edit edge positions；记住上次连续性。 |
| Composite Curve | Part Studios > Feature Tools > Composite Curve | /Content/PartStudio/composite_curve.htm | 把多条相接的边/草图实体/曲线合并为一条 Curve；须在顶点相接且不得重叠/相交；非连续选择可生成多条；不消耗原对象；可作 Loft 轮廓。 |
| Intersection Curve | Part Studios > Feature Tools > Intersection Curve | /Content/PartStudio/intersection_curve.htm | 在 Group 1 与 Group 2 两组面/曲面/平面/零件之间求交生成曲线；同组内不相交；可生成多条；Approximate；线性阵列沿面需把平面加入 Features to pattern 并勾 Reapply features。 |
| Trim Curve | Part Studios > Feature Tools > Trim Curve | /Content/PartStudio/trim_curve.htm | Trim/Extend 曲线：Up to entity（曲线/面/边/平面，须相交）或 Mate connector（不必相交）；Help point、Opposite direction；延伸形状 Curvature/Tangent；Blind/Up to entity；草图实体需先转 Composite curve。 |
| Isocline | Part Studios > Feature Tools > Isocline | /Content/PartStudio/isocline.htm | 在斜面按参考方向与角度生成等斜线；可选 Split 沿等斜线分割面；结果列入 Features/Parts list。 |
| Offset Curve | Part Studios > Feature Tools > Offset Curve | /Content/PartStudio/offset_curve.htm | 沿周围面偏移边生成曲线，并可延伸/分割面；Geodesic/Euclidean；Gap fill Linear/Round；Scope 为 Offset、Offset and extend、Offset, extend and split；Trim/Equal trim；Targets；分支边报错；桌面独占创建。 |
| Isoparametric Curve | Part Studios > Feature Tools > Isoparametric Curve | /Content/PartStudio/isoparametric_curve.htm | 沿面/曲面 U 或 V 方向生成等参曲线；Equal spacing+Instance count，或 Location 0–1/点/Mate connector；X 删一条、CLEAR 全清；桌面独占创建；滚轮步进 1.0、Ctrl+滚轮 0.01。 |
| Edit Curve | Part Studios > Feature Tools > Edit Curve | /Content/PartStudio/edit_curve.htm | 重建/改形已有曲线并保持下游特征关联：Approximate→Elevate→Planarize→Edit control points 固定层级；Planarize 支持 Best fit/Lock ends/YZ/XZ/XY/Custom；控制点可设 Reference/XYZ 偏移/Weight、XYZ 或 UVN 编辑模式。 |
| Routing Curve | Part Studios > Feature Tools > Routing Curve | /Content/PartStudio/routing_curve.htm | 3D 多点布线曲线：Interpolated spline（3 次）或 Polyline；Bend radius 默认 0；Target length；顶点/边采样/CSV 输入；参考系 Origin/Vertex/Curve/Relative；Segments 正交路径；LRA 表；长度写入特征名且不可由变量驱动。 |
| Finish Sheet Metal Model | Part Studios > Feature Tools > Finish Sheet Metal Model | /Content/PartStudio/finish_sheet_metal_model.htm | 停用选中的钣金模型，使其按普通实体处理以执行后制程；此后修改不影响展开图/表值；可删除或抑制该特征恢复；同时列出活动钣金模型的附加工具集合。 |

## 3. 核心概念与术语

### 3.1 列表与显示对象

- **Features list / Parts list**：左侧栏上下两区，中间分隔条可拖动且两区独立滚动；Features list 含配置下拉、特征数、搜索框、origin/planes、特征、回滚条；Parts list 含 Part、Surface、Surface mesh、Composite part、Curve 的类型图标与数量。
- **Rollback bar**：拖到某特征处，其下所有特征临时抑制；右键特征 “Roll to here”，右键回滚条 “Roll to end”；选中回滚条后 ↑/↓ 逐步移动。
- **Paused regeneration**：暂停再生模式；可改表格、配置表、数量与布尔等非选择字段；草图不可编辑；切换 tab 或关闭文档会自动应用更改；已再生更改不能 undo，只能恢复版本。
- **Dynamic suppression**：为特征/文件夹/装配实例写逻辑表达式决定抑制与否（示例 `#depth >= .5 inches` 时 Fillet 1 被抑制），列表出现表达式图标与被抑制删除线。
- **Show regeneration times**：显示每个特征再生耗时，hover 高亮对应模型。
- **Feature/Parts 属性**：`Show parts list properties` 在零件名旁显示 part number、revision、state；可在 My account > Preferences > Part Studio settings 设默认。
- **错误指示**：列表左上错误图标（hover 显示数量）、黄色三角（缺选择）、蓝色标记（未完全定义）。

### 3.2 外观与材料

- **Appearance vs Material**：Appearance 是颜色/透明度/tessellation，可作用于 Part、Face、Feature、Sketch、Curve；Material 是材料及密度（并带机械属性），作用于零件/面/特征/草图，**Material 会驱动 Mass properties**。
- **Default part colors**：新建零件按 8 色序列轮换，第 9 个零件重新从第一种颜色开始；删除零件不会打乱既有零件颜色。
- **Custom colors**：自定义色板，可新增（+）、右键 Delete、Update color。
- **Tessellation quality**：Auto（默认）/Coarse/Medium/Fine/Very fine；Very fine 永不被系统自动选择；越细越慢。
- **Material library**：Onshape Material Library 为默认库；自定义库以文档中的一个 **Material Library tab** 存在，tab 名即库名；CSV 首行为 `Category, Name, Density`，UTF-8。
- **Custom material attributes**（Custom 标签）：Name、Density、Poisson's ratio、Young's modulus、Tensile yield strength、Ultimate tensile strength、Compressive yield strength、Ultimate compressive strength；这些自定义值不保存复用。

### 3.3 表格

- **Custom table**：由 Feature Studio 中的“表定义”与 Part Studio 中的数据两部分正交组成；插入 Drawing 时表内容针对整个 Part Studio，而非仅图中零件。
- **Variable Table / Variable Studio**：Part Studio 内变量表可本地创建或插入 Variable Studio（本/他文档）；变量名必须是 FeatureScript identifier（字母或下划线开头，后接字母数字/下划线，无空格）。
- **Hole table**：仅在创建 Hole 特征后出现，列出 Part Studio 全部孔；Drawing 有单独的 hole table 文章。
- **Routing curve table**：列出所有 routing curve，可选 LRA（length/rotation/angle）显示。
- **Inspection table**：由 **Datums** 表与 **Characteristics** 表组成；Characteristics 列含 Type、Nominal value、Tolerance、Upper limit、Lower limit。

### 3.4 MBD 与公差

- **MBD（Model-Based Definition）**：在模型内嵌尺寸与标注，使模型成为“source authority”；捕获/扩展 **PMI**（Product Manufacturing Information）与 **MBE**（Model-based enterprise）信息；**不替代 Drawings**。
- **Driving vs Driven dimension**：驱动尺寸黑色、可改值；从动尺寸灰色、值不可改，但可开关/编辑其公差。
- **Datum**：基准符号，默认依次 A、B、C…；名称须一个或多个大写字母后接零或多个数字，不允许空格、连字符、破折号或特殊字符，不能为空。
- **Tolerance type**：Default、No tolerance、Symmetrical、Deviation、Limits、Min、Max、Basic；孔与草图直径另有 Fit、Fit with tolerance、Fit (tolerance only)。
- **Precision**：Workspace precision 或 0–6 位小数。
- **Fit 参数**：Standard（ANSI/ISO）、Fit type（User defined/Clearance/Transition/Interference）、Hole class、Shaft class。
- **Geometric tolerance 符号**：Position、Concentricity、Symmetry、Parallelism、Perpendicularity、Angularity、Cylindricity、Flatness、Roundness、Straightness、Profile (Surface)、Profile (Line)、Circular runout、Total runout。
- **Default tolerances library**：由管理员建立、团队使用的 MBD 模板；结构为文件夹层级 + Variable Studio；Onshape 提供 ISO 2768-c/f/m/v 与 Precision 标准集。

### 3.5 曲面

- **U/V/Normal**：所有曲面近似矩形，U/V 相当于曲面自身 X/Y 方向，Normal 为法向。
- **Boundary conditions**（Boundary Surface）：None、Normal to profile、Tangent to profile、Match tangent、Match curvature、Normal direction、Tangent direction；后五者可用正/负 Magnitude，前三类可指定 Faces。
- **Continuity（Fill）**：Position（G0）、Tangency（G1）、Curvature（G2）。
- **Continuity（Bridging Curve）**：Match position、Match tangent、Match curvature、Match flow (G3)。
- **Merge scope / Merge with all**：控制新曲面与周围曲面是否合并为一张曲面。
- **Vertex override**（Ruled Surface）：在路径的某个顶点覆盖全局直纹面定义。
- **Corner type**（Ruled Surface）：Spun（默认）、Extended、Loft、No corner。
- **Geodesic vs Euclidean**（Offset Curve）：前者在目标面 2D 空间量距，后者在 3D 空间量距。
- **Isocurve / Isoparametric**：沿曲面 U 或 V 方向的等参线；Show isocurves 用网格叠加显示未修剪底层的等参结构。
- **Guide**（Fill）：点、顶点、草图点或曲线；Sampled 按采样点数近似，Precise 精确穿过曲线。

### 3.6 曲线

- **Approximation 参数组**（几乎所有曲线工具共有）：Target degree、Maximum control points、Tolerance、Keep start derivative、Keep end derivative、Show deviation；原曲线橙色（或黄色）、新曲线品红。
- **Composite curve**：把多条相接曲线合成一个线框实体，保留源对象。
- **Intersection group**：Group 1/Group 2，只有跨组相交才生成曲线。
- **Isocline**：面上斜率相对参考方向为指定角度的轨迹。
- **Edit curve 层级**：Approximate → Elevate → Planarize → Edit control points，顺序固定；要改顺序需拆成多个 Edit curve 特征。
- **Control point 概念**：index 从 0 起、Reference、X/Y/Z offset、Weight（权重越大曲线越被拉向该点）；编辑模式 XYZ、UVN (Tangent)、UVN (Control polygon)。
- **Routing curve**：Interpolated spline（三次）或 Polyline；Bend radius、Target length、Point reference、Derivative、Orthogonal path、LRA。

### 3.7 角色与命名

- **Enterprise administrator**：可发布企业级 Custom tables。
- **Administrator / Company admin**：创建公司默认公差库/材料库并共享给公司。
- **View-only collaborator**：只读；若同时有 Copy 权限，浏览器与 iOS 可打开特征对话框查看规格。
- **std.mat**：Onshape 标准材料库文档/tab 名。
- **ISO 2768-c/f/m/v、Precision**：默认公差库类别名；**ANSI/ISO** 为焊接与配合标准。

## 4. 功能与 UI 明细

### 4.1 Features/Parts Lists 与 Feature Tools

**可用位置**：Part Studio（浏览器/iOS/Android；桌面功能最全）。

- 列表结构：配置下拉（如有）→ 特征数 → 搜索框 → origin/planes → 特征 → 回滚条 → 分隔条 → 零件/曲面/网格/复合零件/曲线数量与条目；拖分隔条调整两区高度，两区独立滚动。
- 搜索前缀（`:` 开头）：`:part`、`:type`、`:name`、`:errors`、`:warnings`、`:folder`、`:variable`（区分大小写）、`:suppressed`、`:hidden`、`:shown`、`:partnumber`（需 Show part properties）、`:revision`（需 Show part properties）。
- 回滚：拖动、右键 “Roll to here”、右键回滚条 “Roll to end”、选中后 ↑/↓。
- 特征右键：Rename、Suppress、Dynamic suppression > Add expression / Edit dynamic suppression、Hide/Show、Show dependencies（上箭头 parents、下箭头 children）、Expand/Collapse（selected/all）、Add selection to folder...、Unpack folder。
- 零件右键：Rename、Properties、Assign material、Edit appearance、Copy、Create drawing、Export、Release、Release all configurations（仅单 List 输入、最多 100 配置）、Revision history、Hide、Hide other、Hide all、Hide/Show center of mass（需已赋材料）、Isolate、Make transparent、Add comment、Zoom to selection、Delete。
- 再生时间：`Show regeneration times`；暂停再生按钮与横幅：Regenerate Part Studio、Regenerate features and exit、Discard unregenerated changes and exit、Restore。
- 只读+复制权限：浏览器/iOS 可打开特征对话框查看参数，不可编辑。
- Feature Tools 页：Feature 工具栏；S 键调出快捷工具栏（无对话框时）；alt/opt+c 搜索工具；通用步骤为选基几何→选工具→选几何→输参数→定方向/选项→Preview slider 预览→勾/叉；Final 按钮查看特征列表底部最终结果；对话框内可用 Undo/Redo。

### 4.2 外观（Customizing Appearance）

**Available in**：Sketch、Part Studio；iOS/Android 有限支持；Appearance panel 在 iOS 为 view-only。

- 入口：右键零件/面/特征/草图/曲线 → Edit appearance / Add appearance / Add appearance to feature / Edit feature appearance / Edit sketch appearance。
- 对话框：Palette、Mixer、Custom colors（+ 新增、右键 Delete/Update color）、RGB/hex 输入、Part transparency 滑块 0–1；勾选接受。
- 穿透选择：零件透明后，按住 **Alt** 选择其下方的零件、边或面。
- 面外观：Face appearance 对话框的 Faces 字段列出所选面，x 可移除，图形区可选面加入；可预选后由 Appearances 面板的 Add face appearance 打开并预填。
- Appearances 面板：列出所有被改过外观的面；双击行编辑（零件只能改颜色、不能增删零件；面可改面选择与颜色；曲线/草图需切到 Sketches and curves 标签）。
- Patterning：零件/面被阵列时外观一并阵列，均列入 Appearances panel。
- Configurations：面颜色可作为配置项，像其他零件/特征属性一样配置。
- 导入：Import to Onshape 对话框的 Import appearances 选项默认导入面外观；导入后可在 Import 特征中重新勾/取消；关闭后面外观被移除、只留零件 Appearance。
- 草图/曲线：Edit sketch appearance、Edit appearance（曲线），同一套 Palette/Mixer/Custom colors。
- Tessellation：Edit appearance 的 Tessellation quality 下拉（Auto/Coarse/Medium/Fine/Very fine）；Assembly 中右键 `Use best available tessellation` / `Use automatic tessellation setting`；启用时 Instances list 显示 tessellation 图标。
- iOS/Android：零件右键 Menu → Appearance；颜色自由拖动、强度箭头、α/透明度数值键盘输入、RGB 滑块或数值输入；Android 调整时图形区实时变化。

### 4.3 材料（Customizing Part Materials / Onshape Material Library）

**Available in**：Part Studio（桌面）；Material Library tab。

- 赋材料：右键零件/组 → Assign material → Library 标签 → 选库（默认 Onshape Material Library）→ 选材料（带密度）→ 勾。
- 语义：未赋材料零件质量为 0；单位随当前文档单位；搜索框按名称或类别查；已赋材料后右键变为 Edit material，并出现 Show/hide center of mass；Part properties 显示只读材料字段。
- Custom 标签：8 个属性自由输入，值用于 Mass properties，但不保存供其他零件复用。
- 官方库表格字段：Category、Name、Density (kg/m³)、Poisson's Ratio、Young's Modulus (Pa)、Tensile Yield Strength (Pa)、Ultimate Tensile Strength (Pa)、Compressive Yield Strength (Pa)、Ultimate Compressive Strength (Pa)；类别含 Ceramic、Composite、Earth、Glass、Metal、Plastic、Rubber、Wood、Wood Composite（语料 “Maple, Hard/Soft” 归在 Metal 类别，属原文类别异常）。
- 自定义库创建：导出 std.mat（右键 tab → Export，CSV UTF-8）→ 表格编辑（首行 Category/Name/Density，可选单位下拉）→ 新建文档 → 新建 Material Library tab → 右键 Update 导入 CSV → 预览确认 OK → Create version → 删除多余 tab → 重命名 tab 为库名。
- 共享：Share 选个人/Team/公司，最低 View；接收者在 My account > Preferences > Material libraries → Add material library 搜索添加。
- 移除：Preferences 中 Remove **立即生效、无确认**；Onshape 库也可移除，可用 std.mat 文档加回。
- 更新：在 CSV 改后对库 tab 执行 Update → 建版本；用户不会被通知但立即拿到新库；**已赋材料的零件不会自动更新，需重新赋材料**。
- 使用未加入 Preferences 的库：Assign material → 库名旁 + → 搜索/排序 → Add。
- 移动端：iOS/Android 可从零件 overflow menu → Assign material，选属性后显示属性值。

### 4.4 表格：Custom Tables / Variable Table / Hole Table

**Custom Tables（Part Studio）**
- 右侧图形区下方（View cube 下）Custom tables 图标 → 面板 → Add custom tables（个人/企业管理员 Add enterprise custom tables）→ 选文档 → 选 Feature Studio → 选表定义；**只有来自版本（version）的 FeatureScript 有效**。
- 企业管理员可发布到全企业；个人添加后“对所有你可访问的文档可用”（原文如此）。
- 示例路径：Custom table samples → 文档 Part Masses Table → Feature Studio Part Mass Table → 表 Part masses。
- 若 FeatureScript 含参数组/条件可见性，表中可显示相应参数。
- 表格操作：右键列 → Move left/Move right/Remove/Hide column；overflow → Copy table、Show <removed> columns。

**Variable Table（Part Studio，亦可用于 Assembly）**
- 入口：右侧图形区 Variable table 图标 → 面板。
- 新建变量：Name（FeatureScript identifier）→ 类型 → 值 → 可选描述；可从 CSV（From import）导入；编辑类型/值时每次保存。
- Variable Studio：Create Variable Studio / Insert Variable Studio（本/他文档）；他文档引用只读，且该文档须有包含该变量的版本，否则提示先建版本。
- overflow 菜单：Copy table（表头只读，不能粘贴回表头）、Switch to Variable Studio [x]、Open linked document、Update linked document（Reference manager）、Move up/down、Edit reference、Remove reference。
- 右键单元格：Filter feature list（Feature list 显示该变量及受影响特征）、Delete、Move up/down。
- 同名规则：同一表内必须唯一（重名操作被取消并提示不覆盖）；不同表同名时**下面的表优先**，上面的表变量旁显示 override 图标；在 Features list 用 Variable 特征创建同名变量会覆盖表中变量；改名会更新所有引用特征。
- hover 变量：Features list 高亮 Variable 特征与所有使用该变量的特征。

**Hole Table（Part Studio）**
- 只有创建 Hole 特征后才出现图标；面板列出全部孔，随 Hole 特征自动更新。
- hover 行在图形区高亮孔；点击行选择孔、再点取消；overflow → Copy table；右键列 → 左右移动、移除/恢复列（隐藏后可由 overflow Show [Column name]）。

### 4.5 MBD：Tolerance options 与 Inspection table

**Tolerance options（Available in: Sketch, Part Studio；桌面/iOS/Android，表查看仅桌面）**

- Dimension context dialog：双击草图尺寸或图形区 MBD 尺寸打开；点公差图标启用；下拉设 Precision（Workspace precision 或 0–6 位小数）与 Tolerance type。
- Tolerance type 及字段：
  - Default：按 Default tolerances 决定。
  - No tolerance、Basic、Min、Max：无额外数值字段。
  - Symmetrical：Deviation。
  - Deviation：Upper、Lower。
  - Limits：Upper、Lower。
  - Fit、Fit with tolerance、Fit (tolerance only)（仅孔与草图直径）：Standard（ANSI/ISO）、Fit type（User defined/Clearance/Transition/Interference）、Hole class、Shaft class。
- 可公差化的草图尺寸：2 线距离、两点距离**、草图几何与平面距离**、对角线距离**、Diameter、Angle、Direct distance**、Linear distance**、Radius、Centerline。**不支持**：Single line distance、Arc length。带 ** 者虽可设公差，但因测量依赖单零件以外的点/面，Inspection 表不会生成可视尺寸。
- 可公差化的特征参数：
  - Extrude：Solid/Surface/Thin 的 Depth、Offset distance、Second end position - Offset distance、Thin 的 Thickness 1/Thickness 2/Mid plane - Thickness。
  - Revolve：One direction/Symmetric/Two directions 的 Revolve angle、Thin 的厚度三项。
  - Fillet：Radius。
  - Chamfer：Equal distance 的 Distance、Two distances 的 Distance 1/2、Distance and angle 的 Distance/Angle。
  - Hole：Diameter（Simple/Counterbore/Countersink）、Depth、Counterbore/Countersink diameter、Counterbore depth、Countersink angle、Tapped depth、Tap drill diameter。
- 与配置：可在配置选项值上开公差，再设 Precision/Type；Compare 两历史条目时公差差异以黄色描边。
- 移除特征公差不会移除尺寸（尺寸仍有效）。
- 移动端：双点尺寸 → Tolerance options → Precision/Type；特征尺寸同桌面；Inspection table 仅桌面，故移动端不能查看公差表。

**Inspection table（Available in: Part Studio；桌面）**

- 入口：右侧图形区 Inspection 图标（View cube 下方）；顶部 Model definitions。
- 界面：
  - Model 下拉：选择零件/复合零件，Datums/Characteristics 随之切换。
  - Isolate active part：其他零件透明，可再点 Show entire Part Studio。
  - Select default tolerances：选当前文档或他文档的默认公差库。
  - Annotation toolbar：Datum、Dimension、Fillet dimension、Minimum dimension、Maximum dimension、Geometric tolerance、Weld symbol、Set coincident、Set parallel、Set text alignment。
  - Datums 表、Characteristics 表；过滤：Show/hide default tolerances（默认显示）、Types（Distance/Angle/Radius/Diameter/Chamfer/Fillet/Hole/Weld/GTol，全不勾即全显示）、Show/hide derived tolerances（默认隐藏）、Reset filters。
  - overflow：Export to CSV、Isolate active part/Show entire Part Studio。
- Datum：选面或 Geometric tolerance 的任一边框放置；拖基三角定位、拖文字移位置；名称 A/B/C…；同面可有多个 Datum。名称校验：非法字符会变红但仍接受，只有超过 7 个字符会被拒。
- Dimension：选两面生成从动尺寸（可拖引线）；两圆柱面量轴线距离；相邻面可生成角度；从动值不可改，但可开关公差、编辑 Precision/Type；双击编辑。
- Fillet dimension：仅适用于部分圆柱（Fillet 产生的面），不能用于平面或整圆柱（管/棒）；从动半径。
- Minimum/Maximum dimension：选两圆柱面，拖动时在水平/对角/垂直三种距离间切换；可对同一对圆柱叠放三种；值显示在 Characteristics 表。
- Geometric tolerance 对话框：
  - Upper/Lower 文本：分别最多 50/200 字符。
  - Prefix/Suffix：各最多 20 字符。
  - Tolerance frame：Symbol 下拉（上述 14 种）；Tolerance 值及左右符号位（各最多 7 个符号，非法符号会被接受但不建议）；Datums 最多 3 个字段（每字段至少一个大写字母开头，可加符号，接受连字符）。
  - Add frame：最多 5 个约束行；底部符号可改为 Composite 组合框；右键单元格可 Move up/down 或 Remove（仅附加行）。
  - Show/Hide symbols（ø）：Upper/Lower/Prefix/Suffix 显示全部符号；Tolerance frame 内按符号类型与字段位置过滤可用符号。
  - 一面可挂多个 Geometric tolerance，但一个尺寸只能挂一个。
- Weld symbol：
  - Standard：ANSI/ISO；Flip identification line 仅 ISO。
  - Weld type（upper/lower）：None、Square groove、V groove、U groove、J groove、Bevel groove、Single bevel butt broad root、V flare groove、Bevel flare groove、Bead joint、Fillet joint、Plug or Slot joint、Seam joint、Spot joint。
  - Groove 0–360 度；Root opening 距离；Finishing 仅 ANSI（None、C chipping、G grinding、H hammering、M machining、R rolling、U unspecified）；Contour（None/Flat/Convex/Concave）；Weld size/depth/length/pitch 距离；Reference 最多 100 字符；一面可多个 Weld symbol。
- Set coincident/parallel/text alignment：先选面（text alignment 可边或面），再点标注应用；选面后可连续点多个标注；倒角/圆角面可选但不可设为 coincident。
- 交叉高亮：hover Datum 或数值单元格，橙色高亮关联面与标注；点击 Datum/Type 单元格，黄色高亮面、Parts list 中零件、尺寸/标注、Features list 中特征；Type/Datum 单元格是开关，再次点击取消，需移开再回才恢复。选中图形区尺寸，表内该项加蓝框并联动高亮。
- 分享视图：Copy link 复制当前 Inspection 表视图，含活动配置、渲染模式、爆炸视图、面板状态、视图方向。
- CSV 导出：Model 下拉选模型 → overflow → Export to CSV → Export 对话框（文件名默认“Part Studio tab 名 + 模型名”；Format 默认 Inspection list；Options：Download、Download and store file in a new tab、Email with file download link、Store file in a new tab）。邮件链接选项对除 Free/Education 外的所有计划可用；Expires in 默认 3 天；可 Require password for download、Send me a copy；官方提醒不要在同一封邮件里发密码。CSV 列即 Type/Nominal value/Tolerance/Upper limit/Lower limit；部分电子表格会自动重排符号。

**MBD 主体页补充**

- 驱动尺寸编辑：打开 Inspection panel → 双击草图/特征驱动尺寸 → Dimension context dialog 与 Sketch/Feature 对话框同时打开；输入值或上下箭头，草图/模型动态更新；Tab 使数值生效；Enter/勾关闭 context dialog，再在 Sketch/Feature 对话框确认。Esc：特征尺寸会同时关闭两个对话框；草图尺寸只关 context dialog，Sketch 对话框需手动关闭。两框同开时也可在 Feature 对话框改值，按 Enter 同时关闭。
- 删除标注：选中 → Delete。若为草图/特征尺寸：删除公差值、公差图标取消选中，但尺寸值不删；派生标注、以及自定义特征中“参数已设公差但未向用户暴露开关”的标注不能删除。
- 从动尺寸不可编辑；派生零件上的驱动/从动尺寸双击都不开 context dialog。
- 模型尺寸与草图尺寸的位置互不锁定；Pause regeneration 时模型尺寸不可编辑/删除，但可编辑特征或开关公差，点 Regenerate features and exit 后生效；配置有效，但 context dialog 中尺寸无橙色虚线框，且已配置的草图尺寸不可编辑。
- 校验：按零件自动校验，标注必须引用同一零件/复合零件的几何；失效标注与表行变红。两类失效：missing reference（几何不存在或拓扑变化破坏关联）与 value mismatch（实测值超出公差）。错误本身不会新增标注/表行，除非模型改动使既有行失效。
- 限制：MBD 标注只能关联面，**边与顶点当前不支持**；不能跨零件量距（须先 Composite part）；派生特征下所有模型定义只读，只能移动标注、从动尺寸随派生几何更新；可在 MBD 标注上加评论。
- STEP 导出：建议勾 Export models oriented Y axis up；按模型大小勾 Use custom annotation text height for MBD export 并设 Annotations text height；多公差框的 Geometric tolerance 导出时 Upper 文本并入上框、Lower 并入下框；闭合复合零件不导出 MBD 数据（Export 对话框有警告；从 Advanced search 结果列表导出时不显示警告但仍不导出）。
- Hole 尺寸：仅作为 Inspection 表行，不在图形区放标注；必须先有 Datum 等 callout 才显示；每个 Hole 特征只显示一组尺寸（Diameter/Distance/Angle），阵列孔/同特征附加孔不单独出；Tip angle 不支持、不出行；Distance(Depth) 不交叉高亮（孔两端无面、边不支持 MBD），Diameter/Counterbore depth/Countersink angle 高亮单面。
- 轴/最小/最大/厚度/中心线：两圆中心轴线距离用 Dimension；圆柱面间最小/最大水平/对角/垂直距离用对应工具；Thickness 以 Distance 行显示；中心线作为旋转轴时显示为 Diameter；草图内只能创建对角最小/最大尺寸，水平/垂直最小/最大不能在草图创建。

### 4.6 公差库

**Onshape Default Tolerances Library（Part Studio）**

- 官方维护；可直接用于零件，也可复制到自有文档做起点。
- 内容（表格摘要，原文单位 cm）：
  - **ISO 2768-c**：线性公差分段（≤0.3 cm ±0.02、≤0.6 ±0.03、≤3 ±0.05、≤12 ±0.08、≤40 ±0.12、≤100 ±0.2、≤200 ±0.3、≤400 ±0.4）；角度（≤1 cm ±1.5°、≤5 ±1°、≤12 ±0.5°、≤40 ±0.25°、>40 ±0.167°）；倒角距离（≤0.3 ±0.04、≤0.6 ±0.1、>0.6 ±0.2）；圆角半径同倒角距离。
  - **ISO 2768-f**：线性（≤0.3 ±0.005、≤0.6 ±0.005、≤3 ±0.01、≤12 ±0.015、≤40 ±0.02、≤100 ±0.03、≤200 ±0.05）；角度（≤1 ±1°、≤5 ±0.5°、≤12 ±0.333°、≤40 ±0.167°、>40 ±0.083°）；倒角/圆角（≤0.3 ±0.02、≤0.6 ±0.05、>0.6 ±0.1）。
  - **ISO 2768-m**：线性（≤0.3 ±0.01、≤0.6 ±0.01、≤3 ±0.02、≤12 ±0.03、≤40 ±0.05、≤100 ±0.08、≤200 ±0.12、≤400 ±0.2）；角度与倒角/圆角同 f。
  - **ISO 2768-v**：线性（≤0.3 无值、≤0.6 ±0.05、≤3 ±0.1、≤12 ±0.15、≤40 ±0.25、≤100 ±0.4、≤200 ±0.6、≤400 ±0.8）；角度（≤1 ±3°、≤5 ±2°、≤12 ±1°、≤40 ±0.5°、>40 ±0.333°）；倒角/圆角同 c。
  - **Precision**：线性默认 0.013 cm；X.XX ±0.03、X.XXX ±0.013、X.XXXX ±0.0013；角度 ±1°；倒角角度 ±5°。
  - 每个分组的 “Up to 0.05 cm” 行无公差值，按原文空白处理。
- 复制：打开 ISO 2768-1 文档 → Make a copy to edit 或 Copy workspace → 右侧 ISO-2768 tab Copy to clipboard → 目标文档 Insert new tab → Paste tab → Inspection table → Select default tolerances → Current document 选用 → 可再 Edit default tolerances。

**Default Tolerances Library（Part Studio）**

- 层级：根文件夹（Library 字段，公司库必须在根）→ 第 2 层（Standard）→ 第 3 层（Type）；只有两层时第 2 层名用于 Default tolerances 字段；最低层文件夹内建文档，文档内建 Variable Studio；一个文档可多 Variable Studio，一个文件夹可多文档。
- 公司库：根文件夹 Share → Companies 标签 → 勾 Link document 与 Share → Share → Close；右键根文件夹 Set library > My default tolerances。
- 编写：最低层建文档 → 插入 Create Variable Studio → 可改名 → 回 Part Studio 建样例零件 → Inspection table → Select default tolerances → Current document 选该 Variable Studio → 关闭后表内显示错误提示（正常，库尚空）→ Edit default tolerances → Add tolerance type（Linear tolerances、Angular tolerances、Chamfer angles、Chamfer distances、Fillet radii、Custom class[With linear/angular tolerance unit]）→ 设 Constant、Precision 或 Range（Add range 可选 Up to/Over）→ Save → 表格底部下拉显示 → Create version → 更新库。
- Custom class 须填 Display name 与 Custom Feature Class ID。
- 行操作：仅最后一行可 Remove（X）。
- 更新：Documents 页右键库文件夹 → Default tolerance library > Update my library；每次改文档后都要做。
- Unset：右键 → Default tolerance library > Unset my library；文件夹变普通图标，内容不删除。库文件夹不能删除、分享权限不能编辑，须先 unset。
- 使用：零件至少有一个公差或一个标注 → Inspection table → Select default tolerances → 选库/Standard/Type → 选文档与 Variable Studio → Done → 表底部下拉出现。
- 备注：支持非零空白公差值、0 公差、负上下限与正上下限；编辑时可实时套到样例零件看效果；Inspection 面板的 Dimension 工具总用线性/角度默认公差，给圆角面标注会用线性默认公差，故建议驱动公差从 Fillet 对话框设、从动公差用 Fillet dimension。

### 4.7 曲面工具

#### Offset Surface

- 输入：faces、surfaces、sketch regions；Distance 数值或拖橙色箭头；反向箭头；distance 0 原地复制。
- 记住上次 offset distance 与上次选项；多个面（如旋转面+平面）可偏移成一张曲面；结果可用 Transform 移开。

#### Boundary Surface

- New/Add；U profile 可多选（选择后下拉箭头添加）；每条 U profile 单独设边界条件：None（最短距离匹配位置）、Normal to profile（切线平行于轮廓法向）、Tangent to profile（切于轮廓平面）、Match tangent（匹配轮廓相邻面的切线）、Match curvature（匹配相邻面曲率）、Normal direction（法向于选定方向，如线/Mate connector）、Tangent direction（切于选定方向）。
- 后五类可输正/负 Magnitude，并可指定 Faces；V profile 同 U；Show isocurves + Count；Merge with all；Merge scope 选其他曲面合并。

#### Fill

- 选择边/曲线形成闭合边界；红点表示开口；建议 Create selection → Edges 标签 “Loop/Chain connected”；边界可部分与自身相接。
- New/Add；Continuity 每条边可设 Position/Tangency/Curvature；Tangency 对草图选择是“隐式切于草图平面法向”，仅适用于草图选择、不适用于其他平面曲线；Curvature 需指定 Adjacent face；Tangency/Curvature 可选 Adjacent faces。
- 内部边、3D fit spline、projected curve、bridging curve 只能 Match position；Composite curve 只有在“曲面边”构成该曲线时才可匹配切/曲率。
- Guides：点/顶点/草图点/曲线；曲线时 Sampled（Sample Size 控制采样点，可能波纹）或 Precise（精确穿过，要求严格：曲线相交处须相切、须触边界但不穿边界；不触边界的 guide 在 Sampled 可成功、Precise 失败）。
- Show isocurves 显示未修剪曲面的等参网格；若闭合且 Add，会自动生成实体；不想成体用 New。

#### Move Boundary

- 选择曲面或边界边；Tangent propagation 按相切扩展到首条边；端条件 Blind（距离）、Up to face、Up to part/surface、Up to vertex；负 Distance 修剪；反向箭头或拖操纵器；Up to 类可用 Offset distance 及反向；Maintain curvature 使延伸段与原边界曲率连续。

#### Ruled Surface

- 输入边/草图线/曲线（可多条）；类型 Normal、Tangent、Aligned with direction、Angled from direction；Angle（度，可旋转反向）；Distance（可反向）。若方向无法生成，图形区红色报错；角度/距离使直纹面互穿时特征变红且曲面不可见。
- Reference face 默认取相邻面，可改/加，可 x 删除；Vertex overrides 可对路径上顶点覆盖类型（Normal/Tangent/Aligned with direction/Up to vertex；Up to vertex 可选点或隐式/显式 Mate connector）、Angle、Distance，可展开/收起。
- Use cubic interpolation 在分段间提供更细连续；Show ruled lines 每连续路径 1–100，默认 40；Corner type：Spun（默认，曲线旋转角）、Extended（延伸直线）、Loft corner（略放样）、No corner；无法生成角时报警。

#### Mutual Trim

- 第一组/第二组曲面；每组 Keep opposite side 箭头翻转保留侧，也可直接点图形区箭头；Merge 默认勾选（合并为一张曲面），取消则保留全部修剪后曲面；结果列入 Surfaces list。
- 平台：iOS/Android 仅支持编辑/查看从桌面插入的 Mutual trim。

#### Constrained Surface

- Points：选顶点，曲面默认在顶点法向；展开顶点可设 Normal（选模型方向）或 Mate connector、Flip normal；Mesh：选网格体/面。
- Tolerance 越大曲面越简单、越大；Optimize：Performance（快、质量可能低）或 Smoothness（更高质量、更低曲率、更多控制点、更慢）；Deviation 复选显示最大偏差；Show deviation 选 Maximum 或 All；Limit 设定显示阈值。
- 平台：桌面与 iOS 可创建；Android 仅显示/编辑已有。

### 4.8 曲线工具

**通用**：结果一般在 Parts > Curves 列表；不能通过特征显隐曲线，须用 Curves list 的 eye/右键；Approximate 参数组（Target degree、Maximum control points、Tolerance、Keep start derivative、Keep end derivative、Show deviation；原曲线橙/黄、新曲线品红）。

- **Projected Curve**：Two sketches —— 选 First/Second sketch，两非平行草图投影须交成一条连续曲线；Curve to face —— Edges（可多）投影到 Targets 面，透视 Normal to target 或 Direction（选参考曲线/边）。
- **3D Fit Spline**：两种选择页签 Vertices / Edges；顶点定义时可 Closed spline、Start/End direction（线或 Mate connector，隐式/显式）、Start/End magnitude、Match curvature at start/end；边定义要求边相切连续；可 Reorder items 拖拽排序。
- **Bridging Curve**：Start/End 为点/顶点（可再选面）或 Mate connector；连续性 Match tangent（切于边/面/MC 的 Z 轴）、Match position（到顶点/MC 原点）、Match curvature、Match flow (G3)；记住上次连续性。Adjust：Control points（Edit control points，设 Start/End magnitude、curvature offset、flow offset）或 Magnitude/bias（Magnitude 正数默认 1；Bias 1.000e-4–0.999，0.5 等权）；Edit edge positions 调整 Start/End edge position；Match position 不需要选边；顶点只有一条出边时可不选边、多条出边须选边；只选边不选顶点时系统按另一侧推断顶点。
- **Composite Curve**：选相接的边/草图实体/曲线；非连续选择会得到多条 Curve；相交/重叠则失败；不消耗源；源零件/曲面/曲线可用 Delete part 删除，但草图不能删（Delete part 不支持）；可把生成的 Curve 作为 Loft 轮廓。
- **Intersection Curve**：Group 1/Group 2 分别选曲面/面/平面/零件；仅跨组相交产生曲线；可多条；可用工具体限制；可替代部分 Split 流程；线性阵列时若希望曲线沿曲面，须把相交用平面加入 Features to pattern 并勾 Reapply features。
- **Trim Curve**：
  - Trim：选曲线 → Up to entity（曲线/面/边/平面，必须相交）或 Mate connector（不必相交），可混用；Help point 决定裁剪到最近位置；Opposite direction 选择保留另一段。
  - Extend：End condition Blind（Distance）或 Up to entity（可含 Mate connector）；延伸形状 Curvature（尝试匹配曲率）或 Tangent（保持相切）；Help point 决定从哪端延伸（点不必在曲线上）；Opposite direction 反向。草图实体须先转 Composite curve；Opposite direction 与 Help point 相互独立。
- **Isocline**：选面；选方向参考；方向箭头可反；Angle 从参考计算；Split 沿等斜线分割面。
- **Offset Curve**：
  - 选边（可多）→ Distance；Offset type Geodesic（目标面 2D 空间）或 Euclidean（3D 空间）；flip 到边另一侧；Gap fill Linear 或 Round（与两侧曲线相切）。
  - Scope：Offset；Offset and extend（两端延伸到面边，可选 Trim + Start/End trim + Equal trim）；Offset, extend and split（延伸并分割面、生成新面，**不生成独立曲线**）。接受后前两种不分割面。
  - Targets 限制目标面；不选=全部面；可 Approximate；多条边可成链，曲线上分支会报错；同一面内多条 offset 曲线可交叉。
- **Isoparametric Curve**：选面/曲面；Direction U（沿曲面 X）/V（沿曲面 Y）；Equal spacing + Instance count；或逐条 Add Curve，设 Location 0–1（0.5 为面中心）或 Select point（点/顶点/显式 MC，也可建隐式 MC）；X 删单条、CLEAR 全清；滚轮默认步进 1.0、Ctrl+滚轮 0.01、Shift 无作用；桌面独占创建。
- **Edit Curve**：
  - 选择不自交、连续路径的线性草图实体/曲线；多选时须 Approximate（生成新曲线）。
  - 固定层级 Approximate → Elevate → Planarize → Edit control points（自上而下）；要反序需多个 Edit curve 特征。
  - Approximate：Target degree、Maximum control points、Tolerance、Keep start/end derivative；不保证几何完全保持。
  - Elevate：提高 Target degree，几何保持，控制点增多。
  - Planarize：Reference plane 为 Best fit（按控制点平均位置拟合）、Lock ends、YZ、XZ、XY、Custom（平面或 MC 的 XY 平面，法向为 Z）；可把 helix 平面化成螺旋。
  - Edit control points：Control point index 从 0 起；Edit mode XYZ/UVN (Tangent)/UVN (Control polygon)；每点可有 Reference（顶点/草图点/显式/隐式 MC）、X/Y/Z offset、Weight；Add point override；一行一覆盖，可逐行 x 清除或 CLEAR 全清；Show details 只读显示 Degree/Control points/Spans；已重近似可 Show deviation；多曲线作 Loft 时应使控制点数相等以获得良好对齐。
- **Routing Curve**：
  - 曲线类型：Interpolated spline（三次插值过全部点）或 Polyline；Bend radius 全局，默认 0（无弯曲），可按点 Override bend radius；Target length 设定总长（不可达时改长度/加点/删约束）。
  - Points 输入：Vertex（顶点/MC 列表）；Curve（选边 + Number of samples + Overwrite points + Process 均匀布点）；CSV（Select CSV file 来自 Current/Other documents，Data start column 指定 X 列，Unit 为 Centimeter/Foot/Inch/Millimeter/Meter/Yard，Overwrite points、Process）。Closed 生成闭合（周期）曲线；Curve reference 默认原点。
  - 编辑：Single（Previous/Next 循环）/Multiple；CLEAR 清全部；当前点可删除、设 Reference（Origin/Vertex/Curve/Relative；首点不能 Relative）、X/Y/Z offset、Override bend radius；Interpolated spline 另可设 Derivative（切线方向）+ Triad alignment + Magnitude，可选 Direction（边/MC）；Add point（可复制选中点）；重叠点显示红星并警告“Some points appear to overlap at the current zoom level. Derivatives on overlapping points are ignored.”；Reset triad；Add point on axis drag；Show reference coordinate system；Keep points。
  - Segments：洋红线表示段、段中点为 manipulator；Add points 把段细分；Orthogonal path 选 Coordinate system World/Curve/Other，点非正交段用 Previous/Next 循环候选、Confirm 确认，可用 Undo/Ctrl+z 撤回；插值样条与折线均可，但折线更常用于管路。
  - 表格：Routing curve table tab 列出所有 routing curve；LRA 复选显示长度/旋转/角度（折线）；列右键左右移动/隐藏、overflow Copy table/Show hidden columns。
  - 特征名中显示总长（`#curveLength` 变量，可在勾选旁 Edit 删除）；routing curve 不能由变量驱动，但可关联由变量驱动的既有几何点/顶点/曲线来间接布局。

### 4.9 钣金收尾

- **Finish Sheet Metal Model**：选择活动 Sheet metal model（Parts list/图形区）→ 勾 → 特征列入 Features list。之后模型按普通实体处理，可斜钻孔、焊角、加 Form/自定义 FeatureScript；后续改动不影响展开图/表值；删除或抑制该特征可恢复为活动钣金。
- 活动钣金模型可用工具：Flange、Hem、Tab、Bend、Jog、Form、Loft、Make joint、Corner、Bend relief、Modify joint（经 flat view table）、Corner break、Sheet metal table and flat view、Finish sheet metal model。
- 移动端流程相同。

## 5. 工作流、规则与错误状态

### 5.1 典型端到端流程

1. **外观/材料**：右键零件 → Edit appearance（颜色/透明/tessellation）→ 接受；或 Assign material → 选库/材料 → 接受；Mass properties 随材料给出密度信息；Appearances 面板统一编辑面级覆盖；阵列时外观随阵列复制。
2. **MBD**：草图尺寸设公差 → 特征参数（如 Extrude Depth）设公差 → 建模完成后在 Inspection table 加 Datum/从动尺寸/几何公差/焊接符号 → 编辑驱动尺寸（草图/特征对话框）→ 实时校验 → 导出 STEP（勾 Y 轴向上与标注字高）或 CSV；需要协作时 Copy link 分享 Inspection 视图。
3. **默认公差库**：Documents 页建文件夹层级 → 底层建文档 + Variable Studio → 在样例零件上编辑公差并保存 → Create version → Set library / Update my library → 各 Part Studio 的 Inspection table 选用。
4. **曲面修补**：Boundary/Fill 建面 → Move Boundary 延伸/修剪 → Mutual Trim 互相裁剪并 Merge → Thicken 或 Enclose 成体；曲面质量用 Show isocurves、Zebra 条纹检查。
5. **曲线准备**：Projected/3D Fit/Bridging/Composite/Intersection/Offset/Isoparametric 产生 Curve → Trim/Edit Curve 修正 → 作为 Loft/Boundary/Sweep 的 profile/guide/path。
6. **布线**：Routing curve（点/边采样/CSV）→ Segments 正交化 → 用 Sweep 生成管件 → Composite part 合并曲线与实体。

### 5.2 文档明确的规则与限制

- **再生**：暂停再生时几何与表格不一致、草图不可编辑、不能与 Repair mode 同用；切换 tab/关文档自动应用；再生后的更改不可 undo（只能恢复旧版本）。
- **外观**：颜色一旦指定持续保留；Very fine 只能手选；更细 tessellation 会拖慢；透明后须 Alt 穿透选择。
- **材料**：未赋材料质量为零；自定义材料属性不保存；删除库立即生效且无确认；库更新不会回溯已赋材料零件；公司库须由管理员勾选后对成员可用。
- **Custom table**：只有版本中的 FeatureScript 有效；表插入 Drawing 时作用于整个 Part Studio。
- **Variable table**：表头只读；同表变量名唯一；跨表同名“后表覆盖前表”；插入的 Variable Studio 只读、依赖源文档版本。
- **公差**：单线距离与弧长不可设公差；带外部点/面的草图尺寸可设公差但 Inspection 表不显示；Fit 系列仅孔/草图直径；移除特征公差不会删尺寸。
- **MBD**：仅面可被引用；按零件校验，不可跨零件（复合零件可以）；派生零件定义只读；派生标注不可删、不可编辑；配置下 context dialog 无橙色虚线提示、已配置草图尺寸不可编辑；Pause regeneration 时模型尺寸不可编辑/删除；闭合复合零件不导出 MBD 到 STEP。
- **Inspection table**：默认公差显示、派生公差隐藏；Derived 零件的 Hole 公差即使勾隐藏仍显示；Hole 尺寸须先有 Datum 才出现；Tip angle 不支持；每个 Hole 特征只一组尺寸。
- **Datum/GTol/Weld**：Datum 超过 7 字符被拒；GTol 最多 5 个约束行、3 个 Datum 字段；焊接 Reference 最多 100 字符、Groove 0–360。
- **曲面**：Fill 边界必须闭合；Precise guides 不得与边界相交、曲线相交须相切；Mutual trim 移动端不能创建；Constrained surface Android 不能创建；Offset curve/Isoparametric curve 移动端不能创建。
- **曲线**：Composite curve 不得重叠或相交；Intersection curve 同组不相交；Trim curve 的 “Up to entity” 必须相交，Mate connector 不必相交；Offset curve 分支边报错；Routing curve 不能由变量驱动。
- **公差库**：仅最后一行可删除；库文件夹未 unset 不能删除、不能编辑分享；更新文档后必须 Update my library 才传播。

### 5.3 常见错误状态与处理

- 特征列表：错误图标/黄色三角/蓝色未定义标记；`:errors`、`:warnings` 搜索；Show regeneration times 找耗时特征。
- Fill：红点=边界开口；补边或用 Loop/Chain connected；Precise 因不满足相切/不越界失败时改用 Sampled。
- Ruled Surface：方向不可用/曲面互穿时红色报错；改方向/角度/距离；角无法生成时报错。
- Offset Curve：选择分支边报错；改选连续链或分段创建。
- MBD：标注红色+表行红色=missing reference 或 value mismatch；修复特征或标注；part 间引用报 “Both faces must be from the same part”。
- 材料库：文档无版本时插入变量表会提示先建版本；材料分配后库更新不回溯，需重新赋材料。
- Inspection 导出：部分表格软件会改写符号，需要文本编辑器或重设格式。

## 6. 与其他章节的关系

依据正文显式引用与工具集合：

- **Configurations**：面颜色可按配置；公差选项可按配置；Inspection 表按配置维护各自公差；Variable Table 可插入已配置变量；Release all configurations 仅单 List 输入。
- **Isolate**：零件右键 Isolate；Inspection 的 Isolate active part 复用 Isolate 对话框。
- **Compare**：公差差异在历史比较中黄色标出；可用 Compare 选面查看关联标注/公差/特性。
- **Part properties / Mass properties**：材料与零件属性联动；材料驱动 Mass properties 密度信息；Part properties 显示只读材料。
- **Drawings**：MBD 数据可经 Suggested views 自动带入 Drawing；Custom table 插入 Drawing 时针对整个 Part Studio；Hole table 另有 Drawing 版本。
- **Derived**：派生零件 MBD 定义只读，源文档修改后更新 Derived 特征。
- **Sketch tools / Sketch tool dimensions**：公差可加在特定草图尺寸；MBD 草图尺寸编辑依赖 Sketch 对话框。
- **Hole feature**：孔尺寸公差、Hole table、Inspection 中 Hole 行。
- **Loft / Boundary / Sweep / Thicken / Enclose**：曲面与曲线工具的上下游；Composite curve 可作 Loft 轮廓；Routing curve 可作 Sweep 路径；曲面可 Thicken/Enclose。
- **Helix**：曲线工具集合成员，可被 Edit curve 平面化。
- **Face blend / Delete face / Move face / Replace face**：Surfacing tools collection 成员（各专页不在本组）。
- **FeatureScript / custom features**：Custom tables、公差（FeatureScript 支持公差）、自定义特征参数可设公差。
- **Variable Studio / Reference manager**：Variable table 的跨文档引用、Edit/Update reference。
- **Version / Share / Export / Import / Processing CAD files**：材料库、公差库、FeatureScript 表都依赖版本；材料库共享最低 View；Inspection CSV/STEP 导出；外观导入选项。
- **Copy link**：Inspection 视图分享包含配置、渲染模式、爆炸视图、面板状态与视图方向。

## 7. 对 LubanCAD 的可执行启示

### 7.1 需要补齐的 UI 表面（候选）

- [文档明确] 零件/面/特征/草图/曲线五级外观入口与 Appearances 面板；面外观列表、Add face appearance、按配置的面颜色。
- [文档明确] 材料赋予对话框的 Library/Custom 双标签；材料库管理（Preferences > Material libraries 的 Add/Remove/Update）；材料库文档 tab 名即库名；CSV 首行三列。
- [文档明确] Features list 的 `:` 搜索前缀、文件夹、动态抑制、Show dependencies、Show regeneration times、暂停再生横幅与四个按钮。
- [文档明确] 右侧面板家族：Appearance、Configuration、Custom tables、Variable table、Hole table、Inspection table、Routing curve table；以及面板的 Copy table/列右键/overflow 恢复列模式。
- [文档明确] Inspection table 的 Model 下拉、Datums/Characteristics 双表、Annotation 工具栏 10 个工具、四个过滤器、CSV 导出对话框（含邮件链接选项）。
- [文档明确] 公差对话框的 Precision 下拉与 10 种 Tolerance type；Fit 系列的 ANSI/ISO + Fit type + Hole/Shaft class 联动字段。
- [文档明确] 7 个曲面工具与 11 个曲线工具的对话框字段、按钮与结果列表归属（Surfaces / Curves）。
- [推断] LubanCAD 若尚无 MBD，应把“标注层”与“特征/草图尺寸公差”拆成两个数据层：尺寸持有 Tolerance options，标注（Datum/GTol/Weld/从动尺寸）引用面或尺寸；Inspection 表是二者的投影，而不是第三份数据源（对应 P0-06 单一数据源）。

### 7.2 参数与默认值清单（可直接建测试）

- [文档明确] 默认零件色 8 色循环，第 9 个复用第 1 色；删除零件不打乱既有颜色。
- [文档明确] 透明度范围 0–1；tessellation 五档，Auto 默认、Very fine 仅手选。
- [文档明确] 自定义材料 8 字段（Name/Density/Poisson/Young's/Tensile yield/Ultimate tensile/Compressive yield/Ultimate compressive）；未赋材料质量=0。
- [文档明确] 公差 Precision 0–6 位小数；Tolerance type 全集；Default 引用默认公差库。
- [文档明确] Datum 名称规则（大写字母开头+数字，≤7 字符，空格/连字符/特殊字符非法）；默认 A/B/C。
- [文档明确] Geometric tolerance：Upper 50 字符、Lower 200 字符、Prefix/Suffix 20 字符、最多 5 个 frame、3 个 Datum 字段；Weld Reference 100 字符、Groove 0–360。
- [文档明确] ISO 2768-c/f/m/v 的分段阈值与值（见 4.6），Precision 线性默认 0.013 cm、角度 ±1°、倒角角度 ±5°。
- [文档明确] Boundary Surface 7 种边界条件；Fill Continuity 三档（G0/G1/G2）；Bridging Match flow 为 G3。
- [文档明确] Ruled lines 1–100 默认 40；Bridging Magnitude 正数默认 1、Bias 1.000e-4–0.999；Routing Bend radius 默认 0、插值样条为 degree 3。
- [文档明确] Isoparametric Location 0–1（0.5 居中）、滚轮步进 1.0/Ctrl 0.01/Shift 无效；CSV 单位 6 种。
- [文档明确] 材料/公差库 CSV UTF-8；公差库仅末行可删；库文件夹未 unset 不可删/不可改分享。

### 7.3 交互与选择规则

- [文档明确] Alt 穿透选择透明零件下的对象。
- [文档明确] 搜索前缀大小写敏感（`:variable`）；`:partnumber`/`:revision` 需先开 Show parts list properties。
- [文档明确] 面外观对话框可预选、可 x 移除；配置化面颜色。
- [文档明确] Fill 边界闭合检测用红点；Composite 选择非连续边会产生多条曲线；Intersection 同组不求交。
- [文档明确] 曲面界面对方向敏感：几乎所有工具都有反向/翻转箭头；Ruled Surface 方向错误导致红显；Offset Curve flip 到边另一侧。
- [文档明确] MBD 标注只认面；两零件间量距须先 Composite part；从动尺寸灰色不可改值，仅可改公差。
- [文档明确] Inspection Type/Datum 单元格是点击开关，hover 与点击的高亮颜色不同（橙 vs 黄）。
- [文档明确] 曲线显隐只能通过 Curves/Parts 列表，不能通过特征显隐。

### 7.4 事务/撤销/版本/权限/协作约束

- [文档明确] 暂停再生期间切换 tab 自动应用更改；已再生更改不可 undo，只能恢复版本。
- [文档明确] 材料库 Remove 立即生效且无确认；库更新不回溯已赋材料零件；共享最低 View。
- [文档明确] 公差库文档必须建版本并 Update library 才传播；库文件夹须先 unset 才能删/改分享。
- [文档明确] Custom table 只接受版本中的 FeatureScript；Variable Studio 跨文档引用只读且需要版本。
- [文档明确] MBD 校验逐零件；派生定义只读；派生标注不可删除；Pause regeneration 时模型尺寸不可编辑/删除。
- [文档明确] Inspection 视图分享链接包含配置、渲染模式、爆炸视图、面板状态与视图方向。
- [推断] 以上对 LubanCAD 的含义：材料/公差“库”是文档资产而非会话设置，必须纳入版本与权限模型；任何“库更新自动推送”设计都与 Onshape 语义不符（Onshape 是显式 Update + 重新赋材料/重新引用）。

### 7.5 可写成测试断言的验收点

1. [文档明确] 新建 9 个零件：第 1 与第 9 零件颜色相同，前 8 个互不相同；删除任意零件后其余颜色不变。
2. 透明度 0.5 的零件后方对象，普通点击不可选，Alt+点击可选。
3. 未赋材料零件 Mass properties 质量 0；赋 Aluminum 6061（2720 kg/m³）后质量按体积×密度。
4. 导入材料 CSV：首行 Category/Name/Density；tab 名成为库名；在未 Preferences 添加时也能通过 Material 对话框 + 添加使用。
5. 修改材料库并 Update 后，已赋该材料零件属性不变；重新 Assign material 后更新。
6. Feature list 搜索 `:errors` 只显示含错误特征/体；`:part part 1` 命中 Part 1/10/11/12 及直接影响它们的特征。
7. 回滚条置于 Fillet 之前时 Fillet 不参与显示；`Roll to end` 恢复；↑/↓ 单步移动。
8. Pause regeneration 时草图工具禁用/报错；切换 tab 后更改自动应用；重启后不可 undo。
9. 草图单线距离无法打开公差；两线距离可设 Symmetrical ±0.1；弧长无公差。
10. Extrude Depth 设 Limits 上/下限后，Inspection 表 Characteristics 行显示 Nominal/Tolerance/Upper/Lower；删除该公差行后特征尺寸仍在。
11. Datum 名称 “AB-1” 显示红色但可接受；“ABCDEFGH” 被拒；默认首个 Datum 为 A。
12. 几何公差出现第 6 个 frame 时被禁止；Upper 输入 51 字符被拒。
13. Hole 特征加公差后，无 Datum 时 Inspection 表无孔行；加 Datum 后出现；同一特征阵列孔只一行；Tip angle 不出行。
14. 跨零件两面量距报 “Both faces must be from the same part”；建 Composite part 后可量。
15. Fill 边界留 1 mm 缺口时红点存在且不能成面；闭合后可成面；Add 且闭合时自动生成实体，New 不生成。
16. Boundary Surface 选 Match curvature + Faces 后，Zebra 检查 G2 连续（可用几何连续性断言替代视觉）。
17. Ruled Surface 角度使两侧互穿时特征红显且曲面不生成；Show ruled lines 计数 1/40/100 边界值可用。
18. Bridging Curve Bias 输入 0.00005 被拒、0.999 可用；Magnitude 默认 1。
19. Offset Curve 选择分支边报错；Scope 为 Offset, extend and split 时不产生新 Curve 而是分割面。
20. Isoparametric Curve Location 0.5 位于面中心；Ctrl+滚轮一次增减 0.01。
21. Routing Curve Polyline + Bend radius 10 mm 与 CSV 三点输入可生成曲线；特征名显示总长；删除 `#curveLength` 后名称不再显示长度。
22. Inspection 表 CSV 导出列顺序为 Type/Nominal value/Tolerance/Upper limit/Lower limit；Copy link 在另一浏览器打开同一过滤/隔离视图。
23. 公差库仅末行出现 Remove；库文件夹在未 unset 时删除/改分享被禁止。

### 7.6 建议的实现优先级（基于文档密度与依赖）

- [推断] 第一批：外观/材料（已有零件模型，独立性强，测试断言清晰）；Features/Parts 搜索与暂停再生；Variable/Hole/Custom table（与现有 Part Studio 面板同构）。
- [推断] 第二批：公差对话框 + Inspection 表 + 默认公差库（需要“面引用”的稳定 ID 与尺寸-特征双向关联；这是 MBD 的前置）。
- [推断] 第三批：曲线工具（先 Composite/Projected/3D Fit/Bridging/Trim/Intersection，再 Edit/Offset/Isoparametric/Routing），因为它们为曲面提供 profile/guide。
- [推断] 第四批：曲面 7 工具（Boundary/Fill/Offset/Move Boundary/Ruled/Mutual Trim/Constrained），需要连续的 G0/G1/G2 内核能力与 Merge/缝合语义；Constrained Surface 需点云/网格拟合与偏差显示。
- [推断] 横切能力：所有曲线/曲面特征必须在 Feature list 中可回滚、可抑制；结果对象必须进 Parts/Curves/Surfaces 列表并可显隐；任何“只有特征没有对象”的实现都会违反文档语义。
