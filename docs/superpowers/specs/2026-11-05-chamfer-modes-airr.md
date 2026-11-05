# AIRR：倒角模式扩展（双距离 / 距离-角度，Slice 1b）

- 日期：2026-11-05
- Owner：用户（2026-11-05「按照建议继续」；承接 `2026-11-05-chamfer-ui-airr.md` 首版 equal distance）
- 关联需求：`2026-11-05-sketch-feature-capability-backlog.md` Slice 1；Onshape `TWO_OFFSETS` /
  `OFFSET_ANGLE` 倒角（Sample Assignment 等）
- 预计影响仓：apps/web（FeatureDialog/测试）；shared/后端无契约变更
- 是否需要 ADR：**否**。`ChamferParams.mode/values1/values2` 与后端内核求值已存在；
  本片只把已有模式接到产品 UI。

---

## 1. 目标与验收

- 用户问题：首版 UI 只有 equal distance（mode=2），Onshape 采集的 `TWO_OFFSETS` /
  `OFFSET_ANGLE` 倒角无法在 UI 中建出，只能近似为等距。
- 验收：
  1. 倒角类型可选「等距」「双距离」「距离-角度」；
  2. 双距离载荷 `{mode:2, values1:d1, values2:d2}`；距离-角度载荷
     `{mode:3, values1:d, values2:angleRad}`（内核 DistanceAngle 语义）；
  3. 编辑既有倒角回显模式与数值（首版 edit 只读回 `radius`，倒角会错误显示默认 5）；
  4. 输入非法/空边/拾取未结束时诚实禁用；不产生 status=1 死特征；
  5. 至少一个真实示例用距离-角度模式建出并对拍体积；现有 12 个 iModel 与 web 单测保持绿。
- 非目标：模式 0 Ranges / 1 Length；逐边数组 values；面倒角；倒角实时 ghost。

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 结论 |
|---|---|---|---|
| luban-cad/packages/shared | `ChamferParams` | mode/values1/values2 已发布 | 复用，不改 |
| luban-backend/modeling-server | chamfer 求值 | `evaluateChamferAsync` 支持 mode 0..4 | 复用，不改 |
| itwinjs-core/editor | 内核 ChamferMode | `EditorBuiltInIpc` 枚举 | 复用 |
| apps/web | 边拾取/表单/提交 | 首版 chamfer 通道 | 扩展 |

**规则**：不新增 RPC、不新增第二套边选择、不改 shared 版本。

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 边拾取/高亮 | Slice 1 `edgePickChannel` | 完整 | 复用 | 与 fillet 同通道 |
| 参数表单 | FeatureDialog 单对话框 | 完整 | 扩展 | 增加类型选择与条件输入 |
| 载荷 | `ChamferParams` | 完整 | 复用 | mode/values1/values2 |
| 编辑回显 | `editParams` | 部分 | 修复 | 倒角 values 映射到表单 |

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 无 | 无 | 无 | FeatureDialog 单测 + 真栈 | 同批 |
| shared | 无 | 无 | 无 | 回归 | 不需要 |
| backend | 无 | 无 | 无 | 既有 chamfer 模式测试 | 不需要 |

## 5. 数据/事务/安全

- 事实源：`params.mode/values1/values2/edges`；不新增数据形态。
- 事务与租约沿用 FeatureOp；可撤销。
- 失败：角度/距离非法、边失效、无实体 → 就地错误，不静默。

## 6. 测试证据

- 单元：三种模式的载荷、校验、编辑回显；空边/拾取中禁用。
- 真栈：距离-角度模式在真实示例上建出，体积与 Onshape 目标对拍；undo/redo 与重开沿用
  Slice 1 证据。
- 回归：12 个 iModel 重开；web 全量 vitest；e2e tsc/lint。

## 7. 回滚

- 回滚：删除类型选择与条件输入，恢复单距离（mode=2 等距）路径；已落库 mode=3/4
  参数不被旧 UI 编辑时改写（编辑入口需保留只读回显或隐藏该特征编辑）。

## 8. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：否
- ADR：不需要
- Owner 签字：用户 2026-11-05「按照建议继续」
- 结论：**批准执行**

## 9. 实施与验证记录（2026-11-05）

- 代码：FeatureDialog 增加「倒角类型」选择（等距/双距离/距离-角度）；
  双距离 `mode=2`，距离-角度 `mode=3`（角度度制 → 载荷弧度）；
  编辑态从 `values1/values2/mode` 回显（修复旧版 chamfer 编辑显示默认 5 的问题）。
- 单测：FeatureDialog **135/135**（新增双距离、距离-角度、编辑回显 3 项）；
  web 全量 **1344/1344**；e2e tsc 与 lint 绿。
- 真栈：Sample Assignment 四竖边以「距离-角度 1.524 mm / 45°」建出，
  体积 **8915.860 mm³**（目标 8915.8599，0.00%）；推送后重开验证；
  12/12 iModel 重开回归。
- 演示：`demo-artifacts/examples/sample-assignment/011-chamfer-dialog.png`
  显示类型选择与两个输入；页面/manifest 已改为精确 OFFSET_ANGLE 描述。
- **Live UI 证据（2026-11-05）**：用户指引“打开示例并创建副本”后，通过
  Onshape UI 创建可编辑公开副本 `Sample Assignment UI Evidence`，打开
  Chamfer 1 实测：
  - 类型选项：**等距离 / 两个距离 / 距离和角度**；
  - 字段：等距离=「距离」；两个距离=「距离 1」/「距离 2」；
    距离和角度=「距离」/「角度」；
  - 「切向延伸」全模式；「方向覆盖」仅双距离/距离-角度；
  - 证据：`D:\Github\onshape-parity-data\ui-evidence\chamfer-dialog-20261105\`。
  LubanCAD 的 i18n 类型名/字段名已按证据对齐（等距离/两个距离/距离和角度，
  距离/距离 1/距离 2/角度）；「方向覆盖」「测量」控件尚未实现。
- 已知边界：模式 0 Ranges / 1 Length 未暴露；逐边数组 values 未暴露；
  面倒角与实时 ghost 仍非目标。
