# AIRR — 草图偏移支持圆（同心圆）

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续完成全部缺口）

## 1. 证据

- live UI（自有副本，2026-11-13）：草图「偏移」工具激活后点击圆，画布出现
  源圆高亮 + 外侧蓝色同心偏移预览 + 左侧距离手柄（箭头 + 数值）；工具保持
  激活等待定距确认。私有截图
  `ui-evidence/ui-direct-mouse-20261112/135-onshape-state-offset-20261113.png`。
- 现有实现（M6-c T4）只支持线与圆弧：圆/点种子被诚实拒收
  （toast「偏移暂只支持线和圆弧」）。live 证明圆应产出**同心圆**（R±d）。

## 2. 范围（本切片）

1. 偏移种子允许 `circle`（`collectOffsetChain` / 工具 pick 相）；圆无端点，
   不参与焊接图，自身即单成员链。
2. `buildOffsetDraft` 新增圆分支：光标在圆外 → R+d，圆内 → R−d；半径 ≤0 →
   `degenerateRadius` 拒收。产出 1 个新圆（同圆心内联点）+ 单成员约束
   `coincident(center,center)` + `radius(新圆, 实际半径)`。
3. **顺带修复**：单成员弧偏移的 `radius` 约束此前固定写 `R+d`（向内偏移时
   与实际几何 `R−d` 不一致的潜伏 bug）；改为使用成员实际偏移半径（圆/弧
   共用 `offsetRadii`）。
4. 预览绘制支持圆（Arc3d.createXY 整圆）。
5. 偏移弹层的量距初值保留 0.1 mm 精度（去掉浮点长尾；用户仍可输入精确值）。

**非目标**
- 点种子偏移（无几何意义，继续拒收）；
- 多条独立曲线一次偏移（Onshape 偏移链语义按相接链，本产品维持）；
- 圆与线/弧混合链（圆无端点，不进入焊接图）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `collectOffsetChain`/`buildOffsetDraft` | 既有链提取/闭式草稿/约束展开 | 仅加圆分支，无第二套偏移逻辑 |
| `SketchOffsetTool` | 两相交互/橡皮筋预览/值弹层 | 仅放开种子 + 画圆预览 |
| `SketchValuePopup` | 精确距离确认 | 显示精度微调 |
| `updateSketch` | 一次提交 | 可撤销，不新增契约 |

## 4. 跨仓影响

无 shared/后端/schema/RPC 改动；纯前端 + 单测 + 真栈 e2e。

## 5. 测试

- `SketchOffsetTool.test.ts` **16/16**：圆种子单成员链；圆外 R+d、圆内 R−d
  （实体 + radius 约束值一致、coincident center refs）；向内坍缩 →
  degenerateRadius；原有线/弧/链桥/拒收用例保持。
- 真栈 `e2e/sketch-offset-circle.spec.ts` **2 passed（41.3 s）**：R10 圆 →
  偏移 → 圆外点击定侧 → 弹层输入 0.005 m → 2 圆（0.01/0.015）+
  coincident(center)+radius 0.015 → undo 回 1 圆、约束清空。
- 回归：web 全量单测 **1760/1760**、tsc（含 e2e）/lint 绿。

## 6. 风险与回滚

- 圆偏移为独立同心圆（不做“偏移关系”参数联动），与既有线/弧偏移同口径。
- 回滚：移除圆分支/种子放开/预览分支与相关测试；已偏移数据是普通圆，无迁移。

## 7. P0 对照

- P0-03/P0-05：复用既有偏移纯逻辑/工具/提交管道。
- P0-06：事实源仍是 params。
- P0-07：无契约变更。
- P0-10：一次 updateSketch 可撤销；退化位形不写数据。
