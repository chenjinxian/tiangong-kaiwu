# AIRR — 草图外部引用（模型边/面 → PROJECTED / PIERCE / INTERSECTED / SILHOUETTED）

- 状态：**已批准（2026-11-21 用户确认）**。批准口径为 AIRR 设计及其 S0→S5 分片（S4
  仍为条件性）；本文件是设计门禁与证据材料，**不是实现、不是绿例**；S0 证据/ADR/probe
  通过前仍不写 S1+ 产品代码（P0-04）。
- 日期：2026-11-21
- Owner：用户（2026-11-21 确认批准）
- 关联需求：计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` §5 B3（W1–W2）
  与 §4 W1 门禁；ADR-0009（已接受；切片 1a 已实现，1b/2 待实现）。
- 关联前序设计：
  - `docs/adr/0009-sketch-external-references.md`
  - `docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md`（提议/未批准；
    本文件收敛其切片 1b 方案并扩展到四类外部引用，**取代其设计增量**，ADR 条文仍以 ADR-0009 为准）
  - `docs/superpowers/specs/2026-11-13-sketch-use-projection-airr.md`（已实现：草图→草图 Use UI）
  - `docs/superpowers/specs/2026-11-19-sketch-entity-constraint-expansion-airr.md`
    （S4 外部引用列为后续切片）
  - `docs/adr/0024-sketch-external-refs-model-topology.md`（ADR-0009 增量：DTO-2/读路径 B/范围）
  - `docs/adr/0025-solver-fixed-reference-geometry.md`（solver-neutral 固定参考几何）
- 预计影响仓：`luban-cad/packages/shared`、私有 `luban-backend/modeling-server`、
  `luban-cad/apps/web`、`luban-cad/packages/viewer`（仅显示增强）、
  `luban-cad/packages/editor`（复用拾取/拓扑读面，原则上不改）。
- 是否需要 ADR：**是**。
  1. ADR-0009 增量：外部引用扩展到模型边/面与四类约束语义；
  2. solver-neutral「固定参考几何（fixed reference geometry）」接口变更（P0-09）；
  3. 若轮廓（silhouette）必须新增 native 接口，另需 native 接口 ADR（P0-04/P0-08）。
  ADR 未批准前，仅允许 S0 证据/探针，不允许写产品代码。

---

## 0. 结论先行

- **当前产品只有草图→草图投影（ADR-0009 切片 1a）与草图源 Use UI**；模型边/面投影、
  PIERCE、INTERSECTED、SILHOUETTED 均未实现。本 AIRR 不声称任何一项已实现。
- **语料侧四类约束是真实存在且量大的草图约束缺口**：只读扫描（2026-11-21 快照）
  292 个 `features.json` / 1,948 个含约束的草图特征中，PROJECTED **4,881**、
  PIERCE **413**、INTERSECTED **172**、SILHOUETTED **31**；693 个草图特征至少含一类。
  但三态 registry 中**没有任何一行**仅由这些约束阻塞：114 行含其中至少一类，
  **25 行**只差「外部引用 + body oracle」，且当前缺失 body oracle；因此本能力
  **不是当前回放转 strict 的直接开关**，产品价值在 Use/Project 工作流与参数联动。
- **推荐方案 B：异步预求值 + 可失效的进程内投影快照 + 同步读面**（沿用
  2026-11-09 AIRR 的裁决），并新增**外部引用表（externalRefs）**作为持久引用的唯一列表；
  拒绝「把投影几何物化写进 params」的方案（P0-06 第二事实源）。
- **求解器侧需要一条新的固定参考语义**：投影/派生几何不参与 DOF，但可被约束引用；
  PIERCE 展开为「隐藏固定交点 + coincident」。该接口变更必须先过 ADR（P0-09）。
- **S4（INTERSECTED / SILHOUETTED）存在硬证据缺口**：当前 `SolidKernel.h`/公开头文件
  接口没有轮廓 API；面×平面精确求交也需探针（S0 已证现有面-面求交/由面建片体候选
  不可用于柱/锥/环/拉伸面）。**未证明精确前登记 blocked-design / blocked-kernel，
  不做折线或采样近似。**
- 主要阻断项（影响批准）见 §9.4：solver-neutral 固定参考 ADR、精确轮廓/求交探针、
  Use/Project 选项/样式证据、X-05 草图整体覆写 undo 例外。

---

## 1. 目标与验收

### 1.1 用户问题

Onshape 的 Use/Project 允许把**已有实体的边、顶点或面边界**投影到当前草图，作为可约束、
可参与面域的参考几何；PIERCE/INTERSECTED/SILHOUETTED 进一步提供点落曲线、面×草图平面交线、
轮廓线等外部引用。上游实体改参数或改拓扑后，投影与下游特征应自动更新。

当前产品：

- `SketchExternalRef` 只有 `{ kind:"sketchEntity" }`；
- `insertSketch.projections` 只接受同 Part Studio 另一张草图的实体；
- 投影在读面时同步重投影，实体边/面拓扑只能经异步 `SolidModelingCommand` 读取——两链路
  尚未打通（ADR-0009 切片 1b 的架构结论保持不变）；
- 约束**不允许**引用投影实体 id（切片 1a 的诚实拒收）；
- 因此用户无法完成「模型边 → 草图 → 拉伸/切除」的 Use/Project 工作流，也无法在改上游
  尺寸时自动更新投影。

### 1.2 可观察验收标准（批准后实现时）

1. **边/顶点投影（PROJECTED USE / USE_END）**：用户可在草图内选择同一 Part Studio 的
   模型边或边端点，生成精确投影曲线/点；平行平面上的圆/弧保持圆/弧，非平行平面上的
   直线边保持直线；非平行圆/弧（椭圆）、样条边、曲面边**诚实拒收**，不折线化/不椭圆近似。
2. **面边界投影（PROJECTED 面源）**：平面面的外环/全部环逐边精确投影；非平面面、
   非平行圆弧边、样条边**整面拒收**（不做部分投影/部分成功）。
3. **PIERCE**：草图点/线端点可约束到模型边上（精确求边×草图平面交点）；源变化后
   该点随交点更新；0 交点、切点、多交点、边在平面内等歧义形态**失败封闭**并给出错误码。
4. **INTERSECTED**：仅当存在**精确**面×草图平面求交算法时生成交线；输出的曲线类型
   必须落在现有 DTO 能力内（line/arc/circle），否则拒收/登记 blocked，不采样近似。
5. **SILHOUETTED**：仅当存在**精确**轮廓算法时生成轮廓线；否则能力登记
   blocked-design / blocked-kernel，UI 诚实禁用，不造假控件。
6. **参数联动**：上游 body 改参数（持久拓扑引用仍有效）→ 投影/约束/面域/下游特征自动更新；
   真栈至少一条「盒体顶面四条边 → 闭合投影环 → 拉伸 10 mm = 4000 mm³（20×20 盒）」，
   以及一条「改上游尺寸 → 下游体积变化」；push + 冷重开后一致。
7. **失败封闭**：源 body/边/面/顶点被删除、抑制、拓扑失效、跨 Part Studio、前向引用/循环、
   快照缺失/过期、非精确几何时，草图读面返回 `projection.status="failed"` + 错误码；
   消费特征 `status=1`；**禁止**回退到插入时坐标、最近边/面、旧快照或近似几何。
   插入/更新阶段失败则 op 拒收，不落半成品。
8. **持久化**：草图 `params` 只保存外部引用（source refs、结果实体 id、选项、插入时快照）；
   投影几何每次从源重新派生（P0-06）。旧 1.35 载荷与旧库逐字兼容，无需迁移。
9. **Undo/redo 与重开**：外部引用写入走标准 FeatureOp/事务；undo/redo 后不出现陈旧投影；
   push + 冷重开不丢失引用。X-05（草图整体覆写非 invertible）仍适用，必须在
   `EXCEPTIONS.md` 复核/登记（见 §9.2 R11 / §9.4）。
10. **不伪造映射**：converter/replay 只在外部查询能解析到产品持久拓扑引用时映射；
    解析不到保持 dropped，不猜最近边/面、不把坐标近似当能力。

### 1.3 Onshape/live/参考证据

- **已实现基线**：ADR-0009 切片 1a（2026-11-07，shared 1.35.0）——草图源投影、读时重投影、
  不参与 DOF、约束不可引用、驱动边；真栈 `e2e/sketch-projection.spec.ts` 2 passed
  （2000→3000 mm³，push + 重开）。
- **已实现 UI**：2026-11-13 草图源 Use（`SketchUseOverlay` + `internal/sketch-use.ts`），
  只列同 Part Studio 当前草图之前的其它草图（最近 8 张），无实体边/面候选。
- **语料证据**：本文件 §2 的只读扫描（私有 corpus 的 sanitized 计数与参数形态）。
- **live UI 证据（2026-11-21 探针，sanitized 结论）**：
  - Use 工具 `command-id=USE`（`u`，tooltip「使用（投影/转换）」，说明「边或面投影到活跃
    草图平面」）；选择模型边时高亮并显示 `长度: 50.00 mm`，选择模型面时出现面选择指示。
  - Use 组下拉还含 `INTERSECTION`「交点」（「曲面或面与活跃草图平面的交点投影」）——
    S4a 的 live UI 入口。
  - PIERCE 是约束工具「穿透」（`shift+g`，「使一个草图图元与活跃草图平面之外的另一个
    图元重合」），不是独立投影命令；S2 应按约束接入。
  - 搜索「轮廓」「投影」均无匹配：**没有独立 Project/Silhouette 工具**；S4b 仍在
    当前 UI 无入口，继续 blocked-design/kernel。
  - 仍缺：Use 的 offset/spacing/构造性选项、投影线样式、源删除/抑制失败提示；UI 的
    这些子项保持 gated，不新增假控件。

### 1.4 非目标（明确不做）

- 不做任意 FeatureScript 查询求值；不做跨文档/派生/导入几何（excluded-import）。
- 不做非平面面、曲面边、样条边、椭圆/椭圆弧投影的近似；首版一律拒收。
- 不把投影几何写入 `params` 作为第二事实源，不写 native geometry stream。
- 不新增第二套建模/选择 API；不新增 native 接口（除非 silhouette 探针证明必须，且另过 ADR）。
- 不以投影近似替代 imprint/face split（ADR-0006 的边界仍成立）。
- 不在无 live 证据时新增 Use/Project 外部选择器、投影线样式、失败提示控件。

---

## 2. 证据清单（2026-11-21 只读扫描）

> 方法：只读扫描私有 parity 语料的 `documents/**/features.json`（292 个）与
> `sketches.json`（156 个 / 1,220 张草图），统计 `constraintType` 与参数形态；另读
> `manifest/tri-state-registry.json`（1,685 行）。输出仅为聚合计数与去除 id 的形态摘要，
> 不复制原始 id、不落私有路径。ADR-0009 的旧计数（PROJECTED 4,775 / PIERCE 469 /
> INTERSECTED 210，224 个 PS）与本次不同，原因是用例覆盖范围与快照时间不同；本文件以
> 本次可复现扫描为准，不修改 ADR 历史数字。

### 2.1 约束出现次数与草图覆盖

| 约束 kind | 出现次数 | 含该类约束的草图特征数 | 说明 |
|---|---:|---:|---|
| PROJECTED | **4,881** | 571 | 含 USE / USE_END / SILHOUETTE_START / SILHOUETTE_END |
| PIERCE | **413** | 113 | 点/端点落到外部边 |
| INTERSECTED | **172** | 73 | 面×草图平面交线 |
| SILHOUETTED | **31** | 19 | 面轮廓线 |
| （对照）OFFSET | 701 | — | 已有产品能力；本 AIRR 不处理 |
| （对照）MIRROR | 4,631 | — | 已有产品能力 |

- 至少含一类外部引用的草图特征：**693 / 1,948（含约束草图）**。
- 至少含一类外部引用的 Part Studio：**125 / 292**。
- PROJECTED 的 `projectionType` 分布：USE **2,452**；USE_END **2,244**；
  SILHOUETTE_START **97**；SILHOUETTE_END **88**。
- 所有外部查询均为**单查询**（`BTMIndividualQuery`，deterministicIds 或 queryString 的
  语义计数 n=1），没有一次引用多条外部边/面。

### 2.2 三态 registry 行级影响

| 指标 | PROJECTED | PIERCE | INTERSECTED | SILHOUETTED |
|---|---:|---:|---:|---:|
| registry 行含该 blocker | 102 | 26 | 17 | 15 |
| 其中 `approx` | 17 | 2 | 1 | 5 |
| 其中 `blocked` | 85 | 24 | 16 | 10 |
| 该行**仅有**此 capability 类阻塞（无其它能力缺口） | 0 | 0 | 0 | 0 |

- 含任一外部引用的 registry 行合计 **114**；**没有一行**只被外部引用阻塞。
- **25 行**的 blocker 仅由「`blocked-evidence:no-body-oracle` + 外部引用约束」组成：
  23 行仅 PROJECTED、1 行仅 PIERCE（`Exercise: Drawing / Part Studio 1`）、
  1 行 PROJECTED+SILHOUETTED（`Onshape Quickstart / BINDER CLAMP`）。
  这些行**即使本能力全部实现**也仍缺 body oracle，不会自动转 strict。
- 其余 89 行还缺 converter/feature/body oracle 等阻塞（sheet metal、splitPart、sweep、
  loft、rib、deleteBodies、assignVariable、draft 等）。
- 因此本能力在语料上的角色是：**参数化完整度的前置能力**，不是 strict 数的直接增量。

### 2.3 代表文档（sanitized 名称，无 id）

| 文档 / Part Studio | 证据 |
|---|---|
| `Onshape Quickstart / Crankset` | PROJECTED 411、PIERCE 25、INTERSECTED 12（密集用法） |
| `Jackhammer / Lower Covers` | PROJECTED 327、PIERCE 78、INTERSECTED 41、SILHOUETTED 1 |
| `Exercise: Gear and Rack and Pinion Relations / Arbor Press` | PROJECTED 446（纯 USE 类密集） |
| `Onshape Quickstart / Brake Lever` | SILHOUETTED + BEZIER_DEGREE；registry 仅缺 body oracle |
| `Exercise: Drawing / Part Studio 1` | PIERCE；registry 仅缺 body oracle |
| `Tutorial 1 - Onshape Tour / Rocker` | PROJECTED；registry 仅缺 body oracle |

### 2.4 Onshape 实际约束/查询形态（去除 id）

以下为 `features.json` 中真实存在的参数结构摘要（`<...>` 为占位符）：

**PROJECTED — USE（曲线/边/草图实体）**
```
constraintType: "PROJECTED"
entityId: "<localCurveId>.project"
parameters:
  projectionType: "USE"
  localFirst: "<localCurveId>"
  externalSecond: BTMIndividualQuery(deterministicIds:["<externalId>"])
                  | qCompressed(..., entityType=EDGES, historyType=CREATIONS,
                                queryType=SKETCH_ENTITY, sketchEntityId=<...>)
  sketchToolType: "USE"
```
**PROJECTED — USE_END（边端点/顶点）**
```
projectionType: "USE_END"
localFirst: "<localCurveId>.start" | "<localCurveId>.end"
externalVertex: BTMIndividualQuery(... entityType=VERTEX, queryType=SKETCH_ENTITY ...)
externalVertexEdge: BTMIndividualQuery(... entityType=EDGES, queryType=SKETCH_ENTITY ...)
sketchToolType: "USE"
```
**PROJECTED — SILHOUETTE_START / SILHOUETTE_END**
```
projectionType: "SILHOUETTE_START" | "SILHOUETTE_END"
参数槽位与 USE / USE_END 同族（externalSecond 或 external0/external1），
local 一侧为 ".start"/".end"；**具体几何语义未经 live 证实，列为开放问题**
```
**PIERCE**
```
constraintType: "PIERCE"
parameters:
  externalEdge: BTMIndividualQuery(deterministicIds:["<externalId>"])
  localEntity: "<localCurveId>.start" | ".end" | "<localPointId>"
  sketchToolType: "SECTION"   // 413 条中 302 条带此元数据
```
**INTERSECTED**
```
constraintType: "INTERSECTED"
parameters:
  localCurve: "<localCurveId>"
  externalFace: BTMIndividualQuery(...)   // 少数可解码：entityType=FACE / CAP_FACE，
                                          // queryType=SKETCH_ENTITY，historyType=CREATIONS
  sketchToolType: "SECTION"
```
**SILHOUETTED**
```
constraintType: "SILHOUETTED"
parameters:
  silhouetteType: "ALIGNED" | "ANTI_ALIGNED" | "OUTER" | "INNER"
  localCurve: "<localCurveId>"
  externalFace: BTMIndividualQuery(... entityType=FACE ...)
```
**查询解析现状**：7,582 个外部 `deterministicId` 中 **0 个**能直接匹配 `sketches.json`
的草图实体 id；它们是不透明短 id。仅少数 `qCompressed` 查询可解码出
`entityType=EDGES/VERTEX/FACE`、`historyType=CREATIONS`、`operationId`、
`queryType=SKETCH_ENTITY`、`CAP_FACE` 等语义。**converter 不能仅凭静态 corpus 把大多数外部
查询解析成产品持久拓扑引用**——这是 converter 映射的证据缺口（§9.2/§9.3）。

### 2.5 已解算几何 vs 约束树：当前被丢弃的是什么

- **本地引用可解析率**：398 个外部约束的本地字符串引用中，**397 个**能按 base id 匹配到
  `sketches.json` 的已解算实体（384 PROJECTED、7 PIERCE、4 SILHOUETTED、2 INTERSECTED）。
  说明回放语料已把投影/交线结果作为普通 line/point/circle/arc 实体烘焙进草图。
- `sketches.json` 的 1,220 张草图共 28,563 point、10,429 line、1,403 arc、1,340 circle；
  **没有** external/projected 实体类型——外部引用不是独立实体类，几何已被扁平化。
- 在可匹配的样本中，外部引用目标实体以 **line/point** 为主（未命中 circle/arc）；
  这不证明全集没有圆弧投影（opaque 查询占多数），但支持首切片先做边/端点。
- **对回放几何的影响**：多数情况下为 **tree-only**——约束被 converter 丢弃，但已解算坐标
  仍在，因此现有回放体积不变；丢的是参数化关系、约束树与源变更传播。
- **对产品的影响**：为 **geometry-affecting**——新建草图时无法生成外部几何；
  PIERCE 改变求解 DOF；INTERSECTED/SILHOUETTED 生成新曲线；源变更后必须联动。

| kind | 回放（已解算 corpus） | 产品新建/编辑 | 参数化再生 |
|---|---|---|---|
| PROJECTED / USE / USE_END | tree-only（曲线/点已在 sketches.json） | 生成派生曲线/点 | 源变更驱动重投影 |
| PIERCE | tree-only（点已在解算坐标） | 约束点落边，改变 DOF | 源变更驱动点更新 |
| INTERSECTED | tree-only（交线已烘焙） | 生成交线 | 源变更驱动交线重算 |
| SILHOUETTED | tree-only（轮廓线已烘焙） | 生成轮廓线（条件性） | 源变更驱动轮廓重算 |
- **外部源种类无法静态区分**：PROJECTED 的 `externalSecond` 既可指向另一张草图的实体，
  也可指向模型边（Use 的通用曲线槽）；PIERCE/INTERSECTED/SILHOUETTED 的参数名分别给出
  edge/face 语义，但多数查询只有 opaque deterministicId。因此「草图源」由现有 1a 覆盖，
  「模型边/面源」必须由新切片解析；converter 不得按参数名猜几何。
- **为什么现在丢掉**：
  1. shared 没有模型边/面的 `SketchExternalRef` 形态；
  2. 后端 `SketchProjection` 只读另一张草图的 `params`，没有 body 拓扑读取；
  3. converter 的 `kindMap` 不含这四类，统一 `droppedItems`；
  4. 外部 `deterministicId` 不透明，静态 corpus 无拓扑解析；
  5. 无精确面×平面/轮廓算法（INTERSECTED/SILHOUETTED）。

---

## 3. 当前实现基线（已存在，勿重复实现）

### 3.1 草图→草图投影（ADR-0009 切片 1a，shared 1.35.0）

- 契约：`insertSketch.projections?: SketchProjectionRequest[]`（`sourceSketchId /
  sourceEntityId / entityId`）；`SketchEntityDto.projected?: SketchProjectedMarker`
  （`source` + `derived?`）；`SketchExternalRef` 仅 `{ kind:"sketchEntity" }`。
- 写面：`FeatureService.precomputeSketchWrite` 校验源属于本 scope、请求不重复、id 不冲突，
  `synthesizeProjectionEntities` 合成投影组：
  - line = 2 派生点 + 线（root id、+1、+2）；
  - circle/arc = 圆心派生点 + 曲线；point = 点；
  - 圆/弧仅平行平面（含反向，`PARALLEL_TOL=1e-6`）；非平行诚实拒收；
  - 样条源拒收。
- 求解：`splitProjectedEntities` 剔除带 `projected` 标记的实体，投影不参与 DOF；
  约束引用投影实体 id 在 op 边界诚实拒收（切片 1a）。
- 读面：`resolveProjectedEntities` 每次按源草图当前解重投影；派生点由所属曲线统一刷新；
  源实体类型漂移 → 抛错；`SketchRegions.sketchRegionsFrom` / `readResolvedSketch` 走
  同一条同步读链，投影曲线参与面域识别；extrude/revolve/loft/sweep/hole 等消费面域/
  草图点，因此读时联动。
- 依赖：`insertSketch` 建「源草图 → 投影草图」驱动边；消费特征创建时补「全部上游投影源
  → 消费特征」直连边（`addProjectionDriveEdges` / `projectionSourceClosure`）；
  删源草图被驱动边守卫；删投影草图清 incoming 边。
- UI：2026-11-13 `SketchUseOverlay`（只草图源、最近 8 张、树序在前）、
  `buildProjectedSketchEntity`、`updateSketch` 一次提交、删除级联派生点。

### 3.2 求解器与约束引用

- `SolverTypes`/`SketchWireNormalizer`/`SlvsSolver` 是 solver-neutral 三层；
  `fixed` 约束只接受**单个 point**，把参数放入 `lockedGroup`（不新增方程、不计 DOF）。
  目前没有「固定曲线」语义。
- 约束 kind 现有 19 种（含 `symmetric`、`slotWidth`）；没有 `pierce`/`intersection`/
  `silhouette`。
- `projected` 只被 `FeatureService`/`SketchProjection` 消费；solver 模块本身不感知
  `projected` 标记（写/读两侧先 split）。

### 3.3 读面/面域/求值/显示链路

- `FeatureRpcImpl.getSketch` → `await ensureInitialized()` → `FeatureService.getSketch`
  （**同步**）→ `resolveProjectedEntities` → `splitProjectedEntities` →
  `solveStateForRead` → `sketchRegionsFrom`。
- `FeatureService.getSketch` **没有** `projection` 状态字段；`resolveProjectedEntities`
  抛错时 RPC 直接抛裸错误，不是结构化的 `status=failed`。
- 特征求值（`FeatureEngine`）同样在同步段读草图；异步段只有 `preEvaluateDirty` /
  `rebuildAll` / `evaluateChainForPreview` 对**特征**做预求值；草图不是 Feature 行，
  没有自己的异步预求值阶段。
- 草图几何不写 native geometry stream（2026-11-04 单一数据源裁决）；显示由
  `SketchCurvesDecoration` 从 `getSketch` DTO 画屏幕空间曲线；不是 tile/内核 tessellation。
- `SketchCurvesDecoration` **不区分** projected 曲线：活动草图内所有曲线同色；
  `construction` 决定是否虚线；投影线没有专属样式。

### 3.4 公开 web 已可复用的拓扑读面

- `apps/web/src/modules/part-studio/internal/brep-topology.ts`：
  `readBrepEdgeHandles` / `readBrepFaceHandles` / `readBrepFaceHandle` 经
  `SolidModelingCommand` + `EvalCarrier` 读边/面几何；支持 line/arc 描述与面环 Loop。
- `CanvasSelection` 的 face/edge 条目已携带 `ownerBodyKey` + `topologyId`
  （`LubanTopologyId`）；`FilletEdgePickTool` / `OnshapeSelectTool` 已接
  `resolveEdgeRef` / `resolveFaceRef`。**vertex 无持久契约**（现有注释明确）。
- `readBrepFaceHandle` 已被草图平面来源（cPlane 对面）复用；可作面边界投影的读面基础。
- 草图拾取/标注（`SketchEntityPicker`、`useSketchAnnotations`、尺寸/约束 glyph）消费
  `activeSketch.entities/constraints`；投影实体当前作为普通实体可拾取，但后端 1a 拒收
  约束引用。外部引用落地后，UI 必须区分「固定参考」并在工具边界给出可理解的失败提示。

### 3.5 基线的已知缺口/缺陷（本 AIRR 必须顺带修复或登记）

1. `insertSketch.projections` 的合成不携带源实体的 `construction` 标志；
   UI `updateSketch` 路径会携带，脚本/RPC 路径会丢。外部引用表落地时必须统一
   「构造性来源的传递」，否则投影构造线会在重读后变实体线/参与面域。
2. 读面失败没有结构化状态；新增 body 引用后必须改为 `projection.status="failed"` +
   错误码，不能抛裸 RPC 错误。
3. `SketchExternalRef` 当前是单形态 interface；扩为判别联合是 **TS 源码级不兼容**，
   消费者必须同批窄化（见 §4.4）。
4. 草图整体覆写 op 的 undo 例外 X-05 仍开放；外部引用写入会复用同一 op，需在
   `EXCEPTIONS.md` 复核并给出证据或登记例外。

---

## 4. 设计选项与推荐

### 4.1 读路径选项

| 选项 | 做法 | 优点 | 缺点/风险 |
|---|---|---|---|
| A. 异步草图读路径 | `readResolvedSketch`/`sketchRegionsFrom`/`getSketch` 全 async，每次读经 `SolidModelingCommand` 解析 | 永远当前几何、无缓存失效 | 签名级联（FeatureEngine/SketchRegions/ScenarioReplay/大量单测）；求值器内部再开命令的重入/死锁未定义；显示轮询成本高；只读/undo 仍需失败封闭 |
| **B. 异步预求值 + 可失效同步快照（推荐）** | 在既有 pre-eval/rebuild/read hook 中把外部引用解析成进程内快照；同步读面查表；缺失/过期失败封闭 | 异步边界收敛；不改同步求解/面域签名；与 `FeatureOutputCache` 同构；可测试 | 失效键正确性是主要风险；冷开/undo/只读需补算或失败封闭；快照绝不能落库 |
| C. 写时物化投影几何进 `params` | 每次源变化时重写所有消费草图的投影坐标 | 读路径最简单 | **违反 P0-06**（派生几何成为第二事实源）；上游变化要重写全部消费方；undo/redo 差分爆炸；旧快照会被误用 |

**裁决：B。** A 作为未来演进保留（若真实语料证明快照失效不可控再评估）；C 拒绝。

### 4.2 持久 DTO 选项

| 选项 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| DTO-1. 只扩实体标记 | 只扩 `SketchProjectedMarker.source`，不新增列表 | 改动最小；旧载荷天然兼容 | PIERCE 没有派生实体；面环需要 N 个 root；source 重复；无逐引用状态/选项 |
| **DTO-2. 新增 `externalRefs` 列表（推荐）** | `SketchExternalReferenceDto[]` 作为持久引用的唯一列表；实体标记用 `refId` 关联；旧 1a 标记在读面合成 legacy refs | 四类统一；逐引用 `entityIds/localEntityId/options/construction`；状态/诊断有落点；旧数据可读 | `SketchExternalRef` 变联合是 TS 源码级破坏；新写 op 必须携带 `externalRefs`（需 omission guard） |
| DTO-3. 新增四种 `SketchConstraintDto.kind` | 把四类都塞进 solver constraint 列表 | 与 Onshape 约束树直观对应 | PROJECTED 当前是实体标记，会重复表示；solver-neutral kind enum 变更；派生几何与求解约束混在一张表 |

**裁决：DTO-2。** `SketchConstraintDto.kind` 首版不新增四类；读面下发
`externalRefs`，UI 可在约束列表中按外部引用合成显示行。若 live 证据要求这些行必须参与
约束列表交互，再加只读投影，不改变持久事实源。

### 4.3 契约形状（设计草案，未落盘；当前 shared 1.84.0，实施时下一 minor 提案 1.85.0）

```ts
/** 外部源（同一 Part Studio）。旧 1.35 的 sketchEntity 形态逐字保留。 */
export type SketchExternalRef =
  | { kind: "sketchEntity"; sketchId: string; entityId: number;
      part?: "curve" | "start" | "end" | "center" }
  | { kind: "bodyEdge"; bodyId: string; topologyRef: LubanTopologyId;
      part?: "curve" | "start" | "end" }
  | { kind: "bodyFace"; bodyId: string; topologyRef: LubanTopologyId;
      loops?: "outer" | "all" };

export type SketchExternalRefKind =
  | "project" | "projectEndpoint" | "pierce" | "intersect" | "silhouette";

/** 持久外部引用行；params.externalRefs 与读面同形。 */
export interface SketchExternalReferenceDto {
  id: number;                       // 草图内稳定引用 id（不是实体 id）
  kind: SketchExternalRefKind;
  source: SketchExternalRef;
  /** 派生根实体 id（按块分配；PIERCE 可为空）。 */
  entityIds: number[];
  /** PIERCE：被约束的本地点/端点引用 id。 */
  localEntityId?: number;
  /** INTERSECTED/SILHOUETTED/面源选项。 */
  options?: { silhouette?: "aligned" | "antiAligned" | "outer" | "inner" };
  /** 来源构造性；缺省 false（语料证据：多数投影实体为 solid）。 */
  construction?: boolean;
}

/** 实体标记：旧字段 source/derived 逐字保留；新增 refId/derivation 关联外部引用表。 */
export interface SketchProjectedMarker {
  kind: "projected";
  source: SketchExternalRef;
  refId?: number;
  derivation?: SketchExternalRefKind;
  derived?: boolean;
}

/** v1.35 旧请求逐字兼容；新请求必须带 source。 */
export type SketchProjectionRequest =
  | { entityId: number; sourceSketchId: string; sourceEntityId: number }
  | { entityId: number; source: SketchExternalRef };

export type SketchProjectionErrorCode =
  | "projection-source-missing" | "projection-source-ambiguous"
  | "projection-non-exact" | "projection-degenerate"
  | "projection-unsupported" | "projection-forward-reference"
  | "projection-cross-project" | "projection-cycle"
  | "projection-snapshot-missing" | "projection-snapshot-stale"
  | "projection-pierce-miss" | "projection-pierce-ambiguous"
  | "projection-source-changed-type" | "projection-external-refs-omitted";

export interface SketchProjectionErrorDto {
  refId?: number;
  source?: SketchExternalRef;
  code: SketchProjectionErrorCode;
  detail?: string;                 // locale-neutral；前端做 zh/en 映射
}

export interface SketchProjectionStatusDto {
  status: "ok" | "failed";
  failedRefIds: number[];
  errors: SketchProjectionErrorDto[];
}

export interface SketchDto {
  /* 既有字段不变 */
  externalRefs?: SketchExternalReferenceDto[];
  projection?: SketchProjectionStatusDto;
}

export type FeatureOp =
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[];
      plane?: SketchPlaneDto; projections?: SketchProjectionRequest[];
      externalRefs?: SketchExternalReferenceDto[] }
  | { kind: "updateSketch"; sketchId: string; entities: SketchEntityDto[];
      constraints: SketchConstraintDto[]; externalRefs?: SketchExternalReferenceDto[] }
  /* 其它 op 不变 */;
```

- **兼容性**：JSON/运行时 additive；旧 1.35 投影请求/标记/旧库逐字有效。但
  `SketchExternalRef`/`SketchProjectionRequest` 从单形态变为判别联合，是 **TS 源码级不兼容**；
  任何直接访问 `source.sketchId` / `request.sourceSketchId` 的消费者必须同批窄化。
- **单一事实源**：`externalRefs` 是唯一持久引用列表；实体标记的 `source` 为兼容/显示冗余，
  新写入时服务端校验其与 `externalRefs[id].source` 一致，冲突拒收；不得由两处推断出
  不同引用。派生几何仍只在读面派生。
- **旧客户端写保护**：`updateSketch` 若库内已有非空 `externalRefs`，而 op 未携带该键，
  服务端拒绝 `projection-external-refs-omitted`（零变更），避免旧 web/旧脚本静默丢引用。
- **entityIds 块分配**：每个外部引用请求占 `entityId..entityId+n−1` 连续块；根曲线按环/
  请求顺序、派生点随后；冲突/越界/超 4096 实体 → op 拒收；不做局部重排。
- **`USE_END`**：用 `bodyEdge.part="start"|"end"` 表达，不新增 vertex 持久契约
  （当前 public `CanvasSelection` 明确 vertex 无持久 id）。若 live 证据证明必须独立
  vertex 引用，另做 ADR 增量。

### 4.4 读时解析与快照

**快照键**（进程内，派生，不是事实源）：

```ts
interface ProjectionSnapshotKey {
  sketchId: string;
  sourceDigest: string;   // params.externalRefs 的 canonical JSON 摘要（按 ref id 排序）
  bodyRevision: string;   // 逐源 body：(bodyId, sourceFeatureId, 特征链 params 摘要,
                          //   DirectEditGuard 覆盖标记, lastBodyWriteEpoch)
  changeEpoch: string;    // scope 级：undo/redo、import/迁移、无法归属 body 的直改、
                          //   结构性依赖图变更时 bump（进程内单调）
}
interface ProjectionSnapshot {
  key: ProjectionSnapshotKey;
  refs: Map<number, { status: "ok" | "failed"; entities?: SketchEntityDto[];
                      errors?: SketchProjectionErrorDto[] }>;
  generatedAtMs: number;  // 仅诊断，不参与相等判定
}
```

- **键重建规则**：`sourceDigest` 从持久化 `params.externalRefs`（旧库从 projected 根标记）
  重建，不依赖内存请求顺序；`bodyRevision` 的持久部分=产出/修改特征 id + 特征链 params
  摘要，`lastBodyWriteEpoch` 只用于进程内失效；`changeEpoch` 只需进程内单调。
- **bump 规则**：源 body 的 FeatureOp/直接编辑/undo/redo/抑制/删除/结构重排；
  无法归属具体 body 的提交只 bump scope `changeEpoch` 并清空该 scope 快照。
- **生成时机**：
  1. `preEvaluateDirty` / `rebuildAll` 在求值消费特征前调用
     `prepareSketchProjections([sketchId])`（拓扑序）；
  2. `evaluateChainForPreview` 在预览求值前同样准备；
  3. `FeatureRpcImpl.getSketch` 在 `ensureInitialized()` 后、`getSketch()` 前调用只读
     `prepareSketchProjections([sketchId])`（不新增 RPC、不写库）；
  4. 冷开/只读/undo 后缓存缺失 → 读面失败封闭或由读 hook 只读补算；不得为了显示去写库。
- **不得**：把快照写入 `params`/native geometry stream/影子元素；不得用插入时坐标回退；
  不得跨进程共享或依赖 TTL。
- **快照状态**：`FeatureService.getSketch` 捕获 `ProjectionResolutionError` 后返回
  `projection.status="failed"` + `failedRefIds`，并且**不返回失败引用的旧曲线**；
  成功时 `projection` 可缺省或 `{status:"ok", errors:[]}`（旧前端忽略未知键）。
- **依赖边**：外部引用源不是草图时，驱动边从「源草图」扩展为「源 body 的当前产出/修改特征」；
  源 body 后续被 fillet/hole 改写 `sourceFeatureId` 时必须重接 incoming 边，否则上游改参
  不触发重算（实现阻断项）。删除源 body 特征若被投影草图依赖 → 引用守卫拒收；删除投影
  草图清 incoming 边；禁止草图→body→草图循环。

### 4.5 求解器行为

- **派生实体固定**：投影/交线/轮廓曲线不参与 DOF；建议给 solver-neutral 增加
  `fixed?: boolean`（或 `fixedEntityIds`），把其全部参数放入现有 `lockedGroup`
  （与 `fixed` point 同机制），不新增方程；`dof` 由 libslvs 自然排除。
  **注意命名不与现有 `fixed` 约束混淆**：现有 `fixed` 是「单 point 锁定」的用户约束；
  本项是「整条派生曲线作为固定参考」的实体级语义。
  **这是 solver-neutral 冻结接口变更，必须先 ADR。**
- **约束可引用性**：派生曲线/点可作为**固定参考**被约束引用（coincident/tangent/
  distance 等消费另一侧的 DOF）；切片 1a 的「一律拒收」改为「引用固定参考可以，
  但不得把固定参考当可移动实体」。全为固定参考的约束视为检查：满足则接受、不满足则
  `conflicting`；若证明会制造假绿，首版可拒收。
- **PIERCE 展开**：
  - 求外部边与草图平面的精确交点（`CurvePrimitive.appendPlaneIntersectionPoints`
    对样条；line/arc 解析解）；
  - 交点唯一 → 合成隐藏固定点（`fixed`，不计 DOF）+ `coincident` 到本地点/端点；
  - 0 交点 → `projection-pierce-miss`；多交点/边在平面内 → `projection-pierce-ambiguous`；
    **切点语义未经 live 证明，首版失败封闭**。
- **回落方案（若 fixed 曲线 ADR 未批）**：只允许固定点；约束引用投影曲线一律拒收，
  能力登记 partial。不得用「最近点/采样」冒充。
- **约束树**：`solve.failedConstraintIds` 归因到外部引用行时使用 external ref id 映射；
  不把隐藏点/内部构造泄漏为用户可见约束。

### 4.6 面域边界

- 派生曲线与普通曲线同源参与 `sketchRegionsFrom`；`construction` 为 true 时不参与面域
  （与现有一致）；PIERCE 的隐藏点不参与面域。
- 面源投影按拓扑环顺序生成：外环在前、孔环随后；每个边界边一条曲线；闭合/端点焊接
  依赖现有 region 管线。若某环非精确 → **整面拒收**，不做部分环。
- 失败时 `sketchRegionsFrom` 不得返回「去掉失败曲线后的近似面域」；消费特征 status=1。
- 重叠/重复投影曲线可能产生零面积/退化环；作为负路径测试并 fail closed，不静默丢。

### 4.7 持久化/版本/迁移

- **事实源**：草图 `params`（entities/constraints/plane/**externalRefs**）是唯一定义事实源；
  投影几何是读时派生。params 中的插入时坐标只作审计/旧客户端兜底，**成功路径不得使用**。
- **无 schema 类变更**：`externalRefs` 是 params JSON 的 additive 键；旧库无此键=无外部引用。
  不新增 native geometry stream，不建影子元素。
- **版本**：shared 下一 minor（提案 **1.85.0**；实施时若基线已前进按当时下一 minor）；
  `LubanFeatureRpcInterface.interfaceVersion` bump；shared → modeling-server → web 同批发布。
- **旧数据 fixture**：无投影 / 1a 草图投影 / 含 plane / 含 regions 的旧库逐字通过。
- **旧客户端**：旧 web 不创建 body 引用；读取时忽略新增可选键。含 externalRefs 的文档
  必须新 backend + 新 web 才能编辑；`updateSketch` omission guard 防止静默清空。
- **回滚**：停止创建新引用；旧 backend 读含 body 引用的草图时失败封闭
  （`projection-unsupported`/未知 kind），不静默丢弃；已写入文档只能前滚修复或从
  启用前 checkpoint 恢复；无迁移回滚脚本。

### 4.8 失败语义（fail closed）

| code | 触发 | 插入/更新 | 读面 | 消费特征 |
|---|---|---|---|---|
| `projection-source-missing` | body/边/面/顶点不存在、被删除/抑制、拓扑分裂 | 拒收 | failed | status=1 |
| `projection-source-ambiguous` | 同一持久 id 多个候选/面环歧义 | 拒收 | failed | status=1 |
| `projection-non-exact` | 非平行圆/弧（椭圆）、非平面面、样条/曲面边 | 拒收 | failed | status=1 |
| `projection-degenerate` | 投影零长度、零扫角、空环 | 拒收 | failed | status=1 |
| `projection-unsupported` | 首版未支持的源种类/子形态（含 SILHOUETTED 未实现） | 拒收/能力 gated | failed | status=1 |
| `projection-forward-reference` | 源由下游特征产生 | 拒收 | failed | status=1 |
| `projection-cross-project` | 源不在本 Part Studio/scope | 拒收 | failed | status=1 |
| `projection-cycle` | 草图→body→草图循环 | 拒收 | failed | status=1 |
| `projection-snapshot-missing` | 冷开/redo/只读/预求值未跑 | — | failed | status=1 |
| `projection-snapshot-stale` | 快照键不匹配 | — | failed；重算后恢复 | status=1 |
| `projection-pierce-miss` | 边与平面无交点 | 拒收 | failed | status=1 |
| `projection-pierce-ambiguous` | 多交点/边在平面内/切点未定 | 拒收 | failed | status=1 |
| `projection-source-changed-type` | 源实体类型漂移 | 拒收 | failed | status=1 |
| `projection-external-refs-omitted` | 更新时省略已有 externalRefs | 拒收零变更 | — | — |

- **绝不允许**：回退插入时坐标、最近边/面/草图区域、旧快照、折线化/采样轮廓。
- **可恢复**：修复源（恢复参数/取消抑制/重建引用）后下一次预求值重建快照，读面自动恢复。

### 4.9 性能/安全

- 每 revision 只解析一次；同步读面/显示轮询/hover 不触发 native 命令。
- 目标：单草图 ≤100 个外部边/环、典型 body 投影预求值 **<100 ms**（实现时测量并登记；
  大模型线性回归；超预算先登记再优化）。
- 只读 briefcase 不写库；快照缺失=失败封闭；不为了显示去写只读库。
- 日志只记录错误码与 source 摘要，不打印完整 BRep/私有坐标；公共仓不出现私有 id/路径。

---

## 5. 复用矩阵

### 5.1 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/实现 | 结论 |
|---|---|---|---|
| itwinjs-core / core-geometry | 平面投影、曲线×平面求交、圆弧/直线/样条几何、平面侧判定 | `Plane3d.projectPointToPlane`；`CurvePrimitive.appendPlaneIntersectionPoints`；`LineSegment3d`/`Arc3d`；`CurveOps.isPlanar`；`Transform`；`ClipPlane`/`Plane3dByOriginAndUnitNormal`（半空间/侧向筛选，**不单独构成精确轮廓算法**） | **复用**；不 fork |
| itwinjs-core | 子实体几何/持久拓扑 | `SolidModelingCommand.getSubEntityGeometry`；`facesFromId`；`topologyIdFromSubEntity` | **复用**；无 fork |
| luban-cad/packages/editor | 编辑命令/几何缓存 | `EditBuiltInCommand`、`EvalCarrier`、`solidModelingIpc` | **复用**（拾取/读面通道） |
| luban-cad/packages/viewer | 草图显示 | `SketchCurvesDecoration`（唯一显示源） | **扩展**（投影样式/失败态；不参与数据事实） |
| luban-cad/packages/shared | 契约/拓扑 id | `SketchDto`/`SketchEntityDto`/`SketchProjectedMarker`/`SketchProjectionRequest`/`LubanTopologyId`/`BodyInfo` | **扩展**（判别联合 + externalRefs + 状态；版本 bump） |
| modeling-server（私有） | 草图投影/面域/预求值/拓扑读面 | `SketchProjection`、`SketchRegions`、`FeatureEngine.preEvaluateDirty/rebuildAll/evaluateChainForPreview`、`AsyncFeatureEval`、`EvalCarrier`、`FeatureOutputCache`、`DirectEditGuard` | **扩展**（快照 provider + body refs + 固定参考展开） |
| modeling-server/sketch（私有） | 求解器 | `SolverTypes`/`SketchWireNormalizer`/`SlvsSolver`（`fixed` point + lockedGroup） | **扩展**（fixed curve semantics；需 ADR） |
| imodel-native / SolidKernel | 面/边/拓扑、面→曲线、面×面交线 | 边/面/顶点读取、平面面转曲线、由面建片体、面-面求交（S0 probe 结论见公共摘要） | **候选复用**（面×平面精确交线需新 wrapper）；**无 silhouette 产品接口** |
| imodelhub-services | — | — | 不适用 |
| 官方 clients/BisSchemas | 参考语义 | 官方 editor/几何 API | 参考；不新增并行 REST DTO |
| DanQing | — | 未接入 | 不适用（不以第二渲染实现） |
| webhook-agent | — | — | 不适用 |

### 5.2 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由/不新建理由 | 许可 |
|---|---|---|---|---|---|
| 边/面持久引用 | `LubanTopologyId` + `resolveEdgeRef`/`resolveFaceRef` | 边/面已有；vertex 无持久契约 | 复用 | 与 fillet/shell/faceExtrude 同源 | 项目自有 |
| 边/面几何读取 | `SolidModelingCommand.getSubEntityGeometry` / `facesFromId` | 已有 | 复用 | 不新增 native 绑定 | ACIS Modeler+Polyhedra 授权内 |
| 草图源投影 | `SketchProjection` 1a | 草图源 | 扩展 | 保留同步读语义，增 externalRefs | 项目自有 |
| 异步预求值 | `preEvaluateDirty`/`rebuildAll`/`evaluateChainForPreview` | 已有 | 扩展 | 同一求值通道，不建第二套 | 项目自有 |
| 快照缓存 | `FeatureOutputCache` 模式 | 已有先例 | 复用模式，新建草图表 | 派生、可重建、不落库 | 项目自有 |
| 面×平面求交 | 现有面-面求交/由面建片体 + 平面 sheet | **S0 已证对柱/锥/环/拉伸面失败** | 需新 native 平面切片 wrapper+ADR | 若精确界面落地则复用；否则 blocked | ACIS 授权内（需 probe 结论） |
| 轮廓（silhouette） | 无产品接口（内部接口存在） | 0 | **blocked-design/blocked-kernel** | 不允许采样近似；需新 native 接口+ADR+许可评审 | 未授权前不接 |
| 选择/拾取 | `CanvasSelection` + `resolveEdgeRef`/`resolveFaceRef` | 边/面已有 | 复用 | 单一选择权威 | 项目自有 |
| Use UI | `SketchUseOverlay`/`sketch.pattern` 会话 | 草图源已有 | 扩展 | 同会话槽，无第二套工具族 | 项目自有 |
| 求解器 fixed | `fixed` point + lockedGroup | 仅 point | 扩展 | 需要 fixed curve；ADR 后实现 | libslvs 纯云 SaaS 姿态 |

### 5.3 必须新建（须证明现有 API 不满足）

1. shared：`SketchExternalRef` 判别联合、`SketchExternalReferenceDto`、读面
   `projection` 状态与错误码、版本 bump。
2. backend：外部引用快照 provider、sourceDigest/bodyRevision/changeEpoch 失效键、
   预求值/读 hook、边/面精确投影规则、PIERCE 展开、固定参考实体。
3. backend solver：`fixed` 曲线语义（或受限的固定点方案）。
4. web：模型边/顶点/面选择器（复用拓扑读面与选择权威）、投影状态/错误显示、
   构造性回写；投影线专属样式需 live 证据后再做。
5. converter（test-only）：仅在外部查询可解析为产品持久拓扑引用时映射；否则保持 dropped。
6. 若 silhouette/面×平面探针失败：**不新建近似算法**，登记 blocked。

---

## 6. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 消费 `externalRefs`/`projection`；Use 扩展边/面选择；状态/错误显示；旧载荷兼容 | 无 | 无 | 单测 + 真栈 | shared 后同批 |
| shared | `SketchExternalRef` 联合、`SketchExternalReferenceDto`、`SketchProjectionRequest` 联合、错误/状态 DTO；**TS 源码不兼容，消费者同批窄化** | 无 | 无 | 契约/schema 单测、test:types | 同批发布 |
| viewer | projected 曲线样式/失败态（仅显示） | 无 | 无 | 视觉/装饰件单测 | 可选同批 |
| editor | 无（复用拾取/拓扑） | 无 | 无 | 拾取回归 | 不变 |
| itwinjs-core | 仅消费几何/子实体 API | 无 | 无 | 已有测试 | 不变 |
| imodel-native | 默认不改；silhouette 如需新接口另 ADR | 无 | 条件性新增 | ctest + 下游 | 另批 |
| modeling-server | 快照/预求值/读 hook/投影数学/固定参考/错误状态；`externalRefs` omission guard | params JSON additive，无类变更 | 复用 SolidKernel | 单测 + StandaloneDb + 真栈 | shared 后同批 |
| webhook-agent | 无 | 无 | 无 | — | 不适用 |
| hub/DanQing | 无 | 无 | 无 | — | 不适用 |

- 版本兼容矩阵：shared 1.85.0（提案）↔ backend 同批 ↔ web 同批；旧 1.35 载荷/旧库兼容；
  含 body 引用文档必须新 backend + 新 web。
- 配对 PR：shared + 私有 backend + web 同批；公共仓更新 AIRR/ADR/冻结矩阵/例外/能力状态。
- 发布顺序：shared → modeling-server → web；`verify-stack` 全绿才发布。

---

## 7. 实施切片（批准后）

> 每个切片都必须有「full 或 blocked-design/blocked-kernel 证据」；不得用近似转绿。
> 真栈证据必须包含真实 briefcase（非 jsdom），涉及体几何的用体积/质心断言。

### S0 — 证据与 ADR 前置（不写产品代码）

- 采集 Use/Project 外部选择 live UI 证据：边/顶点/面选择器、Use vs Project、offset/spacing、
  投影线样式/构造性、失败提示、源删除/抑制文案。
  - **2026-11-21 已采**：Use（`USE`，`u`）接受模型边/面；Use 组下拉含 INTERSECTION「交点」；
    PIERCE 为约束「穿透」`shift+g`；无独立 Project/Silhouette 工具（搜索无匹配）。
  - **仍缺**：offset/spacing/构造性选项、投影线样式、失败提示、源删除/抑制文案。
- 内核/API probe：
  1. 面×草图平面精确交线（现有面-面求交/由面建片体，或新平面切片接口）；
  2. silhouette（确认无产品接口 → blocked-kernel/design）；
  3. 边×平面交点（line/arc/spline）与切点行为；
  4. 固定曲线在 libslvs lockedGroup 下的 DOF/约束行为。
- ADR：ADR-0009 增量 + solver-neutral 固定参考几何 ADR（+ native 如需要）。
- 退出：证据与 probe 结论落私有/公共 sanitized 摘要；ADR 批准；能力 ledger 目标状态定义。
  **S0 未过，S1 不开工。**
- **S0 结论（2026-11-21，公共摘要 `docs/architecture/SKETCH-EXTERNAL-REFS-S0-PROBES.md`）**：
  - S1 **放行**：边/顶点投影不因内核阻塞；Use UI 入口（`USE`，`u`，边/面）已采。
  - S2 **仅 line/arc 放行**：`appendPlaneIntersectionPoints` 需按扫掠参数过滤弧外点；
    in-plane/切点/多交点/重根 fail closed；样条 PIERCE 因 point-on-spline 契约缺口 blocked。
  - S3 **逐面精确性检查后放行**：现有面环读取可用，但由面建片体的圆柱端盖等被拒，
    非平面/曲面/非精确环整面拒收。
  - S4a INTERSECTED **blocked**：精确平面切片算法存在但未暴露，需 native wrapper + JS 线
    + native ADR + ctest；非圆椭圆弧需 DTO 决策（拒收或扩展）。
  - S4b SILHOUETTED **blocked-design/kernel**：无产品接口；内部面级精确轮廓接口需许可
    评审、native ADR 与 live 语义证据；不做采样近似。
  - UI 选项/样式（offset/spacing/构造性、投影线样式、失败提示）仍缺证据，S1 UI 这些子项
    gated；Use 边/面入口与 PIERCE/INTERSECTION 入口可进入 live-spec。

### S1 — 模型边/顶点投影（PROJECTED USE / USE_END）+ 快照基础设施

- 契约：externalRefs/DTO/状态/错误码；legacy 1a 兼容。
- backend：快照 provider + 失效键 + pre-eval/read hook；边投影精确规则
  （直线任意平面；圆/弧仅平行平面；样条/曲面边拒收；USE_END 为端点）；
  构造性传递；驱动边（源 body 特征→投影草图→消费特征）；删除/抑制守卫。
- web：Use 覆盖层扩展边/顶点候选（`readBrepEdgeHandles` + `resolveEdgeRef`），
  不新建工具族；状态/失败提示最小接线；投影样式等 live 证据。
- 退出测试：
  - 20×20×10 盒体顶面四边 → 草图闭合环 → 拉伸 10 = **4000 mm³**；
  - 改盒体尺寸 → 投影矩形/体积联动；源 body 不被改写；
  - push + 冷重开一致；undo/redo 无陈旧投影；
  - 非平行圆/弧、样条边、退化边、源缺失、跨 scope、循环 → 拒收/status=1；
  - 只读 briefcase 无快照 → `projection-snapshot-missing`；
  - 旧 `sketch-projection.spec.ts` 与 Use 回归全绿。
- 真栈：新增 `e2e/sketch-projection-body.spec.ts`，至少 2 passed（成功 + 失败注入）。

### S2 — PIERCE（模型边）

- 契约：`externalRefs.kind="pierce"` + `localEntityId`；不新增 solver constraint kind。
- backend：边×平面精确交点；隐藏固定点 + coincident；固定参考语义（ADR）；
  0/多交点/切点/边在平面内 fail closed；快照/依赖边/删除守卫同 S1。
- web：PIERCE 工具/约束 UI 在 live 证据前保持 gated；先用 RPC/测试通道打通。
- 退出测试：点落在边上坐标 + DOF；改上游 → 交点/点联动；0/多交点拒收；
  push+冷重开；真栈 `e2e/sketch-pierce.spec.ts`（成功 + 失败）。
- 若 fixed curve ADR 未批：仅固定点方案 + 限制约束引用，能力登记 partial，不冒充 full。

### S3 — 平面面/轮廓环投影（bodyFace）

- 契约：`bodyFace.loops="outer"|"all"`；`entityIds` 逐边块分配。
- backend：面环读取（`getSubEntityGeometry` 的 Loop/ParityRegion）；逐边精确投影；
  非平面/非平行圆弧/样条 → **整面拒收**；外环/孔环顺序；面域集成；跨 body。
- web：面选择器（`readBrepFaceHandles` + `resolveFaceRef`）；外环/全部环选项（live 证据后）。
- 退出测试：盒体顶面外环 → 拉伸体积；带孔面 → 外环+孔环面域；非平面/曲面拒收；
  源 face 删除/改参；push+冷重开；真栈 `e2e/sketch-face-projection.spec.ts`。

### S4 — INTERSECTED / SILHOUETTED（条件性）

- S4a INTERSECTED：仅在 S0 probe 证明**精确**面×平面求交且输出可映射到
  line/arc/circle 时实现；否则登记 blocked-kernel/blocked-design，能力 gated。
- S4b SILHOUETTED：无精确 API → **blocked-design/blocked-kernel**；不写近似算法。
  若后续新增 native 轮廓接口，另 ADR + ctest + 下游回归。
- 退出：每类要么 full（精确真栈体积/坐标证据），要么 blocked 证据（probe 失败记录 +
  能力 ledger 状态 + UI 诚实禁用）；不得 unknown/假绿。

### S5 — converter/回归收口（test-only + 文档）

- converter 仅在外部查询解析到产品持久拓扑引用时映射 PROJECTED/PIERCE/INTERSECTED/
  SILHOUETTED；解析不到保持 dropped（不猜）。
- 重跑 25 个 near-flip 行：预期**仍受 body oracle 阻塞**，不宣称 strict 增加；
  其余 89 行仍受 feature/converter 阻塞。
- 更新能力 ledger（`ui.sketchPierce`/`ui.sketchIntersection`、新增 external-ref 能力行）、
  接口冻结矩阵、ADR、EXCEPTIONS、文档索引；提供 sanitized 证据。
- 退出：corpus 计数对账、0 unknown、无虚假 green。

---

## 8. 测试计划

> 以下均为**计划**；未运行前不得声称完成。测试基线按实施时实测登记，不把旧数字当门禁。

### 8.1 shared 单元 / 契约

- 旧 1.35 `SketchProjectionRequest`/`SketchProjectedMarker` 逐字通过；新 union 恰一分支；
  同时缺 source/旧字段或两者都有 → 拒收。
- `SketchExternalRef` 三种 kind 的序列化/反序列化；legacy 1a 投影读面不变。
- `externalRefs` 持久/读取；`entityIds` 块冲突/越界/重复；`refId` 唯一。
- 错误码枚举/状态 DTO；错误 detail 为 locale-neutral；旧前端忽略未知键。
- `test:types`：消费者窄化编译；旧 backend 遇到新 kind 的运行时失败封闭。

### 8.2 契约/版本

- `interfaceVersion` bump；shared/backend/web 同批握手；旧载荷兼容矩阵。
- 旧 backend + 新载荷：未知 kind/字段 → 明确失败（不静默丢）。
- 新 backend + 旧载荷：1a 行为逐字不变。
- `updateSketch` omission guard：已有 externalRefs 时省略 → 拒收零变更。

### 8.3 StandaloneDb 集成

| 用例 | 验收 |
|---|---|
| 盒体顶面四边 → 闭合投影环 → 拉伸 10 | 20×20 盒，**4000 mm³** 解析对拍 |
| 改上游盒体尺寸 | 投影/下游体积联动；源 body 不变 |
| 平行圆柱端面圆 → 投影圆 → 拉伸/切除 | 圆/弧保真（闭合环，可体积验收） |
| 单条非平行直线边 | 只断言端点坐标；开口边不作体积主验收 |
| 非平行圆/弧、样条边、非平面面 | op 拒收 / status=1，无半成品 |
| 平面面外环/孔环 | 面域外环+孔环；逐边 id 映射；非精确整面拒收 |
| 源边/面失效（改参删除拓扑、抑制/删除上游） | `projection-source-missing`；消费 status=1；无旧坐标回退 |
| 跨 body（B 的环投影，消费在 A） | 两体独立；源 B 改参触发投影 |
| 直接编辑源 body（P0-05） | DirectEditGuard 标记 → 快照失效；读面失败封闭或重算后更新 |
| 无关 body 直接编辑 | 快照命中，不触发重算 |
| undo/redo | 快照清空/epoch bump；体积回到对应状态；无 stale 显示 |
| 冷开/进程重启 | rebuildAll 拓扑序补算；体积/树一致 |
| 只读 briefcase | 无写；已有快照可用；缺失 → `snapshot-missing` |
| PIERCE（点/端点） | 坐标 + DOF；0/多交点/切平面/边在平面内拒收 |
| 旧库 fixture（无投影 / 1a） | 逐字兼容，无迁移 |
| 构造性源 | `construction` 保持；构造投影线不进面域 |

### 8.4 真栈 e2e

- `e2e/sketch-projection-body.spec.ts`：合成盒体 → 拾取顶面闭合四边/面外环 →
  投影草图 → 拉伸 10 → **4000 mm³**；改上游尺寸 → 体积变化；push + 冷重开一致；
  undo/redo；失败注入（删源特征/边）→ status=1、不显示旧曲线。
- `e2e/sketch-pierce.spec.ts`：点 PIERCE → 坐标/DOF → 改上游 → 联动 → 失败用例。
- `e2e/sketch-face-projection.spec.ts`：面外环/孔环 → 拉伸/切除体积；非平面拒收。
- `e2e/sketch-projection.spec.ts`（1a）、`sketch-use.spec.ts` 回归；
  `tutorial2`、`first-part`/`alignment`/`iOS` 等现有示例重开不变。
- 若 S4 为 blocked：不建假 spec；用 probe 报告 + 能力 gated 测试（按钮禁用/提示）。

### 8.5 语料

- 预期 **strict 翻绿行：0**（25 个 near-flip 行仍缺 body oracle；其余仍缺 feature/
  converter）。不得把本能力单独宣称能提升 strict。
- 预期 converter：外部查询可解析时新增映射；不可解析保持 dropped；`sketch-constraint:<KIND>`
  blocker 不因“猜”而消失。
- 复跑计数与 registry 校验：1,685 行、0 unknown、无虚假 publicEligible。

### 8.6 性能/视觉

- 预求值耗时/冷开增量/大模型线性回归登记；读面轮询不触发 native。
- 投影线样式/失败提示视觉基线在 live 证据后另钉；未采前不做视觉断言。

---

## 9. 回滚、风险与开放问题

### 9.1 回滚

- **停止创建**：op 边界对 bodyEdge/bodyFace/pierce/intersect/silhouette 请求返回明确
  「未支持」；旧 1a 草图源投影逐字不变；web 不提供入口（能力 gated）。
- **读取**：保留新读面分支可读已有引用文档；回滚到旧 backend 时含 body 引用的草图
  失败封闭（`projection-unsupported`/未知 kind），**不静默丢弃曲线/引用**，数据保留前滚。
- **数据迁移回滚**：无迁移；旧库/旧 changeset 不需回滚脚本。
- **发布门**：shared/backend/web 同批；旧库 fixture、真栈回归、冷开、`verify-stack` 全绿。
- **已产生文档**：回滚窗口内只允许前滚修复或从启用前 checkpoint 恢复；不得用旧版本
  合并/忽略 externalRefs。

### 9.2 风险登记

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 快照失效不完整（直接编辑/undo/redo/结构重排） | 读到陈旧投影/假成功 | 键含 sourceDigest+bodyRevision+changeEpoch；DirectEditGuard 钩子；缺失/不匹配失败封闭；专项 StandaloneDb/e2e |
| R2 | solver-neutral 固定曲线 ADR 未批 | 约束引用投影曲线无法实现 | S0 先过 ADR；未批则仅固定点方案，能力 partial |
| R3 | 面×平面/轮廓无精确 API | INTERSECTED/SILHOUETTED 无法 full | S0 probe；失败登记 blocked-design/kernel；不近似 |
| R4 | 拓扑 id 跨重建漂移/复用 | 投影到错误边/面 | 持久 id + bodyRevision；解析失败/歧义失败封闭；live 回归 |
| R5 | 非平行圆弧/样条在真实语料占比高 | 能力覆盖有限 | 明确 reject + blocked 证据；后续椭圆/样条 DTO 另切片 |
| R6 | `construction` 丢失 | 构造线变实体线/参与面域 | S1 统一传递/回读；单测 + 真栈 |
| R7 | 读面失败抛裸 RPC 错误 | UI 无结构状态/假死 | 统一 `projection.status` + 错误码；负路径 e2e |
| R8 | 旧客户端 wholesale update 清空 refs | 数据丢失 | omission guard 拒收；同批发布矩阵 |
| R9 | 读面性能/限流 | 打开/预览变慢 | 每 revision 一次快照；读面零 native；预算与规模测试 |
| R10 | converter 无法解析 opaque 外部 id | 语料映射受限 | 仅解析成功才映射；其余 dropped；不猜 |
| R11 | X-05 草图整体覆写 undo 例外 | P0-10 合规争议 | 复核现有原生 undo 证据；不足则更新 EXCEPTIONS（owner/期限） |
| R12 | UI 无 live 证据 | 假控件/错误交互 | 外部选择/样式/提示 gated；证据齐后才做 UI 切片 |

### 9.3 开放问题（缺证据，不猜）

1. **SILHOUETTED 精确语义**：ALIGNED/ANTI_ALIGNED/OUTER/INNER 与草图法向/视图方向的关系；
   面源还是体源；闭合轮廓/多段分段；内核是否有精确算法。
2. **INTERSECTED 精确语义**：面×草图平面交线；圆柱/圆锥/样条面输出类型；
   与 sketchToolType=SECTION 的关系；是否支持多段/闭合环。
3. **PROJECTED SILHOUETTE_START/END**：与 SILHOUETTED 的区别；参数槽位（external0/1、
   externalSecond）与 local `.start/.end` 的几何含义。
4. **USE_END 身份**：外部顶点是独立 vertex 还是 edge+end；持久 vertex 契约是否需要。
5. **PIERCE 歧义**：切点、边在平面内、多个交点的 Onshape 行为；是否允许约束未相交。
6. **约束引用派生几何**：哪些约束 kind 可引用投影/交线/轮廓；全固定参考的约束是
   接受/拒绝/冗余警告。
7. **构造性与样式**：Use/Project 默认 construction 还是 solid（语料多数 solid）；
   投影线颜色/线型；失败引用提示形态。
8. **Use/Project UI**：是否存在对话框、offset/spacing、选择过滤器、是否可跨 body；
   投影源变化是自动重建还是手动。
9. **converter 外部 id 解析**：opaque deterministicIds 是否可通过 live/API 或拓扑证据
   解析到产品持久引用；否则语料映射只能 blocked。
10. **读路径演进**：快照失效在真实语料是否可控；不可控时是否转 Option A（全 async）。

### 9.4 影响 AIRR 批准的阻断项

1. **solver-neutral 固定参考几何 ADR 未批准** → 约束可引用性与 PIERCE 无法按设计实现；
   最多做「固定点」受限切片。
2. **INTERSECTED/SILHOUETTED 精确算法缺证据** → S4 只能 blocked；若要求四类 full，
   AIRR 不能按当前证据批准。
3. **Use/Project live UI 选项/样式证据缺失** → 入口（Use/Pierce/Intersection）已采，
   但 offset/spacing/构造性、投影线样式、失败提示未采；UI 这些子项只能 gated/后端先行，
   不得宣称为 full。
4. **X-05 undo 例外** → 外部引用写入复用整体覆写 op，若不能证明可撤销，必须更新例外登记，
   否则 P0-10 不允许发布。
5. **旧客户端兼容**：必须接受「含 externalRefs 文档仅新 web/新 backend 可编辑」的发布矩阵；
   若不接受，需要更复杂的双向兼容设计。

---

## 10. 明确排除 / blocked 形态（无假支持）

- 跨文档派生/导入几何、任意 FeatureScript 查询求值（excluded-import）。
- 非平面面、曲面边、样条边、椭圆/椭圆弧投影与交线：**拒收**，不采样、不折线化。
- SILHOUETTED 与 PROJECTED SILHOUETTE_*：精确 API 未证明前 **blocked-design/kernel**，
  UI 诚实 gated，无假按钮。
- INTERSECTED：仅精确可映射到 line/arc/circle 的形态；其它 blocked。
- 一个外部引用含多查询/多源：首版不支持（语料全为单查询），拒绝而非任取第一条。
- 源 body 抑制/删除/跨 scope/前向引用/循环：拒收或 status=1，不静默跳过。
- 投影几何写入 params/native stream/影子元素：禁止（P0-06）。
- 用最近边/面、最近草图区域、旧快照、插入时坐标作为失败回退：禁止。
- 在无 live 证据时新增 Use/Project 外部选择器、投影线样式、失败提示：禁止。

---

## 11. P0 对照与评审结论

### 11.1 P0 对照

| 规则 | 本设计口径 |
|---|---|
| P0-01 iTwin 唯一底座 | 数据/事务/视图/选择继续用 iModel/BIS/标准工具与选择权威；不新建模型库/渲染平台 |
| P0-02 源码唯一事实源 | 只消费 itwinjs-core/editor 现有 API；不手改 `lib`/`dist`；不新增 fork |
| P0-03 复用优先 | §5 复用矩阵；快照复用 `FeatureOutputCache` 模式；拓扑复用 `SolidModelingCommand` |
| P0-04 先论证后编码 | 本 AIRR + ADR-0009 增量 + solver-neutral ADR；未批不写产品代码 |
| P0-05 单一建模/编辑管道 | 写操作仍走 `LubanFeatureRpcInterface` FeatureOp；UI 复用 `Sketch.*`/选择权威 |
| P0-06 单一数据源 | `params.externalRefs` 是唯一持久引用；投影几何读时派生；快照不落库 |
| P0-07 契约唯一/版本 | shared 1.85.0 提案；shared→backend→web 同批；旧载荷兼容矩阵 |
| P0-08 fork/native 最小 | 默认不改 native；silhouette 新接口另 ADR/ctest/provenance |
| P0-09 内核/求解器冻结 | 只经 solver-neutral；新 fixed 语义先 ADR；不改 ACIS 授权范围；libslvs 仅云 SaaS |
| P0-10 可撤销/HITL | 标准 FeatureOp/事务；X-05 复核/登记；失败零变更；无静默不可逆 |

### 11.2 评审结论（草稿）

- 复用矩阵完成：**是**
- 跨仓影响明确：**是**
- P0 例外已登记：**是**（既有 **X-05** 仍开放，需复核；本能力不新增例外）
- ADR：**需要**（ADR-0009 增量 + solver-neutral 固定参考几何 ADR；native 视 probe）
- Owner 签字：**已确认（用户 2026-11-21）**
- 结论：**已批准；按 S0→S1→S2→S3→S4（条件性）→S5 实施。**
  S0 未过前仅做证据/探针/ADR；S4 若 probe 失败按 blocked-design/kernel 登记，
  不以近似冒充 full。

---

*本文件为设计/证据材料；未写产品代码、未改 shared/backend/web 契约、未 commit/push。*
