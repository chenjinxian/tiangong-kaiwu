# ADR-0016：CAP_FACE 起始面 + startOffset + 拔模的精确 faceExtrude 路径

- 状态：**已接受（2026-11-10 用户批准实现；同日设计修订：S9/S10/S11 解析、
  prismoid 体积修正）**。决策完整（契约、语义、校验、回滚、测试门）。本提交仅文档，
  无产品代码；实现按 A1/A2/A3/A4 切片执行。A2 证据门（face-driven profile +
  解析边 + 20/20）未达成前 Bumper 仍为 blocked-kernel，不计入严格绿。
- 关联：ADR-0005（extrude startOffset/draft）、ADR-0006 切片 D/F/G/H（faceExtrude/
  CAP_FACE 回放与面选择）、ADR-0015（多体作用域，本切片不涉及）、
  AIRR `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md`、
  计划 `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`。
- 决策者：LubanCAD 平台团队；用户 2026-11-10 批准实现。

## 背景与证据

Bumper Block 的 Extrude 2 是 **CAP_FACE 起始面拉伸**：从 Extrude 1 的顶面（z=40）
再拉 40 mm、10° 拔模、ADD。当前 converter 把它映射为既有 `extrude` 的
`startOffsetMm=40` + `draftAngleDeg=10°`，轮廓仍取原草图面域；转公共回放后标
`approximateStartOffset`/`approximateDraft`，步级 `approximateSteps=1`。

公开真栈证据（`apps/web/e2e/examples/bumper-block-strict.spec.ts`）：

- Fillet 1 的面边界 oracle 展开 **16/20** 条 body 边（缺底面 4 条 loop 边）；
- 4 条锥面斜边在产品侧是 `kind:'other'`（`curvePrimitive`），不是解析 line/arc；
- 审计 20 边回退的严格结果为 **634,347.216 vs 636,731.499 mm³（−0.374%）**；
- Extrude 2 仍是近似步；Bumper 尚未由产品自证 20/20。

当前路径的根因不是单一角度错误，而是面语义/边表示缺口；S9/S10/S11 已在
2026-11-10 spike 中解析，S1 仍开放：

1. **轮廓来源（S10 已解析）**：Bumper/37 个 CAP_FACE 特征占据 `entities` profile
   槽（同 qSketchRegion），`startOffsetEntity` 空、`startOffset=false`——是
   face-driven profile，不是原草图起始参考。A 仅适用于这 37 个特征；另 29 个
   `startOffsetEntity`（27 个 `startOffset=true`）是 start-reference 家族，保持
   blocked/approximate。
2. **startOffset（S11 已解析）**：当前 converter 的 40 是从上游深度推断的草图偏移；
   Bumper 实际 `startOffset=0`，25 mm `startOffsetDistance` 是未使用默认值；面在
   z=40、depth 40 → 顶面 z=80。不得把 40 带入 faceExtrude。
3. **拔模构造（S9 已解析；P3/P4 仍开放）**：`loftDraftedLoop` 用远端整环
   `constructCurveXYOffset` + `Loft`。中性面=被选中的起始/profile 面（z=40）；
   10° 从 pull direction 量起；`draftPullDirection=true` 收窄；z=40 的 180×50
   → z=80 的 165.893842×35.893842；δ=40·tan10°。
   **体积模型修正**：上体是等距偏置棱台/prismoid，不是相似截面锥台；闭式
   `h/6(A0+A1+4Am)`，rb=3 BRep 积分 = **297,764.7871846836**，pre-fillet =
   **657,764.7871846836**（下体 360,000）。当前产品已匹配该体积；前稿的
   297,002.158/657,002.158 与 762.629“Extrude 2 残差”是错误模型，已废弃。
   A1 复用该构造，因此 A1 只记录 297,764.787 baseline，不宣称解析边/20/20；
   A2 的差异化项是面语义 + 解析边 + 20/20，不是体积。
4. **边表示**：最终 body 的锥面侧边为 `curvePrimitive`，oracle 的 line/arc 匹配器
   0 命中；即使 oracle 补到 20 条，这 4 条仍不可匹配。其直接来源可能是 Loft tool、
   offset 构造或 Unite 重写，S1 未定案前不把“Loft 结果”当已确定根因。
5. **oracle 展开**：16/20 的 4 条缺失是 test-only collector/展开规则缺口，不是产品
   几何缺口；必须按 Onshape 真实选择补全，公共 resolver 仍 fail closed。
6. **最终差归因**：pre-fillet 已与 prismoid 一致；−0.374% 来自下游 fillet 去除量
   （implied Onshape 3,054.543 vs product 5,438.825 mm³；Δ 2,384.282 ≈
   636,731.499−634,347.216），**不是 Extrude 2 残差**。A2 不得把该差记到体积门。

## 决策

### 1. 选择 A：扩展 `FaceExtrudeParams`，以起始面边界为轮廓

在既有 `faceExtrude` 特征上增加可选字段，不新增特征类型、不新增 RPC、不污染
`ExtrudeParams`：

```ts
export interface FaceExtrudeParams {
  // 既有字段（shared 1.33 起）逐字保留
  bodyId: string;
  faceRef: LubanTopologyId;
  operation: "add" | "remove" | "intersect";
  endBound: Extract<ExtrudeEndBound, "blind" | "throughAll">;
  depthMm?: number;
  direction?: ExtrudeDirection;
  secondDirection?: ExtrudeSecondDirection;
  mergeScope?: BodyRef[];

  // 本 ADR 新增（下一 minor，草案 1.64.0；S9/S10/S11 已解析）
  /** 起始轮廓沿有效拉伸方向相对起始面的平移（mm，有限；缺省 0）。
   *  正=沿 direction，负=反向；depthMm 从平移后的起始平面起算。
   *  S11：Bumper startOffset=0（startOffsetEntity 空；25 mm 默认未使用；
   *  面 z=40、depth 40 → 顶面 z=80）。 */
  startOffsetMm?: number;
  /** 拔模角（deg，有限，0<|angle|<89）。S9：中性面=选中的起始/profile 面
   *  （z=40）；10° 从 pull direction 量起；draftPullDirection=true 收窄；
   *  z=40 的 180×50 → z=80 的 165.893842×35.893842；δ=40·tan10°。
   *  首版仅 endBound=blind。 */
  draftAngleDeg?: number;
  /** 翻转拔模符号（Onshape「反向」）；仅与 draftAngleDeg 成对。 */
  draftPullDirection?: boolean;
}
```

- `bodyId`/`faceRef` 指向**起始面**；求值轮廓是该面边界（Loop/ParityRegion），
  不是草图面域。面引用必须按 `bodyId` **逐体**解析（carrier/face 集合按体过滤），
  跨体歧义 → status=1。
- **CAP_FACE=profile（S10 已解析）**：Bumper/37 个 CAP_FACE 特征占据 `entities`
  profile 槽（同 qSketchRegion），`startOffsetEntity` 空、`startOffset=false`；
  是 face-driven profile，A 适用。另 29 个 `startOffsetEntity`（27 个
  `startOffset=true`）保持 blocked/approximate，不在 A 的精确范围。求值期仍用
  面边界与期望 profile（面积/bbox/边集）唯一匹配；不匹配 → status=1。
- 复用 `ExtrudeParams.endFaceRef`（upToSurface）已建立的“持久面引用 + 每求值周期
  动态解析”模式；`endFaceRef` 字段本身仍属 sketch extrude，不迁移/不混用。
- **Bumper 的 `startOffsetMm=0`（S11 已解析）**：`startOffsetEntity` 空、
  `startOffset=false`；25 mm 的 `startOffsetDistance` 是未使用默认值；面在 z=40、
  depth 40 → 顶面 z=80。不得把当前 converter 推断的 40 带入 faceExtrude。
- `draftAngleDeg`（S9 已解析）：中性面=选中的起始/profile 面（z=40）；10° 从
  pull direction 量起；`draftPullDirection=true` 收窄；远端偏置
  `δ = depth·tan(θ_eff)`，`θ_eff = draftPullDirection ? -draftAngleDeg : draftAngleDeg`；
  外环外扩、孔环收缩；首版仅 `endBound=blind`，与 `secondDirection` 互斥。
- **体积模型修正**：上体是等距偏置 prismoid（不是相似截面锥台），
  `h/6(A0+A1+4Am)`；rb=3 BRep 积分 297,764.7871846836，pre-fillet
  657,764.7871846836；当前产品已匹配。不得再用 297,002.158/657,002.158 或
  762.629“Extrude 2 残差”。
- `operation` 保持 add/remove/intersect；NEW 拒收；remove/intersect 零相交、
  空回包、非有限体积 → status=1。
- 旧 faceExtrude 载荷（无新字段、**单 body/faceRef 唯一**）逐字兼容；旧多 body/
  跨体 faceRef 可能因新的 body 归属守卫变为 status=1（fail closed）；无 BIS schema
  迁移、无数据丢失。

### 2. A1/A2 分层与精确性前提

A 只保证**语义**（面轮廓 + 面基准偏移 + 面基准拔模），不自动保证解析边：

- **A1（先落地；语义接线，不宣称精确）**：面边界 + startOffset + **复用既有**
  “整环偏置 + Loft”拔模。A1 修正 P1/P2（面轮廓来源、偏移基准），**P3 不修**
  （拔模构造仍是既有整环偏置+Loft），P4 不保证（侧边可能仍是 `curvePrimitive`）。
  A1 记录 **prismoid 297,764.787**（当前产品已匹配；rb=3 BRep 积分
  297,764.7871846836）作为 baseline，不得据此断言 line/arc 锥面边或 20/20；
  A1 不是精确门。
  - **helper 适配**：`sweepSketchRegionDraft` 只接受 `SketchRegion`，不能传 face
    `Loop`；`loftDraftedLoop` 当前未导出。A1 必须导出 `loftDraftedLoop`（或迁到
    无环共享 helper），并新增 `faceSweepToolDrafted(db, local: Loop | ParityRegion,
    distance, offset, planeToWorld, backward, startOffset)`（外环/孔环分别 loft +
    外环−孔 CSG）；不复制第二套拔模代码。
- **A2（精确几何硬门）**：产出解析侧面/边 + 20/20，并同时满足：
  1. 合成 180×50×40、10° 收窄 = prismoid **297,764.787 mm³**，或经证据的
     **measured A2 baseline**（不得按最终 0.5% 反调）；
  2. 4 条锥面侧边在 **tool 体与最终 Unite 体**上均为 line/arc（非 curvePrimitive）；
  3. **Bumper pre-fillet 体积 = 657,764.787 mm³**（或 measured A2 baseline），
     Extrude 2 增量 297,764.787 单独断言；不得用最终 ±0.5% 替代；
  4. Fillet 1 oracle **20/20**（含 4 条底面 loop），20 条边全为 line/arc；
  5. 最终 636,731.499 mm³ ±0.5%、1 body、status=0、push+冷重开；
  6. **最终差归因 fillet**：implied Onshape 3,054.543 vs product 5,438.825 mm³
     （Δ 2,384.282 ≈ 最终差），不是 Extrude 2 残差。
- **A2 的差异化项是 face-driven profile + 解析边 + 20/20，不是体积**；当前产品
  体积已匹配 prismoid。
- A2 候选：暴露内核 taper 路径（ADR-0006 切片 C 记录其存在但 TS 未暴露；P0-08
  另批）、按面/按边构造解析侧面并 sew、或经证明的内核 edge canonicalization。
  先在合成矩形分别验证 tool 体/Unite 体，再跑 Bumper。
- 若 A2 spike 失败：Bumper 20/20 保持 **blocked-kernel**；A1 可作为能力切片，
  但不得用近似/审计回退冒充严格绿。

### 3. 回放映射（test-only）

- **CAP_FACE 语义（S10 已解析）**：37 个 `entities` profile 特征输出精确
  faceExtrude 元数据（上游面证据、`isStart`、显式 startOffset、draft）；29 个
  `startOffsetEntity`（27 个 `startOffset=true`）保持 blocked/approximate，不得
  伪装成 A。仍保留面边界与期望 profile 唯一匹配守卫。
- **startOffset（S11 已解析）**：Bumper `startOffsetMm=0`；25 mm 默认未使用；
  面 z=40、depth 40 → 顶面 z=80。不得只靠最终 ±0.5%；pre-fillet 657,764.787
  作为回归门。
- 公共 runner 在求值时解析起始面（复用 `readBrepFaceHandles`/`resolveFaceRef`/
  既有面 resolver 模式），唯一命中才发 `bodyId`/`faceRef`；0/多命中阻塞。还须用面
  边界与期望 profile（面积/bbox/边集）唯一匹配；不匹配 → status=1。
- 旧 `capFaceExtrude → extrude(startOffset+draft)` 近似路径保留为**回退/对照**，
  标 `approximate=true`；严格 Bumper 路径不得使用它。
- oracle collector 按 Onshape 真实选择展开全部 20 条边（含底面 4 条 loop）；
  公共 `rollback-edge-oracle` 保持“0/多匹配/部分集合即失败”，不猜。

### 4. 不做

- 不给 `ExtrudeParams` 加 `startFaceRef`；faceExtrude 已是面轮廓的唯一特征。
- 不新增 feature type/RPC/工具；所有写入仍走 FeatureOp + BriefcaseTxns。
- 不做与起始面法向不平行的自定义拔模方向（首版 pull direction = 面法向；
  需要 live 证据/另切片）。
- 不做 replay-only 硬编码/按示例调参/直接采集体积。
- 不做 UI（无 live 起始面/拔模对话框证据）；能力 gated，不造假控件。

## 备选方案

- **B：`ExtrudeParams.startFaceRef`**——拒绝。与 ADR-0006 切片 D 的 `faceExtrude`
  裁决冲突；产生两条面轮廓路径（P1-01）；与 sketchId/regions、NEW、upTo*、
  draft、THIN、secondDirection 的组合爆炸且无证据；不解决解析边。
- **C：修既有 startOffset+draft 实现/内核**——拒绝作为主决策。C1（从上游体反推
  面轮廓）没有面身份，共面/孔/子面时无法唯一；C2（内核 taper/解析构造）是 A2 的
  子工作，保留在 A 下执行，但它单独不修起始面语义。
- **D：replay-only 精确近似**——拒绝。非参数化、不可 AI 编辑；违反 P0-06 单一
  事实源与 P0-05 单一建模管道；不解决 4 条 `curvePrimitive`/16-20 oracle；属于假绿。

## 跨仓影响

| 仓/层 | 影响 |
|---|---|
| shared | `FaceExtrudeParams` 新可选字段；`interfaceVersion` 下一 minor；无 BIS 迁移 |
| modeling-server（私有） | schema/formModel/求值器扩展 + `faceSweepToolDrafted`/`loftDraftedLoop` 适配；面归属/环归一化/CAP_FACE=profile 守卫/失败封闭；A2 可能需 taper 暴露（另批） |
| 私有 converter（test-only） | CAP_FACE 精确映射 + 起始面证据；不提交公共仓 |
| 公共 replay/translator（test-only） | `faceExtrudeOp` 新字段、起始面解析、oracle 全边展开；场景可选字段 |
| apps/web 产品 UI | 不新增入口；能力 gated；仅回归 |
| viewer/editor | 无产品改动（复用面引用/选择） |
| itwinjs-core | 无 fork 改动（复用 `SolidModelingCommand`/`CurveOps`） |
| imodel-native | A1 无；A2 若需即 P0-08 另批（ctest/provenance/下游） |
| hub/DanQing | 无 |

- 版本/发布：shared → backend（新产物/RC）→ web/replay 同批。已发布
  `backend-20261109`（shared 1.63.0）不含新字段，真栈验收必须用新构建。
- 旧 web/旧 shared → 新 backend：不发新字段，行为不变。
- 新 web/replay → 旧 backend：旧 `faceExtrudeSchema` 非 strict，未知键会被 strip，
  可能静默降级为“无偏移/无拔模”。缓解：发送方能力探测（form model）、backend
  先发、回滚隔离；这属于 X-11 已知运行时版本风险，本 ADR 不关闭它。
- **旧 payload 限定**：无新字段的旧 faceExtrude 载荷在单 body/faceRef 唯一时逐字
  兼容；旧多 body/跨体 faceRef 可能因 body 归属守卫变为 status=1（fail closed）。
- **范围门（S10）**：A 只对 37 个 `entities` profile 的 CAP_FACE 特征发布；29 个
  `startOffsetEntity`（27 个 `startOffset=true`）保持 blocked/approximate。A1 可
  在 A2 之前发布但不算精确；A2 需 pre-fillet 657,764.787 + 20/20 + 解析边证据。
- **最终差**：pre-fillet 已匹配 prismoid；−0.374% 归因 fillet（implied Onshape
  3,054.543 vs product 5,438.825），不是 Extrude 2。

## 迁移与回滚

- **迁移**：无。新字段是 faceExtrude params 的可选键；旧库/旧 changeset 无迁移。
- **回滚**：移除 schema/求值器新分支即回到 1.33 行为；只含旧字段且单 body/faceRef
  唯一的文档不受影响。旧多 body/跨体载荷可能因 body 归属守卫 status=1（预期 fail
  closed）。含新字段的文档在旧 backend 上可能被静默 strip，因此回滚前必须审计/
  导出或从启用前 checkpoint 恢复；不得把旧 backend 的静默几何当正确结果。
- **A1/A2 回滚**：禁用 A2 解析边构造，保留 A1 面边界+Loft；A1 体积已是 prismoid
  297,764.787，但解析边/选择器不精确；Bumper 20/20 回到 blocked-kernel。
- **数据丢失**：无；params 行保留，特征行仍可读/可前滚。

## 测试门（已批准；实现时执行）

- **shared/契约**：新字段往返、旧 1.33 载荷（单 body）、`ExtrudeParams` 不变、
  版本 bump、缺 `endBound`/非法组合拒收。
- **A1（语义接线；不宣称精确）**：
  - 既有 faceExtrude add/remove 48/16 回归；
  - 180×50×40 盒顶面 add 40（无 draft）新增 360,000；
  - `startOffsetMm=-5` 新增 315,000（总 675,000）；
  - draft 10° 收窄/外扩：**记录 A1 baseline 体积**（收窄 prismoid 297,764.787；
    外扩同一 prismoid 闭式 427,541.445 或 measured；spike 仅钉死收窄），断言
    bbox/方向 + `startOffsetMm`/`draftAngleDeg`/`draftPullDirection` 往返；
  - S9：中性面 z=40；true 收窄 / false 外扩；δ=40·tan10°；
  - S10：37 个 `entities` 走 A；29 个 `startOffsetEntity`（27 startOffset=true）
    blocked/approximate；
  - S11：startOffset=0；25 mm 默认未使用；面 z=40、depth 40 → z=80；
  - CAP_FACE=start-reference / 面边界与期望 profile 不唯一匹配 → blocked/status=1；
  - bodyId 跨体/多 body 歧义 → status=1；旧单 body 载荷逐字兼容，旧多 body 歧义
    登记 fail closed；
  - 退化/失效/非平面/多面片/spline/零相交/空回包全部 status=1；zod 拒收矩阵；
    undo/redo/冷重建。
- **A2（精确几何；全部满足）**：
  - draft 10° 收窄 prismoid **297,764.787 mm³**（或 measured A2 baseline）、
    远端 165.893842×35.893842；
  - draft 10° 外扩同一 prismoid 闭式 **427,541.445 mm³**（或 measured A2 baseline）、
    远端 194.106158×64.106158；
  - 4 条锥面斜边在 tool 体与最终 Unite 体均为 line/arc（非 curvePrimitive）；
  - 含孔面外环扩/孔环缩的解析体积；
  - Bumper pre-fillet **657,764.787**（或 measured A2 baseline），Extrude 2 增量
    297,764.787 单独断言。
- **真栈**：
  - A1 合成轨：面轮廓/偏移/draft 参数往返、记录 prismoid 297,764.787 baseline、
    push+冷重开；
  - A2 合成轨：解析体积/尺寸/边类型/push+冷重开；
  - Bumper 精确轨：S10 face-driven profile；S11 startOffset=0；**pre-fillet
    657,764.787（或 measured A2 baseline）**；Extrude 2 增量 297,764.787 单独断言；
    Fillet 1 oracle **20/20** 且 20 条边全为 line/arc、不使用审计回退；最终
    636,731.499 ±0.5%、1 body、status=0、push+冷重开；
  - 最终差归因 fillet：implied Onshape 3,054.543 vs product 5,438.825 mm³
    （Δ 2,384.282 ≈ 最终差），不归因 Extrude 2。
  - 回归：faceExtrude 首切片、extrude draft、THIN、upToSurface/upToNext/
    upToVertex、Bumper record/strict fallback、示例 iModel 回归。
- **拒绝**：调容差、把 `curvePrimitive` 当 line、用部分 oracle、用审计回退冒充
  oracle 20/20、硬编码体积、用最终 0.5% 替代 pre-fillet/边门、把最终差归因
  Extrude 2。

## 实施切片（已批准）

1. **A1**：shared 契约 + backend schema/求值器（面边界 + startOffset + draft 参数 +
   `faceSweepToolDrafted`/`loftDraftedLoop` 适配 + CAP_FACE=profile/body 归属守卫 +
   失败封闭）。记录 prismoid 297,764.787 baseline；不宣称解析边/20/20。
2. **A2**：解析边 spike/实现（私有 native/TS 或等价构造）；合成矩形验证 tool 体/
   Unite 体体积回归（297,764.787/657,764.787 或 measured A2 baseline）与边类型 →
   Bumper 20/20；失败则 blocked-kernel。
3. **A3**：S9/S10/S11 已解析证据指针 + converter/translator/runner（test-only）+
   oracle 全边展开 + 旧近似回退。
4. **A4**：Bumper 严格轨（pre-fillet 657,764.787 门 + oracle 20/20 + strict 最终
   体积 + fillet 归因 + push/冷重开）+ 全量回归。
5. **UI**：另 AIRR，需 live 起始面/拔模对话框证据。

## 开放问题 / Spike

- **S1（OPEN）**：最终 body 的锥面侧边为何是 `curvePrimitive`；来源是 Loft/offset/
  Unite 哪一环；tool 体/Unite 体能否产出解析 line/arc。
- **S2（OPEN）**：内核 taper 能否经 TS 暴露、是否在已授权范围、是否需 P0-08 另批。
- **S3（OPEN）**：面法向/outward 与 startOffset/direction 符号的校准。
- **S4（OPEN）**：`draftPullDirection` 与 Onshape 方向的符号一致性（合成体积 + Bumper）。
- **S5（OPEN，test-only）**：oracle 20/20 的完整边集（含底面 4 条 loop）与 collector
  真实性。
- **S6（OPEN）**：旧 backend 静默 strip 的能力探测/发布顺序/回滚隔离（X-11）。
- **S7（OPEN）**：faceExtrude 预览/性能/大环面上限。
- **S8（OPEN）**：**非零** startOffset 与 draft 的组合语义（中性面是否随 startOffset
  平移）；Bumper startOffset=0 已由 S11 解析，不依赖该组合。
- **S9（RESOLVED 2026-11-10）**：中性面=选中的起始/profile 面（z=40）；10° 从
  pull direction 量起；`draftPullDirection=true` 收窄；z=40 的 180×50 → z=80 的
  165.893842×35.893842；δ=40·tan10°。证据指针：私有审计台账。
- **S10（RESOLVED 2026-11-10）**：CAP_FACE 在 `entities` profile 槽（同
  qSketchRegion）；`startOffsetEntity` 空、`startOffset=false`；语料 37 个
  `entities` vs 29 个 `startOffsetEntity`（27 个 `startOffset=true`）；A 适用于
  37 个面驱动特征，29 个 start-reference 保持 blocked/approximate。证据指针：
  私有审计台账。
- **S11（RESOLVED 2026-11-10）**：startOffset=0；25 mm `startOffsetDistance` 是
  未使用默认值；面 z=40、depth 40 → 顶面 z=80；pre-fillet 657,764.787。证据指针：
  私有审计台账。

## 状态

**已接受（2026-11-10 用户批准实现）；本提交仅文档，无产品代码。** A1 只记录
prismoid 297,764.787 baseline，不得宣称解析边/20/20；A2 的差异化项是 face-driven
profile + 解析边 + Bumper 20/20，pre-fillet 门 657,764.787；最终 −0.374% 归因
fillet，不归因 Extrude 2。A2 未达成时保持 blocked-kernel，不用近似冒充严格绿；
S9/S10/S11 已解析，S1/S2/S5/S8 仍开放。
