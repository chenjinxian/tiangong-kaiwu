# AIRR — 草图「分割」（Split）工具首切片

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续完成全部缺口）

## 1. 证据

- live UI（自有副本，2026-11-13）：草图工具栏「修剪 ▾」飞菜单三项，顺序为
  **修剪（快捷键 m）/ 延伸（x）/ 分割（无快捷键）**；面板截图
  `ui-evidence/ui-direct-mouse-20261112/130-onshape-sketch-trim-menu.png`。
- Onshape 语义（官方帮助/课程/论坛一致）：**激活分割后点击草图路径上的位置**，
  路径在该处断成两段；随后 Esc 退出，可选中并删除不需要的一段。分割与
  修剪/延伸同组。

## 2. 范围（首切片）

1. 工具 `Sketch.Split`（PrimitiveTool，requireWriteableTarget）：点击命中
   线/圆弧/三次贝塞尔样条 → 在点击处精确分割，一次 `updateSketch` 提交
   （可撤销）；工具保持存活可连续分割；Esc/右键结束。命中沿用 picker 的
   屏幕距离算法（≤5px），点击点经相机射线与草图平面求交反解局部坐标。
2. 几何：
   - **线**：点击参数 t 处新增显式点实体（新 id），第一段沿用原实体 id
     （原 p1 → 新点），第二段新 id（新点 → 原 p2）；两段共享新点，端点原有
     引用（显式点 id 或内联点）保持。construction 标记两段继承。
   - **圆弧**：按点击角度拆成两段弧（同一圆心引用/半径，角度区间首尾相接），
     第一段沿用原 id。
   - **三次贝塞尔样条**：de Casteljau 在点击参数处精确分裂为两段三次样条
     （第一段沿用原 id；fitPoints 丢弃，construction 继承）。
3. 约束语义（诚实登记）：与修剪同口径——**移除引用被分割实体的约束**
   （整段长度/端点关系不再对一半几何成立），其余约束原样提交、后端重解算
   兜底；不伪造“约束自动分配”。
4. 诚实拒收：圆（本切片无 live 证据证明单点分割圆的结果形态——开放弧还是
   两段弧——按 unsupported 提示，不猜）；periodic/非四次控制点/投影样条、
   点击落在端点附近（退化段）→ no-change/unsupported，不写数据。
5. Ribbon：「修剪 ▾」飞菜单补第三项「分割」（无快捷键，顺序与 live 一致）。

**非目标**
- 圆的分割（待 live 证据）；
- 分割点拖动 / 分割后自动删除段（用既有选择 + Delete）；
- 约束的智能重分配。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `internal/sketch-trim.ts` | 几何提取/折线参数反解/de Casteljau 分裂/交点语义 | 新增 `splitSketchAt` 同模块实现，单一几何实现 |
| `SketchTrimTool` | PrimitiveTool 生命周期/命中/射线反解/applyUpdate | 新增 `SketchSplitTool` 同构 |
| `applyUpdate` | 一次 updateSketch 全量提交 | 可撤销，不新增 RPC/契约 |
| Ribbon 修剪飞菜单 | 既有下拉渲染/激活路由 | 仅加一项与一条路由分支 |

## 4. 跨仓影响

无 shared/后端/schema/RPC 改动；纯前端 + 单测 + 真栈 e2e。

## 5. 测试

- 纯单测 `sketch-trim.test.ts` 增补 `splitSketchAt` **5 条**（文件 17/17）：
  线中点两段+共享点+约束移除+id 唯一、显式点引用保持、端点 no-change /
  圆 / 投影样条 unsupported、弧中点两段角度首尾相接、样条 de Casteljau
  两段控制点首尾相接。
- 真栈 `e2e/sketch-split.spec.ts` **2 passed（37.6 s）**：RPC 建线 → 编辑 →
  「修剪 ▾ → 分割」→ 点击中点 → `getSketch` 2 线 + 1 点（两线各自引用同一
  point id、端点 ±10 mm）→ undo 回 1 线（点一并消失）。
- 回归：web 全量单测 **1758/1758**、tsc（含 e2e）/lint 绿。

## 6. 风险与回滚

- 约束移除可能导致尺寸丢失（与修剪同口径，文档明示）。
- 回滚：移除工具注册/飞菜单项/纯函数与测试；已分割数据是普通线/弧/样条，
  无迁移。

## 7. P0 对照

- P0-03/P0-05：复用修剪既有几何/命中/提交管道，无第二套编辑 API。
- P0-06：事实源仍是 params（entities+constraints）。
- P0-07：无契约变更。
- P0-10：一次 updateSketch 可撤销；拒收不写数据。
