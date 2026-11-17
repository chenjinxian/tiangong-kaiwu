# ADR-0020 — Sketch expressions and Part Studio variables (v1)

- 状态：**Accepted（S1 已由 Owner 于 2026-11-17 批准；S2/S3 已实现；S4a
  拉伸深度表达式 2026-11-17 recon 后按 §2.7 实施）**
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

### 2.8 明确不做（v1 非目标）

- 文档单位切换（in/mm 全局单位设置）与单位后缀/换算函数；
- 函数库（sin/cos、条件、字符串）、配置变量（Configurations）、FeatureScript；
- 其他特征字段（孔深/圆角半径/抽壳厚度/阵列间距等）的表达式（S4a 仅拉伸盲孔
  深度；后续切片复用同一求值器）；通用表达式映射与有序变量可见性另行立项；
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

## 5. 回滚

- 代码回滚：web/shared/后端各自 revert；旧 iModel 不含变量元素/表达式时行为不变。
- 数据回滚：已落库的 `SketchConstraintDto.expression` 在旧代码中作为未知字段被忽略
  （仍使用 `value`，数值可用）；`PartStudioVariables` 元素对旧代码惰性（BIS 未识别类
  不阻塞打开）。如需彻底删除，按 scope 删除该元素（单事务，可审计）。
- schema 版本不降级（BIS 惯例）；回滚不重写旧数据。
