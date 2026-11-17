# AIRR — 草图尺寸表达式与 Part Studio 变量（v1）

- 标题：草图尺寸表达式 + Part Studio 变量表（Onshape 对标 v1）
- 日期：2026-11-17
- Owner：已批准 S1（2026-11-17，按 ADR-0020）；S2/S3 待 live 证据与切片门
- 关联：ADR `docs/adr/0020-sketch-expressions-and-variables.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（shared 1.71.0）；
  UI 对标 AIRR `docs/superpowers/specs/2026-11-15-sketch-feature-ui-parity-audit-airr.md`
- 预计影响仓：`luban-cad/packages/shared`、`luban-cad/apps/web`；私有
  `luban-backend/modeling-server`（schema/求值/op/RPC/测试）
- 是否需要 ADR：**是**（新 BIS 类 + shared 契约字段 + 新 FeatureOp）

## 1. 目标与验收

- 用户问题：Onshape 的尺寸/数值字段接受表达式、Part Studio 有变量表；本产品目前
  只能输入纯数字，变量/表达式整类交互缺失。
- 可观察验收（v1，按切片）：
  1. 草图尺寸对话框可输入 `(25.4*2)/2` 之类的算术表达式；提交后几何按求值结果求解；
     打开既有尺寸时能按 live 的展示规则回显表达式/值。
  2. Part Studio 变量表可新增/改名/改表达式/删除；`#name` 可被尺寸表达式引用；
     改变量后依赖几何重算。
  3. 表达式错误（语法/未知变量/循环/非有限）显式报错、零变更，不静默回退。
  4. 变量表编辑可撤销/重做（可逆 op）；尺寸表达式随草图事务可回滚到数值语义
     （整体覆写 op 的既有 E-5 限制如适用，登记）。
  5. push+冷重开后变量表与表达式保持；旧 iModel（无变量/表达式）打开行为不变。
- 参考证据（已有）：
  - 尺寸对话框结构（拖拽条/输入/禁用展开器/禁用参数态键/✓✗；W17/W17b/W18/W21 live）；
  - 纯数值尺寸下展开器与参数态切换键为禁用态装饰（S1a 私有审计结论）；
  - 数值行/输入格式、角度度数与弧度契约（W18/W20/W21/W22）。
- 待补 live 证据（**blocked-evidence，未采前不实现对应 UI**）：
  - 表达式输入的行为：输入/求值时机、显示为表达式还是值、重新打开后的回显；
  - 参数态切换键/展开器在有表达式时是否启用、切换后的显示；
  - 变量表入口/表格结构/行编辑/删除/重命名联动/错误提示；
  - 变量引用补全（`#` 提示）与未知变量错误文案；
  - 文档单位对表达式/变量显示的影响（v1 不做单位系统，但需确认 live 口径）。
- 非目标：完整单位系统/换算、函数库、Configurations、特征参数表达式、跨 scope 变量。

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | BIS 元素/验证、BriefcaseTxns、EDE 脏传播、OpLog | `DefinitionElement`、`ElementDrivesElement`、`BriefcaseTxns`、现有 FeatureService 事务模式 | vendored itwinjs-core | 复用 |
| luban-cad/packages/editor | 草图工具基类/编辑生命周期 | `Sketch.*` 工具族、editor 基座 | 第一方 | 不新增（表达式在对话框层，工具不改） |
| luban-cad/packages/viewer | 草图标注/装饰 | `SketchDimensionsDecoration`、`SketchCurvesDecoration` | viewer dist | 复用（显示值仍由 DTO 投影） |
| luban-cad/packages/shared | 契约/DTO/求值器 | `SketchConstraintDto`、`FeatureOp`、`LubanFeatureRpcInterface` 1.70.0 | shared | 扩展（新字段/新 op/新纯模块） |
| luban-backend/modeling-server | 草图求解/特征求值/schema/oplog | `SketchWireNormalizer`、`solveSketchChecked`、`FeatureService`、`LubanCadSchema` | 私有仓 | 扩展（表达式的权威求值/变量表元素/新 op） |
| luban-backend/webhook-agent | 基线/发布 | baseline generator | 私有仓 | 不适用（无新几何格式） |
| imodel-native | 几何内核 | `SolidKernel.h`/BRep | 独立 | 不适用（求值在 TS 层，数值进内核） |
| imodelhub-services | iModel 存储/checkpoint | 现有 | GHCR | 不适用 |
| 官方 clients/BisSchemas | ElementDrivesElement/EC 模式 | 官方 BIS 参考 | 参考 | 复用模式 |
| DanQing/参考项目 | — | — | — | 不适用 |

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建的理由/新建的理由 | 许可证 |
|---|---|---|---|---|---|
| 表达式词法/求值 | 无现成 shared 模块；iTwin core 无通用表达式求值 | 0 | **新建（shared 纯模块）** | 需前后端同源、可测、禁 eval；无合适官方 API | MIT/自研 |
| 变量存储 | BIS `DefinitionElement` + params JSON | 高 | **扩展**（新类） | 与 Feature/Sketch 同层、单一事实源；不引入外部存储 | — |
| 尺寸表达式字段 | `SketchConstraintDto` 扩展 | 高 | **扩展** | 既有 op 载荷保持数值语义，expression 为设计意图 | — |
| 变量表编辑事务/撤销 | 既有 BriefcaseTxns + OpLog | 高 | **复用** + 新 `updateVariables`（可逆） | 不新造事务/撤销机制 | — |
| 尺寸表达式输入 UI | `SketchDimensionDialog`/`SketchDimensionEditor`/`SketchValuePopup` | 高 | **扩展** | 复用同一 209×47 对话框与值弹层；不建第二套输入 | — |
| 变量表 UI | 无现成组件；live 结构待采 | 0 | **新建（live 证据后）** | 先探针后实现；未采前不造假面板 | — |
| 变量变更重算 | 后端 rebuild/EDE 闭包 | 中 | **保守全量**（v1） | 正确性优先；精确依赖图标脏作为后续优化 | — |

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | `SketchConstraintDto.expression?`；`updateVariables` op/`getVariables` 查询；`expressions/` 纯模块；1.70.0→1.71.0 | 无 | 无 | 求值器/类型/版本钉 | 先发 |
| web | 尺寸对话框/值弹层表达式输入；变量表 UI（证据后）；读取 variables 预校验 | 无 | 无 | 单测 + 真栈 e2e | 同批 |
| modeling-server | 变量元素类、`updateVariables`/`getVariables`、草图表达式求值、oplog before/after、保守重算 | 新类 + schema 01.00.01（additive） | 无 native | VariablesFlow/表达式求解/旧库 fixture/registry/RPC | 私有无发布产物：随下个 backend 版本 |
| itwinjs-core | 无改动 | — | — | — | — |
| imodel-native | 无改动 | — | — | — | — |
| viewer | 无改动（显示仍从 DTO 投影） | — | — | 回归 | — |

- 版本兼容矩阵：shared 1.71.0 与前端的 `expression` 字段为**可选**；旧后端忽略该字段
  （仍用 `value`）；新后端遇到无 `expression` 的旧载荷行为不变。
- 配对 PR：shared → web；私有后端同批（未发布）。
- 发布顺序：shared 1.71.0 → 后端产物（私有）→ web；本次未发布。

## 5. 数据/事务/安全

- 数据事实源：变量表 = iModel 元素 `params`；表达式 = `SketchConstraintDto.expression`；
  求值结果只进 `value`（求解输入），不成为第二事实源。
- schema/params 变化与迁移：新类 additive；旧库 fixture（打开/建草图/求解）必须绿；
  不做旧数据重写；schema 版本 01.00.01。
- 事务边界：变量表编辑走 `updateVariables`（BriefcaseTxns/saveChanges）；尺寸表达式
  随既有草图 op；失败零变更（校验先于事务）。
- Undo/redo：`updateVariables` 设计为可逆（oplog 保存 before/after 变量表）；
  尺寸表达式受既有 wholesale 草图 op 非 invertible 口径约束（E-5），如无法逆
  在 EXCEPTIONS 登记并在 UI 文档说明。
- 写租约/权限/限流：沿用现有连接写租约与 MS 限流；RPC 查询幂等。
- 安全：表达式求值禁 `eval`/Function；解析器限制长度与递归深度；错误信息不含路径/密钥；
  公共仓不出现私有证据路径/账号。

## 6. 测试与验收门（切片）

- **S1 契约+求值器+后端（无 UI 行为变化）**：shared 求值器单测；DTO/版本；
  后端变量元素 + `updateVariables`/`getVariables` + 草图表达式求值 + 错误零变更 +
  可逆撤销 + 旧库 fixture。门：shared 全量、后端全量、真栈 RPC 级（建变量/带表达式
  建草图/改变量重算）绿。
- **S2 尺寸表达式 UI**：live 证据补齐后实现对话框/值弹层表达式输入、错误显示、
  显示表达式/值切换（按 live）；单测 + 真栈 e2e（表达式尺寸 → 体积/体积变化 →
  push+冷重开）。
- **S3 变量表 UI**：live 证据后实现面板/行编辑/补全；真栈 e2e（改变量 → 几何重算 →
  撤销/重做 → 冷重开）。
- **S4 特征参数表达式**（后续，不在本 AIRR 验收内）：复用求值器扩展到拉伸深度等。
- 证据门：S2/S3 的 UI 结构、文案、开关态未采前不得实现（P0-03/P0-04）。

## 7. 回滚与发布

- 回滚：各仓 revert；表达式字段可选，旧代码用数值；变量元素对旧代码惰性；必要时
  按 scope 删除变量元素（事务/审计）。schema 不降级。
- 发布：shared 1.71.0 → 后端 → web 同批；本次 **不发布**（release/publish 未授权）。

## 8. 待 Owner 裁决 / 风险

1. 变量命名/引用语法是否严格对齐 live（`#name`、大小写、允许字符）；需 live 证据。
2. 变量变更重算 v1 用保守全量（可能慢）：接受还是先做依赖图？建议 v1 保守全量 +
   在 EXCEPTIONS 登记性能债务。
3. 表达式错误时是否允许保留旧值/禁止提交；建议禁止提交（与现有尺寸错误口径一致）。
4. 单位：v1 固定 mm/度；单位系统另立 ADR。
5. 尺寸表达式撤销：若沿用 wholesale 草图 op，undo 可能不可用（E-5）；是否单独做
   可逆的 `updateSketchDimensionExpression` op？建议 v1 接受 E-5，S2 再评估。
