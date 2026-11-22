# Onshape Help 章节分析报告 — 装配体（Assemblies）

> 分析范围：`groups/assemblies.txt`（46 主题、64,634 词）。只基于本地语料，未联网、未修改输入文件。
> 语料为 HTML 自动抽取：图片仅剩 `[image: alt]`，视频只有文字转录，表格被压平为 `|` 行。报告中的 URL 一律为 Onshape 帮助中心相对路径。

## 1. 本章概览

- **主题数**：46；**总词数**：64,634（语料头部统计）。
- **覆盖子域**：
  1. 装配体结构与实例（Assembly tab、子装配、插入、链接文档、引用更新、实例列表）；
  2. 标准件（Onshape 标准件、标准件库目录、自定义标准件库）；
  3. BOM 全链路（BOM 表、表操作、格式化、模板）；
  4. 配合基础（Mate Connector、Mates 通用机制）；
  5. 十种配合类型（Fastened / Revolute / Slider / Planar / Cylindrical / Pin Slot / Ball / Parallel / Tangent / Width）；
  6. 装配工具（Group、Snap、Show Mates、Replicate、Replace Instance、线性/圆周阵列、镜像）；
  7. Relations（Gear / Rack and Pinion / Screw / Linear）；
  8. 状态与上下文（Named Positions、Display States、Create Part Studio in Context）；
  9. 仿真（线性静力、Modal、Asynchronous、Rigid Body）；
  10. 其他（Exploded Views、Assembly Variable Table）。
- **文档更新日期**：语料中**没有任何页面级更新日期字段**，无法给出；部分页面提到功能订阅级别，但无日期。
- **整体质量与抽取限制**：
  - 图片全部丢失。大量“图标→定义”表格只剩定义文字，图标无法辨识；部分对话框字段只能靠上下文推断其存在，不能推断其外观。
  - 多个页面的 “Only available for …” 订阅限制句被截断为 `Only available for`（Simulation、Modal Simulation、Asynchronous Simulation、Rigid Body、BOM Table Templates）；订阅信息只能从正文或 description 补充。
  - `Assembly Variable Table` 页在最后一条 Notes（“When inserting a configured variable into your Variable table...”）处**戛然而止**，语料疑似截断。
  - 同一个视频转录在多个配合页重复（Fastened/Revolute/Slider 共用；Planar/Ball/Parallel 共用；Cylindrical/Pin Slot 共用），逐页摘要已优先取页面正文。
  - 表格压平后个别表头重复、空单元格丢失（如 BOM 图标表）。
  - 文档内部存在少数表述不一致（见 §4.8/§5 的“不一致”条目），已如实并列，不擅自裁决。

## 2. 主题清单与逐篇摘要

### 2.1 装配体结构与实例（5）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Assemblies | Assemblies | /Content/Assembly/assembly.htm | 定义 Assembly tab 为零件/子装配实例的层级结构与自由度、关系所在；文档可有多个 Assembly tab；可用右键 “Move to new subassembly / Create empty subassembly / Dissolve subassembly” 重组结构；含锁定/跟随子装配位置、Assembly tab 右键菜单、工具栏与 iOS/Android 入门。 |
| Insert Parts and Assemblies | Assemblies > Insert Parts and Assemblies | /Content/Assembly/insert_parts_and_assemblies.htm | 快捷键 `i` 打开插入对话框，从 Current document / Other documents / Standard content 插入零件、草图、曲面、整个 Part Studio（可 “Insert entire Part Studio as rigid”）或子装配；首个实例按 Part Studio 原点与 Assembly 原点对齐，后续实例轻微偏移；支持过滤、配置、已发布版本、插入时 Snap 自动加 Fastened 配合。 |
| Linking Documents | Assemblies > Insert Parts and Assemblies > Linking Documents | /Content/Document/linking_documents.htm | 从另一文档（或同文档不同版本）的**版本**插入零件/装配即形成文档链接；同文档内修改即时传播，链接引用则受版本锁定并由用户决定何时更新；含打开链接文档、回收站/永久删除/权限错误文案。 |
| Updating References | Assemblies > Updating References | /Content/Assembly/updating_references.htm | 用版本/修订/图钉/蓝底/灰圈等图标体系标记过期引用；`Update all` 递归更新并在需要时自动创建版本；Reference manager 支持 Selective update、按指定版本回退更新、Pin reference 排除批量更新；无写权限时 Update 禁用。 |
| Instances List | Assemblies > Instances List | /Content/Assembly/instances_list.htm | Instances list 列出全部实例、Group、Mate connector、Mate 与 Relation；含 `:part/:mate/:errors` 等过滤命令、实例 `<n>` 编号、文件夹（装配/配合两类）、Dynamic suppression 表达式、Fix/Suppress/隔振/质心/镶嵌质量、详尽右键菜单与图标语义。 |

### 2.2 标准件（3）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Standard Content | Assemblies > Standard Content | /Content/Assembly/standard_content.htm | Onshape 维护的标准件数据库（ANSI/DIN/ISO/PEM，螺栓螺钉/螺母/垫圈/键等）；支持 Auto-size 按圆边/圆柱面选型（螺栓向下取整、螺母向上取整）、`A` 键翻转、Insert closest/furthest 堆叠、预选孔/面批量插入、逐实例或同配置批量编辑与元数据。 |
| Onshape Standard Content Library | Assemblies > Standard Content > Onshape Standard Content Library | /Content/Library/onshape_standard_content_library.htm | 逐类列出 Onshape 提供的标准件：ANSI（螺栓螺钉/螺母/垫圈/销与螺柱/挡圈/轴键）、DIN（含轴键）、ISO（含 O 形圈）、NAS、PEM（Unified/Metric）、SAE O 形圈；并给出标准件需求提交渠道。 |
| Custom Standard Content Libraries | Assemblies > Standard Content > Custom Standard Content Libraries | /Content/Library/custom_standard_content_libraries.htm | 用 Documents 文件夹 + “Not revision managed” + Standard Content 标签 + 版本建立企业/个人自定义标准件库（`Set library > My/CompanyName standard content`）；插入、编辑、BOM 合并规则与库更新/取消设置均有约束（更新库不影响已插入实例）。 |

### 2.3 BOM（4）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Bill of Materials | Assemblies > Bill of Materials (BOM) | /Content/Assembly/bill_of_material.htm | 每个 Assembly 自动生成交互式 BOM，Structured/Flattened 两视图；子装配可用 `Subassembly BOM behavior`（Show assembly and components 默认 / assembly only / components only）；支持加列、模板、CSV/复制、局部抑制与全局排除、表内编辑属性、交叉高亮、顶层装配汇总行。 |
| Working with the BOM Table | Assemblies > Bill of Materials (BOM) > Working with the BOM Table | /Content/Assembly/working_with_the_bom_table.htm | 在 BOM 中插入非几何 Items、生成缺失料号、跳转 Part Studio/Assembly 或打开链接文档；区分“仅本 BOM 抑制”与“全局 Exclude from all BOMs”，后者优先；含子装配 BOM 行为、聚合计算属性覆盖与 CSV 导出限制。 |
| BOM Table formatting | Assemblies > Bill of Materials (BOM) > BOM Table Formatting | /Content/Assembly/bom_table_formatting.htm | 默认列为 Item number、Quantity、Part number、Description；可加/删/左右移动/拖宽列，按列三态排序（Item 列不可删、不可移、不可排序）；属性可编辑，Onshape 标准件行灰化不可在 BOM 编辑。 |
| BOM Table Templates | Assemblies > Bill of Materials (BOM) > BOM Table Templates | /Content/Assembly/bom_table_templates.htm | 把编辑后的 BOM 格式 `Save as template...`：模板名必填、可选 Flattened/Structured、选择属性列（Item 必须保留）、`All uppercase in Drawings`、`Show top level assembly row`；通过 `Apply template` 应用（订阅限制见正文）。 |

### 2.4 配合基础（2）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Mate Connector | Assemblies > Mate Connector | /Content/Assembly/assembly_mate_connector.htm | Mate connector 是 Parts Studio/Assembly 中位于实体上或两实体之间的局部坐标系（快捷键 `Ctrl+m`，`k` 显隐）；分显式（Feature list 顶层、可被配合选用）与隐式（配合内创建、列在配合下）；含推断点规则、Realign（主/次轴）、Move（X/Y/Z + Rotate）、Flip 180°、Reorient 90°、Owner Entity/Attachment。 |
| Mates | Assemblies > Mates | /Content/Assembly/mates.htm | 两个实例之间只有一个 Mate，自由度内嵌于 Mate；对话框切换类型、两连接器、Flip/Reorient/Animate/Solve、Offset 与 Limits；量测方向为“第二个连接器→第一个”；含配合右键菜单、重排序、动画参数、指示器颜色、复制粘贴保留配合、Simulation connection 入口。 |

### 2.5 十种配合类型（10）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Fastened Mate | Assemblies > Mates > Fastened Mate | /Content/Assembly/fastened_mate.htm | 两实体间移除全部 6 个自由度（0 DOF）；可选 Offset（X/Y/Z 任意组合）并可按指定轴旋转一定角度。 |
| Revolute Mate | Assemblies > Mates > Revolute Mate | /Content/Assembly/revolute_mate.htm | 仅保留绕 Z 轴旋转（Rz）；第一个连接器为旋转点、第二个为固定点；只可沿 Z 偏移，支持 Limits 与绕轴旋转偏移。 |
| Slider Mate | Assemblies > Mates > Slider Mate | /Content/Assembly/slider_mate.htm | 仅保留沿 Z 平移（Tz）；第一个连接器为滑动点、第二个为固定点；可沿 X/Y 偏移（文档原文）、支持 Limits 与绕轴旋转偏移。 |
| Planar Mate | Assemblies > Mates > Planar Mate | /Content/Assembly/planar_mate.htm | 保留 X/Y 平移与绕 Z 旋转（Tx, Ty, Rz，3 DOF）；只沿 Z 偏移；常与 Tangent 组合（如曲线槽内销）。 |
| Cylindrical Mate | Assemblies > Mates > Cylindrical Mate | /Content/Assembly/cylindrical_mate.htm | 保留沿 Z 平移与绕 Z 旋转（Tz, Rz，2 DOF）；可对两连接器轴向分别设 Limits；页面未给出 Offset 选项。 |
| Pin Slot Mate | Assemblies > Mates > Pin Slot Mate | /Content/Assembly/pin_slot_mate.htm | 保留绕 Z 旋转与沿 X 平移（Rz, Tx，2 DOF）；**先选销（pin）后选槽（slot）**；只沿 Z 偏移；可用 X 上下限约束槽内行程、Z 上下限置 0 禁止转动。 |
| Ball Mate | Assemblies > Mates > Ball Mate | /Content/Assembly/ball_mate.htm | 保留绕 X/Y/Z 旋转（Rx, Ry, Rz，3 DOF）；只能选球心；Limits 为相对 Z 轴的最大转动角度；无 Offset。 |
| Parallel Mate | Assemblies > Mates > Parallel Mate | /Content/Assembly/parallel_mate.htm | 允许任意方向平移并保持连接器平行（页面正文“parallel rotation along any axis”，视频转录为 4 DOF：Tx/Ty/Tz + Rz）；Limits 约束两连接器相对位移。 |
| Tangent Mate | Assemblies > Mates > Tangent Mate | /Content/Assembly/tangent_mate.htm | 面/边/顶点相切；**不使用 Mate connector**；`Tangent propagation` 默认勾选以扩展到相邻相切面；Flip 仅对“两面”有效；不支持偏置面、样条类通用面、Relations。 |
| Width Mate | Assemblies > Mates > Width Mate | /Content/Assembly/width_mate.htm | 最多 2 个 Tab 连接器对称约束在恰好 2 个 Width 连接器之间；2 DOF（沿中心面平移 + 绕中心面旋转）；Tab 与 Width 不能同件；可与同件两个连接器；不能与 Relations 同用；iOS/Android 仅查看/编辑桌面创建的 Width mate。 |

### 2.6 装配工具（8）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Group | Assemblies > Group | /Content/Assembly/group.htm | 无需 Mate 即把所选实例按原点相对定位成刚性组；可预选、框选；组内子项不能单独操作；可抑制后改相对位置再恢复；含子装配时必须为 rigid；成员删除会级联出组。 |
| Snap Mode | Assemblies > Snap Mode | /Content/Assembly/snap_mode.htm | 快捷键 `Shift+s`；插入时或已插入后拖一个 Mate connector 到另一实体连接器上自动建配合并打开 Mate 对话框；拖动时实体透明、`Ctrl` 循环连接器、`A`/`Q` 改对齐。 |
| Show Mates | Assemblies > Show Mates Mode | /Content/Assembly/show_mates_mode.htm | 快捷键 `h`；悬停或点选实例即显示其配合（含子装配各层级）；`J` 全体配合显隐切换；图形区配合图标可右键编辑；也可对实例右键 Show mates。 |
| Replicate | Assemblies > Replicate | /Content/Assembly/replicate.htm | 以已配合的 seed 实例（如螺栓）+ 待匹配配合为输入，在所选 Part/Feature/面/边的相同几何上批量复制并配合；Match Scope 含 faces in parts/features/individual faces 与 edges on plane/face/individual edges；生成 Replicate 特征，可 `Dissolve Replicate` 展开为独立配合。 |
| Replace Instance | Assemblies > Replace Instance | /Content/Assembly/replace_instance.htm | 替换一个/多个零件、曲面、草图或子装配；可从当前文档、其他文档、标准件库选择，支持 `Replace all instances`；新组件即使略有差异也会重放原有配合。 |
| Assembly Linear Pattern | Assemblies > Assembly Linear Pattern | /Content/Assembly/assembly_linear_pattern.htm | 对实例做行阵列：Direction 选边/面，Distance 间距，Instance count 最小 1，可反向、Equal spacing、Centered（seed 居中、两侧各 N 个）、Second/Third direction；seed 抑制则阵列失活。 |
| Assembly Circular Pattern | Assemblies > Assembly Circular Pattern | /Content/Assembly/assembly_circular_pattern.htm | 绕轴阵列：Axis 可选边、面、隐式/显式 Mate connector、圆锥/圆柱面；Angle 为实例间角度，Instance count 最小 1，可反向与 Equal spacing；seed 抑制则阵列失活。 |
| Assembly Mirror | Assemblies > Assembly Mirror | /Content/Assembly/assembly_mirror.htm | 关于平面镜像零件/曲面/子装配；Mirror strategy 表逐实例选 `Transform`（当前装配内复制变换）或 `Derived`（派生新零件，`-Mirrored` 后缀，放入 Mirrored 文件夹）；Placement type 为 Auto/Bounding box XY/YZ/ZX/Origin XY/YZ/ZX；含自动版本、配置镜像、镜像运动“跟随原体”、故障排查与 iOS/Android 仅查看。 |

### 2.7 Relations（5）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Relations | Assemblies > Relations | /Content/Assembly/relations.htm | Relations 用于约束 Mate 之间的自由度；四种：Gear、Rack and Pinion、Screw、Linear；选择 Mate 后若自由度过多会弹第二对话框选定具体 DOF，并输入距离/比值。 |
| Gear Relation | Assemblies > Relations > Gear Relation | /Content/Assembly/gear_relation.htm | 关联两个具旋转自由度的 Mate，建立恒定角速度比；典型为齿数比（主动/从动），可 Reverse；Revolute 恰好匹配，Cylindrical/Planar/Parallel 需额外 Mate 固定；DOF 一经选定不可改（除非删 Mate/改类型重来）。 |
| Rack and Pinion Relation | Assemblies > Relations > Rack and Pinion Relation | /Content/Assembly/rack_and_pinion_relation.htm | 旋转自由度 Mate（典型 Revolute）与线性自由度 Mate（典型 Slider）关联；每转一圈线性移动输入值；可 Reverse。 |
| Screw Relation | Assemblies > Relations > Screw Relation | /Content/Assembly/screw_relation.htm | 在**同一个 Cylindrical Mate** 内把旋转 DOF 与平移 DOF 关联；输入 Distance per revolution；可 Reverse。 |
| Linear Relation | Assemblies > Relations > Linear Relation | /Content/Assembly/linear_relation.htm | 两个线性自由度 Mate（典型两个 Slider）按恒定比例联动；默认反向移动，Reverse 后同向；比值可非 1；DOF 一经选定不可改。 |

### 2.8 状态与上下文（3）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Named Positions | Assemblies > Named Positions | /Content/Assembly/named_positions.htm | 为装配的 Mate DOF 值 + 无配合实例的绝对变换命名并存档；Named positions 面板可添加/应用/编辑/复制/更新/排序/删除；每个勾选的 DOF 生成一列；子装配具名位置可被顶层 “Add to named positions” 引用；可在图纸中通过 Explode/Position 使用。 |
| Display States | Assemblies > Display States | /Content/Assembly/display_states.htm | 保存“哪些零件/子装配/配合隐藏或可见”的具名显示状态；可新建、应用、更新、重命名、删除；图纸默认用 `Show all`，切换显示状态会使相关图纸 Update 高亮。 |
| Create Part Studio in Context | Assemblies > Create Part Studio in Context | /Content/Assembly/create_part_studio_in_context.htm | 在现有装配上下文中新建 Part Studio：选显式 Mate connector 或 Assembly 原点作为新草图平面原点，装配以变暗上下文图形显示；生成 Assembly Contexts 列表与 context 箭头；`Insert and go to assembly` 回插为主实例（实线箭头），经普通 Insert 则非主实例（虚线箭头）。 |

### 2.9 仿真（4）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Simulation | Assemblies > Simulation | /Content/Assembly/simulation.htm | 线性静力 FEA：六种载荷 Force/Moment/Bearing/Pressure/Acceleration/Angular velocity，按实例逐项加载；连接推断方法三选一（Mates and touching faces 默认 / Mates / Bond all touching faces）+ 连接可视化；五种结果指标与色标；Inertial relief 支持自由运动；限 100 实例/10,000 接触对。 |
| Modal Simulation | Assemblies > Simulation > Modal Simulation | /Content/Assembly/modal_simulation.htm | 自然频率/模态分析：不施加载荷（载荷自动抑制且不可添加），默认显示前 5 阶、最多 15 阶非刚体模态并列出刚体模态；每装配仅允许一个 Modal 仿真；Frequency/Energy/Deformation 三者联动。 |
| Asynchronous Simulation | Assemblies > Simulation > Asynchronous Simulation | /Content/Assembly/asynchronous_simulation.htm | 从文档版本异步运行仿真，结果永久存入 Results and history 表；可带 Variables/Configuration/Named position（非 Default position 时必填）；每位用户最多连续 50 次、超时 24 小时、CPU 128/64 GB 实例；结果可取消/重跑/永久删除（不入版本历史）。 |
| Rigid Body | Assemblies > Simulation > Rigid Body | /Content/Assembly/rigid_body.htm | 将已有零件实例标记为仿真中的刚性体（内部不变形、可整体平移/旋转，等效无限强）；仅零件实例可选；多特征/多实例可重复但刚性不叠加；Fix 优先；刚性体不计入 100 实例上限；材料属性要求按静力/模态区分。 |

### 2.10 其他（2）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Exploded Views | Assemblies > Exploded Views | /Content/Assembly/exploded_views.htm | 用操纵器手动拖出爆炸视图；每个 Explode 特征含多个 Explode step（Translation/Rotation、Specify direction/axis、Explode lines、距离/角度）；面板可重排/编辑/复制/删除步骤，rollback bar 回看；可在图纸 Insert view 的 Explode/Position 选择；iOS/Android 仅查看。 |
| Assembly Variable Table | Assemblies > Assembly Variable Table | /Content/Assembly/assembly_variable_table.htm | 在 Assembly（及 Part Studio）右侧打开 Variable table，通过 Create Variable Studio 新建或 Insert 引用他文档 Variable Studio；变量名须为 FeatureScript 标识符，重名自动加 `_0` 后缀且后表覆盖前表；含复制表格、跳转/更新/编辑/移除引用等选项。**语料末尾截断**。 |

## 3. 核心概念与术语

- **Assembly tab / Assembly**：装配体工作页；文档可含任意多个；新建文档默认含空 Part Studio + Assembly；文档至少要有一个 tab，最后一个 tab 不可删除。
- **Instance（实例）**：插入到装配中的零件、曲面、草图、Part Studio（rigid）或子装配；同名实例以 `Housing <1>`、`Housing <2>` 编号。
- **Subassembly（子装配）**：被实例化的另一 Assembly；默认尊重其内部配合；可 Move to new subassembly / Create empty subassembly / Dissolve subassembly；编号命名 `Assembly X <x>`。
- **Mate Connector**：局部坐标系（原点 + 主 Z 轴 + 次 XY 轴）；**Explicit**（工具栏创建、Feature list 顶层、可在配合中选用）与 **Implicit**（创建配合时生成、列在 Mate 下、不能从列表选用）。
- **Mate（配合）**：两个实例之间**只有一个** Mate，自由度内嵌；以两个 Mate connector 对齐来定位/定向。
- **自由度记号**：`Tx/Ty/Tz` 平移、`Rx/Ry/Rz` 旋转；文档大量使用 `(Rz)`、`(Tz, Rz)`、`(Ty, Tx, Rz)` 等写法。
- **Fix（固定） vs Mate**：Fix 是装配局部状态，不随零件进入其他装配；Mate 是定义于两实例之间的约束。装配整体也可“fixed”或“fastened to origin”。
- **Group**：不是 Mate，但把所选实例按原点固定相对位置，等价于消除组内自由度。
- **Relation**：作用于 Mate 之上，约束 Mate 之间 DOF 的比例关系（Gear/Rack and Pinion/Screw/Linear）。
- **Origin**：Assembly 原点；可将实体配合到 Origin；插入时默认将 Part Studio 原点对齐 Assembly 原点。
- **Named position**：一组 Mate DOF 值 + 无配合实例的绝对变换；可随时 Apply。
- **Display state**：零件/子装配/配合的显隐组合快照，不影响几何/位置。
- **Exploded view**：由一个或多个 Explode feature 组成，每个 feature 含多个 Explode step；步骤可回滚。
- **Linked documents / Reference**：对另一文档（或同文档另一版本）的版本引用；链接对象不可修改，可 Update；`Pin reference` 排除批量更新。
- **Version vs Revision**：版本=文档快照（不可变）；修订=发布管理中的 revision；图标分别以“链接符号/三角”区分；从顶层只能先更新版本，修订需先在具体零件/子装配层更新。
- **Standard content**：Onshape 数据库维护的标准件（ANSI/DIN/ISO/PEM 等）；自定义标准件库来自带 Standard Content 标签的文档。
- **BOM（Bill of Materials）**：自动从装配生成的物料清单；`Structured` 含可展开子装配、`Flattened` 纯列表；子装配属性 `Subassembly BOM behavior` 三选一。
- **In-context / Context**：在装配上下文中建模；Context 对象、context 箭头、primary instance（实线）/非主实例（虚线）。
- **Simulation 术语**：Linear static、Modal（natural frequency / normal modes / eigenvalue）、Rigid body modes、Inertial relief、Connectivity method、Mate Simulation connection、Results and history、Default position。
- **订阅级别**：Simulation/Modal/Async/Rigid Body 为 Enterprise 与 Professional（正文）；BOM `Apply template` 为 Enterprise/Professional/Educator，`Save as template` 为 Enterprise/Professional（正文）；标准件元数据编辑在 Enterprise/Professional 与其他订阅间不同。

## 4. 功能与 UI 明细

### 4.1 Assembly tab、工具栏与标签页

- **Available in**：Assembly（桌面浏览器；iOS/Android 有专门流程）。
- **创建**：底部 `+` 菜单 → `Create Assembly`；也可在文档中通过 Insert new tab 创建。文档标签页可右键 Properties / Rename / Duplicate / Delete 等。
- **工具栏**：Assembly tab 激活时出现；按 `S` 打开 Assembly 快捷工具栏；工具栏可右键 `Customize toolbar...`，支持拖动工具组、拖出移除、`Save / Cancel / Reset to default`；组内工具须整组移动；`Reset to default` 恢复整条工具栏。
- **工具搜索**：`alt/opt+c`，在 Assembly/Feature/Sketch 工具栏中搜索工具。
- **Assembly tab 右键菜单（桌面）**：
  - `Delete`：即使活动也可删；最后一个 tab 不可删。
  - `Open in new browser tab`、`Rename...`、`Properties...`（灰显属性由公司管理员设定）。
  - `Duplicate`：复制到同文档，保留对原 Assembly/其他 Assembly 的引用。
  - `Copy to clipboard`：粘贴到另一文档时会把来源 Part Studio/Assembly 一并粘贴，**不保留**原文档引用；且 `+` 菜单 → `Paste tab`。
  - `Create Drawing of x...`：只含实体/零件，自动新建 Drawings tab。
  - `Select as document thumbnail`。
  - `Move to document...`：仅 Assembly tab 移动；若原文档仍有 tab 使用该装配的零件/装配则建立两文档链接；若会使原文档无 tab 则禁止。
  - `Export`；`Release`；`Release all configurations`（最多 100 个配置；仅单一 List 输入；多 List/Checkbox/Configuration variable 输入时不可用）；`Create task`。
- **iOS/Android**：新建文档默认有空 Part Studio + Assembly；底部 `+` 创建；Comments/Collaborators；Document information 面板含 Properties/Copy/Units/Name/Description/Share；Instances list 可拖拽调整尺寸；tabs 可左右滑动、按 Assembly/Part Studio 过滤与搜索；切换 tab 会提交当前打开的特征；仅剩一个 tab 时不可删。

### 4.2 Insert Parts and Assemblies（快捷键 `i`）

- **来源**：`Current document` / `Other documents` / `Standard content`；对话框记住上次选择。
- **过滤与搜索**：
  - Part Studios 过滤图标：sketch、surface、part、composite part（iOS 另有 sheet metal flat pattern）；搜索支持部分词、多词、标点等非字母数字；过滤按钮可选 common/all properties，可叠加。
  - 搜索结果逐条显示实体类型图标、名称、workspace/version 图标、文档名与 workspace/version 名、part number、发布状态。
  - `View released items` 可插入特定修订；Instances list 中用实心三角标已发布。
  - Other documents 支持 Folders/Documents 分区、`Sort`（Name / Last modified / Last modified by）；搜索/过滤状态下不可排序。
- **插入行为**：
  - 首个实例：Part Studio 原点与 Assembly 原点对齐；同零件后续实例轻微偏移。
  - 光标停留在对话框内→按 Part Studio 中相对原点的姿态插入；移出对话框后在图形区点击→落在点击处；插入后不受锁。
  - 可点击单个零件/草图/曲面、整个 Part Studio（全部当前零件）、整个 Assembly（全部子装配）。
  - `Insert entire Part Studio as rigid`：自动随 Part Studio 变更更新（含新增零件）；之后可右键 `Edit` 打开 Edit Part Studio instance 对话框增删零件/草图/曲面或切换配置。
  - 装配不能以版本引用方式插入同一 element ID 的装配。
  - 配置：插入前选配置并 `Generate`；可用 `Set to last viewed configuration` 或 `Reset to default`；插入后右键 `Change configuration`，悬停实例显示当前配置 tooltip。
  - 已发布/链接对象：Instances list 中的图标可打开 Reference manager，`Update to latest` 或 `Selective update`；右键 `Change to version...`；可 `Version graph` 选版本或 `Create version` 现场建版本。
  - 双击实例可开启 create/edit in-context 会话。
- **Snap 即时装配**：组件在 Part Studio 已有显式 Mate connector 且 Assembly 开启 Snap Mode 时，插入拖放可吸附到其他 connector；多个显式 connector 用 `Ctrl` 循环；接受插入后自动加 **Fastened** 配合；无显式 connector 则普通自由拖放。
- **删除级联**：删除实例/特征会删除相关 Mate connectors、Mates、relations；**例外：Mate groups 不删**。
- **Fix 语义**：Fix 只属于当前装配，不携带到其他装配；插入对话框中的 Fix 与 Mate 不同。

### 4.3 Instances List

- **内容**：零件实例、Group、Mate connector、Mate、Relation；按 `Name <n>` 列出；Part Studio 中改名会同步到装配。
- **过滤命令**（前缀 `:`，可组合）：
  `:part`、`:assembly`、`:mate`、`:matelimits`、`:item`、`:folder`、`:errors`、`:warnings`、`:suppressed`、`:hidden`、`:shown`；例如 `:mate :errors`、`:part :hidden`。
- **属性列**：part number、revision、state；右键 `Show instance list properties` 或 Preferences → Assembly settings → `Display instance list properties`；BOM 中也可加 `State` 与 `Not revision managed` 列。
- **文件夹**：
  - `New folder` 图标或先选实例再 `Add selection to folder`；可嵌套；拖入/拖出；文件夹名右侧显示计数。
  - 右键：Rename、Hide/Show、Hide other instances、Hide/Show all instances、Isolate、Make transparent、Suppress、Dynamic suppression、Add selection to folder、Expand/Collapse selected/all、Delete（删除内容）、Unpack folder（内容上移，删文件夹）。
  - 文件夹创建/操作**仅桌面**；iOS/Android 可查看/展开/关闭。
  - Mate Features 也可建文件夹（选择 Mate/连接器 → New folder 或 Add selection to folder），可拖放、支持相同右键项。
- **Dynamic suppression**：`Dynamic suppression > Add expression`，表达式如 `#depth >= .5 inches`；抑制时名称加删除线，表达图标出现；右键可 Edit/Remove expression。
- **右键菜单要点**：
  - Properties、Instance properties（含 Reference designator）、Edit（仅 rigid Part Studio）、Show/Hide instance list properties、Show/Hide center of mass（缺材料会警告 “One or more parts do not have a material defined”）、Rename、Unfix all、Add exploded view、Release。
  - Hide/Show、Hide other instances、Hide all instances、Isolate、Make transparent。
  - Mate limit indicator（有 Limits 的 Mate 右侧显示）。
  - Suppress / Dynamic suppression / Fix（或 Unfix；子装配含固定件显示 Unfix 图标）/ Use best available tessellation 或 Use automatic tessellation setting / Check interference / Replace instances / Edit in context / Add mate connector to instance origin / Switch to [Part Studio] / Copy [Part] / Add to named positions / Lock/follow position to / Change configuration / Move to new subassembly / Dissolve subassembly / Change to version / Export / Where used / Revision history / Create task / Add comment / Zoom to selection / Create drawing of [Part] / Expand / Collapse / Add selection to folder / Create empty subassembly / Delete。
- **Suppress 语义**：抑制零件/Part Studio/子装配/文件夹/item/连接器/配合；零件被抑制时其所有 Mate 失活；**seed 实例被抑制时所有装配阵列与 replicate 失活**；文件夹按整体抑制但成员保留各自抑制态，解除后单独抑制者仍抑制。
- **状态图标**：Assembly/子装配、实例、导入（derived）、配置实例/配置装配、fastened to origin、mate limit、固定（fix）、子装配含固定件、**自由度图标**（未固定且有 DOF）、全刚性、锁定/跟随、已发布、in-context primary/active/previous、显隐眼睛、镶嵌、动态抑制、装配错误。Linked references 另有版本/修订/图钉三类图标体系（见 4.4）。
- **镶嵌（tessellation）**：`Use best available tessellation` 提升显示质量，`Use automatic tessellation setting` 交系统平衡性能；质量由 Part Studio 决定，Assembly 可更低但**绝不低于**超过 Part Studio 设定；开启时显示图标。
- **刚性判定**：装配中全部零件零自由度且有固定件→自动 rigid，显示 rigid 图标（子装配同样）；刚性大子装配可提升性能。非固定子装配/实例显示 DOF 图标；子装配内部不显示 DOF 信息。

### 4.4 链接文档、引用状态与更新

- **链接成立条件**：从**有版本的**其他文档（或同文档另一版本）插入；无版本时可现场建版本；没有编辑权限会提示。同文档 workspace 内零件变更**即时传播**；链接引用由用户控制更新时机。
- **图标语义（摘要）**：
  - 版本图标（链接符号）=引用版本；三角=引用修订；图钉=已 pin。
  - 蓝底=有新版本/新修订可用（仅当同分支较新版本在该引用 tab 有编辑时蓝底；仅版本号变化但无编辑不蓝）。
  - 开灰圈=顶层被 pin 且已有更新（需 Reference manager/Selective update）；实灰圈=顶层实例的子级有更新（需进入子装配更新）；小箭头蓝底=子装配内有子级更新（可用 Update all/Reference manager）；小箭头灰底=顶层 pin/顶层为修订/子级 pin（需按提示先解除或进入子装配）。
  - 自动版本图标=Onshape 为 Update 自动创建的版本；auto obsolete=因同料号更新发布而自动作废。
- **更新方式**：
  - 单击图标或右键 `Update linked document`；Reference manager 的两个过滤页 `Update to latest` / `Selective update`。
  - `Update all`（工具栏）递归更新：对需要更新的对象**自动创建新版本**，然后更新；已有更新版本的对象直接更新到该版本；会更新所有版本，**包括并未过期的**。
  - 多分支有新版本时提示选择工作区。
  - Reference manager 中可打开 Version graph 选具体版本（可回退到旧版本）；`Update selected`。
  - 修订更新：必须先导航到零件/子装配所在处更新，再从顶层拉通；顶层不可直接清修订。
  - `Pin reference`：右键图标；蓝底变为圆圈+图钉；Update all 跳过；`Pinned` 过滤、`Revision` 过滤。
  - 无写权限的文档出现在 Reference manager 时，`Update` 按钮禁用。
  - 装配实例迁移到新文档后可在 `Update to latest` 中选择 `Update to the new document`。
  - 自定义标准件实例**不出现在** Reference manager，也不标记过期（引用库版本而非文档版本）。
- **错误文案**（原文）：
  - 回收站：`Failed to load document for workspace. Cannot open a document in the trash. Restore the document from Trash.`
  - 永久删除：`Failed to load document for version. Resource does not exist, or you do not have permission to access it.`
  - 无编辑权限：`You cannot modify this feature because you cannot access the referenced document.`
- **权限**：共享至少 Read/Copy/Export 才能被链接；取消共享后，已建立链接仍可用，只阻止更新到更新版本/新建链接；链接文档在浏览器平台可导出。

### 4.5 Standard Content

- **快捷键**：`Shift+Insert`（Insert furthest from selection）、`Alt+Insert`（Insert closest to selection）。
- **内置类别**：ANSI（Bolts & Screws、Nuts、Washers，库页另列 Pins & Studs、Retaining Rings、Shaft Keys）、DIN（Bolts & Screws、Pins、Nuts、Washers、Retaining Rings、Shaft Keys）、ISO（Bolts & Screws、Nuts、Washers、O-rings）、PEM（Unified、Metric 自扣紧固件）、NAS（Sheet Metal Fasteners）、SAE（O-rings）。
- **对话框**：Standard content tab → 选择 Standard / Category / Class / Component；自动尺寸图标选孔/圆边/圆柱面，尺寸自动回填；若无匹配尺寸：`Unable to find matching size for selection. Selection may be too small or large for specific component`。
- **Auto-size 取整规则**：螺栓/螺钉**向下取整**避免干涉；先用螺栓轴选螺母时**向上取整**保证装入。
- **插入规则**：
  - 无预选点 Insert→进入拖拽模式，随光标出现并在点击处吸附（隐式或显式 connector）。
  - 预选单个孔（圆边或圆柱面）→精确放置；预选平面→对该平面**全部孔**插入（不校验尺寸是否合适）。
  - 单个 Insert：悬停孔位选 connector；`A` 键翻转方向；生成 Fastened 配合。
  - 批量：先选孔面/孔边/含孔面任意组合，再 Insert。
  - 后续件用 `Insert closest to selection` / `Insert furthest from selection` 放入已配合的紧固件堆栈。
  - 螺栓仅 1 个 mate 参考点；垫圈/螺母有 2 个，故可堆叠；垫圈自动检测已配合螺栓并置于螺栓头下方。
  - Onshape Hole 特征创建的孔会读取 fine/coarse 螺纹；非 Hole 特征默认 coarse。
- **编辑与元数据**：
  - 右键 `Select instances with the same configuration` / `Select instances with the same part and same configuration` 批量选中；`Edit standard content instance` 只可改 Size、Length 等，Standard/Category/Class/Component 不可改；`Update` 后确认。
  - Enterprise/Professional：料号与描述若系统已有会自动带出；`Open metadata properties for this configuration` 编辑，元数据公司级共享（无公司则账号级）；管理员可在设置中授予覆盖标准件/公共零件元数据的权限。
  - 其他订阅（Free/Standard/EDU）：Edit 图标使 Part number/Description 可编辑，Save；`Reset metadata` 将 Description 恢复默认。
  - 标准件实例在 BOM 中灰色不可编辑，需回 Instances list 编辑。
- **自定义库**：
  - 文件夹→（管理员可为公司/教室/企业授予 Link document 权限）→加入文档且文档须 **Not revision managed**→每个 Part Studio 至少一个带 `Standard Content` 标签的实体/复合零件（建议一件一 PS）→每文档建版本→右键文件夹 `Set library > My standard content` 或 `CompanyName standard content`；可在其他账号 `Set as ... library`。
  - 使用：Insert → Standard content → `Custom standard content` → 选 Library → 按库目录下拉导航或搜索；可配置并 `Generate preview`；Insert 后拖到位置吸附 connector。
  - 无库访问权：`Creation of linked document reference failed`。
  - 编辑：`Edit standard content instance`；Library/Part 不可改（要换件请 Replace instance）；可 `Generate preview` → `Update`；实例保留插入时的库版本，不同库版本实例不可一起编辑。
  - BOM：同一 element 库且同料号的实例合并为一行（即使来自不同库版本）；无料号者仅在同零件+版本+配置时合并；子装配为 `Show components only` 时与父级匹配行合并；一行中任一实例被排除则整行排除；全部抑制则抑制，部分则部分抑制；有写权限可像普通零件一样在 BOM/Properties 编辑（发布管理启用时 Part number/Revision 只读）；合并行的编辑作用于该行所示属性的实例。
  - 库管理：`Update library`（不更新已插入实例、不使其过期、不进 Reference manager）、增删 Standard Content 标签、更新文档后建新版本、`Unset library`。

### 4.6 Mate Connector

- **Available in**：Part Studio、Assembly；`Ctrl+m` 创建；`k` 显隐。
- **创建方式**：`On entity`（在零件/草图上）或 `Between entities`（两实体中间）。
- **选点**：悬停面激活推断点并高亮最近点；点击面任意处→面质心；可选 Origin（图形区或 Instances list）；可把新 connector 放到既有 connector 上作为 origin 再 Realign/Move（示例：沿 Z 移 1 英寸）。
- **推断点（文档明确）**：
  - Planar face：每个顶点、弧心、边中点、面质心处与面平行。
  - Cylindrical face：轴线中点与两端，垂直于轴线。
  - Linear edge / sketch line：中点与两端，垂直于线。
  - Circular edge / sketch circle：中点与两端（文档括注“perpendicular to the line”）。
  - 曲线端点/控制点：对齐全局 Z；曲线本体：在最近端/控制点/中点处相切。
  - 顶点：法向于所在面。
  - 圆锥面 virtual sharps；平面内区域（孔、槽）质心；带部分圆柱边的平面可选轴线质心。
  - `Shift` 锁定当前推断，防止继续唤醒其他 connector。
- **对话框选项**：
  - `Realign`：Primary axis entity 控制 Z，Secondary axis entity 控制 XY。
  - `Move`：X translation、Y translation、Z translation，另有 `Rotate`（度数）。
  - `Flip primary axis`（180°）；`Reorient secondary axis`（XY 每象限 90°）。
  - Part Studio 中另有 `Owner Entity`（sketch/part/curve，可空=ownerless）与 `Attachment` 下拉。
  - 数值字段可用表达式与三角函数。
- **显隐**：Feature list 右键 Hide、Hide other Mate connectors/Show、Show all Mate connectors，或眼睛图标；Part Studio 与 Assembly 的显隐状态互相独立（PS 隐藏的 connector 在 Assembly 中可见，反之亦然）。
- **生命周期**：一个 connector 被多个 Mate 使用时只列一次（隐式者列在第一个使用它的 Mate 下）；显式 connector 可被 Part pattern 复制，插入 Assembly 时全部带入；若未显示请检查 Part 是否列为 owner entity。

### 4.7 Mates 通用机制

- **快捷键**：`m`（Mates 工具）、`j`（显示/隐藏全部配合）。
- **核心模型**：两个实例之间只有一个 Mate；Mate 自带坐标系；选择时系统按几何推荐连接器位置（几何变化会移动建议点）；可显式建 connector、插入 layout/reference sketch 辅助、或增加多个 Mate。
- **可配合对象**：parts、assemblies、subassemblies、sketches、surfaces；可配合到 Origin；可 Fix 以测试配合运动。
- **Mate 对话框**：
  - 类型下拉可随时切换（如 Slider→Revolute）；两个 Mate connector 字段。
  - `Flip primary axis`（Z 反向）、`Reorient secondary axis`（XY 90° 步进）。
  - `Animate`（忽略其他 Mate 预览本 Mate 的自由运动）；`Solve`（重新求解全部 Mates）。
  - 光标处 head-up display：点绿勾提交当前 Mate 并**继续**新建下一个（对话框保持打开）。
  - `Reorder items`：交换两个 connector 字段顺序（影响 Pin Slot 的 pin/slot 语义与量测方向）。
  - 底部 `Simulation connection`（Pin slot/Parallel/Tangent/Width 的对话框无此项）。
- **Offset（偏移）**：
  - 视为移动整个坐标系；相对**第一个选中**的 connector。
  - 支持：Planar（Z）、Slider（X/Y）、Revolute（Z）、Pin slot（Z）、Fastened（X/Y/Z）；Cylindrical/Ball/Parallel/Tangent/Width 页面未给 offset（Ball 明确无）。
  - Offset 勾选后，Slider/Revolute/Pin Slot/Planar/Fastened 还可选轴并输入旋转度数。
- **Limits（限制）**：
  - 多数 Mate 提供 min/max；以**第二个 connector 到第一个**的方向量测；正负值均可。
  - 图形显示：虚线代表运动方向/距离，端部实线柱代表限制；有 Limits 的 Mate 列表右侧显示 limit 图标。
  - 限制按 Mate 的 DOF 类型给字段（Cylindrical 可分别给两轴；Ball 给相对 Z 的最大转角；Width 页面未述）。
- **动画（Animate）**：
  - 一次只驱动一个 DOF，多 DOF 时先选择。
  - Start/End 默认取 Mate 的 min/max limit；可输入至多 36000°（100 转），便于高传动比齿轮/齿条演示。
  - Steps 为线性插值，最小 2；默认约 60 steps/s。
  - Playback：`Single`（一次）、`Reciprocate`（往返循环）、`Loop`（单向循环）；箭头反向；Current value 只读。
  - 支持所有 Mate 类型，但不建议以 Fastened/Tangent/Ball 作驱动；与其他 Mate/Relation 同时生效并遵守。
- **Mate 右键菜单**：Rename、Edit...（抑制状态也可编辑）、Apply limit position（跳到 min 或 max）、Reset（回到起始/原位）、Animate、Hide/Show、Show all mates、Show all Mate connectors、Isolate、Make transparent（按距离/连通性扩散，滑块控制）、Suppress（抑制后仍可编辑）、Clear selection、Delete。
- **编辑 Mate connector**：在 Mate 对话框中点 connector 图标打开编辑；**只允许编辑当前 Assembly 中的隐式/显式 connector**；Part Studio、子装配、链接文档中的 connector 必须回原处编辑。
- **重排序**：Mate Features 列表中可拖拽排序（Ctrl 多选）；Onshape 同时求解，顺序不影响结果。
- **复制粘贴**：装配中选中已配合实体 → 右键 Copy items → 粘贴到点击处；Instances list 中实体、Mate connectors、Mates 一并复制。
- **指示器**：蓝/白=正常；灰=抑制/失活（仍可编辑）；红=有问题；含各 DOF/限位方向图标（图标本身在语料中丢失，仅存定义文字）。
- **规则**：`There is exactly one Mate between any two instances`；Fix 不随装配携带；初始位置常为最佳猜测，用 Flip/Reorient 修正；编辑时 Onshape 不持续求解，`Solve` 才更新；接受 Mate 后才求解。

### 4.8 十种配合类型对照

| 配合 | 剩余自由度 | 选择输入 | 偏移（Offset） | 限制（Limits） | 关键选项/备注 |
|---|---|---|---|---|---|
| **Fastened** | 0（全约束） | 两个 connector | X/Y/Z 任意组合 | 页面未述 | 可选绕指定轴旋转角度；Offset 相对第一个 connector；用于焊接/螺栓入孔等 |
| **Revolute** | `Rz` | 两 connector；第一个=旋转点，第二个=固定点 | 仅 Z | min/max | 可绕指定轴旋转；动画演示旋转 |
| **Slider** | `Tz` | 两 connector；第一个=滑动点，第二个=固定点 | X/Y（页面原文） | min/max | 可绕指定轴旋转；动画演示平移 |
| **Planar** | `Tx, Ty, Rz`（3） | 两 connector；第一个=运动点，第二个=固定点 | 仅 Z | min/max | 常与 Tangent 组合 |
| **Cylindrical** | `Tz, Rz`（2） | 两 connector | 页面未述 | 可对两连接器轴向分别设 min | 无 Offset 说明；可动画同时看旋转+平移 |
| **Pin Slot** | `Rz, Tx`（2） | **先 pin 后 slot**；第一个=销且为转动点，第二个=槽且为平移 | 仅 Z | min/max；示例：X=±槽长一半，Z=0 禁转 | 选反可用 Reorder items 交换；可 Reorient primary axis |
| **Ball** | `Rx, Ry, Rz`（3） | 两 connector；仅能选球心；第一个=转动点，第二个=固定点 | 无 | 单一“相对 Z 轴最大转动角度” | 类似球铰；限制在拖拽时不可越过 |
| **Parallel** | 正文：“任意轴平移 + 任意轴平行旋转”；转录：“4 DOF：Tx/Ty/Tz + Rz” | 两 connector | 页面未述 | 两连接器相对位移 min/max | 保持两连接器平行；两实例可自由平移、绕 Z 自由转 |
| **Tangent** | 页面未给 DOF 数 | 两段面/边/顶点选择，**无 connector** | 无 | 页面未述 | `Tangent propagation` 默认勾选；Flip 仅两面有效；不支持偏置面、样条类通用面；不支持 Relations；两个顶点选择时 propagation 无效 |
| **Width** | 2（沿中心面平移 + 绕中心面旋转） | Tab connectors 1–2 个；Width connectors 恰好 2 个；两者不可同件 | 页面未述 | 页面未述 | Tab 可同件也可异件；两 Width 必须来自 Tab 之外的其他零件；可用隐式/显式 connector；不能与 Relations 同用；iOS/Android 仅查看/编辑桌面创建的实例 |

**文档不一致（如实记录）**：
- Slider 页 Offset 写 “along any combination of the X and Y axis”，而 Mates 总览的 Offset 表也写 Slider=“Along the X and Y axes”，与其只释放 Tz 的自由度描述并存；本报告不裁决。
- Mates 总览称 “You can specify Mate values of all Mates except Ball, Fastened, Tangent, and Width”，但 Fastened 页明确支持 Offset（X/Y/Z）与绕轴旋转；“Mate values”可能特指可驱动数值，语料未解释。
- Gear 页正文步骤列 “Revolute, Cylindrical, Planar, Parallel”，视频转录又多列 “Pin slot”；两处并列。
- Parallel 的 DOF 表述正文与转录不同（见上表）。
- Standard Content 页 “Supported standard content” 只列 ANSI/DIN/ISO/PEM，但库页还列 NAS 与 SAE；应为“库页更全”。

### 4.9 Relations（关系）

- **入口**：工具栏 relation 图标；选择所需 Mate（可在主 Mate Features 列表或任一子装配的列表中选）。
- **通用交互**：
  - 关系对话框顶部确认类型（Gear / Rack and pinion / Screw / Linear）。
  - 选择 Mate 后：若其 DOF 恰好满足关系，对话框直接显示该 DOF 图标；若 DOF 过多，弹**第二个对话框**选择具体 DOF。
  - 数值字段支持表达式与三角函数。
  - **锁死规则**：关系一旦选定 DOF，除非在对话框中删除该 Mate、改变 Mate 类型，或删除 Mate 重来，否则不可更改。
- **Gear**：两个旋转 DOF Mate；比例=主动轮齿数/从动轮齿数（20:40→0.5）；可 Reverse；也可用于滑轮、时钟指针等任意定比旋转件。Revolute 恰好；Cylindrical/Planar/Parallel 需额外 Mate 保持位置。
- **Rack and Pinion**：一个旋转 Mate（Revolute）+ 一个线性 Mate（Slider）；输入“每转的线性行程”；可 Reverse；若所选 Mate DOF 过多则第二对话框选 DOF。
- **Screw**：**同一个 Cylindrical Mate** 的旋转 DOF 与平移 DOF 关联；输入 Distance per revolution；可 Reverse。
- **Linear**：两个线性 Mate（典型两个 Slider）恒定比例；默认两件反向移动，Reverse 后同向；比值可为非 1（一快一慢）。

### 4.10 装配工具

- **Group**：选择实例（预选/列表/图形区/框选）→ 接受；Mate Features 列表出现 Group 特征；按原点保持相对位置，忽略后续几何变化；可右键 Hide instances/Show instances；可 Suppress 后改变相对位置，再恢复时按新位置；在另一装配 Insert→Assemblies 中 Group 作为一个实体；子装配加入组须 rigid；已属子装配的零件被选时自动选整个子装配；成员删尽则组删除。
- **Snap Mode**：`Shift+s` 切换；插入时：开 Snap→拖新实体悬停目标→出现隐式 connector→点击；有多个显式 connector 用 `Ctrl` 循环；接受插入生成 Fastened。已插入时：点拖实体→实体透明→悬停唤醒目标 connector→释放→Mate 对话框→可换类型/调方向/播放动画；拖动中可缩放旋转图形区；`A`/`Q` 改对齐。
- **Show Mates Mode**：`h`；悬停实例（图形区或列表）显示关联配合；点击实例保持显示；图形区选配合图标可在列表交叉高亮并右键 Edit；子装配时显示所有层级配合；`J` 切换全部配合显隐；列表眼睛图标也可逐条显隐；选中多条右键 Show/Hide。
- **Replicate**：
  - seed 须已按所需方式配合；**不要 Group 多实例**（不支持复制 Group）。
  - 字段：Instances（seed）、`Mate to be matched`（seed 只有一个 mate 时自动填充；多个时从列表选）、`Match Scope`（面：Match faces in parts / Match faces in features / Match individual faces；边：Match edges on plane / Match edges on face / Match individual edges）、`Parts to find match in`。
  - 结果：Instances list 出现 `Replicate` 及其下创建的 Mate 特征；可 `Dissolve Replicate` 展开为独立 Mate；种子只有一个外部 Mate 的限制；seed 被抑制则所有复制实例失活；出错时悬停橙色标题看提示。
- **Replace Instance**：选择 1 个或多个实例→激活 `Select replacement component`→Current document/Other documents/Standard content（自定义库选 Library、导航、配置、Generate preview、Select）→搜索支持名称/属性/多词/标点→选择后自动关闭替换选择器→可选 `Replace all instances`→绿勾接受；原有配合重放。
- **Assembly Linear Pattern**：Instances（可点连接器图标选隐式 Mate connector，选后可点字段中图标编辑）；Direction=边/面；Distance；Instance count（最小 1）；反向箭头；Equal spacing；Centered（seed 两侧各 N 个，均含 seed）；Second direction、Third direction；接受。Notes：组内阵列新实例仍属该组；子装配的阵列组件与配合不 rigid，可单独移动且位置变化会在其他子装配实例中反映；seed 抑制→阵列失活；阵列可像零件一样 Move to subassembly。
- **Assembly Circular Pattern**：Instances；Axis=边/面/隐式或显式 Mate connector/圆锥或圆柱面；Angle（实例间角度）；Instance count（最小 1）；反向；Equal spacing；接受。Notes 同上（组归属、非 rigid、seed 抑制失活、可移动子装配）。
- **Assembly Mirror**：
  - 输入：Instances（零件/曲面/子装配任意组合，列表更易选）；Mirror plane（悬停平面/边/平面面生成隐式 connector，或选显式 connector；可用“Select mate connector”图标强制选隐式；可编辑该 connector）。
  - Mirror strategy 表列：Instance（只读）、Source（只读，引用版本）、Symmetry（只读）、Mirror action（`Transform` / `Derived`）、Mirror reference（点击在新标签打开；缺失时信息图标）、Placement type。
  - Placement：`Auto position`（自动六选一）、`Bounding box XY/YZ/ZX`、`Origin XY/YZ/ZX`；主要对对称件（Transform）有意义。
  - Derived：生成新零件/子装配放到 Mirrored 文件夹，命名 `[name]-Mirrored`；缺失引用用 `Update` 批量创建（顺序：派生→镜像→加入同一 Part Studio→放 Mirrored 文件夹→如子装配则建 -Mirrored Assembly→插入当前装配 Mirror 下→如涉及链接文档版本则自动建版本并维护版本结构）；对话框底左显示待创建实例数。
  - 规则：镜像子装配的运动也镜像，但**不重建 Mates**，故不能独立运动，只跟随原体；子装配自由度被包含；配置随镜像生成但派生表只读；对称性后改不会自动切换 Mirror action；不建议在镜像 Part Studio/子装配内变换；强烈建议只镜像完全约束的子装配；发布前先完成镜像；复合零件/钣金模型镜像有 Derived 限制与 flat pattern 行为；可在镜像后继续添加实例；`-Mirrored` 标签页可用 Move to document 迁移（连带引用）。
  - iOS/Android：仅查看桌面创建的镜像实例。

### 4.11 BOM 全链路

- **入口**：图形区最右侧 BOM table 图标（View tools 下方）；打开即加载，无零件时显示默认列名。
- **视图**：`Flattened`（纯列表，无子装配标记）与 `Structured`（子装配可展开；展开编号 9、9.1、9.2…；双击 Item 单元格展开/折叠）。
- **默认列**：`Item number`、`Quantity`、`Part number`、`Description`（正文）——模板/格式化页写作 Item number/Quantity/Part number/Description；`Item` 列恒有、不可删、不可移、不可排序。
- **行的顺序/编号**：反映 Instances list 顺序；拖动实例改变顺序→BOM 自动更新（示例：第 7→第 1）。
- **子装配 BOM 行为**（Assembly 或子装配 Properties 的 `Subassembly BOM behavior`）：
  - `Show assembly and components`（默认）：Structured 中列子装配并缩进列出组件。
  - `Show assembly only`：只列子装配（适合采购/导入的供应商件）。
  - `Show components only`：只列组件（不列子装配）。
  - 变更影响该子装配被插入的所有 BOM（含图纸 BOM）；Apply/Save/Close。
- **列操作**：`Add column`（从属性列表选；新列加在右侧；多值 Category 不可加；可编辑属性可在表中改）；任意列（除 Item）右键 `Remove column`、`Move left`、`Move right`；拖列头右边缘改宽；双击表头三态排序（未排序→升→降），一次只按一列。
- **表内编辑与交叉高亮**：悬停行在图形区高亮；点 Item number 在 Instances list/图形区交叉高亮并滚动到焦点；点 Instances list 项也反向高亮 BOM 行。属性编辑即时双向同步零件/子装配属性。
- **标准件**：Onshape 标准件行灰化不可在 BOM 编辑（需 Edit standard content instance）；自定义标准件有库文档写权限时可编辑。
- **非几何 Items**：`Insert items` → 选 item 与数量（可搜索、按 Classification 过滤）→ Insert→先进入 Instances list 的 Items 列表（可 Undo）→勾选确认后出现在 BOM；右键 Edit（改数量）/Suppress/Add comment/Delete。
- **料号生成**：开启自动编号时可右键 Part number 单元格 `Generate next part number`；右键列头 `Generate missing part numbers`（顺序编号方案时）。
- **跳转**：BOM 行右键 `Switch to Part Studio/Assembly`（当前文档，当前标签打开）或 `Open linked document`（链接文档，新标签打开）。
- **局部抑制**：仅 `Structured` 可操作；右键行 `Suppress from this BOM`（只删本表数据，不删装配实例；剩余行重排）；子装配被抑制则其全部实例被抑制；overflow `Show excluded/suppressed` 查看（实例号显示 `--*`，全局排除显示 `--`）；右键 `Unsuppress from this BOM` 恢复。
  - 限制：只能抑制**直接子级**；只影响当前实例，嵌套实例不受影响；某装配 A 中零件被抑制后 A 插入 B，B 中该零件也被抑制；全局排除优先于局部抑制；**版本中不能 include/exclude**。
- **全局排除**：Part Studio Parts list 右键 Properties 勾 `Exclude from all BOMs`；或 Assembly tab Properties 勾选；或 BOM 行右键 `Exclude from all BOMs`。恢复：取消勾选或 BOM 行 `Include in all BOMs`（需先 Show excluded）。聚合属性按全局排除计算，不按局部包含更新。
- **聚合计算属性覆盖**：顶层装配行聚合单元格下拉选替代属性；覆盖及受其聚合影响的属性带图标+tooltip；右键 `Remove override` 移除。
- **质量**：Properties 面板 Mass 区 `Calculate value`；有排除实例时提示未计入质量。
- **模板**（仅 Enterprise/Professional，`Apply template` 为 Enterprise/Professional/Educator）：
  - `Save as template...` → Create BOM template：Name 必填；BOM Type（Flattened/Structured，作为新建 BOM 默认）；Property columns（Item 必有）；`All uppercase in Drawings`；`Show top level assembly row`；Create/Cancel。
  - `Apply template` 下拉选择模板（含管理员建的模板）。
- **overflow 菜单**：Copy table、Show/hide excluded/suppressed、Collapse all（Structured）、Expand all（Structured）、Show/hide top level assembly row、Save as template、Export to CSV。
- **CSV**：导出整表；若子装配未展开则**不会导出全部**。
- **其他**：横向滚动时 Item 首列冻结；发布/导入零件属性只读（要可编辑需从版本建分支 workspace）；已发布实例状态为 `Released`；可插入到图纸（见 Drawings BOM table）。

### 4.12 Named Positions 与 Display States

- **Named Positions**：
  - 右侧 Named positions 图标（View tools 下方）打开面板；`Add named position` 新建行；黄条提示进入编辑模式；第一个之后按钮移到底部。
  - 编辑：拖拽零件到所需位置；点击 Mate（Mate Features 列表）或零件（实例列表/图形区）打开 `Driving mate selector`，勾选 DOF；每个勾选 DOF 成一列；表头右键 Move column to right/left、Move column to start/end、Delete；也可在 selector 中取消勾选来删列；给 `Named position 1` 单元格命名。
  - 非编辑模式也可右键 Mate `Edit named position driver mate`，selector 预选全部 DOF。
  - 行右键：`Apply named position`（按当前表值/当前 Mate 值更新装配）、`Edit named position`、`Duplicate named position`（复制行，名称前缀 “Copy of”）、`Update named position`（把装配外部修改吸收进当前位置）、`Move up/down`、`Delete named position`。
  - 失败：提示“some Mate values could not be applied”；原因含零件删除/修改、特征修改导致 Mate 失败、DOF 超出 Mate 限制；可回退历史或删掉重建。
  - 子装配：先在子装配 tab 建具名位置；顶层右键子装配 `Add to named positions`；顶层若无具名位置自动建 Position A；用 Position 下拉选择子装配的某个具名位置。
  - 可在表中直接改 DOF 数值→Apply；`Done` 或点击表任意处退出编辑模式。
  - 图纸：视图右键 `Explode/Position > <named position>`。
  - 规则：具名位置引用**每个零件**的位置；无需 Mate 也可建；Tangent/Fastened 位置不受具名位置影响（Fastened 始终有效；Tangent 可能因参数变化失败）；Asynchronous Simulation 可选使用。
- **Display States**：
  - 图标打开对话框；先隐藏/显示零件与配合（右键 Hide/Show 或眼睛图标）；输入名称→`+` 添加；可建多个。
  - 应用：下拉选择；更新：选状态→调整显隐→点更新图标；重命名：下拉选择→铅笔→改名→Enter/点外部；删除：下拉选择→删除图标（立即移除）。
  - 新建状态后再加带配合/connector 的新零件：显式 connector 在旧显示状态中默认可见，隐式 connector 与配合默认隐藏。
  - 图纸：由装配建图时默认使用 `Show all`，无论装配当前显示状态；可在图纸视图右键/Insert view 选择显示状态；切换装配显示状态会使相关图纸 Update 高亮；也可在 View Only Toolbar 使用。

### 4.13 Create Part Studio in Context 与 in-context 语义

- **Available in**：Assembly。
- **步骤**：点 `Create Part Studio in context` → 选显式 Mate connector 或 Assembly 原点作为新 Part Studio 草图平面原点 → 接受 → 新建并打开 Part Studio；参考平面与所选原点/connector 对齐；顶部提示条带下拉 `Insert and go to assembly` / `Go to assembly`；装配以变暗方式显示；选上下文引用实体时高亮紫/粉色；Part Studio Feature list 顶部出现 `Assembly Contexts` 列表与 `Context` 对象；特征带 context 箭头。
- **返回**：`Insert and go to assembly` → 选要回插的零件 → 接受 → Instances list 中零件带 context 箭头（solid arrow），表示其为该零件的 **primary instance**；`Go to assembly` → 仅打开装配；若以后再通过普通 Insert 插入该零件，则 Context 与该实例不关联，用**虚线箭头**表示。
- **Top-down 方法选择（文档对比）**：本页工具用于“新建 PS 于上下文中”；已有零件/PS 用 `in-context modeling`（跨 PS/链接文档、依赖装配位置、适合大型装配）；单一参数史驱动多相关零件则用 multi-part Part Studios。

### 4.14 Simulation（线性静力）

- **可用性**：正文为 Enterprise 与 Professional；`Available in: Assembly`；不支持流体/热分析。
- **前提**（Basic workflow）：
  - 至少一个实例 Fixed（除非用 Inertial relief）。
  - 所有参与实例（含标准件，Fixed 除外）必须有材料；可在 BOM 表 Material 字段或 Part Studio Parts list `Assign material`。
  - 装配需充分约束；否则用 Inertial relief。
- **面板与入口**：Instances list 顶部 `Simulation` 区；Simulation 名称可编辑；`Show Results` 勾选启动；蓝进度条、早期迭代即显示色标、完成后 Status 绿勾。Status 警告/信息图标 hover 给错误与修复建议；mass override 存在时前后都警告且结果忽略 override。
- **六种载荷特征**（Assembly 工具栏最右）：
  - `Force`：均匀分布线性力；默认作用于整件体积；勾 Load region 并选面则均布于面。
  - `Moment`：均匀分布力矩；同样支持 Load region。
  - `Bearing`：只作用于面；按面法向对齐程度比例分配，不正对加载面的部分不贡献。
  - `Pressure`：只作用于面；幅值只能为正；方向箭头切换“压入（默认）/吸出（suction）”；无需 connector。
  - `Acceleration`：只作用于整个实例；不可选面；等效于同方向比例 Force（计质量）。
  - `Angular velocity`：施加离心惯性载荷，不做真实旋转；需按加速参考系建模；随转件必须分别加载。
- **通用载荷对话框**：
  - 可编辑特征名；类型下拉可切换到其他载荷；`Instance` 只能选**一个**实例；Bearing/Pressure 有 `Faces to load`（可多面，须属同一实例）。
  - `Load direction`：选现有 Mate connector 或点击新建 connector，默认沿 connector Z；反箭头反转（仅当前仿真上下文）；此处新建的 connector **不能在装配其他处引用**；Pressure 不用 connector，只用反箭头切换压/吸。方向按仿真逐次可配。
  - `X/Y/Z Magnitude`：载荷数值（Pressure 仅单值）；connector 的 X/Y/Z 轴作为方向坐标系。
  - `Load region`：默认整件；可勾选并选面局部化；Bearing/Pressure 无此勾选但有 Faces to load；Acceleration 无。
  - 非活动仿真的新载荷会自动抑制。
- **方向箭头右键**：Edit feature、Delete feature（其他项见 Context menus 章）。
- **结果与色标**：
  - 顶部色带，底部 6 个刻度；最小/最大值可点击改，改动以 `*` 标记，Reset 复位。
  - 五种结果：`von Mises stress`（最小值默认 0；最大值用 95 分位统计；右侧数字为最高应力，常近奇异点）；`Signed von Mises stress`（两侧都做统计，非 0 起）；`Safety factor`（屈服强度/von Mises；固定图例 min 3.5、max 1.0，最左 1000、最右 0；无屈服强度材料不提供）；`Max principal stress`（图例行为同 von Mises）；`Displacement`（min 默认 0、max 为最大位移；编辑后才显示极值）。
  - 单位默认 MPa（应力）、mm（位移），随 Account > Preferences > Units 或文档单位。
  - `Dim color scale`；`Show deformation`；动画播放/停止（动画时起始位置轮廓显示）；`Deformation scale` 默认按包围盒对角线 15%；`Color scale` 可输最小/最大、拖竖线、Reset。
- **Simulation 面板/表**：
  - `Add simulation > Add linear static simulation`；多仿真成列；列头右键 Set active（活动列名蓝）/Delete/Move left-right；双击标题改名；表内可勾/取消某仿真的载荷；双击 X/Y/Z 改值；双击 Direction 打开载荷对话框并聚焦方向；Activity/Status。
  - 行：Type（Linear static/Modal）、Status、Inertial relief 勾选；每个载荷一行：Feature name、X/Y/Z 分量、Magnitude（只读，三轴合成）、Direction。
  - 下方 Settings：Legend（Colors：`Viridis` 默认、`Blue → Red`、`Plasma`、`Rainbow`；Show minimum/Show maximum，Modal 不可用）；Connectivity method and visualization。
- **连接方法**：
  - `Mates and touching faces`（默认）：Mate/Group 按运动学关系，未定义处相触面视为 bonded（等同 Fastened/Group）。
  - `Mates`：只信 Mate/Group；未配合但相触的实例为独立体，仿真中可互相穿透。
  - `Bond all touching faces`：忽略全部 Mate 与 Mate Simulation connection；任意相触区域 bond（等同把全部实例放一个 Group 并抑制所有 Mate），模型被人为加刚。
  - `Show connections`：按类型显示弥散色块；无该类型则灰化。类型：Fastened（界面一致变形、无相对位移）、Simulation bonded（只在方法为 Mates and touching faces/Bond all touching faces 时可能）、Group（组内界面等同 Fastened）、Revolute（仅允许绕铰轴转）、Slider（仅允许沿滑动方向平移）、Planar（允许面内平移、禁止面外平移与转动）、Cylindrical（允许绕/沿圆柱轴运动，其余禁止）、Ball（禁止平移、允许任意旋转）、Not connected（近距可连而未连，标红）、Multiple connection types（同处多种类型，标黄；Not connected 也算一种类型）；可用 checkbox 逐类显隐。
- **Mate Simulation connection**：Mate 对话框底部（Pin slot/Parallel/Tangent/Width 除外）；勾 `Simulation connection` 并选 `Faces to connect`，把该 Mate 的 bond 限制到指定面；不影响普通建模，仅仿真可见；`Bond all touching faces` 覆盖之。
- **Inertial relief（线性静力）**：把动态事件当持续平衡处理，从惯性系切到加速系；允许实例自由运动；流程：建实例/材料→可选 fix/mate→加载荷→勾 `Inertial relief`→Show results。机理（原文）：识别刚体模态（部分 Modal 分析）→将每个模态作为恢复载荷（力/力矩组合）的候选基函数→按比例施加使装配与外加载荷静态平衡→用“外加+恢复”载荷做线性静力。规则：不要求固定件；**只适用于 Linear static，不适用于 Modal**。
- **比较仿真**：Add simulation 添加多列；Set active 或 Instances list 的 Simulation 下拉切换活动仿真并显示结果。
- **限制/错误**：
  - 专有自适应细化 FEA；不建议长宽比 >100:1（薄壁钣金/框架可能需过多资源）。
  - 材料必须给 Density、Poisson's ratio、Young's modulus、Tensile yield strength；Poisson's ratio 为 -1.0 或 0.5 不可仿真；部分标准库材料不适用于仿真；Safety factor 需 Tensile yield strength。
  - 忽略 mass override。
  - **不支持**：Tangent Mate、Pin Slot Mate、Parallel Mate、Width Mate（未翻译），以及全部 Relations（Gear/Rack and pinion/Screw/Linear）。
  - 非接触（或极近）实例不交互；相触且未配合默认 bond；Mate 的范围/限位对仿真**无影响**（只看初始条件）；默认跨小间隙推断连接；可用 Mate Simulation connection 明确断开；除非 Inertial relief，至少一件固定；建议全约束。
  - 复合零件不支持。
  - 不能运行：未抑制实例 ≥100、Show connections 接触对 ≥10,000、FGS 超时、内存不足。对策：减实例/抑制、减 DOF、避免 touching/bond 方法、从版本运行、简化装配。
- **Inertial relief 示例**：Connecting Rod 不固定 + 2 个 Bearing 载荷 + Inertial relief → 出结果。

### 4.15 Modal Simulation

- **可用性**：Enterprise/Professional（“Only available for” 句截断，正文含订阅说明）；每装配**仅一个** Modal 仿真。
- **要求**：所有实例须有材料；至少一个实例**未固定**（无需任何固定也可）；不施加载荷；Modal 激活时载荷自动抑制且不可添加（因此只有一个边界条件=装配状态）。
- **入口**：Simulation 面板 → Add simulation → `Add modal simulation`（已有仿真时按钮在底部）。
- **结果**：
  - 默认显示前 5 阶非刚体模态，可在底部 `Number of non-rigid modes` 设到最多 15；另列 Rigid modes（数量=装配开自由度，可无也可多）。
  - 每阶显示 `Mode n (x Hz)`，按频率升序；第一阶为基频。
  - 选中非刚体模态出现 `Energy` 字段；Frequency、Energy、Deformation 三者联动并共同决定位移幅值；Displacement=模型最大变形；Energy=达到该模态形状/频率/幅值所需功；用户设 Displacement 则各模态重算 Energy，设 Energy 则重算 Displacement 并调整动画幅值；改 Energy/Deformation 比例不改变 Frequency；能量单位随用户/工作区单位。
  - `Show deformation`；动画播放/停止（恒定速度循环）；色标表示变形幅值，与所需能量挂钩，可改上下限/Reset。
  - 图例：Show minimum/maximum 对 Modal **不可用**。
- **限制**：不支持载荷（无预应力/应力刚化）；线性动力学、无阻尼、不适合橡胶等非线性材料；薄壁实体运行更久；对称结构会出现频率几乎相同的镜像/旋转对称重复模态；非刚体模态数随自由漂浮实例增多而剧增。
- **术语**：normal modes / eigenvalue analysis / natural frequency analysis；rigid modes。

### 4.16 Asynchronous Simulation

- **能力**：在活动建模会话外计算；结果永久存于 Simulation 面板的 `Results and history` 表；展示队列/进行中/完成状态。
- **提交条件**（版本中）：Variables（可选）、Configuration（可选）、Named position（**除非使用版本的 Default position**，必填）、Simulation（必填）；`Run active simulation` 仅在文档**版本**中出现；达到 50 次连续上限或当前装配状态与已提交的异步仿真完全一致时按钮禁用。
- **流程**：建版本→Versions and history 选版本→Named positions 右键 `Apply named position`（或跳过用 Default position）→左栏选 Variables/Configuration/Simulation→Simulation 面板 Results and history → `Run active simulation`；进度通知只发给发起人并带查看链接。
- **资源/限制**：每位用户最多连续 50 次；超时 24 小时（live 无此长时限制但有其他限制）；异步用 128/64 GB **CPU** 科学计算实例，live 用 32/24 GB **GPU** 实例（视可用性）。
- **Results and history 列**：Simulation（名称，可为 Linear Static 或 Modal）、Status（queuing 旋转图标 / in progress 蓝条 / completed / error）、Run date（预处理期间显示 Queuing，之后显示开始运行日期时间）、Version、Configuration（表图标 hover 显示 Not configured 或配置列表）、Named position（或 Default position）、Type（Linear static/Modal）、Solver version（求解器持续改进，新结果可能与旧不同）。
- **行右键**：Show setup（进行中/失败时）、Cancel simulation（进行中）、Show results / Show results in a new browser tab（完成时，含版本中打开 setup 并显示结果）、Delete simulation results、Rerun simulation（失败时）。
- **删除**：需文档 Delete 权限；Results and history → 行菜单 `Delete simulation results` → 确认 Delete；永久删除、**不可撤销、不记录版本历史、不可恢复**；可从任意 workspace 删除；取消的运行自动从列表移除。
- **Show results 行为**：装配状态与某已完成异步仿真不完全一致→运行动态（实时）仿真，结果不存储（即使匹配某个未完成的异步任务也一样）；完全一致→直接取永久存储结果，不新跑。
- **Default position**：仅在打开版本且无任何 history 变化时可用；旋转零件 30° 后再转回仍不可用；Undo 两次恢复原始 history 状态后才重新可用。
- **Notes**：仿真本身不可删除，始终保存在 Results and history 表（与“删除运行结果”是两件事：文档明确 “Simulations cannot be deleted. They are stored in the Results and history table at all times.”）。

### 4.17 Rigid Body

- **可用性**：Enterprise/Professional（截断句）；Assembly。
- **语义**：将**已存在的真实零件实例**标记为仿真中的刚体（非 RBE2/RBE3 抽象单元）；仿真外无影响；无内部变形、可整体平移/旋转；等效无限强。
- **用途**：模拟无限强度/刚度对象（对照手册/最坏情况）；降低计算复杂度（如把所有紧固件设为刚性）。
- **选择规则**：只能选零件实例（面/曲面/复合零件不可）；可建多个 Rigid body 特征；同一实例可出现在多个特征；刚性不叠加；一个特征可选多个实例；Fix 优先于 rigid。
- **材料要求**：仍需满足仿真非固定件的材料要求；线性静力：除非被 Acceleration/Angular velocity 直接加载或启用 inertial relief（此时须有 Density），否则无需材料属性；Modal：只需 Density；不需刚度属性（Young's modulus/Poisson's ratio）。
- **流程与 UI**：Rigid body 图标 → 选实例 → 图形区出现 rigid body glyph，引线连到对话框第一个实例 → 勾选接受 → Instances list 出现特征；可按仿真在 Simulation 表中抑制，或 Instances list 右键 Suppress；**同一特征内的零件集合不能跨仿真变化**。
- **上限**：刚性体实例**不计入**仿真的 100 实例限制（规避上限的方法）。

### 4.18 Exploded Views

- **可用性**：Assembly；iOS/Android 仅查看（只能桌面创建）。
- **创建**：Exploded views 图标 → `Add exploded view` → 出现 `Explode 1` 与 rollback bar；金色消息条表示进入 Explode 模式，**此模式不能创建普通装配特征（mates/pattern/relations）**；选零件（可框选）→操纵器拖动；可拖操纵器原点改拖拽基点；释放后弹 Explode 特征对话框（第一个 Explode step）。
- **Explode step 字段**：
  - Instances（可改选择）。
  - 运动类型 `Translation` / `Rotation`。
  - Translation 可勾 `Specify direction` 选面/边作方向；Rotation 可勾 `Specify axis` 选面/边作轴；参考默认是零件实例本身。
  - `Explode lines` 默认勾选；默认在所有选中实体的质心定义爆炸线；可在 `Edges, vertices, or face for explode lines` 字段选边/顶点/面，线出现在每个实体该选择的质心。
  - 用操纵器拖，或在 `Translation distance` 输距离（Rotation 输角度）；负值反向。
  - 勾选接受并关闭对话框；**之前的选中保持**，可继续拖操纵器产生更多步骤；点未在上一步爆炸的实例会清空旧选择。
  - `Done` 结束 Explode 1；后续 Add exploded view 可建多个；新 Explode 的 Lines 默认继承上一步选择。
- **编辑**：双击或右键 Explode：Activate（显示并 fit）、Rename、Show/Hide all explode lines（视图或单步）、Reset starting position（以当前实例位置为新起点）、Duplicate（复制全部步骤）、Delete；右键步骤 Rename/Edit（可改实例、轴、平移↔旋转、距离/角度）。
- **Rollback bar**：拖动查看不同阶段，条下步骤被抑制；点条后可用上下箭头逐步走。
- **配置**：与普通特征一样可配置：Configuration 面板 `Configure Assembly`→命名→Add exploded view→拖步骤→在步骤字段右键 `Configure`（黄虚线框）→配置面板出现字段与默认值；在 Instances list 顶部 Configuration 区切换；若配置缺少某爆炸视图的零件，该视图在列表中变红，只有涉及缺失实例的步骤失败。
- **图纸**：Insert view 对话框的 `Explode/Position` 下拉可选任一具名 Exploded view；图纸视图始终显示装配中定义的全部爆炸线，rollback bar 位置**不影响**图纸；一个 Explode 多步骤适合单图纸视图，多个 Explode 便于不同视图各取所需。
- **Follow mode**：跟随者能看到爆炸视图移动、面板与激活。

### 4.19 Assembly Variable Table

- **可用性**：Part Studio、Assembly；位于图形区右侧（与 BOM、Configuration、Exploded views、Named positions 同区）。
- **创建**：Variable table 图标（View cube 下方）→面板底部下拉 `Create Variable Studio`→文档 workspace 新建 Variable Studio tab，表格可输入；Name 必须是 FeatureScript 标识符（首字符字母或下划线，后续字母数字/下划线，无空格）；Enter/Tab 后出现 type 与 value；可填 Description；类型下拉可改并保存。
- **插入引用**：`Insert Variable Studio` → 从本文档或其他文档选择；其他文档须有包含该变量的版本，否则先建版本；外部插入为只读引用。
- **选项（省略号）**：Copy table（复制到剪贴板；表头行只读、可复制不可粘贴入）、Switch to Variable Studio [x]、Open linked document、Update linked document（Reference manager 换版本/换文档）、Move up/down（面板中两张表换位）、Edit reference（Update Variable Studio 对话框换引用/配置）、Remove reference（删除表）。
- **单元格右键**：Delete（删变量）、Move up/down。
- **命名/覆盖规则**：同表变量名唯一，重名自动加递增后缀（Length→Length_0）并提示；不同表同名时**后表优先**，上表变量旁显示 override 图标；改变量名会更新所有引用它的特征。
- **截断**：末尾 “When inserting a configured variable into your Variable table...” 后无内容，配置变量的插入行为**无法从语料确认**。

## 5. 工作流、规则与错误状态

### 5.1 典型端到端工作流

1. **建装配**：`+` → Create Assembly；可建多个子装配 tab；顶层 Insert→Assemblies 引入子装配。
2. **插实例**：Insert（`i`）→ 当前/其他文档/标准件 → 过滤/搜索/配置/已发布版本 → 选中 → 原点对齐；需要整体刚性时 Insert entire Part Studio as rigid。
3. **定位与约束**：先 Fix 一个基础件或 Fasten 到 origin（只建议一个基础件）→ 建显式 Mate connector 或直接使用隐式推断点 → 选配合类型 → Flip/Reorient → Offset/Limits → Solve → Animate 验证。
4. **关系**：在已约束 Mate 上加 Gear/Rack and Pinion/Screw/Linear，必要时二次对话框选 DOF。
5. **检查运动**：拖拽测试；配合指示器红/灰/蓝白；Named positions 存姿态；Display states 存显隐；Exploded views 出爆炸图。
6. **BOM 与发布**：BOM 表核对料号/数量/属性（模板/CSV）；全局排除与局部抑制；Release/Release all configurations；引用更新与 pin；图纸插入 BOM/爆炸视图/具名位置/显示状态。
7. **仿真**：材料 + 固定（或 inertial relief）→ 载荷 → 连接方法/Show connections → 结果指标/动画 → 多仿真比较 → 需长期/版本化分析则建版本并用 Asynchronous；模态则另加一个 Modal 仿真。

### 5.2 文档明确的规则与依赖

- 两个实例之间只有一个 Mate；多个 Mate 可用但非默认。
- 配合同时求解，列表顺序不影响结果；编辑中不持续求解，`Solve` 才刷新全装配。
- 偏移相对第一个 connector；限值从第二个 connector 向第一个量测；限制按 DOF；关系 DOF 一旦选定不可改。
- Pin Slot 先 pin 后 slot；可用 Reorder items 纠正。
- Width：Tab 与 Width 不能同件；Width 恰好两个；不与 Relations 同用。
- Tangent 不用 connector；不支持偏置面/spline 类面/Relations；Flip 仅两面有效。
- Group 只适合同 Part Studio 建的正确相对位置件；跨 PS 的件几何变化不自动更新，易重叠；子装配须 rigid；成员删尽则组删。
- Delete 实例/特征会级联删除 Mate connectors/Mates/relations，**Mate groups 例外**。
- Suppress 会连锁：零件的 Mates 失活；seed 抑制使阵列/replicate 失活；文件夹整体抑制但保留成员各自状态。
- Tessellation 质量由 Part Studio 定，Assembly 不得更高。
- 零 DOF + 一个固定件→rigid；子装配内部 DOF 不显示。
- 链接文档是不可变版本；移动/复制子装配若会修改链接文档则操作失败。
- 子装配含文件夹不可 Dissolve；被版本引用的子装配在引用版本中保持不可变，但 workspace 中其 tab 变空。
- Copy to clipboard 跨文档不保留原引用；Duplicate 保留同文档引用；Move to document 只移动 Assembly tab。
- 标准件：螺栓向下取整、螺母向上取整；预选平面批量插孔不校验尺寸；非 Hole 孔默认 coarse；库更新不回溯已插入实例。
- BOM：Item 列不可删/移/排序；一次只按一列排序；Structured 才可局部抑制；只能抑制直接子级；全局排除优先；版本内不能 include/exclude；未展开子装配导出 CSV 不完整；标准件行只读。
- Named position 失败若 DOF 超限；Fastened 不受影响、Tangent 可能失败。
- Display state 图纸默认 Show all。
- Mirror：Derived 自动版本与 `-Mirrored` 命名；镜像子装配不重建 Mates、只跟随；配置只读；不建议变换镜像产物；发布前先镜像。
- Simulation：载荷逐实例；一实例一次只能一个；载荷方向 connector 局部专用；非活动仿真载荷自动抑制；限位/范围对仿真无影响；不支持四种 Mate 与全部 Relations；至少一个固定件（unless inertial relief）；材料属性要求；≥100 实例或 ≥10,000 接触对不可运行；Live 5 次自适应、结果临时缓存。
- Modal：每装配一个；不加/抑制载荷；最多 15 阶；至少一个未固定。
- Async：只在版本运行；Default position 受 history 变化影响；50 次/24h；删除结果永久且不入历史。
- Rigid body：只零件实例；刚性不叠加；Fix 优先；不计入 100 上限；特征集合跨仿真固定。
- Exploded：Explode 模式不能建 mates/pattern/relations；图纸忽略 rollback。
- Variable table：变量名为 FeatureScript 标识符；后表覆盖前表；改名同步引用。

### 5.3 常见错误与处理（文档明确）

| 场景 | 错误/现象 | 处理 |
|---|---|---|
| 打开链接文档 | 回收站：`Failed to load document for workspace. Cannot open a document in the trash. Restore the document from Trash.` | 先恢复文档 |
| 链接文档永久删除/无权限 | `Failed to load document for version. Resource does not exist, or you do not have permission to access it.` | 检查权限/文档存在性 |
| 无链接文档编辑权限 | `You cannot modify this feature because you cannot access the referenced document.` | 申请权限 |
| 引用更新 | Reference manager 有文档无写权限时 Update 禁用 | 获取写权限 |
| 自定义库无访问权 | `Creation of linked document reference failed` | 联系管理员 |
| 标准件选型 | `Unable to find matching size for selection. Selection may be too small or large for specific component` | 换尺寸/手动选 |
| Replicate | 橙色标题；缺 seed 选择/缺 Mate/缺匹配面 | hover 标题看提示；检查 seed/Mate/匹配几何 |
| Named position | 部分 Mate 值无法应用 | 检查零件/特征是否被改；DOF 是否超限；回退历史或重建 |
| Assembly 错误 | 列表红色图标，展开定位，悬停看详情 | 按提示修 Mate/引用 |
| Simulation 不收敛 | 未约束刚体运动（示例：方法=Mates 且紧固件 Mate 被抑制） | 改连接方法/补约束/开 Inertial relief |
| Simulation 无法运行 | ≥100 实例、≥10,000 接触对、FGS 超时、内存不足 | 抑制实例、降 DOF、避免 touching 方法、从版本跑、简化 |
| Mirror 缺引用 | Mirror reference 信息图标，底部显示待创建数 | `Update` 创建派生实例 |
| Display state 图纸 | 新建图纸默认 Show all | 在视图中另选显示状态 |
| BOM CSV | 子装配未展开则不完整 | 先 Expand all |
| Mass/质心 | 缺材料：`One or more parts do not have a material defined` | 分配材料 |
| Async | 与已完成异步一致→取缓存；否则实时且不存；与未完成一致也不会复用 | 需要即看结果可用 Show results/打开新标签 |

## 6. 与其他章节的关系

- **Part Studios / 草图 / 特征**：Mate connectors 可在 Part Studio 预先定义并被 Part pattern 复制；装配可插入草图/曲面/整 PS；配置（configurations）、变量、multi-part Part Studio、Derived、材料、Appearance/tessellation 均在 Part Studio 侧定义、装配侧消费；in-context 建模有专门章 `Modeling in Context`（本组只覆盖入口与语义）。
- **Documents / 权限 / 版本 / 分支合并**：链接文档依赖共享权限（Read/Copy/Export+）、版本、Reference manager；`Merging` 用于恢复被误删子装配对应历史；`Move to document`、`Where used`、`Revision history`、`Trash` 等文档章。
- **Release management**：Assembly tab `Release/Release all configurations`、Instance `Release`、BOM 中 revision/state 只读、标准件/自定义库属性只读条件、`Not revision managed`。
- **Properties (Metadata) / Tags / Company Settings**：Properties 页、Assembly settings（Display instance list properties）、自定义属性、BOM 模板、Numbering schemes、Standard Content 标签、公共零件元数据覆盖、Dynamic suppression 表达式配置。
- **Drawings**：BOM 表插入、Exploded views、Named positions（Explode/Position）、Display states、`Create Drawing of x...`、视图右键。
- **Configurations**：插入/切换/显示 tooltip、Exploded view 可配置、Mirror 配置镜像、Async 可选 Configuration、BOM 列显示配置（Results and history）。
- **Measure / Mass Properties / Isolate / Make transparent**：装配工具链中的测量、质量、隔离与透明显示；中心-of-mass 材料依赖。
- **仿真相关章**：本组是 Simulation/Modal/Async/Rigid Body 主章，还引用 `Running a linear static simulation with inertial relief`、`Results and history table`、`Context menus`。
- **协作**：Follow mode、Comments、Collaborators、Tasks（Create task）、Where used。
- **平台**：iOS/Android 的组装、BOM、镜像、爆炸视图、Width mate 能力边界页。
- **导入/衍生**：Imported/derived 实例图标、Assembly Mirror 的 Derived、复合零件/钣金。

## 7. 对 LubanCAD 的可执行启示

> 仅列文档能支撑的需求；`[文档明确]` 表示 Onshape 帮助原文直接说明，`[推断]` 表示由文档推导到 LubanCAD 的落地方式或优先级。

### 7.1 需要补齐的 UI 表面（菜单/工具栏/对话框/树行/右键/状态）

1. [文档明确] 装配工作页（Assembly tab）与装配工具栏、`S` 快捷工具栏、`alt/opt+c` 工具搜索、工具栏自定义（拖放工具组、保存/取消/重置）。
2. [文档明确] 实例列表（Instances list）：实例 `Name <n>`、Mates/Relations 分区、Group、Mate connector 层级、文件夹（装配/配合两类、可嵌套、计数字段）、过滤命令 `:part/:assembly/:mate/:matelimits/:item/:folder/:errors/:warnings/:suppressed/:hidden/:shown` 及组合。
3. [文档明确] 插入对话框三来源（当前文档/其他文档/标准件）、Part Studio 类型过滤（草图/曲面/零件/复合零件/钣金展开）、属性过滤与多词/标点搜索、已发布版本过滤、配置选择与 Generate、`Insert entire Part Studio as rigid`、原点对齐与后续轻微偏移、`Change to version`/`Change configuration` 右键。
4. [文档明确] Mate connector 对话框：On entity/Between entities、推断点提示（质心/中点/角点/圆锥 virtual sharp/区域质心/轴线）、`Shift` 锁定、Realign（主/次轴）、Move（X/Y/Z/Rotate）、Flip 180°、Reorient 90°、Owner Entity/Attachment、`k` 显隐。
5. [文档明确] Mate 对话框：类型切换、两个 connector 槽、Reorder、Flip/Reorient、Offset（含轴+角度）、Limits（min/max）、Animate（Single/Reciprocate/Loop、Steps、Start/End、Current value）、Solve、head-up 提交下一个、Simulation connection。
6. [文档明确] 各配合类型专属字段/选择顺序提示（Pin Slot 先 pin 后 slot；Width 的 Tab/Width 两组；Tangent 无 connector 但有 propagation；Ball 仅球心）。
7. [文档明确] Relations 对话框：类型确认、Mate 选择、二次 DOF 选择对话框、比值/距离、Reverse、选定后锁定。
8. [文档明确] 面板：BOM（Structured/Flattened、加列/模板/CSV/抑制/排除/顶层行）、Named positions（表、Driving mate selector、列右键）、Display states（下拉、更新/重命名/删除）、Exploded views（Add、步骤列表、rollback、Activate/Duplicate/Reset）、Simulation（表+设置+Results and history）、Variable table、Reference manager（Update to latest/Selective update、Version graph）。
9. [文档明确] 状态图标与颜色：引用版本/修订/图钉/蓝底/开灰圈/实灰圈/箭头、Mate 蓝白/灰/红、装配错误红、DOF/rigid/lock/tessellation/dynamic suppression、in-context primary（实线）/非主（虚线）。
10. [文档明确] 右键菜单全覆盖：装配 tab（约 15 项）、实例、子装配、Mate、Mate connector、文件夹、BOM 行/列、Named position 行、Simulation 列/行、Exploded step。

### 7.2 参数与默认值清单（可直接落成 spec）

11. [文档明确] 插入：首实例原点对齐；后续同零件轻微偏移；光标在对话框内/外决定放置姿态。
12. [文档明确] 配合：offset 相对第一个 connector；limits 从第二个向第一个量测；正负均可；limit 图形为虚线+端部实线；Pin Slot 示例 X=±槽长/2、Z=0。
13. [文档明确] Animate：Steps 最小 2、默认约 60 steps/s；End 最大 36000°；播放 Single/Reciprocate/Loop；Start/End 默认取 Mate limits。
14. [文档明确] 阵列：Instance count 最小 1；Centered 时两侧各 N 个（含 seed，共 2N−1）；Linear 支持第二/第三方向；Circular 的 Angle 为实例间角度；二者均支持 Equal spacing/反向。
15. [文档明确] Mirror：Placement 默认 Auto，备选 Bounding box XY/YZ/ZX、Origin XY/YZ/ZX；Derived 命名 `[name]-Mirrored`，放入 Mirrored 文件夹；子装配 `[subassembly name]-Mirrored`。
16. [文档明确] BOM 默认列 Item number/Quantity/Part number/Description；Item 不可删/移/排序；排序三态且单列；Structured 编号 9、9.1…；模板字段 Name（必填）、BOM Type、Property columns、All uppercase in Drawings、Show top level assembly row。
17. [文档明确] 标准件：`A` 翻转、`Shift+Insert`/`Alt+Insert` 对应 furthest/closest、自动尺寸螺栓向下/螺母向上；螺栓 1 mate、垫圈/螺母 2 mates。
18. [文档明确] 子装配自动名 `Assembly X <x>`；复制命名位置前缀 `Copy of`；变量重名后缀 `_0`。
19. [文档明确] Simulation：默认连接方法 Mates and touching faces；默认结果 von Mises；von Mises min 默认 0、max 取 95 分位；Safety factor 图例 3.5→1.0、外侧 1000→0；Displacement 默认 min 0；颜色默认 Viridis（另 Blue→Red/Plasma/Rainbow）；变形比例默认包围盒对角线 15%；自适应 5 次；实例上限 100、接触对上限 10,000。
20. [文档明确] Modal：默认 5 阶、最多 15 阶；每装配 1 个；至少 1 件未固定；载荷自动抑制。
21. [文档明确] Async：每用户最多 50 次连续；超时 24 h；CPU 128/64 GB；Named position 必填（Default position 除外）；Results and history 列名与右键菜单。
22. [文档明确] Rigid Body：不计入 100 上限；Fix 优先；刚性不叠加；线性静力一般无需材料、Modal 需 Density。

### 7.3 交互与选择规则（验收可测）

23. [文档明确] 两个实例仅一个 Mate；`Solve` 触发全装配求解；编辑中不持续求解。
24. [文档明确] Shift 锁定 Mate connector 推断；Snap 拖拽时 `Ctrl` 循环 connector、`A`/`Q` 改对齐。
25. [文档明确] Pin Slot 顺序语义（先 pin 后 slot），错误顺序可用 Reorder 修正；Width 的 Tab/Width 不得同件，两个 connector 异组。
26. [文档明确] Tangent 不接受 connector，propagation 默认开，Flip 仅两面有效。
27. [文档明确] Group 忽略几何变化按原点定位；子装配须 rigid；已属子装配的零件被选自动升格为子装配。
28. [文档明确] Suppress 级联与 seed 语义（Mates 失活、阵列/replicate 失活、文件夹保留成员抑制态）。
29. [文档明确] Delete 级联删除 connectors/Mates/relations，Mate groups 例外。
30. [文档明确] Tessellation：Assembly 可采用低于 Part Studio 的质量，绝不能高于。
31. [文档明确] 引用图标判定：仅有“同分支新版本且该 tab 有编辑”才蓝底；修订需源层更新；pin 后蓝底变圆圈。
32. [文档明确] BOM 行序=实例列表序；局部抑制只允许直接子级、仅本表；全局排除优先；版本内不能 include/exclude。
33. [文档明确] Explode 模式禁用 mates/pattern/relations；rollback 不影响图纸。
34. [文档明确] 具名位置失败条件（DOF 超限等）；Fastened 不受影响、Tangent 可能失败。
35. [文档明确] In-context：`Insert and go to assembly`→primary instance 实线箭头；普通 Insert→虚线箭头。

### 7.4 事务、撤销、版本、权限与协作

36. [文档明确] 所有装配操作都是文档历史的一部分（undo 可撤销 item 插入、Replicate 操作、Group 位置调整；Named position/Exploded 可回退历史）；[推断] 在 LubanCAD 中应按 P0-10 全部落入 iTwin `BriefcaseTxns` 标准事务，禁止自管 undo 栈。
37. [文档明确] 链接引用绑定不可变版本；Update all 自动建版本；修订不可从顶层更新；Pin 排除批量更新；无写权限 Update 禁用；取消共享不破坏既有链接。
38. [文档明确] Mirror 的 Derived 会为链接文档与当前文档自动建版本，必须保持版本结构；发布前完成镜像；需团队感知自动引用，避免并发冲突。
39. [文档明确] Async 结果永久存储但删除不可逆且不入历史；说明“可删除/不可恢复”的操作需 HITL 与审计（[推断] 对应 LubanCAD P0-10 的不可逆操作登记）。
40. [文档明确] BOM 属性编辑双向同步零件/子装配属性；发布态只读（需从版本建分支）；标准件只读；自定义库需库写权限。
41. [文档明确] 标准件元数据公司级共享（或账号级）；管理员可授予覆盖权限；自定义库共享用文件夹 Link document 权限。
42. [文档明确] Simulation 在版本中异步运行，结果按 Version/Configuration/Named position 组合索引；Solver version 记录以保证可解释性。
43. [推断] 对 LubanCAD：装配层级可映射为 iModel 的装配/元素层级与 `params` 引用，Mate/Relation 需真实 3D 约束求解与“唯一 Mate/实例对”数据模型；若复用现有绳墨（ShengMo）求解器，需先做 3D 装配约束的 AIRR/ADR（接口中立）。
44. [推断] BOM 应由 iModel/BIS 元素属性 + 发布状态派生，禁止第二套数据源（P0-06）；模板/CSV/抑制/排除是纯投影，不应改写几何事实源。

### 7.5 可写成测试断言的验收点

45. [文档明确] 插入：首实例原点重合；第二实例偏移；`Insert entire Part Studio as rigid` 后 PS 新增零件自动出现；删除实例后其 Mate connector/Mate/relation 消失而 Mate group 保留。
46. [文档明确] 十种配合的 DOF 集合、offset 可用轴、limits 字段、选择顺序与错误提示；Width 同件拒绝；Tangent 无 connector；Pin Slot 顺序纠正。
47. [文档明确] 动画步数/角度上限、播放模式；限制位置应用；关系 DOF 锁定。
48. [文档明确] 抑制 seed→阵列/replicate 失活；抑制零件→其 Mate 失活；文件夹解除抑制后单独抑制者仍抑制。
49. [文档明确] 引用状态图标分类与 Update all 自动建版本；pin 后批量更新跳过；无写权限按钮禁用。
50. [文档明确] BOM：Structured 展开编号 9.1；改实例顺序后 Item 号同步；局部抑制显示 `--*`、全局排除 `--`；CSV 未展开不完整；模板字段与 Item 不可删。
51. [文档明确] Named position 超限失败；Explode 模式工具禁用；Display state 图纸默认 Show all。
52. [文档明确] Mirror Derived 生成 `-Mirrored` 文件夹与自动版本；镜像子装配跟随原体运动；配置只读。
53. [文档明确] Simulation 前置条件（固定件/材料）、100 实例与 10,000 接触对阈值、不支持 Mate/Relation 列表、结果指标与默认图例、五遍自适应；Modal 5/15 阶与载荷抑制；Async 50 次/24 h 与结果列；Rigid Body 不计上限。
54. [文档明确] 移动端边界：Width mate/Assembly Mirror/Exploded 仅查看；文件夹创建仅桌面；Move/Create subassembly 仅桌面+iOS；BOM 仅切换视图类型。

### 7.6 文档缺口（需后续单独采集/确认，不应臆造）

- 所有对话框/图标/工具栏的视觉规格（位置、尺寸、颜色）在语料中缺失。
- Mate 指示器、Instances list 图标、引用图标的实际图形无法辨识。
- BOM 具体属性全集、各订阅下的默认模板内容未列。
- 仿真求解器类型/网格尺寸/收敛准则细节未给。
- Assembly Variable Table 末尾截断，配置变量插入行为未知。
- 各功能的快捷键仅部分给出（插入 `i`、Mate `m`、Mate connector `Ctrl+m`、显隐 `k`/`j`、Snap `Shift+s`、Show Mates `h`、工具搜索 `alt/opt+c`、标准件 `Shift/Alt+Insert`、`A` 翻转、`Q/A` 对齐）；其余无。
