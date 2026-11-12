# AIRR — 草图「使用」（Use，草图→草图投影 UI 首切片）

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续实现全部缺口）

## 1. 证据

- Onshape 草图工具栏有「使用」按钮（`ui-evidence/ui-direct-mouse-20261112/50-sketch-toolbar.png`
  工具栏清单 `command-id="USE"`）。
- 直接 UI 操作（自有副本）：点击「使用」后工具保持激活、无对话框
  （`ui-evidence/ui-direct-mouse-20261112/84-onshape-use-active.png`；
  当时副本内没有可见的其它草图几何，点击空处无投影结果——
  `85-onshape-use-projected.png`，如实登记未采到成功投影的 live 截图）。
- Onshape 官方帮助语义：Use 把其它零件/草图的边、面、曲线投影到当前草图（工具
  激活后单击几何即投影）。
- 本产品后端**已具备**投影读面：`insertSketch.projections`（ADR-0009 切片 1a）与
  `updateSketch` 中携带 `projected` 标记的实体实时重投影
  （`SketchProjection.resolveProjectedEntities`），含派生点/圆心合成、DOF 排除、
  源草图改尺寸联动、循环引用检测。本切片只补前端 UI 与根实体构造。

## 2. 范围（本切片）

1. 草图「使用」入口（ribbon `sketchUse`）不再是占位：编辑态激活后进入
   canvas 拾取会话（复用 `sketch.pattern` 会话槽，kind='use'）。
2. 读取**同一 Part Studio、树序在当前草图之前**的其它草图（最近 8 张），
   把 line/circle/arc 画成灰色虚线候选、point 画成小圆点；悬停高亮、点击即投影。
   链式投影源（源本身带 `projected` 标记）允许（后端递归解析/循环检测）。
3. 点击 → 生成带 `projected` 标记的根实体（line/point/circle/arc），一次
   `updateSketch` 提交（可撤销；工具保持激活可连续使用）；Esc 结束。
4. 后端读面每读必重投影：源草图改尺寸 → 本草图/下游特征联动（真栈验证）。
5. 删除投影根实体时一并清理同源派生点（前端删除纯逻辑，避免孤儿点）。
6. 诚实拒收：样条/投影源不入候选；非平行平面圆/弧（会变椭圆）、退化源
   → i18n 提示，不写数据；实体边/面投影不在本切片（需后端几何投影通道）。

**非目标**
- 实体边/面投影（后端切片 1b 未实现）；
- 样条/椭圆投影、链式投影源；
- 选择其它 Part Studio / 引用其它零件的几何；
- 投影关系的参数化编辑（删除即删，无“Use 特征”历史行）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `SketchProjection`（后端） | `projected` 标记实时重投影/派生点合成/循环检测 | 前端只写根实体标记，坐标由后端读面刷新 |
| `updateSketch` FeatureOp | 一次提交全量 entities/constraints | 可撤销；不新增 RPC/契约 |
| `sketchEntitiesToWorldPolylines` | 源草图世界折线 | 覆盖层绘制 |
| `curveDistance`/hit 常量 | 屏幕距离拾取 | 与既有 picker 同口径 |
| `sketchPlaneFrameFrom` | 源/目标平面局部→世界→局部快照 | 圆/弧平行判定与根实体初值 |
| `sketch.pattern` 会话槽 | 与阵列/变换互斥的画布模式 | 复用 store 启停/取消与 Ribbon 高亮 |

## 4. 设计

- `internal/sketch-use.ts`：候选过滤、平行判定、root id 分配（root/root+1/root+2
  全空闲）、根实体快照（line/point/circle/arc；弧起角/扫角按目标平面反算）。
- `components/SketchUseOverlay.tsx`：按需 `getSketch` 读取源草图（≤8，顺序加载），
  画布虚线候选 + 悬停高亮 + 点击回调 + 提示条；`onViewChanged/resize` 重绘；
  Esc 捕获取消。
- `PartStudioCanvas`：会话渲染（kind='use' 时不渲染阵列 gizmo）、源草图 id 来自
  树序 `sketches` 列表、拾取提交 `applyUpdate([...active.entities, root], constraints)`；
  错误按 unsupported/non-parallel/degenerate/commit 分类 toast。
- `Ribbon`/store：`sketchUse` → `startSketchPattern('use')`；与阵列/变换同一会话槽
  互斥；激活态高亮。

## 5. 跨仓影响

无 shared/后端/RPC/schema 改动（后端投影通道已存在）。前端 + e2e + 文档。

## 6. 测试

- 单测 `sketch-use.test.ts` **7/7**：id 分配避让、平行判定、候选过滤、
  线/点/圆/弧快照、反向平面扫角取反、非平行圆/退化线/样条拒收。
- 删除清理单测：`sketch-delete.test.ts` **6/6**（projected 根删除级联派生点）。
- 真栈 `e2e/sketch-use.spec.ts` **2 passed（40.6 s）**：
  草图 1 圆 R10 → 草图 2 使用点击 → projected 圆 R10 + 派生圆心点 →
  undo 移除 → 再次使用 → 点投影源点 → projected 根点 →
  源草图改 R20 → 本草图读面联动 R20；Esc 退出会话。
- 回归：web 全量单测/lint/tsc（见提交记录）；既有阵列/草图工具不受影响
  （会话 kind 分支互斥）。

## 7. 风险与回滚

- **RPC 读量**：进入使用最多读取 8 张草图；MS 限流窗口内单跑 e2e。
- **近似**：根实体初值为前端快照，后端读面即以源当前解覆盖（前端快照只影响
  首次刷新前的一帧）。
- **依赖方向**：只提供当前草图之前（树序）的源，避免后序草图依赖成环。
- 回滚：移除 UI/覆盖层/纯逻辑与测试；已投影数据是普通 `projected` 实体
  （后端读面仍可解析），无迁移。

## 8. P0 对照

- P0-03/P0-05：复用既有 `updateSketch` 与投影读面，无第二套编辑 API/选择权威。
- P0-06：事实源仍是草图 params；投影为标记 + 读时派生。
- P0-07：无契约变更。
- P0-10：一次 `updateSketch` 可撤销；拒收不写数据；无假成功。
