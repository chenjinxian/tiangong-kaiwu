# Onshape 文档能力面 × LubanCAD 能力账本：差距与范围裁决

> **文档基线**：Onshape Help 527 主题 / 861,649 词，2026-11-20 更新（抓取于 2026-11-22）。
>
> **代码基线**：
> - `docs/parity/capability-ledger.json`：126 行，2026-11-19 生成；状态 `partial=73 / gated=51 / blocked-kernel=1 / blocked-design=1`，**`full=0`**。
> - `luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts`：25 个 `full` key + 51 个 `gated` key（共 76）。
> - `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`：21 个 `LubanFeatureType`。
> - `docs/superpowers/plans/2026-11-19-onshape-full-parity.md`：当前唯一主线，范围明确为草图/约束/特征 + 全语料示例。
>
> **本文只做差距事实与范围建议，不修改能力账本、不改代码、不做发布。**

---

## 0. 一句话结论

**Onshape 帮助中心描述的是一个完整的云 CAD + PDM + 企业协作产品；当前 LubanCAD 的「全量 Onshape 对齐」计划是一个严格、诚实的 Part Studio 子集计划。**
两者并不矛盾，但必须显式区分：**Part Studio 对齐 ≠ 全量 Onshape 对齐**。文档中 71% 的主题（374/527）位于当前计划的建模范围之外；能力账本中 **0 行**覆盖装配、工程图、发布、PLM、仿真、渲染、账户/企业。

---

## 1. 总览矩阵

| 产品域 | 文档主题 | 文档词数 | 当前能力账本覆盖 | 运行时/代码现状 | 差距判定 |
|---|---:|---:|---|---|---|
| Part Studios（草图/特征） | 153 | 189,184 | 126 行主体在此邻近域（约束 19 / 实体 5 / 特征 21 / 草图外部引用 5 / tooling 76；tooling 含少量跨域 gated 占位） | 25 full key + 51 gated key；21 FeatureType；20 个草图工具、17 个约束（计划基线） | **大但已有主计划**；多数能力仍 partial/gated，`full=0` |
| Assemblies | 46 | 64,634 | **0 个 assembly family**（仅 `ui.assemblyEdit` gated 占位） | 未见配合/BOM/仿真能力项 | **未进入账本/计划** |
| Drawings | 67 | 59,604 | **0 个 drawing family**（仅 `ui.drawing` gated 占位） | 未见工程图引擎/视图/标注能力项 | **未进入账本/计划** |
| Documents / Sharing / Import / Publications | 43 | 60,179 | 少量 workspace/document 菜单 gated；无版本/权限/导入 family | Changeset/Named Version 部分可用；冲突检测 mock；导入导出未覆盖 | **平台能力缺口** |
| Release Management / PLM | 15 | 28,401 | **0 个 release/plm family** | 未见发布状态机/修订/PLM 能力项 | **未进入账本/计划** |
| Render Studios | 24（含库目录页） | 239,428（其中库 190,369） | **0 个 render family**（仅 `ui.render` gated） | 未见 Render Studio 能力项 | **未进入账本/计划** |
| Model Visualization / Evaluation | 38 | 21,338 | 仅 selection/print 等少量 UI 键；无 measure/analysis family | viewer 注册 iTwin 测量工具；无 11 个分析工具 | **只读能力部分存在，未账本化** |
| PCB / Variable / Feature / CAM Studios | 6 | 14,466 | Variable 相关 UI 少量；FeatureScript 计划排除；PCB/CAM 0 | 变量在 Part Studio 内有实现；无独立工作室 | **大部分范围外或独立 ADR** |
| Account / Subscription | 93 | 100,062 | **0 行** | 认证/账户基础；无企业管理员/SSO/计费/分析 | **平台/SaaS 层，未账本化** |
| Getting Started / Shared Concepts / Welcome / Contact | 40 | 44,562 | 部分全局 UI 键（selection/selectOther/createSelection/selectionFilters/print/notifications） | UI 对齐已有大量工作；快捷键/性能/配置/In-Context 未账本化 | **部分覆盖，缺系统化账本** |
| Glossary / Icon Glossary | 2 | 39,791 | **0 行**（参考页） | 无 | **参考资产，非能力** |

> 注：账本 126 行与文档 153 个 Part Studios 主题不是一一对应关系；账本按约束/实体/FeatureType/UI key 计，文档按工具/概念页计。表中「0 行」指没有该 domain 的 capability family，而不是“产品绝对没有一行代码”。

---

## 2. Part Studios：已有主计划，但仍远未收口

### 2.1 文档能力面

- **草图 58 主题**：15 个手动约束 + 自动推断/自动约束；驱动/从动尺寸；Constraint manager/Profile inspector；56 个草图工具页（线/矩形变体/圆/弧/椭圆/圆锥/多边形/样条/Bezier/点/文本/槽/镜像/阵列/Transform/Trim/Extend/Split/Offset/Fillet/Chamfer/Use/Intersection/Pierce/Construction/DXF/图片）。
- **核心特征 40 主题**：Extrude/Revolve/Sweep/Loft/Thicken/Enclose/Fillet/Face Blend/Chamfer/Draft/Body Draft/Rib/Shell/Hole/External Thread/Pattern/Mirror/Boolean/Split/Transform/Wrap/Decal/Delete Part/Modify Fillet/Delete Face/Move Face/Replace Face/Plane/Helix/Mate Connector/Derived/Variable/Query Variable/Composite Part/Tag/Add Custom Features。
- **钣金/框架 23 主题**：Sheet Metal Model（Convert/Extrude/Thicken）+ 14 个后续工具 + 折弯表/展开图；Flex PCB；Frame/Frame Trim/Gusset/End Cap/Cut List。
- **曲线/曲面/MBD/表格/材料 32 主题**：7 个曲面工具、11 个曲线工具、MBD/PMI/公差/Inspection、材料/外观、Variable/Hole/Custom/Routing 表。
- **平台差异**：移动端对 Midpoint Line、Body Draft、Query Variable、部分阵列/文件夹/子装配操作有“仅查看/编辑桌面创建”限制。

### 2.2 账本/运行时现状

- 126 行中：19 个约束（含 `slotWidth` 的部分实现）、5 个实体（line/arc/circle/point/spline）、21 个 FeatureType、5 个草图外部引用、76 个 tooling/UI key。
- 状态：`partial=73`（有真实实现但缺七维 full 门）、`gated=51`（入口可见、点击能力引导）、`blocked-kernel=1`（INTERSECTED）、`blocked-design=1`（SILHOUETTED）。
- 运行时注册 25 个 full key：selection、sketch、extrude、fillet、chamfer、revolve、sweep、loft、hole、linearPattern、circularPattern、mirror、boolean、splitPart、transform、sketchMidline、sketchSlot、sketchChamfer、sketchConcentric、sketchPierce、sketchSymmetric、moveFace、cPlane、draft、shell。
- 51 个 gated key 包含：faceBlend、thicken、curvePattern、wrap、decal、sketchText/Conic/Ellipse/EllipseArc/SplineControlPoints/Intersection/InsertImage/Normal/Curvature/Flow、mateConnector、derived、variable、queryVariable、compositePart、tag、selectionFilters、createSelection、selectOther、deleteBodies、modifyFillet、deleteFace、replaceFace、userFeatures、rib、thread、sheetMetal、frames、surfaces、curves、render、drawing、material、appearance、notifications、print、assemblyEdit、dependencies、moveDocument/restoreWorkspace/copyWorkspace/updateWorkspace/workspaceProperties、insertElement、pauseRebuild、featureHistory。

### 2.3 具体缺口（文档已写、账本未覆盖或仅 gated）

| 子域 | 文档已写但账本缺口 | 建议 |
|---|---|---|
| 草图 | Line/Arc/Circle/矩形变体/多边形/样条/Bezier/Text/Slot/Mirror/Pattern/Transform/Trim/Extend/Split/Offset/Fillet/Chamfer 等工具级能力没有逐工具行；15 个手动约束中仅 19 个 kind 有行（含派生）；Constraint manager/Profile inspector 无行 | 按工具/诊断分别建行；区分 `full` 与 `gated`，不要用 “sketch” 一行概括 |
| 特征 | Sheet Metal、Frame、Curves、Surfaces、MBD、Materials、Tables、Thread、Wrap、Decal、Modify Fillet 等大量 gated/缺失；Extrude/Revolve/Sweep/Loft/Fillet/Chamfer 的端条件/模式分支没有逐分支行 | 复用 `feature-depth-matrix.md`，按分支建 `feature.*.endBound.*` / `feature.fillet.mode.*` 等 |
| 钣金/框架 | `ui.sheetMetal`/`ui.frames` 只有 gated 入口；折弯表、展开图、Form 库、Cut List 无能力行 | 独立 track；当前计划已 `excluded-sheet-metal`，应保留但明确“范围外” |
| 曲线/曲面 | `ui.curves`/`ui.surfaces` gated；Boundary/Fill/Ruled/Constrained/Mutual Trim/Offset Surface 无行 | 先登记为 `planned`/`excluded`，不要用 gated 掩盖内核缺口 |
| MBD/公差 | `ui.material`/`ui.appearance` gated；MBD/PMI/Inspection/公差库无行 | 独立 MBD track；需要面引用稳定 ID 与尺寸-特征双向关联 |
| 表格 | Variable/Hole/Custom/Routing/Inspection 表只有零散 UI；无结构化能力行 | 与 Part Studio 面板/数据投影一起做 |

---

## 3. Assemblies：完整 3D 装配系统，当前账本为零

### 3.1 文档能力面

- **10 种配合**：Fastened、Revolute、Slider、Planar、Cylindrical、Pin Slot、Ball、Parallel、Tangent、Width；每种有明确 DOF、偏移轴、限位、选择顺序与错误条件。
- **4 种 Relations**：Gear、Rack and Pinion、Screw、Linear；作用于 Mate 之上，约束 DOF 比例。
- **装配工具**：Mate Connector（显式/隐式）、Group、Snap、Show Mates、Replicate、Replace Instance、线性/圆周阵列、Mirror（Transform vs Derived，自动版本、运动跟随原体）、子装配、显示状态、命名位置、爆炸视图、上下文建模。
- **BOM**：Structured/Flattened、子装配三种 BOM 行为、局部抑制/全局排除、模板/CSV/版本只读。
- **仿真**：线性静力（六类载荷/三种连接方法/五类结果）、Modal（5/15 阶）、Asynchronous（版本/50 次/24h）、Rigid Body（不计 100 实例上限）。
- **引用体系**：版本/修订/图钉/蓝底图标；Update all 自动建版本；修订需源层更新。

### 3.2 账本/运行时现状

- 能力账本仅有 `ui.assemblyEdit` 一个 gated 占位；**没有 assembly.mate.*、assembly.relation.*、assembly.bom.*、assembly.simulation.* family**。
- 运行时看不出装配编辑/配合求解/BOM/仿真的能力注册。
- 2026-11-19 计划把 assembly/drawing-only 示例登记为 `excluded-assembly-only`，不产生 Part Studio；这与“做装配能力”不是同一件事：当前计划明确不覆盖装配产品域。

### 3.3 缺口与建议

- **最小可验证切片**：Mate Connector + 10 种 Mate 的 DOF/偏移/限位 + 装配求解 + 实例列表 + 子装配 + BOM（Structured/Flattened）+ 撤销/版本。
- **求解器**：需要 3D 装配约束求解。当前绳墨（ShengMo）是 solver-neutral 的草图约束层；装配是新的 3D 约束问题，必须先做 AIRR/ADR（接口中立、不把装配语义塞进草图求解器）。
- **数据模型**：装配层级、实例、Mate/Relation、BOM 投影必须基于 iModel/BIS + `params`；BOM 是派生投影，不是第二套数据源（P0-06）。
- **优先级**：Mate/BOM 先于仿真；仿真（尤其异步/结果存储）是独立的高成本轨道，不能与基础装配混在一波。

---

## 4. Drawings：完整制图系统，当前账本为零

### 4.1 文档能力面

- **9 类派生视图**：投影、辅助、剖视、对齐剖视、破断剖视、详图、断裂、裁剪、平展（钣金）。
- **13 个尺寸工具** + Dimension palette；4 类捕捉点；默认禁中点/四分点（Shift+q 开）；从动/覆盖尺寸。
- **注释/符号**：Datum/Datum Target、Geometric Tolerance（14 种特征符号、3 基准、最多 5 帧）、Surface Finish、Weld Symbol、Edge Condition、Note、Callout/Balloon。
- **表格**：Table、BOM、Cut List、Hole、Custom、Revision、Inspection；固定角默认右上、padding 0.06 in。
- **模板/导出**：DWT 2013；DWG/DXF 层名 `BORDER_FRAME`/`BORDER_ZONES`/`TITLE_BLOCK`；1800 in 纸幅上限。
- **MBD/发布联动**：MBD Status、Inspection、Revision、Release management；图纸更新只刷新视图；悬空实体红色夹点。
- **平台边界**：图纸元素不支持同时编辑；移动端主要查看/导出。

### 4.2 账本/运行时现状

- 仅 `ui.drawing` 一个 gated 占位；**没有 drawing.view.*、drawing.dimension.*、drawing.annotation.*、drawing.table.*、drawing.template.* family**。
- 没有 DWT/DWG/DXF 工程图引擎的能力项；没有 MBD/Revision 联动。

### 4.3 缺口与建议

- 工程图是**独立的大型产品域**，不是 Part Studio 的“导出功能”。至少需要：
  1. Drawing 数据模型（Sheet/View/Dimension/Annotation/Table/Revision）；
  2. 视图投影与关联更新（父/子视图、链接视图、配置/显示状态）；
  3. 尺寸/标注/表格引擎；
  4. DWT/DWG/DXF 交换；
  5. Release/Revision/Inspection 联动。
- **依赖顺序**：装配 BOM（`4`）与 Part Studio MBD（尺寸/公差/面引用）是工程图 BOM/标注的前置；建议工程图基础视图/尺寸先做，GD&T/焊接/检验/发布联动后做。
- **明确边界**：若产品短期不做工程图，应在能力账本登记为 `excluded` 或 `planned`，不能在 UI 上保留可点击假入口。

---

## 5. Documents / Sharing / Release / PLM：PDM 产品层

### 5.1 文档能力面

- **文档模型**：Document/Tab/Workspace/Version/Branch/Merge；自动保存、无限历史、restore points；版本不可变；分支末端最多一个 workspace；Merge/Restore 按 tab Keep/Merge/Replace；Merge 不能 Undo，只能 revert。
- **共享/协作**：Can edit/Can view + Copy/Link/Export/Share/Comment/Delete；Link 依赖 Export；Free 仅查看；Light 用户；Follow Mode；View Only toolbar；评论不入历史；任务一次一人。
- **导入/导出**：导入上限 4GB、三策略七选项；STEP/IGES/Parasolid/DXF/DWG/STL/OBJ/3MF/GLTF 等格式矩阵；STEP 默认米；邮件链接默认 3 天。
- **发布管理**：候选选择、审批人、审阅/批准/拒绝、典型发布工作流、历史/作废、克隆发布包、配置发布；审批条件、水印、审计。
- **PLM**：Arena 连接、BOM/Item 同步、变更流程。

### 5.2 文档明确的关键规则

- **版本**：新文档自动有 Start version + Main workspace；版本不可变；分支末端最多一个 workspace；Tab 顺序共享、active tab 不共享；Tab 文件夹最多 10 层。
- **Merge/Restore**：按 Tab Keep/Merge/Replace；Merge 不能 Undo，只能 revert（revert 会丢合并后的新改动）；Restore 只同分支；删除 workspace 不可撤销；Workspace protections 只阻止直接几何修改，允许建版本/分支/合并/发布元数据。
- **导入/导出**：单文件 ≤4GB；三种导入策略 + 7 个处理选项；Assembly 层级 >100 唯一零件时 Split 额外建文档；STEP 未勾自定义单位默认 Meters；邮件链接默认 3 天；非法文件名替换为 `-`。
- **发布状态机**：`In progress → Pending → Released/Rejected/Discarded`；`Released → Obsolete`；无审批人时创建者即发布；有审批人时 Submit 生成 Pending 版本；Discard 仅创建者/管理员且仅 Pending；状态变更绑定不可变版本，工作区永不写 State。
- **审批**：团队 1 名成员即通过（即使勾选 Require approval from all approvers）；项目角色 1 次批准代表整个角色；个人+角色重复需两次；委派只转移个人票、不可传递；拒绝权包含管理员与创建者。
- **修订/零件号**：修订方案 alphabetic/numeric/custom；单调递增、可跳号、跳过标签永不可用；首次导入尽量保留（不匹配警告调整）；Onshape 零件号 ≤128 字符、Arena ≤200；禁止同一 PN 以更低修订重发；配置是独立可修订对象。
- **PLM（Arena）**：1 企业 ↔ 1 Arena workspace；Workspace=Working Revision、Version≈Revision Control、Release candidate≈Arena Change；单向上传 + 审批事件回传；幂等键=零件号+BOM 行+Change；文件 PDF/STEP/DXF/GLTF/PVZ；失败必须有明确错误态/预检。

### 5.3 账本/运行时现状

- 账本没有 `document.*`/`version.*`/`release.*`/`plm.*` family；只有 `ui.copyWorkspace`/`moveDocument`/`restoreWorkspace`/`updateWorkspace`/`workspaceProperties`/`notifications`/`insertElement`/`dependencies` 等 gated 菜单项。
- 运行时已有 Changeset/Named Version 部分能力；冲突检测为 mock、冲突解决 no-op（见 `luban-cad/CLAUDE.md` 功能状态表）。
- 导入/导出在计划中属于 `excluded-import`；FeatureScript 属于 `excluded-custom-feature`；sheet metal 属于 `excluded-sheet-metal`。

### 5.4 缺口与建议

- **文档/版本/权限**是 CAD 数据可信度的基础，建议在能力账本中单列 `document.*` family，状态按证据判定；不要把它们混入 `ui.*` gated。
- **发布/PLM**是独立产品层：发布工作流是 JSON 状态机（状态/迁移/动作/条件/审计），Arena 是外部集成；不应写入 iModel schema，应作为平台服务与文档元数据。
- **导入/导出**：当前计划明确排除；如果产品要支持 Onshape 对标，需单独 ADR（ACIS InterOp 授权边界、STEP/healing 禁止项仍适用）。
- **优先级**：版本/权限/评论 → 导入导出（若授权）→ 发布工作流 → PLM 连接。不要在没有发布状态机的情况下先做 Revision 表/工程图发布联动。

---

## 6. Render / Visualization / Evaluation：只读与渲染能力

### 6.1 文档能力面

- **Render Studio 24 主题**：场景列表（上层优先 + override）、相机、外观/材质、环境、灯光、Render Options（普通 2.1MP；Multiple 最多 60 视图；Advanced 100MP）、AxF、Appearance Set、Volume（Mie/Anisotropic/OpenVDB）；场景是导入时的版本快照，更新需建版本/Reference manager。
- **材质/环境库目录 1 主题 190,369 词**：5 张表、4,535 行；Appearances **3,881 条 / 144 个文件夹**（24 顶层 + 120 二级）、2,388 个 subheading；Environments **390 条 / 21 个标签 / 2,307 次标签赋值**；Functions 65 行、Modifiers 18 行、28 种 blend mode、9 种投影；Part Studio Material→Appearance 映射 181 个材质→63 个外观（60 颜色、1 透明）。数据有 24 条完全重复行、65 个重复键、拼写错误。是渲染器材质模型、IBL/HDR 环境、UV/纹理通道的覆盖面清单，但不是逐条实现清单。
- **可视化 23 主题**：ViewCube、相机/渲染选项 14 个主题、Named Views、Section View、Hide/Show/Isolate/Make Transparent、AR/AVP、移动端触控。
- **评估 15 主题**：Measure（12 类测量）、Mass Properties（Part/Face 两页）、11 个分析工具（Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten 等）。

### 6.2 账本/运行时现状

- 仅 `ui.render` gated；没有 `render.*`、`measure.*`、`analysis.*` family。
- viewer 注册了 iTwin 测量工具，但 Onshape 的 12 类测量语义/单位/动态更新/参考坐标系没有账本行。
- ViewCube/显示设置/外观面板已有 UI 工作；但 Named Views、Section View、Isolate/Make Transparent 的完整语义未系统账本化。

### 6.3 缺口与建议

- **P0（日常闭环）**：ViewCube/Camera & render options 默认值、Named Views、Section View、Hide/Show/Isolate/Make Transparent、Measure、Mass Properties。
- **P1**：11 个分析工具（尤其 Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten）。
- **P2**：Render Studio（材质/环境/灯光/输出）与 AR/AVP；渲染器实现需要独立 ADR，不能沿用 iTwin 默认渲染器直接宣称 Render Studio。
- **材质库**：190k 词目录不是“都要实现”的清单，但给出了材质参数族（bump/orientation/reflectivity/anisotropy/ior/top coat/UV 等）与环境分类标签；应先做 PBR 材质模型/IBL，再谈库条目覆盖。

---

## 7. Account / Subscription / Enterprise：平台与 SaaS 层

### 7.1 文档能力面

- 9 类计划；Company/Classroom/Enterprise；Owner/Admin/Member/Guest；Full/Light 席位；Project roles + Permission schemes；24 项 Global permissions。
- 企业身份：8 类 SSO、2FA、域名验证、自动 provisioning、禁用密码登录。
- 计费：合并计费、席位、续期、取消、降级只读、30 天删除窗口、4 年不活跃策略。
- 发布治理：字母修订跳过 I/O/Q/S/X/Z、自定义方案 ≥50 行、水印 64 字符、8 项发布条件。
- 分析与审计：Activity、Action Items、Analytics 仪表板、定时报表、Webhooks。

### 7.2 账本/运行时现状

- 账本 0 行；认证/账户基础已有，但企业管理员/SSO/计费/分析/Audit 能力未见能力行。
- 这些能力不应写入 iModel/BIS schema；应是服务端权威数据 + 前端动态裁剪 + 审计。

### 7.3 建议

- 如果产品定位是 SaaS，账户/企业层必须独立规划；如果只做单机/小团队，可在能力账本中登记 `excluded` 并明确产品边界。
- 不要把“页签可见性”仅做前端隐藏；文档中的权限语义要求服务端强制（Guest 不可进组织设置；Light 权限白名单；SSO 禁用密码等）。

---

## 8. 全局 UI 基础：账本只覆盖了碎片

文档中的全局语法不是“某个工具”的能力，而是所有工具的共同契约：

| 全局能力 | 文档要点 | 账本现状 |
|---|---|---|
| 选择 | 单击切换、左→右全含/右→左接触、`5+`、Space 清空、Shift 范围、Ctrl+拖选取消 | `ui.selection` partial；`createSelection`/`selectOther`/`selectionFilters` gated |
| 数值字段 | 0.1/0.01/1.0 步进、单位关键字、FeatureScript 表达式、单位一次方、非法红框/禁提 | 无独立行 |
| 对话框契约 | 蓝底选择字段/白框键盘字段、Enter/Shift+Enter、接受后中间动作不入 Undo/Redo、只读可看不可改 | 无独立行 |
| 撤销粒度 | 对话框接受/拒绝后临时动作移出 Undo/Redo；按用户/按 tab/按会话 | 部分实现；无账本行 |
| 特征编辑 | 回滚到特征状态、Final、Merge all 默认、无 merge scope 报错 | 无独立行 |
| 配置 | List/Checkbox/变量三类输入、AND 可见性、隐藏取默认、选项规则仅 List | 无独立行 |
| In-Context | 快照 + 手动更新、蓝点过期、主实例锚定、永不自动 | 无独立行 |
| 快捷键 | Shift+/ 速查、可自定义/禁用/重置、冲突三分型 | 无独立行 |
| 性能面板 | 10s/30s/60s/500/1500/5s/250ms 阈值、5 级细分、1×/10×/100× | 无独立行 |

**建议**：在能力账本中建立 `ui.global.selection`、`ui.global.numeric-fields`、`ui.global.dialog-contract`、`ui.global.undo-granularity`、`ui.global.configurations`、`ui.global.in-context`、`ui.global.shortcuts`、`ui.global.performance` 等行，按七维门验收；否则每个工具都会重复“看起来有、实际不一致”的问题。

---

## 9. 与 2026-11-19 主线计划的范围冲突

### 9.1 计划当前明确写的内容

- 目标：草图/约束/特征全量严格对齐 + 全语料示例验证。
- 波次 W0–W8；退出标准是能力账本/ACIS 探针/三态 registry。
- 明确排除：
  - `blocked:excluded-import`（81 PS）：STEP/healing/importForeign/importDerived；
  - `blocked:excluded-custom-feature`（25 PS）：任意 FeatureScript 解释器；
  - `blocked:excluded-sheet-metal`（18 PS）：钣金子系统；
  - `excluded-assembly-only`：不产生 Part Studio，不计 Part 完成率；
  - 非几何 decal/mateConnector/image：单列显示/非几何轨道。

### 9.2 文档揭示的未覆盖域

- 装配、工程图、发布管理、PLM、渲染、评估、账户/企业设置、PCB/CAM、Feature Studio、导入导出、钣金、MBD 均为文档中的完整主题，但不在当前计划的完成定义内。
- 这不是计划缺陷；是**范围声明不清**的风险：对外说“全量 Onshape”时，会被理解为覆盖 527 个主题，而实际计划只覆盖 Part Studio 子集。

### 9.3 三个选项

| 选项 | 含义 | 风险 | 建议 |
|---|---|---|---|
| A. 保持现状，改口径 | 计划改名为“Part Studio 草图/约束/特征严格对齐”；其他域明确 out-of-scope | 产品目标“全量 Onshape AI+CAD”不能兑现 | 若近期资源只够 Part Studio，选 A，并更新对外文案 |
| B. 全产品扩展 | 增加装配/工程图/PDM/发布/渲染/评估/企业轨道 | 资源/周期/内核/求解器成本巨大；装配与工程图需要新子系统 | 若产品目标确实是全量，选 B，但要分多年波次与独立 ADR |
| C. 混合（推荐） | 保持 Part Studio 主线；同时建立产品级能力账本与“范围外登记”；按商业优先级启动 B0（文档/版本/权限）与 B1（装配 Mate/BOM），工程图/渲染/企业后置 | 需要治理多个 track，避免假绿 | 先做 C：把“未覆盖”变成显式 `planned/excluded`，再逐域立项 |

---

## 10. 建议的产品级能力 taxonomy（便于后续建账本）

```
sketch.*            实体/约束/工具/诊断/外部引用
feature.*           21 个 FeatureType + 分支（endBound/mode/mergeScope…）
sheetMetal.*        模型/折弯/展开/Form/表/角释放
frame.*             截面/路径/角型/Trim/Gusset/EndCap/CutList
curve.*             11 个曲线工具
surface.*           7 个曲面工具
mbd.*               尺寸公差/PMI/Inspection/默认公差库
material.*          材料库/自定义材料/密度/属性
appearance.*        零件/面/特征/草图/曲线五级
assembly.mate.*     10 种配合
assembly.relation.* 4 种关系
assembly.tool.*     Group/Snap/Replicate/Pattern/Mirror/Replace
assembly.bom.*      Structured/Flattened/模板/抑制
assembly.simulation.* 静力/Modal/Async/RigidBody
drawing.view.*      9 类派生视图
drawing.dimension.* 13 个尺寸工具
drawing.annotation.* GD&T/焊接/粗糙度/边条件/注释/Callout
drawing.table.*     BOM/CutList/Hole/Custom/Revision/Inspection
drawing.template.*  DWT/DWG/DXF/层/纸幅
document.*          Tab/Workspace/Version/Branch/Merge/Restore
sharing.*           权限/评论/Follow/ViewOnly/Light
release.*           候选/审批/修订/作废/水印/审计
plm.*               Arena 连接/BOM/Item 同步
render.*            场景/相机/材质/环境/灯光/输出
measure.*           12 类测量
analysis.*          11 个分析工具
account.*           计划/角色/权限/SSO/计费/分析
ui.global.*         选择/数值/对话框/撤销/配置/In-Context/快捷键/性能
```

> 该 taxonomy 只是建议；按 P0-04，新增 family/契约前必须 AIRR/ADR，不得直接改账本生成器或运行时 registry。

---

## 11. 建议的执行顺序（若选择 C）

1. **立刻做（无新契约）**：
   - 把本文的域清单写进能力账本治理文档，新增 `planned`/`excluded` 行，明确 71% 未覆盖主题；
   - 把 `ui.global.*` 作为跨工具验收项，避免继续“每个工具各自为政”；
   - 对 Part Studios 中仍是 `gated/partial` 的工具逐项补七维证据（现有 W1–W8）。
2. **B0（平台基础，3–6 个月）**：文档/版本/权限/评论/导入导出（若授权）→ 发布工作流 → PLM。
3. **B1（装配基础）**：Mate Connector + 10 种 Mate + 求解 + 实例列表 + 子装配 + BOM；先不做仿真。
4. **B2（工程图基础）**：基础视图/尺寸/表格；GD&T/焊接/检验/发布联动后置。
5. **B3（渲染/评估）**：Measure/Mass Properties → 11 个分析工具 → Render Studio（独立渲染 ADR）。
6. **B4（企业）**：角色/权限/SSO/计费/审计；与 CAD 内核解耦。
7. **始终**：每个能力必须满足 `STATUS-DEFINITIONS.md` 的七维门才可标 `full`；不得用 gated 入口或 UI 假控件冒充完成。

---

## 12. 不可从本文推出的结论

- 本文不声称 LubanCAD 产品“完全没有”装配/工程图/发布代码；只声称**能力账本/计划没有覆盖**，需要以代码/真栈实测为准。
- 本文不声称 Onshape 文档的每个参数都正确；已列出的内部不一致必须 live 复核。
- 本文不建议在没有 AIRR/ADR 的情况下新增能力、schema、RPC、求解器或渲染管线。
- 本文不授权 commit/push/publish。
