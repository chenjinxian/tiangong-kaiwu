# ADR-0016：CAP_FACE 起始面 + startOffset + 拔模的精确 faceExtrude 路径

- 状态：**已接受（2026-11-10 用户批准实现；同日设计修订：S9/S10/S11 解析、
  prismoid 体积修正；2026-11-10 A2/A3/A4 实测后修订 A2 边门与最终差归因）**。
  决策完整（契约、语义、校验、回滚、测试门）。A1/A2/A3/A4 已实现；A2 解析边门已达成
  （tool/最终 Unite body **20/20 line**、pre-fillet **657,764.787185 mm³**）。
  Fillet 1 的 Onshape 实际选择为 **16 条边**（5 matched faces + 4 matched
  edges）；底面 4 条 z=0 loop 边**未选**并保持尖边。原“oracle 20/20（含底面
  loop）”门据此修订为 **16/16 = 覆盖全部实际选择边 + body 20/20 line/arc**。
  Bumper strict 真栈最终 **636,731.650 vs 636,731.499 mm³（+0.000024%）**，
  全部 status=0、1 body、push+冷重开；详见 §2/§6 与证据指针。
- 关联：ADR-0005（extrude startOffset/draft）、ADR-0006 切片 D/F/G/H（faceExtrude/
  CAP_FACE 回放与面选择）、ADR-0015（多体作用域，本切片不涉及）、
  AIRR `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md`、
  计划 `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`。
- 决策者：LubanCAD 平台团队；用户 2026-11-10 批准实现。

## 背景与证据

Bumper Block 的 Extrude 2 是 **CAP_FACE 起始面拉伸**：从 Extrude 1 的顶面（z=40）
再拉 40 mm、10° 拔模、ADD。设计前的 converter 把它映射为既有 `extrude` 的
`startOffsetMm=40` + `draftAngleDeg=10°`，轮廓仍取原草图面域；转公共回放后标
`approximateStartOffset`/`approximateDraft`，步级 `approximateSteps=1`。
A3 已改为 S10 面驱动 `capFaceProfile`（起始面 z=40、startOffset=0）→ 产品
`faceExtrude`；Bumper strict 实测 `approximateSteps=0`。

公开真栈证据（`apps/web/e2e/examples/bumper-block-strict.spec.ts`，2026-11-10）：

- Fillet 1 的 rb=3 oracle 覆盖 **16/20** 条 body 边（5 matched faces + 4 matched
  edges）。剩余 4 条是 **z=0 底面 loop**；Onshape **未选择**它们，最终 body 仅
  16 个 R5 圆角柱面、无底环圆角（live 截图底边为直尖边）——**16/16 是完整选择，
  不是 collector 缺口**；
- 4 条锥面斜边在产品侧曾为 `kind:'other'`（`curvePrimitive`）；A2 逐边解析壳体
  （per-edge planar quads + conical sheets + Sew）后 tool/最终 Unite body 均为
  **20/20 line**（无 curvePrimitive）；
- 旧审计 20 边回退（含底面 4 条）严格结果 **634,347.216 vs 636,731.499 mm³
  （−0.374%）**；16 边 oracle 精确轨 **636,731.650 vs 636,731.499 mm³
  （+0.151 mm³ / +0.000024%）**；
- Extrude 2 已由产品 faceExtrude 精确自证：pre-fillet **657,764.787185 mm³**、
  Extrude 2 增量 **297,764.787185 mm³**、20/20 line、全部 status=0、1 body、
  push+冷重开。

当前路径的根因不是单一角度错误，而是面语义/边表示缺口；S9/S10/S11 已在
2026-11-10 spike 中解析，**S1/S5 已由 A2/A4 实测关闭**：

1. **轮廓来源（S10 已解析）**：Bumper/37 个 CAP_FACE 特征占据 `entities` profile
   槽（同 qSketchRegion），`startOffsetEntity` 空、`startOffset=false`——是
   face-driven profile，不是原草图起始参考。A 仅适用于这 37 个特征；另 29 个
   `startOffsetEntity`（27 个 `startOffset=true`）是 start-reference 家族，保持
   blocked/approximate。
2. **startOffset（S11 已解析）**：设计前 converter 的 40 是从上游深度推断的草图
   偏移；Bumper 实际 `startOffset=0`，25 mm `startOffsetDistance` 是未使用默认值；
   面在 z=40、depth 40 → 顶面 z=80。A3 已落 startOffset=0，不把 40 带入
   faceExtrude。
3. **拔模构造（S9 已解析；P3/P4 已由 A2 关闭）**：A1 的既有整环拔模 helper 用
   远端整环 `constructCurveXYOffset` + `Loft`；A2 改逐边解析壳体。中性面=被选中的
   起始/profile 面（z=40）；10° 从 pull direction 量起；
   `draftPullDirection=true` 收窄；z=40 的 180×50 → z=80 的
   165.893842×35.893842；δ=40·tan10°。
   **体积模型修正**：上体是等距偏置棱台/prismoid，不是相似截面锥台；闭式
   `h/6(A0+A1+4Am)`，rb=3 BRep 积分 = **297,764.7871846836**，pre-fillet =
   **657,764.7871846836**（下体 360,000）。当前产品已匹配该体积；前稿的
   297,002.158/657,002.158 与 762.629“Extrude 2 残差”是错误模型，已废弃。
   A1 复用该构造，因此 A1 只记录 297,764.787 baseline，不宣称解析边/20/20；
   A2 的差异化项是面语义 + 解析边 + **16/16 实际选择**，不是体积。
4. **边表示（S1 已解析）**：A1 最终 body 的 4 条锥面侧边为 `curvePrimitive`；
   A2 spike 定位根因为既有内核 Loft 路径的 smooth skin（无 TS ruled 选项，非
   offset/Unite）；A2 因此改用 per-edge 平面/锥面壳 + `Sew`，tool 与最终 Unite
   body 均为 **20/20 line**。无需 native/P0-08 变更。
5. **oracle 展开（S5 已解析）**：16/20 **不是** collector/展开规则缺口。Onshape
   Fillet 1 实际只选 16 条（5 matched faces + 4 matched edges）；底面 4 条 z=0
   loop 边在最终 body 中是尖边。公共 resolver 保持“0/多匹配即失败”，不得
   补成 20 条，也不得把 16/16 当部分选择。
6. **最终差归因（修订）**：pre-fillet 已与 prismoid 一致；旧 −0.374% 是**审计
   20 边回退多选了底面 loop**（多去材 ≈2,384 mm³），不是产品 faceExtrude 残差，
   也不是内核 fillet 能力边界。16 边 oracle 轨最终差仅 **+0.151 mm³ /
   +0.000024%**，归因数值积分/圆角尾部。A2 不得把该差记到 Extrude 2 体积门。

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
  - **helper 适配**：既有草图面域拔模 helper 只接受 `SketchRegion`，不能传 face
    `Loop`；既有整环拔模 helper 是私有求值器的内部函数、未导出。A1 必须把它导出
    （或迁到无环共享 helper），并新增面轮廓整环拔模 helper（`Loop`/`ParityRegion` +
    distance/offset/plane/backward/startOffset；外环/孔环分别 loft + 外环−孔 CSG）；
    不复制第二套拔模代码。
- **A2（精确几何硬门；已达成）**：产出解析侧面/边 + 全选择覆盖，并同时满足：
  1. 合成 180×50×40、10° 收窄 = prismoid **297,764.787 mm³**，或经证据的
     **measured A2 baseline**（不得按最终 0.5% 反调）——实测
     **297,764.787185**；
  2. 4 条锥面侧边在 **tool 体与最终 Unite 体**上均为 line/arc（非
     curvePrimitive）——实测 tool 12/12 line、最终 Unite **20/20 line**；
  3. **Bumper pre-fillet 体积 = 657,764.787 mm³**（或 measured A2 baseline），
     Extrude 2 增量 297,764.787 单独断言；不得用最终 ±0.5% 替代——实测
     **657,764.787185 / 297,764.787185**（绝对容差 0.01 mm³）；
  4. Fillet 1 oracle **16/16 = 覆盖 Onshape 实际选择的全部边**（5 matched faces
     + 4 matched edges）；**底面 4 条 z=0 loop 边不是选择，保持尖边**；pre-fillet
     body **20/20 边全为 line/arc**（无 curvePrimitive）。旧“20/20（含底面
     loop）”门与 Onshape 证据不符，已由 2026-11-10 A4 实测修订；
  5. 最终 636,731.499 mm³ ±0.5%、1 body、status=0、push+冷重开——实测
     **636,731.650025**（+0.151 mm³ / +0.000024%）、approximateSteps=0；
  6. **最终差归因修订**：旧审计 20 边回退（含底面 4 条）多去材 ≈2,384 mm³，
     造成 −0.374%；16 边 oracle 轨最终差仅 +0.151 mm³（+0.000024%）。该差
     不是 Extrude 2 残差，也不是内核 fillet 能力边界。
- **A2 的差异化项是 face-driven profile + 解析边 + 16/16 实际选择，不是体积**；
  当前产品体积已匹配 prismoid。
- A2 实现：**逐边解析壳体**（line 对 → 平面四边形；arc 对 → 两个开放圆弧
  Loft 成锥面；外环/孔环 → cap/Sew）替代整环 Loft。仅使用既有 TS `Sew`/`Loft`
  与 `CurveOps`，**无 native/P0-08 变更**。先在合成矩形验证 tool/Unite 体，
  再跑 Bumper；均通过。
- 若 A2 失败：Bumper 保持 **blocked-kernel**；A1 可作为能力切片，但不得用近似/
  审计回退冒充严格绿。A2 未失败；旧审计 20 边回退已退役（见 §3）。

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
- 旧 `capFaceExtrude → extrude(startOffset+draft)` 近似路径**仅保留给 29 个
  start-reference 家族**（以及无起始面证据的 S10 形态），标 `approximate=true`；
  S10 面驱动 `capFaceProfile` 不得回退到它。
- `capFaceProfile` 起始面证据 = 上游 cap 平面或 Onshape bodydetails PLANE
  原点/法向 + 面积/AABB；runner 在步骤时点用 `readBrepFaceHandles` 唯一匹配
  （法向/平面偏移/面积/AABB）→ `resolveFaceRef`；0/多匹配/缺证据 fail closed。
  **S3（2026-11-10 已解析；review 后修订方向换算）**：范围扩展为 ADD/BLIND +
  REMOVE/INTERSECT/THROUGH_ALL 证据形态。Onshape `oppositeDirection` 相对
  **实体外法向**；converter 用 bodydetails `orientation`（true=外法向 /
  false=朝内；Bumper 盒体 6 面 + 3 个候选面实测）给出**世界外法向**
  `outwardNormal`。产品 `readFaceHandles`/`CurveOps.isPlanar` 的面法向**不保证
  朝外**（合成 plate+boss 体实测底面 +z 朝内、y=0 面 +y 朝内），故 runner 不能
  直接假设 forward=外法向；它把 `outwardNormal × (oppositeDirection?-1:+1)` 的
  世界方向与**解析到的产品面法向**点积，选 forward/backward（方向缺失/退化
  fail closed）。证据：Wheel & Tire Extrude 1（REMOVE/THROUGH_ALL，rb=6→rb=7
  在选中面 y=-14 处切至 y=-15.5，材料在 -y 侧）与 Rocker Extrude 10
  （REMOVE/BLIND，rb=25→rb=30 新底面 y=-1.5），两例 `oppositeDirection=true`
  均为“逆外法向切入材料”。bodydetails 参数化法向符号不可信 → S3 新形态一律
  标记 `normalSignAmbiguous`，面匹配接受 ±法向（面积/AABB/平面仍须唯一）；
  ADD/BLIND（A3 已发布形态）保持原 sketch-normal 换算，Bumper 不变。
- oracle collector 的 16 条曲线 = Onshape 实际选择（5 matched faces + 4 matched
  edges）；**不补底面 4 条 loop**（Onshape 未选、保持尖边）。公共
  `rollback-edge-oracle` 保持“0/多匹配/部分集合即失败”，不猜。

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
| modeling-server（私有） | schema/formModel/求值器扩展 + 面轮廓整环拔模 helper + per-edge 平面/锥面壳 + `Sew`；面归属/环归一化/CAP_FACE=profile 守卫/失败封闭；A2 已实现于 TS，无 native 变更 |
| 私有 converter（test-only） | CAP_FACE 精确映射 + 起始面证据；不提交公共仓 |
| 公共 replay/translator（test-only） | `faceExtrudeOp` 新字段、起始面解析、oracle 全边展开；场景可选字段 |
| apps/web 产品 UI | 不新增入口；能力 gated；仅回归 |
| viewer/editor | 无产品改动（复用面引用/选择） |
| itwinjs-core | 无 fork 改动（复用 `SolidModelingCommand`/`CurveOps`） |
| imodel-native | 无（A2 用现有 TS `Sew`/`Loft`/`CurveOps`，不需 native/P0-08） |
| hub/DanQing | 无 |

- 版本/发布：shared → backend（新产物/RC）→ web/replay 同批。已发布
  `backend-20261110`（shared 1.64.0）含新字段；`backend-20261109`（1.63.0）
  不含新字段，真栈验收必须用 1.64.0 backend。
- 旧 web/旧 shared → 新 backend：不发新字段，行为不变。
- 新 web/replay → 旧 backend：旧 `faceExtrudeSchema` 非 strict，未知键会被 strip，
  可能静默降级为“无偏移/无拔模”。缓解：发送方能力探测（form model）、backend
  先发、回滚隔离；这属于 X-11 已知运行时版本风险，本 ADR 不关闭它。
- **旧 payload 限定**：无新字段的旧 faceExtrude 载荷在单 body/faceRef 唯一时逐字
  兼容；旧多 body/跨体 faceRef 可能因 body 归属守卫变为 status=1（fail closed）。
- **范围门（S10/S3）**：A 只对 37 个 `entities` profile 的 CAP_FACE 特征发布；
  29 个 `startOffsetEntity`（27 个 `startOffset=true`）保持 blocked/approximate。
  A3 发布 **ADD/BLIND**；S3 扩展受限的 **REMOVE/INTERSECT/THROUGH_ALL** 证据
  形态（有 bodydetails PLANE 面积/AABB 证据、无 draft/第二方向/start-reference；
  合成真栈 REMOVE/THROUGH_ALL 15,000 mm³、INTERSECT/THROUGH_ALL 4,000 mm³、
  REMOVE/BLIND 5 18,500 mm³（THROUGH_ALL 不透传 depthMm）及产品朝内法向
  15,000 mm³ 均 status=0/1 body/push+冷重开/requireExact=true）。A2 证据为 pre-fillet 657,764.787185 + body
  20/20 line + Fillet 1 16/16 实际选择。无证据形态仍 fail closed（旧
  `capFaceExtrude` 近似只服务 start-reference/无证据家族）。
- **最终差（修订）**：pre-fillet 已匹配 prismoid；旧 −0.374% 是审计 20 边回退
  多选底面 loop 造成（≈2,384 mm³），不是 Extrude 2 残差，也不是内核 fillet
  边界；16 边 oracle 轨最终差 +0.151 mm³（+0.000024%）。

## 迁移与回滚

- **迁移**：无。新字段是 faceExtrude params 的可选键；旧库/旧 changeset 无迁移。
- **回滚**：移除 schema/求值器新分支即回到 1.33 行为；只含旧字段且单 body/faceRef
  唯一的文档不受影响。旧多 body/跨体载荷可能因 body 归属守卫 status=1（预期 fail
  closed）。含新字段的文档在旧 backend 上可能被静默 strip，因此回滚前必须审计/
  导出或从启用前 checkpoint 恢复；不得把旧 backend 的静默几何当正确结果。
- **A1/A2 回滚**：禁用 A2 逐边解析壳体构造，保留 A1 面边界+Loft；A1 体积仍是
  prismoid 297,764.787，但解析边/选择器不精确。Bumper strict
  回到 16/20 oracle（4 条锥面边 curvePrimitive 不可匹配）→ 不计严格绿；不得
  恢复审计 20 边回退（那会多选底面 loop，−0.374%）。
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
- **A2（精确几何；全部满足，实测已通过）**：
  - draft 10° 收窄 prismoid **297,764.787185 mm³**、远端 165.893842×35.893842；
  - draft 10° 外扩同一 prismoid **427,541.444986 mm³**、远端 194.106158×64.106158；
  - 4 条锥面斜边在 tool 体与最终 Unite 体均为 **line/arc（非 curvePrimitive）**；
    tool 12/12 line、最终 Unite **20/20 line**；
  - 含孔面外环扩/孔环缩的解析体积（final 22 line + 5 arc，无 curvePrimitive）；
  - Bumper pre-fillet **657,764.787185**，Extrude 2 增量 **297,764.787185**
    单独断言（绝对容差 0.01 mm³）。
- **真栈**：
  - A1 合成轨：面轮廓/偏移/draft 参数往返、记录 prismoid 297,764.787 baseline、
    push+冷重开；
  - A2 合成轨：解析体积/尺寸/边类型/push+冷重开（`face-extrude.spec.ts`
    4 passed）；
  - **S3 合成轨（2026-11-10 review 后实测 4 passed）**：40×40×10 板 +
    **10×10×30** 凸台（19,000），THROUGH_ALL 不携带/不透传 depthMm。
    REMOVE/THROUGH_ALL backward → **15,000 mm³**（若 blind 25 误透传则为
    16,500；可判别）；INTERSECT/THROUGH_ALL backward → **4,000 mm³**
    （blind 25 为 2,500）；REMOVE/BLIND depth 5 → **18,500 mm³**（证明 blind
    不切全高）。三者 tree 全 status=0、1 body、push+冷重开一致、
    `requireExact` 硬门 approximateSteps=0。
  - **S3 产品法向真栈（2026-11-10，`cap-face-direction.spec.ts`）**：
    10×10×10 底座 + 40×40×10 顶板，底面产品法向 +z（朝内，外法向 -z）；
    用产品 direction=forward（沿产品 +z，即体内）做 REMOVE/THROUGH_ALL →
    **15,000 mm³**、status=0、push+冷重开。反证“产品 forward=外法向”假设
    不成立，runner 必须按世界外法向 + 产品面法向换算。
  - 候选 PS 均被上游 blocker 挡在 S3 步前（Wheel Revolve 1 草图 0 面域；
    Clamp Fillet 1 sweptEdge matches=2；Rocker Extrude 2 上游 7-face
    imprintFace qUnion 未展开）；记录 exact blocker，不强制转绿；
  - Bumper 精确轨（2026-11-10 实测 2 passed）：S10 `capFaceProfile` →
    faceExtrude；S11 startOffset=0；**pre-fillet 657,764.787185**；Extrude 2
    增量 297,764.787185 单独断言（绝对容差 0.01 mm³）；pre-fillet body
    **20/20 边全为 line/arc**；Fillet 1 rb=3 oracle **16/16 实际选择**
    （5 matched faces + 4 matched edges），底面 4 条 z=0 loop 边**未选**且保持
    尖边；最终 **636,731.650 vs 636,731.499（+0.000024%）**、1 body、
    status=0（push 前/冷重开后）、approximateSteps=0、push+冷重开；
    冷重开后复核 faceExtrude 落库 bodyId/faceRef/startOffset/draft/pull；
  - 最终差归因修订：旧 −0.374% = 审计 20 边回退多选底面 loop（≈2,384 mm³），
    不是 Extrude 2 残差，也不是内核 fillet 边界；16 边轨 +0.151 mm³。
  - 回归：faceExtrude 首切片、extrude draft、THIN、upToSurface/upToNext/
    upToVertex、Bumper record/strict、Intro Part 3 strict、示例 iModel 回归。
- **拒绝**：调容差、把 `curvePrimitive` 当 line、把 16/16 当部分或补成 20/20 条、
  用审计 20 边回退冒充 16/16、硬编码体积、用最终 0.5% 替代 pre-fillet/边门、
  把旧 −0.374% 归因 Extrude 2 或内核 fillet 边界。

## 实施切片（已批准）

1. **A1（已完成，2026-11-10）**：shared 契约 + backend schema/求值器（面边界 +
   startOffset + draft 参数 + 面轮廓与既有整环拔模 helper 适配 +
   CAP_FACE=profile/body 归属守卫 + 失败封闭）。记录 prismoid 297,764.787
   baseline；不宣称解析边/20-20。
2. **A2（已完成，2026-11-10）**：逐边解析壳体（TS per-edge shell，无 native）
   替代整环 Loft；合成矩形 tool 12/12 line、最终 Unite 20/20 line、
   297,764.787185/657,764.787185；含孔全 line/arc；Bumper 实测通过。
3. **A3（已完成，2026-11-10）**：S9/S10/S11 证据指针 + 私有 converter
   `capFaceProfile`（起始面平面/面积/AABB 证据）+ 公共 translator/runner
   （起始面唯一匹配 → `resolveFaceRef` → faceExtrude）；旧 capFaceExtrude
   仅保留给 start-reference/无证据形态；ADD/BLIND、fail closed。
4. **A4（已完成，2026-11-10）**：Bumper 严格轨（pre-fillet 657,764.787185 门 +
   body 20/20 line + Fillet 1 oracle **16/16 实际选择** + strict 最终
   636,731.650 + push/冷重开 + 落库参数复核）+ 回归。原“20/20 含底面 loop”
   门已按 Onshape 证据修订。
5. **S3（已完成，2026-11-10）**：REMOVE/INTERSECT/THROUGH_ALL CAP_FACE profile
   方向语义校准 + converter/translator/runner 扩展（`normalSignAmbiguous` ±法向
   匹配、THROUGH_ALL 不透传 depthMm、世界 outwardNormal + 产品面法向换算
   direction、精确轨 approximateSteps=0 硬门）+ 合成真栈 REMOVE/THROUGH_ALL
   15,000 / INTERSECT/THROUGH_ALL 4,000 / REMOVE/BLIND 5 为 18,500 mm³ +
   产品朝内法向真栈 15,000 mm³；候选 PS（Wheel & Tire、Clamp Parts、Rocker）
   均被上游 blocker 挡在 S3 步前，记录 exact blocker，不强制转绿。
6. **UI**：另 AIRR，需 live 起始面/拔模对话框证据。

## 开放问题 / Spike

- **S1（RESOLVED 2026-11-10）**：最终 body 的锥面侧边 `curvePrimitive` 根因 =
  **既有内核 Loft 路径的 smooth skin（无 TS ruled 选项）**，不是 offset/Unite。
  A2 因此改用 **per-edge 平面/锥面壳 + `Sew`**；tool 体 12/12 line、最终
  Unite 体 20/20 line。证据：A2 spike/implementation reports（私有）+ 后端
  A2/faceExtrude 测试（私有；p/q/r）。
- **S2（RESOLVED 2026-11-10）**：不需暴露内核 taper；既有 TS
  `BRepGeometryOperation.Sew`/`Loft` + `CurveOps` 已足够，**无 native/P0-08 变更**。
- **S3（RESOLVED 2026-11-10）**：面法向/outward 与 direction 符号的校准。
  Onshape `oppositeDirection` 相对**实体外法向**：Wheel & Tire Extrude 1
  （REMOVE/THROUGH_ALL，oppositeDirection=true）rb=6→rb=7 在选中面 y=-14 处
  切至 y=-15.5（-y，材料在 -y 侧，外法向 +y）；Rocker Extrude 10
  （REMOVE/BLIND，oppositeDirection=true）rb=25→rb=30 出现 y=-1.5 新底面
  （-y，材料在 -y 侧，外法向 +y）。两例均为“逆外法向切入材料”，与 Bumper
  ADD/forward + oppositeDirection=false 一致。converter 由 bodydetails
  `orientation` 得到世界外法向（true=外 / false=内）；产品面法向不保证朝外
  （合成底面 +z 朝内），runner 用世界 desiredDir 与解析到的产品面法向点积
  选择 forward/backward，不假设产品 forward=外法向。bodydetails 参数化法向
  符号不可信，S3 新形态一律 `normalSignAmbiguous` 接受 ±法向。证据：私有 rb
  快照 + 合成真栈 REMOVE/THROUGH_ALL 15,000、INTERSECT/THROUGH_ALL 4,000、
  REMOVE/BLIND 5 为 18,500 mm³ + 产品朝内法向真栈 15,000 mm³（tree status=0、
  1 body、push+冷重开、requireExact approximateSteps=0）。
- **S4（OPEN，已收窄）**：`draftPullDirection` 与 Onshape 方向的符号一致性。
  合成收窄/外扩与 Bumper 10° 收窄均已与 Onshape 体积一致；其它方向组合仍待证据。
- **S5（RESOLVED 2026-11-10，test-only）**：Onshape Fillet 1 实际选择 **16 条**
  （5 matched faces + 4 matched edges）；底面 4 条 z=0 loop 边**未选**并保持尖边。
  最终 body 的私有 bodydetails 快照为 40 面 =
  12 PLANE + 20 CYLINDER（16 R5 圆角 + 2 R5.5 + 2 R8.625 孔）+ 8 SPHERE，
  无底环 R5 圆角；live 截图底边为直尖边。证据：私有 final 快照 +
  `ui-evidence/bumper-block-live-20261106/crop-bottom.png`。
- **S6（OPEN）**：旧 backend 静默 strip 的能力探测/发布顺序/回滚隔离（X-11）。
- **S7（OPEN）**：faceExtrude 预览/性能/大环面上限。
- **S8（OPEN）**：**非零** startOffset 与 draft 的组合语义（中性面是否随 startOffset
  平移）；Bumper startOffset=0 已由 S11 解析，不依赖该组合。
- **S9（RESOLVED 2026-11-10）**：中性面=选中的起始/profile 面（z=40）；10° 从
  pull direction 量起；`draftPullDirection=true` 收窄；z=40 的 180×50 → z=80 的
  165.893842×35.893842；δ=40·tan10°。证据：Bumper rb=3 私有快照
  + A2 合成/真栈体积。
- **S10（RESOLVED 2026-11-10）**：CAP_FACE 在 `entities` profile 槽（同
  qSketchRegion）；`startOffsetEntity` 空、`startOffset=false`；语料 37 个
  `entities` vs 29 个 `startOffsetEntity`（27 个 `startOffset=true`）；A 适用于
  37 个面驱动特征，29 个 start-reference 保持 blocked/approximate。证据：
  Bumper Extrude 2 私有 features 快照 +
  `resolveCapFaceProfileEvidence` 单测/重转回归。
- **S11（RESOLVED 2026-11-10）**：startOffset=0；25 mm `startOffsetDistance` 是
  未使用默认值；面 z=40、depth 40 → 顶面 z=80；pre-fillet 657,764.787。证据：
  Bumper rb=2/rb=3 快照（同上目录）+ 真栈 pre-fillet 657,764.787185。

## 状态

**已接受（2026-11-10 用户批准实现；同日 A2/A3/A4 实测后修订 A2 边门与最终差
归因）。** A1/A2/A3/A4 已按修订后的门完成：A2 = 解析边 **20/20 line** +
pre-fillet **657,764.787185**；Fillet 1 = **16/16 实际选择**（5 matched faces +
4 matched edges；底面 4 条 z=0 loop 尖边未选）+ 最终 **636,731.650 vs
636,731.499（+0.000024%）**；全部 status=0、1 body、push+冷重开、
approximateSteps=0。旧“oracle 20/20 含底面 loop”门与把 −0.374% 归因 fillet/
Extrude 2 的表述均已修订；S1/S2/S3/S5/S9/S10/S11 已解析，S4/S6/S7/S8 仍开放。
Bumper 严格轨依赖 A1/A2 backend（X-11）；不得用审计 20 边回退，也不得在
1.63.0 backend 上宣称精确。索引口径（2026-11-10 发布闭口）：私有
`replicable-now` 为第 18 例（Bumper），条目携带
`strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、
`genericResolver=12-edge blocked`；私有 converter/oracle/scenario 已提交，
A1/A2 backend 随 `backend-20261110` 发布。generic resolver 仍是 12 边
blocked-kernel，不得把 strict oracle 轨说成通用能力。
