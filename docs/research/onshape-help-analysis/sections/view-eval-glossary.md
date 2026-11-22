# Onshape Help 章节分析：模型可视化 / 评估工具 / 术语表 / 图标表

## 1. 本章概览

- **主题数**：40（组文件声明 Topics: 40）。
- **总词数**：61,129（组文件声明）；其中 Glossary 29,390 词、Icon Glossary 10,401 词，两者合计约占 65%。
- **覆盖子域**：
  1. **模型可视化工具（Model Visualization Tools）**：视图导航与 View Cube、移动端触控导航、Camera and render options（14 个主题及其全部子项）、Hide/Show、Isolate、Make Transparent、AR View、Apple Vision Pro。
  2. **模型评估工具（Model Evaluation Tools）**：Measure Tool、Mass Properties Tool、Analysis Tools 总览 + 11 个分析工具页面。
  3. **Glossary**：按 0-9/A-Z 组织、带 Context/Plan Type 过滤的综合术语表（约 684 个词条，以 `Default Keyboard Shortcut` 行计数为代理）。
  4. **Icon Glossary**：按 General、各 Tab 类型、Document 行、Feature list、Parts list、Instances list、Linked references、Mates、Drawing、PCB Studio、Feature Studio、CAM Studio、Render Studio、Document/Tab/Release 状态等分组的约 598 个图标单元（按 `[image]` 行计数）。
- **文档更新日期**：语料中**没有**任何“Updated/Last modified/发布日期”字段；各主题只有 URL、TOC 路径、词数、description、headings 与正文。因此无法判断版本新鲜度。
- **整体质量与抽取限制**：
  - 正文由 HTML 自动抽取，所有图标只剩 `[image]` 或 `[image: alt]`；Icon Glossary 的名称/动作仍在，但**图标的形状、颜色、填充状态全部丢失**，无法核对像素级视觉。
  - 表格被压平成 `|` 分隔的逐行文本，列边界丢失；View Cube 菜单、导航按键表、Graphics Preferences 参数表需要按上下文重建。
  - 视频只有文字转录或“Video transcript”段落（Hide/Show、Isolate、Measure、Mass Properties、Flatten Surfaces 等）。
  - Camera and Render Options 与 View Navigation 两页**重复**了同一段 iOS/Android View Cube/3D Rotate Lock 内容，属于文档冗余而非两个功能。
  - 同一能力在不同页面/术语表中的“Available in / Context / Plan Type”存在不一致（详见第 5 节质量注记），本报告以**主题页正文**为主、术语表为辅，并显式标注冲突。

## 2. 主题清单与逐篇摘要

### 2.1 可视化总览与导航（3 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Model Visualization Tools | Model Visualization Tools | `/Content/View/model_visualization_tools.htm` | 可视化工具总览：在 Sketch/Part Studio/Assembly 中通过显示、隐藏、隔离、透明来辅助建模与分析；列出 Hide/Show、Isolate、Make Transparent 三个入口。 |
| View Navigation and the View Cube | Model Visualization Tools > View Navigation and the View Cube | `/Content/View/view_navigation_and_the_view_cube.htm` | 桌面 Windows/macOS 的鼠标、键盘、触控板导航表，触摸屏手势表，以及 iOS/Android 的 View Cube、3D Rotate Lock 和菜单选项说明。 |
| Mobile Touch Interface Navigation | Model Visualization Tools > Mobile Touch Interface Navigation | `/Content/Mobile/mobile_touch_interface_videos.htm` | 一组移动端视频的目录：工作区导航、手势、View Cube、上下文菜单、精确选择器、对话框/特征列表、草图、约束、装配、Triad 操纵器与 Mate。 |

### 2.2 Camera and Render Options 及其子项（14 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Camera and Render Options | Model Visualization Tools > Camera and Render Options | `/Content/View/camera_and_render_options.htm` | Camera and render options 下拉总览：默认值设置、视图快捷键、3D Rotate Lock、移动端 View Cube 菜单及全部视图/显示选项（约 18 项）；并列出 12 个子页面链接。 |
| Isometric, Dimetric, and Trimetric Projections | Model Visualization Tools > Camera and Render Options > Isometric, Dimetric, and Trimetric Projections | `/Content/View/isometric_dimetric_trimetric_projections.htm` | 三种轴测投影的定义：Isometric 三轴等倾、夹角 120°；Dimetric 两轴同尺度；Trimetric 三轴不同角度与尺度；用于 Part Studio/Assembly/Render Studio/PCB Studio。 |
| Graphics Preferences | Model Visualization Tools > Camera and Render Options > Graphics Preferences | `/Content/View/graphics_preferences.htm` | 图形首选项对话框：Viewport（环境光遮蔽、FOV）、Shaded bodies（线宽、光泽、高光色、剖面干涉色）、Phantom edges、Mesh bodies、Active/Inactive sketches 颜色线宽、Construction lines 虚线节距。 |
| Named Views | Model Visualization Tools > Camera and Render Options > Named Views | `/Content/View/named_views.htm` | 在 workspace 内创建/删除命名视图，保存透视、缩放与朝向；Shift+V 打开；视图匹配时自动选中；可先开透视/剖面再保存。 |
| Previous View | Model Visualization Tools > Camera and Render Options > Previous View | `/Content/View/previous_view.htm` | Camera and render options 中的 Previous view 将图形区恢复到上一个视图。 |
| Zoom to Fit, Window, and Selection | Model Visualization Tools > Camera and Render Options > Zoom to Fit, Window, and Selection | `/Content/View/zoom_to_fit_window_and_selection.htm` | 三种缩放：Zoom to fit（f / 双击滚轮）、Zoom to window（w，框选）、Zoom to selection（需有选择）；后两者 iOS/Android 不可用。 |
| Perspective View | Model Visualization Tools > Camera and Render Options > Perspective View | `/Content/View/perspective_view.htm` | 透视开关，产生消失点；PCB Studio 中在 Perspective 与 Orthographic 之间切换。 |
| Orient Normal to Sketch on Edit | Model Visualization Tools > Camera and Render Options > Orient Normal to Sketch Plane | `/Content/View/orient_normal_to_sketch_on_edit.htm` | 编辑草图时自动把视图转到草图平面法向；勾选状态在后续所有用户会话中保持。 |
| Shaded, Unshaded, and Translucent | Model Visualization Tools > Camera and Render Options > Shaded, Unshaded, and Translucent | `/Content/View/shaded_unshaded__and_translucent.htm` | 全局调整透明度/着色：Shaded with edges（默认）、Shaded without edges、Unshaded、Translucent；选 Translucent 时隐藏边可见/移除选项不可用。 |
| Hidden Edges Visible and Removed | Model Visualization Tools > Camera and Render Options > Hidden Edges Visible and Removed | `/Content/View/hidden_edges_visible_and_removed.htm` | 控制被遮挡边的可见性；提供 Shaded with edges/Unshaded 与 Hidden edges removed/visible 的四种组合，默认 Shaded with edges + hidden edges removed。 |
| Tangent Edges Visible, Phantom, and Removed | Model Visualization Tools > Camera and Render Options > Tangent Edges Visible, Phantom, and Removed | `/Content/View/tangent_edges_visible_phantom_and_removed.htm` | 相切边显示为实线（默认）、虚线（Phantom/Font）或移除；仅对新建模型、仅浏览器平台可用。 |
| View in High Quality | Model Visualization Tools > Camera and Render Options > View in High Quality | `/Content/View/view_in_high_quality.htm` | Shift+R 切换当前 Part Studio/Assembly 的最高质量网格细分视图，可能轻微降低性能，开启时显示蓝色通知。 |
| Highlight Boundary Edges | Model Visualization Tools > Camera and Render Options > Highlight Boundary Edges | `/Content/View/highlight_boundary_edges.htm` | 以红色实线（可见）或红色虚线（隐藏）高亮孔、断口、曲面层流边等可能需修复的边界；主题页限定 Part Studio。 |
| Section View | Model Visualization Tools > Camera and Render Options > Section View | `/Content/View/section_view.htm` | 用平面、Mate connector、圆柱面、锥面或平面面剖切模型；带可吸附操纵器、深度/角度拖动、排除/包含列表、默认平面、翻转、Named View 与 Measure 支持。 |

### 2.3 可见性工具（3 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Hide/Show | Model Visualization Tools > Hide/Show | `/Content/View/hide_show.htm` | 对草图、零件/实例、曲面、Mate、文件夹、组执行 Hide/Show、Hide/Show all、Hide/Show other；y / Shift+y 悬停快捷，含 Switch to 源 Part Studio/子装配。 |
| Isolate | Model Visualization Tools > Isolate | `/Content/View/isolate.htm` | 让所选实体保持不透明、其余透明；支持内部几何显示、透明几何可选、按距离/装配连接扩展，设置跨会话保留，iOS 仅距离扩展。 |
| Make Transparent | Model Visualization Tools > Make Transparent | `/Content/View/make_transparent.htm` | Isolate 的反向操作：所选实体透明、其余不透明；同样支持内部几何、透明几何可选、按距离/连接扩展与设置持久化。 |

### 2.4 增强现实（3 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Viewing Models with Augmented Reality | Model Visualization Tools > Viewing Models with Augmented Reality | `/Content/Mobile/viewing_models_with_augmented_reality.htm` | AR 总览：在物理环境中放置并查看零件/装配，只能查看不能编辑；两种方式为 AR View（iOS/Android）与 Apple Vision Pro（iOS）。 |
| Viewing Models with AR View | Model Visualization Tools > Viewing Models with Augmented Reality > Viewing Models with AR View | `/Content/Mobile/viewing_models_with_ar_view.htm` | 移动端 AR View：相机权限、平面检测与放置、手势旋转/缩放/平移、双击重置、可见性/配置、存图/手势说明、AR Measure（环境点）、AR 剖视图、Import from Scan 对齐实景。 |
| Viewing Models with Apple Vision Pro | Model Visualization Tools > Viewing Models with Augmented Reality > Viewing Models with Apple Vision Pro | `/Content/Mobile/viewing_models_with_apple_vision_pro.htm` | iOS 设备通过蓝牙 + 同一 WiFi 配对一台或多台 Apple Vision Pro，用空间计算投射 Part Studio/Assembly；可看不可编辑，选项卡同步、平移/旋转不同步，支持多文档连接/断开。 |

### 2.5 评估总览与 Measure（2 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Model Evaluation Tools | Model Evaluation Tools | `/Content/View/model_evaluation_tools.htm` | 评估工具总览：Measure、Analysis、Mass properties 三组，位于 Part Studio/Assembly 界面右下角（Measure 另可用于 Drawing，总览页称 Sketch 也可用）。 |
| Measure Tool | Model Evaluation Tools > Measure Tool | `/Content/View/measure_tool.htm` | 动态测量草图、零件、装配、曲线、曲面与工程图；含 Measure type/Length unit/Angle unit 下拉、中心/最小/最大距离、面积/长度、参考坐标系、变量、质量属性入口、工程图双单位、移动端与 AR 用法。 |

### 2.6 Analysis Tools（12 主题：总览 + 11 工具）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Analysis Tools | Model Evaluation Tools > Analysis Tools | `/Content/View/analysis_tools.htm` | 分析工具总览：检查草图边/面与零件边/面/体的设计完整性、装配干涉；菜单方式打开时选择不保留，快捷键方式打开时保留上次选择；列出 11 个工具。 |
| Curve/Surface Analysis | Model Evaluation Tools > Analysis Tools > Curve/Surface Analysis | `/Content/View/curve_surface_analysis.htm` | 曲率梳/等参曲线分析：Curvature combs、U/V curves、拐点、最小半径、跨面延伸、控制点网格、节点、详情与梳尺大小；Shift+C 切换，支持特征创建中预览边。 |
| Deviation Analysis | Model Evaluation Tools > Analysis Tools > Deviation Analysis | `/Content/View/deviation_analysis.htm` | 两条连续曲线链或两个曲面之间的最小/最大偏差；蓝最小值、红最大值与极值点，曲面带色带、四种配色、上下限编辑/重置、Absolute values、Dim color scale。 |
| Connection Analysis | Model Evaluation Tools > Analysis Tools > Connection Analysis | `/Content/View/connection_analysis.htm` | 两条曲线/两个面/混合选择的连接连续性 G0/G1/G2/G3 判定，图形区按连续性着色；多连接端点不分析。 |
| Dihedral Analysis | Model Evaluation Tools > Analysis Tools > Dihedral Analysis | `/Content/View/dihedral_analysis.htm` | 显示所选边的二面角，支持 Max/Min、单位、阈值上下限与梳尺长度；Shift+D 切换，草图模式可直接打开。 |
| Interference Detection | Model Evaluation Tools > Analysis Tools > Interference Detection | `/Content/View/interference_detection.htm` | 在一个 Part Studio/Assembly 中检测并红色显示两个及以上零件间的干涉；Interferences 列表、悬停交叉高亮、包围盒 L/W/H、框选包含规则、标准件与顶层过滤。 |
| Zebra Stripes | Model Evaluation Tools > Analysis Tools > Zebra Stripes | `/Content/View/zebra_stripes.htm` | 以条纹房间反射检查边两侧曲率是否对齐/连续；Stripe count（默认 35）、Flip stripes、Show edges（默认开）；确认后条纹保留，X 或 Color map 可关闭。 |
| Reflection Analysis | Model Evaluation Tools > Analysis Tools > Reflection Analysis | `/Content/View/reflection_analysis.htm` | 给模型施加反射材质与环境图；环境图来自当前文档/其他文档/图库（11 个 Environment maps 预设），可设旋转角/反向、显示边、模糊环境、锁定环境。 |
| Curvature Color Map | Model Evaluation Tools > Analysis Tools > Curvature Color Map | `/Content/View/curvature_color_map.htm` | 在面/曲面上叠加曲率色图；4 种配色（Viridis 默认、Blue→Red、Plasma、Rainbow）与 4 种图（Gaussian、Mean、Max radius、Min radius），可拖动图例、编辑端点并刷新。 |
| Draft Analysis | Model Evaluation Tools > Analysis Tools > Draft Analysis | `/Content/View/draft_analysis.htm` | 按拔模方向检查最小拔模角、底切与分型线：蓝色达标、黄色过陡、红色底切；正/负方向分别浅蓝/深蓝，可翻转箭头，分析常驻并可边改模型边看。 |
| Thickness Analysis | Model Evaluation Tools > Analysis Tools > Thickness Analysis | `/Content/View/thickness_analysis.htm` | 分析零件各区域材料厚度；支持 Rolling ball / Rolling ball gradient (%) / Ray / Ray gradient (%)；云端五阶段进度、色条、上下限/Dim colors；仅原生与网格零件，闭合成 composite 不支持。 |
| Flatten Surfaces | Model Evaluation Tools > Analysis Tools > Flatten Surfaces | `/Content/View/flatten_surfaces.htm` | 将一个或多个连续非平面面展平为最小应变能的平面面；Rip edges 降低畸变，显示 facets/edges/checkerboard/distortion，定位 Origin/Mate connector/offset/angle，可导出 PARASOLID/STL/DXF/SVG；不生成 Parts 列表实体。 |

### 2.7 质量属性与两张总表（3 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Mass Properties Tool | Model Evaluation Tools > Mass Properties Tool | `/Content/View/mass_properties_tool.htm` | Mass and section properties 对话框：Part 页按材料密度算质量/体积/表面积/质心/惯性矩，Face 页算面积/周长/面积与极惯性矩；支持 Mate connector 参考、质量覆盖、Show calculation variance、缺失材料警告、质心显示与移动端。 |
| Glossary | Glossary | `/Content/Home/glossary.htm` | 约 684 个词条的术语表，覆盖 Document/Sketch/Part Studio/Assembly/Drawing/Render Studio/Account 与全部计划类型；每条含默认快捷键、Context、Plan Type、See Also，本报告按主题归纳而非逐条抄录。 |
| Icon Glossary | Icon Glossary | `/Content/Home/icon_glossary.htm` | 按 General、Sketch、Part Studio、Assembly、Drawing、PCB Studio、Feature Studio、CAM Studio、Render Studio、Document/Tab、发布/修订状态等分组的图标语义表；约 598 个图标单元，含 Button 名称/动作与 Indicator 定义。 |

## 3. 核心概念与术语

### 3.1 视图与相机

- **Graphics area**：显示零件/装配的中央矩形区域。
- **View cube**：右上角立方体；点面进入正交平面视图（Top/Bottom/Front/Back/Left/Right），点角进入三轴测视图；箭头按 15°（左键）、90°（Shift+左键）、5°（Ctrl+左键）增量旋转（桌面）。
- **Camera and render options / View tools**：View cube 下方的下拉菜单，聚合投影、Graphics preferences、Named views、Previous view、Zoom、Perspective、Orient normal、Shaded/Unshaded/Translucent、Hidden edges、Tangent edges、View in high quality、Highlight boundary edges、Section view。
- **3D Rotate Lock**：移动端 View Cube 上方按钮，锁定 3D 旋转；再次点击或提交特征解除；Part Studio 中“草图打开且有实体选中”以及 Assembly 中“实例/Mate connector/实体选中”时默认自动开启。
- **Axonometric projections**：Isometric（三轴等倾、两两 120°）、Dimetric（两轴同尺度、第三轴不同）、Trimetric（三轴不同角度和尺度）；术语表另定义 Isometric 为三坐标轴等缩短的正轴测投影。
- **Perspective / Orthographic**：透视有消失点；PCB Studio 明确提供两者切换。
- **Named view**：保存透视状态、缩放比例与朝向的 workspace 级视图快照。
- **Section view**：用平面/平面面/Mate connector/圆柱面/锥面剖切；剖面与剖切方向由操纵器和数值字段控制。
- **Shaded / Unshaded / Translucent**：全局着色状态；**Hidden edges** 与 **Tangent edges** 是独立的边显示维度。
- **Phantom edge**：相切边以虚线显示（部分系统称 Font）。
- **Boundary edge**：孔、断口、曲面层流边等可能需要修复的边界，红色实线/虚线高亮。
- **High quality mode**：最高可用细分的显示模式，以性能换取平滑度。

### 3.2 可见性状态

- **Hide/Show**：可见性开关；有单实体、**Hide/Show all**（同类型全部）、**Hide/Show other**（除所选外的同类型）三种语义。
- **Isolate**：所选不透明、其余透明；**Make transparent** 是它的镜像操作。
- **Select transparent geometry**：允许选中/测量/分析/编辑透明几何。
- **Expand: distance / connectivity**：按物理距离或装配 Mate 连接逐级扩展隔离/透明范围；connectivity 仅 Assembly。
- **Display states**（术语表）：为装配保存/恢复“哪些零件、子装配、Mate 隐藏或在视图内”的命名状态；与 Isolate/Make Transparent 的会话设置不同。
- **Named positions**、**Exploded view**：装配位置/爆炸视图的命名与记录，属于装配侧显示状态。

### 3.3 评估与几何分析

- **Measure**：动态测量；类型包含 Show all、Position、Center position、Min distance、Max distance、Length、Diameter、Radius、Angle、Face tangent angle、Curvature deviation、Surface area。
- **Mass properties**：Part 页的质量、体积、表面积、质心、惯性矩；Face 页的面积、周长、面积惯性矩、极惯性矩；惯性矩默认相对所选零件/面的重心，而非 Part Studio/装配原点。
- **Center of mass**：所选零件/复合零件的质量平均位置；可右键 `Show center of mass` 常显。
- **Curve/Surface analysis**：G0 位置、G1 相切、G2 曲率、G3（Flow）曲率变化率连续性的可视化与判定基础。
- **Deviation**：Min/Max deviation；曲线链按端点配对后裁剪范围计算；曲面为单侧计算，可能为负值，Absolute values 取正。
- **Zebra stripes**：对齐（aligned）时条纹在边处对齐后偏折；连续（continuous）时条纹对齐且不偏折。
- **Draft analysis**：蓝色=达到最小拔模角；黄色=过陡（小于最小拔模）；红色=底切；浅蓝=正方向，深蓝=负方向。
- **Thickness analysis**：Rolling ball 用内切球直径、分布连续；Ray 用法向射线首交点距离、常有尖锐不连续；gradient 为厚度变化量/测地距离的无量纲百分比。
- **Flatten surfaces**：最小应变能几何展平，不考虑材料属性，结果面也没有材料属性；“不保证精确”，不应用于关键/精细测量。

### 3.4 Glossary 的术语体系

每条术语固定结构：**术语名 → 图标 → 定义 → Default Keyboard Shortcut（unassigned / n/a / 具体键）→ Context（Document/Sketch/Part Studio/Assembly/Drawing/Render Studio/Account/all）→ Plan Type（all / Standard / Professional / Enterprise / Educator / Student）→ See Also**。页面顶部有 **Context options** 与 **Plan Type options** 两个过滤器，并提示用 Ctrl/Cmd+F 页内搜索；快捷键可在 My Account 自定义。约 684 条，覆盖工具、对象、状态、角色、渲染参数、WebGL 能力、计划类型等。

### 3.5 Icon Glossary 的语义体系

页面分 **Buttons / Indicators / All icons** 三个视图；按 Tab 类型与 UI 区域分组。图标语义大体分为四类：
1. **入口/按钮**：工具名 + 动作（如 Measure details、Analysis tools、Mass and section properties、Fit all、Toggle transparency）。
2. **对象类型指示**：Part Studio、Assembly、Drawing、Render Studio、Surface、Composite part、Flat pattern、Sketch 等。
3. **状态指示**：信息/警告/错误及其“顶层折叠组内存在消息”的聚合态；特征列表的失败、欠定义、动态抑制、引用过期、上下文引用；零件列表的发布/废弃/自动废弃；实例的自由度/固定/全刚体；引用与修订的 pinned/out-of-date。
4. **符号体系**：工程图符号（°、⌀、℄、⌵、↧、⌴、□、⌒、±）、GD&T 特征与修饰符、Mate 自由度/极限符号、绘图 grip 点。

## 4. 功能与 UI 明细

### 4.1 视图导航（Desktop / Touch）

**可用位置**：Sketch、Part Studio、Assembly（View Cube 与 Camera and render options 均如此）。

**桌面导航（文档表的 Windows / macOS 两列）**：

| 操作 | Windows | macOS |
|---|---|---|
| 3D 旋转（鼠标） | 右键拖动；Alt 键动画到最近“floor down”视图（无 roll）；Alt+右键：水平移动绕模型、垂直移动俯仰模型 | 右键拖动 |
| View Cube 箭头旋转 | 左键 15°；Shift+左键 90°；Ctrl+左键 5° | 同左 |
| 3D 旋转（键盘） | 方向键 15°；Shift+方向键 90°；Ctrl+方向键 5°；按住连续旋转 | 同左 |
| 3D 旋转（触控板） | 右键触控板拖动 | 双指点按后拖动 |
| 缩放（鼠标） | 滚轮下=缩小，上=放大 | 同左 |
| 缩放（键盘） | Z=缩小，Shift+Z=放大 | 同左 |
| 缩放（触控板） | 双指按压后捏合/张开 | 双指上下滑动 |
| 2D 平移 | Ctrl+右键拖动 / 中键拖动 | 同左 |
| 2D 平移（键盘） | Ctrl+Shift+方向键 | 同左 |
| 2D 平移（触控板） | Ctrl+右键触控板拖动 | 按住 Ctrl，双指点按后拖动 |
| 三轴测视图 | 点击 View Cube 角 | 同左 |
| 平面视图 | 点击 View Cube 面（Top/Bottom/Front/Back/Left/Right） | 同左 |

**触摸屏（iOS/Android/Browser）**：单指点击=选择；单指双击=清除选择；单指按住拖动=3D 旋转；双指点击=上下文菜单；双指长按=框选；双指捏合/张开=缩放；双指拖动=2D 平移；双指旋转=2D 旋转；点 View Cube 后从菜单选 Trimetric 或平面视图。

**移动端 View Cube 菜单**：Top、Bottom、Front、Back、Right、Left；Isometric、Dimetric、Trimetric；Zoom to fit；Perspective View；Shaded（默认）；Shaded without edges；Shaded with hidden edges；Hidden edges removed；Hidden edges visible；Translucent；Section View（须先选平面或平面面，再用箭头/方向操纵器调整）。

**快捷键（Camera and render options 页）**：Front=Shift+1、Back=Shift+2、Left=Shift+3、Right=Shift+4、Top=Shift+5、Bottom=Shift+6、Isometric=Shift+7、Section view=Shift+X、Named view=Shift+V。

**规则与边界**：
- “Zoom in/out is not supported on all browser/device combinations”；导航命令随机器/输入设备设置变化。
- 3D Rotate Lock 在选中可拖拽实体时自动开启，提交特征后自动解除。
- 术语表另给出 Pan=Ctrl+Shift+方向键（“15 度增量”描述与平移语义不一致）、Precision rotate=Shift+方向键（3°），与主题页“Shift+方向键=90°”冲突。

### 4.2 Camera and Render Options：默认值与全部子项

**默认值设置机制**（文档明确）：
- **Perspective view / Highlight boundary edges**：默认**禁用**；左键开启后右键 `Set as default`；恢复默认禁用则左键关闭后再右键 `Set as default`。
- **Orient normal to sketch on edit**：点击启用/禁用，**对所有未来用户会话保持**。
- **Shaded edges / Hidden edges / Tangent edges**：在任意**被禁用的子选项**上右键 `Set as default`，会同时启用该选项并设为默认。

**投影（Isometric/Dimetric/Trimetric）**：
- 可用：Part Studio、Assembly、Render Studio、PCB Studio。
- Isometric：X/Y/Z 等倾，两两 120°；Dimetric：两轴同尺度，第三轴不同，轴间角不等；Trimetric：三轴不同角度、不同尺度，透视缩短最自然，渲染软件常用。

**Graphics Preferences**（Part Studio、Assembly；对话框分 General 与 Sketch 两组，`Reset to default` 同时重置两组）：

| 分组 | 参数 | 范围/默认值 |
|---|---|---|
| Viewport | Ambient occlusion | 0%–100%，默认 **37.5%**；越高边/角/缝越暗 |
| Viewport | Field of view | 仅透视开启时可用；20°–120°（默认未说明） |
| Shaded bodies | Line width | 0.1–3 px（默认未说明） |
| Shaded bodies | Shininess | 1–100%（默认未说明） |
| Shaded bodies | Specular color | 颜色选择器 |
| Shaded bodies | Section interference color | 颜色选择器；剖切中相交零件按 Section view 页渲染为红色，可改 |
| Phantom edges | Phantom tangent edge width | 0.1–3 px，默认 **0.5 px** |
| Phantom edges | Phantom tangent edge color | 颜色选择器 |
| Mesh bodies | Mesh line width | 0.1–3 px，默认 **0.3 px** |
| Active sketches | Line width | 0.1–3 px |
| Active sketches | Constrained line color | 颜色选择器 |
| Active sketches | Underconstrained color | 颜色选择器 |
| Active sketches | Underconstrained occluded color | 被零件遮挡的欠约束线/点颜色 |
| Inactive sketches | Line width | 0.1–3 px |
| Inactive sketches | Line color | 颜色选择器 |
| Construction lines | First dash | 1–50 px，默认 **4 px** |
| Construction lines | First gap | 0–50 px，默认 **6 px** |
| Construction lines | Second dash | 1–50 px，默认 **30 px** |
| Construction lines | Second gap | 0–50 px，默认 **6 px** |

**Named Views**：保存透视、缩放比例与朝向；创建流程=调整视图（可选 Turn perspective on / Zoom to fit / 剖面）→ View Tools → Named views → 输入名称 → 加号；`Select a view` 下拉可删除（X 图标）；每个 workspace 可建任意多个；Shift+V 打开，默认在 View Cube 旁，若曾移动则在原位；若当前图形位置与某命名视图匹配，打开对话框时自动选中该视图。

**Previous view**：Camera and render options 中一键回到上一个视图；无参数。

**Zoom**：Zoom to fit（f，双击滚轮；将整个 Part Studio/Assembly/Drawing 纳入视图）；Zoom to window（w；点击并框选区域，快捷键切换开关）；Zoom to selection（必须先有选择才可见；缩放到所选实体）；后两者 iOS/Android 不可用；滚轮方向可在账户偏好中配置。

**Perspective View**：Camera and render options 中开关；PCB Studio 中在 Perspective/Orthographic 间切换。

**Orient Normal to Sketch on Edit**：在 Sketch/Part Studio 中，从 Camera and render options 勾选后视图转到草图平面法向；再次点击禁用并回到之前视图；跨会话保持。

**Shaded / Unshaded / Translucent**：Shaded with edges（默认）、Shaded without edges、Unshaded、Translucent；**选 Translucent 后，Hidden edges visible 与 Hidden edges removed 均不可用**。

**Hidden Edges**：四种组合——Shaded with edges + hidden removed（默认）、Shaded with edges + hidden visible、Unshaded + hidden removed、Unshaded + hidden visible。

**Tangent Edges**：Visible（实线，默认）、Phantom（虚线，亦称 Font）、Removed；**仅新建的 Part Studio/Assembly 模型、仅浏览器平台**可用。

**View in High Quality**：Shift+R；切换当前 Part Studio/Assembly 的最高可用质量细分；开启时显示蓝色通知；可能有轻微性能下降（文档链接 High quality mode）。

**Highlight Boundary Edges**：主题页仅 Part Studio；显示孔、断口、曲面层流边；可见边=红色实线，隐藏边=红色虚线；用于导入模型修复；链接 Repairing Imported Models。

**Section View**（Part Studio、Assembly）：
- 选择对象：一个或多个平面、Mate connector、圆柱面、锥面、平面面；也可先开启 Section view 再选择。
- 入口：Camera and render options → Section view；或在零件/装配上右键 → Section view；快捷键 Shift+X。
- 操纵器：出现在最后选择位置；中心空心球可拖动并吸附到零件/曲面/装配的任意推断点（含圆柱质心）；箭头改深度，点击操纵器翻转方向；角度指示器拖角度；图形区数值字段可键入深度/角度。
- 对话框：列出选择；相交零件以红色渲染（Section interference color 可改）；`Items to exclude` 排除零件/曲面；`Include` 页包含；`Select default plane` 图标打开默认平面下拉并可 `Flip plane`；绿色对勾保存并关闭默认平面但保留剖视图对话框，或保存并关闭两者。
- 视图：N 或右键 `View normal to` 使视图垂直剖面；`Turn off section view` 关闭；关闭对话框后可双击剖面重新打开；Camera and render options 或右键 `Edit section view`。
- 兼容：可保存为 Named View；可在剖视图中用 Measure 测量面/边/顶点；可移动模型（需先点出对话框关闭）。
- 术语表另把 Context 扩为 Sketch/Part Studio/Assembly/Render Studio，并给 Shift+X；与主题页有出入。

### 4.3 Hide/Show、Isolate、Make Transparent

**Hide/Show**（Part Studio、Assembly；快捷键 Hide=y、Show=Shift+y）：
- 对象：草图、零件/实例、曲面、Mate、文件夹、组。
- 命令：Hide/Show；Hide/Show all（同类型全部）；Hide/Show other（除所选外的同类型全部）。
- 入口：Parts list（Part Studio）、Instances list（Assembly）、图形区悬停/选中后的右键菜单；列表行有眼睛图标。
- 视频补充：可多选后右键隐藏；空白处右键 `Show all` 显示所有实例、Mate connector 与 Mate 特征，`Show all instances` 只显示被隐藏实例；装配中可 `Switch to` 源 Part Studio（带 Part Studio 图标）或子装配（带装配图标），并高亮所选零件。
- 备注：y 对光标下实体生效（悬停高亮）；Shift+y 显示；框选也可用；无需创建 context。

**Isolate**（Part Studio、Assembly；Shift+I）：
- 选择：零件/实例、点、边、面、Mate connector、文件夹、组；右键 Isolate 打开对话框。
- Transparency controls：`Show internal geometry` 复选；`Select transparent geometry` 复选；透明度滑块。滑块最左=只显示透明几何外轮廓、内部几何完全透明；向右=内部几何渐显；再向右=内部几何与外选择边渐隐直至完全不可见。
- Component controls：`Expand: distance` 按物理距离逐级把零件/实例变不透明；`Expand: connectivity`（仅 Assembly）按 Mate 连接逐级扩展。
- 关闭：对话框 x 恢复所有零件可见，退出后保留会话内选择；Esc 或右键 `Exit isolate` 也可退出。
- 设置：`Select transparent geometry` 与滑块跨对话框重入、跨文档会话保留；滑块拉到最左/最右会自动取消 `Select transparent geometry`，之后移动滑块又自动勾选。
- 累积：Shift+I 可逐个悬停隔离；`Select other`（重音符 `）可累积选择；文件夹/组可整体隔离；支持 in-context 建模与 Section view。
- 移动端：iOS 仅 `Expand: distance`；选中零件后双指点击打开上下文菜单再选 Isolate。

**Make Transparent**（Part Studio、Assembly；Shift+T）：
- 与 Isolate 完全镜像：所选透明、其余不透明；`Show internal geometry`、`Select transparent geometry`、透明度滑块、`Expand: distance`、`Expand: connectivity`（仅 Assembly）语义同上。
- 快捷方式累积、`Select other`、文件夹整体透明、支持 in-context 与 Section view、设置跨会话保留、滑块端点自动取消/重新勾选，均与 Isolate 相同。
- 退出：x、Esc、右键 `Exit make transparent`；主题页未写 iOS 限制。

### 4.4 AR View 与 Apple Vision Pro

**AR 总览**：AR 仅查看，不能编辑；两种方式：AR View（iOS/Android）、Apple Vision Pro（iOS）。

**AR View**：
- 入口：确保相机权限 → Part Studio/Assembly 中点击 View Cube → `AR view`。
- 平面检测：移动设备寻找平面；模型底平面用于贴合；可放在水平面（地板/桌面）或垂直面（墙）；平面以浅蓝框显示；点击放置后指示框消失。
- 手势：双指平移=原地旋转零件；捏合=缩放；点击拖动=平移位置；双击=重置。缩放时屏幕中央显示比例，`Reset` 重置比例/位置。
- 可见性：Features/Instances 列表眼睛图标切换；三点菜单可 Hide other sketches/parts、Hide other instances/Hide all instances/Show all instances；配置在列表上方可选。
- Tools：`Save image to photos`；`Review AR gestures`。
- 退出：顶部 `Exit View` 或 View Cube 菜单命令。
- Measure：`Measure` → `Reticule` 图标 → 移动设备定位准星，点击中心放置环境点，可继续加点；点可在模型或环境、水平或垂直平面；点为橙色；`Entities to measure` → `Edit` → 选中点 → 垃圾桶 → `Done`；Measure type 与桌面相同（Show all…Surface area）；长度单位 Centimeter/Foot/Inch/Meter/Millimeter/Yard（原文拼写 `Lengh unit`）；角度 Radian/Degree。
- 剖视：放置零件后选平面、planar mate 或 Mate connector → View Cube → Section view → 拖动操纵器；`Turn off Section view` 关闭。
- 实景对齐：`Import from Scan` 导入环境为 composite part；Part Studio 中作为 Derived part 插入并手动对齐，或 Assembly 中插入 Part Studio 用 Mate 定位；AR View 检测扫描区域后按 Part Studio 位置/朝向或装配配置放置。
- 权限：仅有 View only 权限的用户也可从工具栏使用 AR view。

**Apple Vision Pro**：
- 配对：iOS 设备与一台或多台 AVP 通过蓝牙、同一 WiFi；可从 Onshape Settings 页或文档内发起；可投射 part/publication/assembly，但只有 Part Studio/Assembly 选项卡能发起投射。
- 配对流程：Settings → Apple Vision Pro → `Pair new Apple Vision Pro` → 选择设备 → AVP 提示输入 **5 位码** → 配对成功；Paired devices 列表；`Forget` 解除；可继续 Pair new。
- 投射：Part Studio/Assembly 右上角 AVP 图标 → `Connect to an Apple Vision Pro` → 在 AVP 启动 PTC 3D 应用 → 列表中出现设备 → 选择 → X 关闭；对话框内 `Disconnect all` 或 `Pair new`；版本不匹配时显示警告图标并通知先更新 Onshape 应用。
- 同步规则：iOS 端编辑时，AVP 端可见特征操作与 Comments；若开启 CAD Materials，已赋材质零件显示材质；Sketching、Surfacing、Graphic manipulations、Camera and render options（Named views、Exploded views 等）**不可见**；Part Studio/Assembly 选项卡切换同步；**Panning/Rotation 不同步**；评论选中会高亮已标记零件，但评论图标不显示在零件上。AVP 端编辑时，iOS 端可见评论与标记零件；浏览器中评论图标显示在 Parts/Instances 列表右侧及图形区零件上。
- 多文档：Documents 页的 `Connected documents` 管理多个文档连接；可单独断开某一文档（取消勾选该 AVP）或 `Disconnect all`；AVP 只显示仍连接的文档。
- AVP 端可看不可编辑。

### 4.5 Measure Tool

**可用位置**：Part Studio、Assembly、Drawing（总览页另称 Sketch 可用；主题页标题为 Part Studio/Assembly/Drawing）。**快捷键 `[`**。桌面在界面右下角，移动端在主工具栏最右。

**通用流程**：
1. 选择实体（可先选后开工具，或先开工具再选）。
2. 点击 Measure 图标打开对话框；预选时工具会先显示部分信息；图形区选中实体时会自动显示相关测量，无需显式打开。
3. 通过 Measure type / Length unit / Angle unit 下拉过滤；可随时更改。
4. 再选实体时，工具给出 center-to-center、maximum-to-maximum、minimum-to-minimum 测量。
5. 草图实体在 Part Studio 中会显示草图实体类型图标。
6. 装配中多于两个实体：最小距离、最大距离、总面积、中心轴距离或长度。

**Measure type 选项**：Show all、Position、Center position、Min distance、Max distance、Length、Diameter、Radius、Angle、Face tangent angle、Curvature deviation、Surface area。

**Length unit**：Centimeter、Foot、Inch、Meter、Millimeter、Yard。**Angle unit**：Degree、Radian。

**结果字段**：Diameter（弧/圆直径）、Radius（弧半径）、Center Dist.（两实体中心距）、Perp axes angle（两实体垂直轴角度）、Area（曲面面积）、Face tangent angle（曲面与相交线切角）、Curvature deviation（曲面与相交线偏差）、Center（弧/圆 X/Y/Z）、Center Dist.（X/Y/Z）、Min Dist.（X/Y/Z）、Max Dist.（X/Y/Z）、Min Rad Pt.（椭圆最小径向点 X/Y/Z）、Max Rad Pt.（椭圆最大径向点 X/Y/Z）、Length（线长/圆周）、Point（点/顶点/Mate connector 的 X/Y/Z）。

**图形解释**：
- 粗虚线=中心/最大/最小距离；黑色=中心/最小/最大，红色=X 变化，绿色=Y 变化，蓝色=Z 变化。
- 细虚线=角度。
- 星号（✱）=数值在重合/相切公差内但非零；文档提醒非零仍可能影响下游几何质量。
- 点击测量值一次=保持虚线显示；再次点击=只在悬停时显示。
- 点击结果一次=Full Precision（最大精度），再次=按 workspace 单位缩短精度；可用原生快捷键复制。

**参考坐标系**（仅桌面浏览器）：Measure 中选 `Reference coordinate system` → `Mate connector for reference coordinate system` 字段（按 K 可显示装配中所有 Mate connector）→ 选 Mate connector；计算基于新坐标系；默认原点。

**变量**（仅 Part Studio）：点击测量值右侧变量图标 → Variable 对话框预填选择，创建 driven/measured variable；测量变化时变量更新。

**动态更新**（仅 Assembly）：Measure 打开时拖动零件，测量值动态更新（圆边/Mate connector 相对原点位置；原点+实体距离；固定件+非固定件实体的距离）；**Section view 下动态更新不工作**。

**钣金**：Sheet metal table and flat view 打开时，Measure 分别显示 Part Studio 模型与 Flat View 的信息（Part Studio 选项卡/Flat View 选项卡）。

**工程图**：选择点、线、弧、圆；单位下拉中 `(Drawing)` 标出文档默认单位；可勾 `Show dual units` 同时显示第二套单位；显示投影几何测量并指示坐标轴与关系类型（如 point-to-point）；红色 X 关闭。

**移动端**：工具栏图标；动态显示所有可能测量；底部对话框可点顶部折叠/展开、滑动滚动；同样三个下拉；X 退出；单位取文档 Units 设置。

**AR Measure**：见 4.4。

### 4.6 Analysis Tools（11 个工具）

**总览规则**（文档明确）：
- 可用：Sketch、Part Studio、Assembly；入口为界面右下角 `Show analysis tools` 图标。
- **选择持久性规则**：从 Analysis tools 菜单打开工具=**不保留**上次选择（non-persistent）；用工具快捷键打开=**保留**上次选择（persistent）。用户可据此选择保留或丢弃。
- 无快捷键的工具可在 Keyboard Shortcuts 中自定义。

| 工具 | 可用/快捷键 | 输入 | 关键选项/默认值 | 输出与限制 |
|---|---|---|---|---|
| Curve/Surface Analysis | Sketch、Part Studio、Assembly；Shift+C | 边/面；草图曲线 | Curvature combs；Show U curves（红）；Show V curves（蓝）；U/V curves 数量 2–64，默认 **8/8**；Sketch inflection points（黑色领结）；Minimum radius（仅边）；Extend across face；Control point grids（洋红）；Knot points；Details；Comb size 滑块 | 曲率梳可判断到 G3（Flow）；控制点密集=潜在质量问题；Knot/Details 不支持圆柱面、交线、偏移曲线等非样条；拖曲线时实时更新；草图外仍保持工具但选择字段不可用 |
| Deviation Analysis | Sketch、Part Studio | 曲线链 1/2（须连续）；或 Source/To measure 两个曲面 | 曲线：Min 蓝/Max 红+极值点；Scale 滑块；曲面：色带、Viridis（默认）/Blue→Red/Plasma/Rainbow；Absolute values；Dim color scale；上下限编辑/Reset | 曲线：端点重合则全长度计算；不重合则按最小距离配对并裁剪；多个同值极值只显示一个；恰好两曲线时自动填入两链。曲面：仅两个面、单侧、可负值；色带 6 个刻度；可拖放停靠；编辑后带 `*` |
| Connection Analysis | Sketch、Part Studio | 两曲线/两面/混合 | 无参数；选择后自动出结果 | 判定 G0/G1/G2/G3；边/点按连续性着色；多连接端点不分析 |
| Dihedral Analysis | Sketch、Part Studio；Shift+D | 边 | Max/Min；单位；Enable threshold display + 高/低阈值；Scale 滑块 | 显示二面角梳尺；草图模式 Shift+D 切换；选择变更持久 |
| Interference Detection | Part Studio、Assembly | 两个及以上零件 | Include standard content；Show top level only；框选方向 | 干涉红色；Interferences 列表；悬停名称交叉高亮；焦点在字段时缩放到干涉；悬停显示包围盒与 L/W/H；左上→右下只含完全包围，右下→左上含接触 |
| Zebra Stripes | Sketch、Part Studio、Assembly | 模型/面/曲面 | Stripe count（默认 **35**）；Flip stripes；Show edges（默认开） | 对齐=条纹对齐后偏折；连续=条纹对齐不偏折；对勾确认后条纹保留；X 关闭；选 Color map 也会关闭斑马纹 |
| Reflection Analysis | Sketch、Part Studio、Assembly | 模型/面/曲面 | Environment 图像：Blue sky、Ceiling hexagonal、Ceiling square、Chromatic、Daylight road、Horizontal stripe、Light tunnel、Metro station、Nightfall、Pedestrian bridge、Wall stripes；Rotation angle + Opposite direction；Show edges；Blur environment；Lock environment | 环境图来自 Current document/Other documents/Libraries（Type: Environment maps）；可新建图像库 |
| Curvature Color Map | Sketch、Part Studio（术语表另称 Part Studio/Assembly） | 面/曲面 | Colors：Viridis、Blue→Red、Plasma、Rainbow；Graph：Gaussian、Mean、Max radius、Min radius | 色图可拖动重定位（部分位置自动竖直）；无曲率时不赋色值、模型保持原色；拖动端点/输入值改比例后点刷新 |
| Draft Analysis | Sketch、Part Studio | Mold split direction（平面/面/边）；最小拔模角；待检查实体 | Show undercut regions；方向翻转箭头 | 蓝色达标、黄色过陡、红色底切；浅蓝正方向/深蓝负方向；悬停显示精确角；分析常驻，可边改零件边看；可用剖视图 |
| Thickness Analysis | Part Studio；术语表 Plan Type=Professional/Enterprise | 一个或多个零件 | Method：Rolling ball、Rolling ball gradient (%)、Ray、Ray gradient (%)；Colors 调色板；上下限；Dim colors scale | 仅原生 Onshape 零件与 mesh；闭合成 composite 不支持；五阶段进度（Preparing/Processing/Calculating/Refining/Postprocessing）；结果随编辑自动更新；`Edit thickness analysis`/`Turn thickness analysis off` |
| Flatten Surfaces | Sketch、Part Studio（术语表仅 Part Studio） | Faces to flatten（连续面）；Rip edges | Show facets；Show edges（默认开）；Show checkerboard + Checkerboard scale；Show distortion + Distortion scale（洋红/红蓝）；Show flattened；Flattened position（Mate connector）；Flattened offset；Flattened angle；Origin；Show export controls | Export Format：PARASOLID、STL、DXF、SVG；Export inner edges；`Flatten` 按钮；**不在 Parts list 创建零件**；不保证精度；改 Rip/Origin 后需再次 Flatten |

### 4.7 Mass Properties Tool

**可用位置**：Part Studio、Assembly；桌面右下角尺形图标，移动端主工具栏。

**流程与语义**：
- 选择 Part 页（整个零件/装配）或 Face 页（截面/面）。
- 图形区/Features/Instances 列表选择；属性**可加**：每多选一个零件，其属性累加到结果。
- 材料密度参与计算；无材料零件不参与并显示提示；质量为近似值，精度随几何复杂度变化。
- `Show calculation variance` 显示计算值与上下界差异；不勾选则只显示计算值；勾选状态不影响计算本身。
- `Override`：在 Features/Instances 列表选整个零件或装配，勾选后输入自定义质量值，自动重算。
- 相交零件：按每个完整零件分别计算后相加。

**对话框字段（自上而下）**：
- Parts/faces/instances to measure。
- 可选 Mate connector（隐式/显式）：用于更准确地计算惯性矩（否则相对所选零件重心）。
- Mass of all parts that have a material applied。
- Volume of all selected parts。
- Surface area of all selected parts or faces。
- Perimeter of all selected faces。
- Center of mass of all parts that have a material applied。
- Moments of inertia：相对所选零件/面重心（非 Part Studio/装配原点）；按材料密度计算；无材料零件省略；全无材料则不计算。

**警告与显示**：
- 装配中若 `Instances to measure` 有零件无材料：警告 `One or more parts do not have a material defined.`，图形区 Mass properties 图标变红；需要赋材料才计入质心。
- 对话框打开时质心以图标标在模型上；关闭后可用右键 `Show center of mass` 常显。
- `Show center of mass` 可高亮 Instances 列表中缺材料的实例；带质量覆盖的子装配内实例不被选中。
- 质心可插入工程图，作为尺寸与 Mate connector 参考。

**取值**：点击结果一次=最大精度，再次=默认小数位；原生快捷键复制。移动端可多选零件/面，列表左滑删除，`Mass Override`，单位取文档 Units。

### 4.8 Glossary 归纳

**规模与组织**：按 0-9 与字母分段（语料中实际无 X/Y 段）；约 684 条；每条含图标、定义、默认快捷键、Context、Plan Type、See Also。快捷键大量为 `unassigned`/`n/a`；Context 常为 all；Plan Type 常为 all，Render Studio/Simulation/Enterprise 功能多为 Professional/Enterprise。页面提示快捷键可在 My Account 自定义。

**按主题归纳（代表术语与定义）**：

1. **文档、版本与协作**：Document（由 Part Studio/Assembly/Drawing/Tutorial/Application/Feature Studio/导入文件等选项卡组成）、Workspace（可编辑迭代）、Version（不可变快照）、Branch（版本/历史图中的命名分叉，以 workspace 结束）、Merge、Branched editing、Simultaneous editing、Collaborator、Comments、Action items、Release management、Revision table、Where used、Properties (Metadata)、Publications、Trash、Owner/Administrator。
2. **草图与约束**：Sketch（平面上的曲线+尺寸+约束）、Sketch curve、Region（封闭草图曲线围成的有限区域）、Construction Geometry、Inference（橙色虚线+橙色框）、Sketch constraints（Dimension、Coincident、Concentric、Parallel、Tangent、Horizontal、Vertical、Perpendicular、Normal、Equal、Midpoint、Fix）、Pierce、Curvature、Flow（G3）、Profile inspector、Tolerance options（用于草图尺寸/特征参数的允许范围）。
3. **Part Studio 特征/曲面**：Feature、Feature list、Part、Surface、Composite part（开/闭）、Extrude、Revolve、Sweep、Loft、Thicken、Enclose、Fillet、Face blend、Chamfer、Draft、Body draft、Rib、Shell、Hole、External thread、Linear/Circular/Curve pattern、Mirror、Boolean、Split、Transform、Wrap、Decal、Delete part/face、Modify fillet、Move face、Replace face、Plane、Offset/Boundary/Fill/Ruled/Mutual trim/Constrained surface、Helix、3D fit spline、Projected/Bridging/Composite/Intersection/Trim/Isocline/Offset/Isoparametric/Edit/Routing curve、Derived、Variable、Query variable、Variable Studio、Configuration panel、Custom tables、Rollback/Rollback bar、Suppress、Dynamic suppression、Tag、Frame/Frame trim/Gusset/End cap/Cut list、Sheet metal 系列、Flex PCB。
4. **装配**：Assembly、Instance、Subassembly、Top-level instance、Mate、Mate connector、各类 Mate（Fastened/Revolute/Slider/Planar/Cylindrical/Pin slot/Ball/Parallel/Tangent/Width）、Group、Mates/Relations（Gear、Rack and pinion、Screw、Linear）、Snap mode、Show mates mode、Replicate、Replace instance、Display states、Named positions、Exploded view、Interference/Check interference、Simulation 相关（Load 五类：Force、Moment、Bearing、Acceleration、Pressure；Angular velocity；von Mises、Signed von Mises、Safety factor、Max principal stress、Displacement）。
5. **工程图**：Drawing、Sheet、Drawing Properties（全局）、Sheet properties（每页）、Views properties、Annotations、Dimension 系列（2 point linear、3 point angular、arc length、radial、diameter、foreshorten、ordinate、chamfer、maximum/minimum、line-to-line、point-to-line）、Hole/Thread callout、Datum、Geometric tolerance、Surface finish、Weld symbol、Edge condition、Note、Callout、Table/BOM/Cut list/Hole table、Centerline/Centermark/Virtual Sharp、Hatch region、MBD/Inspection table、Styles panel、Format painter、Format、Units and precision。
6. **Render Studio**：Appearance、Appearance set、Appearances library、Environment、Environments library、Camera panel、Scene list/panel、Projector、Transform、Light、Volume、Render options、Quality（Production/Medium/Preview/Custom）、Aspect ratio（From View/4x3/16x9/Custom）、Format（JPG/PNG）、Width/Height、Max samples、Max time、Converged pixel ratio、Tessellation quality（Auto/Medium/Coarse/Fine/Custom）、Tone mapping、Aperture、Abbe number、Anisotropy、Bumps、Diffuse roughness、IOR、Metallic、Reflection/Transmission/Emission、Thin walled、Volume color/reference distance、AI denoiser、Dome（Mode 默认 Infinite）等。
7. **视图/评估/显示**：Camera and render options、View cube、View tools、Back/Front/Left/Right/Top/Bottom view（Shift+2/1/3/4/5/6）、Isometric view（Shift+7）、Perspective view、Orient normal to sketch plane、Named views（Shift+V）、Previous view、Zoom to fit（f）、Zoom to window（w）、Zoom in（Shift+Z）、Zoom out（z）、Pan、Rotate、Precision rotate、Shaded/Shaded without edges/Shaded with hidden edges、Hidden edges visible/removed、Tangent edges、Translucent、Highlight boundary edges、Section view（Shift+X）、Graphics preferences、Measure（`[`）、Mass、Display mass properties、Center of mass、Analysis tools、Curve/surface analysis（Shift+C）、Deviation/Curve deviation/Surface deviation、Connection analysis、Dihedral（Shift+D）、Draft analysis、Thickness analysis、Flatten surface、Interference detection、Zebra stripes、Reflection analysis、Curvature color map/Color map、Model visualization tools、Model evaluation tools、Isolate（Shift+I）、Make transparent（Shift+T）、Hide selected part（y）/Show selected part（Shift+y）/Show all、Hide/show planes（p）/sketches（Shift+H）/mates（j）/Mate connectors（k）、Display states、Named positions。
8. **账户、计划与平台**：Account Menu、Administrator、Permissions、Private/Public/Public document、Subscription、Plan Type（Standard/Professional/Enterprise/Educator/Student）、Onshape Labs、App store、Integrations/Connect service、Numbering schemes、Release management、Enterprise Activity/Analytics、Job queue、Onshape Labs（除 Government）。
9. **WebGL/渲染能力**：32-bit indices（优化渲染性能）、Anisotropic texture filtering（高质量纹理）、Float buffer blending（剖面端盖；无则禁用）、Float texture（剖面与透明混合；无则禁用）、High precision fragment shader（环境光遮蔽所需；无则禁用）、GL renderer/GL vendor、WebGL、Triangle（显卡渲染图元）。
10. **拓扑对象**：Entity、Edge（由顶点界定的曲线）、Face（有面积、由边界的部分）、Vertex/Vertices（边端点零维点）、Surface（一个或多个面无体积）、Part（单一闭合实体）、Mesh 相关。

### 4.9 Icon Glossary 归纳（按功能区）

**结构与视图**：页签 `Buttons` / `Indicators` / `All icons`；H3 分组包括 Document panel、Side panel（Part Studio/Assembly/Render Studio 等多次出现）、Feature list、Parts list、Instances list、Linked references、Mates、Side panels、Symbols、Geometric tolerance symbols、Right panel、Document、Tab、Release and revision state。**抽取限制：图标本体全部为 `[image]`，无法确认图形/颜色，只能依据名称与动作还原语义。**

**高价值语义抽样**：

1. **General/Document panel**：Copy link（复制当前 tab+workspace/version 的 URL）、FeatureScript notices、Notifications、Action items、App Store、Learning Center、Help Menu、Measure details、Analysis tools、Mass and section properties、Add、Tab manager、Insert new tab、Search；Document panel 的 Versions and history、Compare history entries、Repair（View in repair）、Hide/show merges、Hide/show automatic versions、Create version、Release drafts、Comments、Filter（整文档/本 workspace）、Tag entity、Markup、Browse for attachment、Document notes、Refresh/Edit notes、Where used、Performance、AI Advisor、Explore Onshape、Action items。
2. **对象类型指示**：Application、Material library、Feature Studio、CAM Studio、PCB Studio、Render Studio、Part Studio、Assembly、Variable Studio、Drawing、Folder、Import/Document upload、Part、Composite part、Sketch、Surface、Flat pattern、Insert entire Part Studio as rigid。
3. **消息与状态**：Information message、Warning message、Error message，以及“顶层折叠组内存在信息/警告/错误”的三种聚合指示。
4. **Feature list**：缺失/断选择、草图未全定义、一个或多个特征重建失败（可点击过滤）、折叠文件夹含警告/错误、表达式动态抑制、含评论、同文档 tab 版本引用且最新/有更新、修订引用且最新/有更新、派生/链接引用与源不同步、使用链接 in-context/活动 in-context/断裂 in-context 引用、特征或草图显示/隐藏。
5. **Parts list**：含已忽略故障、含评论、已发布且为最新修订、修订已废弃、因新发布自动废弃、显示/隐藏。
6. **Instances list**：装配/子装配、实例、导入（派生）、已配置实例、已配置装配/子装配、装配固定到原点、Mate 有极限、实例固定、子装配含固定实例、自由度数、全部实例固定（全刚体）、配置装配全刚体、子装配锁定当前位置/跟随命名位置、已发布项、in-context 主实例/活动主实例/先前主实例、显示/隐藏、启用细分、表达式动态抑制、装配错误。
7. **Linked references**：更新可用、链接到分支最新版本、有更新版本、修订为最新、有更新修订、pinned 且最新版本、pinned 且最新修订、pinned 且有更新版本/修订、子装配子项有更新、pinned 子项有更新等；文档 Tab 也有一组版本/修订/pinned 过期指示。
8. **Mates**：Fastened（全约束）、Revolute（Rz）、Slider（Tz）、Planar（Tx,Ty,Rz）、Cylindrical（Tz,Rz）、Pin slot（Rz,Tx）、Ball（Rx,Ry,Rz）、Parallel、Tangent、Width、Group；以及 X/Y/Z 线性方向、X/Y/Z 最小/最大线位移极限、X/Y/Z 旋转、X/Y/Z 最小/最大旋转极限。
9. **Drawing**：Insert/Projected/Auxiliary/Section/Aligned section/Broken-out section/Detail/Break/Crop view；各类 Dimension；Hole/thread callout、Datum、Geometric tolerance、Surface finish、Weld、Edge condition、Note、Callout、Table/BOM/Cut list/Hole table/Custom table；2 point centerline、Edge to edge centerline、3 point/2 point circle centerline、Centermark、Virtual sharp；Line/Circle/Arc/Rectangle/Spline/Sketch point、Hatch region；Trim、Horizontal/Vertical/Coincident/Perpendicular/Tangent/Parallel；Format painter；Inspection item/Hide inspection items。**Grip 点语义**：实心圆=resize/move；空心圆=rotate；实心菱形=flip；点附着/边附着拖动。
10. **Symbols/GD&T**：°（Degree）、⌀（Diameter）、℄（Centerline）、⌵（Countersink）、↧（Depth）、⌴（Counterbore）、□（Square）、⌒（Arc length）、±（Plus/Minus）、Ⓤ（Unequally disposed profile）、Ⓘ（Independency）、Continuous feature、Spot face、▷（Translation）；GD&T 特征含 Position、Concentricity/Coaxiality、Symmetry、Parallelism、Perpendicularity、Angularity、Cylindricity、Flatness、Circularity/Roundness、Straightness、Square、Profile of a surface/line、Circular/Total runout；修饰符 MMC/LMC/RFS/Free state/Tangent plane/Unequally disposed/Projected tolerance zone/Statistical tolerance/Continuous feature/Spot face/Translation。
11. **Right panel（通用视图）**：Fit all、Isometric、Front、Back、Top、Bottom、Left、Right、Toggle transparency；**Render Studio** 右栏：Appearance、Environment、Camera、Scene；场景对象/状态含顶层场景、Part Studio/配置 Part Studio、Assembly/配置 Assembly、Part/配置 Part、surface/face(mesh)、装配文件夹、Projector、非 Auto 细分、显示/隐藏、平移/旋转/缩放变换、appearance/linked appearance、decal/linked decal、Volume/Light（Advanced）。
12. **PCB/Feature Studio/CAM/Render Studio**：PCB 的 Import/Export IDF、Import/Push/Pull board、Sync from/to Onshape、Update library、Search/Clear search、Settings、Help、Boards and Libraries、All component mappings；状态含 Linked board、Mappings、No footprint、Footprint、Linked footprint、Component、Linked component、Component error、Rigid/Flexible board、Board outline、PCB Outline、Keep-in/Keep-out、Hole/Plated/Non-plated、Layers、Stackup、Dielectric、Copper、PCB Data。Feature Studio 的新建特征/参数/查询/求值/数学/草图/操作函数、Import、Format Studio、Co-complete、Monitor、Profile、Module outline、Back/Forward reference；gutter 错误/警告/信息及“过期”淡化态；notices 无错/有警告/有错误；import label 最新/有更新；已发布 FeatureScript 版本。CAM 的 Insert、Create job/machine/setup/tool/toolpath/work plane。Render Studio 的 Render scene、Transform、Projector、Match scene properties、Volume、Light、Appearance functions、Modifiers。
13. **Document/Tab/Release 状态**：教育订阅创建的文档、workspace 正在更新/计划更新、有关联项（如图纸）、课堂教育者、外部公司连接项；Tab 的链接文档有更新、仅 pinned 子项过期、子项有更新、派生/链接不同步；发布/修订的最新、非最新、待批准、废弃、已发布 FeatureScript 版本、version、workspace。

## 5. 工作流、规则与错误状态

### 5.1 典型端到端流程

1. **视图→命名视图**：旋转到目标视图 →（可选）开透视、Zoom to fit、开剖面并调整 → View Tools → Named views → 命名并加号 → 以后 Shift+V 或下拉调用；删除用 X；workspace 内数量不限。
2. **剖面→测量/命名**：选择平面/面/Mate connector/圆柱面/锥面 → Camera and render options → Section view → 拖球/箭头/角度/数值 → 排除或包含项 →（可选）默认平面/Flip plane → 保存 Named View；可在剖视图中 Measure 面/边/顶点；N 恢复法向。
3. **隐藏/隔离→编辑被遮挡几何**：悬停按 y 隐藏，Shift+y 显示；或 Isolate（Shift+I）→ 勾 `Select transparent geometry` → 调整透明度/扩展距离或连接 → 测量/分析/编辑透明几何 → Esc 退出；设置跨会话保留。
4. **测量→变量/尺寸**：选择实体 → Measure（`[`）→ 选择类型/单位 → 点击值取全精度 → 复制到尺寸；Part Studio 中点变量图标创建 driven/measured variable，测量变化时变量更新。
5. **质量属性→工程图**：选择零件/面 → Mass properties → Part/Face 页 → 必要时 Override → 检查 Show calculation variance/缺失材料警告 → 右键 Show center of mass → 在工程图中引用质心。
6. **分析→修正模型**：Draft analysis 常驻，边改零件边看颜色；Thickness analysis 结果随编辑自动更新；Curve/Surface 拖动曲线时曲率梳动态更新；Flatten surfaces 改 Rip/Origin 后需再次 Flatten。
7. **AR 查看**：移动端 View Cube → AR view → 相机扫描平面 → 放置 → 手势调整 → Measure/剖视/存图 → Exit View；或 Import from Scan 后通过 Derived/Mate 对齐实景。
8. **AVP 投射**：Settings 配对（5 位码）→ Part Studio/Assembly 工具栏 AVP 图标 → AVP 启动 PTC 3D → 选择设备 → 编辑同步（除草图/曲面/图形操作/相机渲染选项）→ 断开单个文档或 Disconnect all。

### 5.2 文档明确写出的规则、限制与更新行为

- **视图设置持久性**：Orient normal to sketch on edit 跨所有未来会话；Named views 按 workspace 保存；Isolate/Make Transparent 的 `Select transparent geometry` 与透明度滑块跨对话框、跨文档会话保留；Graphics preferences 的 Reset to default 同时重置 General 与 Sketch。
- **互斥**：Translucent 下隐藏边可见/移除不可用；Zebra stripes 在选中 Color map 时自动关闭。
- **平台限制**：Tangent edges 仅新建模型、仅浏览器；Zoom to window/Zoom to selection 不支持 iOS/Android；Measure 的参考坐标系仅桌面浏览器；Isolate 的 connectivity 仅 Assembly；iOS Isolate 仅 distance；AR View 仅 iOS/Android；AVP 仅 iOS 配对。
- **输入限制**：Section view 的圆柱面/锥面/平面面/Mate connector 选择；Deviation 曲线链必须连续、曲面只能两面；Connection 多连接端点不分析；Flatten 面必须连续；Interference 需至少两个零件。
- **计算语义**：Deviation 曲面为单侧、可负；Mass properties 为近似值、按完整零件分别计算后相加、无材料零件排除；Thickness 的 rolling ball 分布连续、ray 分布常有尖锐不连续；Flatten “不保证精确”。
- **性能**：View in high quality 可能轻微降性能；Thickness 使用云端实例，分五阶段；Mass properties 精度随几何复杂度变化。
- **权限/平台**：AR view 对 View only 权限开放；AVP 端只读；Apple Vision Pro 版本不匹配必须更新应用；Onshape Labs 不适用于 Government 计划（术语表）。

### 5.3 常见错误与处理

- **Mass properties 图标变红 + `One or more parts do not have a material defined.`**：给所选零件赋材料后质量才计入；用 Show center of mass 找出缺材料实例。
- **Thickness analysis 不支持闭合成 composite**：仅原生零件与 mesh；需先处理模型类型。
- **Flatten surfaces 畸变过大**：用 Split 增加边、选 Rip edges 撕裂后重新 Flatten；或调整 Origin/Offset/Angle。
- **Tangent edges 选项不可见/无效**：确认是新建模型且浏览器平台。
- **Zoom to selection 不可见**：必须先选择实体。
- **Section view 关闭后找不到编辑入口**：双击剖面，或 Camera and render options/右键 `Edit section view`。
- **AVP 无法投射**：检查 Onshape 应用与 AVP 版本一致性、同一 WiFi、PTC 3D 应用已启动。
- **AR View 无平面**：确认相机权限、移动设备寻找水平/垂直平面。

### 5.4 文档质量注记（必须披露）

- **可用位置冲突**：Measure 页=Part Studio/Assembly/Drawing，但 Model Evaluation Tools 总览称 Sketch 也可用；Graphics preferences 主题页=Part Studio/Assembly，术语表=Sketch/Part Studio/Assembly；Highlight boundary edges 主题页=Part Studio，术语表=Sketch/Part Studio/Assembly；Interference detection 主题页=Part Studio/Assembly，术语表=Sketch/Part Studio/Assembly；Dihedral 主题页=Sketch/Part Studio，术语表=Part Studio；Curvature color map 主题页=Sketch/Part Studio，术语表=Part Studio/Assembly；Flatten surfaces 主题页=Sketch/Part Studio，术语表=Part Studio；Named views 主题页=Part Studio/Assembly，术语表=Sketch/Part Studio/Assembly；Section view 主题页=Part Studio/Assembly，术语表=Sketch/Part Studio/Assembly/Render Studio。
- **快捷键冲突**：主题页 Shift+方向键=90°，术语表 Precision rotate=Shift+方向键 3°；主题页 Ctrl+方向键=5°，术语表 Rotate=方向键 15°、Pan=Ctrl+Shift+方向键“15 度增量”；以主题页为准时需注明术语表描述不一致。
- **“12 个分析工具”口径**：Analysis Tools 菜单与子页实际列出 **11 个工具**（Curve/Surface、Deviation、Connection、Dihedral、Interference、Zebra、Reflection、Curvature Color Map、Draft、Thickness、Flatten）；本组内共 12 个 Analysis 相关主题=总览 1 + 工具 11。若任务书称 12 个工具，应为口径差异。
- **图像信息缺失**：View Cube 菜单项、Graphics preferences 对话框、图标表、GD&T 符号均无视觉细节；AR/AVP 页面大量步骤依赖截图，文本只能还原字段与顺序。
- **Flatten 内部描述冲突**：Show distortion 在步骤正文中称“洋红（magenta）”，在视频转录中称“蓝色=拉伸/张紧、红色=压缩/起皱”；两者不能同时作为颜色验收依据，需以实机为准。
- **拼写/抽取噪音**：AR View 的 `Lengh unit`（应为 Length unit）；导航表列合并；`Named Views` 的 TOC 路径末尾空格；术语表大量 `n/a` 与 `unassigned` 混用。

## 6. 与其他章节的关系

- **My Account Preferences → Mouse Controls**：Camera and render options 与 View Navigation 均显式引用；滚轮方向可配置；快捷键可在 My Account 自定义。
- **Keyboard Shortcuts and Hotkeys**：Analysis Tools 总览引用，说明无快捷键工具可分配；Glossary 每条给默认快捷键。
- **High quality mode**：View in High Quality 的性能说明入口。
- **Repairing Imported Models**：Highlight Boundary Edges 的下游修复流程。
- **Surface modeling**：Curve/Surface Analysis 的延伸阅读；Graphics Preferences 也称“尤其适合曲面建模”。
- **Variable**：Measure 的变量图标跳转到 Variable 主题；Mass properties 的取值/驱动关系同理。
- **Materials / Appearance**：Mass properties 依赖材料密度；缺失材料警告；Appearance panel 与 Mass properties 图标相邻。
- **Image libraries**：Reflection Analysis 的环境图来自图像库；可创建新 Reflection 图像库。
- **Sheet metal table and flat view**：Measure 在钣金 Part Studio/Flat View 间切换测量上下文。
- **Drawings**：Measure 在工程图的单位/双单位/关系类型；Mass properties 质心可插入图纸；Drawing 视图工具另有 Section view（与 3D Section view 不同）。
- **Assemblies / Mates / Display states / Named positions / Exploded views**：Isolate/Make Transparent 的 connectivity 依赖 Mate；Hide/Show 的 Switch to 与子装配；AVP 的 Named views/Exploded views 同步限制；术语表大量装配状态。
- **Simulation**：术语表覆盖 Simulation 载荷、颜色标尺、结果字段、连接方法；Analysis Tools 本身不包含 Simulation。
- **Render Studio / PCB Studio**：投影、Perspective/Orthographic、Camera/Environment/Light/Appearance 术语与图标表右栏；PCB Studio 的视图与同步图标。
- **FeatureScript / Feature Studio**：Icon Glossary 的 gutter/notices/co-module 状态；Glossary 的 FeatureScript 术语。
- **Release management / PDM**：Icon Glossary 的发布/修订状态与 Linked references，是版本/权限语义的上游。
- **AR / Apple Vision Pro**：与移动端 View Cube、Measure、Section view、评论、配置、材料显示交叉。

## 7. 对 LubanCAD 的可执行启示

> 仅写文档能支撑的结论；`[文档明确]` 表示语料直接写明，`[推断]` 表示由文档组合推导。

### 7.1 需要补齐的 UI 表面

- **View Cube + Camera and render options 下拉**：桌面必须有约 18 项菜单（Top/Bottom/Front/Back/Left/Right、Isometric/Dimetric/Trimetric、Zoom to fit、Perspective、Shaded、Shaded without edges、Shaded with hidden edges、Hidden edges removed、Hidden edges visible、Translucent、Section View），并支持右键 `Set as default`。`[文档明确]`
- **Named Views 对话框**：名称输入 + 加号、Select a view 下拉、X 删除、Shift+V、按 workspace 存储、匹配自动选中。`[文档明确]`
- **Graphics Preferences 对话框**：Viewport/Shaded bodies/Phantom edges/Mesh bodies/Active sketches/Inactive sketches/Construction lines 七组，含颜色选择器、滑块/数值输入、Reset to default。`[文档明确]`
- **Section View 完整交互**：多类型剖切对象、可吸附操纵器、深度/角度/数值、翻转、Include/Exclude、默认平面、Edit/Turn off、双击重开、Named View、Measure 兼容。`[文档明确]`
- **Hide/Show、Isolate、Make Transparent 三套上下文菜单**：列表与图形区右键、眼睛图标、all/other 语义、y/Shift+y、Shift+I、Shift+T、选择透明几何、扩展距离/连接、设置持久。`[文档明确]`
- **Measure 对话框**：三个下拉、动态选择、结果字段、粗/细虚线语义、星号公差提示、点击锁定/精度切换、参考坐标系、变量图标、复制。`[文档明确]`
- **Analysis Tools 菜单 11 项 + 每项对话框**：至少覆盖 11 个工具的名称、入口、快捷键与主要选项。`[文档明确]`
- **Mass properties 对话框**：Part/Face 两页、材料/密度、Override、Show calculation variance、缺失材料警告与红色图标、Show center of mass。`[文档明确]`
- **移动端**：3D Rotate Lock、View Cube 菜单、AR View、AR Measure、AVP 配对/投射（若产品支持）。`[文档明确/推断]`

### 7.2 参数与默认值清单（可直接做测试断言）

- Perspective view 默认关闭；Highlight boundary edges 默认关闭，可用右键 Set as default。`[文档明确]`
- Orient normal to sketch on edit 跨会话保持。`[文档明确]`
- Shaded with edges 默认；Hidden edges removed 默认；Tangent edges Visible 默认。`[文档明确]`
- Ambient occlusion 默认 **37.5%**；FOV 范围 **20–120°**（仅透视）。`[文档明确]`
- Phantom tangent edge width 默认 **0.5 px**；Mesh line width 默认 **0.3 px**；线宽范围 **0.1–3 px**；Shininess **1–100%**。`[文档明确]`
- Construction line：First dash **4 px**（1–50）、First gap **6 px**（0–50）、Second dash **30 px**（1–50）、Second gap **6 px**（0–50）。`[文档明确]`
- Curve/Surface：U/V curves **2–64，默认 8/8**；Zebra 默认 **35 stripes**；Show edges 默认开。`[文档明确]`
- Analysis 选择持久性：菜单入口 non-persistent，快捷键入口 persistent。`[文档明确]`
- Draft：蓝色达标/黄色过陡/红色底切；浅蓝正、深蓝负。`[文档明确]`
- Thickness：4 种方法；五阶段进度文案。`[文档明确]`
- Flatten：Export Format 4 种；`Flatten` 按钮；不创建 Part；不保证精度。`[文档明确]`
- Mass properties：Part 页 6 类字段 + Face 页 4 类字段；惯性矩相对重心；无材料排除；近似值。`[文档明确]`
- Measure：12 种 Measure type；6 种长度单位；2 种角度单位；参考坐标系仅桌面；变量仅 Part Studio；动态更新仅 Assembly 且 Section view 下不工作。`[文档明确]`
- 视图快捷键：Shift+1..7、Shift+X、Shift+V；f/w/`[`/Shift+R；y/Shift+y；Shift+I；Shift+T；Shift+C/Shift+D。`[文档明确]`

### 7.3 交互与选择规则

- View Cube 箭头增量旋转 15°/90°/5°；方向键 15°/90°/5°；触控屏手势映射见 4.1。`[文档明确]`
- Section view 操纵器中心球可吸附到任意推断点（含圆柱质心）；箭头改深度；点击操纵器翻转方向；角度指示器拖角度；数值字段可键入。`[文档明确]`
- Interference 框选方向：左上→右下=完全包围；右下→左上=接触即选。`[文档明确]`
- Isolate/Make transparent：滑块端点自动取消 `Select transparent geometry`，再移动自动恢复；扩展 distance/connectivity；累积快捷键与 `Select other`。`[文档明确]`
- Measure：多于两实体给出最小/最大距离、总面积、中心轴距离或长度；两线可判断平行；点击值锁定虚线；点击结果切换精度。`[文档明确]`
- Mass properties：多选属性相加；相交零件按完整零件分别计算再相加；可选 Mate connector 计算惯性矩。`[文档明确]`
- Flatten：改 Rip edge/Origin 后必须再次点 Flatten；Show edges 默认开，文档另称“仅在 Show facets 关闭时 Show edges 才控制边显示”。`[文档明确]`
- AR View：双指原地旋转、捏合缩放、拖动平移、双击重置；平面指示浅蓝框；环境点橙色；`Reset`/`Gestures` 在右下。`[文档明确]`

### 7.4 事务、撤销、版本、权限与协作约束

- **视图状态不是建模事务**：Named Views/Graphics prefs/Orient normal/Isolate 设置均为显示层持久化，文档未把它们描述为可撤销的模型事务；不应写入 BIS 几何或特征历史。`[推断]`
- **Named views 按 workspace 存储**，数量不限；`[文档明确]` 说明应绑定 workspace 而非全局文档。
- **质量覆盖**必须是可审计的显式覆盖值，且需与材料密度计算区分；文档明确 Override 后会重算。`[文档明确]`
- **AR/AVP 只读**：View only 权限也能 AR 查看；AVP 端不可编辑；投射的是查看态，不应产生编辑事务。`[文档明确]`
- **评论/标注同步**：AVP 端评论高亮但图标不显示；浏览器端图标显示；LubanCAD 若支持远端查看，需要明确“评论标记”与“评论图标”的差异。`[文档明确]`
- **版本/引用状态**：Icon Glossary 的 Linked references/pinned/out-of-date/obsolete 语义可直接映射为树行状态与更新入口。`[文档明确]`
- **权限**：AR view 对 View only 开放；Measure 在工程图中对 view-only 用户仍可测量（文档明确“尤其有用”）；`[文档明确]` 说明测量是只读能力，不应要求编辑权限。
- **持久化范围**：Isolate/Make Transparent 设置跨文档会话；Graphics Preferences 的 Reset 同时重置 General/Sketch；Orient normal 跨所有未来会话。`[文档明确]` 需要在用户偏好/会话存储层做版本化，而不是文档事务。

### 7.5 可写成测试断言的验收点

1. 默认 AO=37.5%，FOV 范围 20–120，线宽 0.1–3 px，phantom 0.5 px，mesh 0.3 px，construction 4/6/30/6。`[文档明确]`
2. 默认 Shaded with edges + hidden edges removed + tangent edges visible；Translucent 下隐藏边两项不可用。`[文档明确]`
3. Tangent edges 在非新建模型/非浏览器平台不出现或不可用。`[文档明确]`
4. Named View 保存/恢复透视、缩放、朝向；Shift+V；匹配时自动选中；X 删除。`[文档明确]`
5. Section view：预选平面/面可开启；操纵器出现；N/右键 View normal to；排除/包含；默认平面/Flip；Named View 兼容；Measure 可用。`[文档明确]`
6. Hide/Show all/other 的作用域是“当前 tab 同类型”；y/Shift+y；Switch to 源 Part Studio/子装配。`[文档明确]`
7. Isolate/Make transparent：透明几何可选/不可选；滑块最左/最右行为；distance/connectivity；设置跨会话。`[文档明确]`
8. Measure：类型/单位下拉；12 类结果；粗虚线黑/红/绿/蓝；细虚线角度；星号公差；点击锁定与精度切换；参考坐标系仅桌面；变量仅 Part Studio；动态更新仅 Assembly 且 Section view 下关闭。`[文档明确]`
9. Analysis：11 个工具菜单项；菜单 vs 快捷键的持久性差异；Zebra 默认 35；U/V 默认 8；Draft 三色；Thickness 4 方法；Flatten 4 导出格式且不创建 Part。`[文档明确]`
10. Mass properties：Part/Face 页字段；无材料警告与红色图标；Override 重算；惯性矩相对重心；质心显示/右键常显。`[文档明确]`
11. AR View：View Cube 入口；平面浅蓝框；双击重置；Measure 环境点橙色；Section view 开关；View only 可用。`[文档明确]`
12. AVP：5 位配对码；仅 Part Studio/Assembly 可投射；选项卡同步、平移/旋转不同步；草图/曲面/图形操作/相机渲染选项不可见。`[文档明确]`
13. Icon/状态：特征失败/欠定义/动态抑制/引用过期/零件废弃/实例自由度/Mate 极限/发布状态等树行状态可查询、可点击过滤。`[文档明确]`

### 7.6 建议的优先级（推断）

1. **P0**：View Cube/Camera & render options 默认值与快捷键、Named Views、Section View、Hide/Show/Isolate/Make Transparent、Measure、Mass Properties —— 这些是 Part Studio/Assembly 日常闭环。
2. **P1**：11 个 Analysis 工具（尤其 Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten），以及 Graphics Preferences 全套参数。
3. **P2**：AR View / Apple Vision Pro 与移动端 3D Rotate Lock；若产品定位不含 XR，可只保留术语/状态映射。
4. **贯穿**：Glossary 的 Context/Plan Type 模型、Icon Glossary 的树行状态/引用状态/GD&T 符号体系，应作为 UI 文案与状态机的共享词汇表。
