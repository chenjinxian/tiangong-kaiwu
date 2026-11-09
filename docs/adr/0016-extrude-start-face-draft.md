# ADR-0016：CAP_FACE 起始面 + startOffset + 拔模的精确 faceExtrude 路径

- 状态：**提议 / 未批准（2026-11-10）**。决策完整（契约、语义、校验、回滚、测试门），
  但**未实现、未批准**；**未批准前不写产品代码**（P0-04）。本 ADR 不是绿例，也不把
  Bumper 的严格轨计为已解决。
- 关联：ADR-0005（extrude startOffset/draft）、ADR-0006 切片 D/F/G/H（faceExtrude/
  CAP_FACE 回放与面选择）、ADR-0015（多体作用域，本切片不涉及）、
  AIRR `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md`、
  计划 `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`。
- 决策者：LubanCAD 平台团队（待用户签字）。

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

当前路径近似的根因不是单一角度错误，而是三处语义缺失：

1. **轮廓来源**：契约没有携带被选中的起始面；求值器只按草图面域平移。只有面恰好
   等于草图 cap 时近似成立；面被 imprint/split/修改后即错。
2. **startOffset 语义**：40 是从上游拉伸深度推断的“草图偏移”，不是面/特征的真实
   偏移；面移动/上游改参时不会跟随面。
3. **拔模构造**：`loftDraftedLoop` 用远端整环 `constructCurveXYOffset` + `Loft`，
   不是逐侧面拔模；矩形/圆弧/孔环的角部与截面定义可能不同。合成 180×50×40、10°
   收窄的 sharp-corner 解析锥台为 297,002.158 mm³，而当前草图标量路径新增
   297,764.787 mm³（+0.257%），说明当前构造不是该解析锥台（确切原因待 A2 spike）。
4. **边表示**：Loft 侧边为 `curvePrimitive`，oracle 的 line/arc 匹配器 0 命中；
   即使 oracle 补到 20 条，这 4 条仍不可匹配。
5. **oracle 展开**：16/20 的 4 条缺失是 test-only collector/展开规则缺口，不是产品
   几何缺口；必须按 Onshape 真实选择补全，公共 resolver 仍 fail closed。

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

  // 本 ADR 新增（下一 minor 提案，草案 1.64.0）
  /** 起始轮廓沿有效拉伸方向相对起始面的平移（mm，有限；缺省 0）。
   *  正=沿 direction，负=反向；depthMm 从平移后的起始平面起算。 */
  startOffsetMm?: number;
  /** 拔模角（deg，有限，0<|angle|<89）；中性面=平移后的起始面平面；
   *  正角使远端材料外侧扩大；首版仅 endBound=blind。 */
  draftAngleDeg?: number;
  /** 翻转拔模符号（Onshape「反向」）；仅与 draftAngleDeg 成对。 */
  draftPullDirection?: boolean;
}
```

- `bodyId`/`faceRef` 指向**起始面**；求值轮廓是该面边界（Loop/ParityRegion），
  不是草图面域。
- **Bumper 精确映射的 `startOffsetMm` 为 0**：面本身在 z=40；不得把当前
  converter 推断的 40 带入 faceExtrude。`startOffsetMm` 只表达 Onshape 面板上
  显式的起始偏移。
- `draftAngleDeg` 的中性面 = 平移后的起始面平面；远端偏置
  `δ = depth·tan(θ_eff)`，`θ_eff = draftPullDirection ? -draftAngleDeg : draftAngleDeg`；
  外环外扩、孔环收缩；首版仅 `endBound=blind`，与 `secondDirection` 互斥。
  该组合语义需 S8 spike 校准；Bumper 的 startOffset=0 不受影响。
- `operation` 保持 add/remove/intersect；NEW 拒收；remove/intersect 零相交、
  空回包、非有限体积 → status=1。
- 旧 faceExtrude 载荷（无新字段）逐字兼容；无 BIS schema 迁移、无数据丢失。

### 2. 精确性前提（A2）

A 只保证**语义**（面轮廓 + 面基准偏移 + 面基准拔模），不自动保证解析边：

- A1（先落地）：复用 `loftDraftedLoop`/`sweepSketchRegionDraft` 的偏置+Loft；
  可修正轮廓/基准/角度语义，但侧边可能仍是 `curvePrimitive`，不得宣称 20/20。
- A2（20/20 硬前提）：产出解析侧面/边。候选：暴露内核 taper 路径（ADR-0006
  切片 C 记录其存在但 TS 未暴露；P0-08 另批）、按面/按边构造解析侧面并 sew、
  或经证明的内核 edge canonicalization。先在合成矩形验证 tool 体与最终 Unite 体
  的边类型，再跑 Bumper。
- 若 A2 spike 失败：Bumper 20/20 保持 **blocked-kernel**；A1 可作为能力切片，
  但不得用近似/审计回退冒充严格绿。

### 3. 回放映射（test-only）

- 私有 converter 对 CAP_FACE 起始面输出精确 faceExtrude 元数据（上游面证据、
  `isStart`、显式 startOffset、draft），不再输出“草图 startOffset=上游 depth”。
- 公共 runner 在求值时解析起始面（复用 `readBrepFaceHandles`/`resolveFaceRef`/
  既有面 resolver 模式），唯一命中才发 `bodyId`/`faceRef`；0/多命中阻塞。
- 旧 `capFaceExtrude → extrude(startOffset+draft)` 近似路径保留为**回退/对照**，
  标 `approximate=true`；严格 Bumper 路径不得使用它。
- oracle collector 按 Onshape 真实选择展开全部 20 条边（含底面 4 条 loop）；
  公共 `rollback-edge-oracle` 保持“0/多匹配/部分集合即失败”，不猜。

### 4. 不做

- 不给 `ExtrudeParams` 加 `startFaceRef`；faceExtrude 已是面轮廓的唯一特征。
- 不新增 feature type/RPC/工具；所有写入仍走 FeatureOp + BriefcaseTxns。
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
| modeling-server（私有） | schema/formModel/求值器扩展；面归属/环归一化/失败封闭；A2 可能需 taper 暴露（另批） |
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

## 迁移与回滚

- **迁移**：无。新字段是 faceExtrude params 的可选键；旧库/旧 changeset 无迁移。
- **回滚**：移除 schema/求值器新分支即回到 1.33 行为；只含旧字段的文档不受影响。
  含新字段的文档在旧 backend 上可能被静默 strip，因此回滚前必须审计/导出或从
  启用前 checkpoint 恢复；不得把旧 backend 的静默几何当正确结果。
- **A2 回滚**：禁用解析边构造，保留 A1 面边界+Loft；Bumper 20/20 回到
  blocked-kernel；不把 A1 当精确。
- **数据丢失**：无；params 行保留，特征行仍可读/可前滚。

## 测试门（批准后执行）

- **shared/契约**：新字段往返、旧 1.33 载荷、`ExtrudeParams` 不变、版本 bump。
- **backend/StandaloneDb**：
  - 既有 faceExtrude add/remove 48/16 回归；
  - 180×50×40 盒顶面 add 40（无 draft）新增 360,000；
  - `startOffsetMm=-5` 新增 315,000（总 675,000）；
  - draft 10° 收窄锥台 **297,002.158 mm³**、远端 165.893842×35.893842；
  - draft 10° 外扩锥台 **427,012.818 mm³**、远端 194.106158×64.106158；
  - 4 条锥面斜边为 line（A2）；含孔面外环扩/孔环缩；退化/失效/非平面/多面片/
    spline/零相交/空回包全部 status=1；zod 拒收矩阵；undo/redo/冷重建。
- **真栈**：
  - 合成起始面 + draft 的解析体积/尺寸/边类型/push+冷重开；
  - Bumper 精确轨：Extrude 2 非近似步、Fillet 1 oracle **20/20** 且 20 条边全为
    line/arc、不使用审计回退、最终 636,731.499 ±0.5%、1 body、status=0、
    push+冷重开；
  - 回归：faceExtrude 首切片、extrude draft、THIN、upToSurface/upToNext/
    upToVertex、Bumper record/strict fallback、示例 iModel 回归。
- **拒绝**：调容差、把 `curvePrimitive` 当 line、用部分 oracle、用审计回退冒充
  oracle 20/20、硬编码体积。

## 实施切片（批准后）

1. **A1**：shared 契约 + backend schema/求值器（面边界 + startOffset + Loft 拔模 +
   失败封闭）。不宣称解析边。
2. **A2**：解析边 spike/实现（私有 native/TS 或等价构造）；合成矩形 → Bumper；
   失败则 blocked-kernel。
3. **A3**：converter/translator/runner（test-only）+ oracle 全边展开 + 旧近似回退。
4. **A4**：Bumper 严格轨（oracle 20/20 + strict 体积 + push/冷重开）+ 全量回归。
5. **UI**：另 AIRR，需 live 起始面/拔模对话框证据。

## 开放问题 / Spike

- **S1**：Loft 侧边为何是 `curvePrimitive`；tool 体/Unite 体能否产出解析 line/arc。
- **S2**：内核 taper 能否经 TS 暴露、是否在已授权范围、是否需 P0-08 另批。
- **S3**：面法向/outward 与 startOffset/direction 符号的校准。
- **S4**：`draftPullDirection` 与 Onshape 方向的符号一致性（合成体积 + Bumper）。
- **S5**：oracle 20/20 的完整边集（含底面 4 条 loop）与 collector 真实性。
- **S6**：旧 backend 静默 strip 的能力探测/发布顺序/回滚隔离（X-11）。
- **S7**：faceExtrude 预览/性能/大环面上限。
- **S8**：startOffset 与 draft 的中性面组合语义（Bumper startOffset=0 不受影响）。

## 状态

**提议 / 未批准；未实现；不是绿例。** 未批准前不写产品代码。A2 未达成时 Bumper
20/20 保持 blocked-kernel，不用近似冒充严格绿。
