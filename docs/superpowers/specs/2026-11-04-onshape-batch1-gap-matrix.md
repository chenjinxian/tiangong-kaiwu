# Onshape Batch 1 能力/数据缺口矩阵（2026-11-04）

- 关联 AIRR：`docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`
- 关联 ADR：`docs/adr/0003-onshape-parity-scenario-contract.md`（场景/证据契约，已接受）
- 数据源：私有 `onshape-parity-data`（原始 features/parts/massproperties/UI 证据）
- 原则：本表只登记缺口和顺序，不批准任何 FeatureOp/schema 变更；新增能力必须先有
  ADR + shared 版本 bump + 双端同发布。

## 矩阵

| 示例 | Part Studio / 特征 | 今天可回放 | 共享契约缺口 | 数据缺口 | 下一步 |
|---|---|---|---|---|---|
| Tutorial 2 - Build a Part | 1 PS / 6 特征（sketch、extrude NEW/ADD×2、revolve ADD、fillet） | 全部（gold + strict e2e） | 无 | 无（gold 固定 fixture） | 本计划关闭 X-14 |
| Tutorial 2 - Build Your First Part - iOS | 1 PS / 4 特征（sketch、extrude NEW/ADD、chamfer） | **几何+约束全量回放已通过**（私有后端 `Tutorial2IosReplay.test.ts`）：sketch→5 面域（3 材料 + 2 孔）→ E1 三材料面域 25mm NEW → E2 左环 symmetric 50mm ADD（等价 imprint-face 反向拉 50mm）→ Chamfer 2mm 三 cap 边；草图 `ok/dof=0`（含 4 条 line+circle tangent、2 条 DIAMETER）；单 body、特征树 `sketch/extrude/extrude/chamfer`、终体积 **157.165 cm³**（目标 157.479，-0.20%，<0.5%） | **剩余缺口**：① imprint-face 用左环面域 + symmetric 50mm 近似（几何等价，非通用 face-extrude）；② Chamfer 边由 cap 面几何谓词选出（3 条），UI 创建链未覆盖 | parts 1 / 逐 body 157.479 cm³；scenario 已更新（constraint parity complete；仍标 blocked-capability 仅因 face-extrude/chamfer UI 语义） | 补 iOS 真栈 UI e2e；通用 face-extrude 转 ADR-0006 |
| Bench Vise SPINDLE | 1 PS / 9 特征（assignVariable、cPlane、sketch×2、revolve×2、mateConnector、myFeature、booleanBodies） | sketch/revolve ADD/booleanBodies 部分 | construction 标志（0004）、revolve NEW/REMOVE 已落地、cPlane/assignVariable/custom FeatureScript（0006）、额外约束（0004） | 已补：parts 2 / 逐 body 22.163 + 8.216 cm³ | ADR-0004/0005/0006 |
| Bench Vise WARNING LABEL | 1 PS / 7 特征（sketch×3、extrude×2、decal、mateConnector） | sketch/extrude NEW/ADD 部分 | construction、decal（非几何）、额外约束 | 已补：parts 1 / 逐 body 0.000819 cm³ | ADR-0004 |
| Onshape Quickstart SPINDLE | 1 PS / 9 特征（与 Bench SPINDLE 同构） | 同 Bench SPINDLE | 同 Bench SPINDLE | 已补：parts 2 / 逐 body 22.163 + 8.216 cm³；UI 只采到 1/4（代表 PS 待确认） | ADR-0004/0005 + UI 补采 |
| Part Feeding Machine Pallet | 1 PS / 25 特征（sketch×7、extrude×7、fillet×5、chamfer、linearPattern、mirror×3、draft×3、shell） | extrude NEW/ADD/REMOVE/INTERSECT + blind/throughAll 已落地（0005 Phase 1）；fillet/chamfer/shell 部分 | extrude upTo*/draft/第二方向（0005 后续）、draft 特征/feature-face pattern/非世界平面 mirror（0006）、construction/额外约束（0004） | 已补：parts 1 / 逐 body 437.106 cm³ | ADR-0004/0005/0006 |
| Exercise: Clamp Parts | 1 PS / 24 特征（extrude×11、sketch×6、fillet×4、rib、draft、mirror） | extrude REMOVE/INTERSECT + blind/throughAll 已落地；extrude NEW/ADD、fillet 部分 | extrude upTo*/draft/第二方向（0005 后续）；rib/draft/mirror（0006）；construction/额外约束（0004） | 已补：parts 3 / 逐 body 67.624 + 45.539 + 48.689 cm³；UI 1/2 | ADR-0004/0005/0006 + UI 补采 |
| Exercise: Clamp Handle | 1 PS / 11 特征（revolve×4、linearPattern、cPlane、hole、fillet、sketch×2） | revolve NEW/ADD/REMOVE 已落地、linearPattern（body 级） | hole/cPlane（0006）；construction（0004） | 已补：parts 3 / 逐 body 105.771 + 30.931 + 11.879 cm³；UI 0/1 | ADR-0004/0005/0006 |

特征清单来自 `onshape-parity-data` 的原始 `features.json`；计数含全部 sketch/非几何特征，
用于容量评估，不等同于需要建模的特征数。

## 契约批次

### ADR-0004（sketch contract）

范围：

- `SketchEntityDto` 增加 construction 标志（并贯通 `SolverTypes`、`SketchWireNormalizer`、
  `SketchRegions`：construction 曲线不参与面域）。
- `SketchConstraintDto` 增加 `diameter`、`angle`、`concentric`、`projected`、`mirror`、
  `pierce`，以及 centerline 实体/中心线尺寸；driven/reference 尺寸标志。
- 前端草图工具/标注 UI 与 Onshape 对齐；`diameter` 与 `radius` 只能有一个事实源。

门禁：`SketchEntityDto`/`SketchConstraintDto` 是 shared RPC 面；必须 bump shared minor、
双端同发布、更新 `SolverTypes.ts` 冻结清单，并跑双跑求解器语料（arc/spline/offset/
tangent/conflicting/underconstrained + 新约束样例）。旧草图 fixture 必须可读/可迁移。

**第一切片已落地（2026-11-04，shared 1.23.0）**：construction 标志（DTO→求解器→
面域过滤→前端 construction 切换/虚线显示）、`diameter`（圆默认直径 + ⌀ 标注）、
`concentric`、`driven`（不送求解器）、line+整圆 tangent（端点共圆语义，内部 1 条
半径线⟂line，DOF 净 −1；前端约束槽位接受 circle+line）、前端 coincident 接受
point+circle；point+circle coincident 求解已在 1.22.0 前落地。iOS 回放已全量约束
dof=0；真栈 `tutorial2-tools` 新增圆直径+共圆相切 UI 链用例。
**第二切片（v1.25）**：`angle`（两线夹角，弧度；libslvs 度槽位换算）backend/contract
落地；UI 无 live 证据，暂不新增控件。
仍待：angle UI、projected/pierce/mirror、driven UI、iOS UI e2e。

### ADR-0005（extrude/revolve contract）

范围：

- `ExtrudeParams`：`endBound`（BLIND/THROUGH_ALL/UP_TO_NEXT/UP_TO_SURFACE/UP_TO_VERTEX）、
  `operation` 增加 REMOVE/INTERSECT、persisted direction/start offset/draft、second direction。
- `RevolveParams`：NEW/REMOVE（均已落地；NEW=独立新体）。
- 不包含 face-extrude / imprint-face；iOS 的 Extrude 2 先用草图面域 adapter，
  失败则登记 `blocked-capability` 并转 ADR-0006。

**Phase 1 已落地（2026-11-04，shared 1.22.0）**：extrude blind/throughAll、direction、
startOffsetMm、operation remove/intersect；UI 移除/相交页签启用、方向/起始偏移进真实
params。**Phase 2（v1.23/v1.24）**：revolve new 已落地（独立新体；UI 新建页签启用）；
extrude `secondDirection` 已落地（backend/contract only，UI 证据待补）。
仍待：upToNext/upToSurface/upToVertex、draft、face-extrude、第二方向 UI。

门禁：每次新增/变更 FeatureOp 字段都必须版本化、旧库 fixture、回滚路径；不得用
“复刻 demo”绕过标准管道。

### ADR-0006（new feature types，后续）

范围：`hole`、`draft` 特征、`rib`、feature/face pattern、非世界平面 `mirror`、
`cPlane`、`assignVariable`/变量系统、face-extrude/imprint-face、chamfer 边语义。
这些能力需要各自的几何/变量系统设计，不与 0005 同批；按示例逐个立项。

**切片 A 已落地（2026-11-05，shared 1.26.0，backend/contract only）**：`hole` 简单平底孔
（草图 point 位置、blind/throughAll、方向、pointIds；螺纹/沉头/up-to-entity 拒收）。
`HoleFlow` 3/3；UI 对话框需 live 证据后补。

### 不在本批次

- sheet metal、assembly mate、drawing、custom FeatureScript（logoMaker/thread/myFeature）。
- 这些示例的对应 Part Studio 可以登记为 `blocked-capability`，不进入 Batch 1 绿门。

## 已复刻示例（geometry replay）

- **Exercise: Basic Drawing**（Onshape Training Repo，doc `58d05174…` / PS `4a289bd0…`）：
  数据驱动场景（`tools/scenario/from-onshape-v2.mjs`）——Right 平面 sketch（20 线，含
  construction centerline 与镜像几何）→ 全周 revolve NEW。后端
  `BasicDrawingReplay.test.ts`：单 body、特征树 `sketch/revolve`，体积
  **2442.2935 cm³**（Onshape 2442.2938，-0.00%）。场景保留 MIRROR /
  CENTERLINE_DIMENSION / 单点 HORIZONTAL / point+line COINCIDENT 为未映射缺口，
  不宣称约束树完整。

## 数据批次

2026-11-04 已完成：Batch 1 的 parts + 逐 body 质量属性（Bench 4 PS、Quickstart 4 PS、
Part Feeding 13 PS、Clamp 2 PS、Tutorial 2 iOS 1 PS）均已入私有数据仓并推送。

剩余顺序：

1. `tools/collect.mjs --features-only --reserve 200 --sort copies`：补齐剩余特征树。
2. `tools/collect.mjs --parts-only --reserve 100`：补其余特征文档的 parts；再跑
   `tools/mass-by-part.mjs`。
3. `tools/browse-collect.mjs`：补 Quickstart SPINDLE、Clamp Handle 的 UI 证据。

没有逐 body 数据或 UI 证据的示例只能标记 `blocked-evidence`；不得用聚合体积冒充单
body，也不得用截图伪造几何结果。

## 与 Batch 1 验收的关系

- Tutorial 2：本计划完成后必须 1/1 真栈绿。
- Tutorial 2 iOS：几何+约束回放已通过；完整 UI parity 前不宣称“完整复刻”。
  chamfer UI 创建链与通用 face-extrude 仍标记为能力缺口。
- Bench/Quickstart/Pallet/Clamp：ADR-0004/0005 落地并按数据批次补齐后，逐个升级为
  完整特征链 e2e；在此之前只做只读覆盖矩阵和场景草案，不做“部分绿”宣称。
