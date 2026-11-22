# Part Studios — 核心实体特征（ps-core）分析报告

## 1. 本章概览

- **主题数**：40（组文件 `ps-core.txt` 全部主题均已逐篇读取，无遗漏）
- **总词数**：69,977 英文词
- **覆盖子域**：
  - 曲面建模总览与特征基础（Surface Modeling、Feature Basics）
  - 基础实体特征（Extrude、Revolve、Sweep、Loft、Thicken、Enclose）
  - 圆角/倒角/拔模类（Fillet、Face Blend、Chamfer、Draft、Body Draft）
  - 薄壁/加强筋（Rib、Shell）
  - 孔与螺纹（Hole、External Thread）
  - 阵列/镜像/布尔/分割/变换（Linear/Circular/Curve Pattern、Mirror、Boolean、Split、Transform）
  - 表面包裹与贴花（Wrap、Decal）
  - 直接编辑（Delete Part、Modify Fillet、Delete Face、Move Face、Replace Face）
  - 构造几何（Plane、Helix、Mate Connector）
  - 参数化与数据复用（Derived、Variable、Query Variable、Composite Part、Tag）
  - 自定义特征（Add Custom Features / FeatureScript）
- **文档更新日期**：语料中未提供每篇的更新时间字段，无法断言文档版本日期。
- **整体质量/抽取限制**：
  - 语料由 HTML 自动抽取，图片仅剩 `[image: alt]`；大量操作结果只能通过图片/视频呈现，正文对结果的描述常不完整（例如 Plane 各类型的最终几何、Split 示例细节）。
  - 视频以文字转录保留，转录与正文存在少量用词差异（如 Sweep 的 “Trim ends” 只在 Thin 步骤中出现、Chamfer 的 Tangent propagation 在正文写“可选”而视频写“保持勾选”）。
  - 表格被压平（Fillet 的 Rho 表、Hole 参数等），个别选项的默认值未明说，本报告对默认值一律以原文明确表述为准，未说明处标注“文档未说明”。
  - 部分页面（尤其 dialog 截图、结果对比图）存在“文本无、图中有”的信息缺口；本报告不臆造图片内容。
  - 组内存在跨页面重复的“Surfacing tools collection”“Curve tools collection”“Frame tools collection”附录，本报告按工具主体归纳，不重复计入摘要。

## 2. 主题清单与逐篇摘要

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Surface modeling | Part Studios > Surface Modeling | /Content/PartStudio/surface_modeling.htm | 曲面（单面、无质量/厚度）建模总览：G0–G3 连续性、分析工具（Curvature/Connection/Zebra/Dihedral/Deviation/Reflection）、高质量曲面准则，以及曲面与曲线工具全集清单。 |
| Feature Basics | Part Studios > Feature Basics | /Content/PartStudio/feature_basics.htm | 特征对话框通用语义：蓝/白字段、Tab/方向键/空格、标题红黑状态、Preview slider、编辑时回滚与 Final 按钮、参数重排、缺失引用、布尔参数转表达式、iOS/Android 差异。 |
| Extrude | Part Studios > Feature Tools > Extrude | /Content/PartStudio/extrude.htm | 沿直线拉伸草图区域/平面面：Solid/Surface/Thin 三类，New/Add/Remove/Intersect，六种端条件、方向/起始偏移/对称/第二端/拔模/合并范围、钣金平面图特例。 |
| Revolve | Part Studios > Feature Tools > Revolve | /Content/PartStudio/revolve.htm | 绕轴旋转草图区域/平面面/曲线：Full revolve 默认 360°，Blind/Up to next/Up to face/Up to part/Up to vertex，Offset、第二端、Thin、合并范围。 |
| Sweep | Part Studios > Feature Tools > Sweep | /Content/PartStudio/sweep.htm | 沿路径扫掠轮廓：Solid/Surface/Thin、闭合/开放轮廓、路径可多段、Profile control（None/Keep orientation/Lock faces/Lock direction）、Twist（Turns/Angle/Pitch）、Scale、Trim ends、合并范围。 |
| Loft | Part Studios > Feature Tools > Loft | /Content/PartStudio/loft.htm | 多截面放样：≥2 个 profile（区域/面/边/点）按顺序选择并可重排，起终端条件、Guides and continuity、Path（中线）与截面数、Connections 控制扭转、Show isocurves、Thin、合并范围。 |
| Thicken | Part Studios > Feature Tools > Thicken | /Content/PartStudio/thicken.htm | 给曲面/面/草图加厚成实体：New/Add/Remove/Intersect、Mid plane 或 Thickness 1/2、Keep tools 决定是否保留源曲面、合并范围。 |
| Enclose | Part Studios > Feature Tools > Enclose | /Content/PartStudio/enclose.htm | 用相交/相接的曲面、实体、平面、面包围出封闭体积：New/Add/Remove/Intersect、Keep tools（未勾选会删除所选实体所属零件，草图/平面除外）。 |
| Fillet | Part Studios > Feature Tools > Fillet | /Content/PartStudio/fillet.htm | 边圆角与 Full round 圆角：Radius/Width、Distance/Conic/Curvature 截面、Asymmetric、Partial fillet、Variable fillet、Allow edge overflow、Smooth fillet corners、失败可视化。 |
| Face Blend | Part Studios > Feature Tools > Face Blend | /Content/PartStudio/face_blend.htm | 面间融合（可连接/不连接）：Side 1/Side 2、Propagation、Rolling ball/Swept profile、Radius/Width、Asymmetric、四种 control、hold lines/cliff/caps/limits/help point、Trim type、Detached。 |
| Chamfer | Part Studios > Feature Tools > Chamfer | /Content/PartStudio/chamfer.htm | 边倒角：Offset/Tangent 测量、Equal distance/Two distances/Distance and angle、方向翻转与逐边覆盖、Tangent propagation。 |
| Draft | Part Studios > Feature Tools > Draft | /Content/PartStudio/draft.htm | 拔模：Neutral plane 或 Parting line；角度、切向传播、Reapply fillets；分型线模式支持 One sided/Symmetric/Two sided 与分型线传播。 |
| Body Draft | Part Studios > Feature Tools > Body Draft | /Content/PartStudio/body_draft.htm | 体/面/边级拔模：Draft scope（Parts/Faces/Edges to hold）、Parting entity、Pull direction、Symmetric、Match faces at parting、Match type、Concave repair、Corner type、Keep material；只加料不减料。 |
| Rib | Part Studios > Feature Tools > Rib | /Content/PartStudio/rib.htm | 以草图线为加强筋中心线：选择目标零件、Normal/Parallel to sketch plane、厚度、Draft、Extend profiles to part、Merge ribs（否则生成独立零件）。 |
| Shell | Part Studios > Feature Tools > Shell | /Content/PartStudio/shell.htm | 抽壳：选择要移除的面并在其余部分生成等壁厚空腔；厚度、内外方向箭头、Hollow 选项可不移除任何面。 |
| Hole | Part Studios > Feature Tools > Hole | /Content/PartStudio/hole.htm | 在草图点/圆中心/顶点/Mate connector 处打孔：Simple/Counterbore/Countersink、Drilled/Clearance/Tapped/PEM、Start plane 三选项、Blind/Up to next/Up to entity/Through all、Tip angle、名称自动更新。 |
| External Thread | Part Studios > Feature Tools > External Thread | /Content/PartStudio/external_thread.htm | 在凸圆柱面创建 ANSI/ISO 装饰螺纹：Blind/Up to next、可选 Chamfer 与 Undercut、Split face（与 Undercut 互斥），仅视觉不影响几何。 |
| Linear Pattern | Part Studios > Feature Tools > Linear Pattern | /Content/PartStudio/linear_pattern.htm | 线性/网格阵列 Part/Feature/Face：方向、Distance、Instance count、Centered、Second direction、Skip instances、Reapply features、合并范围。 |
| Circular Pattern | Part Studios > Feature Tools > Circular Pattern | /Content/PartStudio/circular_pattern.htm | 绕轴阵列 Part/Feature/Face：轴可为圆边/圆柱面/MC/草图圆、Angle、Instance count、Equal spacing、Centered、Skip instances、Reapply features。 |
| Curve Pattern | Part Studios > Feature Tools > Curve Pattern | /Content/PartStudio/curve_pattern.htm | 沿曲线/边链阵列：Equal spacing 或 Distance、实例数、Orientation（Tangent to curve/Normal to face/Locked）、路径过短报错、Skip instances、Reapply features。 |
| Mirror | Part Studios > Feature Tools > Mirror | /Content/PartStudio/mirror.htm | 关于平面/平面面/标准面/Plane 特征/MC 镜像 Part/Feature/Face：New/Add/Remove/Intersect、Reapply features、合并范围；无 skip instances。 |
| Boolean | Part Studios > Feature Tools > Boolean | /Content/PartStudio/boolean.htm | 实体/曲面布尔：Union/Subtract/Intersect、Keep tools、Subtract 的 Targets/Offset/Offset all/Faces to offset/Offset distance、Reapply fillet。 |
| Split | Part Studios > Feature Tools > Split | /Content/PartStudio/split.htm | 用平面/圆柱/MC/曲面/面/曲线分割 Part 或 Face：Keep tools、Trim to face boundaries、Keep both sides；Face 曲线分割支持投影方向与 Normal to target。 |
| Transform | Part Studios > Feature Tools > Transform | /Content/PartStudio/transform.htm | 平移/旋转/缩放/复制实体：Translate by line/distance/XYZ、Transform by Mate connectors、Rotate、Copy in place、Scale（可非均匀）、Copy part。 |
| Wrap | Part Studios > Feature Tools > Wrap | /Content/Sketch/wrap.htm | 将面或草图区域包裹到圆柱/圆锥：Angle、U shift、V shift；Solid（New/Add/Remove/Intersect + 厚度）/Surface/Split 三种结果，Trim to target、Specify anchor points。 |
| Decal | Part Studios > Feature Tools > Decal | /Content/PartStudio/decal.htm | 在平面或圆柱面贴图：图片来源（当前/其他文档/库/导入）、Angle、U/V shift、Realign + Placement origin + Horizontal reference、宽高与保持比例、透明与 4K 限制。 |
| Delete Part | Part Studios > Feature Tools > Delete Part | /Content/PartStudio/delete_part.htm | 参数化删除零件/曲面并生成 Delete Part 特征，可撤销；对组合零件支持 Dissolve/Ignore composite parts。 |
| Modify Fillet | Part Studios > Feature Tools > Modify Fillet | /Content/PartStudio/modify_fillet.htm | 直接编辑已有圆角：Change radius（默认）或 Remove fillet；Reapply fillet 保证与派生圆角衔接。 |
| Delete Face | Part Studios > Feature Tools > Delete Face | /Content/PartStudio/delete_face.htm | 删除面并按 Heal（延伸相交）/Cap（补面）/Leave open（留开口，实体变曲面）处理；可 Delete fillet faces；选项记忆。 |
| Move Face | Part Studios > Feature Tools > Move Face | /Content/PartStudio/move_face.htm | 直接编辑面：Offset（Blind/Up to entity）、Translate（方向来自 MC/轴/边/面法向）、Rotate（轴+角度）、Reapply fillet。 |
| Replace Face | Part Studios > Feature Tools > Replace Face | /Content/PartStudio/replace_face.htm | 用新面替换（修剪/延伸）旧面：Faces to replace/Faces to replace with、Offset distance、Flip alignment（默认取最近面）。 |
| Plane | Part Studios > Feature Tools > Plane | /Content/PartStudio/plane.htm | 构造平面：Offset、Plane point、Line angle、Point normal、Three point、Mid plane、Curve point、Tangent；Flip normal、类型记忆、右键 Size to Part Studio/Section view。 |
| Helix | Part Studios > Feature Tools > Helix | /Content/PartStudio/helix.htm | 创建螺旋：Cylinder/Cone、Axis、Circle 三类；Input type（Turns/Pitch/Turns and pitch）、Start angle/point、Height/End point、Computed revolutions 舍入、旋向、Show start/end profiles；不消耗源零件。 |
| Mate Connector | Part Studios > Feature Tools > Mate Connector | /Content/PartStudio/mate_connector.htm | 显式/隐式局部坐标系：On entity/Between entities、推理点（居中/中点/角点/锥面虚交点/孔槽区域中心/圆柱轴）、Realign、Move、Flip primary/Reorient secondary、Owner Entity/Attachment、显示隐藏。 |
| Derived | Part Studios > Feature Tools > Derived | /Content/PartStudio/derived.htm | 从同一/其他文档（或同一文档其他版本）关联插入 Part Studio、零件、曲面、曲线、草图、平面、活动钣金模型、MC：单向关联、Location/Placement、Include properties、子特征列表、无环引用约束。 |
| Variable | Part Studios > Feature Tools > Variable | /Content/PartStudio/variable.htm | 创建可复用变量：Length/Angle/Number/Any、Measured（Distance/Length/Diameter）、From table（CSV 行列过滤与 Map/Array）、在尺寸/特征中用 #name、数组索引、FeatureScript 函数、改名 Update all references。 |
| Query Variable | Part Studios > Feature Tools > Query Variable | /Content/PartStudio/query_variable.htm | 创建参数化选择组：Selection/Created by/Owned by/准则选择/All solid bodies/Edge convexity/Adjacent，Evaluate on use、Show selection、Union/Subtract/Intersection、下游特征自动更新。 |
| Composite Part | Part Studios > Feature Tools > Composite Part | /Content/PartStudio/composite_part.htm | 将零件/曲面/曲线/点组合为一个复合零件：Closed 消耗成员、未勾选为 open 保留成员；作为单一零件发布/元数据/BOM；可用 Delete Part 的 Dissolve/Ignore 拆解。 |
| Tag | Part Studios > Feature Tools > Tag | /Content/PartStudio/tag.htm | 给草图轮廓/零件/PCB 孔/标准件打标签：Frame（Standard/Description/Add Column/对齐点）、Form（加料/减料件、flat view 草图、form origin）、PCB holes、Standard Content（每 Part Studio 仅一个）。 |
| Add Custom Features | Part Studios > Feature Tools > Add Custom Features | /Content/PartStudio/add_custom_features.htm | 通过 Feature Studio 的 FeatureScript 添加/管理自定义特征与自定义表：跨文档按版本链接、Reference manager 更新、移除后仍可用、企业级发布、发布/取消发布/搜索、沙箱安全边界。 |

## 3. 核心概念与术语

- **Surface（曲面）**：单面、无质量/厚度的零件外表面表示；可由 Thicken 变实体、Enclose 围成封闭体积、作为构造几何或替换实体面。
- **Curve/surface continuity（G0–G3）**：G0 Match position（共享位置）、G1 Match tangent（相切）、G2 Match curvature（曲率一致）、G3 Match flow（流/曲率变化率一致）。阶数越高所需控制点越多（G0 1 个、G1 2 个、G2 3 个、G3 4 个端点侧）。Fillet 是 G1 的典型例子。
- **Creation type（创建类型）**：`Solid` / `Surface` / `Thin`。Extrude/Revolve/Sweep/Loft 会记忆上一次选择（文档明确“Onshape remembers the selection”）；初始默认未在所有页面明说。
- **Result operation（布尔结果）**：`New`（新建独立零件/曲面）、`Add`（并入已有）、`Remove`（切除）、`Intersect`（只保留相交体积）。曲面仅 New/Add（Extrude/Revolve/Sweep 的 Remove/Intersect 明确“not available for surfaces”）。
- **End type（端条件）**：`Blind`、`Up to next`、`Up to face`（支撑无限面）、`Up to part`（含曲面）、`Up to vertex`（点/Mate connector）、`Through all`；Revolve 另有默认 `Full revolve`；Hole 用 `Up to entity`。
- **Merge scope / Merge all（合并范围）**：Add/Remove/Intersect 时决定与哪些零件/曲面合并；文档多处写明“By default, Merge all is selected”，取消勾选才出现 Merge scope 字段；曲面只能与曲面合并、零件只能与零件合并；“Bool 为 Add/Remove/Intersect 且 merge scope 为空则特征报错；New 没有 merge scope”。
- **Direction / Opposite direction / Symmetric / Second end position / Starting offset**：方向切换、对称（Extrude 仅 Blind 与 Through all）、第二端独立端条件与深度、起始偏移（Blind 距离或 Entity 基准）。
- **Thin / Mid plane / Thickness / Thickness 1 / Thickness 2 / Flip wall**：薄壁特征的厚度模式；Mid plane 值独立于 Thickness 1/2，但三者输入值在切换时保留。
- **Keep tools**：决定工具实体（曲面/零件/工具面）在特征完成后是否保留；Thicken 默认删除源曲面并替换为新零件，Enclose 未勾选会删除所选实体所属零件（草图/平面除外），Split 选中面时默认保留工具面。
- **Tangent propagation / Propagation**：沿相切边/面扩展特征。Fillet、Chamfer、Draft、Face Blend 均有类似概念；Face Blend 还提供 `Adjacent`、`Custom`（最大角）。
- **Direct Editing（直接编辑）**：不依赖参数历史的编辑工具：Delete Face、Move Face、Replace Face、Modify Fillet；文档反复强调适合导入零件。
- **Parametric feature / Feature list / Parts list / Rollback bar**：每个特征都是 Feature list 中的参数化实体；编辑特征时模型默认回滚到该特征创建时的状态，`Final` 按钮查看最终结果（编辑最后一个特征时无 Final 按钮）。
- **Explicit vs implicit Mate connector**：显式由工具栏创建、位于 Feature list 顶层、可在建 mate 时从列表选择；隐式在创建 mate/某些 Part Studio 特征时生成、位于所属 mate 子层、不能从 Feature list 选择。所有 MC 的 Z 轴可作特征轴。
- **Composite part（组合零件）**：closed（消耗成员）与 open（不消耗）；组合零件本身永不拥有 Mate connector。
- **Query variable（查询变量）**：参数化选择组，可引用其他特征创建/拥有的实体，支持 Union/Subtract/Intersection，且可被下游特征消费。
- **Derived（派生）**：单向关联（base → target），可跨文档/版本；不能循环引用。
- **Cosmetic thread（装饰螺纹）**：External Thread 与 Tapped Hole 的视觉表示，不生成几何，便于快速重建；可在工程图用 Hole/thread callout 标注。
- **Tag purposes**：`Frame`、`Form`、`PCB holes`、`Standard Content`。
- **Custom feature / Feature Studio / FeatureScript**：自定义特征与自定义表的来源；在 Part Studio 工具栏添加，按文档版本链接。

## 4. 功能与 UI 明细

### 4.1 通用特征框架（Feature Basics）

- **可用位置**：Part Studio；iOS/Android 同一工作流。Sketch 打开时仅 Extrude、Revolve 两个特征工具出现在草图工具栏。
- **入口**：顶部 Feature tools 工具栏；`S` 键打开可自定义的 Feature shortcut toolbar（My account > Preferences > Shortcut toolbars）。
- **对话框交互**：
  - 打开时首个蓝底字段等待图形区选择，首个白色文本字段等待键盘输入；Tab 逐字段移动；方向键展开下拉、Enter 选择；空格勾选/取消勾选；Enter 再次接受并关闭对话框。
  - 标题红色 = 未填完或输入导致错误，阻止提交；黑色 = 可提交。
  - 蓝色文字+下划线 = 已选中的水平列表项；蓝底高亮字段 = 需要图形区选择；字段右侧 x 移除单项；右键 `Clear all` 清空多选。
  - 反向箭头切换方向；输入框支持直接输入单位，或使用文档默认单位；复选框表示可选规格；Preview slider 为 0%（应用前）到 100%（应用后）的不透明度控制。
  - 对话框右下角 Help 图标打开对应帮助主题。
- **编辑语义**：编辑特征时模型回滚到该特征创建状态并隐藏后续特征；`Final` 显示最终结果。无 Edit 权限但可复制文档时对话框全部灰化不可用。
- **数组参数重排**：Loft 等特征的选择顺序影响几何；Profiles 字段顶部对向箭头激活拖拽手柄，拖动重排后放下。
- **缺失引用**：被删实体的引用以红色显示；点 x 删除单个，右键 `Clear missing references` 全部清除。
- **注释**：Feature list 右键 `Add comment`，可勾选接收邮件通知；评论面板打开时被评论特征旁有图标。
- **布尔参数转表达式**：右键 Direction 字段 `Convert to expression`，输入如 `#Length>3`（true）/`#Length<3`（false）；右键 `Convert to checkbox` 转回复选框。
- **撤销/提交**：绿勾或 Enter 提交；红 X 或 Escape 取消。

### 4.2 基础实体特征

#### Extrude
- **位置/快捷键**：Sketch、Part Studio；`Shift+e`。
- **Creation type**：Solid / Surface / Thin（记忆上次选择）。Solid 在草图打开时自动选择所有闭合区域及嵌套实体。
- **Result**：New / Add / Remove / Intersect；Surface 仅 New / Add，Remove/Intersect “not available for surfaces”。
- **Faces/Regions 选择**：实体可选面与草图区域；曲面选草图曲线；薄壁选面与草图区域。
- **End type**：
  - `Blind`：Depth 指定距离；可选 Tolerance 图标设置 Precision/Type。
  - `Up to next`：到指定方向下一个面；未完全终止则失败；被拉伸区域/实体必须完全落在目标实体内。
  - `Up to face`：到所选面/平面背后的无限面；同样要求区域完全落在目标内。
  - `Up to part`：到下一个零件或曲面；找不到则失败；区域须完全落在目标内。
  - `Up to vertex`：到选定顶点或 Mate connector（可点 Mate point connector 图标选隐式 MC，选中后点字段中 MC 图标编辑）。
  - `Through all`：穿过所有选定零件。
  - Up to next/face/part/vertex 支持一或两个方向的 `Offset`（单/双箭头），Offset 使结果短于目标；可反向。
- **方向/起始/对称/第二端**：
  - `Direction` 复选框：沿轴/线或 Mate connector Z 轴拉伸。
  - `Starting Offset`：Blind（距离）或 Entity（零件/面/MC，与草图平面平行的实体），可反向。
  - `Symmetric`：仅 Blind 与 Through all。
  - `Second end position`：提供全部端条件、独立深度、独立 Draft（草图平面为中性面）和反向。
  - `Draft`：以草图平面为中性面，输入角度，反向图标翻转。
- **Merge scope**：默认 Merge all；取消后可指定零件/曲面；曲面与曲面合并、零件与零件合并。
- **Thin**：`Mid plane` + `Thickness`，或 Thickness 1/2 + `Flip wall`；Mid plane 的 Thickness 与 T1/T2 数值独立但切换保留。
- **钣金平面图**：在 flat pattern 草图上拉伸出现简化对话框，只能加/减材料；不能把 3D 模型中的 Extrude 复用作 flat pattern 的 Extrude（会出再生警告）。
- **失败条件**：Up to next/up to part 无终止几何；区域不完全在目标内；Add/Remove/Intersect 未设 merge scope。

#### Revolve
- **位置/快捷键**：Sketch、Part Studio；`Shift+w`。
- **Creation type**：Solid / Surface / Thin（记忆）。
- **Result**：Solid/Thin 为 New/Add/Remove/Intersect；Surface 为 New/Add。
- **实体选择**：草图、草图区域、草图实体、平面面或曲线。
- **轴**：线性草图实体、线性边、线性曲线、圆柱边、圆形草图实体、圆弧、Mate connector（可隐式/显式并编辑）。
- **端条件**：`Full revolve` 默认勾选（360°）；取消后 `Blind`（Revolve angle）、`Up to next`、`Up to face`、`Up to part`、`Up to vertex`。Up to 类支持按角度 `Offset`，可用 `Flip offset` 反向。
- **第二端**：Blind 与 Up to Entity 端条件支持 Second end position。
- **Symmetric**：Blind 可在轴两侧对称角度。
- **Thin**：Mid plane + Thickness，或 Thickness 1/2 + Flip wall。
- **Merge scope**：同 Extrude 规则。

#### Sweep
- **位置**：Part Studio。
- **Creation type**：Solid / Surface / Thin。
- **轮廓/路径**：闭合轮廓+平面面可做实体扫掠；开放轮廓可做曲面或薄壁实体；闭合轮廓 + Thin 得到空心扫掠实体；曲面可用闭合或开放草图。路径可为一段或多段草图实体、整个草图、曲线或模型边。
- **Result**：Solid New/Add/Remove/Intersect；Surface New/Add；Thin New/Add/Remove/Intersect。
- **Profile control**：`None`（保持轮廓与全局平面的关系）、`Keep profile orientation`（沿路径保持轮廓关系）、`Lock profile faces`、`Lock profile direction`（选择要锁定的方向）。
- **Twist**（可选）：`Turns`（总旋转圈数）、`Angle`（路径末端旋转角）、`Pitch`（每圈沿路径前进的节距）。
- **其他**：路径字段右侧 `Opposite direction`（从路径另一端开始）；`Extend to full path`（沿整条路径扫掠）；`Scale` + Scale factor（末端按比例缩放轮廓）。
- **Thin**：Mid plane 或 Thickness 1/2 + Flip wall；`Trim ends` 勾选则从路径端点开始/终止，取消则生成与路径相切的端面（文档仅在 Thin 步骤中描述此选项）。
- **Merge scope**：同通用规则。
- **Notes**：轮廓位于路径中段（非端点）时路径在轮廓平面处断开、向两侧全长扫掠；Twist/Scale 可在轮廓不重合路径端点时使用。

#### Loft
- **位置**：Part Studio（含 iOS/Android）。
- **Creation type**：Solid / Surface / Thin（记忆）。
- **Result**：Solid/Thin New/Add/Remove/Intersect；Surface New/Add。
- **Profiles**：至少 2 个，可为区域、平面/非平面面、曲面、边、单点；必须按起始到终止顺序选择；可展开字段做切向连续复合选择；支持 Reorder items 拖拽重排。
- **起终端条件**（Start/End profile condition，可分别设 Magnitude）：
  - `Normal to profile`、`Tangent to profile`；
  - `Match tangent`、`Match curvature`（需相邻面，启用 `Adjacent faces` 字段；面与边不必相交或同属一个零件）；
  - `Normal direction`、`Tangent direction`（方向来自线/MC，Magnitude 可正可负）。
- **Guides and continuity**：选曲线作 guide；guide 必须切向连续（G1）且与每个 profile 边界相交；可用 `Trim guides`、`Trim profiles` 修剪放样；guide 连续性：`Normal to guide`、`Tangent to guide`、`Match tangent`、`Match curvature`。若草图与 Match tangent/curvature 不一致，放样失败。
- **Path（中线）**：Path 复选框 + 边/曲线/草图；输入 section count（中间截面数），越多越贴近路径。实体页注明“Loft path 不兼容非平面 profile”。
- **Connections**：控制扭转；有 guide 时按 guide 对齐，否则按顶点邻近估算；自动连接显示为洋红色（仅无 Match connection 时可见）；每个 connection 需两个选择（可顶点-边）；可用操纵器拖拽调整。
- **Show isocurves**：显示网格叠加，Count 控制等参线数量。
- **Thin**：Mid plane 或 Thickness 1/2 + Flip wall；`Trim ends`（勾选在 profile 处起止，取消生成与 profile 相切的端面）。
- **Merge scope**：Add/Remove/Intersect 时可勾 Merge with all 或指定 Merge scope。
- **限制/失败**：profile 不能含多个 contour（多轮廓显示红色）；不支持 nested loops；最佳实践是各 profile 顶点数一致；vertex 选择必须每个 profile 一个；profile 与 guide 在字段中各为单一条目；多边 guide 应来自同一草图并从 Feature list 选择；profile 顺序错会失败；Match tangent/curvature 与草图不一致会失败。
- **文档不一致**：实体段说 guide “不必接触 profile 外侧、只需相交”，曲面段说 “guide 必须接触 profile 外侧而不是中心”；两处表述相反，需以实际产品验证。

#### Thicken
- **位置**：Part Studio。
- **输入**：草图、零件面或曲面（视频说 sketch/part face/surface；步骤说 part face or surface）。
- **Result**：New / Add / Remove / Intersect。选中零件面时类型自动切为 Add；改为 Remove 时方向箭头自动翻转。
- **厚度**：Mid plane + Thickness（对称），或 Thickness 1（+ Opposite direction）与 Thickness 2；三种数值切换时保留。
- **Keep tools**：默认未勾选，曲面被删除并由新零件替换；实体和草图永不删除；勾选保留源曲面。
- **Merge scope**：可选 Merge scope/Merge with all；Add/Remove/Intersect 未设合并范围会报错。

#### Enclose
- **位置**：Part Studio。
- **输入**：曲面、实体（含平面与面）等边界，必须彼此相交或在边界处连接形成封闭体积。
- **Result**：New / Add / Remove / Intersect；Add/Remove/Intersect 需要 merge scope（示例用 box 零件作 merge scope）。
- **Keep tools**：勾选保留所有选择实体；未勾选则删除所选实体所属零件（来自草图或平面的除外）。
- **结果**：新实体零件；开启 Keep tools 时曲面保留且体积为新实体。

#### Rib
- **位置**：Part Studio。
- **输入**：草图曲线作筋中心线；选择要纳入的零件（决定加料目标、草图延伸要相交的对象）。
- **方向**：`Normal to sketch plane`（筋垂直于草图）或 `Parallel to sketch plane`，方向箭头翻转。
- **参数**：Thickness；`Draft` + Draft angle + 反向（两侧锥度）。
- **Extend profiles to part**：草图线未接触零件时延伸至零件；直线延伸，圆弧从两端按直线延伸。
- **Merge ribs / Merge with all**：勾选并入已有零件；取消则每条筋生成独立新零件。
- **失败**：筋必须完全位于零件边界内，否则操作失败。

#### Shell
- **位置**：Part Studio。
- **输入**：Faces to shell（要移除的面，一个或多个），其余部分被抽空形成等壁厚空腔。
- **参数**：壁厚数值；方向箭头决定以所选面作为壳内侧（默认）或外侧；`Hollow` 复选框可在不移除任何面的情况下整体空心化。
- **显示**：开启 Hidden edges visible 时空心零件会显示内部边。

### 4.3 圆角/融合/倒角/拔模

#### Fillet
- **位置/快捷键**：Part Studio；`Shift+f`。
- **类型**：`Edge` 与 `Full round`。
- **Edge 圆角**：
  - 选择边或面（Onshape 自动应用正确特征）；钣金建议用 Sheet metal corner break。
  - `Tangent propagation` 默认勾选（沿相切边延伸）；取消则只处理所选边。
  - Measurement：`Radius`（可设 Tolerance）或 `Width`（两端距离，恒定宽度）。
  - Control：`Distance`（圆形边，记忆上次半径）、`Conic`（Rho：0.25 椭圆、0.5 抛物线、0.999 双曲线）、`Curvature`（Magnitude 0–0.999 调整相切）。Measurement 与 Cross-section 会记忆。
  - `Asymmetric`：Second radius + Flip asymmetric（另一端）。
  - `Partial fillet`：Start 端条件 `Position`（从顶点起百分比）、`Entity`（平面或 MC）、`Offset`（距顶点距离）；Opposite direction 翻转；`Second bound` 可设 End type/End position。
  - `Variable fillet`：黑色圆点表示可选顶点，逐顶点给半径；`Add point on edge` 新增边上点（点 Edge 字段选边，拖动圆点箭头或输入 location，填写 Radius）；`Smooth transition` 仅在 variable fillet 时可用，平滑顶点间线条。
  - `Allow edge overflow` 默认开启：允许修改圆角生成面的边以形成平滑连续面；关闭则保留这些边、结果更自由；下拉可选要保留的边。
  - `Smooth fillet corners`：两条圆角边之间生成圆角顶点；下拉可选排除的角。
- **Full round**：选一个 side face、一个 opposite side face、一个或多个要替换的面；保持 Tangent propagation；文档明确“不能一次对多个不连续面做 full round”。
- **失败**：圆角规格大于所选边/面时显示失败可视化（错误图形）。
- **记忆**：Measurement 与 Cross-section 记住上次选择。

#### Face Blend
- **位置**：Part Studio。
- **Side 1 / Side 2**：各可选一个或多个面（同一零件；Side 2 可来自另一零件）；各有翻转箭头。
- **Propagation**：勾选后沿连接面扩展：`Tangent`、`Adjacent`、`Custom`（最大角输入）。取消则只融合所选边。文档明确 `Tangent propagation does not work when Swept profile is selected`。
- **Cross section**：`Rolling ball`（默认，类似圆角）或 `Swept profile`（选 Spine，Spine 为零件边或草图边，融合边与 Spine 正交）。
- **Measurement**：Radius 或 Width。
- **Asymmetric**：Radius 模式填 Second radius；Width 模式填 Ratio；Flip asymmetric。
- **Control**：`Circular`（圆滑斜面）、`Conic`（Rho）、`Curvature`（Magnitude 0–0.999）、`Chamfer`（线性斜面）。
- **Constraints and limits**：
  - `Tangent hold lines`：选 tangent edge 或 inverse tangent edge，对称夹紧；不能与 Asymmetric 同用。
  - `Conic hold lines`：选 conic edge 或 inverse conic edge，非对称夹紧，可 Side 1/Side 2 混用。
  - `Cliff edges`：把融合斜面夹到所选边；hold line/cliff 必须是 Side 1/2 的面边，不能用草图边（可先 Split 面造边）。
  - `Caps`：选面/平面封住融合壁端；可 Flip cap；可多个。
  - `Limits`：Plane limit（+Flip）、Second plane limit（+Flip）、Face limits（多选）、Edge limits（Edge + Side，可多个）。
  - `Help point`：多个融合时只保留离所选顶点/MC 最近的一个。
- **Trim type**：`Wall`（从 Side 1/2 边壁开始）、`Short`（最短）、`Long`（最长）、`No trim`（超出两侧壁）。
- **Detached**：默认融合附着在零件上；勾选后融合变成 Parts list 中的新曲面（可解决自交错误）。
- **Show isocurves**：网格叠加，Count 控制数量。
- **记忆**：Cross section、measurement、Constraints and limits、Trim type 记住上次选择。
- **失败/解决**：附着融合可能失败，Detached 或 Caps 可解决；自交曲面用 Detached 解决。

#### Chamfer
- **位置**：Part Studio。
- **输入**：边或面；钣金建议 Sheet metal corner break。
- **Measurement type**（对非平面相邻面有意义，平面面两者行为一致）：
  - `Offset`：从起始边到倒角的距离；依赖边、计算从第一选择开始沿链推进，选择顺序会改变几何。
  - `Tangent`：从相邻两面切线交点到倒角的距离；不依赖边。
- **Operation**：`Equal distance`、`Two distances`、`Distance and angle`。角度默认 45°；Equal distance 与 Distance-and-angle 记住上次距离。
- **方向**：Two distances / Distance-and-angle 可用箭头翻转所有边，或在 `Direction overrides` 中逐边翻转。
- **Tangent propagation**：正文写“可选勾选”，视频写“保持勾选以沿周边边延伸”，存在表述不一致。
- **Tolerance**：可设 Precision/Type。
- **记忆**：操作类型记住上次选择。

#### Draft
- **位置**：Part Studio。
- **类型**：`Neutral plane` 与 `Parting line`。
- **Neutral plane**：
  - 选面或 Mate connector 作中性面；选 Entities to draft（所有要拔模的面）；输入角度。
  - `Tangent propagation`：只选择比拔模角更陡的面；非陡圆角会重新应用。
  - `Reapply fillets`：陡峭圆角面被当作拔模面并转换为锥面；不勾选则作为圆角重新融合，得到圆柱面，通常更理想；大角度时常出现不理想几何。
  - 滑块可对比前后。
- **Parting line**：
  - 前置条件：必须先用 Split 工具分割面（不是分割整个零件）产生分型线。
  - `Pull direction`（面或 MC，主轴方向）；`Parting edges` 选分型线。
  - `Parting line propagation`：沿整条分型线延伸到相切面；支持多选（可不相切）。
  - 侧别：`One sided`、`Symmetric`、`Two sided`；Switch face 箭头翻转。
  - 角度；`Reapply fillets`（生成锥面并保留分型线边）；滑块预览。
- **交叉引用**：Draft analysis 另见分析章节。

#### Body Draft
- **位置**：Part Studio；iOS/Android 只能查看/编辑桌面端插入的 body draft。
- **Draft scope**：
  - `Parts to draft`：选要拔模的零件，可选 `Faces to exclude`。
  - `Faces to draft`：只选要拔模的面（等价于 hold 该面的所有边）。
  - `Edges to hold`：显式选要保持的边，向下拔模到 parting entity。
- **Parting entity**：分割模型为两半；当适用时自动填入与 Pull direction 相同的选择，需不同选择时清空重选；可点 MC 按钮选 MC；`Draft on self` 勾选后以零件自身为 parting entity，无需外部 parting 实体。
- **Pull direction**：边、面、平面或 MC，沿主轴；可反向箭头翻转。
- **Angle**：数值。
- **Symmetric**：从 parting entity 两侧重复特征。
- **Match faces at parting**（Symmetric 时可勾）：额外加料使两侧在分型线处相接。
- **Match type**：`Reference edge`（拔模到 Match faces at parting 未启用时可见的参考边，额外加料使拔模在 Parting entity 汇合）、`Tangent to face`（拔模到与零件面相切）。
- **Concave repair**：`None`（默认，不处理自交/狭窄区）、`Radius`（圆化角部）、`Mix`（直线区接半径）。
- **Corner type**：`Extend`（面延伸超出极限直到相交）、`Plane`（面到极限后新建平面接边）。
- **Keep material**：默认拔模扫过的材料被移除；勾选则保留。
- **语义**：始终加料，从一组边向下生成斜面并附着回模型；可处理比 Draft 更复杂的几何（如圆环面）。

### 4.4 孔与螺纹

#### Hole
- **位置**：Part Studio。
- **孔位输入**：草图点（独立点、顶点、圆/圆弧中心、几何角点、线端、样条点等），可框选；也可点 Mate connector 图标选/建隐式 MC（选中后可编辑）；或直接选整张草图以选所有非构造几何点。
- **测量制**：Inch / Metric。
- **Hole style**：`Simple`（等径钻孔）、`Counterbore`（圆柱平底沉孔，扩大同轴孔）、`Countersink`（顶部锥形扩孔）。
- **Hole type**（依选择而定）：
  - `Drilled` + Drill size 下拉。
  - `Clearance` + Size + `Fastener fit`（Close、Free、Close (ASME)、Normal (ASME)、Loose (ASME)）。
  - `Tapped`：`Tap type`（Straight tap、Straight pipe tap（仅公制）、Tapered pipe tap）；Straight pipe tap 时 `Thread type` G（BSPP 平行）/RP（平行内螺纹，配锥形外螺纹）；Size；Threads/inch；`Fastener fit` 仅在 Straight tap 且 Merge scope ≥2 零件时出现（None/Close/Free/Close ASME/Normal ASME/Loose ASME）；可切 `Thread class`（Inch/Metric 等级下拉）。装饰螺纹不生成几何。
  - `PEM®`：Fastener（Self-clinching nuts/standoffs/studs & pins）、Fastener type（S™/SS™/CLS™/CLSS™/SP™ nuts、CLA™、S-RT™、SL™ TRI-DENT®、H™/HNL™、SH™、SMPS™/SMPP™ 等）、Size、Fastener fit（Clearance）；不可用于 counterbore/countersink。
- **Diameter**：数值 + Tolerance 控件。
- **Start plane**：`Start from part`（默认，从零件面开始）、`Start from sketch plane`、`Start from selected plane`（+ Hole start plane 或 MC）。示例说明起始选项会影响沉孔/沉头深度和孔深。
- **Merge scope**：指定被切的零件（单零件时自动填充）。
- **Termination**：
  - `Blind`：Depth（含 counterbore/countersink 深度）；Counterbore diameter/depth；Countersink diameter/angle；Tapped depth；Tap clearance（盲螺纹孔中螺纹底到孔底之间的螺纹圈数）。Limits/Deviation 容差类型允许零/负上下界，但下限大于上限报错，上下限可相等。
  - `Up to next`：到下一面；`Offset from tip` + 反向；Depth 显示 Multiple。
  - `Up to entity`：到所选实体/MC；`Offset from tip`；保证整个直径切到实体；若 Tip Angle 非 Flat 尖端会超出实体。
  - `Through all`：穿过 Merge scope 中所有零件；Tapped 孔可保持 `Tap through all`，取消后设 Tapped depth。
  - 所有终止方式均有方向反向箭头。
- **Tip angle style**：118°、135°、Flat、Custom（+ Tip angle）。
- **名称**：随孔设置自动更新；名称字段铅笔图标可改名，清空后回车恢复自动名。
- **Notes/失败**：
  - 草图平面点到孔之间材料全部清除；草图改动触发孔重算。
  - 默认启用“良好起始深度”逻辑（适合曲面/不规则面）；勾选从草图平面开始可关闭该逻辑并允许重叠孔。
  - 孔特征碰撞/重叠或孔不完全落在目标零件上时，孔相对草图平面以 0 深度钻孔。
  - 标准若无 counterbore/countersink/tap 直径，超范围值会被重置。
  - 多零件且 Tapped > Fastener fit 非 None 时，初始孔为 clearance 孔、最后一个孔为 tapped（替代已废弃的 Blind in last）。
  - 优势：只有 Hole 特征创建的孔可添加 Hole callout；装配中 auto-size 自动定直径/螺纹规格，而 Extrude Remove 无法检测长度/螺纹长度。

#### External Thread
- **位置**：Part Studio。
- **输入**：凸圆柱面的边（轴、螺栓等），可一次选多个同尺寸边；不同尺寸需另建特征。
- **标准**：ANSI（Size + Threads per inch）/ ISO（Size + Pitch）；尺寸按所选边直径自动生成，手动可改；切换标准后必须手动选 Size 才恢复自动定尺。
- **端条件**：`Blind`（按 Length 延伸）或 `Up to Next`（到下一个面）。
- **Add chamfer**：勾选后可输入距离（从表面向下）与角度。
- **Add undercut**：输入 Diameter 与 Length；默认直径比小径低 0.015"（直径方向），长度默认 2× 螺距，并随螺纹/螺距组合自动调整。
- **Split face**：可选；勾选 Undercut 时不可用。
- **结果/边界**：仅装饰螺纹，不改变几何；工程图在圆柱面顶部以虚线显示，遮挡时也反映；可用 Dimension 菜单下的 `Hole/thread callout` 标注；螺纹不进入 Hole tables。

### 4.5 阵列/镜像/布尔/分割/变换

#### 通用阵列语义（Linear/Circular/Curve Pattern 共用）
- **位置**：Part Studio；Linear/Circular/Curve Pattern 与 Mirror 可用于活动钣金操作。
- **Result**：New / Add / Remove / Intersect。
- **Pattern type**：`Part`（复制零件，可有布尔）、`Feature`（复制 Feature list 中特征）、`Face`（复制面，性能最佳）。
  - New：每个实例生成新零件；文档警告多个相同零件会作为独立零件进入装配与 BOM，不推荐。
  - Add：加料，重叠零件可合并为一个。
  - Remove：实例与零件相交处去料。
  - Intersect：只保留实例与零件相交处。
- **Face 选择**：可用 Create Selection 选相关面；设置选择类型，选面后 `Add selection`。
- **Skip instances**（除 Mirror）：灰色选择点，点选或框选跳过；跳过的点高亮浅蓝；列表中 X 恢复、CLEAR 清空。
- **Merge scope**：决定哪些零件受阵列影响；可 `Merge with all`。
- **Feature 选择规则**：可选 Feature list 任意项、任意顺序，但应用顺序按 Feature list；选中 pattern 只复制该 pattern 不含 seed，需同时选 seed；pattern 布尔特征时还必须选被布尔作用的特征；feature pattern 应用特征全部方面（如端条件），face pattern 不识别这些修饰。
- **Reapply features**（Feature pattern）：默认不重算 seed 的端条件；勾选后按实例重新生成（含依赖与端条件，外部引用逐实例重生成）。性能/重算时间有代价，仅必要时用。草图 seed 的尺寸/约束到原点或默认平面（Top/Front/Right）不会重新应用；可先用辅助草图代理原点/默认平面约束来控制哪些尺寸被复制。
- **Mate connectors**：Part pattern 的 MC 在插入装配时全部带入；若看不到，确认 Part 是 MC 的 owner entity。

#### Linear Pattern
- **方向**：Direction 字段选平面/平面面、线性边、线性草图实体、线性曲线；方向取“垂直于所选面/边/MC”的方向。
- **参数**：Distance（实例间距）；Instance count（最小 1，含 seed）；反向箭头。
- **Centered**：seed 位于中心时，向两个方向各生成 N 个实例（含 seed）——文档表述为每方向 N 个、以 Instance count 的 N 为准。
- **Second direction**：复选框展开第二方向，含自己的 Direction、Distance、Instance count。
- **Skip instances 列表**：每个实例用两个数字表示——第一方向从 0 开始的位置、第二方向从 0 开始的位置。

#### Circular Pattern
- **轴**：圆形边、圆柱/圆锥面、草图圆/线性草图实体、Mate connector（主轴/Z 轴）；可点按钮建隐式 MC，选中后点字段内 MC 图标编辑 alignment/position/angle。
- **参数**：Angle、Instance count（最小 1，含 seed）；反向箭头切换左右方向。
- **Equal spacing**：勾选时实例在 Angle 内均匀分布；取消后 Angle 解释为“实例间夹角”（示例：60° 夹角 3 实例，则首末相隔 120°）。
- **Centered**：seed 在中心时关于轴向两侧对称分布。

#### Curve Pattern
- **路径**：草图曲线或端点相接的相邻曲线序列、实体边、wire 零件边；最佳实践从 seed 实例开始；多段必须端点对端点。
- **间距**：`Equal spacing`（沿整条路径均匀分布）或 `Distance`（实例间距，输入 Distance 字段）。
- **实例数**：最小 1。
- **Orientation**：`Tangent to curve`（实例与曲线相切）、`Normal to face`（实例平行于所选面）、`Locked`（锁定实例）；文档在 Locked 下写“(If Lock faces is selected) Select faces to lock”，用词不一致。
- **失败**：曲线长度不足以按 Distance 放下所有实例时报错；可减小间距、减少实例、改用 Equal spacing 或用更长曲线。
- **Notes**：完成阵列后可单独删除实例；多曲线/边时若结果不符可换选择顺序。

#### Mirror
- **Pattern type**：Part / Feature / Face；文档用“Result operation type”同时指代 Part/Feature/Face 与 New/Add/Remove/Intersect，需按上下文区分。
- **Mirror plane**：平面面、标准平面、Plane 特征或 Mate connector；MC 的 secondary axes 充当镜像平面；可选隐式 MC，选中后可编辑。
- **Feature 类型**：可选 Reapply features（逐实例重生成含依赖）；草图 seed 的原点/默认平面尺寸与约束不重应用。
- **Merge**：与通用规则相同；New 无 merge scope。
- **差异**：Mirror 没有 skip instances。

#### Boolean
- **位置**：Part Studio。
- **操作**：`Union`（合并）、`Subtract`（去除，可留间隙）、`Intersect`（只保留相交）。
- **Tools**：选择要合并/去除/求交的零件或曲面。
- **Keep tools**：保留原工具实体；三个操作均可用；记住上次选择。
- **Subtract 专属**：`Targets`（被作用对象）；`Offset`（在所选面与剩余零件之间造间隙）；`Offset all`（所有被减零件与剩余零件之间造间隙，此时 Faces to offset 不可用）；`Faces to offset`（选择要偏移的面）；`Offset distance`；`Opposite direction`；`Reapply fillet`（保持勾选应用圆角，取消则去除）。
- **约束**：零件必须相交，Boolean 才能工作；两个彼此独立的零件不行。
- **结果语义**：合并后部分实体不再存在时，保留较早选择实体的属性（如零件名）。

#### Split
- **位置**：Part Studio。
- **类型**：Part / Face（示例还展示 Split Surface）。
- **Split Part**：
  - 选要分割的零件、曲面或曲线。
  - 分割工具：平面、圆柱、Mate connector/隐式 MC、曲面或面；只能有一个分割实体；可在 Feature list 选显式 MC。
  - `Keep tools`：保留分割工具；选“面”时默认开启且保留该面；仅在使用完整曲面时该选项有效（原文表述：Keep tools valid only when a full surface is selected; when a face is selected defaults to on）。
  - `Trim to face boundaries`：把分割限制在所选面的边界内，否则延伸所选面的边；仅当选“面”时有效，选完整曲面时忽略；多面曲面 + 该选项时，必须选曲面中的单个面作工具才能修剪。
  - `Keep both sides`：取消后只保留一侧，方向箭头选择保留侧。
- **Split Face**：
  - 选要分割的面（可多个）。
  - 工具：平面、MC/隐式 MC、曲面、面或曲线。
  - 曲线投影方向：`Use sketch plane direction`（草图平面法向）或取消后选模型边作方向；`Normal to target`（从目标面法向投影）。
  - `Keep tool surfaces and curves`：保留工具。

#### Transform
- **位置**：Part Studio。
- **输入**：零件（可选其 MC/轴一并移动）。
- **方式**：
  - `Translate by line`：选一条线（如零件边）；选点时需两个点。
  - `Translate by distance`：方向由实体/MC 指定 + 距离（数值或箭头）。
  - `Translate by XYZ`：X/Y/Z 数值，或拖动操纵器。
  - `Transform by Mate connectors`：from/to 两个 MC（隐式/显式）或轴，方向箭头翻转。
  - `Rotate`：轴或 MC + 角度（数值或箭头）。
  - `Copy in place`：原位复制，生成独立可编辑零件；需求多个副本时文档建议用 Pattern 且距离 0。
  - `Scale`：`Scale Uniformly` 复选框；取消后可分 X/Y/Z；选择点或 MC（相对 MC/轴坐标系）缩放。
- **Copy part**：可选复制零件；步骤同时列出 Copy part 与 Copy in place 两个入口。

### 4.6 Wrap / Decal

#### Wrap
- **位置**：Sketch（TOC 归在 Part Studio > Feature Tools）。
- **限制**：当前仅支持圆柱或圆锥零件/曲面。
- **输入**：Tools（要包裹的面或草图区域）、Target（圆柱/圆锥）。
- **位置参数**：Angle（倾斜度）、U shift（水平移动）、V shift（垂直移动）。
- **Solid 模式**：New/Add/Remove/Intersect；厚度；`Trim to target`（工具超出目标边界时隐藏）；`Specify anchor points`（工具一点对齐目标一点）；Merge scope/Merge with all。
- **Surface 模式**：Trim to target、Specify anchor points。
- **Split 模式**：Split 目标面、Specify anchor points。

#### Decal
- **位置**：Part Studio。
- **图片**：Select image 可从 Current document / Other documents / Libraries / Import（设备）；支持 PNG、JPG、GIF、BMP；最大 4096×4096 像素。
- **面**：仅平面或圆柱面；若打开 Decal 前已选面，则 Face 字段预填。
- **放置**：Angle（度）+ Angle opposite；U shift / V shift（长度单位）；曲面方向为 U、V、Normal。
- **Realign**：`Placement origin`（显式/隐式 MC，取 MC 的 Z 轴；隐式可编辑）；确认后图片周围出现 9 个参考点，可点任一点对齐 decal placement origin；`Horizontal reference`（面/边或切 MC）用于旋转/对齐倾斜边。
- **尺寸**：`Maintain aspect ratio` 勾选时改 Width 或 Height 会同步另一值；取消可独立改；也可拖拽 resize 箭头；放置时默认自动适配面尺寸。
- **操纵器**：U、V、角度（0–360°）、尺寸（保持比例）。
- **透明**：支持图片透明（如 PCB 孔/via 透出）。
- **边界/错误**：面变为非平面/圆柱（如锥面）会使 decal 特征报错；Drawings 中仅在 shaded view 可见；Render Studio 支持。

### 4.7 直接编辑

#### Delete Part
- **位置**：Part Studio。
- **语义**：参数化操作，生成 `Delete Part` 特征，可撤销；被删零件/曲面从 Feature list 移除。
- **组合零件**：对话框下拉可选 `Dissolve composite parts`（把 closed/open 复合拆回成员实体）、`Ignore composite parts`（可选中复合中的单个 body 删除）。
- **替代删除方式**：在图形区选面/边会高亮创建它的特征，按 Delete 删除该特征而非零件；同样是可撤销的参数化操作。
- **其他**：可一次多选；删除零件后零件颜色按 Onshape 自动色序重排（自定义颜色除外）；适合把临时工具零件在多次 Boolean 后丢弃。

#### Modify Fillet
- **位置**：Part Studio。
- **输入**：要修改/移除的圆角面。
- **模式**：`Change radius`（默认，输入新 Fillet radius）或 `Remove fillet`。
- **Reapply fillet**：默认勾选，使修改后的圆角顺畅过渡到派生圆角；取消可能出现不理想特征。
- **选择**：多个圆角互相交汇时可右键用 Create Selection 辅助选全。

#### Delete Face
- **位置**：Part Studio。
- **输入**：要删除的面。
- **处理方式**：`Heal`（延伸周围面直到相交）、`Cap`（在空缺上补面）、`Leave open`（保持开口，实体变曲面）；记住上次选择。
- **Delete fillet faces**：勾选同时删除相邻圆角面。
- **选择**：Faces 字段旁 Create Selection 便于选相关面。

#### Move Face
- **位置**：Part Studio。
- **Offset**：常用于非平面面增减半径；选任意面组合；End type `Blind`（距离+箭头翻转）或 `Up to entity`（选零件/曲面）；输入位移值。
- **Translate**：选面；Direction 可选 MC/轴（平行）、边（平行）、面（法向）；End type `Blind` 或 `Up to entity`（顶点或平行面）；可选 `Offset distance` 使面间留偏移。
- **Rotate**：选面；Axis 或 MC；输入角度；箭头反向。
- **Reapply fillet**：视频说明保持勾选以重新应用相邻圆角（步骤正文未列）。
- **选择**：Create Selection 辅助。

#### Replace Face
- **位置**：Part Studio。
- **输入**：`Faces to replace`（要修剪/延伸的一个或多个面）；`Faces to replace with`（一个或多个替换面）。
- **参数**：`Offset distance`（可选，面间分离距离）；`Flip alignment`（切换到相反方向；默认替换面为离被替换面最近者）。
- **示例**：可先创建曲面再用 Replace face 延伸；支持多面替换；替换后曲面可在 Parts list 隐藏/显示。

### 4.8 构造几何

#### Plane
- **位置**：Part Studio。
- **基础实体类型**：`Plane`（平面/平面面/MC）、`Point`（顶点/草图点/MC/原点）、`Line`（线性边/草图线/圆柱面轴线）。
- **Plane type**（记住上次类型）：
  - `Offset`：从平面/平面面/MC 的 XY 平面/另一平面/圆边偏移给定距离；预选平面面时默认此类型；可拖操纵器、箭头翻转。
  - `Plane point`：过一点且平行于所选平面。
  - `Line angle`：过一条线并按参考几何与角度旋转；可拖角度操纵器、箭头翻转。
  - `Point normal`：过点且垂直于线/轴（直线段或圆、圆弧、圆柱面、旋转面等定义的轴）；点为平面原点、轴为法向；预选线+点时默认此类型。
  - `Three point`：过三点。
  - `Mid plane`：两平面交线处，或两平行平面的正中间；`Flip alignment`；`Flip normal`（平行面中间平面示例）。
  - `Curve point`：过点且垂直于曲线；曲线定义法向，点/MC 定义原点；法向始终与曲线相切。
  - `Tangent`：与圆柱面相切；选圆柱面 + 一个点（共面）或一个平面（平行）。
- **Flip normal**：复选框；平面名称显示法向方向。Offset 对话框也提供 Flip normal（视频）。
- **快捷键/右键**：`p` 隐藏/显示所有平面；右键 `Size to Part Studio` 调整平面大小；右键 `Section view` 进入剖视，对话框 X 退出。

#### Helix
- **位置**：Part Studio。
- **类型**：`Cylinder/Cone`、`Axis`、`Circle`。
- **通用参数**：`Input type`（Turns / Pitch / Turns and pitch）；方向箭头；Start condition `Start angle` 或 `Start point`；`Show start and end profiles`。
- **Cylinder/Cone**：选锥面或圆柱面；Turns/Pitch 时 End condition `Height`（可拖操纵器）或 `End point`（+Computed revolutions，默认向下取整，Flip rounding 改为向上）；Target revolutions 或 Target pitch；Clockwise/Counterclockwise。
- **Axis**：选轴（线/边）或 MC 的 Z 轴（可建隐式 MC）；Start angle/Start point（Opposite origin 用相反顶点）；Start Radius；可选 End radius（非对称螺旋）。
- **Circle**：选圆或圆弧边作为螺旋基圆；Start angle/point；Height 或 End point（同一平面上的端点会产生零高度螺旋）。
- **不消耗**：helix 不消耗用于创建的零件。
- **弹簧工作流**：helix → 以 helix 顶点建 curve point plane → 在平面上以 helix 顶点为圆心画圆 → 沿 helix 扫掠。

#### Mate Connector
- **位置**：Part Studio、Assembly；创建快捷键 `Ctrl+m`；显示/隐藏快捷键 `k`。
- **类型**：`On entity`（在零件/草图上）或 `Between entities`（两实体之间中点）。
- **点选择**：在任意面滚动唤醒推理点；选中另一 MC；点面任意处自动取质心；可选 Origin（图形区或 Instances 列表）。`Shift` 锁定当前推理点，避免附近其他点弹出。
- **默认推理点**：面的质心；边/面中点；角点；锥面虚交点；平面面内区域（孔、槽）质心；圆柱/部分圆柱面轴线上（中、端）；曲线端点/控制点对齐全局 Z；曲线本身在最近端/控制点/中点相切；顶点法向于给定面。
- **Realign**：Primary axis entity 控制 Z 轴；Secondary axis entity 控制 XY。
- **Move**：X translation、Y translation、Z translation；Rotate 角度；装配数值字段支持表达式与三角函数。
- **方向调整**：Flip primary axis（180°）；Reorient secondary axis（每次一个象限过 X/Y）。
- **引用已有 MC**：可在已有 MC 上放新 MC，再 realign/move（示例沿 Z 移动 1 英寸）。
- **显示/隐藏**：Feature list 右键 `Hide`、`Hide other Mate connectors`、`Show`、`Show all Mate connectors`；眼睛图标；Part Studio 与 Assembly 的可见性互相独立。
- **Owner/Attachment**：Part Studio 中 Owner Entity 指定所属草图/零件/曲线，留空则 ownerless；Attachment 下拉选择附着位置。
- **重用**：Part Studio 中定义的 MC 在该零件的每个装配实例中可复用；Part pattern 的 MC 随零件进入装配（需 owner entity 为 Part）。

### 4.9 参数化与数据复用

#### Derived
- **位置**：Part Studio。
- **插入对象**：Part Studios、零件、曲面、曲线、草图、平面、活动钣金模型、Mate connectors；来自同一文档或另一文档（建立文档链接），也可来自同一文档的其他版本。
- **选择对话框**：Select Part Studio 列表含当前文档 Part Studio 与特征；Search；Sort（Name A→Z / Z→A）；Current document（可选其他版本）/ Other documents（要求对方至少有一个 version，可当场建版本）；支持按零件/装配名与属性（含自定义属性）搜索、多词与标点；过滤器可选常用/全部属性；结果显示实体类型、工作区/版本、文档名、零件号、发布状态；可按 released 过滤。
- **选项**：`Preserve active sheet metal models`（勾选则把活动钣金模型、flat pattern 及关联 flat pattern 草图一并派生，可继续加 joint/flange/hem；不勾选则作为普通派生零件，不能再编辑为活动钣金）；注意源 Part Studio 若之后执行 Finish sheet metal model，派生件会退化为普通零件、平展图与草图移除、后续钣金特征失败（避免方法：不用 Finish，或先给源文档建版本）。
- **放置**：默认在 Part Studio 原点；`Locations` 可选/建隐式或显式 MC，派生实例原点对齐 MC；多 Location 会生成多个派生实例（文档不推荐，建议用装配）。
- **Placement**：`Base origin`（跟随源 Part Studio 原点）或 `Base mate connector`（在派生件自带的 MC 中选一个作为基准原点）；可用 Location + Base mate connector 精确组合放置。
- **Include mate connectors**：是否带入源实体关联的显式 MC；带入后列在 Derived 特征下。
- **Include properties**：默认勾选，复制源实体全部元数据属性；取消只保留 name、material、appearance；记忆选择。
- **子特征列表**：MC（若插入零件/源 Part Studio）、草图、平面、线性/圆形/曲线 pattern（若插入含 pattern 草图的 Part Studio）、Mirror、Transform（若 Copy part 且插入副本）；可展开/折叠、逐个显示隐藏。
- **版本/链接**：引用其他文档时引用版本；链接图标出现在 Feature list；源有新版本时图标蓝色高亮且 Part Studio 标签出现图标；点击可按提示更新。
- **限制**：同一特征可选同 Part Studio 多个零件，但不能选多个 Part Studio；同一 Part Studio/配置不能在同一目标 Part Studio 派生两次；可替换派生特征；派生单向（base→target）；不接受循环引用（A→B→A 会失败）；派生零件总是可见，忽略源可见性；派生的 MC 是零件刚性特征，若与目标 Part Studio 坐标系不一致会残留错位。
- **性能建议**：派生成熟/少改的零件；避免从大型持续编辑的 Part Studio 派生；不要形成派生链（派生原始实例而非派生件）；优先派生简单 Part Studio 或草图。

#### Variable
- **位置**：Part Studio。
- **语义**：变量是特征，位置在 Feature list 中重要；使用前创建，或在输入数值时创建（保存于当前操作之前）。
- **命名**：仅英文大小写字母、数字、下划线；区分大小写；不能以数字开头。
- **Assigned 类型**：`Length`、`Angle`、`Number`、`Any`（可含不同单位或 FeatureScript 值：boolean、map、array、string、function）；可填值/单位与描述。
- **Measured**：类型 `Distance`、`Length`、`Diameter`；选测量实体对；其余字段按偏好填写。
- **From table（CSV）**：
  - CSV 来源：Current document / Other documents / Import（设备）。
  - Row/Column 各自支持 `Access type`：By index、By index range、By label、All values；By index 填 Index；range 填 Min/Max index；By label 填 Value；可勾 `Regular expression`。
  - `Result type`：Single value、Array、Map；Map 需 `Label column/row index`（数值或变量）。
  - `Conversion factor` + 带单位数值（例如英寸表转厘米）。
  - 变量类型与值在 Variable table 中只读；悬停特征名显示 CSV 结果 tooltip。
- **使用**：尺寸/特征数值字段输入 `#name`，可组成表达式；草图尺寸左侧图标区分“无变量表达式/有变量表达式”；双击尺寸显示变量与表达式。
- **自动补全**：输入 `#`（或下划线、任意字母）打开变量列表；继续输入过滤，方向键移动，Enter 接受，滚轮滚动，鼠标点选；`#` 未输入时也列出 FeatureScript 函数；计算值灰色显示且不会插入；Escape/失焦关闭；仅显示当前上下文中已存在的变量（Feature list 下游变量不显示）。
- **数组**：需先建零基索引；示例 `#config = 2`，`#diameter = [0.25, 0.5, 1][#config]`，`#length = [2, 4, 10][#config]`。
- **即时创建**：数值字段输入 `#` 后列表中出现 `New variable`；Create variable 对话框可选择 Feature（默认）或 Configuration。
- **FeatureScript 函数**：Any 类型变量可存函数，如 `function(len) { return len * 2 + 2.5 mm; }`，以 `#Adjust(20mm)` 调用。
- **更新**：改变量值自动更新所有使用处；改名可勾 `Update all references` 全量传播。

#### Query Variable
- **位置**：Part Studio；iOS/Android 仅查看/编辑桌面创建的查询变量。
- **基本**：名称、可选描述、Selection type；`Selection` 手动点选实体；`Evaluate on use` 默认不勾（只保留创建时选中的实体，后续新增实体不纳入；勾选则每次使用时重新求值）；`Show selection` 取消可去掉自动高亮；绿勾关闭。
- **附加查询**：勾 `Add additional queries` → `Add additional query` → `Union` / `Subtract` / `Intersection`，可继续添加。
- **选择类型**：
  - `Created by` / `Owned by`：选创建特征/拥有实体；Entity type 选 Vertex/Edge/Face/Body；Created by 可取消 `Filter construction entities`（勾选时排除构造实体）；可按 body type 过滤（全部符合条件的轮廓橙色，最终命中黄色高亮）。
  - 准则：`Protrusion`（凸边连接面）、`Pocket`（凹边连接面）、`Hole`（同一圆孔的面）、`Fillets`（等半径圆角面）、`Bounded faces`（种子面 + Bounds 边/面，尽量围成封闭边界，围不成则选所有相邻面/边）、`Loop/chain connected`（面/草图边连成的闭环）、`Parallel`（与所选边平行的所有边）、`Tangent connected`（相切边）、`Matching`（同尺寸面/边）。
  - `All solid bodies`：Part Studio 所有实体（曲面不选）。
  - `Edge convexity`：选实体后按 Convex / Concave / Smooth / Variable 过滤边（Variable 指同时含凸凹段）。
  - `Adjacent`：源边/面/顶点；`Shared` 选 Vertex 或 Edge；`Select` 选要包含的类型（共享顶点时可选边+面+顶点、仅边、仅面、仅顶点；共享边时可选边+面、仅边、仅面）；可用查询变量图标引用另一查询变量。
- **编辑**：双击 Feature list 中查询变量；`Final` 按钮预览下游变化（若查询是回滚条前最后一个特征则不可用）；绿勾保存，X 取消。
- **规则**：可含多种实体类型；可含特征不期望的类型（如含边+顶点可被 fillet 消费）；允许空查询；尽量靠近使用处定义；多有效选择时取第一个（示例按顺序选三个默认平面用于草图平面 → 取 Top）。

#### Composite Part
- **位置**：Part Studio。
- **输入**：零件、曲面、曲线、点（body）；生成 Composite part 1（可改名），列在零件下方。
- **Closed**：勾选则成员被消耗、不再作为独立实体出现在 Parts list；不勾为 open，成员仍单独列出并同时属于组合。
- **能力**：可施加特征、插入装配、发布、出工程图、作为 BOM 单行、赋元数据、整体修订。
- **上下文菜单**：在 Composite parts list 或图形区右键可 `Hide other composite parts`、`Hide all composite parts`。
- **拆解**：Delete Part 工具下拉选 `Dissolve composite parts`（closed/open 均可，拆回成员）或 `Ignore composite parts`（选复合中单个 body 删除）。
- **Notes**：导出组合零件会导出为多个独立零件；单个 body 也可组合；组合不改变成员；成员拥有的 MC 仍属于成员；closed composite 消耗成员且 Parts list 只列组合；open composite 不消耗；closed 组合会消耗所选的其他组合（任何类型），open 引用组合则不消耗；两个 open 组合可重叠零件；在 closed composite 上建 MC 时对话框显示“零件名+特征名”而非零件名。

#### Tag
- **位置**：Part Studio。
- **Tag purpose**：
  - `Frame`：选 Sketch profile（Feature list）；`Show default points` 默认开，在轮廓上叠加洋红色 9 点对齐网格；`Additional alignment points` 可加草图点；`Standard`、`Description` 填入 Cut list 两列（可右键 Configure 配置）；`Add Column` 添加 Header/Value 自定义列（不可配置，X 删除）；用于 Frame 后 Cut list 显示这些列。最佳实践：profile 放独立文档、完成后建版本、通过 linked documents 引用；共享给使用者只需 view + link 权限，管理者需 edit + link，建议用 team 管理。
  - `Form`：`Part to add`、`Part to remove`（不要选钣金件，选普通几何零件）、`Sketch for flat view`、`Form origin mate connector`（不选则自动在 Part Studio 原点创建）；每个 Part Studio 只能有 1 个有效 form tag，即一个 Part Studio 建一个 form。
  - `PCB holes`：`Holes` 或 `Cutouts`；`Plated`；`Base plane`（通常板底，导出到装配时与 Top plane 对齐）；逐个/成组选孔，每孔元数据：Interior faces、Designator、Purpose（非镀：None/Mounting/Tooling/Custom；镀：None/Via/Thermal via/Pin/Custom；Custom 展开 Purpose 字段）、Associated component instance、Owner（Unowned/ECAD/MCAD）。应在所有孔/板建模完成后打 tag，并尽量放在 Feature list 末尾，否则 PCB Studio 导入可能失败。
  - `Standard Content`：选一个实体零件或组合零件；每 Part Studio 只能有一个 Standard Content tag，若已有则失败并报 `There are bodies already tagged for standard content in this Part Studio`；>50 成员的组合可打 tag 但提示性能影响；Standard Content tag 不能 pattern。

#### Add Custom Features
- **位置**：Part Studio。
- **来源**：FeatureScript 写在 Feature Studio 标签页；自定义表在本文档立即可用，也可从版本加入其他文档。
- **从其他文档添加**：需至少 “View, copy & export” 权限；在可写 Part Studio 或含 Feature Studio 的版本中打开；对话框可按 `FeatureScript samples`、Onshape 标准过滤器、搜索框（名称或 URL）定位；默认选最新版本，无版本可请求有写权限者创建；点文档名显示自定义特征；选顶层图标插入全部或选单个（再点取消）；版本图图标可换版本；X 关闭。
- **使用**：与普通特征一样进 Feature list、可编辑/抑制/隐藏/删除；跨文档链接特征有链接图标。
- **更新**：源有新版本时链接图标蓝色、Part Studio 标签出现同图标（仅通知）；点更新图标或右键 `Update linked document` 打开 Reference manager：`Update all` 或 `Selective update`（选文档→版本图→目标版本→`Update selected`）；管理员工具版本不同会导致特征 `out-of-sync`；`Update all` 会更新到工具栏版本，即使低于最新或当前特征版本。
- **移除**：右键工具栏图标 `Remove`；若 Feature list 仍含该自定义特征，工具栏显示 `Linked custom features in this Part Studio` 图标，下拉仍可使用。
- **打开链接文档**：右键图标 `Open linked document`。
- **同工作区**：`Custom features` 下拉列出本工作区所有自定义特征；FeatureScript 编辑并提交后自动更新，便于开发测试。
- **共享**：给文档建版本；分享给个人/团队至少 “Can view, copy & export” 或公开。
- **企业**：管理员可把公共自定义特征加到整个企业工具栏；用户需被授予 `Allow access to public documents` 全局权限；通过用户菜单 `Switch to <enterprise domain name>` 生效。
- **图标/描述图**：上传 SVG blob 标签并在 FeatureScript 中引用。
- **发布**：建公开文档 + Feature Studio + 使用该特征的 Part Studio + 说明 PDF；Versions and history → Create version → 勾 `Publish custom features and tables`（仅文档含 Feature Studio 时显示）；检查清单红叉/绿勾；`Create and publish` 或 `Create version, publish, and edit properties`；也可事后右键版本 `Publish FeatureScript`；版本节点显示 `{}` 表示已发布；右键 `Unpublish FeatureScript` 取消；文档页 Public 过滤 + 高级搜索 `Published FeatureScript` True/False。
- **Notes**：自定义特征按字母排序；更新到非最新版本仍显示 out-of-date；更新特征引用的版本不会改变工具栏图标所指版本（需删图标重加）；更新后可能需手动编辑特征（如新增必填字段）；已使用过的链接特征即使源文档删除/取消共享仍可用；添加到工具栏是账号设置而非文档设置；添加/打开含自定义特征的文档会自动开启 FeatureScript notices。
- **安全边界**：FeatureScript 在沙箱运行；自定义特征不能修改 Part Studio 之外、不能感染账号、不能回传信息、移除后不能影响再生、不能修改其他特征；恶意/劣质特征可能长时间再生或修改变量/几何；发布恶意 FeatureScript 违反服务条款，可通过 Help > Feedback 举报。

## 5. 工作流、规则与错误状态

### 5.1 端到端流程

1. **创建**：在 Part Studio 选特征工具（或 Sketch 打开时用 Extrude/Revolve）→ 填蓝/白字段与选项 → 调 Preview slider → 绿勾/Enter 提交；红 X/Escape 取消。
2. **编辑**：双击 Feature list 中特征（或右键 Edit）→ 模型回滚到该特征创建时 → 修改 → 可用 `Final` 看最终结果 → 提交。
3. **重建/引用**：特征参数化；修改草图/变量/上游特征会触发下游重算（Hole 示例明确“改草图会重算”）；派生、自定义特征、链接文档按各自版本规则更新。
4. **撤销/删除**：Delete Part/Delete Face 等均为参数化、可撤销特征；在图形区选面/边按 Delete 会删除创建该面的特征而非零件。
5. **复用**：Pattern/Mirror 复制特征或面；Derived 单向链接 Part Studio；Variable/Query Variable 驱动下游；Composite 组合多 body 作为单一数据对象；Tag 赋予 Frame/Form/PCB/标准件语义。
6. **发布**：Composite 可整体 release/revise；Derived 可引用 released 零件；自定义特征可按版本发布。

### 5.2 文档明确的规则与依赖

- **合并范围规则**（Extrude/Revolve/Sweep/Loft/Thicken/Mirror/Pattern 共用）：Add/Remove/Intersect 若 merge scope 为空 → 特征报错；New 无 merge scope；曲面只与曲面合并、零件只与零件合并；单个相交零件会自动加入 merge scope，多个相交则需显式选择或 Merge with all。
- **端条件规则**：Up to next/Up to face/Up to part 要求被拉伸区域/实体完全落在目标实体范围内；Up to next/Up to part 找不到目标时失败；Extrude 的 Symmetric 仅 Blind 与 Through all。
- **Loft**：profile 必须顺序正确；多 contour 显示红色；不支持嵌套环；guide 必须 G1 连续并与每个 profile 边界相交；Match tangent/curvature 与草图不一致会失败；Path 不兼容非平面 profile（实体段）。
- **Fillet**：Full round 不能一次处理多个不连续面；Asymmetric 与 Face Blend 的 Tangent hold lines 互斥；Face Blend hold lines/cliff 不能用草图边。
- **Chamfer**：Offset 依赖边与选择顺序；Two distances/Distance-and-angle 的方向可按边覆盖。
- **Body Draft**：始终加料；Symmetric 与 Match faces at parting 组合；Keep material 决定是否移除拔模扫过的材料。
- **Rib**：必须完全落在零件内。
- **Hole**：Merge scope 决定被切零件；碰撞/重叠 → 0 深度；Tap 孔在 Up to next/entity 时若 Tapped depth 大于最小孔深会被自动调小并提示；多零件 Tapped 初始 clearance + 最后 tapped。
- **Pattern**：Feature 应用顺序按 Feature list；pattern 的 pattern 不含 seed；布尔特征需同时选被作用特征；Reapply features 逐实例重算外部引用；草图到原点/默认平面的尺寸/约束不重应用。
- **Derived**：单向、不允许环、同一 Part Studio/配置不可重复派生、派生可见性忽略源、派生 MC 刚性。
- **Query Variable**：Evaluate on use 关闭时只锁定创建时实体；多有效选择取第一个。
- **Composite**：closed 消耗成员、open 不消耗；复合永不拥有 MC；导出拆成独立零件。
- **Tag**：每 Part Studio 仅一个 Form tag、仅一个 Standard Content tag；Standard Content 不能 pattern。
- **自定义特征**：移除工具栏图标不删除已用特征；更新源版本不自动更新工具栏版本；已使用过的特征不因源删除而失效。

### 5.3 常见错误/失败状态

| 场景 | 文档表述的行为 |
|---|---|
| Extrude/Revolve 等 Add/Remove/Intersect 未设 merge scope | 特征报错（文档明确） |
| Up to next / Up to part 无终止几何 | Extrude 失败 |
| 拉伸区域未完全落在目标实体 | Extrude 失败 |
| Fillet 规格过大 | 显示失败可视化辅助诊断 |
| Loft 多 contour profile | 显示红色，不能用于 Loft |
| Loft Match tangent/curvature 与草图不一致 | Loft 失败 |
| Rib 超出零件边界 | 操作失败 |
| Curve Pattern 曲线过短 | 报错；可减小间距/实例数、改 Equal spacing 或换更长曲线 |
| Face Blend 附着融合失败/自交 | Detached 或 Caps 解决；自交可用 Detached |
| Decal 面变成非平面/圆柱 | Decal 特征报错 |
| Hole 碰撞/重叠/不完全落在目标上 | 相对草图平面 0 深度钻孔 |
| Hole Tapped depth 超孔深 | 自动调小并显示消息 |
| Standard Content 重复 tag | 报错 `There are bodies already tagged for standard content in this Part Studio` |
| Derived 循环引用 | 操作失败 |
| 自定义特征更新后字段变化 | 可能需要手动编辑后再生 |
| Boolean 两独立零件 | 不工作（零件必须相交） |
| Split Trim to face boundaries 用于完整曲面 | 选项被忽略 |
| Wrap 非圆柱/圆锥目标 | 当前不支持 |
| 钣金复用 3D Extrude 到 flat pattern | 出现再生警告，不能复用 |

## 6. 与其他章节的关系

- **Sketch 章节**：Extrude/Revolve 在 Sketch 工具栏；Wrap 的 URL 位于 `/Content/Sketch/wrap.htm`；草图点驱动 Hole；草图曲线驱动 Sweep/Loft/Rib/Curve Pattern/Split；`Use` 工具与草图平面方向用于 Split/Helix。
- **Analysis 章节**：Surface modeling 引用 Curve/surface analysis、Connection analysis、Zebra stripes/Color map、Dihedral analysis、Deviation analysis、Reflection analysis；Draft 引用 Draft analysis；Fillet 建议用 Zebra/Curvature color map 观察。
- **Sketch 尺寸/表达式章节**：Feature Basics 的 Boolean→expression、Variable/Query Variable 与尺寸表达式、变量自动补全、Expression without/with variable 图标。
- **Parts/Feature list、Comments、Versions and history、Linking Documents、Release management**：Feature Basics、Derived、Add Custom Features、Composite Part、Tag 均引用。
- **Assembly 章节**：Mate Connector 引用 Mates；Derived 的 MC/装配；Hole 的 auto-size 与标准件；Transform 的 Copy in place；Linear/Circular Pattern 的 MC 进装配规则。
- **Sheet metal 章节**：Extrude flat pattern、Fillet/Chamfer 的 corner break 建议、Derived 的 Preserve active sheet metal models、Pattern 对钣金的支持差异（Feature pattern 不适用于钣金，Face pattern 适用）。
- **Drawings 章节**：Hole/External Thread 的 Hole/thread callout；Decal 在 shaded view 可见。
- **Frame/Sheet metal forms/PCB Studio**：Tag 的三种用途；Frame tools collection。
- **Import/导出章节**：Composite 的导入碎片自动组合与导出拆分。
- **FeatureScript 文档**：Add Custom Features 的 Custom Icons、Feature UI: Description、变量标准类型、FeatureScript Custom Tables、发布机制。
- **Tolerance options**：Extrude/Revolve/Chamfer/Hole 多处引用公差 Precision/Type 设置。
- **Create Selection**：Pattern、Delete Face、Move Face、Replace Face、Modify Fillet、Query Variable 等多处引用。

## 7. 对 LubanCAD 的可执行启示

> 仅列文档能支撑的结论；`[文档明确]` 表示原文直接写明，`[推断]` 表示由原文组合推导。

### 7.1 需要补齐的 UI 表面

1. **特征对话框统一外壳** `[文档明确]`：蓝底（需图形区选择）与白底（键盘输入）字段、红/黑标题状态、Tab 顺序、方向键下拉、空格勾选、Enter 提交、Escape 取消、字段级 x 与右键 Clear all、缺失引用红色 + Clear missing references、Preview slider 0–100%、上下文 Help。
2. **编辑回滚与 Final** `[文档明确]`：编辑特征时回滚到该特征状态并隐藏后续特征；非最后特征显示 Final 按钮。LubanCAD 若已有标准事务/回滚条需对齐此语义。
3. **参数数组重排** `[文档明确]`：Loft 的 Profiles 等数组字段需支持“对向箭头激活 + 拖拽手柄 + 放下”的重排；选择顺序决定几何时必须提供。
4. **结果/端条件下拉** `[文档明确]`：Creation type（Solid/Surface/Thin，记忆上次）、Result（New/Add/Remove/Intersect，曲面禁用 Remove/Intersect）、End type（Blind/Up to next/Up to face/Up to part/Up to vertex/Through all；Revolve 增加 Full revolve；Hole 用 Up to entity）。
5. **合并范围 UI** `[文档明确]`：默认 Merge all 勾选；取消后出现 Merge scope 字段；Merge with all 快捷；零件/曲面类型隔离。
6. **方向/对称/起始/第二端/拔模控件** `[文档明确]`：Opposite direction 图标、Symmetric（Extrude 仅 Blind/Through all）、Starting Offset（Blind/Entity）、Second end position（独立深度+端条件+Draft）、Draft（中性面=草图平面、角度、反向）。
7. **Thin 厚度控件** `[文档明确]`：Mid plane + Thickness，或 Thickness 1/2 + Flip wall；值在模式间保留。
8. **Fillet 全套 UI** `[文档明确]`：Edge/Full round 类型、Measurement（Radius/Width）、Control（Distance/Conic/Curvature，Rho/Magnitude）、Asymmetric、Partial fillet（Position/Entity/Offset + Second bound）、Variable fillet（顶点半径、Add point on edge、Smooth transition）、Allow edge overflow + 保留边下拉、Smooth fillet corners + 排除角下拉。
9. **Face Blend 全套 UI** `[文档明确]`：Side 1/2 + 翻转、Propagation（Tangent/Adjacent/Custom）、Rolling ball/Swept profile（Spine）、Radius/Width、Asymmetric（Second radius/Ratio）、Circular/Conic/Curvature/Chamfer、Tangent/Conic hold lines（含 inverse）、Cliff edges、Caps、Limits（Plane/Second plane/Face/Edge + Side）、Help point、Trim type（Wall/Short/Long/No trim）、Detached、Show isocurves。
10. **Hole 对话框** `[文档明确]`：Inch/Metric、Simple/Counterbore/Countersink、Drilled/Clearance/Tapped/PEM、Start plane 三选项、四种 Termination、Tip angle（118/135/Flat/Custom）、名称自动更新与铅笔改名。
11. **Pattern UI** `[文档明确]`：Part/Feature/Face、方向/轴/路径、Distance/Angle、Instance count、Centered、Equal spacing（Circular）、Second direction（Linear）、Skip instances 列表与 CLEAR/恢复、Reapply features（Feature 类型）、Merge scope。
12. **直接编辑 UI** `[文档明确]`：Delete Part 的组合拆解下拉、Delete Face 的 Heal/Cap/Leave open、Move Face 的 Offset/Translate/Rotate + End type、Replace Face 的 Flip alignment、Modify Fillet 的 Change/Remove + Reapply fillet。
13. **参数化 UI** `[文档明确]`：Variable 对话框（Assigned/Measured/From table 三个入口）、Query Variable 对话框（Selection type + Evaluate on use + Show selection + Add additional queries）、Derived（Location/Placement/Include properties/子特征列表）、Composite（Closed 复选框）、Tag（4 种 purpose 的专用字段）。
14. **特征树/右键** `[文档明确]`：Feature list 顶层/子层 MC、评论图标、派生链接图标、out-of-sync 图标、组合零件上下文菜单、Query Variable 双击编辑、`Final` 按钮、回滚条。
15. **自定义特征工具栏** `[文档明确]`：Add Feature 对话框（样本/过滤器/搜索/版本图）、工具栏图标切换、Remove、Linked custom features 下拉、Reference manager（Update all/Selective update）。

### 7.2 参数与默认值清单（可直接写测试）

- **Extrude**：Shift+e；Symmetric 仅 Blind/Through all；Up to 类可 Offset 一或两方向；Second end position 有独立深度与 Draft；Merge all 默认；Add/Remove/Intersect 无 merge scope 报错；New 无 merge scope；Mid plane 与 T1/T2 值互不覆盖但保留；flat pattern 复用 3D Extrude 出警告。
- **Revolve**：Shift+w；Full revolve 默认；Blind 角度；Offset 按角度；Second end position 适用于 Blind 与 Up to Entity；Symmetric 仅 Blind（示例）。
- **Sweep**：Profile control 4 项；Twist 3 项；Extend to full path；Scale factor；Thin 的 Trim ends；轮廓在路径中段时双向扫掠。
- **Loft**：≥2 profiles；顶点数一致最佳；多 contour 红色；nested loops 不支持；guide 为 G1 且与每个 profile 边界相交；Path + section count；Connections 自动洋红；Show isocurves Count；Thin Trim ends。
- **Fillet**：Tangent propagation 默认开；Allow edge overflow 默认开；Conic Rho 0.25/0.5/0.999；Curvature Magnitude 0–0.999；Variable fillet + Smooth transition；Full round 不能多不连续面。
- **Chamfer**：Offset vs Tangent；Equal/Two distances/Distance and angle；Angle 默认 45°；Equal 与 Distance-and-angle 记忆上次距离；Direction overrides。
- **Face Blend**：Rolling ball 默认；Radius/Width；Asymmetric 的 Second radius/Ratio；Tangent propagation 不与 Swept profile 同用；Tangent hold lines 不与 Asymmetric 同用；hold line/cliff 不得为草图边；Trim type 4 项。
- **Draft**：Neutral plane vs Parting line；Tangent propagation 只选比拔模角更陡的面；Reapply fillets 两分支语义（锥面 vs 圆柱面）；Parting line 需先 Split 面；One sided/Symmetric/Two sided。
- **Body Draft**：Draft scope 3 项；Draft on self；Symmetric + Match faces at parting；Match type 2 项；Concave repair 3 项（默认 None）；Corner type 2 项；Keep material 默认关（扫过材料被移除）；只加料。
- **Hole**：Start from part 默认；Tap clearance；Tip angle 118/135/Flat/Custom；Tapped depth 自动调小；多零件 Tapped 初始 clearance/最后 tapped；碰撞 → 0 深度。
- **External Thread**：ANSI/ISO；Blind/Up to Next；Undercut 默认 0.015"（直径方向低于小径）与 2× pitch；Undercut 与 Split face 互斥。
- **Pattern**：Instance count 最小 1 且含 seed；Linear 第二方向独立参数；Circular Equal spacing 勾选=在 Angle 内均布，不勾=Angle 为实例间角；Curve 间距 Equal/Distance；Reapply features 仅 Feature 类型；Mirror 无 skip。
- **Boolean**：Keep tools 三种操作均可用且记忆；Subtract 的 Offset all 使 Faces to offset 不可用；Reapply fillet。
- **Split**：Keep both sides；Trim to face boundaries 仅面工具有效；选面时 Keep tools 默认开。
- **Transform**：Translate by line（线 1 条/点 2 个）；Copy in place；Scale Uniformly + 三轴。
- **Decal**：PNG/JPG/GIF/BMP；≤4096×4096；仅平面/圆柱面；Maintain aspect ratio；9 参考点；Horizontal reference；透明。
- **Plane**：预选平面面→Offset；预选线+点→Point normal；Flip normal；记忆类型；`p` 隐藏/显示平面。
- **Helix**：Cylinder/Cone/Axis/Circle；Turns/Pitch/Turns and pitch；Computed revolutions 默认向下取整；Circle 同平面 End point 得零高度。
- **Variable**：名称规则；类型 4 种；Measured 3 种；CSV 行列 Access type 4 种、Result type 3 种；Evaluate on use 默认关（Query Variable）；改名 Update all references。

### 7.3 交互与选择规则

- **选择顺序敏感** `[文档明确]`：Loft profiles、Chamfer Offset 链、Curve Pattern 多曲线、Pattern Feature 应用顺序（按 Feature list）均受顺序影响；提供重排/提示。
- **显隐式 Mate connector** `[文档明确]`：特征轴/镜像面/派生定位/孔位均可选 MC；隐式 MC 可现场创建并编辑；Z 轴用于轴类需求；Part Studio 与 Assembly 显隐独立。
- **Shift 锁定推理点** `[文档明确]`：MC 创建时用 Shift 防止其他推理点弹出。
- **过滤/选择工具** `[文档明确]`：Create Selection 用于相关面/孔/槽；Query Variable 支持准则选择、Adjacent、Convexity；Feature pattern 的 Reapply 对草图原点/默认平面约束有特殊规则。
- **Face Pattern 优先** `[文档明确]`：几何结果相同时优先 Face pattern（性能最佳），其次 Feature，最后 Part。
- **Part pattern 的 MC** `[文档明确]`：插入装配时随零件带入；owner entity 必须正确。

### 7.4 事务/撤销/版本/权限/协作约束

- **事务/撤销** `[文档明确]`：所有特征、Delete Part、Delete Face、图形区按 Delete 删除特征均为参数化可撤销；编辑特征回滚到该特征状态；`Final` 只读预览。
- **版本/引用** `[文档明确]`：Derived 跨文档/版本单向链接，新版本蓝色图标提示，需手动更新；自定义特征按版本链接、Reference manager 更新；Composite 可整体 release/revise；Tag 建议先建版本再被引用。
- **权限** `[文档明确]`：无 Edit 权限时特征对话框灰化；添加他人自定义特征需 “View, copy & export”；企业公共文档需 `Allow access to public documents`；共享自定义 profile 需 view+link / edit+link。
- **协作** `[文档明确]`：Feature 评论 + 邮件通知；评论面板图标；BOM/工程图/装配对 Pattern 新零件、Composite 单行、Hole callout 的影响。
- **重建性能** `[文档明确]`：Reapply features、Part pattern 的多个 Location、Derived 大 Part Studio、custom feature 复杂再生均有性能代价；文档给出替代建议（Face pattern、装配代替多 Location、成熟零件派生、避免派生链）。

### 7.5 可写成测试断言的验收点

1. **Extrude 端条件矩阵** `[文档明确]`：Blind+Depth、Blind+Symmetric（双向等距）、Through all+Symmetric、Up to next/face/part/vertex + Offset（单/双箭头）、Second end position 独立深度与 Draft、Merge all 默认、Add 无 merge scope 报错。
2. **Extrude 结果类型** `[文档明确]`：New 生成新零件；Add 并入且不生成新零件；Remove 去料；Intersect 只留相交体积；Surface 下 Remove/Intersect 不可用。
3. **Revolve 端条件** `[文档明确]`：Full revolve 默认 360°；Blind 角度；Up to face/part/vertex + Offset；Second end position；Thin 厚度。
4. **Loft 顺序/重排** `[文档明确]`：三 profile 合法；追加第四 profile 顺序错误报错；拖拽重排后合法；多 contour profile 红显且不可用；Match tangent/curvature 不一致失败。
5. **Sweep 轮廓控制** `[文档明确]`：None/Keep profile orientation 结果不同；Twist Turns/Angle/Pitch 与 Scale 可组合；开放轮廓→Surface/Thin；闭合轮廓+Thin→空心。
6. **Fillet** `[文档明确]`：Radius/Width 切换；Conic Rho 0.25/0.5/0.999；Curvature Magnitude 0–0.999；Asymmetric+Flip；Partial Position/Entity/Offset+Second bound；Variable 顶点半径+Add point on edge+Smooth transition；Full round 不连续面被拒。
7. **Chamfer** `[文档明确]`：Equal distance 双向等距；Two distances 方向覆盖；Distance and angle 默认 45° 且翻转后从另一面测量；Offset 与 Tangent 在非平面上结果不同。
8. **Hole** `[文档明确]`：Simple/Counterbore/Countersink 几何；Start from part/sketch plane/selected plane 对沉孔深度的影响；Blind/Up to next/Up to entity/Through all；Tip angle 118/135/Flat/Custom；Tapped depth 自动调小提示。
9. **Pattern** `[文档明确]`：Linear 第二方向 N×N；Centered 语义；Circular Equal spacing 开关改变首末角；Curve Distance 不足报错；Skip instances 列表 [i,j] 与恢复；Reapply features 使 Up to next 逐实例生效。
10. **Boolean/Split** `[文档明确]`：Union 合并属性保留较早实体名；Subtract+Offset 留间隙、Offset all 使 Faces to offset 不可用；Split Keep both sides/Trim to face boundaries 的行为差异。
11. **直接编辑** `[文档明确]`：Delete Face 的 Heal/Cap/Leave open（后者实体变曲面）；Move Face 的 Offset/Translate/Rotate；Replace Face 的 Flip alignment 与 Offset；Modify Fillet 的 Change/Remove 与 Reapply fillet。
12. **参数化** `[文档明确]`：Variable 改名 Update all references 后下游全部更新；数组索引切换改变所有使用值；Query Variable Evaluate on use 开关影响后续新增实体；Derived 循环引用失败、同一配置二次派生失败。
13. **数据管理** `[文档明确]`：Composite closed 成员从 Parts list 消失、open 仍列出；Dissolve 还原；Standard Content 重复 tag 报特定错误文本；Form tag 每 Part Studio 仅 1 个。
14. **自定义特征** `[文档明确]`：移除工具栏图标后已用特征仍可打开；源新版本蓝色链接图标；Reference manager Update all；发布版本显示 `{}`；未发布时搜索不到。

### 7.6 风险与文档缺口（对 LubanCAD 的提醒）

- **文档内部矛盾需实测**：Loft guide 是否必须接触 profile 外侧（实体段 vs 曲面段表述相反）；Chamfer Tangent propagation 默认态（正文“可选” vs 视频“保持勾选”）；Sweep/ Loft 的 `Trim ends` 是否仅限 Thin；Face Blend Propagation 初始默认未写；Circular Pattern Equal spacing 初始默认未写；Curve Pattern Locked 与 Lock faces 的字段关系未写清。
- **图片承载的默认值/几何结果无法核实**：Plane 各类型的实际平面、Split 示例的曲面/面结果、Fillet 失败可视化、Decal 三角操纵器等均以图片为主。
- **单位/精度**：Tolerance options 的具体 Precision/Type 枚举值不在本篇（应查 Tolerance 章节）；本篇只说明入口存在。
- **iOS/Android 边界**：Body Draft 仅编辑/查看桌面插入；Query Variable 仅查看/编辑桌面创建；其余特征页的移动端步骤多为 Loft 式复述，未给出移动端专属差异。
- **文档未说明**：Extrude/Revolve 初始默认 Creation type 的显式规则（只写“记忆上次”）；Face Blend Trim type 初始默认；Curve Pattern Orientation 初始默认；部分特征的初始数值（如默认壁厚、默认孔径）均未在语料中给出。
