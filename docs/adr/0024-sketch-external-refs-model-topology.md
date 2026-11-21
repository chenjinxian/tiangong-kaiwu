# ADR-0024：草图外部引用增量——模型边/面拓扑引用

- 状态：**已接受（2026-11-21，随用户 AIRR 批准）**；**条件性接受**：S0 探针可将
  S4（INTERSECTED / SILHOUETTED）降级为 blocked-design / blocked-kernel，或将 S2
  降级为受限固定点 partial（见 ADR-0025 §2.6）。降级只改变能力状态与切片范围，
  不改变本 ADR 的 S1/S3 契约、失败封闭与单一事实源口径。
- 日期：2026-11-21
- 关联：ADR-0009（母 ADR；切片 1a 已实现）、ADR-0004（草图契约）、ADR-0025
  （solver-neutral 固定参考几何）、已批准 AIRR
  `docs/superpowers/specs/2026-11-21-sketch-external-references-airr.md`（证据/复用矩阵/
  测试矩阵以 AIRR 为准，本 ADR 不重复）、计划
  `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` §5 B3。
- 影响面：`luban-cad/packages/shared`（提案 1.85.0）、私有 `modeling-server`、
  `luban-cad/apps/web`、`luban-cad/packages/viewer`（仅显示增强）。

## 1. 背景与证据

- 当前产品只有**草图→草图投影**（ADR-0009 切片 1a，shared 1.35.0）：`insertSketch.projections`
  接受同 Part Studio 另一张草图的 line/circle/arc/point；`SketchExternalRef` 只有
  `{ kind: "sketchEntity" }`；投影实体读时重投影、不参与 DOF，约束引用投影实体在 op 边界
  一律拒收。模型边/面引用与 PIERCE / INTERSECTED / SILHOUETTED 均**未实现**。
- 架构事实（ADR-0009 2026-11-07 结论不变）：草图读取/面域/`getSketch` 是同步链
  （`readResolvedSketch` / `SketchRegions` / `FeatureService.getSketch`）；模型边/面拓扑只能经
  异步 `SolidModelingCommand` 读取。切片 1b 是**读路径架构**切片，不是 blocked-kernel。
- 只读语料聚合（sanitized，2026-11-21 快照）：292 个含 `features.json` 的 Part Studio、
  1,948 个含约束的草图特征中，PROJECTED **4,881**、PIERCE **413**、INTERSECTED **172**、
  SILHOUETTED **31**；693 个草图特征至少含一类，覆盖 125/292 个 Part Studio。
  三态 registry 中 114 行含至少一类外部引用 blocker，**0 行**仅由外部引用阻塞，25 行还缺
  body oracle——因此本能力是**参数化完整度前置能力**，不是 strict 数的直接增量。
- 本 ADR 收敛并取代 2026-11-09 那份「提议/未批准」的切片 1b 设计增量；ADR-0009 中
  切片 1b / 切片 2 的条文继续有效，契约细节以本 ADR 与已批准 AIRR 为准。

## 2. 决策

### 2.1 DTO-2：`externalRefs` 是持久外部引用的唯一列表

新增 `SketchExternalReferenceDto[]`（`params.externalRefs` 与读面同形）作为**唯一持久引用
列表**；实体上的 `projected` 标记保留旧字段并新增 `refId` / `derivation` 作为关联/显示冗余。
契约形状以 AIRR §4.3 为准，本 ADR 冻结以下要点：

```ts
/** 旧 1.35 sketchEntity 形态逐字保留；新增 bodyEdge / bodyFace。 */
export type SketchExternalRef =
  | { kind: "sketchEntity"; sketchId: string; entityId: number;
      part?: "curve" | "start" | "end" | "center" }
  | { kind: "bodyEdge"; bodyId: string; topologyRef: LubanTopologyId;
      part?: "curve" | "start" | "end" }
  | { kind: "bodyFace"; bodyId: string; topologyRef: LubanTopologyId;
      loops?: "outer" | "all" };

export type SketchExternalRefKind =
  | "project" | "projectEndpoint" | "pierce" | "intersect" | "silhouette";

export interface SketchExternalReferenceDto {
  id: number;                 // 草图内稳定引用 id（不是实体 id）
  kind: SketchExternalRefKind;
  source: SketchExternalRef;
  entityIds: number[];        // 派生根实体 id（按块分配；PIERCE 可为空）
  localEntityId?: number;     // PIERCE：被约束的本地点/端点
  options?: { silhouette?: "aligned" | "antiAligned" | "outer" | "inner" };
  construction?: boolean;     // 来源构造性；缺省 false
}
```

- `SketchProjectedMarker` 增 `refId?: number`、`derivation?: SketchExternalRefKind`；
  旧 `source` / `derived` 逐字保留，旧载荷与旧库直接可读。
- `SketchProjectionRequest` 变判别联合：旧 `{ entityId, sourceSketchId, sourceEntityId }`
  逐字兼容；新请求 `{ entityId, source: SketchExternalRef }`。`insertSketch` 的 `projections`
  是请求通道，`externalRefs` 是持久表；同一引用不得在请求与表中重复声明（冲突拒收）。
- `SketchDto` 增可选 `externalRefs?: SketchExternalReferenceDto[]` 与
  `projection?: { status: "ok" | "failed"; failedRefIds: number[]; errors: ... }`。
- **不新增** `SketchConstraintDto.kind` 的 projected/pierce/intersect/silhouette（DTO-3 拒绝）：
  外部引用是独立表，不是求解约束；UI 可在约束/特征面板按 `externalRefs` 合成只读显示行。
  ADR-0004 §1 中 `kind: "projected" | "pierce"` 的早期提案从未实现，本 ADR 明确不采用。
- **单一事实源**：`externalRefs` 是唯一持久引用；实体标记的 `source` 只是兼容/显示冗余。
  服务端新写入时校验 `externalRefs[id].source` 与实体标记一致，冲突拒收；不得由两处推断出
  不同引用。投影几何仍只在读面派生，不写 `params`、不写 native geometry stream、不建影子元素。

**兼容性**：JSON/Runtime additive；旧 1.35 请求/标记/旧库逐字有效。但 `SketchExternalRef` /
`SketchProjectionRequest` 从单形态变判别联合是 **TS 源码级不兼容**——所有直接访问
`source.sketchId` / `request.sourceSketchId` 的消费者必须同批窄化（shared/backend/web 同 PR 列车）。

**旧客户端写保护（omission guard）**：`updateSketch` 若库内已有非空 `externalRefs` 而 op 未携带
该键，服务端拒绝 `projection-external-refs-omitted` 并零变更；禁止旧 web/旧脚本静默清空引用。

**entity id 块分配**：每个外部引用请求占 `entityId .. entityId+n−1` 连续块；根曲线按环/请求
顺序、派生点随后；块与既有实体 id 冲突、块重叠、越界或超 4096 实体 → op 拒收；不做局部
重排或隐式再分配。`updateSketch` 的 `externalRefs[].entityIds` 必须与实体/块一致，服务端只
校验不重排。PIERCE 无派生曲线，`entityIds` 为空；隐藏交点不占持久实体 id。

**USE_END**：S1 用 `bodyEdge.part = "start" | "end"` 表达边端点投影，**不新增持久 vertex 契约**
（当前公开 `CanvasSelection` 明确 vertex 无持久 id）。若 live 证据证明必须独立 vertex 引用，
另做 ADR 增量，不在本 ADR 内扩展。

### 2.2 读路径 B：异步预求值 + 可失效进程内快照 + 同步读

拒绝全异步读路径（A：签名级联、求值器重入/死锁未定义、显示轮询成本高）与把投影几何
物化进 `params`（C：第二事实源，违反 P0-06）。采用 **B**：

- **生成时机**：`preEvaluateDirty` / `rebuildAll` 在求值消费特征前按拓扑序调用
  `prepareSketchProjections([sketchId])`；`evaluateChainForPreview` 预览前同样准备；
  `FeatureRpcImpl.getSketch` 在 `ensureInitialized()` 后、同步 `getSketch()` 前做**只读**准备
  （不新增 RPC、不写库、不拿写租约）。
- **快照键**（进程内、派生、绝不落库）：`sketchId` + `sourceDigest`（`params.externalRefs` 的
  canonical JSON 摘要，按 ref id 排序）+ `bodyRevision`（逐源 body：bodyId、sourceFeatureId、
  特征链 params 摘要、DirectEditGuard 覆盖标记、进程内 `lastBodyWriteEpoch`）+ `changeEpoch`
  （scope 级进程内单调：undo/redo、import/迁移、无法归属 body 的直改、结构性依赖图变更时 bump）。
- **失效规则**：源 body 的 FeatureOp/直接编辑/undo/redo/抑制/删除/结构重排 → bump 对应
  `bodyRevision`；归属不明的提交只 bump scope `changeEpoch` 并清空该 scope 快照。
- **同步读面**：`readResolvedSketch` / `SketchRegions` / `FeatureService.getSketch` 签名不变，
  只查快照；快照缺失/不匹配 → 失败封闭（`projection-snapshot-missing` /
  `projection-snapshot-stale`），不得回退插入时坐标、最近边/面或旧快照。
- **冷开/只读/undo**：允许读 hook 只读补算；只读 briefcase 绝不为了显示去写库；补算失败
  → 读面 `projection.status="failed"`，消费特征 `status=1`。
- **状态下发**：`FeatureService.getSketch` 捕获解析错误后返回结构化 `projection` 状态与
  `failedRefIds`，**不返回失败引用的旧曲线**；成功时 `projection` 可缺省或 `{status:"ok"}`。
- **性能**：每 revision 只解析一次；同步读面/显示轮询/hover 不触发 native 命令。目标单草图
  ≤100 个外部边/环、典型 body 投影预求值 <100 ms（实施时测量并登记）。

### 2.3 范围：S1/S3 确定，S4 条件性

- **S1（本 ADR 确定范围）**：模型边/边端点投影（PROJECTED USE / USE_END）。直线边任意平面
  精确投影；圆/弧仅平行平面（含反向）；样条边、曲面边、非平行圆/弧（椭圆）诚实拒收；
  `construction` 来源标志必须传递（修复 1a 的构造性丢失缺口）。
- **S3（本 ADR 确定范围）**：平面面边界投影（`bodyFace.loops = "outer" | "all"`）。外环在前、
  孔环随后，逐边精确投影；任一环非精确（非平面面、非平行圆弧边、样条边）→ **整面拒收**，
  不做部分环/部分成功；逐边 id 按块分配。
- **S2（PIERCE）**：外部引用 kind 与 `localEntityId` 由本 ADR 定形；求解器语义由 ADR-0025
  定形。PIERCE 不新增 `SketchConstraintDto.kind`。
- **S4（条件性）**：INTERSECTED 仅在 S0 探针证明**精确**面×草图平面求交、且输出可落在现有
  line/arc/circle DTO 能力内时实现；SILHOUETTED 在当前公开内核接口无精确轮廓 API 时登记
  blocked-design / blocked-kernel，UI 诚实禁用。禁止折线化、采样或近似转绿。
- **明确排除**：样条/椭圆/椭圆弧投影；跨平面圆弧（非平行投影为椭圆）；非平面面/曲面边；
  轮廓与“内部交线”未探针前一律 blocked；跨文档/派生/导入几何（excluded-import）；任意
  FeatureScript 查询求值；单引用多查询/多源（语料全为单查询，拒绝而非取第一条）；
  以投影近似替代 imprint/face split（ADR-0006 边界不变）；无 live 证据前新增外部选择器、
  投影线样式或失败提示控件。

### 2.4 失败封闭与错误码（公开设计错误码）

| 组 | codes | 插入/更新 | 读面 | 消费特征 |
|---|---|---|---|---|
| 源/形状 | `projection-source-missing`、`projection-source-ambiguous`、`projection-non-exact`、`projection-degenerate`、`projection-unsupported`、`projection-forward-reference`、`projection-cross-project`、`projection-cycle`、`projection-source-changed-type` | op 拒收（零变更） | `projection.status="failed"` + `failedRefIds` | `status=1` |
| 快照 | `projection-snapshot-missing`、`projection-snapshot-stale` | — | failed；重算后自动恢复 | `status=1` |
| PIERCE | `projection-pierce-miss`、`projection-pierce-ambiguous` | op 拒收 | failed | `status=1` |
| 旧客户端 | `projection-external-refs-omitted` | `updateSketch` 拒收、零变更 | — | — |

- `detail` 为 locale-neutral 字符串，前端做 zh/en 映射；日志只记错误码与 source 摘要，
  不打印完整 BRep/私有坐标。
- **绝不允许**：回退插入时坐标、最近边/面/草图区域、旧快照、折线化/采样轮廓；失败引用的
  旧曲线不得下发。修复源（恢复参数/取消抑制/重建引用）后下一次预求值自动恢复。

### 2.5 依赖边、删除守卫与循环

- 外部引用源不是草图时，驱动边从「源草图」扩展为「源 body 的当前产出/修改特征」；源 body
  后续被 fillet/hole 等改写 `sourceFeatureId` 时必须重接 incoming 边，否则上游改参不触发重算。
- 删除源 body 特征若被投影草图依赖 → 引用守卫拒收；删除投影草图清 incoming 边；禁止
  「草图 → body → 草图」循环。消费特征创建时保留「全部上游外部引用源 → 消费特征」直连边。

### 2.6 版本、持久化与发布

- **版本提案**：shared **1.85.0**（`LubanFeatureRpcInterface.interfaceVersion` bump）；实施时若
  基线已前进，按当时下一 minor，并同 PR 更新接口冻结矩阵与能力账本。
- **无 schema 类变更**：`externalRefs` 是草图 `params` JSON 的 additive 键；旧库无该键 =
  无外部引用，无需迁移。旧数据 fixture（无投影 / 1a 草图投影 / 含 plane / 含 regions）逐字通过。
- **发布**：shared → modeling-server → web 同批；旧 1.35 载荷/旧库兼容；含 body 引用的文档
  必须新 backend + 新 web 才能编辑；`verify-stack` 全绿才发布。

## 3. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|---|---|
| 读路径 A：全异步草图读面 | 签名级联到 `FeatureEngine`/`SketchRegions`/ScenarioReplay 与大量单测；求值器内部再开命令的重入/死锁未定义；显示轮询成本高 |
| 读路径 C：写时物化投影几何进 `params` | 违反 P0-06（派生几何成为第二事实源）；上游变化需重写全部消费方；undo/redo 差分爆炸 |
| DTO-1：只扩实体标记 | PIERCE 无派生实体；面环需 N 个根；无逐引用状态/选项/localEntityId |
| DTO-3：四类都塞进 `SketchConstraintDto.kind` | PROJECTED 当前是实体标记会重复表示；solver-neutral kind enum 变更；派生几何与求解约束混表 |
| 采样/折线化近似轮廓或交线 | 假能力，P0-06/P0-10 与 parity 状态定义禁止；宁可 blocked |

## 4. 跨仓影响

| 仓/层 | 契约/schema | native/接口 | 测试 | 发布 |
|---|---|---|---|---|
| shared | `SketchExternalRef` 联合、`SketchExternalReferenceDto`、请求联合、状态/错误 DTO；TS 源码不兼容，消费者同批窄化 | 无 | 契约/schema 单测、`test:types` | 同批 |
| modeling-server（私有） | `externalRefs` omission guard、快照 provider、失效键、预求值/读 hook、边/面精确投影、PIERCE 展开、驱动边 | 复用 `SolidKernel.h`/子实体几何；默认不改 native | 单测 + StandaloneDb + 真栈 | shared 后同批 |
| web | 消费 `externalRefs`/`projection`；Use 覆盖层扩边/端点/面候选（复用 `readBrepEdgeHandles`/`readBrepFaceHandles` + `resolveEdgeRef`/`resolveFaceRef`）；状态/错误显示；构造性回写 | 无 | 单测 + 真栈 | 同批 |
| viewer | 投影线样式/失败态仅显示增强 | 无 | 装饰件/视觉单测 | 可选同批 |
| editor / itwinjs-core | 无（复用拾取/拓扑读面） | 无 | 拾取回归 | 不变 |
| imodel-native | 默认不改；若 silhouette 必须新增接口，另 ADR + ctest + provenance | 条件性 | 另批 | 另批 |
| converter（test-only） | 仅在外部查询可解析到产品持久拓扑引用时映射；否则保持 dropped，不猜 | 无 | corpus 计数对账 | 不适用 |

## 5. 测试计划（计划；未运行前不得宣称完成）

- **shared**：旧 1.35 请求/标记逐字通过；新联合恰一分支；`externalRefs` 持久/读取；块冲突/
  越界/重复/`refId` 唯一；错误码/状态 DTO；`test:types` 消费者窄化；旧前端忽略未知键。
- **契约/版本**：`interfaceVersion` bump 与同批握手；旧 backend + 新载荷明确失败（不静默丢）；
  新 backend + 旧载荷 1a 行为逐字不变；omission guard 拒收零变更。
- **StandaloneDb**：20×20 盒顶面四边 → 闭合投影环 → 拉伸 10 = **4000 mm³**；改上游尺寸 →
  投影/体积联动、源 body 不变；平行圆柱端面圆投影；单条非平行直线只断言端点坐标；非平行
  圆/弧/样条边/非平面面拒收；平面面外环+孔环面域；源边/面失效 → `projection-source-missing`
  且消费 `status=1`；跨 body；直接编辑源 body（DirectEditGuard）→ 快照失效；无关 body 直改
  → 快照命中；undo/redo 无陈旧投影；冷开重开一致；只读 briefcase 无写且缺失快照失败封闭；
  PIERCE 坐标+DOF 与 0/多交点/切点/边在平面内拒收；旧库 fixture；构造性源不进面域。
- **真栈 e2e**：`sketch-projection-body.spec.ts`（成功 + 失败注入）、`sketch-pierce.spec.ts`
  （成功 + 失败）、`sketch-face-projection.spec.ts`；1a `sketch-projection.spec.ts` 与
  `sketch-use.spec.ts` 回归；`tutorial2` / `first-part` / `alignment` / `iOS` 等重开不变。
  S4 若 blocked：不建假 spec，仅 probe 报告 + 能力 gated 测试。
- **语料**：预期 strict 翻绿 **0**；25 个 near-flip 行仍受 body oracle 阻塞；converter 只在
  可解析时映射；不得宣称本能力单独提升 strict。

## 6. 回滚

- **停止创建**：op 边界对 bodyEdge/bodyFace/pierce/intersect/silhouette 请求返回明确未支持；
  旧 1a 草图源投影逐字不变；web 不提供入口（能力 gated）。
- **读取**：新 backend 可读已有引用文档；回滚到旧 backend 时含 body 引用的草图**失败封闭**
  （`projection-unsupported`/未知 kind），**不静默丢弃曲线/引用**，数据保留前滚。
- **迁移回滚**：无迁移；旧库/旧 changeset 无需回滚脚本。回滚窗口内只允许前滚修复或从启用前
  checkpoint 恢复。
- **发布门**：shared/backend/web 同批；旧库 fixture、真栈回归、冷开、`verify-stack` 全绿。

## 7. P0 对照

| 规则 | 本 ADR 口径 |
|---|---|
| P0-01 iTwin 唯一底座 | 数据/事务/视图/选择继续用 iModel/BIS/标准工具与选择权威；不新建模型库/渲染平台 |
| P0-02 源码唯一事实源 | 只消费 itwinjs-core/editor 现有 API；不手改 `lib`/`dist`；不新增 fork |
| P0-03 复用优先 | 拓扑复用 `SolidModelingCommand`/`LubanTopologyId`；快照复用 `FeatureOutputCache` 模式；不建第二套 |
| P0-04 先论证后编码 | 已批准 AIRR + 本 ADR + ADR-0025；S0 未过不写 S1+ 产品代码 |
| P0-05 单一建模/编辑管道 | 写入仍走 `LubanFeatureRpcInterface` FeatureOp；UI 复用 `Sketch.*`/选择权威 |
| P0-06 单一数据源 | `params.externalRefs` 是唯一持久引用；投影几何读时派生；快照不落库 |
| P0-07 契约唯一/版本 | shared 1.85.0 提案；shared→backend→web 同批；旧载荷兼容矩阵 |
| P0-08 fork/native 最小 | 默认不改 native；silhouette 新接口另 ADR/ctest/provenance |
| P0-09 内核/求解器冻结 | 求解器语义只经 solver-neutral（ADR-0025）；不改 ACIS 授权范围；libslvs 仅云 SaaS |
| P0-10 可撤销/HITL | 标准 FeatureOp/事务；X-05 复核/登记；失败零变更；无静默不可逆 |

## 8. 条件性接受与 S0 退出条件

1. **S4 降级条件**：面×草图平面精确求交探针失败、或输出无法映射到 line/arc/circle →
   INTERSECTED 登记 blocked-kernel/design；无精确轮廓 API → SILHOUETTED 登记 blocked，
   不写近似算法；能力账本 gated，不宣称 full。
   - **2026-11-21 S0 结果**：现有面-面求交对柱/锥/环/拉伸面失败；精确平面切片算法存在但
     未暴露，需 native wrapper + JS 线 + native ADR + ctest，非圆椭圆需 DTO 决策 →
     **S4a blocked（条件性可行）**；S4b 无产品轮廓接口、内部接口需许可评审/语义证据 →
     **S4b blocked-design/kernel**。
2. **S2 降级条件**：ADR-0025 的固定曲线探针失败 → 仅隐藏固定点方案，约束引用投影曲线
   拒收，PIERCE 能力 partial；切点/多交点语义未证 → 首版失败封闭。
   - **2026-11-21 S0 结果**：固定 line/circle/arc/spline 内部合成约束可表达；隐藏 fixed 点
     + coincident 可表达 PIERCE → **S2 line/arc 放行**；point-on-spline 契约缺口 →
     样条 PIERCE blocked。
3. **UI 条件**：无 live 证据前不新增外部边/面选择器、Use/Project 对话框、投影线样式与
   失败提示控件；后端/契约可先行，UI gated。
   - **2026-11-21 S0 结果**：Use（`u`，边/面）、Intersection「交点」、Pierce「穿透」
     `shift+g` 入口已采；offset/spacing/构造性、投影线样式、失败提示仍缺 →
     入口可进入实现，选项/样式子项 gated。
4. **X-05 条件**：外部引用写入复用整体覆写 op，必须复核原生 undo 证据或在 `EXCEPTIONS.md`
   更新例外登记，否则 P0-10 不允许发布。
5. **兼容矩阵条件**：接受「含 `externalRefs` 的文档仅新 backend + 新 web 可编辑」；不接受
   则需要更复杂的双向兼容设计，另 ADR。
6. **S0 门禁**：证据/探针/ADR 完成前不进入 S1；S0 证据落私有，公共侧只保留 sanitized 摘要。
   - **2026-11-21 S0 状态**：ADR-0024/0025 已接受；公共 probe 摘要已落盘；live UI 入口
     已采。**S1 放行**；S2 line/arc；S3 逐面精确性；S4 按上述 blocked。

## 9. 接口冻结矩阵更新要求

`docs/architecture/INTERFACE-FREEZE-MATRIX.md` 当前只有「已落地版本 + 验收证据」形态，没有
planned/pending 列，故本 ADR **不修改**该矩阵。实施落地时必须在同一 PR：

- 把 `LubanFeatureRpcInterface` 行的版本从 **1.84.0** 更新为 **1.85.0**，并追加 v1.85 条目
  （`SketchExternalRef` 联合、`SketchExternalReferenceDto`、`SketchProjectionRequest` 联合、
  `SketchDto.externalRefs/projection`、错误码；S4 条件性/blocked 状态如实登记）。
- 同步 `@luban-cad/shared` 总契约行的版本与验收证据。
- 按 ADR-0025 更新 Solver-neutral 行的接口变更证据与冻结 hash（私有仓冻结清单）。

## 10. 关联文档

- `docs/adr/0009-sketch-external-references.md`
- `docs/adr/0004-sketch-contract-onshape-parity.md`
- `docs/adr/0025-solver-fixed-reference-geometry.md`
- `docs/superpowers/specs/2026-11-21-sketch-external-references-airr.md`
- `docs/architecture/INTERFACE-FREEZE-MATRIX.md`、`docs/architecture/EXCEPTIONS.md`
- `docs/DEVELOPMENT-RULES.md`（P0-04/P0-06/P0-07/P0-09/P0-10）

---

*本 ADR 为已批准 AIRR 的 ADR-0009 增量条文；未写产品代码、未改 shared/backend/web 契约、未 commit/push。*
