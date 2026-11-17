# AIRR — 草图尺寸表达式与 Part Studio 变量（v1）

- 标题：草图尺寸表达式 + Part Studio 变量表（Onshape 对标 v1）
- 日期：2026-11-17
- Owner：已批准 S1（2026-11-17，按 ADR-0020）；S2/S3 live 证据已采（2026-11-17，
  ADR-0020 §2.6），按切片实施
- 关联：ADR `docs/adr/0020-sketch-expressions-and-variables.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（shared 1.72.0）；
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
- live 证据（2026-11-17 已采，见 §10；未采部分不得伪造）：
  - 已采：尺寸字段表达式有效/无效态、`#` 补全、Enter 内联创建、变量对话框
    结构/类型/源模式、树行展示、角度尺寸 159 紧凑 chrome、草图四开关默认态；
  - 未采（保留缺口）：表达式尺寸**标签**的显示形态与 `显示表达式` 的标签效果
    （D1 为可逆推断）、变量 `已测量/来自导入` 的列表结构、变量删除 live 菜单。
- 非目标：完整单位系统/换算、函数库、Configurations、特征参数表达式、跨 scope 变量。

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | BIS 元素/验证、BriefcaseTxns、EDE 脏传播、OpLog | `DefinitionElement`、`ElementDrivesElement`、`BriefcaseTxns`、现有 FeatureService 事务模式 | vendored itwinjs-core | 复用 |
| luban-cad/packages/editor | 草图工具基类/编辑生命周期 | `Sketch.*` 工具族、editor 基座 | 第一方 | 不新增（表达式在对话框层，工具不改） |
| luban-cad/packages/viewer | 草图标注/装饰 | `SketchDimensionsDecoration`、`SketchCurvesDecoration` | viewer dist | 复用（显示值仍由 DTO 投影） |
| luban-cad/packages/shared | 契约/DTO/求值器 | `SketchConstraintDto`、`FeatureOp`、`LubanFeatureRpcInterface` 1.70.0 → **1.72.0**（S1 1.71 + S3 类型/说明） | shared | 扩展（新字段/新 op/新纯模块） |
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
| 尺寸表达式输入 UI | `SketchDimensionDialog`/`SketchDimensionEditor`/`SketchValuePopup` | 高 | **扩展** | 复用共享对话框与值弹层（长度 209×47、angle 159 紧凑变体）；不建第二套输入 | — |
| 变量表 UI | 无现成组件；live 结构待采 | 0 | **新建（live 证据后）** | 先探针后实现；未采前不造假面板 | — |
| 变量变更重算 | 后端 rebuild/EDE 闭包 | 中 | **保守全量**（v1） | 正确性优先；精确依赖图标脏作为后续优化 | — |

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | `SketchConstraintDto.expression?`；`updateVariables` op/`getVariables` 查询；`expressions/` 纯模块；S3 `VariableDto.type?/description?` + `collectVariableReferences`；1.70.0→**1.72.0** | 无 | 无 | 求值器/类型/版本钉 | 先发 |
| web | 尺寸对话框/值弹层表达式输入（S2）；变量表 UI/内联创建（S3b）；读取 variables 预校验 | 无 | 无 | 单测 + 真栈 e2e | 同批 |
| modeling-server | 变量元素类、`updateVariables`/`getVariables`、草图表达式求值、oplog before/after、保守重算 | 新类 + schema 01.00.01（additive） | 无 native | VariablesFlow/表达式求解/旧库 fixture/registry/RPC | 私有无发布产物：随下个 backend 版本 |
| itwinjs-core | 无改动 | — | — | — | — |
| imodel-native | 无改动 | — | — | — | — |
| viewer | 无改动（显示仍从 DTO 投影） | — | — | 回归 | — |

- 版本兼容矩阵：shared 1.72.0 与前端的 `expression` 字段为**可选**；S3
  `VariableDto.type/description` 为 additive 可选，旧三字段载荷逐字合法（缺省 type=length）；
  旧后端忽略新字段（仍用 `value`）；新后端遇到无 `expression`/无 `type` 的旧载荷行为不变。
- 配对 PR：shared → web；私有后端同批（未发布）。
- 发布顺序：shared 1.72.0 → 后端产物（私有）→ web；本次未发布。

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
- **S2 尺寸表达式 UI**（live 证据已采，见 §10）：对话框/值弹层表达式输入、
  有效/无效态与 ✓ 禁用、`#` 既有变量补全、`显示表达式` 标签投影、angle 159 宽
  chrome 变体；有效表达式走 wholesale updateSketch（带 `expression`）；单测 +
  真栈 e2e（表达式尺寸 → 体积/体积变化 → push+冷重开）。
- **S3 变量表 UI**（live 证据已采，见 §10）：变量命令对话框（220×188、四类型、
  已分配实现/其余诚实禁用）、树行 `(fx) #name = 值/表达式`、双击编辑/删除、`#`
  补全含 `新建变量…` 与尺寸字段内联创建变量面板；真栈 e2e（改变量 → 几何重算 →
  撤销/重做 → 冷重开）。
- **S4 特征参数表达式**（后续，不在本 AIRR 验收内）：复用求值器扩展到拉伸深度等。
- 证据门：S2/S3 的 UI 结构与文案已采（见 §10）；未采的标签形态/源模式列表按
  D1/诚实禁用处理，不得伪造（P0-03/P0-04）。

## 7. 回滚与发布

- 回滚：各仓 revert；表达式字段可选，旧代码用数值；变量元素对旧代码惰性；必要时
  按 scope 删除变量元素（事务/审计）。schema 不降级。
- 发布：shared 1.72.0 → 后端 → web 同批；本次 **不发布**（release/publish 未授权）。

## 8. 待 Owner 裁决 / 风险

1. 变量命名/引用语法是否严格对齐 live（`#name`、大小写、允许字符）；需 live 证据。
2. 变量变更重算 v1 用保守全量（可能慢）：接受还是先做依赖图？建议 v1 保守全量 +
   在 EXCEPTIONS 登记性能债务。
3. 表达式错误时是否允许保留旧值/禁止提交；建议禁止提交（与现有尺寸错误口径一致）。
4. 单位：v1 固定 mm/度；单位系统另立 ADR。
5. 尺寸表达式撤销：若沿用 wholesale 草图 op，undo 可能不可用（E-5）；是否单独做
   可逆的 `updateSketchDimensionExpression` op？建议 v1 接受 E-5，S2 再评估。

## 9. S1 实施与验证（2026-11-17）

- **shared 1.71.0（已提交 205c60ad07 + 文档 a675d8d2c7）**：纯表达式求值器（禁 eval；
  变量表依赖序/循环/错误归因/长度与深度上限）、`SketchConstraintDto.expression?`、
  `VariableDto`、`FeatureOp.updateVariables`、`getVariables`、op DSL 往返；shared
  build 通过，测试 **271/271（求值器 56）**；两轮审查（含嵌套错误归因修复）PASS。
- **私有后端 S1b**：schema `LubanCAD.PartStudioVariables` 01.00.01（additive，
  `containsClass` 感知升级）；草图写入前权威求值（角度度→弧度；非五类尺寸拒收）；
  `updateVariables`（校验零变更 → 重解含表达式草图 → 单事务变量表+草图 params+可逆
  oplog → 提交后独立事务 `rebuildAll`）；undo/redo 快照恢复 + 重建；`getVariables`
  旧库/只读/无类安全 `[]`；迁移复制变量表。后端测试：targeted **53/53**、迁移
  **13/13**、全量 **110/110 files / 970 passed | 1 expected fail | 8 skipped**；
  touched-file eslint 0；审查 PASS（P2 修复后复审 PASS）。
- **真栈（源码模式 MS；shared 1.71 + schema 01.00.01）**：新
  `e2e/sketch-expressions.spec.ts` **2 passed（45.9 s）**——变量 width=10 →
  `#width` 方形草图 → 拉伸 5 = **500 mm³** → `updateVariables` width=20 →
  20×20、**2000 mm³** → undo **500** → redo **2000** → 循环/未知变量显式拒收且
  变量表不变；回归 `sketch-driven-dimension` + `sketch-dimension-edit` 通过。
- **web**：全量 **2249/2249**、tsc(src+e2e) 绿（contract additive，无 UI 行为变化）。
- **运行前提（重要）**：本机 MS 需以源码模式启动（`scripts/start-ms-host.ps1 -Source
  <luban-backend>\modeling-server`）；`dist-backend` 产物仍是 shared 1.70 的旧后端，
  与 shared 1.71/web 不匹配。下一次发布必须 shared → backend → web 同批（本次未发布）。
- **残留**（S2–S3d 已实现并验证，见 §10.1）：`rebuildAll` 提交后失败边界（数据已存、
  返回可见错误）；首次写入 undo 保留空变量元素；损坏变量表修复不可逆；
  `updateVariables` 全量重解/重建成本；只读旧库不就地升级；表达式仅限 5 类尺寸、
  无单位/函数；oplog 快照体积随草图数增长；D1 标签形态/变量源模式删除菜单未采。

## 10. S2/S3 live 证据与实现口径（2026-11-17 recon）

证据为私有 Onshape parity 证据仓的 `probe-w33-*` 探针采集（UI 结构与行为）；
公开仓只记录脱敏结论。裁决全文见 ADR-0020 §2.6（D1–D7）。要点：

- **变量（S3）**：Part Studio 变量行 `(fx) #name = 值/表达式`（`#width = 10 mm`、
  `#height = #width*2`、`#ang = 45 deg`）；`变量` 命令对话框 **220×188**：
  `已分配/已测量/来自导入`、`长度/角度/数字/任意`、`名称/值/说明`、绿✓/红✗；
  值字段接受表达式（blur/Tab 求值，树显示表达式原文），`#` 打开自动补全
  （`(fx) #var 值` 与 `新建变量…`）。
- **尺寸表达式（S2）**：长度尺寸字段 `#width` 立即有效（✓ 可用）；输入未知
  `#name` 后 Enter 打开**内联创建变量**面板（类型/名称=token/值=尺寸当前值/说明，
  绿✓/红✗）；关闭面板后字段无效（`os-invalid-textbox` 等价、✓ 禁用）。无效
  （含求解器拒收）均保持对话框打开、Escape 恢复原值。
- **角度尺寸对话框**：容器 179×62、可见 dragbar 159×13 + panel 159×34、输入
  100×26、按钮组 52×28；**无展开器/参数状态键**（长度编辑器 W17 209×47 不变）。
- **草图对话框**：四开关 `禁用压印/显示约束/显示表达式/显示错误`（panel 220×219，
  行 y=160/188/215/242），后三者默认勾选。
- **未采证据（不得伪造）**：表达式尺寸**标签**的显示形态与 `显示表达式` 的实际
  标签效果；变量 `已测量/来自导入` 的列表结构。S2 采用 ADR-0020 §2.6 D1 的可逆
  推断（勾选显示表达式原文、否则数值），并登记为残留；S3 的 `已测量/来自导入`
  诚实禁用并给出能力原因。

**实现边界**

- S2 web-only（复用 shared 1.71 求值器与 `getVariables`）：`SketchDimensionDialog`
  有效/无效态与宽度变体、`SketchDimensionEditor`/`SketchValuePopup` 表达式解析与
  wholesale updateSketch 提交、`#` 补全（既有变量）、`buildSketchDimensionAnnotations`
  的 `显示表达式` 投影、`SketchDialog` 开关上抛；不新增契约。
- S3a shared/私有后端：`VariableDto.type/description` additive（shared **1.72.0**）；
  后端按尺寸量纲校验变量类型（length 类接受 length/number/any，angle 接受
  angle/number/any），类型不匹配零变更；迁移/旧库类型缺省 length。
- S3b web：变量命令与对话框、树行、编辑/删除（`updateVariables` 可逆）、补全
  `新建变量…` + 内联创建面板；不改第二套状态/编辑管道。

**验证门**

- S2：单测（表达式解析/有效无效/✓ 禁用/补全/标签投影/159 变体定位钳位）；真栈
  e2e：变量 `#width` 驱动尺寸 → 拉伸体积 → 改变量 → 体积变化 → push+冷重开；
  回归 `sketch-dimension-edit`/`sketch-draw-readout` 等。
- S3a：shared 全量 + 私有后端 targeted/全量（类型校验矩阵/迁移/旧库缺省）。
- S3b：单测（对话框/树行/删除/补全/内联创建）；真栈 e2e：建变量 → 尺寸引用 →
  改值重算 → undo/redo → push+冷重开；`已测量/来自导入` 禁用态诚实。
- 全部：tsc(src+e2e)/eslint；不发布（release/publish 未授权）。

### §10.1 实施与验证结果（2026-11-17）

- **S2 尺寸表达式 UI**：web **2307/2307**、lint/tsc(src+e2e) 绿；真栈
  `sketch-expression-ui` **2 passed（55.5 s）**——`#width*2` → 20 mm/1000 mm³、
  既有表达式不改确认保留、显示表达式 on/off 标签、`#nope` ✓ 禁用、angle 159 紧凑；
  回归 `sketch-dimension-edit`+`sketch-expressions` **5 passed**。
- **S3a 变量类型/说明**：shared **281/281**；backend **987 passed/1 expected
  fail/8 skipped**（类型矩阵/零变更/迁移/undo/op DSL）；S1 真栈 expression spec 绿。
- **S3b 变量表 UI/内联创建**：web **2383/2383**、lint/tsc(src+e2e) 绿；真栈
  `variables-ui` **2 passed（1.3 m）**——创建/树行/尺寸引用 400 mm³ → 编辑 800 →
  **原生 UI Undo/Redo 一次操作**（S3d 分组）→ 无效态 → 内联创建 → push+冷重开；
  `已测量/来自导入` 诚实禁用；变量删除为推断交互（live 菜单未采）。
- **S3d 原生撤销分组**：backend **993 passed/1 expected fail/8 skipped**；原生
  reverseSingleTxn/reinstateTxn 一次恢复变量/草图/几何（apply 与 history），重建
  失败仍提交变量并报错；IPC 分组计数修复 init 安全；组内撤销拒绝（残：UI 静默
  no-op，重建完成后可重试）。
- **证据缺口（保留）**：D1 表达式标签形态与 `显示表达式` 的 live 效果未采到，
  实现为可逆推断；变量 `已测量/来自导入` 结构未采到，诚实禁用。
- **发布**：未发布（release/publish 未授权）；shared 1.72.0 / 私有后端 / web 同批
  待下一次发布。
