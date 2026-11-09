# PS blocker 驱动的示例转绿实施计划（2026-11-09）

> **执行方式**：本计划是 2026-11-06 连续台账的**优先级重排**，不推翻既有 AIRR/ADR。
> 每个切片仍按 P0-04 先 AIRR/ADR、再 shared/backend/web 同批、最后真栈证据；
> 遇到 `blocked-capability` / `blocked-kernel` 登记证据后立即转下一项。

**Goal:** 按真实 Onshape Part Studio 的 blocker 排名推进，优先让“只差 1–2 个根能力”
的 PS 达到四维完成门，而不是继续按功能清单堆控件。

**Architecture:** 私有 `manifest/example-index.json` 是唯一调度源；公共仓只保留
脱敏 registry/runner/演示入口。几何事实源仍是 `params` + `FeatureOp`，示例回放
经 `scenario-to-op` → 标准 RPC/UI；每项新能力先补 ADR/AIRR，再改
shared → backend → web → e2e。

**Tech Stack:** TypeScript / iTwin.js BriefcaseConnection / Playwright / Vitest /
私有 Onshape parity corpus / 真形 BRep 内核（经 `SolidKernel.h`）。

**Spec / 既有依据：**
- `docs/architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md`（四条总目标）
- `docs/superpowers/specs/2026-11-06-example-coverage-master-airr.md`（总 AIRR）
- `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`（历史执行台账）
- `docs/adr/0006-*`、`0009-sketch-external-references.md`、`0015-multi-target-feature-scope.md`
- 私有索引：`D:\Github\onshape-parity-data\manifest\example-index.json`
  （2026-11-09 重生成；原始 features/证据不进入公共仓）

---

## 0. 基线（2026-11-09 重生成索引）

### 0.1 漏斗

| 层级 | 数量 |
|---|---:|
| 发现文档 | 526 |
| 有 features 的 PS | 227 |
| native PS（非 import/自定义 FS/钣金/专用/空） | **104** |
| 其中逐 body 数据可测（`perBodyComplete`） | **59** |
| 严格管道 `replicable-now`（几何/约束/UI/持久全绿） | **2**（本计划基线；2026-11-09 执行后 **14**：Wheel、Master Cylinder Piston、First Part、WARNING LABEL ×4、Drive Sleeve ×2、Intro Part 1/2、O-Ring、Bushing、ENG_BEARING） |
| raw capability `replicable-now`（忽略 scenario 完整性） | 35（执行后 **44**） |
| blocked-selector / blocked-kernel / blocked-capability（执行后） | **4 / 4 / 15** |

### 0.2 59 个可测 native PS 的 blocker 排名

| 排名 | Blocker | 受影响 PS | 说明 |
|---:|---|---:|---|
| 1 | `geometry-approximate:imprintFace/region-risk` | **47** | 实体面 split / imprint 精确区域；几乎所有近似绿例的根因 |
| 2 | `scenario-constraint:dropped` | **39** | 多为外部引用/未映射约束的聚合标记，需逐类消除，不是独立可修项 |
| 3 | `converter-scenario:draft` | **39** | Draft 特征未映射；其中 9 个同时缺产品 draft 能力 |
| 4 | `sketch-constraint:PROJECTED` | **31** | 实体边/面投影到草图 |
| 5 | `converter-constraint:CONCENTRIC` | **27** | 同心 refs 解析（部分旧索引偏高，需按最新 converter 复核） |
| 6 | `capFace/sweptFace` 选择器待验收 | **25** | 统一 face/edge selector resolver |
| 7 | `converter-scenario:rib` | **20** | Rib 特征（产品无后端） |
| 8 | `converter-scenario:mirror` | **17** | 镜像面/多源/局部 |
| 9 | `scenario-non-geometric:skipped` | **12** | decal/mate connector 等口径 |
| 10 | `CENTERLINE_DIMENSION` | **12** | 多数已映射；Wheel 已严格绿，剩余为 refs 形态/旧索引 |
| 11 | `moveFace` | **11** | 产品已有，converter 未接 |
| 12 | `splitPart` | **10** | 产品已有，converter/UI 子集未接 |
| 13 | `cPlane` | **10** | MID_PLANE/LINE_POINT/非世界帧等 |
| 14 | `booleanBodies` | **9** | tool body/offset/reFillet 等未映射 |
| 15 | `SILHOUETTED` | **9** | 外部轮廓投影 |
| 16 | `CIRCULAR_PATTERN` | **8** | 草图 pattern 约束 |
| 17 | `PIERCE` | **7** | 点穿透实体面 |
| 18 | `INTERSECTED` | **6** | 交线/交点约束 |
| 19 | `LINEAR_PATTERN` | **6** | 草图线性 pattern 约束 |
| 20 | `shell` / `offsetSurface` / `deleteFace` / `deleteBodies` | 3 各 | 长尾能力/内核 |

### 0.3 只差 1–2 个 blocker 的 PS（最快转绿）

| PS | blocker | 需要 |
|---|---|---|
| Sample Assignment / Alignment Plate | imprint | P1 |
| Tutorial 2 - Build a Part / First Part | imprint | P1 |
| Tutorial 2 iOS / First Part | imprint | P1 |
| WARNING LABEL ×4 文档 | imprint + 非几何 skip | P1 + 口径裁决 |
| Dumper Trailer / Bumper Block | imprint + capFace/sweptFace | P1 + P2 |
| Exercise: Intermediate Drawing / Drive Sleeve | CONCENTRIC + imprint | P1 + P4 |
| Exercise: Update Drawing / Drive Sleeve | 同上 | P1 + P4 |
| Exercise: Clamp / Handle Parts | CENTERLINE + 跨 3 body fillet | P5（ADR-0015） |
| Wheel / Master Cylinder Piston | 无 | 已严格绿（回归基线） |

**排序结论**：先做 P1 imprint（同时推进 3 个严格绿 + 4 个文档形式化 + 2 个双
blocker PS），再做 P2 selector（Bumper Block 直接转绿），P4 CONCENTRIC 使
Drive Sleeve 双绿；draft/rib 虽计数高，但都在 3+ blocker 的 PS 中，放在 P7。

---

## 1. 里程碑

| 里程碑 | 内容 | 退出证据 |
|---|---|---|
| M1 | imprint 精确语义（P1） | Alignment Plate、Tutorial 2 First Part、iOS First Part 严格四维绿；WARNING LABEL 口径登记 |
| M2 | selector resolver（P2） | Bumper Block 严格绿；每类 selector 合成真栈用例 |
| M3 | CONCENTRIC + converter 快赢（P4） | Drive Sleeve ×2 严格绿；moveFace/splitPart/cPlane/booleanBodies 新绿例按数据批次入库 |
| M4 | 多体作用域（P5，ADR-0015） | Handle Parts 跨 3 body fillet 转绿或 blocked-kernel 证据 |
| M5 | 外部草图引用（P3） | PROJECTED/PIERCE/INTERSECTED/SILHOUETTED 各类首个真实 PS 绿例 |
| M6 | 数据 + 长尾（P6/P7） | Intro Part 1–6 等可测；draft/rib/mirror 解锁批入库 |
| 并行 | BRepCore 审计（P8） | 私有台账 + 每季度复审记录 |

---

## 2. 任务

### P0 — 索引与基线（2026-11-09，已完成）

- [x] 重生成私有 `example-index.json` 与 `docs/EXAMPLE-COVERAGE.md`；
  59 个可测 native PS、2 个严格绿、35 个 raw 候选。
- [x] 冻结本计划的 blocker 排名与 ≤2 blocker 清单（§0.3）。
- [x] 发布 `backend-20261109`（shared 1.63.0）作为后续真栈基线。
- 规则：索引过旧（能力已落但索引未重生成）时先重生成索引，再判断转绿；
  不得用旧 blocker 计数宣称能力无效。

### P1 — imprint 精确语义（最高杠杆）

**P1.0 证据 + AIRR/ADR（先做，不写产品代码）**
- 从私有语料取 Alignment Plate、Tutorial 2 First Part、iOS First Part、
  Bumper Block、Drive Sleeve、Stirrup 的 imprint 查询树/草图面域/前缀体积；
  明确 Onshape `imprintFace` 的三种语义：草图面域、实体面 split、−1 补集面。
- AIRR 评估两条路线：
  A. 产品能力：在 `ExtrudeParams`/`FaceRef` 增加“草图 imprint 面区域”语义
     （需要 shared bump + UI + 内核面 split）；
  B. 回放层：`imprint-face-resolver` 精确求交/裁剪，把精确面域喂给现有
     `faceExtrude`/trim（不新增产品契约）；
  以“是否能进入完整参数化链 + AI 可编辑”选 A/B，不能只求回放绿。
- 产出：ADR-0006 切片 E（或新 ADR）+ 测试矩阵 + 失败/回退边界。

**P1.1 实现 + 合成真栈**
- 按 AIRR 裁决实现；合成用例必须覆盖：
  +1 环内面、−1 环外补集面、多个不相交闭环、跨平面草图、源面失效。
- 至少一个真栈 spec 证明 imprint 前后体积/质心/body 数正确，push+冷重开。

**P1.2 三个严格绿目标**
- Alignment Plate 8915.859905 mm³、Tutorial 2 First Part 357568.177 mm³、
  iOS First Part 157478.902 mm³（体积/body 数/树 status=0）。
- 约束维度：按采集证据逐类登记；未实现约束写 `blocked-capability`，不得
  用 `constraints=dropped` 冒充 complete。

**P1.3 WARNING LABEL 口径**
- 4 个同几何文档（0.8193532 mm³）已绿；imprint + decal/mateConnector 非几何
  步骤的完成门口径需裁决并写入四维状态，不把非几何 skip 当作几何失败。

**停止条件**：若 imprint 需要内核 face split 且真形/ACIS 不提供，登记
`blocked-kernel` 并转 P2；不得用回放近似宣称 M1 完成。

### P2 — 统一 selector resolver

**P2.0 taxonomy 收敛**
- 以最新 `analyze-selectors.mjs` + `example-index.json` 为准，按
  CAP_EDGE / SWEPT_EDGE / createdBy / face / axis / body / sketch curve /
  mateConnector 分类；未知 selector 必须计数可见。

**P2.1 capFace / sweptFace / face / axis**
- 复用 `ScenarioEdgeMatcher` / `resolveFaceRef` 的既有语义，补
  face 选择、through-all、axis 派生；每类至少一个 synthetic StandaloneDb +
  一个真栈用例。
- 与 P1 共用 imprint 面解析，避免第二套面选择事实源（P1-01）。

**P2.2 Bumper Block 严格绿**
- 636731.499 mm³；12 边 fillet 的 CAP_EDGE 查询必须 matches>0；
  imprint 走 P1 精确路径；树/status/push+冷重开一致。

**停止条件**：selector 语义在语料中不唯一时，登记 `blocked-selector` 并保留
未知计数，禁止默认 region 0/任意边。

### P3 — 外部草图引用（ADR-0009 续作）

按语料计数排序，独立切片：
1. **PROJECTED（31）**：实体边/面投影到草图；平行/非平行、裁剪、源驱动边；
   Use 工具 UI；投影实体不占 DOF 的既有规则延续。
2. **PIERCE（7）**：草图点穿透实体面；求解语义 + 拖动/尺寸更新。
3. **INTERSECTED（6）**：交线/交点约束。
4. **SILHOUETTED（9）**：外部轮廓投影。
5. **CIRCULAR_PATTERN / LINEAR_PATTERN（8/6）**：草图 pattern 约束展开/求解。

每个切片：shared DTO + solver/normalizer + converter/translator + UI 选择槽 +
真栈 spec；未实现子形态明确 `blocked-capability`，不静默丢约束。

### P4 — CONCENTRIC + converter 快赢

- **P4.1 CONCENTRIC（27）**：converter 解析圆/弧/端点 refs；与草图 solver
  既有 concentric 对齐；Drive Sleeve ×2 在 P1 完成后严格绿。
- **P4.2 converter 批次（按产品已有能力）**：moveFace（11）、splitPart（10）、
  cPlane（10）、booleanBodies（9）、mirror（17）、linear/circular pattern
  剩余形态；只转已能精确表达的子集，其余如实 dropped。
- 退出：每个 converter 类别有独立 translator 单测 + 一个真实 PS 或合成真栈；
  不把近似标成 complete。

### P5 — 多体作用域（ADR-0015）

- 设计单 FeatureOp 多目标/跨 body 语义（fillet 跨 3 body、pattern/mirror 多体）；
  评估 shared 契约形状（`targetBodyIds` 还是 per-body 子操作）。
- 先做 Handle Parts 的跨 3 body fillet 最小切片；失败则登记
  `blocked-kernel` 并保留单 target 的诚实拒收。
- UI/预览/编辑回显/撤销/冷重开同步；不允许第二套选择权威。

### P6 — 数据采集与场景转换

优先级（成本最低、潜在新绿最多）：
1. Intro to CAD - 1.2-1.4 / Part 1–6（features 已有，缺 per-part/scenario）。
2. Tutorial 2 Android / First Part；DRILL HOTD / ENG_BEARING、CONNECTING_ROD。
3. Element Organization / Dog Bone Link（PROJECTED×6）等 3+ blocker 候选。
4. O-Ring/Bushing 索引与已建 demo 状态对齐。

采集遵守 429/retry-after 与配额预算；数据只落私有仓；公共仓只更新脱敏
registry/聚合状态。

### P7 — 长尾特征（在 ≤2 blocker 层级清空后）

按实际解锁数排序：draft（39，需产品 neutral-face draft + 证据）、rib（20）、
mirror 剩余（17）、splitPart/UI 剩余、shell/offsetSurface/deleteFace/
deleteBodies 等。每项独立 ADR；没有真实示例直接受益前不先做纯 UI polish。

### P8 — BRepCore 审计（并行常规项）

- 在私有 `D:\Github\imodel-native` 建 `docs/BREPCORE-AUDIT.md` 台账：
  文件/调用点、内存与生命周期、线程/并发、错误传播、几何精度、拓扑稳定性、
  布尔/圆角/扫掠真实语义、ACIS/真形边界。
- 每次能力切片触及 BRepCore 时追加审计条目；发现问题立 ADR/修复或登记
  `blocked-kernel`；属于真形/绳墨的问题转私有仓并保留公开仓证据指针。
- 公共仓只保留聚合状态/指针，不复制 native 细节（Native 文档私有化政策）。

---

## 3. 每个切片的交付门

1. AIRR/ADR（新契约/schema/native/渲染/求解器/迁移必须）。
2. shared DTO + version bump + 契约测试；backend evaluator/registry/guards；
   web 对话框/ribbon/树/编辑回显/预览；删除/抑制/撤销。
3. 单元 + StandaloneDb + **真栈 e2e**；四维状态（几何/约束/UI/持久）逐项写实。
4. push + 冷重开；逐 body 体积/质心；树 status=0。
5. 文档：ADR/接口冻结矩阵/例外/能力状态/计划台账同 PR。
6. 未实现/失败：`blocked-capability` / `blocked-selector` / `blocked-kernel`
   证据路径，禁止假成功或放宽断言。

## 4. 验证命令

```bash
# shared
cd luban-cad/packages/shared && corepack pnpm@10 test && corepack pnpm@10 build
# backend
cd D:/Github/luban-backend/modeling-server && corepack pnpm@10 test
# web
cd luban-cad/apps/web && corepack pnpm@10 test && corepack pnpm@10 exec tsc --noEmit
# 真栈（示例/能力）
npx playwright test e2e/<spec>.spec.ts --reporter=line
# 发布/全栈（按需）
powershell -File scripts/release-gate.ps1 -ExpectedSha256 <asset> -AllowStoreFallback
```

## 5. 风险与停止条件

- **索引过旧**：能力已落但索引未重生成时先重跑 `index-examples.mjs`，不得
  用旧 blocker 判断能力无效。
- **imprint/face split 超内核能力**：登记 `blocked-kernel`，不以近似面域冒充。
- **selector 语义不唯一**：`blocked-selector`，保留未知计数；禁止默认 region 0。
- **多体契约**：ADR-0015 裁决前不改 shared；跨体失败保留单 target 诚实拒收。
- **数据配额**：采集不足时写 `blocked-evidence`/`no-body-data`，不用聚合体积
  冒充逐 body。
- **公共/私有边界**：原始 features/坐标/截图/native 证据只留私有仓。
- **停止/转项**：blocked 证据登记后立即转下一项，不反复猜测；破坏性操作需 HITL。

## 执行记录（2026-11-09，P1.0/P1.1 imprint 有向边侧）

- **语义裁决**：Onshape `topologyDisambiguation([[edge, ±1]])` 的 ±1 是**有向草图边
  的左/右侧**，不是旧的“−1 环外/+1 环内”。Tutorial 2 First Part 实证：Extrude 2
  的两条查询分别选中 region 2 与 region 4（并集），旧“最大面积”只选 region 2，
  少 5,277 mm³。
- **实现**：shared `sketch/imprint-region.ts` 单一实现（line/arc/circle 边侧、孔边界、
  同侧歧义诚实回退）；公共 `run.ts` 与后端 `test/ScenarioReplay.ts` 同时接入；
  converter 先解码 qCompressed 再取符号。无 RPC 载荷/`interfaceVersion` 变更。
- **证据**：shared **180/180**；backend `ScenarioReplayParity` **7/7**；
  First Part 真栈 **357,566.084 vs 357,568.177（0.0006%）2 passed**；
  Alignment 8915.890 vs 8915.860；WARNING LABEL 0.8193532；iOS 离线 157478.895。
- **索引重生成（2026-11-09）**：strict `replicable-now` **2 → 7**
  （First Part + WARNING LABEL ×4 + Wheel + Master Cylinder Piston）；
  imprint 近似 blocker **47 → 14**，剩余全部是 `regionRisk`（converter 多面域
  前缀映射），不是边侧语义。
- **下一步**：P1.2 收敛 `regionRisk`（iOS/Alignment/Drive Sleeve 等 14 个可测 PS），
  然后再进入 P2 selector。不得把 regionRisk 当作 imprint 边侧问题重复修。

## P1.2 证据（2026-11-09，regionRisk 未清）

- **iOS First Part**：Extrude 1 原查询是 `qSketchRegion(id+"<sketch>", true)`，
  `deterministicIds=[JGK,JGO,JGS]`；草图实际 5 个面域。converter 只能按 ID 数量
  取面积降序前缀 `[0,1,2]`，没有 Onshape face-ID → 我方 region 的静态映射。
  真栈/离线体积匹配（157478.895 vs 157478.902），但严格完成门仍是
  `blocked-evidence`，不得把前缀当精确映射。
- **Alignment Plate**：Cut 2 holes 同类 `qSketchRegion`，regionRisk 仍在；
  Cut 2 more holes 的 qCompressed ±1 已恢复，line/circle 边侧已精确。
- **Bumper Block（分类纠正）**：Extrude 2 解码后是 **CAP_FACE** 查询
  （`FQ77TbrVllXHHPl_0.opExtrude` + 草图四边原依赖），不是
  `<sketchId>.imprint`；converter 误分类为 imprintFace 且无 ±1，
  index 的“缺符号”只是症状。真实阻塞 = **capFace/起始面拉伸**（产品
  faceExtrude 无 draft）+ 12 边 fillet 内核，归 P2，不在 P1 伪修。
- **结论**：P1.2 转 `blocked-evidence`（需要 Onshape 面级 ID 与逐面证据）；
  P2.0 先做 selector taxonomy + CAP_FACE 分类纠正，避免继续把 CAP_FACE 当
  imprintFace。

## P2.0 执行记录（2026-11-09，CAP_FACE 分类纠正）

- **converter**：non-`qSketchRegion` 不再一律当 imprintFace；`.imprint` 根才
  imprintFace，`CAP_FACE/SWEPT_FACE`/`EntityType.FACE` → `selection.kind='face'`
  并登记 dropped，未知形态 → `kind='unknown'`。Bumper Block Extrude 2 由误标
  imprintFace（“缺 ±1 符号”）纠正为 CAP_FACE 面选择。
- **translator**：`selection.kind='face'` 抛
  `BlockedCapabilityError('face-extrude')`，不再退化成 region 0 近似。
- **index**：Bumper Block blocker 变为
  `extrude Extrude 2: 面选择（CAP_FACE/SWEPT_FACE）未映射` +
  `面边界选择器（capFace/sweptFace）待真栈验收`；strict 7 不变。
- **spec**：`bumper-block-approx.spec.ts` 标 `test.fail` known-blocked；
  旧近似体积路径退役。
- **下一步 P2.1**：实现 CAP_FACE 起始面/draft（产品 faceExtrude 扩展）或如实
  登记 blocked-kernel（12 边 fillet 已知），不把 CAP_FACE 塞回 imprint。

## P2.1 执行记录（2026-11-09，CAP_FACE 起始面映射）

- converter 对 `opExtrude + CAP_FACE` 且上游 NEW/blind/非对称/非反向/无 draft/
  无第二方向的简单帽面，导出 `capFaceExtrude`（上游草图/面域 + startOffset=上游
  depth）；translator 映射产品既有 `extrude` 的 startOffset+draft。
- Bumper Block 真栈（record）：Extrude 1 360,000 → Extrude 2 657,764.787
  （+297,764.787），目标 636,731.499，**+3.303%**；Fillet 1/Hole status=1
  （12 边 fillet/内核仍阻塞），严格门保持 blocked-kernel。
- `run-file` 新增 `statusPolicy:'record'`（能力覆盖轨记录非 0 status；严格轨
  缺省仍 fail closed）；Bumper spec 由 test.fail 转为能力覆盖记录。
- index：Bumper 的 face 选择 blocker 消失，只剩
  `面边界选择器（capFace/sweptFace）待真栈验收`。
- 下一步：P2.1b CAP_FACE 反向/对称/上游 draft 形态，或 P3 外部草图引用；
  Bumper 的 fillet/hole 内核问题单独登记 blocked-kernel。

## P2.1b 证据（2026-11-09，Drive Sleeve CAP_FACE 上游为 imprint）

- 两个 Drive Sleeve 的 Extrude 4 也是 CAP_FACE，但上游 Extrude 1 是
  **imprintFace**（多查询草图面域），不是简单 `qSketchRegion`；当前
  `resolveCapFaceExtrude` 只映射 NEW/blind/qSketchRegion 帽面，故保持 `face`
  blocked（不再误报“缺 ±1 符号”）。
- 最新 blockers：`CONCENTRIC` + `extrude Extrude 4: 面选择未映射`（两条 PS 相同）。
- 后续 P2.1b：capFaceExtrude 支持上游 imprintFace（复制 queries，回放侧先按
  边侧选面域，再设 startOffset），并补 CONCENTRIC refs；两者都绿后 Drive Sleeve
  才能严格转绿。不得只做其一就宣称完成。

## P2.1b 执行记录（2026-11-09，CAP_FACE 上游 imprint + hole scope）

- **converter**
  - `resolveCapFaceExtrude` 受理上游 imprintFace：复制全部上游 imprint queries
    （草图实体 + ±1），并从**下游 CAP_FACE** 的 `originalSetDisambiguation`
    提取边界边 UUID → 草图实体（Drive Sleeve：边 2/4/5/6/7）。
  - 方向按起始面法向换算：`capNormal=上游方向`，
    `productDirection=capNormal×下游opposite`；`startOffsetMm=capNormal×depth`。
    Drive Sleeve Extrude 4 → `startOffset=-63.5`、`direction=forward`。
  - 修复 `.opExtrude` 明文后缀解析（旧正则只认 `$idopExtrude`，CAP_FACE 从未
    被识别）。
  - hole `scope` 同样剥 `.op*` 后缀；旧实现 scope 恒空 → 回放器不建 body
    质心上下文 → 孔方向缺省 forward 钻向空处（Hole 1 零体积）。
- **runner**：CAP_FACE 边界边优先按“面域边界包含全部边”选面域（面选择语义），
  无命中才回退逐边侧向；CAP_FACE 步禁走 A1 faceExtrude（否则丢掉 startOffset）。
- **真栈证据（Drive Sleeve, Intermediate Drawing）**：树 8/8 **status=0**；
  Hole 1 `direction=backward`（body 质心在草图法线负侧），6 孔真实去材；
  体积 **1,388,291.491 vs 1,175,024.308 mm³ = +18.1%**（known-red）。
  修正前 Extrude 4 无效果、Hole/pattern 零去材。
- **剩余根因（blocked-selector，不属于 CAP_FACE）**：Extrude 1 的 8 条 imprint
  查询在被草图线分割的面上各选一个子面；当前 region 引擎按整条边选唯一面域且
  NEW 多查询收敛到主导 region 0。正确 face set（内盘子面并集）需要
  **edge-split 面集 resolver**（P2.2）。Drive Sleeve 严格断言保留 `test.fail`。
- **回归**：Bumper Block 仍 657,764.787（+3.303%）；scenario-to-op **50/50**。
- **index**：CONCENTRIC 补入 converter 能力表（原漏登记导致 50 PS 误报）；
  新增 `blocked-selector` 分类与 known-selector 表，两条 Drive Sleeve 从
  `blocked-converter` → `blocked-selector`；strict `replicable-now` **保持 7**
  （没有把 known-red 算绿）。`verify-example-index` 0 errors / 5 warnings。
- **下一步**：P2.2 统一 selector resolver——先做 **edge-split face set**
  （Drive Sleeve 转绿信号），再做 capFace/sweptFace/face/axis 的合成真栈矩阵。

## P2.2 执行记录（2026-11-09，面面积证据选择 + CAP_FACE isStart）

- **根因（P2.1b 剩余 +18.1%）不是边侧符号，而是“面集反解”**：Onshape 的
  imprint/CAP_FACE 查询在被草图内部分割的面上逐条定位子面；product 面域引擎
  对同一条边只能给出一个相邻面域，多查询会重复/漏选。Drive Sleeve Extrude 1
  实际选 8 个面域（4 大扇区 + 3 中扇区 + 槽区），旧实现收敛到 region 0。
- **新能力（test-only replay，无 RPC/`interfaceVersion` 变更）**：
  - 私有采集：Onshape `bodydetails?includeTopology=true` 提供最终 BRep 面
    `id/area/box/surface`（只读 API；Drive Sleeve 证据落私有仓）。
  - 公共 shared：`selectProfileRegionsByArea`（`sketch/profile-area-select.ts`）
    在 product `SketchRegionDto.area` 上枚举子集，按目标面积选唯一解；多解等距
    返回 `ambiguous`，调用方必须登记，禁止按面积排序猜前缀。
  - scenario 新增可选证据字段 `profileAreaMm2` / `profileAreaEvidence`（params
    自由对象，无需 schema 变更）；converter 对 Drive Sleeve 四段拉伸携带
    10530.0589 / 25208.7599 / 3230.2602 / 4069.54 mm²。
  - runner：有面积证据时先保留逐边查询命中作为必需面域，再做面积子集选择；
    CAP_FACE 不受逐边结果约束；NEW 的 `dominantImprintRegion` 启发式在面积
    证据命中后必须跳过（否则 8 面域会被收敛回 region 0）。
  - **CAP_FACE `isStart` 语义修正**：`isStart:true` 指上游拉伸的**起始端盖**
    （草图平面），`false` 指深度端盖。Drive Sleeve Extrude 4 从 z=0 的起始端盖
    向材料内切 16.256（startOffset=0，direction=backward），不是从 −63.5 端盖
    向前切；Bumper `isStartF` 保持 startOffset=+40。
- **真栈（严格）**：
  - Drive Sleeve ×2（Intermediate Drawing / Update Drawing）
    **1,175,022.882 vs 1,175,024.308 mm³（0.00012%）**，8/8 status=0，
    push+冷重开一致；**test.fail 移除，转严格绿**。
  - Bumper Block 保持 657,764.787（+3.303%，record）；scenario-to-op 50/50。
  - shared 新增 selector 单测 8/8（含 Drive Sleeve 10530.06/4069.54 回归与
    多解 ambiguous）。
- **索引**：strict `replicable-now` **7 → 9**（Drive Sleeve 两份副本）；
  `verify-example-index` 0 errors / 5 warnings。`blocked-selector` 分类保留，
  但本批两条 PS 移出 known-selector 表。
- **下一步**：把面积证据采集扩展到其余 `blocked-selector`/`regionRisk` PS
  （P2.2 批量化）；selector 仍未覆盖的 sweptFace/axis 走同一证据通道或
  如实 blocked-selector。

## P4.2 / P6 执行记录（2026-11-09，Intro to CAD 1.2 数据 + 草图建面）

- **数据采集（只读 Onshape API）**：对 `Intro to CAD - 1.2`（c6a3cd）与
  `1.2-1.4`（dfc6e3）补 parts/per-part mass；批量转换 Part 1–6 场景。
- **converter quick wins**：
  - **草图建在上游拉伸端盖**：`planeDto` 支持 CAP_FACE/SWEPT_FACE 草图平面，
    通过上游 extrude 的**源草图 sketchMatrix** + `isStart`/深度静态推导端盖
    平面；Part 1/5/6 不再报“不支持的草图平面”。
  - **压缩 imprint 识别**：`$imprint`/`S7$IMPRINT`（无点号）不再落 unknown；
    Part 1–6 的 extrude 选择全部映射。
- **真栈**：
  - **Part 1 / Part 2 严格绿**：409,676.600 / 294,967.152 mm³ 与采集值
    **0.000%**，树/status/body/push+重开全绿。
  - Part 3 / Part 4 known-red：同一草图被 region 引擎切成 9 个**同面积**
    645.16 区域，三块矩形轮廓面积分别为 3/2/1 格（1935.48/1290.32/645.16）；
    仅面积证据多解，且 ADD 之间还要求位置不重叠 → 当前 −35.7% / −62.5%，
    `blocked-selector`（需要位置/拓扑证据）。
  - Part 5 / Part 6 known-red：Sketch 2 只有单条线，imprintFace 需要实体面
    split；当前草图 0 面域 → `blocked-selector`（face split）。
  - 新 `intro-cad-parts.spec.ts`：2 strict + 4 test.fail；index strict
    `replicable-now` **9 → 11**，blocked-selector 4。
- **下一步**：位置+面积联合证据（同面积面域需拓扑邻接/质心），以及单线
  imprint 的实体面 split；不得用任意同面积子集冒充精确轮廓。

## P6 补充（2026-11-09，Element Organization 数据补齐）

- 对 `Exercise: Element Organization`（58eb97）补 parts/per-part mass；重新转换
  O-Ring / Bushing 场景（旧场景 expected=0/无 body）。
- **O-Ring**（sketch+revolve）：真栈 **454.910 vs 454.927 mm³（0.004%）**，
  严格绿。
- **Bushing**（sketch+extrude，单 circle imprint +1）：真栈
  **3,259.620 vs 3,259.685 mm³（0.002%）**，严格绿。
- 新 `o-ring-scenario.spec.ts` 两个严格用例；index strict `replicable-now`
  **11 → 13**。Bushing 从 `blocked-converter（regionRisk 缺 sketchEntityId）`
  转为 replicable-now（重新转换后单查询有 sketchEntityId，侧向精确）。

## P8 执行记录（2026-11-09，BRepCore 审计首切片）

- 在私有 `imodel-native/docs/audit/BREPCORE-AUDIT-LEDGER.md` 建立初始台账：
  - 覆盖矩阵（拉伸/布尔/面修改/拓扑/持久 id/mass）；
  - 发现：Bumper 12 边 fillet 无几何回包（待证实，需 native probe）、Gaiter
    全圆边 blend 体积 0（待证实）、Drive Sleeve pattern op=1 是调用方 hole
    scope/direction 前提错误（已闭环）、跨 3 body fillet 是产品契约缺口、
    createBRepGeometry 空结果需调用方守卫、多边/布尔压印 blend ctest 缺口；
  - deep code audit 队列（Blend/Chamfer/Hollow/Offset、Sweep/Loft 前置、
    Boolean 相交语义、拓扑 id、SolidKernel 111 导出 vs ctest）。
- 结论：当前**没有证据**支持“BRepCore 在 12 边/全圆边 blend 有确定性缺陷”；
  先补 native 多边/布尔压印 ctest，再决定内核修复还是产品守卫。公开侧只登记
  聚合状态，不复制原生细节。

## P6 补充 2（2026-11-09，DRILL HOTD ENG_BEARING）

- 补齐 DRILL HOTD 9 个 PS 的 parts/per-part mass；converter 的 CAP_FACE 草图
  平面支持**对称拉伸端盖**（±depth/2，isStart 选端）：ENG_BEARING 的 Sketch 2
  建在对称 Extrude 1 端盖上。
- **ENG_BEARING 严格绿**：5 特征（sketch/symmetric extrude/sketch/remove/
  featureMirror），**2,590.224 vs 2,590.243 mm³（−0.001%）**，树/status/body/
  push+重开全绿；index strict `replicable-now` **13 → 14**。
- CONNECTING_ROD known-red：FULL_ROUND fillet 未映射（converter 仅 EDGE），
  spec test.fail；不冒充完成。
- 另修复 booleanBodies `tools/targets` 明文 `.opExtrude` 后缀解析（Multi Part
  Build 的 tool body 不再为空，但剩余 PROJECTED/cPlane Midplane 仍 blocked）。

## 本轮收口状态（2026-11-09）

- **已实现并有真栈证据**：P0 索引、P1 imprint、P2 selector/面面积证据、
  P4.1 CONCENTRIC、P4.2 快赢切片（端盖草图/压缩 imprint/boolean scope/
  symmetric 端盖）、P6 数据批（Intro/Element/DRILL）、P8 审计台账首切片。
- **严格绿**：14 个 PS（Wheel、Master Cylinder Piston、First Part、
  WARNING LABEL ×4、Drive Sleeve ×2、Intro Part 1/2、O-Ring、Bushing、
  ENG_BEARING）；索引 `verify-example-index` 0 errors / 5 warnings。
- **blocked（未实现，不得计绿）**：
  - P3 PROJECTED/PIERCE/INTERSECTED/SILHOUETTED：ADR-0009 切片 1b/2 的异步
    草图读路径架构；
  - P5 跨 body fillet：ADR-0015 多目标契约；
  - P7 draft/rib/shell/offsetSurface 等：产品后端/内核能力缺口；
  - Part 3/4 同面积面集、Part 5/6 单线 imprint face split：blocked-selector；
  - Bumper 12 边 fillet：blocked-kernel（native probe 已排入审计台账）；
  - regionRisk（Alignment/iOS）：blocked-evidence（需位置/拓扑证据）。
- 任务列表已按上述状态关闭：completed 包含“实现完成”与“blocked 证据收口”
  两种，后续只在证据/能力变化时重开对应切片。
