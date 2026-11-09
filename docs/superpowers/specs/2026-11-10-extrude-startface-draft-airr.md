# AIRR：CAP_FACE 起始面 + startOffset + 拔模的精确 faceExtrude 路径（Extrude 2）

- 状态：**提议 / 未批准（2026-11-10）**。本文件是设计门禁材料，不是实现、不是绿例；
  **未批准前不写产品代码**（P0-04）。批准前也不得把本设计计入 strict `replicable-now`。
- 日期：2026-11-10
- Owner：用户（待签字）
- 关联需求：Bumper Block 的 Extrude 2——CAP_FACE 起始面 + startOffset + 10° 拔模；
  计划 `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`；决策见
  `docs/adr/0016-extrude-start-face-draft.md`。
- 预计影响仓：`luban-cad/packages/shared`、私有 `luban-backend/modeling-server`（求值器）、
  私有 parity converter（test-only）、`luban-cad/apps/web`（test-only replay；产品 UI 不新增）。
  `viewer`/`editor`/`itwinjs-core` 原则上无产品改动（只复用既有面/拓扑/几何 API）；
  `imodel-native` 仅在 A2 解析边方案需要新 TS 暴露时另行评估（P0-08，另批批准）。
- 是否需要 ADR：**是**。`FaceExtrudeParams` 新增可选字段属于共享契约变更（P0-07）；
  若解析边需要暴露新的内核操作，还属于 native/接口变更（P0-08）。本 AIRR 不是批准；
  ADR-0016 与本 AIRR 同批评审，批准后才允许实现。

---

## 0. 结论先行

- 当前链路把 Bumper 的 Extrude 2 映射为既有 `extrude` 的 `startOffsetMm` +
  `draftAngleDeg`，轮廓仍取**原草图面域**；转换器显式标记
  `approximateStartOffset`/`approximateDraft`，回放步 `approximateSteps=1`。
- 该路径是近似的，原因不是单一“角度不对”，而是四处语义/证据缺口：
  1. **轮廓来源**：没有携带被选中的起始面；求值器不知道面，只按草图面域平移。
     此外，“CAP_FACE 就是拉伸 profile”本身尚未用解码证据钉死：当前 converter 把
     CAP_FACE 当作**原草图的起始参考**（S10）。
  2. **拔模构造**：产品用“远端整环 2D 偏置 + Loft”，不是 Onshape 的逐侧面拔模；
     矩形/圆弧/孔环的角部与截面定义可能不同。A1 继续复用该构造，**不修 P3**。
  3. **中性面/角度基准未取证**：Onshape 的拔模中性面可能是起始面、端面或草图面；
     10° 可能是相对 pull direction 或面平面。产品约定（起始面平面 + pull direction）
     是提案，必须由 S9 + Bumper pre-fillet 体积钉死。
  4. **边表示**：最终 body 的锥面侧边在产品侧是 `other:curvePrimitive`（不是
     `LineSegment3d`/`Arc3d`）；直接来源可能是 Loft tool、offset 构造或 Unite
     重写，S1 未定案前不把“Loft 结果”当已确定根因。
- Bumper 的公开证据：Fillet 1 的 oracle 展开只有 **16/20** 条 body 边（缺底面 4 条
  loop 边）；其中 4 条锥面斜边在产品侧是 `curvePrimitive`。严格轨回退到审计 20 边
  override 后为 **634,347.216 vs 636,731.499 mm³（−0.374%）**，Extrude 2 仍是近似步。
- **裁决：选 A**——扩展既有 `FaceExtrudeParams`（`startOffsetMm` / `draftAngleDeg` /
  `draftPullDirection`），以**被选中的起始面边界**为轮廓做 faceExtrude；`extrude` 的
  既有草图拔模链路保持不变。faceExtrude 已有面边界提取、逐环/孔的 CSG、标准
  FeatureOp/事务，复用面最大，不产生第二套建模管道。
- **A1/A2 测试门必须分离**：
  - **A1（语义接线）**：面边界轮廓、startOffset/draft 参数往返、失败封闭；拔模仍走
    既有“整环偏置 + Loft”。A1 的合成体积作为 **A1 baseline 记录**（预计接近当前
    297,764.787，实测为准），**不得**断言 sharp-frustum 297,002.158、line/arc 边或
    20/20。
  - **A2（精确几何）**：sharp-frustum **297,002.158 mm³**（或经证据的 measured A2
    baseline）+ 锥面侧边 line/arc + Bumper oracle **20/20** + pre-fillet
    **657,002.158 mm³**（或 measured A2 baseline）。A2 未达成 → Bumper 保持
    blocked-kernel；A1 不得冒充精确。
- **CAP_FACE=profile 假设是 A 的前置门**：只有解码证据（profile/entities/start-from
  字段）证明该选择是面驱动 profile，才可走 A 的精确路径；若是“从面起始、仍用原草图
  profile”的语义，A 对该特征不适用，保持 blocked/approximate。求值期还要用面边界
  与期望 profile（面积/bbox/边集）唯一匹配；不匹配即 fail closed（S10）。
- **Bumper startOffset=0 是推断**（面位于 z=40），不是已证事实；必须由 CAP_FACE 解码
  证据 + pre-fillet 体积门（657,002.158 或 measured A2 baseline）钉死（S10/S11）。
- **oracle 完整展开**（test-only）：私有 collector 必须按 Onshape 真实选择展开全部
  20 条边（含底面 4 条 loop），公共 resolver 仍 fail closed。16/20 是 test-only 缺口，
  4 条 `curvePrimitive` 是产品几何缺口，二者不得互相冒充。
- 本切片**不做 UI**：没有 faceExtrude/起始面拔模对话框的 live 证据；能力保持 gated，
  不渲染假按钮。AI/回放走现有 `insertFeature` FeatureOp，必须提供已解析的持久
  `faceRef`，不得猜面。
- 本文件所有测试均为**设计**，当前未运行；不改变已发布 `backend-20261109`（shared
  1.63.0）的行为。

---

## 1. 目标与验收

### 1.1 用户问题

Onshape 的 Extrude 可以“从已有实体面开始”拉伸（查询为 CAP_FACE），并带
startOffset、拔模与布尔操作。Bumper Block 的 Extrude 2 就是该形态：从 Extrude 1 的
顶面（z=40）再拉 40 mm、10° 拔模、ADD。产品当前没有“起始面 + 拔模”的精确路径，
只能用原草图面域 + 既有 `extrude` 偏移/拔模近似：

- 转换器把 CAP_FACE 识别为 `capFaceExtrude`，但落成 `extrude.startOffsetMm=40`
  + `draftAngleDeg=10°`（度制），轮廓仍是 Sketch 1 的 region；
- 求值器从草图平面（z=0）平移 40 后起拔，面本身没有被持久引用；
- 结果体的四条锥面斜边是 `curvePrimitive`，面边界 oracle 不能匹配；
- 严格轨依赖审计 20 边回退，尚未证明产品能自己选出/生成这 20 条解析边。

### 1.2 可观察验收标准（批准后实现时）

1. **契约**：`FaceExtrudeParams` 增可选 `startOffsetMm`、`draftAngleDeg`、
   `draftPullDirection`；旧 faceExtrude 载荷（1.33 起）逐字兼容；`ExtrudeParams`
   不变；无 BIS schema 迁移；`interfaceVersion` 按下一 minor bump。
2. **面语义**：求值轮廓 = 持久 `faceRef` 指向的**起始面边界**（Loop/ParityRegion），
   不是草图面域；`bodyId` 必须指向该面所属的 active authored 上游 body；
   面引用失效/非平面/多面片/不支持曲线一律 status=1，不静默退化。起始面可以与
   上游草图平面**不平行**（斜面）：旧 sketch-startOffset 路径无法表达，faceExtrude
   以起始面法向为准。
3. **CAP_FACE=profile 前置证据（S10）**：A 的精确性依赖“CAP_FACE 选择的是拉伸
   profile”，但当前 converter 把它当作**原草图的起始参考**。必须用解码证据
   （`profile/entities/start-from` 字段、查询种类、isStart、上游 profile/region 引用）
   证明该特征是面驱动 profile，才允许走 A 的精确路径；若是“从面起始、仍用原草图
   profile”，A 对该特征不适用（保持 blocked/approximate）。求值期还要用面边界与
   期望 profile evidence（面积/bbox/边集）**唯一匹配**；不匹配 → status=1（fail closed）。
4. **startOffset**：`startOffsetMm` 沿有效拉伸方向从起始面平移轮廓（正 = 进入拉伸
   方向；负 = 反向），`depthMm` 从平移后的起始平面起算；缺省 0。Bumper 的
   `startOffsetMm=0` 是**推断**（面位于 z=40），不是已证事实；必须由 S10 解码证据 +
   pre-fillet 体积门（S11）钉死，不得把转换器现在推断的 40 带入 faceExtrude。
5. **draft 基准（S9）**：产品提案为 `draftAngleDeg` 度制、`0<|angle|<89`、中性面 =
   平移后的起始面平面、`δ=depth·tan(θ_eff)`、`draftPullDirection` 翻转 θ 符号；
   但 Onshape 的 Bumper 中性面可能是起始面/端面/草图面，10° 可能是相对 pull
   direction 或面平面。**该约定是待取证假设**，必须由 S9 解码证据 + Bumper
   pre-fillet 体积钉死；首切片仅 `endBound=blind`，且与 `secondDirection` 互斥。
6. **A1 验收（语义接线，不宣称精确）**：面边界轮廓、startOffset/draft 参数往返、
   失败封闭；拔模继续复用既有“整环偏置 + Loft”。合成 180×50×40、10° 收窄只记录
   **A1 baseline 体积**（预计接近当前 297,764.787，实测为准；不是 sharp-frustum
   297,002.158），并断言 bbox/方向/参数落库往返；**不得**在 A1 断言 sharp-frustum
   体积、line/arc 锥面边或 20/20。
7. **A2 验收（精确几何硬门）**：
   - 合成 180×50×40、10° 收窄 = sharp-frustum **297,002.158 mm³**（或经证据的
     measured A2 baseline；远端 165.893842×35.893842），4 条锥面侧边为
     `LineSegment3d`/`Arc3d`（不是 `curvePrimitive`）；
   - Bumper Extrude 2 走精确 faceExtrude（`approximateSteps` 不含该步）；
   - **Bumper pre-fillet 体积门**：Extrude 2 后的 pre-fillet 体积 =
     **657,002.158 mm³**（= 360,000 + 297,002.158；或经证据的 measured A2 baseline），
     并把 Extrude 2 增量单独断言；该门不得被最终 ±0.5% 容差替代；
   - Fillet 1 的 oracle 解析出 **20/20** 条产品边（含 4 条底面 loop 边），且 20 条边
     全部为 line/arc；最终体积 636,731.499 mm³ 相对误差 <0.5%；树/status=0、1 body、
     push+冷重开一致。A2 未达成 → 该项保持 blocked-kernel；不得用审计 20 边回退冒充
     oracle 20/20。
8. **回归**：现有 sketch-extrude draft、faceExtrude 首切片、upToSurface/upToNext/
   upToVertex、THIN、Bumper record/strict fallback、示例 iModel 回归全绿；不得放宽
   断言或改 known-red 口径。
9. **失败封闭**：无效面/体、非平面、多面片、面边界含 spline/椭圆、拔模退化、
   起始偏移后 tool 与目标体零相交（remove/intersect）、内核空回包/非有限体积、
   CAP_FACE 不是 profile / 面边界与期望 profile 不唯一匹配 → status=1 或 blocked；
   体保持最后几何；op 边界非法组合 → `ok:false`，不落特征行。

### 1.3 参考证据

- **公开真栈证据**：`luban-cad/apps/web/e2e/examples/bumper-block-strict.spec.ts`
  注释与断言——20 条边的 node 分组（lower box 12、upper taper 8）、oracle 16/20、
  4 条锥面斜边 `curvePrimitive`、审计 20 边回退 634,347.216 vs 636,731.499
  （−0.374%）、Extrude 2 `approximateSteps=1`。
- **公开契约/实现**：
  - `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`
    `FaceExtrudeParams`（1.33）、`ExtrudeParams.startOffsetMm`（1.22）、
    `draftAngleDeg/draftPullDirection`（1.51）、`LubanTopologyId`。
  - 私有后端 faceExtrude 求值器：面引用 → carrier → `facesFromId` →
    `getSubEntityGeometry` → `ElementGeometry.toGeometryQuery` → `CurveOps.isPlanar`
    → 局部 Loop/ParityRegion → `Sweep` → 布尔。
  - 私有后端拉伸求值器：`loftDraftedLoop`/`sweepSketchRegionDraft` 使用
    `CurveOps.constructCurveXYOffset` + `BRepGeometryOperation.Loft`。
  - 私有 converter：CAP_FACE → `capFaceExtrude`，推断 `startOffsetMm=上游 depth`，
    标记 `approximateStartOffset`/`approximateDraft`。
- **历史裁决**：ADR-0006 切片 D 已选择独立 `faceExtrude` 特征（而非给
  `ExtrudeParams` 加 faceRef）；ADR-0005 Phase 4 的 sketch draft 仍是既有通道；
  ADR-0006 切片 C 记录“内核存在 taper 路径但 TS 侧未暴露”（具体私有接口/证据
  只在私有审计台账，不在公共仓复述）。
- **私有证据指针**：Bumper 的原始 features/CAP_FACE 查询、`profile/entities/
  start-from` 解码证据、face/edge oracle 采集、native 解析边探针与错误码只记录在
  私有 parity 数据仓 / 私有 native 审计台账；本文件不复制私有 id、绝对路径、
  测试名或内核错误码。S9（中性面/角度基准）、S10（CAP_FACE=profile）与 S11
  （startOffset=0/pre-fillet gate）的证据同样只以聚合结论 + 私有指针出现。

### 1.4 非目标

- 不做 UI 起始面/拔模对话框；不做面拾取器（无 live 证据，见 §9）。
- 不新增 `FaceExtrude` 之外的特征类型，不给 `ExtrudeParams` 加 `startFaceRef`。
- 不做 NEW body、多 face、多面片、非平面/曲面、spline/椭圆边界的 faceExtrude。
- 不做 throughAll+sweep draft、secondDirection+draft、THIN/SURFACE。
- 不做与起始面法向不重合的自定义拔模方向；首版 pull direction 固定为面法向，
  非平行拔模方向无契约字段（需要 live 证据/另切片）。
- 不做 replay-only 的体积/几何特判（硬编码 Bumper 体积、按示例调角、直接断言采集值）。
- 不改变草图/特征事实源、选择权威、事务/撤销管道、渲染管线。

---

## 2. 现状与根因

### 2.1 当前回放链

```
Bumper 私有场景
  └─ converter：CAP_FACE（上游 NEW/blind 拉伸帽面）
       → selection.kind="capFaceExtrude"
       → startOffsetMm = 上游方向 × 上游 depth（Bumper = 40）
       → approximateStartOffset / approximateDraft = true
       → 当前把 CAP_FACE 当作“原草图的起始参考”；是否等于 profile 未解码（S10）
  └─ 公共 translator：selection.kind=capFaceExtrude
       → 产品 insertFeature featureType="extrude"
       → params: sketchId（原草图）+ regions + startOffsetMm + draftAngleDeg
       → approximate=true（approximateSteps=1）
  └─ 私有后端拉伸求值器
       → sketchRegionsFrom（原草图面域）
       → startOffset 平移草图环
       → draft：远端环 XY 偏置 + Loft
       → Unite 上游体
```

### 2.2 为什么是近似

| # | 缺口 | 代码/证据 | 影响 |
|---|---|---|---|
| P1 | **轮廓不是起始面** | `ExtrudeParams` 只带 `sketchId/regions`；converter 未携带面引用，只在回放层推断“上游 depth”为偏移 | 只有“面恰好等于草图 cap”时才近似成立；面被 imprint/split/修改后即错；面与草图平面不平行（斜面）时旧路径根本无法表达；产品不知道面是否存在 |
| P2 | **startOffset 是推断值** | `startOffsetMm=40` 来自上游拉伸深度，不是 Extrude 2 的真实参数 | 语义混淆：面位置被伪装成“草图偏移”；面移动/上游改参时不会跟随面 |
| P3 | **拔模构造不是逐面拔模** | `loftDraftedLoop` = 整环 `constructCurveXYOffset` + `Loft`；不是按侧面/面法向的 taper | 角部/孔环/圆弧过渡可能不同；矩形远端不一定是 sharp-corner 矩形（见 §2.3）；A1 复用该构造，**不修 P3** |
| P4 | **侧边不是解析曲线** | 真栈枚举：4 条锥面斜边为 `other:curvePrimitive`；oracle 只接受 line/circle/arc | 4 条边无法匹配；Fillet 1 的 20 边选择不完整；回退到审计 override |
| P5 | **oracle 展开不完整** | 公开 strict spec：oracle 16/20，缺底面 4 条 loop 边 | 这是 **test-only collector/展开规则**缺口，不是产品几何缺口；不能靠加容差修 |
| P6 | **体积残差被圆角放大** | 当前 pre-fillet 657,764.787；审计 20 边圆角后 634,347.216（−0.374%） | 锥面斜边若非解析，blend 体积也会偏；必须把 Extrude 2 与 Fillet 分开验收；需要 pre-fillet gate |
| P7 | **CAP_FACE=profile 未取证** | 当前 converter 把 CAP_FACE 当作原草图的起始参考；没有解码 `profile/entities/start-from` 字段证明“面就是 profile” | A 的精确性依赖剖面语义；若只是起始参考，A 对该特征不适用；需要 S10 + 面边界/期望 profile 唯一匹配守卫 |
| P8 | **中性面/角度基准未取证** | 产品约定“中性面=平移后的起始面、10° 相对 pull direction”是提案；Onshape 可能是起始面/端面/草图面，10° 可能相对面平面 | 角度/偏移符号可能整体偏；必须由 S9 + Bumper pre-fillet 体积（657,002.158 或 measured A2 baseline）钉死 |

### 2.3 curvePrimitive 的根因判断（不确定处标 spike）

- **观测事实**：最终 body 的 4 条锥面斜边经 `ElementGeometry.toGeometryQuery` 分类为
  `CurvePrimitive`（不是 `LineSegment3d`/`Arc3d`），所以 `edge-oracle` 的 line/arc
  匹配器 0 命中。**但直接来源未确定**：可能是 (a) Loft tool 的 B-spline 侧表面/
  iso 曲线；(b) `constructCurveXYOffset` 对矩形/圆弧混合环的角部产生了非解析偏移；
  或 (c) Unite 与上游体的重合边界被内核重写。不能把“Loft 结果”当已确定根因。
- **需要 S1**：对**tool 体**与**最终 Unite 体**分别枚举边几何（类型/控制点/端点），
  并与纯 Sweep、纯 Loft、矩形/圆弧两组剖面做对照；在 spike 前不猜。
- **可观测的旁证**：Bumper 的公开 pre-fillet 体积为 657,764.787（Extrude 2 新增
  297,764.787）；同尺寸 180×50×40、10° 收窄的 sharp-corner 解析锥台体积为
  **297,002.158**。两者差 762.6 mm³（Extrude 2 的 +0.257%）。这只能说明当前
  “整环 2D 偏置 + Loft”输出**不是** sharp-frustum 形状；不能单独证明原因，也不能
  作为 A1 的精确断言。A1 记录 297,764.787 附近的实测 baseline；A2 才要求
  297,002.158 或 measured A2 baseline。

### 2.4 为什么 oracle 是 16/20

- 审计 20 条产品边分成两个持久拓扑 node：node 1（lower box）12 条、node 2
  （upper taper）8 条。oracle 的展开规则（matched edge + matched face loops）
  只覆盖 16 条；缺的 4 条是底面 loop 边。
- 这 4 条不是“产品少边”，而是**采集/展开规则**没把底面选择纳入；必须由私有
  collector 按 Onshape 真实选择补全，并在公共 resolver 中保持“0/多匹配即失败”。
- 即使 oracle 补到 20 条，P4 的 4 条 `curvePrimitive` 仍无法匹配；因此 **20/20
  必须同时修产品解析边与 oracle 展开**，二者不可互相冒充。

---

## 3. 选项比较与裁决

### 3.1 选项 A：扩展 `FaceExtrudeParams` + 起始面边界（选中）

**契约**：在既有 `faceExtrude` 上新增 `startOffsetMm` / `draftAngleDeg` /
`draftPullDirection`；`bodyId` + `faceRef` 指向**起始面**；求值以面边界为轮廓，
沿面法向拉伸。

**关键前提（S10）**：A 的精确性依赖“CAP_FACE 选择的是拉伸 profile”。当前 converter
把 CAP_FACE 当作原草图的**起始参考**；若解码证据表明该特征只是“从面起始、仍用原
草图 profile”，A 对该特征不适用（保持 blocked/approximate）。在 S10 证据前，A 的
适用范围必须限定为**有 live/解码证据的面驱动 extrude**，不能把全部 CAP_FACE 都当
profile。求值期用面边界与期望 profile（面积/bbox/边集）唯一匹配作 fail-closed 守卫。

**A1/A2 分层**：A1 只落地面轮廓/偏移/拔模参数接线，拔模继续复用既有整环偏置+Loft
（P3 不修）；A1 合成体积作为 baseline 记录。A2 才要求 sharp-frustum 体积、line/arc
锥面边、Bumper 20/20 与 pre-fillet 657,002.158（或 measured A2 baseline）。

**优点**

- 唯一把“被选中的面”放进契约的方案；消除 P1/P2 的草图伪装（P3/P4 由 A2 另修）。
- 复用既有 faceExtrude：面边界提取、Loop/ParityRegion、逐孔 CSG、标准
  FeatureOp/事务/撤销、已有合成真栈测试；不新增 feature type/RPC/工具。
- startOffset/draft 是可选字段；旧**单 body/无新字段**载荷逐字兼容；回滚只需移除
  新分支。多 body/歧义 faceRef 的旧载荷可能从“全局可解析”收紧为 status=1
  （见 §7.1）。
- 与 ADR-0006 切片 D 的既有裁决一致：面轮廓走 `faceExtrude`，不污染
  `ExtrudeParams`。
- 为 AI 提供清晰的参数语义：`bodyId`/`faceRef` + 面法向 + 深度 + 拔模；
  Agent 复用现有 FeatureOp，不新建建模 API。

**缺点/风险**

- 需要面解析（bodyId/faceRef）与面边界曲线类型限制；Bumper 的起始面解析要
  在真栈唯一命中，不能猜。
- **CAP_FACE=profile 假设**（S10）与**中性面/角度基准**（S9）都必须用解码/体积证据
  钉死；Bumper 的 `startOffset=0` 也是推断（S11）。
- A1 复用 Loft 拔模仍可能产出 `curvePrimitive`；必须 A2 解析边才能 20/20。
- `startOffsetMm` 与 `ExtrudeParams.startOffsetMm` 语义不同（面基准 vs 草图基准），
  文档/转换器容易混淆；必须显式命名与测试。
- 旧 backend 对新字段的非 strict schema 可能静默 strip（见 §7 回滚风险）。

### 3.2 选项 B：`ExtrudeParams.startFaceRef`

给既有 `extrude` 加 `startFaceRef`（+ 可能的 `startFaceBodyId`），轮廓仍可来自
草图，求值时若给面则改用面边界。

**拒绝理由**

- **与既有裁决冲突**：ADR-0006 切片 D 已选择独立 `faceExtrude`；给 `extrude` 再加
  面来源会产生两条“面轮廓拉伸”路径（P1-01 能力唯一性）。
- **组合爆炸**：`startFaceRef` 必须与 `sketchId/regions/profile`、operation=new、
  endBound（upToSurface/upToVertex/upToNext）、draft、THIN、secondDirection 做
  互斥/优先级；这些组合没有证据，容易产生静默优先级。
- **不解决 P3/P4**：仍要另做解析边拔模；只是把面语义塞进另一个 DTO。
- 旧 `extrude` 的 UI/守卫/测试全部需要重排，回归面远大于 A。

### 3.3 选项 C：修既有 startOffset+draft 实现/内核

保留 `extrude` + `startOffsetMm` + `draftAngleDeg`，改进求值器/内核：

- 变体 C1：求值器在 startOffset 平面附近从上游体反推出一个面轮廓；
- 变体 C2：把 Loft 拔模换成内核 taper/逐面解析构造。

**评价**

- C1 没有面身份，多个共面面/孔/面 split 时无法唯一反推；仍是启发式，不能作为
  产品精确契约。
- C2 是 A2 的必要子工作，但它只修拔模表示，不修“起始面”语义；把它作为主决策
  会让契约继续停留在草图近似。
- 结论：C2 作为 A 的 A2 子切片保留；C 不作为主决策。

### 3.4 选项 D：replay-only 精确近似

例如：转换器按示例硬编码起拔面/角度/体积；runner 直接使用审计 20 边或采集体积；
把 Bumper 的 CAP_FACE 固定为某个 `startOffsetMm` 并调参到体积接近。

**拒绝理由**

- 非参数化：上游面/草图/拔模改变时不会跟随；不能 AI 编辑。
- 违反 P0-06（单一事实源：params/BIS 才是模型事实源）与 P0-05（单一建模管道）；
  P0-10 的可撤销/HITL 也无法覆盖“测试特判”。
- 不解决 P4/P5：4 条 `curvePrimitive` 与 16/20 仍在；只是把测试弄绿。
- 不能作为产品能力或严格绿证据。

### 3.5 对比表

| 维度 | A FaceExtrude+startOffset/draft | B Extrude.startFaceRef | C 修既有实现/内核 | D replay-only |
|---|---|---|---|---|
| 面语义 | 显式 `bodyId/faceRef` | 显式但混入 extrude | 无面身份/启发式 | 无 |
| 复用度 | 高（faceExtrude 全链） | 中（extrude 全链但需重排） | 中（同一通道） | 低（示例特判） |
| 解析边潜力 | A2 可替换拔模构造 | 同 A2 | 仅 C2 | 无 |
| 契约风险 | 低（可选字段） | 高（互斥组合） | 低（无契约） | 无契约但违规 |
| 旧载荷 | 单 body/无新字段逐字兼容；多 body 歧义 fail closed | 需大量互斥守卫 | 逐字兼容 | 无 |
| AI/UI | 可参数化；UI gated | 可参数化；与 faceExtrude 冲突 | 可参数化但语义仍近似 | 不可编辑 |
| 裁决 | **选中** | 拒绝 | 仅保留 C2 作 A2 | 拒绝 |

### 3.6 复用矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建理由 | 许可证 |
|---|---|---|---|---|---|
| 面持久引用 | `LubanTopologyId` / `resolveFaceRef` | 已有 | 复用 | 与 shell/mirror/moveFace/faceExtrude 同源 | 项目自有 |
| 面引用动态解析 | `ExtrudeParams.endFaceRef`（upToSurface）的“持久面引用 + 每求值周期解析”模式 | 已有 | 复用模式，不复制字段 | `endFaceRef` 仍属 sketch extrude；faceExtrude 用 `faceRef` | 项目自有 |
| 面边界提取 | `facesFromId` + `getSubEntityGeometry` + `ElementGeometry.toGeometryQuery` | 已有（faceExtrude 首切片） | 复用 | 已验证 Loop/ParityRegion | 项目自有（iTwin 官方 API） |
| 面平面化 | `CurveOps.isPlanar` | 已有 | 复用 | faceExtrude 已用 | 项目自有（iTwin 官方 API） |
| 面域/孔 CSG | `faceSweepTool`（外环 − 孔） | 已有 | 复用/扩展 | 加 startOffset/draft 参数 | 项目自有 |
| 拔模构造 | `loftDraftedLoop` / `sweepSketchRegionDraft` / `constructCurveXYOffset` | 已有（sketch draft） | A1 复用；A2 替换/扩展 | A1 仅参数/轮廓接线；A2 再做解析边 | 项目自有（iTwin 官方 API） |
| 面环拔模适配 | `loftDraftedLoop`（`FeatureEngine` 私有）+ `sweepSketchRegionDraft`（只接受 `SketchRegion`） | 需适配 | 导出 `loftDraftedLoop` 并新增 `faceSweepToolDrafted(Loop/ParityRegion, ...)` | 不能把面 `Loop` 强塞给 `SketchRegion` helper；避免第二套拔模实现 | 项目自有 |
| 方向/第二方向/合并范围 | `ExtrudeDirection` / `ExtrudeSecondDirection` / `BodyRef` | 已有 | 复用 | 同形，不新造 | 项目自有 |
| 特征管道/事务 | `FeatureOp` → `FeatureService` → `BriefcaseTxns` | 已有 | 复用 | 无第二管道 | 项目自有 |
| 面解析（test-only） | `imprint-face-resolver` / `shell-face-resolver` / `readBrepFaceHandles` | 已有 | 扩展 | 起始面=上游帽面匹配 | 项目自有（test-only） |
| 边 oracle | `rollback-edge-oracle` + `edge-resolver` | 已有 | 复用；collector 补全 | 20/20 需全边展开；resolver 保持 fail closed | 项目自有（test-only） |
| UI | 无 faceExtrude/起始面 live 证据 | — | 不做 | 不渲染假控件 | — |
| 内核 taper | ADR-0006 切片 C 记录“未暴露” | 未知 | A2 spike | 另批 P0-08 批准 | 项目自有（私有 native） |

---

## 4. 决策与精确契约

### 4.1 裁决

选 **A**：`FaceExtrudeParams` 增可选 `startOffsetMm`、`draftAngleDeg`、
`draftPullDirection`；`bodyId` + `faceRef` 指向起始面；以面边界为轮廓。`extrude`
的 sketch draft 契约/求值不变。

- **A1/A2 分离**：A1 = 面轮廓/偏移/拔模参数接线 + 失败封闭，拔模继续复用既有
  整环偏置+Loft；A1 只记录 baseline 体积，不宣称 sharp-frustum/解析边/20/20。
  A2 = sharp-frustum 297,002.158（或 measured A2 baseline）+ line/arc 锥面边 +
  Bumper 20/20 + pre-fillet 657,002.158（或 measured A2 baseline）。
- **A2 未达成 → blocked-kernel**；不把 A1 或审计回退标绿。
- **CAP_FACE=profile 是 A 的前置证据**（S10）；若选择只是原草图的起始参考，A 对
  该特征不适用，保持 blocked/approximate。
- **中性面/角度基准是待取证假设**（S9）；Bumper `startOffset=0` 是推断（S11），
  必须由 pre-fillet 体积门钉死。

### 4.2 shared 类型（提议，下一 minor bump）

```ts
// 既有字段逐字保留（shared 1.33 起）。
export interface FaceExtrudeParams {
  /** 面所属 body 的元素 id（getBodies.bodyKey）。 */
  bodyId: string;
  /** 起始面持久拓扑引用（resolveFaceRef 产物）。 */
  faceRef: LubanTopologyId;
  /** 首版 add/remove/intersect；NEW 明确拒收。 */
  operation: "add" | "remove" | "intersect";
  /** 首版 blind/throughAll；draft 首版仅 blind。 */
  endBound: Extract<ExtrudeEndBound, "blind" | "throughAll">;
  /** blind 必填且 >0；throughAll 忽略。 */
  depthMm?: number;
  /** 相对面法向的扫掠方向；缺省 forward。 */
  direction?: ExtrudeDirection;
  /** 复用 extrude 同形；首版仅 blind，且与 startOffset/draft 互斥。 */
  secondDirection?: ExtrudeSecondDirection;
  /** 多体目标（与 ExtrudeParams.mergeScope 同语义）。 */
  mergeScope?: BodyRef[];

  // ---- 本设计新增（v1.64 提案；语义仍待 S9/S10/S11 取证） ----
  /** 起始轮廓沿有效拉伸方向相对起始面的平移（mm，有限；缺省 0）。
   *  正=沿 direction 前进，负=反向；depthMm 从平移后的起始平面起算。
   *  Bumper 的 0 是推断（面位于 z=40），需 S10 解码证据 + pre-fillet 门钉死。 */
  startOffsetMm?: number;
  /** 侧壁拔模角（deg，有限，0<|angle|<89）。提案：中性面=平移后的起始面平面；
   *  正角使远端材料外侧扩大（外环外扩、孔环收缩）；首版仅 endBound=blind。
   *  中性面/角度基准（起始面 vs 端面/草图面；pull direction vs 面平面）待 S9 取证。 */
  draftAngleDeg?: number;
  /** 翻转拔模符号（Onshape「反向」）；仅在 draftAngleDeg 在场时合法。 */
  draftPullDirection?: boolean;
}
```

- 命名刻意与 `ExtrudeParams` 的 `startOffsetMm`/`draftAngleDeg` 一致，但**基准不同**
  （面 vs 草图平面）。转换器/文档必须显式区分，禁止复用同一个推断值。
- 不新增 `FaceExtrudeDraftParams` 子对象；扁平可选字段与既有契约风格一致，
  旧载荷不出现新键即默认 0/无拔模。

### 4.3 字段语义

| 字段 | 默认 | 语义 | 禁止/失败封闭 |
|---|---|---|---|
| `bodyId` | 必填 | 面所属的 active authored 上游 body（bodyKey） | 不属于上游/被消费/被抑制/跨 PS → op 拒收或 status=1 |
| `faceRef` | 必填 | 起始面的持久拓扑 id（`resolveFaceRef`） | 失效/0 面片/多面片 → status=1 |
| `startOffsetMm` | 0 | 沿有效方向平移起始轮廓；正=进入拉伸方向 | 非有限 → schema 拒收；与 secondDirection 同给 → 首版拒收 |
| `draftAngleDeg` | 无 | 远端拔模角；**提案**中性面=平移后的起始面平面（S9 待取证） | 0/≥89/非有限 → schema 拒收；与 throughAll/secondDirection 互斥 |
| `draftPullDirection` | false | 翻转 θ 符号（Onshape「反向」） | 无 `draftAngleDeg` 同给 → schema 拒收 |
| `direction` | forward | 相对面平面 +Z 的扫掠方向 | 与 symmetric 无关（faceExtrude 无 symmetric） |
| `depthMm` | 无 | blind 深度；从平移后的起始平面起算 | blind 缺/≤0 → schema 拒收；throughAll 忽略 |
| `endBound` | **必填** | blind/throughAll；throughAll 从平移后起始平面算远端 | draft+throughAll → schema 拒收 |
| `operation` | 必填 | add=Unite、remove=Subtract、intersect=Intersect | NEW 不在枚举；remove/intersect 零相交 → status=1 |
| `secondDirection` | 无 | 既有 faceExtrude 第二方向 | 与 startOffset/draft 同给 → 首版拒收 |

- `bodyId` 解析必须**按体**：carrier/face 集合按 `bodyId` 过滤（或逐体 carrier）；
  跨体歧义 → status=1。旧**单 body** 载荷行为不变；旧**多 body** 载荷若 faceRef
  跨体/歧义，可能从“全局可解析”收紧为 status=1（fail closed，需旧 fixture 验证）。
- `startOffsetMm` 与 `draftAngleDeg` 的组合语义（中性面是否随 startOffset 平移）
  目前按“平移后的起始面平面”设计；**Bumper 的 startOffset=0 也是推断**，不是
  “不受影响”的已证事实。该组合需 live/合成证据（S8/S9）+ Bumper pre-fillet 门
  （S11）钉死，在证据前不得宣称通用精确。
- 首版拔模拉出方向固定为起始面法向；不支持与面法向不平行的自定义拔模方向
  （无契约字段；需要 live 证据/另切片）。
- **旧载荷兼容限定**：无新字段的旧 faceExtrude 载荷逐字兼容；但 body 归属/face
  唯一性是本设计新增的 fail-closed 守卫，旧多体歧义载荷可能变成 status=1。

### 4.4 校验/归一化（backend zod + 求值器）

```ts
const faceExtrudeSchema = z.object({
  // 既有形状不变
  bodyId: z.string().min(1),
  faceRef: z.object({ nodeId: z.number().int(), entityId: z.number().int() }),
  operation: z.enum(["add", "remove", "intersect"]),
  endBound: z.enum(["blind", "throughAll"]),
  depthMm: z.number().positive().optional(),
  direction: z.enum(["forward", "backward"]).optional(),
  secondDirection: z.object({ /* 既有 */ }).optional(),
  mergeScope: z.array(z.object({ bodyKey: z.string().min(1) })).min(1).optional(),
  // 新增
  startOffsetMm: z.number().finite().optional(),
  draftAngleDeg: z.number().finite().optional(),
  draftPullDirection: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.endBound === "blind" && v.depthMm === undefined)
    ctx.addIssue({ code: "custom", message: "faceExtrude endBound=blind 需要正 depthMm", path: ["depthMm"] });
  if (v.draftPullDirection !== undefined && v.draftAngleDeg === undefined)
    ctx.addIssue({ code: "custom", message: "draftPullDirection 仅在 draftAngleDeg 在场时合法", path: ["draftPullDirection"] });
  if (v.draftAngleDeg !== undefined) {
    if (!Number.isFinite(v.draftAngleDeg) || v.draftAngleDeg === 0 || Math.abs(v.draftAngleDeg) >= 89)
      ctx.addIssue({ code: "custom", message: "draftAngleDeg 须为有限非零角且 |angle|<89（度制）", path: ["draftAngleDeg"] });
    if (v.endBound !== "blind")
      ctx.addIssue({ code: "custom", message: "faceExtrude draft 首版仅支持 blind", path: ["endBound"] });
    if (v.secondDirection !== undefined)
      ctx.addIssue({ code: "custom", message: "faceExtrude draft 与 secondDirection 互斥", path: ["secondDirection"] });
  }
  if (v.startOffsetMm !== undefined && v.secondDirection !== undefined)
    ctx.addIssue({ code: "custom", message: "faceExtrude startOffset 首版与 secondDirection 互斥", path: ["secondDirection"] });
});
```

求值期归一化（不得省略）：

1. **体归属**：`bodyId` 必须是上游活动 authored body；carrier/face 集合必须按
   `bodyId` 过滤（或逐体 carrier），face 必须由该体解析；跨体歧义 → status=1。
   不能只按 faceRef 在整个 carrier 上全局搜面。旧单 body 载荷行为不变；旧多 body
   歧义载荷可能从“全局可解析”收紧为 status=1（预期 fail closed，需旧 fixture 验证）。
2. **CAP_FACE=profile 守卫（S10）**：先按解码证据判断该选择是“面驱动 profile”还是
   “原草图的起始参考”。后者或证据不足 → blocked（A 不适用），不得按 profile 求值。
   前者还要把面边界与期望 profile evidence（面积/bbox/边集）做唯一匹配；0/多匹配或
   超出容差 → status=1。不得以“最近的草图面域”替代。
3. **恰一面片**：`facesFromId` 返回恰 1 个 face；0/多 → status=1（不做多面合并）。
4. **平面面**：`CurveOps.isPlanar` 必须成功；非平面 → status=1。
5. **边界环**：`Loop`（无孔）或 `ParityRegion`（外环 + 孔环）；空/开环/多外环 →
   status=1。
6. **曲线类型**：首版只接受 `LineSegment3d`/`Arc3d`；出现 spline/椭圆/其它
   `CurvePrimitive` → status=1（不折线化、不近似）。
7. **环方向归一化**：在面局部 XY 内计算外环有向面积，统一为外环正向、孔环反向；
   拔模偏置符号以此为准（不能依赖 `isPlanar` 法向的偶然朝向）。
8. **起始面法向/方向**：`direction=forward` 沿局部 +Z；converter/resolver 负责把
   Onshape 的 outward/opposite 语义换算成该方向；面法向符号/outward 的校准是 S3
   spike（不得当作已证事实）。
9. **startOffset**：在起始面局部平移 `startOffsetMm`；`throughAll` 的远端距离
   从平移后的原点计算；draft 的中性面同样平移。Bumper 的 0 是推断（S11）。
10. **draft（S9）**：提案 `θ_eff = draftPullDirection ? -draftAngleDeg : draftAngleDeg`；
    `δ = depth·tan(θ_eff)`；外环偏置 `-δ`（材料外扩）、孔环偏置 `+δ`（材料内缩）。
    中性面/角度基准是待取证假设；退化/自交/远端环非闭合 → status=1。
11. **零结果/pre-fillet**：tool 体积非有限/≤0、remove/intersect 与目标体零相交、
    布尔结果空/非有限 → status=1；不得 no-op 假成功。Bumper 的 pre-fillet 体积门
    在测试层单独断言（不是求值错误）。

### 4.5 失败封闭矩阵

| 条件 | 阶段 | 行为 |
|---|---|---|
| `draftAngleDeg` 0/±89/NaN/Inf、反向孤键、draft+throughAll、draft+secondDirection、startOffset+secondDirection | op 边界（zod） | `ok:false`，不落特征行，不开事务 |
| `bodyId` 非上游/被消费/跨 PS，faceRef 形态非法 | op 边界/求值前 | `ok:false` 或 status=1（不写体） |
| CAP_FACE 解码为 start-reference（非 profile）或证据不足 | 回放/求值前 | blocked（A 不适用）；回退 approximate 时标 approximate，不宣称精确 |
| 面边界与期望 profile（面积/bbox/边集）0/多匹配或超容差 | 求值 | status=1；不以最近草图面域替代 |
| faceRef 失效、0/多面片、非平面、边界开环/空、含 spline/椭圆、环方向歧义 | 求值 | feature 行 status=1；体保持最后几何；缓存不写 |
| 跨体 faceRef/多 body 归属歧义（含旧多 body 载荷） | 求值 | status=1（fail closed）；旧单 body 载荷不受影响 |
| startOffset 后轮廓退化（自交/空环）、draft 远端环自交或非闭合、拔模角导致截面塌缩 | 求值 | status=1；不产退化体 |
| tool 体积非有限/≤0、remove/intersect 零相交、布尔空回包 | 求值 | status=1；不消费/不改体 |
| 上游缓存缺失、carrier/face 解析失败 | 求值 | 既有失败级联 status=1；不静默用旧几何 |
| 旧 faceExtrude 载荷（无新字段、单 body） | 全链 | 逐字沿用 1.33 首切片行为（48/16 等回归不变） |

### 4.6 精确几何（A1/A2）

**A1（语义接线，先落地；不宣称精确）**

- 面边界 → 局部环 → startOffset → **复用既有**“远端整环 `constructCurveXYOffset`
  + `Loft`”构造 → 布尔。
- A1 修正 **P1/P2**（面轮廓来源、startOffset/面基准）；**P3 不修**（拔模构造仍是
  既有整环偏置+Loft），**P4 不保证**（侧边仍可能是 curvePrimitive）。A1 的 e2e
  只记录 **A1 baseline 体积**（预计接近 297,764.787，实测为准），不得断言
  sharp-frustum 297,002.158、line/arc 锥面边或 20/20。
- **helper 适配（命名/导出）**：`sweepSketchRegionDraft` 的入参是 `SketchRegion`，
  不能传 face `Loop`；`loftDraftedLoop` 当前是 `FeatureEngine` 私有、未导出。
  A1 必须：
  - 导出 `loftDraftedLoop`（`FeatureEngine`），或迁到无环共享 helper（如
    `DraftLoft.ts`），保持 sketch 路径逐字不变；
  - 新增 `faceSweepToolDrafted(db, local: Loop | ParityRegion, distance, offset,
    planeToWorld, backward, startOffset)`：外环/孔环分别调用 `loftDraftedLoop`
    （外环 `-δ`、孔环 `+δ`），再与 `faceSweepTool` 同构做外环−孔 CSG；无 draft 时
    仍走 `faceSweepTool`。
  - 不复制第二套拔模代码；不把面 `Loop` 强塞给 `SketchRegion` helper。

**A2（精确几何，20/20 的硬前提）**

- **验收门（全部满足才算 A2）**：
  1. 合成 180×50×40、10° 收窄 = sharp-frustum **297,002.158 mm³**，或经证据的
     **measured A2 baseline**（远端 165.893842×35.893842；baseline 必须由
     tool/Unite 体证据记录，不得按最终 0.5% 反调）；
  2. 4 条锥面侧边在 **tool 体与最终 Unite 体**上均为 `LineSegment3d`/`Arc3d`
     （不是 `curvePrimitive`）；
  3. Bumper pre-fillet 体积 = **657,002.158 mm³**（=360,000+297,002.158）或
     measured A2 baseline；Extrude 2 增量单独断言；不得用最终 ±0.5% 替代；
  4. Fillet 1 oracle **20/20**（含 4 条底面 loop 边），20 条边全为 line/arc；
  5. 最终 636,731.499 mm³ ±0.5%、1 body、status=0、push+冷重开一致。
- 候选：
  - 候选 1：暴露内核 taper 路径（ADR-0006 切片 C 已记录其存在但 TS 未暴露），
    由内核直接生成平面侧面/解析边；需要 native/TS 接口变更与 P0-08 溯源、
    ctest、下游回归，另批批准。
  - 候选 2：按面/按边构造解析侧面（平面梯形/直纹面）并 sew 成体；需要确认内核
    是否有 face/sew 操作；没有则不可行。
  - 候选 3：Loft 后做内核 edge canonicalization（把几何上共线的 curvePrimitive
    归为 line）；必须证明不是显示层 hack，且布尔后仍保持解析边。
- **裁决门**：先在合成矩形上分别验证 tool 体/最终 Unite 体，再在 Bumper 上验证
  pre-fillet/20 边/最终体积。若任一门的解析边仍是 curvePrimitive，A2 未达成，
  Bumper 20/20 保持 blocked-kernel。不得只改 oracle 匹配器去接受 curvePrimitive
  当作 line（除非其几何被严格证明为直线且产品侧同意该表示；当前不采用）。

### 4.7 无第二建模管道 / 无假 UI

- 所有写操作仍走 `LubanFeatureRpcInterface` 的 `insertFeature`/`updateParams` →
  `FeatureService` → `BriefcaseTxns`/`saveChanges`；撤销/重做走标准事务。
- 不新增 RPC 方法/接口、不新增 feature type、不新增工具、不写 native geometry
  stream、不在前端本地求值。
- 产品 UI 不新增 faceExtrude 入口；FeatureDialog 的 faceExtrude 通道不存在，
  本设计不渲染假控件、不假装支持从面拉伸的 UI。AI/回放通过标准 FeatureOp 使用
  已解析的 `bodyId/faceRef`；没有面引用即阻塞，不猜面。

---

## 5. 跨仓影响

### 5.1 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | 子实体几何、面边界、持久拓扑 id | `SolidModelingCommand.getSubEntityGeometry`/`facesFromId`/`topologyIdFromSubEntity`；`CurveOps.isPlanar`/`constructCurveXYOffset` | vendored fork 5.15.0-dev.2（`itwinjs-core/core/{geometry,common,backend}`） | 复用；不改 fork |
| luban-cad/packages/editor | 面拾取/持久引用 | `resolveFaceRef` / `EditTools` | workspace `luban-cad/packages/editor` | 复用（test-only/未来 UI） |
| luban-cad/packages/viewer | 选择权威 | `store.canvas.selection` / `OnshapeSelectTool` | workspace `luban-cad/packages/viewer` | 不改；UI 后续 |
| luban-cad/packages/shared | 特征契约 | `FaceExtrudeParams` / `LubanTopologyId` / `ExtrudeDirection` / `BodyRef` | `LubanFeatureRpcInterface` 1.63.0 → 下一 minor（草案 1.64.0） | **扩展**（可选字段 + 版本 bump） |
| luban-backend/modeling-server | faceExtrude 求值、拔模、事务/缓存 | 面求值器 / draft helper / 注册表 schema | 私有 modeling-server（当前发布列车；需新 RC/源码模式） | **扩展**（新字段 + 归一化 + 失败封闭） |
| luban-backend/webhook-agent | 无直接关系 | — | 私有（不适用） | 不适用 |
| imodel-native | BRep 拓扑/taper | `SolidKernel.h` 现有接口；taper 路径未暴露（ADR-0006 切片 C） | 私有 canonical `SolidKernel.h` | A1 不改；A2 spike/另批 P0-08 |
| imodelhub-services | 无直接关系 | — | 仓外服务（不适用） | 不适用 |
| 官方 clients/BisSchemas | 参考契约 | 官方 editor/几何 API | `docs/api-specs/*.json` / 官方包 | 参考，不新增 API |
| DanQing/参考项目 | 不作为第二实现 | — | 仓外（不适用） | 不适用 |

### 5.2 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建理由 | 许可证 |
|---|---|---|---|---|---|
| 面边界轮廓 | faceExtrude `getSubEntityGeometry` 通道 | 已有 | 复用 | 已做首切片/合成真栈 | 项目自有（iTwin API） |
| 含孔面 CSG | `faceSweepTool` 外环−孔 | 已有 | 复用 | 同语义 | 项目自有 |
| startOffset | `sweepClosedWire` 的 `startOffset` 位移 | 已有（sketch） | 扩展 | 同参数语义，换面基准 | 项目自有 |
| draft | `loftDraftedLoop`/`sweepSketchRegionDraft` + 新 `faceSweepToolDrafted` | 已有（sketch） | A1 复用 | A1 仅参数/轮廓接线；A2 再解析边 | 项目自有 |
| 方向/第二方向 | `ExtrudeDirection`/`ExtrudeSecondDirection` | 已有 | 复用 | 同形 | 项目自有 |
| 面持久引用 | `LubanTopologyId`/`resolveFaceRef` | 已有 | 复用 | 同源 | 项目自有 |
| 回放面解析 | `imprint-face-resolver`/`shell-face-resolver`/`readBrepFaceHandles` | 已有（test-only） | 扩展 | 起始面匹配上游帽面 | 项目自有（test-only） |
| 边 oracle | `rollback-edge-oracle`/`edge-resolver` | 已有 | 复用 + collector 补全 | 20/20 需完整边集 | 项目自有（test-only） |
| 事务/撤销 | `FeatureService`/`BriefcaseTxns` | 已有 | 复用 | 无第二管道 | 项目自有 |
| UI | 无 live 证据 | — | 不做 | 不造假控件 | — |

### 5.3 跨仓影响表

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | `FaceExtrudeParams` 新可选字段；`interfaceVersion` 下一 minor | 无 BIS schema | 无 | 契约/编译测试 | shared 先发 |
| modeling-server（私有） | faceExtrude schema/formModel/求值器 + `faceSweepToolDrafted`/`loftDraftedLoop` 导出 | 无 BIS schema | A2 可能需 TS/native taper 暴露 | 后端 faceExtrude 求值器测试、StandaloneDb、真栈 | shared 后同批；需新产物 |
| 私有 converter（test-only） | CAP_FACE → faceExtrude 精确映射；面证据 | scenario 可选字段 | 无 | converter 单测/重转 | 不提交公共仓 |
| 公共 replay/translator（test-only） | `faceExtrudeOp` 新字段 + 面解析钩子 | scenario schema 可选 | 无 | translator、oracle、真栈 | 公共测试代码 |
| apps/web 产品 UI | 无新入口（gated） | 无 | 无 | 能力门禁/回归 | 同批 |
| viewer/editor | 无 | 无 | 无 | 选择/引用回归 | 不变 |
| itwinjs-core | 仅消费既有 API | 无 | 无 | 既有测试 | 不变 |
| imodel-native | A1 无；A2 另批 | 无 | 可能新增 taper 暴露（P0-08） | ctest/provenance/下游 | 另批批准 |
| hub/DanQing | 无 | 无 | 无 | — | 不适用 |

### 5.4 版本与发布顺序

- 当前公开契约 1.63.0；本提案下一 minor（**1.64.0**，若同批其它提案先占则顺延）。
  实现时以当时 `interfaceVersion` 的下一 minor 为准，不在本设计预占版本。
- 发布顺序：shared → 私有 modeling-server（新产物/RC）→ web/replay 同批。
  已发布 `backend-20261109`（shared 1.63.0）**不含**新字段；真栈验收必须用
  新构建的 backend（源码模式或新 RC），不得用旧产物宣称通过。
- 配对 PR：公共 shared + 私有 backend + 公共 replay/测试文档互相链接；公共仓
  同步接口冻结矩阵/ADR 记录（在批准后）。
- 兼容矩阵：
  - 旧 shared/旧 web → 新 backend：不发新字段，行为不变。
  - 新 web/replay → 旧 backend：**风险点**。旧 `faceExtrudeSchema` 非 strict，
    zod 会 strip 未知键，导致“无拔模/无偏移”的静默降级。缓解：
    (a) 产品 UI 不发新字段直到 backend 广告能力（`getFeatureFormModel` 含新字段）；
    (b) 发布顺序 backend 先于发送方；
    (c) 回滚时隔离/恢复含新字段的文档（见 §7）。
    新 backend 可把 faceExtrude schema 收紧为 `.strict()`（未知键即拒收）作纵深
    防御；旧 backend 无法追溯修改，故不能替代 (a)(b)(c)。
  - 新 backend → 旧 web：旧 web 不发新字段，读面忽略新参数，行为不变。
  - **旧 payload 限定**：无新字段的旧 faceExtrude 载荷在**单 body/faceRef 唯一**时
    逐字兼容；多 body/跨体 faceRef 可能因新的 body 归属守卫从“全局可解析”变为
    status=1（预期 fail closed，旧 fixture 必须覆盖并登记）。
- **范围门**：A 只对“CAP_FACE 解码为面驱动 profile”的特征发布；start-reference
  形态继续走既有 approximate/blocked，不得把 A1 参数接线当作覆盖全 CAP_FACE。
  A1 可随 shared/backend 发布但不算精确；A2 需要解析边实现（可能另批 native/TS）。

---

## 6. 数据、事务、安全

- **事实源**：`params`（`bodyId`/`faceRef`/`operation`/`endBound`/`depthMm`/
  `direction`/`startOffsetMm`/`draftAngleDeg`/`draftPullDirection`）是唯一定义；
  面边界几何每次求值从 BRep 面重新提取，不落 params、不写 native geometry stream。
- **schema/迁移**：FaceExtrudeParams 仅加可选字段；无 BIS schema 变更、无库迁移、
  无数据丢失。旧 faceExtrude 文档不含新键且 faceRef 单 body 唯一 → 逐字沿用旧行为；
  旧多 body/跨体 faceRef 可能因本设计新增的 body 归属守卫变为 status=1（fail closed）。
- **事务边界**：一个特征 = 一个 FeatureOp = 一个 `BriefcaseTxns` 事务；面解析/求值
  是读+缓存写，不单独提交。失败 status=1 不写体/缓存；撤销/重做沿用标准事务。
- **Undo/redo**：新字段随 params 行一起回滚；面引用在 undo/redo 后按持久 id 解析；
  失效时 status=1（不静默 no-op）。
- **写租约/权限/限流**：沿用现有写租约/`rpcGuard`；不新增写通道。
- **日志/审计**：只记录聚合错误码/阶段；不打印私有几何/查询串/绝对路径；公共仓
  不含私有 id/测试名/内核错误码。
- **安全/许可**：只消费现有 `SolidKernel.h` 能力；A2 若涉及 ACIS taper，必须确认在
  已授权 Modeler/Polyhedra 范围内；不接线未授权能力（P0-09）。

### 6.1 性能与渲染影响

- **渲染：无变化**。不新增/修改 shader、装饰件、tile flags 或 BRep 显示管线；
  faceExtrude 结果仍走既有 BRep 渲染与拓扑边叠加。失败时只保留最后几何，不渲染
  假预演/假面；面选择 UI 仍 gated。
- 性能：面解析/边界提取每特征一次，不在 hover/pick 每帧触发；大环面上限见 §8.4；
  冷开/rebuild 的增量成本按面数线性，实现时测量登记。

---

## 7. 迁移与回滚

### 7.1 迁移

- 无。新字段是 faceExtrude params 的可选键；旧库/旧 changeset 不需要迁移脚本。
- 旧数据 fixture：保留 1.33 faceExtrude 载荷（无新字段、**单 body/faceRef 唯一**）
  与旧 sketch-extrude draft 载荷，逐字回归；另加**旧多 body/跨体 faceRef** fixture，
  预期在新 body 归属守卫下 status=1（fail closed，登记而非静默兼容）；新字段文档
  只在批准后创建。

### 7.2 回滚

- **契约/求值回滚**：删除 schema/evaluator 的新分支；旧 faceExtrude 行为恢复；
  只含旧字段且**单 body/faceRef 唯一**的文档不受影响。多 body/跨体旧载荷即使在新
  backend 也可能因 body 归属守卫 status=1（这是预期的 fail closed，不是回滚引入）。
- **含新字段的文档**：params 数据仍在；若回滚到不含新字段的旧 backend，
  旧 schema 会 strip 新键并给出“无拔模/无偏移”的几何（静默降级）。因此：
  - 回滚前审计/导出所有含 `startOffsetMm`/`draftAngleDeg` 的 faceExtrude 文档；
  - 从启用前 checkpoint 恢复，或保持 backend ≥ 新版本；
  - 不得把旧 backend 的静默几何当作正确结果；不得用旧版本合并/忽略新键。
- **A2 回滚**：禁用解析边构造，保留 A1 面边界+Loft 路径；文档仍可求值，但
  Bumper 20/20 回到 blocked-kernel；不把 A1 当精确。
- **测试回滚**：oracle 20/20 仅在新路径可用时启用；旧的审计 20 边回退保留为
  record/known-red，不计入严格绿。

### 7.3 兼容窗口

- shared bump → backend → web 同批；公开发布由 release owner 执行。
- 新 web/replay 对旧 backend 的静默 strip 风险属于已知 X-11（runtime 无版本协商）；
  本设计不关闭 X-11，但要求发送方能力探测/后端先发。含新字段的文档跨版本前先
  审计/恢复，避免语义丢失。

---

## 8. 测试矩阵

> 以下均为**设计**；批准后实现时按此建测试，未运行前不得声称完成。

### 8.1 shared / 契约

| 用例 | 覆盖 |
|---|---|
| `FaceExtrudeParams` 新字段编译/往返；旧 1.33 载荷无新键 | 契约 |
| 新字段默认 0/无拔模；`ExtrudeParams` 不变 | 兼容 |
| `interfaceVersion` bump + 双端同发布检查 | 版本 |

### 8.2 backend 单元 / StandaloneDb

| 用例 | 门 | 验收 |
|---|---|---|
| 既有 4×4×2 盒顶面 faceExtrude add 1 mm | 回归 | **48.000 mm³** |
| 既有 remove/backward 1 mm | 回归 | **16.000 mm³** |
| 180×50×40 盒 + 顶面 faceExtrude add 40（无 draft） | A1 | 新增 **360,000 mm³**；总 **720,000** |
| 同上 + `startOffsetMm=-5`（进入体 5 mm） | A1 | 新增 315,000；总 **675,000**（去除重叠） |
| 同上 + draft 10°、`draftPullDirection=true`（收窄） | **A1** | **记录 A1 baseline 体积**（预计接近 297,764.787，实测为准；**不是** 297,002.158）；bbox/参数落库往返 |
| 同上 + draft 10°、`draftPullDirection=false`（外扩） | **A1** | **记录 A1 baseline 体积**（不是 427,012.818）；bbox/参数往返 |
| 同上 + draft 10° 收窄 | **A2** | sharp-frustum **297,002.158 mm³**（或经证据 measured A2 baseline）；远端 165.893842×35.893842（z=80） |
| 同上 + draft 10° 外扩 | **A2** | sharp-frustum **427,012.818 mm³**（或 measured A2 baseline）；远端 194.106158×64.106158 |
| 同上 + draft + 4 条锥面斜边 | **A2** | tool 体与最终 Unite 体边枚举全部为 line/arc（无 curvePrimitive）；未达成 → known-red/blocked-kernel |
| Bumper pre-fillet 体积 | **A2** | **657,002.158 mm³**（或 measured A2 baseline）；Extrude 2 增量单独断言；不得用最终 ±0.5% 替代 |
| 含孔面（外环+孔）draft | A1/A2 | A1：外环外扩/孔环收缩的标志/参数；A2：解析体积对拍、孔环偏置反向 |
| CAP_FACE 解码为 start-reference / 证据不足 | A1 守卫 | blocked（A 不适用）；approximate 回退必须标 approximate |
| 面边界与期望 profile 0/多匹配或超容差 | A1 守卫 | status=1；不以最近草图面域替代 |
| 失效 faceRef / 0/多面片 / bodyId 不属于上游 | A1 守卫 | status=1；体保持；无缓存写 |
| 旧多 body/跨体 faceRef（含旧载荷） | A1 守卫 | status=1（fail closed）；旧单 body 载荷不受影响 |
| 起始面与上游草图平面不平行（斜面） | A1/A2 | A1：方向/参数；A2：解析体积/边；旧 sketch 路径不得参与精确断言 |
| 非平面面（圆柱侧面）/ 开环 / spline 边界 | A1 守卫 | status=1；不折线化 |
| 面法向退化/零法向、draft 无法定义方向 | A1 守卫 | status=1；不产体 |
| 自定义/非平行拔模方向（无契约字段） | 契约 | 不接收；需要 live 证据/另切片 |
| draft 0/89/NaN、反向孤键、draft+throughAll、draft+secondDirection、startOffset+secondDirection | 契约 | zod 拒收矩阵 |
| blind 缺 depth、负/零 depth、缺 endBound | 契约 | zod 拒收 |
| 退化拔模（深度×tan 角使远端截面塌缩） | A1 守卫 | status=1；体不变 |
| remove/intersect 零相交 / 空回包 | A1 守卫 | status=1；不假成功 |
| undo/redo + 冷重建（清缓存+rebuildAll） | A1 | 体积/树/status 一致 |
| 旧 faceExtrude 载荷（单 body/无新字段） | 回归 | 逐字兼容，无新行为 |

### 8.3 真栈 e2e（批准后）

- **A1 合成轨**（语义接线，不宣称精确）：
  - 180×50×40 盒 → 拾取顶面 → faceExtrude add 40（无 draft/有 draft）→
    面边界轮廓、startOffset/draft 参数往返、bbox/方向；**记录 A1 baseline 体积**
    （预计接近 297,764.787，实测为准；不得写 297,002.158）；
  - 失败注入：非平面/失效面/start-reference/退化角 → status=1/blocked，无假几何；
  - push+冷重开：树/status 一致。
- **A2 合成轨**（精确几何硬门）：
  - 同一命令 → **297,002.158 mm³**（或 measured A2 baseline）、远端尺寸、
    tool/Unite 体 4 条锥面边为 line/arc；push+冷重开一致。
- **A2 Bumper 精确轨**（可与现有 `bumper-block-strict.spec.ts` 并存，新增
  `EXACT_FACE_EXTRUDE=1` 或独立 spec）：
  - Extrude 2 走 faceExtrude，`approximateSteps` 不含该步；CAP_FACE 解码证据确认
    face-driven profile，且 `startOffset=0` 推断被 pre-fillet 门钉死；
  - **pre-fillet 体积 657,002.158 mm³**（或 measured A2 baseline），Extrude 2 增量
    单独断言；该门先于最终门；
  - Fillet 1 oracle **20/20**，20 条边全为 line/arc，**不使用**审计 20 边回退；
  - 最终体积 636,731.499 mm³ 相对误差 <0.5%；树/status=0、1 body；
  - push+冷重开一致；回退原因 notes 为空（若走回退则测试失败）。
- **S9/S10 证据轨**：
  - 解码/私有证据确认中性面（起始面 vs 端面/草图面）与 10° 基准（pull direction vs
    面平面）；若与产品约定不一致，调整 A2 构造或登记 blocked，不得用最终 ±0.5% 掩盖；
  - start-reference 形态必须 blocked/approximate，不能进入 A2 精确轨。
- 回归：现有 `bumper-block-strict.spec.ts` 审计回退仍为 record/known-red（不冒充绿）；
  `face-extrude.spec.ts` 48.000 mm³；`extrude-draft-ui.spec.ts` 与后端 extrude draft
  回归 4/4；`extrude-thin-wall-ui` 与后端薄壁回归 7/7；后端 upToSurface 回归 12/12；
  `scenario-to-op` 全量；示例 iModel `verify-imodels` 不变。

### 8.4 性能/安全

- 面解析/边界提取每特征一次；目标 <100 ms/典型面（设计目标，实测登记）；
  不在 hover/每帧路径触发。
- 大环面上限：首版建议 ≤256 条边界曲线/面，超限 status=1（设计约束，实测后调整）。
- 不新增密钥/网络；日志不打印私有几何/查询串；A2 native 改动需 ctest/provenance。

### 8.5 known-red 政策

- A2 未达成前，Bumper 20/20 与 4 条解析边保持 blocked-kernel；
- oracle 16/20 是 test-only 展开缺口，登记为 test/collector 缺口，不记产品绿；
- 不调容差、不把审计回退、不把 `curvePrimitive` 当 line、不硬编码体积。

---

## 9. UI / AI 与证据缺口

- **UI**：产品当前没有 faceExtrude 对话框/起始面拾取入口。需要（私有 `ui-evidence/`）：
  起始面选择器、startOffset 字段、draft 角度/反向、与布尔/合并范围的布局、失败提示。
  在 live 证据采集前**不新增控件**；能力保持 gated，不渲染假按钮。
- **AI**：Agent 复用 `insertFeature` FeatureOp；必须从选择权威/解析器取得持久
  `bodyId`/`faceRef`，并显式给 `operation/endBound/depthMm/startOffsetMm/
  draftAngleDeg/draftPullDirection`。没有面引用 → 阻塞；不得按位置猜面。
- 标准事务可撤销；remove/intersect 是标准 Subtract/Intersect，仍可撤销；
  不新增不可逆/HITL 例外。

---

## 10. 实施切片（批准后）

1. **A1 契约 + backend 语义**（shared bump + schema + evaluator + formFields）：
   面边界轮廓、startOffset、draft 参数接线、`faceSweepToolDrafted`/`loftDraftedLoop`
   适配、CAP_FACE=profile 守卫、body 归属守卫、失败封闭；记录 A1 baseline 体积。
   **不宣称** sharp-frustum/解析边/20/20。
2. **A2 解析边 spike/实现**：私有 native/TS taper 或等价解析构造；先在合成矩形
   验证 tool 体与 Unite 体的边类型/体积（297,002.158 或 measured A2 baseline），
   再跑 Bumper pre-fillet 657,002.158（或 measured A2 baseline）与 20/20；若失败，
   保持 blocked-kernel。
3. **A3 证据/回放（test-only）**：S9（中性面/角度基准）、S10（CAP_FACE=profile
   解码证据）、S11（startOffset=0 推断）证据采集；converter/translator/runner、
   起始面解析、旧近似回退开关、oracle collector 全边展开；不提交私有 id/路径。
4. **A4 Bumper 严格轨 + 回归**：pre-fillet 体积门 + oracle 20/20 + strict 最终体积 +
   push+冷重开 + 全量回归；关闭审计回退作为严格路径（保留 record）。
5. **UI（另 AIRR）**：live 证据齐备后再做起始面/拔模对话框；本设计不做。

### 发布门

- 上述测试矩阵全绿；shared/backend/web 同批；新 backend 产物（非 1.63.0 旧产物）；
  接口冻结矩阵/ADR/计划/能力状态同步；不把设计/近似计入严格绿。
- A1 可在 A2 之前发布，但必须标“语义接线/A1 baseline”，不得宣称精确。
- A2 发布前必须有 pre-fillet 体积门 + 20/20 + 解析边证据；缺一不可。

---

## 11. 开放问题 / Spike

| ID | 问题 | 需要的证据/决策 |
|---|---|---|
| S1 | 最终 body 的锥面侧边为何是 curvePrimitive；来源是 Loft/offset/Unite 哪一环；能否产出解析 line | 合成矩形/圆弧的 tool 体与最终 Unite 体边枚举（类型/控制点/端点）；纯 Sweep/Loft/offset 对照 |
| S2 | 内核 taper 路径能否经 TS 暴露；是否在已授权范围 | ADR-0006 切片 C + 私有 native 审计台账；P0-08 另批批准；ctest/下游回归 |
| S3 | 面法向/outward 方向与 startOffset 符号 | 顶/底/侧面合成测试；converter outward/opposite 校准；真栈面拾取证据 |
| S4 | draftPullDirection 与 Onshape 方向的符号一致性 | 合成收窄/外扩解析体积；Bumper 体积；必要时 live 几何校准 |
| S5 | oracle 20/20 的完整边集 | 私有 collector 按真实选择展开（含底面 4 条 loop）；公共 resolver 保持 fail closed |
| S6 | 旧 backend 对新字段的静默 strip | 能力探测（getFeatureFormModel/版本）；发布顺序；回滚隔离；X-11 关联 |
| S7 | 预览/性能 | faceExtrude 预览是否走 shadow；面解析耗时；大环面上限 |
| S8 | startOffset 与 draft 的组合语义（中性面是否随 startOffset 平移） | live/合成证据；证据前不宣称通用精确；Bumper 也需 S9/S11 钉死 |
| S9 | **Bumper 拔模中性面/角度基准**：起始面 vs 端面/草图面；10° 相对 pull direction vs 面平面 | 解码字段/live 几何 + **Bumper pre-fillet 体积**（657,002.158 或 measured A2 baseline）；不一致则调整 A2 或 blocked |
| S10 | **CAP_FACE 是 profile 还是原草图的起始参考** | 解码 `profile/entities/start-from` 字段与查询种类；face boundary 与期望 profile 唯一匹配；start-reference 形态 blocked/approximate |
| S11 | **Bumper startOffset=0 推断** | 由 S10 面位置 + **pre-fillet 657,002.158（或 measured A2 baseline）** 钉死；不得只靠最终 ±0.5% |

---

## 12. 评审结论（草稿）

- 复用矩阵完成：是（含版本/路径、许可证列）
- 跨仓影响明确：是
- P0 例外已登记：否（本设计不新增例外；失败封闭沿用 status=1/op 拒收；
  旧 backend 静默 strip 属 X-11 已知风险，不因本设计关闭）
- ADR：需要（ADR-0016）
- Owner 签字：**待用户批准**
- 结论：**提议 / 未批准；批准前不写产品代码。本 AIRR 不是实现、不是绿例；
  A1 只记录 baseline、不得宣称精确；A2（sharp frustum/解析边/pre-fillet 657,002.158
  或 measured baseline/Bumper 20/20）未达成就保持 blocked-kernel，不用近似冒充 20/20；
  CAP_FACE=profile（S10）与中性面/角度（S9）未取证前，不宣称通用精确。**
