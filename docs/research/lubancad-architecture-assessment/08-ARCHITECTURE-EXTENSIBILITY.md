# 整体架构可演进性：承重假设、单行道与扩展蓝图

> 这份文档不再回答“某个功能完成多少”，而回答一个更前置的问题：
> **当前架构能否在不推倒重来的前提下，逐步长出 Onshape 的主要能力？哪些假设现在不改，后面一定会撞墙？**
>
> 判定口径：
> - **A 可扩展**：现有契约/数据模型/边界可直接承载，只缺实现。
> - **B 可演进**：核心底座可复用，但需要新增契约/抽象/迁移；没有方向性冲突。
> - **C 需新子系统**：当前架构没有对应层，必须在架构上开新轨道。
> - **D 方向性冲突**：现有核心假设与目标冲突，越晚改代价越大。
>
> 证据边界：本文在公开仓，不含私有源码、私有路径、密钥或原始证据。私有后端/native 的结论以脱敏架构事实呈现；标注“推断/需真栈”的条目未做渗透或性能实测。

---

## 0. 执行结论

### 一句话

**底座选对了，但当前是“Part Studio 专用架构 + 通用 iTwin 底座”，还不是“多工作区、多域可扩展的平台架构”。**
继续加 Part Studio 功能不会立刻撞墙；真正的风险是**把 Part Studio 的临时假设固化成平台契约**——单输出特征、单文档编辑器、单写者会话、手写契约、单进程状态。只要在这些假设变成数据/契约之前加“接缝”，后续装配、工程图、协同、规模都可以增量演进。

### 先确认“已经做对”的部分

| 资产 | 为什么是长期正确 |
|---|---|
| **iTwin.js / iModel / BIS 唯一数据底座** | 文档、元素、关系、事务、撤销、changeset、权限、tile 都有官方语义；避免第二套模型库 |
| **`FeatureOp` 单一参数化写管道** | 所有特征写入、预览、撤销、审计可以围绕一个可序列化操作面展开；AI 也复用它 |
| **ACIS 经 `SolidKernel.h` / PSBRep 隔离** | 几何能力不泄漏到业务层；未来 TrueForm 有替换接口（但持久化仍需裁决） |
| **solver-neutral 草图/约束层** | 2D 求解器可替换；不会把 libslvs/绳墨焊死在业务代码 |
| **iTwin WebGL + 服务端 tile 唯一渲染底座** | 交互式视图、LOD、选择、装饰件、ViewCube 可复用；避免第二渲染平台 |
| **`WorkspaceRef` + 多 Part Studio scope** | ADR-0001 的 B 模型已部分落地；不是“一个 Part Studio 一个 iModel”的死结构 |
| **标准工具基类 + 事务 + 真栈 e2e** | 可撤销、可测试、可回归；这是很多 CAD 项目最缺的部分 |

### 可演进性评级

| 轴 | 评级 | 一句话 |
|---|---|---|
| 文档/工作区/数据模型 | **B** | iModel=文档、Model=scope 方向正确；缺 typed Tab、版本引用打开、变量作用域裁决 |
| 特征图/执行器 | **C** | 单源线性链可支撑追加式；单特征单输出/拓扑引用/历史编辑需要契约升级 |
| 契约/扩展机制 | **B/C** | FeatureOp 方向正确；手写多清单、form model 不完整、opDsl 已漂移 |
| UI/状态/选择 | **B（单文档）/ C（多文档）** | 壳成熟；单例 store/单连接/选择身份限制扩展 |
| 协同/版本/安全 | **D（实时）/ B（异步）；当前单写者+多只读也不可用** | 共享 briefcase/IPC 广播/直改绕写门；账本可改写/无 checkpoint/ACL/归因缺失 |
| 几何/渲染/导入 | **B（基础）/ C（高级）** | ACIS/iTwin 底座可用；实例化/tile/PBR/STEP 有硬边界 |
| 平台/规模 | **B（单机）/ C（SaaS）** | 单进程内存态；需作业/会话/租约外置 |

### 六个“现在不冻结、以后会返工”的接缝

| # | 接缝 | 当前状态 | 如果继续按现状铺功能 | 现在应做什么（不必做完整功能） |
|---|---|---|---|---|
| S1 | **工作区/页签抽象** | `WorkspaceRef` 只有 `iTwinId/iModelId/modelId`；页签是 Part Studio 专用组件；没有 `WorkspaceKind`/工作区模块接口 | 每加 Assembly/Drawing 都要改 Part Studio 路由、store、页签、选择 | 先定义 `WorkspaceKind` + `WorkspaceModule` 契约 + `WorkspaceRef.kind`；用 stub 验证“加一个工作区不改 Part Studio” |
| S2 | **特征输出契约** | 每 body 单源线性链、单特征单输出、tail-only 删除、结构键禁改 | 每加一个特征都固化“单输出”假设；split 双侧、mirror 新体、mergeScope 多目标日后要重做 | 冻结“输出端口/多输出”契约；用现有执行器做一个多输出 spike（如 split 双侧） |
| S2b | **拓扑引用身份** | 参数多存裸 `{nodeId,entityId}`；单目标 fillet/chamfer 不校验 bodyKey；顶点无持久 id；内核 ID 无几何回退 | insert/delete middle、多 body、多输出后，旧引用可能静默命中另一条边/面，或 status=1 | 先做 `(bodyId, topoId)` 限定 + 几何回退/查询命名 spike；这是历史编辑的先决 |
| S3 | **特征扩展清单** | `LubanFeatureType` 联合 + 手写 zod/registry/formFields/opDsl/UI/树/能力表；`opDsl` 已漏 `draft`；`shared strict:false`；前端零消费 `getFeatureFormModel` | 每加特征跨 9+ 注册点手写；AI DSL 与 UI 能力持续漂移；契约版本只靠注释 | 建“单一特征清单”→ 生成类型/zod/form/opDsl/AI spec；先修 `draft` 与严格模式 |
| S4 | **选择/状态身份** | `CanvasSelection = ownerBodyKey + topologyId`；zustand 模块单例；单页面单连接单视口 | 装配实例、多文档、分屏、图纸引用时身份不唯一；多文档状态互相污染 | 给选择身份补 `documentRef/occurrencePath`（即使暂时为空）；把 store 改工厂 + Session 注入 |
| S5 | **协同/版本/安全边界** | 共享 briefcase + IPC 广播 + 单写租约；直改绕写门；无 checkpoint；账本可改写/悬挂；groups/shares 只存不判；MS 通道不查 iModel ACL；用户归因缺失 | 连“单写者+多只读”都互踢/串响应；分享是假安全；冷开随历史线性劣化；异步/实时无法起步 | 先做会话隔离、账本冻结、checkpoint、per-iModel ACL、真实 userId、事件发射；与 Part Studio 功能解耦 |
| S6 | **几何/渲染/规模接缝** | 无 BRep 实例化；tile facet 串行；面拾取逐面 IPC；SAB 持久化；单进程内存态 | 大装配/大模型/PBR/TrueForm 切换时被迫重构 | 先做批量 pick/topology、100 body tile 基线、BRep 实例共享 ADR、SAB 兼容裁决 |

> **核心判断**：S1–S4 是“应用层接缝”，可以低风险先冻结；S5 是“平台正确性”，必须现在修；S6 是“性能/内核单行道”，先做 ADR 与 spike，不必现在实现装配/TrueForm。

---

## 1. 判断方法：从“功能就绪”到“可演进性”

### 1.1 两种问题的区别

- **功能就绪度**：这个功能现在能不能做？→ 已有 `02-READINESS-MATRIX.md`。
- **可演进性**：做下一个、再下一个功能时，会不会被迫推翻前一个？→ 本文。

一个架构可以在功能上“B”，但在可演进性上“C”：当前实现能跑，但它的数据/契约假设让后续能力无法增量生长。

### 1.2 压力测试法

对每个未来能力，不问“缺哪些 UI”，而问：

1. 它会触碰哪条承重假设？
2. 第一个断点在哪里（数据/契约/执行器/UI/平台）？
3. 断点是**单行道**（改起来要迁移数据/重写执行器）还是**双向门**（加接口即可）？
4. 有没有一个 1–2 周内可做的 spike，能提前证伪？

### 1.3 单行道 vs 双向门

| 类型 | 含义 | 例子 |
|---|---|---|
| **单行道** | 一旦数据/契约积累，改变需要迁移或重写 | iModel/BIS 作为事实源；ACIS SAB 持久化；changeset 单线历史；选择身份 |
| **双向门** | 可以后加、可回滚、局部替换 | FeatureDialog 表单化；tile 批量 API；PBR 渲染；导入作业服务 |
| **有意的单行道** | 选对了就应坚持，不要摇摆 | iTwin 唯一底座、FeatureOp 唯一写管道、ACIS 许可边界 |
| **意外的单行道** | 本是临时实现，却被数据/契约固化 | 单输出特征、单 store、单 briefcase、手写 opDsl 白名单 |

本文重点找**意外的单行道**。

---

## 2. 承重假设清单

| # | 承重假设 | 现在写在哪 | 未来触发 | 断点表现 | 严重度 |
|---|---|---|---|---|---|
| A1 | iModel = 文档，Model/scope = 工作区 | ADR-0001、`WorkspaceRef`、Part Studio registry | 加 Assembly/Drawing/Variable Studio | 没有 `WorkspaceKind`/通用 tab；Part Studio 专用路由/store | **B（可演进）** |
| A2 | 每个 body 恰一个驱动源，特征单输出，按 orderKey 线性求值 | 私有 `FeatureService`/`FeatureEngine`；`FeatureTreeEntry` | split 双侧、mirror 新体、mergeScope 多目标、任意插入/删除 | 需要改执行器与 body 写回契约；不是 UI 能补 | **C** |
| A3 | params 是事实源，几何是派生投影 | BIS + `LubanFeature`/`params`；FeatureOp | 直改、装配、图纸、导入 | 直改体与参数体分叉；导入几何进入事实源需要策略 | **B（原则正确，需守卫）** |
| A4 | 一个 iModel 一个活动 briefcase、一个写者、一条 changeset 时间线 | 私有 MS/WriteLease/hub | 异步多用户、实时协同、多工作区并行 | 第二打开者互踢；undo 跨用户；pull/merge 串行 | **D（实时）/ B（异步）** |
| A5 | 一个页面一个连接、一个视口、一个模块单例 store | `useViewport`/`useBriefcaseConnection`/zustand | 多文档页签、分屏、多视口、AI 并行会话 | 路由卸载关连接；状态跨 scope 污染 | **C（多文档）** |
| A6 | 选择身份 = `ownerBodyKey + native topologyId` | `CanvasSelection`、`OnshapeSelectTool` | 装配实例、图纸引用、多文档 | 同一 Part 多实例无法区分；顶点无持久 id | **C** |
| A7 | iTwin WebGL + 服务端 tile 是唯一渲染路径 | viewer/render-profile/tile | PBR、Render Studio、超大模型、DanQing | 材质/光照 shader 不能公开替换；tile facet 串行 | **B（交互）/ C（高级）** |
| A8 | 几何以 ACIS SAB 持久化 | iModel geometry stream；`SaveEntityToMemory` | TrueForm 切换、跨内核迁移 | 新内核不能读写 SAB；全量迁移/重求值 | **C（决策门）** |
| A9 | 共享契约是手写单体 + 人工版本日志 | `LubanFeatureRpcInterface` 1.85 注释块；`opDsl` 白名单；`strict:false` | 多域契约、AI 生成、跨版本兼容 | 新类型漏同步；无运行时握手；包版本与接口版本脱节 | **B/C（高杠杆）** |
| A10 | 单 MS 进程 + 内存租约/缓存/队列 | 私有 MS | 多实例、SaaS、大团队 | 水平扩展失效；缓存/租约无法共享 | **C（规模）** |
| A11 | 一个编辑器模块 + 手写 ribbon/命令注册表 | `PartStudioPage`/`ribbon-registry`/`FeatureDialog` | Assembly/Drawing/AI 工具/插件 | 每加工具改多处；命令参数无法注入 | **B** |

---

## 3. 扩展压力测试矩阵

> “首个断点”指按当前实现继续做，最先坏掉的层；“可延后”指是否可以先不做，只保留接缝。

| # | 未来场景 | 当前能否承载 | 首个断点 | 结论 | 现在最小前置 | 可延后？ |
|---|---|---|---|---|---|---|
| F1 | 再加 20 个同类参数化特征 | 能，但每个跨 9+ 注册点 | 契约/表单/UI 注册面 | **B** | 特征清单/生成器；form model pilot | 否（否则边际成本不降） |
| F2 | 多输出特征（split 双侧、mirror 新体、pattern 多 body） | 不能 | 执行器/单输出写回 | **C** | 输出端口契约 + 一个 spike | 输出契约必须现在；完整执行器可延后 |
| F3 | 任意插入/删除/重排/回滚特征 | 部分重排，不能中间删除/插入 | 单源线性链 + tail-only 删除 | **C** | 特征图执行器 ADR；删除中间特征 spike | 执行器可延后，但不能再固化假设 |
| F4 | 配置/变体/多状态 | 不能 | 参数/特征树/版本模型 | **C** | 先不实现；避免把单配置写死进 params | 可延后 |
| F5 | Assembly 500 实例 + Mate + BOM | 实例层 B，Mate/BOM C | occurrence/版本钉住、3D 求解器、BRep 实例化 | **C（实例 B）** | 实例/变换 + sourceRef/版本引用 spike；3D solver ADR | 实例可先；Mate/BOM 后 |
| F6 | Drawing 关联视图 + 尺寸/表格 | 显示 A/B，生成 C | 2D viewport、HLR/投影、标注引擎、BOM/版本引用 | **C** | 只读 DrawingModel + `ViewCreator2d` + HLR spike | 可延后，但不要先做假 UI |
| F7 | 多文档/分屏/多视口 | 不能 | 单连接/单 store/单视口/全局 RPC token；多 PS 切 scope 已有旧树/旧 body 残留窗口 | **C** | `DocumentSessionHost` + store 工厂 + 选择域；先修 scope 键控 | 可延后，但选择身份/scope 键控要先留 |
| F8 | 异步多用户（多 briefcase） | Hub 底座 B，应用未接；连只读也需会话隔离 | 单 briefcase/单租约/共享 undo/IPC 广播 | **B** | 会话隔离 + undo 所有权 + per-user briefcase | 可延后，但会话/undo/归因先做 |
| F9 | Onshape 式实时同时编辑 | 不能 | briefcase 快照模型 + 单写 + 无 op 流 | **D** | 产品裁决；服务端权威 op 流 ADR | 可延后，但不要做假 presence |
| F10 | STEP/IGES/Parasolid 导入 | 不能 | ACIS InterOp 许可 | **D** | 许可/第三方/自研三选一 | 决策必须先 |
| F11 | STL/OBJ/3MF/GLTF 网格导入导出 | 底座 B，无 writer | 文件读写器/作业服务 | **B** | 单 body STL 往返 | 可延后 |
| F12 | TrueForm 替换 ACIS | 不能 | SAB 持久化 + 双后端一致性 | **C/D** | SAB 兼容 ADR；M1 前完成 | 可延后，但决策不能拖 |
| F13 | Render Studio/PBR | 不能 | 无 PBR/离线渲染；shader 不可公开替换 | **C** | 渲染边界 ADR；先交互显示增强 | 可延后 |
| F14 | AI 生成整条特征链 | DSL/FeatureOp 可复用，但覆盖不全 | `opDsl` 漏 `draft`、form model 不完整 | **B/C** | 契约清单生成 + DSL 全类型往返 | 现在做，否则 AI 能力会假 |
| F15 | 多租户/SaaS | 不能 | 单进程内存态、无租户/配额/审计 | **C** | 容量模型 + 作业/租约外置设计 | 可延后 |

**矩阵结论**：F1/F2/F3/F14 是 Part Studio 自身就会遇到的扩展问题；F5/F6/F8/F9 是外沿；F10/F12/F13 是许可/内核/渲染单行道。**最危险的组合是“继续按 F1 铺特征，同时不冻结 F2/F3/F14 的契约”**——功能数量上去后，执行器和契约会被迫一次性重写。

---

## 4. 架构轴深挖

### 4.1 文档 / 工作区 / 页签

**现有可复用资产**

- ADR-0001 已裁决目标 B：iTwin = 项目、iModel = 文档、Model = Part Studio/Assembly/Process。
- `WorkspaceRef = {iTwinId, iModelId, modelId?}` 已落地；多 Part Studio scope 注册表、切 scope 不重建连接、tombstone 删除均有测试。
- 一个 iModel 内多 Part Studio 共享 changeset/briefcase/权限的方向是对的。

**断点**

- `WorkspaceRef` 只有 `modelId`，没有 `kind`（Part Studio/Assembly/Drawing/...），也没有 `versionRef`（历史点/命名版本）；`PartStudioInfo` 也只有 id/name/order/defModelId/physModelId，没有工作区类型/版本/权限元数据。
- `PartStudioTabs` 是 Part Studio 专用组件；页签创建/重命名/删除、树、底部 Dock、路由都围绕 Part Studio 写死。页签列表靠 `UserLabel` 前缀 `LubanFeaturePartition:` 推断，不是显式 Tab 元素；如果 Assembly 再发明一个前缀，`listPartStudios`/文档模式探测都看不见它。
- **A/B 两代 IA 并存**：A 旧文档 = iTwin 即文档、iModel 即 Part Studio；B 新文档 = iTwin 是项目、iModel 是文档、Part Studio 是 scope。文档中心列表仍是 iTwin 行对象，编辑器外没有“iModel 文档首页”列出全部 tabs；加 Assembly/Drawing 后用户没有统一入口。
- **多 Part Studio 的“顺序切换”也没有完全隔离**：feature 树/body 的已加载键只按 connectionKey、不含 scope；正常切 scope 时旧树/旧 body 可能在新读失败时残留；对话框不随页签关闭，提交时 `useWorkspaceRef()` 已指向新 scope；相机/撤销是文档级共享。这是当前就能触发的正确性/体验缺口，不只是多文档问题。
- 当前“Part Studio = scope 对（def/phys model + JsonProperties 元数据）”是**分区投影**，不是一等 Workspace/Tab 元素；加 Assembly 时没有统一的“工作区元数据/类型/版本引用”位置。
- 文档级版本、跨工作区引用（Assembly 引用 PS、Drawing 引用 Assembly/PS）、BOM/Where Used 没有数据模型。
- **版本引用今天不可解析**：Named Version 只写元数据；MS `openCheckpoint` 未实现，`downloadBriefcase` 没有 changeset/version 参数；即使 Assembly/Derived 记录“引用 Part Studio V1”，产品也打不开那个版本。版本引用必须先补 read-only 打开路径，否则是假引用。
- **变量表是 per Part Studio scope**：`LubanCAD.PartStudioVariables` 每 scope 一个，ADR-0020 明确不做跨 scope/文档级变量。若未来要 Variable Studio/文档变量，需要文档级变量元素 + 复合求值上下文 + 迁移；现在每个新表达式字段都在加深单表假设。
- **跨 tab 引用被硬性禁止**：草图外部引用只允许本 scope body；没有 occurrence/实例/跨 scope 引用解析器。引用身份（`tabId/documentId/versionRef`）不预留，未来 Assembly/Derived 需要改 evaluator/guards/契约。
- BIS schema 目前靠 additive（如 01.00.01 变量类）维持旧库打开；没有通用的“工作区类型/版本引用”schema 迁移框架与旧库 fixture 矩阵。新工作区类型必须带 schema version + 迁移/回滚。

**可演进路径（B）**

1. 定义文档级 `TabDirectory` + typed `LubanTab`（`tabType: partStudio|assembly|drawing|variableStudio|imported|derived`，`tabId/name/order`，`modelSet`，`sourceRef?`）；Part Studio 只是其中一种。旧 `LubanFeaturePartition:<id>` 由 `listTabs` 合成 `partStudio` 条目，`listPartStudios` 保留为过滤视图。
2. `WorkspaceRef` 增加 `kind` 与可选 `versionRef`（当前 changeset/Named Version）；旧 URL 缺省视为 `partStudio`，保持兼容。引用键统一 `{documentId, changesetId}`，`namedVersionId` 只作展示。
3. 定义 `WorkspaceModule` 契约：`mount/session/store/toolset/selectionSchema`；Part Studio 作为第一个实现，Assembly/Drawing 以后注册，不改 Part Studio 路由。页签列表/切换/删除按 `LubanTab` 类型分派，不再靠 UserLabel 前缀。
4. 跨工作区引用：用 BIS 关系 + `DocumentRef { iModelId, versionRef }` 表达；同文档用 ElementId/Code，跨文档用 FederationGuid/稳定引用；先做“只读引用 + 版本钉住”，再做编辑联动。引用记录从第一天写 `sourceRef`/`LubanReference` 并进入 hub 索引，Where Used 不做全库扫描。In-Context/Derived 按 Onshape 的“快照 + 手动更新”语义，不承诺跨 iModel 实时联邦编辑（单 BriefcaseConnection/事务无法跨库）。
5. 不把 Assembly/Drawing 的 metadata 塞进 Part Studio 的 JsonProperties；建通用 Tab 元素/aspect，按域拆 EC schema（`LubanCAD`/`LubanAssembly`/`LubanDrawing`/`LubanTab`），避免所有 tab 类型同步升级。
6. 配置/变体不要写死进单个特征 params：变量表/配置集应是文档/工作区级模型；特征只引用变量，配置解析在求值前。否则以后做 Onshape Configuration 要重写所有参数。
7. 现在裁决三件事：**变量作用域**（per-tab vs 文档级 Variable Studio）、**undo 粒度**（文档级 vs 页签级）、**Configurations 是否在路线图**。不裁决就继续加表达式字段/多 tab，会把单表、文档级 undo、单配置假设固化。

**判定**：Tab/数据模型 **B（可演进）**，前提是现在加 `LubanTab`/`kind`/module 接缝；版本引用与文档级变量是当前的两块硬缺口（版本打开 C/B，Variable Studio C），undo 粒度是必须先裁决的产品语义。若继续把页签写成 Part Studio 专用、把版本当“名字”，后续会退化为 C/D。

### 4.2 特征图 / 执行器

**现有可复用资产**

- `FeatureOp` 是可序列化操作面；`FeatureDrives` 已能表达 sketch→feature、feature→feature、feature→body、fan-in；`orderKey` + EDE 能支撑追加式参数化。
- **iTwin EDE 存储层本身就是通用 DAG**（多对多、拓扑序、循环 fatal）；限制不在 iTwin，而在 LubanCAD 自己的 planner、缓存写回、evaluator 签名与 UI。这是最重要的“可演进”证据：不需要换数据底座。
- 单源线性链对“AI 生成整条链”和“单用户追加建模”已足够；不是错误设计，而是**范围收窄的设计**。
- `updateVariables` 已有 `beginMultiTxnOperation/endMultiTxnOperation` 多事务分组样板，可作为 AI 批量 op/统一 undo 的种子。

**断点（意外的单行道）**

- **拓扑引用不是全局/历史稳定的**：边/面引用多存裸 `{nodeId,entityId}`；单目标 fillet/chamfer 在 carrier 上直接按 id 寻址，没有 bodyKey 限定；顶点无持久 id；内核 ID 是创建顺序+分裂继承，没有几何回退。insert/delete middle 或多 body 后，旧引用可能不存在（status=1），也可能被新拓扑复用而**静默命中另一条边/面**。这是历史编辑的先决风险。
- **真正的硬限制是“一特征一输出”**：输出缓存一个 featureId 一份平铺 entries；异步 evaluator 签名只能返回一份；`writeBodyFromCache` 要求恰 1 条 BRep。每个 body 恰一个**生产者输出**本身不是主要障碍，多输出也可以保持“一 body 一生产者”；要放松的是“一个特征只能产出一个输出”。
- 多目标 fillet/REMOVE 的 `multiBodyOutputCache` 是唯一例外，但它是**终态**：下游不能消费多目标输出（`upstreamEntriesFromCache` 直接拒绝）。因此当前“一特征多 body”不能继续参与链。
- 删除只允许链尾；中间删除/插入/回滚没有执行器；`reorderFeature` 对纯链的非恒等排列必违反拓扑守卫，实际只剩恒等。
- `featurePattern`/`featureMirror` 的 `sourceFeatureId(s)` **没有建 EDE 边**，求值器直接读源缓存；`updateParams` 也没有校验源特征的 scope 归属。这是绕过依赖图的隐藏引用，冷重建/跨 scope 时可能读取错误或缺失（需真栈复核）。多输出/历史必须把它收口成正式输入边 + scope 校验。
- 结构键（`newBody`、loft `sketchIds`、sweep 草图、booleanBodies targets/tools/operation）禁止 `updateParams`，编辑退化为“删除重建”。
- `FeatureTreeEntry` 只有扁平 `params: unknown`，没有输出端口、输入引用、依赖边、状态/回滚信息；树的草图序位还依赖 OpLog 的 insertFeature 计数，历史/顺序/依赖被耦合。
- preview 与 apply 是手工镜像，每加一个特征要改两处校验。
- **两套 undo 并存**：UI Ctrl+Z 走原生 iTwin 事务栈；`FeatureOp.undo/redo` 走语义 OpLog（仅部分 op 可逆）。两者不共享栈、不可协同；未来 per-user undo/操作流会被这两套语义直接卡住。
- **两条写路径**：参数化走 FeatureOp；直改（transform/boolean/pattern 等）走 editor IPC + `DirectEditGuard`，会暂停特征再生；`reparameterizeBody` 未暴露 RPC。同一模型存在“特征体/直改体”两种谱系，未来可编辑历史/undo/AI 必须在两条路径上都闭环，否则“单一编辑管道”只是名义上的。

**目标（C，但可渐进）**

- **输出端口模型**：特征声明 `outputs: [{portId, kind: body|sheet|curve|plane, bodyType, mergeScope}]`；下游引用 `{featureId, portId}`，而不是“目标 body 当前唯一源”。每个 body 仍只应有一个生产者输出，但一个特征可产出多个 body/端口。
- **输入收口**：`featurePattern`/`featureMirror` 的源特征引用、草图结构引用、外部引用都建正式输入边/角色；不再允许 evaluator 绕过依赖图读缓存。
- **图执行器**：沿用 iTwin EDE 作边存储（它已是通用 DAG），新增输入/输出角色与端口元数据；节点=特征/草图；按拓扑序求值；`orderKey` 只作显示顺序；支持中间删除/插入/回滚（重算受影响子图）。
- **多输出**：split 双侧、mirror 新体、pattern 多 body、boolean keep tools 用同一输出契约；不再为每个特征写专用写回。
- **统一校验器**：apply/preview 共用一个 `validateFeatureOp -> plan`，预览只做影子求值。
- **旧库兼容**：Feature 行加法引入 `graphVersion/inputsJson/outputsJson/treeIndex`（或新 EC 属性/关系，schema additive）；旧行没有这些键时，由 legacy 适配器按当前链语义推导：incoming feature edges = 依赖输入，feature→body = 唯一输出，multi-target = 多输出。`orderKey` 保留为 treeIndex；旧行天然是链，拓扑序与 orderKey 一致。迁移可复用 `PartStudioMigration` 的“定义+引用图复制 + rebuildAll + 体积/bbox 验证”，不做逐 body 搬几何；用 Tutorial2/Handle/Bumper 体积金标和拓扑 ID 断言做 fixture 回归。
- **统一 undo 语义**：以“操作组/事务”作为唯一用户可见撤销单位；原生事务与 OpLog 不再各管一套；为未来 per-user undo 留 `opId/userId` 归属。
- **直改收敛**：直改要么落成可回放的 FeatureOp（推荐），要么显式标记为“非参数化覆盖”并提供 reparameterize/撤销语义；不能长期保留两条不互通的写谱系。

**目标数据模型（BIS/EDE 上的加法）**

```
FeatureRow { id, featureType, treeIndex, params, graphVersion,
             inputsJson?, outputsJson?, suppressed, status, error? }
FeatureInput  { sourceFeatureId|sketchId|bodyId|planeId, role, required, multiplicity }
FeatureOutput { outputKey, kind: body|plane|sketch|query, bodyId?, revision? }
BodySolid     { id, producedBy: {featureId, outputKey}, state: active|consumed, geometry }
```
每个 body 仍只有一个 active 生产者输出；一个 feature 可有 N 个 outputs；`treeIndex` 与依赖序分离；旧行无 graph 字段时由 legacy 适配器推导。

**现在必须做的**：冻结输出契约（即使执行器还没做）；新特征不得再写“只支持单 body”；`FeatureTreeEntry` 增加可选 `outputs/inputs`；用一个 split 双侧或 mirror 新体 spike 验证契约；拓扑引用先加 body/scope 限定。

**判定**：**C（执行器）**，但**不是方向性冲突**；如果现在冻结端口契约，迁移是渐进的；如果继续铺特征分支，未来要重写每个分支的写回。

### 4.3 契约 / 特征扩展机制

**现有可复用资产**

- `FeatureOp` 12 分支、21 个 FeatureType、FeatureTypeRegistry（schema + formFields + evaluator）、opDsl 12 op 分支；单管道方向正确。
- 版本化注释、shared 契约测试、真栈 e2e 已有纪律。

**断点（高杠杆）**

- **手写多份清单**：`LubanFeatureType` 联合、`FeatureParams` 联合、后端 zod schema、`FeatureTypeRegistry`、`FeatureFormField[]`、`opDsl.FEATURE_TYPES`、`opDsl` 的 `ALL_FEATURE_TYPES`、UI ribbon/capabilities/树/命令、i18n、测试。
- **已实证漂移**：`LubanFeatureType` 含 `draft`，但 `opDsl.ts` 的 `FEATURE_TYPES` 不含 `draft`；`opDsl.test.ts` 的 `ALL_FEATURE_TYPES` 也不含；`shared/tsconfig.json` `strict:false`，主 tsconfig 排除 `src/**/*.test.ts`，而 `tsconfig.test.json` 只 include 了两个测试（`LubanFeatureRpcInterface.test.ts`、`expression-evaluator.test.ts`），**不含 `opDsl.test.ts`**。因此“编译期穷举”既不受 strict 约束、也不进入 `test:types`。运行时 `dslToOps("op insertFeature draft {}")` 直接报“未知 featureType”（2026-11-22 本地复现）。这意味着 **AI/DSL 无法生成产品已支持的 draft**，而现有测试全绿。
- **表单模型不完整且未消费**：`FeatureFormFieldKind` 只有 `number/json/boolean/edgeRefs/faceRefs/readonlyText`；没有单位、枚举/select、默认值、min/max、条件显示、分组、帮助/i18n；registry 注释承认“v1 表单模型无 select kind，web 用专用下拉”。`getFeatureFormModel` 在前端零消费。
- **契约单体**：`LubanFeatureRpcInterface` 把 Part Studio 的草图/特征/变量/质量属性/重命名/租约全部放在一个 interface；加 Assembly/Drawing 会继续膨胀或另起 interface，但没有域边界/运行时握手。
- **两个契约面**：`LubanRpcInterface` 1.1.0 仍宣告 briefcase/conflict/export 等方法，但实现多为 throw 或 `featureAvailable:false`；`LubanFeatureRpcInterface` 才是实际写管道。AI/新客户端无法从契约判断“哪个可用”，应按域收敛并标注 unavailable/deprecated。
- **包版本与接口版本脱节**：`packages/shared/package.json` 仍是 `1.0.0`，`interfaceVersion` 已是 `1.85.0`；版本信息只活在注释和 RPC URL 里，没有机器可读契约清单/兼容矩阵。
- **params 无 per-feature 版本/迁移**：`LubanFeature.params` 是不透明 JSON 文本，没有 `paramsVersion`；变量表有 `version:1`，特征参数没有。参数只能靠“只加可选字段 + zod 默认”维持旧库兼容；一旦需要重命名/改类型/删字段，就没有迁移锚点。
- **架构文档不是事实源**：`docs/Architecture.md` 仍把 TrueForm 写成平台内核、仍示例旧 `LubanRpcInterface` briefcase 调用；与当前 ACIS/FeatureOp 实现不一致。新成员/AI 若把它当规范会走错路。应重修或明确标注“历史设计”。
- **UI 注册面**：`FeatureDialog.tsx` 6,761 行、63 处 `featureType` 引用；后端 `FeatureService` 有 112 处 `featureType` 引用/75 处显式分支。新增特征至少跨 shared/后端/registry/formFields/ribbon/capabilities/Ribbon/Canvas/Dialog/命名/树/图标/单测/真栈/账本等 9+ 点。前端还有 `BODY_PRODUCING_FEATURE_TYPES` 这类手工 FeatureType 列表，漏同步会影响树/取景回退判断。

**目标（B，高 ROI）**

- **单一 Feature Manifest**（机器可读）：
  `type, paramVersion, paramsSchema, formSchema, outputPolicy, structuralKeys, evaluatorKey, toolSpec, aiSpec, capability, i18nKey, tests`。
  由 manifest 生成：TS 类型、zod、`FeatureTypeRegistry` 元数据、`opDsl` 白名单、`FeatureFormModel`、ribbon/capability 元数据、AI tool spec；`paramVersion` + migration hook 提供旧库升级锚点。
- **域契约拆分**：`LubanPartStudioRpc`（现有）、`LubanAssemblyRpc`、`LubanDrawingRpc`、`LubanDocumentRpc`；共享 `TopologyRef/DocumentRef/VersionRef/SelectionRef`；每域独立 `interfaceVersion` + 运行时握手。
- **表单运行时**：扩展 `FeatureFormFieldKind` 至 `string/enum/number(unit,min,max,step,default)/boolean/refs/bodyRefs/list/group/readonly`，由 manifest 生成；前端先用一个简单特征（extrude blind/hole）做对拍 pilot，再替换。
- **opDsl 全量覆盖**：由 manifest 生成白名单；启动/CI 检查 `LubanFeatureType` 与 DSL 集合相等；`draft` 必须立即补；`shared strict:true`（或至少对该文件 `strict`）。
- **契约门禁**：shared 包版本 = interfaceVersion；manifest 哈希进 interface-freeze；双端运行时版本握手；禁止注释式 changelog 作为唯一记录。

**判定**：**B（可演进，但必须现在做）**。这是“加 20 个特征”与“加 200 个特征”的分水岭。

#### 4.3.1 AI / Agent 扩展

AI+CAD 的长期目标要求 Agent 生成**可验证、可撤销、可参数化**的操作，而不是直接写几何。当前底座有正确种子：`FeatureOp` 是可序列化操作，`opDsl` 是文本目标，`OpLog` 是审计日志。

但 AI 路径会被几件事卡住：

1. **DSL/契约覆盖不全**：`draft` 已产品化但 DSL 拒绝；form model 不完整；AI 无法从契约得知某字段的单位/枚举/默认值/条件。
2. **工具运行时不带参数**：`IModelApp.tools.run(toolId)` 无选项注入；AI 只能开一个空工具再模拟 UI，不能结构化调用。需要 `runCommand(toolId, args)` / `Tool.start(options)`。
3. **没有操作信封/权限/审计**：没有 `opId/userId/baseChangeset`、没有 per-tool 权限、没有 HITL 预览/确认的通用协议；`FeatureOpResult` 只返回 `featureId`，没有输出/body 回执；insertFeature 重试没有幂等键，会重复建特征。
4. **没有批量/事务分组**：每个 `applyFeatureOp` 一笔事务；AI “草图 + 多个特征”需要多次往返，中途失败会留半成品（`updateVariables` 的多事务分组是现成种子，但没有通用 batch）。
5. **没有整链 dry-run**：preview 只支持单 op，很多类型无几何预览；没有“计划 + 影响面 + 失败点”的事务前预览，也没有服务端确认 token。

**目标**：Agent 只通过 Feature Manifest + FeatureOpEnvelope + 标准工具运行时工作；破坏性操作强制预览→确认→提交；所有 op 可审计、可撤销、可回放。不要在 AI 侧另起一套写几何的 API——那会直接破坏单一写管道。

**现在做**：manifest v0 + DSL 全类型 + `runCommand` 最小通道 + op 信封；不要先做“AI 面板/聊天壳”。

### 4.4 UI / 状态 / 选择

**现有可复用资产**

- 五区壳、Onshape 式树/对话框/右键/快捷键/ViewCube/预览、标准工具基类、选择权威、真栈 e2e；这些是真实资产。
- `WorkspaceRef` + scope 切换不重建连接，为多工作区留了路由抽象。

**断点**

- **单例 store**：zustand 模块单例，不是按文档/视口分桶；多文档/多视口会共享 selection/sketch/dialog，靠 effect 重置，跨 scope 竞态已多次出现。工具层还直接 `getState()`，store 同时是全局服务定位器。
- **单连接/单视口/全局 RPC token**：页面级一个 IModelApp、一条 `/ipc`、一个 BriefcaseConnection、一个 `ScreenViewport`、一个 ToolAdmin；`RpcManager.setIModel` 的 fallback token 是静态全局，多连接并存时字符串键 RPC 可能被“最后一个连接”串话（需 spike）。多文档并列页签不可表达。
- **选择身份**：`ownerBodyKey + topologyId`；没有 occurrence path/文档引用；顶点无持久 id；面拾取逐面 RPC（27 面约 50ms，数百面不可用）。同时存在 store 选择、SelectionSet、树选择、工具内部选择四套表示，装配/图纸会再增加，必须收敛为 `SelectionDomain`。
- **表单/命令运行时**：`FeatureDialog` 单体；`tools.run(toolId)` 产品侧无参数注入通道（iTwin 框架其实支持 `tools.run(toolId, ...args)`/`defaultToolArgs`，是产品契约没用），草图靠模块级 accessor；直改工具的 ToolSettings 占位；快捷键分散 4 处。
- **多 tab 状态**：页签只是 scope 选择器，没有每 tab 的打开/脏标记/相机/撤销/布局；切 tab 不关对话框，`FeatureDialog` 提交时才读 `useWorkspaceRef()`，可能写到新 scope。对话框命令是单槽，多个对话框/视口会互相覆盖。
- **装配/工程图 UI**：页签、菜单、路由均 gated；没有工作区模块/页面壳。

**目标（B/C）**

分层：L0 页面 host（保留全局 IModelApp/IPC）→ L1 `DocumentSessionHost`（连接/租约/store 实例）→ L2 `WorkspaceRegistry`/Tab（kind/id）→ L3 工作区适配器（PartStudio/Assembly/Drawing 各自的树/ribbon/tool/selection/undo policy）→ L4 `ViewportHost`（3D/2D + 每视口 OverlayHost）→ L5 manifest/契约。

- **WorkspaceHost + per-session store**：`createPartStudioStore()` 工厂，React context 注入；`DocumentSessionHost` 管理连接池（同一 iModel 可共享连接，多文档另建），并为每个连接显式携带 RPC token，不能依赖 `RpcManager` 的全局 fallback；先单文档跑通，再开多文档。
- **选择身份**：`SelectionRef { documentRef, workspaceRef, occurrencePath[], bodyKey, topologyRef, vertexRef? }`；Part Studio 只填前几项，装配填 occurrence path；顶点补 `resolveVertexRef` 持久 id 契约。
- **选择域**：`SelectionDomain` 接口（replace/clear/projectToSelectionSet/getPrimary），Part Studio 先适配；装配 occurrence/图纸标注各自适配，不再复制四套全局表示。
- **视图宿主**：`ViewportHost` 抽象 3D spatial / 2D drawing；`useViewport` 只保留 3D 实现，Drawing 用 `ViewCreator2d`/SheetViewState；不要在同一個 Part Studio 3D 视口硬塞 SheetModel。
- **表单运行时**：manifest → form renderer；字段组件（单位/表达式/枚举/条件/refs）统一；对话框只保留布局/预览/确认，不再按 featureType 分支。
- **命令运行时**：`runCommand(toolId, args)` 或 `Tool.start(options)`；统一 keymap；ToolSettings 面板；AI/自动化可带参数复用。
- **批量拾取**：后端批量 face/topology DTO + 客户端 BVH/GPU pick；先做 Part Studio 大模型，再接装配。

**判定**：**B（单文档）/ C（多文档、装配级选择）**。现在加 `occurrencePath` 与 store 工厂是低成本；等到装配 UI 再改会牵动所有工具与对话框。

### 4.5 协同 / 版本 / 权限 / 平台

（详见 `04-COLLABORATION-AND-DATA.md` 与 `07-KERNEL-AND-NATIVE.md`；这里只列可演进性判断。）

**现有可复用资产**

- iModel changeset/briefcase/lock；Hub 锁语义、rebase、Named Version、权限、webhook；异步多 briefcase 的底座是真实存在的。
- FeatureOp/OpLog 可序列化，是未来操作流/审计的种子。

**断点**

- **连“单写者 + 多只读”当前也不可用**：MS 共享 briefcase 文件，`openBriefcase` 关闭同名库；IPC 对所有 WS 连接广播、requestId 从 1 递增，第二用户（含只读）会互踢/收到对方响应/把命令串到对方库。会话隔离是任何第二用户的前置。
- **直接编辑绕过写门**：pattern/mirror/delete/transform 等 editor 直改不检查写租约/ACL/OpLog；“单写者”只是 FeatureOp 的局部约定。
- **undo 所有权**：OpLog 随 changeset 传播，`findUndoTarget` 不按 user/briefcase 过滤；异步多用户第一步是按用户/会话过滤 undo，而不是只加 briefcase 数量。
- 无 checkpoint 生成器：Named Version 仅元数据；冷开重放全部 changeset；20s autosave 放大历史。**版本引用不可解析**：MS `openCheckpoint` 未实现、`downloadBriefcase` 无版本参数。
- **账本可改写/可悬挂**：changeset 可改 parentId/可建无父根/DELETE 可挖洞；complete 不校验 blob/checksum；`waitingForFile` 行若崩溃会永久阻塞链头；fork 只复制 checkpoint、`preserveHistory` 不生效，对已有编辑文档会复制**空 baseline**；mid-history checkpoint 后 fork 可能外键失败。顺序必须是“冻结账本 → checkpoint → Named Version → restore/compare → 分支”。
- 无 per-iModel ACL / 用户归因：MS 服务账号直通；groups/shares 不参与授权；changeset/briefcase 归服务账号，OpLog.user 是 sessionId。
- 网络/凭证卫生：WS token 进 URL/console/日志；连接后不复验；WA 调试/管理端点无认证且默认 0.0.0.0；Azurite 公开默认密钥并暴露端口；入口无 TLS。任何一条都阻断对外 SaaS。
- 单父 changeset + fork 新 iModel：分支/合并是 D；Onshape 式版本图需要新服务。
- 单进程内存租约/缓存/无 HA/GC/active lock TTL；MS 是有状态会话服务（native+本地 briefcase），多实例需要粘性路由/外部 lease/fencing。SaaS 规模是 C。

**目标与顺序**

1. **先做会话隔离**：per-session IPC 路由、briefcase 文件/key、Editor 命令、openBriefcase 路径白名单；共享 briefcase/全局广播下“多只读”也不可用。鉴于 `EditCommandAdmin`/IpcHost 全局单例，进程级会话 actor 可能比单进程多会话更安全。
2. **再做正确性/安全**：per-iModel ACL、连接后 token 校验、下载/打开/FeatureOp/直接编辑统一鉴权、负例测试；真实 userId；changeset/NV 事件。
3. **冻结账本**：changeset 不可变（PATCH 白名单/DELETE 收紧）、悬挂 `waitingForFile` 恢复、fork 语义（Duplicate vs with history）；然后每 N changeset/每个 Named Version 生成真实 checkpoint；200 changeset 冷开基线；版本 read-only 打开。
4. **异步多 briefcase（B）**：先 undo 所有权（OpLog 按 user/briefcase 过滤）再 per-user briefcase；锁冲突 UI、周期 pull、active lock/briefcase 过期；不共享 undo。RPC 层引入 `FeatureOpEnvelope { op, opId, userId, baseChangeset? }`。
5. **真实时（D）**：只有产品明确要求才做；建议服务端权威 op 流（P1），不建议 OT/CRDT；必须 per-user undo、会话隔离、操作排序/重放。
6. **版本图（D）**：Branch/Merge 需要新版本图服务；先把 Restore/Compare/真实 Named Version 做扎实，不要用“fork 新 iModel”冒充分支。

**判定**：**异步多 briefcase B；实时协同 D；版本/恢复 B；分支/合并 D；权限粗粒度 B / 企业级 C。**

### 4.6 几何 / 渲染 / 导入导出

**现有可复用资产**

- ACIS Modeler/Polyhedra 经 `SolidKernel.h`/PSBRep 的稳定面；布尔/Blend/Chamfer/Hollow/Offset/Taper/Imprint/拓扑 ID/facet/tile；iTwin WebGL + tile + BRep 叠加。
- 草图轮廓→BRep、基础特征、拓扑 ID、保存往返、批量 facet 都有测试。

**断点**

- 无 BRep 实例化（重复零件深拷贝）；大装配内存/时间线性放大。BIS/GeometryPart 可做显示实例，但 editor 几何缓存对 part 引用可能丢失 occurrence placement，装配拾取/高亮会错位（需真栈）。
- 生产 tile facet 回落 owner 串行；tile 内容并发硬编码 4；特征提交后全 model tile tree 失效；facet 没有 face/edge ID，tile 只有元素级 feature。
- 面拾取依赖原生 locate 规避 + O(面数) IPC；顶点无持久 id；编辑器 `EditCommandAdmin` 的 active command 是**进程级单槽**，多文档/多用户/多视口的拓扑读/删除/编辑会互斥。
- 质量属性产品路径用 facet 四面体求和（粗公差换性能），native 已有精确质量属性通道；体积口径不统一会掩盖几何缺陷。
- 扫掠光滑路径近似、fillet 仅恒定半径、DeleteFace 普通面 blocked、曲面/螺纹/钣金无通道。
- SAB 持久化锁死内核替换；TrueForm M0 无兼容层。
- PBR/IBL/离线渲染缺失；iTwin 材质/光照 shader 不能公开替换；DanQing PBR/Web 化未实现。
- 导入导出：DXF 草图 B；mesh 可做但无 writer；STEP/IGES/Parasolid 是 D（许可）；DWG/DWT 需 SDK；无作业队列。

**目标（现在只做接缝/ spike）**

- **内核**：冻结输出/拓扑/持久化契约；SAB 兼容 ADR；BRep 实例共享 ADR；批量 facet/tile 键控；先做 100 body tile 与 500 实例内存 spike。**现在就在 `BRepData` 增加向后兼容的 `format/kernel` 标签**（默认 ACIS SAB），即使 TrueForm 不上线，混合文档也可诊断。
- **装配/BOM**：BIS 可做刚性实例，但 BOM 还需要 part properties（part number/description/revision/material）与 sourceRef 索引；当前 BodySolid 只有 name，BOM 行无法稳定合并。GeometryPart occurrence transform 必须先做真栈 spike，否则装配拾取会错位。
- **拾取**：把拓扑/拾取从“编辑命令副产物”提升为只读服务：`TopologySnapshot`（一次返回 body/face/edge/vertex + persistentId/sessionId/range/邻接/曲线）+ `PickBatch`（ray + 候选 + revision/transform → 排序命中）；缓存键带 `geometryGuid/revision`；解耦进程级单命令槽。先做 CPU BVH + 批量 native pick，GPU 子实体 pick 留到量测后再决定（需 core fork）。
- **facet**：至少预留可选 face/edge ID 数组；tile 格式先不消费，但不要等以后重 facet。补一个真实 BRep→tile 测试（现有可视化测试用桩，不能证明 BRep 路径）。
- **导入**：STL/OBJ/3MF 应作为 mesh body/Polyface 显示与导出，不要逐 facet `BodyFromPolyface` 强行 BRep 化（复杂度随三角形爆炸、500k 点上限）；用户要布尔时再走独立“精确化/修复”服务。`BodyInfo.geometryKind`（brep/sheet/wire/mesh）先加，避免对网格体假装 BRep 特征。
- **剖切**：section UI 前先裁决 BRep 叠加层 clip 语义（WorldDecoration 被 clip，WorldOverlay x-ray 不被 clip）；不要接线后才发现边穿出切面。
- **PBR**：材质 UI 前先定路线（core shader fork vs 独立离线服务）；屏幕空间后处理拿不到法线/材质 G-buffer，不能靠它补 PBR。
- **质量属性**：实体体积/质心/惯量走精确 native 通道（或明确标 approx）；不要让体积金标依赖渲染公差。op 枚举（native/app/freeze）由单一 manifest 生成并握手，避免 38/38/37 三份漂移。
- **渲染**：保持 iTwin 唯一交互渲染；PBR 需 ADR（core shader fork 或离线服务）；不要先做 Render Studio 资产库；DanQing 仅作离线候选。
- **工程图**：先独立 2D 路由/viewport（`ViewCreator2d`/`SheetViewState`）只读显示既有 DrawingModel；不要把它硬塞进 Part Studio 3D 视口；没有 HLR 不要做“自动视图” UI。
- **导入导出**：先 mesh（STL/OBJ/3MF/GLTF）与 DXF 草图；STEP 先许可/第三方裁决；文档级导入需要作业服务。

**判定**：**交互渲染/基础内核 B；大模型/装配 C；高级曲面/工程图 C；STEP D；TrueForm C（决策门）。**

### 4.7 平台 / 规模

**现有可复用资产**

- 单机栈、docker compose、verify-stack、真栈 e2e、Azurite/Postgres/Redis；小团队部署可用。
- Hub 的锁/advisory lock/SDK 兼容/基线补偿是真实工程资产。

**断点**

- 单 MS 进程；FeatureService/缓存/租约/求值锁内存态；无水平扩展位置。限流也在进程内且代理后共享单桶（MS 未设 `trust proxy`）。
- 同步 native 内核在主线程；libslvs 同步且不可 worker；单活动 EditTxn/库。
- 读面 N+1、`getSketch` 全量求解、`getMassProperties` 全量面片化、OpLog 全表扫描、缓存无淘汰。
- 无 checkpoint/GC/HA/配额/租户；active lock 无 TTL；briefcaseId 池无耗尽保护；无界缓存/数千 iModel 级本地缓存没有清理。
- 灾备是单卷单副本：无 PITR、对象版本化、跨区、备份编排、恢复演练；DB 与对象存储没有成套恢复 manifest。Redis 256MB `noeviction`；WA 队列文件在容器内且未挂卷；Hub cron 非分布式。
- 发布/环境不是可复现单元：MS 构建依赖宿主路径/无 lockfile/`tsc --noCheck`；native store fallback；`latest` 镜像；无 staging/manifest/签名/SBOM；升级先删旧树、无原子回退。

**目标（C，分阶段）**

- 先做“模块化单体 + 作业服务”：
  -  checkpoint/import/render/tile 生成走独立 job service/queue；
  -  每文档 actor/lease 服务（先内存，后可外置）；session router/sticky + 外部 lease/fencing；
  -  读模型缓存/分页/增量；缓存/briefcase 上限/淘汰/关闭清理；
  -  明确单主机并发文档数/编辑人数上限；限流按 user/tenant。
- 数据面：Postgres HA/PITR、对象存储版本化/跨区、Redis HA/持久队列、备份 manifest 与季度恢复演练；RPO≤5m/RTO≤1h 为目标。
- 发布：self-hosted CI、可复现 MS、release manifest/digest/签名/SBOM、staging 同形态、N-2 原子升级/回滚。
- 再评估多实例会话亲和、外部租约/缓存、租户隔离/配额/审计。
- 不要现在拆微服务；但要把**会被拆出去的边界**（job、checkpoint、session、storage、outbox）定义成接口。

**判定**：**本地/小团队 B；SaaS/多租户 C。**

---

## 5. 单行道登记

| 决策 | 当前选择 | 可逆性 | 最晚决策点 | 建议 |
|---|---|---|---|---|
| 数据底座 | iModel/BIS 唯一 | 低（有意单行道） | 已定 | 保持；不要第二套模型库 |
| 文档/工作区模型 | iModel=文档，Model=工作区 | 中（可加 kind/版本引用） | 加 Assembly/Drawing 前 | 现在加 `WorkspaceKind`/`WorkspaceRef.kind`/`WorkspaceModule` |
| 特征输出 | 单源线性链、单输出 | 低（数据/执行器耦合） | 继续铺特征分支前 | 冻结输出端口契约；做一个多输出 spike |
| 拓扑引用身份 | 裸 `{nodeId,entityId}`、无 body 限定/回退 | 低（引用已存在数据里） | insert/delete middle 前 | 先做 `(bodyId,topoId)` 限定 + 几何回退/查询命名 spike |
| 特征契约 | 手写单体 + 人工版本 | 中（可加 manifest） | 下一批特征前 | manifest/codegen；修 `draft`/strict；运行时握手 |
| 选择身份 | bodyKey+topologyId | 中（类型可扩，逻辑要改） | 装配/多文档前 | 现在就补 `occurrencePath/documentRef` 字段 |
| 协同模型 | 单 briefcase/单写者 | 高（实时需重构） | 任何分享/多用户前 | 先异步多 briefcase；实时单独立项 |
| 版本模型 | 单父 changeset；Named Version 仅元数据；无 read-only 版本打开 | 高（引用已存在数据里） | 任何 Assembly/Derived 版本钉住前 | 先补 openCheckpoint/version 参数 + checkpoint；引用键统一 changesetId（NV 名/index 只展示）；分支另立 |
| 版本账本 | changeset 可 PATCH/DELETE；`waitingForFile` 悬挂阻塞链头；fork 只复制 checkpoint | 高（审计/版本/发布基础） | checkpoint/版本/分享前 | 先冻结不可变 + 悬挂恢复 + fork 语义，再 checkpoint |
| 变量作用域 | per Part Studio scope | 高（表达式/契约扩散） | 加 Variable Studio/文档变量前 | 现在裁决；预留合并求值上下文或明确 de-scope |
| undo 粒度 | 文档级 | 中（事务/协作耦合） | 多 tab/协作前 | 现在裁决；页签级 undo 需改 op log/事务边界 |
| 几何持久化 | ACIS SAB（无内核/格式标签） | 低（数据已积累） | TrueForm M1 前 | 先加 `format/kernel` 标签；裁决 SAB 兼容/迁移/双格式 |
| facet/tile 拓扑 ID | 只有元素 feature，无 face/edge ID | 高（tile 格式/缓存） | 装配拾取/GPU pick 前 | 现在在 FacetEntity 预留可选 ID 数组 |
| 渲染后端 | iTwin WebGL | 高（PBR 可 fork/离线） | PBR/Render Studio 前 | 保持唯一交互渲染；PBR 走 ADR |
| 导入许可 | 仅 Modeler+Polyhedra | 低（商务） | 承诺 STEP 前 | 许可/第三方/自研三选一 |
| 平台形态 | 单进程 | 中（可外置 job/租约） | SaaS/大团队前 | 先定义 job/session/storage 接口 |

---

## 6. 目标架构蓝图（逻辑）

```
┌────────────────────────────────────────────────────────────────────┐
│ UI Shell（工作区宿主）                                              │
│  Document/Workspace Tabs · WorkspaceHost · Command/Keymap · Form    │
│  Renderer · SelectionRef(document/workspace/occurrence/topology)    │
└───────────────┬────────────────────────────────────────────────────┘
                │ 域 RPC（运行时版本握手）
┌───────────────▼────────────────────────────────────────────────────┐
│ Workspace Modules                                                   │
│  PartStudioModule   AssemblyModule   DrawingModule   FileModule     │
│  各自 store/toolset/selection schema；不互相 import 内部             │
└───────────────┬────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────┐
│ Feature Platform（Part Studio 内）                                  │
│  Feature Manifest → schema/form/DSL/AI spec                         │
│  Feature Graph Executor（输出端口/多输出/拓扑调度/回滚）             │
│  Evaluator Registry（同步/异步/内核 op）                             │
└───────────────┬────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────┐
│ Geometry / Render / Job Services                                    │
│  SolidKernel（ACIS now, TrueForm later）                            │
│  Body/Instance/Transform（应用层，不塞内核）                         │
│  Tile/Pick/Batch Topology · Import/Export · Checkpoint · Render      │
└───────────────┬────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────┐
│ Persistence / Collaboration                                         │
│  iModel/BIS（事实源） · changeset/checkpoint · briefcase/lock        │
│  Session/Operation layer（per-session IPC/briefcase/Editor；异步/实时可选） · ACL/attribution/audit │
└────────────────────────────────────────────────────────────────────┘
```

**边界原则**

1. **iModel/BIS 只做事实源**：不把 UI 状态、会话、任务队列塞进 schema。
2. **工作区模块不互相 import 内部**：共享 `WorkspaceRef/SelectionRef/TopologyRef` 与域 RPC；Assembly 通过引用使用 Part Studio，而不是调用其 React 组件。
3. **Feature Manifest 是特征唯一声明源**：类型/schema/form/DSL/AI/tool/capability 由它生成，禁止六处手写。
4. **几何内核只提供几何**：实例、变换、BOM、Mate、Drawing 投影在应用/服务层；不要把产品子系统塞进 `SolidKernel`。
5. **协同层与持久化分离**：changeset 是耐久化；实时/异步会话是另一层；不要用 briefcase 文件充当操作流。
6. **作业服务可外置**：checkpoint/import/render/tile 生成不占用主编辑进程的事件循环。

---

## 7. 迁移跑道（不阻塞 Part Studio）

### Phase 0：接缝冻结（2–4 周，独立于功能）

1. **契约清单 v0**：manifest 覆盖现有 21 类型；生成 `opDsl` 白名单；补 `draft`；`shared` 相关文件 `strict:true`；shared 包版本与 `interfaceVersion` 对齐；运行时握手。
2. **工作区接缝**：`WorkspaceKind`/`WorkspaceRef.kind`/`WorkspaceModule` 类型与 stub；Part Studio 适配；加一个空 Assembly tab 的编译期验证（不实现功能）。
3. **选择身份接缝**：`SelectionRef` 增加 `documentRef/occurrencePath`（Part Studio 空值）；`SelectionSet` 投影兼容；单测。
4. **状态接缝**：`createPartStudioStore()` 工厂 + `PartStudioSession` context；单文档全绿，为多文档做准备。
5. **平台正确性**：会话隔离（IPC/briefcase/Editor）；冻结 changeset 账本（不可变/悬挂恢复/fork 语义）→ checkpoint 生成器（Named Version/每 N changeset）；per-iModel ACL + 负例；真实 userId；changeset/NV 事件。
6. **性能基线**：批量 face/topology DTO + 100 body tile 冷构建；记录预算。
7. **拓扑引用/拾取通道**：两个同构 body 的 edgeRef 交叉提交、fillet 前插入改变拓扑；确认当前是拒收、命中对应边还是静默命中错误边；同时冻结 `TopologySnapshot/PickBatch/SelectionRef` DTO（只加类型/只读方法，旧路径保留），把 `(bodyId,topoId)` 限定/几何回退做成 ADR。
8. **Tab 注册表 v0**：`listTabs` + legacy 合成 + `PartStudioInfo.tabType`；旧文档/旧前端零回归；不实现 Assembly/Drawing 功能。
9. **版本打开 v0**：MS `openCheckpoint`/`downloadBriefcase` 版本参数 + Named Version checkpoint；真栈验证“打开 V1 → 几何正确 → 被引用版本不可删”。
10. **scope 状态隔离（立即修）**：feature 树/body 的已加载键加入 scopeId；切 scope 失败清空旧树/body；对话框随页签关闭或重挂；明确相机/undo 是否按页签隔离。当前这是最便宜、最该先修的正确性缺陷。
11. **CommandRegistry v0**：把 ribbon/palette/keymap/capabilities/AI spec 收进一张命令表；旧 `useToolActivation` if/else 保留兼容壳；先注册一个 dummy 命令验证五处同源。
12. **几何缝预埋**：`BRepData` 加 `format/kernel` 标签；FacetEntity 预留 face/edge ID；GeometryPart occurrence transform 真栈 spike；op 枚举单一 manifest。

### 7.1 现在 / 下一波 / 以后 / 不做

| 时间 | 动作 | 目的 |
|---|---|---|
| **现在** | Feature Manifest v0 + `draft` + strict + 运行时握手 | 停止契约继续漂移；AI/DSL 可覆盖全部类型 |
| **现在** | `WorkspaceKind`/`WorkspaceModule`/`WorkspaceRef.kind` | 为 Assembly/Drawing 留接缝，不改 Part Studio |
| **现在** | 修 scope 状态隔离（树/body 键、对话框、相机/undo） | 防止当前多 Part Studio 切页签写错 scope/显示旧数据 |
| **现在** | `SelectionRef` 的 `documentRef/occurrencePath` + store 工厂 | 为装配/多文档留身份与状态边界 |
| **现在** | 会话隔离（IPC/briefcase/Editor）+ per-iModel ACL + 真实 userId | 任何第二用户/分享/审计的前置 |
| **现在** | 冻结 changeset 账本（不可变/悬挂恢复/fork 语义）→ checkpoint | 版本/恢复/多 briefcase 的前置 |
| **现在** | 批量 face/topology DTO + 100 body tile 基线 | 先解决 Part Studio 大模型，再谈装配 |
| **下一波** | 表单模型 pilot、preview/apply 单一校验器 | 降低每个新特征的成本与回归面 |
| **下一波** | 输出端口契约 + split/mirror 多输出 spike | 验证特征图演进方向，不一次性重写 |
| **下一波** | 异步多 briefcase、装配实例/只读 BOM、mesh 导出、HLR spike | 在不动核心模型的前提下试外沿 |
| **以后** | 特征图执行器、Mate/Relations、Drawing 引擎、PBR/离线渲染、TrueForm、Branch/Merge、实时协同、多租户 | 需要 ADR/独立产品线，按产品目标投入 |
| **不做** | 第二套模型库/渲染器、假 STEP、假实时 presence、把装配塞进 Part Studio、用 fork 冒充分支 | 避免制造新的单行道/假能力 |

### Phase 1：Part Studio 主链强化（与功能并行）

1. **表单模型 pilot**：选 extrude blind 或 hole，消费 `getFeatureFormModel`，对拍现有字段；扩展 field kind（单位/枚举/默认值/条件）。
2. **图基础（不改 UI）**：Feature 行加法 `graphVersion/inputsJson/outputsJson`；所有结构引用（featurePattern/Mirror 的 sourceFeatureId、faceExtrude/draft 的 bodyId/faceRef）建显式边并做 scope/循环校验；跨 scope sourceFeatureId 拒收。
3. **delete middle**：允许删除中间特征并自动重接前驱→后继；返回影响面；测试 3 链删中间/下游红/undo。
4. **insert middle**：`insertFeature` 增加 `before/afterFeatureId` 或 `treeIndex`；重接 prev→new→next，重算受影响子图；测试 fillet 前插入 extrude。
5. **输出契约 spike**：split 双侧或 mirror 新体，用一个特征验证多输出合同；不要求全执行器。
6. **preview/apply 单一校验器**：消除 380 行手工镜像；先覆盖 insert/update。
7. **异步多 briefcase spike**：双用户、双 briefcase、编辑不同 feature；锁冲突 UI；不共享 undo。
8. **拾取/BVH + tile 基线**：Part Studio 大模型 hover 降到本地命中；补真实 BRep→tile 测试 + 100 body 冷构建；为装配选择铺路。

### Phase 2：外沿能力（按产品范围选择）

1. **特征图执行器**：输出端口/多输出/中间删除/回滚；先受控子集。
2. **Assembly 实例/BOM**：BIS 实例/变换 + `sourceRef` + hub 引用索引 + 只读 BOM；Mate 需 3D solver ADR；不要只把实例几何写进 Assembly 而不记录来源。
3. **Drawing 只读/HLR**：先显示既有图纸，再做投影/尺寸。
4. **mesh 导出/导入**：STL/OBJ/3MF/GLTF；STEP 等许可裁决。
5. **PBR/离线渲染**：ADR 后做最小 PBR 或离线服务。

### Phase 3：规模化/实时（仅在明确产品目标后）

- 实时协同（服务端权威 op 流/ per-user undo）；
- 版本图/Branch/Merge；
- 多租户/SaaS/作业队列/外部租约/缓存；
- 这些都是独立产品线，不应与 Part Studio 共享发布节奏。

---

## 8. 架构适应度函数（建议立即纳入 PR/CI）

| # | 适应度函数 | 当前 | 目标 |
|---|---|---|---|
| AF1 | `LubanFeatureType` 与 `opDsl`/registry/form 集合完全相等 | **红（draft 缺失）** | CI 全等；DSL 全类型往返 |
| AF2 | 新增一个 FeatureType 的改动点 ≤ 3（manifest + evaluator + 可选 UI 扩展） | 9+ | 逐 feature 度量 |
| AF3 | 前端消费 `getFeatureFormModel`，无手写字段分支 | 零消费 | pilot 后 100% 新特征 |
| AF4 | 新增一个 WorkspaceKind 不改 Part Studio 模块 | 无抽象 | stub 编译测试 |
| AF5 | 两个 Workspace/文档会话可并存且状态隔离 | 单例 | 单测/真栈 |
| AF5b | 同文档切 Part Studio：树/body/对话框/相机/undo 不串 scope | 部分（树/body 键缺 scope、对话框不关） | scope-key 修复 + e2e |
| AF5c | 两个 BriefcaseConnection 并存时字符串键 RPC/选择不串话 | 全局 fallback token | 双连接 spike / 显式 token |
| AF6 | SelectionRef 含 document/workspace/occurrence/topology | 缺 | 类型 + 测试 |
| AF7 | 200 changeset 冷开在预算内；Named Version 有真实 checkpoint；产品可 read-only 打开版本 | 无生成器/无 open 路径 | 基线 + 门禁 |
| AF7b | `listTabs` 能列出 legacy Part Studio + 新 tab 类型；旧前端零回归 | 无 typed tab | tab 注册表 v0 |
| AF8 | 非成员经任何通道打开/写入 → 403 | **未验证** | 负例 e2e |
| AF8b | 两用户（含只读）打开同一文档：不互踢、无 IPC 响应串线、直改受同一写门 | 共享 briefcase/广播 | 双浏览器 e2e |
| AF8c | changeset 不可变；悬挂 `waitingForFile` 可恢复；fork 不 FK 失败 | 可改写/无恢复 | 账本 fixture + 崩溃重试 |
| AF9 | changeset/briefcase/OpLog 可追到真实 userId | 否 | 审计测试 |
| AF10 | 100 body tile/拾取在预算内 | 未知 | 性能基线 |
| AF11 | interface-freeze/provenance 全绿 | **红** | 发布门 |
| AF12 | 多输出合同至少一个特征通过 | 无 | split/mirror spike |
| AF12b | 拓扑引用含 body/scope 限定，且插入/删除后不会静默命中错误边 | 裸 id | 交叉 body/插入 spike |
| AF12c | 几何流带内核/格式标签；facet 预留 face/edge ID；occurrence transform 在拾取中正确 | 无标签/无 ID/未验证 | format tag + facet ID + 装配 spike |
| AF13 | `shared` strict + 运行时版本握手 | 否 | 契约门 |
| AF14 | UI Ctrl+Z、`FeatureOp.undo`、AI/API 撤销是同一语义/同一 op 组 | 否 | 统一 undo 语义 |
| AF15 | 直改操作可回放/可转为参数化；`reparameterizeBody` 有 RPC | 否 | 单一编辑谱系 |
| AF16 | 一个命令注册后 ribbon/palette/keymap/capability/AI spec 同时出现；删除后同时消失 | 分散 | CommandRegistry v0 |

> AF1/AF7/AF8/AF11 是现在就能测的红项；AF2/AF3/AF4/AF6/AF12 是“接缝是否真的可用”的验证。

---

## 9. 必须形成的架构裁决（建议 ADR）

| 编号（建议） | 主题 | 要先于什么 |
|---|---|---|
| ADR-0026 | Workspace/Tab 模型、`WorkspaceKind`、跨工作区/版本引用 | Assembly/Drawing/Variable Studio |
| ADR-0026b | 变量作用域、undo 粒度、Configurations 边界 | 继续加表达式字段/多 tab 前 |
| ADR-0027 | 特征输出端口与多输出合同、特征图执行器 | 继续铺多输出特征/可编辑历史 |
| ADR-0028 | Feature Manifest/契约生成、运行时握手、域 RPC 拆分 | 下一批 FeatureType/AI 工具 |
| ADR-0029 | 协同目标、checkpoint、异步多 briefcase、实时 op 流 | 任何分享/多用户功能 |
| ADR-0030 | 授权/用户归因/租户隔离 | 企业级分享/审计/发布 |
| ADR-0031 | 几何持久化（SAB）与 TrueForm 切换门禁 | TrueForm M1/内核替换 |
| ADR-0032 | 渲染边界（iTwin/PBR/DanQing/离线） | Render Studio/PBR |
| ADR-0033 | 导入导出许可与作业服务 | STEP/DWG/文档级导入 |

已有 ADR-0001/0015/0021 等可作为基础；不要重复造，按上表补缺口。

### 9.1 现在不要做的事（避免制造新的单行道）

- 不要在未冻结 `WorkspaceKind/WorkspaceRef.kind` 前，把 Assembly/Drawing 的页签/路由/Store 写成 Part Studio 的分支。
- 不要在未冻结输出端口前，继续新增“只支持单 body 输出”的特征分支；否则每个分支都要二次迁移。
- 不要在未做 manifest 前，继续把同一个 FeatureType 手写进 shared union、zod、formFields、opDsl、ribbon、capabilities、i18n、测试。
- 不要在未做 op 流/会话隔离前，先做“多人 presence/光标”UI；那是假实时协同。
- 不要在未做会话隔离（IPC/briefcase/Editor）前，对外提供“分享查看”或允许第二个用户打开同一文档；当前连只读也会互踢/串响应。
- 不要在未做 per-iModel ACL/用户归因前，对外提供分享、链接、公开文档或企业审计。
- 不要在未做 SAB 兼容裁决前，启动 TrueForm M1 生产化。
- 不要在未做渲染 ADR 前，fork iTwin core shader 或把 DanQing 接成第二交互渲染器。
- 不要在未有 HLR/投影前，做“自动工程图生成”产品面。
- 不要把装配 Mate/BOM、工程图表格、导入转换等产品子系统塞进几何内核或 Part Studio 特征链。

### 9.2 需要 spike 回答的开放问题

| # | 问题 | 影响 | 最小实验 |
|---|---|---|---|
| Q1 | 跨 scope 的 EDE（Assembly occurrence → Part Studio body）会不会触发正确重建？ | Assembly/Derived 的引用失效模型 | 同 iModel 两 scope 建一条跨 scope 依赖，改源 body，观察 target 是否重建；失败则需独立依赖失效表 |
| Q2 | fork/clone 后 scope id/body element id/federationGuid 是否稳定？ | 版本引用/外部引用能否安全钉住 | fork 一个含引用的文档，检查引用解析/冷重开 |
| Q3 | 旧 MS 打开含新 EC schema（Assembly/Drawing）的 iModel 是否会阻断？ | 灰度/回滚兼容 | 新 schema fixture + 旧 MS 打开/读写 Part Studio |
| Q4 | 200+ changeset 的 Named Version read-only 打开耗时？ | 版本引用/Assembly 打开 SLA | 生成 checkpoint + `CheckpointConnection` 实测 |
| Q5 | 文档级变量合并求值上下文的成本？ | Variable Studio 是否值得做 | 两表合并 + 表达式/undo/契约改动面 spike |
| Q6 | 页签级 undo 需要改哪些事务边界？ | 多 tab 体验/协作 | PS + Assembly 双 tab 编辑后 undo，记录实际撤销对象 |
| Q7 | MS 是“一用户一进程”还是共享 SaaS 进程？ | `EditCommandAdmin` 进程级单槽在多用户下是 S1 | 两客户端不同 iModel 并发读面/编辑，观察命令槽互斥 |
| Q8 | 体积金标是否允许 approx facet 口径？ | 质量属性口径/测试可信度 | 同一 body 对比 facet 路径与精确通道；差异写入门禁 |

---

### 9.3 按目标选路线

| 产品目标 | 现在必须做的架构动作 | 可以延后但先裁决 |
|---|---|---|
| **只做 Part Studio** | Feature Manifest/`draft`/strict；输出端口+拓扑引用契约；会话隔离+账本冻结+checkpoint+ACL+userId；SelectionRef/store 工厂；批量拾取 | 特征图完整执行器、多文档、装配/工程图 |
| **Part Studio + 基础 PDM/异步协作** | 上面全部 + typed `LubanTab`/version open；undo 所有权 + 异步多 briefcase；sourceRef/Where Used 索引；Assembly 实例/只读 BOM；Drawing 只读/HLR；mesh 导出 | 实时协同、Branch/Merge、Mate/Relations、GD&T、STEP |
| **全量 Onshape** | 上面全部 + 服务端权威 op 流/per-user undo；版本图；TrueForm SAB 迁移；PBR/离线渲染；STEP/PLM 许可；多租户/作业队列 | 无（这些本身就是多年产品线） |

**共同点**：无论选哪条，**Part Studio 自身的契约/输出/拓扑/权限/checkpoint 都不能跳过**；它们不是“外沿功能”的前置，而是 Part Studio 规模化的前置。

## 10. 结论

1. **不需要推倒重来**：iTwin/BIS、FeatureOp、ACIS/SolidKernel、solver-neutral、iTwin 渲染、标准工具/事务都是正确底座；ADR-0001 的文档模型方向也已部分落地。
2. **需要停止“把 Part Studio 临时假设升级为平台契约”**：单输出、单文档 shell、单 store、单 briefcase、手写契约。它们现在能跑，但会决定后续三年的返工量。
3. **最优先的七件事**（都不阻塞 Part Studio 功能）：
   - **先修 scope 状态隔离**（树/body 键含 scope、对话框关闭/重挂、相机/undo 策略）——这是当前就能触发的错误写入；
   - Feature Manifest + `draft`/strict/运行时握手；
   - `LubanTab`/`WorkspaceKind`/`WorkspaceModule` 接缝 + 版本打开路径；
   - 输出端口/多输出合同 + 拓扑引用 body/scope 限定 + 一个 spike；
   - **批量 `TopologySnapshot`/`PickBatch` 只读通道 + 真实 BRep→tile 基线**——这是 Part Studio 大模型自身的前置，不是只服务装配；
   - `SelectionRef` occurrence path/SelectionDomain + store 工厂；
   - 会话隔离（IPC/briefcase/Editor）+ 冻结 changeset 账本 + checkpoint + per-iModel ACL + 真实 userId。
4. **可以延后但必须先裁决**：TrueForm/SAB、PBR/离线渲染、Branch/Merge、实时协同、STEP 许可、多租户。
5. **判断标准**：如果下一个功能只能在“改 9 处手写注册 + 假设单输出 + 假设单文档”下完成，说明架构接缝还没建立；如果下一个功能可以只加 manifest/evaluator 或只加 WorkspaceModule，说明架构开始可扩展。

**工业级目标与执行计划**：本文回答“怎么演进”；工业级目标架构（I0–I9、控制面/会话面/作业面/数据面/PDM 面）见 [`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`](./09-INDUSTRIAL-TARGET-ARCHITECTURE.md)；架构冻结 Gate、16 项决策/Spike、WBS、验收门见 [`10-ARCHITECTURE-HARDENING-PLAN.md`](./10-ARCHITECTURE-HARDENING-PLAN.md)。
