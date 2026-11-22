# 架构裁决与路线图：先做什么、必须先决定什么

> 前提：Onshape 功能面远大于当前团队/架构一次能交付的范围。正确策略不是“全量开工”，而是**先锁定产品面，再做不可逆的架构裁决，最后按依赖顺序切片**。
>
> 本文是能力/决策路线；**工业级目标架构**见 [`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`](./09-INDUSTRIAL-TARGET-ARCHITECTURE.md)，**架构冻结 Gate/WBS/验收**见 [`10-ARCHITECTURE-HARDENING-PLAN.md`](./10-ARCHITECTURE-HARDENING-PLAN.md)。

---

## 1. 必须先做的 16 个裁决

### D1. 产品范围：Part Studio vs “Onshape 主要功能” vs 全量

**问题**：对外承诺的是哪一种？
- A：Part Studio 草图/约束/特征严格对齐（当前 2026-11-19 计划）。
- B：Part Studio + 基础 PDM + 装配 + 工程图 + 导入导出（“主要功能”）。
- C：全量 Onshape（含 Render Studio/企业/多租户/实时协同）。

**建议**：近期明确选 A；若要 B/C，先写产品范围 ADR 并与能力账本一致。
**阻塞**：所有后续排期、招聘、内核许可、协同架构。

### D2. 协同模型：单写者 vs 真同时编辑

**问题**：是否要求 Onshape 式多用户同时编辑？
- 现状：单 iModel 单写租约；第二人只读；无 presence/操作流。
- 选项：
  - A：单写者 + 多只读（现状意图）——需先做会话隔离（IPC/briefcase/Editor），否则第二个打开者会互踢/串响应；成本中，不能直接宣传“可分享查看”。
  - B1：异步多 briefcase——per-user briefcase + 锁 + 周期 pull + 锁冲突 UI；Hub 底座已支持，B 级工程。
  - B2：渐进感知——presence/评论/Follow/通知，先不改写模型。
  - C：真同时编辑——服务端权威操作流/冲突处理/逐用户 undo/presence；高成本/高风险（OT/CRDT 不建议）。

**建议**：短期 A+B1/B2；C 单独立项。无论 A/B/C，**会话隔离（IPC/briefcase/Editor）与 undo 所有权是任何第二用户（含只读）的前置**；异步多 briefcase 的第一步不是加 briefcase 数量，而是让 undo/身份按用户/会话隔离。
**阻塞**：实时编辑、评论/Follow、多用户 UI、changeset/undo 设计。

### D3. 内核与导入策略：ACIS 许可 vs 外部转换 vs 不支持

**问题**：STEP/IGES/Parasolid/DWG/STL 是否在范围内？
- 现状：ACIS 仅 Modeler+Polyhedra；InterOp/healing 未授权；TrueForm M0。
- 选项：
  - A：只做许可内格式（STL/3MF/OBJ/DXF/GLTF 真实导出；DXF 草图导入）。
  - B：取得 InterOp/转换许可或外接转换服务（STEP/IGES/Parasolid/DWG）。
  - C：明确不支持，登记 excluded。

**建议**：先 A；B 单独立项/商务裁决；不要用自研近似/healing 冒充。
**阻塞**：导入导出、工程图 DWG、与外部 CAD 协作。

### D4. 装配：自研 3D 求解器 vs 扩展绳墨 vs 集成第三方

**问题**：装配 Mate 求解器从哪来？
- 现状：只有 2D 草图求解；iTwin 无 Mate 求解。
- 选项：
  - A：扩展绳墨（solver-neutral）到 3D 刚体约束（推荐长期）。
  - B：独立 3D 求解器/第三方（需许可/接口/内核）。
  - C：不做装配。

**建议**：先做装配数据模型/实例/UI + 一个最小 Mate 求解 spike，再决定。
**阻塞**：装配、BOM、工程图 BOM、发布/PLM。

### D5. 工程图：自研 Drawing 引擎 vs 集成

**问题**：工程图产品面（视图/尺寸/GD&T/表格/DWT/DWG）自研还是集成？
- 现状：无 Drawing 模块；iTwin 只有 BIS 视图/剖切基础。
- 选项：
  - A：自研最小 Drawing 引擎（推荐作为长期能力）。
  - B：集成外部绘图/排版库（需许可/格式/数据绑定）。
  - C：不做工程图，只做导出截图/PDF。

**建议**：先做基础视图/尺寸/表格 MVP；GD&T/发布联动后置。
**阻塞**：工程图、MBD、发布/修订、制造输出。

### D6. PDM/发布/PLM：自研平台服务 vs 集成

**问题**：Release/Revision/BOM/PLM 是否产品化？
- 现状：只有 changeset/Named Version/权限；无 release/BOM/PLM。
- 选项：
  - A：自研平台服务（推荐长期）。
  - B：集成外部 PLM/PDM（Arena 等）。
  - C：先不做，只做版本/共享。

**建议**：先做真实 checkpoint/Named Version、用户归因、基础版本/权限/共享与 Release 状态机 MVP；PLM 连接器后置。
**阻塞**：发布/修订、工程图 Revision、BOM、企业客户。

### D7. 渲染：iTwin 增强 vs DanQing 接入

**问题**：Render Studio/高级渲染走哪条路？
- 现状：iTwin WebGL 交互式渲染；DanQing 独立未接入；`EXCEPTIONS X-10` 禁止未 ADR 接入。
- 选项：
  - A：iTwin 增强（材质/环境/后处理），Render Studio 有限能力。
  - B：DanQing 作为高性能渲染后端（需 ADR/桥接/许可/多平台）。
  - C：不做 Render Studio。

**建议**：短期 A；B 单独立项；不要同时维护两套渲染状态机。
**阻塞**：Render Studio、高质量渲染、超大模型可视化。

### D8. 规模/多租户：单栈 vs SaaS

**问题**：当前“本地单栈”是否要变成 Onshape 级多租户 SaaS？
- 现状：单 MS 进程/内存租约/缓存；hub 单服务；限流。
- 选项：
  - A：私有/小团队单栈（当前）。
  - B：可水平扩展的服务化架构（租约/缓存/队列外置）。
  - C：多租户 SaaS（隔离/计费/审计/配额）。

**建议**：先 A；B 在设计装配/工程图/协同前做容量模型；C 是独立平台项目。
**阻塞**：大规模协作、企业客户、Onshape 级 SLA。

### D9. 自动保存/撤销生命周期

**问题**：是否继续 20s push + 清空 undo？
- 现状：`useAutoPush` 20s push 清空原生 undo；Onshape 自动保存不破坏 undo。
- 选项：
  - A：降低 push 频率/只在空闲时 push；保留一个编辑窗口 undo。
  - B：扩展 OpLog 为跨 changeset 的用户级 undo（与协同一起设计）。
  - C：维持现状并对外说明。

**建议**：至少先做 A；B 与 D2 一起。
**阻塞**：单用户编辑体验、协同 undo。

### D10. 文档/能力账本口径

**问题**：`docs/Architecture.md`/能力账本/产品文案是否与代码一致？
- 现状：Architecture.md 仍有旧编辑 RPC/TrueForm 为内核的过时描述；账本 126 行 `full=0`；产品文案有“全量 Onshape”倾向。
- 选项：
  - A：同 PR 修文档 + 能力账本 + 对外口径（推荐）。
  - B：继续让文档/代码漂移。

**建议**：A，立即。
**阻塞**：所有对外承诺与评审判断。

### D11. 特征图/多输出执行模型

**问题**：是否要把“每 body 单源线性链 + 单输出 + tail-only 删除”升级为 Onshape 式任意特征图/可编辑历史？
- 现状：后端特征图是线性链；单特征单输出；删除仅链尾；结构键禁改；任意插入/重排/rollback/多输出没有执行器。
- 选项：
  - A：保持追加式线性链，产品只承诺有限特征历史；适合当前 Part Studio 子集。
  - B：做特征图执行器（多输出、任意插入/删除/回滚、依赖图调度）；大量 Onshape 特征分支的前置。
  - C：只补 UI，不改造执行器；会在大特征分支上返工。

**建议**：若目标包含 Onshape 主要特征树行为，选 B；否则明确 A 的范围。
**阻塞**：多输出特征（split 双侧、mirror 新建、mergeScope 多目标）、可编辑历史、任意重排、装配/工程图依赖链。

### D12. 授权/租户隔离

**问题**：当前后端通道是否满足文档级 ACL/多租户安全？
- 现状：审计发现后端服务账号 + X-API-Key 直通 hub；RPC/IPC 主要验证登录、缺逐 iModel ACL；WS token 缓存后不再验；任意合法 token 可尝试任意 iModelId/文件路径（代码推断，未渗透）；groups/shares 只存不判，前端权限门不是边界。
- 选项：
  - A：先做 per-iModel ACL、连接后 token 校验、下载/打开/FeatureOp 统一鉴权、shares/groups 执行、负例测试（推荐）。
  - B：维持现状，仅私有部署。
  - C：做多租户隔离/配额/审计。

**建议**：A，立即；B 不允许对外作为企业级服务。
**阻塞**：数据协同/企业客户/多租户 SaaS。

### D13. 发布/契约治理

**问题**：源码/产物/文档/冻结清单是否对账？
- 现状：源码 shared 1.85 vs 最新发布 shared 1.64；interface-freeze 过期；opDsl 缺 draft；Architecture.md 旧 RPC/TrueForm。
- 选项：
  - A：发布前强制契约对账 + 重建 interface-freeze + 文档按代码重修（推荐）。
  - B：继续“源码绿即完成”。

**建议**：A，立即。
**阻塞**：发布可信度、外部集成、审计。

### D14. 内核持久化与 TrueForm 切换

**问题**：iModel 里的几何以 ACIS SAB 持久化；TrueForm 如何兼容？
- 现状：`SaveEntityToMemory/Restore` 是 `SolidKernel.h` 合同，iModel geometry stream 存 SAB；TrueForm M0 无拓扑/几何/序列化，不能读写 SAB；`INTEGRATION.md` 未把格式兼容列为门禁。
- 选项：
  - A：TrueForm 实现 SAB 读写（保留已有模型无迁移；工作量/格式许可风险大）。
  - B：不兼容 SAB，切换时全量迁移/重求值（需要模型迁移工具与回滚）。
  - C：双格式共存（新模型 TrueForm、旧模型 ACIS；长期双内核维护）。
  - D：近期不切换，ACIS 为唯一生产内核；TrueForm 只做研究。

**建议**：先 D，长期 A/B 单独立 ADR；在任何 M1 投入前先裁决，否则 M6 一致性套件无法覆盖既有模型。
**阻塞**：TrueForm 路线、几何迁移、跨版本拓扑 ID 策略。

### D15. 版本账本冻结 / Checkpoint / 历史压缩

**问题**：是否先冻结 changeset 账本，再实现 checkpoint 生成与历史压缩？
- 现状：只有 baseline checkpoint；Named Version 只写元数据；冷开从 baseline 重放全部 changeset；20s autosave 约 720 changeset/日/文档；无 GC/压缩/配额。changeset 有 PATCH/DELETE、`waitingForFile` 悬挂可永久阻塞链头、fork 只复制 checkpoint。
- 选项：
  - A：先冻结账本（不可变/悬挂恢复/fork 语义），再每 N changeset + 每个 Named Version 生成 checkpoint（推荐）。
  - B：A + changeset 压缩/归档/配额（定期合并历史，保留版本锚点）。
  - C：降低 autosave 频率/只在空闲 push，减少 changeset 生成（治标）。
  - D：维持现状，仅限小文档/演示。

**建议**：立即 A（账本冻结先于 checkpoint），B 随规模；C 与 D9 一起；不要把 Named Version 当快照。
**阻塞**：冷开 SLA、版本恢复、异步多用户 pull、fork、存储成本、SaaS 规模。

### D16. 用户归因与审计身份

**问题**：changeset/briefcase/OpLog 是否记录真实用户？
- 现状：MS 服务账号推 changeset/briefcase；OpLog.user 是 session UUID；前端不传 userId；changeset/NV 事件未发射。
- 选项：
  - A：MS 以用户身份访问 hub/受信代理，briefcase/changeset/OpLog 全链带真实 userId（推荐）。
  - B：保留服务账号，但在 metadata 中附 userId 并签名（较弱，需防伪）。
  - C：不修，审计仅到会话级（不可用于合规/配额）。

**建议**：A，立即；否则发布/审批/审计/配额都是假证据。
**阻塞**：发布/修订、审计、按用户配额、评论/任务归属、企业合规。

---

## 2. 依赖关系（哪些不能并行）

```
D1 范围
 ├─ D10 文档/账本口径
 ├─ D13 发布/契约治理
 ├─ D3 内核/导入许可 ── 导入导出/工程图 DWG
 ├─ D2 协同模型 ── 实时编辑/评论/Follow/多用户 undo
 ├─ D11 特征图/多输出 ── 特征分支/可编辑历史/多输出特征
 ├─ D4 装配求解器 ── 装配/BOM ── 工程图 BOM/发布
 ├─ D5 工程图引擎 ── MBD/发布/制造输出
 ├─ D6 PDM/发布/PLM ── 修订/BOM/审计
 ├─ D7 渲染路径 ── Render Studio
 ├─ D12 授权/租户隔离 ── 企业/多租户/数据协同
 ├─ D8 规模/多租户 ── 企业/SaaS
 ├─ D14 内核持久化/TrueForm ── 几何迁移/长期内核
 ├─ D15 账本/checkpoint ── 冷开/版本恢复/多用户 pull/存储
 ├─ D16 用户归因 ── 审计/发布/配额
 └─ D9 autosave/undo ── 单用户体验/协同
```

**不可并行/必须先定**：
- 协同模型（D2）未定前，不要做多用户 presence/实时编辑 UI。
- 特征图执行器（D11）未定前，不要按 Onshape 全量特征树大规模铺 UI/分支（否则返工）。
- 装配求解器（D4）未定前，不要做装配 UI/工程图 BOM。
- 内核许可（D3）未定前，不要承诺 STEP/IGES/DWG 导入。
- 渲染路径（D7）未定前，不要做 Render Studio 产品面。
- 授权/租户隔离（D12）未定前，不要对外宣称企业级数据安全/多租户。
- 内核持久化（D14）未定前，不要按 TrueForm 里程碑排期或承诺内核替换。
- checkpoint（D15）未定前，不要做版本恢复/异步多用户/大规模 SaaS；否则冷开与 pull 会线性劣化。
- 用户归因（D16）未定前，不要做发布/审批/按用户审计/配额；否则审计是假证据。
- 范围（D1）未定前，不要按“全量 Onshape”排期。

---

## 3. 推荐路线（按依赖，不承诺工期）

### Phase 0：止血与口径（立即）

1. 修 `docs/Architecture.md` 过时内容；能力账本/产品文案统一为“Part Studio 对齐 + 明确 out-of-scope”。
2. 修 autosave/undo：至少保证一个编辑窗口的 undo 不被 20s push 破坏。
3. 清理假控件：gated 项要么有引导，要么明确 disabled/reason；不要点击 no-op。
4. 建立产品级能力 taxonomy（Part Studio/装配/工程图/PDM/渲染/账户），后续逐域登记 `planned/excluded`。
5. **会话隔离**：per-session IPC 路由、briefcase 文件/key、Editor 命令、openBriefcase 路径白名单；共享 briefcase/全局广播下连“单写者+多只读”都不可用。
5a. **安全最小收口**：per-iModel ACL、WS token 生命周期、下载/打开/FeatureOp/直接编辑统一鉴权；补安全负向测试。
6. **契约/发布/原生对账**：interface-freeze 重建（opCount 38/哈希）、opDsl 补 draft、shared 包版本策略、重建 MS 产物并更新 provenance、blocked-license op（Thicken）native fail-closed、源码/产物一致性检查。
7. **冻结版本账本**：changeset 不可变（PATCH 白名单/DELETE 收紧）、`waitingForFile` 悬挂恢复、fork 语义（Duplicate vs history）；这是 checkpoint 的前置。
7a. **checkpoint 最小实现**：Named Version 创建真实 checkpoint；200 changeset 冷开基线；版本 read-only 打开；不依赖实时协同。
8. **用户归因最小实现**：briefcase/changeset/OpLog 带真实 userId；发射 changeset/Named Version 事件。
9. 做一次真实大模型/多用户容量压测，形成基线。

**退出**：文档与代码一致；Part Studio 用户不会被 undo 丢失/假入口误导；范围口径公开；后端通道有逐文档授权；发布契约可追溯；版本账本不可变且有真实快照；审计能追到人；两个用户打开同一文档不互踢/不串响应。

### Phase 1：Part Studio 主链收口（当前主战场）

1. 草图：ellipse/elliptic arc/conic/text/N 点样条 + 约束槽位 + 面域/UI。
2. **特征图执行器（D11）**：从 per-body 线性链升级到支持任意插入/删除/重排/回滚/多输出；这是大量特征分支的前置。
3. 特征：21 个 FeatureType 逐分支（先从 extrude/revolve/fillet/chamfer/hole/shell/loft/sweep）。
4. 外部引用 S4 保持 blocked 证据；UI 选择器/持久化边界。
5. 特征树：任意删除/重排/回滚/Final/Pause rebuild/Feature history（依赖 D11）。
5a. **内核配合**：扫掠光滑路径精确性、变半径/full-round fillet、DeleteFace 共面种子、tile facet 键控/并行、100 body 大模型基线、BRep→tile 真栈测试；每个 slice 先 ctest/真栈再接线。
6. 预览/undo/性能：统一 preview pipeline；worker/子进程评估；大模型/大草图基线；OpLog 分页/裁剪。
7. 特征 UI 平台化：消费 `getFeatureFormModel`，收敛注册点，降低单文件硬编码。
8. 能力账本：每个分支有 full/blocked 结论；禁止入口数冒充完成。

**退出**：Part Studio 主要功能在七个维度有证据；特征图/多输出/undo 语义与 Onshape 主要行为一致；不依赖装配/工程图/PDM。

### Phase 2：基础平台与“主要功能”外沿

按 D1 选择 B 才做：
1. **PDM 基础**：checkpoint/真实 Named Version、Restore/Compare、分享/权限执行、评论/通知、异步多 briefcase；异步第一步是 undo 所有权/会话隔离，不是 briefcase 数量；不做 branch/merge 先。
2. **装配基础**：先实例/结构（BIS 底座）+ 装配树，再 Fastened/Revolute Mate + 3D 求解器，再 BOM；不要先做十种 Mate/仿真。
3. **导入导出**：先许可内格式（STL/3MF/OBJ/DXF/GLTF 真实导出）；STEP 等许可裁决。
4. **渲染增强**：材质/环境/后处理/命名视图/剖切；Render Studio 仍后置。
5. **AI+CAD**：Part Studio tool spec/Agent 复用现有 toolId/FeatureOp；破坏性操作 HITL。

**退出**：装配/BOM/基础 PDM 可用；导入导出不依赖未授权内核；渲染不成为第二平台。

### Phase 3：工程图 / MBD / 发布 / PLM

1. MBD/公差/Inspection（依赖 Part Studio 面引用/尺寸）。
2. Drawing 基础视图/尺寸/表格；GD&T/焊接/检验后置。
3. Release candidate/审批/修订/零件号/水印/配置发布；BOM 联动。
4. PLM 连接器（Arena）；单向上传/审批回传/幂等/预检。
5. 企业账户/SSO/席位/审计/分析（如做 SaaS）。

**退出**：工程图/发布/PLM 各自有独立能力账本与真栈证据；不把“有表”当“有流程”。

### Phase 4：真同时编辑 / 高级渲染 / 多租户（如选择 C）

1. 协同层：presence/操作流/冲突处理/逐用户 undo/branch-merge。
2. Render Studio：PBR/IBL/AxF/OpenVDB/服务端渲染/多视图（iTwin 或 DanQing，取决于 D7）。
3. 多租户/水平扩展/队列/配额/审计/SLA。
4. 这是独立产品线，不应与 Part Studio 共享发布节奏。

---

## 4. 首个 90 天的可执行清单（建议）

1. **D1/D10/D13/D14/D15/D16 裁决**：产品范围/对外口径/账本 taxonomy 一页纸；更新 `docs/Architecture.md`；重建 interface-freeze/opDsl；裁决内核持久化/checkpoint/用户归因路线。
2. **会话隔离 + 安全最小收口（D12）**：per-session IPC/briefcase/Editor、openBriefcase 路径白名单；per-iModel ACL、WS token 校验、下载/打开/FeatureOp/直改统一鉴权；补安全负例。
3. **undo/autosave**：实现“一个编辑窗口 undo 可用”的最小修复；加 e2e。
4. **Part Studio 分支**：选 2 个 FeatureType（如 extrude + fillet）做逐分支 v1 矩阵，补齐最影响示例的分支。
5. **草图实体**：选 1 个缺失实体（ellipse 或 text）+ 1 个约束（normal/intersection）做端到端切片。
6. **tool spec**：把 20 个核心工具页转成 JSON 规格（字段/默认/选项/选择/限制/置信度），用于 UI 与 AI。
7. **容量基线**：真实大 Part Studio + 多用户开/关/编辑并发压测；记录瓶颈（MS/租约/缓存/tile/主线程内核）。
8. **决策包**：为 D2/D3/D4/D5/D6/D7/D11/D14 各写 2 页 ADR 草案，产品/架构评审，不要先编码。
9. **内核治理**：blocked-license op fail-closed、单 canonical native checkout、native ctest 进 CI、重建产物并更新 provenance。
10. **内核切片**：扫掠光滑路径偏差测试、12 边变半径 fillet ctest、100 body tile 冷构建基线。
11. **数据切片**：冻结 changeset 账本（不可变/悬挂恢复/fork 语义）→ Named Version 真实 checkpoint + 200 changeset 冷开基线；用户归因（briefcase/changeset/OpLog userId）+ changeset/NV 事件；权限负例（非成员经 MS 打开/写入 403）。

**验收**：每个切片有代码/测试/真栈/账本证据；没有“假 full”、没有未登记 blocked、没有点击 no-op；安全/发布对账通过。

---

## 5. 不应做的事（红线）

- 不要把“文档有”当成“产品已实现”。
- 不要用 gated 入口/占位 UI 冒充完成。
- 不要在未定协同模型前做“多用户实时编辑”UI。
- 不要在会话隔离（IPC/briefcase/Editor）前对外提供“分享查看”或第二个用户打开同一文档。
- 不要在未定装配求解器前做装配 BOM/工程图 BOM。
- 不要让工程图依赖未稳定的 MBD/装配/发布。
- 不要用 DanQing 替代 iTwin 渲染器（未 ADR）。
- 不要用 TrueForm 短期替代 ACIS/InterOp。
- 不要用近似几何/自研 healing 冒充 STEP/DWG 导入。
- 不要用单进程/内存租约承诺 Onshape 规模。

---

## 6. 结论

- **架构可行，但范围必须先裁决**：Part Studio 主链已经有真实底座；全量 Onshape 不是当前架构的延伸，而是多个新子系统。
- **先做“真”的 Part Studio**：21 个 FeatureType 分支、草图实体/约束、UI/undo/预览/性能；这是最小可信产品面。
- **再按依赖做外沿**：基础 PDM → 装配基础/BOM → 导入导出（许可内）→ 工程图/MBD/发布 → Render Studio/企业/协同。
- **协同是分水岭**：单写者 / 异步多 briefcase / 真同时编辑是三种产品；越早裁决，越少返工。
- **数据底座有两颗“地雷”**：无 checkpoint 生成器导致冷开/版本/协作线性劣化；无 per-iModel 授权导致分享是假安全。先拆这两颗，再谈协同/PDM。
- **内核是可复用底座，但有硬边界**：基础特征 B；扫掠精确性/fillet 模式/曲面/tile 并行是已知硬限制。先把发布 provenance/接口冻结/许可 fail-open 收口，再谈内核深度与 TrueForm 迁移。
