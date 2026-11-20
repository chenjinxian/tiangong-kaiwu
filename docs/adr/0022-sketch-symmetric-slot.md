# ADR-0022 — Sketch symmetric constraint + slot tool

- 状态：**Accepted（2026-11-19 Owner 批准 S1 对称约束 + S2 槽工具）；
  2026-11-20 §2.7 S2e 由 ADR-0023 解锁整圆/闭合环槽**
- 日期：2026-11-19
- 关联：AIRR `docs/superpowers/specs/2026-11-19-sketch-entity-constraint-expansion-airr.md`；
  AIRR `docs/superpowers/specs/2026-11-20-slot-width-constraint-airr.md`；
  **ADR-0023（`slotWidth` 槽宽约束）**；
  计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1–W2
- 影响仓：`luban-cad/packages/shared`（1.81.0 additive；1.83.0 `slotWidth`）、
  私有 `luban-backend`（SolverTypes/normalizer/SlvsSolver）、
  `luban-cad/apps/web`（约束工具/ribbon/i18n/e2e）
- 先例：ADR-0004（草图约束契约）、ADR-0020（shared additive bump）

## 1. 背景

Onshape 约束飞菜单有「对称」（shift+q）与「槽」工具；当前产品两者均 gated：
- `symmetric` 不在 `SketchConstraintDto.kind` 联合，后端无映射；
- 槽工具无 UI，但可用现有 line/arc/circle + 约束组合表达。

libslvs 已有 `SLVS_C_SYMMETRIC_LINE`，且本仓 `mirror` 约束已用它实现
点对/线对/弧对/样条对关于轴线对称。对称约束的求解语义与 mirror 相同，只是
用户入口/语义不同；无需新求解器原语。

## 2. 决策

### 2.1 S1 对称约束

1. **契约**：`SketchConstraintDto.kind` 增加 `"symmetric"`；refs 恰 3：
   `[实体A, 实体B, 轴线(line)]`，A/B 同型（point/line/arc/spline），与 mirror
   相同槽形；不携带 value。shared 版本 additive bump **1.81.0**；旧后端收到
   `symmetric` 必须明确拒收且零变更。
2. **后端**：`SolverTypes.ts` kind 联合/zod/槽位校验按 mirror 同口径；
   `SketchWireNormalizer` 按 mirror 同口径透传；`SlvsSolver` 的 `mirror` case
   扩展为 `case "mirror": case "symmetric":`，方程与归因完全复用
   `SLVS_C_SYMMETRIC_LINE`。
3. **UI**：新增 `SymmetricAddTool`（toolId `Sketch.Constraint.Symmetric`，
   icon `icon-constraint-symmetric`），槽形
   `point+point+line`、`line+line+line`、`arc+arc+line`、`spline+spline+line`；
   满槽直接 `updateSketch` 追加约束；拒收保持拾取状态。
   `sketchSymmetric` 能力 gated→full；ribbon 已有入口/快捷键 shift+q。
4. **证据**：shared 单测、backend solver/normalizer 单测、web 槽位单测、
   真栈 e2e（两 off-axis 点 + 固定轴线/首点 → 第二点反射落库；完成/重开）。

### 2.2 S2 槽工具（live 证据修正，2026-11-19）

- **live 入口**：槽不是独立顶栏按钮，而是「偏移」工具组下拉的第二项
  （`偏移 o` / `槽`）；tooltip = 「槽在连续草图图元周围创建槽。」
  （私有证据 `ui-evidence/slot-probe-20261119-*`）。
- **交互**：选择一条连续草图链（line/arc 相连），再以光标/宽度确定槽宽并
  提交；未观察到首击即弹对话框。该语义是**沿连续链生成槽轮廓**，不是
  早期假设的 center-to-center/overall 两点式。
- **决策**：S2 按「链式槽偏移」实现，不新增实体类型；工具一次
  `updateSketch` 写入 line/arc 链 + 槽轮廓，可撤销。必须先补齐
  live 交互证据（链选择、宽度预览/输入、确认、失败/取消、undo），否则
  `sketchSlot` 保持 gated，不得用近似两点槽冒充 full。
- 早期 center-to-center/overall 设计作废；AIRR §10 同步修正。

### 2.3 S2 首切片落地（2026-11-19，单条直线）

- **live 证据**（私有 2026-11-19 槽探针：截图 + DXF）：选一条
  边 → 工具立即预览“体育场”槽（两平行边界 + 两端半圆帽），默认 **Ø20**；光标移动
  不改宽；`Enter` 提交；**原中线保留**；双击 Ø20 尺寸可改（改 30 后边界/帽半径联动）。
  DXF 实测（中线 (90,25)→(-90,25)、w=20）：边界 y=15/35、两帽 r10（右帽 270→90、
  左帽 90→270）。多段连续链/弧中线/闭合环槽/联动等宽槽的 live 交互**未采到**。
- **实现范围**：`Sketch.Slot`（偏移 ▾ 第二项）首切片只支持**单条直线中线**；其余
  拾取（弧/圆/多段链/闭合轮廓）在工具内 toast 明确拒收，不近似冒充。
- **几何/约束**：原中线保留；新增两条 ±Ø/2 平行边界线 + 两个半圆帽弧（帽心与中线
  端点 coincident）；4 个 tangent、2 个 parallel、1 个 diameter（=宽度）与 1 个
  equal（两帽等半径）；宽度由 Ø 尺寸参数化驱动。
- **事务**：一次 `updateSketch` 提交（既有实体/约束原样，槽追加）；失败零变更；
  宽度修改走既有 `updateSketchConstraint`，真栈原生 UI Undo/Redo 可逆。
- **验证**：私有后端 solver conformance `SlotSolver` 2/2（Ø20→±10/r10，Ø30→±15/r15）；
  web 纯逻辑 4/4、工具接线 2/2；真栈 `e2e/sketch-slot.spec.ts` **2 passed**（真实
  ribbon/画布 → 槽创建 → Ø30 参数化 → UI undo/redo → finish+reload 持久）。
- **状态口径**：入口能力 `sketchSlot` 为 full（入口可用），能力账本 `ui.sketchSlot`
  保持 `partial` 并列出未采证子域（多段链/弧圆/环槽/联动槽）。

### 2.4 S2b 相连折线链槽落地（2026-11-19，live DXF 同构）

- **live 证据补充**（私有 2026-11-19 链探针截图 + DXF）：先框选/叠加选择
  **相连的 3 条直线**，再打开「偏移 ▾ → 槽」；工具激活即以预选链为输入，
  沿整条链显示一个槽预览（单 Ø20），Enter 一次提交；原中线全部保留。
- **DXF 字形**（宽 20）：3 条中线 + 6 条边界线（每段两侧）+ 2 个半圆帽弧
  （r=10，圆心=链两端点）+ 2 个外侧圆角弧（r=10，圆心=内顶点）；**内顶点外侧
  为圆角，内侧为两条偏移线尖角斜接**；仍只有一个 Ø 尺寸，所有弧等半径。
- **实现**：`buildLineChainSlotDraft`（纯逻辑，预览/提交同源）。
  - 仅接受**开放、无分支、直线成员**的链；圆弧/整圆/闭合环/分支/共线折点/
    未解算端点显式拒收（toast），不近似。链范围=用户预选范围，未选中的相连
    线不并入。
  - 外侧圆角弧：起点角=外侧法向角，有向扫角 `sign(cross)·acos(dot(n_prev,n_next))`
    （允许负角，与 DXF 同几何）；内侧斜接=相邻偏移线交点。
  - 约束：帽心/角心↔中线端点 coincident（链顶点唯一焊接来源）、边界↔中线段
    parallel、端点/弧端点 coincident、帽-边界与角弧-边界 tangent；一个
    diameter（=宽度）。后端 `equal` 契约恰 2 个同型实体 → 以首帽为锚**逐对**
    展开等半径（等价语义）。3 段链草稿 = 14 实体 + 34 约束。
- **预选/选择语义修复**（本切片真栈发现）：
  1. `SketchEntityPicker` 只在 pointerdown **target 是视口画布**时启动拾取/框选；
     ribbon 飞菜单等浮层叠在画布矩形上方时，旧逻辑把菜单点击当空白点击并
     **清空预选**（槽工具拿不到链）。
  2. `useOnshapeSelection` 在 paused（草图/对话框）期间工具激活时保留
     `sketchEntity` 选择（仍清 body/树/selectionSet）——草图会话内的预选是
     草图工具的合法输入（live：槽以预选链生成）。
- **验证**：web 纯逻辑 `sketch-slot-logic` **9/9**（单线 4 + 链 5）、
  `useOnshapeSelection` **14/14**（新增保留预选用例）；私有后端
  `SlotChainSolver` **2/2**（Ø20 → 内斜接 (90,10)/外边界 x=110/全部 r10；
  Ø30 → 外移 5 mm、r15）；全量 web **2647/2647**、tsc(src/e2e)/eslint 绿；
  真栈 `e2e/sketch-slot.spec.ts` **3 passed（限流优化后 1.2 min；首跑 2.9 min
  含 429 重试，含链用例）**——真实画布连续绘制 3 段 → 框选 3 段 → 偏移 ▾ →
  槽（Enter 一键提交，14 实体/34 约束）→ Ø30 参数化 → finish + reload 持久。
  e2e 已缓存 sketchId 并以 1–5 s 间隔轮询 `getSketch`，不绕过 MS 限流。
- **状态口径**：入口能力 `sketchSlot` 仍 full；能力账本 `ui.sketchSlot` 保持
  `partial`，缺弧/圆中线链、闭合环槽、分支链、独立多曲线联动槽、live 宽度
  光标拖拽（本切片宽度=默认 Ø20 + 尺寸编辑）。

### 2.5 S2c 圆弧中线槽落地 + 整圆中线 blocked-design（2026-11-20 live）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/`，截图 +
  `circle-slot.dxf` / `arc-slot.dxf`）：
  - **整圆中线**：选圆 → 槽 → 预览为两条**同心圆** R±w/2，无端帽；宽度为
    **线性 20**（两圆之间的径向宽度，不是 Ø）；原中心圆保留。DXF 实测
    R=21.1263 → 内 11.1263 / 外 31.1263（差恰 10）。
  - **圆弧中线**：选开放弧 → 槽 → 预览为两条同心偏移弧（R±Ø/2，同
    start/sweep）+ 两个**半圆帽**（半径 Ø/2、圆心=弧端点）；宽度为 **Ø20**
    （半圆帽直径）；原中线保留。DXF 实测 R=32.1728 → 22.1728 / 42.1728，
    两帽 r=10，帽心=源弧两端点，帽扫 180°。
- **S2c 实现（圆弧槽，`buildArcSlotDraft`）**：
  - 仅开放圆弧（|sweep|<2π；整圆弧按整圆语义拒收）；源弧半径 ≤ 半宽 →
    `degenerateRadius`；未解算 → `unsolvedCurve`。
  - 实体：2 帽心 point + 2 偏移弧 + 2 帽弧（共 6）；约束：帽心↔源弧端点
    coincident ×2、偏移弧↔帽端点 coincident ×4、源弧↔两偏移弧 concentric ×2、
    帽↔两偏移弧 tangent ×4、capStart diameter=w、两帽 equal（共 14 条）。
  - **宽度参数化不需要 offset 数值约束**：concentric + coincident + tangent 的
    几何关系把偏移弧半径强制为 R±帽半径；单个 Ø 改值同时驱动两偏移弧与两帽。
  - 帽扫角方向随源弧 sweep 符号确定：起点帽始终从外侧点绕到内侧点
    （sweep=-sign·π），终点帽始终从外侧点绕到内侧点（sweep=+sign·π）。
- **整圆槽 blocked-design（2026-11-20 当日已由 §2.7 / ADR-0023 解锁）**：live
  宽度是两同心圆之间的**线性距离**；S2c 时 solver-neutral 只有 line/line、
  arc/arc 的 `offset`，无「同心圆径向宽度」原语。用两个独立 radius 尺寸可出
  几何但不符合 live 的单一线性宽度语义；故当时 `sketchSlot` 对整圆中线
  **诚实拒收**，随后按 P0-04 出 AIRR/ADR（`slotWidth` concentric）并落地。
- **验证**：web 纯逻辑 `sketch-slot-logic` **13/13**（单线 4 + 链 5 + 圆弧 4，
  含负扫角镜像与坍缩/整圆弧/未解算拒收）；私有后端 `ArcSlotSolver` **2/2**
  （Ø20 → r40/60/10；Ø30 → r35/65/15）；全量后端 slot 相关 **6/6**；
  真栈 `e2e/sketch-slot.spec.ts` **4 passed（2.0 min，含单线/链/圆弧三用例）**；
  全量 web **2651/2651**（首跑 1 例 flake、复跑全绿，未复现）、tsc(src/e2e)/
  eslint 绿。圆弧 e2e 走真实 ribbon「偏移 ▾ → 槽」+ 画布单击弧中点 + Enter，
  断言 5 弧/14 新约束/Ø30/reload。
- **状态口径（S2c 时点）**：`ui.sketchSlot` 仍 partial；整圆中线 =
  blocked-design（§2.7 当日解锁），闭合环/分支/独立多曲线联动/宽度拖拽
  当时仍缺证据或设计。

### 2.6 S2d 闭合环槽证据 + blocked-design（2026-11-20 live）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/ring-slot.dxf` +
  state-31..43）：框选闭合矩形 4 边 →「槽」→ 预览由**外侧圆角矩形**（外扩
  Ø/2，四角为 r=Ø/2 的圆角弧、弧心=顶点）与**内侧尖角矩形**（内缩 Ø/2、
  斜接）组成；**无端帽**；单 Ø20；原 4 条中线保留。DXF = 12 LINE + 4 ARC：
  外边界 4 线（顶点法向平移，不被圆角缩短）+ 4 角弧；内边界 4 线裁到斜接点。
- **实现尝试与失败根因（原型已回退，未发布任何半成品）**：
  - 闭合链排序/环槽几何（外圆角+内斜接）可生成与 DXF 同构的 16 实体/40 约束；
  - 但把约束集交给后端求解器后：**内环没有被宽度尺寸驱动**——闭合环没有
    端帽，内侧边界只与中线平行、彼此斜接，法向距离是自由 DOF。实测 Ø20→30
    时外边界/角弧移动到 ±15，内边界仍停在 10，status=underconstrained（dof=4）。
  - 用逐侧 distance/offset 约束补内环会引入 live 不存在的额外尺寸，且其数值
    无法与 Ø 保持单一驱动关系（无算术链接）。因此**不能**用现有原语严格实现
    闭合环槽的宽度参数化。
- **决策（S2d 时点）**：闭合环槽 = **blocked-design**；`Sketch.Slot` 继续对
  闭合链诚实拒收（`unsupportedChain`），不提供静态/近似环槽。整圆中线槽是
  同类阻塞（同心圆径向宽度原语缺失）。
- **后续路径**：`docs/superpowers/specs/2026-11-20-slot-width-constraint-airr.md`
  （当日 Owner 批准）提出 solver-neutral `slotWidth` 约束，用一个可见宽度
  同时驱动闭合环内外边界与整圆槽两同心圆；**实现见 §2.7 / ADR-0023**。
- **验证**：仅证据与设计结论；无新增产品代码。私有 DXF/截图与设计记录已归档。
- **状态口径（S2d 时点）**：`ui.sketchSlot` 仍 partial；closed ring / full
  circle 均列为 blocked-design 子域（§2.7 完结后两项已转实现，其余缺口保持）。

### 2.7 S2e `slotWidth` 落地：整圆槽 + 闭合环槽（2026-11-20，ADR-0023）

- **契约/后端**：shared **1.83.0** 新增 `SketchConstraintDto.kind="slotWidth"`
  + `slotMode: "concentric"|"ring"`；私有后端 `SolverTypes`/`SketchWireNormalizer`/
  `SlvsSolver` 全链 + `updateSketchConstraint` 白名单。ring 展开 2N 条
  `PARALLEL + PT_LINE_DISTANCE(±value/2)`；concentric 展开 2 圆心重合 + 8 条
  隐藏径向构造（径向线/点在圆上/点线距/点距 = value/2）。一个可见宽度同时
  驱动两侧，无第二组常量。
- **web**：`orderLineChain` 支持闭环（n 个 junction、无自由端、n 段遍历、
  回环校验）；`buildClosedRingSlotDraft`（外侧圆角/内侧斜接/无端帽；凸环
  守卫、内环退化拒收）；`buildCircleSlotDraft`（源圆保留 + 内/外同心圆）；
  `SketchSlotTool` 接受整圆/闭合链，预选剔除点实体（picker 对点也标
  `part=curve`）；`slotWidth` 尺寸标注（环 `⌀`、整圆线性）+ 双击编辑
  （`EDITABLE_CONSTRAINT_KINDS` 扩项）。
- **验证**：shared **326/326**；私有后端 `SlotWidthSolver` **3/3**、
  `SketchSlotWidthUpdateFlow` **2/2**、既有 slot 套件 **9/9**；web
  `sketch-slot-logic` **20/20**、`sketch-annotations` **32/32**、全量 web
  见本轮最终记录；真栈 `sketch-slot.spec.ts` **6 passed（5.8 min）**——
  **整圆**（R30 → 单 slotWidth → 标签 `20`→双击改 `30` → 内/外 15/45 →
  原生 undo/redo → reload）与**闭合环**（4 线框选 → ring → 4 角弧 r10 +
  内外边界 ±10 → 标签 `⌀20`→改 `30` → 四组内外同步 ±15 → reload），
  既有单线/开放链/圆弧用例回归绿；MS 429 按 retry-after 等待，未绕过。
- **状态口径**：`ui.sketchSlot` 保持 partial（弧/样条链、分支链、凹/自交环、
  独立多曲线联动、live 宽度拖拽未覆盖）；整圆/闭合环不再是 blocked-design。
  台账新增 `constraint.slotWidth` partial 行。

### 2.8 S2i 多条互不相连直线的联动等宽槽（2026-11-20 live）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/state-54..57` +
  `docs/SLOT-S2E-MULTI-LIVE-20261120.md`）：两条互不相连水平线一起框选 →
  槽工具为**每条线各生成一个完整体育场槽**（不是当成一条链）；草图中只有
  **一个 Ø20**，引线跨两个槽的帽弧；原两条中线均保留。
  **证据缺口（如实登记）**：该多槽情况下 Ø 的直接编辑联动在本次会话未复现
  （页面持续 "Poor connection…"，标签双击/尺寸工具点击均未打开编辑器）；
  单槽改宽已在 S2 实测（`live-state-29/30`）。本切片按「唯一宽度尺寸 +
  全部帽等半径」的实测结构建模，不宣称已直接观察到双槽同步改宽。
- **实现**：`buildMultiLineSlotDraft` 逐线复用 `buildLineSlotDraft`；仅保留首槽
  的 diameter，去掉其余槽的 diameter（各槽 capA↔capB equal 保留），再以首槽
  起帽为锚补跨槽 equal（首槽起帽 ↔ 各槽起帽）——单个 Ø 改值经 equal 传递
  同步全部帽。工具在预选直线两两不相连（junction=0）时走该构建器；混合
  「部分连通 + 部分独立」、圆弧、分支链继续诚实拒收。
- **验证**：web 纯逻辑 `sketch-slot-logic` **23/23**（多独立线 3 用例：
  12 实体 / 28 约束 / 单 diameter + 3 equal 全帽连通 / 两槽几何 / 失败矩阵）；
  全量 web **2665/2665**、tsc(src+e2e)/eslint 绿；真栈 `sketch-slot.spec.ts`
  **7 passed（5.1 min）**——两条互不相连线 → 框选 → 槽 → 4 帽弧 r10 / 6 线 /
  单 Ø20 → `updateSketchConstraint` 改 30 → 两槽全部半径 15、边界垂距 15 →
  finish+reload 持久；既有单线/链/圆弧/整圆/闭合环用例回归绿。
- **状态口径**：`ui.sketchSlot` 仍 partial；「多条互不相连曲线联动的等宽槽」
  已从 missing 移除；弧/样条链、分支链、凹/自交环、live 宽度拖拽仍缺。

## 3. 数据/事务

- 事实源：草图 params（实体+约束）；求解结果派生。
- 写路径：`updateSketch` 单一 FeatureOp；满槽/工具确认一次提交；失败零变更。
- 撤销：一次事务；e2e 断言 undo/redo。
- 无 BIS schema/迁移；旧库无 symmetric 约束 = 不需要迁移。

## 4. 测试与验收

- shared：kind 联合、1.81.0、旧载荷兼容（无 symmetric 时不变）。
- backend：`SolverTypes` 接受 point+point+line；normalizer 透传；SlvsSolver
  在两 off-axis 点 + 固定轴线时反射；非法组合拒收。
- web：槽位纯逻辑（三槽、错型拒收）、工具注册/能力 full、i18n。
- 真栈：`sketch-symmetric.spec.ts` 两 off-axis 点 + 固定轴线/首点 → 第二点
  反射；完成草图/重开仍存在；撤销。
- S2：待 live 交互补齐后新增 `sketch-slot.spec.ts`：连续链选择、宽度预览/输入、
  提交后的实体/约束/面积、取消不落库、undo、冷重开。

## 5. 回滚

- 能力 flag：`sketchSymmetric`/`sketchSlot` 可回 gated；工具注册可移除。
- shared 版本回退需旧库数据只读处理；symmetric 数据不得静默丢弃。
- 后端未知 kind 拒收；normalizer/SlvsSolver 变更可回退。

## 6. 结论

S1 复用已有求解器路径，风险低；S2 组合现有实体，无内核/契约风险。两项
按本 ADR 实施，不涉及 ACIS/几何内核变更。
