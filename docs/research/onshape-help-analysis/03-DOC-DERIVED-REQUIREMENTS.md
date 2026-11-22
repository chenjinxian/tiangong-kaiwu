# 从 Onshape 帮助文档到可执行规格：抽取模板、验收断言与 live 缺口

> 目标：把 527 个帮助主题中的**可复用规则**转成 LubanCAD 可执行的：
> 1. AI 工具规格（tool spec）；
> 2. AIRR/ADR 输入；
> 3. 单测/真栈 e2e 断言；
> 4. live UI 采集清单。
>
> 约束：本文只是**需求抽取方法**，不新增 `LubanFeatureRpcInterface`/FeatureOp/schema；任何新字段/新工具仍按 P0-04 先 AIRR/ADR。

---

## 1. 文档能提供什么、不能提供什么

### 1.1 可信度分层（建议统一使用）

| 置信度 | 含义 | 处理 |
|---|---|---|
| `doc-explicit` | 原文直接写明字段、默认值、选项、快捷键、限制 | 可直接进入 tool spec 与测试断言 |
| `doc-implied` | 由多个页面组合可推出，但单页未逐字写 | 进入 tool spec 标记 `needs-review`，AIRR 时确认 |
| `live-required` | 文档只给图/视频/结果描述，字段或默认值不明 | 必须 live 采集；不得猜 |
| `conflicting` | 文档内部不一致 | 登记冲突；以 live/产品裁决为准，测试先不写死 |
| `absent` | 文档没有该行为（不等于产品没有） | 不写进规格；live 探针确认是否存在 |

本分析在 `sections/*.md` 中已用 `[文档明确]`/`[推断]` 标注；转成 JSON 时建议改用上述枚举，便于机器处理。

### 1.2 文档的强项

- **UI 表面与选项名**：工具名、下拉项、字段顺序、页签、右键菜单、面板分区。
- **流程与前置条件**：选择顺序、先建版本、先 Commit、先设配置、先固定件等。
- **状态与规则**：驱动/从动、过定义、钣金 K 因子、装配自由度、发布状态机、图纸视图源矩阵。
- **平台/订阅边界**：`Available in:`、`Only available for`、移动端限制（尽管徽标常丢图）。
- **数量与默认值**：部分页面给出精确值（AO 37.5%、K=0.45/0.5、测量类型 12 类、GD&T 14 符号、发布审批规则等）。

### 1.3 文档的弱项

- 349 个工具页中：只有 59 个给快捷键、62 个有显式注意事项/限制、287 个没有限制段落；15 个 <100 词。
- 120 个主题含视频；视频转录有时比正文更完整，但会与正文冲突。
- 图片全部退化为 `[image]`/`[image: alt]`（全站 13,716 个图片引用）；对话框视觉、图标状态、几何结果图无法从文本恢复。
- 字段默认值、失败原子性、撤销粒度、错误文案、性能阈值大多未写。
- 文档存在内部矛盾（已在各 section 报告逐条登记）。

**结论**：文档足以生成“字段/选项/流程/规则”的**候选规格**；不足以单独冻结 UI 视觉与默认值。必须保留 `live-required` 标记并继续 live 证据链。

---

## 2. 建议的 Tool Spec JSON 结构

### 2.1 顶层 schema

```json
{
  "schemaVersion": "1.0",
  "id": "partstudio.feature.extrude",
  "onshapeLabel": "Extrude",
  "aliases": ["拉伸"],
  "domain": "Part Studio",
  "docRef": "https://cad.onshape.com/help/Content/PartStudio/extrude.htm",
  "docSnapshot": "2026-11-20",
  "availability": ["Sketch", "Part Studio"],
  "shortcut": "Shift+e",
  "summary": "给选定面域/平面面沿直线路径加深度；新建、加料、去料或相交。",
  "preconditions": [
    "存在闭合草图面域或平面面",
    "Add/Remove/Intersect 时必须存在目标体",
    "Merge scope 为空时 Add/Remove/Intersect 报错"
  ],
  "inputs": [
    {
      "name": "profiles",
      "label": "Selected regions",
      "kind": "selection",
      "filters": ["sketchRegion", "planarFace"],
      "min": 1,
      "max": null,
      "required": true,
      "confidence": "doc-explicit"
    }
  ],
  "fields": [
    {
      "name": "creationType",
      "label": "Creation type",
      "type": "enum",
      "options": ["Solid", "Surface", "Thin"],
      "default": null,
      "defaultNote": "文档只写‘remember last selection’，未给初始默认",
      "confidence": "live-required"
    },
    {
      "name": "resultOperation",
      "label": "Result",
      "type": "enum",
      "options": ["New", "Add", "Remove", "Intersect"],
      "default": null,
      "constraints": ["Surface 仅 New/Add", "Remove/Intersect 需要目标体"],
      "confidence": "doc-explicit"
    },
    {
      "name": "endBound",
      "label": "End type",
      "type": "enum",
      "options": ["Blind", "Up to next", "Up to face", "Up to part", "Up to vertex", "Through all"],
      "default": null,
      "confidence": "doc-explicit"
    },
    {
      "name": "depthMm",
      "label": "Depth",
      "type": "number",
      "unit": "length",
      "visibleWhen": "endBound == Blind",
      "required": true,
      "confidence": "doc-explicit"
    },
    {
      "name": "direction",
      "label": "Direction",
      "type": "direction",
      "default": "normal",
      "options": ["normal", "axis", "mateConnector", "opposite"],
      "confidence": "doc-explicit"
    },
    {
      "name": "symmetric",
      "label": "Symmetric",
      "type": "boolean",
      "default": false,
      "visibleWhen": "endBound in [Blind, Through all]",
      "confidence": "doc-explicit"
    },
    {
      "name": "mergeAll",
      "label": "Merge all",
      "type": "boolean",
      "default": true,
      "confidence": "doc-explicit"
    },
    {
      "name": "mergeScope",
      "label": "Merge scope",
      "type": "selection",
      "filters": ["part", "surface"],
      "visibleWhen": "mergeAll == false",
      "required": true,
      "confidence": "doc-explicit"
    }
  ],
  "undo": {
    "granularity": "one-dialog-accept = one transaction",
    "intermediateActionsInUndo": false,
    "confidence": "doc-implied"
  },
  "platformNotes": [
    "Available in Sketch and Part Studio",
    "移动端差异未在本页说明"
  ],
  "openQuestions": [
    "Creation type 的初始默认值",
    "Depth 的默认值/单位记忆规则",
    "Thin 的默认厚度",
    "失败时的错误文案"
  ]
}
```

### 2.2 字段约定

- `kind`：`selection|number|boolean|enum|string|direction|expression|table|list`。
- `unit`：`length|angle|count|unitless|area|volume|mass`。
- `visibleWhen`：只表达文档能支撑的显隐关系；不确定就不写。
- `default`：**只有文档明确写出的值才填**；否则 `null` + `defaultNote` + `confidence: live-required`。
- `constraints`：文档明确的前置/互斥/禁止项（如 Symmetric 仅 Blind/Through all）。
- `confidence`：每个字段独立标记，避免“整页都当真”。
- `docRef`：页面 URL + 必要锚点；用于审计。
- `openQuestions`：直接成为 live 采集/产品裁决任务。

### 2.3 不要做的事

- 不要把 `onshapeLabel` 直接当 `LubanFeatureType`/toolId；映射必须经过现有 `capabilities.ts`/shared 契约。
- 不要在一个 spec 里塞入未文档化的“实现建议”；实现建议放 AIRR。
- 不要把多个工具的字段合并成一个“万能工具”。

---

## 3. 全局契约（所有 tool spec 的共同前置）

以下规则来自 `foundations`、`ps-sketch`、`ps-core`，建议先固化成 `ui.global.*` 能力行与测试工具，而不是每个工具重复实现。

### 3.1 选择

- 单击切换；无需 Ctrl 追加；光标 `5+`；Space/右键清空；Shift 列表范围；Ctrl+拖选取消。
- 左→右框选全包含；右→左框选接触即选。
- Create Selection：面六准则、边五准则、Select patterns；预选可跳过对话框。
- Select Other：反引号/Shift+反引号/Enter；自动填字段。
- 透明几何 Alt 穿透。

### 3.2 数值字段

- 步进 0.1/0.01/1.0；0–1 字段特例；单位关键字与复数；三角按度；`%` 取模。
- 结果单位必须是 0 或 1 次方；非法表达式红框/禁用确认；支持数组/三元/逻辑。
- 小数位设置仅显示、不参与计算；Measure 精度不足用科学计数法。

### 3.3 对话框/事务

- 蓝底=图形区选择；白框=键盘输入；Enter/Shift+Enter；Escape 取消；字段级 x/Clear all；缺失引用红色；Preview 0–100%；Final。
- 接受=一次事务；临时动作不入 Undo/Redo；只读用户可看不可改。
- 编辑特征默认回滚到该特征状态；非最后特征有 Final；Merge all 默认；Add/Remove/Intersect 无 merge scope 报错。
- 数组字段支持拖拽重排（Loft profiles 等）。

### 3.4 特征树/配置/In-Context

- Feature list/Parts list 双区；回滚条、抑制、动态抑制、再生时间、暂停再生。
- 配置三类输入；可见性 AND；隐藏取默认；选项规则仅 List；复制输入不保持引用。
- In-Context 快照+手动更新；蓝点=过期；主实例实线/旧主实例虚线；更新永不自动。
- 暂停再生期间改表格/配置不立即重算；切 tab 自动应用；已再生更改不可 undo。

### 3.5 版本/权限

- 版本不可变；分支末端最多一个 workspace；Merge 不能 Undo；删除 workspace 不可撤销。
- 权限服务端单点裁决；前端隐藏不等于鉴权；Link document 依赖 Export；Free 私有文档只读。

---

## 4. 各领域 spec 化优先级

### 4.1 Part Studios（先做，现有计划的主战场）

**建议顺序**：

1. **草图工具 56 个**：每个生成 tool spec；约束 15 个单独 spec（refs/DOF/glyph/求解状态）。
2. **核心特征 21 个**：每个 FeatureType 一个 spec + 分支矩阵（endBound/mode/mergeScope/thin/pattern 等）。
3. **钣金/框架 23 个**：先 Sheet Metal Model + Flange + Table/Flat View + Corner Break；Frame 独立。
4. **曲线/曲面 18 个**：先 Composite/Projected/3D Fit/Bridging/Trim/Intersection，再 Boundary/Fill/Offset/Move Boundary/Ruled/Mutual Trim/Constrained。
5. **MBD/材料/表格**：公差/Inspection/材料库/外观在曲线曲面之后。

**spec 必须区分的分支**（否则会出现“工具存在但参数不全”的假 full）：

- Extrude：6 端条件 × New/Add/Remove/Intersect × Solid/Surface/Thin × 方向/对称/起始偏移/第二端/拔模/merge scope。
- Revolve：Full/Blind/Up to × New/Add/Remove/Intersect × Thin/Surface × 多面域。
- Fillet：Edge/Full round × Radius/Width × Distance/Conic/Curvature × Asymmetric/Partial/Variable/Overflow/Corner。
- Chamfer：Equal/Two distances/Distance-angle × Offset/Tangent × 方向覆盖。
- Pattern：Part/Feature/Face × Linear/Circular/Curve × 第二方向/Centered/Skip/Reapply。
- Loft：多截面顺序 × Path/Guides/Connections × Thin/Surface × 端条件。
- Sheet metal：Convert/Extrude/Thicken × K 因子/BA/BD × 角释放/折弯释放 × 表/展开图。

### 4.2 Assemblies

- 每个 Mate 一个 spec：两个 connector 槽、offset/limits、Flip/Reorient、Solve、Animate、选择顺序、错误条件。
- Relations 4 个 spec：选中 Mate、二次 DOF、比值/距离、Reverse。
- 装配工具：Group/Snap/Replicate/Replace/Pattern/Mirror/子装配/显示状态/命名位置/爆炸/In-Context。
- BOM spec：Structured/Flattened、子装配行为、列/模板/抑制/排除、版本只读。
- Simulation 单独 spec（静力/Modal/Async/Rigid Body），不要与基础装配混在一起。

### 4.3 Drawings

- 视图类型 9 个 spec：源视图矩阵、父/子、比例、旋转、显示状态/配置、更新/悬空。
- 尺寸 13 个 spec：捕捉点、推理线、精度、从动/覆盖、Dangling。
- 注释/符号 7 个 spec：Datum/GT/Surface/Weld/Edge/Note/Callout/Inspection。
- 表格 6 个 spec：列/模板/固定角/padding/CSV/版本只读。
- 模板/导出：DWT/DWG/DXF/PDF 的字段与版本矩阵。

### 4.4 Documents / Release / PLM

- 文档版本/分支/合并/恢复每个操作一个 spec（含不可逆/HITL 标记）。
- 共享权限矩阵、评论/任务、Follow、View Only、Transfer ownership。
- 发布状态机 + 审批规则 + 修订/零件号/配置/水印/作废/克隆。
- Arena 连接：映射/同步/预检/错误/幂等键。

### 4.5 Render / Visualization / Evaluation

- Render Studio：Scene/Appearance/Environment/Camera/Render Options 五组 spec；Advanced 席位门禁；素材库 schema（3,881/390 条目）与参数族。
- Measure/Mass Properties/Analysis 11 个工具各一个 spec；只读语义与 View only 兼容。
- ViewCube/Camera/Named Views/Section View/Hide/Isolate/Transparency 按“显示状态，不是建模事务”处理。

### 4.6 Account / Enterprise

- 计划/角色/权限/SSO/计费/审计各一个 spec；这些是服务端能力，tool spec 应描述 UI 字段与权限门，而不是模型能力。

---

## 5. 可直接写入测试的文档断言（Top 30）

> 这些断言均来自文档明确规则；实现前需按 live 补齐默认值/视觉。它们适合作为单测/真栈 e2e 的“行为契约”，不是像素基线。

| # | 断言 | 来源 |
|---:|---|---|
| 1 | 选择：左→右框选全包含、右→左接触即选；光标 `5+`；Ctrl+拖选取消 | foundations |
| 2 | 数值字段滚动 0.1/Ctrl 0.01/Shift 1.0；0–1 字段 Shift 无效；单位必须一次方 | foundations |
| 3 | 对话框接受=单事务；中间动作不进入 Undo/Redo；只读用户可看不可改 | foundations |
| 4 | Extrude：Symmetric 仅 Blind/Through all；Add/Remove/Intersect 无 merge scope 报错；New 无 merge scope | ps-core |
| 5 | Extrude：6 端条件 + 第二端独立深度 + 起始偏移（Blind/Entity）+ Thin 的 Mid plane/T1/T2 | ps-core |
| 6 | Fillet：Conic Rho 0.25/0.5/0.999；Curvature Magnitude 0–0.999；Full round 不接受不连续面 | ps-core |
| 7 | Loft：≥2 profiles；顺序错误报错/可拖拽重排；多 contour 红显不可用；nested loops 不支持 | ps-core |
| 8 | Pattern：count 最小 1 含 seed；Centered 共 2N−1；Circular Equal spacing 语义；Skip instances [i,j] | ps-core |
| 9 | 草图过定义时新尺寸自动转 from-driven；driven→driving 若过约束红标；弧/半径/直径不接受负值 | ps-sketch |
| 10 | 草图阵列 >10 只预览前 10；圆周默认 360° closed；Text 250 字符；Bezier 最大 15 次且不可闭合 | ps-sketch |
| 11 | 草图直接 Extrude/Revolve：自动接受草图并全选面域 | ps-sketch |
| 12 | 钣金默认 K Factor 0.45、Rolled 0.5；BA/BD 不在 Bend/Jog 对话框改；越界标红+tooltip | ps-sheet-frame |
| 13 | 钣金仅 90° 接头可 Butt；非 90° 必须 Edge；Make joint/Modify joint/表三处一致 | ps-sheet-frame |
| 14 | Corner Break 必须最后；应用后接头 Type/Style 冻结；Form 不得触及侧壁/卷壁/rip/joint/corner | ps-sheet-frame |
| 15 | Frame profile 必须在另一 Part Studio；外部引用需 version；路径连续；Cut List 不可覆盖 Item/Qty/Length/Angle | ps-sheet-frame |
| 16 | 装配两实例之间只有一个 Mate；`Solve` 触发全装配求解；编辑中不持续求解 | assemblies |
| 17 | Width Mate 的 Tab/Width 不得同件；两个 connector 异组；Pin Slot 先 pin 后 slot | assemblies |
| 18 | BOM：Structured 编号 9/9.1；局部抑制 `--*`、全局排除 `--`；Item 不可删/排序；版本内不能 include/exclude | assemblies |
| 19 | 仿真：实例上限 100、接触对 10,000；Modal 默认 5/最多 15；Async 50 次/24h；Rigid Body 不计上限 | assemblies |
| 20 | 工程图视图：投影可来自剖/对齐剖/辅助/破断剖，不可来自平展/详图；角度剖与 Break 互斥 | drawings |
| 21 | 工程图尺寸：默认禁中点/四分点，Shift+q 开；2 点线性不能选线；线到线只高亮平行线 | drawings |
| 22 | GD&T：14 特征符号、3 基准、最多 5 帧、Upper 50/Lower 200；可吸附尺寸并分组 | drawings |
| 23 | DWT 导出只含前两页、删除视图、版本 2013；DWG/DXF 层名 BORDER_FRAME/BORDER_ZONES/TITLE_BLOCK | drawings |
| 24 | 文档版本不可变；分支末端最多一个 workspace；新 tab 在 active 右侧并激活；tab 顺序共享、active 不共享 | documents |
| 25 | Merge 不能 Undo，只能 revert；受保护 workspace 阻止直接几何修改但允许 version/branch/release metadata | documents |
| 26 | 发布：无审批人→创建者即 Released；有审批人→Submit 生成 Pending 版本；Discard 仅创建者/管理员且仅 Pending | release-plm |
| 27 | 审批：团队 1 人即通过；项目角色 1 票代表角色；个人+角色重复需两次；委派只转个人票 | release-plm |
| 28 | 修订单调递增、可跳号、跳过标签永不可用；Part number ≤128 字符；禁止同 PN 低修订重发 | release-plm |
| 29 | Render：普通输出 2.1MP、Advanced 100MP；Multiple 最多 60 视图；Clear face appearances=2 undo；Decal 每面最多 3 层 | render-other-studios |
| 30 | Measure 12 类型/6 长度单位/2 角度单位；参考系仅桌面；变量仅 Part Studio；动态更新仅 Assembly 且 Section view 下关闭 | view-eval-glossary |

---

## 6. Live 采集优先级（文档不足的部分）

### 6.1 先采“高影响 × 文档缺口大”的页面

| 优先级 | 对象 | 原因 |
|---|---|---|
| P0 | Fillet、Face Blend、Chamfer、Hole、Shell、Extrude、Revolve、Sweep、Loft 的对话框 | 字段最多、默认值/禁用态缺失、当前 partial/gated 最多 |
| P0 | 10 种 Mate + Relations 对话框 | 装配域完全未账本化；DOF/选择顺序必须逐项验证 |
| P0 | Drawing 视图/尺寸/GD&T 对话框 | 工程图域完全未账本化；字段与视觉密度高 |
| P1 | Sheet Metal Model/Flange/Table/Flat View | 折弯表/展开图联动是硬语义；文档图多 |
| P1 | Release candidate/Review Release/Revision history | 状态机/审批/图标语义复杂 |
| P1 | Render Studio 四面板 + Render options | 参数/默认值多，文档已给不少但视觉缺失 |
| P2 | Feature Studio/PCB/CAM | 独立应用/DSL；先确认是否 out-of-scope |
| P2 | Account/Enterprise 设置页 | 权限/套餐徽标缺失；先做服务端模型 |

### 6.2 先采“低文本/低步骤”工具页

文档统计中 15 个工具页 <100 词、21 个页 <3 个操作动词；这些页几乎必须 live：

- Sketch：Point、Parallel、Perpendicular、Horizontal、Vertical、Fix、Concentric、Coincident、Equal、Normal。
- Drawing：Arc Length Dimension、Printing a Drawing。
- View：Previous View。
- 其他：Highlight Boundary Edges、Shaded/Unshaded/Translucent、Perspective View、Hidden Edges、Intersection、Dangling Entities、Analysis Tools、Isometric/Dimetric/Trimetric、Flat Pattern View、Automatic Inferencing、Sheet Metal Form Library。

### 6.3 冲突项必须 live 裁决

- 钣金 Symmetric 端型、Bend relief depth scale 上限、Modify joint K Factor 范围。
- 草图 Insert Image 格式、Slot 尺寸联动、Inscribed Polygon 描述。
- 工程图 Formats 默认 Locked/unlocked。
- 装配 Slider 偏移轴、Gear Mate 列表、Parallel 自由度。
- 账户 Enterprise Teams 成员规则。
- 发布 Approver 权限（Edit vs View）、OnshapeCreated YES/Y、State Released vs Approved。
- 可视化 Shift+方向键 90° vs 3°、Flatten Show distortion 颜色。

### 6.4 Live 证据的产物格式建议

- 每个工具：截图（正常/错误/禁用态）+ DOM/computedStyles + 交互序列（点击/键入/快捷键）+ 选择集/树/体积/撤销结果。
- 文件放私有证据仓；公共仓只放脱敏结论与 `docRef`。
- 对不可逆操作（merge revert、delete workspace、async result delete）必须有预览→确认→审计证据（P0-10）。

---

## 7. 与现有契约/账本的衔接

### 7.1 不新增第二套契约

- Tool spec 是**分析产物**，不是运行时契约；运行时仍走 `LubanFeatureRpcInterface` FeatureOp / `EditTools`。
- Spec 的字段最终映射到 shared DTO（如 `ExtrudeParams`）时，按 P0-04 先 AIRR/ADR；不得直接把 `onshapeLabel` 写进 schema。
- AI Agent 工具必须复用现有 `toolId`（`packages/viewer/src/tools/register-edit-tools.ts` + `Sketch.*`），不得按 spec 自建第二套 API。

### 7.2 能力账本建议新增字段（需 ADR）

当前 ledger 行没有 `docRef/confidence`。建议在不改变状态判定口径的前提下，增加：

```json
{
  "docRefs": ["https://cad.onshape.com/help/Content/PartStudio/extrude.htm"],
  "docEvidence": "doc-explicit | doc-implied | live-required | conflicting | absent",
  "specRef": "tool-specs/partstudio.feature.extrude.json"
}
```

用途：让每个能力行可追溯到文档/规格，避免“账本说 partial 但没人知道依据”。这是 schema 变更，需 ADR；在批准前只在本文/分析目录中出现。

### 7.3 与七维 full 门的关系

- 文档可支撑 UI 表面、字段、流程、部分默认值；不能单独支撑：
  ① UI live 逐项对齐（视觉/禁用态/字段顺序）；
  ③ 后端写/预览/更新/抑制/删除；
  ④ 求解器/内核结果；
  ⑤ 撤销/push/冷重开；
  ⑥ 测试；
  ⑦ strict 示例。
- 因此 tool spec **不能**直接把能力从 `gated/partial` 晋升 `full`；只能作为 ③–⑥ 的设计输入与测试来源。

---

## 8. 建议的落地批次（小步、可验证）

| 批次 | 产出 | 规模 | 验收 |
|---|---|---|---|
| S1 | 草图 56 工具的 spec 骨架（字段/选择/快捷键/可用位置） | 56 JSON | Schema 校验；每 spec 至少 1 条文档断言；未知字段列 openQuestions |
| S2 | 21 个 FeatureType 的 spec + 分支矩阵 | 21 JSON + 分支表 | 与 `feature-depth-matrix.md` 对齐；每分支标 `doc-explicit/live-required` |
| S3 | 10 种 Mate + 4 Relations 的 spec | 14 JSON | DOF/offset/limits/选择顺序逐项；与装配文档 §4.8 对拍 |
| S4 | 9 视图 + 13 尺寸 + 7 注释 + 6 表格的 spec | 35 JSON | 源视图矩阵/捕捉点/GD&T/表格列；与工程图文档对拍 |
| S5 | 发布状态机 + 审批/修订/零件号/配置的 spec | 1 状态机 + 6 子 spec | 状态迁移/审批规则/编号算法断言 |
| S6 | Render/Measure/Analysis 的 spec | 5+12+11 JSON | 参数族/默认值/只读语义；标 live-required |
| S7 | 全局 UI 契约 spec | 8 JSON | selection/numeric/dialog/undo/config/in-context/shortcuts/performance |

> 每个批次都先做**只读分析产物**，不改运行时；再按 AIRR 决定是否接线。不要一次性生成 300+ JSON 后才发现 schema 不适配。

---

## 9. 非目标

- 本文不替代 `docs/ONSHAPE-LIVE-REPLICATION.md` 的 live 证据流程。
- 本文不声称文档中的每个默认值/选项都正确；冲突项已登记，必须 live 裁决。
- 本文不授权新增 FeatureType/RPC/schema/渲染管线/求解器。
- 本文不建议把装配/工程图/渲染/账户等域直接塞进当前 Part Studio 主线；范围见 `02-CAPABILITY-GAP.md`。
- 本文不授权 commit/push/publish。
