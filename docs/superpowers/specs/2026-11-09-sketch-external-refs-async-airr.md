# AIRR：草图外部实体引用（实体边/面投影）异步预求值快照 — ADR-0009 切片 1b

- 状态：**提议 / 未批准（2026-11-09）**。本文件是设计门禁材料，不是实现、不是绿例；
  **未批准前不写产品代码**（P0-04）。
- 日期：2026-11-09
- Owner：用户（待签字）
- 关联需求：ADR-0009 切片 1b（PROJECTED 实体边/面投影）；计划
  `docs/superpowers/plans/2026-11-09-ps-blocker-next.md` Task 7 /
  `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md` P3。
- 预计影响仓：`luban-cad/packages/shared`、`luban-backend/modeling-server`（私有）、
  `luban-cad/apps/web`（读面状态；UI 后续）。`viewer`/`editor`/`itwinjs-core`/`imodel-native`
  原则上无改动（只复用既有拓扑/几何 API）。
- 是否需要 ADR：**是**。`SketchExternalRef` 新形态属于共享契约变更（P0-07），且引入
  「异步预求值 + 可失效同步快照」求值路径（P0-04/P0-06）。本文件不是批准；
  ADR-0009 增量与本 AIRR 同批评审，批准后才允许实现。

---

## 0. 结论先行

- 当前草图读取是**同步、纯 `IModelDb`** 链路（`readResolvedSketch` / `sketchRegionsFrom` /
  `FeatureService.getSketch`）。实体边/面拓扑必须经 **异步 `SolidModelingCommand`**
  （scratch 载体 + feature output cache）读取，二者不能直接拼接。
- 两个候选路径：**(A) 异步草图求值路径**、**(B) 可失效同步快照缓存**。
  **裁决：选 B**。异步只发生在既有 pre-eval 通道，同步求解/面域/显示读面保持签名与语义；
  快照是**派生、进程内、可失效、永不作为事实源**，缺失或过期**失败封闭**。
- 契约以**判别联合**扩展：运行时/JSON additive、旧 1.35 载荷逐字兼容；但 TS 源码
  需 shared/backend/web 同批窄化（见 §5.1）。投影坐标只是读时派生/插入时快照，
  事实源仍是 `params` 中的 source 引用。
- 本切片**不做 UI**：仓库没有 Onshape Use/Project 对话框 live 证据，选择器/失败提示/
  投影线样式按 blocked-evidence 另行采集，能力保持 gated。
- 测试矩阵覆盖：平行/非平行平面、源边/源面失效、跨 body、undo/redo、push+冷重开、
  旧库 fixture、失败注入与性能预算。全部为**设计**，当前未运行。

---

## 1. 目标与验收

### 1.1 用户问题

Onshape 的 Use/Project 允许把**已有实体的边或面**投影到当前草图，作为构造/参考几何；
上游实体改参数或改拓扑后投影应自动更新。产品当前只有 ADR-0009 切片 1a 的
**草图→草图**投影（shared 1.35.0），PROJECTED 的实体源仍然缺失：

- `SketchExternalRef` 只有 `kind: "sketchEntity"`；
- `SketchProjection` 只会从另一张草图的 `params` 合成曲线，完全同步；
- 实体边/面没有草图 DTO 形态，也没有读路径。

语料侧：PROJECTED 是草图约束缺口最大类（ADR-0009 背景：4775 条；P3 首切片计数 31 个
PS 的实体边/面投影）。多数回放场景的投影曲线已包含在已解算坐标里，因此该能力的产品
价值在**参数联动与 Use 工作流**，不是当前回放的直接阻塞；不得用回放近似宣称能力已实现。

### 1.2 可观察验收标准（批准后实现时）

1. **契约**：`insertSketch.projections` 可请求同 Part Studio 内**实体边**（首实现切片）
   或**平面面边界**（后续子切片）投影；旧 1.35 `{sourceSketchId, sourceEntityId, entityId}`
   载荷逐字兼容。新增形态与旧形态在 schema 层**恰一**，混用/缺源/重复 id 拒收。
2. **几何**：平行平面上的直线边、圆/圆弧边精确投影（圆/弧保持圆/弧）；非平行平面上的
   直线边精确投影为直线；非平行平面上的圆/弧（投影为椭圆）、样条边、非平面面在首版
   **诚实拒收**，不折线化/不椭圆近似。
3. **参数联动**：上游 body 改参数（拓扑引用仍有效）→ 投影曲线与下游消费特征自动更新；
   真栈验收至少一条「盒体顶面四条边 → 闭合投影环 → 拉伸 10 mm = 4000 mm³
   （20×20 盒）」与一条「改上游尺寸 → 下游体积变化」，push + 冷重开后体积一致。
   单条开口边不能形成闭合面域/体积，不得作为主验收；非平行直线用例只断言投影端点，
   或另加闭合线并注明来源。
4. **跨 body**：源 body 与草图消费特征所在 body 可不同（同一 Part Studio）；源 body 的
   变化只影响投影草图及其下游，不改写源 body。
5. **失败封闭**：源 body/边/面被删除、被抑制、拓扑失效、跨 Part Studio、前向引用/循环、
   快照缺失或过期时，草图读面返回 `projection.status="failed"` 与错误码；消费特征
   `status=1`；**禁止**回退到插入时坐标、最近区域、旧快照或近似几何。插入阶段失败则
   op 拒收、不落半成品行。
6. **持久化**：`params` 只保存 source 引用 + 实体 id/种类/插入时坐标快照；投影几何每次
   从源重新派生（P0-06 单一事实源）。旧库无新字段 = 无新行为，无需迁移。
7. **回归**：切片 1a 草图→草图投影、全部现有草图/特征/回放真栈保持绿；不得用放宽断言
   掩盖回归。

### 1.3 参考证据

- **切片 1a 已实现（2026-11-07）**：`SketchProjection.ts` 的 `resolveProjectedEntities`
  在每次读取按源草图当前解重投影；投影不参与 DOF；源草图→投影草图/消费特征驱动边；
  真栈 `e2e/sketch-projection.spec.ts` 2 passed（2000→3000 mm³，push+重开）。
- **切片 1b 可行性结论（2026-11-07，ADR-0009）**：实体边投影是读路径架构变更，不是
  converter/replay 增量；实体拓扑只经 `SolidModelingCommand`（异步，scratch 载体 +
  feature output cache）读取；已有异步通道见 `AsyncFeatureEval.mirrorFaceTransform`/
  `evaluateMoveFaceAsync`/`evaluateFaceExtrudeAsync`。
- **代码证据（设计时核对）**：
  - `FeatureService.getSketch(sketchId): SketchDto | undefined` 是同步方法
    （`FeatureService.ts`），内部调用同步的 `resolveProjectedEntities` 与
    `sketchRegionsFrom`；RPC 壳 `FeatureRpcImpl.getSketch` 只 await `ensureInitialized()`。
  - `SketchProjection.readResolvedSketch(db, sketchId)` 与 `SketchRegions.sketchRegionsFrom(db, sketchId)`
    只接收 `IModelDb`；`FeatureEngine`/`FeatureService` 的 extrude/revolve/hole/sweep/loft
    等求值器都走这条同步读。
  - `ensureInitialized()` 内部 `ensureWarmForRead()` → `ensureWarm()` → `rebuildAll()`；
    **undo 后 redo 可能时预热被刻意跳过**（#45），因此进程内快照在 undo 后可能缺失，
    读面必须能失败封闭或触发只读补算。
  - 实体拓扑读取通道：`SolidModelingCommand.getSubEntityGeometry` /
    `topologyIdFromSubEntity`（op31）/ `facesFromId`（op32），由 scratch 载体
    `EvalCarrier` 承载；`AsyncFeatureEval` 已有面/边解析先例。
- **UI 证据缺口**：无 Onshape Use/Project 对话框 live 采集（见 §9），本切片不做控件。

### 1.4 非目标

- 不做 PIERCE/INTERSECTED/SILHOUETTED 求解约束（ADR-0009 切片 2）。
- 不做任意 FeatureScript 查询求值、跨文档/派生导入几何。
- 不做非平面面、曲面边、样条边、椭圆投影的近似；首版一律拒收。
- 不做 UI（Use/Project 工具、选择过滤器、投影线样式、失败提示）。
- 不改变「草图事实源=params」「前端 SketchCurvesDecoration 唯一显示源」。
- 不新增第二个建模/选择 API、不新增 native 绑定；不把投影几何写入 native geometry stream。
- 不以投影近似替代 imprint/face split（ADR-0006 边界仍成立）。

---

## 2. 现状与问题

### 2.1 同步草图读路径

```
FeatureRpcImpl.getSketch
  └─ await FeatureService.ensureInitialized()      // 冷开时可能 rebuildAll
       └─ FeatureService.getSketch(sketchId)       // 同步
            ├─ querySketch(db, sketchId)
            ├─ resolveProjectedEntities(db, entities, plane, visited)  // 同步
            ├─ splitProjectedEntities(...) + solveStateForRead(...)     // 同步
            └─ sketchRegionsFrom(db, sketchId)                          // 同步
```

特征求值同样在同步段读取草图：

```
FeatureService.applyOp (async)
  ├─ planInsert / planUpdate (校验, 同步读草图定义)
  ├─ EditTxn
  ├─ preEvaluateDirty(...)          // 异步预求值（fillet/revolve/shell/...）
  └─ save
```

### 2.2 实体拓扑只能在异步通道读取

- 实体边/面的**世界几何与持久拓扑 id**来自 native BRep；TS 侧必须经
  `SolidModelingCommand`（异步）与 scratch 载体读取，并依赖 `FeatureOutputCache` 中该
  body 的上游求值结果。
- 同步的 `IModelDb` 读取只能拿到草图 `params`、元素行、FeatureDrives 关系，拿不到
  BRep 边/面几何；因此在 `resolveProjectedEntities` 本地加几个 SQL 查询**不能**解决。
- 实体源可能有自己的上游链（extrude→fillet→hole），其求值本身是异步的；投影必须在
  源 body 已求值之后进行。

### 2.3 依赖/脏传播

- 切片 1a 已建立「源草图 → 投影草图」驱动边，并给消费特征补「全部上游投影源 → 消费特征」
  直连边（草图无 EDE 处理器，直连保证同步/异步两条求值路径都重算）。
- 实体源需要同类机制：依赖对象从「源草图」变为「源 body 的当前产出/修改特征」；
  body 的 `sourceFeatureId` 会被后续 fillet/hole 改写，边绑定必须随 body 产出特征变化
  重接，否则改上游参数不会触发投影重算。**这是实现前必须先用 spike 钉死的图语义**。

### 2.4 冷开、undo、只读

- 冷开：进程内缓存为空；`ensureWarmForRead` 会 `rebuildAll` 全链。快照必须在 rebuild
  的拓扑序中按需重算，否则 `getSketch` 读到缺失快照。
- undo/redo：`ensureWarmForRead` 在 redo 可能时**跳过** rebuild（#45 纪律）。原生 undo
  恢复几何/边/marker，但进程内快照不会自动恢复；读面必须按快照键判缺失并失败封闭，
  或由读 RPC 的异步钩子补算（见 §4.1）。
- 只读 briefcase：`ensureInitialized` 跳过 schema import/建图/预热；同步读面仍可用，
  但异步预求值不能写库。读面只能使用进程内已有快照；没有则失败封闭（不得为了显示
  去写只读库）。

### 2.5 直接编辑（P0-05）改变源 body

- P0-05 的直接编辑通道（`EditTools.startCommand` + `basicManipulationIpc`/
  `solidModelingIpc`）可以在**不经 FeatureOp、不改 params** 的情况下改变源 body 的
  几何/拓扑。
- 只看 FeatureOp 的投影会读到旧快照；因此快照键必须包含**body/native 变更 epoch**：
  直接编辑提交时 bump 受影响 body 的 revision；无法归属到具体 body 时 bump scope 级
  `changeEpoch`，使该 scope 的全部投影快照失效。
- 复用既有标准提交/几何变更事件（如 Briefcase txn 提交、模型几何变更通知），不自建
  第二套编辑/撤销状态机（P0-05）。直接编辑后读面只允许“重算后使用”或“失败封闭”，
  不得回退旧快照。

---

## 3. 选项比较与裁决

### 3.1 选项 A：异步草图求值路径

把 `readResolvedSketch`/`sketchRegionsFrom`/`getSketch` 及所有同步消费点改为
`async`/新增 `resolveSketchAsync`，每次读取按需经 `SolidModelingCommand` 解析外部引用。

**优点**

- 无缓存失效问题：每次读都是当前几何。
- 单一代码路径，不需要「快照 vs 直接读」双语义。

**缺点 / 风险**

- 签名级联：`FeatureEngine`、`FeatureService`、`SketchRegions`、`ScenarioReplay`、
  大量单测和纯几何辅助函数都要 async 化或加双份 API；`resolveRevolveInputs`/
  `sketchProfileFrom` 等调用点同样受影响。
- 重入/死锁：现有拓扑命令集中在 `AsyncFeatureEval` 的求值器内；若草图读在求值器
  内部再开 `SolidModelingCommand`，与 scratch 载体/命令槽的重入关系未定义。
- 性能：每次 `getSketch`/面域/DOF 读取都可能触发 native 拓扑枚举，显示轮询成本高。
- 只读库/undo 后无法预求值时，异步路径仍要失败或近似，不能消除失败封闭语义。

### 3.2 选项 B：可失效同步快照缓存（选中）

新增**异步预求值**步骤：在源 body 已求值后，把外部引用解析成草图局部坐标曲线，写入
进程内、按 revision 键控的派生快照；同步读路径（`resolveProjectedEntities` 等）只做
快照查表与组装。快照缺失/过期/解析失败=失败封闭。

**优点**

- 异步边界收敛在既有 pre-eval 通道（`preEvaluateDirty`/`rebuildAll`/`evaluateChainForPreview`），
  不改变同步求解/面域/显示 API，不触碰 FeatureEngine 的同步签名。
- 与 `FeatureOutputCache` 同构：进程内、可清、可重建、冷开确定性。
- 可测试：快照解析（纯函数 + 注入 provider）与读面失败路径可单测；真栈验证体积。
- 失败语义清晰：快照键不匹配/缺失 → 明确错误码，而不是悄悄读旧坐标。

**缺点 / 风险（必须用设计约束压住）**

- 失效正确性是主要风险：任何 body 修改都必须击穿相关快照；键必须包含源 body revision
  与 source 引用摘要，不能只按 `sketchId` 缓存。
- 冷开/undo 后需要补算；只读/redo 场景可能只能失败封闭。
- 快照绝不能落 `params` 或 native geometry stream，否则变成第二事实源（P0-06）。
- 多源/跨 body 时快照键与依赖边更复杂，需要逐 body revision。

### 3.3 对比表

| 维度 | A 异步草图求值 | B 可失效同步快照（选中） |
|---|---|---|
| 改动面 | 读/求值/测试全链路 async 化 | 预求值通道 + 同步读面查表 |
| 正确性 | 当前几何，无失效问题 | 依赖 revision 键；缺失/过期失败封闭 |
| 重入/死锁风险 | 高（求值内部再开命令） | 低（异步只在既有预求值段） |
| 显示/轮询成本 | 每次读都可能枚举 native 拓扑 | 每 revision 一次，读面零 native |
| 冷开/undo | 仍需异步/失败路径 | rebuild 补算；redo 时失败封闭 |
| 事实源 | `params` + 实时读 | `params` + 派生快照（非事实源） |
| 首切片风险 | 架构级，跨多个模块 | 中等，需钉死失效键与依赖边 |

**裁决**：选 **B**。A 作为未来演进方向保留：如果快照失效在真实语料中被证明不可控，
再评估把草图读整体 async 化；在本切片不以 A 开工。

---

## 4. 决策：可失效同步快照缓存

### 4.1 数据流

**插入（insertSketch）**

1. op 边界校验请求形态（旧/新形态恰一、id 不冲突、源 body 属于本 Part Studio、
   不是前向引用/循环）。
2. 在 `applyInsertSketch` 的异步段，源 body 的上游链已可用（必要时先
   `prepareUpToPlaneIfNeeded`/最小上游预求值），经 scratch 载体解析边/面。
3. 解析成功：合成投影实体（带 `projected` 标记），落 `params`（引用 + 根 id/种类 +
   插入时坐标快照）；创建「源 body 的当前产出/修改特征 → 投影草图」驱动边；
   消费特征创建时补直接驱动边（与 1a 同口径）。
4. 解析失败：**op 拒收**（`ok:false` + 明确错误码），不写半成品草图/边。

**同步读面（求值 / getSketch）**

```
resolveProjectedEntities(db, entities, plane, visited, provider?) 
  ├─ 无 body 引用 → 现有 1a 路径逐字不变
  ├─ 有 body 引用且 provider 命中 → 用快照曲线组装
  └─ provider 缺失/未命中/过期 → throw ProjectionResolutionError(code)
```

- `provider` 是新增的**进程内快照查表接口**（不是新 RPC、不是 shared DTO）。
- `sketchRegionsFrom`/`readResolvedSketch` 增加**可选** provider 参数；未传且遇到 body
  引用=失败封闭。新增可选参数本身不改变既有调用签名；但 §5.1 的 union 类型变更是
  源码级不兼容，消费者须同批窄化。
- `FeatureService.getSketch` 捕获 `ProjectionResolutionError`，返回
  `projection.status="failed"` + 错误列表；**不返回**失败引用的旧曲线。

**异步预求值（populate）**

- `preEvaluateDirty`/`rebuildAll`/`evaluateChainForPreview` 在拓扑序求值时，遇到
  「带 body 引用的草图」或「消费此类草图的特征」前，调用
  `prepareSketchProjections(db, scope, sketchIds)`：解析源 → 生成快照 → 写入进程内缓存。
- 快照生成只读源 body（scratch 载体），不写库、不写 params、不触发 EDE。

**读 RPC 补算**

- `FeatureRpcImpl.getSketch` 在 `await svc.ensureInitialized()` 之后、
  `svc.getSketch(sketchId)` 之前，`await svc.prepareSketchProjections([sketchId])`。
- 这一步是**读面异步钩子**，不改变 `FeatureService.getSketch` 的同步签名，也不新增
  RPC 方法；失败时同步读面返回失败状态。
- `ensureInitialized` 在 redo 可能时跳过 rebuild；该钩子可以按需只算这一张草图的快照，
  不触发 `rebuildAll`、不提交事务（遵守 #45 的 redo 纪律）。若源 body 缓存缺失且
  不能在不提交事务的情况下补算，则失败封闭。

**显示**

- `SketchCurvesDecoration` 仍是唯一显示源；投影曲线通过 `getSketch` 的 entities 下发。
- 失败时 `projection.status="failed"`，前端显示明确错误（UI 后续切片）；不得把失败
  曲线画成正常黑色实体。

### 4.2 快照形状与键

```ts
// modeling-server 内部类型（不进入 shared RPC 契约）
interface ProjectionSnapshotKey {
  sketchId: string;
  /** 从持久化 params.entities 重建的 root projected 标记摘要：
   *  {entityId, source} 列表（derived !== true）按 entityId 排序后的 canonical JSON。 */
  sourceDigest: string;
  /** 全部源 body 的 revision 规范摘要：逐 body =
   *  (bodyId, 产出/修改特征 id, 该特征链 params canonical digest,
   *   lastBodyWriteEpoch（进程内提交纪元）)。 */
  bodyRevision: string;
  /** scope 级全局失效纪元：undo/redo、import/迁移、无唯一 body 的直接编辑、
   *  可能重接投影依赖的结构性图变更时 bump（进程内单调）。 */
  changeEpoch: string;
}

interface ProjectionSnapshot {
  key: ProjectionSnapshotKey;
  /** 已合成的投影实体（含 derived 点；草图局部坐标） */
  entities: SketchEntityDto[];
  /** ok 或失败诊断；失败不会写入可用快照 */
  diagnostics: SketchProjectionErrorDto[];
  /** 生成时刻仅用于诊断/日志，不参与相等判定 */
  generatedAtMs: number;
}
```

- **sourceDigest 重建规则**：从持久化 `params.entities` 中带 `projected` 且
  `derived !== true` 的根实体提取 `{entityId, source}`，按 `entityId` 排序后做
  canonical JSON 摘要；不依赖内存请求顺序/对象引用。若某版本无法从 params 重建，
  必须持久化规范化请求列表，不得用内存状态作为键。
- **bodyRevision bump 规则（逐源 body）**：以下任一发生即 bump：该 body 的 FeatureOp
  insert/update/delete/suppress/undo/redo 提交；产出/修改该 body 的特征链 params
  变化；直接编辑提交改变该 body 几何/拓扑；body 创建/消费/删除。`lastBodyWriteEpoch`
  由每次已提交的 body 写入（FeatureOp 或直接编辑 hook）分配为**进程内单调值**，
  不是时间戳，也不要求跨进程相等。
- **changeEpoch bump 规则（scope 级）**：仅对**无法归属到具体 body** 的提交
  （undo/redo、import/迁移、无唯一 body 的直接编辑）以及可能重接投影依赖的**结构性
  图变更**（插入/删除/重排/抑制会改变 body 产出/修改特征或依赖边重接的操作）bump，
  并清空该 scope 快照；可归属的 FeatureOp/直接编辑只 bump 对应 body 的 `bodyRevision`，
  使无关 body 的投影快照继续命中。缓存是进程内的，epoch 只需进程内单调可比较；
  冷开缓存为空，不依赖跨进程相等。
- **undo/redo**：显式清空该 db/scope 的投影快照并 bump changeEpoch；`ensureWarmForRead`
  因 redo 跳过 rebuild 时，读面只能失败封闭或走读面异步补算，禁止使用旧快照。
- 快照按 `sketchId` 单槽存放（一张草图一个当前键）；旧键条目被替换/丢弃。
- 快照**不序列化到 iModel**，不跨进程共享；冷开由 rebuild/读面钩子重建。

### 4.3 失效与重建

| 事件 | 处理 |
|---|---|
| 上游 body 的参数/特征修改成功 | 该 body revision bump（结构性图变更时另 bump changeEpoch）；快照键不匹配 → 下一次 pre-eval 重建；读面在重建前失败封闭 |
| 上游 body 被 fillet/hole 等修改（sourceFeatureId 变化） | 依赖边重接；该 body revision bump；快照失效 |
| **直接编辑**（`EditTools` + `basicManipulationIpc`/`solidModelingIpc`）改变源 body | 受影响 body revision bump；无法归属到 body 时只 bump scope changeEpoch 并清空该 scope 快照；读面失败封闭直到重算 |
| 投影草图 `insertSketch`/`updateSketch` 增删投影 | sourceDigest（从 params 重建）变化；旧快照丢弃；驱动边重接（1a 同口径） |
| suppress/delete 源 body 产出特征 | 源不可用；快照失效；读面 `projection-source-missing` |
| undo/redo | **显式清空**该 db/scope 的投影快照并 bump changeEpoch；`ensureWarmForRead` 跳过 rebuild 时读面钩子按需补算或失败封闭，禁止旧快照 |
| push/冷开 | 进程内缓存为空；`rebuildAll` 拓扑序补算；读面钩子兜底 |
| 只读 briefcase | 不写库；用已有快照；缺失=失败封闭（不触发写事务） |
| 跨 Part Studio / 前向引用 / 循环 | 插入期直接拒收；不应产生快照 |

- revision 的**持久部分**=产出特征 id + 特征链 params 摘要（可从库重建）；
  `lastBodyWriteEpoch` 只是**进程内失效**用的提交纪元，不要求跨进程持久/相等
  （冷开缓存为空、重新求值会分配新纪元）。不得依赖内存对象指针或时间。
- 不使用 TTL/时间过期作为正确性依据；时间只做诊断。

### 4.4 失败封闭语义

新增错误码（shared 读面 DTO 使用，op 错误串也使用同一套 code）：

| code | 触发 | 行为 |
|---|---|---|
| `projection-source-missing` | body/边/面/顶点不存在（删除、抑制、拓扑分裂） | 插入拒收；读面 failed；消费特征 status=1 |
| `projection-ambiguous` | 同一拓扑 id 在多个 body/候选上重复，无法唯一归属 | 同上，禁止任取第一个 |
| `projection-non-exact` | 非平行平面圆/弧（椭圆）、非平面面、样条边、曲面边 | 同上，不近似 |
| `projection-degenerate` | 投影线长为 0、圆弧扫角为 0、面边界为空 | 同上 |
| `projection-unsupported` | 首切片未支持的源种类/子形态 | 同上 |
| `projection-forward-reference` | 源 body 由下游/后续特征产生 | 插入拒收 |
| `projection-cross-project` | 源 body 不在本 Part Studio / scope | 插入拒收 |
| `projection-cycle` | 草图→body→草图 的循环依赖 | 插入拒收 |
| `projection-snapshot-missing` | 同步读面时无可用快照（冷开/redo/只读/预求值未跑） | 读面 failed；**不**读插入时坐标 |
| `projection-snapshot-stale` | 快照键与当前 sourceDigest/bodyRevision/changeEpoch 不匹配 | 读面 failed；异步钩子重建后恢复 |

- **绝不**用 `params` 中的插入时坐标作为失败回退；那些坐标只用于审计/旧客户端离线展示
  的兼容数据，不参与求解/面域/显示成功路径。
- **绝不**用最近草图面域/region 0/相似边替代失效引用（禁止「差不多」）。
- 失败是**可恢复的**：修复源（改回参数、取消抑制）后，下一次 pre-eval 重建快照，
  读面自动恢复；不需要删除重建草图（除非源实体类型已漂移，此时保留 1a 的诚实提示）。

### 4.5 并发与重入

- 快照生成只在预求值段执行；不得在 `SolidModelingCommand` 回调内部再次触发另一个
  同类命令（沿用既有异步通道约束）。
- 同一 db/scope 的预求值串行（沿用现有文档初始化锁/事务串行纪律）；快照缓存
  读写必须同线程/同锁域，避免读面看到半写入快照。
- `getSketch` 读面钩子与 `applyOp` 并发时：写 op 持租约并走事务；读面钩子只做只读
  预求值，不写库；若遇到正在进行的写事务，失败封闭/重试一次，不阻塞写入。

### 4.6 性能预算

- 每次 revision 只解析一次；同一 revision 的 `getSketch`/面域/DOF 读取不再触发 native 命令。
- 目标：单草图 ≤ 100 条边、典型 body 的投影预求值 **< 100 ms**（设计目标，实现时测量；
  超预算先登记再优化，不得把每帧/hover 路径接进 native）。
- 冷开 `rebuildAll` 的增量成本按源 body 数量线性；大模型回归需测量并登记。
- 显示轮询（getFeatureTree/getBodies）不触发预求值。

---

## 5. 契约形状（提议）

### 5.1 shared 类型（JSON/runtime additive；TS source 需同批更新）

```ts
/** v1.35 既有成员逐字保留。 */
export type SketchEntityExternalRef = {
  kind: "sketchEntity";
  sketchId: string;
  entityId: number;
};

/** 新增：实体边/面外部引用（同一 Part Studio；bodyId = getBodies[].bodyKey）。 */
export type SketchBodyExternalRef =
  | { kind: "bodyEdge"; bodyId: string; topologyRef: LubanTopologyId }
  | { kind: "bodyFace"; bodyId: string; topologyRef: LubanTopologyId; loops?: "outer" | "all" };

export type SketchExternalRef = SketchEntityExternalRef | SketchBodyExternalRef;

/** v1.35 旧形态逐字兼容。 */
export type SketchProjectionRequest =
  | { entityId: number; sourceSketchId: string; sourceEntityId: number }
  | { entityId: number; source: SketchBodyExternalRef };

/** 读面状态（只在 SketchDto 下发；不落 params）。 */
export type SketchProjectionErrorCode =
  | "projection-source-missing" | "projection-ambiguous" | "projection-non-exact"
  | "projection-degenerate" | "projection-unsupported" | "projection-forward-reference"
  | "projection-cross-project" | "projection-cycle" | "projection-snapshot-missing"
  | "projection-snapshot-stale";

export interface SketchProjectionErrorDto {
  /** 逐 source 错误带 source；快照级错误（missing/stale）可省略。 */
  source?: SketchExternalRef;
  code: SketchProjectionErrorCode;
  detail: string;
}

export interface SketchProjectionStatusDto {
  status: "ok" | "failed";
  errors: SketchProjectionErrorDto[];
}

export interface SketchDto {
  /* 既有字段不变 */
  projection?: SketchProjectionStatusDto;
}

export interface SketchProjectedMarker {
  kind: "projected";
  source: SketchExternalRef;   // 既有字段类型扩展为联合
  derived?: boolean;
}
```

- `SketchProjectionRequest` 用**联合**而不是给旧字段加 optional：旧对象逐字落入第一分支；
  新对象必须带 `source`，schema 层拒绝同时缺 `source` 和旧字段、或两者都有的对象。
- `SketchExternalRef` 扩展后，旧读面遇到新 kind 会因 source 结构不匹配而抛错
  **失败封闭**（不是静默丢弃）；旧库不会含新 kind，因此无迁移。
- **源码兼容性（不是纯 additive）**：`SketchExternalRef` 与 `SketchProjectionRequest`
  从单形态变为判别联合，属于 **TS 源码级破坏性变更**——任何直接访问
  `source.sketchId`/`source.entityId` 或 `request.sourceSketchId`/`sourceEntityId`
  的代码必须先窄化。运行时/JSON 是 additive：旧 1.35 载荷与旧库逐字有效；已编译的
  旧 backend JS 只读 `kind:"sketchEntity"`，旧载荷行为不变，新 kind 对它失败封闭。
- **同批必须更新的消费者**：`SketchProjection.synthesizeGroup`/`resolveProjectedEntities`、
  `FeatureService.applyInsertSketch`/`applyUpdateSketch`/`getSketch`、web 草图 DTO 消费
  与测试；不允许只 bump shared 而不改消费者。

### 5.2 投影几何规则（首版）

| 源 | 条件 | 生成 | 备注 |
|---|---|---|---|
| bodyEdge 直线 | 任意目标平面 | 投影两端点为 line（root=entityId，端点 +1/+2） | 投影长度 ≤1e-12 → `projection-degenerate` |
| bodyEdge 圆/弧 | 边所在圆平面法向 ∥ 草图法向（含反向，±1e-6） | circle/arc（root=entityId，圆心 +1；弧起角/扫角按 1a 的镜像符号规则） | 非平行 → `projection-non-exact`（椭圆），不折线化 |
| bodyEdge 样条/其它 | — | 不生成 | `projection-unsupported` |
| bodyFace 平面 | 面为平面；边界环全部为 line 或平行圆/弧 | 每个边界边一条投影曲线（外环在前、孔环在后） | 非平面/非平行圆/弧 → 整面拒收，不部分投影 |
| bodyFace 曲面/开放面 | — | 不生成 | `projection-unsupported` / `projection-non-exact` |

- 投影曲线**不自动设 `construction`**：默认参与面域（与 1a 相同——投影矩形可直接
  拉伸），否则“投影后拉伸”不成立。若 Onshape Use/Project 的 construction/参考线
  语义需要区分，作为 UI 切片问题另取证。
- 面投影**不自动合成面域**：只生成草图曲线，面域仍由现有 `sketchRegionsFrom` 从全部
  曲线派生；投影曲线不参与 DOF（沿用 1a）。
- 约束引用投影实体：切片 1b 继续**拒收**（PIERCE 等归切片 2）；`SketchRef` 指向投影实体
  id 在 op 边界诚实拒收。
- `bodyFace.loops` 首版只允许 `"outer"`（外环）与 `"all"`；缺省=`"all"`。孔环按拓扑顺序
  生成，ID 连续分配。

### 5.3 ID 分配

- `entityId` 是请求的**块基址**；一个请求合成的全部实体 id 必须落在
  `entityId..entityId+n−1` 的连续块内，`n` 由解析结果决定。
- 分配顺序：根曲线按边界/请求顺序（外环→孔环），随后派生点（line 两端点/圆与弧圆心）。
- 后端在写面前校验整块 id 与既有实体 id 不冲突；冲突 → op 拒收（`id 冲突`），不做局部
  重排（重排会破坏约束/显示引用）。
- 块大小上限（首版 4096 实体/请求）超限拒收；面边界过大时提示拆分为多个请求。

### 5.4 依赖边

- 插入：对每个源 body，找其当前产出/修改特征（`getBodies[].sourceFeatureId`），建
  「源 body 特征 → 投影草图」驱动边；消费特征创建时补「全部源 body 特征 → 消费特征」
  直连边（1a 的 `projectionSourceClosure` 扩展为 body source 集合）。
- 更新：`updateSketch` 若保留/增删投影，按 `ready.projectionSourceIds` 同口径重接
  incoming 边（body 源以 sourceFeatureId 表示）。
- 源 body 后续被 fillet/hole 改写 sourceFeatureId：在写该 body 的特征 op 中把依赖边
  从旧 sourceFeatureId 重接到新 sourceFeatureId；不重接=改上游不重算，属于实现阻断项。
- 删除投影草图：清 incoming 边（不悬空阻断源 body 删除）；删除源 body 的特征若被
  投影草图依赖 → 引用守卫拒收（与草图引用同口径）。
- 禁止循环：插入时沿依赖图检测「草图→body→草图」环，检测到即拒收。

### 5.5 版本与兼容

- shared 下一 minor（提案 **1.64.0**；实现时若基线已前进，按当时下一 minor bump）。
- 旧 1.35 投影请求/标记逐字兼容；无 params/schema 迁移。
- **运行时/JSON additive，TS 源码不兼容**：旧 1.35 载荷、旧库、已编译旧 backend 的旧
  载荷行为不变；新 union 需要 shared/backend/web 源码同批窄化（见 §5.1）。shared 版本
  按项目 minor bump，但不得在跨仓影响里写“纯 additive/无需改消费者”。
- 新 web ↔ 旧 backend：新 web 不发 body 引用（无 UI），行为不变。
- 旧 web ↔ 新 backend：旧 web 不创建 body 引用；读面新增可选的 `projection` 键，
  旧 web 忽略。已有 body 引用文档需要新 web/新 backend 才能编辑。
- `LubanFeatureRpcInterface.interfaceVersion` 按 P0-07 bump；shared → backend → web 同批发布。

---

## 6. 数据、事务、安全

- **事实源**：草图 `params`（entities+constraints+plane+`projected.source`）是唯一定义
  事实源；投影几何是派生输出。`source` 引用是稳定输入，插入时坐标只是快照。
- **不持久化派生快照**：不写 params、不写 native geometry stream、不建影子元素；
  进程缓存丢失可重建。
- **schema/迁移**：无库 schema 变更；运行时/JSON additive（新增可选读面状态），但
  `SketchExternalRef`/`SketchProjectionRequest` 的 union 是 TS 源码级不兼容，消费者须
  同批窄化（§5.1）。旧库 fixture 必须逐字通过。
- **事务边界**：所有写操作仍走 `FeatureOp` → `FeatureService` → `BriefcaseTxns`/
  `saveChanges`；异步预求值不自行提交事务；读面钩子只读、不写库。
- **Undo/redo**：投影草图/消费特征在标准事务内；undo/redo 时显式清空该 db/scope 的
  投影快照并 bump changeEpoch，读面补算或失败封闭。不得出现 undo 后仍显示旧投影坐标。
- **写租约/权限/限流**：沿用现有写租约（一个 op 一个租约）；读面钩子不取写租约；
  不新增写通道。
- **日志/审计**：错误码与 source 摘要可记录；不打印私有几何坐标/完整 BRep；不在公共仓
  暴露私有源数据。
- **安全/许可**：只消费现有 `SolidKernel.h` 拓扑/几何能力；不新增 native 绑定，不接线
  未授权 ACIS 能力。

---

## 7. 复用矩阵与跨仓影响

### 7.1 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 结论 |
|---|---|---|---|
| itwinjs-core | 子实体几何、持久拓扑 id | `SolidModelingCommand.getSubEntityGeometry` / `topologyIdFromSubEntity` / `facesFromId` | 复用；不改 fork |
| luban-cad/packages/editor | 边/面拾取、持久引用 | `resolveEdgeRef` / `resolveFaceRef` / `EditTools` | 复用（UI 后续） |
| luban-cad/packages/viewer | 选择权威 | `store.canvas.selection` / `OnshapeSelectTool` | 复用（UI 后续） |
| luban-cad/packages/shared | 草图 DTO/外部引用/拓扑 id | `SketchExternalRef` / `SketchProjectedMarker` / `LubanTopologyId` | **扩展**（JSON additive；TS source 需窄化） |
| luban-backend/modeling-server | 草图读/预求值/载体 | `SketchProjection` / `SketchRegions` / `AsyncFeatureEval` / `EvalCarrier` / `FeatureOutputCache` | **扩展**（快照 provider + 异步预求值 + 直接编辑/undo epoch 钩子） |
| luban-backend/webhook-agent | 无直接关系 | — | 不适用 |
| imodel-native | BRep 拓扑/几何 | `SolidKernel.h` 现有接口 | 复用，不改 native |
| imodelhub-services | 无直接关系 | — | 不适用 |
| 官方 clients/BisSchemas | 参考契约 | 官方 editor/几何 API | 参考，不新增 API |
| DanQing/参考项目 | 不作为第二实现 | — | 不适用 |

### 7.2 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 边/面持久引用 | `LubanTopologyId`（op31） | 已有 | 复用 | 与 fillet/shell/faceExtrude 同源 |
| 边/面几何读取 | `getSubEntityGeometry` / `facesFromId` | 已有 | 复用 | 不新增 native 绑定 |
| 异步预求值 | `preEvaluateDirty` / `rebuildAll` / `evaluateChainForPreview` | 已有 | 扩展 | 同一求值通道，不新建第二套 |
| 草图投影 | `SketchProjection` 1a | 草图源 | 扩展 | 保留同步语义，增 body provider |
| 快照缓存 | `FeatureOutputCache` 模式 | 已有先例 | 复用模式，新建草图快照槽 | 派生、可重建，不落库 |
| 选择/拾取 | `resolveEdgeRef` / `resolveFaceRef` | 已有 | 复用（UI 后续） | 不新建选择权威 |
| UI | 无 live 证据 | — | 不做 | 见 §9 |

### 7.3 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 读面 `projection` 状态；DTO 窄化；无 UI | 无 | 无 | 单测 + 真栈 | shared 后同批 |
| shared | `SketchExternalRef`/请求判别联合 + 读面状态；版本 bump；**源码级不兼容，消费者同批更新** | 无 | 无 | 契约测试 | 同批发布 |
| viewer | 无（选择复用） | 无 | 无 | 选择回归 | 不变 |
| editor | 无（拾取复用） | 无 | 无 | 编辑命令回归 | 不变 |
| itwinjs-core | 仅消费 op31/op32 | 无 | 无 | 已有测试 | 不变 |
| imodel-native | 仅消费现有 SolidKernel 能力 | 无 | 无 | ctest/下游 | 不改 |
| modeling-server | 快照 provider + 预求值 + 读面错误 + direct-edit/undo change epoch 钩子；union 窄化 | 无库 schema 变更 | 无 | 单测 + StandaloneDb + 真栈 | shared 后同批 |
| webhook-agent | 无 | 无 | 无 | — | 不适用 |
| hub/DanQing | 无 | 无 | 无 | — | 不适用 |

- 版本兼容矩阵：见 §5.5；发布顺序 shared → modeling-server → web。
- 配对 PR：shared + 私有后端 + web 同批；公共仓同步接口冻结矩阵/ADR 记录。

---

## 8. 测试矩阵

> 以下均为**设计**；批准后实现时按此矩阵建测试，未运行前不得声称完成。

### 8.1 单元 / 契约

| 用例 | 覆盖 |
|---|---|
| shared schema 旧/新请求恰一、混用/缺源/重复 id/块冲突 | 契约 |
| 快照键：sourceDigest/bodyRevision/changeEpoch 变化、同 revision 命中、无关 body 编辑仍命中 | 失效 |
| 边投影：直线/圆/弧（平行与反向）、非平行圆/弧拒收、退化线/弧拒收 | 几何 |
| 面投影：平面外环/孔环、非平面/曲面/非平行圆/弧拒收、块 id 校验 | 几何 |
| 失败码矩阵：缺失、歧义、forward/cross/cycle、snapshot-missing/stale | 失败封闭 |
| `resolveProjectedEntities` 未传 provider 且遇 body 引用 → throw，不读坐标快照 | 同步读面 |
| 旧 1a 投影路径逐字回归 | 兼容 |

### 8.2 StandaloneDb/契约

| 用例 | 验收 |
|---|---|
| 盒体顶面四条边 → 新草图闭合环 → 拉伸 | 20×20 盒顶四边投影成闭合矩形，拉伸 10 → **4000 mm³** 解析对拍 |
| 平行圆柱端面圆 → 投影圆 → 拉伸/切除 | 圆/弧保真（闭合环，可体积验收） |
| 单条非平行直线边 → 投影线 | 只断言投影端点坐标；若需体积，另加闭合线并声明构造/闭合来源 |
| 非平行圆/弧、样条边、非平面面 | op 拒收/status=1，无半成品 |
| 源 body 参数修改（尺寸/位置） | 投影更新，消费特征体积变化；源 body 不变 |
| 源边/面失效（改参删除拓扑、抑制/删除上游） | `projection-source-missing`；消费 status=1；无旧坐标回退 |
| 跨 body（body B 的闭合边环/面外环投影，消费在 body A） | 两 body 独立，源 B 变化触发投影 |
| 直接编辑源 body（P0-05 通道，不经 FeatureOp） | 受影响 body revision / scope changeEpoch bump；快照失效；读面失败封闭或重算后更新，不读旧快照 |
| 直接编辑无关 body | 快照命中，不触发投影重算 |
| undo/redo | 显式清空该 db/scope 快照并 bump changeEpoch；读面补算或失败封闭；体积回到对应状态，undo 后无 stale 显示 |
| 冷开/进程重启 | `rebuildAll` 按拓扑序重建；体积/树一致 |
| 旧库 fixture（1a 投影、无投影） | 逐字兼容，无迁移 |

### 8.3 真栈 e2e（批准后）

- 新增 `e2e/sketch-projection-body.spec.ts`（实现时落此文件）：
  - 合成盒体 → 拾取**闭合环（四条顶边）**或 bodyFace 外环（test-only 直接 RPC/
    resolveEdgeRef）→ 投影草图 → 拉伸 10 → **4000 mm³** 体积断言 → 改上游尺寸 →
    体积变化 → push + 冷重开一致。
  - 失败注入：删除源特征/边后读面/消费状态=1；不显示旧曲线。
- 跨 body 用例：两个 body，B 的闭合边环/面外环投影到草图，拉伸只改变 A；B 改参后
  投影更新。单条开口边不用于体积验收。
- 回归：`e2e/sketch-projection.spec.ts`（1a）、`first-part`、`alignment`、`iOS`、
  `verify-imodels` 现有 13 个 iModel 重开不变；不得用 record/known-red 冒充绿。

### 8.4 性能/视觉

- 冷开增量耗时；单草图 ≤100 边预求值 <100 ms（设计目标，实测登记）。
- 显示轮询无 native 命令；hover/pick 不触发投影解析。
- 投影线样式/失败提示属 UI 后续，视觉基线在 UI 切片另钉。

### 8.5 known-red 政策

- 未实现的子形态（PIERCE、样条、椭圆、非平面面）登记 `blocked-capability`，不近似；
- 源失效场景登记明确错误码与复现步骤，不调松断言；
- 不把本 AIRR/未来设计当作绿例。

---

## 9. UI 证据缺口

- 仓库没有 Onshape **Use/Project 对话框** live 采集（公开仓只有既有 feature dialog
  证据；本能力需要的选择器语义未采集）。
- 实现 UI 前至少需要（私有仓 `ui-evidence/`）：
  1. Use/Project 对话框截图 + DOM/字段：Use 与 Project 区别、投影方向/平面、
     offset/spacing、是否包含边/面/草图、选择过滤器（边/面/顶点）；
  2. 投影线样式（颜色/线型/是否 construction）、失败/失效引用的提示形态；
  3. 参数修改后的更新反馈（自动/手动），以及删除/抑制源时的错误文案。
- 在上述证据采集前：**不新增控件**（不渲染假按钮/菜单），能力保持 gated；后端/契约/
  回放先行。UI 切片另写 AIRR。

---

## 10. 回滚与发布

### 10.1 回滚方式

- **停止创建**：op 边界对 `bodyEdge`/`bodyFace` 请求返回明确「未支持」；旧 1a 草图→草图
  投影逐字不变。web 隐藏/不提供入口（本就没有 UI）。
- **读取**：保留新读面分支可读已有引用文档；若必须回滚到 1b 之前的 backend，含 body
  引用的草图在读面时失败封闭（`projection-unsupported`/未知 kind），**不静默丢弃曲线**，
  数据保留以便前滚。
- **数据迁移回滚**：无迁移；旧库/旧 changeset 不需要回滚脚本。
- **发布前门禁**：shared/backend/web 同批；旧库 fixture、全量真栈回归、冷开验证通过；
  `verify-stack` 全绿。

### 10.2 发布/兼容窗口

- shared bump 后 shared → modeling-server → web 同批发布；不允许旧 backend + 新 web
  混用含 body 引用的文档（旧 backend 会失败封闭，属预期）。
- 回滚窗口：若已产生 body 引用文档，回滚只允许「前滚修复」或从启用前 checkpoint
  恢复；不得用旧版本合并/忽略投影。回滚前必须审计/导出受影响的草图与消费特征。

---

## 11. 评审结论（草稿）

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：否（本能力不新增例外；失败封闭按现有 status=1/op 拒收口径）
- ADR：需要（ADR-0009 增量；shared 契约 bump）
- Owner 签字：**待用户批准**
- 结论：**提议 / 未批准；批准前不写产品代码。本 AIRR 不是实现、不是绿例。**

### 建议实施切片（批准后）

1. **1b-1 契约 + 边投影快照**：shared 联合 + 快照 provider + 直线/平行圆/弧边；
   同步读面失败封闭；后端单测 + 合成 StandaloneDb；UI 不做。
2. **1b-2 面边界投影**：平面面外环/孔环、ID 块分配、依赖边；非平面/曲线拒收。
3. **1b-3 真栈/持久化**：push + 冷重开、undo/redo、跨 body、旧库 fixture、全量回归。
4. **1b-4 UI（另 AIRR）**：live 证据齐备后接 Use/Project 选择器与投影线样式。
