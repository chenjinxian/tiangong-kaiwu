# G2 契约预冻结计划（2026-11-24）

> 状态：**Pre-freeze / Proposed under owner directive 2026-11-24; not ARB-signed**。
> 本文是 G2 契约冻结的**输入材料**，不是冻结记录，也不是 Gate 通过记录。
> **G1 Gate 仍未通过**（`G0-GATE-REPORT-2026-11-24.md` 记 G1 0/15）；在 G1 的身份/归因、
> 不可变账本、会话隔离、版本打开与 CI/契约门通过前，G2 不得正式冻结，也不得据此铺新特征。
> 证据边界：只用公开、脱敏事实；不含私有源码、密钥、native 构建证据或客户数据。
> 关联：`08-ARCHITECTURE-EXTENSIBILITY.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、
> `10-ARCHITECTURE-HARDENING-PLAN.md`、`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`、
> `G2-SPIKES-2026-11-24.md`、`ADR-G2-01..04`、`ADR-G0-05/10/15/16`、`EXCEPTIONS.md`。

---

## 0. 结论

1. **G2 的目标是“让扩展不再改承重假设”，不是“把功能做出来”。** 本计划只冻结契约、
   兼容语义、证据门与回滚方式；不实现 Feature Manifest、DAG、Assembly/Drawing、
   多文档 UI 或新特征。
2. **当前不可冻结。** 2026-11-24 审计事实：无单一 Feature Manifest；`LubanFeatureType`
   21 个类型而 `opDsl` 只白名单 20 个（缺 `draft`）；`shared` `strict:false`；每个特征
   跨 9+ 手写注册点；`paramsVersion` 缺失；单输出/线性 `orderKey`，无显式 inputs/outputs
   或 DAG；拓扑引用是裸 `{nodeId,entityId}`；tab 靠 `UserLabel` 前缀发现；无
   `SelectionRef`/`SelectionDomain`/`DocumentSessionHost`/`CommandRegistry`；批量 pick
   不存在；`BRepData` 无 `format/kernel` 标签。
3. **最小契约集是 C1–C8**（§4）。其中 C1（Manifest）、C4（typed tab）、C2/C3（输出/
   拓扑/选择信封）、C5/C6（session/command/undo）、C7/C8（批量读取与格式标签）分五步冻结。
4. **冻结顺序服从依赖与 G1**：Manifest → Typed Tab → 输出/拓扑/选择信封 →
   Session/Command/Undo 所有权 → Batch Pick/Format Tag。任何一步都不能绕过 G1 的会话/
   身份/账本门禁；G2 契约只能与 G1 已验收的运行时语义对齐，G1 未验收时只能保持
   shadow/off，不得 enforce。
5. **本文不宣称 G2 冻结、G1 通过、生产可用或 Onshape 全量。** 所有 Spike 状态为
   Not run/Planned；所有 ADR 为 Proposed，未 ARB 签字。

---

## 1. 判定口径

### 1.1 什么算“冻结”

一个契约只有同时满足以下条件，才可标记为 **Frozen**：

1. **单一来源**：类型/schema/白名单/表单/能力/AI spec 有唯一机器可读来源，生成或校验
   产物；不存在多份手写事实源。
2. **版本锚点**：`interfaceVersion`/`manifestHash`/`paramVersion`/`schemaVersion` 至少
   一个可机器读取并进入冻结清单；变更必须 bump 并双端同发布。
3. **兼容语义**：旧文档、旧 URL、旧行、旧客户端的行为有明确默认值；新增字段 additive；
   未知值 fail-closed；不要求全量数据重写。
4. **双读验证**：旧数据 fixture 与新契约在同一个测试中双读，旧路径零回归。
5. **失败语义**：不可解析、跨 body、缺版本、未知类型、未实现工作区返回稳定错误，
   不静默回退、不假成功。
6. **证据**：契约测试 + StandaloneDb/真栈（至少一项）+ 旧 fixture + 负例；证据可复现、
   已脱敏。
7. **回滚**：有开关/旧路径/生成产物回退方案；回滚不删除历史、不改写已提交 changeset。
8. **Owner/ARB**：契约 owner、消费者、失败判据、签字状态明确；未签字只能算 Proposed。

### 1.2 “预冻结”是什么

Pre-freeze 只表示：事实基线已盘点、候选契约与 ADR 已写、Spike 已设计、迁移/回滚已定义。
它**不**表示契约可用、Spike 通过、G2 Gate 通过或可以开工。把 Pre-freeze 写成 Frozen
属于状态造假（P1-09）。

### 1.3 证据等级

| 等级 | 含义 | 不能证明 |
|---|---|---|
| L0 文档 | 设计/事实盘点 | 运行行为 |
| L1 单元/契约 | 类型、生成、DSL、纯逻辑 | iModel/事务/真栈 |
| L2 StandaloneDb | iModel/BIS 读写、旧行/旧 scope | 部署形态/多用户 |
| L3 真栈 | 真实 MS + Hub + Web + 客户端 | 生产 SLA/规模 |
| L4 故障/部署 | 隔离栈双会话、崩溃注入、部署 canary | 生产长期稳定性 |

G2 的每个冻结候选至少要 L1 + L2 或 L3；涉及会话/多用户/选择的契约至少 L3/L4。
**只有 L1 不得宣称冻结。**

### 1.4 本文范围

**在范围**：C1–C8 的契约文本、版本锚点、兼容/迁移/回滚、失败判据、证据计划；
Pre-freeze 与正式冻结的 Gate 条件；Spike 设计与验收标准；ADR 之间的依赖关系。

**不在范围**：任何实现（manifest/类型/DAG/表单/批量 pick/native tag/UI）；任何功能
（新 FeatureType、Assembly/Drawing、多文档 UI、实时协同）；G1 平台修复；发布/部署；
G2/G3 Gate 签字。完整非目标见 §7。

---

## 2. 前置条件与 Gate 关系

### 2.1 正式冻结的硬前置（来自 G1）

以下任一项未通过，G2 只能维持 Pre-freeze：

1. 真实用户归因进入 changeset/briefcase/OpLog/audit（G1 B2.2）。
2. per-document ACL 在所有入口生效（G1 B3.1c–g、B4、B6 P4b）。
3. changeset 不可变、父链/校验和、悬挂恢复（G1 D1/D2）。
4. Named Version/版本只读打开语义可用（G1 D5/D6；D3/D6/D7/D8 的剩余项按 G1 条件）。
5. 会话隔离：per-session IPC/briefcase/Editor/undo（G1 C1/C2/C3）与双用户证据（S0-1）。
6. CI/契约门：interface-freeze、契约 hash、至少 backend 全量 + web 生产 build + native ctest
   的发布候选门（G1 J1）。
7. 读路径不隐式 rebuild/写库；pull 后缓存失效（G1 W3）。

> 这些是 G1 的正确性前置，不是 G2 可以“顺手修”的范围。G2 计划只定义接口依赖，
> 不替代 G1 证据。

### 2.2 Pre-freeze 的入口/出口

**入口**：G0 审计完成；G2 契约事实基线确认；C1–C8 候选与 ADR 草案存在；Spike 设计完成。

**出口（可提交 ARB）**：
- C1–C8 每项有 owner、版本锚点、兼容语义、失败判据、回滚与证据计划。
- 至少 4 个 Spike 有 PASS/FAIL/STOP 结论（见 `G2-SPIKES-2026-11-24.md`），失败项
  有明确“不冻结/改方案”动作。
- 旧文档/旧 URL/旧 params/旧拓扑引用的 fixture 矩阵已定义。
- CI 能阻断“新增手写注册点”“opDsl 漏类型”“未知 paramsVersion”“跨 body 裸引用”等回归。
- ARB 对 ADR-G2-01..04 给出 Accept/Conditional/Reject；未签字前仍是 Proposed。

**出口不包含**：实现全部契约、替换旧 UI、铺新特征、Assembly/Drawing、多文档 UI。

---

## 3. 当前事实基线（2026-11-24 审计）

| # | 事实 | 公开证据/位置 | 对 G2 的影响 |
|---|---|---|---|
| B1 | `LubanFeatureType` 21 类型；`opDsl.FEATURE_TYPES` 20 项，缺 `draft` | `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`、`packages/shared/src/opDsl.ts` | AI/DSL 不可生成产品已有类型；不能以“全类型”冻结 |
| B2 | `shared` `strict:false`；`opDsl.test.ts` 不在默认 typecheck include | `packages/shared/tsconfig.json`、`packages/shared/tsconfig.test.json`、`EXCEPTIONS.md` X-11 | 编译期穷举不可靠；契约漂移不能阻断 |
| B3 | 每个 FeatureType 跨 9+ 手写注册点：shared union/params、后端 zod/registry、formFields、opDsl、opDsl.test、ribbon、capabilities、FeatureDialog、图标/i18n/树/测试 | 公开前端路径与 `08` §4.3；私有后端按接口消费 | 新特征边际成本高；无法保证多面一致 |
| B4 | 特征 `params` 是不透明 JSON；`FeatureTreeEntry.params: unknown`；无 `paramsVersion` | `LubanFeatureRpcInterface.ts`；`ADR-G0-15` | 旧参数无迁移锚点；改字段只能靠“只加可选” |
| B5 | 单输出/线性链：`FeatureTreeEntry {id,featureType,orderKey,...params}`，无 inputs/outputs/DAG | 同上；`08` §4.2 | 多输出、split 双侧、mirror 新体、下游消费无法表达 |
| B6 | 拓扑引用 `LubanTopologyId {nodeId,entityId}`；`FilletEdgeRef.bodyKey?` 可选；顶点无持久 id | `LubanFeatureRpcInterface.ts`；`08` §4.2 | 多 body/插入删除后可能静默命中错误边/面 |
| B7 | `WorkspaceRef {iTwinId,iModelId,modelId?}`；`PartStudioInfo {id,name,order,defModelId,physModelId}` 无 kind/type/version | `apps/web/src/common/workspace/workspace-ref.ts`、shared `PartStudioInfo` | 每加工作区要改 Part Studio 路由；版本引用不可表达 |
| B8 | tab 发现依赖 `UserLabel` 前缀（`LubanFeaturePartition:`）合成；`listPartStudios` 是当前读面 | `08` §4.1、`INDUSTRIAL-READINESS` W7；公开侧无 `listTabs` | Assembly/Drawing 无法统一发现；旧前缀是隐式契约 |
| B9 | 选择 `CanvasSelection {ownerBodyKey?,topologyId?}`；模块单例 zustand store；无 `SelectionRef`/`SelectionDomain`/`DocumentSessionHost`/`CommandRegistry` | `apps/web/src/modules/part-studio/types.ts`、`stores/use-part-studio-store.ts`；公开树无对应类型 | 多文档/装配/图纸无身份；命令面分散；undo 所有权无宿主 |
| B10 | 批量 pick 不存在；面拾取逐面 RPC（`08` 记录 27 面约 50ms，数百面不可用） | `08` §4.4/§4.6；W7 | 大模型/装配选择预算不可达 |
| B11 | `BRepData` 目前只有 `brepType`，无 `format/kernel` 标签；facet 无 face/edge ID | `ADR-G0-05`、`G0-GATE-REPORT` S0-11；`08` §4.6 | 混合后端不可诊断；tile/BVH 未来要重 facet |
| B12 | 契约版本：`LubanFeatureRpcInterface 1.85.0`，`@luban-cad/shared` 包版本 1.0.0；无运行时握手 | `INTERFACE-FREEZE-MATRIX.md`、`contract-freeze.json`、`EXCEPTIONS.md` X-11 | 源码/产物/客户端版本可漂移；发布门只覆盖部分表面 |

> 以上是**审计事实**，不是完成状态。表中任何一项修复后，必须用同 PR 的测试/证据更新
> 本表或对应 ADR；不得用“计划中”覆盖事实。

---

## 4. 最小契约集（C1–C8）

“最小”指：不冻结这些，后续每加特征/工作区/多输出都要改承重假设；不表示 G2 要交付全部
运行时实现。每项只冻结**信封/语义/版本/兼容**，内部执行器与 UI 可后置。

| ID | 契约 | 为什么属于最小集 | 冻结形态 | 明确不在本契约内 | Owner |
|---|---|---|---|---|---|
| **C1** | Feature Manifest + `paramVersion` + 生成/校验产物 + 运行时握手 | 停止 9+ 手写面漂移；为 inputs/outputs、DSL、AI、表单提供唯一来源 | 机器可读 manifest schema、21 类型覆盖、`paramVersion`、生成的类型/zod/registry 元数据/opDsl/form/capability/AI spec、manifest hash | 完整表单 widget、后端求值器重写、DAG | Feature/Contract |
| **C2** | Feature input/output 端口信封 | 单输出假设必须停止；split/mirror/pattern 多输出需要可声明的信封 | `inputs[] {role,source,required,multiplicity}`、`outputs[] {portId,kind,cardinality}`、结构键、`main` legacy 端口、`{featureId,portId}` 下游引用 | 完整 DAG 执行器、`FeatureRow` 持久布局、拓扑 ID 生成算法 | Feature/Kernel |
| **C3** | `TopologyRef` + `SelectionRef` + `SelectionDomain` 信封 | 选择/拓扑身份是多 body、装配、图纸、历史编辑的共同前置 | 文档/工作区/body/拓扑/顶点字段；持久 id 或显式 unsupported；选择域接口；旧 `CanvasSelection` 投影 | 装配 occurrence 实现、图纸标注、第二选择权威 | Frontend/Feature |
| **C4** | `DocumentRef`/`WorkspaceRef.kind`/`LubanTab`/`TabDirectory`/`listTabs` | tab 不能再靠 UserLabel 前缀；Assembly/Drawing 需要统一发现 | typed tab（partStudio/assembly/drawing/variableStudio/imported/derived）、`listTabs` additive、legacy 合成、旧 URL 默认 | Assembly/Drawing 功能实现、WorkspaceModule 完整生命周期、schema 大迁移 | Workspace |
| **C5** | `DocumentSessionHost` + per-session store + `CommandRegistry` | 单例 store/连接/命令面无法支撑多文档、多会话、AI 工具 | session key、连接/RPC token、store 工厂、命令单一注册面、旧 if/else 适配器 | 多文档 UI、process-per-doc 生产化、Assembly 工作区 | Frontend/Session |
| **C6** | 操作组与 undo 所有权 | 两套 undo/无作者过滤会阻断多会话与 AI 撤销 | `operationGroupId`、author、invertible、changesetId；per-session 过滤；单一用户可见栈 | per-user 多会话 undo、实时 op 流、新 undo 服务 | Frontend/Session |
| **C7** | `TopologySnapshot`/`PickBatch` 只读 DTO | 批量 pick 是多 body/装配/大模型的性能前置 | 批量拓扑/拾取请求响应、`geometryGuid/revision`、face/edge ID 可选、缓存失效 | GPU pick、装配 transform、BVH 具体实现、tile 格式 | Kernel/Frontend |
| **C8** | `BRepData` `format/kernel` 标签 | 内核/格式不可诊断；TrueForm/旧库迁移必须先有数据面标签 | additive 标签；缺省=legacy ACIS；未知/混合 fail-closed；写入/读取状态可查询 | TrueForm 生产接线、SAB 迁移、最终内核枚举 | Kernel/Native |

### 4.1 版本锚点

| 契约 | 版本锚点 | 变更门 |
|---|---|---|
| C1 | manifest hash + `paramVersion` + shared `interfaceVersion` | manifest 变更必须生成 diff；opDsl/类型/表单全等；双端同发布 |
| C2 | Feature RPC `interfaceVersion` + output envelope schema | 新增端口/输入角色 bump；旧行合成 `main`；下游只读端口键 |
| C3 | shared DTO + `TopologyRef`/`SelectionRef` schemaVersion | 新增字段 additive；旧裸引用降级规则；跨 body fail-closed |
| C4 | `LubanIpcInterface`/Feature RPC 版本 + `listTabs` DTO | 新 tab 类型 additive；旧 URL/旧文档默认 partStudio；不改旧 id |
| C5/C6 | session/command DTO + operation group 元数据 | 默认 off/shadow；enforce 才改变行为；不新增第二状态机 |
| C7 | TopologySnapshot/PickBatch DTO 版本 + geometry revision | 只读 additive；缓存键必须含 revision；旧逐面路径保留 |
| C8 | BRepData tag + native 协议版本 | 缺省 legacy ACIS；未知 fail-closed；旧 fixture 双读 |

---

## 5. 冻结顺序

冻结顺序按“先停止漂移、再固定身份、再固定图/选择、最后固定宿主与读取面”排列。
**顺序不可倒置**：没有 Manifest 就无法生成统一 inputs/outputs；没有 typed tab 就无法给
session host 稳定的 workspace 键；没有 G1 会话隔离就不能冻结 undo 所有权。

### 阶段 0：契约治理（Pre-freeze 内）

- 建立 G2 契约登记（本文件 §4 为内容来源，不修改 README/index/registers）。
- 每个契约指定 owner、消费者、版本锚点、失败判据、回滚开关。
- 冻结“未知值 fail-closed、旧值 additive、无双写”的三条总则。
- **出口**：C1–C8 有 owner 与证据计划；ARB 受理。

### 阶段 1：C1 Feature Manifest

**入口**：G1 契约门可运行；21 类型清单确认；manifest schema 草案。

**冻结**：
- manifest 字段（type/paramVersion/paramsSchema/formSchema/inputs/outputs/structuralKeys/
  evaluatorKey/preview/risk/hitl/toolSpec/aiSpec/capability/i18nKey/tests）；
- 生成产物：TS 类型、zod、registry 元数据、opDsl 白名单、formSchema、ribbon/capability、
  AI tool spec；
- `paramsVersion`：缺省 legacy 1，新写必带，未知 fail-closed；
- `draft` 进入 opDsl；`shared` 契约文件 strict；运行时握手。

**出口证据**：S-G2-01 通过；21/21 DSL 往返；`draft` 可用；strict 编译；生成 diff 0；
新增类型只改 manifest + evaluator（试点至少 1 个类型）。

**回滚**：`FEATURE_MANIFEST_MODE=off` 恢复旧手写产物；生成物不删除；旧 params 无版本按
legacy 读；不批量改写数据。

### 阶段 2：C4 Typed Tab/Workspace 身份

**入口**：C1 冻结（或至少 manifest 字段稳定）；G1 D5 版本打开语义可用/明确 conditional；
旧文档 fixture 可取。

**冻结**：
- `DocumentRef`/`WorkspaceRef {kind,tabId,versionRef?}`；
- `LubanTab`/`TabDirectory`/`listTabs` additive DTO；
- legacy `UserLabel` 合成规则；`listPartStudios` 保留为过滤视图；
- `WorkspaceModule` 注册契约（stub 编译，不实现 Assembly/Drawing）；
- 旧 URL 缺省 `kind=partStudio`；tab/state 键含 document+workspace。

**出口证据**：S-G2-03 通过；旧文档双读；旧 URL 同 scope；stub tab 不改 Part Studio；
新 tab 类型可声明但不可写/不泄露。

**回滚**：`TYPED_TABS_MODE=off|dual|enforce`；off 回到 `listPartStudios` + UserLabel；
不删除旧标签；不回写旧文档。

### 阶段 3：C2 输出端口 + C3 拓扑/选择引用

**入口**：C1 的 inputs/outputs 字段已冻结；C4 的 workspace 键稳定；S-G2-02/S-G2-04 可跑。

**冻结**：
- `outputs[]`/`inputs[]`/结构键/`{featureId,portId}`；旧单输出合成 `main`；
- `TopologyRef`/`SelectionRef`/`SelectionDomain`；body/workspace 限定；顶点策略；
- fail-closed 规则；旧 `CanvasSelection` 只做投影；
- **不冻结**完整 DAG、FeatureRow 持久布局、拓扑 ID 算法。

**出口证据**：S-G2-02 通过（split/mirror 两端口下游可消费）；S-G2-04 通过（交叉 body/
插入删除不静默错命中）；旧单输出零回归；选择唯一权威。

**回滚**：`FEATURE_GRAPH_ENVELOPE=off|shadow|enforce`；旧路径按单输出/裸 id 读；
新字段 additive；不批量重写 params/FeatureTreeEntry；旧引用歧义时要求重新拾取。

### 阶段 4：C5 DocumentSessionHost + C6 命令/undo 所有权

**入口**：G1 C1/C2/C3 会话隔离与 S0-1 双用户证据；G1 B2.2 归因；D0-10 操作组 ADR；
C4 的 tab/workspace 键稳定。

**冻结**：
- session key、连接/RPC token、per-session store 工厂；
- `CommandRegistry` 单一命令源（ribbon/palette/keymap/capability/AI spec）；
- 操作组元数据与 per-session undo 过滤；单一用户可见 undo 栈；
- 旧单例 adapter 保留。

**出口证据**：S-G2-05 shadow 通过；G1 双会话/undo 证据；命令一处注册五处出现；
旧页面零回归；无第二选择/第二 undo。

**回滚**：`SESSION_HOST_MODE=off|shadow|enforce`、`COMMAND_REGISTRY_MODE=off|shadow|enforce`、
`UNIFIED_UNDO_MODE=off|shadow|enforce`；off 回旧单例/旧命令/旧 undo；组元数据保留但不消费。

### 阶段 5：C7 批量读取 + C8 格式标签

**入口**：C3 拓扑身份稳定；C2 输出端口稳定；native/旧 fixture 可用。

**冻结**：
- `TopologySnapshot`/`PickBatch` 只读 DTO、`geometryGuid/revision`、缓存失效；
- `BRepData format/kernel` additive 标签；缺省 legacy ACIS；未知 fail-closed；
- facet face/edge ID 预留（可选，不要求 tile 立即消费）。

**出口证据**：S-G2-04 批量 pick 在预算内；S-G2-06 旧 fixture 加标签后仍可读/可重建；
500 面/大模型预算；无逐面 IPC 风暴；tile 测试（如适用）。

**回滚**：批量路径默认 off/旧逐面路径保留；标签缺失按 legacy ACIS；不重写旧几何字节；
未知标签拒绝而不是猜测。

---

## 6. 兼容与迁移策略

### 6.1 总则

1. **Additive**：所有新字段可选、有缺省；未知键由旧代码可忽略；删除/改义必须 major + 迁移。
2. **Dual-read**：旧文档/旧 URL/旧 params/旧引用在 shadow/dual 模式下同时可读；禁止只支持新格式。
3. **Fail-closed**：未知 `paramsVersion`、未知 tab kind、未知格式标签、跨 body 裸引用、
   未 ready 版本、未实现工作区一律稳定拒绝，不静默回退。
4. **No dual source**：不把同一语义同时写入 `params` 与 native geometry；不把 tab 元数据
   塞进 Part Studio JsonProperties 作为第二事实源。
5. **No bulk rewrite**：G2 不做全量迁移；旧数据在读取时适配，写入时按新契约；迁移 CLI
   只做 dry-run/verify/rollback，默认不执行。
6. **Paired release**：shared → backend → web 同批；manifest hash/interfaceVersion 对齐；
   运行时握手；禁止 npm registry 替换 `link:`。
7. **Evidence**：每个迁移规则至少一个旧 fixture + 一个新写入 fixture；失败注入覆盖
   “未知版本/未知类型/跨 body/缺标签”。

### 6.2 逐契约兼容表

| 契约 | 旧行为 | 新行为 | 迁移 | 回滚 |
|---|---|---|---|---|
| C1 Manifest | 手写 union/zod/opDsl/form/capability | manifest 生成/校验；21/21；`draft` 可用 | 旧 params 无版本=legacy 1；新写带版本；逐类型迁移；不批量改写 | `FEATURE_MANIFEST_MODE=off`；保留生成物但不消费 |
| C2 输出端口 | 单输出；下游读“唯一源” | `main` 端口 + 多输出信封；下游引用端口 | 旧行合成 `main`；旧特征不重写；新特征声明 outputs | 关闭信封开关；旧单输出路径保留 |
| C3 拓扑/选择 | 裸 `{nodeId,entityId}`；`CanvasSelection` | `TopologyRef` body/workspace 限定；`SelectionRef`；选择域 | 旧引用仅在单 body 可解释；多 body 歧义要求重新拾取；不批量重写 | 旧裸引用路径保留；歧义 fail-closed |
| C4 Typed tab | UserLabel 前缀 + `listPartStudios` | `LubanTab`/`listTabs` + legacy 合成 | 旧文档不迁移；旧 URL 默认 partStudio；`listPartStudios` 过滤视图 | `TYPED_TABS_MODE=off` 回到旧发现 |
| C5 Session host | 单例 store/连接/视口 | `DocumentSessionHost` + store 工厂 | 旧页面用 adapter；默认 off/shadow；不改变单文档 | `SESSION_HOST_MODE=off` |
| C6 Command/undo | 分散命令面；两套 undo | 单一命令源；操作组 + 会话所有权 | 旧 if/else/ribbon 保留为 adapter；组元数据 additive；旧 OpLog 无 author 按 legacy | `COMMAND_REGISTRY_MODE=off`、`UNIFIED_UNDO_MODE=off`；不删除旧栈 |
| C7 Batch pick | 逐面 RPC | 只读批量 DTO + revision 缓存 | 旧路径保留；批量默认 off；无数据迁移 | 关闭批量；回到逐面 |
| C8 Format tag | 无标签；按 ACIS 解释 | 标签；缺省 legacy ACIS；未知 fail-closed | 旧几何不重写；读时报告 legacy/absent | 移除标签消费；仍按 legacy ACIS 读 |

### 6.3 旧 fixture 矩阵（冻结前必须存在）

| Fixture | 覆盖 | 期望 |
|---|---|---|
| F-LEGACY-PS | 旧 `.bim`，仅 `LubanFeaturePartition` 标签，多个 Part Studio | `listTabs` 合成 partStudio；id/order/name 与 `listPartStudios` 一致；旧 URL 同 scope |
| F-LEGACY-PARAMS | 无 `paramsVersion` 的旧特征 params | 按 legacy 1 读；写新版本可；未知高版本拒绝 |
| F-LEGACY-DSL | 旧 20 类型 DSL 文本 | 逐字往返；`draft` 新增可解析；未知类型拒绝 |
| F-MULTI-BODY | 两个同构 body + 交叉 edge/face 引用 | 旧裸引用不得跨 body 静默命中；新 ref 限定 body |
| F-INSERT-DELETE | 中间插入/删除改变拓扑 | 新 ref 正确或 fail-closed；无静默错命中 |
| F-LEGACY-GEOM | 无 format/kernel 标签的几何 stream | 按 legacy ACIS 读；标签写入后可诊断；未知标签拒绝 |
| F-OLD-URL | 无 `?model=`/无 kind 的旧 URL | 默认 partStudio；不要求迁移 |

> 含客户数据的 fixture 只放私有受控目录；公开仓只记录 manifest/hash/脱敏结论。

---

## 7. 非目标（明确不做）

以下内容**不在 G2 预冻结/冻结范围**；做了就是越过 Gate：

1. 完整 DAG 执行器、图调度、中间插入/删除/回滚实现。
2. `FeatureRow` 新持久布局（`graphVersion/inputsJson/outputsJson` 的数据库/schema 落地）。
3. 拓扑 ID 生成算法、几何回退算法、顶点持久 id 的完整实现。
4. `WorkspaceModule` 完整生命周期、Assembly/Drawing/Variable Studio 功能。
5. FormRuntime 完整 widget API、表单 UI 替换、条件字段/单位/枚举全实现。
6. Batch-pick transport/BVH/GPU pick、tile 格式重构。
7. 最终内核枚举、TrueForm 接线、SAB 迁移。
8. 多文档 UI、分屏、多视口、实时协同、presence、评论。
9. 多用户生产、对外分享、SLA、DR/HA、多租户。
10. 新增 FeatureType、草图工具、UI 功能波次。
11. 删除 `UserLabel` 兼容路径、删除旧 `CanvasSelection`、删除旧 undo、删除旧 RPC。
12. 任何“G2 已冻结/G1 已通过/生产可用/Onshape 全量”的对外表述。

---

## 8. 验收证据清单

| ID | 证据 | 等级 | 当前状态 | 关联 |
|---|---|---|---|---|
| E-G2-01 | Manifest dry-run：21/21 类型；opDsl 21/21；`draft` 可解析；strict 编译；生成 diff 0 | L1+L2 | **Not run** | C1 / S-G2-01 |
| E-G2-02 | 新增一个 FeatureType 只改 manifest + evaluator（≤3 注册点）；旧类型零回归 | L1+L3 | **Not run** | C1 / AF2 |
| E-G2-03 | split 双侧 + mirror 新体：两端输出被下游消费；冷重开一致；一 body 一生产者 | L3 | **Not run** | C2 / S-G2-02 |
| E-G2-04 | 交叉 body 引用、插入/删除、重复 body：不静默错命中；歧义 fail-closed | L3 | **Not run** | C3 / S-G2-04 |
| E-G2-05 | 旧文档 typed tab 双读：字节/树/URL 零回归；`listPartStudios` 过滤视图一致 | L2+L3 | **Not run** | C4 / S-G2-03 |
| E-G2-06 | 两个 session 上下文：store/连接/命令/undo 隔离；命令一处注册五处出现 | L3/L4 | **Not run** | C5/C6 / S-G2-05 |
| E-G2-07 | 批量 pick/topology：500 面 p95 预算、单次 IPC、无逐面风暴 | L3 | **Not run** | C7 / S-G2-04 |
| E-G2-08 | 旧几何无标签按 legacy ACIS 读；未知标签 fail-closed；标签写入/读回可诊断 | L2+L3 | **Not run** | C8 / S-G2-06 |
| E-G2-09 | CI 门：manifest/strict/opDsl/契约 hash/生成物漂移阻断 | L1 | **Not run** | C1/C4 |
| E-G2-10 | 失败/回滚演练：开关关回旧路径；旧数据仍可读；无批量改写 | L2+L3 | **Not run** | 全部 |
| E-G2-11 | 负例：未知 `paramsVersion`、未知 tab kind、跨 body 裸引用、未知格式、未 ready 版本 | L1–L4 | **Not run** | 全部 |

> 上述“Not run”是事实；不得用设计文档、单元桩、私有 canary 或“本地可过”替代。
> Spike 通过后才可把对应项改为 PASS；ARB 签字后才可把契约改为 Frozen。

### 8.1 冻结候选的 Definition of Done

- [ ] C1–C8 每项有 owner、版本锚点、兼容表、失败判据、回滚。
- [ ] 至少 E-G2-01/03/04/05/06/08 通过；其余有明确条件/延期。
- [ ] `G2-SPIKES-2026-11-24.md` 每个 Spike 有 PASS/FAIL/STOP/DEFERRED 结论。
- [ ] 旧 fixture 矩阵可执行，证据脱敏。
- [ ] CI 阻断新增手写注册点、opDsl 漏类型、未知版本、跨 body 裸引用。
- [ ] G1 的会话/身份/账本/版本/CI 前置已通过或有 ARB 明确 conditional。
- [ ] ADR-G2-01..04 经 ARB 签字；未签字只能保持 Proposed。
- [ ] 没有新增依赖未冻结契约的功能。

---

## 9. 与 G2 Gate 的映射

`10-ARCHITECTURE-HARDENING-PLAN.md` §5 的 G2 验收项映射到本计划：

| G2 Gate 项 | 本计划契约 | 当前状态 |
|---|---|---|
| Manifest 覆盖 21 类型；opDsl/typecheck 全绿 | C1 | Not met |
| 新特征 ≤3 注册点 | C1 | Not met（9+） |
| FormRuntime 试点对拍 | C1（formSchema） | Not met |
| 输出端口/多输出 spike；拓扑带 body/scope | C2/C3 | Not met（Not run） |
| typed Tab/TabDirectory/listTabs 兼容旧文档 | C4 | Not met |
| SelectionRef document/occurrence/vertex；双会话状态隔离 | C3/C5 | Not met |
| CommandRegistry 一处注册五处出现 | C5 | Not met |
| 批量 TopologySnapshot/PickBatch 预算；BRep→tile 测试绿 | C7 | Not met |
| format/kernel 标签、facet ID 预留、精确质量属性 | C8 | Not met |
| interface-freeze/op 枚举/ctest CI 全绿 | C1/C4 | Not met |

**结论**：G2 Gate **未通过**；本计划只提供预冻结输入。任何“G2 已冻结”的表述都违反
`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md` §7 与 `G0-GATE-REPORT-2026-11-24.md` §7。

---

## 10. 关键决策与风险

### 10.1 需 ARB 明确裁决

| ID | 决策 | 选项 | 建议 | 失败判据 |
|---|---|---|---|---|
| D-G2-1 | Manifest 的单一来源形态 | manifest JSON + 生成器 / zod 反射 / 手写 + CI 校验 | manifest JSON + 生成器（可先 dry-run） | 仍有多份手写事实源；生成物不能编译 |
| D-G2-2 | 输出端口最小语义 | 仅声明信封 / 完整 DAG / 保持单输出 | 只冻结信封 + `main` legacy；DAG 后置 | 继续新增单输出特征；端口无法被下游消费 |
| D-G2-3 | 拓扑引用强制限定 | 裸 id + 几何回退 / body+workspace 限定 / 顶点暂不支持 | body+workspace 限定；顶点显式 unsupported 或持久 id | 多 body 静默错命中；旧裸引用跨 body 可用 |
| D-G2-4 | Tab 身份与版本引用 | 继续 UserLabel / typed tab + legacy 合成 / 独立 iModel | typed tab + 双读；versionRef 依赖 G1 D5 | 每加工作区改 Part Studio；旧文档回归 |
| D-G2-5 | Session/command/undo 所有权 | 保持单例 / DocumentSessionHost + CommandRegistry + 操作组 / 立即 process-per-doc | 先 shadow 契约；生产宿主后置 | 多会话状态串扰；两套 undo；命令五处分叉 |
| D-G2-6 | 批量 pick 与格式标签 | 继续逐面 / 只读批量 DTO / 完整 BVH+GPU | 先冻结只读 DTO + tag；实现后置 | 500 面预算不可达；混合后端不可诊断 |
| D-G2-7 | 兼容窗口 | 一次性迁移 / additive 双读 N-1 / 永久保留旧路径 | additive 双读 + N-1；旧路径有退出计划 | 旧库打不开；要求全量重写 |

### 10.2 Top risks

1. **在 Manifest 未冻结前继续加特征**：每个特征加深 9+ 注册点与单输出假设；这是 08 明确
   的最危险组合。
2. **把端口信封误当 DAG 已完成**：只声明 outputs 而不改执行器，会在 split/mirror 下游
   消费时暴露；必须用 S-G2-02 证伪。
3. **拓扑引用仍裸 id**：插入/删除/多 body 后静默命中错误边/面，属于数据正确性风险；
   不是 UI 能补。
4. **typed tab 只改 UI 不改身份**：继续用 UserLabel 前缀，Assembly/Drawing 接入时再次
   返工；旧文档合成规则必须真栈验证。
5. **Session/Command/Undo 绕过 G1**：在会话隔离/归因未通过时冻结所有权，会把串话/越权
   写进契约；必须等 G1 C1/C2/C3 + B2.2。
6. **兼容性只靠“只加可选字段”**：没有旧 fixture/未知值 fail-closed/回滚，会在旧库冷开
   或回滚时暴露。
7. **把 Pre-freeze 写成 Frozen**：状态造假，会误导 G3/G4；本文件与 ADR 均不得被引用为
   Gate 通过证据。

### 10.3 回滚触发条件

出现以下任一情况，停止冻结、回退到上一 shadow/off 状态并登记：

- 旧文档/旧 URL/旧 params 任一 fixture 回归；
- 跨 body 引用静默命中错误拓扑；
- 生成物与手写产物不一致或 strict 编译失败；
- unknown version/tag/kind 被静默接受；
- 两 session 状态/命令/undo 串扰；
- 批量 pick 预算不达标且旧路径不可保留；
- G1 前置被撤销或 Gate 退回。

---

## 11. 关联文档

- 事实与目标：`../research/lubancad-architecture-assessment/08-ARCHITECTURE-EXTENSIBILITY.md`、
  `09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`。
- 程序与状态：`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`、`G0-GATE-REPORT-2026-11-24.md`、
  `G1-EXECUTION-PLAN.md`、`G1-WAVE2-STATUS-2026-11-23.md`。
- 契约与例外：`INTERFACE-FREEZE-MATRIX.md`、`contract-freeze.json`、`EXCEPTIONS.md`、
  `ADR-G0-05`、`ADR-G0-10`、`ADR-G0-15`、`ADR-G0-16`。
- 本包：`G2-SPIKES-2026-11-24.md`、`ADR-G2-01-feature-manifest.md`、
  `ADR-G2-02-output-topology-selection.md`、`ADR-G2-03-typed-workspace-tabs.md`、
  `ADR-G2-04-session-command-undo-ownership.md`。
