# ADR-0020 — Sketch expressions and Part Studio variables (v1)

- 状态：**Accepted（S1 已由 Owner 于 2026-11-17 批准；S2/S3 live 证据已采集，
  2026-11-17 按 §2.7 裁决实现）**
- 日期：2026-11-17
- 关联：AIRR `docs/superpowers/specs/2026-11-17-expressions-variables-airr.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（shared `LubanFeatureRpcInterface`
  1.70.0 → **1.71.0**）；`docs/architecture/EXCEPTIONS.md`（若批准后新增例外/债务登记）
- 影响仓：`luban-cad`（shared/web）；私有 `luban-backend`（schema/求值/测试）
- 先例：ADR-0019（shared 载荷形状变更 + 私有后端同批）；P0-04/P0-06/P0-07/P0-10

## 1. 背景

Onshape 的尺寸与数值字段接受**表达式**（如 `25.4 / 2`、`#width * 2`），Part Studio
另有**变量表**（名称 → 表达式/值），变量被尺寸与特征参数引用；修改变量会驱动
依赖的几何重算。本产品目前：

- 草图尺寸对话框/值弹层只接受纯数字（W17/W21/W22 live 对拍），参数态切换键与
  展开器在纯数值尺寸下按 live 诚实禁用（S1a 证据：禁用态装饰，不存在可展开菜单）。
- 没有变量表、表达式存储或求值；`SketchConstraintDto` 只有数值 `value`。
- 因此 Onshape 的「在尺寸里输入表达式 / 用变量驱动尺寸」这一整类交互在本产品
  不可用。这是草图/特征 UI 对标剩余清单的第一项（此前记为 ADR+契约缺口）。

本 ADR 定义 **v1 最小闭环**：Part Studio 变量表 + 草图尺寸表达式 + 表达式求值 +
持久化/重算/撤销；不做完整单位系统、函数库、配置（Configurations）与特征参数
表达式（后续切片）。

## 2. 决策

### 2.1 数据模型（P0-06：iModel/BIS + params 是事实源）

1. **变量表 = 新增 BIS 元素类** `LubanCAD.PartStudioVariables`（`DefinitionElement`，
   每个 Part Studio scope 一个；与 `LubanFeature`/`LubanSketch` 同层），`params` 为
   JSON 文本：
   ```json
   { "version": 1,
     "variables": [
       { "id": "v1", "name": "width", "expression": "25.4 * 2" }
     ] }
   ```
   - `name` 在 scope 内唯一、`[A-Za-z_][A-Za-z0-9_]*`；表达式字符串是**设计意图**。
   - 求值结果不落库（派生数据；需要时由求值器即时计算），避免双事实源。
   - 变量表元素按需创建（首次新增变量时）；旧 iModel 无该元素 = 空变量表。
2. **尺寸表达式 = `SketchConstraintDto.expression?: string`**（shared 契约）：
   - 有 `expression` 时，`value` 仍是**求值后的数值**（求解器输入，保持后端现有
     `solveSketchChecked` 路径不变）；两者同源更新：后端在每次草图写入/重建时用
     表达式覆盖 `value`。
   - 无 `expression` 时行为与现状完全一致（旧载荷向后兼容）。
   - 只有可编辑尺寸种类（length/distance/radius/diameter/angle）允许 `expression`；
     其他约束携带 `expression` 由后端拒收（显式错误，不静默忽略）。
3. **schema 版本**：`LubanCAD` 01.00.00 → **01.00.01**（新增类，additive）；旧库打开
   不需要迁移数据，仅需 schema 升级逻辑容忍旧版本（现有 `querySchemaVersion` 路径 +
   旧库 fixture 测试）。回滚时旧代码忽略未知元素（BIS 容忍）或由回滚脚本删除该元素
   （可逆，见 §5）。

### 2.2 表达式求值

1. 新增 shared 纯模块 `src/expressions/`：词法/语法分析 + 求值（`+ - * /`、括号、
   一元正负、十进制数、`#name` 变量引用、角度/长度语义由调用方标注）。**禁止 `eval`**。
2. 求值上下文 = `{ variables: ReadonlyMap<string, number> }`；变量表按名称解析并做
   循环依赖检测（`#a = #b + 1; #b = #a - 1` → 明确错误）。变量本身的表达式可引用
   其他变量；变量依赖图在求值时构建（拓扑排序或递归 + 访问栈）。
3. 语义（v1）：
   - 长度类表达式使用**文档当前长度单位**（本产品当前固定 mm；显式单位后缀如
     `mm`/`in` 不在 v1，后续单位 ADR 再做）；
   - 角度类表达式以**度**书写（与 UI 一致），写入契约前换算为弧度（沿用 W18 口径）；
   - 表达式中的裸数字按对应量纲解释；变量值求值为无量纲数，由消费方按量纲使用
     （与 Onshape 的 `#width` 同名变量可被长度/角度共用不完全相同；v1 明确限制，
     live 证据补齐前不实现类型化变量）。
4. 错误模型（实现口径，S1a）：`{ ok: false, code: 'empty'|'syntax'|'unknownVariable'|'cycle'|'duplicateName'|'nonFinite', message, position? }`；
   UI/后端显示同一文本（zh/en i18n key），不静默回退到上一次数值。变量表内错误
   的 `position` 相对该变量自身表达式，`message` 顶层标注变量名。
5. 安全边界：表达式长度 ≤1024、递归深度 ≤64；禁 `eval`/`new Function`；求值器纯函数。

### 2.3 FeatureOp / RPC（P0-05：单一编辑管道）

1. 新增 FeatureOp **`updateVariables`**：
   ```ts
   { kind: 'updateVariables', variables: VariableDto[] } // 整表覆写
   ```
   - 校验：名称唯一/合法、表达式可求值、无循环依赖；失败零变更。
   - **可逆**：oplog 保存 `before`/`after` 变量表（小 JSON），undo/redo 用同一 op
     反向写回；比照 E-5 的 wholesale 草图 op 例外，本 op 是可逆的（P0-10 优先）。
   - 变量变更后的重算策略（v1）：**保守全量**——将当前 scope 内所有 sketch/feature
     标记为 dirty 并按既有 rebuild 路径重建（正确性优先，性能风险登记）；后续用
     表达式依赖图精确标脏。
2. 读取：`getVariables(connectionKey, partStudioId?) → VariableDto[]`（RPC 查询，
   无需新版本方法以外的旁路 REST）。
3. `LubanFeatureRpcInterface.interfaceVersion` **1.70.0 → 1.71.0**；shared 发布后
   后端同批实现（`FeatureRpcImpl` + `FeatureService` 白名单 + 校验 + oplog）。
4. 草图写入路径（insertSketch/updateSketch/updateSketchConstraint）：
   - 后端读取变量表 → 对带 `expression` 的约束求值 → 用结果替换 `value` → 再走既有
     求解/三态门禁；表达式求值失败 → `ok:false` 且零变更；
   - 前端在打开草图/弹出尺寸对话框时取 `variables` 用于本地预校验/显示（读取路径）；
   - 表达式改变时同样触发依赖特征重建（保守全量即可）。

### 2.4 UI（live 证据优先；未采前不实现）

1. **尺寸对话框表达式输入**：用户可输入表达式；提交前本地求值（shared 模块）并
   即时显示错误；提交仍走既有 `updateSketch`/`updateSketchConstraint`（载荷新增
   `expression`）。打开既有尺寸时优先显示表达式（live 的默认展示态待探针确认）。
2. **参数态切换键 / 展开器**：live 在纯数值尺寸下禁用（S1a 已证）；有表达式时是否
   启用/如何显示值↔表达式切换——**待 live 探针**，未采前保持诚实禁用。
3. **变量表 UI**：Onshape 的变量入口/表格/行编辑/删除/重命名联动——**待 live 探针**；
   未采前不实现假面板。
4. **变量引用补全/错误态**：待 live 探针。
5. 交互纪律：表达式输入不得绕过既有事务/撤销；变量表修改走 `updateVariables`（可逆）；
   不做第二套状态管理。

### 2.5 S1 实现裁决（2026-11-17 recon 后补充，S1b 按此实现）

1. **scope 与存储**：变量元素写入当前 scope 的 **def model**（与 Feature/OpLog 同模型）；
   legacy（无 scope）写 legacy def model，读取按类全库过滤。每 scope 至多一个元素（upsert）。
2. **schema 升级**：现有 `importTo` 在任何 schema 版本存在时直接 return，无法获得新类。
   改为“无 schema **或** `!containsClass("LubanCAD.PartStudioVariables")` → `importSchemaStrings`
   additive 导入”。只读打开不触发导入；`getVariables` 在无类/无 schema/`_readBlocked`
   时安全返回 `[]`。
3. **表达式求值时机**：后端在 `precomputeSketchWrite`（insert/update）与
   `precomputeSketchConstraint`（单值改值）内、solve 之前求值；`expression` 落库保留，
   `value` 为求值结果。单值数值改值**清除** `expression`（数值编辑覆盖表达式意图）。
   非 `length/distance/radius/diameter/angle` 携带 `expression` 一律拒收（包括 `offset`）。
   角度表达式按度书写，落库前换算弧度并校验 0<rad<π。
4. **变量变更重算**：`updateVariables` 在 txn 前用新变量值重解**所有含表达式的草图**
   （任一失败整 op 零变更）；txn 内写变量元素 + 受影响草图 params + oplog；提交后
   **单独事务** `rebuildAll(db, scope)`（`rebuildAll` 自起 txn，不能同事务）。`rebuildAll`
   失败时变量已保存，返回可见错误（边界如实登记）。
5. **撤销/重做**：`updateVariables` 纳入可逆集合；oplog payload 保存 before/after 变量表
   与受影响草图 params 快照；undo/redo 恢复快照后同样 `rebuildAll`。不改变其它 op 的
   undo 语义。
6. **迁移**：`PartStudioMigration` 复制集合加入变量元素（不得静默丢弃）；旧库 fixture
   用内联旧 schema 构造，断言升级后类存在、旧数据可读、变量读 `[]`。
7. **preview**：`updateVariables` 不产生几何预览；`previewOp` 诚实返回“不可预览”或
   `affected: []`（不写库），不做假预览。

### 2.6 S2/S3 live 证据与裁决（2026-11-17 recon）

证据来源：私有 Onshape parity 证据仓（探针 `probe-w33-*.mjs`，截图/JSON 在
`probe-20261117` 目录）；公开仓只记录脱敏结论，不含私有路径/账号。

1. **变量入口/树行（S3）**：变量是 Part Studio 级行，特征树显示
   `(fx) #name = <值/表达式>`（实测 `#width = 10 mm`、`#height = #width*2`、
   `#ang = 45 deg`）。`变量` tool-search 命令打开 220×188 feature-dialog：标题
   `#<name> = <值>`（新建时为 `#? = 0 deg`）、源模式 `已分配 / 已测量 / 来自导入`、
   类型行 `长度 / 角度 / 数字 / 任意`、字段 `名称 / 值 / 说明`、绿✓/红✗。
2. **变量表达式**：值字段接受 `#width*2`；blur/Tab 求值（显示 `20 mm`），提交后
   树行显示**表达式原文**；无效表达式保留输入、禁止提交。值字段输入 `#` 打开
   `quantity-parameter-autocomplete-menu`（行 `(fx) #var <值>` 与 `新建变量…`）。
3. **尺寸表达式**：长度尺寸值字段输入 `#width` 后**立即为有效态**（✓ 可用、无
   `os-invalid-textbox`）——✓ 是提交手势。按 Enter **不提交**，而是在尺寸对话框
   右侧打开**内联“创建变量”面板**（特征/配置页签、类型行、名称=token、值=尺寸当前
   值 `36.71832 mm`、说明；绿✓/红✗）。关闭该面板后字段变为无效态
   （`os-invalid-textbox`、✓ 禁用）——即 Enter 走内联新建分支，直接 ✓ 才提交表达式。
4. **尺寸对话框 chrome（S2）**：角度尺寸对话框 `.dimension-dialog` 容器 179×62
   （可见 dragbar 159×13 + panel 159×34；输入 100×26；按钮组 52×28，✓/✗ 22×22），
   **无展开器、无参数状态切换键**。长度尺寸编辑器（W17 已采）为 209×47（含禁用
   展开器/状态键）。→ chrome 按 kind 变化：angle 用 159 宽无扩展件，其余保持 209。
5. **无效态**：角度尺寸（几何上被其它约束锁定的 4°）改为纯数字 45 与 `#ang` 均被
   求解器拒收：输入 `os-invalid-textbox`、✓ 禁用、对话框保持打开；Escape 恢复原值
   并重新启用 ✓。即无效态同时覆盖“语法/未知变量”和“后端过约束/求解失败”，UI 不
   区分原因。
6. **草图对话框**：`禁用压印/显示约束/显示表达式/显示错误` 四开关（panel 220×219；
   行 y=160/188/215/242），后三者默认勾选（与既有对拍一致）。
7. **证据缺口（如实登记，不伪造）**：本轮未能提交一个带表达式的尺寸（取消后二次
   建尺寸进入放置态，未再弹出值框），因此**表达式尺寸标签的显示形态**与
   `显示表达式` 开关对标签的实际影响未采到；变量 `已测量/来自导入` 两种源模式只采到
   标签，未见列表/字段结构。

裁决（S2/S3 实现口径；缺口不得靠猜补齐）：

- **D1（显示表达式开关）**：`显示表达式` 勾选时，带 `expression` 的尺寸标签显示
  **表达式原文**（不附加 R/⌀/° 装饰）；未勾选显示求值后的数值（沿用现有标签格式）。
  纯显示投影，不改 params。该语义由控件名与 live 变量树“表达式原文显示”推断，属
  **可逆推断**；live 标签证据补齐后若有差异再修正（登记为 S2 残留）。
- **D2（尺寸对话框变体）**：`angle` 采用 live 159 宽无展开器/状态键变体；其余可编辑
  kind 保持 W17 209×47。放置/拖拽/钳位纯函数带宽度参数。
- **D3（表达式输入与提交）**：字段文本含运算符/括号/`#` 即按表达式求值；有效时 ✓
  可用；无效（语法/未知变量/非正/角度≥180°/后端拒收）→ 等价 `os-invalid-textbox`
  错误态、✓ 禁用、对话框保持打开。有效表达式提交走 **wholesale updateSketch**
  （约束对象带 `expression`，`value` 保留旧数值由后端覆盖）；纯数字仍走既有
  `updateSketchConstraint` 数值路径。首切片 **Enter 与 ✓ 都提交**；Enter 打开内联
  新建面板归 S3（D7），避免半成品。
- **D4（# 补全）**：尺寸/变量值字段输入 `#` 显示既有变量行 `(fx) #name <值>`，选中
  插入 `#name`；S2 首切片不渲染 `新建变量…` 行（S3 接通内联创建后加入），不做假控件。
- **D5（变量类型）**：`VariableDto` additive 增加
  `type?: 'length'|'angle'|'number'|'any'` 与 `description?: string`
  （shared 1.72.0）；缺省 type=length（S1 旧变量语义）。后端在草图表达式求值时按
  消费尺寸量纲校验变量类型：length 类（length/distance/radius/diameter）接受
  length/number/any；angle 接受 angle/number/any；类型不匹配 → 明确错误、零变更。
  UI 变量对话框按 live 提供四类型；`已分配` 全实现；`已测量`/`来自导入` 以诚实
  禁用（能力未实现原因 title），不伪造。**兼容性说明**：S1 旧变量无 `type` 时按
  `length` 解释；若旧文档/直写数据以无类型变量驱动角度尺寸，S3 升级后该草图在
  `updateVariables` 重解时会显式拒收（D5 的有意行为变化；S3 前产品无变量表 UI，
  影响面限于测试/直写文档，旧载荷本身仍可读取）。
- **D6（变量编辑/删除）**：变量行双击打开同一变量对话框；删除走 `updateVariables`
  整表覆写（可逆）。被引用的变量删除导致的求值失败按后端既有零变更/明确错误处理，
  不做静默级联。
- **D7（内联创建变量）**：S3 实现——尺寸值字段输入未知 `#name` 后 Enter 打开内联
  `创建变量` 面板（live 结构：220×188、类型行默认长度、名称=token、值=字段当前值、
  说明；✓ 创建并回填表达式、✗ 关闭且字段保持无效）；已存在变量从补全列表选择，
  不走创建分支。若成本超预期可拆 S3b，但不得以假面板占位。

### 2.7 明确不做（v1 非目标）

- 文档单位切换（in/mm 全局单位设置）与单位后缀/换算函数；
- 函数库（sin/cos、条件、字符串）、配置变量（Configurations）、FeatureScript；
- 特征参数（拉伸深度等）的表达式（后续切片，复用同一求值器）；
- 变量作用域跨 Part Studio/跨文档；
- 把表达式字符串存进 OpLog 之外的旁路存储。

## 3. 备选方案

- **A. 全部前端求值，后端只收数值**：不新增契约；但重建/变量变更无法由后端权威
  求值，多端/回放不一致，且表达式随前端版本漂移。拒绝（违反 P0-06 单一事实源）。
- **B. 变量存草图 params**：变量是 Part Studio 级，草图级存储导致跨草图不可用/
  重复；拒绝。
- **C. 变量作为 `LubanFeature` 行**：变量不是特征、不进特征树/顺序语义，且会污染
  feature 扫描与 EDE 闭包；拒绝。
- **D. 先做纯前端算术后端不感知**：无持久化/重算，属于半成品，拒绝。

## 4. 验证与发布

- shared：求值器单测（运算/优先级/括号/变量/循环/错误）、DTO 类型与版本钉、
  `updateVariables` 类型测试；shared 全量绿。
- 后端（私有仓）：`VariablesFlow`（CRUD/校验/循环/撤销）、草图表达式求解
  （表达式→value→solve）、表达式错误零变更、旧库 fixture、`FeatureTypeRegistry`/
  `FeatureRpcImpl` 版本矩阵；全量绿。
- web：尺寸对话框表达式输入/错误/提交载荷、变量表 UI（待 live 证据后）单测；
  真栈 e2e：变量建表 → 尺寸引用变量 → 改变量 → 几何/体积变化 → push+冷重开
  保持一致；undo/redo 变量与表达式；旧 iModel 打开无变化。
- 发布顺序（P0-07）：shared 1.71.0 → 后端产物 → web 同批；本次不发布。
- **S1 实测（2026-11-17）**：shared 271/271（求值器 56）；私有后端全量 110/110 files /
  970 passed | 1 expected fail | 8 skipped（targeted 53/53、迁移 13/13）；
  真栈（源码模式 MS）`sketch-expressions` **2 passed（45.9 s）**：变量 width=10 →
  `#width` 方形 → 拉伸 **500 mm³** → width=20 → **2000 mm³** → undo 500 → redo
  2000 → 循环/未知变量拒收零变更；回归 `sketch-driven-dimension` +
  `sketch-dimension-edit` **5 passed（2.7 min）**；web **2249/2249**、
  tsc(src+e2e)/eslint 绿。S2/S3 UI 仍待 live 证据。

## 5. 回滚

- 代码回滚：web/shared/后端各自 revert；旧 iModel 不含变量元素/表达式时行为不变。
- 数据回滚：已落库的 `SketchConstraintDto.expression` 在旧代码中作为未知字段被忽略
  （仍使用 `value`，数值可用）；`PartStudioVariables` 元素对旧代码惰性（BIS 未识别类
  不阻塞打开）。如需彻底删除，按 scope 删除该元素（单事务，可审计）。
- schema 版本不降级（BIS 惯例）；回滚不重写旧数据。
