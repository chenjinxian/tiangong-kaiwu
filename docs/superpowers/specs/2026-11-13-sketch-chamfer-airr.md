# AIRR — 草图倒角（Chamfer）工具首切片

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续完成全部缺口）

## 1. 证据

- live UI（自有副本，2026-11-13）：圆角 ▾ 飞菜单第二项为「倒角」
  （`ui-evidence/ui-direct-mouse-20261112/136-flyout-fillet.png`）。
- 激活「倒角」后点击矩形左上角：**立即**生成倒角直线（两线回缩 + 连接段），
  角点保留橙色标记，并显示可编辑距离尺寸 **0.5**（文档单位）；工具保持激活
  可连续倒角
  （`ui-evidence/ui-direct-mouse-20261112/138-onshape-sketch-chamfer.png`）。

## 2. 范围（首切片）

1. 工具 `Sketch.Chamfer`（PrimitiveTool，requireWriteableTarget）：「圆角 ▾ →
   倒角」入口；点击两条直线的共享角点（含 coincident/共享显式点/内联坐标重合）
   → 默认距离 `DEFAULT_SKETCH_CHAMFER_DISTANCE = 5`（与草图圆角同一数值口径）
   立即生成倒角；工具保持存活，Esc/右键结束。
2. 几何：两线在角点侧沿各自方向回缩 distance；新增连接两端的直线；新建显式
   角点实体（对应 live 角点标记）；被分离的旧端点按引用计数清理孤儿点。
3. 约束：移除旧的角点 coincident；新增倒角线两端 coincident×2；新增两条
   `distance(角点→倒角端点) = distance` 尺寸（可双击改值）。**近似登记**：
   live 显示单个 0.5 尺寸，本实现用两条等距尺寸表达同一参数。
4. 诚实拒收：distance≤0（invalid-distance）、超出线段（distance-too-large）、
   投影几何（unsupported）、非两线角点（no-corner）；拒收不写数据。
5. 能力：`sketchChamfer` 由 gated 翻 **full**（gated 集合 41）。

**非目标**
- 直线-圆弧/圆弧-圆弧倒角、两线延长交点倒角（圆角已有对应通道，倒角后续切片）；
- 角度模式/不等距倒角；
- 倒角尺寸的专用编辑器（沿用既有尺寸双击编辑）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `findSketchFilletCorners` / `nextSketchId` / `pruneUnreferencedPoints` | 角点识别/ID/孤儿点清理 | 与圆角同一几何口径 |
| `FilletCorner` 数据 | 角点两线方向/长度 | 倒角直接消费 |
| `updateSketch` | 一次提交 | 可撤销 |
| Ribbon 飞菜单 + `findCommand` | 既有 gated/full 路由 | 倒角由 gated 翻 full |

## 4. 跨仓影响

无 shared/后端/schema/RPC 改动；纯前端（纯逻辑 + 工具 + Ribbon/i18n）+ 单测 +
真栈 e2e。

## 5. 测试

- `sketch-fillet.test.ts` **17/17**（+3）：矩形角点倒角（回缩/连接线/角点/
  coincident×2/distance×2/id 唯一/旧 coincident 移除）、内联共享端点角点、
  距离过大/非法/投影拒收。
- 真栈 `e2e/sketch-chamfer.spec.ts` **2 passed（40.9 s）**：L 形两线 →
  「圆角 ▾ → 倒角」→ 点击角点 → 3 线 + 1 角点 + coincident×2 + distance×2
  （value 5）→ Esc + undo 回 2 线、coincident 101 恢复。
- 回归：web 全量单测 **1784/1784**、tsc（含 e2e）/lint 绿。

## 6. 风险与回滚

- 两条距离尺寸而非 live 单尺寸（参数化等价，文档明示）。
- 回滚：移除工具/路由/飞菜单项/纯函数与测试，`sketchChamfer` 回 gated；
  已落库数据是普通线/点/约束，无迁移。

## 7. P0 对照

- P0-03/P0-05：复用圆角角点识别与 updateSketch 管道，无第二套编辑 API。
- P0-06：事实源仍是 params。
- P0-07：无契约变更。
- P0-10：一次 updateSketch 可撤销；拒收不写数据。
