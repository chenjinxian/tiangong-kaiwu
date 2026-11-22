# 能力就绪矩阵：Onshape 主要功能 × 当前架构

> 判定：**A 满足 / B 部分满足（可扩展）/ C 不满足（需新子系统）/ D 方向性冲突**。
>
> 证据优先级：代码/测试/运行时接线 > 公共能力账本 > 文档声称。私有仓以脱敏审计结论呈现。

---

## 1. 总表

### 1.1 建模与草图

| # | 能力 | 当前机制/证据 | 判定 | 关键缺口 | 最小可行切片 |
|---:|---|---|:--:|---|---|
| 1 | 草图实体 | 求解实体 5 类：point/line/circle/arc/cubic spline；shared `SketchEntityDto` | **B** | 无 ellipse/elliptic arc/conic/text/N 点样条/periodic spline；整圆/弧/样条约束组合不全 | 先补 ellipse/conic/text + N 点样条 DTO/求解/面域/UI；每条有 strict/blocked 证据 |
| 2 | 2D 约束 | solver-neutral 层 19 类：coincident/horizontal/vertical/parallel/perpendicular/equal/distance/radius/diameter/concentric/angle/length/midpoint/tangent/offset/fixed/mirror/symmetric/slotWidth | **B** | 缺 normal/intersection/curvature/flow/collinear/ratio 等；椭圆/圆锥/文本约束未接；DOF/冲突归因需继续审计 | 按 Onshape 15+ 约束逐项补方程/槽位/UI/glyph；solver conformance 套件 |
| 3 | 尺寸/表达式/变量 | 驱动/从动尺寸；length/angle 表达式；VariableTable；`#var` 补全；后端物化/类型门 | **B** | count 表达式不支持；部分工具字段未接；跨 Part Studio/可变库引用限制 | 先补 count 表达式（若产品允许）与剩余特征字段；与 tool spec 对齐 |
| 4 | 外部引用 | sketch→sketch、bodyEdge、PIERCE、bodyFace（S1–S3）；INTERSECTED blocked-kernel、SILHOUETTED blocked-design | **B** | 非平行圆/弧投影语义、样条/椭圆边拒收、面/边选择 UI 部分；UI 原生 undo e2e 残项 | S1–S3 已可；S4 保持 blocked 证据；补 UI 选择器与持久化边界 |
| 5 | 核心参数化特征（追加式） | `LubanFeatureType` 21 个（extrude/booleanAdd/booleanSubtract/fillet/chamfer/shell/revolve/loft/sweep/mirror/pattern/featurePattern/featureMirror/booleanBodies/hole/cPlane/faceExtrude/transform/splitPart/moveFace/draft） | **B** | 21 类全部 `partial`；单特征单输出；端条件/模式/merge scope/多 body/失败回滚等分支未收口 | 按 `feature-depth-matrix.md` 逐分支补七维证据；一个 FeatureType 一个 AIRR/波次 |
| 5b | 特征图/可编辑历史/多输出 | 每 body 单源线性链、按 orderKey 求值；特征恰一个输出 body；tail-only 删除；结构键禁改 | **C** | 任意插入/删除/重排/rollback、多输出（split 双侧、mirror 新建、mergeScope 多目标）、可编辑历史 | 先做特征图执行器与多输出契约；否则大量特征分支会返工 |
| 5c | 几何内核基础通道 | ACIS Modeler/Polyhedra 经 `SolidKernel.h`（111 API）+ PSBRep op 0–37；布尔/Blend/Chamfer/Hollow/Offset/Taper/Imprint/拓扑 ID | **B** | 扫掠光滑路径为弦近似、twist/scale/lock 被忽略；fillet 仅恒定半径；DeleteFace 普通面 blocked-kernel | 扫掠精确性、变半径 fillet、DeleteFace 共面种子先补 ctest/真栈 |
| 5d | 高级曲面/螺纹/Wrap/钣金 | 无曲面算子层；无 helix/thread；`Emboss` 是平面端盖；无 sheet metal/frame | **C** | 曲面 fill/trim/extend/face blend/knit 公差；thread/helix；sheet metal/frame | 独立 ADR；先做许可内已实现但未接线项（SweepFaces/OffsetEdges/Emboss/DeleteEdges） |
| 5e | 拓扑持久 ID | `(nodeId, entityId)` 属性 + 分裂继承 + own-edge-id + 保存往返；产品用于 fillet/draft 引用 | **B** | 上游拓扑大改无几何回退匹配；引用丢失即 throw；无跨版本迁移策略 | 改上游extrude深度后下游fillet命中的真栈 spec；失败记 blocked-design |
| 5f | Tessellation/线程 | ACIS faceter + 逐面材质 + SQLite facet 缓存 + 双车道引擎池；跨键并行有压测 | **B–C** | 生产 tile facet 回落 owner 串行；无大模型基线；无产品级质量档位；无 BRep→tile 原生测试 | 100 body tile 冷构建基线与键控/批量 MT 对比；质量档位 |
| 5g | 内核持久化/TrueForm | iModel 存 ACIS SAB；TrueForm M0 仅 version/status；无格式兼容层 | **C** | SAB 读写/迁移裁决；M1+ 数据模型/布尔/圆角；双后端一致性 | 先立 ADR 决定 SAB 兼容策略，再谈 TrueForm 里程碑 |
| 6 | 特征广度 | 钣金/框架/曲面/曲线/MBD/螺纹/Wrap/Decal/FeatureScript 等多数 gated 或缺失 | **C** | 缺 FeatureType、后端 evaluator、内核接线、UI；部分受许可/内核阻塞 | 独立 ADR/轨道；先做 1–2 个高价值族（如 Frame/钣金最小片），不要“顺手”全做 |
| 7 | 特征树/顺序/抑制 | Feature list + orderKey + suppress/reorder/delete/rename；BIS 持久化 | **B/C** | 追加式编辑可用；删除仅链尾、重排受线性依赖限制、无任意插入/回滚；rollback/Final/pause/history 部分 gated | 任意删除/重排/回滚需先做特征图执行器；与 Onshape 树语义逐项对拍 |
| 8 | 预览/交互反馈 | FeatureDialog 防抖 preview；后端影子求值；ghost/橙色高亮；部分特征真实几何预览 | **B** | 预览覆盖不全；预览失败不阻塞提交；大模型/复杂特征延迟 | 统一 preview pipeline；把 preview 纳入七维验收；性能基线 |
| 9 | Undo/Redo | BriefcaseTxns 原生 undo/redo；OpLog 线性撤销（部分 op）；失败零变更 | **B** | 20s autosave push 清空原生撤销栈；跨 changeset undo 不可用；OpLog 仅部分 op | 调整 autosave/push 与 undo 生命周期；至少保证一个编辑窗口内 undo 可用；登记跨 push 语义 |
| 10 | 参数化重算/冷重建 | FeatureOutputCache + rebuildAll + EDE；冷开重建 | **B** | 单进程内存缓存；大特征链冷重建成本；无增量重建全覆盖 | 用真实大型 Part Studio 做性能基线；缓存/队列/增量重建设计 |

### 1.2 UI 与交互

| # | 能力 | 当前机制/证据 | 判定 | 关键缺口 | 最小可行切片 |
|---:|---|---|:--:|---|---|
| 11 | Part Studio UI | Onshape 式五区壳、ribbon/树/对话框/右键/快捷键/ViewCube/草图标注/选择 | **B** | 部分 gated/假控件；对话框字段/默认值/禁用态未全量 live 对齐；移动端缺失 | 继续 live UI 审计（已有 W1–W47）与七维证据；清理假入口 |
| 12 | 选择语法 | `OnshapeSelectTool` + `store.canvas.selection` 单一权威；点/边/面子实体；框选/Select Other/Create Selection gated | **B** | Create Selection/选择过滤/Select Other 仍 gated；透明/遮挡/大装配未审计 | 先做框选/点选/过滤/选择其他；把选择规则写成共享测试 |
| 12a | 选择身份 | `CanvasSelection = ownerBodyKey + topologyId`，无 occurrence path；面拾取 hover 逐面 RPC | **C** | 装配/多文档/分屏/工程图身份不唯一；大模型拾取延迟 | 在装配/多文档前做实体身份与拾取管线 ADR |
| 12b | 特征表单模型 | 后端有 `getFeatureFormModel` 契约但前端零消费；`FeatureDialog.tsx` 约 6,761 行，新增字段跨 9 个注册点 | **B** | 单体分支/手写注册/后端 schema 与前端表单漂移 | 采用 form model 驱动；收敛注册点；加契约测试 |
| 13 | 装配 UI | 无 Assembly 模块；`PartStudioTabs` 插入装配为 unsupported；`ui.assemblyEdit` gated | **C** | 无实例列表/配合/关系/BOM/爆炸/显示状态/仿真 UI | 先建 Assembly 数据模型 + 实例列表 + 10 Mate 对话框（需求解器） |
| 14 | 工程图 UI | 无 Drawing 模块；`create-drawing` 仅 gated 菜单 | **C** | 无 Sheet/View/Dimension/GD&T/Table/DWT UI | 先做基础图纸/视图/尺寸/表格，不先做 GD&T/发布联动 |
| 15 | 多用户 presence/Follow | 无 presence/cursor/follow/评论/任务；评论面板只有图标/占位 | **D** | 与单写者租约冲突；无事件总线/房间模型 | 需产品裁决“是否真同时编辑”；若是，先做 presence/操作流 spike |
| 16 | 文档/页面壳 | 文档中心/详情/分享/Changeset/Named Version/权限；无 Assembly/Drawing tab | **B** | 版本图/分支/合并/恢复/评论/任务/发布/PLM 缺失 | 先把文档/版本/共享语义做完整，再接装配/工程图 tab |

### 1.3 渲染与可视化

| # | 能力 | 当前机制/证据 | 判定 | 关键缺口 | 最小可行切片 |
|---:|---|---|:--:|---|---|
| 17 | 交互式 3D 渲染 | iTwin WebGL + 原生 tile + BRep 拓扑叠加 + 选择/透明/剖切/相机/ViewCube | **B** | 大装配/大模型性能未证明；材质/环境/阴影/高质量渲染有限 | 以真实大模型做性能/视觉基线；保留 iTwin 唯一渲染器 |
| 18 | 高级渲染/Render Studio | 无 PBR/IBL/AxF/OpenVDB/服务端渐进渲染；iTwin 默认材质/灯光 | **C** | 需新渲染管线/服务；DanQing 未接入且需 ADR；工程图二维渲染另算 | 先做只读显示增强（材质/环境/后处理）；Render Studio 独立 ADR |
| 19 | 可视化工具 | ViewCube/相机菜单/Named Views/Section/Hide/Isolate/Transparency 部分实现；分析工具缺 | **B/C** | Named Views/Section 完整交互、11 个分析工具、AR/AVP 未做 | 先做 ViewCube/相机/剖切/隔离/透明；分析工具独立切片 |

### 1.4 数据协同/版本/PDM

| # | 能力 | 当前机制/证据 | 判定 | 关键缺口 | 最小可行切片 |
|---:|---|---|:--:|---|---|
| 20 | 单用户实时编辑 | RPC/IPC + FeatureOp + preview + 原生事务/undo | **B** | autosave push 清空 undo；预览/大模型延迟；无本地乐观几何 | 调整 autosave/undo；preview 覆盖；性能基线 |
| 21 | 多用户同时编辑 | 单 iModel 单写租约 + 单 briefcase；第二个同角色打开者会 close 前一会话 DB；Hub briefcase/changeset/lock；无 OT/CRDT/presence | **D** | 写租约序列化；共享 DB 互踢；undo 跨用户；无操作广播/冲突合并/光标/Follow | 产品裁决 + 协同层 ADR；可先做 presence/通知，不改写模型 |
| 21a | 异步多 briefcase | Hub 支持多 briefcase/锁/rebase；应用层未接 per-user briefcase；OpLog undo 不按 user 过滤 | **B** | 会话隔离、undo 所有权、单 briefcase 复用/close-existing、锁冲突 UI、周期 pull、pull 后缓存失效、active lock 过期 | 会话隔离 + undo 所有权 + per-user briefcase + 双用户编辑不同 feature 真栈 |
| 22 | 版本 | iModel changeset + Named Version（仅元数据，不生成 checkpoint/缩略图/事件）；应用 Version 面板 | **B** | 无 checkpoint 生成器、无恢复/比较 API/UI、无分支/合并；顶栏 `main` 静态 | 先做“Named Version=真实 checkpoint”+Restore/Compare；分支/合并另立 ADR |
| 23 | 权限/共享 | iTwin/iModel access control + 分享对话框；groups/shares 只存不判；MS 服务账号通道不查 ACL | **B（粗粒度）/ C（Onshape 级）** | 无链接分享/公开文档/所有权转移/folder 继承/Team/Company；细粒度权限位缺；后端可绕 ACL | 先做文档级 View/Edit 与负例安全测试；share/group 执行后再谈企业 |
| 24 | 评论/任务/Follow | 无后端/无前端实现 | **C** | 需协作事件模型、通知、@/任务、Follow | 独立协作服务/表；先评论+@，再任务/Follow |
| 25 | 发布/修订/PLM | Hub 无 release/BOM/PLM；应用无对应模块；changeset/NV 事件未发射；changeset/briefcase 归服务账号 | **C（审计 B，但缺归因）** | 发布状态机、审批、修订/零件号/水印/作废/配置发布、Arena；真实 userId 缺失 | 先做发布记录 MVP + 事件发射 + 用户归因；PLM 连接另立项 |
| 26 | 文档/页签模型 | 单 iModel 多 Part Studio scope；Tab 身份是 `UserLabel` 前缀 + JsonProperties，`PartStudioInfo` 无 `tabType`；无 `listTabs` | **B** | 无 typed Tab/TabDirectory；每个新类型会各自发明发现/排序/删除逻辑；无跨类型 tab | 先做 typed `LubanTab`/`listTabs`（legacy 合成）；Assembly/Drawing 以新 tab 类型接入 |
| 27 | 规模/多租户 | 单 MS 进程 + 进程内租约/缓存；hub/Postgres/Azurite/Redis 单实例；**无 changeset checkpoint 生成器**（冷开全量重放）；20s autosave 放大历史；无 active lock TTL/briefcase stale 清理 | **C（本地 B）** | 无水平扩展/队列/多租户隔离/HA/配额/GC；主线程同步内核；冷开随历史线性劣化 | 先冻结账本（不可变/悬挂恢复/fork）→ checkpoint + 200 changeset 冷开基线；再谈缓存/队列/HA |
| 27a | 服务端授权/租户隔离 | 后端→hub 服务账号 + X-API-Key；RPC/IPC 主要验证登录，缺逐 iModel ACL；WS token 60s 缓存后不再验；IPC 广播/共享 briefcase/直改绕写门 | **C（安全）** | 分享/权限可能被后端通道绕过；连只读也会互踢/串响应；直改不进审计 | 会话隔离 + per-iModel ACL、连接后 token 生命周期校验、下载/打开/FeatureOp/直改统一鉴权；安全测试 |
| 27b | 发布/契约一致性 | 最新发布产物 shared 1.64，源码 1.85；interface-freeze/opDsl/docs 漂移 | **B（治理）** | 源码绿/产物旧/文档假；评审与对外承诺失真 | 发布前契约对账；interface-freeze 重建；opDsl 补 draft；文档按代码重修 |
| 27c | 数据灾备/迁移 | 单 Postgres/Redis/Azurite 卷；无 PITR/对象版本化/恢复演练/RPO-RTO；params 无版本；旧 `.bim` fixture 缺；PartStudioMigration 非生产；X-12 native provenance 未关闭 | **C（灾备 L0）** | 单卷损坏即全量历史丢失；跨存储恢复无 manifest；旧文档/迁移不可回滚 | 账本冻结→PITR+对象版本化+cross-store 恢复演练→params/schema 版本化+旧 fixture+迁移 CLI→checkpoint 冷开基线 |

### 1.5 邻接域与导入导出

| # | 能力 | 当前机制/证据 | 判定 | 关键缺口 | 最小可行切片 |
|---:|---|---|:--:|---|---|
| 28 | 装配 | 无 Assembly 模块；极小 IPC `createAssembly/listAssemblies`（仅 PhysicalModel，无调用者）；BIS/iTwin 有 `PhysicalModel/PhysicalElement/GeometryPart/ElementRefersToElements` + 标准变换工具可做刚性实例；无 occurrence/Mate/BOM | **C（实例/结构 B；配合/BOM/爆炸/仿真 C）** | occurrence 数据模型/页签、MateConnector/Mate/3D 求解、BOM 聚合/表格、爆炸/显示状态 | 先两实例+独立 transform+冷重开+ECSQL 质量属性；再装配树/Mate/BOM；仿真后置 |
| 29 | 工程图 | 无 Drawing 模块/引擎；iTwin 可显示既有 Sheet/Drawing（A/B），但无视图生成；BIS 有 Dimension/Table EC 类但 TS/addon 未暴露 | **C（显示 A/B）** | 3D→2D 投影/HLR、关联尺寸、GD&T、表格、模板、DWT/DWG/DXF/PDF | 先只读显示已有 DrawingModel + Sheet/ViewAttachment 创建；真正投影/尺寸单独立项 |
| 30 | 导入 | 草图 ASCII DXF（LINE/CIRCLE/ARC/POINT/LWPOLYLINE/SPLINE）已接线；无文档级 Import；无 STEP/IGES/Parasolid/DWG/STL/3MF 读写器 | **DXF-B / STEP-D / DWG-C / mesh-B** | BLOCKS/INSERT、单位/容差、装配层级、许可、导入作业服务 | DXF 扩展 BLOCKS；mesh 走 `BodyFromPolyface`；STEP 先许可裁决 |
| 31 | 导出 | GLTF 为占位；无产品 CAD 文件导出；mesh 可经 `FacetEntity/exportGraphics` 派生 | **mesh-B / 精确交换 C/D** | STL/OBJ/3MF/GLTF writer、单位/材质；STEP/DWG/PDF 许可/引擎 | 先单 body STL binary 往返；明确 mesh≠精确交换 |
| 32 | MBD/PMI | 无 MBD/公差/Inspection 能力 | **C** | 尺寸公差、GD&T、Inspection、默认公差库 | 独立 MBD 轨道；依赖 MBD 的工程图/发布后置 |
| 33 | 评估/分析 | 只读测量/质量属性可用；11 个分析工具未接 | **B/C** | Curve/Surface、Deviation、Draft、Thickness、Interference、Flatten | 先 Measure/Mass Properties；分析工具逐项 |
| 34 | 账户/企业 | 本地 auth + iTwin access control；无企业管理员/SSO/计费/分析 | **C** | 企业角色/SSO/席位/账单/审计/分析 | 作为平台服务独立做；不写入 iModel schema |
| 35 | AI+CAD | FeatureOp/工具注册表可复用；Agent 操作可走标准事务 | **B（Part Studio）/C（全产品）** | 全产品 action schema/权限/审计/预览/HITL；装配/工程图/PDM 无工具面 | 先做 Part Studio tool spec + Agent 复用现有 toolId；全产品按域扩展 |

---

## 2. 量化基线

### 2.1 当前已落地的建模面

- **FeatureType**：21 个（见上）；全部 `partial`（`docs/parity/feature-depth-matrix.md`）。
- **特征图模型**：每 body 单源线性链、单特征单输出、tail-only 删除、结构键禁改；不是任意 DAG/可编辑历史。
- **草图求解实体**：5 类（point/line/circle/arc/cubic spline）。
- **草图约束**：19 类（含 mirror/symmetric/slotWidth）；没有 normal/intersection/curvature/flow/ratio/collinear 等。
- **UI 能力 key**：25 个 `full` + 51 个 `gated`（`capabilities.ts`，2026-11-22 审计）。
- **能力账本**：126 行，`full=0`，`partial=73`，`gated=51`，`blocked=2`。
- **测试面**：174 个 web 单测文件、238 个 e2e spec、123 个 backend 测试文件、18 个 viewer 测试文件（文件数基线，2026-11-22 审计）。
- **发布面**：最新发布 tag 为 `backend-20261110`（shared 1.64），源码 shared 1.85；20+ 契约版本只在源码模式可用。
- **版本/协同面**：只有 baseline checkpoint；Named Version 仅元数据；冷开重放全部 changeset；单 briefcase + 单写租约；groups/shares 不参与授权；changeset/briefcase 归服务账号、OpLog.user 是 sessionId。

### 2.2 Onshape 文档面的差距

- 文档 527 主题 / 861,649 词；Part Studios 153（29%），其余 374（71%）在装配/工程图/文档/发布/渲染/账户等。
- 文档中 Part Studios 有 81 个 Feature Tools、56 个 Sketch Tools；当前 FeatureType 21、草图求解实体 5。
- 装配 46 主题（10 Mate + 4 Relations + BOM + 4 仿真）、工程图 67 主题（9 视图 + 13 尺寸 + 14 GD&T + 6 表格）、渲染 24 主题 + 190k 词素材库、发布/PLM 15 主题、账户/订阅 93 主题。
- 当前应用路由只有 documents/document-details/part-studio/examples/settings；无 Assembly/Drawing 路由。
- 语料有 500 个 ASSEMBLY 元素/21,518 occurrence（最大 2,185）、480 个 BOM 元素、29 个 Drawing APPLICATION 元素；但 **mates=0、BOM 无载荷、drawing 0 载荷**，装配/工程图缺语义 oracle。
- 语料 BLOB 有 474 个 STEP、103 个 Parasolid、16 个 DWT、4 个 DXF：精确导入需求真实，但当前无对应通道。

### 2.3 关键“硬限制”证据

| 限制 | 证据 |
|---|---|
| 单写者协作 | 私有后端 `WriteLease`：一个 iModel 同一时刻仅一个活跃编辑会话；前端 `useEditorSession` 10s renew；被拒后写 op 在 35s 窗口失败 |
| 单 briefcase 互踢 | MS 对同一 iModel 缓存一个 briefcase；`openBriefcase` close 同 key 现有 `BriefcaseDb`；第二个同角色打开者关掉第一个会话 DB |
| IPC 连接不隔离 | `LocalhostIpcHost` 对所有 WS 连接广播；前端 requestId 每页从 1 递增；不同用户请求可能互相命中 pending promise |
| 直改绕过写门 | pattern/mirror/delete/transform 等 editor 直改不检查租约/ACL/OpLog；`DirectEditGuard` 只打 overridden |
| 账本可改写/悬挂 | changeset 可改 parentId、可创建无父根、DELETE 可挖洞；complete 不校验 blob/checksum；`waitingForFile` 崩溃后永久阻塞链头；fork 只复制 checkpoint（对已有编辑文档会得空 baseline），`preserveHistory` 不生效 |
| Undo 所有权全局 | OpLog 随 changeset 传播，`findUndoTarget` 不按 user/briefcase 过滤；异步多用户下 B 的 undo 会回退 A |
| 多 PS 切 scope 状态隔离缺口 | feature 树/body 已加载键只按 connectionKey（不含 scope）；读失败保留旧树/body；FeatureDialog 切 tab 不关闭且提交时自取新 scope；相机/undo 文档级共享 |
| Autosave 清 undo | `useAutoPush`：默认 20s 防抖 `pushChanges`；注释明确 push 会开启新 changeset 会话并清空原生 undo/redo |
| 无 checkpoint 生成器 | `createOrUpdateForChangeset` 无调用方；Named Version 只写元数据；冷开从 baseline 重放全部 changeset；20s autosave 约 720 changeset/日/文档 |
| 持久性/读路径 | FeatureOp ok 仅本地 briefcase；普通编辑依赖 20s push；读树/读草图 cold 时会触发 `ensureWarm/rebuildAll` 写事务 |
| 无 read-only 版本打开 | MS `openCheckpoint` 未实现；`downloadBriefcase` 无 changeset/version 参数；版本引用/Assembly 钉版本/Derived 无法解析回几何 |
| 权限共享不执行 | groups 只存不判；shares email/domain/allow/deny 只 CRUD；MS 服务账号 + JWT 校验，不查 iModel ACL |
| 用户归因缺失 | changeset/briefcase 归服务账号；`OpLog.user` 是 session UUID；changeset/Named Version 事件未发射 |
| 无 presence/评论/Follow | 前端无 WebSocket presence/评论/任务实现；后端/hub 无评论/任务模型 |
| 无分支/合并 | Hub 只有 changeset/Named Version；应用无 branch/merge/restore 实现；顶栏 `main` 为静态 pill |
| 无装配/工程图模块 | `apps/web/src/modules` 无 Assembly/Drawing；路由无对应页；Tab 插入为 unsupported/gated；仅有极小 createAssembly/listAssemblies PhysicalModel helper |
| 无 STEP/DWG/STL | 前端仅 DXF 草图导入；后端 GLTF 为占位；native 无 STEP/DWG/STL 导入导出 API；ACIS InterOp 未授权 |
| 无 Render Studio | 当前 iTwin 默认渲染基线；无 PBR/IBL/AxF/OpenVDB/服务端渲染；DanQing 未接入且 `EXCEPTIONS.md X-10` 禁止未 ADR 接入 |
| 单进程/内存态 | modeling-server 单进程；FeatureService/FeatureOutputCache/WriteLease 都是进程内存态；无队列/水平扩展设计；同步内核在主线程 |
| 授权边界 | 后端服务账号 + X-API-Key 直通 hub；RPC/IPC 主要验登录、缺逐 iModel ACL；WS token 60s 缓存后不再验 |
| 网络/凭证卫生 | WS token 进 URL/console/nginx 日志；连接后不复验；WA 调试/管理端点无认证且默认 0.0.0.0；Azurite 公开默认密钥并暴露端口；入口无 TLS |
| 许可分发 | 公开 MS 产物含 `slvs.node`（GPL 政策冲突）；ACIS 分发授权无书面证据；Thicken 工具仍注册可经 IPC 调用 |
| 契约/发布漂移 | 最新发布 shared 1.64 vs 源码 1.85；interface-freeze 过期；opDsl 缺 draft；Architecture.md 旧 RPC/TrueForm 描述 |
| 接口冻结门禁红 | `check-interface-freeze.mjs` 失败：PSBRep 哈希不匹配、opCount 38≠37；op37 未同 PR 更新 manifest |
| 原生产物脱节 | 对外 MS 产物 provenance 记录的原生版本早于 native HEAD；op37/TaperFaces 及之后修复不在发布物 |
| 许可 fail-open | ThickenSheet 虽 blocked-license，仍是 PSBRep op16 并经 `createBRepGeometry` 暴露给 JS |
| 内核持久化锁死 | iModel 几何流存 ACIS SAB；TrueForm 无读写/迁移能力，`INTEGRATION.md` 未把格式兼容列为门禁 |
| 无 BRep 实例化 | `_CreateInstance` 返回 nullptr，回退深拷贝；重复零件/大装配内存与时间线性放大 |
| tile facet 串行 | facet 走无键 `Invoke` 回落 owner 全局道；批量 facet MT 无生产消费者；facet/tile 无 face/edge ID；BRep 拓扑叠加是装饰件而非 tile |
| 拾取通道不可扩展 | 面 hover 逐面 `getClosestPoint`；拓扑逐边 IPC；`EditCommandAdmin` 进程级单命令槽；无批量 TopologySnapshot/PickBatch |
| 几何流无内核标签 | iModel 存无标签 ACIS SAB；TrueForm 切换无法判定混合格式/回读 |
| 质量属性口径 | 产品用 facet 四面体求和（approx），native 有精确通道；体积金标可能依赖渲染公差 |
| 扫掠非严格 | 光滑路径只首末站、站位蒙皮为直纹面；twist/scale/lock/selfRepair 接受但忽略 |

---

## 3. 架构层面“满足/不满足”的边界

### 3.1 满足（A/B）的部分

- **Part Studio 参数化建模主链**：iModel/BIS + FeatureOp + registry/zod + EditTxn + ACIS + iTwin tile + Onshape 式 UI + 真栈测试；方向正确，可增量补齐。
- **基础几何内核**：草图轮廓→BRep、布尔/扫掠/放样/圆角/倒角/抽壳/偏移/拓扑 ID/质量属性/tessellation 通道完整，边界有测试；不存在方向冲突。
- **2D 草图/约束**：solver-neutral + libslvs + 表达式/变量 + 外部引用；可扩展，不存在方向冲突。
- **交互式单用户编辑**：RPC/IPC + 预览 + 原生事务/undo；可做深，但需修 autosave/undo 语义。
- **基础版本/权限/共享**：changeset/Named Version/iModel 权限/分享；可做深（checkpoint/恢复/比较），但分支/合并是 D、评论/发布是 C。
- **交互式渲染**：iTwin WebGL + tile + BRep 叠加；足以承载建模视图；高级渲染另立项。
- **异步多 briefcase**：Hub 的多 briefcase/锁/rebase 已有测试；应用层未接 per-user briefcase，属 B 级工程。
- **装配实例/结构**：BIS `PhysicalModel/PhysicalElement/GeometryPart` + 变换工具可承载刚性实例；缺 occurrence 模型/页签/装配 RPC，属 B 级接线而非方向冲突。
- **工程图显示**：iTwin `SheetViewState/DrawingViewState/ViewCreator2d` 能显示既有 Sheet/Drawing；但视图生成/尺寸/表格/导出仍是 C。

### 3.2 不满足（C）的部分

- **Typed Tab/文档 IA**：页签身份靠 UserLabel 前缀，缺 `LubanTab`/`listTabs`/通用 tab 生命周期；多 tab 类型需要新 schema/注册表。
- **版本快照/引用打开**：无 checkpoint 生成器；`openCheckpoint` 未实现、`downloadBriefcase` 无版本参数；Assembly/Derived 版本钉住无法解析。
- **装配**：新 3D 约束求解器 + 装配数据模型 + BOM/爆炸/显示状态 + 仿真。
- **工程图**：新绘图引擎（视图/尺寸/GD&T/表格/DWT/DWG）。
- **PDM/发布/PLM**：新平台服务（发布状态机、修订/零件号、BOM、Arena）。
- **MBD/PMI**：新标注/公差/Inspection 数据与 UI。
- **Render Studio**：新渲染管线/服务（或经 ADR 接 DanQing）。
- **企业/SaaS**：新账户/企业/SSO/计费/审计/分析。
- **导入导出**：新格式转换子系统（STEP 受许可）。
- **规模/多租户**：新队列/租约/缓存/水平扩展。
- **高级曲面/螺纹/钣金**：曲面算子层、helix/thread、sheet metal/frame 均无内核通道。
- **TrueForm 生产化**：M0 仅脚手架；SAB 持久化兼容、M1+ 数据模型/布尔/圆角是多年工程。

### 3.3 方向性冲突（D）的部分

1. **多用户同时编辑**：单写者租约 + 单 briefcase + changeset/briefcase + 无 presence/冲突处理。若产品要求 Onshape 式“多人同时编辑”，这不是补功能，而是改协作模型；异步多 briefcase 则是 B。**连“单写者 + 多只读”也需先做会话隔离**（共享 briefcase/IPC 广播/Editor 单例），当前不可直接对外。
2. **分支/合并**：changeset 单父链 + fork 新 iModel，不复制历史；无版本图/跨 iModel merge。要 Onshape 式 Branch/Merge 需版本图服务，属方向性改造。
3. **STEP/healing 导入**：ACIS InterOp 未授权；除非取得许可或外接服务，否则不能做；TrueForm 短期不可替代。
4. **把全产品塞进单一 Part Studio 数据模型**：装配/工程图/PDM 不是 Part Studio 的变体；强行塞入会破坏 BIS/单一数据源边界。

---

## 4. 判定后的直接建议

1. **先把 Part Studio 做“真”**：21 个 FeatureType 分支、草图实体/约束、UI 七维、性能/undo 语义；不要用入口数量或文档覆盖宣称完成。
2. **同时修协作底座**：checkpoint 生成器（冷开/版本/协作前置）、per-iModel 授权（先于分享）、用户归因（先于审计/发布）；至少让单用户 autosave 不破坏 undo；把“是否多人同时编辑”作为产品裁决，而不是默认按 Onshape 宣称。
3. **按 C 类独立立项**：装配、工程图、PDM/发布/PLM、Render Studio、导入导出分别做 AIRR/ADR；不要混在 Part Studio 波次。
4. **先做基础 PDM/版本/共享的闭环**：它是装配 BOM、工程图发布、PLM 的前置；但不要把它写成“Onshape 全量协同”。
5. **渲染保持 iTwin 唯一底座**：DanQing 只在 ADR 批准后接入；在批准前不把 DanQing 作为产品渲染路径。
6. **导入导出先做许可内格式**：STL/3MF/OBJ/DXF/DWG（若可实现）；STEP/IGES 等先做许可/外部服务裁决。
7. **规模先压测再承诺**：单进程/内存租约/冷重建的容量模型必须用真实大模型/多用户场景验证。
