# ADR-0023 — solver-neutral 槽宽约束 `slotWidth`（整圆槽 / 闭合环槽）

- 状态：**Accepted（2026-11-20 Owner 批准；实现已落地并通过真栈验收）**
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
- `ring`：`refs = [...N 条中线(line), ...N 条外边界, ...N 条内边界]`，N≥3、
  段序一一对应；`value` = 槽宽（= 2×每侧偏移）。
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

## 3. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|---|---|
| 两条/多条显式 radius/distance 尺寸 | 违背 live「一个可见宽度尺寸」；且无算术 ±w/2 链接，内环可自由漂移（S2d 实测 dof=4） |
| 静态/近似几何（改宽度只移动一侧） | 假参数化，P0-06/P0-10 禁止 |
| 仅前端联动、不改求解器 | params 是唯一事实源；冷重开/变量重解会丢失关系 |
| 引入第二套求解通道 | 违反单一求解路径；libslvs 原语组合已足够 |

## 4. 验证证据

- shared：契约/op DSL **326/326**（含 v1.83 ring/concentric JSON 往返）；
  `interfaceVersion = 1.83.0`。
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

## 5. 已知边界 / 后续

- 弧/样条参与的闭合链、凹/自交环、分支链、多条独立曲线联动等宽槽仍
  诚实拒收（缺 live 证据/语义）；能力账本 `ui.sketchSlot` 维持 `partial`。
- `slotWidth` 表达式/变量驱动未接（live 未采）；宽度拖拽/放置交互未采。
- 回滚：`slotWidth` 为 additive kind；工具/能力 flag 可关闭；旧库无该
  kind 不需要迁移；失败路径保持原几何。
