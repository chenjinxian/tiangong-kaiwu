# ADR-G2-02：输出端口、拓扑引用与选择身份

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C2/C3/C7/C8、
> `G2-SPIKES-2026-11-24.md` S-G2-02/S-G2-04/S-G2-06、
> `08-ARCHITECTURE-EXTENSIBILITY.md` §4.2/§4.4/§4.6、
> `09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §7.2/§7.3/§8/§9、
> `10-ARCHITECTURE-HARDENING-PLAN.md` WS-F/WS-G/WS-H、
> `ADR-G0-05-geometry-persistence-trueform.md`、`ADR-G0-10-undo-granularity.md`、
> `G0-GATE-REPORT-2026-11-24.md` S0-6/7/8/9/11、`EXCEPTIONS.md` X-07/X-12。
> 影响面：FeatureOp/FeatureTreeEntry、后端 evaluator/输出缓存、拓扑引用与拾取、
> 选择状态、批量读取、`BRepData`/geometry stream、旧库兼容。
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **单输出/线性链是当前应用层限制。** `FeatureTreeEntry` 只有
   `{id,featureType,orderKey,suppressed,status,params,name?}`，没有 inputs/outputs/
   dependency edges；输出缓存一个 featureId 一份平铺 entries；异步 evaluator 签名只能
   返回一份；`writeBodyFromCache` 要求恰 1 条 BRep。多目标 REMOVE fillet 的
   `multiBodyOutputCache` 是终态，下游 `upstreamEntriesFromCache` 直接拒绝。
2. **split/mirror/pattern 的多输出目前不可被下游消费。** 这不是 UI 问题，而是执行器/
   写回契约问题；如果继续加“只支持单 body 输出”的特征，未来每个分支都要二次迁移。
3. **拓扑引用是裸 `{nodeId,entityId}`。** `LubanTopologyId` 只有这两个字段；
   `FilletEdgeRef.bodyKey` 可选；单目标 fillet/chamfer 在 carrier 上直接按 id 寻址；
   顶点无持久 id；内核 ID 是创建顺序+分裂继承，没有几何回退。插入/删除/多 body 后，
   旧引用可能不存在（status=1），也可能被新拓扑复用而**静默命中另一条边/面**。
4. **选择身份是 `ownerBodyKey + topologyId`。** `CanvasSelection` 有 `ownerBodyKey?`/
   `topologyId?`/`cacheId?`，但没有 document/workspace/occurrence；`cacheId` 只在工具
   活跃期有效；同时存在 store 选择、SelectionSet、树选择、工具内部选择四套表示。
   公开树没有 `SelectionRef`/`SelectionDomain`。
5. **批量 pick 不存在。** 面拾取逐面 IPC；`08` 记录 27 面约 50ms，数百面不可用；
   `S0-8` 仍是 NOT RUN/DEFERRED。大模型/装配的选择预算没有通道。
6. **`BRepData` 只有 `brepType`，无 `format/kernel` 标签。** 生产几何是 ACIS SAB；
   无标签则混合后端/旧库/迁移来源不可诊断；`S0-11` 未跑，TrueForm M0 未接线。
7. **G2 不需要完整 DAG 才能停止单输出假设。** iTwin EDE 本身可存 DAG；当前限制在
   LubanCAD 的 planner/evaluator/UI。G2 只冻结输入/输出信封、拓扑/选择身份与读取 DTO，
   完整执行器/历史编辑后置。

---

## 2. 决策

### 2.1 输出端口与输入角色

1. **FeatureManifest 声明 `inputs[]` 与 `outputs[]`**（与 ADR-G2-01 对齐）：
   - `inputs[]` 至少含 `role`（target/tool/profile/path/source/plane/...）、
     `source`（feature/sketch/body/port/ref）、`required`、`multiplicity`。
   - `outputs[]` 至少含 `portId`、`kind`（body/sheet/curve/plane/...）、`cardinality`。
2. **一个 body 仍只允许一个 active 生产者输出**；一个特征可以有 N 个 outputs。
   这样 split 双侧、mirror 新体、pattern 多 body、boolean keep tools 可共享同一信封，
   而不需要每个特征写专用写回。
3. **下游引用 `{featureId, portId}`**，不得再以“目标 body 当前唯一源”隐式寻址；
   结构键（目标 body、源特征、草图、面/边引用、boolean targets/tools）必须显式，
   不允许 evaluator 绕过依赖图读缓存。
4. **`orderKey` 只作显示/tie-break**；依赖关系由 inputs/outputs 表达；G2 不冻结
   `FeatureRow` 的持久布局（不要求 `graphVersion/inputsJson/outputsJson` 落库）。
5. **旧行合成 `main` 端口**：没有 outputs 的旧特征，读取时按“单输出 body”合成
   `{portId:"main", kind:"body"}`；旧行不需要重写；旧下游路径保持可用。
6. **G2 不实现完整 DAG 执行器**：允许声明/校验/旧行适配与一个两端口 spike；中间插入/
   删除/重排/回滚执行器在 G3/G4 另行 ADR，不得在本 ADR 下偷偷实现。
7. **失败语义**：端口缺失、端口重复、下游引用不存在的 port、一个 body 多个生产者、
   跨 scope 引用，必须 fail-closed；不得回退到“唯一源”猜测。

### 2.2 `TopologyRef`：body/workspace 限定与持久身份

1. **目标形态**：
   - `TopologyRef { documentRef, workspaceRef, bodyKey, persistentId, sessionId? }`；
     面/边/顶点都必须在 body/workspace 限定下解析。
   - `persistentId` 是内核/应用可验证的持久 id（或显式 unsupported）；`sessionId` 只作
     会话内缓存/诊断，不得作为持久身份。
2. **bodyKey 必填**：凡 body 拥有的面/边，新引用必须带 `bodyKey`；旧裸 `{nodeId,
   entityId}` 只在**单 body 且无歧义**的旧文档中可解释。多 body/跨 scope 的裸引用
   **fail-closed**，要求重新拾取。
3. **顶点策略**：若当前内核无持久顶点 id，必须显式返回 `unsupported`/要求重新拾取；
   不得用坐标/顺序巧合冒充持久身份。未来补 `resolveVertexRef` 时必须走独立契约/测试。
4. **物理回退**：允许几何回退/查询命名作为**显式**解析策略，但只能在带 body/workspace
   的引用上使用；回退结果必须可诊断（resolved-by-geometry/ambiguous/not-found），
   不得静默命中；无法判定时 fail-closed。
5. **插入/删除/分裂**：引用解析要么命中同一拓扑实体，要么稳定失败；不得“status=1 但
   实际改了另一条边/面”。这要求持久 id/版本或显式失效，不接受“先跑跑看”。

### 2.3 `SelectionRef` 与 `SelectionDomain`

1. **目标形态**：
   - `SelectionRef { documentRef, workspaceRef, occurrencePath[], bodyKey?, topologyRef?,
     vertexRef? }`；Part Studio 只填 document/workspace/body/topology，`occurrencePath`
     为空数组；装配以后填 occurrence；图纸用独立域。
   - `SelectionDomain` 接口负责 `replace/clear/projectToSelectionSet/getPrimary` 等；
     Part Studio 先适配；Assembly/Drawing 以后各自适配，不复制四套全局表示。
2. **单一权威**：Part Studio 的选择权威仍是 `store.canvas.selection`；旧
   `CanvasSelection` 只作为 `SelectionRef` 的展示/兼容投影；`connection.selectionSet`
   仍只经 `internal/selection-authority.ts` 单向投影。不得出现第二选择状态机。
3. **cacheId 不是身份**：`cacheId` 只用于工具活跃期的 native 删除/编辑；不能进入持久
   引用、不能跨工具/冷重开使用；缺失时要求重新拾取。
4. **旧选择兼容**：旧 `CanvasSelection` 字段保留；读取时投影为 `SelectionRef`（缺
   document/workspace 时由当前 workspace 上下文补齐，仅限单文档旧路径）；歧义/多 body
   时 fail-closed。删除旧字段必须等 N-1 兼容窗口与新证据。
5. **选择域与 session**：每 session 一个选择域实例（见 ADR-G2-04），不得共享模块单例；
   `SelectionSet` 投影只做显示，不成为第二事实源。

### 2.4 批量 `TopologySnapshot`/`PickBatch`

1. **只读 DTO**：`TopologySnapshot` 一次返回 body/face/edge/vertex + persistentId/
   sessionId/range/邻接/曲线等；`PickBatch` 接收 ray + 候选 + revision/transform，返回
   排序命中；不写事务、不触发 rebuild、不占用 Editor 命令槽。
2. **缓存键**：必须含 `geometryGuid/revision` 与 workspace/body；几何变更后失效；
   不得只按 elementId 缓存。
3. **预算**：500 面 hover/选择在目标预算内（具体 p50/p95 由 G2 Spike 记录）；旧逐面
   路径保留为 fallback，批量默认 off/shadow，直到达标。
4. **边界**：G2 只冻结 DTO/失败语义；BVH/GPU pick/tile 格式后置；批量 pick 不改变
   选择权威，也不替代 `SelectionDomain`。

### 2.5 `BRepData` `format/kernel` 标签

1. **additive 标签**：几何持久化数据（geometry stream / `BRepData` 投影）增加
   `format/kernel`；`params` 只表达设计意图，不存几何格式。
2. **缺省语义**：没有标签的既有几何按 **legacy ACIS** 解释，读取面报告
   `legacy/absent`；这不是“已验证”，只是兼容默认。
3. **未知/混合 fail-closed**：未知标签、混合标签、后端不支持的组合不得静默按 ACIS
   解析；写入/重建必须拒绝并给出稳定错误。
4. **旧数据不重写**：G2 不批量改写旧几何字节；标签随新写入/迁移产生；旧 fixture 必须
   验证“无标签可读/可重建/可回滚”。
5. **facet ID 预留**：`FacetEntity` 预留可选 face/edge ID（tile 可后置消费）；本 ADR
   只冻结“预留”而非强制 tile 格式变更；不得等装配/GPU pick 再重 facet。
6. **与 ADR-G0-05 对齐**：本标签不是 TrueForm 启动许可；TrueForm M1 仍需 SAB 策略、
   双后端一致性、迁移/回滚、provenance、许可与 ARB 签字。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 保持单输出/线性 `orderKey`，每个多输出特征写专用写回 | **拒绝**：每个 split/mirror/pattern 分支都要二次迁移；下游无法消费，功能是假多输出。 |
| B | 立即实现完整 DAG 执行器 + 多输出 + 历史编辑 | **拒绝（G2）**：范围过大，且 G1 未通过；G2 只需冻结信封/身份，避免固化错误假设。 |
| C | 只加 `targetBodyIds`/多目标字段，不声明 outputs | **拒绝**：多目标终态仍不能被下游消费；输入/输出角色仍隐式；split 双侧无法表达。 |
| D | 继续裸 `{nodeId,entityId}`，靠几何回退兜底 | **拒绝**：多 body/插入/删除会静默错命中；回退无法判定时应 fail-closed，不能作为默认。 |
| E | 选择身份继续 `ownerBodyKey+topologyId`，装配时再加 occurrence | **拒绝**：装配/多文档/图纸会重写所有工具与对话框；现在加字段成本最低。 |
| F | 批量 pick 直接做 GPU/BVH，不冻结 DTO | **拒绝**：传输/缓存/失败语义未定会返工；先冻结只读 DTO 与 revision，实现可后置。 |
| G | `format/kernel` 标签放进 `params` | **拒绝**：`params` 是设计意图；导入/直改/派生几何不一定有对应 params；标签必须跟随几何数据。 |
| H | 未知标签静默按 ACIS 读 | **拒绝**：fail-open，可能把非 ACIS 字节当 SAB 解析，属于数据损坏级风险。 |
| I | 本决策：信封 + body/workspace 限定 + SelectionRef/Domain + 只读批量 DTO + additive tag | **采用**：停止承重假设扩散，保留旧路径/回滚；完整执行器与批量实现后置。 |

---

## 4. 后果与风险

**正向**

- split 双侧、mirror 新体、pattern 多 body 有统一输出信封；下游可按 portId 消费，
  不再为每个特征写专用写回。
- 拓扑引用带 body/workspace，插入/删除/多 body 不再静默错命中；历史编辑/装配有身份基础。
- `SelectionRef`/`SelectionDomain` 为装配/图纸/多文档留接缝；选择仍单一权威。
- 批量 DTO 为大模型/装配选择提供预算通道；格式标签让混合后端可诊断。

**代价/风险**

- 输出端口/输入角色需要 evaluator/缓存/写回改造；G2 只冻结信封，执行器后置会有一段
  “契约已定、能力未全”的窗口，必须诚实标注。
- 旧裸引用在多 body 下会 fail-closed，用户需要重新拾取；这是一次性 UX 成本。
- 顶点持久 id 可能无法短期实现，必须显式 unsupported；不能假装支持。
- 批量 pick 的传输/BVH/预算未定；过早承诺大模型/装配可用会造假。
- `BRepData` 标签需要 native/schema/interface-freeze/旧 fixture 工作；不是零成本。
- 任何字段/语义变化都要双端发布与旧 fixture；不能靠“只加可选字段”自动安全。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **旧输出**：无 outputs 的旧特征读取时合成 `main` body 端口；旧下游仍按唯一源/旧缓存
   路径；不重写旧行；新特征声明 outputs。`FeatureTreeEntry` 的 inputs/outputs 是可选
   投影，不是强制持久布局。
2. **旧拓扑引用**：裸 `{nodeId,entityId}` 仅在单 body/无歧义旧文档可解释；多 body/跨
   scope 时 fail-closed 并要求重新拾取；不批量改写旧 params。新引用带 body/workspace/
   persistentId。
3. **旧选择**：`CanvasSelection` 保留；投影为 `SelectionRef` 时由当前 workspace 补齐
   document/workspace；`cacheId` 不迁移；旧选择入口不变。
4. **批量 pick**：默认 off/shadow，旧逐面路径保留；缓存键加 revision；不改变选择权威。
5. **格式标签**：旧无标签按 legacy ACIS；新写入带标签；不批量改写旧几何；旧 `.bim`
   fixture 必须双读。
6. **Fixture**：F-MULTI-BODY、F-INSERT-DELETE、F-LEGACY-GEOM（见计划 §6.3）必须
   通过；公开只放 manifest/hash 与脱敏结论。
7. **发布顺序**：shared DTO → backend evaluator/geometry → web selection/tree →
   native（tag）同批；版本 bump；interface-freeze/ctest/真栈回归。

### 5.2 回滚

1. `FEATURE_GRAPH_ENVELOPE=off|shadow|enforce`（建议名）：off 回到单输出/唯一源；
   已写入的 outputs/端口字段保留但不消费；旧行不删除。
2. `TOPOLOGY_REF_MODE=off|shadow|enforce`：off 按旧裸引用读；enforce 才强制 body/
   workspace；歧义引用在 shadow 只告警，enforce fail-closed。
3. `SELECTION_REF_MODE=off|shadow|enforce`：off 保留 `CanvasSelection` 为唯一面；
   shadow 投影；enforce 才要求 SelectionRef。不得同时存在两套写入权威。
4. `BATCH_PICK_MODE=off|shadow|enforce`：off 回到逐面；回滚不删除 DTO/缓存代码。
5. `BREP_FORMAT_TAG_MODE=off|shadow|enforce`：off 忽略标签按 legacy ACIS 读；回滚不
   删除已写入标签、不改写历史；未知标签在 enforce 下必须拒绝。
6. 回滚不删除旧字段/旧引用/旧几何；不得把“已失效引用”重新指向猜测的拓扑。

### 5.3 失败判据

- 下游仍不能消费第二端口；或第二端口解析到错误 body/静默复用旧缓存。
- 一个 body 出现多个 active 生产者输出；端口键重复/缺失。
- 跨 body 裸引用静默命中；插入/删除后 status=1 但改了另一条边/面；顶点用坐标冒充身份。
- 选择仍有多套权威/写路径；`SelectionDomain` 只是新壳，旧 store 仍被直接写。
- 批量 pick 超预算且旧路径不可保留；缓存不随 revision 失效。
- 旧无标签几何在新读取路径下不可读/几何变化；未知标签被按 ACIS 解析。
- S-G2-02/S-G2-04/S-G2-06 未通过就宣称输出/拓扑/选择/格式冻结。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 显式 inputs/outputs | **未实现** | `FeatureTreeEntry` 无字段；单输出/线性 |
| 多输出下游消费 | **Not run** | `multiBodyOutputCache` 终态；S-G2-02 未跑 |
| `TopologyRef` body/workspace | **未实现** | 当前 `LubanTopologyId {nodeId,entityId}` |
| 顶点持久 id | **未实现** | 无持久契约；不得宣称支持 |
| `SelectionRef`/`SelectionDomain` | **未实现** | 公开树无类型；`CanvasSelection` 为现状 |
| 批量 TopologySnapshot/PickBatch | **未实现** | 逐面 RPC；S-G2-04 批量项未跑 |
| `BRepData format/kernel` | **未实现** | 只有 `brepType`；S-G2-06 未跑 |
| 旧 fixture 双读 | **未执行** | F-MULTI-BODY/F-INSERT-DELETE/F-LEGACY-GEOM 未跑 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

> 本 ADR 不把“契约草案/Spike 设计/私有 canary”写成已实现或已通过。S-G2-02/04/06 未通过前，
> 不得宣称多输出、拓扑身份、选择域或格式标签已冻结。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G2 预冻结文档包，先契约后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Architecture owner | | | |
| Feature owner | | | |
| Kernel/native owner | | | |
| Frontend/selection owner | | | |
| QA/performance owner | | | |

## 8. 关联

- 计划：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C2/C3/C7/C8、阶段 3/5。
- Spike：`G2-SPIKES-2026-11-24.md` S-G2-02/S-G2-04/S-G2-06。
- ADR：`ADR-G2-01`（Manifest inputs/outputs）、`ADR-G2-03`（workspace/tab 身份）、
  `ADR-G0-05`（格式标签/TrueForm）、`ADR-G0-10`（操作组/undo）、`ADR-G0-15`（迁移）。
- 其他：`EXCEPTIONS.md` X-07/X-12、`G0-SPIKE-REGISTER.md` S0-6/7/8/9/11。
- 未决：输出端口的最终枚举、一个特征多输出的执行器边界、顶点持久 id 的实现、
  几何回退的允许范围、批量 pick 的传输/预算、facet ID 的 tile 消费格式。
