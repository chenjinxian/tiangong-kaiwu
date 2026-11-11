# ADR-0015：多 body 特征作用域（多目标删除/阵列）

- 状态：**首切片已真实验证（2026-11-11）**。2026-11-07 立项、2026-11-09 扩展为完整
  多目标契约提案；2026-11-10 实现首切片（shared 1.65 `targetBodyIds` + 逐边
  `bodyKey`、后端 `planInsertMulti`/逐体 BlendEdges/逐 body side cache/持久化
  body→upstream、回放 edge-resolver/runner）；2026-11-11 扩展 B6.2
  throughAll REMOVE extrude/hole（shared 1.68）并完成 Links 几何严格绿；
  Handle Parts 真栈严格绿
  （3 体逐体温差 ≤0.043%、整链 +0.009%、冷重开一致）。此前 +4.2% 根因不是圆角，
  而是 converter 的 linearPattern `directionOne`（上游 revolve SWEPT_FACE）误映射
  草图线方向 +Z；修正为旋转轴 -X 后闭合。**单特征多 body 改参/抑制/删除已支持
  （2026-11-11；多目标预览明确拒收）；pattern/mirror 跨体、chamfer/shell/
  moveFace 多目标与 UI 仍为后续切片。**
- 关联：`docs/adr/0007-feature-pattern.md`、`docs/adr/0012-split-part-world-plane.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`、
  `docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md`（同批异步预求值/
  快照缓存设计，可复用于多 body 逐体求值）。

## 背景与证据

1. **Links（Exercise: Creating Mate Connectors，8343b562/761c6b9a）**：
   `Extrude 3` 是 throughAll REMOVE，`booleanScope` 同时引用两个 body 的源；
   Onshape 一次切除在两个 body 上各开一个孔。产品 `insertFeature` 只接受
   单个 `targetBodyId`，通用回放只切了其中一个 body——每 body 少一个
   R5×2 mm 孔（157.06 mm³），总体积 +1.44%（backend）/ +1.56%（web）。
   真栈树/status 已绿，剩余差异精确归因于该语义缺口。
2. **FACE linear pattern / 跨体圆角（77b496 / d405047，Handle Parts）**：
   15 实例 FACE 阵列作用于多 body 模型。2026-11-08 回放复核：converter 新增
   `revolve.profileEntityIds` + 回放器按 `SketchRegionDto` 边界映射面域后，
   三个 NEW revolve 真正落在三个不同轮廓（此前盲取 region 0），前置 10 特征
   真栈跑通（3 体未圆角 12326.161 / 32140.878 / 106103.005 mm³）。剩余阻塞
   是 **Fillet 1 的 6 条 SWEPT_EDGE 分属 3 个 body**（selector operationSourceIds
   分别为 Revolve 1/2/3）：产品 FilletParams 单 `targetBodyId`，跨体圆角无合法
   载荷 → runner 按契约阻塞（`选中边跨 3 个 body`）。现有 featurePattern
   「源特征 delta → 单 target body」同理无法表达 FACE 全作用域。
3. 架构根因（既有裁决）：
   - `FeatureEngine.writeBodyFromCache` 要求「一个 body 恰一个源特征、入缓存
     恰 1 条 BRep 条目」（`FeatureEngine.ts:786-831`）；
   - 特征输出缓存按 featureId 键控（一个条目数组）；
   - `planInsert` 的 `targetBodyId` 是单值门禁（**N>1 regular 路径**；`newBody=true`
     走既有 global-chain anchor 例外），`deleteFeature` 同（N>1 多源 body 删除走
     `DELETE_TAIL_ONLY_ERROR`）。
   多目标输出会同时触碰 body 写回、源边、失败级联、冷重建、撤销与
   featurePattern/delete 语义，不能靠补丁绕过。

## 决策（提议，待实现）

### 选项

1. **扩展 FeatureOp 为多目标**（推荐）：`insertFeature.targetBodyIds?: string[]`
   （与单值 `targetBodyId` 互斥），首版只用于 **REMOVE 语义**的 extrude/hole
   （Links 场景）；后端对每个 target body 独立求值（各自链上游/缓存），
   特征行与多个 body 建立 FeatureDrives 边；feature 输出缓存改为
   `(featureId, bodyId) → entries`，写回逐 body 执行；失败**整特征回滚
   （all-or-nothing）**，逐 body 只做诊断隔离（2026-11-09 修正：部分成功会破坏
   单特征/撤销/冷重建语义，见「决策增量」D5/D6）。
2. **拆成 N 个内部特征行**（拒绝）：树/编辑/删除/撤销语义与 Onshape 单特征
   不一致，且隐藏行需要 schema 迁移；不得作为「完整复刻」。
3. **回放层拆 N 步近似**（拒绝用于 complete）：树会多出步骤，只能登记
   approximate/known-red，不能算绿。

### 首版范围（若批准）

- 契约（shared 增量，需版本 bump）：`FeatureOp.insertFeature` 增
  `targetBodyIds?: string[]`（`getBodies[].bodyKey`）；`MultiTargetPlan` 逐体上游/
  缓存/失败诊断。
- 后端：仅 `extrude/hole` 的 `operation=remove/throughAll` 支持多目标；
  其余特征/操作诚实拒收（不静默单目标）。
- featurePattern：先把「源特征 delta × 单 target」语义保持；多 body 输出
  另行切片（与选项 1 的缓存改造同源）。
- UI：多目标选择器需 live 证据；本 ADR 不包含 UI，能力保持 gated。
- 回滚：字段 additive；移除后回到单目标路径，旧库无迁移。

## 非目标

- 不做任意布尔多 target（booleanBodies 仍是 target+tools 语义）。
- 不做 splitPart keepBothSides 的双输出（另见 ADR-0012 blocked-design）。
- 不引入第二套 body/特征模型（P0-01/P0-06）。

## 验证（完成前）

- 后端 `MultiTargetRemoveFlow`：两 box body，一次 throughAll REMOVE 同时
  穿孔，逐 body 体积/谱系断言；失败原子性（all-or-nothing）与冷重建。
- 真栈 Links：2 body、体积 21,743.326 mm³、push+重开；树 featureType 数
  与 Onshape 一致（单 Extrude 3）。
- 回归：现有单目标 extrude/hole/booleanBodies/featurePattern 全绿。
- 完成前 Links 保持 known-red，不调容差。

## 2026-11-09 证据更新（Task 5/6，不构成实现/绿例）

### Task 5：面边界选择器批量证据

- 私有 collector 从 `example-index` 的 selector gate 构建 26 PS 工作清单：
  **128 个特征 / 801 条 CAP_FACE·SWEPT_FACE 查询**；其中 **9 条/8 个特征** 属
  `PROFILE_AREA_EVIDENCE` 轮廓证据通道，**792 条/120 个特征** 是 fillet/chamfer/
  shell/mirror/deleteBodies/enclose 的面边界选择器（fillet 699、chamfer 50、
  shell 26、mirror 12、deleteBodies 4、enclose 1）。
- collector 对同一 face id 出现在多个 body 的情况显式报 `ambiguous-face-id` 并
  拒收匹配；这证明**扁平 face/edge 引用在没有 body 归属时不能唯一解析**，冷重建
  尤其不能靠“扫描候选 body”猜。
- 四个 strict 探针（Hydraulic Components、Universal Joint Assembly ×2、Rear Shock）
  全部停在既有的 `sweptEdge`/`sweptFace matches=0`，没有新增严格绿；live 采集
  0/26（Onshape CDP 会话 401 过期），未写入任何伪造映射。
- **对多目标的含义**：多 body 契约必须先声明目标 body 集合，再在该集合内解析 ref；
  0 候选/多候选都失败封闭（`ambiguous`），禁止取第一个。面边界选择器本身的缺口
  仍是独立 blocker，不应被本 ADR 的实现“顺带”宣称为已解决。

### Task 6：Bumper 多边 fillet native 证据

- native probe confirmed the kernel boundary；具体测试名、拓扑计数、探针体积与
  内核错误码只记录在私有 `imodel-native` 审计台账（不在此复述）。公开侧只保留
  聚合结论：产品回放选中的多边 fillet 边集在内核边界失败，且 body **干净回滚**
  （无半成品）。
- 后端失败封闭守卫为**设计/未提交守卫，尚未进入产物**（结构：非空 entry 但零
  BRep；几何：BRep 结果 facet 体积非有限/≤0；Sheet/Wire 不做体积门）；设计态
  `FilletFlow` 13/13（仅私有工作树）。真栈 Bumper 仍 record
  **657,764.787 mm³（+3.303%）**、Fillet/Hole status=1，未放宽断言。
- **对多目标的含义**：跨体 fillet 必须**逐 body 组成独立的 `BlendEdges` 边集**，
  不得把多个 body 的边拼成一次调用；任一体失败=整特征 status=1 + 干净回滚。
  Task 6 **不证明** Handle Parts 的 6 条 SWEPT_EDGE/3 body 可由内核通过；该例仍
  保持 blocked-design/待验收，不以 ADR 冒充绿。

## 2026-11-09 决策增量：多目标契约（决策完整提案，提议/未批准）

> 本节补全原 ADR 的「选项 1」，但不改变其状态：**提议 / blocked-design**。
> 首实现切片仍是 REMOVE extrude/hole；fillet/pattern/mirror 跨体为后续切片。
> 未批准前不写产品代码。

### D1 公开契约：`targetBodyIds` + 内部逐体计划（混合）

```ts
// 本块只展示 insertFeature 的提案 delta；其余既有 FeatureOp 变体
// （insertSketch/updateSketch/deleteSketch/updateSketchConstraint/
//  setFeatureSuppressed/reorderFeature/undo/redo 等）保持不变。
type InsertFeatureOpDelta = {
  kind: "insertFeature";
  featureType: LubanFeatureType;
  params: FeatureParams;
  /** 旧单目标（N>1 模型 regular insert）；与 targetBodyIds 互斥。
   *  两者都缺省 = legacy N≤1 自动目标路径。 */
  targetBodyId?: string;
  /** 新多目标：getBodies[].bodyKey；与 targetBodyId 互斥；非空、去重、
   *  同一 Part Studio 的 active authored body。两者都缺省 = legacy N≤1 路径；
   *  N>1 **regular（非 newBody）** insert 必须显式给出 targetBodyId 或
   *  targetBodyIds；`newBody=true` 保留既有 global-chain anchor 例外；
   *  cPlane 不变（仍拒收 targetBodyId）。 */
  targetBodyIds?: string[];
};
// deleteFeature 的类型不变；其多输出删除语义见 D5/D8（不得删除用户 target body）。
```

- **不采用 per-body 子操作作为公开载荷**：若每个 body 复制一份 params，会出现两份
  事实源（P0-06）、树/编辑/哈希/回放语义分叉，且隐藏子行需要 schema 迁移。
- **采用内部逐体计划**：`MultiTargetPlan` 为每个目标 body 保存上游链、按 body 归属
  解析出的边/面子集、缓存键；公开载荷始终只有一份 `params` + `targetBodyIds`。
- 多 body 目标集是**校验与解析范围**，不是“把同一操作静默扩到所有 body”：只有明确
  列出的 body 参与；缺 body/重复/跨 PS/非 active→op 拒收。
- **互斥与缺省**：`targetBodyId` 与 `targetBodyIds` **互斥**；**两者都缺省 = legacy
  N≤1 自动目标路径**（不要求“恰一”）。**N>1 regular（非 newBody）insert** 必须显式
  给出其一，否则按既有 target 门禁拒收；`newBody=true` 保留既有 global-chain anchor
  例外；cPlane 不变（仍拒收 `targetBodyId`）。`targetBodyIds=[]`/重复/跨 PS/非 active
  一律拒收。

### D2 逐体内部计划与求值顺序

- `MultiTargetPlan = { targets: Array<{ bodyId; upstreamEntries; edgeRefs?;
  faceRefs?; cacheKey }> }`。
- 求值顺序**不构成持久语义**：`targetBodyIds` 是 op 参数、不写入 params；同一次 op 内
  按声明顺序只影响诊断顺序。冷重建按 `(featureId, bodyKey)` 字典序确定性执行；
  若未来需要声明顺序语义，必须持久化 ordinal（本提案不做）。
- body 之间不共享可变求值状态。
- 每个 body 独立求值，但**事务与失败域是整个特征**（见 D5/D6）。

### D3 各特征/操作的跨体语义

| 特征/操作 | 多目标语义 | 首版约束 |
|---|---|---|
| `extrude` / `hole`，REMOVE/throughAll | 同一工具路径逐个目标 body 施加 | **首实现切片只允许此形态**；ADD/NEW/其它终止条件多目标拒收 |
| `extrude` / `hole`，ADD/NEW 多目标 | 会对每个目标体合并/造体，语义未取证 | 拒收（blocked-capability） |
| `fillet` / `chamfer` | `params.edges` 扁平 ref 在声明目标集内逐 ref 找 owner body；按 owner 分组；每个非空组做一次 `BlendEdges`；fillet 用同一 `radius`/`propagateSmooth`，chamfer 用同一 `mode`/`values1`/`values2`（现有 ChamferParams） | 跨体边不合并；每组结果逐 body 写回；任一组失败整特征 status=1 |
| `shell` / `moveFace` | `params.faces` 同理按 owner body 分组；同一厚度/距离逐体应用 | 逐面差异参数（moveFace distancesMm）按组保持原顺序 |
| `featurePattern` | 源特征 `sourceFeatureId/sourceFeatureIds` 的 owner body 决定目标集；逐源取前/后差集，再逐 body 应用同一实例变换；多源跨体=各体各自差集 | 目标集须与源 owner 集合一致；不支持把 A 体增量阵列到 B 体（跨体复制不是本语义） |
| `featureMirror` | 逐源特征反射差集并应用到其 owner body；`operation=unite/subtract/intersect` 逐体执行 | `operation=new`（独立镜像体/多输出造体）仍属多输出语义，blocked-design；不在本增量 |
| `pattern`（PART/body 级 `PatternParams`） | 保持现有 body-level 语义，不是本 ADR 的多目标 | 不变 |
| `splitPart` keepBothSides | 双输出/多 body 写回，仍按 ADR-0012 切片 2 blocked-design | 不在本增量 |

- **ref 归属规则**：在声明目标集内逐 body 解析 ref；恰一个 body 命中=归属；0 命中=
  `target-ref-not-found`；多 body 命中=`target-ref-ambiguous`（Task 5 的
  duplicate-face-id 证据）。禁止按 ref 顺序/首个 body 猜测。
- 若某 body 组为空（如 fillet 只有 A 体边却被声明了 B 体）→ 整特征拒收，不做
  “空组跳过”。
- 跨体 fillet 的边集由**每组独立**提交内核；不得把一个 body 的边混入另一 body 的
  `BlendEdges`（Task 6 证明边集语义本身就是内核边界）。

### D4 旧单 target 载荷兼容

- **两者都缺省 = 既有单 target 自动路径逐字不变**（N≤1 模型；**N>1 regular（非
  newBody）** 由既有 target 门禁拒收；`newBody=true` 保留既有 global-chain anchor
  例外；cPlane 仍拒收 `targetBodyId`）；`targetBodyId` 继续被接受。**不要求“恰一”**
  ——`targetBodyIds` 缺省并不是错误。
- `targetBodyId` 与 `targetBodyIds` 同时出现、`targetBodyIds=[]`、重复 id、
  跨 Part Studio、非 active authored body → schema/op 边界拒收。
- `targetBodyIds` 长度为 1 时等价于单目标（允许，便于统一路径）；不改变旧库任何行。
- 旧 web/旧 shared 不发送新字段；旧库无迁移，旧载荷逐字兼容。
- 新字段只出现在 FeatureOp（op 参数），不写入 `params`。**冷重建的 target 集合从持久
  body 行（`sourceFeatureId=featureId`）与 FeatureDrives 边重建，并按 bodyKey 字典序；
  若某 target body 无法从持久数据归属到该特征 → 冷重建失败封闭（status=1），不猜。**
  实现前必须用 spike 验证 REMOVE 路径确实写入该归属（见 D7）。

### D5 事务与撤销

- **一个特征 = 一个 `FeatureOp` = 一个 `BriefcaseTxns` 事务**；所有目标 body 的写入、
  `(featureId, bodyId)` 缓存更新、FeatureDrives 边、op log、saveChanges 在同一事务内。
- 不按 body 开子事务；不允许多次 `txn.end("save")`。写租约仍是整 op 一个。
- undo：回滚所有 body 的几何/边/缓存标记；redo：按 op log 记录的目标集合（或持久
  body 归属）重新逐体求值。
- `deleteFeature` 的 body 语义（2026-11-09 修正）：必须区分**本特征创建的 body**与
  **本特征只修改的 target body**，不得把“删除特征”实现为“删除用户零件 body”。
  - **本特征通过 `newBody` 创建的 body**：沿用既有消费/删除守卫——仅当 `newBody=true`
    且该特征是该 body 的唯一源时才可被消费/删除；否则只删除特征行/边，body 保留
    （**现有 `planDelete` 的 N≤1 健康路径**口径；N>1 多源 body 删除走
    `DELETE_TAIL_ONLY_ERROR` 拒收，不落此分支；不因多目标扩大删除面）。判定“创建体”
    必须依据显式 `newBody`/造体语义与唯一源，不得用 `sourceFeatureId===featureId`
    反推（修改型特征也会改写 sourceFeatureId）。
  - **本特征只修改的 target body**（首切片 REMOVE extrude/hole 的常态）：删除特征行/
    边/op log，**保留 body 几何**；若该 body 仍被下游特征引用→拒收（引用守卫），
    不级联删除。
  - `deleteFeature.targetBodyId` 在多目标特征中指**被修改的目标 body 之一**（既有 N>1
    语义，用于消歧目标域），**不是要删除的 body**；特征行由 `featureId` 定位。
    不得据此删除 body。
  - 旧单输出 `deleteFeature` 不变。
  - 注意：现有 `planDelete` 对 **N>1 多源 body 删除**返回
    `DELETE_TAIL_ONLY_ERROR`，不会进入 N≤1 健康路径；本提案的多目标删除是新增路径，
    必须显式实现/测试，不能假设复用旧分支。

### D6 失败与回滚（分两级，不允许部分 body）

1. **事务前校验（pre-txn）**：schema/op 边界不合法——未知 feature type/op、目标字段
   双给/空/重复、target body 不存在/跨 PS/非 active、ref 归属 0 或多、forward/cycle
   → **op 拒收（`ok:false`）**；不创建 feature 行，不写 body/cache/边，不开写事务。
2. **求值失败（eval）**：上游 cache 缺失、ref 解析失败、内核失败、几何为空/无效、
   某 target body 子操作失败 → 走既有失败级联：**feature 行以 status=1 提交**
   （`markFailed` 口径），该特征不写任何 body/cache/边；其它目标体也不产生输出
   （失败域=整特征）。这不是“回滚掉 feature 行”，而是“保留失败行 + 无部分几何”。
3. **事务回滚**只用于写中断/op 异常；pre-txn 拒绝根本不写。不得把 eval 失败的
   status=1 行与“事务回滚”混为一谈。
4. 错误信息带逐 body 诊断（bodyKey + 阶段 + 错误码）；成功状态不部分提交。
5. 原 ADR「失败按 body 隔离」已修正为上述口径：body 之间不部分成功；Task 6 native
   「干净回滚」证据支持“无半成品 body”，不等于删除失败特征行。
6. 预览仍只写 shadow；某体预览失败则整预览失败/为空，不返回部分体。
7. 禁止假成功/静默 no-op：remove 在某体零去材也必须由语义判定（若 Onshape 视为
   no-op 则需 live 证据后显式允许；首版失败封闭），不得把零结果当成功。

### D7 冷重建、缓存与体谱系

- `FeatureOutputCache` 键改为 `(featureId, bodyId) → entries`；每个目标 body 仍要求
  **恰 1 条 BRep 条目**才写回（`writeBodyFromCache` 的 1 条不变式逐 body 保持）。
- 一个特征可驱动 N 个 body（1:N）；每个 body 的 `sourceFeatureId` 指向该特征，
  `FeatureDrives` 逐 body 建边；body alias 表按 bodyKey 维护 N 项。**target 集合不靠
  op 参数持久化**：冷重建从 body 行（`sourceFeatureId=featureId`）与 FeatureDrives
  重建；若某 target body 无法归属到该特征（例如 REMOVE 路径不更新 sourceFeatureId），
  必须持久化 target 列表/ordinal（schema 增量，另批）或冷重建失败封闭，不得猜。
  实现前必须用 spike 验证目标归属的持久化。
- `ensureWarm` 的就绪判定从“特征级 cache 存在”扩展为“该特征的全部目标 body cache
  存在”（目标集合按上条从持久化归属重建）；缺任一目标→冷重建该特征（或 status=1）。
- 冷重建按特征拓扑序 + **`(featureId, bodyKey)` 字典序**执行；源体在目标体之前求值；
  缺上游链路/目标集合不可重建→status=1，不输出部分 body。
- 失败/抑制的目标体语义：本增量只支持 active authored body；suppressed/consumed body
  作为目标→拒收，不静默跳过。

### D8 featurePattern / delete 级联

- **源为多输出特征**：`featurePattern`/`featureMirror` 的源差集按 (featureId, bodyId)
  逐体读取；实例只应用到该源所属 body。源集合不完整（某体无 cache）→ status=1。
- **引用守卫**：删除被 pattern/mirror/fillet 等下游引用的源特征仍由既有 FeatureDrives
  拒收；删除多目标特征时，若任一受影响 body 被下游引用→拒收并提示引用方。
- **删除多目标特征**：一次事务删除特征行/边/op log；对它**创建的 body**按既有
  `newBody`+唯一源守卫处理（满足才消费/删除，否则保留）；对它**只修改的 target body**
  保留几何、仅移除特征行/边；任一受影响 body 被下游引用→拒收。不得把“删除特征”
  实现为“删除用户 body”；破坏性级联另立 HITL/ADR。
- **已知 M1 缺口不扩大**：`deleteFeature` 目前不触发 body 再生（ADR-0007 切片 9
  known-red，16240 删除后仍为 16240）；本增量不得声称修复该缺口，冷重建后的结果
  另按该缺口口径验收。
- **tree**：多输出仍是一行特征 + 多个零件行，不新增第二套特征树/选择权威。

### D9 UI / 能力门禁

- 无 Onshape 多选目标 body/跨体 fillet 的 live 证据前，不新增多目标选择器/预览控件；
  能力保持 gated；先落 RPC/后端/回放。
- 特征树可显示“一特征驱动 N 体”的只读事实（若实现），但目标选择/编辑 UI 另采集证据。

### D10 拒绝的替代

- **拆成 N 个内部特征行**：树/编辑/删除/撤销与 Onshape 单特征语义不一致；隐藏行需
  schema 迁移；拒绝。
- **回放层拆 N 步近似**：树会多出步骤，只能登记 approximate/known-red，不能计绿。
- **公开载荷 per-body 复制 params**：双事实源、编辑/哈希/回放分叉；拒绝（D1）。

## 验证矩阵（增量，批准后实现时执行）

| 用例 | 验收 |
|---|---|
| `MultiTargetRemoveFlow`：两 box body，一次 throughAll REMOVE 同时穿孔 | 逐 body 体积/谱系；单特征行；push+冷重开 |
| 跨体 fillet 合成：3 body、每体 2 条可 blend 边、同半径 | 3 体各去材；一个特征行；每体独立 `BlendEdges`；任一体失败=整特征失败（status=1，无部分 body） |
| 跨体 shell/moveFace 合成：两面分属两体 | 逐 body 厚度/偏移；失败原子性 |
| featurePattern 多源跨体 | 逐体差集/实例；目标集与源 owner 一致；冷重建 |
| featureMirror 多源跨体 | 逐体反射/操作；`new` 仍拒收 |
| undo/redo + 冷开 | 所有目标体回到对应状态；缓存按 (featureId,bodyId) 重建；无部分体 |
| deleteFeature 多目标 | 创建体按 `newBody`+唯一源守卫消费/保留；target 修改体保留几何、仅删特征行/边；下游引用拒收；`targetBodyId` 只定位不删体；不冒充 M1 再生修复 |
| pre-txn 负路径：双字段/空数组/重复/跨 PS/非 active/ref 归属 0 或多/forward/cycle | **op 拒收（ok:false）**；无 feature 行、无 body/cache/边写 |
| eval 失败：上游 cache 缺/内核失败/几何空/某体子操作失败 | **feature 行 status=1**（既有 markFailed）；无部分 body/cache/边；其它目标体也无输出 |
| 目标字段缺省：两者都缺省 | N≤1 走 legacy 自动目标路径逐字；N>1 regular（非 newBody）按既有 target 门禁拒收；`newBody=true` 走既有 global-chain anchor；cPlane 不变（仍拒收） |
| 回归：现有单 target extrude/hole/booleanBodies/featurePattern/featureMirror/shell/fillet | 全绿；Links 仍 known-red 直到实现（不调容差） |
| Handle Parts（6 SWEPT_EDGE / 3 body）真栈 | 只有全绿才可宣称；否则 blocked-kernel/blocked-design，不用近似 |

## 回滚与发布（增量）

- **回滚方式**：字段 additive；停止接受 `targetBodyIds` 即回到单 target 路径；旧库
  无迁移。已产生的多目标文档**在旧 backend 中没有 `targetBodyIds`/多目标作用域语义
  保证**；回滚前须审计/导出受影响特征，或从启用前 checkpoint 恢复。不得用旧版本
  合并/忽略多目标 body，也不得把旧 backend 冷重建当作正确性保障。
- **兼容窗口**：shared bump → backend → web 同批发布；旧 web/旧 shared 不发送新字段。
  新 web/旧 backend：多目标 op 在 **N>1 regular（非 newBody）** 下会被旧后端既有的
  `targetBodyId` 单值门禁拒收（不是 opDsl 未知键丢弃）；但 `newBody=true` 可能走旧
  global-chain anchor 并**忽略 `targetBodyIds`**（不是拒收），cPlane 仍按旧行为。
  因此不能依赖旧 backend 拒绝所有多目标 op。已有多目标文档在旧 backend 冷重建时
  **不能假定失败封闭或自动拒绝**：旧后端会按单 target 语义重新求值，结果可能不符合
  多目标作用域；回退前按上条审计/checkpoint 恢复，不把旧冷重建当作正确性门禁。
- **发布门**：上述验证矩阵全绿、单 target 全量回归、冷开、`verify-stack`；不把
  AIRR/ADR 当绿例。

## 状态

- 本节与原文均为**提议 / blocked-design** 的完整范围；2026-11-10 已按用户指令实现
  B6.3 首切片（见下），其余范围仍待批准/实现；**不是绿例**。
- 首实现切片：多目标 **fillet** 的 `targetBodyIds` + 逐边 `bodyKey` + 逐体缓存/写回/
  持久化输入映射/冷重建；**B6.2（2026-11-11，shared 1.68）扩展 throughAll
  REMOVE extrude/hole**，Links 两体一次穿孔几何严格绿；delete/update/suppress、
  跨体 pattern/mirror、UI 多选与预览为后续切片。

## 实现记录（2026-11-10，B6.3 首切片）

- **shared 1.65.0**：`insertFeature.targetBodyIds?: string[]`（与 `targetBodyId` 互斥）；
  `FilletEdgeRef.bodyKey?: string`；`opDsl` 双向序列化/互斥/去重校验。
- **backend（私有）**：`planInsertMulti`（仅 fillet、≥2 active authored body、每个 target
  恰一上游/至少一组边、owner 必须落在 target 集）；单特征行 + 逐 target rewire +
  `jsonProperties.luban.multiTargetInputs`；`FeatureOutputCache` 逐 body side cache；
  `FeatureEngine` 逐体取上游 + 每次 `BlendEdges`，任一体失败整特征 status=1；
  `writeBodyFromCache` 按 body 读 side cache；冷重建逐体重算。
- **replay**：edge-resolver 逐边附 `bodyKey` 且去重键含 body；runner 单 owner 走旧
  `targetBodyId`，多 owner 走 `targetBodyIds`；`multi-body-anchor` 新增
  `selectEdgeTargetBodies`（owner 必须 active；空/失效 blocked）。
- **合成验证（私有 backend）**：2-body 多目标 fillet 单特征行、两体几何均改写；
  冷重建逐字节一致；pre-txn 负路径零写；失败原子性（第 2 体失效 → 整体 status=1，
  两体保留旧几何）；T11b 两体各自 `BlendEdges` 内核成功。`FilletFlow` 13/13、
  `MultiBodyFoundation` 34/34。
- **Handle Parts 真栈（2026-11-11 闭合）**：6 条边按 `bodyKey` 正确分组
  （1/3/2），单特征行/树 status=0。±4.2% 的 Threaded Shaft 差**不是 fillet**：
  converter 把 Linear pattern 1 的 `directionOne`（上游 revolve 的 SWEPT_FACE）
  映射为被选草图线的世界 +Z，15 个 remove 实例全部落在轴外，只去材 27.993 mm³
  （应约 1.3e3）；修正为旋转轴 -X 后，最终三体 **11,878.438 / 30,944.712 /
  105,771.136 mm³** vs 采集 11,878.505 / 30,931.280 / 105,770.915
  （+0.0006% / +0.043% / +0.0002%），整链 **148,594.286 vs 148,580.700
  （+0.009%）**，11 步树全 status=0，push+冷重开一致；spec 移除 `test.fail`
  升级 strict。多目标 fillet 的逐体 BlendEdges/side cache/冷重建由此获得真实
  示例验收。
- **B6.2 throughAll REMOVE extrude/hole（2026-11-11，shared 1.68）**：
  `FeatureEngine.evaluateHoleInto`/`evaluateSweepFeatureInto` 抽出返回值内核；
  新增 `assertMultiTargetRemoveParams` + `evaluateMultiBodyRemove`（逐 target
  读各自上游缓存、同一 REMOVE 参数求值、逐体恰 1 BRep、任一失败整特征失败）；
  `preEvaluateDirty`/`rebuildAll` 的 multiTargetInputs 分支扩到 extrude/hole；
  同步 EDE 路径对多目标行 fail closed；`applyInsertMulti` 补 sketch 解算/面域
  边界/sketch→feature 驱动边。
- **replay**：`targetBodyIds` 由 booleanScope 的全部造体源解析（跳过 sketch
  等非造体源；造体源缺失 fail closed）；修复 regionRisk 前缀把“孔内孤岛”区域
  一并选中的问题（Links Extrude 2 区域 [0,1] 会填实 R5 孔，+157.075 mm³）。
- **合成验证**：`MultiBodyFoundation` T9g 两 box 一次 throughAll remove 单特征
  行、逐体 2.4/4.8 mm³、冷重建逐字节一致；负路径（add/blind/混单目标/重复）
  txn 前拒收、零写。T9h 多目标 hole：单孔位只命中 body1（3.215 mm³），
  未命中的 body2 保持 8 mm³ 且单 BRep，冷重建一致。后端全量 **925 passed +
  1 expected fail + 8 skipped**。
- **Links 真栈（几何严格绿，约束仍 dropped）**：两体 **10,039.240 /
  11,704.087 mm³** vs 采集 10,039.241 / 11,704.085（<0.001%），6 步树全
  status=0，push+冷重开一致。`links-multi-remove.spec.ts` 不含约束完整性门；
  该 PS 仍因 slot FIX/OFFSET + external EQUAL 未映射而保持 `blocked-converter`，
  不得计为 complete。
