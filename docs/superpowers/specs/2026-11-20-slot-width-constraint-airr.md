# AIRR — solver-neutral slot width constraint (full circle + closed ring)

- 状态：**Proposed（待 Owner 批准；P0-04 门禁，批准前不写实现代码）**
- 日期：2026-11-20
- 关联：ADR-0022 §2.5/§2.6（S2c/S2d 的 blocked-design 证据）；计划
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

未批准前：`ui.sketchSlot` 保持 partial，整圆/闭合环保持 blocked-design，
工具继续诚实拒收。
