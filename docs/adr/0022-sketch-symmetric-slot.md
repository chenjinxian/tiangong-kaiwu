# ADR-0022 — Sketch symmetric constraint + slot tool

- 状态：**Accepted（2026-11-19 Owner 批准 S1 对称约束 + S2 槽工具）；
  2026-11-20 §2.7 S2e 由 ADR-0023 解锁整圆/闭合环槽；
  2026-11-20 §2.11/§2.12（S2m 分支链 / S2n 闭合 line+arc 环，shared 1.84.0）已实施并真栈验收；
  2026-11-20 §2.13/§2.14（S2p 线树槽 / S2q 多连通分量共享单 Ø）已实施并真栈验收；
  2026-11-20 §2.15（S2u 含圆弧的混合线树）已实施并真栈验收**
- 日期：2026-11-19
- 关联：AIRR `docs/superpowers/specs/2026-11-19-sketch-entity-constraint-expansion-airr.md`；
  AIRR `docs/superpowers/specs/2026-11-20-slot-width-constraint-airr.md`；
  **ADR-0023（`slotWidth` 槽宽约束）**；
  计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1–W2
- 影响仓：`luban-cad/packages/shared`（1.81.0 additive；1.83.0 `slotWidth`；
  1.84.0 ring 中线 line/arc、N≥2）、
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

### 2.9 S2j 凹多边形闭合环槽（2026-11-20 live）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/state-103..107` +
  `concave-slot.dxf`；记录 `docs/SLOT-S2J-CONCAVE-LIVE-20261120.md`）：6 段 L 形
  闭合折线（1 个凹角）框选 → 槽，工具接受，生成无端帽环带，单个 Ø20。
  DXF = 18 LINE + 7 ARC：6 条源中线 + 12 条边界 + 6 个顶点各一条 r=10 转角弧
  （凹角的 90° 弧被导出为两条共圆分解弧 75.78°+14.22°，几何等价）。
- **逐角规则**（与开链/直线环一致）：每个顶点「转向外侧」为 r=w/2 圆角弧
  （弧心=顶点），「转向内侧」为两侧偏移线交点；凸角外侧在右、**凹角外侧在左**
  ——不能假设外侧恒为同一侧，必须逐角按转向判定。
- **实现**：`buildClosedRingSlotDraft` 去掉「所有角同向」守卫；逐角计算
  `outsideSide = cross>0 ? -1 : +1`；边界端点按角点取弧端点/斜接点；两组边界
  环（组A=角 0 外侧、组B=另一侧）各自做非零长 + 与源环同向的面积守卫
  （宽度过大坍缩/反向 → degenerateRadius）；slotWidth refs 仍为
  [N 中线, N 组A, N 组B]（后端按每条边界平行 + 有符号垂距 ±w/2 校验，与哪组
  是「外」无关）。自交环仍无 live 证据：保守拒收/由退化守卫兜底。
- **验证**：web 纯逻辑 `sketch-slot-logic` **26/26**（+凹环 3：实体/约束结构、
  凸角右弧/凹角左弧几何、宽度过大坍缩拒收）；全量 web **2668/2668**、
  tsc(src+e2e)/eslint 绿；真栈 `sketch-slot.spec.ts` **8 用例分两个限流窗口全绿**：
  窗口 A **6 passed**（含凹 L 形闭合链：6 源线 RPC → 打开草图 → 框选 → 槽：
  6 角弧 r10 / 12 边界 / 单 slotWidth·ring Ø20 → 重新取写租约 RPC 改 30 →
  全部弧半径与边界垂距 15 → finish+reload 持久），窗口 B（按 429
  `retryAfter=210 s` 等待后）`闭合矩形环 + 多独立线` **2 passed**。一次性连跑
  8 用例会超过 MS 100 req/15min 预算（429），按纪律等待重跑，未绕过限流。
- **状态口径**：`ui.sketchSlot` 仍 partial；「凹多边形闭合环」已从 missing 移除，
  仅剩自交环（无证据）；弧/样条链、分支链、live 宽度拖拽仍缺。

### 2.10 S2h 线+弧混合开放链槽（2026-11-20 live）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/state-94..98` +
  `mixed-slot.dxf`；记录 `docs/SLOT-S2H-MIXED-LIVE-20261120.md`）：一条直线 +
  从线端点起画的 3 点圆弧（接缝 `最小距离 0.000 mm`、`交点角度 33.22 deg`）→ 槽，
  生成**一个**连续槽；DXF = 3 LINE + 6 ARC（源线/源弧保留 + 2 线边界 + 2 同心
  偏移弧 R±10 + 2 半圆帽 + 1 转角弧）。
- **接缝语义**（DXF 实证）：转向外侧为 r=w/2 转角弧（弧心=接缝顶点、扫角=
  两侧偏移方向夹角，实测 33.22°）；转向内侧为线偏移与弧偏移的**交点**——
  弧偏移的起始角被裁剪（270°→272.12°），线边界止于该交点；与直线链的
  “外侧圆角/内侧斜接”同一规则，只是内侧由两直线交点推广为两偏移曲线
  （线-线/线-圆/圆-圆）交点。两端半圆帽、全部槽弧 r=10、单 Ø。
- **实现**：新增 `sketch-slot-mixed-logic.ts`：
  - `mixedChainFromSelection`：line/arc 端点焊接图、开放无分支、至少 1 线 +
    1 弧、弧必须按 authored 方向 start→end 遍历；反向弧/闭环/全弧/非 line・arc
    拒收。
  - `buildMixedChainSlotDraft`：每段两侧偏移（线→平行线；弧→同心 R±w/2、
    同角范围）；接缝逐角判定外侧转角弧/内侧交点并裁剪（线-圆、圆-圆取离顶点
    最近交点；相切接缝两侧直连）；两端帽方向背离链体（起点帽左→右、终点帽
    右→左，扫 180°）；线边界 `parallel`、弧边界 `concentric`；单 Ø = 首帽
    diameter + 其余帽/转角弧逐对 equal；原中线保留。
  - `SketchSlotTool` 多选路径：含 arc 时走该构建器；纯直线仍走原链/多独立线。
- **验证**：`sketch-slot-mixed-logic` **5/5**（排序；反向弧/闭环/全弧/断链拒收；
  几何：内侧交点 (88.7298,10)、左偏移弧 r40 起 14.4775°→90°、右偏移弧 r60
  0°→90°、转角弧 −90°→0°、两帽方向与半径）；全量 web **2673/2673**、
  tsc(src+e2e)/eslint 绿；真栈新增 `线+弧混合链` e2e **1 passed（43.8 s）**
  ——RPC 建线+弧 → 框选 → 槽：3 线/6 弧（2 偏移 r40/r60、2 帽 r10、1 转角 r10）/
  单 Ø20 → `updateSketchConstraint` 改 30（新取写租约）→ 偏移 35/65、帽/转角
  r15 → finish+reload 持久。
- **状态口径**：`ui.sketchSlot` 仍 partial；「圆弧参与的相连链槽」已从 missing
  移除。分支链与闭合混合链的旧缺口已由 2026-11-20 干净重探针（私有
  `SLOT-S2L-CLOSEDMIX-BRANCH-LIVE-20261120.md`）与 §2.11/§2.12 取代：旧 S2k
  “闭合混合环”探针把线画在**弧上第三点**（T 形自交点，DXF 已解码，作废）。
  仍缺：自交环、缺口 ≥180° 的分支、弧分支/多毂分支、混合部分连通、live 宽度
  拖拽、slotWidth 表达式。

### 2.11 S2m 单毂分支链槽（2026-11-20 live `branch-slot.dxf`）

- **live 证据**（私有 `docs/SLOT-S2L-CLOSEDMIX-BRANCH-LIVE-20261120.md`；
  `branch-input.dxf`/`branch-slot.dxf`、`state-153` 预览）：三条线共点 P
  （输入 DXF 端点聚类 `P x3`）→ 槽工具**接受**，结果 = 9 LINE + 3 ARC：
  - 源 3 线保留；每条线两侧 ±w/2 偏移（6 条边界线）；
  - **尖端保留 r=w/2 半圆帽**（帽心=源线尖端）；
  - **毂部相邻臂的偏移线两两斜接**（三个交点，无转角弧）；P 端半圆帽并入
    并集内部而消失；
  - 单一 **Ø20** 标注（引线指向某条帽弧）。
  即结果恰为**三条 stadium 的并集轮廓**（证据几何逐点吻合：斜接距 P
  = half/sin(缺口/2)，如 10/sin(57.53°)=11.853；帽起点角=右法向）。
- **范围/拒收**：仅**单毂**（≥3 条线、每条恰一个端点落在同一焊接点、其余
  端点自由）、全直线、所有相邻缺口**严格 <180°**（缺口 ≥180° 时并集边界会
  切换为绕毂 r=w/2 圆弧，未采证据）；多毂树、弧参与、共线臂、自由端共点 →
  诚实拒收。
- **实现**（纯前端，无契约/后端变更）：`sketch-slot-branch-logic.ts`：
  - `branchChainFromSelection`：端点聚类 → 唯一公共端点簇（≥3、每条线各一）
    + 其余端点全自由；极角排序并校验相邻缺口 `<π`。
  - `buildBranchChainSlotDraft`：每个缺口取「前臂左偏移线 ∩ 后臂右偏移线」
    斜接点（并要求交点沿两臂的投影落在臂长内，否则 degenerateRadius）；
    尖端帽从右偏移点扫 +π（背离毂部）；`parallel` 每臂×两侧、帽心↔源线尖端、
    帽端点/切线、斜接重合；单 diameter + 其余帽逐对 equal。
  - 顺带修复混合链解析的**反向直线切向**：直线两端的切向取遍历方向
    （entry→exit），反向遍历时不得沿用 p1→p2（闭合环的线正常为反向遍历）。
- **验证**：`sketch-slot-branch-logic` **5/5**（识别/拒收矩阵；与 live DXF
  逐坐标吻合：斜接点 (118.1568,−183.5366)/(108.1568,−166.1941)/
  (98.1568,−183.5366)、尖端帽角 −57.5288°/57.5288°/180°；单 diameter + 2
  equal + 6 parallel + 6 tangent + 12 coincident）；真栈新 e2e **1 passed
  （42.8 s）**：RPC 建 Y 分支（毂 (0,0)，尖端 (−40,20)/(40,20)/(0,−40)）→
  框选 → 槽：3 帽 r10 + 6 平行边界线 + 单 Ø20 → `updateSketchConstraint`
  改 30（帽/边界同步）→ finish+reload。
- **状态口径**：`ui.sketchSlot` 仍 partial；「分支链槽」从 missing 移除，
  补列「缺口 ≥180° 分支 / 弧分支 / 多毂树」为未采证据项。

### 2.12 S2n 闭合 line+arc 混合环槽（2026-11-20 live；shared 1.84.0）

- **live 证据**（同一私有记录；`closed-mix2-input.dxf` 输入严格焊接：
  1 LINE + 1 ARC，线两端 = 弧两端、误差 1e-14；`closed-mix3-slot.dxf` 结果）：
  半圆/大弧 + 弦组成的闭环 → 8 实体：
  - 源线/源弧保留；**无端帽**；
  - 外侧边界：弧 R+w/2（半径 42.0166=32.0166+10）+ 平行线（外移 10）；
  - 内侧边界：弧 R−w/2（22.0166）+ 内移线（两端被子弧交点裁剪）；
  - 每接缝：**外侧 r=w/2 圆角弧**（sweep=两侧偏移方向夹角 45.76°）+
    **内侧斜接**（线-圆交点）；
  - 单一 **Ø20** 宽度标注（预览/提交均为 Ø），正常驱动弧/线两侧。
- **契约**（shared **1.84.0**，additive 语义扩展）：`slotMode="ring"` 的
  N 条中线扩展为 **line/arc**，**N≥2**（闭合混合环最小两段）；每条边界须与
  对应中线同型、同一侧。旧载荷（全 line、N≥3）不变；旧后端遇到弧型 ring
  会按类型门拒收且零变更。
- **后端**（solver-neutral 扩展）：ring 逐源处理——
  - 线中线：`PARALLEL + PT_LINE_DISTANCE(±value/2)`（原口径）；
  - 弧中线：两侧边界弧与中线圆心重合 + 与 concentric 同构的隐藏径向构造
    （径向线/源圆上点/两边界圆上点/点在线/点距=w/2，共 10 条内部方程），
    即用「同角径向点对 + 点距」表达 libslvs 缺失的半径差；
  - `internalConstraintCount` 按源类型计（线 4 / 弧 10）；求解后 verify
    按「同心 + |Δr|=w/2 且两侧异号」校验；`SolverTypes`/normalizer 类型门
    同步为「中线 line/arc + 边界同型 + refs 不重复」。
- **前端**：`sketch-slot-mixed-logic.ts` 新增
  - `closedMixedChainFromSelection`：端点两两焊接成单环（接缝数=n）、弧必须
    按 authored 方向遍历——**试两个环向**，取能让所有弧正向前进的方向；
    两向都有反向弧 → 拒收；
  - `buildClosedMixedRingSlotDraft`：每段两侧偏移（弧用
    `R − side·sign·w/2`）、逐接缝外角弧/内侧交点裁剪（新增接缝 i=n 回环
    处理）、`parallel`/`concentric`、单 `slotWidth` ring
    refs=[N 源, N 左侧, N 右侧]；守卫：弧半径容纳半宽、内侧交点存在、边界
    非退化、两边界环与源环同向且面积非零（采样面积）；
  - 顺带硬化 `trimBoundary`：裁剪角归一到与当前扫角连续（大扫角跨 0/2π
    不得改写另一支——live 弧形 a=180.763→449.237）。
  - 标注：ring 的弧边界取外弧角中点径向跨带、仍显示 `⌀`；`n≥2` 下限。
  - 工具分派：多选含弧 → 先开放混合链，失败再试闭合混合环。
- **验证**：后端 `SlotWidthSolver` **5/5**（新增弧环夹具 R=40：w20 → 外
  50/内 30，w30 → 外 55/内 25、角弧 r10→r15；类型门拒收）；web 单测
  `sketch-slot-mixed-ring-logic` **5/5**（与 live DXF 逐坐标
  吻合：内弧 r22.0166 a=190.9242→439.0758、内线端点 (−124.9096,−13.2669)/
  (−150.6996,−39.0569)、外线 (−135.7267,4.2003)/(−168.1668,−28.2398)、
  角弧 89.237→135 与 135→180.763）；真栈新 e2e **1 passed（43.6 s）**：
  半圆 r40 + 弦 → 框选 → 槽：5 弧/3 线/单 slotWidth、标签 `⌀20` → 标签双击
  改 30（弧 55/25、角弧 r15、线 ±15、内线 |x|=20）→ finish+reload。
- **状态口径**：闭合混合链从 missing 移除；剩自交环、样条中线环、弧分支、
  live 宽度拖拽（缺口 ≥180° 分支/多毂树/混合部分连通已由 §2.13/§2.14 收口；
  slotWidth 表达式由 ADR-0020 S2r 收口）。

### 2.13 S2p 一般线树槽（2026-11-20 live S2o；宽缺口绕毂弧 + 多毂树）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/s2oA-wide-branch-*`、
  `s2oD-tree-*`；记录 `docs/SLOT-S2O-TREE-COMPONENTS-LIVE-20261120.md`）：
  - A：毂 P=(−46.221,−43.610)，三臂尖端 T1/T2/T3 → 三臂方向锥 62.745°，
    **宽缺口（反向 297.255°）** 的槽边界不是斜接而是**绕毂圆弧**：
    圆心=毂、r=w/2、起点 149.055°、扫 **117.255° = 180° − 62.745°**（= 180°
    减去最小臂锥角）；窄缺口两处仍为斜接；三尖端半圆帽。结果 9 LINE + 4 ARC。
  - D：5 线双毂树（P 3 臂 + C 3 臂）→ 10 边界线 + 4 帽、两毂全斜接（各缺口
    均 <180°）、无毂弧。
- **实现**：新 `sketch-slot-tree-logic.ts`——按端点焊接聚成一棵树（同线两端
  共点/断连/环拒收；V−1=E 且须 ≥1 度≥3 节点）；逐节点取入射臂的**指向方向**，
  按角序求缺口：
  - 缺口 <180° → 前一臂左偏移 ∩ 后一臂右偏移斜接（解析交点 + t/s 投影守卫）；
  - 缺口 >180° → 绕毂圆弧：取所有臂「后退半平面」交集跨过的弧段（等效
    `180° − 最小锥宽`），起止角与两侧边界偏移点逐点吻合（1e-6 守卫）；
  - 缺口 ≈180°（T 形）与短臂斜接越界 → 诚实拒收（unsupportedChain /
    degenerateRadius）。
  边界 L/R 按「臂:端:L|R」连接表串接；约束：帽 3 coincident + 2 tangent、
  毂弧 2 coincident + 2 tangent、斜接 1 coincident、每臂 2 parallel、单 Ø + equal。
- **验证**：`sketch-slot-tree-logic` **6/6**（A 毂弧起止 149.055°/117.255°、
  6 条边界线与 live 逐坐标吻合；D 10 边界线/4 帽/18 coincident/8 tangent；
  T 形与短臂拒收）；真栈新 e2e **1 passed（52.4 s）**：RPC 建 live 坐标
  Y 分支 → 框选 → 槽：9 线/4 弧、毂弧 149.055°+117.255°、单 Ø20 → 改 30
  全弧 r15 → finish+reload。
- **状态口径**：`ui.sketchSlot` 仍 partial；「缺口 ≥180° 分支」「多毂树」从
  未采证据移除（弧参与的分支由 §2.15 S2u/S2u2 收口：单弧臂 + 多弧臂）。

### 2.14 S2q 多连通分量联动等宽槽（2026-11-20 live S2o；弧+线 / 链+线）

- **live 证据**（同一私有记录；`s2oC-arc-line-disjoint-*`、
  `s2oB2-mixed-partial-*`）：3 点弧 + 不相连直线一起选 → **两条独立槽**
  （弧槽 = 同心偏移弧 R±w/2 + 两半圆帽；线槽 = 体育场），草图中**只有一个
  Ø20**；2 相连线（链）+ 1 独立线 → 链槽 + 独立体育场、同一个 Ø20。
- **实现**：新 `sketch-slot-components-logic.ts`——端点焊接并查集拆连通
  分量；每分量分派既有构建器（单线/单弧/开放或闭合混合链/分支/线树）；合并
  时保留**首分量** diameter，其余分量的 diameter 换成
  `equal(首帽锚, 该分量首帽)`；cursor id 顺序分配。闭合环分量使用 slotWidth
  宽度语义、无法与直径合并 → 混合选择含闭合环/整圆时分量构建器诚实拒收；
  全为互不相连直线时仍走既有 S2i `buildMultiLineSlotDraft`。
- **验证**：`sketch-slot-components-logic` **6/6**（C：2 线/6 弧/4 点、
  radii [10,10,10,10,20,40]、28 约束、单 Ø + 3 equal + 2 concentric +
  2 parallel + 8 tangent；B2：链槽+独立线 6 线/5 弧/38 约束；闭合环混合
  与零宽拒收）；真栈新 e2e **1 passed（56.3 s）**：RPC 建半圆 R30 + 独立直线
  → 框选 → 槽：源线/源弧保留 + 6 新增弧（4 帽 r10 + 偏移 20/40）→ 单 Ø
  改 30（帽 15、偏移 15/45）→ finish+reload。
- **竞态修复（同批，产品缺陷）**：框选后 iTwin 会把捕获阶段的 mouseover
  异步投递到旧 OnshapeSelectTool 实例（伪「拖拽取消」）→ onRestartTool
  重启默认选择工具；若在此窗口启动草图工具，旧实例的重启会把新工具顶掉
  （ToolAdmin 以最后完成安装者为准）。修复：`onRestartTool` 在有工具命令
  在途（`store.tool.activeToolId !== null`）时不重启；单测
  `OnshapeSelectTool` **35/35**（新增守卫用例）。
- **状态口径**：`ui.sketchSlot` 仍 partial；「多曲线联动的等宽槽（含弧/
  部分连通）」从 missing 移除；剩样条中线环、自交环、弧分支（§2.15 收口）。

### 2.15 S2u 含圆弧的混合线树槽（2026-11-20 live；≥1 弧臂）

- **live 证据**（私有 `ui-evidence/slot-variants-20261120/s2u-arcbranch-*`；
  记录 `docs/SLOT-S2O-TREE-COMPONENTS-LIVE-20261120.md` §4b）：毂 P 处
  **1 弧 + 2 线**（弧 P→T 为 CCW 圆弧 R=106.7851；线 P→A/P→B）→ w=20 结果
  6 LINE + 7 ARC：源 3 曲线保留；每线 2 条平行边界；弧两侧**同心弧边界**
  （内 r−10=96.7851 **裁剪**到 122.127°、外 r+10=116.7851 全扫）；3 尖端帽
  r10；线 A-B 窄缺口斜接 P′；线 B-弧窄缺口 = 线 B 边界与内弧交点；弧-线 A
  宽缺口 = 绕毂弧 r10 起 128.232°、扫 **11.9619°**（两臂朝向偏移法线夹角，
  与直线树半平面交集规则在**弧帧切线方向**下一致）。
- **实现**：新 `sketch-slot-curve-tree-logic.ts`——树识别接受 line/arc（**≥1
  弧臂**）；逐端帧切线、边界=直线/同心圆，窄缺口求 line-line / line-circle /
  circle-circle 交点（直线投影/弧扫角裁剪守卫，弧**只允许裁剪不允许外延**），
  宽缺口毂弧沿用半平面交集（弧臂用端点切线帧）；约束=线边界 parallel、弧边界
  concentric、帽/毂弧心 coincident+端点 coincident+ tangent、窄缺口 coincident、
  单 Ø（直径锚定帽，弧边界半径经帽/毂弧相切传递）。`SlotDraft.boundaryArcIds?`
  additive。
- **多弧臂 live 增补（S2u2，`s2u2-multiarc-*`）**：毂 P 处 **2 弧 + 1 线** →
  3 LINE + 10 ARC：两对同心弧边界（r±10；内弧分别裁剪到 68.718°/11.596°）、
  3 帽 r10、**弧-弧宽缺口**毂弧 r10 起 150.241° 扫 **7.139°**、圆-圆与线-圆
  斜接各一。规则与单弧臂一致；`arcCount < 1` 为唯一门禁（纯圆弧无直线组合
  未单独采）。
- **验证**：`sketch-slot-curve-tree-logic` **5/5**（两例 live 输入均逐坐标/
  逐角吻合：单弧臂 4 条边界线 + 裁角 122.127° + 毂弧 11.962°；多弧臂 4 条
  同心弧裁角 68.718°/11.596° + 毂弧 7.139° + 约束计数；w=2R/零宽拒收）；真栈
  新 e2e **2 passed**：单弧臂 **42.7 s**（Ø20→30、边界 91.785/121.785）与
  多弧臂 **41.6 s**（Ø20→30、R±15），均 finish+reload。回归槽单测 **49/49**。
- **样条中线环（同批证据，blocked-design）**：live 闭合样条 → 3 条闭合样条
  （源 + 两条 ~110 控制点偏移、无帽）；Onshape 自身以密集控制点近似偏移，
  本产品求解器无样条偏移约束 → 不建模，登记 blocked-design。
- **状态口径**：`ui.sketchSlot` 仍 partial；「弧参与的分支（单/多弧臂）」从
  missing 移除；纯圆弧无直线组合（同一局部规则，未单独采）、样条中线环
  （blocked-design）、自交环仍为残项。

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
