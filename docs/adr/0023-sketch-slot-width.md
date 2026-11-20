# ADR-0023 — solver-neutral 槽宽约束 `slotWidth`（整圆槽 / 闭合环槽）

- 状态：**Accepted（2026-11-20 Owner 批准；实现已落地并通过真栈验收；
  同日 v1.84.0 增补：ring 中线扩展 line/arc、N≥2——见 §2.4）**
- 日期：2026-11-20
- 关联：ADR-0022 §2.5/§2.6（S2c/S2d blocked-design 证据与原型结论）、
  AIRR `docs/superpowers/specs/2026-11-20-slot-width-constraint-airr.md`、
  计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1
- 影响面：shared 契约（1.83.0）+ 私有后端求解器 + web 槽工具/尺寸标注与编辑

## 1. 背景

Onshape 槽工具对**闭合中线**只用**一个可见宽度尺寸**驱动两侧轮廓：

| 中线 | 轮廓（live DXF） | live 宽度标签 |
|---|---|---|
| 整圆 | 两条同心整圆 R±w/2，无端帽 | 线性宽度（非 Ø） |
| 闭合直线环 | 外侧法向偏移 + 顶点 r=w/2 圆角弧；内侧法向偏移 + 斜接；无端帽 | Ø |

既有 solver-neutral 原语（`offset` 仅 line/line、arc/arc；`distance` 单一
线对；`radius`/`diameter` 单圆）无法表达「一个尺寸同时约束两条边界且互为
算术 ±w/2 关系」。S2d 原型以逐侧 distance 拼装时求解后内环不受宽度驱动
（Ø20→30 只移动外侧，dof=4）——逐侧尺寸也违背 live 的单一尺寸语义。

## 2. 决策

新增 **`SketchConstraintDto.kind: "slotWidth"`**（shared 1.83.0，additive），
以显式 `slotMode` 区分两种语义：

```ts
interface SketchSlotWidthConstraint {
  kind: "slotWidth";
  id: number;
  refs: number[];
  /** 宽度（mm）；> 0。 */
  value: number;
  slotMode: "concentric" | "ring";
}
```

- `concentric`：`refs = [中线圈/弧, 内, 外]`（同型 circle/arc；source 半径须
  > w/2）；`value` = 两轮廓径向宽度。
- `ring`：`refs = [...N 条中线, ...N 条一侧边界, ...N 条另一侧边界]`，段序
  一一对应；`value` = 槽宽（= 2×每侧偏移）。v1.83 为 N≥3 全 line；**v1.84
  扩展为中线 line/arc、N≥2**（§2.4）。
- 旧后端收到未知 kind **必须明确拒收且零变更**；本实现无 schema/迁移。

### 2.1 后端方程（solver-neutral，libslvs 原语组合）

两种模式都**不引入第二组常量**，全部由 `value` 派生：

- **ring**（每侧 N 条边界，共 2N 条方程）：
  `SLVS_C_PARALLEL(boundary, source)` +
  `SLVS_C_PT_LINE_DISTANCE(boundary.p1, source, val = sign(初始有符号垂距)·value/2)`。
  初始几何按 ±w/2 生成，符号钉住内外侧，改宽度时两侧同步外移/内移。
- **concentric**（10 条内部方程）：
  - 2×`SLVS_C_POINTS_COINCIDENT`（内/外圆心 ↔ 中线圆心）；
  - 1 条隐藏水平径向线：source 圆心 → 圆上 +R 的隐藏点；
  - 3×`SLVS_C_PT_ON_CIRCLE`（该点在中线圆上、外/内隐藏点在各自圆上）；
  - 2×`SLVS_C_PT_LINE_DISTANCE(隐藏外/内点, 径向线, 0)`（共线）；
  - 2×`SLVS_C_PT_PT_DISTANCE(圆上点 ↔ 外/内点, value/2)`。
  即用「同角径向点对 + 点距」表达 libslvs 缺失的半径差方程；Jacobian
  在 R>w/2 时满秩（求解器 conformance 已验证）。

### 2.2 UI / 标注

- `Sketch.Slot` 在整圆/闭合环路径创建**一个** `slotWidth` 约束（不是两条
  radius 或逐侧 distance）；闭合直线环仅接受**凸、同向转向、无共线折点**
  的简单环，凹/自交/弧成员诚实拒收。
- 尺寸标注：环槽显示 `⌀w`（跨环带首段内外边界垂足），整圆槽显示线性 `w`
  （内/外圆 45° 对角点）；driven（参考）时用实测垂距/点距。
- 尺寸编辑：`slotWidth` 纳入 `EDITABLE_CONSTRAINT_KINDS`（双击标签 →
  数值编辑器 → `updateSketchConstraint` 改值 → 整体重解）；后端
  `precomputeSketchConstraint` 白名单扩 `slotWidth`。
- 槽工具预选只消费曲线：picker 框选会把点实体也标 `part=curve`，
  `_tryPreselection` 现在剔除 `kind="point"`（否则「4 线 + 4 角点」的框选
  会误判为非直线链而拒收）。

### 2.3 事务 / 撤销

- 工具提交一次 `updateSketch`（追加实体/约束）；宽度编辑一次
  `updateSketchConstraint` 事务；均走标准 FeatureOp + `BriefcaseTxns`，
  原生 undo/redo 已验证；失败零变更。

### 2.4 v1.84 增补：ring 弧中线（闭合 line+arc 混合环）

- **背景/证据**：2026-11-20 干净重探针（私有
  `SLOT-S2L-CLOSEDMIX-BRANCH-LIVE-20261120.md`）证明闭合 line+arc 环槽同样只
  有**一个 Ø 宽度**（`closed-mix3-slot.dxf`）：外侧弧 R+w/2、内侧弧 R−w/2、
  平行线 ±w/2、外角 r=w/2 圆角/内侧斜接、无端帽。详见 ADR-0022 §2.12。
- **契约**：`slotMode="ring"` 的 refs 数仍为 3N，但中线可为 line/arc（N≥2）；
  每条边界必须与对应中线**同型**（line+line 或 arc+arc）且位于环的同一侧。
  旧载荷（全 line、N≥3）行为不变；弧型 ring 会被旧后端按类型门拒收（零变更）。
- **方程**（逐源，solver-neutral）：
  - 线中线（不变）：`PARALLEL(boundary, source)` +
    `PT_LINE_DISTANCE(boundary.p1, source, sign·value/2)`（符号取初始垂距）。
  - 弧中线：两边界弧与中线圆心重合（2×`POINTS_COINCIDENT`）+ 与 concentric
    完全同构的**隐藏径向构造**：中线圆心→源圆上点构成径向线（`C_HORIZONTAL`），
    源圆上点/两边界圆上点各自 `PT_ON_CIRCLE`，两边界点 `PT_LINE_DISTANCE(0)`
    共线，`PT_PT_DISTANCE(源点 ↔ 外点, value/2)` 与内点同值——共 10 条内部
    方程，表达 libslvs 缺失的「同心半径差 = w/2」。
  - 内部方程计数守卫按源类型：线 4 / 弧 10；求解后 verify 对弧环校验
    「同心 + |Δr|=w/2 + 两侧异号」。
- **前端**：`slotWidth` ring 标注对弧边界取外弧角中点径向跨带（仍 `⌀`），
  下限放宽为 N≥2；闭合混合环构建器见 ADR-0022 §2.12。
- **验证**：后端 `SlotWidthSolver` **5/5**（R=40 夹具：w20→外 50/内 30、
  w30→外 55/内 25、角弧 r10→r15；边界/中线异型归一化拒收）；web
  `sketch-slot-mixed-ring-logic` **5/5**（live DXF 逐坐标）；真栈闭合混合环
  e2e **1 passed（43.6 s）**（标签 `⌀20`→双击 30 → 弧 55/25、角弧 r15、
  线 ±15 → reload）；全量 web **2684/2684**。

## 3. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|---|---|
| 两条/多条显式 radius/distance 尺寸 | 违背 live「一个可见宽度尺寸」；且无算术 ±w/2 链接，内环可自由漂移（S2d 实测 dof=4） |
| 静态/近似几何（改宽度只移动一侧） | 假参数化，P0-06/P0-10 禁止 |
| 仅前端联动、不改求解器 | params 是唯一事实源；冷重开/变量重解会丢失关系 |
| 引入第二套求解通道 | 违反单一求解路径；libslvs 原语组合已足够 |

## 4. 验证证据

- shared：契约/op DSL **326/326**（含 v1.83 ring/concentric JSON 往返）；
  引入时 `interfaceVersion = 1.83.0`，v1.84 扩展后 **327/327**
  （新增弧中线 ring 往返）且版本断言同步为 **1.84.0**。
- 私有后端：`SlotWidthSolver.test` **3/3**（ring 60×40 w20→30 两侧同步；
  concentric R30 w20→30 → 15/45）、`SketchSlotWidthUpdateFlow.test` **2/2**
  （真实 `insertSketch` + `updateSketchConstraint` 通道，解析后 body 级
  实体坐标/半径断言）、既有 slot 求解器套件 **9/9**、`tsc` 绿。
- web：`sketch-slot-logic.test` **20/20**（新增整圆 2 + 闭合环 5 用例）、
  `sketch-annotations.test` **32/32**（新增 ⌀/线性/ driven/拒绝 4 用例）、
  `sketch-dimension-value.test` 白名单更新；全量 web **2662/2662**、
  `tsc(src+e2e)`/eslint 绿（首轮唯一红为 ledger 版本未随 shared 1.83 同步，
  重生成后复跑全绿）；私有后端全量 **1164 passed / 1 expected fail /
  8 skipped**、tsc 绿。
- 真栈（MS 源码模式 + 真实 ribbon/画布）：
  `e2e/sketch-slot.spec.ts` 全 6 用例 **6 passed（5.8 min）**——
  单线/链/圆弧回归 + 整圆（RPC 建 R30 → 点圆 → 单 `slotWidth` → 标签
  `20`→双击改 `30` → 内/外 15/45 → 原生 undo/redo 20/40 ↔ 15/45 → reload）
  + 闭合环（4 线框选 → ring → 4 角弧 r10/内外边界 ±10 → 标签 `⌀20`→改
  `30` → 四组内外边界同步 ±15 → reload）。一次 MS 429
  `retry-after` 窗口按纪律等待后重试，未绕过限流。
- **S2o–S2r 增补（2026-11-20）**：`slotWidth` 纳入草图尺寸表达式白名单（长度类；
  后端 `evaluateConstraintExpressions` 物化 value 后求解，非正拒收、数值改值清除
  expression、updateVariables 联动；`SketchExpressionFlow` slotWidth 表达式
  **3/3**）。web 表达式尺寸标签按 live `state-183` 更正为 `ƒ ` + 求值（
  `显示表达式` 勾选；关闭无 ƒ），见 ADR-0020 D1/S2r。真栈
  `sketch-slot.spec.ts --grep 整圆槽宽度表达式` **1 passed（56.0 s）**：
  整圆槽宽 `5*2` → 10（内/中线/外 25/30/35）、标签 `ƒ 10` → 开关关闭 `10`
  → 勾选 `ƒ 10` → reload 持久。**S2u4 补采（2026-11-20，同批）**：`(5*2) mm`
  是数值上方的 canvas 表达式气泡（非编辑器闭合态）；已实现（viewer 气泡 +
  web `expressionText`），真栈表达式用例 **39.7 s** 含气泡开/关断言（见
  ADR-0020 S2u4）。

## 5. 已知边界 / 后续

- v1.84/S2p/S2q/S2u 后已支持：闭合 line+arc 混合环（弧中线 ring）、单毂分支链、
  宽缺口分支（绕毂弧）/多毂线树（ADR-0022 §2.13）、多连通分量共享单 Ø
  （弧+线、链+线；§2.14）、含圆弧的混合线树（单/多弧臂 + 弧-弧宽缺口；§2.15）。
  仍诚实拒收/不建模：自交环（live 接受并生成自交偏移轮廓；需一般平面偏移
  并集，产品返回 `unsupportedChain`，单测回归覆盖）、样条中线闭合环（live
  采到 = 两条闭合偏移样条；求解器无样条偏移 → **blocked-design**）、混合选择中
  含闭合环分量（slotWidth 宽度语义不能与直径约束合并）；能力账本
  `ui.sketchSlot` / `constraint.slotWidth` 维持 `partial`。
- `slotWidth` 表达式已接（S2r，长度类；见 §4）；**变量驱动 UI 真栈已覆盖**
  （e2e：变量 w=10 → 槽宽 `#w*2`（ƒ 20）→ 变量表改 15 → 宽度 30/半径 15/45 →
  重开 `ƒ 30` → reload；26.7 s）。
- **宽度预览交互（S2t 探针 2026-11-20；S2v 复测并实现）**：S2t 首轮因标签
  坐标偏差误判“无编辑器”；S2t3–S2t7 以 CSS 坐标复测确认——预览期双击宽度
  标签打开既有尺寸编辑器，改值/表达式（只取求值）立即更新预览，宽度会话内
  粘滞（设 30 → 下次预览 Ø30）；产品已实现（ADR-0022 §2.16，真栈 59.3 s）。
  预览期白色「−」仍无法确认为可拖拽手柄，拖拽/光标预览保持未建模。
- 回滚：`slotWidth` 为 additive kind；工具/能力 flag 可关闭；旧库无该
  kind 不需要迁移；失败路径保持原几何。
