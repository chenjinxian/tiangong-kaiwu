# ADR-0022 — Sketch symmetric constraint + slot tool

- 状态：**Accepted（2026-11-19 Owner 批准 S1 对称约束 + S2 槽工具）**
- 日期：2026-11-19
- 关联：AIRR `docs/superpowers/specs/2026-11-19-sketch-entity-constraint-expansion-airr.md`；
  计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1–W2
- 影响仓：`luban-cad/packages/shared`（1.81.0 additive）、私有 `luban-backend`
  （SolverTypes/normalizer/SlvsSolver）、`luban-cad/apps/web`（约束工具/ribbon/i18n/e2e）
- 先例：ADR-0004（草图约束契约）、ADR-0020（shared additive bump）

## 1. 背景

Onshape 约束飞菜单有「对称」（shift+q）与「槽」工具；当前产品两者均 gated：
- `symmetric` 不在 `SketchConstraintDto.kind` 联合，后端无映射；
- 槽工具无 UI，但可用现有 line/arc/circle + 约束组合表达。

libslvs 已有 `SLVS_C_SYMMETRIC_LINE`，且本仓 `mirror` 约束已用它实现
点对/线对/弧对/样条对关于轴线对称。对称约束的求解语义与 mirror 相同，只是
用户入口/语义不同；无需新求解器原语。

## 2. 决策

### 2.1 S1 对称约束

1. **契约**：`SketchConstraintDto.kind` 增加 `"symmetric"`；refs 恰 3：
   `[实体A, 实体B, 轴线(line)]`，A/B 同型（point/line/arc/spline），与 mirror
   相同槽形；不携带 value。shared 版本 additive bump **1.81.0**；旧后端收到
   `symmetric` 必须明确拒收且零变更。
2. **后端**：`SolverTypes.ts` kind 联合/zod/槽位校验按 mirror 同口径；
   `SketchWireNormalizer` 按 mirror 同口径透传；`SlvsSolver` 的 `mirror` case
   扩展为 `case "mirror": case "symmetric":`，方程与归因完全复用
   `SLVS_C_SYMMETRIC_LINE`。
3. **UI**：新增 `SymmetricAddTool`（toolId `Sketch.Constraint.Symmetric`，
   icon `icon-constraint-symmetric`），槽形
   `point+point+line`、`line+line+line`、`arc+arc+line`、`spline+spline+line`；
   满槽直接 `updateSketch` 追加约束；拒收保持拾取状态。
   `sketchSymmetric` 能力 gated→full；ribbon 已有入口/快捷键 shift+q。
4. **证据**：shared 单测、backend solver/normalizer 单测、web 槽位单测、
   真栈 e2e（两 off-axis 点 + 固定轴线/首点 → 第二点反射落库；完成/重开）。

### 2.2 S2 槽工具（live 证据修正，2026-11-19）

- **live 入口**：槽不是独立顶栏按钮，而是「偏移」工具组下拉的第二项
  （`偏移 o` / `槽`）；tooltip = 「槽在连续草图图元周围创建槽。」
  （私有证据 `ui-evidence/slot-probe-20261119-*`）。
- **交互**：选择一条连续草图链（line/arc 相连），再以光标/宽度确定槽宽并
  提交；未观察到首击即弹对话框。该语义是**沿连续链生成槽轮廓**，不是
  早期假设的 center-to-center/overall 两点式。
- **决策**：S2 按「链式槽偏移」实现，不新增实体类型；工具一次
  `updateSketch` 写入 line/arc 链 + 槽轮廓，可撤销。必须先补齐
  live 交互证据（链选择、宽度预览/输入、确认、失败/取消、undo），否则
  `sketchSlot` 保持 gated，不得用近似两点槽冒充 full。
- 早期 center-to-center/overall 设计作废；AIRR §10 同步修正。

## 3. 数据/事务

- 事实源：草图 params（实体+约束）；求解结果派生。
- 写路径：`updateSketch` 单一 FeatureOp；满槽/工具确认一次提交；失败零变更。
- 撤销：一次事务；e2e 断言 undo/redo。
- 无 BIS schema/迁移；旧库无 symmetric 约束 = 不需要迁移。

## 4. 测试与验收

- shared：kind 联合、1.81.0、旧载荷兼容（无 symmetric 时不变）。
- backend：`SolverTypes` 接受 point+point+line；normalizer 透传；SlvsSolver
  在两 off-axis 点 + 固定轴线时反射；非法组合拒收。
- web：槽位纯逻辑（三槽、错型拒收）、工具注册/能力 full、i18n。
- 真栈：`sketch-symmetric.spec.ts` 两 off-axis 点 + 固定轴线/首点 → 第二点
  反射；完成草图/重开仍存在；撤销。
- S2：待 live 交互补齐后新增 `sketch-slot.spec.ts`：连续链选择、宽度预览/输入、
  提交后的实体/约束/面积、取消不落库、undo、冷重开。

## 5. 回滚

- 能力 flag：`sketchSymmetric`/`sketchSlot` 可回 gated；工具注册可移除。
- shared 版本回退需旧库数据只读处理；symmetric 数据不得静默丢弃。
- 后端未知 kind 拒收；normalizer/SlvsSolver 变更可回退。

## 6. 结论

S1 复用已有求解器路径，风险低；S2 组合现有实体，无内核/契约风险。两项
按本 ADR 实施，不涉及 ACIS/几何内核变更。
