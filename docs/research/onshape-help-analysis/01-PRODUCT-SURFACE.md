# Onshape 产品能力全景（基于 527 主题帮助文档）

> 本文是 14 份逐领域报告的横向综合；逐主题摘要、字段清单与验收断言见 `sections/`。
>
> 标注：`[文档明确]` = 帮助原文直接写明；`[推断]` = 由文档组合推导、需 live/AIRR 复核。

---

## 1. 先看产品骨架：文档 / 标签 / 工作室

Onshape 的产品模型不是“文件 + 模型”，而是：

```
Document（容器）
 ├─ Tab（工作页签）
 │   ├─ Part Studio（零件设计空间）
 │   ├─ Assembly（装配）
 │   ├─ Drawing（工程图）
 │   ├─ Variable Studio（变量库）
 │   ├─ Feature Studio（FeatureScript IDE）
 │   ├─ Render Studio（渲染场景）
 │   ├─ PCB Studio（ECAD 协作）
 │   ├─ CAM Studio（加工）
 │   ├─ Material Library / 导入文件 / 图片 / PDF 等 blob
 │   └─ 第三方应用 tab
 ├─ Workspace（活动编辑空间，分支末端最多一个）
 ├─ Version（不可变快照）
 ├─ Branch（命名分叉）
 └─ History（变更记录、Restore、Compare）
```

`[文档明确]`

- 新文档自动生成 **Start version** 和 **Main workspace**；空文档的 Start version 含空 Part Studio + 空 Assembly。
- 版本不可变；Workspace 可编辑；分支从 Version 分出、以 Workspace 结束；Merge/Restore 以新历史记录结束，不破坏历史。
- Tab 顺序对所有用户共享持久，active tab 不共享；Tab 可放文件夹，嵌套上限 10 层。
- 所有 Studio（Render/Variable/Feature/PCB/CAM）共享文档级版本、权限、复制、移动、Release 语义。

这层“文档/版本/权限/协作”不是 CAD 内核能力，而是产品宿主能力。当前 LubanCAD 以 Part Studio 为中心，文档外壳/版本/权限需要按 iModel/BIS 与平台服务重新映射（见 `02-CAPABILITY-GAP.md`）。

---

## 2. Part Studios（153 主题，189,184 词）

Part Studios 是 Onshape 的核心建模容器，也是当前 LubanCAD 对齐计划的主战场。文档把它拆成三层：

### 2.1 草图（58 主题）

- **对象**：线、矩形（角点/中心/对齐）、圆（中心/三点/周边）、圆弧（中心/三点/相切）、椭圆/椭圆弧、圆锥、多边形（内接/外切）、样条、Bezier、点、文本、槽、插入 DXF/DWG、图片。
- **约束**：15 个手动约束（coincident、horizontal、vertical、parallel、perpendicular、tangent、equal、concentric、midpoint、normal、pierce、intersection、symmetric、fix、curvature/flow 等）+ 自动推断 + 自动约束（quadrant 等）。
- **尺寸**：驱动/从动、长度/距离/角度/半径/直径/弧长、中心线尺寸、负值限制（距离/角度/线长/样条允许，弧/半径/直径不允许）；过定义自动转从动；两线距离隐含平行。
- **诊断**：Constraint manager（Type/Mode/Status 过滤）+ Profile inspector（未闭合环）；蓝=欠约束、黑=全约束、红=过约束；约束图标可悬停/拖动/删除。
- **编辑工具**：Trim、Extend、Split、Offset、Fillet、Chamfer、Mirror、Linear/Circular Pattern、Transform、Use/Intersection/Pierce、Construction。
- **重要规则**：`[文档明确]` 阵列实例 >10 时只预览前 10；圆周阵列默认 360° closed；多边形 3–50 边；Text 250 字符；Bezier 最大 15 次且不可闭合；草图内不可阵列/镜像文本；草图直接 Extrude/Revolve 会自动接受草图并全选面域。
- **平台边界**：Midpoint Line 在 iOS/Android 只能查看/编辑桌面创建的实体，不能创建。

### 2.2 核心实体特征（40 主题）

| 族 | 代表工具 | 文档中最重要的规则 |
|---|---|---|
| 基础造体 | Extrude、Revolve、Sweep、Loft、Thicken、Enclose | Extrude 六端条件（Blind/Up to next/Up to face/Up to part/Up to vertex/Through all）；Symmetric 仅 Blind/Through all；Loft 多截面顺序敏感；Sweep 有四类 profile control、Twist/Scale |
| 圆角/倒角/拔模 | Fillet、Face Blend、Chamfer、Draft、Body Draft | Fillet 有 Radius/Width、Conic Rho、Curvature Magnitude、Variable/Partial/Full round；Face Blend 有 Rolling ball/Swept profile、hold lines、cliff edges、caps、limits；Chamfer 等距/双距离/距离-角度；Draft 有中性面/分型线、Tangent propagation |
| 薄壁/孔/螺纹 | Shell、Rib、Hole、External Thread | Hole 有 Simple/Counterbore/Countersink、Drilled/Clearance/Tapped/PEM、Tip angle 118/135/Flat/Custom；External Thread 为装饰螺纹 |
| 阵列/镜像/布尔/分割/变换 | Linear/Circular/Curve Pattern、Mirror、Boolean、Split、Transform | Pattern 分 Part/Feature/Face 三类，支持 Skip、第二方向、Centered、Reapply；Curve Pattern 的间距/方向与曲线有关 |
| 直接编辑 | Delete Part/Face、Move Face、Replace Face、Modify Fillet | 适合导入零件；Delete Face 有 Heal/Cap/Leave open；Move Face 有 Offset/Translate/Rotate |
| 构造/参数化 | Plane、Helix、Mate Connector、Derived、Variable、Query Variable、Composite Part、Tag、Add Custom Features | Merge all 默认；Add/Remove/Intersect 无 merge scope 报错；编辑特征回滚到该特征状态，非最后特征有 Final 按钮 |

`[文档明确]` 关键默认/约束：

- Creation type：Solid / Surface / Thin；结果操作 New/Add/Remove/Intersect；曲面只允许 New/Add。
- Merge all 默认勾选；取消后才出现 Merge scope；零件与曲面不能混合合并。
- 编辑特征时模型回滚到该特征；`Final` 只读预览；Derived 单向、禁止循环引用。
- 参数化特征都进入 Feature list，可回滚、抑制、删除、重排（受依赖限制）。

### 2.3 钣金 / 框架（23 主题）

- **钣金模型**：Sheet Metal Model 是父特征，激活时自动同步折弯/展开/表；`Finish sheet metal model` 停用并生成普通特征。创建方式 Convert/Extrude/Thicken。
- **折弯计算**：K Factor（默认，Default K=0.45、Rolled K=0.5）/ Bend allowance / Bend deduction；只在模型特征或表内改，Bend/Jog 对话框不改 BA/BD。
- **14 个后续工具**：Flange、Hem、Tab、Bend、Jog、Form、Loft、Make Joint、Corner、Bend Relief、Modify Joint、Corner Break、Table and Flat View。
- **表与展开图**：右侧 Rip/Bend 表 + 展开图与 3D 实时联动、交叉高亮、双击改半径/K/BA/BD；改表自动生成 Modify joint 特征；仅 90° 接头可 Butt。
- **顺序规则**：Corner Break 必须最后做，应用后接头 Type/Style 冻结；Form 不得触及侧壁/卷壁/rip/joint/corner 边界。
- **框架**：profile 必须位于另一 Part Studio；路径连续；角型 Miter/Butt/Coped Butt/None + 逐角覆盖；Cut List 生成开放复合零件。
- **Flex PCB**：K Factor 在 Part Studio 默认 0、PCB Studio 默认 0.5；Finish 删除展开图面板内容且后续改动不影响表值。

### 2.4 曲线/曲面/MBD/材料/表格（32 主题）

- **曲面 7 工具**：Offset Surface、Boundary Surface、Fill、Move Boundary、Ruled Surface、Mutual Trim、Constrained Surface。
- **连续性**：G0 位置、G1 相切、G2 曲率、G3 流（Bridging Match flow）；Boundary Surface 有 7 种边界条件；Fill 支持 G0/G1/G2。
- **曲线 11 工具**：Projected、3D Fit Spline、Bridging、Composite、Intersection、Trim、Isocline、Offset、Isoparametric、Edit、Routing；几乎共用 Approximation 参数组（Target degree/Max control points/Tolerance/Keep derivative/Show deviation）。
- **MBD/PMI**：MBD 不替代 Drawings；驱动/从动尺寸；Datum 命名规则；10 类 Tolerance type；14 种几何公差符号；Inspection table（Datums + Characteristics）；默认公差库（文件夹 + Variable Studio，需建版本并显式 Update）。
- **材料/外观**：Appearance 作用于 Part/Face/Feature/Sketch/Curve；Material 驱动 Mass properties；8 色默认循环；五种 tessellation 档；自定义材料 8 字段；库更新不回溯已赋材料。
- **表格**：Custom（FeatureScript）、Variable、Hole、Routing、Inspection；表格是 Feature list/数据的投影，不是第二份模型事实。

---

## 3. Assemblies（46 主题，64,634 词）

### 3.1 对象模型

- **Instance**：插入的零件/曲面/草图/Part Studio（rigid）/子装配；同名实例编号 `Housing <1>`、`Housing <2>`。
- **Mate Connector**：局部坐标系（原点 + 主 Z + 次 XY）；显式（工具栏创建、Feature list 顶层）与隐式（创建配合时生成、列在 Mate 下）。
- **Mate**：两个实例之间**只有一个** Mate；自由度内嵌；用两个 Mate connector 对齐定位。
- **Relation**：作用于 Mate 之上，约束 DOF 比例（Gear/Rack and Pinion/Screw/Linear）。
- **Group**：不是 Mate，把所选实例按原点固定相对位置。
- **Origin**：装配原点；插入时首实例原点对齐。
- **Named position / Display state / Exploded view**：命名位置（Mate DOF + 无配合实例的绝对变换）、显示状态（显隐组合）、爆炸视图（多个 Explode feature/step）。

### 3.2 十种配合（文档逐一定义 DOF/偏移/限位）

| 配合 | 自由度/行为要点 |
|---|---|
| Fastened | 完全固定两实例相对位置/朝向 |
| Revolute | 单轴旋转；offset 可沿轴/角度；limits |
| Slider | 单轴平移；offset/limits |
| Planar | 面内平移 + 法向旋转（3 DOF） |
| Cylindrical | 轴向平移 + 绕轴旋转（2 DOF） |
| Pin Slot | 销在槽内：沿槽平移 + 绕销旋转；先 pin 后 slot |
| Ball | 球心固定、三轴旋转（3 DOF） |
| Parallel | 两轴保持平行（可带 offset） |
| Tangent | 两曲面相切；无 connector，propagation 默认开 |
| Width | 两实体居中/宽度约束；Tab/Width 两组，不得同件 |

`[文档明确]` 配合对话框支持：类型切换、两个 connector 槽、Reorder、Flip/Reorient、Offset（含轴+角度）、Limits（min/max）、Animate（Single/Reciprocate/Loop、Steps、Start/End）、Solve、head-up 提交下一个。

### 3.3 装配工具链

- Group、Snap（拖拽时 Ctrl 循环 connector、A/Q 改对齐）、Show Mates、Replicate（可 Dissolve）、Replace Instance、Assembly Linear/Circular Pattern、Mirror（Transform vs Derived，自动版本，运动跟随原体）、子装配（Move to new/Create empty/Dissolve）。
- Display States、Named Positions、Exploded Views、In-Context 建模（primary instance 实线箭头；普通 Insert 虚线箭头；更新手动、蓝点过期）。
- BOM：Structured/Flattened、子装配三种 BOM 行为、局部抑制仅直接子级、全局排除优先、模板/CSV/版本只读。
- 仿真：线性静力（六载荷/三连接方法/五结果）、Modal（默认 5 阶/最多 15 阶）、Asynchronous（仅版本、50 次/24h、结果永久存储）、Rigid Body（不计 100 实例上限）。
- 引用：版本/修订/图钉/蓝底图标；Update all 自动建版本；修订需源层更新；Pin 后批量更新跳过。

### 3.4 关键交互规则

- 两实例仅一个 Mate；`Solve` 触发全装配求解；编辑中不持续求解。
- 团队/关系/抑制有级联语义：抑制 seed → 阵列/replicate 失活；抑制零件 → 其 Mate 失活；文件夹解除抑制后单独抑制者仍抑制。
- 删除实例会级联删除其 connectors/Mates/relations，但 Mate groups 例外。
- Tessellation：装配可采用低于 Part Studio 的质量，绝不能高于。
- 移动端：Width mate/Assembly Mirror/Exploded 仅查看；文件夹创建仅桌面；BOM 仅切换视图类型。

---

## 4. Drawings（67 主题，59,604 词）

### 4.1 视图体系（9 类派生视图）

投影视图、辅助视图、剖视图、对齐剖视图、破断剖视图、详图、断裂视图、裁剪视图、平展视图（钣金）。每类有可创建源视图矩阵：例如投影视图可来自剖/对齐剖/辅助/破断剖，不能来自平展/详图；Section 可做剖中剖；角度剖与 Break 互斥；Flat pattern 只能通过 Insert 对话框插入。

- 视图比例默认 **Parent**；可 Link to sheet scale；旋转角默认 0°；Tangent edges 默认 Solid；Render mode 默认 Best performance；View simplification 默认 Auto；Show annotations from model 默认勾选。
- 父/子视图：移动父视图不带辅助/子视图；链接视图无法 unlink，只能删除重建；子视图不随父跨页。

### 4.2 尺寸（13 个专用工具 + 调色板）

智能 Dimension、Chamfer、Max/Min、2 Point Linear、Point-to-Line、Line-to-Line、Line-to-Line Angular、3-Point Angular、Arc Length、Radial、Diameter、Foreshorten、Ordinate、Hole/Thread Callout。

- 捕捉点四类：端点（方）、中点（三角）、四分点（菱形）、圆心（圆）；默认禁中点/四分点，Shift+q 临时开。
- 两线距离隐含平行；2 点线性不能选线；线到线只高亮平行线；Overridden 尺寸文本带下划线、清空恢复关联；Dangling 实体红色夹点。
- 尺寸精度：Properties 0–6 位；调色板 0–8 位；分数精度 0–1/256。

### 4.3 注释与符号

- Datum/Datum Target、Geometric Tolerance（14 种特征符号、3 基准、最多 5 帧、Upper 50 字符/Lower 200）、Surface Finish、Weld Symbol、Edge Condition、Note、Callout/Balloon、Inspection Item。
- GD&T 可吸附尺寸并分组；Leader 三型；GT 拖到尺寸上吸附、拖离解除。

### 4.4 表格

Table、BOM、Cut List、Hole、Custom、Revision、Inspection；固定角默认右上、padding 0.06 in；列由模板/数据驱动（除 Hole/Inspection CSV 外，文档很少逐列列出）；BOM 三种类型/两种排序；Revision pending 行蓝色、小三角；Inspection CSV 8 列且仅已分配编号导出。

### 4.5 模板 / 导出 / 更新

- DWT 2013/2018；导出只保留前两页、删除视图、保留非视图几何/文字；DWG/DXF 层名 `BORDER_FRAME`/`BORDER_ZONES`/`TITLE_BLOCK`；Drawing 层不导出。
- 图纸元素不支持同时编辑；更新只刷新视图，不检查其它文档链接；新视图放置时若过期自动更新。
- Revision/Release：Revision table 依赖 Release management；已发布描述仅管理员可改；Pin view reference 阻止更新。

---

## 5. Documents / Sharing / Release / PLM（58 主题，88,580 词）

### 5.1 文档与版本

- Document 容器、Tab、Workspace、Version、Branch；Start version/Main workspace 自动生成；版本不可变；分支末端最多一个 workspace。
- Version graph：branch 颜色、version 实点、workspace 空点、release 三角形、active branch 蓝框；Merge lines/automatic versions 可显隐。
- Merge/Restore：Keep/Merge/Replace 按 Tab；Merge 不能 Undo，只能 revert（revert 会丢合并后的新改动）；Restore 只同分支；删除 workspace 不可撤销。
- Workspace protections：只阻止直接修改几何/加 Tab 等；创建 version/branch/merge/release metadata 允许。

### 5.2 共享/协作

- Share：Can edit / Can view + Copy/Link/Export/Share/Comment/Delete；Link document 依赖 Export；Free 用户私有文档只读，可 Comment/Export/Copy/Link。
- Comments：评论不进入历史；任务仅新评论可派且一次一人；评论跟随装配移动；Markup 修饰键（Shift 45°、Ctrl 居中、Shift 正方/圆）。
- Follow Mode：双击 social cue 开始、点窗口停止；一人只跟随一人。
- View Only toolbar：最多 18 个工具（正文列举超过 20 个候选）；公司设置可隐藏；只对无写权限者显示。
- Transfer ownership：接收者需接受（文档另有“立即完成”矛盾）；跨公司不携带 metadata/release/revision history。

### 5.3 导入/导出

- 导入上限 4GB；三策略 + 7 个处理选项；Y-up 导入除 .ipt/.catpart；Assembly 层级 >100 唯一零件时 Split 额外建文档；Combine 对重复实例会产生重复零件。
- 导出：STEP/IGES/Parasolid/DXF/DWG/STL/OBJ/3MF/GLTF 等格式矩阵；STEP 未勾自定义单位默认 Meters；STL Text/Binary + 六种单位；OBJ 导出为 .obj+.mtl zip；邮件链接默认 3 天；URDF 仅 Assembly。
- 导出规则：非法字符 `\ / * : | > < ? "` → `-`；组织规则优先于用户规则（更具体者胜）。

### 5.4 发布管理状态机

```
工作区对象: In progress（默认，可编辑）
   │ Create Release candidate
   ├─ 无审批人 ──► Released（创建者立即发布）
   └─ 有审批人 ──► Submit（生成版本；版本名=Release name；对象 Pending）
                     ├─ Release ──► Released
                     ├─ Reject ──► Rejected
                     └─ Discard（仅创建者/管理员，Pending）──► 发布删除，保留普通版本
Released/Rejected ── Clone ──► 新候选
Released ── 手动/自动 ──► Obsolete
```

- 状态变更发生在**同一个不可变版本**上；工作区对象默认无 Revision 标签。
- 团队审批只需 1 名成员；项目角色 1 次批准代表整个角色；`Require approval from all approvers` 对团队不生效；委派只转移个人票。
- 通知：每 Release 应用内 1 条并更新；邮件每动作 1 封；批准后 Drawing 属性写入审批人/日期。
- 修订：alphabetic/numeric/custom；单调递增、可跳号、跳过的标签永不可用；首次导入尽量保留（不匹配则警告调整）；作废可标记 re-releasable。
- 零件号：Onshape ≤128 字符、Arena ≤200；禁止同一 PN 以更低修订重发；Drawing 可复用装配/零件号（单对象图才生成新号）。
- 配置：每个配置是独立可修订对象；已发布配置冻结输入；排除出属性的输入按默认值处理。

### 5.5 PLM（Arena）

- 连接：1 企业 ↔ 1 Arena workspace；API URL 两套；token/集成用户；Enterprise settings。
- 映射：Category/Property/ListOption；Part/Assembly/Drawing/File → Item；Version → Revision Control；Workspace → Working Revision；Release candidate/Release → Arena Change。
- 同步：单向上传 + 审批事件回传；幂等键（零件号 + BOM 行 + Change）；文件 PDF/STEP/DXF/GLTF/PVZ；BOM Structured/Flattened；`OnshapeCreated` 标识。
- 失败必须可诊断：映射失效/缺号/超限/Change 不可用/权限不足；建议预检（preflight）。
- 文档缺口：完整设置页、多级工作流编辑器、独立审计日志章节、Arena 套餐徽标。

---

## 6. Render / Visualization / Evaluation / Other Studios（68 主题，275,232 词）

### 6.1 Render Studio（24 主题 + 1 库目录）

- **对象模型**：Scene（一个 Render Studio tab 一个场景）、Scene list（几何层级 + Appearances）、Appearance（材质参数组合）、Appearance function（作用于参数）、Appearance modifier（包裹外观）、Appearance set（多外观切换）、Projector（纹理投影）、Transform、Volume、Light、Environment、Background、Named view、Render options、Denoiser、White mode、AxF、IES、OpenVDB。
- **层级规则**：上层属性优先；上层 override 覆盖全部下层；未设则用最近下层；实体不能跨层移动；变换矩阵随实体累积。
- **默认值**：FOV 1–175°；Focal length 1–2,063 mm；DoF F-number 0.063–64；Aperture blades 2–20（0–2 圆形）；Bloom Radius 0.01/Threshold 0.9/Brightness 1.000；Quality 1.0；Max samples −1；Multiple 最多 60 视图；普通输出 2.1MP，Advanced 100MP；Volume Surface IOR 1.2；Environments 默认 Standard + 白背景。
- **输出/席位**：普通 2.1MP；Advanced 100MP、UHD 8k/2160、Panoramic/Stereo/Appearance masks、AxF、Appearance set、Volume、Light；Render Studio/PCB Studio description 明示 Pro/Enterprise；CAM 明示 Professional 及以上。
- **事务**：Undo/Redo 标准；Clear face appearances = 2 个 undo；场景依赖版本；工作区外更新需新版本/Reference manager；隐藏不持久、Suppress 持久；多人可访问但不可同时编辑。
- **素材库**：3,881 个 Appearances、144 个文件夹（24 顶层 + 120 二级）、2,388 个 subheading；390 个 Environments、21 个标签、2,307 次标签赋值；Functions 65 行、Modifiers 18 行、28 种 blend mode、9 种投影；181 个 Part Studio 材质→63 个外观（60 颜色、1 透明）。数据存在 24 条完全重复行、65 个重复键、拼写错误。
- **渲染器硬需求**：多层 PBR（coat/sheen/flake/thin film/transmission/volume/SSS/emission）、每参数可被纹理/函数驱动、UV/纹理管线（UV space index/TRS/tiling/triplanar/ORM/SG/mask）、光源外观（Diffuse/Spot/IES/色温/Display screen）、HDR/IBL（文档未明说，需架构立项）。

### 6.2 可视化（23 主题）

- ViewCube（15°/90°/5° 增量）、Camera and render options 14 个主题、Named Views、Section View、Hide/Show、Isolate、Make Transparent、AR/AVP、移动端触控。
- 默认：Shaded with edges；Hidden edges removed；Tangent edges visible；Perspective 关；AO 37.5%；phantom 0.5px；mesh 0.3px；构造线 4/6/30/6px；FOV 20–120°（透视）；U/V 曲线默认 8/8；Zebra 35 条。
- 视图状态不是建模事务：Named Views/Graphics prefs/Isolate 设置是显示层持久化，不应写入 BIS 几何或特征历史。

### 6.3 评估（15 主题）

- Measure：12 类测量、6 长度单位/2 角度单位；参考坐标系仅桌面；变量仅 Part Studio；动态更新仅 Assembly 且 Section view 下不工作。
- Mass Properties：Part 页（质量/体积/表面积/质心/惯性矩）；Face 页（面积/周长/面积惯性矩/极惯性矩）；惯性矩相对重心；无材料警告红图标；Override 重算。
- 11 个分析工具：Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten 等；菜单入口不保留选择、快捷键入口保留；Draft 蓝/黄/红；Thickness 4 方法；Flatten 不创建 Part、不保证精度。
- 只读语义：AR/AVP 只读；Measure 对 View only 用户可用（测量是只读能力，不应要求编辑权限）。

### 6.4 Variable / Feature / PCB / CAM

- **Variable Studio**：Name/Type/Value/Description；默认 Length；可 CSV From import；跨文档引用需版本；Configured Variable Studio 不可 Release；移动端不可创建。
- **Feature Studio**：FeatureScript IDE；自动保存 + 显式 Commit；Commit all；未提交计数；Commit 前不应用代码；Co-complete 为 Labs AI 补全。
- **PCB Studio**：ECAD/MCAD 双向；IDF/IDX 3.0/3.5/4.0；Altium 365 Connector；Rigid/Flex 区、keep-in/out、镀孔/非镀孔、参考位号；Copper/Silkscreen 单向；Rigid-Flex 折弯区同步后无 decal。
- **CAM Studio**：Job→Machine→Setup→Tool→Toolpath→Post；2/3/4/5 轴；Back plot/Verify/Simulate；所有插入组件需 version reference；机床/post 数据库是生态依赖。

---

## 7. Account / Subscription / Enterprise（93 主题，100,062 词）

- **计划**：Free、Standard、Professional、Professional Trial、Student、Educator、EDU Enterprise、Enterprise、Government (US)。
- **组织**：Company/Classroom/Enterprise；Owner/Admin/Member/Guest；Full/Light；Project roles + Permission schemes；24 项 Global permissions。
- **身份**：8 类 SSO（Okta/Entra/ADFS/Google/PingOne/OneLogin/ClassLink/Custom SAML 2.0）、2FA、域名验证、自动 provisioning、禁用密码登录；ACS `…/identity/saml2/sso`；Entity ID `com.onshape.saml2.sp`；属性 firstName/lastName/companyName。
- **计费/生命周期**：合并计费、席位、续期、取消（Professional 需 renewal 前 30 天邮件）、降级只读、30 天删除窗口、4 年不活跃删除。
- **发布治理**：字母修订跳过 I/O/Q/S/X/Z；自定义方案 ≥50 行；水印 64 字符；8 项发布条件。
- **分析/审计**：Activity、Action Items、Analytics 仪表板（QuickSight）、定时 PDF 报表、Webhooks HMAC-SHA256 主备密钥。
- **边界**：企业配置应服务端权威，前端只呈现；不要写入 iModel schema。

---

## 8. 跨领域 UI 语法（所有工具的共同契约）

### 8.1 选择

- 单击选中/再点取消；无需 Ctrl 追加；光标最多 `5+`；Space 清空；Shift 点选列表范围；Ctrl+拖选取消。
- 框选：左→右全包含（蓝），右→左接触即选（黄）。
- Create Selection：面六准则（Protrusion/Pocket/Hole/Fillets/Tangent connected/Bounded faces）+ Select patterns；边五准则（Loop/chain、Equal length/radius、Parallel、Select pattern）。
- Select Other：反引号下移、Shift+反引号上移、Enter 确认、自动填字段。
- 透明几何默认不可选，Alt 穿透。

### 8.2 数值字段

- 滚动步进：默认 0.1、Ctrl 0.01、Shift 1.0；0–1 字段：默认 1.0、Ctrl 0.01、Shift 无效。
- 单位：mm/cm/m/in/ft/yd（含复数）；deg/rad；`pi/PI/Pi`；`%` 取模；三角以度为单位。
- 结果必须无单位或单位一次方；拒绝 unit²、1/unit、单位混加；非法表达式红框/禁用确认。
- 支持数组/三元/逻辑；FeatureScript 求值。

### 8.3 对话框与特征编辑

- 蓝底字段来自图形区选择；白框字段键盘输入；Enter/Shift+Enter；Escape 取消；字段级 x 与右键 Clear all；缺失引用红色 + Clear missing references；Preview slider 0–100%；上下文 Help。
- 接受对话框=一次事务；期间临时动作移出 Undo/Redo；只读用户可看不可改。
- 编辑特征回滚到该特征状态；非最后特征显示 Final；Merge all 默认；Add/Remove/Intersect 无 merge scope 报错；New 无 merge scope。
- 数组字段（Loft profiles 等）需支持对向箭头 + 拖拽重排。

### 8.4 配置与 In-Context

- 配置输入三类：List/Checkbox/Configuration variable（Length/Angle/Integer/Real/Text）。
- 可见性 AND；仅受上方输入控制；隐藏取默认；选项规则仅 List；跨表粘贴行增长列不增长；复制输入不保持引用。
- In-Context：快照 + 手动更新；蓝点=过期；主实例实心箭头/旧主实例虚线；引用紫色；更新永不自动；只读场景面板不可操作。

### 8.5 撤销与版本

- Undo/Redo 按用户/按 tab/按会话；对话框接受/拒绝后中间动作移出。
- 暂停再生期间改表格/配置不立即重算；切 tab 自动应用；已再生更改不可 undo，只能恢复版本。
- Merge 不能 Undo，只能 revert；删除 workspace 不可撤销；受保护 workspace 只阻止直接几何修改。

---

## 9. 文档密度与“不可直接照搬”的点

### 9.1 文档密度差异极大

- 最厚：Render Studio Libraries（190,369 词，纯目录表）、Glossary（29,390）、Frame Profiles Library（11,568）、Icon Glossary（10,401）。
- 最薄：章节首页 32–58 词、部分约束页 61–92 词、Printing a Drawing 58 词。
- 结论：**不能按词数判断功能重要性**；目录页/术语页是参考资产，不是行为规格。

### 9.2 文档未覆盖、必须 live 的项

- 对话框像素尺寸/颜色/图标/动画/选择高亮 RGB。
- 字段默认值（大量页面未写）、失败原子性、撤销粒度、错误文案层级。
- 移动端缺失项、键盘/触控时序、性能阈值（仅少数页给）。
- 文档内部矛盾（钣金、草图、工程图、装配、账户、发布/PLM 均有）必须 live 裁决。

### 9.3 不应从文档直接推导的实现

- 不能把“文档写了某工具”当成“当前产品已实现”；能力状态以 `docs/parity/STATUS-DEFINITIONS.md` 七维门为准。
- 不能把 Render Studio 的材质目录条目数当成“要实现 3,881 个材质”；应先实现 PBR 参数族与素材管线，再谈库覆盖。
- 不能把 FeatureScript/PCB/CAM 当成核心建模批次；它们是独立应用/DSL/生态，需独立 ADR 或明确 out-of-scope。
- 不能把账户/企业/发布/PLM 写入 iModel schema；它们是平台服务层。

---

## 10. 阅读路径

- 想了解某个域：先读本文章节 → 再读 `sections/<domain>.md`。
- 想做 UI 对齐：读对应 section 的 §4（功能与 UI 明细）与 §7（可执行启示）。
- 想做 AI 工具 schema：读 `03-DOC-DERIVED-REQUIREMENTS.md` + 各 section 的参数/默认值清单。
- 想做差距/排期：读 `02-CAPABILITY-GAP.md`。
- 想复核统计：读 `data/section-summary.md`、`data/tool-catalog.md`、`data/documentation-quality.json`。
