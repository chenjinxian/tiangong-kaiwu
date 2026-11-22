# Part Studios — 草图基础与草图工具（ps-sketch）分析报告

## 1. 本章概览

- **主题数**：58；**总词数**：23,784（组文件 `Topics: 58, Words: 23784`）。
- **覆盖子域**：Part Studio 外壳与工具栏；草图入口/草图对话框/平面与 Mate connector；基本绘图图元（线、矩形变体、圆、圆弧变体、椭圆、圆锥曲线、多边形、样条、Bezier、点、文本）；投影与派生（Use、Intersection、Construction、Pierce）；草图编辑（圆角、倒角、修剪、延伸、分割、偏移、槽、镜像、线性/圆周阵列、Transform）；尺寸标注（驱动/从动、负值、中心线尺寸）；约束体系（15 个手动约束 + 自动推断 + 自动生成约束）；约束管理器与草图诊断（Profile inspector）；DXF/DWG 与图片插入；故障排查。
- **文档更新日期**：语料中**没有任何页面给出更新日期**，无法判断时效；仅能从内容推断覆盖至 Flow 约束等较新功能。
- **整体质量/抽取限制**：
  - 图片全部只剩 `[image: alt]`，大量步骤（尤其 Sketch Chamfer、Sketch Fillet、Tangent、Use 的示例）是纯截图说明，文字信息有限。
  - 表格被压平成 `|` 分隔行，阵列“编辑工具”表只剩图标+描述，无法还原图标形状。
  - 视频仅有转录文本（本组基本未见视频转录）。
  - 多数工具页很短（61–454 词），以“步骤 + 可选的即时尺寸输入”为主，**未说明**默认值的地方本报告标注“文档未说明”。
  - 发现少量原文内部不一致：Insert Image 的 DESC 写 PNG/JPEG/BMP，正文写 PNG/JPEG/GIF/BMP；Slot 的“同一（未链接）尺寸”与“编辑尺寸后所有槽都变化”表述自相矛盾；“Inscribed Polygon”被描述为“polygon on the outside of the drawn circle”（与通常内接多边形语义相反，按原文记录）。
  - “Available in”字段大多明确（Sketch；少数约束也支持 Drawing；Midpoint Line 有移动端限制），这是本组最可靠的平台边界信息。

## 2. 主题清单与逐篇摘要

> URL 为语料中的站内相对路径（未联网补全域名）。共 58 行。

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Part Studios | Part Studios | /Content/PartStudio/part_studios.htm | Part Studio 容器、Feature list/Rollback bar、过滤搜索、Tab 管理、工具栏定制、Tab/零件右键菜单、零件 Properties、iOS/Android 导航与标签页文件夹。 |
| Sketch Basics | Part Studios > Sketch Basics | /Content/Sketch/sketch_basics.htm | 草图入口与 Sketch 对话框、平面/面/Mate connector、Disable imprinting、即时尺寸与变量语法、推断、复制/粘贴/派生草图、Show expressions、注释、Shift+h。 |
| Sketch Tools | Part Studios > Sketch Tools | /Content/Sketch/sketch_tools.htm | 草图工具栏总览、下拉组记忆、S 快捷工具栏、Alt/Opt+C 工具搜索、Extrude/Revolve 从草图直接接受并全选面域、曲线工具集合清单、移动端工具栏。 |
| Line | Part Studios > Sketch Tools > Line | /Content/Sketch/line.htm | 连续线段/拖拽画线、即时输入长度或 `=#` 变量、Shift+a 或悬停端点切换 Tangent Arc 后自动切回 Line。 |
| Midpoint Line | Part Studios > Sketch Tools > Midpoint Line | /Content/Sketch/midpoint_line.htm | 以中点为起点对称画线；**iOS/Android 仅能查看/编辑桌面插入的 Midpoint line**，不能创建。 |
| Corner Rectangle | Part Studios > Sketch Tools > Corner Rectangle | /Content/Sketch/corner_rectangle.htm | 对角两点矩形；即时输入长、宽；ALT 约束两边相等成正方形；快捷键 g。 |
| Center Point Rectangle | Part Studios > Sketch Tools > Center Point Rectangle | /Content/Sketch/center_point_rectangle.htm | 中心点+角点矩形；即时长/宽；ALT 正方形；快捷键 r。 |
| Aligned Rectangle | Part Studios > Sketch Tools > Aligned Rectangle | /Content/Sketch/aligned_rectangle.htm | 先画一条基线，再沿垂直方向拉出对齐矩形；即时长/宽；ALT 正方形。 |
| Center Point Circle | Part Studios > Sketch Tools > Center Point Circle | /Content/Sketch/center_point_circle.htm | 圆心+半径点（或拖拽）；即时输入直径；快捷键 c。 |
| 3 Point Circle | Part Studios > Sketch Tools > 3 Point Circle | /Content/Sketch/3_point_circle.htm | 圆周三点定圆（第三点决定直径）；可拖拽前两点；即时直径。 |
| Ellipse | Part Studios > Sketch Tools > Ellipse | /Content/Sketch/ellipse.htm | 圆心+主轴半径+垂直次轴半径；即时输入主轴/次轴直径；长短轴由绘制大小决定。 |
| 3 Point Arc | Part Studios > Sketch Tools > 3 Point Arc | /Content/Sketch/3_point_arc.htm | 两端点+半径点画弧；可拖拽；即时半径；靠中点推断画半圆；快捷键 a。 |
| Tangent Arc | Part Studios > Sketch Tools > Tangent Arc | /Content/Sketch/arc_tangent.htm | 从线端继续画相切圆弧；点击或拖拽；即时半径；与 Line 工具可相互切换。 |
| Center Point Arc | Part Studios > Sketch Tools > Center Point Arc | /Content/Sketch/center_point_arc.htm | 圆心、起点、终点画弧；即时半径。 |
| Elliptical Arc | Part Studios > Sketch Tools > Elliptical Arc | /Content/Sketch/elliptical_arc.htm | 先放临时构造椭圆，再在椭圆边上定弧起终点；构造椭圆自动删除；即时主/次轴直径；可吸附轴/象限点。 |
| Conic | Part Studios > Sketch Tools > Conic | /Content/Sketch/conic.htm | 起点、终点、控制点 + rho 值画椭圆/抛物线/双曲线；rho>0.5 双曲、=0.5 抛物、<0.5 椭圆。 |
| Inscribed Polygon | Part Studios > Sketch Tools > Inscribed Polygon | /Content/Sketch/inscribed_polygon.htm | 拖出构造圆生成多边形；键盘或拖拽定边数，最少 3、最多 50；即时直径。 |
| Circumscribed Polygon | Part Studios > Sketch Tools > Circumscribed Polygon | /Content/Sketch/circumscribed_polygon.htm | 在构造圆内生成外切多边形；边数规则同 Inscribed（3–50）；即时直径。 |
| Spline | Part Studios > Sketch Tools > Spline | /Content/Sketch/spline.htm | 多点样条，双击结束；拖点/白色切线手柄；点与手柄可标注/约束；只能首尾相连闭合；右键 Confirm spline 结束于当前点前一点。 |
| Bezier | Part Studios > Sketch Tools > Bezier | /Content/Sketch/bezier.htm | 沿控制多边形生成 Bezier；修剪/分割保留次数与控制点；分割后两曲线在分割点重合、控制点独立；不可闭合；最大次数 15；Escape bezier 删除当前曲线。 |
| Spline Point | Part Studios > Sketch Tools > Spline Control Point | /Content/Sketch/spline_control_point.htm | 在样条或 Bezier 控制多边形上增加控制点；控制点属于样条定义（实心蓝），不同于重合到样条的草图 Point（白底蓝边）。 |
| Point | Part Studios > Sketch Tools > Point | /Content/Sketch/point.htm | 创建点，可施加与其它草图实体相同的多种约束；快捷键 Shift+s。 |
| Text | Part Studios > Sketch Tools > Text | /Content/Sketch/text.htm | 最多 250 字符的草图文本；可拉伸/标注/约束；字体、粗体/斜体、双向翻转；可转表达式并拼接字符串/长度/角度/数值变量；不可在草图内阵列/镜像。 |
| Use | Part Studios > Sketch Tools > Use | /Content/Sketch/use.htm | 将零件/草图的边或轮廓边（silhouette edge）投影到当前草图平面；悬停预览；silhouette 无预选、须悬停面；仅支持可追踪轮廓边。 |
| Intersection | Part Studios > Sketch Tools > Intersection | /Content/Sketch/intersection.htm | 将曲面/面与当前草图平面的交线投影为草图；随几何更新；交点处由 Intersection/Pierce 约束固定。 |
| Construction | Part Studios > Sketch Tools > Construction | /Content/Sketch/construction.htm | 新建构造几何或把已有草图实体切换为构造；q 键切换；构造几何不参与特征创建。 |
| Sketch Chamfer | Part Studios > Sketch Tools > Sketch Chamfer | /Content/Sketch/sketch_chamfer.htm | 对顶点或两条边做倒角；默认 45°，两个距离字段；多选时首个尺寸驱动其余；过大显示红色，无法生成时黄色警告条；可拖操纵器。 |
| Sketch Fillet | Part Studios > Sketch Tools > Sketch Fillet | /Content/Sketch/sketch_fillet.htm | 对点或两条曲线（线/弧/样条）做圆角；Shift+f；多选同尺寸；留下虚拟尖点（virtual sharp）与半径尺寸；过大红色；可拖操纵器或数值修改。 |
| Trim | Part Studios > Sketch Tools > Trim | /Content/Sketch/trim.htm | 修剪到首个交点/边界，无交点则整条删除；可拖过多个实体；可删除孤立草图点；Bezier 修剪保留次数/控制点；快捷键 m。 |
| Extend | Part Studios > Sketch Tools > Extend | /Content/Sketch/extend.htm | 线或弧延伸到首个交点/边界，无边界则止于释放点；弧可双击/拖拽自动补全到边界；快捷键 x。 |
| Sketch Split | Part Studios > Sketch Tools > Sketch Split | /Content/Sketch/sketch_split.htm | 拆分开放/闭合曲线；开放曲线需 ≥1 点，闭合曲线需 ≥2 点；Bezier 分割后两段次数/控制点相同且分割点重合。 |
| Offset | Part Studios > Sketch Tools > Offset | /Content/Sketch/offset.htm | 按指定距离/方向偏移曲线或环；点方向箭头或输入负距离反向；回车后继续点其它曲线做等距偏移；快捷键 o。 |
| Slot | Part Studios > Sketch Tools > Slot | /Content/Sketch/slot.htm | 围绕选中草图曲线（线/弧/样条/链/闭合轮廓）生成槽；直径尺寸控制槽宽；预选多曲线共享一个尺寸；多链成整体槽，逐条选则分别成槽。 |
| Sketch Mirror | Part Studios > Sketch Tools > Sketch Mirror | /Content/Sketch/sketch_mirror.htm | 关于草图线、平面、零件面或边镜像草图实体；可先选实体后点工具，或先点工具再选镜像线/实体；Esc 退出。 |
| Sketch Pattern | Part Studios > Sketch Tools > Linear Sketch Pattern | /Content/Sketch/sketch_linear_pattern.htm | 沿一或两个方向线性阵列草图实体；双击改数量/间距/角度；悬停实例右键图案图标可 Edit pattern；超 10 个实例只预览前 10 个。 |
| Circular Sketch Pattern | Part Studios > Sketch Tools > Circular Sketch Pattern | /Content/Sketch/sketch_circular_pattern.htm | 绕轴或 Mate connector 圆周阵列；默认闭合 360°，拖箭头可张开；初始绕原点但不约束于原点；中心图标可移动/缩放。 |
| Transform Sketch | Part Studios > Sketch Tools > Transform Sketch | /Content/Sketch/sketch_transform.htm | 用三轴操纵器平移/旋转/缩放草图及图像/文本/DWG/DXF；带球点吸附、角度/比例数值框；Enter/点空白提交，Esc 取消。 |
| Insert DXF or DWG | Part Studios > Sketch Tools > Insert DXF or DWG | /Content/Sketch/insert_dwg_or_dxf.htm | 把已导入文档的 DXF/DWG 作为草图实体插入；对话框选单位、可选 Use file origin position，可 Other documents/Import；首次标注自动缩放整张草图；Insert 进入撤销栈。 |
| Insert Image | Part Studios > Sketch Tools > Insert Image | /Content/Sketch/insert_image.htm | 从当前文档/其它文档/图片库插入 PNG/JPEG/GIF/BMP 作为草图底图；默认下边水平约束；首尺寸缩图；支持 alpha、复制粘贴、Edit image 换图。 |
| Dimension | Part Studios > Sketch Tools > Dimension | /Content/Sketch/dimension.htm | 水平/垂直/最短距离/角度/直径/半径/弧长/样条点间距/草图与平面/中心线尺寸；默认驱动、可切从动；部分类型允许负值；快捷键 d。 |
| Coincident | Part Studios > Sketch Tools > Coincident | /Content/Sketch/coincident.htm | 使两个及以上实体（含草图实体与平面）重合；约束“无限底层几何”；Sketch 与 Drawing；快捷键 i。 |
| Concentric | Part Studios > Sketch Tools > Concentric | /Content/Sketch/concentric.htm | 让点与弧/圆心重合、或弧/圆共享圆心；仅 Sketch；Shift+o。 |
| Parallel | Part Studios > Sketch Tools > Parallel | /Content/Sketch/parallel.htm | 使两条及以上线平行；Sketch 与 Drawing；快捷键 b。 |
| Tangent | Part Studios > Sketch Tools > Tangent | /Content/Sketch/tangent.htm | 两曲线或曲线与平面相切；Sketch 与 Drawing；快捷键 t。 |
| Horizontal | Part Studios > Sketch Tools > Horizontal | /Content/Sketch/horizontal.htm | 一条或多条线或点集水平对齐；Sketch 与 Drawing；快捷键 h。 |
| Vertical | Part Studios > Sketch Tools > Vertical | /Content/Sketch/vertical.htm | 一条或多条线或点集垂直对齐；Sketch 与 Drawing；快捷键 v。 |
| Perpendicular | Part Studios > Sketch Tools > Perpendicular | /Content/Sketch/perpendicular.htm | 两线成直角；Sketch 与 Drawing；Shift+l。 |
| Equal | Part Studios > Sketch Tools > Equal | /Content/Sketch/equal.htm | 多条线等长或多弧等半径；若已有尺寸则采用该尺寸；仅 Sketch；快捷键 e。 |
| Midpoint | Part Studios > Sketch Tools > Midpoint | /Content/Sketch/midpoint.htm | 点约束到线/弧中点；也支持三点（起点、终点、中间点）等距；仅 Sketch；Shift+m。 |
| Normal | Part Studios > Sketch Tools > Normal | /Content/Sketch/normal.htm | 线与曲线、或曲线与平面法向垂直；仅 Sketch；Shift+k。 |
| Pierce | Part Studios > Sketch Tools > Pierce | /Content/Sketch/pierce.htm | 草图点/曲线与“草图平面和草图平面外曲线的交点”重合；边必须穿过该平面；仅 Sketch；Shift+g。 |
| Symmetric | Part Studios > Sketch Tools > Symmetric | /Content/Sketch/symmetric.htm | 两个同类型几何关于线/平面/线性边对称；只约束底层曲线（两弧对称的是底层圆而非端点）；仅 Sketch；Shift+q。 |
| Fix | Part Studios > Sketch Tools > Fix | /Content/Sketch/fix.htm | 将草图实体固定到草图平面使其不移动；仅 Sketch；Shift+j。 |
| Curvature | Part Studios > Sketch Tools > Curvature | /Content/Sketch/curvature.htm | 在样条/圆锥曲线与周边几何之间建立曲率连续（G2）过渡；仅 Sketch；Shift+u。 |
| Flow | Part Studios > Sketch Tools > Flow | /Content/Sketch/flow.htm | 建立 G3 流连续（位置、切向、曲率、曲率变化率均匹配）；一条曲线须为有足够控制点的样条/圆锥；不可用于偏移样条；仅 Sketch；文档未给快捷键。 |
| Automatic Inferencing | Part Studios > Sketch Tools > Automatic Inferencing | /Content/Sketch/automatic_inferencing.htm | 绘制时自动唤醒水平/垂直/中点/平行/重合等推断；虚线+橙色高亮提示；拖动时按 Shift 可抑制自动推断。 |
| Working with Constraints | Part Studios > Sketch Tools > Working with Constraints | /Content/Sketch/working_with_constraints.htm | 约束应用/查看/颜色状态、自动生成约束（Quadrant/Use/Intersection）、跨草图引用蓝色背景、Constraint manager 全功能与筛选。 |
| Troubleshooting Sketch Geometry | Part Studios > Sketch Tools > Troubleshooting Sketch Geometry | /Content/Sketch/troubleshooting_sketch_geometry.htm | 蓝/黑/红约束状态色与图标色；用 Profile inspector 定位开口环缺口，Previous/Next 循环，修复后条目消失。 |

## 3. 核心概念与术语

- **Part Studio**：文档 Tab 内的设计容器，不是模型；同一 Part Studio 内的零件共享参考。包含 Feature toolbar、Feature list（参数历史）、图形区。
- **Feature list / Rollback bar**：左侧历史列表；粗条为 Rollback bar，可重新定位以“回滚”生成到该位置。下方为 Parts / Curves / Surfaces 列表（统称 Parts list），可折叠。
- **Feature filter**：按名称/类型/文件夹/零件过滤，冒号命令：`:part`、`:type`、`:name`、`:errors`、`:warnings`、`:folder`、`:variable`（区分大小写）、`:suppressed`、`:hidden`、`:shown`、`:partnumber`（须开启 Show part properties）、`:revision`（同前）。
- **Origin 与默认平面**：每个 Part Studio 默认有 Top、Front、Right 三平面和 Origin；可隐藏、不能删除。
- **Sketch**：绘制在平面上的曲线集合，按参数化存储在 Feature list 中；草图是模型的基础。
- **Sketch plane**：一次只能选一个平面；也可选零件面或 Mate connector（implicit/explicit）。Mate connector 决定草图坐标系。
- **Imprinting（压印）**：在已有零件面上画草图时，是否把该面的已有边线切分进新草图/面域；Sketch 对话框有 **Disable imprinting** 复选框阻止此行为。
- **Sketch entity**：线、弧、圆、矩形、多边形、样条、Bezier、圆锥、点、文本、插入的 DXF/DWG、图片等。
- **Construction geometry**：不参与特征创建的参考几何；可新建或把已有实体切换为构造。
- **Virtual sharp（虚拟尖点）**：草图圆角后被圆角截掉的原交点，以空心小圆表示，保留原两条线的重合约束与圆角半径尺寸，可作参考。
- **Silhouette edge（轮廓边）**：沿草图法向观察模型时“由朝向转为背向”的可见边界（不是实际边）；Use 可投影。
- **Use / Intersection / Pierce**：Use=把外部边/轮廓边投影进草图；Intersection=曲面/面与草图平面的交线；Pierce=草图实体约束到“外部曲线穿过草图平面”的交点。
- **Driving（驱动）/ Driven（从动，reference）dimension**：驱动=黑、可编辑、改几何；从动=浅灰、不可编辑、只反映当前值；默认驱动；过定义时自动转为从动。
- **Constraint status colors**：实体蓝=欠约束（underconstrained），黑=全约束（fully constrained），红=过约束/约束问题（overconstrained）；约束图标黑底灰=well-defined，白字红底=problem。
- **Inference（推断）**：绘制时自动产生约束的候选关系，如 horizontal、vertical、midpoint、parallel、coincident；hover 可“wake up”。
- **Constraint manager**：Sketch 对话框 → Show sketch diagnostic tools → Constraint manager；按 Type/Mode（Internal/External/In context）/Status（Driven/Solved/Errors）筛选，列出实体与约束。
- **Profile inspector**：草图诊断工具，列出未闭合环等缺口问题，可逐条高亮。
- **Expression without/with variable**：尺寸上带变量/不带变量的表达式标识；`#var` 引用变量，`~` 拼接字符串，`roundToPrecision()` 取精度。
- **Open/closed pattern**：线性/圆周阵列可张开（非 360°）；圆周阵列默认 closed 360°。
- **Rho（conic）**：圆锥曲线形状参数，>0.5 双曲、=0.5 抛物、<0.5 椭圆。
- **Degree / control polygon / tangent handle**：Bezier 次数（最大 15）、控制多边形、样条白色切线手柄。
- **Quadrant constraint**：自动生成的约束，把点约束到椭圆与主/次轴的交点。
- **Mate connector（implicit/explicit）**：草图平面可选的坐标系载体；对话框内可编辑。

## 4. 功能与 UI 明细

### 4.1 Part Studio 环境

- **可用位置**：Part Studio（移动端同样有 Part Studio，但布局不同）。
- **布局**：顶部导航栏含文档名+工作区名；左侧 Feature list；图形区含默认几何、Origin、三平面；底部 Tab manager；右上可有零件属性等。
- **工具搜索过滤**：Filter 图标打开下拉；支持普通文本与上述冒号命令；`:part part 1` 会显示 Part 1/10/11/12 及相关特征。
- **折叠**：Feature list 右侧 Features and parts 图标可整栏折叠/恢复。
- **窗口变窄**：Sketch 工具收缩为图标（不消失）。
- **工具栏定制**：在工具栏任意处右键 → `Customize toolbar...`；拖动 tool set 到新位置；拖单个工具到出现的 New toolset 框创建新组；把工具拖出到 Tools 框即移除（可再拖回）；Save/Cancel/`Reset to default`（重置该类工具栏——Part Studio/Assembly/Feature Studio）。整组工具必须整组移动；整组移除后可单独把工具拖回；要恢复整组用 Reset to default。
- **快捷键工具栏**：在 Part Studio、Drawing、Assembly Tab 按 **S** 打开；账户 Preferences 定制。iOS 平板 + Apple Pencil 专属：在图形区空白处长按打开同样的快捷工具栏。
- **Tab 右键菜单**（Part Studio tab）：Delete（最后一个 Tab 不能删）、Open in new browser tab、Rename、Properties、Show code（FeatureScript）、Duplicate（副本无关联）、Copy to clipboard（跨文档 `Insert new element > Paste tab`）、Update linked document、Select as document thumbnail、Create drawing of Part Studio x（仅实体/零件）、Move to document（产生 link 图标；有更新时 link document update 图标→Reference Manager）、Export、Release、Release all configurations（最多 100 配置；仅单一 List 输入；多 List/Checkbox/Configuration variable 输入时不可用）、Create task。
- **零件 Properties**（右键 Parts list 中零件）：Part list name（只读）、Name、Description、Category（默认 Onshape 类别；仅 Professional/Enterprise 可编辑）、Part number、Revision、State（默认 In progress；Pending/Rejected/Released；仅在 version 且 Release management 关闭时可编辑）、Vendor、Project、Product line、Material（只读，未分配显示 Unassigned）、Title 1/2/3、Not revision managed、Exclude from all BOMs、Unit of measure（默认 Inch）、Mass（须先有材料）。底部 Undo/Redo；`Reset all` 清除可编辑属性，并重置不可见的 appearance/material/tessellation quality，且不影响已配置属性。对话框可拖边缩放。
- **移动端（iOS/Android，流程一致）**：新文档默认含空 Part Studio + Assembly；导航栏工具随屏幕宽度/方向变化，放不下的进 Document information panel（More 图标）；左上箭头回 Documents；左下 Versions and history；右下 Comments；右上 Collaborators（仅实时协作时出现）/Help（Help、Videos、Contact support、About）。Document information panel：Properties、Copy、Units、Document name、Document description、Share（可 Private/Public）。New Sketch 图标选平面开始草图；已有草图打开时点同一图标查看全部草图工具；Feature 工具在三点菜单；Measure、Mass properties；Feature list 手柄可拖开并调整大小；3D Rotate lock 锁旋转便于拖实体；View Cube；三平面+Origin 可隐藏不可删，可隐藏所有平面和零件。
- **移动端 Tab**：上箭头开 Create tab 菜单；点 Tab 激活；**切换 Tab 会提交任何打开的 feature**；左右滑；按 Assembly/Part Studio 过滤；按名搜索；创建/重命名/复制/删除；Tab 数不限；Duplicate 在文档内复制；唯一 Tab 不能删；文档至少有一个 PS 或 Assembly。Tab 文件夹：省略号菜单 → Create a folder → Select 当前 Tab + 勾选其它 Tab → 文件夹图标 → 命名 → Create Folder；文件夹激活时 Tab 栏只显示该文件夹内 Tab，其余以 All tabs 图标表示；文件夹右键 Rename/Select/Unpack（保留 Tab 回原位）。

### 4.2 草图入口、Sketch 对话框与退出

- **入口**：Feature toolbar 点 Sketch（图标）。出现 Sketch 对话框；确认平面后出现 Sketch tools 工具栏。
- **选项记忆**：Onshape 会记住 Sketch 对话框中所选选项，下次打开沿用（**例外**：Show expressions 在对话框关闭再开会恢复未勾选）。
- **可选草图平面**：一个平面（一次只能一个）；已有草图/零件时可选零件面；可选 implicit 或 explicit Mate connector。对话框中的 Mate connector 图标可在悬停时显示隐式 Mate connector；选中后点字段内图标可打开编辑对话框；草图遵循其坐标系。
- **Disable imprinting**：在已有零件面上草图时可用；不勾选时，新草图线会把已有面切分为多个区域；勾选后已有矩形线不并入新草图，圆不被切成两段。文档未明示默认勾选状态（从描述看默认不勾选/允许压印）。
- **绘制与即时尺寸**：选择草图工具后在图形区点击；不同工具点击数不同。绘制时会出现建议尺寸框，可直接输入数值/表达式，或继续绘制保持未标注。**Alt+方向键**可在多个尺寸框之间切换（如矩形）。绘制中向尺寸框输入变量须用 `=#变量名`（如 `=#d`）；**只输入 `#` 会把 3D 视图切到左视图**。几何已画好后再输入变量不需要等号，直接 `#name`。
- **约束显示**：Sketch 对话框 `Show constraints` 复选框显示全部约束；`Show expressions` 复选框在尺寸上方显示表达式（表达式文本最多显示 70 字符）。
- **接受/取消**：绿色对勾接受并关闭对话框；红色 X 取消且不记录本次草图动作；取消后可点消息气泡里的 `Restore` 恢复本次操作。
- **草图工具栏**：草图打开时出现；工具图标旁的箭头表示下拉组，箭头旁图标是“该组上次使用的工具”（组记忆）。S 键打开草图快捷工具栏。`Alt/Opt+C` 打开工具搜索。Esc 退出当前工具选择。
- **Extrude/Revolve 直达**：从 Sketch 工具栏调用 Extrude 或 Revolve 时，当前草图被接受、对话框关闭，随即打开特征对话框且**所有面域自动选中**。
- **复制/粘贴/派生草图**：见 5.1。
- **移动端**：New Sketch → Sketch dialog → 选一个平面/面/Mate connector → 工具分类（带下拉箭头的可展开）→ 点按绘制；绿色对勾接受、x 取消不记录；无工具激活时可触摸拖动点/实体调整；可在草图曲线与平面之间加约束（含尺寸）。

### 4.3 基本图元工具（逐一）

| 工具 | 快捷键 | 输入方式（点击数/拖拽） | 即时尺寸字段 | 备注 |
|---|---|---|---|---|
| Line | `l` | 连续点击生成相连线段；或点击拖拽起点→释放终点 | 长度（数值或 `=#` 变量） | Shift+a 或悬停端点至图标变切线弧→画 Tangent Arc；切弧完成后自动回到 Line |
| Midpoint Line | 无 | 点 Line 下拉选 Midpoint line；悬停草图→点中点→点端点 | 文档未给 | iOS/Android 仅查看/编辑桌面创建的 Midpoint line |
| Corner Rectangle | `g` | 点角点→点对角；或拖拽对角 | 先长度、后宽度 | ALT 画正方形（两边相等） |
| Center Point Rectangle | `r` | 点中心→点角；或从中心拖到角 | 先长度、后宽度 | ALT 正方形 |
| Aligned Rectangle | 无 | 点线起点→点线终点→垂直拖出并点距离 | 先长度、后宽度 | ALT 正方形；矩形随基线方向对齐 |
| Center Point Circle | `c` | 点圆心→点半径点；或拖拽 | 直径 | 变量规则同上 |
| 3 Point Circle | 无 | 点点1→点点2→点3（第三点定直径）；可拖1→2 | 直径 | — |
| Ellipse | 无 | 点中心→拖点主轴半径→拖点次轴半径（垂直主轴） | 先主轴直径、后次轴直径 | 主轴/次轴由绘制大小决定，不以字段决定 |
| 3 Point Arc | `a` | 点起点→点第二点→点半径点；可拖起点→释放第二点→点半径 | 半径 | 端点与中点成直线时推断半圆 |
| Tangent Arc | 无 | 点起点→点终点；或拖拽 | 半径 | 从线端继续相切；与 Line 相互切换 |
| Center Point Arc | 无 | 圆弧上点圆心→点起点→点终点 | 半径 | — |
| Elliptical Arc | 无 | 点构造椭圆中心→拖主轴→拖次轴并点弧起点→沿椭圆边拖点弧终点 | 先主轴直径、后次轴直径 | 构造椭圆临时存在，完成后删除；起终点可吸附轴/象限点（黄色推断线） |
| Conic | 无 | 点起点→点终点→（可选先输入 rho）→点控制点 | rho（>0.5 双曲、=0.5 抛物、<0.5 椭圆） | 未提前输入 rho 时，控制点后自动弹 rho 字段 |
| Inscribed Polygon | 无 | 点起点→拖定构造圆；再键盘输入边数或拖定边数 | 直径（边数确定后） | 边数 3–50；向多边形拖减少边数、向外拖增加；构造圆带 construction 标记 |
| Circumscribed Polygon | 无 | 同上 | 直径 | 多边形位于构造圆内；边数 3–50 |
| Spline | 无 | 点起点→连续点→双击结束 | 文档未给 | 白色切线手柄不可删除；只能首尾相连闭合；右键 Confirm spline 在光标前一点结束 |
| Bezier | 无 | 点起点→连续点→双击结束 | 文档未给 | 调整前须先取消工具选择；拖白色控制点；不可闭合；右键盘 Escape bezier 删除当前曲线；双击次数可改（最大 15） |
| Spline Point | 无 | 沿样条/Bezier 控制多边形点击加点 | — | 控制点属于定义；与重合到样条的普通 Point 不同 |
| Point | `Shift+s` | 点击创建 | — | 可施加多数草图约束 |
| Text | 无 | 拖出文本框（左下角+高度定第一行位置/大小） | 文档未给 | 下边默认水平约束；对话框见下 |

**Text 对话框**：文本输入+预览；字体下拉（须选支持所用语言的字体）；Bold/Italic；两个翻转图标（关于文本框水平中心翻转、关于竖直中心翻转）。文本可右键 `Convert to expression`，转为文本表达式输入行；反向 `Convert to text`。表达式可拼接：字符串变量 `#txt`；长度 `roundToPrecision(#Length/in, 3) ~ "in"`（不取整会出现 4.999999999999999）；角度 `#Angle/deg ~ " degree"`；数值 `#Number ~ " items"`（`~` 为字符串拼接）。限制与行为：每文本框最多 250 字符；多行时第一行在框内、后续行在框外（框代表行宽与基线到 ascender 的高度）；可标注文本框；未固定/约束时拖动只移动框（移动中可能只见框不见文字）；旋转须删除下边水平约束、固定一角、拖对角；缩放须固定另一角后拖角，但有尺寸后不能拖拽缩放；草图内**不能**阵列/镜像文本，需接受草图后用 Linear/Circular pattern 或 Mirror **特征**阵列整个草图。

**多边形/圆锥/椭圆的关键数值**：Inscribed/Circumscribed 边数最小 3、最大 50；Conic rho 阈值 0.5；Bezier 最大次数 15。

### 4.4 投影、构造与派生

- **Use**（`u`）：在第二个草图中点 Use，再选第一个草图/零件的边、边集或轮廓边。悬停有投影线预览。**Silhouette edge**：视线沿草图法向时，可见的“不是真实边”的边界；**无预选行为**；悬停面出现高亮，若真实轮廓边不在草图平面会出现两个高亮（真实边+平面投影），两者都可选；可点面选全部轮廓边，或悬停单条再点选；若悬停无高亮说明受限。规则：所有 used 边随底层几何更新，但对“几何类型改变（圆变线等）”不友好；不约束轮廓边端点；不区分轮廓边的分段（有孔圆柱示例）；不会对整面自动抽取边/轮廓边并缝合；只使用可追踪的轮廓边；支持圆柱、圆锥、圆环、球、拉伸曲面以及任何只有一条轮廓边的曲面；投影后自交的轮廓边不可用。
- **Intersection**：从 Use 图标下拉进入；草图平面须与目标面/曲面相交；选择面/曲面生成交线；随几何更新；交点由 Intersection 与 Pierce 约束固定（开放曲线端点用 Pierce，闭合曲线用 Intersection 约束）。
- **Construction**（`q`）：两种用法——先画再选中实体点 Construction 切换；或先点 Construction 再选草图工具直接画构造几何。q 键切换构造状态开/关。
- **Derived 草图**（Sketch Basics 记载）：不要求当前 Part Studio 已有草图；点 Derived → 选择要派生的草图（可多选）→ 对勾。派生的草图放在原草图所在平面；原草图修改会反映到派生草图。
- **复制/粘贴草图**：Feature list 选中草图 → 右键 `Copy sketch`；粘贴可在打开的草图中右键 `Paste into sketch`，或在 Feature list 右键目标草图 `Paste into sketch`。跨 Part Studio：在 A 中 Copy sketch → 切到 B → 选已有草图右键 `Paste sketch entities`，或新建草图选平面后右键 `Paste sketch entities`。移动端另支持：编辑草图中右键 Copy sketch / Paste into sketch；粘贴后触摸拖动或点按定位；编辑特征时选平面/平面面后右键 `Paste into sketch`。

### 4.5 草图编辑工具

- **Sketch Chamfer**：选顶点或两条边；两个距离字段；默认角度 **45°**（原文“Onshape defaults to 45 degrees for the angle”）；填第一个距离，必要时填第二个。多倒角：先选第一个边/顶点→继续选其它边/顶点→改第一个选择里的尺寸，全部选中尺寸同步更新。过大显示红色；无法生成时黄色警告条；可拖操纵器改大小。线示例：点第一线（黄色高亮）→点第二线（黄色高亮）→第一个值输入回车→第二个值输入回车；顶点示例：点顶点→两个值。
- **Sketch Fillet**（Shift+f）：选一个点或两条草图曲线；弹出半径对话框输入半径。线：点第一条线（无高亮）→点并拖第二条线估大小→输入半径回车。顶点：点顶点→输入半径→之后每次点击产生同尺寸圆角。样条：在两条样条靠顶部处（不要点端点）点击→输入半径。完成后出现虚拟尖点（小空心圆）：保留两线重合约束与半径尺寸，可作参考。多选同尺寸：第一次输入值成为默认，改第一个值即改全部。过大红线；拖操纵器或点数值改大小。
- **Trim**（m）：点击要修剪的实体，修剪至第一个交点/边界；无交点/边界则整条删除；可按住拖过多个实体；可删除独立草图点。Bezier 修剪后保留原次数与控制点数。
- **Extend**（x）：点线或弧，再点新端点或边界几何；无边界则止于释放点。弧：点弧→点第二位置结束；或双击弧边/选中拖弧边自动补全至边界（示例把椭圆补全）。
- **Sketch Split**：点曲线并在曲线上点一个或多个位置；开放曲线 ≥1 点、闭合曲线 ≥2 点。Bezier 分割成两段、次数与控制点数均不变、形状与长度不变、两段在分割点重合（动一段另一段跟随，但两段控制点独立）。
- **Offset**（o）：选一条或多条曲线；点方向箭头并输入距离（可拖箭头粗调再输入精确值）；**负距离也可反向**；回车；继续点其它曲线做等距偏移。支持单实体与链选环。
- **Slot**：可预选草图曲线再点 Slot，所有曲线上的槽等宽且由一个尺寸联动；也可先点 Slot 再选中心线。双击尺寸编辑；**Diameter 尺寸控制槽宽**，放置前后都可编辑。逐条选曲线并保持命令激活会连续生成槽；文档正文称“同一（未链接）尺寸”，但又说“编辑尺寸后所有槽都变化”（原文自相矛盾，按“联动”理解需谨慎）。多链选择→沿链形状生成一个槽；逐条选→分别生成槽；命令仍激活时点空白处再选下一曲线可重复。
- **Sketch Mirror**：预选实体→点 Mirror→提示选镜像线→镜像线可为草图线、平面、零件面或边→点击后立即解算。未预选：点 Mirror→提示选镜像线→选线→提示选实体→边选边镜像→Esc 退出。
- **Linear Sketch Pattern**：先选实体再点工具，生成初始阵列。编辑手柄：双击实例数量；拖拽定开放阵列角度（实例数变化时仍保持开放）；点箭头图标后出现角度值，双击输入；双击输入实体间距。鼠标移到空白处光标变“鼠标+绿色按钮”，点击接受。编辑已有阵列：Feature list 双击草图进入编辑→悬停阵列实例→右键出现的图案图标→`Edit pattern`→调整→绿色对勾。规则：可删除阵列中任一实体且不破坏阵列；改实例数不会恢复已删实体（位置留空）；拖箭头操纵器根部可让线性阵列整体带角度；实例超过 10 个时预览只显示前 10 个（性能）。
- **Circular Sketch Pattern**：先选实体再点工具。编辑工具同上（数量、开放角度、角度值、间距）。规则：默认闭合 **360°**；拖箭头（arrow head）改角度形成开放阵列；初始绕原点生成但**不约束**到原点；拖中心图标可重新定位和缩放；删除实例/计数规则同线性；悬停实例右键 `Edit pattern`。
- **Transform Sketch**：点工具→选草图实体→拖三轴操纵器定位/定向→点空白处提交。旋转时激活角度字段，输入值回车再点空白提交。操纵器“球点”可作吸附点：拖球点到草图上的目标点，或借助平面拖到另一草图的吸附点（示例为正方形左下角）。缩放：拖三角形操纵器向内/外，激活比例字段，可输入数值。Notes（Sketch Basics 与 Transform Sketch 页一致）：支持预选/后选，操作中可增删实体；点空白或 Enter 提交并退出，Esc 取消；无旋转或 180° 旋转时内部约束不变；90°/270° 旋转时水平/垂直约束互换；某些情况下会加入构造几何以保持自由度；有向尺寸（directed dimensions）被删除，可能以构造几何+最小尺寸替代；支持图片、文本、DWG、DXF。

### 4.6 Dimension（尺寸）

- **可用位置**：Sketch；快捷键 `d`；选中实体在浏览器中高亮（原文 “browser only”），并弹出 Dimension context dialog；输入值回车，可用 `=#` 变量。负值（长度、线性距离、角度）可翻转方向。
- **类型与选择顺序**：
  - 单线距离：点线→拖到位置→点放置并激活数值（长度/高度）。
  - 两线距离：点线1→点线2→拖放；**两线间标注隐含平行**（无可见平行约束）。
  - 对角线距离：点两对角角点→斜拖。
  - 直接距离（Direct distance）：两点间最短距离（斜拖）。
  - 线性距离（Linear distance）：两点间水平/竖直距离（正交拖）。
  - 直径：点圆边→向内/外拖；半径：点弧→拖。二者**不允许负值**。
  - 角度：点两线→拖入/拖出角度区域；可拖到所需象限后再放。
  - 弧长/曲线长：点弧第一端点→点第二端点→点弧→拖放。
  - 样条：两点（样条点之间或样条点与任意草图点）距离；斜拖可改为 Direct distance。
  - 草图与平面：点草图点→点平面→拖放；输入新值时**草图形状移动、平面不动**。
  - 中心线尺寸：圆/点/非构造线 与构造线之间；先建距离尺寸，再把鼠标移到构造线另一侧，状态在 distance 与 centerline 之间切换（用于 Revolve 等）。
- **通用规则**：表达式与三角函数可用于 Part Studio 数值字段；Delete 键或右键删除尺寸；双击数值编辑；右键 `Add comment` 加注释。除直径/半径外，输入新值会把两个几何选择各平移新值的一半（单线时两个端点各移一半）；受约束几何可能不平移。
- **Driven**：默认 driving（黑、可编辑）；右键尺寸值 `Change to driving/driven dimension`；driven 浅灰不可编辑；**新尺寸导致草图过定义时自动变为 driven**；driven 可加在任何 driving 可加处，只反映隐含值、不改几何；driven→driving 会改几何，若导致过约束则出现红色指示。
- **负值允许/不允许（原文清单）**：允许——Distance dimension、Angle dimension、Line length、Spline dimension；不允许——Arc dimension、Radius or diameter dimension。
- **右键菜单/显示**：草图右键 `Show dimensions` 查看已有尺寸。

### 4.7 约束体系（15 个手动约束 + 自动推断 + 自动生成）

- **可用位置**：全部为 Sketch；其中 Coincident、Parallel、Tangent、Horizontal、Vertical、Perpendicular 同时 **Available in: Sketch, Drawing**；其余（Concentric、Equal、Midpoint、Normal、Pierce、Symmetric、Fix、Curvature、Flow）仅 Sketch。
- **通用交互**：约束工具“Toggle on constraints while you make selections”：激活后每选一对/一组实体立即施加约束；再点图标关闭，或切换到其它工具自动关闭。可“先选约束再选实体”，也可“先选实体再点工具栏约束菜单中的约束”。

| 约束 | 快捷键 | 选择输入 | 语义/限制 |
|---|---|---|---|
| Coincident | `i` | 两个及以上实体（可含草图实体与平面） | 使两者“无限底层几何”重合 |
| Concentric | `Shift+o` | 圆、弧（点也可） | 点与弧/圆心重合，或弧/圆共享圆心 |
| Parallel | `b` | 两条及以上线 | 平行 |
| Tangent | `t` | 两条及以上曲线；或曲线+平面 | 相切 |
| Horizontal | `h` | 一条及以上线或点集 | 水平对齐 |
| Vertical | `v` | 一条及以上线或点集 | 垂直对齐 |
| Perpendicular | `Shift+l` | 两条线 | 直角 |
| Equal | `e` | 两条及以上草图曲线 | 线等长/弧等半径；已有尺寸则采用该尺寸 |
| Midpoint | `Shift+m` | 线+点、弧+点；或起点+终点+中间点 | 点约束到中点；三点模式使第三点与前两点等距 |
| Normal | `Shift+k` | 线+曲线，或曲线+平面 | 法向垂直 |
| Pierce | `Shift+g` | 草图点/曲线 + 草图外穿过草图平面的边 | 约束到平面与外部曲线的交点；“关键是边必须穿过平面” |
| Symmetric | `Shift+q` | 先（预）选线/线性边，再选两个同类几何 | 只约束底层曲线对称；两弧对称的是底层圆，不含端点 |
| Fix | `Shift+j` | 一个草图实体 | 固定到草图平面不移动 |
| Curvature | `Shift+u` | 样条/圆锥与周边几何 | 曲率连续（G2） |
| Flow | 文档未给 | 两曲线，或草图曲线+外部边 | G3 流连续；一条须为控制点足够的样条/圆锥；不可用于偏移样条；Constraint manager 中列为 Flow 1、Flow 2… |

- **自动推断（Automatic Inferencing）**：绘图时自动赋约束；可显示实体与 Origin/另一实体的水平/垂直对齐推断（虚线）；靠近实体“唤醒”推断；常见 wake-up：horizontal、vertical、midpoint、parallel、coincident。示例：带垂直约束的两线，靠近后画线，平行时变虚线且另一线橙色高亮并出现平行约束图标。**拖动时按住 Shift 抑制自动推断**。约束指示图标会跟随光标出现。
- **自动生成、不在工具栏的约束**：Quadrant（点重合到椭圆与主/次轴交点；由推断、拖到或放到椭圆点产生）、Use（跨草图实体约束）、Intersection（开放曲线端点用 Pierce；闭合曲线用 Intersection 约束）。
- **约束可见性**：草图打开时才能查看；悬停实体只显示该实体的约束；**按住 Shift 移动鼠标可保持全部约束可见**；悬停实体橙色高亮；涉及跨草图的引用约束蓝色背景、悬停深蓝；选中约束时相关实体黄色高亮。
- **约束图标操作**：可拖动图标（或一组图标）到新位置；悬停单个图标高亮其作用实体；点选后 Delete 或右键 Delete 删除；Sketch 对话框勾选 Show constraints 显示全部；冲突约束=白符号红底。
- **约束状态色**：见第 3 节。选择时蓝/红（未全约束）优先于重叠的黑（全约束）点。

### 4.8 Constraint manager 与 Profile inspector

- **打开**：Sketch 对话框 → `Show sketch diagnostic tools` 图标 → `Constraint manager`。
- **界面**：Filters 可一键展开/折叠 Type、Mode、Status 三段；`Automatically select constraints` 默认开——在列表中选约束会在草图对应约束外加黄框；关闭后可先按 Type 筛选、再框选草图局部，只显示该局部的约束。
- **筛选**：Type=约束类型列表；Mode=Internal（当前草图）/External（外部来源）/In context（上下文中引用）；Status=Driven/Solved/Errors（选中时分别黄色/黄色/深红高亮，欠约束时更深蓝）。可按 `Sort by constraint` 或 `Sort by entity` 排序。
- **Entities and constraints 列表**：悬停高亮；可 `Delete constraint`、`Remove selection`；右键：Delete constraint/entity、Zoom to selection、Hide external references、Clear all；`Delete all` 删除列表中全部约束。
- **关闭**：对话框右上 X，或诊断工具图标 → `Turn constraint manager off`。
- **Notes**：Type/Mode/Status 可任意组合；Flow 可单独筛选（Flow 1、Flow 2…）；若 Sketch 对话框里 Show constraints 与 Show errors 均关闭，悬停列表项只显示该约束及相关实体；在列表选实体以其浅黄高亮；Constraint manager 也适用于 **Sheet metal flat pattern view**。
- **Profile inspector**：Sketch 对话框 → 诊断工具 → `Profile inspector`；逐条点击问题在草图高亮；Previous/Next 循环；问题修复后从列表消失（示例：两个未闭合环）。

### 4.9 文件与图像插入

- **Insert DXF or DWG**：前提是文件已导入当前文档，或你拥有/被共享的其它文档（会创建到该文档的链接）；建议插入空草图，也可插入已有实体的草图。步骤：Sketch→选平面→点 Insert DXF or DWG→对话框底部选 **Units**→可选 `Use file origin position`（否则把包含全部实体的 2D 包围盒中心放到 Part Studio 原点）→选择本文件/Other documents/底部 Import 新导入；导入完成后文件出现在列表；**选中文件即自动关闭对话框**。规则：先选单位再选文件；Insert 记录在文档 Undo/Redo 栈；插入后第一次标注会**自动缩放整张草图**；导入出现几何/文件格式/文件完整性错误时弹 alert。支持格式见 Supported File Formats（本页未列具体版本）。
- **Insert Image**：支持 PNG/JPEG/GIF/BMP（DESC 与正文不一致，正文含 GIF；以正文为准记录并标注）。对话框来源：Current document（可搜索、可 Create a version/查看 Version graph）、Other documents（公司内其它文档）、Libraries（下拉选库）；无图可用底部 Import。Done 后在图形区拖拽定位；保持宽高比（虚线提示）；图像移动时半透明；**下边默认加水平约束**。草图可画在图片上；首次标注草图几何会同时缩放图片（只有第一次缩放；重缩放需删掉多余尺寸只留一个调整）。旋转：删水平约束、固定一角、拖另一角；移动：删除全部约束后拖。Show/Hide 草图同时显示/隐藏图片；支持 alpha 透明；图片可作为草图实体在 Part Studio 内/跨 Part Studio 复制粘贴；右键 `Edit image` 可换图/上传；源图变化可在其 Tab 右键 Update，会更新文档中所有使用处。最大图片尺寸取决于 GPU（对照 webglreport 的 Max Texture Size）。
- **图片库**：每个公司一个由管理员拥有的 image library（按公司共享权限）；个人可设一个私有 image library（无需特殊权限）。创建：Documents 页建文件夹（公司库须在根文件夹）→右键文件夹 → Set library → My images；随后右键文件夹 → Image library：`Update my library`、`Unset my library`、`Set as <company> library`。

### 4.10 平台差异汇总

- **iOS/Android 支持**：Part Studio、Sketch Basics、Sketch Tools 均有完整移动端流程（新建草图、工具分类、接受/取消、复制粘贴、派生、约束、诊断色）。
- **仅桌面（browser）可创建**：Midpoint Line 在 iOS/Android “仅查看和编辑桌面平台插入的 Midpoint line”。
- **仅移动端形态**：Part Studio 的 iOS/Android 导航、S 快捷工具栏需 iPad+Apple Pencil 长按、Document information panel、Tab 文件夹等。
- **浏览器限定**：Dimension 选中实体高亮明确标注 “browser only”。
- **Drawing 也可用**：Coincident、Parallel、Tangent、Horizontal、Vertical、Perpendicular。
- **Constraint manager 额外场景**：Sheet metal flat pattern view。
- 其余“Available in: Sketch”的工具在移动端是否全部可用，文档未逐条声明（只给出移动端总览）。

## 5. 工作流、规则与错误状态

### 5.1 端到端草图流程

1. Part Studio → Sketch → 选一个平面/零件面/Mate connector → 设置选项（Disable imprinting、Show constraints、Show expressions）。
2. 选工具绘制；绘制中可即时输入尺寸或 `=#` 变量（已绘制后 `#` 即可）；用 Alt+方向键切换矩形等多个尺寸框；借助推断自动约束，必要时手动加约束。
3. 用 Dimension 工具补充尺寸；用 Constraint manager / Profile inspector 检查过约束和开口环。
4. 绿色对勾接受草图（或从草图工具栏直接 Extrude/Revolve，草图被接受且面域全选）。
5. 红色 X 取消不记录动作；可通过消息气泡 `Restore` 恢复。
6. 切换 Tab 会提交任何打开的 feature（移动端明确；桌面端 Part Studio 页面也以同样语义描述 Tab 激活与提交）。

### 5.2 草图复制/派生链

- 同一 Part Studio：Copy sketch → Paste into sketch（可在打开草图中，或 Feature list 目标草图右键）。
- 跨 Part Studio：Copy sketch → 切到另一 PS → 已有草图右键 Paste sketch entities，或新建草图选平面后右键粘贴。
- 派生（Derived）：在目标 PS 直接点 Derived，选择源草图（可多选）；无源草图/无需先建草图；派生草图落在原草图平面，源修改会同步。
- 移动端额外提供编辑特征时选平面/平面面后 `Paste into sketch`。

### 5.3 约束/尺寸规则与更新行为

- 蓝=欠约束、黑=全约束、红=过约束；选择时未全约束点优先。
- 默认 driving；过定义时新尺寸自动 driven；driven 不改变几何；driven→driving 会驱动几何并可能出现过约束红标。
- 两线距离尺寸隐含平行（无可见平行约束）。
- 除直径/半径外，新尺寸值把两个选择各平移一半；受约束几何可能不动。
- 负值：距离、角度、线长、样条尺寸允许；弧尺寸、半径/直径不允许。
- Transform：0°/180° 内部约束不变；90°/270° 水平/垂直约束互换；有向尺寸删除并可能用构造几何+最小尺寸替代；某些情况自动加构造几何保自由度。
- 推断可被 Shift+拖动抑制；约束图标可拖动位置、可删除。

### 5.4 编辑器工具规则/失败状态

- **Fillet/Chamfer**：尺寸过大红色；倒角几何无法创建时黄色警告条；两者均可拖操纵器或点值改尺寸；多选共享首个尺寸（改首个即改全部）；Fillet 顶点模式每次后续点击同尺寸；留下虚拟尖点与半径尺寸。
- **Trim/Extend/Split**：Trim 无边界则删除整条；Extend 无边界止于释放点；Split 开放曲线 1 点起、闭合曲线 2 点起；Bezier 修剪/分割保持次数与控制点数，分割两段重合。
- **Offset**：负距离反向；回车后可连续等距偏移。
- **Pattern**：删除实例不破坏阵列、改数量不复活已删实例（留空）；实例 >10 只预览前 10；Edit pattern 入口为悬停实例右键图案图标；圆周默认 360° 闭合、初绕原点但不约束。
- **Use**：used 边随几何更新，但对几何类型变化不友好；轮廓边自交后不可用；不约束轮廓边端点；不支持部分曲面/多轮廓边曲面。
- **DXF/DWG**：先选单位（否则选文件即关窗）；首次标注缩放整草图；Insert 可撤销；导入错误有 alert。
- **Image**：只有第一次标注缩放图；有尺寸后不能拖角缩放；旋转/移动需先删除约束；GPU 限制最大纹理。
- **Text**：超过 250 字符不可以；多行框内只显示第一行；不能草图内阵列/镜像；表达式显示文字限 70 字符、Show expressions 重开复位。
- **多边形**：边数 3–50，拖拽方向控制增减。
- **移动端 Midpoint Line**：不能创建，只能查看/编辑桌面插入的。

### 5.5 诊断与错误状态

| 状态 | 文档给出的表现 | 处理 |
|---|---|---|
| 欠约束 | 实体蓝色 | 继续加尺寸/约束或拖动理解 |
| 全约束 | 实体黑色 | — |
| 过约束 | 实体红色；约束图标白字红底 | 用 Constraint manager 的 Errors 筛选定位/删除 |
| 草图开口环 | Profile inspector 列出未闭合环 | 点击条目高亮、Previous/Next 循环，修复后消失 |
| 圆角/倒角过大 | 红色预览 | 改小或拖操纵器 |
| 倒角无法创建 | 黄色警告条 | 改参数/选择 |
| DXF/DWG 问题 | alert 消息 | 检查几何/格式/文件完整性 |
| 约束冲突 | 白符号红底 | 删除冲突约束 |

## 6. 与其他章节的关系

- **上游/同级**：Part Studios 是章节根；其下依次为 Sketch Basics → Sketch Tools → 各工具页 → 约束页/诊断页。Sketch Tools 页还列出**曲线特征工具集合**（Helix、3D fit spline、Projected curve、Bridging curve、Composite curve、Intersection curve、Trim curve、Isocline、Offset curve、Isoparametric curve、Edit curve、Routing curve），属于 Feature 章节而非草图工具栏。
- **下游特征**：Extrude、Revolve（从草图工具栏可直接进入并全选面域）；Derived、In context（Part Studio 共享参考）；Linear/Circular pattern、Mirror **feature**（用于阵列/镜像文本或整个草图）；Helix 等曲线特征；Revolve 与中心线尺寸直接相关。
- **特征树/文档外壳**：Feature list、Rollback bar、Parts list、Tab manager、Document information panel、Versions and History、Comments、Collaboration/Follow mode、Reference Manager（链接文档更新）、Properties（Metadata）、Release management、BOM、Drawings、Measure、Mass Properties。
- **表达式/变量**：Variable、Variable table、Expressions、Text expressions；`roundToPrecision`、单位换算与 `~` 拼接。
- **其他交叉引用**：Context Menus、Account preferences（快捷工具栏定制）、Sheet metal flat pattern view（Constraint manager）、Supported File Formats（DXF/DWG）、Collaboration、Document panel、Learning center 课程（Introduction to Sketching、Sketching、Part Design Using Part Studios、Multi-Part Part Studios、Introduction to Part Design）。
- **约束工具页的横向关系**：Working with Constraints 汇总工具栏约束菜单 + 自动生成约束；Troubleshooting Sketch Geometry 汇总颜色语义 + Profile inspector；Automatic Inferencing 与各约束页互为补充。

## 7. 对 LubanCAD 的可执行启示

> 以下仅基于本组文档可支撑的结论；`[文档明确]` 表示文档原文有依据，`[推断]` 表示由原文组合推理或迁移建议。

### 7.1 必须补齐的 UI 表面

- `[文档明确]` Sketch 对话框选项：**Disable imprinting**、**Show constraints**、**Show expressions**（且 Show expressions 关闭重开要复位）；对话框选项需会话记忆。
- `[文档明确]` 草图入口同时支持：平面、零件面、**Mate connector（implicit/explicit）**，并在对话框中提供 Mate connector 编辑入口。
- `[文档明确]` 草图快捷工具栏：桌面 **S** 键、iPad+Apple Pencil 长按；账户 Preferences 可定制。
- `[文档明确]` 工具组下拉必须“记住上次使用工具”，并支持 **Alt/Opt+C 工具搜索**、**Esc 退出工具**。
- `[文档明确]` 草图诊断入口：Show sketch diagnostic tools → **Constraint manager**（Type/Mode/Status 三组筛选、两种排序、实体+约束列表、右键 Delete/Zoom/Hide external references/Clear all）与 **Profile inspector**（Previous/Next、修复后消失）。
- `[文档明确]` 约束图标可拖动、可悬停高亮、可点选 Delete；冲突图标白字红底。
- `[文档明确]` Dimension 放置时弹 **context dialog**；右键菜单含 Change to driving/driven、Add comment；Show dimensions 命令。
- `[文档明确]` 阵列实例悬停出现图案图标 → **Edit pattern**；草图编辑需 Feature list 双击进入。
- `[文档明确]` Text 对话框需字体、Bold/Italic、双向翻转、预览、Convert to expression / Convert to text。
- `[文档明确]` Insert DXF/DWG 对话框需 Units、Use file origin position、Current/Other documents/Import 三来源。
- `[文档明确]` Insert Image 对话框需 Current document/Other documents/Libraries 三来源；公司库/个人库设置流程（Set library → My images；Update/Unset/Set as company library）。
- `[文档明确]` 草图右键含 Copy sketch / Paste into sketch / Paste sketch entities / Show dimensions / Add comment / Edit text / Edit image 等上下文命令。
- `[文档明确]` Part Studio 层面：Feature filter 冒号命令、Rollback bar、Parts/Curves/Surfaces 折叠、Tab 右键完整菜单、零件 Properties 与 Reset all。
- `[推断]` 为对齐 Onshape，移动端需要独立的 Part Studio 导航（Document information panel、Feature list 手柄、Rotate lock、View Cube）与 Tab 文件夹；若短期不做，应在能力账本标注平台缺口。

### 7.2 参数与默认值清单（可写成配置/断言）

- `[文档明确]` 多边形边数：**最小 3、最大 50**（Inscribed/Circumscribed）。
- `[文档明确]` Sketch Chamfer 默认角度 **45°**，两个距离字段。
- `[文档明确]` Circular Sketch Pattern 默认 **closed 360°**，初绕原点但不约束于原点。
- `[文档明确]` 阵列实例 >10 时**只预览前 10 个**。
- `[文档明确]` Text：**250 字符**上限；表达式显示 **70 字符**上限；多行时只有第一行在框内。
- `[文档明确]` Bezier **最大次数 15**；不可闭合；闭合曲线请用 Spline。
- `[文档明确]` Conic rho：**>0.5 双曲、=0.5 抛物、<0.5 椭圆**。
- `[文档明确]` Use 轮廓边支持范围：圆柱、圆锥、圆环、球、拉伸曲面、单轮廓边曲面；自交不可用。
- `[文档明确]` DXF/DWG 插入默认把包围盒中心放原点，可改为 `Use file origin position`；首次标注缩放整草图。
- `[文档明确]` 图片格式：PNG/JPEG/GIF/BMP；首尺寸缩放图片；alpha 保留。
- `[文档明确]` 负尺寸允许：距离/角度/线长/样条；不允许：弧尺寸/半径/直径。
- `[文档明确]` 草图复制/派生无需预建目标草图（Derived）。
- `[文档明确]` Release all configurations 上限 **100 配置**且仅单一 List 输入（与草图无直接关系，但属同一 Part Studio 外壳）。

### 7.3 交互与选择规则

- `[文档明确]` 一次只能选一个草图平面；可选面/Mate connector。
- `[文档明确]` 选择优先级：蓝/红未全约束点优先于重叠的黑全约束点。
- `[文档明确]` 矩形即时尺寸顺序：先长度后宽度；绘制中变量用 `=#`，只按 `#` 会切左视图；画完后变量用 `#`；**Alt+方向键**切换尺寸框。
- `[文档明确]` 矩形 ALT 约束两边相等（正方形）。
- `[文档明确]` Slot/Mirror/Pattern/约束工具均支持“先选实体后点工具”或“先点工具后选实体”（Slot、Mirror、Pattern 明示；约束页明示两种方式）。
- `[文档明确]` Trim 可拖过多个实体；Extend 可拖/双击弧补全；Offset 负距离反向、回车后可连续等距。
- `[文档明确]` Transform：中心自由拖吸附推断，普通拖不吸附；0/180° 约束不变，90/270° 水平/垂直互换；有向尺寸删除并可能加构造几何。
- `[文档明确]` 推断：靠近实体唤醒；**Shift+拖动抑制**；约束指示随光标显示。
- `[文档明确]` 两线距离尺寸隐含平行（不显示平行约束）。
- `[文档明确]` 除直径/半径外，新尺寸值把两选择各平移一半。
- `[文档明确]` 草图取消不记录；可 Restore；移动端切 Tab 会提交打开的 feature。
- `[文档明确]` 从草图直接 Extrude/Revolve：接受草图、关闭草图对话框、所有面域自动选中。
- `[推断]` 这些规则适合作为工具行为单测/真栈 e2e 断言（点击序列、字段顺序、快捷键、选择优先级、平移半值语义）。

### 7.4 事务、撤销、版本、协作约束

- `[文档明确]` Insert DXF/DWG 的 Insert 动作进入文档 **Undo/Redo 栈**。
- `[文档明确]` 草图 Cancel 不记录动作，且提供 Restore。
- `[文档明确]` 切换 Tab 会提交打开中的 feature；接受草图后草图作为 Feature list 实体存在。
- `[文档明确]` Derived 草图随源草图编辑更新；Use 边/Intersection 随底层几何更新（类型变化不友好）。
- `[文档明确]` 文档有 Versions and history 与 Comments；草图/尺寸可 Add comment 并发邮件通知。
- `[文档明确]` Move to document 会产生链接与“新版本可用”图标，经 Reference Manager 更新；跨文档复制用 Copy to clipboard → Paste tab。
- `[文档明确]` 图片/插入对象可用 Tab 右键 Update 传播更新。
- `[推断]` LubanCAD 的草图编辑必须保证“取消=零变更、接受=单事务、插入 DXF/DWG 可撤销”，并区分“草图打开态/关闭态”的菜单与命令可见性；这些可直接列为 AIRR 验收项。

### 7.5 可写进测试断言的验收点（示例）

1. `[文档明确]` 新建草图后一次只能选一个平面；选面/Mate connector 后坐标系正确。
2. `[文档明确]` 画矩形后依次输入长度、宽度；按 ALT 时两边 Equal（正方形）；Alt+方向键可在两个尺寸框间切换。
3. `[文档明确]` 绘制中 `#` 单独输入切换左视图；`=#var` 才进入变量；几何完成后 `#var` 可引用变量。
4. `[文档明确]` 多边形边数被夹在 3–50；向/背多边形拖动方向影响增减。
5. `[文档明确]` Conic 输入 rho 0.5 得抛物线、>0.5 双曲线、<0.5 椭圆。
6. `[文档明确]` 圆角/倒角多选时修改首个尺寸，全部同步；过大显示红色；倒角生成失败显示黄色警告条；圆角留下虚拟尖点与半径尺寸。
7. `[文档明确]` Trim 无边界删除整条；Extend 无边界止于释放点；Split 闭合曲线至少 2 点、开放至少 1 点。
8. `[文档明确]` 阵列删除实例后改数量不复活（留空）；超过 10 实例只预览前 10；圆周默认 360° 闭合。
9. `[文档明确]` 90°/270° Transform 后水平/垂直约束互换；0/180° 不变；有向尺寸消失。
10. `[文档明确]` 尺寸过定义时新尺寸自动转 driven（浅灰不可编辑）；driven→driving 若过约束出现红标；直径/半径不接受负值。
11. `[文档明确]` DXF/DWG 插入后首次标注缩放整草图；Insert 可撤销；导入错误弹 alert。
12. `[文档明确]` 插入图片首次标注缩放图片，有尺寸后不可拖角缩放；Show/Hide 草图同步图片。
13. `[文档明确]` Text 超过 250 字符被拒；草图内不可阵列/镜像文本，但可用特征阵列整个草图。
14. `[文档明确]` 移动端 Midpoint Line 只能查看/编辑，不能创建。
15. `[文档明确]` Constraint manager 的 Mode（Internal/External/In context）与 Status（Driven/Solved/Errors）筛选组合生效；Sheet metal flat pattern 下仍可用；Profile inspector 修复后条目消失。

### 7.6 需要登记的产品边界（缺口/不做项）

- `[文档明确]` Midpoint Line 移动端只读（若 LubanCAD 移动端暂不支持，须在能力矩阵标注）。
- `[文档明确]` Bezier 不可闭合、最大 15 次；在草图内文本不可阵列/镜像；草图 Tool 的 Extrude/Revolve 行为必须“接受草图+全选面域”。
- `[文档明确]` Use 不支持“整面自动抽边/轮廓边并缝合”、不区分轮廓边分段、不约束轮廓边端点。
- `[文档明确]` 文本表达式高度依赖变量系统（Length/Angle/Number/String）、`roundToPrecision`、单位除法与 `~` 拼接；若 LubanCAD 对齐，应先落变量/表达式基础设施，再落 Text 表达式。
- `[推断]` 文中反复出现“浏览器 only”“iOS/Android 仅查看/编辑”等平台限定，LubanCAD 做平台矩阵时应把这些作为显式状态字段，而非隐含假设。
