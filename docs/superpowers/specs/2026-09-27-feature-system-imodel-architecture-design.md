# 鲁班CAD 特征系统：iModel 存储承载参数化特征建模 —— 架构裁决与设计

- 日期：2026-09-27
- 状态：设计已获分节认可，待 spec 审阅
- 前置：`2026-09-27-cad-foundation-kickoff-prompt.md`（D1-D7 决策框架与能力盘点，历史文件）
- 关联：`2026-09-27-cad-feature-system-decision-record.md`（决策总表）；`2026-09-27-cad-feature-system-evidence-base.md`（本文全部结论的一手证据汇编）
- 范围：CAD 精确建模基础（特征系统）。AI 建模层完全搁置，仅以 API 消费者视角留白。

---

## 0. 核心问题与裁决结论

**核心问题**：iModel 这种建模数据存储方式（元素模型 + briefcase + changeset），能否支撑 Onshape 式的参数化特征建模？

**总裁决：可行。** 三个子问题的差距均为「部分可行 + 需补 X」，无一致命项。需补清单：

| # | 需补项 | 性质 |
|---|---|---|
| X1 | EDE 回调契约承载 BRep 再生的原型验证（spike #1，最高风险） | 验证 |
| X2 | MS 侧 op 日志（语义意图元数据 + 语义 undo 数据源） | 自建（轻量；HITL 管道本来就要求） |
| X3 | imodel-native 侧两项暴露：TopologyID 查询 op（`FacesFromId`）+ 内核 rollback mark | 内核已存在，仅暴露 |
| X4 | changeset.description 在 imodelhub-services 的支持确认 | 验证 |

---

## 1. 可行性裁决（Q1-Q4，含证据）

### Q1 — 元素模型承载「definition / regen 结果分离」：**成立**

| Onshape 概念 | iModel 映射 | 证据 |
|---|---|---|
| Part Studio definition（唯一存储与协同对象） | 自定义 ECSchema 的特征元素（持久、changeset 版本化） | schema 导入与传播是官方流程：`core/backend/src/IModelDb.ts:1668`（importSchemas）；schema changeset 类型 `core/common/src/ChangesetProps.ts:51-58` |
| regen 结果（缓存，永远可重建） | 派生几何元素（BRep 经 GeometryStream entry 落库） | `core/common/src/geometry/GeometryStream.ts:178`（brep entry）；写路径 `core/backend/src/Element.ts:896-907`（convertOrUpdateGeometrySource） |
| 依赖图 + 增量再生 | **ElementDrivesElement（EDE）：saveChanges 时 native 自动拓扑传播，无需自建求值器** | `core/backend/src/Relationship.ts:404`（"Callbacks are invoked by BriefcaseDb.saveChanges…topological order"）；native→JS 回调链 `core/backend/src/TxnManager.ts:991-1018`；受影响子图自动裁剪 `Relationship.ts:345-382`；生产先例 `core/backend/src/annotations/ElementDrivesTextAnnotation.ts:75`；规模实证单次 saveChanges 7380 次回调 `core/backend/src/test/element/ElementDrivesElement.test.ts:931-945` |
| 特征错误/抑制状态 | EDE `status`：1=评估失败；0x80=禁止经此关系传播 | `Relationship.ts:468-475` |

唯一需自建的件：回调内的再生逻辑本身（调 native BRep op → 重写派生元素几何流）。drawing graphics 的自动失效是 native 黑盒不可复用；可复制的范式是文字标注先例的「回调内原地重算缓存」。

约束与风险：
- EDE 回调契约「只应修改输出元素」（`Relationship.ts:396`）；回调内修改走独立间接事务（`OnDependencyArg.indirectEditTxn`，`Relationship.ts:29`；`TxnManager.ts:994-1018`），间接更改期间锁检查挂起（`docs/learning/backend/ConcurrencyControl.md:193`）。
- EDE 是 @beta 且仓内生产使用仅文字标注一处——我们是第二个用户，spike #1 必须在最早阶段验证。

### Q2 — changeset 行级 delta vs Onshape 语义操作 delta：**不致命**

- changeset 物理上是**带 old/new 值的 SQLite 行级补丁**（`docs/learning/backend/PullMerge.md:13`；`core/backend/src/ChangesetReader.ts:33-34`）。
- ChangeSummary API 可提取：实例级 op（Insert/Update/Delete，`core/backend/src/ChangeSummaryManager.ts:44-50`）+ **属性级旧/新值**（`ChangeSummaryManager.ts:291-349`，Changes(BeforeUpdate/AfterUpdate) 查询）。另有 ChangesetReader 直读本地 changeset 文件的 Old/New 双份值路径（测试证据 `core/backend/src/test/standalone/ChangesetReader.test.ts:175-202`）。
- 「特征 F 的 depth：10→20」在 changeset 层面精确可读。**前提：一个用户 op = 一个 txn 边界**（changeset 只记净值，`docs/learning/InteractiveEditing.md:11`）——这正是 EDE 时序自然要求的形态（§3.2a）。
- 残余差距两条：
  1. **意图元数据**：changeset 记状态差不记「这是一个拉伸操作」。补法：MS 侧 op 日志（X2），每 op 1:1 映射一个 changeset（description 携带 op 摘要）。
  2. **跨 parent 可重放性**（Onshape 合并基石）：changeset 是状态差，不支持「把我的变更 apply 到另一分支」。v1 不需要（单写者无并发写者即无合并）；路径留档：op 日志可移植，重放到 fork 的定义上即语义合并原型。

### Q3 — briefcase 单写者会话 vs Onshape model server：**架构同构**

- Onshape = 每文档专属 model server 串行应用 op。本设计 = MS 独占读写 briefcase，全部用户 op 经 MS 串行化。结构同构：单一串行点 + 不可变追加历史 + 结果广播（对方：regen 缓存+WS；我方：changeset pull）。
- 证据：push 必须基于 tip 且总是先 pull-merge（`core/backend/src/BriefcaseManager.ts:856-880`），单写者下恒真；锁 per-briefcase 而非 per-user（`ConcurrencyControl.md:49`），单 briefcase 单写者天然兼容；schema lock 等效全局写锁（`ConcurrencyControl.md:316-323`）。单写者无官方文档背书，但连接器模式即事实先例。
- **多人共编一个零件的答案**：多客户端 → 同一 MS 会话 → op 队列串行 → 永远不存在两个写者 → 永远不需要行级合并。presence/op 广播复用 MS 现有 WebSocket。
- 差距三条（均不阻塞 v1）：
  1. 单写者中心进程无官方背书文档（锁模型兼容已证）；
  2. **push 后本地 txn 撤销栈清空**（`docs/learning/InteractiveEditing.md:36`）→ per-user undo 必须建在 op 日志层（逆向 op 落成新 changeset）——与 Onshape 构造方式相同（其 per-user undo 也是 op 层构造）；官方跨历史撤销形态 revertAndPushChanges（`IModelDb.ts:4400-4483`）是整段 timeline 回滚，粒度不适配 per-op undo；
  3. 无语义分支/合并（见 Q2 差距 2）。
- 多写者逃生舱（留档）：pull-merge rebase 期间派生数据重算官方挂点 `RebaseHandler.recompute`（`TxnManager.ts:1736-1750`）。
- 自愈性红利：派生数据在图上——无论定义被编辑/undo/revert 怎样改，saveChanges 都会重触发传播把几何拉回一致。

### Q4 — FreeCAD 对照（D:\Github\FreeCAD，main@92e2891cb4，26.3.0-dev，含 1.0 element map）

| 借鉴（已验证有效的模式） | 反面教材（本设计恰好规避） |
|---|---|
| 属性链接自动建依赖图（`src/App/DocumentObject.cpp:432-461`）→ 对应「特征引用输入 → EDE 边自动维护」（文字标注 updateFieldDependencies 同款先例，`core/backend/src/annotations/TextAnnotationElement.ts:287`） | TNP 是补丁非根治：操作历史哈希命名存在二义/不可映射路径（`src/Mod/Part/App/TopoShapeExpansion.cpp:1452/1768/3166`），导出即失效（`src/Mod/Sketcher/App/SketchObject.cpp:928`）→ 本设计走内核 ATTRIB TopologyID（nodeId≈特征身份，重算重打标），不做字符串考古 |
| 失败级联：标 Error + 下游跳过 + 保留旧几何 + 保持脏（`src/App/Document.cpp:2971-2975`）→ 直接采用（§3.2d） | 部分重算=全量建图+运行时过滤，源码自承缺陷（`Document.cpp:2909-2915`）→ EDE 受影响子图天然裁剪 |
| FCStd 定义+缓存结果共存、打开免重算（`Document.cpp:2219`+`:2358`）→ 印证「changeset 同时载定义与再生结果」形态 | undo 对 Shape 整值快照、内存重（`src/App/Transactions.cpp:421-432`）→ 本设计只快照参数（op 日志），几何永远可重建 |
| SuppressedShape 保下游引用不中断（`src/Mod/PartDesign/App/Feature.cpp:134-146`）→ D7/抑制语义的现成先例（§3.1c） | 事务=具名语义操作的思路对，但只用于会话内 undo；本设计把 op 日志升格为持久一等公民（对接 changeset） |
| 特征 ID 打进 Tag 做溯源（`src/Mod/PartDesign/App/FeatureExtrude.cpp:788`）→ 与 TopologyID nodeId 同思想，本设计为内核级正确版 | |

---

## 2. D2 / D3 最终裁决

### D2 特征树形态：**方案 A —— 对象图为权威（特征全元素化）+ 脚本只读投影（后置）**

- 特征表 = ECSchema 元素 + EDE 图持久于 iModel；changeset 天然携带参数级语义（Q2 成立的前提）。
- 脚本投影（KCL 风文本）后置为**只读**产物，供 AI/CLI 消费；永不作为权威源。
- 被否方案：
  - **B 程序为权威（KCL 式文本即状态）**：文本 blob 的行级 diff 无参数级语义；EDE 看不见脚本内部，依赖图要在执行器内另建一套——同时弃掉 iModel 最强的两张牌（changeset 语义、内建 DAG）。kittyCAD 选它因其文本优先产品定位；Onshape 的 definition 本是结构化数据。
  - **C 混合（脚本权威 + 元素图派生索引）**：两个权威源，同步即 bug 温床。

### D3 再生语义：维持第一设计律 + 增量三层 + FreeCAD 式失败级联

- **第一设计律**：定义为权威、几何可全量重建、正确性永不依赖增量路径。
- 增量三层均为可降级性能层（§3.2c）。
- 失败语义采用 FreeCAD 级联模型的 EDE 表达（§3.2d）。

---

## 3. 设计

### 3.1 数据模型（特征元素化）

#### 3.1a 定义/结果的物理形态：**形态 Y —— 纯参数特征 + 单实体几何元素**

- 特征元素 = 纯参数载体；全零件唯一的**再生结果**几何元素 **BodySolid** 存最终实体 BRep（PhysicalModel，供显示）。草图自身的曲线几何不属于再生结果，见 §3.1c。
- 中间特征输出 = 易失缓存（内存/SAB），**永不入库**。
- 对比被否的形态 X（FreeCAD 式，特征元素自带几何）：改 feature₁ 参数时 changeset 含下游 n 个 solid blob，历史体积 O(n·solidSize) 膨胀；形态 Y 每 changeset 仅 1 个几何流。
- 「回滚到特征 k 查看中间状态」= 内存重算预览（不写库），依赖 native rollback mark（X3）；未暴露前降级为从头全量重算到 k，正确性无损。

#### 3.1b Schema 形态：**类型化公共属性 + 参数 JSON**

```
LubanCAD:Feature                ← 单一具体类，直接实例化（刻意不做按类型的 EC 子类）
├─ featureType: string        ← 判别串 "extrude"/"fillet"/…
├─ orderKey: number           ← 特征树序（支持中间插入）
├─ suppressed: boolean        ← D7 抑制降级
├─ status: number             ← 失败标记（配合 EDE status）
└─ params: Json               ← 特征专属参数（depth、radius、拓扑引用集…）
```

- 反类型化子类的理由：v1 特征类型与参数集快速迭代，每次加类型/参数 = schema 演进（schema lock + schema changeset），过重。
- JSON 使 changeset 参数 diff 退化为文本 old/new——可接受：精确语义由 op 日志承载（Q2），JSON 为结构化文本，应用层 diff 可行。
- 拓扑引用（被消费的面/边）存 params 内 `(nodeId, entityId)` 对，nodeId ≈ 产生该面的特征身份（D4 同构）。
- 校验在 MS 层按 featureType 的 JSON Schema 执行，不依赖 EC 校验。

#### 3.1c 模型布局与 Part Studio 边界

- **PartStudio 语义单元 = 一个 FeatureDefinitionModel（特征元素）+ 一个 PhysicalModel（BodySolid + 草图元素）配对**；v1 每个 iModel 承载一个 PartStudio（D6 单零件）。
- 草图元素 = 标准 GeometricElement3d（平面曲线以 3d 几何流存储，可显示），入 EDE 图作为源节点：`sketch → extrudeFeature → … → BodySolid`。
- 抑制语义：suppressed=true → 该特征出边置 EDE `status=0x80`（禁止传播）+ 保留最后成功输出供下游消费（SuppressedShape 语义）。

#### 3.1d EDE 边与回调分工

- 边从特征引用自动派生维护（params 引用谁，就建谁指向它的边）——镜像 `updateFieldDependencies` 模式。
- 特征节点与 BodySolid 节点的 `onAllInputsHandled` 触发求值；**回调只重写自身输出**（遵守 `Relationship.ts:396` 契约），写回走 `indirectEditTxn`。
- 环 = native 自动 fatal（`Relationship.ts:455-457`），不自建环检测。

### 3.2 再生语义与事务形态

#### 3.2a 用户 op 生命周期

```
用户操作（如 depth: 10→20）
 → MS 校验（params JSON Schema；破坏性操作走 HITL 预览→确认）
 → EditTxn：更新特征元素 params；若引用集变化，同步维护 EDE 边
 → saveChanges
    ├─ native 依赖图传播自动触发（仅受影响子图，拓扑序）
    ├─ 各节点 onAllInputsHandled → 执行特征 evaluate()
    │    → 调 native BRep op（nodeId 打标，D4 引用自愈）
    │    → 中间特征：输出写内存/SAB 缓存（不入库）
    │    → 末端节点：重写 BodySolid 几何流（经 indirectEditTxn）
    └─ 失败 → 失败级联（§3.2d）
 → op 日志追加（类型/特征 id/参数 old/new/用户/时间戳）
 → pushChanges（description 携带 op 摘要）
 → 前端 WebSocket 收通知 → pull → 视口/特征树刷新
```

核心性质：**参数变更 + 全部下游再生结果原子落在同一个 changeset**（「changeset 即语义 op 的物化形态」的机理）；拉取方免重算直接恢复。

#### 3.2b 预览 vs 提交

- **预览**（拖拽中/HITL 确认前）：不动库。native rollback mark 试算→回滚，走现有渲染管道显示。
- **提交** = §3.2a 全流程，op = txn 边界。
- 特征操作复用 `basicManipulationIpc → BriefcaseTxns → saveChanges` 同一编辑管道（CLAUDE.md 硬约束合规）；AI Agent 工具是 op 的另一个生产者，复用相同 toolId。

#### 3.2c 增量三层（可降级性能层）

| 层 | 机制 | 状态 |
|---|---|---|
| L1 失效传播 | EDE 受影响子图自动裁剪 | 内建零成本（`Relationship.ts:345-382`） |
| L2 内核级重跑 | 特征 k 变 → native 回滚到 k 前 mark → 只重跑 k..n 内核 op | 需暴露 `CreateRollbackMark`（X3）；未暴露前降级 L3 |
| L3 输出缓存 | 输入未变 + 缓存有效 → 跳过内核调用 | MS 内存/SAB，自建 |

#### 3.2d 失败级联

特征 evaluate() 失败 → 出边 `status=1` + 特征元素标错 → 下游跳过执行、保留旧输出、保持脏 → 前端特征树红标。修复参数后 saveChanges 重触发传播**自动愈合**——无需专门恢复路径。

#### 3.2e Undo 语义：**op 即 push + 语义 undo**

- **op 即 push**：每个 op 立即 saveChanges+push，changeset 粒度 = op 粒度（Onshape 每 op 一 microversion 同构）。单写者下 push 恒基于 tip，无冲突代价。
- **undo/redo 统一走 op 日志**：undo = 逆向 op 落成新 changeset；redo = 正放。不依赖 txn 栈（push 后栈清空，`InteractiveEditing.md:36`）。机制单一、行为可预测、跨会话天然成立。
- 被否方案：本地攒 txn 显式发布——引入「发布边界」额外概念、hub 滞后损害协同实时性、undo 语义分裂两套。

#### 3.2f op 日志形态：双层

- **changeset.description** 携带 op 摘要（hub 层快速审计；imodelhub-services 支持度 = X4 验证项）。
- **iModel 内 op 日志元素**（append-only，含完整参数 old/new）：随库版本化；undo/redo/未来分支重放的数据源；不引入 MS 外部存储依赖。

### 3.3 协作模型、系统接缝、验证计划、范围

#### 3.3a 协作模型

- **v1 实现**：会话级**写租约**——一个 PartStudio 同一时刻一个活跃编辑者（MS 按文档维护租约，WebSocket 会话持有，过期可收回）；读者不限（只读 briefcase pull）。
- **多人路径论证**（落档不实现）：
  - 多人共编 = 多客户端连同一 MS 会话 → op 队列串行 → 永远单写者 → 不需要行级合并；presence/op 广播复用 MS WebSocket。
  - per-user undo = op 日志按用户过滤 + 逆向 op apply 到最新；逆向 op 须按当前状态校验，失败即拒绝并提示（比 Onshape「from wins」保守，多用户版再议）。
  - 分支/合并 = op 日志重放到 fork 定义（语义合并原型路径；iModelHub 无此概念，已记为已知差距）。
  - 水平扩展 = 文档→MS 实例亲和（sticky session），部署层问题，不进本 spec。

#### 3.3b 系统接缝

- **modeling-server**：新增 FeatureService（op 接收/校验/执行/op 日志/租约管理）；复用 `LocalhostIpcHost` WebSocket 做 op 广播。
- **D7 破坏式编辑语义**：绕开特征系统直接改 BodySolid 几何 → 该元素打标「overridden」，特征系统**暂停对其自动再生**（不覆盖手工修改）；定义保持完整；用户显式「重新参数化」= 丢弃手工修改 + 全量重建恢复。
- **前端**：FeatureTreePanel 重做（读特征元素+status，op 经 MS RPC 发起）；viewer 显示 BodySolid 走标准物理模型显示路径，零定制。现有 CadFeature/FeatureTreePanel 骨架全部废弃重做。
- **TopologyID 暴露形态定案：内嵌式**。创建类 op 沿用门面既有 nodeId 参数打标；修改类 op 走 Emboss 已示范的保标模式（FindNodeIdRange→改→AddNodeIdAttributes）；引用消费 = 新增查询 op `FacesFromId(nodeId, entityId) → 面集合`（歧义策略为特征类型属性，D4 已定）。不需要独立打标 op。imodel-native 侧工作量 = 查询 op 暴露 + rollback mark 暴露两项（X3）。
- webhook-agent / baseline 管道：不动。

#### 3.3c 原型验证计划（spike 先行，按风险排序）

| # | 验证项 | 通过标准 |
|---|---|---|
| 1 | **EDE-BRep 回调契约**（最高风险） | 最小图 sketch→extrude→fillet→BodySolid：改草图尺寸 → saveChanges → BodySolid 自动更新，changeset 含全部变更；indirectEditTxn 写回、拓扑序、失败标记均验证 |
| 2 | changeset.description 在 imodelhub-services 的支持（X4） | op 摘要可存可取 |
| 3 | libslvs DOF 计数 C API 暴露（D5 遗留） | 草图欠/过约束状态可读 |
| 4 | op 日志 + 语义 undo 端到端 | 改→撤销→重做，跨会话一致 |

#### 3.3d 测试策略

单测（Vitest，mock native）→ 集成测试（真实 briefcase + 本地 native 库：EDE 链路/失败级联/undo）→ e2e（Playwright：特征树×视口联动）→ **结构断言回归**（借 kittyCAD artifactGraph 思路：EDE 图 + TopologyID 映射作为 CI 回归基准）。

#### 3.3e 范围与非目标

- **v1 特征集**：草图（SolveSpace 过渡）+ 拉伸 + 布尔（Add/Sub）+ 圆角。旋转/壳/拔模/阵列后置。
- **非目标**：多实体与装配、多人共编实现、分支/合并、脚本投影（仅 API 形态留白）、AI 工具（仅消费者视角留白）、STEP（真形自研线独立推进）、椭圆草图实体（libslvs 天花板，待绳墨）。

---

## 4. 悬点清单（进入实施计划时必须转化为任务）

1. X1 spike：EDE-BRep 回调契约（§3.3c #1）——**最早执行，阻塞后续所有特征引擎工作**。
2. X3：imodel-native 暴露 `FacesFromId` 查询 op + rollback mark——形态已定（内嵌式），需排期。
3. X4：imodelhub-services 的 changeset description 支持确认。
4. EDE @beta 风险对冲：若 spike 暴露契约不足，降级方案 = MS 自驱动传播（显式遍历受影响子图调 evaluate，放弃 saveChanges 内建传播），数据模型不变。
5. libslvs DOF 暴露验证（D5 遗留，草图节点入图前需要）。
