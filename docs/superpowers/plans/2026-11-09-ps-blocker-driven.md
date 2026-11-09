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
| 严格管道 `replicable-now`（几何/约束/UI/持久全绿） | **2**（Wheel、Master Cylinder Piston） |
| raw capability `replicable-now`（忽略 scenario 完整性） | 35 |

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
