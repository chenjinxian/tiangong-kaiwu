# CAD 基础新会话启动提示词

> 用途：粘贴到新的 Claude Code 会话（工作目录 D:\Github\tiangong-kaiwu）作为第一条消息。
> 生成于 2026-09-27，承接同日 AI 建模 brainstorm 会话（该会话经需求深挖后重定向为 CAD 基础建设）。
> 本会话持久记忆已存档（memory: cad-foundation-direction / acis-license-scope / solvespace-interim-solver），会自动加载。

---

## 提示词正文（复制以下全部）

回归传统 CAD 软件架构设计。**本会话核心问题：iModel 这种建模数据存储方式，能否支撑 Onshape 式的参数化特征建模？** 请先调用 superpowers:brainstorming 技能再开始。AI 建模（文生 3D）是长期目标但本轮完全搁置，当前任务是 CAD 精确建模基础的架构裁决。

### 已完成的盘点（勿重新探索，直接消费结论）

**方向重定向**（2026-09-27 已定）：luban-cad 现有 CadFeature/FeatureTreePanel 判定为纯骨架无引擎，全部重做；AI 层不进本阶段。

**能力盘点硬事实**（两仓实查，含 file:line 证据）：
- **imodel-native**（D:\Github\imodel-native，dev/source-build，同步至 upstream 5.14.39）：BRepCore=Parasolid 的 ACIS 替身门面（`SolidKernel.h` 109 条声明）；PSBRepGeometry=31-op 协议 1:1 忠实还原（6 个官方即死路的 op：2/4/7/9/18/23 刻意保留；其中 18/23 内核层实现存在可接线）
- **持久拓扑 ID 已存在未暴露**：`BRepUtil::TopologyID`（FaceId=(nodeId,entityId)，nodeId=产生该面的操作；ATTRIB 载体跨分裂/合并/拷贝+持久化）；Emboss 已示范修改类 op 的保标模式（FindNodeIdRange→改→AddNodeIdAttributes）；创建类门面全线带 nodeId 参数
- **有效性检查**（`HasConsistentTopologyAndGeometry`=api_check_entity）存在但仅内部守门；**内核回滚 mark**（CreateRollbackMark）存在未暴露
- **itwinjs-core**：`ElementDrivesElement`（持久 DAG+变更传播回调 onBeforeOutputsHandled/onAllInputsHandled，`core/backend/src/Relationship.ts:282`）存在且**零使用**；fork 对 core 几何零修改（改动集中在 editor 包）
- **ACIS 授权**：仅 3D ACIS Modeler + Polyhedra；STEP/tolerant stitch 属 3D InterOp 未授权 → STEP 走真形自研（writer 先行；reader 必须配 healing，同为自研）；建模公差恒 SPAresabs=1e-6 不可调
- **绳墨未研发，SolveSpace/libslvs 过渡**；**平台纯云 SaaS 定案**（GPLv3 不触发，进程内直链可；红线：任何 on-prem 二进制交付即触发 GPL 污染）。libslvs：C ABI、group 语义原生支持跨草图引用、一致性三态（OK/矛盾约束清单/不收敛清单）、无椭圆实体、DOF 是否在 C API 暴露待验证

### kittyCAD / Onshape 深挖结论（2026-09-27，本地源码+一手博客）

**kittyCAD**（D:\Github\modeling-app 官方检出，含 rust/=KCL 核心）：
- 状态模型：KCL 文本=唯一状态（KclManager extends File），几何=派生缓存
- **artifactGraph**：引用机制=语义构件（plane/path/segment/wall/cap/sweep/edgeCut）锚定源码位置（codeRef={range,pathToNode}）；引擎 id↔代码双向映射；CI 用生成图做回归
- 增量执行三层：TS 层全量重执行（废弃在途）；Rust 层 AST/模块缓存+变更部分检测（execution/cache.rs）；草图模式专用增量（PREV_MEMORY）；引擎协议本身增量
- 约束双层：构造函数即约束（line→xLine）+ 真约束对象（rust frontend add_constraint/edit_constraint/SketchConstraintReport，2026 重做）

**Onshape**（Under the Hood: How Collaboration Works, Ilya Baran 2015，一手全文已核）：
- **数据三分法**：UI 状态（不存）/ **Part Studio definition（唯一存储与协同对象）** / regen 结果（缓存，永远可重建）
- **microversion**：不可变、存 parent 引用+变更本身（语义操作级 delta，非状态快照）；变更设计为可跨 parent 应用（特征内部 id 标识）→ 多人变更直接 apply 到最新，无锁无冲突；per-user undo=我的变更之逆 apply 到最新；合并=重放 from 分支未合并变更，冲突「from wins 永不阻塞」
- 持久 ID：变长字符串，模型变化后可能变，提供 microversion→microversion 映射 API
- 执行：每文档专属 model server（Parasolid）服务端增量再生（rollback 语义）

### 决策框架现状（D1-D7，勿重开已定项）

- D1 引擎位置：**工作假设=modeling-server（TS 层）**，native 收敛为「原语提供者」（TopologyID 暴露/validity check/checkpoint），MS 与 native 同进程无 IPC 开销
- **D2 特征树形态：未决（本会话主战场）**——对象图为权威+脚本投影 vs 程序为权威；已获新论据：特征元素化后 changeset 天然携带「哪个特征哪个参数变了」的语义（Onshape 式语义 delta 的嫁接通道）
- D3 再生语义：第一设计律=正确性按可全量重建设计，增量（特征输出 SAB 缓存/失效传播/native rollback mark）只是性能层
- D4 引用消费：TopologyID 路线与 Onshape 同构（nodeId≈特征身份）；重算时重打 nodeId=k 使引用自愈；歧义策略（FacesFromId 返回集合）是特征类型属性
- D5 草图/绳墨：已收敛（SolveSpace 过渡+接口中立+FE WASM 交互/MS 权威求解）
- D6 单零件 v1；D7 破坏式编辑=标记降级
- TopologyID 协议暴露形态（独立 op vs 内嵌）暂缓，随总架构定

### 本会话要正面回答的问题

**iModel 存储（元素模型+briefcase+changeset）vs Onshape 参数化特征建模的可行性裁决**：
1. iModel 元素模型能否承载 Onshape 式「definition（特征表）/ regen 结果（几何）分离」——特征=结构化元素（ECSchema）、几何=派生元素、ElementDrivesElement=依赖图的映射是否成立
2. changeset 的行级状态 delta 与 Onshape 语义操作 delta 的差距是否致命；特征元素化后 changeset 是否即语义操作
3. briefcase 单写者会话（MS 中心进程）与 Onshape model server 的对齐度与差距（多人共编一个零件的场景怎么办）
4. FreeCAD 对照（D:\Github\FreeCAD 本地检出可深挖：App 层 DocumentObject/依赖图/recompute 机制、PartDesign 特征、拓扑命名问题反面教材）
5. 结论落为 D2/D3 的最终裁决 → 分节设计获认可 → spec 落 docs/superpowers/specs/ → writing-plans → SDD（流程已验证）

### 过程要求

- 先调 superpowers:brainstorming 技能；记忆自动加载，勿重复探索已盘点内容
- 引用结论时给 file:line 或一手来源；FreeCAD/modeling-app/imodel-native 三仓本地可查
- 可行性问题允许答案是「部分可行+需要补 X」；不预设结论
- LLM/AI 话题仅在特征系统 API 设计的消费者视角提及，不展开

### 提示词正文结束
