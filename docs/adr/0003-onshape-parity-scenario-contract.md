# ADR-0003：Onshape parity 场景与证据契约

- 状态：已接受（2026-11-04；owner 指示继续实现）
- 关联：`docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 示例复刻需要同时保存原始采集证据、可回放的建模场景、几何对拍基准和
UI 证据。直接把 Onshape 原始响应塞进 e2e 会导致：场景不可读、无法按能力分级、
无法区分“证据缺失”和“实现失败”。

同时，P0-04 要求新契约先 ADR；P0-05/P0-07 要求不得新建第二套建模 API 或平行契约。

## 决策

1. **场景契约是测试/证据契约，不是产品 RPC**。定义版本化的
   `parity-scenario.schema.json`，不进入 `@luban-cad/shared` 运行时接口。
2. 场景 v1 字段：
   - `schemaVersion`, `id`, `docId`, `elementId`, `owner`, `name`
   - `units`（默认 Onshape 米）
   - `features[]`：`type`, `params`, `sourceFeatureId`, `rollback`
   - `expected`：`volumeM3`, `bodyCount`, `massProperties`, `bodies[]`
     （`partId`, `name`, `volumeM3`, `massKg`, `centroid`，来自逐 body
     `massproperties.per-part.json`）, `featureTree`, `tolerance`
     （默认体积 ±1%，Tutorial 2 使用 ±0.5%）
   - `ui`：`evidence`（截图/DOM/ARIA 的相对路径）、`selectors`、`actions`
   - `provenance`：采集时间、源 microversion、缺失项、状态
     （`complete` / `blocked-evidence` / `blocked-capability`）
3. **回放路径**：
   - 几何：现有 `FeatureService` / `FeatureOp`（或 StandaloneDb CorpusReplay）；
   - UI：现有 Playwright 真栈 e2e，通过真实 ribbon/canvas/dialog 驱动；
   - 不新增建模 RPC；直接编辑继续走 `EditTools` + 标准 IPC。
4. **证据分层**：
   - `ui` 证据按代表 Part Studio 采集截图、压缩 DOM 轮廓、ARIA；
   - 不宣称无证据的像素级 parity；
   - 缺 massproperties/parts/features 时场景不得标记为 green，只能标记 `blocked-evidence`。
5. **私有/公开边界**：原始语料与截图留在私有 parity 数据仓；公开仓只放 schema、
   runner、脱敏文档和聚合覆盖结果。逐 body 质量属性来自
   `massproperties.per-part.json`；聚合 `-all-` 值不能冒充单 body 期望。
6. **版本化**：schema 破坏性变更必须 bump `schemaVersion`，旧场景由转换器迁移；
   不允许静默改字段语义。

## 备选方案

- **截图-only 验收**：无法验证几何/特征参数，拒绝。
- **新增 parity RPC/第二套建模 API**：违反 P0-05/P0-07，拒绝。
- **解码 Onshape 内部二进制 WebSocket**：没有公开/合法协议依据，拒绝。

## 后果

- 每个示例需要一份场景描述和证据清单；初期工作量增加，但可审计、可分批。
- 首批六份文档先建立 schema 实例；后续 526 文档按同一 schema 扩展。
- 场景/证据不改变产品运行时契约，发布顺序不受影响；若发现缺失 FeatureOp，
  另立 ADR 并 bump shared 版本。

## 实现记录（2026-11-04）

- 公共仓：`luban-cad/scripts/onshape-parity/parity-scenario.schema.json`、
  `scenario.mjs`（validator/loader）、`from-gold.mjs`、`scenario.test.mjs`；
  Tutorial 2 场景 fixture：`luban-cad/apps/web/e2e/fixtures/parity/tutorial2.scenario.json`。
- 私有数据仓：`tools/scenario/from-onshape.mjs` 从原始 features 导出场景；
  Tutorial 2 iOS 场景已生成，`provenance.status=blocked-capability`，缺失项为
  DIAMETER、point-circle coincident、imprint-face extrude、chamfer cap-edge 映射。
- 验证：`node --test scripts/onshape-parity/scenario.test.mjs` **8/8 passed**；
  iOS 场景经同一 validator 校验通过（4 features，157.479 cm³）。

## 增量记录（2026-11-06，v1 additive）

- `FEATURE_TYPES` / JSON Schema 增加 `cPlane`。仅新增枚举，不改变既有字段语义；
  场景仍是测试专用契约，不进入运行时 RPC。
- 私有 converter 只输出 **OFFSET + Top/Front/Right** 的 cPlane（映射到现有
  `CPlaneParams`）；`LINE_ANGLE`/`TANGENT_PLANE`/`THREE_POINT` 等任意参考继续
  登记 missing，不把任意 cPlane 烘焙成世界平面。
- public translator 将 `cPlane` 映射为 `insertFeature cPlane`；未识别参考抛
  `BlockedCapabilityError`，不静默默认。

## 增量记录（2026-11-06，边选择器 test-only）

- 场景 fillet/chamfer 的 `edges[].selector` 新增两类语义：
  - `capEdge`：草图实体 + 端盖侧（`isStart`）+ 上游操作 sourceFeatureId；
  - `sweptEdge`：草图实体 + 上游 extrude/revolve + 可选
    `contextSketchEntityIds`（查询里的相邻草图实体，用于把端点消歧到唯一共享顶点）。
- 私有 converter `tools/scenario/edge-selectors.mjs`：
  - 解码 qCompressed，优先按 `sketchEntityId` marker 匹配实体，避免被 disambiguation
    里的相邻实体抢走；保留 ARC 实体；无法解析的查询仍登记 missing，不猜。
  - `contextSketchEntityIds` 只认同一草图内、出现在 `$` 边界的 sourceId 或其后缀。
- 私有 backend `ScenarioReplay`：CAP_EDGE 增加圆弧（圆心/半径/法向 + 端点）；
  SWEPT_EDGE 支持拉伸侧边与旋转圆边；零/多匹配一律拒收。
- 公共 e2e `e2e/examples/replay/edge-resolver.ts`：经 dev-only（`VITE_E2E_HOOKS=true`）
  只读 BRep 边枚举 + 既有 `resolveEdgeRef` RPC 得到持久边引用，再交给标准
  fillet/chamfer `FeatureOp`；不新增产品 RPC/状态/建模 API。
- 证据：converter 解析 9/9、backend matcher 7/7、ScenarioReplay 11/11；
  真栈合成 CAP_EDGE 圆边倒角 770.737 mm³（解析期望同值），`e2e/examples/edge-selector.spec.ts`
  2 passed（setup+test）。
- 真实 PS 探针（不作为绿门）：Hand Brake 旋转体的 SWEPT_EDGE 已唯一解析并
  chamfer status=0，但 revolve region 0 产物体积 5358.127 vs 采集 7125.274 mm³
  （−24.8%），阻塞在面域索引；iOS 的 imprintFace ADD 会补实内孔。两项均转 T4。

## 增量记录（2026-11-06，mirror 世界平面）

- converter 新增 `mirror` 场景特征：仅识别 **Top→XY / Front→XZ / Right→YZ** 世界基准面，
  且作用域为 `PART` 或 `FEATURE+fullFeaturePattern=true`（等价整件镜像）；
  局部特征镜像/任意面镜像如实 dropped，不近似。
- public translator 映射 `MirrorParams{plane, keepOriginal:true}`；非世界面抛
  `BlockedCapabilityError`。产品镜像语义为整条上游体反射后 Unite。
- 真栈：`e2e/examples/mirror.spec.ts` setup+test 2 passed（偏置盒体 YZ 镜像
  8000.000 mm³ = 2×4000）。

## 增量记录（2026-11-07，离线回放与 featurePattern/featureMirror）

- 私有 backend `test/ScenarioReplay.ts` 扩展：支持 `featurePattern`（linear/circular，
  单 active body）与 `featureMirror`（单源 + planeLine）；imprintFace 多查询改为与
  公共 runner 同口径的面域解析（按 imprint 侧向选材料面域，已解析照用、未解析写
  log、全未解析才回退 region 0），不再无条件 region 0。
- 新增 `DriveSleeveScenarioReplay.test.ts` 直接读取私有场景 JSON（数据缺失整组
  skip），验证 4 extrude + hole + FACE circular pattern 的真实链。结果
  **known-red**：Extrude 1/2/3 264448.7→688721.7→790461.9 mm³，
  Extrude 4(remove) 零去材；孔方向按目标体质心推断（负侧→backward，与公共
  translator 同口径）后最终 774611.7 vs 采集 1175024.3（−34.08%）。`it.fails`
  登记，根因是 imprintFace 实体 imprint/face split 与草图材料面域近似的语义差
  （基础轮廓被近似成小面域拼集）；不得调松断言或宣称示例绿。
- **公共 web 真栈首跑（2026-11-07，hub 恢复后）**：同一场景
  `drive-sleeve-scenario.spec.ts` 以 `test.fail` 运行，失败在 featurePattern
  求值（MS 日志 `内核 op 失败: op=1 status=0`，树 status≠0），与 backend 离线
  replay 的“status=0 但零去材”失败形态不同；两者根因同为 imprint 基础轮廓近似，
  不改变 known-red 结论。
- 公共仓同步：scenario `featurePattern` 支持 linear（`directionRisk` 标近似）与
  CAP_FACE mirror `planeLine`（`planeApprox` 标近似）；translator 单测 **28/28**，
  纯回放辅助 **12/12**。真实栈因本机 Docker/WSL wedge 待补跑。

## 增量记录（2026-11-08，revolve 轮廓实体 → 真实面域）

- **问题**：Onshape revolve 的 `entities` 查询给的是轮廓边（sketchEntityId），
  converter 对单 query 一律落 `regionIndex: 0`；同一草图多个 NEW revolve
  （Handle Parts 77b496/d405047 三体）全部盲取同一面域，三体体积不可能对拍。
- **场景字段（additive，test-only）**：`revolve.params.profileEntityIds?: number[]`
  ——查询的草图实体在本地草图中的 id（converter 用 `findSketchEntityForQuery`
  解析，全部解析成功才携带）。
- **回放器**：`region-entity-resolver.ts` 用
  `SketchRegionDto.outerEntityIds/holeEntityIds` 把实体映射到面域下标；仅当
  场景**未显式给 regions**（示例审计覆盖优先）时启用。全部命中且无共享边界
  歧义 → 覆盖为 `regions`；未命中/歧义 → 沿用 converter 旧口径并在 notes 标
  近似（绝不静默猜面域）。单测（Playwright）**6/6**。
- **边解析多体限定**：多体步骤把 body 谱系（bodyKeyBySource）传给
  `resolveScenarioEdges`，按 `selector.operationSourceIds` 收窄候选 body——
  同草图多 profile 共享顶点/边时，几何相同的 SWEPT_EDGE 不再跨 body 误配。
- **真栈**：Handle Parts 前置 10 特征跑通（3 体，未圆角 12326.161 /
  32140.878 / 106103.005 mm³）；Fillet 1 的 6 条边分属 3 body，按产品单
  `targetBodyId` 契约诚实阻塞——归 ADR-0015，spec 以 `test.fail` 登记
  known-red。回归：Handle/Hand Brake/Sample Assignment/edge-selector 真栈
  通过（Sample Assignment 与 iOS 首跑分别因连接失败和 MS 429 为环境红，
  限流窗口恢复后复跑 **2 passed / 3 passed**）。
- **面边界选择器验收（2026-11-08）**：Universal Joint Drawing（e9d0c09c/246cb5ff）
  的 Chamfer 10 含 6 条 SWEPT_FACE + 2 条 SWEPT_EDGE。未裁剪面（Sketch 8
  entity 18）已能展开 **4 条**边界边；entity 10（Sketch 8 正侧 u=+36.195）
  **matches=0**。调试证据：最终体全部边 x ≤ 0（存在镜像侧 x=−36.195 的对应边），
  正侧几何整体不存在——Extrude 10/11/12 的 region/imprint 回放把正侧体丢弃或
  镜像（Extrude 12 intersect 后仅剩半体，而 Mirror 1 在 Chamfer 之后），属
  **上游体分叉**而非单纯 face split；spec 以 `test.fail` 登记 known-red。
  工作队列的「capFace/sweptFace 待验收」据此收窄为「上游分叉 + 缺失面的
  面解析」缺口。
- **第二方向 up-to 静态近似（2026-11-08）**：converter 对
  `secondDirectionBound=UP_TO_SURFACE` 使用已解算 `secondDirectionDepth`
  转 `{endBound:'blind', distanceMm, approximate:true, sourceBound}`；
  translator 识别 `approximate` 标步骤近似并记 note（产品第二方向仅
  blind/throughAll，up-to 未映射；目标查询未采集）。translator **35/35**；
  合成真栈 20×20 拉伸 10 + 第二方向 5
  = **6000 mm³** push+重开。Stirrup 真实 PS 仍 known-red 于 Fillet 2 的
  CAP_EDGE through-all（上游体分叉，任务 #106），与本近似无关。
