# ADR-0006：Onshape 新特征类型与面/边选择（占位立项）

- 状态：提议/待立项（2026-11-04）
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`

## 背景

ADR-0004/0005 只覆盖草图契约与 extrude/revolve 的终止条件/布尔/方向。Batch 1
其余示例仍需要：

- `hole` 特征（Bench/Clamp）；
- `draft` 特征（Pallet/Clamp）；
- `rib`（Clamp）；
- feature/face pattern（Pallet）；
- 非世界平面 mirror（Pallet/Clamp）；
- `cPlane` / `assignVariable` 变量系统（Bench/SPINDLE）；
- face-extrude / imprint-face（Tutorial 2 iOS 的通用形态；当前用左环面域近似）；
- chamfer 边语义/UI 创建链（iOS/其他示例）；
- sheet metal、custom FeatureScript（明确不在 Batch 1）。

## 决策（暂定）

本 ADR 只登记范围和门禁，不做统一设计：

1. 每个能力必须单独 AIRR/ADR，明确数据事实源、特征参数、内核求值路径、UI 和回滚。
2. `assignVariable`/`cPlane` 必须先决定变量/基准面是否属于 FeatureOp 事实源；
   禁止前端本地表达式求值绕过 BIS/params。
3. face-extrude 只有在草图面域 adapter 无法等价时才实现；实现时必须走标准
   FeatureOp 和同一 BIS 数据源。
4. 所有新增 FeatureOp/字段必须版本化、旧库 fixture、双端同发布；不得以“复刻 demo”
   为由绕过 P0-04/P0-07。

## 后果

- Batch 1 的 Pallet/Clamp/Bench 完整复刻排在本 ADR 各子项之后；当前只能标记
  `blocked-capability`，不得宣称复刻完成。
