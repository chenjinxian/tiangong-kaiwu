# ADR-0020 — Sketch expressions and Part Studio variables (v1)

- 状态：**Accepted（S1 已由 Owner 于 2026-11-17 批准；S2/S3/S4a/S4b/S4c/S5/S6/S7/S8/S9
  已实现；S4c 其他特征数值字段表达式 2026-11-18 按 §2.8 实施；S5 表达式错误结构化与
  本地化按 §2.10 实施；S6 线性阵列间距表达式按 §2.11 实施；S7 倒角数值字段表达式按
  §2.12 实施；S8 孔沉头/锥口字段表达式按 §2.13 实施；S9 阵列第二方向间距表达式按
  §2.14 实施）**
- 日期：2026-11-17
- 关联：AIRR `docs/superpowers/specs/2026-11-17-expressions-variables-airr.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（shared `LubanFeatureRpcInterface`
  1.70.0 → 1.71.0 → … → **1.74.0**）；`docs/architecture/EXCEPTIONS.md`（若批准后
  新增例外/债务登记）
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
8. **变量变更的原生原子撤销（S3d，2026-11-17）**：`updateVariables` 与其提交后重建
   （`rebuildAll`）用 `TxnManager.beginMultiTxnOperation()/endMultiTxnOperation()`
   包成一个原生 undo 操作——一次 Ctrl+Z 同时恢复变量表、草图 params 与依赖几何；
   `maybePush` 在组外（push 开启新会话会清空 undo，属既有 push 策略）；组内持有
   文档初始化锁；`rebuildAll` 增加可选 `operationDescription`，使 undo 字符串为
   `update variables`/`undo`/`redo`。IPC 初始化安全回退守卫改为按**操作**计数
   （`TxnProps.grouped === false` 才算一个），修复分组事务导致 `reverseAll` 越过
   init 事务的风险。组打开期间（变量已提交、重建未结束）的原生 undo 必须被拒绝/
   排队，避免半程撤销撕裂状态；push 后 undo 不可用属既有 push 策略。

### 2.6 S2/S3 live 证据与裁决（2026-11-17 recon）

证据来源：私有 Onshape parity 证据仓（探针 `probe-w33-*.mjs`，截图/JSON 在
`probe-20261117` 目录）；公开仓只记录脱敏结论，不含私有路径/账号。

1. **变量入口/树行（S3）**：变量是 Part Studio 级行，特征树显示
   `(fx) #name = <值/表达式>`（实测 `#width = 10 mm`、`#height = #width*2`、
   `#ang = 45 deg`）。`变量` tool-search 命令打开 220×188 feature-dialog：标题
   `#<name> = <值>`（新建时标题随类型显示 `#? = 0 <单位>`；实测 `#? = 0 deg` 是在
   选择「角度」类型之后，初始默认类型未单独采到，S3b 按 D5 缺省 `length` 显示
   `0 mm`）、源模式 `已分配 / 已测量 / 来自导入`、
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

### 2.7 S4a 特征数值字段表达式（拉伸深度，2026-11-17 recon）

**Live 证据（脱敏）**：拉伸对话框 `深度` 字段接受算术与 `#变量`（输入期合法）；该字段
的自动补全对**晚于该特征创建**的变量只显示 `新建变量…`，提交时该变量被拒收
（`os-invalid-textbox`、顶部 ✓ 禁用）——即 live 的特征字段只“看见”定义在特征位置
之前的变量。输入未知 `#foo` + Enter 打开内联创建变量面板（名称=token、值=字段当前
表达式/值）；创建后变量出现在**该特征之前**的树位置，字段随即可提交。特征顶部 ✓
提交（表达式字段被编辑时首次点击归一化字段、第二次点击提交/关闭）。提交并重开后
字段显示**求值结果**（如 `25.4 mm`），**聚焦时显示存储的表达式**（如 `#foo`）；
纯算术（`25.4 + 0`）同样求值/提交。

**裁决（S4a，仅拉伸盲孔深度）**

1. **契约**：`ExtrudeParams.distanceExpression?: string`；`distance: number` 保持
   必填并作为**物化快照**（写入/变量变更时由后端求值覆盖）。shared 1.72.0 →
   **1.73.0**（additive）。仅 `endBound` 缺省/`"blind"` 允许；throughAll/upToSurface/
   upToNext/upToVertex 带表达式显式拒收。不加通用 `expressions` 映射（后续字段族另
   切片）。
2. **权威求值在 FeatureService 写边界**（FeatureEngine 不改）：insertFeature/
   updateParams 在 txn 前解析表达式（变量表 + shared 求值器）；合法则物化
   `distance` 后照常存储/求值；错误显式、零变更（先求值后类型门，沿用 S3 口径）。
   `previewOp` 同样归一化后再影子求值。只接受 length/number/any 变量；结果有限且
   >0；表达式长度/深度沿用 shared 求值器边界。
3. **变量变更传播**：`updateVariables` 预计算扩展 `featureChanges`（逐特征
   before/after params 快照）——重算含 `distanceExpression` 的特征深度；任一错误整
   op 零变更；与变量表/草图 params **同一事务**写回，oplog 增加可选
   `featureChanges`（旧 payload 缺省=[] 兼容），undo/redo 恢复快照；随后既有
   rebuildAll（同一原生多事务分组）按物化后的 params 重建。冷重开/ensureWarm 无需
   解析器（存储的 distance 已是新值）。
4. **可见性语义**：本产品变量为 Part Studio 级单表，**所有变量对所有特征字段可见**
   （相对 live 的“仅此前定义的变量”是已登记的产品超集；有序可见性需变量顺序数据
   模型，另立 ADR）。内联创建从特征字段追加到变量表，立即可用（树显示在变量段，
   不重排到特征前）。
5. **UI（S4b）**：复用 S2 的表达式校验与 `#` 补全/内联创建；字段聚焦显示表达式、
   失焦显示 `值+单位`；提交时表达式走 `{distance: 求值, distanceExpression: 原文}`，
   纯数值删除表达式；编辑其他字段不得丢失未触碰的表达式；非 blind 终止条件清除
   表达式；顶部 ✓ 的两击归一化行为按 live 或产品一体化提交（以真栈验收为准）。
   **发布门**：shared 1.73 / 后端 / S4b web 必须同批（P0-07）——旧 web 客户端编辑
   任一字段会以自身状态整体覆写 params，静默丢掉 `distanceExpression`；S4b 必须
   回显未触碰的表达式。
6. **变量变更传播与抑制**：`updateVariables` 对**被抑制**的特征同样重算并物化深度
   （取消抑制后使用最新值），不因抑制跳过；扫描只解析含 `distanceExpression` 的
   特征行，其他特征零触碰。
7. **不做**：通用字段表达式映射、其他特征字段（孔深/圆角半径/抽壳厚度/阵列间距）、
   有序可见性、单位后缀解析（v1 固定 mm）。

### 2.8 S4c 其他特征数值字段表达式（2026-11-18 recon）

**Live 证据（脱敏）**：孔对话框 `Ø` 直径字段（`6.35 mm`）与圆角半径字段（`5 mm`）输入
`#width`/`#height` 时字段有效，数量自动补全同时列出**既有变量行**
（`#width 10 mm` / `#height 20 mm`）与 `新建变量…`（与编辑既有拉伸时只列
`新建变量…` 不同——新特征位于所有既有变量之后，因而可见全部既有变量；这解释了
S4a 的“晚于特征创建的变量不可见”是**位置顺序**语义）。字段组件与拉伸深度相同
（`os-param-number dropdown-source` + quantity autocomplete）。本产品为单变量表，
所有变量对所有字段可见（产品超集；有序可见性仍不做）。

**S4c 首切片字段矩阵**（typed expression keys，shared 1.74.0 additive）：

| 特征 | 键 | 契约目标字段 | 量纲/规则 |
|---|---|---|---|
| fillet | `radiusExpression?` | `radius` | length，>0 |
| shell | `defaultDistanceExpression?` | `defaultDistance` | 有符号 length（允许 ≤0，内核语义） |
| hole | `diameterExpression?` / `depthExpression?` | `diameterMm` / `depthMm` | length，>0（depth 仅 blind） |
| extrude | `secondDirectionDistanceExpression?` / `startOffsetExpression?` / `thinThicknessExpression?` / `draftAngleExpression?`（连同已有 `distanceExpression`） | `secondDirection.distanceMm` / `startOffsetMm` / `thinThicknessMm` / `draftAngleDeg` | length/>0（startOffset 按现有 schema）；secondDirection 仅 **blind**（throughAll 的 distance 由内核重算，表达式显式拒收）；draft 为**度**（contract `draftAngleDeg`） |
| revolve | `angleExpression?` | `angle`（弧度） | UI/表达式按**度**书写，求值后换算弧度；非 fullRevolve |

**后端**：把 S4a 的 extrude 深度专用解析器泛化为 **field-spec 表**（featureType →
`{expressionKey, targetField, kind: length|signedLength|angleDeg|angleRadFromDeg,
valueRule}`）；写/预览边界对 specs 中出现的键求值并物化目标数值，再用既有 registry
schema 复验跨字段关系（如 countersink diameter 等后续）；错误零变更、先求值后类型门、
无表达式不读变量表。`updateVariables` 扫描任一 expression key（子串预过滤），逐特征
重算/物化并沿用 `featureChanges` 快照 + 同事务 + 原生 undo 分组；无表达式特征零触碰。
FeatureEngine/冷重建仍只消费物化数值。shared 1.73.0 → **1.74.0**；服务端 schema/
formFields 补齐各键。S4a 的 `distanceExpression` 迁移到同一 field-spec 后**合法行逐字
兼容**；但同样经过物化后的 registry schema 复验——历史上通过 S4a 写入、却已违反当前
schema 的损坏行，在 `updateVariables` 传播时会被明确拒收（整 op 零变更），这是有意的
行为收紧，登记于此。length 字段类型门接受 length/number/any；角度字段接受
angle/number/any（与 S3 尺寸同口径）。

**Shell 方向语义**：`defaultDistance` 是**有符号**距离（负=内缩、0=穿孔），
`defaultDistanceExpression` 求值符号即方向。Web 在表达式在场时把方向下拉改为
求值符号的派生只读态；用户改方向须先清除表达式回到数值态。禁止“UI 内缩、提交后
外扩”的静默变向。

**Web**：把 S4b 的深度表达式字段抽成可复用 `ExpressionNumberField`（聚焦表达式/
失焦值+单位、`#` 补全/内联创建、类型门、无效禁用、preview 用求值数），接到
FeatureDialog（fillet/extrude 附加/revolve）与 HoleDialog/ShellDialog 的对应
数值行；提交按各键 `{目标数值, <key>: 原文}`，未触碰保留、纯数值/不适用模式删除。
沿用页面持有的单变量 hook 与 inline-create host。

**本切片不做**：chamfer `values1/values2`（随 mode 的 length/angle 双语义）、孔的
counterbore/countersink/tip 表达式、pattern 的 count/spacing/angle、阵列/布尔/变换
数值字段、有序变量可见性。

### 2.9 明确不做（v1 非目标）

- 文档单位切换（in/mm 全局单位设置）与单位后缀/换算函数；
- 函数库（sin/cos、条件、字符串）、配置变量（Configurations）、FeatureScript；
- chamfer 双值/角度表达式、孔的沉头/倒角/钻尖、阵列 count/spacing/angle 等
  特征字段（S4c 已覆盖 fillet radius、shell defaultDistance、hole diameter/depth、
  extrude 附加数值、revolve angle；其余后续切片复用同一 field-spec/求值器）；
  通用表达式映射与有序变量可见性另行立项；
- 变量作用域跨 Part Studio/跨文档；
- 把表达式字符串存进 OpLog 之外的旁路存储。

### 2.10 S5 表达式错误结构化与本地化（2026-11-18）

**问题**：shared 求值器 `ExpressionFailure.message` 是中文直出；en 界面会显示中文
（S2/S4b/S4c 登记残留）。**方案**：shared 1.74.0 → **1.75.0**，给
`ExpressionFailure` 增加 locale-neutral 结构化字段（additive，`message` 逐字不变，
后端/旧调用方继续兼容）：

- `detail?: ExpressionErrorDetail`——17 种判别联合（invalidNumber / invalidChar /
  invalidVariableRef / trailingCharacter / unexpectedToken / unexpectedEnd /
  missingRightParen / depthLimit / lengthLimit / invalidVariableName / duplicateName /
  unknownVariable / cycle{chain} / divisionByZero / literalOutOfRange /
  resultNotFinite / variableNotFinite）；`empty` 无 detail，由 `code==='empty'` 判别。
- `attributedVariable?: string` + `referenceChain?: string[]`——变量表求值归因（最深
  失败变量 + 根到失败变量的引用链）；`cycle` 自持 `detail.chain` 闭环，不重复归因。
- 每个抛错点带 detail + position；`cycle` 链确定性。求值语义/消息零变化（exact-string
  测试锁定）。

**Web**：新增 `internal/expression-error-message.ts` 的 `expressionFailureMessage`，
按 detail/code 映射 `partStudio.expression.errors.*` zh/en 模板（含变量归因与引用链
模板）；无 detail/未知 kind → 本地化通用兜底（en 绝不回落到 shared 中文）。本地包装
（特征字段、尺寸弹层）保留 `sourceCode`，使变量定义为空（表格级 `empty`）仍显示
“表达式为空/Expression is empty”。接入点：`SketchValuePopup`、特征
`ExpressionNumberField`/`expressionFieldMessage`、`variables.ts` 草稿校验 +
`VariablesDialog`。en 全命名空间 CJK/全角标点扫描（含补充平面）纳入 i18n 测试。

**不做**：后端错误文案本地化（`特征 <id>：...` 等仍中文，登记）；单位/函数语法扩展；
改动求值语义。发布未授权。

### 2.11 S6 线性阵列间距表达式（2026-11-18 recon）

**Live 证据（脱敏，私有 `probe-20261118/`）**：Onshape 线性阵列编辑对话框类型下拉为
零件阵列/特征阵列/面阵列；Part pattern 与切到特征阵列后的 FEATURE pattern，「距离」
字段均接受 `#width`（字段保持有效并打开数量补全）。**契约 shared 1.75.0 → 1.76.0**：
`PatternParams.spacingExpression?` 与 `FeaturePatternParams.spacingExpression?`，
仅 `kind === "linear"`；kind length >0；物化 `spacing`（必填快照；写/预览载荷须携带
`spacing` 占位键，resolver 对无占位的合成仅用于 `updateVariables` 存量行修复）；
circular 携带显式拒收；变量类型门 length/number/any；错误零变更。后端复用 S4c
field-spec + registry schema 复验 + `updateVariables` 全键扫描/undo；web 两个阵列
对话框的间距行复用 `ExpressionNumberField`（linear 适用、无效禁提、未触碰保留、
数值清除、circular 清除、preview 用求值数）。**不做**：第二方向间距、circular
angle、count 表达式；发布未授权。

### 2.12 S7 倒角数值字段表达式（2026-11-18 recon）

**Live 证据（私有 `probe-20261118/`）**：倒角对话框三种类型——等距离（单「距离」）、
两个距离（距离1/距离2）、距离和角度（距离 mm + 角度 45 deg）；等距离与距离字段
接受 `#width`，角度字段接受 angle 变量 `#ang`（均有效 + 数量补全）。**契约 shared
1.76.0 → 1.77.0**：`ChamferParams.values1Expression?`/`values2Expression?`，仅
**标量**目标（数组/逐边显式拒收）；mode 1/2/3 适用（UI：等距离与两个距离均为
mode 2；距离和角度 mode 3）：values1 kind length；values2 mode 2 length、mode 3
angleRadFromDeg（度书写→弧度物化），mode 0/4 与缺目标显式拒收；mode 3 标量
values2 弧度域 `(0, π)` 明确校验。后端复用 field-spec（支持 mode 相关 kind）+
registry 复验 + updateVariables 全键扫描/undo；web 三模式数值行复用
`ExpressionNumberField`（等距离双键同文、未触碰保留、数值清除、切换模式清非适用/
换量纲字段、无效禁提、预览用求值数、S5 本地化；角度字段内联创建 `deg`→angle）。
**不做**：逐边数组表达式、mode 0/4、测量类型扩展；发布未授权。

### 2.13 S8 孔沉头/锥口字段表达式（2026-11-18 recon）

**Live 证据（私有 `probe-20261118/w41-hole*.png`）**：孔样式=简单/沉头孔/倒角孔；
沉头孔新增 `⌴Ø`/`⌴↧` 字段，倒角孔新增 `⌵Ø`/`X °` 字段；沉头深度 `#height`
与锥口角度 angle 变量 `#ang`、主孔径 `#width` 均有效并打开数量补全；钻尖角
`118 度` 为下拉（不接表达式）。**契约 shared 1.77.0 → 1.78.0**：
`HoleParams.counterboreDiameterExpression?/counterboreDepthExpression?`（仅
counterbore，length >0）、`countersinkDiameterExpression?`（仅 countersink，
length >0）、`countersinkAngleExpression?`（仅 countersink，`angleDeg` 度，
0<angle<180）；数值目标保持必填物化快照，写/预览载荷须携带**已满足跨字段规则**
的数值占位（沉头/锥口直径 > 主孔径、角度域），样式不适用携带显式拒收；resolver
合成仅用于 `updateVariables` 存量行修复；物化后 registry schema 复验。后端复用
field-spec + updateVariables 全键扫描/undo；web HoleDialog 四字段复用
`ExpressionNumberField`（样式适用、mm/in 投影、角度内联创建 deg→angle、无效禁提、
S5 本地化）。**不做**：tipAngle 表达式、钻孔尺寸表/合并范围/起始平面/终止条件
表达式；发布未授权。

### 2.14 S9 阵列第二方向间距表达式（2026-11-18 recon）

**Live 证据（私有 `probe-20261118/w42-pattern-second*.png`）**：Part pattern 编辑
对话框展开「第二个方向」后的「距离」字段接受 `#width`（有效 + 数量补全）。
**契约 shared 1.78.0 → 1.79.0**：嵌套 `PatternSecondDirection.spacingExpression?` /
`FeaturePatternSecondDirection.spacingExpression?`，目标 `secondDirection.spacing`
（length >0）；仅 secondDirection 存在且 spacing 为数值占位时适用（不合成）；
与顶层第一方向 `spacingExpression` 同名但按路径区分；物化保留
count/centered/axis 并走 registry 复验（总实例 ≤1000 等）；`updateVariables` 同一
预过滤键名同时命中两层，resolver 按路径分别物化。后端 field-spec 以
`expressionPath` 支持嵌套；web 两个阵列对话框第二方向间距行复用
`ExpressionNumberField`（第二方向启用适用、未触碰保留、数值清除、禁用清除、
无效禁提、preview 用求值数）。**不做**：circular angle/count 表达式、逐实例/
数组表达式；发布未授权。

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
  tsc(src+e2e)/eslint 绿。
- **S2 实测（2026-11-17）**：web **2307/2307**、lint/tsc(src+e2e) 绿；真栈
  `sketch-expression-ui` **2 passed（55.5 s）**：`#width*2` → 20 mm/**1000 mm³**、
  既有表达式不改确认保留、显示表达式 on/off 标签 data-text、`#nope` ✓ 禁用 +
  红下划线 + 取消不变、angle **159** 紧凑且无展开器/状态键；回归
  `sketch-dimension-edit` + `sketch-expressions` **5 passed（2.1 m）**。
- **S3a 实测**：shared **281/281**；backend targeted **51/51**、全量 **987
  passed/1 expected fail/8 skipped**；类型矩阵（length↔angle 拒收、number/any
  接受、缺省 length）、零变更、读/撤销说明一致性、迁移/undo、op DSL 往返。
- **S3b 实测（2026-11-17）**：web **2390/2390**、lint/tsc(src+e2e) 绿；真栈
  `variables-ui` **2 passed（1.1 m，孤立干净窗口）**：变量 width=10 → 树行、尺寸 `#width` →
  **400 mm³**、改 width=20 → **800 mm³**、**原生 UI Undo 一次点击**回 10/400
  （S3d 分组）、Redo 回 20/800、无效表达式 ✓ 禁用、内联 `#bar` 创建、push+冷重开；
  S2/S1 spec 各 **2 passed**。`已测量/来自导入` 诚实禁用；变量删除为推断交互
  （tree Delete/右键，live 菜单未采）。
- **S3d 实测**：backend **993 passed/1 expected fail/8 skipped**；原生
  reverseSingleTxn/reinstateTxn 一次恢复 variables+sketch+geometry（apply 与
  history 路径）、重建失败仍提交变量并报错、IPC 分组计数修复 init 安全、组内
  撤销拒绝。残：组内 Undo 为拒绝（Tool 吞状态，UI 静默 no-op，重建完成后可重试）；
  push 后 undo 不可用（既有 push 策略）。**D1 标签形态仍为 live 未采的可逆推断**。
- **S4a 后端实测（2026-11-18）**：shared **286/286**；backend targeted **106/106**、
  全量 **1024 passed/1 expected fail/8 skipped**；tsc 绿。覆盖：schema blind-only、
  字面量/`#var`/类型门（length/number/any，angle 拒收）、错误优先级与零变更、
  insert/update/preview 物化、numeric↔expression、updateVariables 传播（多特征、
  抑制特征、陈旧快照自愈）、原生与 FeatureOp undo/redo、旧 oplog 无
  `featureChanges` 兼容、scoped 隔离、冷重开、表单字段一致性。
- **S4b 前端实测（2026-11-18）**：web **2412/2412**、lint/tsc(src+e2e) 绿；真栈
  `feature-expression-ui` **2 passed（54.8 s）**：`#depth*2` → **1000 mm³** →
  编辑 `#depth` → **500** → 变量 5→10 → **1000** → 原生 Ribbon Undo/Redo 一次
  500/1000；聚焦显示表达式、失焦显示求值值；无效表达式无预览且禁用提交；非 blind
  终止条件清除表达式；symmetric + 表达式质心/撤销；push+冷重开保持。回归
  `feature-flow-parity` 2、`extrude-second-direction` 2、`extrude-thin-wall` 2、
  `tutorial2` 2（357.730 cm³）。残：内联创建面板真栈未单独覆盖（单测覆盖）、
  类型门/evaluator 错误中文直出、布尔旧距离行不开放表达式（gating）、自动补全
  未做视口夹紧。
- **S4c 实测（2026-11-18）**：shared **296/296**；私有后端 targeted **155/155**、
  全量 **1051 passed / 1 expected fail / 8 skipped**、tsc 绿；web **2470/2470**
  （158 files）、lint/tsc(src+e2e) 绿。真栈 `feature-expression-fields`
  **5 passed（2.9 m）**：fillet 半径 `#r*2` → radius 2/表达式原文 → 卷边体积、
  原生 Undo/Redo、变量 r 1→2→1 几何重算、无效 `#nope` ✓ 禁用 + aria-invalid、
  数值编辑清除表达式、**再 undo 恢复 `#r*2`**、未触碰编辑保留、`#newr` 内联创建
  （值预填/字段转有效）→ 提交、push+冷重开；hole 孔径 `#d*2` → mm 物化、数值
  编辑清除、无效禁用；shell `0 - #t` 负值 → 内缩派生只读方向；extrude 第二方向
  （仅 blind，throughAll 载清）+ revolve 角度（度求值→弧度载荷）。回归
  `feature-expression-ui` 2、`variables-ui` 2、`hole` 5、`shell` 2（isolated；
  合并窗口撞 429 后隔离重跑绿）；`tutorial2-tools` **6 passed / 1 known-red**
  ——「约束：重合/中点/相切/水平/竖直」竖直 15/16（单次点击丢失），为
  2026-11-13 起登记的既有 count off-by-one known-red（当时已用 `git stash`
  未改代码复跑同值复现），非本切片引入，未放宽断言；**2026-11-18 取点硬化**
  （竖直拾取 1/4→3/4 避开 origin 热区，产品行为/断言不变）后 spec 全量
  **7 passed（5.1 m）**，known-red 关闭；`tutorial2` 全链 **2 passed（4.6 m，
  357.730 cm³ 不变）**。
  复核：后端 opus APPROVE WITH FIXES → 修复（第二方向收紧 blind-only、测试
  自洽、错误前缀/注释、服务级零变更与角度传播测试）→ scoped APPROVE；web opus
  APPROVE WITH FIXES → 修复（P1 控制器不稳定导致 preview RPC 自激循环、无效态
  红框/文案、`°→angle` 内联创建、英寸预填 mm、第二方向无效幽灵、hole 点草图
  e2e）→ scoped APPROVE；仅余 P3（英寸表达式在场时预填旧单位、`deg` 映射）已修。
  **真栈意外发现并修复产品缺陷**：`PartStudioPage` 以 `enabled: canEdit &&
  !readonlyBlocked` 覆盖 `useAutoPush` 的环境缺省，`VITE_EDITOR_AUTOSAVE=0`
  从未生效；20s 防抖静默 push 会清空原生 undo/redo 栈（S4c 数值编辑后 undo
  偶发失效的真因）。新增 `resolveAutoPushEnabled` 总门与真栈回归测试。
- **S5 实测（2026-11-18）**：shared **307/307**（含 test:types，detail 17 种逐项、
  归因/循环链、message 逐字兼容 exact-string）；shared build/dist 1.75.0。私有后端
  对 shared 1.75 兼容：表达式相关 targeted **96/96**、`tsc --noEmit` 绿（无代码改动）。
  web **2506/2506**（160 files）、tsc(src+e2e)/eslint 绿；`partStudio.expression.errors.*`
  zh/en 21 键、en 全命名空间 CJK/全角/补充平面扫描绿；`VariableDraftValidation` 判别
  联合（key vs failure）。真栈 `feature-expression-fields` **5 passed（2.9 m）**，含新
  断言：无效 `#nope` 字段显示本地化 **`未知变量: #nope`**（zh），且 S4c fillet/hole/
  shell/extrude/revolve 全流程不回归。复核：opus APPROVE WITH FIXES → 修复（P2 空
  变量定义 `sourceCode` 保留、空断言、注释、校验联合、CJK 守卫扩展）→ scoped
  APPROVE。
- **S6 实测（2026-11-18）**：shared **309/309**（+2 契约测试）含 test:types；
  private backend targeted **217/217（9 files）**、全量 **1070 passed / 1 expected
  fail / 8 skipped（112 files）**、tsc 绿（含复核补测：无 `spacing` 占位的写面
  负例、FEATURE pattern 抑制传播、scoped 隔离）。web **2518/2518**（160 files）、
  tsc(src+e2e)/eslint 绿。真栈 `pattern-spacing-expression` **2 passed（1.1 m；
  setup + 1 用例）**：体线性阵列 `#sp`（sp=10，count 2）→ **160 mm³** + 树 params
  `{spacing:10, spacingExpression:'#sp'}` → 变量 sp 10→20 物化 → 原生 undo/redo →
  push+冷重开。回归：`pattern-centered-ui`、`pattern-second-direction-ui`
  **3 passed（1.2 m）**；`feature-pattern-edit-ui`、`feature-pattern-tree-ops`
  **5 passed + 1 既有 KNOWN-RED（标记）**（3.7 m）。复核：后端 opus **APPROVE**
  （P3 补测/文档建议 → 已修）；web opus APPROVE WITH FIXES（P2 circular 清除测试
  过弱）→ 强化为聚焦断言 + 提交载荷无 `spacingExpression`，并以临时禁用清除效果
  验证测试转红（已还原）。FEATURE 阵列真栈 e2e 未单独覆盖（单测覆盖，登记）。
- **S7 实测（2026-11-18）**：shared **312/312**（+3）含 test:types；private backend
  targeted **141/141（5 files）**、全量 **1086 passed / 1 expected fail / 8 skipped
  （112 files）**、tsc 绿。web **2532/2532**（160 files）、tsc/ eslint 绿。真栈
  `chamfer-expression` **2 passed（1.2 m；setup + 1 用例）**：距离和角度
  `#sp`+`#ang` → 树 `{mode:3, values1:2, values1Expression:'#sp',
  values2Expression:'#ang'}`、`values2≈π/4` → 值编辑回显/取消零写 → 变量 sp 2→4
  物化 → 原生 undo/redo（均保持 π/4）→ push+冷重开体积与 Redo 后一致；回归
  `examples/live-chamfer-mode3` **2 passed（41.7 s，3960 mm³）**。复核：后端 opus
  APPROVE WITH FIXES（mode-3 弧度域 `(0,π)` 非表达式回归钉 + ScenarioReplay
  OFFSET_ANGLE 度→弧度修复 + 缺失目标文案）→ 修复；web opus APPROVE WITH FIXES
  （P2 角度字段内联创建单位；测试隔离/预览载荷/未触碰保留；e2e 体积与取消断言）
  → 修复。**残**：mode 4（AngleDistance）存量行编辑仍按 mode 3 重解释（UI 从不
  创建 mode 4，shared 1.77 拒收 mode-4 表达式→失败闭合；**W42 S11 已以诚实只读
  守卫关闭**：mode 0/1/4/未知显示可见横幅、字段/确认禁用、取消可用、不重映射
  提交）；逐边数组表达式/测量类型扩展未做。
- **S8 实测（2026-11-18）**：shared **317/317**（+5）含 test:types；private backend
  targeted **174/174（6 files）**、全量 **1106 passed / 1 expected fail / 8 skipped
  （112 files）**、tsc 绿；web **2551/2551**（160 files）、tsc/eslint 绿。真栈
  `hole-expression-fields` **2 passed（59.9 s；setup + 1 用例）**：沉头孔主孔 `#w`
  + 沉头直径 `#w*1.5` + 沉头深度 `#h` → 树 params（10/15/5 + 三表达式）→ 体积
  **2723.750 mm³**（公式 2723.728）→ 变量 h 5→3 物化 → 原生 undo/redo → push+
  冷重开。回归 `hole` 既有 **6 passed（2.9 m）**；复核：后端 opus APPROVE WITH FIXES
  （写入口占位/存量合成/预览补测 + JSDoc）→ 修复；web opus APPROVE WITH FIXES
  （P2 英寸模式样式切换回退把 mm 默认当英寸 → 单位投影修复；测试隔离/兄弟表达式
  保留/e2e 精确体积与跨样式键）→ 修复。首跑 e2e 仅因测试体积常量半径笔误
  （r=2.5 vs 5）红，产品实测体积与正确公式一致，常量已修。
- **S9 实测（2026-11-18）**：shared **320/320**（+3）含 test:types；private backend
  targeted **270/270（9 files）**、全量 **1124 passed / 1 expected fail / 8 skipped
  （112 files）**、tsc 绿；web **2568/2568**（160 files）、tsc/eslint 绿。真栈
  `pattern-second-spacing-expression` **2 passed（56.1 s；setup + 1 用例）**：体线性
  阵列第二方向 2×2 `#w` → 320 mm³/质心 9,9 → 变量 w 10→20 物化（y=14）→ 原生
  undo/redo → push+冷重开；回归 `pattern-second-direction-ui` **2 passed（1.1 m）**。
  复核：后端 opus **APPROVE**（P3 补测：服务级循环表零变更、beforeParams/undo 快照、
  嵌套未知键、scoped 隔离）→ 已修；web opus APPROVE WITH FIXES（P3：re-enable 文案、
  preview 计数 flake、payload 全等、e2e 取消零写、circular 清除单测）→ 修复。
  FEATURE 阵列第二方向真栈 e2e 未单独覆盖（单测覆盖，登记）。

## 5. 回滚

- 代码回滚：web/shared/后端各自 revert；旧 iModel 不含变量元素/表达式时行为不变。
- 数据回滚：已落库的 `SketchConstraintDto.expression` 在旧代码中作为未知字段被忽略
  （仍使用 `value`，数值可用）；`PartStudioVariables` 元素对旧代码惰性（BIS 未识别类
  不阻塞打开）。如需彻底删除，按 scope 删除该元素（单事务，可审计）。
- schema 版本不降级（BIS 惯例）；回滚不重写旧数据。
