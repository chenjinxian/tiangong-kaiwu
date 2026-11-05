# AIRR：chamfer UI 创建链（能力补齐 Slice 1）

- 日期：2026-11-05
- Owner：用户（2026-11-05 确认继续补齐所有缺失草图/特征功能；本片按该授权执行）
- 关联需求：`2026-11-05-sketch-feature-capability-backlog.md` Slice 1；Tutorial 2 iOS、Hand Brake 的倒角 UI
- 预计影响仓：apps/web（FeatureDialog/Ribbon/测试）；shared/后端无契约变更
- 是否需要 ADR：**否**。`ChamferParams` 与后端求值已存在并已发布；本片只接通产品 UI。

---

## 1. 目标与验收

- 用户问题：后端/FeatureOp 已支持 chamfer，但 FeatureDialog 的 chamfer 通道被 gated
  （无边拾取/无 owner/target），用户只能用 RPC 建倒角。
- 验收：
  1. 点击 ribbon「倒角」打开 FeatureDialog；可添加边（复用 fillet 的视口边拾取）；
  2. 输入「倒角距离」（首版 equal distance：mode=2，values1=values2=d）；
  3. ✓ 经 `insertFeature{featureType:'chamfer'}` 提交；特征树出现 chamfer，
     undo/redo 可撤销，重开 iModel 后仍在；
  4. iOS/Hand Brake 的倒角步骤可改为真实 UI（不再依赖硬编码 RPC 边集）；
  5. 无选中边/距离≤0/无实体时诚实禁用或拒收，不产生 status=1 死特征；
  6. 11 个现有 iModel 与全部 web 单测保持绿。
- 非目标：two-distance / distance-angle 模式、面倒角、chamfer 预览（首版可无 ghost）、
  非等距模式、任意面/基准面引用。

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 结论 |
|---|---|---|---|
| itwinjs-core | 内核 Chamfer=25、边子实体 | `SolidModelingCommand`、editor `EditBuiltInIpc` | 复用 |
| luban-cad/packages/editor | 边拾取 | `FilletEdgePickTool` / `EditorBuiltInIpc` | 复用 |
| luban-cad/packages/viewer | 边拾取/高亮 | `OnshapeSelectTool`、选择权威 | 复用 |
| luban-cad/packages/shared | `ChamferParams` | `mode/values1/values2/edges/propagateSmooth` | 复用，不改 |
| luban-backend/modeling-server | chamfer 求值 | `evaluateChamferAsync`（已发布） | 复用，不改 |
| 其它 | — | — | 不适用 |

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 边拾取/高亮 | fillet 通道 `filletPicks` + FilletEdgePickTool | 完整 | 复用 | 同一持久边 id/owner 语义 |
| 目标实体推导 | fillet 的 owner 自动 target | 完整 | 复用 | 倒角与圆角同为依附边特征 |
| 表单/提交 | FeatureDialog 单对话框 + applyOp | 完整 | 扩展 | 不新建对话框 |
| 参数 | `ChamferParams`（mode=2 等距） | 后端已支持 | 复用 | 无契约变更 |
| 预览 | fillet previewOp | 部分 | 首版不接 | 避免为 preview 扩求值面；提交仍走真实内核 |

**规则**：不新增 RPC、不新增第二套边选择、不改 shared 版本。

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 无 | 无 | 无 | FeatureDialog 单测 + 真栈 e2e | 同批 |
| shared | 无 | 无 | 无 | 回归 | 不需要 |
| viewer/editor | 无 | 无 | 无 | 选择/边拾取回归 | 不需要 |
| modeling-server | 无 | 无 | 无 | 既有 chamfer 测试 | 不需要 |

## 5. 数据/事务/安全

- 事实源：`params.edges`（持久拓扑 id）+ mode/values；不新增数据形态。
- 事务：FeatureOp → BriefcaseTxns/saveChanges；可撤销。
- 租约/权限：沿用 applyOp 门禁；无新路径。
- 失败：边失效/无实体/参数非法 → 就地错误，不静默。

## 6. 性能与渲染

- 不做实时 ghost（首版）；边拾取高亮复用现有装饰，无新增渲染管线。
- 边拾取/提交延迟沿用 fillet 通道基线。

## 7. 测试证据

- 单元：FeatureDialog chamfer 通道渲染、距离校验、空边禁用、提交载荷
  `{mode:2, propagateSmooth:true, edges, values1:d, values2:d}`；编辑回显。
- 真栈：Hand Brake / iOS 的倒角步骤改为 UI 后，体积与现有 RPC 结果一致；
  undo/redo + 重开；无实体/无边负路径。
- 回归：11 个 iModel 重开回归；web 全量 vitest；e2e typecheck/lint。

## 8. 回滚与发布

- 回滚：移除 chamfer ribbon handler/通道渲染；后端/RPC 路径不受影响。
- 无数据迁移；已落库 chamfer 特征可被旧 UI 只读/编辑？本片保证 params 形状不变。
- 发布门：web 与现有后端同批；无需 shared bump。

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：否（不新增例外）
- ADR：不需要
- Owner 签字：用户 2026-11-05 已确认继续补齐（本片为 Slice 1）
- 结论：**批准执行**

## 10. 实施与验证记录（2026-11-05）

- 代码：`FeatureDialog` 新增 `chamferChannel`/`edgePickChannel`，复用 fillet 边拾取、
  owner/target 推导与就绪门；载荷 `{mode:2, propagateSmooth, edges, values1:d, values2:d}`；
  距离/空边/未结束拾取诚实禁用；ribbon「倒角」改道 `new/chamfer` 对话框。
- 单测：FeatureDialog 132/132；web 全量 1341/1341（含 ribbon 改道断言更新）；
  e2e `tsc -p tsconfig.e2e.json` 与 lint 绿。（Slice 1b 后 FeatureDialog 135、
  web 1344/1344。）
- 真栈 1（Hand Brake）：视口拾取左端圆边 1 条 + equal distance 1 mm，
  体积 7125.270 mm³（目标 7125.2741608，−0.00006%）；重开 11/11 回归绿。
- 真栈 2（Tutorial 2 iOS）：按 Onshape 采集的 CAP_EDGE 语义拾取 3 条边
  （Extrude 2 端盖 r25/r10 + Extrude 1 端盖 r10，+y/−y 端盖分别取景），
  equal distance 2 mm，体积 **157478.900 mm³ = Onshape 目标**（0.00%）；
  旧 RPC 硬编码边集结果 157164.8（−0.20%）已废止。
- 真栈 3（Sample Assignment / Alignment Plate）：底板 4 条竖边拾取 +
  equal distance 1.524 mm（当时等价近似；Slice 1b 后改为距离-角度
  1.524 mm/45° 精确建出），体积 **8915.860 mm³**（目标 8915.8599，0.00%）。
- 事务：在 iOS 持久库上新建第二条倒角后 undo → 树 5→4、redo → 4→5，均绿；不推送。
- 已知边界：首版仅 equal distance；无 chamfer 实时 ghost（提交走真实内核）。
  后续 Slice 1b 已接双距离/距离-角度（见 `2026-11-05-chamfer-modes-airr.md`）；
  面倒角仍未接。
