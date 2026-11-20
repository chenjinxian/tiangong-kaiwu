# AIRR — solver-neutral slot width constraint (full circle + closed ring)

- 状态：**Accepted（2026-11-20 Owner 批准；实现已落地，见 §7 与 ADR-0023）**
- 日期：2026-11-20
- 关联：ADR-0022 §2.5/§2.6（S2c/S2d 的 blocked-design 证据）、
  **ADR-0023（本 AIRR 的正式决策记录与实现结果）**；计划
  `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1
- 触发：`docs/parity/capability-overrides.json` 的 `ui.sketchSlot` 两个
  blocked 子域：整圆中线槽、闭合直线环槽

## 1. 问题

live 槽工具对两种闭合中线使用**单个宽度尺寸**驱动两侧轮廓：

| 中线 | 轮廓 | 宽度标签 | 现有原语为何不够 |
|---|---|---|---|
| 整圆 | 两同心圆 R±w/2，无帽 | 线性 w | `offset` 仅 line/line、arc/arc，无同心圆径向差原语 |
| 闭合直线环 | 外侧法向偏移 + 顶点圆角弧，内侧法向偏移 + 斜接，无帽 | Ø w | 无端帽 → 内环只与中线平行、彼此斜接；法向距离自由 |

S2d 原型（未发布、已回退）用现有一组约束生成与 live DXF 同构的 16 实体/40
约束，但求解后 Ø20→30 只移动外边界/角弧，内边界停在 10，status=
underconstrained（dof=4）。逐侧 `distance`/`offset` 补内环会引入 live 不存在
的额外尺寸，且数值无法与 Ø 保持单一驱动关系（无算术链接）。

## 2. 目标 / 非目标

**目标**
- 一个用户可见宽度值（`value`）同时驱动**整圆**两同心圆与**闭合环**内外边界；
- solver-neutral：后端方程可审计，不隐藏第二组常量；
- 契约 additive、旧载荷/旧库兼容；UI 标签按 live（圆弧/环 Ø，整圆线性 w）。

**非目标**
- 圆弧参与的闭合链、凹多边形/自交闭合链、分支链、独立多曲线联动槽、宽度
  光标拖拽（各自仍需 live 证据）；
- 用静态近似/两套独立尺寸冒充 full；
- 引入第二套草图/求解路径。

## 3. 方案

### 3.1 契约（shared，additive）

新增 `SketchConstraintDto.kind: "slotWidth"`，并新增可选字段：

```ts
interface SketchSlotWidthConstraint {
  kind: "slotWidth";
  id: number;
  /** 源中线 + 边界实体，顺序见下文。 */
  refs: number[];
  /** 宽度（mm）；>0。 */
  value: number;
  /** 显式模式，避免按长度猜。 */
  slotMode: "concentric" | "ring";
}
```

- `slotMode: "concentric"`：`refs = [sourceCircle, innerCircle, outerCircle]`
  （三者 circle/arc 同型；source 为中线圈）。
- `slotMode: "ring"`：`refs = [...sourceLines(N), ...outerLines(N),
  ...innerLines(N)]`，N≥3，按环顺序一一对应；source 必须构成闭合直线环，
  boundary 与 source 的段序一致。
- `value` 语义：两轮廓之间的宽度（= 2×每侧偏移）。
- 版本：shared `interfaceVersion` additive bump（当前 1.82.0 → 1.83.0），
  旧后端收到 `slotWidth` 必须**明确拒收且零变更**（不得静默忽略）。
- 需要 ADR-0023（新契约 + 求解器原语 + 维度/标签语义）获批后实施。

### 3.2 后端求解（solver-neutral）

- 校验：模式/长度/实体类型/环连通与顺序/边界同型/宽度域；失败零变更。
- **ring**：展开为每侧 N 条有符号点到线距离方程（`SLVS_C_PT_LINE_DISTANCE`
  已存在），距离 = value/2；保留现有 coincident/parallel/tangent 拓扑。
  这是现有原语的组合，风险低。
- **concentric**：需要「半径差 = value/2」方程。libslvs 没有直接
  radius-difference 原语；候选实现：
  1. 用隐藏的**径向点对**（outer/inner 圆上同角度两点）+ 中心共线 +
     点距 = value 表达（需验证 Jacobian 满秩/收敛）；
  2. 在 solver-neutral 层加入一个内部方程抽象（libslvs API 之外的求解器
     适配器），并对拍现有方程；
  3. 若 1/2 均不可行 → `concentric` 子域保持 blocked，仅落 `ring`。
- 先做 **solver spike/ctest**：Ø20/30/50、不同圆心、不同扫角；失败回滚、
  确定性与 DOF 检查；未通过不进入产品。

### 3.3 UI

- 槽工具（`Sketch.Slot`）在整圆/闭合环路径创建**一个** `slotWidth` 约束，
  而不是两条 radius/diameter 或逐侧距离；
- 尺寸标签/编辑器编辑 `value`：圆弧/环显示 `Ø`，整圆显示线性宽度（live
  2026-11-20 实测）；
- 工具仍只接受 live 采证过的几何：直线/开放圆弧/开放直线链（已 full 切片）
  + 本 AIRR 解锁的整圆/闭合直线环；其余拒收。
- 事务：一次 `updateSketch`，可撤销；失败零变更。

## 4. 测试与验收

- shared：kind/字段校验、版本 bump、旧载荷兼容、op DSL。
- backend：`SlotWidthFlow`（concentric/ring 两模式、Ø20/30、失败矩阵、
  updateSketch 重解、冷重建）；求解器 conformance（方程/DOF/残差）；
- web：纯逻辑草稿（整圆 3 实体/1 约束；环 4n 实体 + 1 slotWidth）、工具
  撤销/错误态、能力状态；
- 真栈 e2e：整圆槽与闭合环槽（源 DXF 同构；Ø 改值同时移动两侧；finish+
  reload；undo/redo）；受影响示例批；
- 证据：私有 live DXF 已在 `slot-variants-20261120/`；公共仅脱敏结论。

## 5. 风险 / 回滚

| 风险 | 缓解 |
|---|---|
| libslvs 无半径差方程 | 先 spike；不可行则 concentric 保持 blocked，只落 ring |
| 契约复杂度/顺序歧义 | `slotMode` 显式 + N 由长度推导 + 强校验；生成器输出固定顺序 |
| 旧后端误读新 kind | version bump + 明确拒收 + 零变更测试 |
| 尺寸标签语义混淆 | UI 按模式/几何显示 Ø 或线性宽度；e2e 钉文案 |
| 闭环凹/自交 | 本 AIRR 只承诺凸、简单闭合直线环；其余显式拒收 |

回滚：`slotWidth` 为 additive kind；工具/能力 flag 可关闭；旧库无该 kind
不需迁移；失败路径保持原几何。

## 6. 决策请求

批准本 AIRR + 另立 ADR-0023 后，按以下顺序实施：
1. solver spike（concentric 半径差方程；ring 距离方程组合）；
2. shared 契约 1.83.0 + 双端校验；
3. 后端 evaluator/flow + 单测；
4. web 草稿/工具/尺寸/能力；
5. 真栈整圆/环 e2e + 回归。

**裁决**：2026-11-20 Owner 批准按上述顺序全量实施（ADR-0023 Accepted）。

## 7. 实现结果（2026-11-20）

- **solver**：concentric 方案 1（径向隐藏点对 + 点距 = value/2）与 ring
  （2N 条 parallel + 有符号垂距 = ±value/2）均通过；`SlotWidthSolver.test`
  **3/3**（ring w20→30、concentric R30 w20→30 → 15/45），slot 求解器全套
  **9/9**。
- **契约**：shared **1.83.0**（`kind+"slotWidth"`、`slotMode`），shared
  **326/326**；私有后端 schema/normalizer/solver + `updateSketchConstraint`
  白名单；`SketchSlotWidthUpdateFlow.test` **2/2**（真实 service 通道）。
- **web**：`buildCircleSlotDraft`（3 实体/1 slotWidth·concentric）、
  `buildClosedRingSlotDraft`（n 角心 + 2n 边界 + n 角弧/1 slotWidth·ring；
  凸环校验/内环退化拒收）、`orderLineChain` 闭环；工具接受整圆/闭合链并
  在预选中剔除点实体；尺寸标注/编辑器支持 `slotWidth`（环 Ø、整圆线性）。
  `sketch-slot-logic` **20/20**、`sketch-annotations` **32/32**、tsc/lint 绿。
- **真栈**：`sketch-slot.spec.ts` **6 passed（5.8 min）**——新增整圆与
  闭合环用例（尺寸标签双击改宽两侧同步、undo/redo、finish+reload），既有
  单线/链/圆弧回归绿；429 窗口按 retry-after 等待（未绕过）。
- **红线**：无 BIS schema/迁移；一次 `updateSketch`/`updateSketchConstraint`
  事务；旧后端遇未知 kind 拒收零变更；能力账本 `ui.sketchSlot` 仍 partial
  （弧链/分支/凹环/联动/拖拽未覆盖）。

## 8. 增补（2026-11-20 v1.84.0）：ring 弧中线（闭合 line+arc 混合环）

- **触发**：干净重探针（私有 `SLOT-S2L-CLOSEDMIX-BRANCH-LIVE-20261120.md`）证明
  闭合 line+arc 环槽同样**只有一个 Ø 宽度**驱动两侧（`closed-mix3-slot.dxf`：
  外弧 R+w/2、内弧 R−w/2、平行线 ±w/2、外角 r=w/2、内斜接、无端帽）。
- **契约**：仍为 `slotWidth` + `slotMode="ring"`，无新字段/无新 kind；refs 数
  仍 3N，但中线可为 **line/arc** 且 **N≥2**；每条边界须与对应中线同型、同一侧。
  旧载荷（全 line、N≥3）不变。shared bump **1.84.0**；旧后端对弧型 ring 按
  类型门拒收且零变更。
- **方程**：线中线沿用 parallel + 有符号垂距 ±w/2；弧中线 = 同心（2 圆心重合）
  + 与 concentric 同构的隐藏径向构造（横线/源圆上点/两边界圆上点/点在线×2/
  点距=w/2），共 10 条内部方程；内部计数守卫按源类型（线 4 / 弧 10），求解后
  verify 按「同心 + |Δr|=w/2 + 两侧异号」。
- **前端**：闭合混合链解析（端点两两焊接单环；弧按 authored 方向，试两环向）
  与构建（逐段两侧偏移、逐接缝外角弧/内交点裁剪、单 slotWidth ring）；ring
  标注弧边界取外弧角中点径向跨带（`⌀`）；N≥2。
- **验收**：shared **327/327**；后端 `SlotWidthSolver` **5/5**（新增弧环
  20→30 与类型门拒收）、全量 **1166 passed / 1 expected fail / 8 skipped**；
  web `sketch-slot-mixed-ring-logic` **5/5**、全量 **2684/2684**；真栈闭合
  line+arc 环 e2e **1 passed（43.6 s，标签双击 20→30 + reload）**。
- **红线不变**：一次 FeatureOp 事务、可撤销、失败零变更、旧载荷兼容；
  能力账本仍 partial（自交环/样条中线环/弧分支/缺口 ≥180° 分支/拖拽/表达式未覆盖）。

## 9. 增补（2026-11-20 S2p/S2q/S2r）

- **S2p 线树槽 / S2q 多连通分量**（ADR-0022 §2.13/§2.14）：宽缺口分支改为绕毂
  r=w/2 圆弧（扫角=180°−最小臂锥角）、多毂树逐节点斜接/毂弧；弧+线独立与链+
  独立线各分量独立槽、共享单 Ø（跨分量 equal）。私有证据
  `SLOT-S2O-TREE-COMPONENTS-LIVE-20261120.md`；真栈 S2p 52.4 s、S2q 56.3 s。
- **S2r 表达式**：`slotWidth` 纳入草图尺寸表达式白名单（长度类，物化 value 后
  求解；数值改值清除 expression；updateVariables 联动）；表达式标签按 live
  `state-183` 改为 `ƒ ` + 求值（见 ADR-0020 D1）。后端全量 **1169 passed /
  1 expected fail / 8 skipped**（118 files；新增 3 例）；真栈槽宽表达式 e2e
  56.0 s、变量驱动槽宽 e2e **26.7 s**（变量表 UI 改 w 10→15 → 宽 20→30、
  标签 `ƒ 20`→`ƒ 30`、reopen+reload）。
- **残项更新**：缺口 ≥180° 分支/多毂树/混合部分连通/表达式已收口；仍剩弧
  参与的分支、自交环（未建模）、样条中线环、宽度预览/拖拽（S2t 探针证据不足）、
  编辑框 `(expr) mm` 闭合显示。
