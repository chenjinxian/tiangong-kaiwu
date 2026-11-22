# Part Studios — 钣金与框架/结构件（ps-sheet-frame）分析报告

## 1. 本章概览

- **主题数**：23；**总词数**：41,043（与组头一致；逐主题词数见第 2 节）。
- **覆盖子域**：
  1. **Frame（框架/结构件）族 6 篇**：Frame、Onshape Frame Profiles Library、Frame Trim、Gusset、End cap、Cut List；
  2. **Sheet Metal（钣金）族 15 篇**：Sheet Metal Model、Flange、Hem、Tab、Bend、Jog、Form、Onshape Sheet Metal Forms Library、Loft、Make Joint、Corner、Bend Relief、Modify Joint、Corner Break、Sheet Metal Table and Flat View；
  3. **Flex PCB 2 篇**：Flex PCB Model、Finish Flex PCB Model。
- **文档更新日期**：语料未提供任何 `last modified`/日期字段，**文档未说明**。
- **整体质量/抽取限制**：
  - 语料由 HTML 自动抽取，图片只剩 `[image: alt]`，因此大量对话框外观、图标、示意几何只能从 alt 文本与正文推断；正文对参数的描述总体完整，但**纯图片步骤（角释放/折弯释放的 3D 与展开对比、咬合/折边形态、Form 外形）无法从文本核实**。
  - 表格被压平成 `|` 分隔行。**Onshape Frame Profiles Library 一篇 11,568 词几乎全是型材规格表与缩略图 alt**，含有大量 OCR 式错拼/重复（如 `C5,6.7`、`Lx3.5x0.625`、`L53x0.325`、重复尺寸、`Wt`/`WT`/`Tw`/`TW` 混写、`SIzes` 等）；本报告只归纳系列与规则，不逐条抄录尺寸。
  - 每个钣金工具页末尾都重复粘贴同一段 “Additional sheet metal tools” 清单（14 个工具/命令），造成语料冗余；本报告只在第 4 节汇总一次。
  - **任务提示中的 “Finish Sheet Metal Model” 在本组没有独立主题**；其行为只在 `Sheet Metal Model` 正文中描述（详见 4.1）。`Finish Flex PCB Model` 才是独立主题。
  - 存在若干**文档内部不一致**（原文照录并标注，见第 5 节）：`Symmetric` 的可用 End type（正文 “Blind and Through all” vs 步骤 “Blind only”）、Bend relief depth scale 上限（1.00–2.00 vs 1.00–5.00）、Modify joint 的 K Factor 允许值写作 “-1000 to 1.00”。

---

## 2. 主题清单与逐篇摘要

### 2.1 Frame / 结构件族（6 篇）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Frame | Part Studios > Feature Tools > Frame | /Content/PartStudio/frame.htm | 沿一条路径（草图曲线、草图/零件顶点、零件边或面）端到端扫掠共享截面，生成一个或多个框架体；支持截面库、角度/角度参考、Miter/Butt/Coped Butt/None 角型与逐角覆盖、锁定截面面、合并相切段、限制起止端。 |
| Onshape Frame Profiles Library | Part Studios > Feature Tools > Frame > Onshape Frame Profiles Library | /Content/Library/onshape_frame_profiles_library.htm | Onshape 官方维护的框架型材库目录：ISO、ANSI、8020（10–45 Series）、AS（冷弯空心型材/热轧结构钢）、AISC（C/HP/L/M/MC/MT/pipe/矩形/圆/方/S/ST/W/WT）、木材（Lumber Inch、Timber Metric）及各自尺寸清单。 |
| Frame Trim | Part Studios > Feature Tools > Frame Trim | /Content/PartStudio/frame_trim.htm | 按 “Ordered groups”（默认，用一组段修剪另一组）或 “Face”（修剪到面/平面/显式或隐式 mate connector，可选反向与 Trim to face boundaries）修剪框架段。 |
| Gusset | Part Studios > Feature Tools > Gusset | /Content/PartStudio/gusset.htm | 在相邻框架段切口的线性边上生成 Triangle/Rectangle 角撑板，指定沿边长度、跨框宽厚度、居中或对齐定位、可选偏移；结果是独立零件。 |
| End cap | Part Studios > Feature Tools > End cap | /Content/PartStudio/end_cap.htm | 为框架段端面加端盖，截面类型 Match profile/Rectangle/Circle/Internal，指定厚度与偏移（均可反向），矩形需角处理，Internal 需相对端面偏移。 |
| Cut List | Part Studios > Feature Tools > Cut List | /Content/PartStudio/cut_list.htm | 从选定框架段（或 Select all frames）创建开放复合零件并生成右侧 Cut list 表（Item/Qty/Length/Angle 1/Angle 2 等），支持列覆盖、列移动/隐藏/复制；建议装配体插入复合零件而非单段。 |

### 2.2 Sheet Metal 钣金族（15 篇）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Sheet Metal Model | Part Studios > Feature Tools > Sheet Metal Model | /Content/PartStudio/sheet_metal_model.htm | 以 Convert（包络实体/曲面）、Extrude（草图为壁，弧可成折弯）或 Thicken（面/曲面/草图区域加厚）创建钣金模型；同步生成展开图与折弯/接缝表；定义厚度、内折弯半径、材料/折弯计算（K Factor/Bend allowance/Bend deduction）、角释放、折弯释放与最小间隙；Finish sheet metal model 停用钣金行为。 |
| Sheet Metal Flange | Part Studios > Feature Tools > Sheet Metal Flange | /Content/PartStudio/sheet_metal_flange.htm | 沿所选边或侧面生成以折弯连接的壁（翻边）；对齐 Inner/Outer/Middle/Hold line，端型 Blind/Up to entity/Up to entity with offset，角度控制 Bend angle/Align to geometry/Angle from direction，自动斜接、模型或自定义折弯半径、部分翻边与双边界。 |
| Sheet Metal Hem | Part Studios > Feature Tools > Sheet Metal Hem | /Content/PartStudio/sheet_metal_hem.htm | 在既有钣金上沿边/侧面生成 Straight、Rolled、Teardrop 三种卷边；控制 Flattened/内半径/总长/卷角（>180°）、最小间隙或 Gap、Outer/In place 对齐与 Simple/Closed 角型；参数跨会话跨文档记忆。 |
| Sheet Metal Tab | Part Studios > Feature Tools > Sheet Metal Tab | /Content/PartStudio/sheet_metal_tab.htm | 用与翻边平行的草图轮廓在翻边上加 tab，可同时选择多个草图/多个翻边；用 Subtraction scope 去除干涉材料（可含普通零件）并可设偏移；可桥接两个同模型翻边；结果反映在展开图。 |
| Sheet Metal Bend | Part Studios > Feature Tools > Sheet Metal Bend | /Content/PartStudio/sheet_metal_bend.htm | 沿任意参考线/边（可不在草图、可跨多个切口）折弯单张钣金面；六种 Bend alignment（Bend line/Hold line/Hold other line/Inner/Outer/Middle）、角度控制（1–359°）、模型或自定义半径、模型或自定义 K factor；不改变展开图尺寸。 |
| Sheet Metal Jog | Part Studios > Feature Tools > Sheet Metal Jog | /Content/PartStudio/sheet_metal_jog.htm | 沿参考线以两个反向折弯形成 S/Z 形台阶；除 Bend alignment 与角度控制（方向角 1–180°）外，新增 Bounding type（Blind/Up to entity/Thickness 因子）、Jog offset anchor（Inside/Nominal/Outside）与 Preserve material；用于齐平接缝、垫圈、套筒插片等。 |
| Sheet Metal Form | Part Studios > Feature Tools > Sheet Metal Form | /Content/PartStudio/sheet_metal_form.htm | 把 Form（Tag 过的零件模板）以草图点或 mate connector 放置到钣金目标面，可反向；Form 可来自当前文档/其他文档/库；并规定 Form 库的创建、更新、版本化与表单几何限制。 |
| Onshape Sheet Metal Forms Library | Part Studios > Feature Tools > Sheet Metal Form > Onshape Sheet Metal Forms Library | /Content/Library/sheet_metal_form_library.htm | Onshape 官方钣金 Form 库内容清单：Bridge lance、Circle emboss、Circle extrusion、Circle knockout、Countersink、Lance、Louver、Slot emboss、Slot extrusion 及各自变量。 |
| Sheet Metal Loft | Part Studios > Feature Tools > Sheet Metal Loft | /Content/PartStudio/sheet_metal_loft.htm | 在两个轮廓（区域/面/边/点）之间生成保持钣金行为并可展开的过渡体；New 定义新钣金（带 General/Material/Relief 参数），Add 合并到既有模型并继承参数；Connections/Match connections、Rip、Chordal tolerance、Merge scope。 |
| Sheet Metal Make Joint | Part Studios > Feature Tools > Sheet Metal Make Joint | /Content/PartStudio/sheet_metal_make_joint.htm | 选两处相交壁的边/侧面，建立 Bend（圆柱几何）或 Rip（Edge joint / Butt joint Direction 1 / Direction 2，后者仅 90°），并写入折弯/接缝表；可在表中把 rip 转成 bend。 |
| Sheet Metal Corner | Part Studios > Feature Tools > Sheet Metal Corner | /Content/PartStudio/sheet_metal_corner.htm | 选角部边/顶点/面，逐个角修改角释放类型（Square-Sized、Rectangle-Scaled、Round-Sized、Round-Scaled、Closed、Simple）与尺寸/比例；一次只能处理一个角，每个角一个特征。 |
| Sheet Metal Bend Relief | Part Studios > Feature Tools > Sheet Metal Bend Relief | /Content/PartStudio/sheet_metal_bend_relief.htm | 选折弯端的面/顶点/边，改折弯释放形状（Square-Sized、Rectangle-Scaled、Obround-Sized、Obround-Scaled、Tear）并设尺寸或深度/宽度比例；可用 Extend bend relief 反向延长到钣金末端以避让翻边碰撞。 |
| Sheet Metal Modify Joint | Part Studios > Feature Tools > Sheet Metal Modify Joint | /Content/PartStudio/sheet_metal_joint.htm | 在 Sheet metal table 中编辑折弯/接缝会自动生成 Modify joint 特征；可在特征列表右键编辑，改 Entity 与 Joint type（Bend/Rip/Tangent）、Rip edge type、Use model K Factor 及自定义折弯计算。 |
| Sheet Metal Corner Break | Part Studios > Feature Tools > Sheet Metal Corner Break | /Content/PartStudio/sheet_metal_corner_break.htm | 对钣金角（含折弯释放切出的角）施加 Fillet 或 Chamfer；Fillet 支持 Radius/Width、Distance/Conic/Curvature、Rho/Magnitude、Asymmetric 第二半径、Allow edge overflow；Chamfer 支持 Offset/Tangent、Equal/Two distances/Distance and angle、Direction overrides；建议作为最后特征。 |
| Sheet Metal Table and Flat View | Part Studios > Feature Tools > Sheet Metal Table and Flat View | /Content/PartStudio/sheet_metal_table.htm | 右侧面板同时显示 Rip/Bend 表与展开图：表格行与图形交叉高亮、右键 Move up/down 与 Convert to rip/bend、行尾下拉改 rip 接头类型、双击改半径或 K Factor/BA/BD；可在展开图上新建草图并“精简 Extrude”，可导出 DXF/DWG（含范围与多项导出参数）。 |

### 2.3 Flex PCB 族（2 篇）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Flex PCB Model | Part Studios > Feature Tools > Flex PCB Model | /Content/PartStudio/flex_pcb_model.htm | 以 Convert/Extrude/Thicken 创建柔性 PCB 零件，自动生成展开图与折弯/接缝表；参数与钣金模型类似但 K Factor 默认为 Part Studio 0、PCB Studio 0.5；Finish 后接 rigid-flex PCB → IDX 导出流程。 |
| Finish Flex PCB Model | Part Studios > Feature Tools > Finish Flex PCB Model | /Content/PartStudio/finish_flex_pcb_model.htm | 停用所选 Flex PCB 模型并转作普通零件处理；选择 Unfold all/selected/none 与保持固定的壁面或边界边，选 PCB 零件后完成；后续模型更改不再影响展开图/表，且完成操作会删除 Sheet metal model and flat view 面板中的展开图。 |

---

## 3. 核心概念与术语

### 3.1 钣金对象模型

- **Sheet metal model（钣金模型）**：一个可“激活/停用”的模型状态。激活时所有操作自动同步表示到 **flat pattern（展开图）**，折弯与接缝列入 **sheet metal table（钣金表，Rip/Bend 表）**；折弯（folded）、展开（flat）、表格（table）三种视图**同时、实时**更新。一个模型可含多个零件，且**可同时有多个激活的钣金模型**。
- **Finish sheet metal model**：关闭/停用钣金特征，在 Feature list 生成同名特征；停用后特征按普通 3D 零件作用，且**不影响展开图与表值**。
- **Bend（折弯）**：以圆柱几何连接两壁；有内半径（inside radius/bend radius）、角度、K 因子等。
- **Rip（接缝/撕口）**：两壁之间的小间隙，由 **Minimal gap** 控制；分 **Edge joint**（两边在内边相接）与 **Butt joint - Direction 1/2**（外边相接；仅 90° 接头可 Butt，非 90° 必须 Edge joint）。
- **Tangent joint（相切接缝）**：当弧/样条用于卷壁（rolled wall）而未声明为折弯时，表中不出现折弯，而出现 tangent joint；展开图也不画折弯线。
- **Joint（接头）**：两壁相交处的关系总称，可为 Bend、Rip、Tangent；可由 Make joint 建立、Modify joint / 表编辑修改。
- **Corner relief（角释放）**：角部的开口形状与尺寸，六型：Square-Sized、Rectangle-Scaled、Round-Sized、Round-Scaled、Closed、Simple。
- **Bend relief（折弯释放）**：折弯端与自由边相交处的小切口；形状 Rectangle-Scaled、Obround-Scaled、Obround-Sized、Square-Sized、Tear；有深度（绝对值或比例）与宽度比例。
- **Bend calculation（折弯计算）**：三选一——**K Factor**（默认；中性轴相对材料厚度的比例）、**Bend allowance**（折弯两切点间中性线弧长）、**Bend deduction**（各翻边长度之和与初始展开长度之差）。所选类型作为钣金表的一列。
- **Default bend K Factor**：折弯中性轴占厚度比例，**默认 0.45**；**Rolled K Factor** 用于卷壁段，**默认 0.5**。
- **Clearance from input**：钣金相对被包络零件的偏置；**Include bends**（Convert）或 **Clearance includes bends**（Thicken）决定释放值是否包含折弯。
- **Minimal gap**：定义 rip 的钣金边之间的最小间隙，也是某些 Hem/End cap 的间隙依据。
- **Flip direction up**：反转钣金模型与展开图方向，用于定义折弯向上/向下。
- **Keep input parts**（Convert）：保留被钣金包络的原始零件。
- **Tangent propagation**（Thicken）：沿相切边继续加厚。
- **Preserve material**（Jog，默认勾选）：不因 Jog 额外添加材料；取消则补料以保持 Jog 前原长。
- **Jog offset anchor**：Inside / Nominal（亦称 Overall dimension）/ Outside。
- **Corner break**：对角边/顶点施加 Fillet 或 Chamfer，可用在成形或展平状态，也可作用于 Bend relief 切出的边/顶点。
- **Form**：由带 `thickness` 配置变量（Type=Length）且被 Tag 的零件模板定义、带 **Add part（蓝）**与 **Subtract part（灰）**的成形特征；由 Form origin mate connector（如 Mate connector 1）决定原点。
- **Tag**：给草图实体（Frame）或零件（Form/钣金增减材）打标签以定义用途、方向与属性。

### 3.2 框架对象模型

- **Frame（框架）**：共享同一 **profile（截面）**、沿 **path（路径）** 端到端排列的一组扫掠体；默认**居中**于路径。
- **Profile sketch**：定义框架截面；必须位于**另一个 Part Studio**（可与路径同文档），并支持公司/个人 **frame profile library** 与 Onshape 官方库。
- **Path**：草图曲线、草图或零件的顶点、零件的面或边；必须**连续选择**。
- **Corner type**：Miter（斜接）、Butt（对接，可翻转方向）、Coped Butt（仿形对接，可翻转）、None（开放不处理）。
- **Corner override**：对个别角覆盖默认角型。
- **Limit frame ends**：把起始段或结束段修剪到平面/面/零件。
- **Merge tangent segments**（默认勾选）：把彼此相切的段合并为**复合零件**；取消则每段为独立零件。
- **Lock profile faces / Faces to lock**：使框架路径垂直于非线性面（示例为机身内侧扭转面）。
- **Cut list**：由选定段生成**开放复合零件**+属性表；Item/Qty/Length/Angle 1/Angle 2 为不可覆盖列。
- **Gusset / End cap**：分别生成角撑板与端盖；Gusset 在 Parts list 中为独立零件。
- **Frame profile library**：Documents 页中的特殊文件夹；公司库须在根文件夹创建，经 Share（Companies 页，勾 Link document 与 Share）给全公司；个人库无需特殊权限。文件夹层级与命名映射到 Select sketch 对话框的 Standard/Type/Profile 字段。

---

## 4. 功能与 UI 明细

### 4.0 平台差异汇总（仅列文档明确写出的）

| 主题/工具 | 平台差异（原文口径） |
|---|---|
| Frame、Onshape Frame Profiles Library | iOS/Android 仅支持选择、编辑并应用**由桌面（浏览器）平台创建的库中 forms（原文如此；结合上下文应指型材截面）**。 |
| Sheet Metal Bend、Sheet Metal Jog、Sheet Metal Loft | iOS/Android 仅支持**查看与编辑桌面（浏览器）平台创建**的 bend/jog/loft。 |
| Sheet Metal Form、Onshape Sheet Metal Forms Library | iOS/Android 仅支持选择、编辑并应用**由桌面平台创建的库中 forms**。 |
| Sheet Metal Model、Flange、Hem、Tab、Make Joint、Corner、Bend Relief、Modify Joint、Corner Break、Table and Flat View、Frame Trim、Gusset、End cap、Cut List、Flex PCB Model、Finish Flex PCB Model | **文档未说明**平台差异。 |

企业/权限边界：Frame profile library 与 Sheet metal form library 均支持“公司/企业库（根文件夹、管理员所有并共享）+ 个人库”，**没有**“仅企业版可用”的功能级限制表述；其余工具无企业版/许可限制说明。

### 4.1 Sheet Metal Model（钣金模型；含 Finish sheet metal model）

**位置/平台**：Part Studio 特征工具栏。**无平台差异声明**（iOS/Android 支持情况**文档未说明**）。

**通用行为**
- 三种操作：**Convert / Extrude / Thicken**（对话框内选择）。
- 接受后 Sheet metal model 列入 Feature list；随后应立即施加其他钣金特征；点 **Finish sheet metal model** 生成停用特征，之后可加非钣金特征。
- 激活时可加的普通特征仅为子集（文档举例：**Extrude > Remove、Move face、Boolean、Hole**）；**Extrude 的 Add / Intersect 在 Finish 之前不允许**。激活时穿孔特征**始终垂直于壁**；停用后则受特征与壁的夹角影响。停用后的特征**不影响展开图与表值**。
- 支持由**绕单一轴旋转的圆锥件**创建钣金。

**Convert（默认操作）**
- 选择：要包络的零件与曲面；**Faces to exclude**；**Edges or cylinders to bend**——未选边变为 rip，**未选的弧/样条变为 tangent joint 而非折弯**。
- 选项：**Clearance from input**、**Include bends**（折弯是否计入 clearance）、**Keep input parts**、**Thickness**（带反向箭头）、**Bend radius**（内半径）、**Flip direction up**、Material 与 Relief 下拉。

**Extrude**
- 选择：要拉伸的草图曲线；**Arcs to extrude as bends**（被选弧变为折弯并在折弯表中列出，半径**灰显不可改**，因为半径来自草图）。
- **End type**：Blind、Up to next、Up to face、Up to part、Up to vertex；方向箭头；深度数值或拖拽。
- **Symmetric**：正文称 “available only for Blind and Through all end types”，步骤称 “available for Blind end types only”（**不一致**，原文照录）；效果为以草图面为中心两侧各半。
- **Second end position**：单独指定另一端位置/深度（与 Symmetric 互斥）。
- 其余参数同上（Thickness/Bend radius/Flip direction up/Bend calculation/K Factor/Minimal gap/Corner relief/Bend relief）。

**Thicken**
- 选择：草图区域、平面曲面或零件面；**Tangent propagation**；**Edges or cylinders to bend**（未选边成 rip，弧/样条成 tangent joint）。
- 选项：**Clearance from input**、**Clearance includes bends**、**Thickness**、**Bend radius**、**Flip direction up**、折弯计算/K 因子/最小间隙/角释放/折弯释放。

**Material 组**
- **Bend calculation**：K Factor（默认）/ Bend allowance / Bend deduction；该选择成为钣金表一列，且**每个折弯可在表中单独定制并直接编辑**。
- **Default bend K Factor = 0.45**；**Rolled K Factor = 0.5**。

**Relief 组**
- **Minimal gap**。
- **Corner relief type**：Square-Sized、Rectangle-Scaled、Round-Sized、Round-Scaled、Closed、Simple（语料每型都有 flat/3D 两张图，仅 alt）。
- **Corner relief scale**：1.00–2.00（Scaled）；**Corner relief width**：Sized 的开口宽度（默认单位或指定单位）。
- **Bend relief type**：Rectangle-Scaled、Obround-Scaled、Tear。
- **Bend relief depth scale**：**1.00–5.00**（Convert 正文；Extrude 步骤又写 1.00–2.00，**不一致**）；输入后成为**所有文档的默认**；值 1 时 obround 恰触折弯、矩形与 obround 同深；超过 1 的增量公式 **((depth scale − 1) × bendRadius)**。
- **Bend relief width scale**：0.0625–2.00，宽度公式 **thickness × width scale**；输入后成为所有文档默认。

**卷壁（rolled wall）规则**
- 弧/样条定义卷壁时：表中**不列折弯**，而列 **tangent joint**；展开图**不画折弯线**。
- 若把弧选入 “Arcs to extrude as bends / Arcs to extrude as bends”，则该弧成为折弯，表中半径灰显不可编辑。

**其他规则（同页）**
- 选中钣金边做 Fillet/Chamfer 必须点在**真正的角点**，不能选相邻边；**高级 Fillet/Chamfer（如 conic fillet）此时不可用于钣金**（与 Corner break 的 Conic 是两套入口，注意区分）。Onshape **保留原始构造边**用于后续特征：在已圆角边上建 Flange 会忽略圆角、沿原边生成，可用 Move face 把翻边边移回圆角边。
- 可用 **Linear/Circular/Curve pattern 的 Face 参数**阵列钣金面与翻边，也可镜像钣金面/翻边（选用 Face/面）。
- 页末 “Additional sheet metal tools” 列出 14 项（本报告 4.3 汇总）。

### 4.2 Frame（框架）

**位置/平台**：Part Studio。**iOS/Android 仅支持选择、编辑并应用由桌面（浏览器）平台创建的库中的 forms**（原文如此；疑为模板句复制，按上下文应指覆盖型材截面；本组库页同句）。`[推断]`

**前置条件（硬规则）**
- 需要 **Profile sketch**（截面）与 **path sketch**（路径）；两者必须在**不同的 Part Studio**（可在同一文档，也可在任意有权限文档）。
- **Frame 工具必须部署在含 path 的 Part Studio**。
- 外部文档的 profile **必须已存在于某个 version**；无 version 时提示创建。

**对话框与步骤**
1. **Sketch profile** 字段 → 打开 **Select sketch** 对话框，位置三选：
   - **Current document**：从列出的 Part Studio 选；
   - **Other documents**：选有权限的文档（须有 version）；
   - **Libraries**：按标准选择（详见 4.2.1）；可用搜索栏。
   选择 **Standard、Type、Size、Configuration**；若改 Size/Configuration，须点 **Generate**；完成后 **Done**。
2. **Selections**：在图形区选路径；路径可为草图曲线、草图/零件顶点、零件面或边；**必须连续**；也可选零件面以其边代替草图。
3. **对齐**：默认**居中**；段上出现一组对齐点，可选外下边等；**Tag profile 工具**可追加对齐点。
4. **Lock profile faces** + **Faces to lock**：用于非线性面（机身内侧扭转）。
5. **Merge tangent segments**：默认勾选 → 相切段合成**复合零件**；取消 → 各自独立零件。
6. **角度**：输入角度或用操纵子；**Angle reference** 可改参考（默认法平面）；方向箭头翻转；视频转录另称 “Click the arrow to mirror across the Y axis”。
7. **Default corner type**：Miter / Butt / Coped Butt / None；Butt 与 Coped Butt 出现箭头可翻转。
8. **Corner override**：选一个或多个角，指定不同角型（示例中左下角被覆盖，可翻转 butt 方向）。
9. **Limit frame ends**：把起始段或结束段修剪到平面、面或零件（可选其一）。
10. 绿色对勾接受；Frame 列入 Feature list。

**4.2.1 Frame profile libraries（截面库）**
- 每公司一个库（管理员所有并共享给公司）；每人一个个人库。库是 Onshape **文件夹**。
- 层级/字段映射（原文）：
  - 根文件夹下建第一层；可选第二层嵌套文件夹，其名用于 **Standard** 字段；
  - 可选第三层，其名用于 **Type** 字段；
  - 若只有两层，第二层名用于 **Type**；
  - 草图所在 **Part Studio 名**用于 **Profile** 字段；
  - ≤3 层时文件夹**自动**依次标注 Standard、Type、Profile；>3 层时**所有**文件夹都必须有 Library label，否则更新库时报错（“Failed to update the library” 图示）。
- 公司库共享：根文件夹 Share 图标 → **Companies** 页 → 勾 **Link document** 与 **Share** → Share → Close。
- 作者流程：最底层文件夹 **Create > Document** → Part Studio 中只建**一个**草图截面（**多个草图会导致更新库失败**）→ **Create version**（名称+可选描述）→ Documents 页右键文件夹：首次 **Set library > My frame profiles**（文件夹图标变为库图标）；已设则 **Frame profile library > Update my library**。
- 更新：修改库内剖面的文档后必须 **Update my library**，新变更才会传播到引用该 library 的 Frame 特征。
- 取消：右键 **Frame profile library > Unset my library**，只取消库身份，不删文件夹/内容。
- 超过 3 层：在目标层下 Create Folder → 文件夹 **Properties** 面板填 **Library label** → Apply → 放入至少一个截面文档（最后一层必须至少一个）→ 回根文件夹 Update my library → Select sketch 出现第四层。
- Notes 补充：企业库 Library label 继承自 Onshape Document 与 Onshape Folder Categories，若类别被移除则字段不可见/不可用，可用 “Find and add parent categories” 加回；**同一文档中多个 Frame（各在自己的 Part Studio）时，文档本身也必须有 Library label**；最多 **10 个主文件夹层（含根）**，可从任一主层分支，子分支每支可再深 10 层。
- Tips：库文件夹**不能直接删除**，先 Unset；库文件夹的共享权限**不能直接编辑**，先 Unset。

### 4.3 钣金附加工具汇总（每个钣金页尾重复的清单）

激活钣金模型期间可用：
- **Flange**：为每条所选边生成以折弯连接的壁。
- **Hem**：为所选边/面生成卷边。
- **Tab**：在钣金翻边上加 tab。
- **Bend**：沿参考线折弯，附折弯控制。
- **Jog**：沿参考线两个反向折弯形成 S/Z 台阶。
- **Form**：在既有钣金模型上创建成形特征，可从当前文档/其他文档/预定义库选。
- **Loft**：连接两个轮廓生成钣金模型。
- **Make joint**：把两壁相交转为 bend 或 rip。
- **Corner**：修改角型与释放比例。
- **Bend relief**：修改折弯释放形状/深度/宽度。
- **Modify joint**：改既有接头（如 bend→rip），**当前通过 flat view 表进入**。
- **Corner break**：对角边/顶点施加 fillet/chamfer；建议在所有翻边与接头定稿后使用。
- **Sheet metal table and flat view**：开/关 Rip/Bend 表与展开图，可在表中互转 rip/bend。
- **Finish sheet metal model**：关闭/停用钣金模型并在 Feature list 建特征。

### 4.4 Sheet Metal Flange（翻边/法兰）

- **选择**：要翻边的 **Edges or side faces**。
- **Flange alignment**：**Inner**（翻边内壁对齐侧唇内边）、**Outer**（外壁对齐外边）、**Middle**（中面对齐内/外边理论中线）、**Hold line**（折弯对齐所选边/面）。
- **End type**：
  - **Blind**：翻边距离从**基面与翻边外边交点**量到翻边尖端（Distance 字段）；
  - **Up to entity**：到所选边/面/平面；
  - **Up to entity with offset**：再加 **Offset value**。
- **角度控制**：
  - **Bend angle**：相对起翻边的边给角度；
  - **Align to geometry**：翻边平行于所选几何（**Parallel to**：边/面/平面）；
  - **Angle from direction**：**Direction**（边/面/平面）+ **Angle 1–359°**；**Opposite side** 箭头切换方向。
- **Overall**：
  - **Automatic miter** 默认勾选（自动修剪/延伸相交翻边形成斜接）；取消后可填 **Miter angle**；
  - **Use model bend radius** 默认勾选（用模型内半径）；取消后填 **Bend radius**。
- **Partial flange**（部分翻边）：
  - 沿翻边边偏移，数值或操纵子；**Chain type：Per edge / Per chain**；**Flip sides** 箭头；
  - **Hold adjacent edges** 默认勾选（翻边边保持全长）；取消则限制为部分翻边长度；
  - **End Conditions**：Blind（Distance）/ Up to entity / Up to entity with offset（+ Offset value）；
  - **Second bound**：为次方向设置第二边界，选项与主边界相同。
- 接受后 Flange 列入 Feature list；修改用 **Move face** 等 Direct Edit。
- **无显式平台差异声明**。

### 4.5 Sheet Metal Hem（卷边）

- **选择**：边或侧面；**Flip** 箭头翻方向。
- **三种 Hem type**：
  1. **Straight**：沿板料；**Flattened** 勾选→平贴板料，用模型 **Minimal gap** 作为间隙；取消→填 **Inner radius**；**Total length**（从卷边最外边到末端）。
  2. **Rolled**：卷过边；**Inner radius**；**Angle** > 180°（示例 270°、200°）。
  3. **Teardrop**：水滴形；**Inner radius**；**Use minimal gap**（用模型 Minimal gap）或取消后填 **Gap**；**Total length**。
- **通用**：**Hem alignment = Outer / In place**；**Corner type = Simple**（展开为直线）/ **Closed**（尽量闭合以便焊接，展开几何更复杂）。
- 接受后 Hem 列入 Feature list；**所有对话框选项默认沿用上次值，跨会话、跨文档**。
- 展开时**卷边列入折弯表**（含半径与角度），**可上下移动但不能在表中编辑**。

### 4.6 Sheet Metal Tab

- **选择**：与目标翻边**平行**的草图（可多选草图）；**Flange to merge** 字段可选**任意多个与该草图平行的翻边**。
- **Subtraction scope**：用于去除干涉材料；示例：一个草图跨两个翻边——先自动选中两翻边，在 Flanges to merge 中去掉用于减材的翻边，再到 Subtraction scope 中重新选它；可填 **offset** 增大 tab 与翻边间隙（示例最小默认 **0.05**）；**普通零件也可作为 Subtraction scope**。
- **桥接**：同一草图跨两翻边时，把两翻边都选为 Flange to merge。
- 结果同时反映在模型与展开图。

### 4.7 Sheet Metal Bend

- **平台**：iOS/Android **仅查看与编辑桌面创建的折弯**。
- **选择**：**Bend line**（线或边）；**只折一个钣金面**（多折弯需多个特征）。
- **Hold opposite side** 箭头：翻转被折一侧。
- **Bend line 规则（Notes）**：不一定是折弯实际发生线；**不必与所选面重合**（会投影到面）；**不必切穿整面**（会延伸到面边）；**不必属于任何草图**；**可沿同一面的多个切口延伸**；多数情况可为任意角度，复杂参考几何的个别情形会报错。
- **Bend alignment 6 种**：
  - 展开图相对：**Bend line**（折弯线对中）、**Hold line**（折弯线对折弯起点）、**Hold other line**（对折弯终点）；
  - 折叠视图相对：**Inner**（弯后内表面对折弯线）、**Outer**（外表面对折弯线）、**Middle**（中面对折弯线）。
- **角度控制**：
  - **Bend angle**：1–359°，**Opposite angle** 可翻转；
  - **Align to geometry**：**Parallel to** 边/面/平面；
  - **Align from direction**：**Direction**（边/面/平面）+ **Angle 1–359°**。
- **Use model bend radius** 勾选默认；取消后填 **Bend radius**。
- **Use model K factor** 勾选默认；取消后填自定义 **K Factor**。
- **规则/禁忌**：
  - **自定义 K factor 只改 3D 中折弯金属的有效长度**；
  - **Bend allowance / Bend deduction 不能在 Bend 对话框中改**——到 Sheet metal model 特征改，或在 **Sheet metal table and flat view** 双击单元格改；
  - **折弯不得与特征列表中既有 Bend 或 Corner 特征干涉**，否则钣金模型冲突并报错；**但可在 flange 与 hem 面内创建折弯**。
- 修改 Bend 用 **Move face** 等 Direct Edit。

### 4.8 Sheet Metal Jog

- **平台**：iOS/Android **仅查看与编辑桌面创建的 jog**。
- **定义**：在参考线处用两个反向折弯偏移板料，结果呈 **S 或 Z 形**；常用于两块板料齐平接缝，可沿边、面或钣金上特定位置放置。
- **选择/步骤**：Bend line；**一个面/特征**；**Hold opposite side**；**Bend alignment** 六种同 Bend。
- **角度控制**：
  - Bend angle 1–359° + Opposite angle；
  - Align to geometry（Parallel to）；
  - Align from direction（Direction；**Angle 1–180°**——注意与 Bend 的 1–359° 不同）。
- **Use model bend radius / Use model K factor** 与 Bend 相同。
- **Bounding type**：
  - **Blind**：用 **Jog offset** 指定距离；
  - **Up to entity**：到指定实体；可勾 **Offset distance** 再偏移；
  - **Thickness**：按模型 Thickness 的**倍数**偏移（示例：Thickness 0.5 cm × factor 4 = 2 cm）。
- **Jog offset anchor**：**Inside**（顶面到 jog 内平行面的最短距离）、**Nominal**（底面到 jog 外面，亦称 **Overall dimension**）、**Outside**（顶面到 jog 外平行面）。
- **Preserve material**（默认勾选）：不额外加料；取消则补料以维持 Jog 前原长。
- **规则**：Bend line 规则、干涉规则、K factor 仅 3D、BA/BD 别处编辑同 Bend；**勾选 Preserve material 时 Jog 不改变展开图尺寸**。
- 修改用 **Move face**。示例：Overlap（jog 放端部中点，Offset 0.01 cm 防碰撞，再用 Move face 把对面板端移到 jog 边下）、圆形钣金 jog（垫圈）、金属外壳套筒插片。

### 4.9 Sheet Metal Form

- **平台**：iOS/Android **仅支持选择、编辑并应用桌面创建的库中 forms**。
- **来源**：**Select Part Studio** 对话框 → **Current document / Other documents / Libraries**（Onshape 钣金 forms 库、用户库、企业/公司库）；选 **Library、Type（文档）、Form（Part Studio）**；有搜索栏；**文档中仅 1 个 Part Studio 且仅 1 个 form 时，Type 字段不显示**。
- **配置变量**：如 Bridge lance 的 **Length、Width、Height、Angle** 会作为输入显示。
- **放置**：**Location(s)** 选草图顶点、点或显式 mate connector；点 mate connector 图标后悬停可选**隐式 mate connector**；**Target face(s)** 选目标面；**反向箭头**把 form 翻到目标面另一侧。
- **硬限制（Notes）**：
  - Forms **不得触及或切入侧壁、卷壁、rip、joint、corner 的边界**；
  - 要让自定义 Form 草图显示在展开图与展开图工程图视图上，该草图**只能由构造几何组成**；
  - **Corner break 不作用于任何 form 特征边**，建议在制作自定义 form 时建出圆角；
  - DXF/DWG 导出展开图时可**包含/排除 form 外轮廓与中心标记**；
  - 工程图插入 flat pattern 会同时带入 form outline 与 centermarks；
  - 切换 Features list 中 Form 特征可见性会同步切换展开图上关联草图的可见性。
- **Form 库管理**：
  - 企业/公司库须在根文件夹，共享给 **All Enterprise/Company Users** team（Teams 页、勾 Link document 与 Share）；个人库无需特殊权限；Onshape 提供官方库。
  - Form 不必须在库中；任意 Part Studio 的零件都可用，只要满足：
    1. 所在 Part Studio 有配置变量名为 **thickness**，**Type = Length**（其 FeatureScript ID 用于把 form 厚度绑定到钣金模型 Thickness）；
    2. form 零件**被 Tag**；且**每个 Part Studio 只能有 1 个有效 form tag、1 个 form**。
  - 外部引用需 **Create version**。
  - 层级：≤2 层文件夹自动标注 **Type、Form**；>3 层全部要有 Library label；最后一层至少 1 个 form 文档；最多 10 个主层（含根），可分支且每支再深 10 层；文档中存在多个 Forms（各自 Part Studio）时文档本身也要 Library label。
  - **更新模型引用的旧 form**：库更新后既有模型仍用旧 form；打开该模型 → 双击 Form 特征 → 点 Form Part Studio 字段 → 若显示 **“(previous version)”** 与通用缩略图，说明是旧版 → 在 Form 下拉选新 form → Done。
  - 取消/删除/权限：Unset my library 后文件夹才可删、共享权限才可改。

### 4.10 Onshape Sheet Metal Forms Library（官方 Forms）

官方库内容（变量照录）：
- **Bridge lance**：Length、Width、Height、Angle；Radius control = **Double thickness / Thickness / Half thickness / Custom**（Custom 时再填 Internal radius、External radius）。
- **Circle emboss**：Diameter、Height、Angle；Radius control 同上（Custom 加内/外半径）。
- **Circle extrusion**：Diameter、Depth、Radius。
- **Circle knockout**：Diameter。
- **Countersink**：Clearance hole、Angle。
- **Lance**：Profile = **Flat / Straight**、Length of flat、Width、Height、Angle；Radius control 同上。
- **Louver**：Height、Length、Width；Radius control 同上（Custom 时加一个 Radius）。
- **Slot emboss**：Length、**Length to Slot centers / Slot tangents**、Width、Height、Angle；Radius control 同上。
- **Slot extrusion**：Length、Length to Slot centers / Slot tangents、Width、Depth；Radius control 同上（Custom 加 Radius）。

### 4.11 Sheet Metal Loft

- **平台**：iOS/Android **仅查看与编辑桌面创建的 loft**。
- **模式**：**New**（新建钣金零件，Material/Relief 等参数在本特征定义）或 **Add**（并入既有钣金模型，**参数继承原模型**）。
- **Profile 1 / Profile 2**：可选区域、面、边或**点**；Onshape 在两者之间创建钣金模型。
- **Connections**：勾选后可控制扭转；**Match connections** 选轮廓顶点或边；未指定时按**邻近度估计**；拖操纵子调整连接。
- **Rip**：在连接处分开成独立零件，确保可正确展开。
- **Chordal tolerance**：细分几何相对真实曲面的最大偏差；**值越小越接近真实形状、精度越高**。
- **New 时 General/Material/Relief**：Thickness（反向箭头）、Bend radius、Flip direction up；Bend calculation（K Factor 默认 / Bend allowance / Bend deduction）、Default bend K Factor 0.45、Rolled K Factor 0.5；Minimal gap、六种 Corner relief、Corner relief scale 1.00–2.00、Bend relief type（Rectangle-Scaled/Obround-Scaled/Tear）、**Bend relief depth scale 1.00–5.00**（输入后跨文档默认；公式 (depth scale−1)×bendRadius）、Bend relief width scale 0.0625–2.00（宽度=thickness×width scale，跨文档默认）。
- **Add 时 Merge scope**：只能接受**单一激活钣金模型**的 body。
- 打开 **Sheet metal table and flat view** 查看展开图。

### 4.12 Sheet Metal Make Joint

- **选择**：相交壁的边或侧面；**必须恰好两次选择**（两边、两面、或一面+一边）。
- **Joint type**：
  - **Bend**：在两面/边之间建带中心线与半径的曲线；**Use model bend radius** 默认，取消可填新半径。
  - **Rip**（建立两钣金边之间的关联；用模型 **Minimal gap** 作间隙）：
    - **Edge joint**：两边在**内边**相接；
    - **Butt joint - Direction 1**：外边相接；**仅 90° 接头可用**；
    - **Butt joint - Direction 2**：同 D1，但所选面/边**左右手性翻转**。
- 接受后写入 Bend/Rip 表；**在 Sheet metal table and flat view 中可把 rip 转为 bend**。

### 4.13 Sheet Metal Corner

- **选择**：既有角的**边、顶点或面**；**不能多选角**，每个角需独立 Corner 特征。
- **Corner relief type**：Square-Sized、Rectangle-Scaled、Round-Sized、Round-Scaled、Closed、Simple。
- **参数**：Scaled → **Corner relief scale 1.00–2.00**；Sized → **Corner relief width**。
- 要在角顶点/边做圆角或倒角 → 用 **Corner break**。

### 4.14 Sheet Metal Bend Relief

- **选择**：折弯端的**任意面、顶点或边**。
- **Bend relief type**：Square-Sized、Rectangle-Scaled、Obround-Sized、Obround-Scaled、Tear。
- **Sized** → **Bend relief depth**（数值）；**Scaled** → **Bend relief depth scale**（页内出现 **1.00–2.00** 与步骤 **1.00–5.00** 两种写法，**不一致**）+ **Bend relief width scale 0.0625–2.00**。
- **Extend bend relief**：当翻边导致展开图碰撞时勾选，给释放**增加第二方向**并延伸到钣金末端（示例：选中折弯释放的边/点，勾选后向后延长）。
- 在折弯释放顶点/边做圆角/倒角 → **Corner break**。

### 4.15 Sheet Metal Modify Joint

- **触发**：在 **Sheet metal table** 中编辑折弯/rip/joint（例如转 bend→rip）后，自动在 Feature list 生成 **Modify joint** 特征；双击或右键 **Edit** 打开对话框。
- **对话框**：**Entity**（接头边，可改选）；**Joint type = Bend / Rip / Tangent**；
  - Bend：**Use model bend radius** 勾选或自定义半径；
  - Rip：Edge joint / Butt joint - Direction 1（仅 90°）/ Direction 2，间隙用模型 Minimal gap；
  - **Tangent**：当所选面/边之一为圆形时，可建相切边；
  - **Use model K Factor**：勾选用模型值；取消后可设 **Bend calculation = K Factor / Bend allowance / Bend deduction** 并输入自定义值；原文称 **K Factor 值范围 “-1000 to 1.00”**（照录；这在物理上可疑，但语料如此）。
- 接受后特征以 Modify joint 图标列于 Feature list。

### 4.16 Sheet Metal Corner Break

- **入口**：Corner break；**Fillet / Chamfer** 两个页签；可选**一个或多个**角边/顶点；**成形或展平状态均可选**；也可作用于 Bend relief 的边/顶点。
- **Fillet**：
  - **Measurement**：**Radius** 或 **Width**（常量宽度，两端点距离）；
  - **Control**：**Distance**（圆弧边，Onshape 记住该值用于后续新圆角）/ **Conic**（圆锥边 + 可选 **Rho**；示例 Rho 0.25 椭圆、0.5 抛物线、0.999 双曲线）/ **Curvature**（匹配邻近边曲率 + 可选 **Magnitude 0–.999** 调相切；可用 Zebra stripes 查看）；
  - **Asymmetric**：勾选后填 **Second radius**，**Flip asymmetric** 箭头切换另一端；
  - **Allow edge overflow**：**默认关闭**；勾选允许圆角修改自身面生成的边以得到光滑连续曲面；取消则保留圆角面上的边；下拉可选要保留的边；
  - 半径可用拖拽操纵子预览。
- **Chamfer**：
  - **Measurement**：**Offset**（从起始边到倒角，**依赖边的选择顺序/链**）或 **Tangent**（从两邻面切线交点到倒角，**不依赖边**）；
  - **Chamfer type**：**Equal distance** / **Two distances** / **Distance and angle**；
  - 默认角度 **45°**；Equal distance 与 Distance and angle **记住上次距离值**；Two distances / Distance and angle 可用箭头整体翻转或在 **Direction overrides** 逐边翻转。
- **顺序/限制（硬规则）**：
  - **Corner break 应作为钣金零件的最后特征**；应用后**所有接头的 Type（Rip/Bend）与 Style（Edge/Butt）在表中不可再编辑**；
  - 可作用于任何角，包括 Bend relief 切出的角；
  - **一个 Corner break 特征内不能同时加多个圆角/倒角或二者组合**；需第二个特征在已有 corner break 的边上再加。
- Onshape 记住 Measurement 类型与值、Chamfer 类型，后续打开默认沿用。

### 4.17 Sheet Metal Table and Flat View

- **打开/关闭**：右侧中部图标点击切换；面板顶部下拉选择要编辑的钣金模型；可用标题旁 caret 折叠/展开任一表。
- **表交互**：
  - 行点击选中/再点取消，可**多选**；**表 ↔ 展开图 ↔ 3D 模型交叉高亮**；在图形区选 rip/bend 会选中并滚动到对应行；
  - 右键菜单：**Move up / Move down、Convert to rip / Convert to bend**；
  - 行最右侧下拉改 **rip joint type**（注意：**只有 90° 接头可为 Butt；非 90° 必须 Edge**）；
  - **双击半径值**直接改；**双击 K Factor / Bend allowance / Bend deduction 单元格**输入自定义值；超范围单元格**标红并给有效范围 tooltip**；
  - 编辑即时更新展开图与 3D，并在 Feature list 生成/更新特征（如 bend→rip 生成 Modify joint）；
  - 表**不能改**：Hem 行可上下移动但不能在表中编辑；Corner break 之后接头 Type/Style 不可编辑；
  - 展开图方向反转：在 Sheet metal model 特征中启用 **Flip direction up**。
- **在展开图上草图/拉伸**：
  - 右键展开图 → **New sketch**，草图平面预选为展开图面；正常绘制后打勾；
  - 导出时可选择包含草图；
  - 在展开图草图上拉伸出现**精简 Extrude 对话框**，仅可**加料或减料**；
  - **不能复用 3D 模型中的 Extrude 特征**作为展开图 Extrude，否则出现 **regeneration warning**。
- **导出 DXF/DWG**：右键展开图 → **Export DXF/DWG of flat pattern**：
  - 若配置了导出规则，会出现蓝色提示，可 **View export rules**；
  - 文件名、格式 **DWG/DXF**、版本、下载选项；
  - **Scope**：**Single flat pattern part only** / **All flat pattern parts in the current model**（同一钣金模型特征生成的所有零件）/ **All flat pattern parts in the Part Studio**；
  - 导出参数：**Export splines as polylines**；**Set z-height to zero and normals to positive**；**Include or hide bend centerlines**；**Include or hide bend tangent lines**；**Include or hide counterbore and countersink lines**；**Include form feature outlines**；**Include form feature centermarks**；**Include or hide visible sketches**。

### 4.18 Flex PCB Model / Finish Flex PCB Model

**Flex PCB Model**（Part Studio）：
- 三种操作 **Convert / Extrude / Thicken**，参数与钣金模型高度同构：
  - Convert：零件/曲面、Faces to exclude、Edges or cylinders to bend（未选→rip，弧/样条→tangent joint）、Clearance from input、Include bends、Keep input parts、Thickness（**Opposite direction 箭头**翻到另一侧）、Bend radius、Flip direction up、**Default bend K Factor**；
  - Extrude：草图曲线、Arcs to extrude as bends、End type（Blind/Up to next/Up to face/Up to part/Up to vertex）+ Opposite direction、Depth、Symmetric（仅 Blind）、Second end position（同套端条件与独立深度字段，可用草图面为中性面建 **draft** 并可反向）、Thickness、Bend radius、Flip direction up、Default bend K Factor；
  - Thicken：面/草图区域、**Tangent propagation**（把 flex PCB 区域延伸到相邻边）、Edges or cylinders to bend、Clearance from input、Include bends、Thickness、Bend radius、Flip direction up、Default bend K Factor。
- **Default bend K Factor 默认值：Part Studio 标签创建的模型为 0；PCB Studio 标签创建的模型为 0.5**。
- 之后加 bend/joint/hem 等特征，再 **Finish flex PCB model**，接 “Creating a rigid-flex PCB for export to an IDX file” 流程。

**Finish Flex PCB Model**：
- **Unfold type**：**Unfold all / Unfold selected / Unfold none**；
- 选 **Wall face or bounding edge to hold**（保持固定的壁面/边界边）；
- 选要 finish 的 **PCB part**；
- **后续对 Flex PCB 模型的更改不影响展开图与表值**；
- **完成会删除 Sheet metal model and flat view 面板中的展开图**，避免装配体中导入的展开图与 flex PCB 混淆。

### 4.19 Frame Trim

- **Trim type**：
  - **Ordered groups（默认）**：先选“负责修剪”的段，点 **Frame group** 下拉展开、点 Frames 框高亮，再在同一组内追加段；折叠下拉后选第二组第一段，再展开第二组追加被修剪段。
  - **Face**：**Parts to trim**；**Face to trim to** 可为面、**平面**、**显式/隐式 mate connector**（mate connector 图标悬停可视化隐式连接器，也可选 Features list 中显式创建的）；**Opposite side** 箭头；**Trim to face boundaries 默认勾选**（修剪仅到面边界），**取消则延伸超过面边**。
- 接受后 Frame trim 列入 Feature list。

### 4.20 Gusset（框架角撑板）

- **选择**：框架段切口面上的**线性边**（可多条）。
- **类型**：**Triangle / Rectangle**。
- **Length**：沿框架边测量（数值或操纵子）。
- **Thickness**：跨框架宽度测量。
- **Position**：**Centered**（沿框架中点）或 **Aligned**（对齐某一边，在 **Alignment entity** 字段选边）；箭头翻转对齐方向。
- **Offset**（可选）：相对对齐位置的偏移（数值或操纵子）。
- **限制**：**圆管型材段之间不能加 Gusset**；**Default corner type = None 的段不能加**。
- 结果：**Gussets 作为独立零件列入 Parts list**。

### 4.21 End cap（端盖）

- **选择**：框架段**端面**（可多个）。
- **End cap profile type**：**Match profile / Rectangle / Circle / Internal**。
- **Thickness**：数值或操纵子；箭头反向。
- **Offset**：数值或操纵子；箭头反向；作用是让端盖轮廓**大于或小于**框架段截面。
- **Rectangle**：指定**角处理**；**Internal**：指定相对框架段面的偏移。
- 接受后列入 Feature list（新端盖以独立几何呈现，属于框架集合的一部分）。

### 4.22 Cut List（切割清单）

- **选择**：**Select all frames** 勾选框，或激活 **Frames** 字段在图形区逐段选。
- 接受后：右侧出现 **Cut list 表**（与其他表并列），Parts list 出现**复合零件**；点 Cut list 图标开关表。
- **表内容**：每段一行，至少含 **Item、Qty、Length、Angle 1、Angle 2**（不可覆盖列）；Gusset/End cap 若列入，会在 **Description** 列注明；**Select all frames 会自动包含所有 gussets 与 end caps**。
- **Add Column Override**：对话框内选特定 Frames 或 **All frames**；**Column** 填既有或新列名；**Value** 填值；新数据出现在表中；若未填值则该列不显示；未被 override 的框架在该列显示 **“Not set”**。
- **表编辑**：列右键 **Move left / Move right / Hide column**；右上三点菜单 **Copy table / Show \<column name\>**；再点图标关闭；编辑 Cut list 特征删除 override 后表随之更新。
- **最佳实践**：装配体应插入**复合零件**而非单个框架，保证 Cut list 与 BOM 准确。

### 4.23 Frame Profiles Library 内容（结构级归纳）

- **支持标准**：ISO、ANSI、8020、AS、AISC；木材（Construction materials：Lumber Inch、Timber Metric）。
- **8020**：10 / 15 / 20 / 25 / 30 / 40 / 45 Series；规格如 1001/1001-S/1002/…/1050；1515/1515-Lite/LS/S/UL/ULS；2020/2040/4040；4545/4545-Lite/4590/9090 等（表中逐个带缩略图 alt）。
- **AISC**：C-Shapes、HP-Shapes、L-Angle、M-Shapes、MC-Shapes、MT-Shapes、Pipe、Rectangular（HSS）、Round（HSS）、S-Shapes、Square（HSS）、ST-Shapes、W-Shapes、WT-Shapes；每类给尺寸枚举（如 C15x50…C3x3.5、W44x335…W4x13 等）。
- **ANSI**：Rectangular bar、Rectangular tube、Round bar、Round tube（英制，bar 为 `宽 x 厚`，tube 为 `宽 x 高 x 壁厚`）。
- **AS**：Cold formed hollow sections and profiles（Channel/CHS/Equal angle/Flat/Rail hollow/RHS/SHS/Unequal angle）；Hot rolled and structural steel（Equal/Unequal angles、PFC、TFB、UB、UBP、UC、Welded beam、Welded column）；标记后缀如 CC/CHS/CA/RHS/SHS/EA/UA/PFC/UB/UC/WB/WC。
- **ISO**：Rectangular bar（含英制与 mm 两段）、Rectangular tube（mm）、Round bar（in+mm 换算）、Round tube（OD x SWG 或 mm）。
- **木材**：Lumber Inch（1x1…6x6）、Timber Metric（25x50…200x200 mm）。
- **库维护声明**：内容由 Onshape 创建、存放于 Onshape 文档中并由 Onshape 维护，“不会跨版本消失或失效”；此页**无版本/日期**。

> 注意：该篇表格存在大量抽取噪声（错拼、重复项、单位混写、`HS`/`HSS`/`SS` 混用、部分条目明显截断），**不能把表中每一字符串当作可靠枚举**；只能确认“系列存在 + 尺寸表随版本维护”这一结构事实。

---

## 5. 工作流、规则与错误状态

### 5.1 钣金端到端流程（创建→编辑→确认→展开→导出）

1. **创建**：Part Studio → Sheet Metal Model → 选 Convert/Extrude/Thicken → 完成选择与 General/Material/Relief → 接受（模型列入 Feature list，进入“激活”态）。
2. **加钣金特征**：按需 Flange / Hem / Tab / Bend / Jog / Form / Loft / Make joint / Corner / Bend relief。
3. **调整接头**：Sheet metal table and flat view 中转换 rip↔bend、改半径/K 值；自动生成 **Modify joint** 特征，可再编辑。
4. **收尾整形**：Corner break（fillet/chamfer）**必须最后做**；一旦应用，表内接头的 Type/Style 冻结。
5. **停用**：Finish sheet metal model → 生成同名特征；之后可加普通 3D 特征（Extrude Add/Intersect 等），但**不影响展开图/表值**。
6. **展开图工作**：在展开图上 New sketch（制造标记）→ 精简 Extrude（仅加/减料）→ 导出 DXF/DWG（选 scope 与线/中心线/form/草图选项）。
7. **撤销/版本**：语料未专门描述钣金专用撤销行为；按 Onshape 通用特征/事务模型（**文档未在本组说明**）。

### 5.2 顺序与父子关系（文档明确）

- **Sheet metal model 是父特征**：其后的钣金特征隶属激活的模型；Finish 特征关闭激活态。
- **Corner break 最后做**：Corner break 之前完成所有翻边与接头调整；应用后接头 Type/Style 不可编辑。
- **Form 与角/壁边界互斥**：Form 不得触及侧壁、卷壁、rip、joint、corner 边界；Corner break 不作用于 Form 边。
- **Bend/Jog 不得与既有 Bend 或 Corner 特征干涉**（冲突报错）；可在 flange/hem 面内折弯。
- **Make joint 产生表项**；表编辑又生成 Modify joint 特征——形成“表 ↔ 特征列表”双向关联。
- **Hem 在折弯表中**可排序（Move up/down）但不可编辑。
- **Tab 的 Subtraction scope** 可在钣金零件之外选普通零件。
- **Loft 的 Add 模式**只能并入**单一激活钣金模型**的 body。

### 5.3 框架端到端流程

1. 在**另一个 Part Studio**（或用官方/公司/个人库）准备 **profile sketch**；外部文档先 **Create version**。
2. 在**含路径的 Part Studio** 启动 Frame → 选 profile（Current/Other/Libraries）→ Standard/Type/Size/Configuration → **Generate** → Done。
3. 连续选路径（草图曲线/顶点/面/边）→ 选对齐点（默认居中）→ 可 Lock profile faces → Merge tangent segments（默认开）→ 角度/角度参考 → Default corner type → Corner override → Limit frame ends。
4. 接受后按需 **Frame trim**（Ordered groups/Face）→ **Gusset** → **End cap** → **Cut List**（Select all frames 含 gusset/end cap）。
5. 装配体插入 **复合零件**（Cut List 生成），以保持 Cut list/BOM 正确。
6. 库维护：改 profile 文档 → **Update my library** → 引用该库的 Frame 特征才更新（文档明确）。删除库身份用 **Unset**。

### 5.4 错误/警告与恢复

- **库更新失败**：>3 层文件夹有任一层无 Library label → 更新库时显示 “Failed to update the library”（图示）；修复=给所有层加 Library label。
- **Frame 库作者错误**：一个 Part Studio 多个草图 → 更新库失败；必须**只保留 1 个草图截面**。
- **外部 profile 无 version**：选 Other documents 时若剖面不存在于 version，会**提示创建 version**。
- **钣金冲突**：Bend/Jog 与既有 Bend/Corner 干涉 → 模型冲突报错（文档未给具体错误文案）。
- **复杂参考几何**：Bend line “在多数情况下可为任意角度；某些复杂参考几何情形产生错误”。
- **表值越界**：K Factor/BA/BD 超范围 → 单元格**标红 + tooltip 给有效范围**。
- **展开图 Extrude 复用 3D 特征** → **Regeneration warning**。
- **Corner break 后改接头** → 表中 Type/Style 不可编辑（非报错，功能禁用）。
- **Form 旧版本**：模型仍用旧 form，对话框显示 **“(previous version)”** 与通用缩略图；需手动重选新 form（无自动升级）。
- **Form 边界**：Form 触到侧壁/卷壁/rip/joint/corner 边界为禁止情形。
- **End cap 类型**：Internal 需额外“相对框架段面的偏移”；Rectangle 需角处理（未设的默认值文档未说明）。

### 5.5 横向归纳：钣金“表”的规则

- 钣金表是**模型事实的可编辑投影**：折弯/rip/hem 行、K Factor 或 BA/BD 列、半径列；编辑即改模型并留特征痕迹。
- **可改**：行序（Move up/down）、rip↔bend、rip joint type、半径、K Factor/BA/BD。
- **不可改**：Hem 行（仅可移序）、Corner break 后的接头 Type/Style。
- **只有 90° 接头可 Butt**；非 90° 必须 Edge joint（Make joint、Modify joint、Table 三处一致）。
- **BA/BD 不在 Bend/Jog 对话框改**，只在 Sheet metal model 特征或表中双击改；自定义 K factor 仅影响 3D 有效长度。
- **展开图方向**由模型特征 **Flip direction up** 控制。

---

## 6. 与其他章节的关系

**被本章直接引用/依赖的章节与工具**（依据正文链接与交叉引用）：
- **Part Studio 通用特征**：Extrude（含 Remove/Add/Intersect、Second end position、draft）、Move face、Boolean、Hole、Fillet/Chamfer、Linear/Circular/Curve pattern、Mirror、Direct Edit（Move face）、Loft（普通）、Mate connector（显式/隐式）、Tag、Features list/右键菜单、Parts list。
- **Sketch**：草图曲线/区域/顶点、草图中的弧与样条（用于卷壁/折弯）、在展开图上 New sketch。
- **Documents/Folders/权限/版本**：Folder Categories、Library label、Share（Companies / Teams）、Create version、Set library/Update/Unset、Properties 面板。
- **Assemblies/BOM**：Cut List 复合零件与 BOM 准确性；插入复合零件的最佳实践。
- **Drawings**：**Flat pattern view**（插入展开图会带入 form outline/centermarks）；**Custom export rules**（DXF/DWG 导出规则）。
- **导出/交换**：Export DXF/DWG of flat pattern（scope/参数）；刚性-柔性 PCB → **IDX** 导出流程（私有链路，本章只引用名称）。
- **学习中心**：Frames Fundamentals、Simultaneous Sheet Metal / Self-Guided Simultaneous Sheet Metal（需 Onshape 账号）。
- **Onshape 官方库**：Onshape Frame Profiles Library、Onshape Sheet Metal Forms Library（本章两篇库页）。

**上下游关系**：
- 上游：草图（profile/path/tab/form 草图）、零件/曲面（Convert/Thicken 输入）、文档版本与权限（库/外部引用）。
- 下游：展开图/表 → 工程图 flat pattern view → DXF/DWG 制造；Frame → Cut List → 装配体/BOM；Form/Flex PCB → PCB Studio/IDX。

**本章未覆盖但相关的主题（语料未包含在本组）**：`Finish Sheet Metal Model` 独立页（本组无）、`Frame profiles` 独立页（本组仅库页）、PCB Studio 文档、BOM/工程图/导出规则细节、Tag 独立主题（本组多次引用但无专页）。

---

## 7. 对 LubanCAD 的可执行启示

> 标注规则：`[文档明确]` = 本组语料直接写明；`[推断]` = 基于原文的工程推导，需另行验证。

### 7.1 需要补齐的 UI 表面

1. **钣金模式状态机**：Part Studio 工具栏提供 Sheet Metal Model（Convert/Extrude/Thicken）→ 激活态显示 14 个附加工具；Finish 生成特征并停用。`[文档明确]`
   - 激活/停用必须在 UI 上可见（图标/横幅/特征图标），因为同一模型两种语义（穿孔垂直 vs 受夹角影响；Add/Intersect 允许与否）。`[文档明确]`
2. **右侧 Sheet metal table + flat view 面板**：与 3D 视图**同时实时**、交叉高亮、行多选、右键 Move up/down 与 Convert to rip/bend、行尾 joint-type 下拉、双击半径/K/BA/BD 编辑、越界红框+tooltip。`[文档明确]`
3. **展开图上下文**：右键 New sketch / Export DXF/DWG of flat pattern；展开图上精简 Extrude（仅 add/remove）。`[文档明确]`
4. **Frame 对话框 + Select sketch 三级来源**（Current document / Other documents / Libraries）+ Standard/Type/Size/Configuration + Generate + 对齐点选择器 + Lock profile faces + corner override 子界面 + Limit frame ends。`[文档明确]`
5. **Frame 工具族菜单**：Frame / Frame trim / Gusset / End cap / Cut list / Tag 同组呈现。`[文档明确]`
6. **Cut list 表**：右侧表 + 列右键（Move left/right、Hide）+ 三点菜单（Copy table、Show hidden column）+ Add Column Override 子对话框（All frames / Frames 选择、Column、Value）。`[文档明确]`
7. **库管理 UI**：Documents 页右键 Set library / Update my library / Unset my library；文件夹 Properties 的 **Library label**；库文件夹图标变化。`[文档明确]`

### 7.2 参数与默认值清单（可写成配置/表单默认）

**钣金模型**
- 操作类型默认 **Convert**；`[文档明确]`
- **Default bend K Factor = 0.45**；**Rolled K Factor = 0.5**；`[文档明确]`
- **Bend calculation 默认 K Factor**；`[文档明确]`
- **Corner relief scale：1.00–2.00**；**Bend relief depth scale：1.00–5.00（Convert/Model 正文；Extrude 步骤写 1.00–2.00，需定案）**；**Bend relief width scale：0.0625–2.00**，宽度 = thickness × width scale；`[文档明确，含不一致]`
- Corner relief 六型：Square-Sized / Rectangle-Scaled / Round-Sized / Round-Scaled / Closed / Simple；Bend relief 三型：Rectangle-Scaled / Obround-Scaled / Tear（Bend Relief 工具另有 Square-Sized、Obround-Sized）。`[文档明确]`
- **Extrude End type**：Blind / Up to next / Up to face / Up to part / Up to vertex；Symmetric 仅 Blind（正文另有 “Through all” 表述）；Second end position 独立深度。`[文档明确，含不一致]`
- **Thickness 方向箭头**、**Bend radius**、**Flip direction up**、**Minimal gap**、**Clearance from input**、**Include bends**、**Keep input parts**。`[文档明确]`

**Flange**
- Flange alignment：Inner / Outer / Middle / Hold line；`[文档明确]`
- End type：Blind / Up to entity / Up to entity with offset；`[文档明确]`
- **Automatic miter 默认勾选**；**Use model bend radius 默认勾选**；`[文档明确]`
- 角度：Bend angle / Align to geometry（Parallel to）/ Angle from direction（Angle 1–359°）；`[文档明确]`
- Partial flange：Per edge / Per chain，**Hold adjacent edges 默认勾选**，Bound：Blind / Up to entity / Up to entity with offset，Second bound。`[文档明确]`

**Hem**
- 类型 Straight / Rolled / Teardrop；Straight 的 **Flattened**；Rolled 的 Angle > 180°；Teardrop 的 **Use minimal gap**；`[文档明确]`
- 对齐 Outer / In place；角型 Simple / Closed；参数跨会话跨文档记忆。`[文档明确]`

**Bend / Jog**
- Bend alignment：Bend line / Hold line / Hold other line / Inner / Outer / Middle；`[文档明确]`
- Bend 角度 1–359°，Jog 方向角 1–180°；`[文档明确]`
- **Use model bend radius / Use model K factor 默认勾选**；`[文档明确]`
- Jog：Bounding type Blind / Up to entity / **Thickness 倍数**；Offset anchor Inside / Nominal / Outside；**Preserve material 默认勾选**。`[文档明确]`

**Joint / Corner / Corner Break**
- Rip edge types：Edge joint / Butt D1 / Butt D2（**仅 90° 可 Butt**）；`[文档明确]`
- Modify joint K Factor 允许值原文 “-1000 to 1.00”（建议定案为合理区间）；`[文档明确，存疑]`
- Corner relief scale 1.00–2.00；`[文档明确]`
- Corner break：Fillet Measurement Radius/Width；Control Distance/Conic/Curvature；Curvature Magnitude 0–.999；**Allow edge overflow 默认关闭**；Chamfer **默认角度 45°**；`[文档明确]`

**Frame**
- **Merge tangent segments 默认勾选**；路径必须连续；默认居中；`[文档明确]`
- Corner type：Miter / Butt / Coped Butt / None；可逐角覆盖；`[文档明确]`
- Cut List 不可覆盖列：Item、Qty、Length、Angle 1、Angle 2；`[文档明确]`
- Tab Subtraction 示例最小默认 **0.05**（原文 “the minimal default”）。`[文档明确，但为示例语境]`

**Flex PCB**
- **Default bend K Factor：Part Studio 0 / PCB Studio 0.5**；Finish 的 Unfold type：Unfold all / selected / none。`[文档明确]`

### 7.3 交互与选择规则（实现/测试重点）

- **选择类型强约束**：Frame path 连续；Profile 必须另一 Part Studio；Gusset 必须是框架切口线性边；Make joint 必须两次选择；Corner 每次一个角；Bend/Jog 每次一个面；Tab 草图须与翻边平行；Form Location 为草图顶点/点/mate connector；Corner break 可选成形或展平状态。`[文档明确]`
- **方向/反向控件**：Thickness、Offset（End cap）、Flange 角度、Partial flange 侧、Bend/Jog 的 Opposite side / Opposite angle / Opposite direction、Form 反向、Extend bend relief、Corner break 的 Flip asymmetric 与 Direction overrides。`[文档明确]`
- **未选边/弧的语义**：Convert/Thicken 中未选边→rip；未选弧/样条→tangent joint；选入 “Arcs to extrude as bends” 才成折弯且半径锁定为草图值。`[文档明确]`
- **表与图形双向联动**：表格选择↔图形高亮↔行滚动；改表即改模型并生成特征。`[文档明确]`
- **锁定/冻结语义**：Corner break 应用后接头 Type/Style 冻结；Finish 后特征不影响展开图。`[文档明确]`

### 7.4 事务/撤销/版本/权限/协作约束

- **库版本化**：外部 profile/form 必须存在于 version；外部引用需 Create version；库更新是显式动作（Update my library），不是自动传播。`[文档明确]`
- **库权限**：公司/企业库由管理员所有，通过团队/公司共享；个人库独立；库文件夹的删除与共享权限编辑都要求先 **Unset**。`[文档明确]`
- **特征顺序即语义**：Corner break 必须最后；Finish 可随时关闭激活态，但关闭后的编辑不回写展开图。`[文档明确]`
- **表单模板契约**：form 文档必须有 `thickness: Length` 配置变量且被 Tag；每 Part Studio 仅 1 个有效 form tag。`[文档明确]`
- **撤销**：本组语料未写钣金/框架专用 undo 规则；按 P0-10 与平台标准事务实现（每个用户/Agent 操作走标准事务、可撤销）。`[推断/平台规则]`
- **可变默认值的跨文档持久化**：Bend relief depth/width scale、Hem 对话框选择、Corner break measurement/type、Corner break 距离等会“成为所有文档默认/跨会话记住”。`[文档明确]` → 需要用户级/文档级偏好存储与隔离测试。

### 7.5 可写成测试断言的验收点

1. **钣金状态**：激活时 Extrude Add/Intersect 被禁止；Finish 后允许，且展开图/表值不因停用后特征改变。`[文档明确]`
2. **折弯计算**：K Factor 0.45/0.5 默认；BA/BD 在 Bend/Jog 对话框不可编辑、在模型特征与表单元格可编辑；自定义 K 只改 3D 长度。`[文档明确]`
3. **联合类型**：90° 才允许 Butt joint，非 90° 强制 Edge（Make joint/Modify joint/表三处）。`[文档明确]`
4. **Corner break 顺序**：应用后表中接头 Type/Style 控件禁用；同一特征不能混加多个 fillet/chamfer。`[文档明确]`
5. **展开图导出**：三种 scope 的零件集合正确；bend centerline/tangent line/form outline/centermark/visible sketch 各开关生效。`[文档明确]`
6. **展开图草图**：右键 New sketch 预选展开面；精简 Extrude 仅 add/remove；复用 3D Extrude 触发出警告。`[文档明确]`
7. **Frame 路径/截面约束**：profile 与 path 同 Part Studio 时拒绝；路径不连续时拒绝/无法完成；外部无 version 时提示创建。`[文档明确]`
8. **Frame 角型与覆盖**：默认 Miter；Butt/Coped Butt 可翻转；Corner override 只影响所选角。`[文档明确]`
9. **Cut List 覆盖列**：Item/Qty/Length/Angle 1/Angle 2 拒绝覆盖；未赋值列不出现；未列框架显示 “Not set”；Select all frames 包含 gusset/end cap 并在 Description 标注。`[文档明确]`
10. **Gusset 限制**：圆管段、Default corner type=None 段拒绝生成；结果在 Parts list 为独立零件。`[文档明确]`
11. **Form 边界**：Form 触及侧壁/卷壁/rip/joint/corner 边界应失败；旧版本 form 显示 “(previous version)” 直到重选。`[文档明确]`
12. **Flex PCB K 默认**：Part Studio 0、PCB Studio 0.5；Finish 删除展开图面板内容且后续模型更改不影响展开图/表值。`[文档明确]`
13. **库层级**：>3 层缺 Library label 时更新失败并给出错误；≤3 层自动 Standard/Type/Profile（Frame）或 Type/Form（Form）。`[文档明确]`
14. **表值校验**：K Factor/BA/BD 越界标红并给有效范围 tooltip；越界不得静默接受。`[文档明确]`

### 7.6 差距提示（相对 LubanCAD 当前能力，基于本组文档）

- 本组文档**只描述 Onshape 行为**，未涉及 LubanCAD 现状；无法从语料判断 LubanCAD 已实现哪些。`[文档明确]`
- 若要对齐，钣金子系统的**最小可验证切片**应为：Sheet Metal Model（三操作 + K 因子/释放参数）→ Flange → Sheet metal table/flat view 双向联动 → Corner break → DXF 导出。`[推断]`
- 框架子系统的**最小切片**：Frame（外部 Part Studio 截面 + 路径 + 角型）→ Frame trim → Cut List（复合零件 + 表）。`[推断]`
- **不建议**在没有折弯表/展开图投影能力前先做 Flange/Hem/Jog/Form 等“消费折弯”的特征，因为每个工具的结果都要求写入折弯/rip 表并更新展开图。`[推断]`
