# ADR-0006：Onshape 新特征类型与引用几何（分切片设计）

- 状态：已接受（2026-11-05 owner 指示“继承实现下一个特征”）。
  **切片 A（hole）已落地 backend/contract/UI + 真栈 e2e（shared 1.26.0）**；
  **切片 A2（hole 曲线顶点孔位）已落地 backend/contract/UI + 数据驱动回放（shared 1.27.0）**；
  **切片 A3（沉头孔 counterbore）已落地 backend/contract/UI + 真栈 e2e（shared 1.28.0）**；
  **切片 B1（cPlane 基准面 + 草图落在自定义平面）已落地 backend/contract/UI + 真栈 e2e（shared 1.29.0）**；
  切片 B2（任意参考几何/改参传播/变量）、C、D 仍待逐个批准。
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`

## 背景与证据

ADR-0004/0005 已覆盖草图约束（construction/diameter/concentric/angle/tangent）、
extrude/revolve 的方向、终止条件子集与布尔操作。对私有数据仓 131 个已采到
`features` 的文档做特征类型清点，当前能力之外的高频项为：

| 能力 | 出现次数（顶层特征） | 典型示例 |
|---|---:|---|
| `hole` | 303 | Bench Vise、Quickstart、Clamp Handle |
| `cPlane` / `cPoint` | 80 / 106 | Bench SPINDLE、Clamp Handle、Pallet |
| `assignVariable` | 48 | Bench/Quickstart SPINDLE、Feeding |
| `draft` | 60 | Pallet、Clamp Parts |
| `rib` | 23 | Clamp Parts |
| `sheetMetalStart` 等 | 79+ | Bench 大 PS、Feeding 多个 PS（明确不在 Batch 1） |
| `faceBlend` / `moveFace` / `replaceFace` | 33+6+9 | 长尾，后续 |

同一批文档的 features JSON 已提供参数名和引用查询串，但不提供草图实体/约束
明细；UI 截图/DOM 只覆盖默认视图，尚未采集特征对话框。因此本 ADR 的每个切片
都必须同时回答“结构化证据是否足够”和“UI 证据是否足够”，缺一即不得宣称 UI 对齐。

## 决策

本 ADR 只批准**范围、顺序和门禁**；每个切片落地前仍需 owner 对具体 DTO/UI 签字。
统一原则：

1. 新增 `LubanFeatureType`/`FeatureParams` 必须走 `@luban-cad/shared` 版本 bump、
   后端 schema、FeatureDialog、表单模型、旧库 fixture、双端同发布。
2. 优先用现有内核能力（Sweep/Unite/Subtract/Intersect/Taper）组合实现；不得为复刻
   示例新建第二套建模 API 或前端本地几何求值。
3. 非几何特征（`decal`、`mateConnector`）不进入几何验收；可在场景中标为
   `non-geometric`，不得伪造 body/体积。
4. 没有 live UI 证据的控件不新增（可以只落 backend/contract，并在 DM 中登记）。

### 切片 A（建议优先）：`hole` 简单钻孔

目标：覆盖 Onshape `SIMPLE` 孔的大部分示例；不包含螺纹、沉头/埋头、多深度表。

DTO（示意，最终以批准稿为准）：

```ts
export interface HoleParams {
  /** 孔位草图：草图内 point 实体（每点一孔）。 */
  sketchId: string;
  /** 孔的轴线：起始面法向（世界系）；首版由草图平面法向给出。 */
  direction?: "forward" | "backward";
  diameterMm: number;
  endBound: "blind" | "throughAll";
  depthMm?: number;          // blind 必填
  tipAngleDeg?: number;      // 118 或 180（平底）；缺省 118
  /** 只做无螺纹光孔；tapped/counterbore/countersink 明确拒收。 */
}
```

- 求值：每个 sketch point 生成一个圆 profile（直径 = diameterMm，平面 = 草图平面），
  沿法向扫掠 depth（blind）或按上游范围 `throughAllDistance`，用 `Subtract` 从上游
  实体去除；tipAngle<180 时在孔底追加锥形工具（由旋转扫掠生成），**不得**用折线近似。
- 引用：首版只接受本 PS 的 sketch point；`startStyle=PART` + `endStyle=UP_TO_ENTITY`
  等 Onshape 高级形态先登记 `blocked-capability`，不静默降级为 blind。
- UI：需要采集 hole 对话框（位置/直径/深度/终止条件/孔类型）后再实现；无证据前
  只落 contract + backend。
- 测试：schema 接受/拒收；StandaloneDb 单孔盲孔体积 πr²h；throughAll 在板上贯通；
  多孔位置；无上游/无点/零直径拒收；真栈代表面板 e2e。
- 版本：shared minor bump；新增类型 `hole`；无 BIS schema 迁移。

### 切片 B：`cPlane` / `cPoint` 与 `assignVariable`

这三项共同决定“引用几何/参数表达式”的数据事实源，不能只做 UI 占位。

- `cPlane`/`cPoint`：作为特征树中的**引用几何元素**还是草图/特征的参数？本 ADR
  倾向前者：新增引用几何实体（BIS 元素或 Feature 行），所有 sketch plane / axis /
  face 引用通过持久 id 指向它们；禁止把平面坐标复制进每个下游 params。
- `assignVariable`：需要表达式子集（数字、`#var`、四则、括号）和变量求值顺序。
  变量事实源必须是 BIS/params；禁止前端本地求值后再落库（否则改一个变量无法可靠
  重建）。首版可只支持“数字变量 + 下游 params 中的 `{{var}}` 占位”，并在后端
  统一展开；表达式 DSL 需单独 ADR。
- UI：需要 live 证据（变量对话框、基准面创建）后实现。
- 门禁：未批准表达式/引用模型前，不得用 `assignVariable` 行做“空转成功”。

### 切片 C：`draft`/`rib`/非世界平面 `mirror`/feature-face pattern

- `draft`：内核有 `api_taper_faces` 路径，但 TS `createBRepGeometry` 未暴露；需要
  先评估 native 接口扩展（P0-08 溯源）或作为后处理图元。ADR-0005 的 extrude
  `draftAngleDeg` 仍未实现，UI 输入已禁用。
- `rib`：需要筋板轮廓、厚度、拉伸方向与合并规则；不能复用简单 extrude 静默近似。
- 非世界平面 mirror：当前 B4 只做世界 XY/YZ/XZ；任意平面引用依赖切片 B。
- feature/face pattern：当前只有 body pattern；face pattern 需要拓扑引用与内核复制。
- 以上均在切片 A/B 之后逐项立项，不批量实现。

### 切片 D：face-extrude / imprint-face

Tutorial 2 iOS 的 Extrude 2 仍用草图左环面域近似（几何等价，−0.20%）。通用实现
需要“选择实体面 + 轮廓投影 + 沿面法向扫掠”，依赖稳定的 face 引用与 face 轮廓提取；
目前 `resolveFaceRef` 提供持久 face id，但面轮廓提取/扫掠尚未验证。该切片必须有
iOS 场景的全量对拍（不能只靠截图）后再批准。

### 切片 A 实现记录（2026-11-05，shared 1.26.0）

- `LubanFeatureType + "hole"`；`HoleParams`：`sketchId`、`pointIds?`、`diameterMm`、
  `endBound: blind|throughAll`、`depthMm?`、`direction?`、`tipAngleDeg?`。
- 后端：`FeatureTypeRegistry` 注册（同步 `/` `booleanOp=subtract`、`requiresUpstream=true`）；
  `FeatureEngine.evaluateHole` 取草图 point → 两段半圆弧圆 profile → 沿草图法向 Sweep →
  一次 Subtract；throughAll 复用 `throughAllDistance`。首版仅平底（tipAngle 非 180 拒收），
  螺纹/沉头/埋头/up-to-entity 明确拒收。`FeatureService` 跳过 hole 的面域选择校验。
- UI（2026-11-05，live 证据 `onshape-parity-data/ui-evidence/
  quickstart-copy-hole-dialog-20261105/`）：`HoleDialog`（单位 mm/inch、孔类型
  简单/沉头孔/倒角孔、草图点复选、孔径、终止条件 blind/throughAll、孔深、
  起始平面/钻尖角提示、合并范围）；后两种孔类型与螺纹页签禁用，不做假成功。
  ribbon `CreateHole` 改道 `openFeatureDialog({featureType:'hole'})`，能力
  `hole` 翻 full；edit 模式回显落库参数并走 `updateParams`。
- 验证：`HoleFlow.test.ts` 3/3——throughAll φ4 方块 4000−40π；blind φ2 深 4 两位置；
  `pointIds` 精确选位与非法 id 落 status=1；`FeatureTypeRegistry` schema 正/负路径；
  `HoleDialog.test.tsx` 5/5；web 1336/1336；shared 153/153；真栈
  `e2e/hole.spec.ts` 2 passed——草图点 + throughAll，树 `sketch/extrude/hole`
  全 status=0，去材 196.349 vs 理论 196.350 mm³（-0.0005%）。
  shared 1.26 真栈 T2 strict 2 passed（体积不变）。
- 仍未实现：钻尖非平底、螺纹、沉头/埋头、按面 up-to 终止条件；Onshape
  mate connector/实体边孔位尚未进入 DTO。

### 切片 A2 实现记录（2026-11-05，shared 1.27.0）

- `HoleParams.vertexRefs?: { entityId, part: start|end|center }[]`：与 `pointIds`
  同给时显式选择（不再默认全选 point）；两者皆空时求值层拒收。
- 后端 `sketchVertexPositionsFrom`：line 端点/中点、arc 起止/圆心、circle 圆心/
  起始角点、spline 首末控制点；缺实体/缺坐标 status=1，不静默跳孔。
- 转换器 `from-onshape-v2.mjs`：解码 qCompressed 为 zlib inflate（旧 gzip 兜底），
  按 `operationId + sketchEntityId` 解析孔位；point→pointIds、曲线→vertexRefs；
  mate connector / 多草图 / 未解析引用整孔登记 blocked。SIMPLE + THROUGH/BLIND
  且孔径/孔深表达式可解才算转换成功。
- UI：HoleDialog 孔位列表同时列出 point 与线/弧/圆/样条顶点，提交拆分为
  `pointIds` 与 `vertexRefs`；edit 模式回显两者。
- 验证：`HoleFlow` 4/4（新增线端点/中点 vertexRefs 与非法引用 status=1）；
  `ScenarioReplayCorpus` 3/3（新增 synthetic vertexRefs 场景 7803.65 mm³ 对拍）；
  shared 153/153；web 1338/1338；四包 tsc 绿。

### 切片 A3 实现记录（2026-11-05，shared 1.28.0）

- `HoleParams.holeStyle?: "simple"|"counterbore"` + `counterboreDiameterMm`/
  `counterboreDepthMm`；schema 守卫（counterbore 必填、直径须大于主孔、simple 不得带
  counterbore 字段）。
- 后端 `evaluateHole`：主孔圆柱外再叠加同轴沉头圆柱（从草图平面起算固定深度），
  一次 Subtract；方向与主孔一致。
- UI：HoleDialog 沉头孔页签开放，新增沉头直径/深度输入（单位联动换算），倒角孔仍禁用。
  live 证据：`onshape-parity-data/ui-evidence/quickstart-copy-hole-dialog-counterbore-20261105/`
  （C_BORE 页签 active、`cBore*` DOM 字段与 0.384/0.197 in 标题；操作后已取消，无残留特征）。
- converter：`style=C_BORE` 解析 `cBoreDiameter/cBoreDepth`，表达式不可解/直径非法整孔登记 blocked。
- 验证：`HoleFlow` 5/5（新增 4000−76π 沉头孔）；真栈 `e2e/hole.spec.ts` 3 passed
  （沉头去材 373.064 vs 理论 373.064 mm³）；shared 153/153；web 1338/1338；
  T2 strict 2 passed（4.1 min，无圆角 358.161 / 终 357.739 / 去材 0.422 cm³ 不变）。
- 仍未实现：钻尖非平底、螺纹、倒角孔（countersink）、按面 up-to 终止条件；
  mate connector/实体边孔位。

### 切片 B1 实现记录（2026-11-05，shared 1.29.0）

- `LubanFeatureType + "cPlane"`；`CPlaneParams`：`reference: top|front|right`、
  `offsetMm?`（可负、有限）、`flipNormal?`；`SketchPlaneDto + sourceFeatureId?`
  （草图平面来源指针；三向量仍是插入时派生快照）。
- 后端：`FeatureTypeRegistry` 注册 `cPlane`（`requiresUpstream:false` + 异步直通求值）；
  `evaluateCPlaneAsync` 返回上游条目原样（不产体/不改 body 几何）。`planInsert` 的默认
  prev 从「全局链尾」改为**目标 body 的真实驱动源**（引用几何特征可出现在链尾而不驱体；
  纯几何链行为不变）；`applyInsert` 对 cPlane 跳过 body rewire/FeatureDrives 输出边。
  被草图 `plane.sourceFeatureId` 引用时，`updateParams`/`deleteFeature` 在 txn 前诚实拒收
  （apply/preview 同文案）。
- 转换器/回放：B1 当时不涉及 scenario 转换；`ScenarioReplay` 对 cPlane 的消费已在
  B2a 真实示例落地中补齐（见下）。
- UI（live 证据 `onshape-parity-data/ui-evidence/cplane-dialog-20261105/`）：
  `CPlaneDialog`（图元芯片 参考基准面 + ×、偏移复选、偏移距离 mm、反转法线）；
  `internal/cplane.ts` 唯一平面派生点；`SketchDialog` 平面下拉同时列出成功 cPlane，
  `insertSketch.plane` 携带快照 + `sourceFeatureId`；编辑态按来源显示「平面 N」。
  ribbon `cPlane` 改道 `openFeatureDialog({featureType:'cPlane'})`，不再假启动。
- 验证：后端 `CPlaneFlow` 2/2（体后插入不改体积；被引用改参/删除拒收、解除后可改删；
  cPlane 首特征 + 草图 + 拉伸 4000 mm³）+ `FeatureTypeRegistry` cPlane 正负路径；
  web 全量 **1361/1361**（新增 CPlaneDialog/cplane/SketchDialog/Ribbon 断言）；
  真栈 `intro-to-cad` 2 passed——UI 建 Plane 1（Front 偏移 −20、反转法线）+ SketchDialog
  选 Plane 1 建壳，Sketch 2 平面快照 sourceFeatureId 命中，树 `sketch/extrude/cPlane/sketch`
  全 status=0，体积 85157.341 mm³（目标 85157.342，−0.000001%），推送后重开一致。
- 已知边界（B1b/B2）：cPlane 改参不驱动已引用草图重定位（引用时拒收改参/删除）；
  视口未渲染半透明平面；参考图元仅三世界基准面；Onshape「偏移」多模式下拉/表达式
  /「成品」按钮未实现。

### 切片 B2a 实现记录（2026-11-06，shared 1.31.0：平面点/自定义世界原点）

- `CPlaneParams + origin?: {x,y,z}`（世界 mm）；与 `offsetMm` 互斥（服务端 zod
  superRefine 拒收同给）。`reference` 仍提供世界法线/xDir；`flipNormal` 反转法线。
- 后端：schema 增 origin + 互斥；`evaluateCPlaneAsync` 校验 origin 有限数并继续直通。
- 前端：`internal/cplane.ts` 平面派生在 origin 有限时直接采用该世界原点（忽略 offset），
  法线仍取 reference；`CPlaneDialog` 增「类型 = 基准面 / 平面点」，平面点模式显示
  原点 X/Y/Z 数值输入；载荷 `{reference, origin, flipNormal?}`。旧基准面/偏移形态逐字兼容。
- 验证：shared 159/159；后端 `CPlaneFlow` 3/3（origin 落库/草图快照、origin+offset 拒收）；
  web CPlaneDialog/cplane **17/17**；真栈 `e2e/cplane-point.spec.ts` setup+test **2 passed**
  ——UI 创建平面点 (1,2,3) → 草图落在该平面 → 矩形拉伸 20×20×10 = **4000 mm³**，
  push+重开平面快照/sourceFeatureId 一致。
- 诚实边界：本切片是 Onshape「平面点」的**世界法线子集**；任意面/边参考、点来自草图顶点
  的引用形态、改参传播仍归 B2b。UI 类型/原点字段是功能入口，不是 live 像素级 parity。

### 切片 B2a 真实示例落地（2026-11-06，Exercise: Hand Brake Update / Handle）

- converter（私有 parity 仓，test-only）新增：`PLANE_POINT` → 世界轴对齐
  `{reference, origin, flipNormal}`（参考面/方向不一致则诚实 dropped）；草图
  `planeSourceFeatureId`（消费草图的 `sketchPlane` 查询指向 `<cPlane>planeOp`）；
  extrude/hole 的 `booleanScope` 压缩查询提取**真实 featureId**（旧正则漏掉
  `$<id>opExtrude` 形态）。
- runner/translator（公共 e2e，test-only）：cPlane `origin` 透传；草图平面来源映射为
  本地 cPlane featureId；`booleanScopeFeatureIds` → 显式 `targetBodyId`（多体必需，
  解析不到即阻塞）；body 谱系回溯（body sourceFeatureId 被后续 fillet/hole 改写后，
  仍能把 Onshape 的原始 body 引用解析到同一 body）；`regionRisk` 越界下标按产品真实
  面域数收敛并记 note；孔方向按目标 body 质心位于草图法线哪一侧决定
  `direction=backward`（钻入材料），证据写 note。
- converter 修正：Onshape `secondDirectionOppositeDirection=true` 是**反侧**，恰为
  产品契约缺省；旧映射（true→同侧）会把 Handle grip 的 130 mm 压成 120 mm。
- 后端 `ScenarioReplay` 消费 cPlane 与草图 `planeSourceFeatureId`；新增
  `CPlaneScenarioReplay.test.ts`（4000−80π mm³，树含 cPlane）。
- 真栈验收：`e2e/examples/handle-scenario.spec.ts` setup+test **2 passed**——12 特征
  （含 PLANE_POINT、secondDirection 10+120、2 个多体 remove、3 点沉头孔、fillet 30）
  全 status=0；逐体体积 **38314.220 / 68563.590** vs 采集 **38314.765 / 68563.589**
  （总 106877.810 vs 106878.354，**0.0005%**）；push + 重开树/逐体一致。约束
  refs 仍走 `skipSketchConstraints` 并登记 `constraints=dropped`，不宣称约束树完整。

### 切片 A4 实现记录（2026-11-06，shared 1.32.0：倒角孔/countersink）

- `HoleParams.holeStyle` 增 `countersink`；新增 `countersinkDiameterMm`（起始面侧锥口直径，
  必须 > 主孔直径）与 `countersinkAngleDeg`（包含角，deg，0<angle<180）。counterbore/
  countersink 参数互斥，只在对应 holeStyle 生效；旧 simple/counterbore 载荷逐字兼容。
- 后端：`FeatureTypeRegistry` zod 正/负路径；`FeatureEngine.evaluateHole` 在起始面侧
  构造顶环（锥口半径）与底环（主孔半径）两条 Loop，经 `BRepGeometryOperation.Loft`
  生成锥台工具体，与主孔圆柱一起 Subtract。锥深由
  `(countersinkDiameterMm − diameterMm)/2 / tan(angle/2)` 自动求得，不引入新内核 API。
- 转换器（私有仓，test-only）：Onshape `C_SINK` → countersink；`cSinkAngle`
  的 degree 表达式经 quantity 转回 deg；直径/角度缺失或越界如实 dropped。
- UI：`HoleDialog` 启用「倒角孔」页签，字段「倒角孔直径/倒角孔角度（deg）」；
  编辑回显、单位换算（直径随 mm/in，角度恒 deg）、提交前几何校验。
- 验证：后端 `HoleFlow` **6/6**（新增独立库 countersink：φ4 贯通 + φ8/90° 锥口，
  4000−152π/3）；web `HoleDialog` **7/7**；shared 159/159；真栈
  `e2e/hole.spec.ts --grep 倒角孔` **2 passed**——40×20×10 板、φ5 贯通 + φ10/90°
  锥口，去材 **261.794** vs 解析 **261.799 mm³**（0.002%），树 status=0。
- 诚实边界：真实语料 11 个 C_SINK 特征分布在 7 个 PS，但这些 PS 仍被 sheet metal/
  import/custom/其它特征阻塞，暂无完整真实示例；钻尖/螺纹/间隙表仍未实现。

## 不在本 ADR

- sheet metal、assembly mate、drawing、自定义 FeatureScript（`myFeature`、logoMaker、
  thread）——明确不进入 Batch 1。
- 导入几何（`importForeign`/`importDerived`）的产品化：需要独立的数据导入/许可设计。
- 非几何特征（decal/mateConnector）不产生 body/体积断言。

## 版本、测试与回滚

- 每个切片独立 shared minor bump；不允许把多个无关 FeatureType 捆在一个版本里。
- 旧库：新类型行不存在于旧库；schema additive；提供旧 fixture 首开回归。
- 回滚：删除新类型注册与 UI 入口；旧数据不包含新 params，无需 down migration。
- 测试门禁：schema 正/负路径、StandaloneDb 体积/body 数、真栈 e2e、UI 证据可追溯；
  未采集 UI 证据的切片只能以 backend/contract 状态合并。

## 结果

- 首个建议批准并实施的是切片 A（hole）；它能覆盖 Bench/Quickstart/Clamp 的常见
  钻孔，且无需新增 native API。
- 切片 B（cPlane/variables）是 Bench/Quickstart SPINDLE 完整复刻的前置；B1（三基准面
  cPlane + 草图落在自定义平面）已于 2026-11-05 实施（shared 1.29.0），B2（任意参考几何
  与改参传播、assignVariable 表达式）仍需单独 AIRR/ADR 签字。
- 在 owner 批准具体切片前，不写产品代码；本 ADR 仅作为待批准设计。
