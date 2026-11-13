# AIRR — 草图「同心」约束接通（toolbar live 补齐后的功能切片）

- 状态：Implemented（2026-11-13 工作树；前端工具 + 能力翻转；无契约/后端变更）
- 关联：`2026-11-13-toolbar-live-parity-airr.md`（live 约束飞菜单第 2 行「同心
  shift+o」此前是 gated 占位）；P0-04（先论证）、P0-05（updateSketch 唯一管道）、
  P0-06（facts=params）、P0-10（标准可撤销 updateSketch）。
- 复用：shared `SketchConstraintDto.kind='concentric'`（v1.25/ADR-0004 已冻结）、
  后端 `SketchWireNormalizer` + `SlvsSolver`（`SLVS_C_SYMMETRIC` 系同心用例
  早已有单测）、既有 `SketchAddConstraintTool` 槽位框架与就近实体分辨。

## 范围

- 新工具 `Sketch.Constraint.Concentric`（继承 `SketchAddConstraintTool`）：
  槽形 `circle + circle`（v1 就近分辨只解析 point/line/circle，arc 无独立
  解算体）；两圆周拾取后构建 `{kind:'concentric', id:nextConstraintId,
  refs:[circleA,circleB]}` → 一次 `applyUpdate(entities, constraints+new)`；
  满槽直接提交，后端拒收时清空拾取并保留工具，标准 undo 生效。
- 能力：`sketchConcentric` 由 gated 翻 **full**（点击直接激活工具；删除
  guidance 词条）。
- i18n（zh/en）：constraintKinds.concentric、prompts.concentricFirst/Second、
  reject.concentricNeedsCircle。
- 非目标：arc+arc、arc+circle 混合（待 arc 解算坐标/拾取解析）；不新增约束
  类型或 schema。

## 测试

- 单测：`SketchAddConstraintTool.test.ts` 槽形断言 `[['circle','circle']]`、
  `acceptPick`（两圆满槽；线/混搭拒收）、toolId、注册 10 工具幂等；能力集
  gated 52（同心移出）。
- web 全量：137 files / **1819 tests passed**。
- 真栈：`e2e/sketch-concentric.spec.ts` **2 passed**——RPC 建两圆草图
  `(0,0) r10 / (30,0) r10`，双击树进草图，约束飞菜单「同心」→ 点两圆周 →
  `getSketch.constraints=['concentric']`、两圆心坐标相等（≤1e-5）；完成草图后
  约束仍在。

## 风险 / 回滚

- 纯前端注册表/工具 + 能力位；回滚删除工具类、注册、i18n 与能力位即可，无
  数据迁移（旧载荷不含 concentric 不受影响）。
- 同心工具沿用 v1 单草图几何分辨（按圆周距离），不校验元素 id；与其它约束
  工具同口径。
