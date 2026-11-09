# ADR-0004：草图契约扩展（Onshape 草图/约束/尺寸对齐）

- 状态：已接受（2026-11-04；分切片实施。已落地：point+circle coincident、
  construction/diameter/concentric/driven、line+circle tangent、angle（shared 1.25.0）；
  MIRROR 契约/求解/回放与草图镜像 UI（line/point/circle，2026-11-09）；
  angle UI/projected/pierce/driven UI 待后续）
- 关联：`docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 公开示例的草图大量使用当前 shared 1.21.0 未表达的能力：

- `Tutorial 2 - Build Your First Part - iOS` 的 Sketch 1 有 3 个 **DIAMETER** 尺寸，
  且 4 个 line 端点以 coincident 吸附到**整圆**（不是弧）。
- Bench Vise SPINDLE / Quickstart SPINDLE 有 construction 几何、assignVariable、
  cPlane 和额外约束。
- Part Feeding Machine Pallet、Exercise: Clamp 使用 construction、projected、
  mirror、angle 等约束。

当前事实：

- `SketchEntityDto` 没有 construction 标志；`SketchConstraintDto` 只有
  coincident/horizontal/vertical/parallel/perpendicular/equal/distance/radius/length/
  midpoint/tangent/offset/fixed。
- `SketchWireNormalizer` 的 coincident 只接受 point+point 或 point+arc；line 端点吸附
  整圆会被拒收。
- `SketchRegions` 把所有曲线都当作轮廓几何，construction 线会错误参与面域。
- 尺寸全部是 driving；没有 diameter/angle 尺寸，也没有 driven/reference 标志。

这些是 shared RPC 面（`SketchEntityDto`/`SketchConstraintDto`）和求解器契约
（`SolverTypes.ts`）的变更，按 P0-04/P0-07 必须先 ADR。

## 决策

### 1. 数据模型（shared 1.23.0，向后兼容的 additive 变更）

`SketchEntityDto`：

- line/circle/arc/spline 增加 `construction?: boolean`（默认 false）。
- 不新增 centerline 实体类型；centerline 先表示为 `construction: true` 的线，
  revolve 轴仍引用该线 id。后续若需要中心线专属 UI 语义，再加 `role` 字段。

`SketchConstraintDto`：

- 增加 `kind: "diameter"`：circle/arc；`value` 是直径（模型单位）。
- 增加 `kind: "angle"`：两条 line；`value` 是弧度；UI 显示度。
- 增加 `kind: "concentric"`：两个 circle/arc；等价于圆心 coincident，但保留
  Onshape 语义用于 UI 归因。
- 增加 `kind: "projected"`、`"pierce"`：引用外部几何（草图/实体边）；
  `refs` 之外的投影源放在新增可选字段 `externalRefs?: SketchExternalRefDto[]`。
- 增加 `kind: "mirror"`：被镜像实体 + 镜像线；`value` 不使用。
- 增加 `driven?: boolean`：true 表示参考尺寸，只显示不送入求解器；默认 false。

`SketchDto` 增加可选 `constructionEntityIds?: number[]` 派生字段？不——construction
事实源在实体上，派生字段无必要，禁止重复事实源。

### 2. 求解器（SolverTypes.ts + 冻结清单）

- `SolverTypes` 的约束 union 扩展上述 kind；`value` 语义与 shared 一致。
- 映射：
  - diameter → libslvs `SLVS_C_DIAMETER`，valA = diameter（radius 仍 valA = 2r）。
  - angle → `SLVS_C_ANGLE`（或等价线角方程），value 弧度。
  - concentric → 圆心 point+point coincident；UI 归因保留 concentric。
  - driven → 不生成方程，只参与显示/回读。
- **point+circle coincident**：`SketchWireNormalizer` 接受 point + circle，生成
  `SLVS_C_PT_ON_CIRCLE`（ptA=point，entityA=circle，wrkpl=工作平面）。
  `SolverTypes.ts` 的 coincident 形状校验同步接受 `point+circle`/`circle+point`。
  这是 **SolverTypes 冻结契约的变更**（hash 更新，见
  `luban-backend/docs/architecture/interface-freeze.json`），但 shared DTO 形状不变；
  必须有双跑求解器语料覆盖。line+整圆 tangent 未实现，仍按 arc 拆分或后续扩展。
- projected/pierce/mirror 的方程涉及外部几何/对称约束，**不在第一个版本落地**：
  先只接受 DTO 并标记 `blocked-capability`，避免半实现导致错误几何。

### 3. 面域生成

- `SketchRegions` 过滤 `construction === true` 的曲线：construction 曲线参与约束和
  显示，但不参与面域轮廓/孔洞。
- 旧草图没有该字段 → false，行为不变。

### 4. UI 对齐（证据驱动，不自由发挥）

- 草图 ribbon：construction 切换、Use/Project、Mirror、Centerline 按已采集 Onshape
  UI 证据实现；没有证据的交互先不做。
- 尺寸工具：圆默认直径/弧默认半径等默认行为需用 live Onshape 采集确认后钉死；
  未确认前保留“可切换 radius/diameter”的最小实现，不宣称像素级对齐。
- 角度尺寸、参考尺寸的显示与编辑；所有尺寸仍走 `updateSketchConstraint`，不新建
  第二套尺寸 RPC。

### 5. 版本与发布

- shared `LubanFeatureRpcInterface.interfaceVersion`：ADR-0005（extrude/revolve）占用
  1.22.0；本 ADR 第一切片落地 version **1.23.0**。后续 sketch 字段继续 additive minor bump，
  每批保持 shared/backend/web 同批测试与发布。
- backend / web 同批发布；`SolverTypes.ts` 冻结清单更新为新 hash，并附双跑语料。
- 旧数据：新增字段全部可选，旧 params 直接可读；提供 Tutorial 2 gold 旧 fixture
  回归 + 旧库首开测试。
- 回滚：旧客户端忽略新字段；若求解器回归，回退到 1.21.0 并保留新字段透传（不写
  新约束）。

## 备选方案

- **只做回放映射，不改 shared**：diameter→radius/2、construction 丢弃。能跑部分示例，
  但 UI 仍无法创建/显示 Onshape 的能力，且 construction 会污染面域，拒绝。
- **前端本地求值**：违反 P0-06/P0-05，拒绝。
- **引入第二套 sketch schema**：违反 P0-07，拒绝。

## 后果

- 需要 shared/backend/web 三端同批，工作量集中在求解器 conformance 与 UI 证据。
- iOS 示例在 ADR 落地前只能做 blocked-capability 场景；不得宣称完整复刻。
- construction 过滤会改变含 construction 曲线的面域结果——这是修复，不是回归；
  必须用旧 fixture 证明无 construction 的草图结果不变。

## 实现记录（2026-11-04，第一切片，shared 1.23.0）

- 已实现 point+circle coincident：`SketchWireNormalizer.ts`（point+circle 通过）、
  `SlvsSolver.ts`（PT_ON_CIRCLE 构建 + 初值检查）、`SolverTypes.ts`（形状校验）；
  iOS 回放证明可用。
- 已实现 shared DTO 第一切片：line/circle/arc/spline `construction?: boolean`；
  constraint `kind: "diameter" | "concentric"`；`driven?: boolean`。
- 求解器：diameter → `SLVS_C_DIAMETER`，concentric → 圆心 point+point coincident，
  driven 不生成方程；`interface-freeze.json` 的 `SolverTypes.ts` hash 已同步为
  `b13a81ae…`。
- 面域：`SketchRegions`/`sketchCurvesFromParams` 过滤 construction 曲线；新增
  4×4 方形 + construction 对角线仍为 1 个面域的回归测试。
- line+整圆 tangent：libslvs `ARC_LINE_TANGENT` 只认弧端点，整圆改用**端点共圆语义**：
  取 line 距圆心更近的端点，合成「圆心→端点半径线 ⟂ line」1 条内部
  `PERPENDICULAR`（不新增自由参数，DOF 净 −1）。`SketchWireNormalizer`、
  `SolverTypes` 校验与前端槽位表同步接受 circle+line；两端点都不在圆上的
  「任意位置相切」不在本语义内，由初值可行性检查拒绝，不静默给错几何。
- UI：草图 ribbon 的 construction 切换（`sketchConstruction`）驱动 store
  `constructionMode`，新绘制实体带 `construction`；viewer 装饰器虚线显示。
  圆尺寸默认 DIAMETER、弧默认半径，标注带 `⌀`；i18n en/zh-CN 同步；约束工具
  槽位接受整圆+直线 tangent。
- 前端约束槽位同步：coincident 接受 point+circle（此前仅 point+point，导致
  「线端点吸附整圆」在 UI 无法创建），tangent 接受 circle+line；真栈
  `tutorial2-tools` 新增「圆：直径 + 线端点共圆相切」用例，走真实 ribbon/画布：
  直径 40 → 半径 20，coincident/tangent 落库，`dof=2 underconstrained`（未加定位约束，
  符合预期）。
- **angle（shared 1.25.0，backend/contract only）**：DTO/SolverTypes/Normalizer 接受
  两 line + `value` 弧度（0<value<π）；SlvsSolver 映射 libslvs `ANGLE`（其 valA 是度，
  内部 ×180/π；按初值选择 `other` 方向翻转，避免 π−value 初值误判）。`SolverTypes.ts`
  冻结 hash 更新为 `2801e1…`。验证：两线初始 45° → 约束 60° 收敛（dof=1，长度自由）；
  后端 sketch **89/89**。angle 的 UI 尺寸工具尚无 live 证据，暂不新增控件。
- 验证：后端 sketch 测试 **89/89 passed**、backend `tsc` 绿；shared **152/152**；
  web 目标测试绿。iOS 几何回放改为**全量约束**：`Tutorial2IosReplay.test.ts`
  草图 `status=ok dof=0`（4 条 line+circle tangent + 2 条 DIAMETER 全量参与），
  终体积 157.165 cm³（目标 157.479，−0.20%）不变。
  > 2026-11-05 补记：该 −0.20% 来自旧 RPC 倒角边集；chamfer UI 按 Onshape
  > CAP_EDGE 语义拾取 3 条边后，真栈终体积为 **157478.900 mm³ = 目标（0.00%）**。
- 未实现（按本 ADR 后续批次）：`angle`、projected/pierce/mirror、driven 的 UI
  编辑入口、iOS 真栈 UI 创建链（DIAMETER 已可 API 回放；chamfer UI 已于
  2026-11-05 接通，见 `2026-11-05-chamfer-ui-airr.md`）。
- **point+line coincident（v1.31，2026-11-06，无 shared 契约变更）**：Onshape
  的 `COINCIDENT` 常把点吸附到线上（curvSegment 端点 + line）。求解器无独立
  PT_ON_LINE，按 SolveSpace 的等价形态 `SLVS_C_PT_LINE_DISTANCE(valA=0)` 实现；
  `SolverTypes` 形态校验、`SketchWireNormalizer` 归一化、`SlvsSolver` 的构造与
  初值满足判定、converter 全链同步。验证：`src/sketch` **46/46**（新增
  point+line solver/normalizer 两例）；后端回放
  `Tutorial2Fixture/Tutorial2IosReplay/BasicDrawingReplay/PostmanReplay/
  ScenarioReplayCorpus/ScenarioFilletReplay/SketchFlow/SketchOps` **31/31**。
  全量 scenario 重转后 `COINCIDENT point+line（未映射）` 由 247 条降至 3 条；
  约束树完整性仍受 PROJECTED/MIRROR/CENTERLINE_DIMENSION 等未实现约束限制，
  不宣称约束 complete。

## 增量记录（2026-11-08：equal 支持 arc/arc；WARNING LABEL 首个新示例绿）

- **背景**：WARNING LABEL（Bench Vise 等 4 个文档同名 PS，5 特征、1 body、
  0.8193532 mm³）converter 判几何 complete，但真栈在 `Sketch 2` 被
  `SketchWireNormalizer: 约束 equal 不支持 arc+arc` 拒收。
- **契约/求解**：`equal` 语义扩展为「2 line 等长」或「2 circle/arc 等半径」，
  允许 circle+arc/arc+arc；`SolverTypes.validateSketchRequest` 与
  `SketchWireNormalizer` 同步放行。`SlvsSolver` 已有 `SLVS_C_EQUAL_RADIUS`
  分支（原仅 circle 可达），本次不改核。
- **验证**：`SolverTypes.test.ts` **45/45**（新增 arc+arc/circle+arc 合法、
  line+arc 非法）；真栈
  `e2e/examples/replay/warning-label-scenario.spec.ts` **2 passed（50.5 s）**——
  scenario-file 全链建链、逐 body 体积 **0.8193532 vs 0.8193532 mm³**、
  push + 冷重开一致。WARNING LABEL 的 decal/mateConnector 为非几何 dropped，
  不冒充几何特征。
- **未做**：equal 的 UI 约束槽位/live 证据未新增（本次只放开 backend 形态）；
  PROJECTED/MIRROR/SILHOUETTED/PIERCE/CENTERLINE_DIMENSION 仍 blocked。

## 增量记录（2026-11-09：MIRROR 约束 + Wheel 真栈；中心线尺寸直径语义）

- **契约（shared 1.57.0）**：`SketchConstraintDto.kind + "mirror"`——refs 恰 3：
  两个同型 line（整线镜像）或两个 point（端点对镜像）+ 1 条 axis line；无 value。
  旧客户端不认识 mirror 时仍可读其余字段；新增字段为 additive minor bump。
- **求解器**：`SolverTypes` 形状校验、`SketchWireNormalizer` 归一化、
  `SlvsSolver` 映射 `SLVS_C_SYMMETRIC_LINE`（ptA/ptB=点对，entityA=轴线）。
  整线镜像按初值就近端点配对展开为两条方程；附加句柄从高段分配并归因同一用户
  约束。`initialGeometrySatisfied` 增加镜像初值检查（轴线反射，避免把未满足的
  初值误判为可行而原样保留）。
- **converter**：`MIRROR` 映射端点对行（`localFirst/localSecond/localMirror`），
  整实体行由端点对精确承载，不重复映射；`sketchToolType` 元数据不再当作 ref。
  `CENTERLINE_DIMENSION` 是 Onshape 的**直径尺寸**（值=跨中心线全宽，2×半径/半宽），
  映射产品 `distance` 时除以 2；Wheel 几何坐标 100 mm ↔ 原始尺寸 200 mm 为直接证据。
- **验证**：后端 sketch **95/95**；全量后端 **865 passed / 1 expected fail /
  8 skipped（100 files）**；shared **170/170**；web **1497/1497**；translator
  **41/41**。真栈 `e2e/examples/replay/wheel-scenario.spec.ts` **2 passed
  （58.7 s）**：Exercise: Basic Drawing / Wheel，1 body，**2442291.05 vs
  2442293.76 mm³**（相对误差 1.1e-6），push + 冷重开一致。
- **附带性能修复**：`getMassProperties` 的几何细分由 `chordTol=1e-6 m/
  angleTol=0.002 rad` 放宽到 **1e-4 m/0.02 rad**。Wheel（R≈50 mm 全周旋转体）
  冷算从 **156 s** 降到 **2 s**；体积误差 1.1e-6 相对，远优于示例 0.5% 门限。
  原参数在 UI RPC 300 s 头超时下表现为“massproperties 挂起”，现按性能缺陷修复，
  平面拉伸体结果不变（WARNING LABEL 0.8193532 仍逐位一致）。
- **重转**：batch-convert --force 164 场景 → complete **4** / geometry **15** /
  smoke **7** / blocked 75 / failed 50 / skipped 48；`verify-example-index`
  0 errors / 5 warnings；Wheel converter status=complete、dropped=[]、regionRisk=false。
  新增 complete 的 Drive Sleeve×2 来自同批 converter 修复（MIRROR 端点源配对按
  参数顺序而非不存在的 localFirst/localSecond；圆心-原点 CONCENTRIC 映射为
  center+origin coincident）；其几何仍为已知 imprintFace 超差 known-red，不能把
  converter complete 当作示例绿门。UP_TO_ENTITY 孔在同一批按 `holeDepthComputed`
  静态深度映射为 blind+endApprox（近似，非产品动态能力）；实际 PS 均被其它缺口
  阻塞，场景计数不变。
- **未做**：MIRROR 的 UI 已补 line/point/circle（2026-11-09，见下节），arc/spline、
  预选流程、平面/实体面边镜像线仍待后续；PROJECTED/SILHOUETTED/PIERCE 仍 blocked；
  多余整线 MIRROR 行不进入产品约束树（由端点对承载，树内计数 18 条端点镜像）。

## 增量记录（2026-11-09：标准 OFFSET 约束映射；First Part 剩余阻塞）

- converter 新增标准 OFFSET 工具映射：按 `localOffset/localMaster/localSecondOffset/localSecond`
  重排为产品 `[offsetA, masterA, offsetB, masterB]`，并从已解算几何反推偏移距
  （两对 line-line 垂距 / arc-arc 半径差取均值）。SLOT 工具只有 2 refs，不以 offset 冒充。
- Tutorial 2 First Part 重转后 OFFSET 已进入约束树；剩余唯一 drop 为
  `COINCIDENT <spline>.0.internal / .1.internal`（样条内部拟合点），属样条内部点
  引用未实现，First Part 仍 blocked-capability。
- batch 164 场景计数不变（complete 4 / geometry 15 / blocked 75 / failed 50 /
  skipped 48）；本映射用于后续样条/偏移示例解锁，不宣称覆盖。

## 增量记录（2026-11-09：样条 `.internal` 端点映射；First Part 转绿门 known-red）

- converter `ref` 新增 Onshape 样条内部点索引：`.0.internal` = start、最后一个
  `.N.internal` = end（仅 2 拟合点样条；中间 internal 点仍诚实 dropped）。
  Tutorial 2 First Part 的 4 条 `COINCIDENT <spline>.internal ↔ 实体端点` 现可映射，
  草图 **48 约束**全部入树（含标准 OFFSET）。
- First Part 重转 `status=complete`、dropped=[]；真栈 scenario-file 已建全链并在
  `first-part-scenario.spec.ts` 登记 **known-red**：终体积 **352290.918 vs
  357568.177 mm³（−1.476%）**，逐特征体积
  Extrude1 199717.342 / Extrude2 258309.214 / Extrude3 294796.600 /
  Revolve 352712.961 / Fillet 352290.918；`skipSketchConstraints=true` 体积相同，
  故不是草图约束/样条求异。
- **根因修正（2026-11-09 复核）**：逐特征前缀在 Revolve 后恰好等于
  `expected - 4,855.216`；本仓 Fillet 1 只去材 **422.043**（4 条 CAP_EDGE
  端盖边，5.08 mm），而 Onshape 原始 Fillet 1 带 `tangentPropagation=true`。
  同时本仓终态表面面积 **50,146.44 mm²** vs 采集 `periphery` **49,180.44 mm²**
  （+1.96%）；“体积更高、面积更低”与 Onshape 在相切/凹边扩展出更多材料一致。
  因此剩余差异不再是草图层或 imprint 面域证据不足的笼统归因，优先归
  **fillet 边集/相切传播语义**；需 Onshape 回滚逐特征体积（或等价前缀证据）
  才能定量确认，不能靠调容差转绿。E2 查询内的 vertex 消歧（line8×line11）
  仍是一个未消解的次因候选，已登记待真栈前缀证据。
- batch 164 场景：complete **7** / geometry **12** / smoke 7 / blocked 75 /
  failed 50 / skipped 48；`verify-example-index` 0 errors / 5 warnings。

## 增量记录（2026-11-09：MIDPOINT/DISTANCE 外部原点；Bumper/Handle converter complete）

- 空 external query 在 `MIDPOINT`/`DISTANCE` 中也按 origin 映射（与既有 COINCIDENT/H/V
  同口径）：MIDPOINT(line, origin) / DISTANCE(point, origin)。
- 整圆/弧 + 原点 `CONCENTRIC` 另以圆心 `coincident(center, origin)` 表达；Rear Shock
  的 Sketch 3/8/10 已减少，Sketch 9 的 `CONCENTRIC(line.start, origin)` 语义不成立
  （线端点不是圆/弧），继续如实 dropped。
- Bumper Block / Handle Parts converter status 变为 complete（constraints in tree）；
  但产品几何仍分别被 fillet 12-edge blend / 跨 body fillet 阻塞，不宣称示例绿。
- batch 164 场景：complete **7** / geometry **12** / smoke 7 / blocked 75 / failed 50 /
  skipped 48；`verify-example-index` 0 errors / 5 warnings。

## 增量记录（2026-11-09：Sketch Mirror 草图工具 UI）

- **证据**：Onshape Help「Sketch Mirror」（cad.onshape.com/help/Content/Sketch/
  sketch_mirror.htm）——支持「先选实体再点 Mirror / 先点 Mirror 再选镜像线，
  之后选实体即时镜像」。本切片实现第二种流程：点「镜像」→ 选草图线作镜像线
  → 逐个点 line/point/circle 即时镜像，Esc/右键退出；预选流程与平面/实体面边
  镜像线留后续。
- **纯逻辑** `tools/sketch/sketch-mirror-logic.ts`：轴线反射 + 每实体生成
  新实体与 `mirror` 约束（refs=[源,副本,轴线]）；line 生成内联端点新线、point
  生成新点；circle 反射圆心后生成等半径整圆，约束为
  `mirror(center, center, axis)` + `equal(源,副本)` 两条；arc/spline 因需端点/
  控制点对称语义继续诚实拒收。sameEntity/degenerateAxis/unsupportedKind 拒收。
- **工具** `SketchMirrorTool`（toolId `Sketch.Mirror`）：两相（axis/entities），
  `applyUpdate` 乐观整体覆写、每次点击即时落库、失败只回滚本次 id；动态预览
  镜像线（橙）与候选反射几何（蓝）。ribbon 占位 `sketchMirror` 换真 id 并接线。
- **v1 边界**：镜像 line/point/circle；arc/spline 的对称约束语义未冻结；镜像线
  只接草图直线（平面/实体面边归外部引用）；预选多实体流程未做。
- **验证**：
  - `sketch-mirror-logic.test.ts` **6/6**（线/点/圆反射、构造/数字端点、拒收、ribbon 入册）。
  - 真栈 `e2e/sketch-mirror-tool.spec.ts` **2 passed（1.1 min）**：真实 ribbon →
    画镜像线/源线 → 镜像 → RPC 读回 3 线 + mirror refs[2,3,1]；再画整圆 →
    第二次镜像读回 2 圆（圆心对称、等半径）+ 2 条 mirror + 1 条 equal → 完成草图 →
    reload 重开两组镜像约束与实体仍在。
  - web **1503/1503**、lint/tsc/e2e tsc 绿。

## 增量记录（2026-11-09：Sketch.Point 草图点工具）

- 证据：Onshape 草图工具栏「点」——点击放置点，工具连续存活到 Esc/右键；
  点不参与面域，但可作为孔位/定位参考（HoleDialog 草图点通道消费）。
- `SketchPointTool`（toolId `Sketch.Point`）：AccuSnap 热捕捉优先（
  `getCurrSnapDetail().adjustedPoint`，回落 `ev.point`）→ 草图平面架投影局部
  (u,v) → `applyUpdate` 乐观整体覆写；连续放点，拒收只回滚本次 id。
  ribbon 占位 `sketchPoint` 退役并映射 `Sketch.Point`；`Point` 图标沿用
  `sketch-point-button`。无契约变更。
- 验证：真栈 `e2e/sketch-point-tool.spec.ts` **2 passed（48.3 s）**——真实
  ribbon 连续放 (10,10)/(20,15) 两点，RPC 读回 2 个 point（局部坐标 ±0.6），
  finish + reload 重开仍在；web **1503/1503**、lint/tsc/e2e tsc 绿。
- **v1.59 自动推断（2026-11-09）**：`autoWeldConstraints` 扩展 point 实体——
  新点在既有端点容差 1 mm 内 → coincident(point, endpoint)；否则落在既有线内部
  → coincident(point, line)（solver 的 point-on-line 通道），或整圆边界
  → coincident(point, circle)；垂足在线段外/圆内非边界不焊。
  `SketchAutoWeld.test.ts` **13/13**（含 6 条 point 用例）；真栈
  `sketch-point-tool.spec.ts` 扩为「先画线 → 点在线内/端点」→ 2 个 point +
  2 个 coincident，finish+reload 仍在，**2 passed（52.9 s）**；web **1509/1509**。
- **孔位集成（2026-11-09）**：真栈 `e2e/sketch-point-hole.spec.ts` **2 passed
  （47.6 s）**——矩形板 + 点工具新点 (10,0) → 拉伸 → HoleDialog 选新点 →
  throughAll 去材 **196.339 vs 196.350 mm³**（<0.01%），树 sketch/extrude/hole
  全 status=0。
- 未做：点的拖动/编辑与尺寸标注；`Use`/外部边面投影仍归 ADR-0009 后续切片。

## 增量记录（2026-11-09：Sketch.CenterRectangle 中心矩形）

- 证据：Onshape 拐角矩形飞菜单「中心矩形」——第 1 点=中心，第 2 点=角点；
  自动关系与拐角矩形同构（4 角 coincident、平行/垂直/水平、中心点=对角线中点）。
- 实现：`SketchCenterRectangleTool`（toolId `Sketch.CenterRectangle`）复用抽取的
  `axisAlignedRectangleDraft`（拐角矩形同批改为同一 helper，零行为变化）；对角点由
  中心反射得到；实时读数宽高翻倍；ribbon 占位 `Sketch.CenterRectangle` 退役。
- 验证：真栈 `e2e/sketch-center-rectangle.spec.ts` **2 passed（46.1 s）**——
  中心 (0,0)+角点 (10,5) → 4 线+中心点、包围盒约 20×10（±1），finish+reload
  重开仍在；web **1503/1503**、lint/tsc/e2e tsc 绿。
- 未做：对齐矩形（AlignedRectangle）仍需第三点/旋转语义；中心矩形尺寸编辑。

## 增量记录（2026-11-09：Sketch.AlignedRectangle 对齐矩形）

- 证据：Onshape 帮助/矩形飞菜单——三次点击：A/B 定第一条边的角度与长度，C 定
  垂直边的有向距离；边不强制轴对齐。
- 实现：`SketchAlignedRectangleTool`（toolId `Sketch.AlignedRectangle`，3 点），
  由 A→B 单位向量取左法线，C 投影得高度，生成 4 线 + coincident/parallel/
  perpendicular（无中心点）；实时读数第一段为长度/角度、第三点后为垂直高度；
  flyout 占位 `Sketch.AlignedRectangle` 退役。
- 验证：真栈 `e2e/sketch-aligned-rectangle.spec.ts` **2 passed（47.6 s）**——
  A(0,0)/B(10,0)/C(0,5) → 4 线、包围盒约 10×5（±1）、无 point、finish+reload
  重开仍在；web **1503/1503**、lint/e2e tsc 绿。
- 未做：第三点后的尺寸编辑/拖动；对齐矩形的中心点变体。

## 增量记录（2026-11-09：Sketch.CenterArc 中心点圆弧）

- 证据：Onshape 圆弧飞菜单「中心圆弧」——圆心 → 起点（定半径）→ 终点（定扫角）。
- 实现：`SketchCenterArcTool`（toolId `Sketch.CenterArc`，3 点）；startAngle 取
  圆心→起点方位角，sweep 取圆心→终点方位角的有符号最短差（±π 内；Onshape 对
  超半圆的方向消歧未采集，登记为边界）；实时读数圆心后为半径、第三点后为扫角；
  flyout 占位 `Sketch.CenterArc` 退役。
- 验证：真栈 `e2e/sketch-center-arc.spec.ts` **2 passed（47.9 s）**——圆心 (0,0)、
  起点 (10,0)、终点 (0,10) → 1 arc（r≈10、sweep≈π/2）、finish+reload 重开仍在；
  web **1509/1509**、lint/tsc/e2e tsc 绿。
- 未做：超半圆/反向扫角的方向消歧（需 live 证据）；圆弧尺寸编辑。

## 增量记录（2026-11-09：Sketch.Bezier 贝塞尔曲线）

- 证据：Onshape 样条飞菜单「贝塞尔曲线」——四个控制点按 P0→P3 顺序点击。
- 实现：`SketchBezierTool`（toolId `Sketch.Bezier`，4 点）；实体为既有 spline
  DTO（4 controlPoints + 2 fitPoints，periodic=false）；两条端点 coincident
  （与既有样条工具同构，保留可见约束计数）；预览前三点折线、第四点起采样 Bezier；
  flyout 占位 `Sketch.Bezier` 退役。
- 验证：真栈 `e2e/sketch-bezier.spec.ts` **2 passed（49.1 s）**——4 控制点 →
  1 spline（4 controlPoints/2 fitPoints/2 coincident），finish+reload 重开仍在；
  web **1509/1509**、lint/tsc/e2e tsc 绿。
- 未做：高阶/多段 Bezier、控制点手柄编辑；Conic 仍占位（无产品实体）。

## 增量记录（2026-11-09：Sketch.TangentArc 相切圆弧）

- 证据：Onshape Help「Tangent Arc」——两次点击：点已有直线端点定起点/切线，
  再点终点；圆弧在起点与直线相切。
- 实现：`SketchTangentArcTool`（toolId `Sketch.TangentArc`）首切片只接**草图直线
  端点**（3 mm 拾取容差；面/边相切归外部引用）；由 S/E 与线方向反解切圆
  （圆心的法线方向取指向 E 侧，r=|E−S|²/(2(E−S)·n)）；提交 arc +
  coincident(arc.start, line.endpoint) + tangent(arc, line)；一次建一条弧后退出
  （链式弧后续）；构造模式开启时 arc 标 construction。flyout 占位
  `Sketch.TangentArc` 退役。
- 验证：真栈 `e2e/sketch-tangent-arc.spec.ts` **2 passed（52.8 s）**——水平线
  (-20,0)→(0,0) + 端点→(10,10) → 1 arc + 1 coincident + 1 tangent，
  finish+reload 重开仍在；web **1509/1509**、lint/tsc/e2e tsc 绿。
- 未做：连续链式相切弧、与弧/样条相切、面/边相切源、半径尺寸即时输入。

## 增量记录（2026-11-09：Sketch.PerimeterCircle 周边圆）

- 证据：Onshape 圆飞菜单「Perimeter circle」——圆上依次拾取三点定圆（三次点
  不生成圆心点实体，与中心点圆的两点样式区分）。
- 实现：`SketchPerimeterCircleTool`（toolId `Sketch.PerimeterCircle`，3 点）；
  复用 `Arc3d.createCircularStartMiddleEnd` 三点定圆求 center/radius（共线→
  LineString3d 退化判退），提交 1 个整圆、无约束/无圆心点；预览两锚点后出整圆，
  共线时候选折线；实时读数第一段为弦长、第二段后为圆半径；构造模式作用于圆；
  flyout 占位 `Sketch.PerimeterCircle` 退役。
- 验证：真栈 `e2e/sketch-perimeter-circle.spec.ts` **2 passed（48.8 s）**——三点
  (10,0)/(0,10)/(−10,0) → 1 circle（r≈10、center≈(0,0)、无 point），
  finish+reload 重开仍在；单测 `SketchCreateTool` **14/14**（+2：三点定圆、
  共线/重合判退）；web **1511/1511**、lint/tsc/e2e tsc 绿。
- 未做：三点作为可拖动定义点的持久引用（当前只保留圆结果）；直径/半径尺寸
  即时输入；与既有曲线的自动相切推断。

## 增量记录（2026-11-09：正多边形工具 sketchInscribedPolygon / sketchCircumscribedPolygon）

- 证据：Onshape Help「Inscribed Polygon」「Circumscribed Polygon」——圆心 → 构造圆
  半径点 → 键盘输入边数（3–50，默认 6）→ Enter/再次点击完成；构造圆与多边形
  的内外关系按 Onshape 命名：Inscribed（内切多边形，主钮）= 构造圆在多边形内、
  与各边相切；Circumscribed（外切多边形，飞菜单）= 多边形在构造圆内、圆过各顶点。
- 实现：`SketchPolygonTool` 基类 + 两个子类；实体 = 1 条 construction 构造圆 +
  N 条内联端点线；约束 = N 个相邻端点 coincident + N−1 个全边 equal +
  N 个外角 angle(2π/N)；键盘数字实时改边数（3–50）、Backspace 复位 6、Enter
  提交，第三次点击同样提交；默认 6 边。两个 flyout 占位退役。
- **飞菜单焦点回归修复**：`RibbonDropdown` 激活菜单行后不再把焦点还给箭头按钮
  （原 `closeMenu(true)`）——工具内的 Enter 会触发箭头默认 click、重新展开菜单
  并挡住草图完成按钮（真栈实测）。`Ribbon.test` 增断言 activeElement ≠ 箭头。
- 验证：真栈 `e2e/sketch-polygon.spec.ts` **3 passed（1.5 min，含 setup）**——
  内切/外切各 5 边：6 实体（1 构造圆+5 线）、5 coincident/4 equal/5 angle、
  构造圆 r≈10、solve 非 conflicting/failed，finish+reload 重开仍在；
  `SketchCreateTool` **16/16**、`Ribbon` **16/16**；web **1513/1513**；
  lint/tsc/e2e tsc 绿。
- 未做：构造圆与多边形的求解联动（尺寸编辑后构造圆不跟随）；按住/移动光标
  连续调整边数的 Onshape 拖拽手势；多边形作为整体选择/拖动；
  `Sketch.Conic`/文本/使用仍占位。

## 增量记录（2026-11-09：Sketch.Mirror 弧镜像 arc+arc+line）

- 语义：源弧与镜像弧关于草图直线对称。`SketchConstraintDto.kind="mirror"` 的
  refs 扩展支持 `arc+arc+line`（此前仅 line+line / point+point）；无 DTO 形状
  变化（refs 仍是实体引用），shared interfaceVersion 不 bump。
- 后端：`SolverTypes`/`SketchWireNormalizer` 接受 arc+arc+line；
  `SlvsSolver` 将弧的**圆心 + 起/终点**三对点映射为三条 `SLVS_C_SYMMETRIC_LINE`
  （反射翻转走向，按初值就近端点配对 direct/swapped）；初值可行性检查同步用
  弧中心/端点反射比对。shared interfaceVersion 仍为 1.60（refs 形状未变）。
- 前端：`buildMirrorDraft` 反射弧圆心/起/终点，`startAngle` 取反射起点方位角、
  `sweepAngle` 取源扫角相反数；预览绘制镜像弧；toast 文案更新（spline 仍拒收）。
- 验证：后端 `SlvsSolver` **97/97**（含新 arc mirror 收敛用例：圆心 (-5,3)、
  r=2、端点对称）；前端 `sketch-mirror-logic` **6/6**；真栈
  `e2e/sketch-mirror-tool.spec.ts` **2 passed（1.4 min）**——线/圆/弧三类镜像
  顺序执行，弧圆心对称、半径相等、扫角符号相反、mirror 约束 3 条，
  finish+reload 重开仍在。
- 未做：spline 控制点镜像（控制点无独立 point 句柄，需专门契约/求解）；
  弧镜像的端点/圆心作为可见拖动点；跨草图镜像。

## 增量记录（2026-11-09：Sketch.Mirror 样条镜像 spline+spline+line）

- 语义：源样条与镜像样条的四个控制点分别关于草图直线对称。mirror 约束 refs
  支持 `spline+spline+line`（仅三次样条/4 控制点；periodic 与非 4 控制点拒收）。
  shared interfaceVersion 仍 1.60（refs 形状未变）。
- 后端：`SolverTypes`/`SketchWireNormalizer` 接受 spline+spline+line；
  `SlvsSolver` 将四控制点映射为四条 `SLVS_C_SYMMETRIC_LINE`（按初值选
  direct/reversed 配对）；初值可行性检查同步用控制点反射比对。
- 前端：`buildMirrorDraft` 反射 controlPoints/fitPoints；镜像工具新增专用
  `resolveNearestMirrorSeedId`（样条按三次 Bezier 48 段采样，避免 offset picker
  不识别样条）；预览按镜像控制点采样绘制。
- 验证：后端 solver/normalizer **98/98**（新 spline mirror 收敛用例）；前端
  `sketch-mirror-logic` **8/8**（含拾取采样）；真栈
  `e2e/sketch-mirror-tool.spec.ts` **2 passed（1.7 min）**——线/圆/弧/样条四类
  顺序镜像，样条控制点逐个 x 取反、mirror 约束 4 条，finish+reload 重开仍在；
  backend 全量 **875 passed / 1 expected fail / 8 skipped**、web **1515/1515**。
- 未做：周期样条/非三次样条镜像；样条镜像控制点的可见拖动；跨草图镜像。
