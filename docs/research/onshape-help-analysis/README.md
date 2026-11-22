# Onshape Help 全量文档分析（2026-11-22）

> **分析对象**：<https://cad.onshape.com/help/Content/Home/home.htm>（Onshape 官方帮助中心主入口）
>
> **抓取快照**：2026-11-22；527 个页面均显示 `Last Updated: November 20, 2026`。
>
> **分析方式**：从 MadCap Flare 目录数据（`Data/Tocs/CombinedHelp.js`，2 个分块）枚举全部 527 个主题 → 全量抓取正文 → 抽取标题/TOC 路径/正文/标题层级/交叉链接 → 14 个领域报告并行分析 → 本目录汇总。
>
> **范围**：Onshape 帮助中心全部已发布主题（527/527），不包含 Learning Center 课程、论坛、API 参考站、Arena 侧文档或 Onshape 官方博客。
>
> **原始正文不入库**：仅保留元数据、统计、工具清单和逐领域分析报告；原始 HTML/纯文本留在分析工作区（版权与体积原因）。本目录所有结论都可从公开页面复核。

---

## 0. 执行摘要

1. **这是一套完整的产品文档，而不只是 Part Studio 手册。** 527 个主题横跨草图/特征、装配、工程图、文档与版本、共享协作、发布管理、PLM、渲染、可视化/测量、PCB/CAM、账户与企业治理。
2. **Part Studio 只占文档的 29%**（153/527）。**374 个主题（71%）位于当前 2026-11-19「草图/约束/特征全量对齐」计划的核心建模范围之外**；其中装配 46、工程图 67、文档/发布/PLM 58、账户/订阅 93、渲染 24、可视化/评估 38。
3. **当前能力账本只有 126 行，主体是 Part Studio 邻近域**：19 个约束、5 个实体、21 个 FeatureType、5 个草图外部引用、76 个 tooling/UI 键；其中 tooling 含少量文档菜单/工程图/渲染/装配 gated 占位。状态为 `partial=73 / gated=51 / blocked-kernel=1 / blocked-design=1`，**`full=0`**。装配配合、工程图视图/标注、发布状态机、PLM、仿真、渲染参数、企业权限、PCB/CAM 均没有完整能力 family。
4. **装配文档是一套完整的 3D 装配系统规格**：10 种配合 + 4 种 Relations + 装配阵列/镜像/Replicate + BOM（Structured/Flattened）+ 命名位置/显示状态/爆炸视图 + 上下文建模 + 四种仿真。当前仅有 `ui.assemblyEdit` 一个 gated 入口。
5. **工程图文档是一套完整的制图系统规格**：9 类派生视图、13 个尺寸工具、14 种 GD&T 特征符号、6 类表格、DWT/DWG/DXF、MBD Status、Revision/Inspection 联动。当前仅有 `ui.drawing` 一个 gated 入口。
6. **文档/发布/PLM 是独立的产品层**：文档/页签/版本/分支/合并、权限与共享、导入导出、发布候选/审批/修订/作废、Arena PLM 连接。当前能力账本没有对应 family；计划把这部分视为平台能力，而非建模能力。
7. **渲染/可视化/评估包含大量可独立验收的只读能力**：24 个 Render Studio 主题 + 一个 190,369 词的材质/环境库目录；23 个可视化主题；15 个评估主题（Measure、Mass Properties、11 个分析工具）。当前仅 `ui.render` gated，测量/质量属性的实现也未进入能力账本。
8. **Onshape 的全局 UI 语法本身是可复用规格**：选择语义（单击切换、左→右全含/右→左接触、光标 `5+`）、数值字段解析与步进、对话框蓝底/白底字段契约、接受/取消的撤销粒度、配置可见性 AND 规则、In-Context 快照与手动更新。这些规则可直接转为 AI 工具 schema 与真栈断言。
9. **文档不足以单独支撑“像素级复刻”**：349 个工具页中只有 59 个给出快捷键、62 个写出显式注意事项/限制、287 个没有限制段落；120 个主题含视频转录，15 个工具页少于 100 词。图片在文本抽取中只剩 alt，对话框视觉/图标状态必须继续用 live 证据（P0-03）。
10. **对 AI+CAD 的直接含义**：当前公共前端注册 25 个 `full` tool key、51 个 `gated` key、21 个 FeatureType；而帮助中心有 349 个工具/命令入口。**在这个差距关闭前，不应对外宣称“全量 Onshape AI+CAD”**；应先建立“文档 → 工具规格 JSON → AIRR/ADR → 真栈证据”的单一流水线。

---

## 1. 规模与基本统计

| 指标 | 数值 |
|---|---:|
| 主题（TOC 节点，全部有 URL） | **527** |
| 正文英文词数 | **861,649** |
| 顶层章节 | **24** |
| 含 `Available in:` 的工具/命令页 | **349** |
| 含视频（含转录）的主题 | **120**（其中工具页 111） |
| 给出快捷键的工具页 | **59** |
| 有显式注意事项/限制段落的工具页 | **62** |
| 少于 100 词的页面 | **18**（其中工具页 15） |
| 少于 60 词的页面 | **6**（多为章节首页/纯图页） |
| 页面声明的最后更新 | 527/527 均为 2026-11-20 |
| 跨主题内部链接（可解析） | 2,671 条，207 个章节对 |
| 总图片引用（`[image]`） | **13,716**（视觉信息大量依赖截图） |

**可用位置（`Available in:` 主题计数，一个主题可多值）**

| 工作区 | 主题数 |
|---|---:|
| Part Studio | 89 |
| Drawing | 67 |
| Sketch | 52 |
| Assembly | 43 |
| Render Studio | 24 |
| Assembly + Part Studio | 24 |
| Part Studio + Sketch | 12 |
| Assembly + Part Studio + Sketch | 11 |
| PCB Studio | 3 |
| Variable Studio | 2 |
| Feature Studio / CAM Studio | 各 1 |

跨工作区耦合很强：47 个主题同时可用于 Assembly + Part Studio，29 个用于 Part Studio + Sketch，17 个用于 Assembly + Sketch。工具/选择/对话框不是按产品页签孤立的，不能用“先做 Part Studio 再重做装配/工程图”的方式实现。

---

## 2. 信息架构：24 个章节 → 6 个产品域

| 产品域 | 章节（主题数） | 合计 |
|---|---|---:|
| **Part Studios（核心建模）** | Part Studios（153） | 153 |
| **装配与工程图** | Assemblies（46）、Drawings（67） | 113 |
| **文档 / 协作 / 发布 / PLM** | Documents（28）、Sharing and Collaboration（8）、Importing & Exporting Files（6）、Publications（1）、Release Management（9）、PLM Connections（6） | 58 |
| **可视化 / 评估 / 渲染 / 其他工作室** | Model Visualization Tools（23）、Model Evaluation Tools（15）、Render Studios（24）、PCB Studios（3）、Variable Studios（1）、Feature Studios（1）、CAM Studios（1） | 68 |
| **平台基础 / 账户 / 入门** | Getting Started with Onshape（24）、Shared Modeling Concepts（14）、Account Menu（43）、Managing Your Onshape Account and Subscription（50）、Welcome/Contact（2） | 133 |
| **参考** | Glossary（1）、Icon Glossary（1） | 2 |

### Part Studios（153）内部拆分

| 子域 | 主题数 | 词数 |
|---|---:|---:|
| Feature Tools（核心/钣金/框架/曲线/曲面/MBD 等） | 81 | 134,746 |
| Sketch Tools / Sketch Basics | 57 | 20,237 |
| Model-Based Definition (MBD) | 5 | 12,150 |
| Features and Parts Lists | 1 | 3,995 |
| Surface Modeling / Feature Basics | 2 | 5,626 |
| Part Studios 根页 | 1 | 3,547 |
| Customizing Part Materials / Appearance | 3 | 6,776 |
| Variable Table / Custom Tables / Hole Table | 3 | 2,107 |

其中钣金与框架 23 个主题、41,043 词；曲线/曲面/MBD/表格/材料外观 32 个主题、54,380 词。

---

## 3. 文档特征与质量

### 3.1 结构化程度

- 所有工具页都有统一的 `Available in:` 行，是平台边界的可靠来源（但 24 个章节首页/概念页没有该行）。
- 大量工具页结构为：图标/简介 → Available in → Shortcut（可选）→ 视频（可选）→ 步骤 → 字段说明 → 限制（可选）。
- 349 个工具页中，只有 62 个包含显式的 Note/Important/Tip/Warning/Limitation/Only/Must/Cannot 段落；**默认值、报错行为、失败原子性大多没有文档化**。
- 120 个主题含视频转录；视频转录通常比正文更口语、更完整，但也与正文存在少量冲突（例如 Chamfer 的 Tangent propagation 默认态）。
- 表格经过 HTML 抽取后被压平为 `|` 分隔行；BOM/材料/公差/渲染库等大表的列边界会丢失，统计型结论需要回到原页面复核。

### 3.2 已记录的原文档内部不一致（示例）

- 钣金 `Symmetric` 可用端型：正文写 Blind + Through all，步骤写 Blind only。
- 钣金 `Bend relief depth scale` 上限：正文 1.00–5.00，步骤 1.00–2.00。
- 钣金 `Modify joint` 的 K Factor 允许值原文 “-1000 to 1.00”。
- 草图 `Insert Image` 格式：description 写 PNG/JPEG/BMP，正文含 GIF。
- 草图 `Slot` “同一（未链接）尺寸”与“改尺寸全部联动”表述矛盾。
- 工程图 `Drawing Properties - Formats` 同时写“默认 Locked”和“应为 unlocked”。
- 装配 `Slider` 偏移轴、`Gear` 可接受 Mate 列表、`Parallel` 自由度表述存在不一致。
- 账户 `Enterprise Teams` 的 description 与正文对“成员是否必须是组织用户”表述矛盾。
- 这些冲突不能靠代码“猜”；必须作为 live 采集/产品裁决项登记。

### 3.3 链接与冗余

- 可解析内部链接 2,671 条；高入链主题集中在 Feature Tools、Preferences、Versioning and Branching、Share Documents、钣金表/框架页。
- 模板化重复明显：每个钣金工具页重复 14 项 “Additional sheet metal tools”；多个配合页复用同一视频转录；账户页重复 “Accessing the Account menu”。
- 26 个主题没有任何入链（如 Graphics Area Display Data、Create Menu、Labels、Approving、Cloning a Release Package），是导航孤岛或新页。

---

## 4. 关键发现（按领域）

### 4.1 Part Studios（153）

- **草图**：15 个手动约束 + 自动推断/自动约束；蓝=欠约束、黑=全约束、红=过约束；驱动/从动尺寸；Constraint manager + Profile inspector；56 个草图工具页，含椭圆/圆锥/Bezier/文本/槽/镜像/阵列/Transform/DXF/图片。
- **特征**：Extrude/Revolve/Sweep/Loft/Fillet/Face Blend/Chamfer/Draft/Body Draft/Rib/Shell/Hole/External Thread/Pattern/Mirror/Boolean/Split/Transform/Wrap/Decal/直接编辑/Plane/Helix/Mate Connector/Derived/Variable/Query Variable/Composite Part/Tag/自定义特征。
- **规则密度极高**：Extrude 六种端条件 + 合并范围硬规则；Loft 多截面顺序敏感；Fillet/Face Blend 的 Conic/Curvature/Variable/Partial/Full-round；Pattern 的 Part/Feature/Face 三类与 Skip/第二方向；参数化特征的回滚、抑制、更新语义。
- **钣金**：父特征激活/Finish 停用、折弯表与展开图实时联动、K Factor 0.45/0.5、六类角释放、五类折弯释放、Form 库、框架截面/路径/角型/Cut List。
- **曲线/曲面/MBD**：G0–G3 连续性、Boundary Surface 七种边界条件、11 个曲线工具；MBD/PMI、10 类公差、Inspection 表、默认公差库；材料/外观五级覆盖；Variable/Hole/Custom/Routing 表。
- **平台边界**：iOS/Android 大量“仅查看/编辑桌面创建”的限制；移动端不能创建 Midpoint Line、Body Draft、Query Variable 等。

### 4.2 Assemblies（46）

- 10 种配合（Fastened/Revolute/Slider/Planar/Cylindrical/Pin Slot/Ball/Parallel/Tangent/Width），每种有明确自由度、偏移轴、限位与选择顺序；两实例之间恰好一个 Mate。
- Relations：Gear / Rack and Pinion / Screw / Linear，作用于 Mate 之上。
- 装配工具：Group、Snap、Show Mates、Replicate、Replace Instance、线性/圆周阵列、Mirror（Transform vs Derived）、子装配、显示状态、命名位置、爆炸视图、上下文建模。
- BOM 全链路：Structured/Flattened、子装配三种 BOM 行为、局部抑制/全局排除、模板/CSV/版本只读。
- 仿真：线性静力（六类载荷/三种连接方法/五类结果）、Modal（5/15 阶）、Asynchronous（版本/50 次/24h）、Rigid Body。
- 引用体系：版本/修订/图钉/蓝底图标的复杂状态；Update all 自动建版本；修订需源层更新。

### 4.3 Drawings（67）

- 9 类派生视图（投影/辅助/剖视/对齐剖视/破断剖视/详图/断裂/裁剪/平展）+ View Context Menu。
- 13 个尺寸工具 + 调色板；4 类捕捉点（默认禁中点/四分点，Shift+q 开）；过定义/从动/覆盖尺寸。
- 14 种 GD&T 特征符号、3 基准、最多 5 帧；Surface Finish/Weld/Edge Condition/Callout/Note。
- 6 类表格（BOM/Cut List/Hole/Custom/Revision/Inspection）；固定角默认右上、padding 0.06 in。
- DWT 2013、DWG/DXF 层名、1800 in 纸幅上限；MBD Status 与 Revision/Inspection 联动。
- 图纸元素不支持同时编辑；更新只刷新视图；悬空实体用红色夹点修复。

### 4.4 Documents / Sharing / Release / PLM（58）

- 文档模型：Document/Tab/Workspace/Version/Branch/Merge；自动保存、无限历史、restore points；版本引用可加速装配加载。
- 共享：View/Edit/Copy/Link/Export/Comment；Light 用户；Follow Mode；View Only toolbar；评论与任务。
- 导入导出：STEP/IGES/Parasolid/DXF/DWG/STL/OBJ/3MF/GLTF 等格式矩阵；导入更新语义。
- 发布管理：`In progress → Pending → Released/Rejected/Discarded → Obsolete`；无审批人时创建者即发布；团队 1 票、项目角色 1 票、委派只转个人票；修订单调递增、跳过 I/O/Q/S/X/Z；零件号 ≤128 字符；配置是独立可修订对象。
- PLM：Arena 连接（1 企业↔1 workspace）、Category/Property 映射、BOM/Item 同步、Change 联动、幂等键与错误预检。
- 这些是 PDM/PLM 产品层，不是几何内核能力。

### 4.5 Account / Subscription（93）

- 9 类计划：Free/Standard/Professional/Professional Trial/Student/Educator/EDU Enterprise/Enterprise/Government (US)。
- 组织：Company/Classroom/Enterprise；Owner/Admin/Member/Guest；Full/Light 席位；Project roles + Permission schemes；24 项 Global permissions。
- 企业身份：8 类 SSO、2FA、域名验证、自动 provisioning；企业策略可禁用密码登录。
- 计费：合并计费、席位、续期、取消、降级只读、30 天删除窗口。
- 发布治理：字母修订跳过 I/O/Q/S/X/Z、自定义方案 ≥50 行、水印 64 字符、8 项发布条件。
- 这些属于平台/SaaS 层，若放入 iModel schema 会违反 P0-06 单一数据源边界。

### 4.6 可视化 / 评估 / 渲染 / 其他工作室（68）

- ViewCube、相机/渲染选项 14 个主题、Named Views、Section View、Hide/Show/Isolate/Make Transparent、AR/AVP。
- Measure（12 类测量）、Mass Properties（Part/Face 两页）、11 个分析工具（Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten 等）。
- Render Studio：场景/相机/材质/环境/灯光/体积/AxF/Appearance Set；普通输出 2.1MP、Advanced 100MP、Multiple 最多 60 视图；材质与环境库目录 190,369 词，含 3,881 个外观 / 144 个文件夹与 390 个环境 / 21 个标签。
- Variable Studio、Feature Studio（FeatureScript）、PCB Studio（含 Rigid-Flex、Altium 365）、CAM Studio。

### 4.7 全局 UI 语法（跨领域）

- 选择：单击切换；左→右全含、右→左接触；光标最多 `5+`；Space 清空；Shift 列表范围；Ctrl+拖选取消。
- 数值字段：滚动 0.1 / Ctrl 0.01 / Shift 1.0；单位关键字与 FeatureScript 表达式；单位必须一次方；非法表达式红框/禁用确认。
- 对话框：蓝底字段来自图形区选择，白框字段键盘输入；Enter/Shift+Enter；接受后中间动作不进入 Undo/Redo；只读用户可看不可改。
- 特征编辑：默认回滚到该特征状态；非最后特征显示 `Final`；合并范围默认 `Merge all`；Add/Remove/Intersect 无 merge scope 报错。
- 配置：List/Checkbox/变量三类输入；可见性 AND、仅受上方输入控制、隐藏取默认；选项规则仅 List。
- In-Context：快照 + 手动更新；蓝点=过期；主实例实心箭头；更新永不自动。

---

## 5. 与当前 LubanCAD 能力账本/计划的差距（头条）

> 数据来源：`docs/parity/capability-ledger.json`（2026-11-19，126 行）、`luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts`（25 full + 51 gated）、`docs/superpowers/plans/2026-11-19-onshape-full-parity.md`。

| 维度 | Onshape 文档 | 当前 LubanCAD |
|---|---:|---|
| 主题总量 | **527** | 能力账本 126 行 |
| Part Studio 主题 | 153 | 126 行主体为草图/特征/工具；另有少量文档/工程图/渲染/装配 gated 占位，无完整 domain family |
| 装配 | 46 主题、10 种配合、4 种关系 | `ui.assemblyEdit` 1 个 gated 入口；无配合/BOM/仿真能力行 |
| 工程图 | 67 主题、9 类视图、13 尺寸工具、14 GD&T | `ui.drawing` 1 个 gated 入口；无视图/标注/表格能力行 |
| 文档/发布/PLM | 58 主题 | 少量 workspace/document 菜单 gated；无版本/发布/PLM 能力行 |
| 渲染/可视化/评估 | 68 主题 | `ui.render` gated；Measure/Mass Properties 未入账本；11 个分析工具未入账本 |
| 账户/企业 | 93 主题 | 认证/账户基础；无企业权限/SSO/计费能力行 |
| 能力状态 | — | `partial=73 / gated=51 / blocked=2 / full=0` |
| UI 注册 | 349 个工具/命令页 | 25 个 full key + 51 个 gated key；21 个 FeatureType |

**结论**：当前 2026-11-19 计划是一个**严格、诚实的 Part Studio 子集计划**，不是全产品对齐计划。文档分析证明产品面远大于该计划；如果产品目标仍是“全量 Onshape 能力 → AI+CAD”，必须显式做出范围裁决，并把新增域登记为独立轨道（见 `02-CAPABILITY-GAP.md`）。

---

## 6. 本目录内容

| 路径 | 内容 |
|---|---|
| [`01-PRODUCT-SURFACE.md`](./01-PRODUCT-SURFACE.md) | 按 6 个产品域的全景分析：对象模型、工作流、UI 语法、平台边界、文档密度 |
| [`02-CAPABILITY-GAP.md`](./02-CAPABILITY-GAP.md) | 与能力账本/运行时注册表/2026-11-19 计划的逐域差距、范围裁决与波次建议 |
| [`03-DOC-DERIVED-REQUIREMENTS.md`](./03-DOC-DERIVED-REQUIREMENTS.md) | 文档→工具规格 JSON 的抽取模板、置信度标记、验收断言清单、live 采集优先级 |
| [`sections/`](./sections/) | 14 份逐领域分析报告（逐主题摘要、概念/术语、UI/参数/工作流、LubanCAD 启示） |
| [`data/topics.json`](./data/topics.json) | 527 主题的机器可读元数据（标题、URL、TOC 路径、词数、可用位置、快捷键、标题层级） |
| [`data/topics.csv`](./data/topics.csv) | 同上 CSV 投影 |
| [`data/toc-tree.md`](./data/toc-tree.md) | 完整目录树（527 主题，带词数） |
| [`data/section-summary.md`](./data/section-summary.md) | 24 章节规模/平台/视频/图片汇总 |
| [`data/tool-catalog.md`](./data/tool-catalog.md) | 349 个含 `Available in:` 的工具/命令总表 |
| [`data/platform-matrix.json`](./data/platform-matrix.json) | 工作室共现矩阵（Assembly+Part Studio 等） |
| [`data/keyword-index.json`](./data/keyword-index.json) | 跨主题关键词索引（装配/工程图/版本/权限/渲染等） |
| [`data/documentation-quality.json`](./data/documentation-quality.json) | 每主题文档完整度指标与低文本页清单 |
| [`data/cross-reference-graph.json`](./data/cross-reference-graph.json) | 内部链接图、高入链主题、孤岛页 |
| [`data/shortcuts.json`](./data/shortcuts.json) | 含快捷键的主题清单 |

### 14 份逐领域报告

| 报告 | 覆盖主题 |
|---|---:|
| [`sections/ps-sketch.md`](./sections/ps-sketch.md) | 58（Part Studio 外壳 + 草图全部工具） |
| [`sections/ps-core.md`](./sections/ps-core.md) | 40（核心实体特征） |
| [`sections/ps-sheet-frame.md`](./sections/ps-sheet-frame.md) | 23（钣金 + 框架） |
| [`sections/ps-advanced-mbd.md`](./sections/ps-advanced-mbd.md) | 32（曲线/曲面/MBD/表格/材料外观） |
| [`sections/assemblies.md`](./sections/assemblies.md) | 46（装配） |
| [`sections/drawings.md`](./sections/drawings.md) | 67（工程图） |
| [`sections/documents.md`](./sections/documents.md) | 43（文档/导入导出/共享/发布物） |
| [`sections/release-plm.md`](./sections/release-plm.md) | 15（发布 + PLM） |
| [`sections/account-menu.md`](./sections/account-menu.md) | 43（账户菜单 + 企业设置） |
| [`sections/account-subscription.md`](./sections/account-subscription.md) | 50（订阅与账户管理） |
| [`sections/foundations.md`](./sections/foundations.md) | 40（入门/共享建模概念/支持） |
| [`sections/view-eval-glossary.md`](./sections/view-eval-glossary.md) | 40（可视化/评估/术语/图标） |
| [`sections/render-other-studios.md`](./sections/render-other-studios.md) | 29（渲染核心 + Variable/Feature/PCB/CAM） |
| [`sections/render-libraries.md`](./sections/render-libraries.md) | 1（190,369 词的材质/环境库目录） |

---

## 7. 方法、可重复性与边界

### 7.1 枚举与抓取

1. 首次匿名访问 `Content/Home/home.htm` 会 302 到 `/signin`；用一个 cookie jar 先请求一次即可获得访客会话 `_u=webservice-…`，随后 527 个主题均可匿名读取（`robots.txt` 明确 `Allow: /help`）。
2. TOC 来自 `https://cad.onshape.com/help/Data/Tocs/CombinedHelp.js` 与 `CombinedHelp_Chunk0/1.js`；解析 `tree` + URL→标题映射，得到 527 个主题、无重复。
3. 抓取并发 4、单请求 120 s 超时、失败重试 4 次；527/527 成功，0 失败。总耗时约 155 s。
4. 正文抽取范围：`div[role=main]#mc-main-content` 到 `hr.PageEnd` / AI advisor 脚本；保留标题层级、列表、表格（压平）、图片 alt、视频转录。
5. 交叉链接按主题 URL 解析，忽略图片等非 `.htm` 资源。

### 7.2 统计口径

- 词数按 `[A-Za-z0-9]+` 计，不含纯中文/符号；对英文帮助文档近似可用。
- `Available in:` 可能一行多值（如 `Sketch, Part Studio`），统计时按完整字符串计数，并另有拆分的共现矩阵。
- “工具页”= 正文含 `Available in:` 的主题；章节首页/概念页不算。
- “有显式注意事项/限制”= 行首匹配 Note/Important/Tip/Warning/Limitation/Only available/Cannot/Must 的段落。
- 内部链接统计包含模板化重复（例如每个钣金页的 Additional tools 列表），因此高入链值不等于内容重要性。

### 7.3 不能从文档得出的结论

- 文档不覆盖：鼠标/触控的精确坐标与手势时序、对话框像素尺寸/颜色、图标形状与状态、动画时长、选择高亮的实际 RGB、错误弹窗的精确文案与层级。
- 文档经常不写：字段默认值、失败原子性、撤销粒度、性能阈值（少数页面例外）、移动端缺失项。
- 上述必须继续走 `docs/ONSHAPE-LIVE-REPLICATION.md` 的 live 副本/CDP 采集；本分析不替代 live 证据，也不把“文档没写”当成“没有该行为”。

---

## 8. 维护

- 本目录是**公开、脱敏**的文档分析；不含原始页面全文、账号信息、私有仓库路径或 live 截图。
- 若 Onshape 更新帮助中心，重建步骤：重新拉取 TOC → 全量抓取 → 重新生成 `data/*` → 重跑 14 组分析 → 对照本 README 的统计基线更新。
- 文档索引：本目录由 `docs/README.md` 的“技术参考”索引引用。
- 配套架构评估：[`../lubancad-architecture-assessment/README.md`](../lubancad-architecture-assessment/README.md)——把本目录的能力面映射到 LubanCAD 全栈的 A/B/C/D 就绪矩阵与架构裁决。
