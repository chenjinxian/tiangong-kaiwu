# Onshape Help 全量分析报告 — 工程图（Drawings）

> 代理：#6/14 · 组文件：`groups/drawings.txt`（67 主题，59,604 词）· 语料：Onshape Help 本地快照，未联网。

## 1. 本章概览

- **主题数**：67（与组文件 `Topics: 67` 一致，逐主题全覆盖）。
- **总词数**：59,604。
- **覆盖子域**：图纸创建与模板；Sheet（图纸页）管理；图纸属性（Units/Precision、Dimensions、Annotations、Views、Construction Geometry、Formats、Tables、Inspection）；Styles（局部样式）；MBD Status；全部视图类型（标准/投影/辅助/剖视/对齐剖视/破断剖视/详图/断裂/裁剪/钣金平展）与 View Context Menu；尺寸工具全套（智能/倒角/最大最小/两点线性/点到线/线到线/线线角度/三点角度/弧长/半径/直径/预见缩短/坐标/孔螺纹标注）；注释与符号（Note、Callout/Balloon、Datum 与 Datum Target、Geometric Tolerance、Surface Finish、Weld Symbol、Edge Condition）；各类表格（Table、BOM、Cut List、Hole、Custom、Revision）；绘图草图/构造工具/绘图约束；DXF/DWG 插入、图片插入、Format Painter、Inspection Item、图纸更新与悬空实体；导入/导出/打印。
- **文档更新日期**：语料中**没有**任何页面级“last updated”字段，无法给出更新时间。
- **整体质量**：正文结构清晰、字段与默认值密度高（尤其 Properties 与尺寸调色板）；但图片全部退化为 `[image]`/`[image: alt]`，大量关键视觉规则（图标、示例图、对话框外观）只能依赖文字与 alt 描述。部分表格被压平成 `|` 行，个别表头/单元格错位（见下）；Weld Symbol 的接头清单有一处抽取断行。
- **抽取限制与文档内部矛盾（如实记录）**：
  1. `Drawings` 页说 iOS 只能“rename, delete, export”，`Exporting a Drawing` 页又说 iOS/Android 可导出 DXF/DWG/DWT/PDF——二者可并存（移动端仅导出能力），但“iOS 只能”表述与 Export 页不冲突，记录为文档口径差异。
  2. `Creating a Drawing` 说建图后“drawing contains default views”，`Views` 页说“without any views (by default) or with 4 standard views”，`Drawing Basics` 又说“The drawing is created, by default, with no views but with a view at your cursor”——属于同一事实的三种描述（模板/对话框选项决定），不是硬冲突，但验收时须以“建图对话框/Suggested views 选择”为准。
  3. `Drawing Properties - Formats` 开头说新图默认 **Locked**，紧接着又说“Drawings should have this property initially set to unlocked”，文档自相矛盾，只能记录两种说法。
  4. `Weld Symbol` 的 “Joint spacer / Joint types” 两段列表在抽取时被拆开，个别项（如 Single bevel butt broad root）究竟是 spacer 还是 joint 需回原页面核实（本报告按原文顺序归档）。
  5. 多页引用 `centermarks`、`Copying a view`、`Grouping notes`、`Part Studio hole table`、`Flat pattern views` 等**组外语义主题**，语料中未给内容，本报告只能按交叉引用记录。
  6. 所有“表格列/模板”的**具体列定义**在多数页面未逐列列出（BOM/Cut List/Revision 的列由 BOM 数据、管理员模板或 Release management 模板决定）；Hole Table 与 Inspection CSV 是少数明确给出列/字段的页面。

## 2. 主题清单与逐篇摘要

| # | 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|---|
| 1 | Drawings | Drawings | /Content/Drawing/drawings.htm | 工程图总览：可从 Part Studio/Assembly 建机械图，图纸数据库基于 .DWG、支持 .DXF；含完整快捷键表与 Drawing 标签右键菜单（Duplicate/Copy to clipboard/Change to version/Update linked document/Move to document/Export/Release/Revision history/Create task 等）。 |
| 2 | Drawing Basics | Drawings > Drawing Basics | /Content/Drawing/drawing_basics.htm | 三种建图入口（零件/空图/导入）、基本工作流（建视图→标注→导出/打印）、光标与夹点语义、推理线与捕捉点规则、Alt+drag 复制注释类实体。 |
| 3 | Creating a Drawing | Drawings > Drawing Basics > Creating a Drawing | /Content/Drawing/creating_a_drawing.htm | 从零件右键或 “+” 菜单建图；Suggested views 最多自动放 6 个正交视图并带入 MBD 数据；空图、DWG/DXF 导入；模板过滤器与 ANSI/ISO/JIS 标准。 |
| 4 | Custom Templates | Drawings > Drawing Basics > Custom Templates | /Content/Drawing/custom_drawing_templates.htm | 模板=格式（标题栏/边框/分区/属性/样式）；自定义模板对话框全部字段；导出 DWT（仅前两页、删除全部视图、2013 版）；传统 CAD 图转模板的完整流程与层规则。 |
| 5 | Sheets | Drawings > Sheets | /Content/Drawing/sheets.htm | Sheet 面板管理多页图纸：新建/复制/删除/重排/重命名、按 Sheet 或按 Reference 排序、Pin/Unpin view reference、Reference manager 更新、逐页替换 DWT、标题栏自动属性映射。 |
| 6 | Styles | Drawings > Styles | /Content/Drawing/styles.htm | 右侧 Styles 面板对尺寸/注释/剖面线/草图几何做局部视觉覆盖；逐项字段（字体、字高、颜色、箭头、文字对齐/间隙、延伸线、断线、剖面线图案、线型/节距/厚度），可 Revert；含各类型支持矩阵。 |
| 7 | Drawing Properties | Drawings > Properties | /Content/Drawing/drawing_properties.htm | Drawing Properties 面板索引：8 个页签（Units and Precision、Dimensions、Annotations、Views、Construction Geometry、Formats、Tables、Inspection）；可从 DWT 更新属性并 Lock drawing properties。 |
| 8 | Drawing Properties - Units and Precision | Drawings > Properties > Units and Precision | /Content/Drawing/drawing_properties_-_units_and_precision.htm | 主/双单位、单位列表（含仅图纸可用的 Feet and inches）、逗号/句点小数分隔符、0–6 位小数与 1/256 分数精度、角度/公差精度、双尺寸与孔标注位置、前导/尾随零。 |
| 9 | Drawing Properties - Dimensions | Drawings > Properties > Dimensions | /Content/Drawing/drawing_properties_-_dimensions.htm | 尺寸全局字体/字高/颜色、箭头长度 0.004–393.7 in 与 6 种箭头类型、文字对齐、断线、间隙/延伸线、45° 折线锁定、倒角尺寸样式、ANSI/ISO 坐标样式、直径/半径尺寸线默认。 |
| 10 | Drawing Properties - Annotations | Drawings > Properties > Annotations | /Content/Drawing/drawing_properties_-_annotations.htm | 注释全局与分类型默认：Notes/Flag notes/Callouts/Center of mass/Datums/Geometric tolerances/Surface finish/Weld（独立标准）/Edge condition/Bend notes/Hole callouts。 |
| 11 | Drawing Properties - Views | Drawings > Properties > Views | /Content/Drawing/drawing_properties_-_views.htm | 视图全局：投影角、可见/隐藏/切线/爆炸线样式、View labels；Insert view defaults（简化阈值、中心标记/线、隐藏线、螺纹、折弯线/注释）；各视图类型（剖/详图/辅助/断裂/平展）专属样式与标签。 |
| 12 | Drawing Properties - Construction Geometry | Drawings > Properties > Construction Geometry | /Content/Drawing/drawing_properties_-_construction_geometry.htm | 虚拟尖角（Centermark/Edge extension）、草图几何与驱动尺寸颜色；中心标记（线色/厚度/标记大小/间隙/扩展线、螺栓圆/径向线/图案中心标记）与中心线（线型/颜色/虚线间距）。 |
| 13 | Drawing Properties - Formats | Drawings > Properties > Formats | /Content/Drawing/drawing_properties_-_formats.htm | 锁定/解锁标题栏、边框、分区；各层颜色/厚度；锁定后字段值变更才刷新标题栏；灰字字段继承文档属性，可 Edit note / Insert drawing property。 |
| 14 | Drawing Properties - Tables | Drawings > Properties > Tables | /Content/Drawing/drawing_properties_-_tables.htm | 表格全局格式：横/纵 padding 默认 0.06 in；BOM/自定义/切割清单/孔/修订表分别设置线厚、字体、表头/内容行；孔表指示器样式与标签；修订表 callout 样式。 |
| 15 | Drawing Properties - Inspection | Drawings > Properties > Inspection | /Content/Drawing/drawing_properties_-_inspection.htm | 检验项外观与解析：Item parsing 为 Parameter（默认，按参数拆行）或 Row（整行）；字体/文字/边框形状、尺寸、颜色、实填充；Exclude callouts。 |
| 16 | MBD Status | Drawings > MBD Status | /Content/Drawing/mbd_status.htm | MBD 状态面板列出未被视图显示的 MBD 注释/尺寸；范围 Current sheet/All Models/Part；Datums 与 Characteristics 两表；缺失引用徽标、全部满足时显示对勾；删除的引用可右键 Show 恢复。 |
| 17 | Views | Drawings > Views | /Content/Drawing/views.htm | 视图总览与 Insert view 对话框（零件/曲面/装配/草图/曲线/复合零件/平展钣金；版本/方向/比例/简化/Show annotations from model）；删除/移动/跨页/链接视图规则；复制与区域复制；View properties 全字段（比例、旋转角、切线、渲染模式、简化、标签等）。 |
| 18 | Projected View | Drawings > Views > Projected View | /Content/Drawing/projected_view.htm | 从现有视图向各方向折叠投影新视图（快捷键 p）；可来自基/投影/剖/对齐剖/辅助/破断剖视图，不能来自平展与详图；Shift+click 放置时带父视图切口。 |
| 19 | Auxiliary View | Drawings > Views > Auxiliary View | /Content/Drawing/auxiliary_view.htm | 从选定线性边（通常斜边）或草图线/中心线/孔轴 90° 折叠辅助视图；三型 Normal/In line/Axis、反向、视图引用指示器；标签 A–Y（跳过 I,O,Q,S,X,Z）。 |
| 20 | Drawing Section View | Drawings > Views > Section View | /Content/Drawing/drawing_section_view.htm | 垂直/水平/角度剖视；Show cut geometry only、Cut angle（角度剖可 Opposite direction）、剖深 Up to entity/Blind、装配 Exclude from cut；折线剖最多 4 点；剖中剖 Cut from section；与 Break 视图互操作限制。 |
| 21 | Aligned Section View | Drawings > Views > Aligned Section View | /Content/Drawing/aligned_section_view.htm | 将不平行于视图面的剖切部分旋转到视图面；指定中心、Viewing plane location、Revolved plane location；Show cut geometry only、Exclude from cut；从剖/对齐剖创建时 Cut from section 默认勾选。 |
| 22 | Broken-Out Section View | Drawings > Views > Broken-Out Section View | /Content/Drawing/broken_out_section_view.htm | 用 Spline 闭合轮廓局部切除；End type Blind/Up to entity + Offset；装配可 Exclude from cut；深度点与模型关联，更新失败时样条变红。 |
| 23 | Detail View | Drawings > Views > Detail View | /Content/Drawing/detail_view.htm | 用圆/矩形/样条/多边形圈选已有视图并放大；设 View scale、View label、Profile style（In line/Connected/Leader）、Show detail view profile、Clip border to geometry；夹点缩放/移动，可加引线移动 Detail 名称。 |
| 24 | Break View | Drawings > Views > Break View | /Content/Drawing/break_view.htm | 水平/垂直断裂缩短视图；断裂线型 Zig zag/Small zig zag/Curve/Straight + gap；两线定位；与剖视互操作（角度剖例外）。 |
| 25 | Crop View | Drawings > Views > Crop View | /Content/Drawing/crop_view.htm | 用圆/样条/多边形围出保留区域裁剪视图；Edit crop/Remove crop；不能用于 Detail/Break/Flat pattern。 |
| 26 | Drawing Flat Pattern View | Drawings > Views > Flat Pattern View | /Content/Drawing/drawing_flat_pattern_view.htm | 钣金平展视图只能从 Insert 对话框插入；显示上下折弯线、成形轮廓（顶/底面）、成形中心标记、沉孔/沉头大径。 |
| 27 | View Context Menu | Drawings > Views > View Context Menu | /Content/Drawing/view_context_menu.htm | 视图右键命令全集：Show/hide（隐藏线、折弯线/注释、着色、螺纹、故障零件、零件交线、偏移切线、草图/草图点/约束、边、中心线、自动中心标记、零件、质心）、方向、切线、Adjust linestyle、层叠、对齐、旋转、复制/粘贴、复制注释、编辑、显示状态、爆炸/位置、抑制对齐、移除剖/裁剪、剖面线等。 |
| 28 | Drawing Dimensions | Drawings > Dimensions | /Content/Drawing/drawing_dimensions.htm | 尺寸基础与调色板：5 类捕捉点、推理线、Add jog、覆盖尺寸下划线语义、拖动/编辑夹点、断线；调色板前后缀/计数/精度/单位/14 种符号/检验框/双尺寸/公差与 Fit；文字放置与翻转箭头；排错。 |
| 29 | Drawing - Dimension | Drawings > Dimensions > Dimension | /Content/Drawing/drawing_-_dimension.htm | 智能尺寸（快捷键 d）：依所选曲线组合自动放置类型；圆件线性尺寸在投影视图自动加 Ø；线到线可同样加 Ø；同心圆/弧自动量壁厚。 |
| 30 | Drawing - Chamfer Dimension | Drawings > Dimensions > Chamfer Dimension | /Content/Drawing/drawing_-_chamfer_dimension.htm | 选倒角边+相邻边放置 Note 或 Dimension；样式在 Properties > Dimensions > Chamfer 设定；可加前缀。 |
| 31 | Drawing - Maximum or Minimum Dimension | Drawings > Dimensions > Maximum or Minimum Dimension | /Content/Drawing/drawing_-_max_or_min_dimension.htm | Ctrl+m；量一个弧/圆与任意其它几何（不含曲线）的最大或最小值，点击位置决定取最大/最小。 |
| 32 | Drawing - 2 Point Linear Dimension | Drawings > Dimensions > 2 Point Linear Dimension | /Content/Drawing/drawing_-_2_point_linear_dimension.htm | 必须选两个点（不能选线）生成水平/垂直/旋转线性尺寸；螺纹可开隐藏线后按点量取。 |
| 33 | Drawing - Point to Line Dimension | Drawings > Dimensions > Point to Line Dimension | /Content/Drawing/drawing_-_point_to_line_dimension.htm | 必须一点+一线；生成点到线线性尺寸；螺纹同理经隐藏线量取。 |
| 34 | Drawing - Line to Line Dimension | Drawings > Dimensions > Line to Line Dimension | /Content/Drawing/drawing_-_line_to_line_dimension.htm | 必须选两条平行线；只高亮平行线；生成线间线性尺寸；可量螺纹两线。 |
| 35 | Drawing - Line to Line Angular Dimension | Drawings > Dimensions > Line to Line Angular Dimension | /Content/Drawing/drawing_-_line_to_line_angular_dimension.htm | 两线内角/外角；尺寸弧有可拖夹点，跨过无限延长线切换为补角/对顶角；可表达共轭/反射角与补角。 |
| 36 | Drawing - 3 Point Angular Dimension | Drawings > Dimensions > 3 Point Angular Dimension | /Content/Drawing/drawing_-_3_point_angular_dimension.htm | 顶点+两腿各一点；尺寸弧夹点拖过延长线由初始角切到外角（360−初始角）。 |
| 37 | Drawing - Arc Length Dimension | Drawings > Dimensions > Arc Length Dimension | /Content/Drawing/drawing_-_arc_length_dimension.htm | 点弧放置弧长尺寸；向相反方向拖动可得共轭/反射角路径。 |
| 38 | Drawing - Radial Dimension | Drawings > Dimensions > Radial Dimension | /Content/Drawing/drawing_-_radial_dimension.htm | Shift+r；量圆/弧/弧形中心标记半径；可 Foreshorten/Remove foreshorten；被遮挡圆以引导线保证可见。 |
| 39 | Drawing - Diameter Dimension | Drawings > Dimensions > Diameter Dimension | /Content/Drawing/drawing_-_diameter_dimension.htm | Shift+d；量圆/弧/中心标记（含轮廓边）直径并自动带 Ø；详图/裁剪视图中自动呈预见缩短。 |
| 40 | Drawing - Foreshorten Dimension | Drawings > Dimensions > Foreshorten Dimension | /Content/Drawing/drawing_-_foreshorten_dimension.htm | Shift+h；在轮廓边或“中心线+弧/圆边”上做半直径型预见缩短尺寸；可在 direct/foreshorten 间转换、翻转。 |
| 41 | Drawing - Ordinate Dimension | Drawings > Dimensions > Ordinate Dimension | /Content/Drawing/drawing_-_ordinate_dimension.htm | 基准 0,0 后按方向成组标注 X/Y 坐标；组随动、单条可拖；Add to group/Reset ordinates；ANSI/ISO 样式；折点对齐；特征删除后尺寸变红可删。 |
| 42 | Drawing - Hole/Thread Callout | Drawings > Dimensions > Hole/Thread Callout | /Content/Drawing/hole_thread_callout.htm | 孔特征圆或外螺纹一键带出元数据；自动套用精度/公差/fit/shaft class；同尺寸孔多引线；Count type；可逐参数 Override；ANSI/ISO 螺纹画法与遮挡规则。 |
| 43 | Datum | Drawings > Datum | /Content/Drawing/datum.htm | 关联基准符号（线性/圆形边）；Datum Target 支持 Point(X)/Point(dot)/Circle/Rectangle/Custom、Area size、Length/Angle 定位、Instance 环形等距；可挂 GDT 四边及尺寸/延伸线。 |
| 44 | Geometric Tolerances | Drawings > Geometric Tolerance | /Content/Drawing/geometric_tolerance.htm | GD&T 框：14 种特征符号、上/下文字 50/200 字符、前缀/后缀 20、最多 3 基准、最多 5 行与 Composite；Leader/All around/All over；可吸附尺寸、分组、加节点；完整符号表。 |
| 45 | Surface Finish | Drawings > Surface Finish | /Content/Drawing/surface_finish.htm | 6 种表面粗糙度类型（ANSI/ISO 各 3 种）+ All around/Parenthesis/Direction lay；最多 5 附加行；放空白/圆边/零件面区域或尺寸延伸线；多引线与节点。 |
| 46 | Weld Symbol | Drawings > Weld Symbol | /Content/Drawing/weld_symbol.htm | 依图纸标准（ISO/ANSI）显示不同对话框；6 种双面 spacer、15 种接头、Stagger/Symmetric/Second fillet/Reference/All around/field flag；多引线与节点。 |
| 47 | Edge Condition Symbol | Drawings > Edge Condition Symbol | /Content/Drawing/edge_condition_symbol.htm | 边缘状态（edge break）符号：Direction Undefined/Vertical/Horizontal/Asymmetric、两偏差默认 None 可选 +/−/±、All around/Parentheses/Limited length edge；点顶点或边放置。 |
| 48 | Note | Drawings > Note | /Content/Drawing/note.htm | 快捷键 n；带/不带引线备注；仅无引线可旋转；列表项可 flag（默认 2 字符）；Explode/Flip；Unicode 与 %%d/%%c/%%p；完整文本格式、标尺/制表位、列表、符号、Drawing/Sheet Reference 属性插入、日期格式与标题栏编辑。 |
| 49 | Callout (Balloon) | Drawings > Callout (Balloon) | /Content/Drawing/callout_balloon.htm | 关联零件元数据/BOM/Cut list 的 Item No 气球标注；带/不带引线，面用实心圆；可选取 Part/BOM/Instance/Cut list/Flag 属性与边框形状/大小；分组、BOM 自动编号、堆叠 callout。 |
| 50 | Table | Drawings > Table | /Content/Drawing/table.htm | 自定义表格：行列数、Title/Header 行、固定角（默认右上）、单元格 Note 编辑、单元格格式面板、Excel/Google Sheets 复制粘贴规则、行列复制与尺寸调整。 |
| 51 | BOM Table | Drawings > BOM Table | /Content/Drawing/bom_table.htm | 从 Onshape BOM/上传文件/授权 App 插入 BOM；Flattened/Structured-Top level/Multi-level 三型、Top/Bottom 顺序、管理员模板；拆分/替换/移动/删除、单元格 Override 与黑色三角标记。 |
| 52 | Cut List Table | Drawings > Cut List Table | /Content/Drawing/cut_list_table.htm | 需 Part Studio 中先有复合零件与 Cut list；插入切割清单表；拆分/合并、Change configuration（不影响视图）、属性中的 Sheet/Order/固定角。 |
| 53 | Hole Table | Drawings > Hole Table | /Content/Drawing/drawing_hole_table.htm | 仅对“单一零件”的视图插入孔表（不能是整个 Part Studio）；设定位置坐标、精度、原点与 X/Y 轴、排除孔、排序；孔标签轴可翻转；可拆分表、折叠标签。 |
| 54 | Custom Table | Drawings > Custom Table | /Content/Drawing/custom_table.htm | 自定义表=Feature Studio 表定义+Part Studio 数据；作用于整个 Part Studio 而非仅已插入零件；插入时可 Add Part Studio、Insert 表、Order、固定角；属性含 Document/Workspace/Feature Studio 版本链接。 |
| 55 | Revision Table | Drawings > Revision Table | /Content/Drawing/revision_table.htm | 发布管理驱动的修订表：Multi-sheet Linked/See sheet 1、Visible rows、排序、隐藏无对应行 callout；待发布行蓝色+三角；可加/隐藏 revision callout；已发布描述仅管理员可改。 |
| 56 | Drawing Construction Tools | Drawings > Drawing Construction Tools | /Content/Drawing/drawing_construction_tools.htm | 2 点/边到边/3 点圆/2 点圆中心线；Centermark 支持 Single/Circular/Linear（参考中心/螺栓圆/径向线/图案中心标记/连接线）；虚拟尖角由两线性边生成并可切换样式。 |
| 57 | Drawing Sketch Tools | Drawings > Drawing Sketch Tools | /Content/Drawing/drawing_sketch_tools.htm | 图纸草图工具：Line/Center point circle/3 point circle/Tangent arc/Corner/Center point rectangle/Spline/Spline point/Sketch point/Trim；Hatch region（ANSI/ISO/General、pattern/scale/angle/color）及各视图可用性表。 |
| 58 | Working with Drawing Constraints | Drawings > Working with Drawing Constraints | /Content/Drawing/working_with_drawing_constraints.htm | 草图实体之间及与视图几何之间可加 Horizontal/Vertical/Coincident/Perpendicular/Parallel/Tangent；构造工具不可加约束；不可解约束显示红色。 |
| 59 | Insert DXF or DWG | Drawings > Insert DXF or DWG | /Content/Drawing/insert_dxf_or_dwg.htm | 把 DWG/DXF 模型空间线框与注释导入为图纸实体；颜色移除、块与多段线炸开、简单注释转可编辑 Note；可 Move to 标题栏/边框/分区层。 |
| 60 | Insert Image | Drawings > Insert Image | /Content/Drawing/drawing_insert_image.htm | 插入并缩放 JPG/PNG/GIF（Logo、二维码、条码）；保持纵横比；边框默认隐藏可切换；属性可换 Sheet、查看引用、Open linked document。 |
| 61 | Format Painter | Drawings > Format Painter | /Content/Drawing/format_painter.htm | 高级格式复制：可选 Paste style/Paste tolerance and precision/Paste content；只复制默认/图纸属性/Styles 面板格式，不复制 Note 对话框内样式，只复制双方共有项。 |
| 62 | Inspection Item | Drawings > Inspection Item | /Content/Drawing/inspection_item.htm | 检验项（编号气泡）：Manual/Automatic、自动 Scope 整图/单页/单视图并 Preview；适用尺寸（不含 basic/reference）、坐标、焊缝、粗糙度、GD&T、callout；检验表可模板化列并导出 8 列 CSV。 |
| 63 | Updating a Drawing | Drawings > Updating a Drawing | /Content/Drawing/updating_a_drawing.htm | 底层 Part Studio/Assembly 变更后 Update 图标变黄；Ctrl+q 只更新视图、不查外部链接；可先 Version 冻结；引用 version/revision 打开更快；放新视图时若过期会自动更新。 |
| 64 | Dangling entities | Drawings > Updating a Drawing > Dangling Entities | /Content/Drawing/dangling_entities.htm | 悬空实体=丢失一个或多个参考点（尺寸、剖切线、注释引线、callout、中心标记、GD&T 等）；红色夹点标出丢失点，拖到新参考点即可修复。 |
| 65 | Importing a Drawing | Drawings > Importing a Drawing | /Content/Drawing/importing_a_drawing.htm | 从 Documents 页导入→新文档；文档内导入→新标签+Drawing；自动翻译；导入 DWG/DXF 背景色在 Preferences > Drawings 设定 Dark/Light。 |
| 66 | Exporting a Drawing | Drawings > Exporting a Drawing | /Content/Drawing/exporting_a_drawing.htm | 导出 PDF/DWG/DXF/DWT/SVG/PNG/JPEG/CSV；对话框按格式给出 Sheets、Overridden dimensions、Text（Normal/Selectable、Export as text/Explode…）、Color、Units、z-height/法向、Hide inspection items、Exclude off-sheet；支持批量与 iOS/Android。 |
| 67 | Printing a Drawing | Drawings > Printing a Drawing | /Content/Drawing/printing_a_drawing.htm | Document 菜单 → Print… 打开打印友好页面，用底部控件打印或保存。 |

**覆盖核对**：本表 67 行，等于组主题数；67 个 URL 均已出现。

## 3. 核心概念与术语

- **Drawing（Drawing tab）**：文档中的工程图标签；所有图纸基于 **.DWG drawing database**，同时支持 **.DXF**。图纸元素**不支持同时编辑**（simultaneous editing），已被他人激活的元素会提示当前编辑者。
- **Sheet / Sheets panel**：图纸页（打印纸面）；模板包含 **main sheet** 与 **continuation sheets**；面板在左侧，显示当前页、视图标识、发布状态、最新修订图标。
- **Sheet scale / View scale / Parent scale / Sheet scale 链接**：视图比例输入为 **N:N 或 N/N**，用户输入时分母固定为 1；默认 **Parent**（父视图比例）；可选择 Parent scale 或 Sheet scale 链接。
- **View 关系**：parent/child（剖视、详图、投影、辅助来自父视图）；child 继承父的 Insert view defaults、Show annotations from model、视图简化等；链接视图跨 Sheet 时图标带箭头，更新链接视图的引用会同步更新所有链接视图；**无法解除链接**，只能删除重建。
- **View identifier/lettering**：自动标签 **A–Y，跳过 I、O、Q、S、X、Z**；Detail/Section 可通过 label 改父级引用字母。
- **DWT**：Onshape 图纸模板格式；导出时只保留第一页（及第二页作为 continuation template），删除所有视图，仅留非视图几何与文字；DWT 版本 **2013**。
- **Drawing layers**：**Drawing**、**Title block**、**Border frame**、**Border zones**；DWT 导出不含 Drawing 层；DWG/DXF 导出对应层名 `BORDER_FRAME`、`BORDER_ZONES`、`TITLE_BLOCK`；`Locked` 时三层锁定。
- **Drawing properties vs Styles vs Format painter**：图纸属性=全局默认；Styles 面板=对选中实体的局部覆盖；Format painter=从源实体复制三类格式（默认/图纸属性/样式面板）。
- **Associative（关联）**：尺寸、Datum、GT、Callout、孔标注等与视图几何/零件元数据/BOM 关联；**Dangling entity**=丢失参考点（红色夹点）；**Overridden dimension**=值被手改后变为非关联注释，文本始终下划线，删除值可恢复关联。
- **MBD（Model-Based Definition）**：零件上的标注/尺寸数据；建图时可随 Suggested views 自动带入，未被显示的进入 **MBD Status** 面板的 Datums/Characteristics 表；单位会转换为图纸单位。
- **Inspection item / Inspection table**：为尺寸/公差/粗糙度/焊缝/callout 等加编号气泡；Inspection table 汇总 Datums 与 Inspection items，可导出 CSV。
- **Release / Revision**：Release management 流程产生修订；Revision table 记录修订，pending 修订行蓝色、Revision 标签带小三角；Revision callout 标出变更；已发布描述仅管理员可编辑。
- **Pin view reference**：把引用版本/修订的视图钉住，阻止随更新变化；可 Unpin。
- **Referenced entities**：Sheet 面板两种视图（Sort by reference / Sort by sheet）；可 Switch to reference、Replace（替换所有引用页）、Change configuration（父-子集只改该组；按引用改全部）。
- **Fixed corner**：表格锚点，默认 **upper right**。
- **Item No**：BOM/Cut list 的行号；Callout 默认取该值，BOM 排序变化后需 **Update Drawing**。
- **Configuration / Display state / Explode-Position**：可配置零件的视图引用、装配显示状态与爆炸/命名位置；显示状态父视图默认 'show all'，子视图默认 'follow parent'；Section/Detail 只能 follow parent。
- **Fit class 词汇**：Fit type = User defined / Clearance / Transition / Interference；Hole class、Shaft class、Fit standard = ANSI (Drawing)/ANSI/ISO。
- **Count type**：孔标注计数方式；pattern 孔时 `Count by face (Excluding patterns)` 不可用。
- **绘图约束**：Horizontal、Vertical、Coincident、Perpendicular、Parallel、Tangent；仅用于 drawing sketch tools，不用于 construction tools。
- **ANSI vs ISO 默认**：ANSI=third angle + inch/mm；ISO=first angle + mm；坐标尺寸样式与直径/半径尺寸线默认随模板标准不同；Weld symbol 标准可独立于图纸标准。

## 4. 功能与 UI 明细

### 4.1 创建图纸与模板

**可用位置**：全部 `Available in: Drawing`。

**三种创建方式**（Drawing Basics/Creating a Drawing）：
1. 从 Part Studio 的 Parts list 或 Assembly 的 Instances list 右键零件/曲线/曲面/子装配 → `Create drawing of <name>`；
2. “+” 菜单 → `Create Drawing`（空图）；
3. 导入 .DWG/.DXF（Documents 页 `Create > Import files...`，或文档内 “+” → Import）。

**Create drawing 对话框**：
- 名称默认取零件/曲线/曲面名，可点击顶部名称编辑。
- 模板过滤器：Recently opened、Onshape、My templates（Created by me / Shared with me；含可读的 .DWT）、Public、Teams and companies；顶部标准过滤器：All、ANSI、ISO、JIS。
- `Suggested views`：自动放最多 **6 个正交视图** front/top/left/back/bottom/right；优先 top/right/front（依据 MBD 数据所在平面与标注平面）；first angle 时顺序适配但偏好不变。MBD 数据会带入视图；未带入的进 MBD Status。最多 4 个视图（无 MBD 场景）或 6 个（MBD 场景）——文档两处分别写“Four views”与“up to 6”。
- `No views`：空图纸，后续插入视图时若该视图平面有 MBD 数据则显示。
- 模板默认开启 centermark extensions；删除中心标记：选中按 Delete。

**Custom template 对话框字段**：Standard（ANSI/ISO/JIS）、Language、Size、Units（Millimeters/Centimeters/Meters/Inches/Feet and inches/Foot/Yards；按标准默认；Feet and inches 仅图纸可用）、Decimal separator（Period/Comma）、Projection（Third angle/First angle）、Border（含/不含）、Horizontal zones、Vertical zones、Start zones（起始角）、Titleblock（含/不含）、Suggested views 或空图。

**模板制作/导出规则**：
- 公开模板自定义后：Drawing 标签右键 Export → Format **DWT** → Options `Store file in a new tab` → Export；可再 Download。
- 导出 DWT 仅第一页与（如有）第二页；所有视图删除；格式 DWT、版本 2013；第一页=primary template，第二页=continuation template。
- 使用传统 CAD 图作模板：Custom Template 选不含 border/title block → 建空图 → 导入 DWG/DXF → `Insert DWG/DXF` → 改字体为内部支持字体 → 用 `Move to` 把元素移到 Title block/Border frame/Border zones（只有这三层会导出）→ 导出 DWT；需 Revision Table/Block 时先生成图再放表。
- 层规则：Drawing 层永不导出/永不随换页替换；Title block 不随纸幅替换，Border frame/zones 会按新尺寸重绘。

### 4.2 图幅（Sheets）与图纸属性

**Sheets 面板**（Ctrl+s 开关；PgDn/PgUp/Home/End 翻页）：
- 新建：右上角 Create sheet 图标；新页插在当前高亮页之后并立即显示。
- 排序：`Sort by reference`（实体为主，下列其所在 Sheet 与 View）与 `Sort by sheet`（Sheet 为主，下列引用实体与视图）。
- 引用操作：`Switch to reference`、`Replace`（打开 Insert view，替换所有页上的该引用）、`Change configuration`（弹出 Change configuration，按 Configuration 下拉切换；从 Sort by sheets 的 parent-child 组发起只改组，从 Sort by reference 发起改全部视图）；hover 配置零件显示配置选择 tooltip。
- `Pin view reference` / `Unpin view reference`：钉住版本并显示 pin 图标与版本名。
- Duplicate：复制到原页后；Copy/Paste：可跨 Sheet、跨 Drawing、跨 workspace（跨 workspace 必须来自 version）；Paste 后新页在面板底部。
- Delete：可 Undo 或用 workspace 时间点恢复。
- 重排：拖拽或 Move up/Move down；视图可拖到另一 Sheet，或右键 `Switch to sheet`；**子视图不随父视图自动移动**，需逐个选择。
- Rename：只改面板名，不改 title block；Shift+N 打开重命名。
- Sheet properties：Scale（反映到 title block 与 View properties）、Paper size（Custom 宽高，**最大 1800 in × 1800 in**）、Border、Horizontal/Vertical zones、Start zones（bottom right 或 top left）、References 列表（link 图标跳转）。
- 引用更新：Sheets 面板引用图标 → **Reference manager** → `Update all` 或 `Selective update` → 选引用 → `Update selected`。
- 逐页换格式：Sheet properties → Select a DWT 图标 → Current document/Other documents（Owned by me、Enterprise/Classroom/Company、Recently opened、Created by me、Shared with me）或本地 Import → 选中 DWT 应用到当前页。
- 标题栏自动映射：Documentation name（无则 Nickname）→ Drawn/Name；Created date → Drawn/Date（UTC）；Part Number → DWG No；Description → Title；Revision → Rev；Sheet number 与 Total sheets 自动。未填属性时显示“----”，可删除该 note 去除；跨文档复制注释/符号可用。

**Drawing Properties 面板（8 页签）**：
- **Units and Precision**：
  - Primary Units：Millimeters、Millimeters (Drawing)、Centimeters、Meters、Inches、Inches fractional、Feet and inches、Feet、Yards；Decimal separator Comma/Period；Precision 0–6 位小数或 0–1/256；Tolerance precision；Angular precision；Angular tolerance precision；Fit class tolerance precision。
  - Dual：Show dual dimensions（位置 top/bottom）、Show dual unit、Dimension location、Hole callout location（top/bottom/left/right）、Units（排除主单位）、Precision、Tolerance precision。
  - Leading/trailing zeros：Length leading/trailing zeros、Length tolerance leading/trailing zeros。
- **Dimensions**：All dimensions（Font、Text height、Color 取色板/Mixer/自定义色、Arrowhead 长度 0.004–393.7 in、Arrowhead type = 无/实心/空心/开放/斜线标记/实心点、Text justification Left/Center/Right/Auto、Underline overridden dimensions、Break dimension by default）；Gaps and extensions（Text alignment、Text gap、Geometry gap、Extension past line、Lock the angle of all jogged dimensions to 45 degrees）；Chamfer（45° style Note/Dimension、45° content Angle x Length/Length x Angle/Length x Length/C Length、Non-45° style、Non-45° content、Length/Angle precision）；Ordinate dimensions（ANSI/ISO，随模板默认）；Diameter and radial（Show dimension lines by default：ISO 模板默认勾选、ANSI 默认不勾）。
- **Annotations**：通用 Font/Text height/Color；All annotations Arrowhead；Notes（+ Hide property placeholder “----”、Hide property background）；Flag notes（Border shape）；Callouts（Text justification、Stack direction、Stack gap size）；Center of mass（直径）；Datums（Datum size=三角形尺寸）；Geometric tolerances；Surface finish；Weld symbols（标准独立于图纸）；Edge condition；Bend notes；Hole callouts（含 indicator）。
- **Views**：All views（Projection angle、Visible edges、View labels）；Insert view defaults（View simplification 五档、Auto centermarks、Auto centerlines、Hidden lines、Threads、Bend lines、Bend notes、Tangent edges、Scale label；child 继承 parent）；Hidden edges、Tangent edges、Exploded lines；Section views（Hatch pattern/Hatches/Cutting lines/Arrowhead filled/unfilled/open/Cutting line label）；Detail views（Detail profile lines Phantom/Dashed/Solid、Arrowhead、Detail profile label、Detail profile style In line/Connected/Leader、Detail view profile、Show detail view profile、Clip border to geometry）；Auxiliary views（Show view reference indicator、View reference format line/arrow、Viewing lines、Arrowhead、Viewing line label、View label prefix、View label style A-A/A、View label suffix）；Break views（line thickness/color）；Cosmetic threads（style/thickness/color、ANSI dash length scale）；Flat pattern views（All bend lines、Up/Down bend lines Solid/Dashed/Center(默认)、Bend tangent edges、Counterbore/Countersink up/down Solid(默认)/Dashed/Center、Form tear、Form up/down Center(默认)、Form centermarks Solid(默认)）。
- **Construction Geometry**：Created in drawing（Virtual sharps = Centermark/Edge extension；Sketch geometry 线尺寸/颜色；Sketch driven dimensions color）；Part Studio sketches；Centermarks（line color/thickness、mark size、gap size、Extended lines；circular：bolt circle/radial lines/pattern centermark；扩展线拖动全部联动，Shift 拖单线；红菱形捕捉点仅全部同时移动时出现）；Centerlines（line size/color/dash spacing）。
- **Formats**：Locked/Unlocked（文档矛盾见 §1）；Border frame（Color/Thickness）、Border zone（Color/Thickness）、Title block（Color/Thickness）；灰字=来自文档数据/属性，右键 `Edit note` 可编辑，hover/点击显示对应属性；可用 `Insert drawing property` 换属性。
- **Tables**：All tables（Horizontal/Vertical padding，默认 **0.06 in**）；BOM/Custom/Cut list/Hole/Revision/其它表各自 Line thickness、Font、Header row text、Content row text；Hole 另含 Indicator style（ANSI/ISO）、Indicator arrowhead、Indicator lines、Tags；Revision 另含 Title row text、Revision callout（shape、字符数、font/size/color/treatment）；通用 Tables 含 Title row text。点击单元格空白可开 Cell edit panel，双击文字单独改。
- **Inspection**：Item parsing（Parameter 默认 / Row）；Font、Text、Border shape/size/color、Solid fill；Automatic inspection items 的 `Exclude callouts`。

**Styles 面板**：右侧图标开关；支持：
- Dimension styles：Font、Text height、Color、Arrowhead、Text justification、Text alignment、Text gap、Geometry gap、Extension past line、Show first/second extension line、Break dimension、Show dimension line（仅圆弧内显示）。
- Annotation styles：Font、Text height、Color、Arrowhead、Text justification、Text gap、X degree content（Angle x Length/Length x Angle/Length x Length）、Stack direction（Auto/Right/Left/Up/Down）、Stack gap size（mm）、Datum size。
- Hatch styles：Hatch pattern（三个下拉：type/style/size）、Color、Scale、Angle。
- Sketch geometry styles：Linestyle（Solid/Phantom/Center/Dashed/Dotted）、Pitch scale **0.01–5.00**、Thickness、Color。
- `Revert to drawing properties` 清除局部样式；混合选择只显示共有项；含不支持类型时面板不可用；Format painter 可批量刷格式。

### 4.3 视图类型清单与创建规则

| 视图类型 | 入口/关键输入 | 可创建自 | 不可创建自 | 关键选项/行为 |
|---|---|---|---|---|
| **Insert view（基视图）** | Insert view 工具栏；Select a part or assembly（Current workspace/Other documents、version/release） | 零件、曲面、装配、草图、曲线、复合零件、钣金平展 | — | 方向 Top/Left/Right/Front(默认)/Back/Bottom/Isometric/Named；View scale；View simplification；Show sketch appearances；装配 Explode/Position、Display state；`Show annotations from model` 默认勾选 |
| **Projected（投影）** | 快捷键 **p**；选现有视图后拖方向 | Base、Projected、Section、Aligned section、Auxiliary、含 broken-out 的视图 | Flat pattern、Detail | 保留源视图设置；破断剖的投影仍破断；Shift+click 放置带父视图切口；工具持续激活直到点图标关闭 |
| **Auxiliary（辅助）** | Normal（垂直线性边）/ In line（草图线或中心线）/ Axis（孔轴）；可选 label、reverse | Crop、基/投影/辅助/等轴测/剖/对齐剖中的线性边；In-line 辅助中的草图线/中心线；Flat pattern | Detail、Break | 引用指示器可拖动缩短/延长；middle snap 移动指示器；右键 Edit/Flip direction/Clear selection/Zoom to fit/Delete |
| **Section（剖视）** | Vertical/Horizontal/Angular；label；Show cut geometry only；Cut angle（Angular）+Opposite direction；Section depth Up to entity/Blind；Exclude from cut（装配）；Cut from section | Auxiliary、Break、Crop、Detail、基/等轴测/投影中的位置、Section/Aligned section、含 broken-out、Flat pattern | 与圆柱面相切的切割线 | 折线剖最多 4 点（角度剖）；拖动到另一侧翻转剖切方向；缩短剖切线可做 partial section；可改剖切线、翻转、Edit section、增删段 |
| **Aligned Section（对齐剖视）** | Center、Viewing plane location、Revolved plane location；Show cut geometry only；Exclude from cut | Auxiliary、Crop、Detail、基/等轴测/投影中的位置、Section/Aligned section、含 broken-out、Flat pattern | 与圆柱面相切的切割线 | 把不平行视图面的剖切部分旋转到视图面；从剖/对齐剖创建时 `Cut from section` 默认选中；放置时跨侧翻转箭头 |
| **Broken-Out Section（破断剖视）** | Spline 闭合轮廓（Spline point 加点）；End type Blind/Up to entity；Offset；Exclude from cut | Projected、Auxiliary、Break、Broken-out、Crop、含其它 broken-out 的视图 | Section、Detail、Aligned section | 深度点关联模型，更新失败样条红色；右键 Edit section/Remove section |
| **Detail（详图）** | Circle/Rectangle/Spline/Polygon 闭合区域；View scale；View label；Profile style In line/Connected/Leader；Show detail view profile；Clip border to geometry | Crop、Detail、基/投影/等轴测/辅助/剖/对齐剖中的位置、Flat pattern | —（表为空） | 自动标签；圈选可先 Esc 再点已有闭合区域；夹点缩放/移动；Add leader 移动 Detail 名称 |
| **Break（断裂视图）** | 水平/垂直；Zig zag/Small zig zag/Curve/Straight + gap；放两条断裂线 | Base、Projected、Auxiliary、Section、Aligned section、Isometric、Flat pattern | Detail | 与水平/垂直剖互操作；改一处断裂位置会改所有相关视图；角度剖与断裂互斥 |
| **Crop（裁剪视图）** | Circle（点圆心再点圆周）/Spline（双击闭合，可 Add spline point）/Polygon（双击闭合） | Projected、Auxiliary、Section、Aligned section、含 broken-out | Detail、Break、Flat pattern | Edit crop/Remove crop |
| **Flat pattern（钣金平展）** | 仅 Insert 对话框 | Insert view dialog | 任何视图（不能再由视图派生） | 显示折弯线、成形轮廓、成形中心标记、沉孔/沉头大径 |

**标准视图与投影**：标准 ANSI 图纸典型含 4 标准视图 top/front/right/isometric；first angle=ISO，third angle=ANSI；可在建图后用 Drawing Properties > Views 的 Projection angle 更改；同一零件的所有视图来自**同一版本**。

**View properties 字段**：Document、Workspace/Version、Type、Reference（链接）、View orientation（含 Named；已删除的 Named 视图灰显）、Scale（N:N，默认 Parent 或 Sheet）、Rotation angle（0–360，默认 0；仅无父/无子或已抑制对齐时可用）、Tangent edges（Hidden/Solid/Phantom）、View render mode（Best quality / Best performance，默认 Best performance；导出同样受影响）、View simplification（Auto 默认/Absolute/Ratio to studio/Ratio to part；child 继承可独立改）、Sheet、Name（格式 `<view perspective>-<part name>`，Shift+N 重命名）、View label（Projected/Aux 需手动勾选；Detail/Section 自动；可设前后缀）、Scale label、Show sketch appearances、Show annotations from model、Move to sheet、BOM table reference、Cut list table reference、Apply parent view section cut（从剖视投影时）；选择多个视图时不同值字段显示多值。

**旋转/对齐规则**：视图围绕视图矩形中心旋转（Detail 围绕圆），尺寸随之更新（垂直/水平线性尺寸保持垂直/水平；对齐/旋转线性尺寸保持对齐/旋转）；比例与标签移到视图下居中；Suppress alignment with parent 断开父对齐，但有子视图时仍不能旋转；Align views Vertically/Horizontally 按视图中心对齐。

### 4.4 View Context Menu（视图右键）

按组归纳：
- **Show/hide**：Show/Hide hidden lines（默认隐藏）；bend lines（平展默认显示）；bend notes（剖视中切平展）；shaded view（默认不显示；Decal 仅在 shaded 时可见；父子可独立）；threads（默认显示）；faulty parts（零件图默认显示、装配图默认隐藏，渲染影响性能）；part intersections（默认隐藏；装配 >20 零件显示异常时开启，可恢复被完全遗漏的零件）；offset cut lines（剖视）；Show/hide sketches（Part Studio 弹出 Show/hide sketches 多选，剖视可 Insert sketch；Assembly 需先插入草图，默认隐藏）；sketch points（默认显示）；Show/hide edges（弹窗中灰粗线标记隐藏，可逐边恢复）；centerlines（仅自动中心线，手绘不受影响）；auto centermarks（Hole 特征法向面自动、pattern/mirror 也自动，圆形/线性 pattern 显示连接线）；parts（Hidden parts 字段）；constraints（默认隐藏）；center of mass（需材料；尺寸可挂到指示器）。
- **方向与外观**：View orientation（Top/Left/Right/Front/Back/Bottom/Isometric；当前项灰显）；Tangent edges（Hidden/Solid 默认/Phantom）；Adjust linestyle（逐边选，设 Linestyle、Dashes、Thickness、Color）。
- **格式与层级**：Insert custom table；View properties；Order（Bring to front/Send to back）；Align views（Vertically/Horizontally）；Rotate view vertically/horizontally（按选定直边）。
- **导航/复制**：Switch to…（回到来源 Part Studio/Assembly）；Move to sheet；Copy/Paste；Paste as table（Excel/Google 单元格粘贴成表）；Group/Remove view from group（如 hatch 与视图组合，组合后一起移动）。
- **注释复制**：Select for replication > View（复制全部注释）或 Region（弹 Replicate region，调矩形后 Enter/勾选）；在目标视图右键 Replicate annotations，View 直接粘贴、Region 则放矩形；成功数在图形区顶部通知；视图无需链接；Annotation 不能从源视图复制。
- **额外**：Edit [view]（broken-out/crop/detail/aux；对剖/详图/裁剪改矩形/圆/样条/多边形，辅助可改标签/边/翻转/视图面可见性）；Display state（父默认 show all、子默认 follow parent；Section/Detail 只能 follow parent；新建 display state 后需更新图纸，删除后更新报 `Failed to resolve exploded view` 且视图空白、菜单项消失）；Explode/Position（新建爆炸后需更新；删除后同样报错；Exploded tree 的 rollback bar 不影响图纸，图纸反映全部爆炸步骤）；Suppress alignment with parent；Remove section/Remove crop（保留样条/圆/多边形作参考，可再删边界）；Edit Hatch section/Edit Hatch region（已有则开 Edit hatch：hatch type ANSI/ISO/General、pattern、scale、angle、color）；Grouping notes with a view；Clear selection；Zoom to fit；Delete。

### 4.5 尺寸工具行为（横向归纳）

| 工具 | 快捷键 | 选择输入 | 行为/结果 | 边界/备注 |
|---|---|---|---|---|
| **Dimension（智能）** | d | 第一个高亮实体（circle、arc、circle center、line、centermark、point、thread），再第二个 | 按曲线组合自动决定尺寸类型；放置后拖夹点编辑 | 圆件同边线性自动加 Ø（仅 projected 视图）；Line-to-line 也可加 Ø（projected 与 section 均可）；同心圆/弧自动量壁厚 |
| **Chamfer Dimension** | — | 倒角边 + 相邻边 | 生成 Note 或 Dimension | 样式在 Properties > Dimensions > Chamfer；可加前缀 |
| **Maximum/Minimum** | Ctrl+m | 一个弧/圆 + 任意其它几何（不含 curves） | 点击位置决定最大或最小距离 | — |
| **2 Point Linear** | — | 两个点（不能选线） | 水平/垂直/旋转线性 | 螺纹需 Show hidden lines |
| **Point to Line** | — | 一点 + 一线 | 点到线线性 | 螺纹同理 |
| **Line to Line** | — | 两条平行线 | 线间线性 | 只高亮平行线 |
| **Line to Line Angular** | — | 两条线 | 内角/外角 | 拖弧上夹点跨无限延长线切换补角/对顶；可量共轭/反射与补角 |
| **3 Point Angular** | — | 顶点 + 两腿点 | 角度 | 夹点由初始角切到外角（360−初始） |
| **Arc Length** | — | 一条弧 | 弧长 | 反向拖动得共轭/反射 |
| **Radial** | Shift+r | 圆/弧/弧形中心标记 | 半径 | 可 Foreshorten/Remove foreshorten；遮挡圆用引导线 |
| **Diameter** | Shift+d | 圆/弧/中心标记（含 silhouette edges） | 直径（自动 Ø） | Detail/Crop 视图自动 foreshortened |
| **Foreshorten** | Shift+h | 圆柱轮廓边，或中心线+弧/圆边 | 半直径尺寸（一条延伸线一个箭头） | `Display as direct diameter`/`Display as foreshorten diameter` 互转；夹点翻转；可 snap 到边 Min/Max |
| **Ordinate** | — | 基准点（边/线/弧/中心标记/手放中心标记）后按方向点选 | X/Y 坐标组 | 组移动同步；外夹点单条；Add to group/Reset ordinates；ANSI/ISO；特征删除后红色可删；可对齐折点 |
| **Hole/Thread Callout** | — | 孔特征圆或外螺纹 | 孔/螺纹标注（自动元数据） | 同尺寸多 leader；Count type；逐参数 Override precision/tolerance；Fit 类型/孔轴类/标准；pattern 时 Count by face 不可用 |

**捕捉点体系**：方形=end points，三角形=midpoints，菱形=quad points，圆形=arc/circle center（可拖到 quadrant）；尺寸标注时 midpoints/quad points 默认禁用（Shift+q 临时开）；尺寸**不捕捉 midpoints**（Drawing Basics 明确），但 Callout 可捕捉 point/midpoint/line；2 点线性只选点。推理线为细虚线/红线，点击即对齐；**Shift 可关闭 callout/dimension 推理**。

**尺寸调色板字段**：Above text、Prefix text、Count type、Precision（0–8 位；可选 “(Drawing)” 与 Properties 面板联动）、Dimension units（主单位列表；选定覆盖该尺寸；可改回 (Drawing) 继承）、Show/Hide units、Suffix text、Below text、Symbol 下拉（°、⌀、℄、⌵、↧、⌴、□、⌒、±、Ⓤ、Ⓘ、continuous feature、spot face、▷ translation）、Inspection dimension（椭圆框）、Dual dimension、Tolerance（None/Symmetrical/Deviation/Limits/Basic/MIN/MAX/Fit/Fit with tolerance/Fit (Tolerance only)）、上下公差、+/− 同号按钮、Fit type/Shaft class/Hole class/Fit standard、Fit tolerance precision 0–8、Reset text position、Parentheses、Hole class visibility（stacked without line/diagonally/with line）、Radius/Diameter 切换；文字框支持复制粘贴。

**文字放置**：拖远上下→水平尺寸线；拖向侧→垂直；垂直两点连线方向→平行于两点；水平/垂直投影捕捉与粉色推理线；拖动文字可翻转箭头；圆形边 hover 唤起中心标记（橙色圆捕捉点后保留十字标记）。

**尺寸上下文菜单**：Edit（开调色板）、Paste、Clear selection、Zoom to fit、Delete；断线相关 `Break dimension`/`Unbreak dimension`（相交线只能断一条）。

**排错**：Dangling（红色、拖夹点重关联）；Overridden（手改值→下划线、非关联，可仍在面板改其它字段，清空值退出即恢复关联）；下划线=不按比例。

### 4.6 Datum / GD&T / 符号

- **Datum**：Label 自动字母可改；点视图边拖出 datum line；可挂几何公差四边（红色十字）；Styling：Font/Text height/Color/Datum size；可拖近/远、放在尺寸引线/线性尺寸延伸线上，遮挡的箭头/线自动隐藏；可与 callout 组组；Datum series 选中时目标与面蓝色、其它黄色。
- **Datum Target**：Target area = Point (X)、Point (dot)、Circle、Rectangle、Custom；Style 选 callout；Area size（X/dot：直径；Circle：直径；Rectangle：边长；Custom 不可改）；精度下拉；标签自增（同字母 A1/A2/A3；新字母 B1/C1…）；Origin 两种：Length（点原点，X/Y 位置 + 精度 + X/Y 箭头翻转）或 Angle（原点在圆心/弧心，Diameter distance 取半径落点，角度自水平，可选 Radial lines、Reference line、Flip/Rotate、Instance 等距 360°、Opposite direction 逆时针）；可隐藏/显示 target 尺寸（Hide dimension；Show dimensions → This target/All targets）。
- **Geometric Tolerance**：
  - 附着对象：边、孔、尺寸（带/不带引线）、尺寸延伸线、延伸线、表面区域、无引线空白。
  - 文字字段：Upper text 最多 50 字符、Lower 最多 200、Prefix/Suffix 各 20。
  - 公差框：Symbol 14 种 — Position、Concentricity、Symmetry、Parallelism、Perpendicularity、Angularity、Cylindricity、Flatness、Roundness、Straightness、Profile (Surface)、Profile (Line)、Circular runout、Total runout；Tolerance 值左右各可插最多 7 个符号；Datums 最多 3 个字段（须以大写字母开头，可加符号与连字符）。
  - 多行：Add frame 最多再加 5 行；最下行符号可设 Composite；右键行可 Move up/down/Remove（仅附加行）。
  - Leader：Leader / All around / All over；可 Add leader 多引线、水平段可拖节点；拖到边无引线即“贴边”；沿延伸线/表面区域放置。
  - 吸附/分组：放/拖到尺寸上即吸附并随动；拖离即脱离；可与 dimension+grouped callout 组一起移动，也可只拖 GT 单独移出组（仍属组）。
  - 编辑/样式/节点：双击或右键 Edit；Styles Font/Text height/Color/Arrowhead；Add node/Remove node/Add leader。
  - 上下文菜单：Edit、Paste、Copy、Paste as table、Add leader、Remove leaders、Move to（Border frame/Border zones/Title block，应用该层格式）、Clear selection、Zoom to fit、Delete。
  - 符号表：14 特征 + Square（form）+ Leader/All around/All over + Diameter/Spherical diameter/Radius/Spherical radius/Controlled radius + MMC/LMC/RFS/Free state(F)/Tangent plane(T)/Unequally disposed profile/Projected tolerance zone/Statistical tolerance/Continuous feature/Spot face/Translation。
- **Surface Finish**：Type = Basic、Material removal required、Material removal prohibited、ISO Basic、ISO material removal required、ISO material removal prohibited；All around、Parenthesis、Direction lay；单元格填写；最多 5 个附加行；可放空白/圆视图边/零件面区域；可关联尺寸延伸线；Add leader/节点；Styles；右键 Edit/Copy/Add leader/Remove leaders/Move to/Delete。
- **Weld Symbol**：图纸标准决定对话框版本；Joint spacer（Double V/Double bevel/Double U/Double J/Double flare V/Double flare bevel）或 Joint types（Square/V/U/J/Bevel/Single bevel butt broad root/V flare/Bevel flare/Bead/Fillet/Plug or Slot/Seam/Spot/Seam centered/Spot centered）；Stagger（ANSI/ISO 全部接头，Symmetric 或上下同接头时可用）；Symmetric（不支持 ANSI joint spacers）；Second fillet（部分接头）；Reference 文本框；All around；field flag；多引线/节点。
- **Edge Condition**：Direction = Undefined/Vertical/Horizontal/Asymmetric；数量/备注；两个偏差默认 None，可 +/−/± + 值；All around/Parentheses/Limited length edge；点顶点或边再点放符号；右键含 Edit/Copy/Paste/Paste as table/Add leader/Remove leaders/Move to/Add comment/Clear selection/Zoom to fit/Delete。
- **Note**：n；无引线可旋转（对齐 note 旋转会脱离对齐边）、有引线不可；列表项 flag（默认 2 Characters，可选类型）；Explode 导出为多段线；Flip（仅对齐边）；Unicode `\U+00AE`；`%%d` 度、`%%c` 直径、`%%p` 正负；文本格式：插入行距 1.0/1.5/2.0/2.5/3.0、段前/段后、水平对齐（带引线时禁用）、列表、垂直对齐（带引线时禁用）、Note order、分数 `#`/`/`/`^`、符号、Insert drawing property（created by/date、description、last changed by/date、name、part number、revision、Title 1–3、Sheet number、Total sheets、Sheet scale、Sheet size）、Insert sheet reference property（Name/Description/Part Number/Revision/State/Vendor/Project/Product Line/Title 1–3/Material/Mass）、Text format（uppercase/lowercase/sentence/title/unmodified）、Date time format（19 种编码）；标尺制表位 Left/Center/Right/Decimal、首行/左/右缩进、边界框宽度；字体可用 SHX 或 TrueType；Bold/Italic/Underline 仅 TrueType；标题栏字段双击编辑，蓝色替换，UTC 日期。
- **Callout (Balloon)**：带引线（可放 faces、centermarks、手放 centermarks、线性/角度尺寸）或不带；面用实心圆；对话框自左至右：Part property、BOM table property、Instance property（Reference designator）、Flag note property、Cut list table property、上/下/左/右文本、插入符号、Text height、Border shape、Border size；对齐 Align horizontally/vertically；分组 Group annotation/Remove；复制粘贴；Move to；删除尺寸会连带删除其 callout；BOM 存在时自动取 Item No；`Add stacked callouts`（仅带 BOM 的装配）：点实例或 `Add instances from BOM` 黄条选 BOM 首列，Done，绿勾；堆叠 callout 可再分组。

### 4.7 表格

**通用 Table**：行列数、Title row（跨全列）、Header row（Title 下额外行）、固定角（默认右上）；Note 面板编辑；Tab/Enter 下一格、Shift+Tab 上一格、Alt+Enter 格内换行；双击单元格开 Note 面板；复制到 Excel/Google Sheets（Chrome/Firefox/Edge，Safari 不支持）；从 Excel/Google 粘贴为表：merged cells 保留，文字大小、粗/斜/下划线/删除线、单元格宽高保留，背景/文字色/超链接不保留，部分文字有装饰则整格不带装饰，粘贴后居中；不能粘贴到已有表；剪贴板内容只能用一次；Duplicate Rows/Columns；grab points 缩放/移动、双击中点自动适配、双击分隔线按内容调宽、Size > Columns/Rows equally、Resize 对话框；Cell formatting panel（Insert row above/below、column left/right、Remove rows/columns、Duplicate、Size columns/rows equally、Merge/Unmerge）；表格属性改固定角。

**BOM Table**：来源=当前文档 Onshape BOM/Other documents/上传文件/BOM app；模板（企业管理员）；类型 Flattened（无层级）、Structured-Top level（一层）、Structured-Multi-level（全部层级，编号如 1.1/1.2、2.1/2.2）；Order Top to Bottom/Bottom to Top；Release 过滤器；固定角；hover 行→callout 蓝色+所有视图几何高亮；右键整表：BOM table properties、Split BOM table below（再 Move to sheet）、Copy、Move to（Border frame/Border zones/Title block/Drawing）、Bring to front/Send to back、Switch to <tab>、Move to sheet、Clear selection、Zoom to fit、Delete；单元格 Shift+click 多选、行/列首末点选；Cell formatting 中 Override（需 Part Number 已分配，覆盖后黑三角+tooltip；多选时不显示内容/复选框）；Sheets 面板右键 Replace→Insert 对话框选装配→BOM 及其关联视图替换；BOM properties：BOM type、Order、Template、固定角、Reference 链接。

**Cut List Table**：需 Part Studio 已用 Cut list 工具创建复合零件切清单；Insert 选择；右键：Cut list table properties、Split cut list（可多次，Unsplit cut list table 撤销）、Change configuration（只改表不改视图）、Copy、Move to、层级、Move to sheet、Delete；属性：Sheet、Order、固定角。

**Hole Table**：仅“单一零件”的视图可选中（整 Part Studio 不行）；字段：显示位置坐标（勾选）、位置坐标精度、Views（可多选）、原点、X/Y 轴（点边）、排除孔、排序（top to bottom/bottom to top）、固定角；孔视图右键：Hole table properties、Flip X direction、Flip Y direction、Clear selection、Zoom to fit；表右键：Hole table properties、Split hole table above/below、Move to、层级、Move to sheet、Delete；属性：显示位置坐标、collapse tags、所选视图、标签顺序、固定角。

**Custom Table**：两组成部分=Feature Studio 自定义表定义 + Part Studio 数据；适用于整个 Part Studio；插入：Custom table 图标 → Add Part Studio（可不在图中）→ Insert 选表 → Order → 固定角；属性：Document、Workspace、Custom table（链接打开 Part Studio）、Feature Studio（链接+版本）、Sheet、Order、固定角。

**Revision Table**：Release management 必须启用；Multi-sheet = Linked（所有页完整表）或 See sheet 1（本页完整、其它页小表 See sheet 1）；Visible rows；Order（Top to bottom=最新在下；Bottom to top=最新在上）；`Hide revision callouts no longer shown in the table`；固定角；pending 修订行蓝色、Revision 标签小三角；Professional/Educator/Enterprise 由 Release management 的 Revision table template 决定格式；UTC 日期；双击待发布行编辑 Revision description（发布后进 Release properties/Revision history）；已发布描述仅 Administrator 可改；Add revision callout（右键空白或表行；B* 的 * 后缀可在 Release management > Revisions and Part numbers 定制）；Hide/Show revision callouts；callout 可拖到尺寸上成组；默认属性在 Properties > Tables。

**Inspection table**（Inspection Item 页）：右侧 Inspection table 图标；列出所有 datums 与 inspection items（含 MBD 带入数据与默认公差）；View 下拉 All sheets/Current sheet；hover 交叉高亮蓝色；三点菜单 Export to CSV；右键 Item 空单元格 `Assign number`；Remove inspection item/Remove all；双击编号修改；模板编辑在企业设置 Preferences > Inspection table（Name、Add column、隐藏列、拖序、Save changes）；CSV 列：**Inspection item number、Sheet number、Annotation type、Unit、Nominal value、Tolerance、Upper limit、Lower limit**；仅已分配编号可导出（否则仅表头）；须有 Export rule。

### 4.8 绘图草图、构造工具、约束、DXF/图片、Format Painter、检验

- **绘图草图工具**：Line（L；每段是独立实体）、Center point circle（c）、3 point circle、Tangent arc、Corner rectangle（g）、Center point rectangle（r）、Spline（双击/Esc 结束，可拖点整形）、Spline point、Sketch point、Trim（m；修剪到首个交点/边界，无交点整条删除；点也可删）、Hatch region（标准 ANSI/ISO/General；Pattern；Scale Auto 或 1.0–10.0 整数；Angle Auto 或 0–180° 每 15°；Color 默认随 Drawing properties，取消可自定义且接受后才可见；对话框底部预览；创建时 spinner，Esc 取消；Edit hatch/Delete）。Hatch 可应用表：Projected ✓、Auxiliary ✓、Section ✓*、Aligned section ✓*、Broken out ✓*（*自动应用）、Detail ✗、Break ✗、Crop ✓。草图可输入负值翻转方向。
- **绘图构造工具**：2 point centerline；Edge-to-edge centerline（单个圆柱/圆锥轮廓边，或 Shift 选两边/同心弧）；拖端点改长度、拖捕捉点移动；3 point circle centerline（螺栓圆，选 3 个孔中心/端点/中点/四分点）；2 point circle centerline（圆心+圆周点）；Centermark = Single/Circular/Linear，Circular 可显示 Reference center/Bolt circle/Radial lines/Pattern centermark，Linear 显示 Connecting lines；右键 Align centermark；可加在非正对视图的圆/椭圆面；Virtual sharp（两线性边交点，尺寸量到十字交点；样式 Centermark/Edge extension）。
- **绘图约束**：Horizontal、Vertical、Coincident、Perpendicular、Parallel、Tangent；既可先选命令再选实体，也可先选实体再点约束；仅 drawing sketch tools（构造工具不可）；hover 约束黄色背景、引用实体橙色；不可解约束红色；点击图标 Delete 或右键 Delete；hover 只显示当前实体约束，Shift 保持全部；视图右键 Show/hide > Show constraints/Hide constraints。
- **Insert DXF/DWG**：模型空间内容，仅线框（lines/arcs/polylines 等）与 notes；无 3D；颜色移除，使用图层色/默认色；背景色在 My account > Preferences > Drawings 选 Dark/Light；块全炸开、多段线全炸开；简单注释转可编辑 Note；可从 Other documents 复制文件；Move to 三层。
- **Insert Image**：JPG/PNG/GIF；拖放定位、保持纵横比；默认无边框（Show/Hide image borders）；右键 Properties 可换 Sheet、看引用；Open linked document；删除 Images 标签后下次更新图像消失；Documents 页导入的图像为非链接，删源不影响图。
- **Format Painter**：勾选 Paste style、Paste tolerance and precision、Paste content；先选源再选目标；只支持默认/图纸属性/Styles 面板格式，Note 对话框内样式不算；注释与尺寸互刷只刷共有样式。
- **Inspection Item**：Manual（悬停注释/标注点击放置）或 Automatic（Scope 整个 drawing/当前 sheet/指定 view；Preview）；自动适用于 dimensions、ordinate dimensions、weld、surface finish、GT、callouts，不适用于 basic/reference dimensions；不适用于 datums；双尺寸只标主尺寸；标题栏区域也可加；右键 Edit/Reorder inspection items/Remove inspection item/Remove all/Clear selection/Zoom to fit/Delete；已发布图重用编号会警告（可继续或换号，编号自增续点）；Hide inspection items 一键隐藏/显示。

### 4.9 更新、悬空、导入/导出/打印

- **Updating a Drawing**：Update 图标黄色=有变更、灰色=无；Ctrl+q；更新**只更新 drawing views**，不检查其它文档链接；更新后可刷新浏览器；可能会产生红色 dangling；Version 文档可冻结（Update 不再高亮）并可标记 Released；引用 version/revision 打开更快；Drawing 标签右键 `Change to version`；若放新视图时图纸已过期会**自动更新**。
- **Dangling entities**：丢失参考点；红色夹点指出丢失点；拖红夹点到新参考点修复。
- **Importing**：Documents 页导入→新文档（文件名作文档名）；文档内 “+” → Import → 新文件标签+Drawing 标签；自动翻译；DWG/DXF 背景色偏好。
- **Exporting**：格式 PDF/DWG/DXF/DWT/SVG/PNG/JPEG/CSV；Drawing 标签右键 Export；标签管理器 Ctrl+click 多选 → `Export drawings`（批量 zip）；字段：File name、Format、Version、Sheets（All/Custom 范围或页号）、Overridden dimensions（显示/隐藏下划线）、Text（PDF：Normal/Selectable；DWG/DXF/DWT：Export as text / Explode into polylines (notes) / Explode all into polylines）、Color（color/black and white/grayscale）、Units（DWG/DXF：drawing units 或其它）、Options（Apply export rules to contents + View export rules 链接；Export splines as polylines（除 PDF）；Set z-height to zero and normals to positive（DWG/DWT/DXF）；Hide inspection items；Exclude off-sheet content（DWG/DWT/DXF））；导出准备/完成通知；DWG 输出为简化、兼容多数 DWG 阅读器；strike-through 文本须选 Version 2013；自定义纸最大 1800 in×1800 in；iOS/Android 支持 DXF/DWG/DWT/PDF（overflow 菜单 → Export）。
- **Printing**：Document 菜单（左上）→ Print… → 新打印友好标签页 → 底部控件打印/保存。

## 5. 工作流、规则与错误状态

### 5.1 端到端工作流

1. **建图**：零件/曲面/子装配右键 → Create drawing → 选模板（标准/尺寸/单位/投影/边框/分区/标题栏）→ Suggested views 或空图 → OK。若带 MBD，视图中显示 MBD 注释，缺失项进 MBD Status。
2. **图幅与格式**：Sheets 面板建页/复制/换 DWT；Sheet properties 设比例/纸幅/分区/起始角；Drawing Properties 设单位精度、尺寸/注释/视图/构造几何/格式/表格/检验默认；Styles 做局部覆盖。
3. **视图**：Insert view（来源/版本/方向/比例/简化/MBD 注释）→ 按视图类型链式派生（Projected/Auxiliary/Section/Aligned/Broken-out/Detail/Break/Crop/Flat pattern）；View Context Menu 控制显示、方向、层级、复制与更新。
4. **标注**：尺寸工具（智能/各专用）→ 放置/文字定位/调色板调精度公差单位 → GD&T/Datum/Surface/Weld/Edge condition/Note/Callout；BOM/Cut list/Hole/Custom/Revision/Table 表格与 Inspection items；Format painter 批量刷格式。
5. **更新**：零件/装配变化 → Update（Ctrl+q）→ 检查红色 dangling → 修参考；必要时 Version/Change to version 冻结；发布管理产生修订 → Revision table 自动更新与 callout。
6. **输出**：Export（PDF/DWG/DXF/DWT/SVG/PNG/JPEG/CSV，含 Inspection/Definition list）→ 本地打印或 Document 菜单 Print。

### 5.2 文档写明的规则与依赖

- **同一零件的所有视图来自同一版本**；新建视图（drawing/projected/auxiliary/section）沿用现有视图的零件版本。
- **视图比例**默认 Parent；投影视图比例强制 Parent；用户输入分母恒为 1；旋转角 0–360，非 0 时无法重连父对齐，有子视图时不能旋转。
- **子视图继承**：Insert view defaults、Show annotations from model、视图简化；子可单独改简化；Detail/Section 只能 follow parent 的 display state。
- **跨页**：移动视图时其 labels/dimensions 随动；移动辅助视图不带父视图，移动父视图不带辅助视图；链接视图跨页时图标带箭头，更新引用会更新所有链接视图，无法 unlink。
- **复制限制**：视图不能跨 workspace 复制（可跨 sheet/同 workspace 的 drawing）；跨 workspace 复制 sheet 必须来自 version。
- **MBD 规则**：数据单位转换为图纸单位（含 welds/surface finishes/GDT）；自动防重复标注（top/right/front、父先于子、手动插入顺序）；composite parts 支持；缺失数据进 MBD Status 的 Datums/Characteristics。
- **标注关联**：Callout/GT/Datum/Surface/Weld 可分组（Group annotation），可挂尺寸/引线/延伸线/表面区域/中心标记；移动视图带动组内注释，移动注释不带视图；Shift+drag 只动单个（视图参与选择时无效）。
- **表格**：固定角默认右上；表格可 Move to 三层或跨页；BOM/Cut list 行 hover 交叉高亮；Override 需 Part Number；BOM 顺序变化需 Update Drawing 以更新 callout。
- **更新**：Update 只改视图；Version 冻结；引用 version/revision 性能显著更好；新视图放置时若过期会自动更新。
- **导出**：Drawing 层不导出 DWT；标题栏/边框/分区导出到专用层；导出注释可 Explode 为多段线；PDF 可选可选文本；DWG/DXF 可选单位与 z-height/法向。

### 5.3 常见错误/失败状态

| 状态 | 触发 | 处理 |
|---|---|---|
| 红色 Dangling 实体/尺寸/样条 | 更新后参考点丢失 | 拖红夹点到新参考；broken-out 重定义深度点 |
| Overridden dimension（下划线） | 手改尺寸值 | 清空值退出恢复关联；下划线表示不按比例 |
| 红色约束 | 约束使草图不可解 | 删约束或改约束 |
| `Failed to resolve exploded view` | 装配中删除被引用的 explode view | 更新后视图空、菜单项消失；需修复装配 |
| 视图为空但保留 | 删除被引用 display state | 同上 |
| 引用/链接视图更新 | 指针 | 更新链接视图引用会更新所有链接视图；不能 unlink |
| 检验编号复用警告 | 已发布图 reorder | 可继续或换号（编号自增） |
| 表格粘贴失败 | 目标为已有表 / Safari 复制 / Firefox 菜单粘贴 | 新建表；用 Ctrl+V；Safari 不支持复制到 Excel |
| 图纸不同时编辑 | 他人已激活元素 | 提示当前编辑者；需等待 |
| OLE/模板 | 标题栏“----” | 打印会显示破折号；删除该 note 或填属性 |

## 6. 与其他章节的关系

本章大量依赖/引用组外主题（据正文链接文本）：
- **Part Studio / 建模**：Hole feature（中心标记自动）、pattern（circular/linear）与 mirror（中心标记连接线）、Sketch（Part Studio sketches 展示）、Sheet metal 与 Flat pattern、Frame 与 Cut list（复合零件切割清单）、Feature Studio/FeatureScript（Custom table）、Part Studio hole table。
- **Assembly**：Instances list、exploded view/named position、display state、Subassembly BOM behavior、Assembly 草图与 sketches、材质（Center of mass）。
- **数据管理**：Documents 页、Tab manager（批量导出）、Versions and history、Version graph、Create version、Workspace/Version/Revision、Release management（Revision table、Release candidate、release properties/revision history）、Tasks（Create task）。
- **账户/组织**：My Account Settings/Preferences（Drawings 背景色、Export rules）、Company/Enterprise properties（Drawing Properties 灰显字段）、Inspection table template、管理员编辑用户/已发布描述、Manage Companies > Properties。
- **MBD**：Model-Based Definition 总主题、Default Tolerances Library、MBD Inspection table、MBD Status。
- **其他 Help 主题**：Dimensions 总览、Centermark、Copying a view、Grouping notes、Flat pattern views、Sheet Metal Table and Flat View and Form、Importing/Exporting a Drawing、Drawing template best practices（Learning Center，需账号）、Detailed Drawings / Introduction to 2D Drawings 课程（需账号）。
- **上游/下游链**：Part Studio → Assemblies → Drawing（视图引用与 MBD）→ Release → Revision table → Export/Print。Drawing 依赖 Part Studio/Assembly 的版本、配置、显示状态、爆炸、MBD；Release 依赖 Drawing tab；Inspection table 是 Drawing 与质量/发布数据的桥。

## 7. 对 LubanCAD 的可执行启示

> 仅写文档可支撑的结论；`[文档明确]` 表示原文直接写出，`[推断]` 表示由文档行为合理推导、需在 AIRR/ADR 中确认。

### 7.1 需要补齐的 UI 表面

1. **Drawing 标签与图纸空间**：Drawing tab 右键菜单（Delete/Open in new tab/Rename/Properties/Duplicate/Copy to clipboard/Change to version/Select as document thumbnail/Update linked document/Move to document/Export/Release/Revision history/Create task）`[文档明确]`；Drawing 层/标题栏/边框/分区四层模型与锁定 `[文档明确]`。
2. **Sheets 面板**：Create/Duplicate/Copy/Paste/Delete/Move up/down/Rename（Shift+N）、Sort by reference/Sort by sheet、Pin/Unpin view reference、Reference manager（Update all/Selective update/Update selected）、逐页 DWT 替换、标题栏属性自动映射 `[文档明确]`。
3. **Drawing Properties 8 页签**：Units and Precision、Dimensions、Annotations、Views、Construction Geometry、Formats、Tables、Inspection，含 Update properties from a template 与 Lock drawing properties `[文档明确]`。
4. **Styles 面板**：尺寸/注释/剖面线/草图几何四类局部覆盖，Revert to drawing properties，混合选择只显示共有项 `[文档明确]`；Format painter 三选项 `[文档明确]`。
5. **视图工具栏与 View Context Menu**：至少 9 种派生视图入口 + Insert view；右键 Show/hide 全系列、View orientation、Tangent edges、Adjust linestyle、Order、Align/Rotate、Copy/Paste/Paste as table、Select for replication/Replicate annotations、Display state/Explode-Position、Suppress alignment、Remove section/crop、Edit hatch `[文档明确]`。
6. **尺寸工具带**：智能 Dimension + 11 个专用工具（Chamfer、Max/Min、2 Point、Point-Line、Line-Line、Line-Line Angular、3-Point Angular、Arc Length、Radial、Diameter、Foreshorten、Ordinate、Hole/Thread Callout）与 Dimension palette `[文档明确]`；捕捉点/推理线/Shift+q/Shift 关闭推理 `[文档明确]`。
7. **注释与符号工具**：Datum（含 Datum Target）、Geometric Tolerance、Surface Finish、Weld Symbol、Edge Condition、Note、Callout (Balloon)；Styles 面板与右键菜单（Add leader/Remove leaders/Move to/Add node/Remove node）`[文档明确]`。
8. **表格体系**：通用 Table、BOM、Cut List、Hole、Custom、Revision、Inspection table；单元格格式化面板、固定角、拆分/合并、Override、CSV 导出 `[文档明确]`。
9. **MBD Status 与 Inspection**：右侧 MBD Status 面板（Deferred/Current sheet/All Models/Part、Datums/Characteristics、badge/checkmark、Show 恢复）`[文档明确]`；Inspection item 手动/自动与 Inspection table `[文档明确]`。
10. **更新/导入导出/打印**：Update 图标黄/灰、Ctrl+q、Dangling 红色夹点；Import DWG/DXF/图片；Export 对话框全套选项；Print 菜单 `[文档明确]`。

### 7.2 参数与默认值清单（可直接做配置模型）

- 模板：Standard ANSI/ISO/JIS；ANSI=third angle + inch/mm；ISO=first angle + mm；Units 默认按标准；Feet and inches 仅 Drawing；Decimal separator 按标准；Horizontal/Vertical zones；Start zones bottom right/top left；Border/Titleblock 可关；Suggested views 或空图 `[文档明确]`。
- 视图：默认方向 **Front**；比例默认 **Parent**；旋转角 **0°**；Tangent edges 默认 **Solid**；View render mode 默认 **Best performance**；View simplification 默认 **Auto**（None/Absolute/Ratio to studio/Ratio to part）；Show annotations from model 默认勾选；Scale label 默认关；Insert view 默认标签/比例关 `[文档明确]`。
- 尺寸：Arrowhead 长度范围 **0.004–393.7 in**；箭头类型 6 种；Break dimension by default 勾选；Show dimension lines：ISO 默认勾、ANSI 默认不勾；倒角 45° 内容含 C Length；坐标 ANSI/ISO 随模板；精度 0–6 位（Properties）/0–8 位（调色板）；分数精度 0–1/256 `[文档明确]`。
- 表格：固定角默认 **upper right**；Horizontal/Vertical padding 默认 **0.06 in**；Hatch scale Auto 或 1.0–10.0 整数；Hatch angle Auto 或 0–180° 步进 15°；Style 面板 Pitch scale 0.01–5.00；Note flag 默认 **2 Characters** `[文档明确]`。
- Sheet 自定义纸幅上限 **1800 in × 1800 in**；DWT 版本 2013；Revision Multi-sheet 默认逻辑 Linked/See sheet 1 需产品定默认 `[文档明确/推断]`。
- GD&T：Upper 50 字符、Lower 200、Prefix/Suffix 20、Tolerance 左右各 7 符号、Datums 3 字段、最多 5 行附加约束 `[文档明确]`。

### 7.3 交互与选择规则（可写成测试断言）

- 尺寸捕捉：方形=端点、三角=中点、菱形=四分点、圆=圆心；尺寸标注默认禁中点/四分点，Shift+q 临时开；2 点线性不能选线；线到线只高亮平行线 `[文档明确]`。
- Callout/Dimension 推理：创建/放置前自动推理，按住 Shift 关闭；尺寸不吸附中点；推理线对齐需点击才生效 `[文档明确]`。
- 复制：Alt+drag 复制注释类实体；视图 Ctrl+C/Ctrl+V 或 Alt+drag 复制；视图复制不能跨 workspace `[文档明确]`。
- 分组：Group annotation / Group（视图）；移动视图带动组内注释，移动注释不带视图；Shift+drag 单动（视图参与选择时无效）`[文档明确]`。
- 视图链：移动父视图不带辅助/子视图；子视图不随父跨页；链接视图更新引用同步所有链接视图；无法 unlink `[文档明确]`。
- 表格/单元格：Tab/Enter 下一格、Shift+Tab 上一格、Alt+Enter 格内换行；Shift+click 多选；双击分隔线按内容调宽；双击中点自动适配 `[文档明确]`。
- 悬空修复：红色夹点即丢失参考点，拖到新参考点重关联 `[文档明确]`。
- 尺寸值手改 → Overridden（下划线、非关联）；清空恢复关联 `[文档明确]`。

### 7.4 事务、撤销、版本、权限、协作约束

- **撤销**：删除 Sheet 可用 Undo 或 workspace 时间点恢复；文档明确提到 `Undo` 与“恢复 workspace”是 Sheet 删除的回退路径 `[文档明确]`；其余标注/表格操作未见专门 undo 说明 `[文档未说明]`。
- **版本/修订**：`Change to version` 切换图纸引用版本；Version 冻结后 Update 不高亮；引用 version/revision 时打开性能显著更快；Pin view reference 阻止更新；跨 workspace 复制 sheet 必须来自 version `[文档明确]`。
- **权限**：已发布 Revision 描述仅 Onshape Administrator 可改；管理员可覆盖用户 Documentation name；Drawing Properties 灰显字段由 Company properties 管理；企业管理员可提供 BOM/Revision table 模板与 Inspection table 模板 `[文档明确]`。
- **协作**：图纸元素不支持同时编辑；他人已激活会显示当前编辑者 `[文档明确]`。
- **发布**：Revision table 依赖 Release management；Release candidate 可从 Drawing 标签右键创建；revision pending 行蓝色/小三角；revision callout 标变更 `[文档明确]`。
- **更新语义**：Update 只更新视图，不检查其它文档链接；新视图放置时若过期自动更新 `[文档明确]`。

### 7.5 建议的验收测试断言（从文档可验证点）

1. 建图：从零件右键建图 → Suggested views 生成 4/最多 6 个视图；MBD 缺失项出现在 MBD Status 的 Datums/Characteristics；`No views` 生成空图 `[文档明确]`。
2. 模板：导出 DWT 只含前两页、无视图、版本 2013；三层（Title block/Border frame/Border zones）导出层名正确；Drawing 层不导出 `[文档明确]`。
3. 视图：投影视图可来自剖/对齐剖/辅助/破断剖；不能来自平展/详图；Section 可做剖中剖（Cut from section）；角度剖与 Break 互斥；Flat pattern 只能 Insert 对话框插入 `[文档明确]`。
4. 视图属性：比例 N:N 分母为 1；旋转角 0–360 且非 0 时禁止重连父对齐；有子视图时禁止旋转；Detail/Section 仅 follow parent display state `[文档明确]`。
5. 尺寸：2 点线性选线应被拒绝；线线尺寸只高亮平行线；Max/Min 不含 curve；Foreshorten 可在 direct/foreshorten 间转换；Overridden 尺寸文本带下划线且清空值恢复关联 `[文档明确]`。
6. GD&T：14 特征符号齐全；Datums 最多 3；Add frame 最多 5；Composite 选项出现在后续帧；Leader 三型；GT 拖到尺寸上吸附、拖离解除 `[文档明确]`。
7. 表格：固定角默认右上；BOM 三种类型与两种排序；Hole table 在“整 Part Studio”图纸中不可选视图；Revision pending 行蓝色；Inspection CSV 8 列且仅已分配编号导出 `[文档明确]`。
8. 更新：Update 只刷新视图、不动其它标签/外部链接；过期图上放新视图自动更新；悬空实体显示红色夹点并可拖拽修复 `[文档明确]`。
9. 导出：DWG/DXF 导出存在 Text 三选项、Units、z-height、off-sheet、splines 选项；CSV Inspection/Definition list 可选；strike-through 需要 2013 版本 `[文档明确]`。
10. 图纸层/锁定：Locked 时标题栏/边框/分区不可编辑；字段值变化在锁定后才刷新（文档表述），需在实现中明确刷新时机并写回归测试 `[文档明确，但文档自身有矛盾，需产品裁决]`。

### 7.6 对 LubanCAD 的差距提示（只基于文档）

- 若当前产品尚无“图纸”域，文档显示其能力面远大于基础投影：**9 类派生视图 + 上下文显示开关 + 尺寸全套 + GD&T/焊接/粗糙度 + 5 类数据表 + 检验/发布联动 + DWT 模板生态**，应按 AIRR 分层推进（先基视图/尺寸/表格，再 GD&T/焊接/检验/发布）`[推断]`。
- 文档中的 **Parent scale / Sheet scale、View simplification 五档、Best performance/Best quality、MBD 自动带入与去重** 是容易被忽略但可测试的行为，应纳入设计输入 `[文档明确]`。
- **DWT 作为模板交换格式**、DWG/DXF 层名（BORDER_FRAME/BORDER_ZONES/TITLE_BLOCK）与 2013 版本、1800 in 纸幅上限，可作为导入导出契约的硬约束 `[文档明确]`。
- **Revision/Inspection/BOM** 都依赖发布与账户权限模型；LubanCAD 若暂无发布管理，可先实现表结构与手工数据，Release 联动标注为 blocked-design，避免“假发布” `[推断]`。
- 文档未给出 BOM/Revision/Cut list 的固定列清单（由模板/数据驱动），实现时应把“列定义可配置”作为一等需求，而不是硬编码 UI 列 `[文档明确/推断]`。

---

**报告完毕。** 主题覆盖 67/67；全部 URL 已列于第 2 节；本报告不修改仓库、不修改输入、未联网。
