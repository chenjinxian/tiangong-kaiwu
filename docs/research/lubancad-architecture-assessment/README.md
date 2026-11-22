# LubanCAD 全栈架构评估：能否支撑 Onshape 主要功能（2026-11-22）

> **问题**：Onshape 功能面很大，LubanCAD 不可能一次全部完成。当前项目及所有关联项目的技术架构，是否足以支撑先做 Onshape 的**主要功能**：草图、约束、特征、UI 交互、图形渲染、实时编辑、数据协同、数据导入导出？
>
> **方法**：对 `tiangong-kaiwu`、`itwinjs-core`、`luban-cad`、私有 `luban-backend`、私有 `imodel-native`、私有 `trueform`、`imodelhub-services`、`DanQing`、`onshape-parity-data` 做只读审计；以代码/测试/运行时接线为准，文档声称仅作线索。
>
> **证据边界**：本报告在公开仓，**不含**私有源码、私有路径、密钥、原始内核错误码或 live 证据。私有仓结论只以脱敏后的架构事实呈现；能力状态以 `docs/parity/STATUS-DEFINITIONS.md` 与公共能力账本为准。
>
> **证据分级**：未特别标注的结论来自代码/测试/契约事实；标注“需 e2e/真栈复核”的（如双浏览器互踢、跨 iTwin fork、WS 限流、剖切下 BRep 叠加层）是代码路径推断，尚未真栈验证；本轮未做渗透测试、未做 N=50/90 性能实测、未复测 DanQing 测试数。

---

## 0. 执行结论

### 一句话

**当前技术底座足以支撑「Part Studio 级 Onshape」——草图、2D 约束、核心参数化特征、Part Studio UI、交互式 B-Rep 渲染、单用户可撤销编辑；但不足以直接支撑「全量 Onshape」——多用户实时协同、装配、工程图、PDM/发布/PLM、导入导出、Render Studio 都需要新子系统或方向性改造。**

### 判定口径

| 判定 | 含义 |
|---|---|
| **A 满足** | 现有架构/契约/数据模型直接支持，只缺实现或覆盖 |
| **B 部分满足** | 底座可复用，但需新增契约/后端/UI/性能改造；无方向性冲突 |
| **C 不满足** | 当前架构没有对应子系统，需要独立新建（如装配求解器、绘图引擎、PDM 服务） |
| **D 方向性冲突** | 当前核心假设与目标冲突（如单写者 changeset/briefcase 与 Onshape 多用户实时编辑） |

### 主要功能就绪度

| Onshape 主要功能 | 现有机制 | 判定 | 关键结论 |
|---|---|---|---|
| **草图几何** | 5 类求解实体（point/line/circle/arc/spline）+ 19 类约束 + 草图 DTO/UI/求解管线 | **B** | 可继续扩展；缺 ellipse/elliptic arc/conic/text/N 点样条与若干约束 |
| **约束** | solver-neutral 2D 求解层（libslvs 过渡）+ 驱动/从动尺寸 + 表达式/变量 | **B** | 2D 可扩展；3D 装配约束是另一套求解器，当前没有 |
| **核心特征（追加式）** | 21 个 `LubanFeatureType` + FeatureOp 单管道 + ACIS Modeler/Polyhedra | **B** | 参数化主链成立；21 类全部 `partial`，大量分支/失败模式待补 |
| **几何内核（基础特征）** | ACIS Modeler/Polyhedra 经 `SolidKernel.h`（111 API）+ PSBRep op 0–37 | **B** | 布尔/扫掠/放样/圆角/倒角/抽壳/偏移/拓扑 ID 可用；扫掠光滑路径与 fillet 模式是硬边界 |
| **高级曲面/螺纹/钣金** | 无曲面算子层；helix/thread、sheet metal/frame 无内核通道 | **C** | 不能靠“再包一层 ACIS API”补齐；需新算法/许可/子系统 |
| **特征图/可编辑历史** | 每 body 单源线性链、单输出、tail-only 删除、结构键不可改 | **C** | 与 Onshape 任意插入/删除/重排/回滚/多输出冲突；需特征图执行器 |
| **特征广度** | 钣金、框架、曲面、曲线、MBD、螺纹、Wrap/Decal、FeatureScript 等 | **C** | 多数没有 FeatureType/后端/内核证据；部分受许可/内核阻塞 |
| **Part Studio UI** | Onshape 式 ribbon/树/对话框/选择/ViewCube/预览/右键 | **B** | 已是可用编辑器；仍有假控件/gated 项、快捷键/对话框差异 |
| **装配/工程图 UI** | 无独立 Assembly/Drawing 模块；仅 gated 插入页签/菜单 | **C** | 需要新工作区、数据模型、求解器/绘图引擎 |
| **交互式图形渲染** | iTwin WebGL + 原生 tile + BRep 拓扑叠加 + 选择/透明/剖切/相机 | **B（大模型编辑 C）** | 视口/透明隔离/ViewCube 可用；拾取依赖原生 locate 规避 + O(面数) IPC、tile 并发 4、全 model 失效，大模型/装配待验证 |
| **Render Studio** | 无 PBR/IBL/AxF/OpenVDB/服务端渲染管线；DanQing 独立未接入 | **C** | 需独立渲染 ADR；DanQing 是候选但不是现成产品路径 |
| **单用户实时编辑** | RPC/IPC + FeatureOp + 影子求值预览 + 原生 undo/redo | **B** | 可行；但自动保存 push 会清空原生 undo，且预览覆盖不全 |
| **多用户实时协同** | 单 iModel 写租约 + 单共享 briefcase；第二个同角色打开者关闭前一会话 DB；无 presence/OT/CRDT | **D（异步多 briefcase 为 B）** | 与 Onshape 同时编辑方向冲突；需产品裁决与协同层重构 |
| **版本/共享** | iModel changeset、Named Version（仅元数据）、iTwin/iModel 权限、分享对话框 | **B** | 无 checkpoint 生成器/恢复/比较；groups/shares 只存不判；缺分支/合并/评论/任务/Follow |
| **发布/PDM/PLM** | iModelHub 无 release/BOM/PLM；无 changeset/NV 事件；changeset 归服务账号 | **C（审计 B 但缺归因）** | 需独立平台服务（发布状态机、修订/零件号、BOM、Arena）；先修用户归因/事件 |
| **数据导入导出** | 草图 ASCII DXF 已接线；mesh 可经 native 桥导出；无产品 STEP/IGES/DWG/DWT 通道 | **DXF-B / mesh-B / STEP-D / DWG-C** | 精确交换受 ACIS InterOp 许可限制；mesh 导出不等于精确 BRep；缺导入作业服务 |
| **装配** | BIS 可承载刚性实例；无 occurrence/Mate/Relations/BOM/爆炸/仿真 | **C（实例/结构 B；配合/BOM/仿真 C）** | 新 3D 约束求解器 + occurrence 模型 + BOM；BIS 层级可复用，不是从零 |
| **工程图** | iTwin 可显示既有 Sheet/Drawing；无视图生成/Dimension/GD&T/Table/DWT 引擎 | **C（显示 A/B）** | 独立大型制图子系统；依赖稳定面/边引用、MBD、装配 BOM |
| **账户/企业** | iTwin access control + 本地 auth；无企业管理员/SSO/计费/分析 | **C** | 平台/SaaS 层，不应写入 iModel schema |
| **AI+CAD** | FeatureOp/工具注册表可被 Agent 复用 | **B（Part Studio）/C（全产品）** | Part Studio 可先做；全产品需要各域 action schema 与权限/审计 |

> “B”不等于“接近完成”，只表示“架构方向正确、可增量实现”；当前能力账本 126 行中 `full=0`，Part Studio 特征也全部 `partial`。

### 先看整体可演进性

如果问题不是“现在有什么功能”，而是“后续能不能持续长出来”，请先读 [`08-ARCHITECTURE-EXTENSIBILITY.md`](./08-ARCHITECTURE-EXTENSIBILITY.md)。它的核心结论是：

- 底座选对了；不需要推倒重来。
- 但当前是“Part Studio 专用架构 + 通用 iTwin 底座”，不是“多工作区、多域可扩展的平台架构”。
- 六个必须现在冻结的接缝：`WorkspaceKind/WorkspaceModule`、特征输出端口/多输出、Feature Manifest/契约生成、`SelectionRef/occurrencePath` 与 store 工厂、checkpoint/per-iModel ACL/用户归因、批量拾取/BRep 实例/SAB 决策。
- 最危险的路径不是“功能少”，而是“继续按单输出、单文档、单 briefcase、手写契约铺功能”，等功能多了再一次性重写。

如果目标是“工业级专业云 CAD / 生产标准”，请继续读：

- [`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`](./09-INDUSTRIAL-TARGET-ARCHITECTURE.md)：目标控制面/会话面/作业面/数据面/PDM 面与 I0–I9 门槛。
- [`10-ARCHITECTURE-HARDENING-PLAN.md`](./10-ARCHITECTURE-HARDENING-PLAN.md)：架构冻结 Gate、16 项决策/Spike、WBS、阶段计划、验收门与“全功能前”规则。

---

## 1. Top 22 架构风险（按严重度；含 R7b 分项）

### R1. 单写者租约 vs Onshape 多用户同时编辑（D，最高）

- 当前 `modeling-server` 的写租约语义是：**一个 iModel 同一时刻只有一个活跃编辑会话**；第二个用户取租约被拒，写 op 在 35s 窗口后失败。
- 更严重的是（代码路径，需双浏览器 e2e 复核）：MS 对同一 iModel 只缓存一个 briefcase 文件，`openBriefcase` 会先 close 同 key 的现有 `BriefcaseDb`；第二个同角色打开者（含只读）会**关闭第一个会话的后端 DB**，前端无自动恢复。
- IPC 本身也不是按连接隔离：`LocalhostIpcHost` 对所有 WS 连接广播，前端 requestId 每页从 1 递增；两个客户端可能互相命中 pending promise。**连“单写者 + 多只读”当前也不可用**。
- 直接编辑（pattern/mirror/delete/transform 等）不走 FeatureOp 写门，不检查租约/ACL/OpLog；“单写者”只是参数化管道的局部约定。
- Hub 的 briefcase/changeset/lock 模型支持多 briefcase、changeset 推送与合并，但应用层没有去掉单写者门禁，也没有 presence/光标/跟随/操作广播；共享 briefcase 的 undo 也不是 per-user（OpLog 随 changeset 传播，B 的 undo 可能回退 A）。
- **异步多用户（多 briefcase + 锁 + rebase）是 B**（Hub 底座具备，应用未接；第一步是 undo 所有权/会话隔离，不是 briefcase 数量）；只有 Onshape 式同时编辑才是 D。
- 自动保存每 20s `pushChanges`，而 push 会开启新 changeset 会话并**清空原生 undo/redo 栈**。这是“为协同牺牲撤销”的取舍，不是 Onshape 行为（Onshape 自动保存不破坏 undo）。
- **含义**：如果“实时编辑”只指单用户交互式编辑，B；如果指 Onshape 式多人同时编辑，当前架构是 D。后者需要独立协同层（操作流/冲突处理/presence），并且很可能要重新设计写租约/undo 生命周期。

### R2. ACIS 许可与导入导出（D，许可级）

- 实际几何内核是 ACIS（经 `SolidKernel.h`/PSBRep，111 个 static API、op 0–37），不是 TrueForm；TrueForm 仅 M0 脚手架，当前不具备生产能力。
- 授权仅 Modeler + Polyhedra：STEP/IGES/healing/InterOp 类能力（含 ThickenSheet）不得接线。当前也没有 STEP/DWG/STL/3MF 的产品级导入导出。
- 不是所有格式同一难度：DXF 草图导入已是 B；STL/OBJ/3MF/GLTF 可走 `BodyFromPolyface`/`FacetEntity`/`exportGraphics` 的 mesh 路线（B），但**不是精确 BRep 交换**；DWG/DWT 需第三方 SDK/许可（C+裁决）；STEP/IGES/Parasolid 是 D。
- 语料证明需求真实（474 个 STEP、103 个 Parasolid、16 个 DWT），但没有可用的导入导出 oracle；文档级导入还缺作业/队列/超时服务。
- **含义**：如果“导入导出”是主要功能，必须决定：取得 InterOp 许可、外接转换服务，或明确不支持。不能靠 TrueForm 短期补位，也不能用 mesh/近似几何冒充 STEP。

### R3. 没有 3D 装配约束求解器（求解器 C；硬塞 Part Studio 为 D）

- 现有求解器是 2D 草图求解（point/line/circle/arc/spline + 19 类约束），没有 Mate/Relations、3D 刚体约束、装配自由度求解、BOM 层级投影。
- iTwin/BIS 能承载装配元素/层级/变换（`PhysicalModel/PhysicalElement/GeometryPart/ElementRefersToElements` + 标准变换工具），但不会替你求解 Mate；实例/结构是 B（未接线），配合/BOM/爆炸/仿真才是 C。
- 语料有 500 个 ASSEMBLY 元素、21,518 个 occurrence（最大 2,185），但 **mates=0**；没有语义 oracle，先采集证据再实现十种配合。
- **含义**：装配不是“给 Part Studio 加 UI”，而是新 occurrence 模型 + 新求解器 + BOM/爆炸/显示状态 + 仿真轨道；需要独立 ADR。

### R4. 没有工程图引擎（C）

- 当前无 Drawing 模块/视图/尺寸/GD&T/表格/DWT/DWG 引擎；iTwin 只有 BIS 视图/剖切基础 + `SheetViewState/DrawingViewState/ViewCreator2d` 显示原语，不是 Onshape 工程图产品面。
- 容易误判为“iTwin 已有”：BIS 有 `DimensionAnnotation2d/TableAnnotation2d/SheetTemplate` EC 类，但 TS 未暴露、DgnPlatform 尺寸 handler 未绑定 addon；没有 3D→2D 投影/HLR、关联尺寸、表格排版、DWT/DWG/DXF/PDF。
- 语料 29 个 Drawing APPLICATION 元素 **0 载荷**，没有工程图 oracle。
- 工程图又依赖 MBD/公差、装配 BOM、发布/修订；这些当前也不存在。
- **含义**：工程图应作为独立大型子系统立项，不能塞进 Part Studio 的“导出”功能。

### R5. 没有 PDM/发布/PLM 平台（C）

- Hub 有 changeset、Named Version、iTwin/iModel 权限、分享/组/邀请；没有分支/合并/恢复、评论/任务/Follow、Release candidate/审批/修订/作废、BOM、Arena PLM。
- 发布所需的原料也不完整：Named Version 不生成 checkpoint/缩略图/事件；changeset/Named Version 事件未发射；changeset/briefcase 归服务账号，OpLog.user 是 sessionId——按用户审批/审计不成立。
- 应用顶栏的“main”分支是静态呈现；Restore/Move/Copy workspace 等是 gated 占位。
- **含义**：Onshape 的“数据协同”不只是版本快照；发布/修订/权限/审计是独立平台服务层，且必须先有真实 checkpoint 与用户归因。

### R6. 单进程/单库缓存/冷重建的规模上限（C）

- `modeling-server` 是单 Express 进程；特征服务按 `dbKey × Part Studio scope` 模块级缓存；冷启动/缓存缺失走 `rebuildAll`；写租约与求值锁都是进程内存态。
- **changeset checkpoint 生成器缺失**：Named Version 只写元数据；冷开 = 下载 baseline + 按序 apply 全部 changeset。20s autosave 下 4 小时约 720 changeset/日/文档，一周约 5,000；历史越长冷开越慢，存储对象单调增长。
- Hub/Postgres/Azurite/Redis 单实例，无 HA/备份/配额；active 锁无 TTL、briefcase 无 stale 清理；briefcaseId 池无耗尽保护；baseline webhook 路径无集中队列。
- 当前测试覆盖 Part Studio 级别（10 个 Part Studio、127 body 等），没有证明多租户/大规模团队/超大装配的吞吐。
- **含义**：单机能跑不等于 Onshape 规模；checkpoint/GC/队列/租约外置是规模化前置，属 B/C 级工程，不是几何阻塞。

### R7. 特征/草图覆盖仍是“子集中的子集”（B）

- 21 个 FeatureType 全部 `partial`；文档有 81 个 Feature Tools、56 个 Sketch Tools。
- 草图求解实体仅 5 类；缺 ellipse/elliptic arc/conic/text/N 点样条等；约束有 19 类但缺 normal/intersection/curvature/flow 等；大量 UI 项是 gated。
- 特征分支（端条件、merge scope、Fillet 模式、Loft guides、Pattern skip、Boolean 多形态等）远未收口。
- **含义**：Part Studio 主链可行，但“主要功能”仍需大量增量工作；不要用入口数量宣称完成。

### R7b. 特征图执行模型限制（C）

- 后端每个 body 只有一个驱动源特征，按 `orderKey` 线性求值；一个特征只写一个 body（`writeBodyFromCache` 要求恰 1 条 BRep）。
- 删除只允许该 body 链尾；重排受线性依赖限制（纯链几乎只剩恒等排列）；`newBody`、Loft 截面、Sweep 草图、booleanBodies targets/tools/operation 等结构键禁止 `updateParams`，只能删除重建。
- **含义**：这不是“UI 还没做”，而是执行器假设与 Onshape 的任意特征图/可编辑历史/多输出（split 双侧、mirror 新建、mergeScope 多目标）不一致；需要特征图执行器与多输出契约，属于 C 级架构改造。

### R8. 自动保存与撤销生命周期（B）

- 20s 防抖 push 清空原生 undo/redo；push 后只能依赖版本/重开。
- 当前 undo 栈只覆盖部分后端 op（`updateParams`/`updateVariables`），插入/删除/重排依赖原生事务。
- **含义**：交互式体验与 Onshape 有差距；但可通过调整 autosave/push 策略、扩展 op log/undo 设计解决，不是底座冲突。

### R9. 高级渲染/Render Studio（C）

- 当前渲染是 iTwin WebGL + 原生 tile + BRep 叠加，足以做建模视图；不是 PBR/IBL/AxF/OpenVDB/服务端渐进渲染/Render Studio。
- DanQing 有大规模 tile/LOD、多 Pass/sectioning（README 称 2,960 测试，未复测），但 **PBR 仍待补、Web 化未实现、明确独立未接入**；接入需 ADR，不能默认拿它替代 iTwin 交互渲染器。
- **含义**：Render Studio 是独立产品线；工程图还需要另一套二维渲染/排版能力。

### R10. 范围沟通（治理风险）

- 2026-11-19 计划明确只覆盖草图/约束/特征 + 全语料示例；文档 527 主题中 71% 不在 Part Studio。
- 把“Part Studio 对齐”说成“全量 Onshape”会产生错误的完成预期，也会掩盖装配/工程图/PDM 的空白。
- **含义**：先做范围裁决，再谈路线图；这是产品治理问题，不是技术问题。

### R11. 特征 UI 单体扩展（B，交付风险）

- `FeatureDialog.tsx` 约 6,761 行，新增一个特征/字段需要在对话框、ribbon、树、canvas 路由、能力表、i18n 等多处注册（前端审计约 9 个注册点）。
- 后端已有 `getFeatureFormModel` 契约，但前端**未消费**；后端 schema/formFields 与前端手写表单存在漂移风险。
- **含义**：这不是“架构不能做”，而是“每加一个特征的成本/回归面会持续上升”；建议在下一波特征扩展前，先做表单模型驱动与注册面收敛。

### R12. 选择身份与拾取性能（B/C，扩展天花板）

- 前端 `CanvasSelection` 只有 `ownerBodyKey + topologyId`，没有 occurrence path/装配实例路径；面对装配、多文档、分屏、工程图引用时会身份不唯一。
- 面拾取在 hover 时逐面走 RPC，草图另用 DOM 命中；大型模型/装配的延迟与一致性有硬上限。
- **含义**：Part Studio 小模型可用；装配/多文档/工程图/大模型前，需要一次“实体身份 + 拾取管线”的专项设计（与装配 ADR 一起）。

### R13. 服务端授权/租户隔离（C，安全）

- 审计发现：后端到 hub 使用单一 admin 服务账号 + X-API-Key 直通；RPC/IPC 只验“是不是有效用户”，**没有逐 iModel 的访问授权**；WS 握手后 token 缓存/过期不再校验；合法 token 可尝试任意 iModelId/文件路径。前端 `usePermissions` 不是安全边界。
- 会话隔离也缺失：MS 共享 briefcase/文件，IPC 对所有 WS 连接广播、requestId 从 1 递增；第二用户（含只读）会互踢/串响应。
- 网络/凭证卫生也阻断 SaaS：WS token 进 URL/console/nginx 日志；WA 调试/管理端点无认证且默认 0.0.0.0；Azurite 用公开默认密钥并暴露端口；入口 TLS 未启用。
- 共享执行也不完整：groups 只存不判；shares 的 email/domain/allow/deny 只做 CRUD，授权链路完全不读；无链接分享/公开文档/所有权转移/folder 继承/Team/Company。
- 这对“数据协同”是高风险：分享/权限只在 hub 前端/hub API 层部分生效，后端通道可能绕过文档级 ACL。
- **含义**：在扩大协作/多租户前，必须做 per-iModel 授权、连接后 token 生命周期校验、下载/打开/FeatureOp 的统一 ACL，并补负例安全测试；否则不能对外宣称企业级数据安全。

### R14. 发布/契约/文档漂移（B，治理）

- 最新发布 tag 仍对应 shared **1.64**，源码已到 **1.85**；20+ 契约版本（外部引用/PIERCE/表达式/槽宽/多截面 loft/draft 等）只在源码模式可用。产物模式与源码模式行为分叉。
- `interface-freeze.json` 仍是 schema 01.00.00/过期哈希；`opDsl` 缺 `draft` 且类型测试未纳入；`docs/Architecture.md` 仍写旧 RPC/TrueForm 为内核；部分 UI 注释/死组件与代码不一致。
- **含义**：这会产生“源码绿、产物旧、文档假”的分叉，直接影响评审和对外承诺；发布前必须对账。

### R15. 主线程同步内核与读路径（B/C，性能）

- 同步 ACIS 内核调用在主线程执行（fillet/chamfer/pattern 等），libslvs 同步且不可 worker；单进程事件循环会被长任务阻塞。
- `getSketch` 每次全量求解，`getMassProperties` 每次面片化，`getBodies` N+1，写后投影快照全失效；OpLog 全表扫描且不裁剪；缓存无淘汰。
- **含义**：中小组件可用；大草图/多 body/大装配前需要 worker/子进程、增量读面、缓存上限、OpLog 分页；与规模（R6）一起设计。

### R16. 内核持久化、接口冻结与产物 provenance（B/C，证据链）

- iModel 几何流存的是 **ACIS SAB 字节**；`SaveEntityToMemory/Restore` 是 `SolidKernel.h` 合同的一部分。TrueForm 既不能读也不能写 SAB，切换必须先裁决“读 SAB / 不兼容迁移 / 双格式共存”，`INTEGRATION.md` 未把该门禁单列。
- 当前树 `check-interface-freeze.mjs` **失败**（PSBRep 哈希不匹配、opCount 38≠37），op37 未同 PR 更新冻结清单；CI 接口冻结 job 会红，P0-08 证据链断裂。
- 对外 MS 产物 provenance 仍记录早于 native HEAD 的原生版本（store fallback）；op37/TaperFaces 及之后的修复不在发布物。所有“已接线/真栈绿”必须绑定重建后的 MS 产物。
- 另一治理漏洞：ThickenSheet 虽是 blocked-license，仍是 PSBRep op16 并经 `createBRepGeometry` 暴露给 JS；许可边界只在文档层，native 入口 fail-open。
- **含义**：这是可修复的发布/治理风险，但当前处于“不满足发布门禁”状态；必须与 R14 一起在 Phase 0 收口。

### R17. 内核结构上限：无实例化、tile 串行、扫掠近似（C，性能/几何）

- `_CreateInstance` 返回 `nullptr`，重复零件回退深拷贝；大装配的内存/时间随实例线性增长，与 Onshape 轻量实例模型方向冲突。
- 生产 tile facet 走无键 `Invoke` 回落 owner 全局道；批量 facet MT 没有生产消费者。大模型首屏/视图重建会撞单线程。
- 扫掠实为站位蒙皮/直纹面，光滑路径只首末站；twist/scale/lock/selfRepair 被静默忽略。Onshape 的 sweep/helix/thread 类严格几何无法靠当前通道达到。
- **含义**：Part Studio 小模型可用；大装配/高级扫掠需要专项改造（实例共享 ADR、facet 键控、精确 sweep），不能靠“多调一个容差”解决。

### R18. 装配/工程图语料 oracle 缺口（B，验证风险）

- 语料有 500 个 ASSEMBLY 元素、462 份 assembly JSON、21,518 个 occurrence（最大 2,185）、480 个 BILLOFMATERIALS 元素、29 个 Drawing APPLICATION 元素，但 **mates=0、BOM 无载荷、drawing 0 载荷**。
- 现有 “Universal Joint Assembly/Drawing” 示例实际回放的是 Part Studio 几何，mate connector 被跳过；不能作为装配/工程图能力证据。
- **含义**：装配/工程图即使架构可做，也缺少可对拍的 Onshape 语义；必须先采集 mate/drawing/BOM oracle，否则无法做 strict/approx 分级，容易用“能开图”冒充“功能完成”。

### R19. 版本账本与 checkpoint 缺失（B/C，规模）

- Hub 没有 changeset checkpoint 生成器：`createOrUpdateForChangeset` 无调用方；Named Version 创建不生成 checkpoint/缩略图/事件/计数；冷开每次都从 baseline 重放全部 changeset。
- 20s autosave 下 4 小时约 720 changeset/日/文档、一月约 2 万；冷开、pull、版本恢复、异步多用户都会随历史线性变慢，存储对象单调增长且无 GC/压缩/配额。
- 但 **checkpoint 不能先于账本修复**：changeset 可改 `parentId`、可创建无父根、DELETE 可挖洞、`complete` 不校验 blob/checksum、`waitingForFile` 悬挂会永久阻塞链头；fork 只复制最新 checkpoint，对已有编辑的文档会复制**空 baseline**，`preserveHistory` 不生效；一旦有 mid-history checkpoint，fork 还可能外键失败。正确顺序是“冻结账本 → checkpoint → Named Version 快照 → restore/compare”。
- **含义**：checkpoint 是最高杠杆之一，但第一步是把版本账本变成真正不可变、可恢复的账本；否则 Named Version/分支/发布都没有可信基础。

### R20. 用户归因缺失（B，审计/配额）

- MS 用服务账号推 changeset/briefcase，`creatorId`/briefcase owner 是服务账号；`OpLog.user` 是 session UUID；前端不传真实用户。
- 因此“谁改了什么”、按用户配额、合规审计、审批记录都不成立；changeset/Named Version 事件也未发射，发布/通知无触发点。
- **含义**：先修 briefcase/changeset/OpLog 的真实 userId 与事件发射，再做发布/审计/配额；否则审计是假证据。

### R21. 多 Part Studio 切页签的状态/对话框串扰（B，立即）

- 页签切换只换 URL、不重建连接是正确的；但 feature 树/body 的“已加载”键只按 connectionKey、不含 scope；读失败会保留旧树/旧 body；`FeatureDialog` 切页签不关闭，提交时才从 URL 取 scope；相机/undo 是文档级共享。
- **含义**：当前就可能把特征写到新 scope、或在慢网/读失败时看到旧 scope 数据。这是最便宜、最该先修的正确性缺陷；先加 scopeKey、清空失败态、关闭/重挂对话框，再谈多 tab UI。
- 详见 `08-ARCHITECTURE-EXTENSIBILITY.md` §4.1/§4.4。

---

## 2. Top 21 可复用资产（不要重造轮子）

| 资产 | 价值 |
|---|---|
| **iTwin.js + iModel/BIS** | 文档/元素/关系/模型/视图/事务/撤销/变更集/权限的统一底座；避免第二套模型库 |
| **`LubanFeatureRpcInterface` + FeatureOp** | 参数化建模唯一写管道；21 个 FeatureType、registry/zod、预览/更新/抑制/删除均有位置 |
| **ACIS Modeler/Polyhedra（经 SolidKernel/PSBRep）** | 111 个 static API、布尔/扫掠/放样/圆角/倒角/抽壳/偏移/Imprint/拓扑 ID 等；Part Studio 主要几何的现成内核 |
| **原生契约与冻结门禁** | `SolidKernel.h` 111 导出 + PSBRep op 协议 + `check-interface-freeze`；任何新后端都应实现这套语义，而不是新造 API（冻结清单需先修复） |
| **ACIS Modify 家族 + 持久拓扑 ID** | 布尔/Blend/Chamfer/Hollow/Offset/Taper/Imprint/Transform/Sew/Disjoin + `(nodeId, entityId)` 分裂继承；产品引用解析已依赖 |
| **原生并发/facet/tile 资产** | owner + per-key 车道、ACIS faceter 封装、SQLite facet 缓存、逐面材质分桶、`AcisMemoryFile` SAB 往返、iTwin tile 管道 |
| **内核边界测试钉** | Bumper 12 边、TaperFacesProbe、批量 facet 对拍、8 lane 对拍、分裂语义、保存往返；防回归价值高 |
| **solver-neutral 草图求解层** | 2D 约束中立接口 + libslvs 过渡 + 表达式/变量/外部引用；绳墨可平替 |
| **iTwin WebGL + tile 管线** | 交互式 B-Rep 视图、LOD/流式 tile、选择/透明/剖切/ViewCube/拓扑叠加 |
| **Onshape 式 React 编辑器壳** | ribbon/树/对话框/选择权威/快捷键/右键/预览/上下文菜单；已对齐大量 live 证据 |
| **iModelHub（本地）** | changeset、briefcase、checkpoint、Named Version、iTwin/iModel 权限、分享、webhook、Azurite/Postgres |
| **Hub 契约/锁/rebase 底座** | 官方 SDK 兼容的 iModels REST、锁语义矩阵 + advisory-lock 事务 + 部分唯一索引、服务端 changeset 取号；多 briefcase 协作的正确性基础 |
| **core Briefcase/Checkpoint/Txn** | `pullMergePush`、rebase/semantic rebase、restore point、stash、server-based locks、V2 checkpoint attach/download；上游大量测试覆盖 |
| **Baseline/异步作业范式** | CloudSqlite 回读验证、baseline 三写同事务、clone 容器复制补偿、operation 按 id 推进；可作异步作业模板 |
| **Webhook 投递管道** | BullMQ emit/deliver、HMAC、指数退避、delivery 行、stuck scan；用户通知/发布事件可直接复用投递层 |
| **iTwin 角色 + iModel ACL** | `checkIModelAccess`、`isSecured` 四维 ACL、grant/revoke、HITL；`b-share.spec.ts` 真实两用户覆盖，可作细粒度权限起点 |
| **BIS 装配/图纸原语** | `PhysicalModel/PhysicalElement/GeometryPart/ElementRefersToElements`、标准变换工具；`SheetViewState/DrawingViewState/ViewCreator2d` 显示既有图纸；可做刚性实例与只读图纸起点 |
| **mesh 桥** | `BodyFromPolyface`、`FacetEntity`、`exportGraphics`、`generateElementMeshes`；STL/OBJ/3MF/GLTF 的许可内导入导出基础（非精确 BRep） |
| **测试与证据纪律** | 174 个 web 单测文件、238 个 e2e spec、123 个 backend 测试文件；真栈/冷重开/逐 body 体积证据链 |
| **DanQing（未来）** | 大规模 tile/LOD、多 Pass/sectioning 的参考实现；PBR 仍待补、Web 化未实现；经 ADR 可成为离线渲染候选，不能直接替换 iTwin 交互视口 |
| **Onshape Help 全量分析** | 527 主题/861,649 词的 UI/参数/流程/限制基线，可直接转 tool spec/测试断言 |

---

## 3. 建议的范围裁决（先做选择，再排期）

### 选项 A：只做 Part Studio（推荐近期）

- 对外口径改为“Part Studio 草图/约束/特征严格对齐”，不再宣称“全量 Onshape”。
- 继续 W1–W8：补草图实体/约束、21 个 FeatureType 分支、UI 七维证据、strict 示例。
- 其他域只做**能力登记**（planned/excluded），不做假入口。

### 选项 B：做“Onshape 主要功能”的 60–70% 产品面

在 A 之上增加：
- 基础 PDM（文档/版本/共享/评论/权限）与发布/修订；
- 装配 Mate/BOM（不做仿真）；
- 工程图基础视图/尺寸/表格（GD&T/发布联动后置）；
- 导入导出（先 DXF/DWG/STL/3MF；STEP 需许可裁决）；
- 交互式渲染增强（不先做 Render Studio）。

### 选项 C：全量 Onshape

需要同时解决：
- 多用户实时协同（D）；
- 3D 装配求解器/工程图/PDM/PLM（C×4）；
- ACIS InterOp/导入导出许可（D）；
- Render Studio/高级渲染（C）；
- 企业/SaaS 平台（C）；
- 大规模多租户性能/运维（C）。
这不是当前架构“再补几个功能”能达成的，需要多年、独立产品线/团队与 ADR 治理。

**本报告建议 C 的第一步是 B，而不是直接 C。**

---

## 4. 本目录内容

| 文件 | 内容 |
|---|---|
| [`01-SYSTEM-MAP.md`](./01-SYSTEM-MAP.md) | 关联仓职责、运行时调用链、数据模型、部署与测试基线 |
| [`02-READINESS-MATRIX.md`](./02-READINESS-MATRIX.md) | 逐能力 A/B/C/D 矩阵、证据、关键缺口、建议 |
| [`03-PART-STUDIO-DEEP-DIVE.md`](./03-PART-STUDIO-DEEP-DIVE.md) | 草图/约束/特征/UI/undo/预览/性能的深挖 |
| [`04-COLLABORATION-AND-DATA.md`](./04-COLLABORATION-AND-DATA.md) | iModel/BIS、changeset/briefcase/锁、实时协同、版本/分支/合并、权限、PDM/发布/PLM、规模 |
| [`05-RENDERING-AND-ADJACENT-DOMAINS.md`](./05-RENDERING-AND-ADJACENT-DOMAINS.md) | 渲染/可视化、DanQing、装配、工程图、导入导出、MBD |
| [`06-DECISIONS-AND-ROADMAP.md`](./06-DECISIONS-AND-ROADMAP.md) | 必须先裁决的架构决策、分阶段路线、不可并行项、验收门 |
| [`07-KERNEL-AND-NATIVE.md`](./07-KERNEL-AND-NATIVE.md) | 内核能力边界、拓扑 ID、tessellation/线程、失败模式、许可/provenance、TrueForm、最小验证切片 |
| [`08-ARCHITECTURE-EXTENSIBILITY.md`](./08-ARCHITECTURE-EXTENSIBILITY.md) | **整体架构可演进性**：承重假设、15 个扩展压力测试、单行道登记、目标架构蓝图、不阻塞 Part Studio 的迁移跑道、架构适应度函数与 ADR 缺口 |
| [`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`](./09-INDUSTRIAL-TARGET-ARCHITECTURE.md) | **工业级专业云 CAD 目标架构**：I0–I9 门槛、控制面/会话面/作业面/数据面/PDM 面、身份/ACL、不可变账本、特征图、工作区、几何/渲染、灾备/发布/合规 |
| [`10-ARCHITECTURE-HARDENING-PLAN.md`](./10-ARCHITECTURE-HARDENING-PLAN.md) | **架构冻结与开发计划**：G0–G5 Gate、16 项决策/Spike、12 个 WS×约 100 个 WBS、阶段计划、验收标准、依赖/返工登记、适应度函数与“全功能前”门禁 |
| `data/readiness-matrix.json` | 机器可读就绪矩阵 |

> 与 2026-11-22 的 Onshape Help 全量文档分析配合阅读：`docs/research/onshape-help-analysis/README.md`。
