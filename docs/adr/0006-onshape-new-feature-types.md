# ADR-0006：Onshape 新特征类型与引用几何（分切片设计）

- 状态：已接受（2026-11-05 owner 指示“继承实现下一个特征”）。
  **切片 A（hole）已落地 backend/contract/UI + 真栈 e2e（shared 1.26.0）**；
  **切片 A2（hole 曲线顶点孔位）已落地 backend/contract/UI + 数据驱动回放（shared 1.27.0）**；
  **切片 A3（沉头孔 counterbore）已落地 backend/contract/UI + 真栈 e2e（shared 1.28.0）**；
  **切片 A6（hole upToNext 终止条件）已落地 backend/contract/UI + 真栈 e2e（shared 1.56.0）**；
  **切片 B1（cPlane 基准面 + 草图落在自定义平面）已落地 backend/contract/UI + 真栈 e2e（shared 1.29.0）**；
  切片 B2（任意参考几何/改参传播/变量）、C 仍待逐个批准；
  **切片 D（face-extrude/imprint-face）backend/contract/e2e 首切片已落地（2026-11-06，
  shared 1.33.0；converter/runner 的 imprintFace 解析与 UI 待后续）。
  同日真栈纠正：Onshape `imprintFace` 查询指向**草图面/材料面域**（根
  `<sketchId>.imprint`），不是实体 BRep 面；imprintFace 不走 faceExtrude，
  改用带侧向的草图面域回放（见切片 D 修正记录）。faceExtrude 保留为显式
  实体面能力，当前无语料映射/UI**；
  **切片 D2（实体面单线 imprint 切分 / face split）首切片已落地（2026-11-10，
  shared 1.66.0：`FaceExtrudeParams.splitByLine` + `keepPoint` + `region:
  material|void`；回放 resolver + 后端面环半平面/凸包空腔裁切）；Part 5 真栈
  严格绿（逐步体积全等），Part 6 E1–E4 达到最终体积、E5 为 Onshape 验证的
  零几何变化 remove（产品 fail-closed，仍 known-red）；UI 与通用 imprint 未做**。
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

> **2026-11-10 后续设计（用户已批准实现）**：CAP_FACE 起始面 + startOffset + draft
> 的精确产品路径见 **ADR-0016** 与 AIRR
> `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md`；同日修正为
> prismoid 体积（upper 297,764.787 / pre-fillet 657,764.787），S9/S10/S11 已解析，
> 最终 −0.374% 归因 fillet。本 ADR 的 faceExtrude 首切片契约/实现保持不变；实现另批
> 落地，不把近似回退计绿。

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
  import/custom/其它特征阻塞，暂无完整真实示例；钻尖已于切片 A5（2026-11-08，
  shared 1.50.0）落地；螺纹/间隙表/按面 up-to 仍未实现。

### 切片 D2：实体面单线 imprint 切分（face split，2026-11-10，shared 1.66.0）

**证据**：Intro to CAD 1.2 Part 5/6 的 Sketch 2/3 是**单条开放直线**，后续
Extrude 3/4/5 的 `imprintFace` 查询指向“该直线在既有实体平面面上切出的子面”；
草图本身 0 个闭合面域，replay 旧路径必然 `regionIndex=0` 越界。Part 5 场景
（`ce879b3b…`）Extrude 3/4 各一条线，`imprintSign=+1`，add/remove
`oppositeDirection=true`；Part 6 同构。

**决策**：不新增特征类型，扩展既有 `faceExtrude`：

```ts
export interface FaceExtrudeSplitLine {
  /** 有向切分线端点（模型世界 mm）；必须在所选面的平面上。 */
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  /** 保留侧（在**面参数平面**内相对有向线：left=左/CCW 侧，right=右）。 */
  keepSide: "left" | "right";
}
export interface FaceExtrudeParams {
  // …既有字段…
  splitByLine?: FaceExtrudeSplitLine;
}
```

**求值**：面引用照旧解析到 scratch 载体平面面；把面环与切分线变换到面局部
坐标系，用半平面多边形裁切（Sutherland–Hodgman）取 `keepSide` 一侧，再走既有
面轮廓 Sweep → 特征内布尔。切分线必须落在面平面（0.05 mm）、两面面积均非零、
面环仅直线段；**孔环被切分线穿过时首切片诚实失败**（不近似的孔切分）。
失败 status=1，绝不把整面/空轮廓当 split。

**回放（test-only）**：新增 `resolveImprintSplitFace`——枚举 active authored
body 面，候选条件=线两端在面平面内且直线把面多边形切成两个正面积子面；
0/多候选、草图非单线、闭合面域存在时一律 fail closed。命中后
`resolveFaceRef` 取持久引用；`keepSide` 由 `imprintSign` 结合面参数法向与草图
平面法向（反向时翻转）换算。runner 改走 `faceExtrude`，`direction` 由“草图
法向 × oppositeDirection”与面参数法向点积决定。

**数据/转换修正（根因）**：Part 5/6 的 Sketch 2–4 建在上游 SWEPT_FACE 上，
converter 旧逻辑把 SWEPT_FACE 交给 CAP_FACE 推导，错误输出“水平面 z=常量”；
真实平面来自采集的 `sketches.json` 矩阵（如 Part 5 Sketch 2 = y=0、法向 -Y，
Sketch 3 = x=25.4、+X，Sketch 4 = y=76.2、+Y）。纠正后 E3/E4 的单线切分
语义才可解析。E1/E2 的多格面选择使用 Onshape bodydetails 面积+bbox+质心
证据（Part 5 右两列/左一列；Part 6 8 格底板+中间条带），不按 mask/前缀猜。

**验证结果（2026-11-10/11）**：合成 10×10×10 盒顶面 (0,0)→(10,5)：
left 75mm² add 1375 / right 25mm² add 1125、remove 625；`keepPoint` 覆盖
`keepSide` 得 1375；不在面平面/边界线/退化线 status≠0；L 形 void 凹口三角
面积 50。**Part 5 真栈严格绿**：逐步体积 98,322.384 / 245,805.960 /
262,193.024 / 229,418.896 / **204,838.300 vs 204,838.300（0.000%）**，9 步
树全 status=0，push+冷重开一致。**Part 6**：E1–E4 后体积 **188,451.236 vs
目标 188,451.236**；E5 在 Onshape 最终体前后 bodydetails 完全一致（16 面/
面积/box/ID 全同），是零几何变化 remove；产品仍对零相交 remove fail-closed，
spec 保持 `test.fail`。首切片不宣称通用 imprint（任意曲线/多线/孔切分/内核
Imprint 通道）。

**限制**：无 UI；converter 仍输出 imprintFace（由回放 resolver 在步骤时点
解析），不是转换器静态映射；void 仅支持直线外环；E5 零相交 no-op 未产品化；
不含 Part 5/6 之外未验证的 selector 泛化。

---

### 切片 D spike 与首切片设计（2026-11-06，face-extrude/imprint-face）

**spike 结论（真栈，Tutorial 2 iModel `f2278180`）**：`SolidModelingCommand` 的
`getBodySubEntities(Face)` 可枚举 **27 面/67 边**；对单个面调用
`getSubEntityGeometry(bodyId, {id, type: Face}, {wantGeometry,wantRange})` 返回面边界
几何条目——`ElementGeometry.toGeometryQuery(entry)` 得到 **Loop**（curveCollection），
range 为世界坐标。即**面边界环提取已可用，无需新增 native API**。同一探针在 UJ
debug 空几何 body 上 edge/face 均为 0（正常退化；服务端须按 0 面诚实拒收）。

**契约（shared 1.33.0）**：新增 `LubanFeatureType + "faceExtrude"` 与
`FaceExtrudeParams`（不把 `ExtrudeParams.sketchId/regions` 改成可选，避免污染既有
草图拉伸的全部守卫与 UI）：

```ts
export interface FaceExtrudeParams {
  /** 面所属 body 的元素 id（BIS body element id；回放时由 getBodies.bodyKey 取得）。 */
  bodyId: string;
  /** 该面的持久拓扑引用（resolveFaceRef 的产物，跨重建稳定）。 */
  faceRef: LubanTopologyId;
  operation: "add" | "remove" | "intersect"; // FeatureBooleanOperation 子集；NEW 首切片拒绝
  endBound: "blind" | "throughAll";
  depthMm?: number;                    // blind 必填
  direction?: ExtrudeDirection;        // 相对面法向
  secondDirection?: ExtrudeSecondDirection; // 复用 extrude 同形（throughAll 首版不支持）
  mergeScope?: BodyRef[];              // target body 引用（多体必需；scenario 的 booleanScope 在回放层解析）
}
```

**后端求值（私有仓）**：面引用→缓存 face 子实体 id（`facesFromId`）→
`getSubEntityGeometry`→`ElementGeometry.toGeometryQuery`；平面 Loop/ParityRegion
是世界坐标，直接作为 `sweepClosedWire`/region sweep 的输入，沿面法向按
depth/throughAll 扫掠，再按 operation 与上游体 Unite/Subtract/Intersect。
非平面面、0 环、op=NEW、secondDirection 首版诚实拒收；多 face 选择首切片只支持
单面（Onshape 多面查询由回放器逐面展开成多个 faceExtrude 步骤，后续切片再做
单特征多面）。

**回放/E2E（设计初稿，已被真栈修正覆盖）**：runner 通过 `resolveFaceRef` 取得
faceRef；面查询到体的几何匹配需按面环/草图 imprint 关系做唯一解析。曾计划把
Tutorial 2 iOS Extrude 2 升级为真实 faceExtrude。

**2026-11-06 真栈修正（iOS First Part，实证）**：Extrude 2 的 FACE 查询根是
`<sketchId>.imprint`，指向**草图面/材料面域**，不是实体 BRep 面。实测 Extrude 1
的顶盖是**单一面**（3 loops = 外环 hull + 两个 R10 孔）；唯一共面候选是
offset=25 mm 的另一端盖，不存在左环面片。solid-face 匹配因此零候选，不能把
imprintFace 映射为 faceExtrude。正确回放路径 = **草图面域 + imprint 侧向**：
查询 `topologyDisambiguation([[edge, ±1]])` 的 −1 选环外（若曲线是孔边界即
“孔侧”材料面域）、+1 选环内；converter 保留全部 queries 与 sign，多查询合并为
一次 extrude.regions。iOS −1→环面（region 1）已验证，体积 157478.901 vs
157478.902 mm³。faceExtrude 保留为“显式选择实体面”的独立能力（Onshape 的
“Faces and sketch regions”两者都有），当前语料没有该选择的映射，仅合成真栈
验收；不宣称 imprintFace 走 faceExtrude。

**UI**：无 live 面拉伸对话框证据前不新增入口（backend/contract 先行）；UI 切片
需采集 Onshape “从面拉伸”对话框后另批。

### 切片 D 实现记录（2026-11-06，shared 1.33.0：faceExtrude backend/contract/e2e）

- **契约**：`LubanFeatureType + "faceExtrude"`；`FaceExtrudeParams { bodyId, faceRef,
  operation(add|remove|intersect), endBound(blind|throughAll), depthMm?, direction?,
  secondDirection?, mergeScope? }`；shared `interfaceVersion = 1.33.0`；opDsl 白名单同步。
- **后端**（私有仓 `AsyncFeatureEval.evaluateFaceExtrudeAsync`）：上游 BRep 写 scratch
  载体 → `SolidModelingCommand.facesFromId(faceRef)` → `getSubEntityGeometry`
  → `ElementGeometry.toGeometryQuery`（Loop/ParityRegion）→ `CurveOps.isPlanar`
  局部化 → 沿面法向 `Sweep`（含孔面域外环−孔 CSG）→ 与上游 Unite/Subtract/Intersect。
  throughAll 用上游范围投影；secondDirection 首版仅 blind；非平面/多面片/失效引用/
  NEW 一律诚实失败（status=1/op 拒收）。
- **验证**：`FaceExtrudeFlow.test.ts` **5/5**（4×4×2 盒：add 1mm → 48、remove 1mm
  → 16、失效面引用 status≠0、schema 拒收）；`FeatureTypeRegistry/FeatureRpcImpl`
  51/51；真栈 `e2e/examples/face-extrude.spec.ts` **2 passed**——合成盒体顶面由
  dev-only 面枚举 + `resolveFaceRef` 取得持久面引用，faceExtrude add 1mm 体积
  **48.000 mm³**，push 后重开树 `sketch/extrude/faceExtrude` 全 status=0、体积一致。
- **仍未做**：faceExtrude 的 converter 映射（当前语料没有“显式实体面”选择）、
  NEW、secondDirection、UI 入口（无 live 证据）；published web/MS artifact 仍为
  1.32，本切片发布需重新构建双端产物。
- **2026-11-06 修正记录（imprintFace ∉ faceExtrude）**：
  - 证据：iOS Extrude 2 的查询根 `<sketchId>.imprint`；真栈面枚举显示顶盖单面
    （3 loops），无左环面片；solid-face 几何匹配零候选。故撤销“imprintFace→faceRef”
    的实现尝试，**不把未匹配的实体面冒充为 imprint 面**。
  - 已落地：converter（私有数据仓）保留全部 imprint queries + `imprintSign`
    （−1 环外/+1 环内）；公共回放层 `imprint-region.ts` 支持侧向选择与 sign 解析，
    runner 逐查询选面域、合并 regions；iOS 真栈 2 passed（体积 157478.901，
    side=outside，region 1）。单测：`imprint-region.spec.ts` 5 项、
    `scenario-to-op.spec.ts` 21 项、scenario schema 11 项。
  - Hand Brake Update（`08f0…`）数据已就绪：Extrude 2 两条 line 查询（−1）、
    Extrude 5/6 为 +1 圆；该 PS 仍被草图约束（MIRROR/CONCENTRIC/OFFSET 等）与
    Extrude 8 UP_TO_SURFACE 阻塞，保持 blocked，不转绿。
  - 若未来要支持“实体面选择”的 Extrude（真正的 face 拉伸），需另一类查询形状
    （根在 op 特征而非 sketch `.imprint`）与独立验收，不在本切片冒名。
  - **Rear Shock 探针（2026-11-06）**：Extrude 1 有 **5 条混合侧向 imprint
    查询**（线 + 圆，−1/+1 混合），其中线侧的 FACE 是 extrude 后的实体子面，
    不是草图材料面域；草图面域映射无法表达该选集（region 为空，回落到
    region 0 会让 Fillet 1 的 CAP_EDGE 无匹配）。结论：该 PS 需要真正的
    imprint/face split 才能精确回放，保持 blocked。顺带修复 converter 明文
    CAP_EDGE `"isStart":true` 解析（旧实现只认 compact `isStartT`），并给
    runner 增加多体无 scope 的显式谱系锚定；回归 5 passed。
  - **UJ Assembly Drawing 探针（2026-11-08）**：`a4c271/419abe` 单 blocker=面边界选择器；
    真栈建链 Main Body → Extrude 10/11/12 成功（体积 1696459.995→1293242.869→
    419576.578），Chamfer 10 的 `sweptFace` 查询在实体 #10（线，+x 侧）零匹配；
    同特征实体 #18/#22（.MirrorCS，-x 侧）可匹配。面拓扑回退实验（15 Face）候选 0。
    **根因复核（backend StandaloneDb，跳过约束）**：同链 body bbox x=[−60, 0]，
    即 Extrude 12（intersect，imprintSign −1）后 +x 材料已不存在——实体 #10 的
    目标面本不应存在。故这不是选择器/拓扑问题，而是上游 **imprintFace 面域选择/
    符号**把 intersect 保留侧选错（或该 query 需要真正的面 split）。回退实验撤销；
    3 个 UJ PS 保持 blocked-capability，不靠翻符号猜绿。
  - **Bumper Block 复核（2026-11-08，draft 落地后）**：Extrude 2 的 `imprintFace`
    在 Onshape 中从 Extrude 1 的顶面（z=40）再拉伸 40 + 10° 拔模；当前回放把
    imprintFace 近似成原草图 region 0（z=0 起）→ 与 Extrude 1 完全重叠，该步
    **add 0**。逐 step 体积：360000 → 360000 → Fillet 354373.149 → Hole
    346770.496；采集目标 636731.499（−45.5%）。Bumper Block 的剩余阻塞是
    **imprintFace 的面平面起点/子面语义**，不是 draft（draft 已由 v1.51 真映射）。
    **端盖映射试验（未保留，2026-11-08）**：converter/translator 临时把紧邻
    extrude 的 CAP_FACE 端盖映射为 `startOffsetMm=40`（并压过 A1 faceExtrude），
    Extrude 2 正确增加 **297764.787**（总 657764.787），但 Fillet 1 的面边界选择器
    展开为 **12 条边**（z=40 顶部 4 + 侧边 4 + z=0 底部 4），内核返回
    `blendEdges 无几何回包`，Fillet/Hole 级联 status=1。该映射使能力轨 status 变红，
    故整体回退（不保留实验代码）。后续需要真实的 Fillet 边集语义 + 内核 blend
    能力；在此之前 Bumper Block 保持 `volumePolicy: record`，不转绿。

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

## 2026-11-08 Stirrup imprint 补集面证据（blocked-capability）

- **Onshape 只读证据**：`ui-evidence/stirrup-20261108/stirrup-full.png`（公开文档
  `Exercise: Hand Brake Update` / Stirrup，21 特征、2 parts）与
  `stirrup-lubancad-prefix.png`（本仓回放到 Extrude 6 的体）。
- **Sketch 2 面域**：3 个互不相交的 9×20 矩形（后端 `getSketch` 实测区域面积
  各 180 mm²）。Extrude 2（REMOVE/THROUGH_ALL）的 queries 引用**侧边矩形**的边
  e7/e12，`imprintSign=−1`。
- **根因**：回放把 −1 解释为“该边相邻的矩形区域”（选中 regions [1,2]），只切掉
  两侧矩形与圆柱的窄条（−500.171 mm³）；Onshape 切的是**实体端面上的材料面**
  （圆柱端面减去三个矩形孔 = 补集面），随后 Fillet 2 的 CAP_EDGE（草图槽边）
  在体上无匹配 → `matches=0`。多个不相交闭环时“环外面”是补集面（外环 + 孔），
  不是任一相邻正区域；需要实体面枚举/面边界（face split）或从实体端面构造
  补集轮廓。
- **前缀体积（backend StandaloneDb 与 web 真栈一致）**：Extrude 1
  **15707.942**（r10×50）→ Fillet 1 14660.744 → Extrude 2 14160.573
  （仅 −500.171）→ Extrude 3 15417.209（+1256.64，r4–r6 环带正确）→ Extrude 4
  14851.723（−565.486）→ Extrude 5 12495.533（−2356.19）→ Extrude 6
  **零去材**；终 12495.533 vs 期望 15107.141（−17.3%），body 1 vs 2。
- 结论：Stirrup 保持 blocked-capability（任务 #106 根因更新）；不得用相邻矩形
  区域冒充补集面，也不得改容差放绿。

## 2026-11-08 hole 预览（HoleDialog）

- **后端**：`previewOp` 的 `updateParams` hole 走同步影子求值（
  `evaluateChainForPreview` 写 shadow Map 后直接取几何）；`insertFeature` hole
  用目标链尾缓存 + `evaluateHole` 在 scratch Map 上求值（不写库/不写缓存/无 txn），
  回传既有 `PreviewResult.preview`。HoleDialog 此前只拿到 affected，预览滑杆
  明确禁用（`previewUnsupported`）。
- **UI**：`HoleDialog` 增 `previewOp/connection/viewport`，提交载荷构造提取为
  `buildParams` 共用；250ms 防抖调预览，经 `FeaturePreviewOverlay` 门户渲染
  TileRpc 动态几何（源体隐藏 + 实心结果），底部透明度滑杆启用并驱动预览 alpha。
- **证据**：后端 `HoleFlow` **7/7**（新增预览用例：insert/update 均回传非空
  几何、elementId=目标体、体体积/树 params 零写）；单测 `HoleDialog.test.tsx`
  **8/8**（+1 预览调用）；真栈 `e2e/hole.spec.ts --grep 草图点` **2 passed**
  （throughAll 对话框 `data-dynamic=1`，去材 196.349 vs 196.350 mm³）。

## 切片 A5 实现记录（2026-11-08，shared 1.50.0：钻尖角）

- **契约**：`HoleParams.tipAngleDeg` 从「仅 180」放宽到 **(0,180]**；缺省或 180=
  平底（旧库逐字兼容），throughAll 忽略钻尖。无新字段/BIS 迁移；shared
  `LubanFeatureRpcInterface` **1.50.0**。
- **后端求值**（`FeatureEngine.evaluateHole`）：盲孔圆柱段（depthMm）之后追加
  钻尖锥工具，锥高 `h = r / tan(tipAngle/2)`；锥体由两个同心圆环 Loft 成锥台
  （顶圆半径 r·1e-5，避免退化点线；体积误差远低于验收容差），与主孔柱同轴，
  随 `direction=backward` 取反。圆柱/锥口/钻尖三工具一次 Subtract。
- **UI**：`HoleDialog` 钻尖角下拉（118°/180°，新建缺省 **118°**；live 证据
  `quickstart-copy-hole-dialog-20261105`：118°；编辑旧库缺省 180 回显）+
  **方向下拉**（正向/反向；live dialog.html 的「反向」控件，payload 仅反向时发
  `direction:"backward"`）；预览随参数实时更新。
- **converter**：`from-onshape-v2.mjs` 解析 `tipAngle`（deg）→ `tipAngleDeg`；
  仅 blind 采用，throughAll 保持 180（钻穿无残留，避免场景无谓漂移）；越界阻塞。
  旧 `holeVersion=LEGACY` 特征无 tipAngle 字段 → 保持 180（其钻尖语义未采集）。
- **验证**：后端 `HoleFlow` **8/8**（新增 φ4 深 5 盲孔 118°：去材
  **67.860 vs 67.866 mm³ 理论** 圆柱+锥）、`FeatureTypeRegistry` schema 118/180
  接受、0/181 拒收；web `HoleDialog.test.tsx` **10/10**（默认 118、可切 180、
  预览载荷、反向载荷）；翻译器 **36/36**（tipAngleDeg 透传）；真栈
  `e2e/hole.spec.ts --grep 盲孔` **2 passed**——φ5 深 4 盲孔 118° 去材
  **88.371 vs 88.371 mm³**，随后反向盲孔体积零变（材料在正向）、
  `params.direction=backward`、树/status 全 0。web 全量 **1467/1467**。
- **未做**：螺纹/间隙表/多深度表/按面 up-to、118° 以外非标准钻尖的像素级
  截面证据；真实示例中所有含盲孔的已转换场景仍被其它特征阻塞（本切片不冒充
  示例完成）。

## 切片 A6 实现记录（2026-11-08，shared 1.56.0：hole upToNext）

- **契约**：`HoleParams.endBound` 增加 `"upToNext"`（`blind`/`throughAll` 旧值逐字兼容）；
  `depthMm` 在 upToNext 忽略；钻尖角仍仅 blind 生效（throughAll/upToNext 平底）。
- **求值**：复用 `UpToPlane` 的最近平行面解析——求值前以孔位为探针，沿孔轴取最近
  平行面；候选面须在孔位投影点**实际边界**内（Loop 描边 + 射线奇偶，ParityRegion
  外层减孔；先 bbox 快筛）。多孔位逐孔解析目标平面并逐孔独立深度（v1.56 增补）；
  任一孔位无面则整特征 status=1。`upToNext` 预解析按孔位列表存入
  `resolvedUpToPlanes`，同步求值按索引取面。预览路径同样先预解析，HoleDialog 预览可见。
- **UI**：`HoleDialog` 终止条件增「成形到下一个面」，upToNext 隐藏深度输入；载荷
  `{endBound:"upToNext"}`（无 depthMm）；edit 回显。
- **验证（本切片停止点）**：
  - 后端 `HoleFlow` **10/10**：方块 20×20×10、φ3、upToNext → 去材
    **π·1.5²·10 = 70.686 mm³**；新增多孔位 upToNext（两孔位同目标面）→
    每孔独立去材 **2π·1²·10 = 62.832 mm³**；既有 throughAll/blind/tip/counterbore/preview
    全回归。
  - 新增 `HoleUpToNextSteppedFlow` **1/1**：20×20×5 基板 + 10×10×5 凸台；
    (5,5) 选凸台顶 z=10、 (15,15) 选基板顶 z=5 → 去材 **15π = 47.124 mm³**。
    若只用 bbox 会把 L 形基板顶（z=5）误选，本用例钉死点-面精确包含。
  - 「无探针」首跑误选同体孔底（去材 π·1.5²·2）→ 增加孔位边界过滤后修正；
    这是本切片的语义根因记录，不把近邻孔底当作目标面。
  - web `HoleDialog.test.tsx` **11/11**；`FeatureTypeRegistry` schema 放行 upToNext。
  - 真栈 `e2e/hole.spec.ts --grep upToNext` **2 passed（46.2 s）**：板厚 10、φ5、
    upToNext 去材 **196.349 vs 196.350 mm³**，树 `sketch/extrude/hole` 全 status=0，
    `params.endBound="upToNext"`。
  - 回放链路：translator 直通 `upToNext`（单/多孔位；带 note）**40/40**；
    后端 `ScenarioReplayParity` **6/6**（顶面草图孔轴反向 → 底 z=0，4000−40π）。
  - converter：hole `endStyle=UP_TO_NEXT` 映射 `upToNext`（多孔位也不再 drop）。
    Postman 4" Traction Wheel 重转后 endBound 不再是阻塞原因，该孔改由
    **沉头孔尺寸表达式未解析**阻塞，示例仍 blocked（不宣称解锁）。
  - shared **170/170**（interfaceVersion 1.56.0）；web **1497/1497**；后端全量
    **861 passed / 1 expected fail / 8 skipped（100 files）**。
- **未做**：upToVertex/upToSurface 孔、螺纹/间隙表；真实示例仍被其它阻塞项挡住；
  边界点/退化描边的容差策略未单独验收。
- **回滚**：additive 枚举/分支；移除 upToNext 分支即回到 1.55 行为，旧库无迁移。

## UP_TO_ENTITY 孔静态深度回放（2026-11-09，converter/translator，近似）

- **背景**：语料 27 个孔 `endStyle=UP_TO_ENTITY`，目标查询指向 body 边/面派生顶点
  （解码后含 SWEPT_FACE/CAP_FACE/FACES/EDGES），当前场景不持久化该目标查询与
  BRep 拓扑，产品无 up-to-entity 动态能力。
- **回放策略**：Onshape 已将解算深度写入 `holeDepthComputed`/`holeDepthComputedV3`；
  converter 在该终止条件下映射 `endBound="blind"` + 计算深度，并写
  `endApprox=true/sourceEndStyle=UP_TO_ENTITY`；公共 translator 转 `approximate=true`
  并在 note 明示“非动态目标”。**不得**把 `approximate` 步计入几何 complete；
  改参不会跟随目标面/顶点，只是复现采集状态。
- **验证**：translator 新增 upToEntity 静态近似用例，`scenario-to-op.spec.ts`
  **42/42**；重转 164 场景后 UP_TO_ENTITY 的 PS 均仍被其它缺口（自定义草图平面、
  sheet-metal、自定义特征等）阻塞，complete/geometry 计数不变（4/15）。
- **未做/阻塞**：真实 up-to-entity 动态解析需要持久化目标顶点查询/拓扑选择器与
  UI 拾取；当前不作为产品能力，不打开 HoleDialog 选项。

## 切片 E：imprint 有向边左/右侧语义修正（2026-11-09）

> **裁决**：Onshape `topologyDisambiguation([[edge, ±1]])` 的符号是**有向草图边的
> 左/右侧**，不是早先猜的“−1 环外/+1 环内”。旧解释是 2026-11-06 iOS 单例上的
> 巧合匹配；Tutorial 2 desktop First Part 的复杂排列面暴露了错误。

### 证据（Tutorial 2 First Part / 6 特征 / 目标 357,568.177 mm³）

- 排列面（backend `sketchRegionsFrom`，面积降序）：region 0 = 2298.418（spline 左
  叶）、1 = 1572.577（主矩形）、2 = 1153.385（上/右大面）、3 = 725.805（第二矩形
  右半）、4 = 483.870、5 = 121.290、6 = 120.645、7 = 0.062。
- 旧实现按“孔侧/外环 + 最大面积”选面：Extrude 1→region 1、Extrude 2→region 2、
  Extrude 3→region 0、Revolve→region 3；终体积 **352,290.918**（−1.476%）。
- 有向边侧测试（source edge 方向、左右偏移 0.05 mm、采样 0.25/0.5/0.75）：
  - rect.top：+1 左侧 → region 1；
  - 竖线 x=41.275：+1 左侧 → region 2；
  - 横线 y=42.875：+1 左侧 → **region 4**（旧实现误选 region 2）；
  - 竖线 x=22.225：+1 左侧 → region 0；
  - 第二矩形右竖边：+1 左侧 → region 3（revolve profile）。
- Extrude 2 的两条查询因此是 **region 2 ∪ region 4**；离线回放与真栈均得
  **357,566.375 / 357,566.084 mm³**（相对目标 5e-6，0.0006%）。差额来自排列面
  数值积分/圆角尾部，不是选面错误。

### 实现

- **shared 单一实现**：`packages/shared/src/sketch/imprint-region.ts`
  - `imprintEdgeSideFromSign(+1)=left / (−1)=right`；
  - `resolveImprintEdgeGeometry`（首版只受理非构造 line；arc/circle/spline 返回
    undefined，不拿弦线冒充）；
  - `pickImprintRegionByEdgeSide`：对每个包含该边的材料面域，用有向边左右偏移点
    与 `outerBoundary/holeBoundaries` 做点在面内测试；唯一命中才返回，同侧多候选
    （边被其它曲线分割）返回 undefined，交给调用方登记/回退，禁止按面积猜。
  - 偏移量 `clamp(length×0.01, 0.05, 0.5)` mm；采样 0.2/0.4/0.6/0.8。
  - **曲线边（2026-11-09 同日扩展）**：arc/circle 解析为曲线中点/参数起点附近的
    小弦（弧按 sweep 方向、整圆按 CCW），侧向偏移仍落同一材料面；spline 仍回退。
    iOS First Part 的 Extrude 2 是 circle sign −1（材料在右侧），离线回放
    **157,478.895 vs 157,478.902 mm³**（4e-8 相对）。
  - **qCompressed 符号恢复**：私有 converter `imprintSignFromQueryText` 现先
    `decodedQueryBody` 再取 `topologyDisambiguation`；Alignment/WARNING LABEL
    的压缩查询符号不再丢失。Alignment Cut 2 more holes 恢复 −1/+1 交替圆查询。

- **调用方**：公共 `e2e/examples/replay/run.ts` 与后端 `test/ScenarioReplay.ts`
  均先走 shared 精确选择；边界缺失/边型不支持时回退旧启发式并保持
  `approximate`/日志登记。多查询按并集合并；`dominantImprintRegion` 仍只用于
  NEW 收敛，不参与 add/remove。
- **契约**：纯 shared 工具，**不改 RPC 载荷/`interfaceVersion`**；无 schema/迁移。
  前端产品 UI 不变（用户本来就能选草图面域，变化是 Onshape query → region 的
  翻译精确化）。

### 验证

- shared **180/180**（新增 9 项：左右侧/面积反转/孔边界/边界缺失/同侧歧义/
  符号/边解析/arc-circle 弦/圆孔侧向）。
- 后端 `ScenarioReplayParity` **7/7**（新增合成两矩形多查询并集 1000 mm³）。
- 真栈 `first-part-scenario.spec.ts` **2 passed**——357,566.084 vs 357,568.177
  （0.0006%），1 body，push+冷重开；原 `test.fail` known-red 移除。
- 回归：Alignment 真栈 **2 passed**（8915.890 vs 8915.860，0.0003%）；
  WARNING LABEL 真栈 **2 passed**（0.8193532）；iOS 离线 **157478.895**；
  Wheel / Master Cylinder Piston 不变。
- 索引（2026-11-09 重生成）：strict `replicable-now` **2 → 7**（Tutorial 2
  First Part + WARNING LABEL ×4 + Wheel + Master Cylinder Piston）；
  imprint 近似 blocker **47 → 14**（剩余全部是 `regionRisk`，不是边侧语义）。
- 说明：本次只改 replay/converter 语义与 shared 工具，未改产品 RPC 载荷或
  `interfaceVersion`；已发布的 backend-20261109 产物行为不受影响。

### 未做 / 边界

- spline 的边侧语义未实现（当前回退并登记 approximate）；需要按切线方向/
  顶点 disambiguation 单独验收。
- `regionRisk`（converter 多面域前缀映射）仍是 14 个可测 PS 的近似来源。
  iOS/Alignment 的 `qSketchRegion(id, true)` 只给不透明 deterministicIds
  （如 `JGK/JGO/JGS`），没有 face-ID → region 静态映射；即使体积匹配也按
  `blocked-evidence` 处理，后续需采集 Onshape 面级 ID/逐面证据，不能把前缀
  当精确映射。
- **Bumper Block 分类纠正**：Extrude 2 解码后是 CAP_FACE 查询
  （`FQ77...opExtrude` + 草图边原依赖），不是 `<sketch>.imprint`；converter
  误标为 imprintFace 且无 ±1。真实阻塞是 capFace/起始面拉伸（产品 faceExtrude
  无 draft）+ 12 边 fillet 内核，归 P2 selector，不在本切片伪修。
- 同侧多候选（边被分割）仍未使用 Onshape 的顶点级 `INTERSECT` 信息；先诚实回退。
- 真实示例的 strict 完成度还受约束/UI/持久维度、其它 blocker 影响；本切片只解除
  imprint 的几何近似，不宣称所有 imprint PS 全绿。
- 回滚：移除两处 `pickImprintRegionByEdgeSide` 调用即回到旧启发式；shared 工具
  可保留无副作用。

## 切片 F：CAP_FACE 起始面 → 既有 extrude(startOffset+draft)（2026-11-09）

- **证据**：Bumper Block Extrude 2 的 qCompressed 是
  `FQ77...opExtrude + CAP_FACE`（从 Extrude 1 顶面 z=40 再拉 40 + 10° 拔模），
  不是 `<sketchId>.imprint`；converter 此前误标 imprintFace + region 0 近似
  （体积 −45.5%）。
- **实现（test-only replay，无 RPC 变更）**：
  - converter 识别 `opExtrude + CAP_FACE`，仅当上游是 **NEW/blind/非对称/非反向/
    无 draft/无第二方向** 时，导出 `selection.kind='capFaceExtrude'`：
    上游草图 + 面域集 + `startOffsetMm = 上游 depth`；
  - 公共 translator 把它映射为产品既有 `extrude` 的 `startOffsetMm` + 现有
    `draftAngleDeg`/`draftPullDirection`；起始面/拔模位置在真栈验证前标
    `approximateStartOffset`/`approximateDraft`；
  - 其它 CAP_FACE/SWEPT_FACE 形态仍 `kind='face'` → `BlockedCapabilityError`。
- **真栈（Bumper Block，`volumePolicy/statusPolicy: 'record'`）**：
  - Extrude 1 = 360,000 mm³；Extrude 2 新增 297,764.787 → 657,764.787 mm³；
  - 采集目标 636,731.499，**+3.303%**（旧近似 −45.5%）；
  - Fillet 1 status=1、Hole status=1（12 边 blend/后续孔内核仍阻塞），
    因此严格门仍 blocked-kernel；spec 只做能力覆盖，不宣称 complete。
- **边界**：上游 ADD/symmetric/反向/draft/secondDirection、当前反向/对称、
  非同一草图面域暂不映射；面选择的产品 UI（从面起始）仍未实现，当前是回放
  利用既有 startOffset/draft RPC 能力。
- **回滚**：移除 capFaceExtrude 分支即回到 `face` blocked，无 schema/产物变更。

## 切片 G：CAP_FACE 上游 imprint + 起始面法向换算（P2.1b，2026-11-09）

- **证据**：Drive Sleeve（Exercise: Intermediate/Update Drawing）Extrude 4 是
  `CAP_FACE(id+"FOk...opExtrude", isStart:true)`，上游 Extrude 1 为
  `NEW/oppositeDirection=true/depth=63.5` 且选择是 **8 条 imprintFace 查询**
  （不是 qSketchRegion）。旧 converter 只受理上游 qSketchRegion，Drive Sleeve
  Extrude 4 一直 blocked；另外 hole `scope` 明文是
  `id+"FOk....opExtrude"`，旧实现不剥 `.opExtrude` 后缀，scope 恒空，回放器
  不建 body 质心上下文，Hole 1 方向缺省 forward 钻向空处（零去材）。
- **实现（test-only replay，无 RPC/契约变更）**：
  - `resolveCapFaceExtrude` 受理上游 imprintFace：复制全部上游 imprint queries
    （草图/实体/±1）；同时从下游 CAP_FACE 的 `originalSetDisambiguation`
    提取边界边 UUID → 草图实体（Drive Sleeve：2/4/5/6/7）。
  - 起始面方向语义：`capNormal=上游方向`（blind/无 draft 的平坦帽面），
    `productDirection=capNormal×下游 oppositeDirection`；
    `startOffsetMm=capNormal×上游 depth`。Drive Sleeve 落地为
    `startOffset=-63.5、direction=forward`（下游 raw opposite=true 需要换算）。
  - 公共 runner：CAP_FACE 优先按“面域边界包含全部边界边”选面域（面选择是
    一个面的语义，不是逐边侧向并集）；无命中才回退逐边侧向；CAP_FACE 步禁止
    A1 整面 faceExtrude（会丢 startOffset）。
  - hole `scope` 剥 `.op*` 后缀后输出 `booleanScopeFeatureIds`，runner 为 hole
    建 body 质心上下文并按质心侧设置 `direction`。
- **真栈（Drive Sleeve，严格断言 + test.fail known-red）**：
  - 8/8 特征 **status=0**；Hole 1 `direction=backward`，6 孔真实去材；
  - 体积 **1,388,291.491 vs 1,175,024.308 mm³（+18.1%）**；修正前 Extrude 4
    无效果、Hole/pattern 零去材。
  - 类型检查/单测：`scenario-to-op.spec.ts` **50/50**；Bumper 回归
    **657,764.787（+3.303%）**。
- **剩余根因（转 P2.2）**：Extrude 1 的 8 条 imprint 查询在被草图线分割的面上
  各选一个子面；当前 region 引擎按整条边选唯一面域，并在 NEW 多查询时收敛到
  主导 region 0。正确 face set 需要 **edge-split 面集 resolver**（结合
  `topologyDisambiguation` 的顶点/半段信息）。这不是 CAP_FACE 起始面问题，
  不得把 +18.1% 记成 CAP_FACE 残留。
- **索引**：CONCENTRIC 补入 converter 能力表（converter 早已映射，表漏登导致
  50 PS 误报）；新增 `blocked-selector` 分类与 known-selector 证据表，两条
  Drive Sleeve 由 blocked-converter → blocked-selector；strict
  `replicable-now` 保持 **7**（known-red 不计绿）。
- **回滚**：删除 capFaceEdges/上游 imprint 分支回到 `face` blocked；hole
  scope 后缀修复可独立保留（真实 bug 修复）。

## 切片 H：面面积证据选择 + CAP_FACE isStart（P2.2，2026-11-09）

- **背景**：P2.1b 后 Drive Sleeve 全链 status=0，但体积 +18.1%。根因不是边侧
  符号，而是**面集反解**：Onshape 的 imprint/CAP_FACE 查询把一条草图边拆成
  半段/子面，逐条查询各选一个子面；product 面域引擎对整条边只给一个相邻面域，
  多查询会重复/漏选，NEW 的 dominant 启发式还会收敛到 region 0。
- **证据（只读 Onshape API）**：`bodydetails?includeTopology=true` 返回最终
  BRep 的 `face.id/area/box/surface`。Drive Sleeve：
  - 底盖 JHK area=10530.060 mm²（Extrude 1 的 8 个材料面域）；
  - 切削底 JNG area=4069.540 mm²（Extrude 4 的 4 个内盘面域）；
  - 顶面 JKK+JKW=2×1615.130 mm²（Extrude 3 两扇区）；
  - Extrude 2 由逐 body 体积方程反解为 25208.76 mm²（annulus + 4 quadrants）。
  逐 body 体积方程给出唯一分解：V1=10530.06×63.5、V2=25208.76×19.304、
  V3=3230.26×31.496、V4=4069.54×16.256、6 孔≈15.8k → **1,175,024 mm³**。
- **实现（test-only replay，无 RPC/`interfaceVersion` 变更）**：
  - shared `sketch/profile-area-select.ts`：`selectProfileRegionsByArea`
    在 `SketchRegionDto.area` 上枚举子集，按目标面积选唯一解；多解等距返回
    `ambiguous`，调用方不得裁决；面域数上限 20（超过 → undefined/blocked）。
  - scenario 可选 `params.profileAreaMm2` / `profileAreaEvidence`（自由对象）；
    Drive Sleeve 四段拉伸携带上述面积。该字段是**采集证据**，不是产品契约。
  - runner：面积证据命中后保留逐边查询命中为必需面域（CAP_FACE 除外），并
    跳过 NEW dominant 收敛；CAP_FACE 允许面积选集覆盖逐边结果。
  - **CAP_FACE `isStart` 语义**：`isStart:true` = 上游拉伸的**起始端盖**
    （草图平面），`false` = 深度端盖。起始端盖外法向 = −上游方向；Drive Sleeve
    Extrude 4 因此是 `startOffset=0、direction=backward`（从 z=0 向材料内切
    16.256），Bumper `isStartF` 保持 `+40/forward`。
- **真栈（严格）**：Drive Sleeve ×2 **1,175,022.882 vs 1,175,024.308 mm³
  （0.00012%）**，8/8 status=0，push+冷重开一致；`test.fail` 移除，strict
  `replicable-now` **7 → 9**。Bumper 657,764.787（+3.303%，record）不变；
  `scenario-to-op` 50/50；shared selector 单测 8/8。
- **边界**：面积 oracle 依赖采集面面积；未采集的 PS 仍走逐边/前沿选择并登记
  `blocked-selector`。面积证据只裁决“选哪些面域”，不改变特征参数/事务/提交。
- **位置证据**：bbox 作为 area 的第二 oracle，多解时不得按 mask 猜。
- **回滚**：删除 scenario 的 `profileAreaMm2` 即回到逐边选择；shared 工具可保留
  无副作用。

## 切片 I：草图建在拉伸端盖 + 压缩 imprint 识别（P4.2，2026-11-09）

- **证据/缺口**：Intro to CAD 1.2 Part 1/5/6 的 Sketch 2 plane 是上游 extrude
  的 CAP_FACE（`isStart:false`），converter 只认 Top/Front/Right，直接抛
  “不支持的草图平面”；Part 1–6 的 extrude selection 是压缩 imprint
  （`$imprint`/`S7$IMPRINT`，无 `.imprint` 点号），旧判定落 unknown。
- **实现（converter-only）**：
  - `planeDto` 增加 CAP_FACE/SWEPT_FACE 草图平面：定位上游 extrude 的
    **源 newSketch**（selection 引用或最近前驱），优先用采集 `sketchMatrix`，
    否则递归解析源草图平面；按 `isStart`/上游方向/depth 平移端盖。
  - imprint 识别改为 `/imprint/i`（覆盖压缩编码）。
- **真栈**：Part 1 / Part 2 **严格绿**（409,676.600 / 294,967.152 mm³，0.000%，
  树/status/body/push+冷重开）；Part 3/4 是 9 个同面积 645.16 区域的面积多解
  （blocked-selector，−35.7%/−62.5%）；Part 5/6 是单线 imprintFace 需要实体面
  split（blocked-selector，0 面域）。index strict `replicable-now` 9→11。
- **边界**：仅静态可推导的 blind 端盖；非 blind/revolve/曲面端盖仍 blocked。
  草图事实源/UI/RPC 不变，投影/外部引用仍按 ADR-0009。

### 切片 I 补：对称拉伸端盖（2026-11-09）

- `capFaceSketchPlane` 支持上游 `symmetric=true` 的 blind 拉伸：两端盖在
  ±depth/2，`isStart` 选择端；非对称仍为 0 / direction*depth。ENG_BEARING 的
  Sketch 2 由该形态驱动，真栈 2,590.224 vs 2,590.243 mm³（−0.001%）严格绿。
- 未支持：THROUGH_ALL/up-to 端盖、revolve/曲面端盖、非均匀/全圆 fillet。
